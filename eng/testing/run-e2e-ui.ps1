# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

<#
.SYNOPSIS
Runs the Playwright BDD E2E UI test suite against a freshly provisioned stack.

.DESCRIPTION
Downloads the ODS Minimal and Populated Template backups (if missing), starts Docker Compose
services (PostgreSQL or SQL Server for the Admin App database), waits for
readiness, creates the local Keycloak test user, and runs the Playwright BDD
suite.

.PARAMETER DbEngine
Admin App database engine: 'pgsql' or 'mssql'. Defaults to 'pgsql'.

.PARAMETER Rebuild
Rebuild Admin App images before starting services.

.PARAMETER StopServices
Stop Docker Compose services after the test run (success or failure).

.PARAMETER SkipV1
Skip the Ed-Fi v6 ("v1" environment) topology: its containers are not started and
scenarios tagged @v1 are excluded from the Playwright run. Reduces image pulls and run time.

.PARAMETER KeepEnvFile
Use the existing compose/.env as-is instead of regenerating it from compose/.env.example.
Fails if compose/.env does not exist or its DB_ENGINE does not match -DbEngine.

.PARAMETER ServiceStartTimeoutMinutes
Maximum minutes to wait for 'docker compose pull' and 'docker compose up' (each) before
aborting. Defaults to 20.

.EXAMPLE
./eng/testing/run-e2e-ui.ps1 -DbEngine mssql -Rebuild -StopServices

.EXAMPLE
./eng/testing/run-e2e-ui.ps1 -SkipV1 -KeepEnvFile
#>

param(
  [ValidateSet('pgsql', 'mssql')]
  [string]$DbEngine = 'pgsql',
  [switch]$Rebuild,
  [switch]$StopServices,
  [switch]$SkipV1,
  [switch]$KeepEnvFile,
  [int]$ServiceStartTimeoutMinutes = 20
)

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 6) {
  Write-Host "ERROR! This script requires PowerShell 7+ (pwsh). You are running PowerShell $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))." -ForegroundColor Red
  Write-Host 'Run this script with pwsh instead, e.g.: pwsh ./eng/testing/run-e2e-ui.ps1' -ForegroundColor Red
  exit 1
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Test-Prerequisites {
  $missing = @()

  if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
    $missing += 'node_modules not found. Run: npm ci --legacy-peer-deps'
  }

  $playwrightBrowsersPath = if ($env:PLAYWRIGHT_BROWSERS_PATH) {
    $env:PLAYWRIGHT_BROWSERS_PATH
  } else {
    if ($IsWindows) {
      Join-Path $env:LOCALAPPDATA 'ms-playwright'
    } elseif ($IsMacOS) {
      Join-Path $env:HOME 'Library/Caches/ms-playwright'
    } else {
      Join-Path $env:HOME '.cache/ms-playwright'
    }
  }
  $chromiumInstalled = $false
  if (Test-Path $playwrightBrowsersPath) {
    $chromiumInstalled = @(Get-ChildItem -Path $playwrightBrowsersPath -Directory -Filter 'chromium-*' -ErrorAction SilentlyContinue).Count -gt 0
  }
  if (-not $chromiumInstalled) {
    $missing += 'Playwright Chromium browser not found. Run: npx playwright install --with-deps chromium'
  }

  $certPath = Join-Path $repoRoot 'compose/ssl/server.crt'
  if (-not (Test-Path $certPath)) {
    $missing += 'Local TLS certificate not found at compose/ssl/server.crt. Run: bash ./compose/ssl/generate-certificate.sh'
  }

  if ($missing.Count -gt 0) {
    Write-Host 'ERROR! Missing prerequisites:' -ForegroundColor Red
    foreach ($item in $missing) {
      Write-Host "  - $item" -ForegroundColor Red
    }
    exit 1
  }
}

function Get-OdsTemplateBackup {
  param(
    [Parameter(Mandatory)]
    [ValidateSet('Minimal', 'Populated')]
    [string]$TemplateType
  )

  $backupDir = Join-Path $repoRoot 'compose/db-backup'
  $sqlFileName = "EdFi.Ods.$TemplateType.Template.sql"
  $sqlPath = Join-Path $backupDir $sqlFileName

  if (Test-Path $sqlPath) {
    Write-Host "ODS $TemplateType Template backup already present, skipping download." -ForegroundColor Cyan
    return
  }

  $packageName = "EdFi.Suite3.Ods.$TemplateType.Template.PostgreSQL.Standard.4.0.0"
  $packageVersion = '7.3.20068'
  $feedUrl = "https://pkgs.dev.azure.com/ed-fi-alliance/Ed-Fi-Alliance-OSS/_packaging/EdFi/nuget/v3/flat2/$packageName/$packageVersion/$packageName.$packageVersion.nupkg"

  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

  Write-Host "Downloading $packageName v$packageVersion..." -ForegroundColor Cyan
  $nupkgPath = Join-Path $backupDir 'package.nupkg'
  $zipPath = Join-Path $backupDir 'package.zip'
  $pkgDir = Join-Path $backupDir 'pkg'

  try {
    Invoke-WebRequest -Uri $feedUrl -OutFile $nupkgPath
    Copy-Item -Path $nupkgPath -Destination $zipPath -Force
    Expand-Archive -Path $zipPath -DestinationPath $pkgDir -Force

    $srcSql = Get-ChildItem -Path $pkgDir -Filter '*.sql' -Recurse | Select-Object -First 1
    if (-not $srcSql) {
      throw 'ERROR: No .sql file found inside the NuGet package'
    }
    Write-Host "Found: $($srcSql.FullName)" -ForegroundColor Cyan

    Copy-Item -Path $srcSql.FullName -Destination $sqlPath -Force
  }
  finally {
    Remove-Item -Path $nupkgPath, $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $pkgDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  Write-Host "Backup files ready in $backupDir" -ForegroundColor Green
}

function Get-OdsMinimalTemplateBackup {
  Get-OdsTemplateBackup -TemplateType 'Minimal'
}

function Get-OdsPopulatedTemplateBackup {
  Get-OdsTemplateBackup -TemplateType 'Populated'
}

Test-Prerequisites
Get-OdsMinimalTemplateBackup
Get-OdsPopulatedTemplateBackup

. (Join-Path $repoRoot 'eng/helpers/env-secrets.ps1')

function Set-AdminAppEnvFile {
  param(
    [ValidateSet('pgsql', 'mssql')]
    [string]$Engine
  )

  $envExamplePath = Join-Path $repoRoot 'compose/.env.example'
  $envPath = Join-Path $repoRoot 'compose/.env'

  if ($KeepEnvFile) {
    if (-not (Test-Path $envPath)) {
      throw '-KeepEnvFile was specified but compose/.env does not exist. Create it from compose/.env.example or omit -KeepEnvFile.'
    }
    $engineLine = Select-String -Path $envPath -Pattern '^\s*DB_ENGINE\s*=\s*(\S+)' | Select-Object -Last 1
    $configuredEngine = if ($engineLine) { $engineLine.Matches.Groups[1].Value } else { 'pgsql' }
    if ($configuredEngine -ne $Engine) {
      throw "-KeepEnvFile: DB_ENGINE in compose/.env is '$configuredEngine' but -DbEngine is '$Engine'. Align them or omit -KeepEnvFile."
    }
    if ($Engine -eq 'mssql') {
      $saLine = Select-String -Path $envPath -Pattern '^\s*MSSQL_SA_PASSWORD\s*=\s*(.+?)\s*$' | Select-Object -Last 1
      if (-not $saLine) { throw '-KeepEnvFile: MSSQL_SA_PASSWORD is not set in compose/.env.' }
      $script:mssqlSaPassword = $saLine.Matches.Groups[1].Value
      # A process env var outranks --env-file in Compose interpolation and is read by the
      # Keycloak bootstrap, so mirror the retained value (as the generated-env branch does).
      $env:MSSQL_SA_PASSWORD = $script:mssqlSaPassword
    }
    Write-Host 'Keeping existing compose/.env (-KeepEnvFile); not regenerating it.' -ForegroundColor Cyan
    return
  }

  if (Test-Path $envPath) {
    $content = Get-Content -Path $envPath
    $engineLines = @($content | Where-Object { $_ -match '^DB_ENGINE=' })
    if ($engineLines.Count -ne 1 -or ($engineLines[0] -replace '^DB_ENGINE=', '').Trim() -ne $Engine) {
      throw "compose/.env must contain exactly one DB_ENGINE=$Engine entry; it was left unchanged. Use the configured engine or prepare a separate environment."
    }
    $placeholders = @(Select-String -Path $envPath -Pattern '^\s*([A-Z0-9_]+)\s*=.*change-me' |
      ForEach-Object { $_.Matches[0].Groups[1].Value } | Sort-Object -Unique)
    if ($placeholders.Count -gt 0) {
      throw "compose/.env contains placeholder secrets in: $($placeholders -join ', '). Restore the real secrets matching the existing volumes before retrying. No secrets were regenerated and no volumes were changed."
    }
    if ($Engine -eq 'mssql') {
      $passwordLines = @($content | Where-Object { $_ -match '^MSSQL_SA_PASSWORD=' })
      if ($passwordLines.Count -ne 1) {
        throw 'compose/.env must contain exactly one MSSQL_SA_PASSWORD entry; it was left unchanged.'
      }
      $mssqlPassword = ($passwordLines[0] -replace '^MSSQL_SA_PASSWORD=', '').Trim()
      if ($mssqlPassword -match '^(["''])(.*)\1$') {
        $mssqlPassword = $Matches[2]
      }
      if ([string]::IsNullOrWhiteSpace($mssqlPassword)) {
        throw 'compose/.env contains an empty MSSQL_SA_PASSWORD; it was left unchanged.'
      }
      $env:MSSQL_SA_PASSWORD = $mssqlPassword
      $script:mssqlSaPassword = $mssqlPassword
    }
    Write-Host 'Reusing compose/.env without changing secrets or local settings.' -ForegroundColor Cyan
    return
  }

  $existingVolumes = @()
  try {
    $stackVolumePattern = '^vol-(edfiadminapp-(db|mssql|keycloak)|odsV7-adminV[23]-.+|db-admin-6x|db-ods-6x-.+)$'
    $existingVolumes = @(docker volume ls -q 2>$null | Where-Object { $_ -match $stackVolumePattern })
  } catch {
    # Ignore: docker unavailable or daemon not running.
  }
  if ($existingVolumes.Count -gt 0) {
    throw 'compose/.env is missing but existing stack volumes were found. Restore the original environment file before retrying; generating new secrets would break authentication or decryption. No volumes were changed.'
  }

  Copy-Item -Path $envExamplePath -Destination $envPath -Force

  Set-GeneratedEnvSecrets -EnvPath $envPath
  Write-Host "compose/.env patched with generated database, encryption, Keycloak and session secrets." -ForegroundColor Cyan
  $content = Get-Content -Path $envPath
  $datasetLines = @($content | Where-Object { $_ -match '^EDFI_ODS_DATASET=' })
  if ($datasetLines.Count -ne 1) {
    throw "compose/.env.example must contain exactly one EDFI_ODS_DATASET entry; found $($datasetLines.Count)."
  }
  $content = $content -replace '^EDFI_ODS_DATASET=.*$', 'EDFI_ODS_DATASET=populated'
  Set-Content -Path $envPath -Value $content

  if ($Engine -ne 'mssql') {
    return
  }

  $mssqlPassword = New-RandomSecret
  # Child scripts (eng/helpers/bootstrap-keycloak-for-tests.ps1) read the SA password from the
  # process environment.
  $env:MSSQL_SA_PASSWORD = $mssqlPassword
  $script:mssqlSaPassword = $mssqlPassword
  $content = Get-Content -Path $envPath

  # Counted per rewrite, not in aggregate: a bare total cannot tell "all seven fired once"
  # from "one line is duplicated and another vanished". Each must match exactly once, which
  # also rejects a duplicated key in compose/.env.example.
  $fired = [ordered]@{
    'DB_ENGINE=pgsql'                   = 0
    '# MSSQL_PORT_EXPOSED=1433'         = 0
    '# MSSQL_ACCEPT_EULA=Y'             = 0
    '# MSSQL_SA_PASSWORD='              = 0
    '# MSSQL_IMAGE_TAG=2022-latest'     = 0
    'DB_SECRET_VALUE (PostgreSQL)'      = 0
    'DB_SECRET_VALUE (SQL Server)'      = 0
  }

  $content = $content | ForEach-Object {
    switch -Regex ($_) {
      '^DB_ENGINE=pgsql$' { $fired['DB_ENGINE=pgsql']++; 'DB_ENGINE=mssql' }
      '^# MSSQL_PORT_EXPOSED=1433$' { $fired['# MSSQL_PORT_EXPOSED=1433']++; 'MSSQL_PORT_EXPOSED=1433' }
      '^# MSSQL_ACCEPT_EULA=Y$' { $fired['# MSSQL_ACCEPT_EULA=Y']++; 'MSSQL_ACCEPT_EULA=Y' }
      '^# MSSQL_SA_PASSWORD=.*$' { $fired['# MSSQL_SA_PASSWORD=']++; "MSSQL_SA_PASSWORD=$mssqlPassword" }
      '^# MSSQL_IMAGE_TAG=2022-latest$' { $fired['# MSSQL_IMAGE_TAG=2022-latest']++; 'MSSQL_IMAGE_TAG=2022-latest' }
      '^DB_SECRET_VALUE=\{"DB_HOST".*$' { $fired['DB_SECRET_VALUE (PostgreSQL)']++; "# $_" }
      '^# DB_SECRET_VALUE=\{"MSSQL_DB_HOST".*$' {
        $fired['DB_SECRET_VALUE (SQL Server)']++
        ($_ -replace '^# ', '') -replace '"MSSQL_DB_PASSWORD":"[^"]*"', "`"MSSQL_DB_PASSWORD`":`"$mssqlPassword`""
      }
      default { $_ }
    }
  }

  $wrong = $fired.GetEnumerator() | Where-Object { $_.Value -ne 1 }
  if ($wrong) {
    $detail = ($wrong | ForEach-Object { "'$($_.Key)' matched $($_.Value) time(s), expected 1" }) -join '; '
    throw "compose/.env.example did not match the expected MSSQL patch patterns: $detail. compose/.env.example may have been reformatted, or a key duplicated; update the regex patterns in Set-AdminAppEnvFile."
  }

  Set-Content -Path $envPath -Value $content
  Write-Host "compose/.env patched for MSSQL (DB_ENGINE=mssql)." -ForegroundColor Cyan
}

Set-AdminAppEnvFile -Engine $DbEngine

function Test-MssqlSbaaDatabaseExists {
  $sqlcmdArgs = @(
    'exec', 'edfiadminapp-mssql',
    '/opt/mssql-tools18/bin/sqlcmd',
    '-S', 'localhost',
    '-U', 'sa',
    '-P', $script:mssqlSaPassword,
    '-C',
    '-Q', "SET NOCOUNT ON; SELECT DB_ID('sbaa')"
  )
  try {
    $output = & docker @sqlcmdArgs 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    return ($output -join "`n") -notmatch 'NULL' -and ($output -join "`n") -match '\d'
  } catch {
    return $false
  }
}

function Wait-ForAdminAppReadiness {
  param(
    [ValidateSet('pgsql', 'mssql')]
    [string]$DbEngine
  )

  $apiUrl = 'https://localhost/adminapp-api/api/healthcheck'
  $feUrl = 'https://localhost/adminapp/'
  $keycloakUrl = 'https://localhost/auth/realms/edfi/.well-known/openid-configuration'
  $keycloakLoginUrl = 'https://localhost/auth/realms/edfi/protocol/openid-connect/auth?client_id=edfiadminapp&redirect_uri=https%3A%2F%2Flocalhost%2Fadminapp-api%2Fapi%2Fauth%2Fcallback%2F1&response_type=code&scope=openid%20profile%20email'

  $requiredStableChecks = 3
  $maxReadinessChecks = 200
  $readinessPollSeconds = 3
  $stableChecks = 0
  $checkMssqlDb = ($DbEngine -eq 'mssql')

  $apiOk = $false
  $feOk = $false
  $keycloakOk = $false
  $keycloakLoginOk = $false
  $mssqlDbOk = $false

  for ($i = 1; $i -le $maxReadinessChecks; $i++) {
    $apiOk = $false
    $feOk = $false
    $keycloakOk = $false
    $keycloakLoginOk = $false
    $mssqlDbOk = $false

    try { if ((Invoke-WebRequest -Uri $apiUrl -SkipCertificateCheck -UseBasicParsing).StatusCode -eq 200) { $apiOk = $true } } catch {}
    try { if ((Invoke-WebRequest -Uri $feUrl -SkipCertificateCheck -UseBasicParsing).StatusCode -eq 200) { $feOk = $true } } catch {}
    try { if ((Invoke-WebRequest -Uri $keycloakUrl -SkipCertificateCheck -UseBasicParsing).StatusCode -eq 200) { $keycloakOk = $true } } catch {}
    try {
      $loginResponse = Invoke-WebRequest -Uri $keycloakLoginUrl -SkipCertificateCheck -UseBasicParsing
      if ($loginResponse.Content -match 'kc-form-login') { $keycloakLoginOk = $true }
    } catch {}

    if ($checkMssqlDb) {
      $mssqlDbOk = Test-MssqlSbaaDatabaseExists
    } else {
      $mssqlDbOk = $true
    }

    if ($apiOk -and $feOk -and $keycloakOk -and $keycloakLoginOk -and $mssqlDbOk) {
      $stableChecks++
      Write-Host "Readiness OK ($stableChecks/$requiredStableChecks)" -ForegroundColor Green
    } else {
      $stableChecks = 0
      $mssqlDbSuffix = if ($checkMssqlDb) { " MSSQL_SBAA_DB=$mssqlDbOk" } else { '' }
      Write-Host "Waiting... API=$apiOk FE=$feOk KEYCLOAK_META=$keycloakOk KEYCLOAK_LOGIN=$keycloakLoginOk$mssqlDbSuffix ($i/$maxReadinessChecks)" -ForegroundColor Yellow
    }

    if ($stableChecks -ge $requiredStableChecks) {
      Write-Host 'Admin App API, FE, and Keycloak metadata/login are stable' -ForegroundColor Green
      return
    }

    Start-Sleep -Seconds $readinessPollSeconds
  }

  $mssqlDbSuffix = if ($checkMssqlDb) { " MSSQL_SBAA_DB=$mssqlDbOk" } else { '' }
  $timeoutSeconds = $maxReadinessChecks * $readinessPollSeconds
  throw "Timed out after approximately $timeoutSeconds seconds waiting for stable Admin App services (last state: API=$apiOk FE=$feOk KEYCLOAK_META=$keycloakOk KEYCLOAK_LOGIN=$keycloakLoginOk$mssqlDbSuffix)"
}

function Show-AdminAppServiceLogs {
  $containers = @('edfiadminapp-api', 'edfiadminapp-fe', 'edfiadminapp-mssql', 'edfiadminapp-postgres', 'edfiadminapp-keycloak')
  Write-Host '--- Container logs (diagnostics for the failure above) ---' -ForegroundColor Magenta
  foreach ($container in $containers) {
    try {
      $exists = docker ps -a --filter "name=^/$container`$" --format '{{.Names}}' 2>$null
      if (-not $exists) { continue }
      Write-Host "--- docker logs $container (last 200 lines) ---" -ForegroundColor Magenta
      docker logs --tail 200 $container 2>&1 | Write-Host
    } catch {
      Write-Host "Could not retrieve logs for $container`: $_" -ForegroundColor Yellow
    }
  }
  Write-Host '--- End container logs ---' -ForegroundColor Magenta
}

$testExitCode = 1
# The Playwright workers all call the API from one IP. At the default limit (100 requests per
# minute) a fast run gets 429s on /auth/me, so the nav never renders and clicks time out. A process
# env var outranks --env-file in Compose interpolation, so this covers generated, reused and
# -KeepEnvFile environments alike without touching compose/.env. An explicit caller value wins.
$previousRateLimit = $env:RATE_LIMIT_LIMIT
if (-not $env:RATE_LIMIT_LIMIT) {
  $env:RATE_LIMIT_LIMIT = '100000'
}
try {
  & (Join-Path $repoRoot 'eng/helpers/start-services-target.ps1') -V6:(-not $SkipV1) -OdsV7AdminV2 -IncludeAdminApp -Rebuild:$Rebuild -MSSQL:($DbEngine -eq 'mssql') -StartTimeoutMinutes $ServiceStartTimeoutMinutes
  if ($LASTEXITCODE -ne 0) { throw 'Failed to start Docker Compose services.' }

  Wait-ForAdminAppReadiness -DbEngine $DbEngine

  & (Join-Path $repoRoot 'eng/helpers/create-local-user-keycloak.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create local Keycloak user.' }

  Push-Location $repoRoot
  try {
    if ($SkipV1) {
      # playwright.config.ts applies the @v1 exclusion per project through E2E_SKIP_V1,
      # because --grep-invert is ignored by projects that run as dependencies of others.
      $env:E2E_SKIP_V1 = '1'
      npm run test:e2e:bdd -- --grep-invert '@v1'
    } else {
      npm run test:e2e:bdd
    }
    $testExitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
}
catch {
  Write-Host "ERROR: $_" -ForegroundColor Red
  Show-AdminAppServiceLogs
  throw
}
finally {
  $env:RATE_LIMIT_LIMIT = $previousRateLimit
  Remove-Item Env:E2E_SKIP_V1 -ErrorAction SilentlyContinue
  if ($StopServices) {
    Write-Host 'Stopping Docker Compose services...' -ForegroundColor Cyan
    & (Join-Path $repoRoot 'compose/stop.ps1')
  }
}

exit $testExitCode

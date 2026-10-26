# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

<#
.SYNOPSIS
  Smoke test for eng/helpers/env-secrets.ps1. Needs no Docker. Run: pwsh ./eng/testing/test-env-secrets.ps1
#>
$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
. (Join-Path $repoRoot 'eng/helpers/env-secrets.ps1')

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw "FAILED: $Message" }
}

function Get-EnvValue {
  param([string[]]$Lines, [string]$Name)
  ($Lines | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1) -replace "^$Name=", ''
}

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempDir | Out-Null
try {
  # --- generators ---
  for ($i = 0; $i -lt 50; $i++) {
    $secret = New-RandomSecret
    Assert-True ($secret -cmatch '^[A-Za-z0-9]{32}$') "New-RandomSecret produced '$secret'"
    Assert-True ($secret -cmatch '[A-Z]' -and $secret -cmatch '[a-z]' -and $secret -match '[0-9]') "New-RandomSecret lacks a character class: '$secret'"
  }
  Assert-True ((New-RandomHex) -match '^[0-9a-f]{64}$') 'New-RandomHex is not 64 lowercase hex chars'
  Assert-True ((New-RandomSecret) -ne (New-RandomSecret)) 'New-RandomSecret returned the same value twice'

  # --- patching a copy of the real example ---
  $envPath = Join-Path $tempDir '.env'
  Copy-Item (Join-Path $repoRoot 'compose/.env.example') $envPath
  Set-GeneratedEnvSecrets -EnvPath $envPath
  $lines = Get-Content $envPath

  $uncommentedPlaceholders = $lines | Where-Object { $_ -match '^\s*[A-Z0-9_]+\s*=.*change-me' }
  Assert-True (-not $uncommentedPlaceholders) "Placeholders remain: $($uncommentedPlaceholders -join ' | ')"

  $postgresPassword = Get-EnvValue $lines 'POSTGRES_PASSWORD'
  Assert-True ($postgresPassword -cmatch '^[A-Za-z0-9]{32}$') 'POSTGRES_PASSWORD was not generated'
  $dbSecret = Get-EnvValue $lines 'DB_SECRET_VALUE'
  Assert-True ($dbSecret.Contains("`"DB_PASSWORD`":`"$postgresPassword`"")) 'pgsql DB_SECRET_VALUE password does not match POSTGRES_PASSWORD'
  Assert-True ((Get-EnvValue $lines 'DB_ENCRYPTION_SECRET_VALUE') -match '^\{"KEY":"[0-9a-f]{64}","IV":"unused"\}$') 'DB_ENCRYPTION_SECRET_VALUE key is not 64 hex chars'
  $clientSecret = Get-EnvValue $lines 'KEYCLOAK_EDFIADMINAPP_CLIENT_SECRET'
  $devClientSecret = Get-EnvValue $lines 'KEYCLOAK_EDFIADMINAPP_DEV_CLIENT_SECRET'
  Assert-True ($clientSecret -cmatch '^[A-Za-z0-9]{32}$' -and $devClientSecret -cmatch '^[A-Za-z0-9]{32}$') 'Keycloak client secrets were not generated'
  Assert-True ($clientSecret -ne $devClientSecret) 'Keycloak client secrets must differ'
  $sessionSecret = (Get-EnvValue $lines 'SESSION_SECRET_VALUE').Trim("`r")
  Assert-True ($sessionSecret -cmatch '^\["[A-Za-z0-9+/=]{44}"\]$') 'SESSION_SECRET_VALUE was not generated'
  Assert-True ($lines -contains '# MSSQL_SA_PASSWORD=') 'MSSQL_SA_PASSWORD line must be left for the mssql branch'

  # --- a reformatted example must fail loudly, not silently skip ---
  $broken = Join-Path $tempDir '.env.broken'
  Get-Content (Join-Path $repoRoot 'compose/.env.example') | Where-Object { $_ -notmatch '^POSTGRES_PASSWORD=' } | Set-Content $broken
  $threw = $false
  try { Set-GeneratedEnvSecrets -EnvPath $broken } catch { $threw = $true; $message = $_.Exception.Message }
  Assert-True $threw 'Set-GeneratedEnvSecrets did not throw when POSTGRES_PASSWORD was missing'
  Assert-True ($message -match 'POSTGRES_PASSWORD') "Error does not name the missing rule: $message"

  $brokenSession = Join-Path $tempDir '.env.broken-session'
  Get-Content (Join-Path $repoRoot 'compose/.env.example') | Where-Object { $_ -notmatch '^SESSION_SECRET_VALUE=' } | Set-Content $brokenSession
  $threw = $false
  try { Set-GeneratedEnvSecrets -EnvPath $brokenSession } catch { $threw = $true; $message = $_.Exception.Message }
  Assert-True $threw 'Set-GeneratedEnvSecrets did not throw when SESSION_SECRET_VALUE was missing'
  Assert-True ($message -match 'SESSION_SECRET_VALUE') "Error does not name SESSION_SECRET_VALUE: $message"

  # --- the warning script flags placeholders ---
  $warnings = & (Join-Path $repoRoot 'eng/helpers/warn-env-placeholders.ps1') -EnvFile (Join-Path $repoRoot 'compose/.env.example') 3>&1
  Assert-True ($warnings -match 'POSTGRES_PASSWORD' -and $warnings -match 'DB_ENCRYPTION_SECRET_VALUE') 'warn-env-placeholders did not list the example placeholders'
  $clean = & (Join-Path $repoRoot 'eng/helpers/warn-env-placeholders.ps1') -EnvFile $envPath 3>&1
  Assert-True (-not $clean) 'warn-env-placeholders warned on a fully generated .env'

  $tokens = $null
  $parseErrors = $null
  $runnerAst = [System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $repoRoot 'eng/testing/run-e2e-ui.ps1'), [ref]$tokens, [ref]$parseErrors
  )
  Assert-True ($parseErrors.Count -eq 0) 'E2E runner contains PowerShell syntax errors'
  $envFunction = $runnerAst.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Set-AdminAppEnvFile'
  }, $true)
  Assert-True ($null -ne $envFunction) 'Set-AdminAppEnvFile was not found'
  $examplePath = Join-Path $repoRoot 'compose/.env.example'
  & {
    $repoRoot = Join-Path $tempDir 'runner'
    New-Item -ItemType Directory -Path (Join-Path $repoRoot 'compose') | Out-Null
    Copy-Item $examplePath (Join-Path $repoRoot 'compose/.env.example')
    $mockVolumes = @()
    function docker { $mockVolumes }
    Invoke-Expression $envFunction.Extent.Text
    $runnerEnvPath = Join-Path $repoRoot 'compose/.env'
    $previousSaPassword = $env:MSSQL_SA_PASSWORD
    try {
      foreach ($engine in @('pgsql', 'mssql')) {
        Set-AdminAppEnvFile -Engine $engine
        $runnerLines = Get-Content $runnerEnvPath
        Assert-True (-not ($runnerLines | Where-Object { $_ -match '^[A-Z0-9_]+=.*change-me' })) "Runner left placeholders for $engine"
        $dbSecret = Get-EnvValue $runnerLines 'DB_SECRET_VALUE' | ConvertFrom-Json
        if ($engine -eq 'pgsql') {
          Assert-True ($dbSecret.DB_PASSWORD -eq (Get-EnvValue $runnerLines 'POSTGRES_PASSWORD')) 'Runner PostgreSQL password mismatch'
        } else {
          Assert-True ($dbSecret.MSSQL_DB_PASSWORD -eq (Get-EnvValue $runnerLines 'MSSQL_SA_PASSWORD')) 'Runner MSSQL password mismatch'
        }
        Add-Content $runnerEnvPath 'CUSTOM_SETTING=preserve-me'
        $beforeRetry = [System.IO.File]::ReadAllText($runnerEnvPath)
        $env:MSSQL_SA_PASSWORD = $null
        $script:mssqlSaPassword = $null
        Set-AdminAppEnvFile -Engine $engine
        Assert-True ([System.IO.File]::ReadAllText($runnerEnvPath) -ceq $beforeRetry) "Retry changed existing settings or secrets for $engine"
        if ($engine -eq 'mssql') {
          Assert-True ($env:MSSQL_SA_PASSWORD -eq $dbSecret.MSSQL_DB_PASSWORD) 'Retry did not restore MSSQL process password'
          Assert-True ($script:mssqlSaPassword -eq $dbSecret.MSSQL_DB_PASSWORD) 'Retry did not restore MSSQL readiness password'
        }
        $otherEngine = if ($engine -eq 'pgsql') { 'mssql' } else { 'pgsql' }
        $threw = $false
        try { Set-AdminAppEnvFile -Engine $otherEngine } catch { $threw = $true }
        Assert-True $threw 'Runner did not reject a different engine'
        Assert-True ([System.IO.File]::ReadAllText($runnerEnvPath) -ceq $beforeRetry) 'Engine mismatch changed the environment'
        Remove-Item $runnerEnvPath -Force
      }
      Copy-Item $examplePath $runnerEnvPath
      $beforeRetry = [System.IO.File]::ReadAllText($runnerEnvPath)
      $threw = $false
      try { Set-AdminAppEnvFile -Engine pgsql } catch { $threw = $true; $message = $_.Exception.Message }
      Assert-True $threw 'Runner did not reject existing placeholders'
      Assert-True ($message -match 'DB_SECRET_VALUE' -and $message -match 'KEYCLOAK_EDFIADMINAPP_CLIENT_SECRET') 'Placeholder error does not name the affected variables'
      Assert-True (-not $message.Contains('change-me-')) 'Placeholder error leaked a secret value'
      Assert-True ([System.IO.File]::ReadAllText($runnerEnvPath) -ceq $beforeRetry) 'Placeholder rejection changed the environment'
      Remove-Item $runnerEnvPath -Force
      $mockVolumes = @('vol-edfiadminapp-db')
      $threw = $false
      try { Set-AdminAppEnvFile -Engine pgsql } catch { $threw = $true }
      Assert-True $threw 'Runner generated new secrets for existing volumes without an environment file'
      Assert-True (-not (Test-Path $runnerEnvPath)) 'Runner created an environment file despite existing volumes'
    } finally {
      $env:MSSQL_SA_PASSWORD = $previousSaPassword
    }
  }

  Write-Host 'env-secrets smoke test passed.' -ForegroundColor Green
}
finally {
  Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
}

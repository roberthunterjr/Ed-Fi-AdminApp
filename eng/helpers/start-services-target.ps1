# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

<#
.SYNOPSIS
    Starts Docker Compose services for local development or GitHub Actions, selecting one or more Ed-Fi target topologies.

.EXAMPLE
    ./start-services-target.ps1 -Target v6
    Starts support services and Ed-Fi v6 services.

.EXAMPLE
    ./start-services-target.ps1 -Target odsV7-adminV2
    Starts support services and Ed-Fi v7 Admin API v2 services.

.EXAMPLE
    ./start-services-target.ps1 -Target odsV7-adminV3 -MSSQL
    Starts support services and Ed-Fi v7 Admin API v3 services, with MSSQL for Admin App DB.

.EXAMPLE
    ./start-services-target.ps1 -V6 -OdsV7AdminV2 -IncludeAdminApp -Rebuild
    Starts selected services and rebuilds Admin App images before startup.

.EXAMPLE
    ./start-services-target.ps1 -Target v6 -Target odsV7-adminV2
    Starts support services and both target topologies in one command.

.EXAMPLE
    ./start-services-target.ps1 -V6 -OdsV7AdminV2
    Starts support services and both target topologies in one command using switches.

.EXAMPLE
    ./start-services-target.ps1 -Target v6,odsV7-adminV2 -IncludeAdminApp
    Starts support services, selected targets, and Admin App API/FE containers.

.EXAMPLE
    ./start-services-target.ps1 -IncludeAdminApp
    Starts only Admin App and its supporting services, without any Ed-Fi target topology.
#>

param(
    [Parameter(Mandatory = $false)]
    [ValidateSet('v6', 'odsV7-adminV2', 'odsV7-adminV3')]
    [string[]]
    $Target = @(),

    # Select Ed-Fi v6 topology
    [Switch]
    $V6,

    # Select Ed-Fi v7 Admin API v2 topology
    [Switch]
    $OdsV7AdminV2,

    # Select Ed-Fi v7 Admin API v3 topology
    [Switch]
    $OdsV7AdminV3,

    # Use SQL Server instead of PostgreSQL for the Admin App database
    [Switch]
    $MSSQL,

    # Rebuild images before starting services
    [Switch]
    $Rebuild,

    # Include Admin App API and FE services
    [Switch]
    $IncludeAdminApp,

    # Abort pull/up after this many minutes (0 = no timeout)
    [int]
    $StartTimeoutMinutes = 0
)

$selectedTargets = @()
foreach ($targetArg in $Target) {
    if ($null -eq $targetArg) {
        continue
    }

    $selectedTargets += @(
        $targetArg.Split(',', [System.StringSplitOptions]::RemoveEmptyEntries) |
            ForEach-Object { $_.Trim() } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
}

$allowedTargets = @('v6', 'odsV7-adminV2', 'odsV7-adminV3')
$invalidTargets = @($selectedTargets | Where-Object { $_ -notin $allowedTargets } | Select-Object -Unique)
if ($invalidTargets.Count -gt 0) {
    Write-Host "ERROR! Invalid target(s): $($invalidTargets -join ', '). Allowed values: $($allowedTargets -join ', ')." -ForegroundColor Red
    exit 1
}

if ($V6) {
    $selectedTargets += 'v6'
}
if ($OdsV7AdminV2) {
    $selectedTargets += 'odsV7-adminV2'
}
if ($OdsV7AdminV3) {
    $selectedTargets += 'odsV7-adminV3'
}

$selectedTargets = @($selectedTargets | Select-Object -Unique)
if ($selectedTargets.Count -eq 0 -and -not $IncludeAdminApp) {
    Write-Host 'ERROR! Select at least one target using -Target or target switches (-V6, -OdsV7AdminV2, -OdsV7AdminV3), or use -IncludeAdminApp to start Admin App-only services.' -ForegroundColor Red
    exit 1
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$composeRoot = Join-Path $repoRoot 'compose'

$networkExists = docker network ls --filter name=edfiadminapp-network --format '{{.Name}}' | Select-String -Pattern 'edfiadminapp-network'
if (-not $networkExists) {
    Write-Host 'Creating edfiadminapp-network...' -ForegroundColor Yellow
    docker network create edfiadminapp-network --driver bridge
}

$edfiServicesFile = Join-Path $composeRoot 'edfi-services.yml'
$nginxComposeFile = Join-Path $composeRoot 'nginx-compose.yml'
$adminAppServicesFile = Join-Path $composeRoot 'adminapp-services.yml'
$envFile = Join-Path $composeRoot '.env'

$files = @(
    '-f', $edfiServicesFile,
    '-f', $nginxComposeFile,
    '-f', $adminAppServicesFile
)

$composeProfile = 'postgresql'
$adminAppDbService = 'edfiadminapp-postgres'
if ($MSSQL) {
    $composeProfile = 'mssql'
    $adminAppDbService = 'edfiadminapp-mssql'
}

# bootstrap-keycloak-for-tests.ps1 reads $env:DB_ENGINE (defaulting to pgsql) to pick the
# engine, and run-e2e-ui.ps1 never sets it itself -- it relies on this script. Assign it for
# both engines: setting it only in the MSSQL branch leaks 'mssql' into a later PostgreSQL run
# in the same shell, because $env: persists for the whole session.
#
# Note this genuinely overrides .env: a process environment variable outranks --env-file in
# Compose interpolation, so `DB_ENGINE=${DB_ENGINE:-pgsql}` in adminapp-services.yml resolves
# from here. DB_SECRET_VALUE still comes from .env, so a mismatch pairs one engine with the
# other's credentials. Warn loudly rather than overriding silently -- and note the variable
# also outranks packages/api/config/local.js for anything run later in this shell.
$expectedEngine = if ($MSSQL) { 'mssql' } else { 'pgsql' }
if (Test-Path $envFile) {
    $engineLine = Select-String -Path $envFile -Pattern '^\s*DB_ENGINE\s*=\s*(\S+)' | Select-Object -Last 1
    $configuredEngine = if ($engineLine) { $engineLine.Matches.Groups[1].Value } else { 'pgsql' }
    if ($configuredEngine -ne $expectedEngine) {
        Write-Warning "DB_ENGINE in .env is '$configuredEngine' but this run uses '$expectedEngine' (from the -MSSQL switch). DB_SECRET_VALUE still comes from .env, so update it to match '$expectedEngine' or the API will start against the wrong credentials. This also overrides DB_ENGINE for anything else run in this shell."
    }
}
$env:DB_ENGINE = $expectedEngine
& (Join-Path $PSScriptRoot 'warn-env-placeholders.ps1') -EnvFile $envFile

$commonServices = @(
    'nginx',
    'edfiadminapp-keycloak',
    $adminAppDbService,
    'memcached',
    'yopass',
    'pgadmin4'
)

$targetServices = @()
foreach ($selectedTarget in $selectedTargets) {
    $targetServices += switch ($selectedTarget) {
        'v6' {
            @(
                'v6-db-admin',
                'v6-api',
                'v6-adminapi'
            )
        }
        'odsV7-adminV2' {
            @(
                'odsV7-adminV2-single-db-ods',
                'odsV7-adminV2-single-db-admin',
                'odsV7-adminV2-single-api',
                'odsV7-adminV2-single-adminapi',
                'odsV7-adminV2-tenant1-db-ods',
                'odsV7-adminV2-tenant2-db-ods',
                'odsV7-adminV2-tenant1-db-admin',
                'odsV7-adminV2-tenant2-db-admin',
                'odsV7-adminV2-multi-api',
                'odsV7-adminV2-multi-adminapi'
            )
        }
        'odsV7-adminV3' {
            @(
                'odsV7-adminV3-single-db-ods',
                'odsV7-adminV3-single-db-admin',
                'odsV7-adminV3-single-api',
                'odsV7-adminV3-single-adminapi',
                'odsV7-adminV3-tenant1-db-ods',
                'odsV7-adminV3-tenant2-db-ods',
                'odsV7-adminV3-tenant1-db-admin',
                'odsV7-adminV3-tenant2-db-admin',
                'odsV7-adminV3-multi-api',
                'odsV7-adminV3-multi-adminapi'
            )
        }
    }
}

$servicesToStart = @($commonServices + $targetServices | Select-Object -Unique)
$selectedTargetsText = if ($selectedTargets.Count -gt 0) {
    $selectedTargets -join ', '
}
else {
    'none (Admin App only)'
}

$composeProfiles = @($composeProfile)
if ($IncludeAdminApp) {
    $composeProfiles += 'adminapp'
    $servicesToStart += @('edfiadminapp-api', 'edfiadminapp-fe')
    $servicesToStart = @($servicesToStart | Select-Object -Unique)
}

$profileArgs = @()
foreach ($profileName in $composeProfiles) {
    $profileArgs += @('--profile', $profileName)
}

Write-Host "Starting Docker Compose services with profile $composeProfile for targets $selectedTargetsText..." -ForegroundColor Green
Write-Host "Services: $($servicesToStart -join ', ')" -ForegroundColor Cyan

# Many services share the same PostgreSQL-based images; pulling them all at once can hit
# Docker Hub rate limits or stall. Cap Compose's concurrency unless the caller already set it.
if (-not $env:COMPOSE_PARALLEL_LIMIT) {
    $env:COMPOSE_PARALLEL_LIMIT = '4'
}

# Runs `docker compose <args>` with an optional timeout (minutes). Returns the exit code, or
# -1 when the timeout elapsed and the process tree was killed. 0 minutes means no timeout.
function Invoke-DockerCompose {
    param(
        [string[]]$ComposeArgs,
        [int]$TimeoutMinutes
    )

    if ($TimeoutMinutes -le 0) {
        docker compose @ComposeArgs
        return $LASTEXITCODE
    }

    $quotedArgs = @('compose') + @($ComposeArgs | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } })
    $process = Start-Process -FilePath 'docker' -ArgumentList $quotedArgs -NoNewWindow -PassThru
    if (-not $process.WaitForExit($TimeoutMinutes * 60 * 1000)) {
        Write-Host "ERROR! 'docker compose $($ComposeArgs | Select-Object -Last 1)' did not finish within $TimeoutMinutes minute(s); aborting." -ForegroundColor Red
        $process.Kill($true)
        return -1
    }
    return $process.ExitCode
}

$baseArgs = @($files + @('--env-file', $envFile) + $profileArgs)

# Pull registry images up front with retries so a transient failure or rate limit does not
# fail (or hang) the whole `up`. Images built locally are skipped.
$pullAttempts = 3
for ($attempt = 1; $attempt -le $pullAttempts; $attempt++) {
    Write-Host "Pulling images (attempt $attempt/$pullAttempts)..." -ForegroundColor Cyan
    $pullExit = Invoke-DockerCompose -ComposeArgs ($baseArgs + @('pull', '--ignore-buildable') + $servicesToStart) -TimeoutMinutes $StartTimeoutMinutes
    if ($pullExit -eq 0) { break }
    if ($attempt -lt $pullAttempts) {
        $delay = 15 * $attempt
        Write-Host "Image pull failed (exit $pullExit). Retrying in $delay seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds $delay
    }
}
if ($pullExit -ne 0) {
    Write-Host 'ERROR! Image pull failed after retries.' -ForegroundColor Red
    exit 1
}

$buildArgs = @()
if ($Rebuild) {
    $buildArgs += '--build'
}

$upExit = Invoke-DockerCompose -ComposeArgs ($baseArgs + @('up', '-d') + $buildArgs + $servicesToStart) -TimeoutMinutes $StartTimeoutMinutes

if ($upExit -ne 0) {
    Write-Host 'ERROR! Services failed to start.' -ForegroundColor Red
    exit 1
}

Write-Host 'Services started successfully!' -ForegroundColor Green

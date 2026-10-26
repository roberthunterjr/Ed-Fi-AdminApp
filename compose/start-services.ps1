# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

<#
.SYNOPSIS
    Starts the Docker Compose services.

.EXAMPLE
    ./start-local.ps1
    Starts the Docker Compose services

.EXAMPLE
    ./start-local.ps1 -MSSQL
    Starts the Docker Compose services with SQL Server instead of PostgreSQL

    If the edfiadminapp-network does not exist, it will be created.
    If the -Rebuild switch is provided as $true, it will rebuild the AdminApp images before starting them.
    If the -MSSQL switch is provided, it will use SQL Server instead of PostgreSQL for the Admin App database.
#>

param(
    # Rebuild the images before starting
    [Switch]
    $Rebuild,

    # Use SQL Server instead of PostgreSQL for the Admin App database
    [Switch]
    $MSSQL
)

$networkExists = docker network ls --filter name=edfiadminapp-network --format '{{.Name}}' | Select-String -Pattern 'edfiadminapp-network'
if (-not $networkExists) {
    Write-Host "Creating edfiadminapp-network..." -ForegroundColor Yellow
    docker network create edfiadminapp-network --driver bridge
}

$edfiServicesFile = Join-Path $PSScriptRoot "edfi-services.yml"
$nginxComposeFile = Join-Path $PSScriptRoot "nginx-compose.yml"
$adminAppServicesFile = Join-Path $PSScriptRoot "adminapp-services.yml"

$files = @(
    "-f",
    $edfiServicesFile,
    "-f",
    $nginxComposeFile,
    "-f",
    $adminAppServicesFile
)

$composeProfile = "postgresql"
if ($MSSQL) {
  $composeProfile = "mssql"
}

Write-Host "Starting Docker Compose services with profile $composeProfile, running Admin App..." -ForegroundColor Green
$EnvFile = Join-Path $PSScriptRoot ".env"

# The -MSSQL switch only selects the SQL Server container profile. The API still
# reads DB_ENGINE and DB_SECRET_VALUE from .env, so warn when they do not match the
# selected profile -- otherwise the API silently starts against the wrong database.
# Do not "helpfully" override DB_ENGINE here: DB_SECRET_VALUE still comes from .env,
# so overriding only the engine pairs it with the other engine's credentials.
$expectedEngine = if ($MSSQL) { "mssql" } else { "pgsql" }
$expectedSecretKey = if ($MSSQL) { 'MSSQL_DB_HOST' } else { 'DB_HOST' }
# Each lookup takes the LAST match: when a key is defined more than once in an env file,
# Compose uses the last definition, so checking the first would warn about a line the API
# will never see (easy to hit by uncommenting the MSSQL DB_SECRET_VALUE without commenting
# out the PostgreSQL one).
if (Test-Path $EnvFile) {
    $engineLine = Select-String -Path $EnvFile -Pattern '^\s*DB_ENGINE\s*=\s*(\S+)' | Select-Object -Last 1
    $configuredEngine = if ($engineLine) { $engineLine.Matches.Groups[1].Value } else { "pgsql" }
    if ($configuredEngine -ne $expectedEngine) {
        Write-Warning "DB_ENGINE in .env is '$configuredEngine' but the selected profile expects '$expectedEngine'. Set DB_ENGINE=$expectedEngine and the matching DB_SECRET_VALUE in .env before starting."
    }

    # The quotes around the key are load-bearing: searching for DB_HOST unquoted would also
    # match inside "MSSQL_DB_HOST" and silently pass on a SQL Server secret.
    $dbSecretLine = Select-String -Path $EnvFile -Pattern '^\s*DB_SECRET_VALUE\s*=\s*(.+)$' | Select-Object -Last 1
    if (-not $dbSecretLine -or $dbSecretLine.Matches.Groups[1].Value -notmatch "`"$expectedSecretKey`"") {
        Write-Warning "DB_SECRET_VALUE does not appear to contain '$expectedSecretKey'. Update it for the selected '$expectedEngine' database before the API can connect."
    }

    if ($MSSQL) {
        $saPasswordLine = Select-String -Path $EnvFile -Pattern '^\s*MSSQL_SA_PASSWORD\s*=\s*(.+)$' | Select-Object -Last 1
        if (-not $saPasswordLine) {
            Write-Error "MSSQL_SA_PASSWORD is not set in $EnvFile. SQL Server will refuse to start without it, the healthcheck will never pass, and the API will wait indefinitely. Set it (see the password complexity rules in compose/readme.md) and re-run."
            exit 1
        }
    }
}

& (Join-Path $PSScriptRoot '..\eng\helpers\warn-env-placeholders.ps1') -EnvFile $EnvFile

if ($Rebuild) {
    docker compose $files --env-file $EnvFile --profile $composeProfile --profile adminapp build --no-cache
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Rebuild failed (exit code $LASTEXITCODE). Aborting before starting services with a possibly stale image."
        exit $LASTEXITCODE
    }
}
docker compose $files --env-file $EnvFile --profile $composeProfile --profile adminapp up -d
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to start services (exit code $LASTEXITCODE)."
    exit $LASTEXITCODE
}
Write-Host "Services started successfully!" -ForegroundColor Green

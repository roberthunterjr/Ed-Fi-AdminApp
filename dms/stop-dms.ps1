# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

#Requires -Version 7

<#
.SYNOPSIS
    Stops the local DMS stack started by start-dms.ps1.

.PARAMETER v
    Also delete all data: database volume, schema tool cache, extracted ApiSchema files and the
    saved client credentials. The pinned versions in .dms-versions.json are kept.

.EXAMPLE
    ./stop-dms.ps1

.EXAMPLE
    ./stop-dms.ps1 -v
#>
[CmdletBinding()]
param(
    [Switch]
    $v
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'DmsSetup.psm1') -Force

$composeFile = Join-Path $PSScriptRoot 'docker-compose.yml'
$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
    $envFile = Join-Path $PSScriptRoot '.env.example'
}

# Same settings resolution as start-dms.ps1, so an empty leftover variable in the session
# cannot override .env and fail Compose's required-variable checks.
$settings = Get-DmsSettings -Path $envFile

function Invoke-ComposeDown {
    $downArguments = $args
    Invoke-DmsWithEnvironment -Variables $settings -ScriptBlock {
        docker compose -f $composeFile --env-file $envFile down @downArguments
    }
    if ($LASTEXITCODE -ne 0) { throw "docker compose down failed with exit code $LASTEXITCODE." }
}

if ($v) {
    Write-Host 'Stopping the local DMS stack and deleting its data...'
    Invoke-ComposeDown -v

    docker volume rm adminapp-dms-schema-tools *> $null
    foreach ($path in @('.apischema', '.credentials.json')) {
        $fullPath = Join-Path $PSScriptRoot $path
        if (Test-Path -LiteralPath $fullPath) {
            Remove-Item -LiteralPath $fullPath -Recurse -Force
        }
    }
}
else {
    Write-Host 'Stopping the local DMS stack...'
    Invoke-ComposeDown
}

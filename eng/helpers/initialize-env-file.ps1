# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

<#
.SYNOPSIS
  Creates compose/.env from compose/.env.example with generated secrets.
.DESCRIPTION
  If the target file already exists it is left unchanged unless -Force is given.
  Secrets are generated for the default PostgreSQL engine only. For SQL Server use
  eng/testing/run-e2e-ui.ps1 -DbEngine mssql. Secret values are never printed.
#>
param(
  [string]$EnvPath = (Join-Path $PSScriptRoot '../../compose/.env'),
  [switch]$Force
)
$ErrorActionPreference = 'Stop'

if ((Test-Path -Path $EnvPath) -and -not $Force) {
  Write-Host "$EnvPath already exists and was left unchanged. start-services warns if it still contains placeholders; use -Force to recreate it." -ForegroundColor Yellow
  exit 0
}

. (Join-Path $PSScriptRoot 'env-secrets.ps1')

$examplePath = Join-Path $PSScriptRoot '../../compose/.env.example'
Copy-Item -Path $examplePath -Destination $EnvPath -Force
Set-GeneratedEnvSecrets -EnvPath $EnvPath
Write-Host "Created $EnvPath from compose/.env.example with generated secrets (PostgreSQL)." -ForegroundColor Cyan

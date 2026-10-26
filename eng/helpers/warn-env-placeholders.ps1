# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

<#
.SYNOPSIS
  Warns when an env file still contains the change-me placeholders from compose/.env.example.
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$EnvFile
)

if (-not (Test-Path $EnvFile)) {
  return
}

# Only uncommented lines: the pattern requires the line to start with the variable name.
$stale = @(Select-String -Path $EnvFile -Pattern '^\s*([A-Z0-9_]+)\s*=.*change-me' |
  ForEach-Object { $_.Matches[0].Groups[1].Value } |
  Sort-Object -Unique)

if ($stale.Count -gt 0) {
  Write-Warning "$EnvFile still contains placeholder (change-me) values for: $($stale -join ', '). The Admin App API refuses to start in production with placeholder secrets. Set real values, or generate them with eng/testing/run-e2e-ui.ps1."
}

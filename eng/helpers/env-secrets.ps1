# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

# Secret generation for automated provisioning of compose/.env. Dot-source this file.
# Tested by eng/testing/test-env-secrets.ps1.

function New-RandomHex {
  param([int]$Bytes = 32)
  -join ([System.Security.Cryptography.RandomNumberGenerator]::GetBytes($Bytes) | ForEach-Object { $_.ToString('x2') })
}

# Alphanumeric only, so the value is safe inside JSON, URLs and regex replacement strings.
# Always contains an upper-case letter, a lower-case letter and a digit, which satisfies
# SQL Server's "3 of 4 character categories" password rule.
function New-RandomSecret {
  param([int]$Length = 32)
  $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  do {
    $secret = -join (1..$Length | ForEach-Object {
      $alphabet[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($alphabet.Length)]
    })
  } until ($secret -cmatch '[A-Z]' -and $secret -cmatch '[a-z]' -and $secret -match '[0-9]')
  $secret
}

# Replaces the change-me placeholders (and the empty SESSION_SECRET_VALUE=[] array) that
# compose/.env.example ships with generated values.
# Each rule must match exactly once: a reformatted or duplicated example line must fail loudly
# rather than leave a placeholder (or a half-patched pair) behind. The mssql-specific lines
# (MSSQL_SA_PASSWORD and the commented mssql DB_SECRET_VALUE) are patched by
# Set-AdminAppEnvFile in eng/testing/run-e2e-ui.ps1.
function Set-GeneratedEnvSecrets {
  param([Parameter(Mandatory = $true)][string]$EnvPath)

  $dbPassword = New-RandomSecret
  $clientSecret = New-RandomSecret
  $devClientSecret = New-RandomSecret
  $encryptionKey = New-RandomHex
  $sessionSecret = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

  $fired = [ordered]@{
    'POSTGRES_PASSWORD'                       = 0
    'KEYCLOAK_EDFIADMINAPP_CLIENT_SECRET'     = 0
    'KEYCLOAK_EDFIADMINAPP_DEV_CLIENT_SECRET' = 0
    'DB_ENCRYPTION_SECRET_VALUE'              = 0
    'DB_SECRET_VALUE (PostgreSQL)'            = 0
    'SESSION_SECRET_VALUE'                    = 0
  }

  $content = Get-Content -Path $EnvPath | ForEach-Object {
    switch -Regex ($_) {
      '^POSTGRES_PASSWORD=change-me.*$' { $fired['POSTGRES_PASSWORD']++; "POSTGRES_PASSWORD=$dbPassword" }
      '^KEYCLOAK_EDFIADMINAPP_CLIENT_SECRET=change-me.*$' { $fired['KEYCLOAK_EDFIADMINAPP_CLIENT_SECRET']++; "KEYCLOAK_EDFIADMINAPP_CLIENT_SECRET=$clientSecret" }
      '^KEYCLOAK_EDFIADMINAPP_DEV_CLIENT_SECRET=change-me.*$' { $fired['KEYCLOAK_EDFIADMINAPP_DEV_CLIENT_SECRET']++; "KEYCLOAK_EDFIADMINAPP_DEV_CLIENT_SECRET=$devClientSecret" }
      '^DB_ENCRYPTION_SECRET_VALUE=\{"KEY":"change-me[^"]*".*$' {
        $fired['DB_ENCRYPTION_SECRET_VALUE']++
        $_ -replace '"KEY":"[^"]*"', "`"KEY`":`"$encryptionKey`""
      }
      '^DB_SECRET_VALUE=\{"DB_HOST".*"DB_PASSWORD":"change-me[^"]*".*$' {
        $fired['DB_SECRET_VALUE (PostgreSQL)']++
        $_ -replace '"DB_PASSWORD":"[^"]*"', "`"DB_PASSWORD`":`"$dbPassword`""
      }
      '^SESSION_SECRET_VALUE=\[\]$' { $fired['SESSION_SECRET_VALUE']++; "SESSION_SECRET_VALUE=[`"$sessionSecret`"]" }
      default { $_ }
    }
  }

  $wrong = $fired.GetEnumerator() | Where-Object { $_.Value -ne 1 }
  if ($wrong) {
    $detail = ($wrong | ForEach-Object { "'$($_.Key)' matched $($_.Value) time(s), expected 1" }) -join '; '
    throw "compose/.env.example did not match the expected secret patterns (placeholders and SESSION_SECRET_VALUE=[]): $detail. It may have been reformatted or a key duplicated; update the patterns in Set-GeneratedEnvSecrets (eng/helpers/env-secrets.ps1)."
  }

  Set-Content -Path $EnvPath -Value $content
}

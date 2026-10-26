# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

# Helpers for start-dms.ps1. The identity SQL is a trimmed port of the DMS repository's
# eng/docker-compose/setup-openiddict.ps1 and OpenIddict-Crypto.psm1 (PostgreSQL only).

Set-StrictMode -Version Latest

$script:PostgresContainer = 'adminapp-dms-postgresql'
$script:SchemaToolsVolume = 'adminapp-dms-schema-tools'
$script:SchemaToolsFeed = 'https://pkgs.dev.azure.com/ed-fi-alliance/Ed-Fi-Alliance-OSS/_packaging/EdFi/nuget/v3/index.json'
$script:DotNetSdkImage = 'mcr.microsoft.com/dotnet/sdk:10.0'

function ConvertFrom-DmsDotEnvValue {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Raw)

    # Same rules Docker Compose applies to single-line values: single quotes are literal, double
    # quotes honor \" and \\, and an unquoted value ends at a " #" inline comment.
    $Raw = $Raw.Trim()
    if ($Raw.StartsWith("'")) {
        $end = $Raw.IndexOf("'", 1)
        if ($end -gt 0) { return $Raw.Substring(1, $end - 1) }
    }
    elseif ($Raw.StartsWith('"')) {
        $builder = [System.Text.StringBuilder]::new()
        for ($i = 1; $i -lt $Raw.Length; $i++) {
            $c = $Raw[$i]
            if ($c -eq '\' -and $i + 1 -lt $Raw.Length -and $Raw[$i + 1] -in @('"', '\')) {
                $null = $builder.Append($Raw[$i + 1])
                $i++
            }
            elseif ($c -eq '"') {
                return $builder.ToString()
            }
            else {
                $null = $builder.Append($c)
            }
        }
    }
    return ($Raw -replace '\s+#.*$', '').Trim()
}

function Get-DmsSettings {
    param(
        [Parameter(Mandatory)][string]$Path,
        # Optional settings that may be absent from the file but still set in the environment.
        [string[]]$AdditionalNames = @()
    )

    # Resolve settings exactly as Docker Compose does, so the setup steps and the containers agree:
    # last definition in the file wins, and a variable set in the process environment overrides it.
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            $values[$Matches[1]] = ConvertFrom-DmsDotEnvValue -Raw $Matches[2]
        }
    }
    # An empty variable is treated as unset: PowerShell cannot normally create one ($env:X = ''
    # removes X), so an empty value is almost always a leftover rather than a real override.
    foreach ($name in @($values.Keys) + $AdditionalNames) {
        $fromEnvironment = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrEmpty($fromEnvironment)) {
            $values[$name] = $fromEnvironment
        }
    }
    return $values
}

function Invoke-DmsWithEnvironment {
    param(
        [Parameter(Mandatory)][hashtable]$Variables,
        [Parameter(Mandatory)][scriptblock]$ScriptBlock
    )

    # Hands settings to a child process (docker compose) without leaving them behind in the
    # caller's session, where a later run would mistake them for explicit overrides.
    $previous = @{}
    foreach ($name in $Variables.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name)
        [Environment]::SetEnvironmentVariable($name, [string]$Variables[$name])
    }
    try {
        & $ScriptBlock
    }
    finally {
        foreach ($name in $previous.Keys) {
            if ($null -eq $previous[$name]) {
                # Passing $null to a .NET string parameter sends "", which leaves an empty variable
                # behind instead of removing it; [NullString]::Value really passes null.
                [Environment]::SetEnvironmentVariable($name, [NullString]::Value)
            }
            else {
                [Environment]::SetEnvironmentVariable($name, $previous[$name])
            }
        }
    }
}

function ConvertTo-PgLiteral {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

function Invoke-DmsPsql {
    param(
        [Parameter(Mandatory)][string]$Sql,
        [Parameter(Mandatory)][string]$Database
    )

    # SQL goes through stdin so secrets never appear in the process list.
    $output = $Sql | docker exec -i $script:PostgresContainer psql -U postgres -d $Database -X -q -t -A -v ON_ERROR_STOP=1 -f - 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "psql failed: $($output -join [Environment]::NewLine)"
    }
    return ($output | Where-Object { $_ -ne '' }) -join [Environment]::NewLine
}

function Wait-DmsPostgres {
    param([int]$TimeoutSeconds = 120)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        # TCP, not the socket: on a fresh volume a socket-only temporary server answers first.
        docker exec $script:PostgresContainer pg_isready -h 127.0.0.1 -U postgres *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 2
    }
    throw "PostgreSQL did not become ready within $TimeoutSeconds seconds. Check: docker logs $script:PostgresContainer"
}

function Wait-DmsHttpOk {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Container,
        [int]$TimeoutSeconds = 180
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -SkipHttpErrorCheck
            if ($response.StatusCode -eq 200) { return }
        }
        catch {
            # Not listening yet.
        }
        Start-Sleep -Seconds 2
    }
    throw "$Name did not report healthy at $Url within $TimeoutSeconds seconds. Check: docker logs $Container"
}

function New-AspNetPasswordHash {
    param(
        [Parameter(Mandatory)][string]$Secret,
        [int]$Iterations = 210000
    )

    # Layout CMS expects: [byte 1][int32 LE salt length][salt][PBKDF2-SHA256 subkey].
    # Instance APIs rather than the .NET 6 static helpers, so PowerShell 7.0 and 7.1 work too.
    $salt = [byte[]]::new(16)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($salt) } finally { $rng.Dispose() }

    $pbkdf2 = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
        [System.Text.Encoding]::UTF8.GetBytes($Secret),
        $salt,
        $Iterations,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256)
    try { $subkey = $pbkdf2.GetBytes(32) } finally { $pbkdf2.Dispose() }

    $bytes = [System.Collections.Generic.List[byte]]::new()
    $bytes.Add(1)
    $bytes.AddRange([BitConverter]::GetBytes([int32]16))
    $bytes.AddRange($salt)
    $bytes.AddRange($subkey)
    return [Convert]::ToBase64String($bytes.ToArray())
}

function Initialize-DmsSigningKey {
    param(
        [Parameter(Mandatory)][string]$Database,
        [Parameter(Mandatory)][string]$EncryptionKey
    )

    # CMS creates these objects too, but only after it starts, and it never creates a signing key.
    # The key must exist before CMS starts, so create the same objects (CMS scripts 0000, 0019, 0020).
    $rsa = [System.Security.Cryptography.RSA]::Create(2048)
    try {
        $keyId = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([guid]::NewGuid().ToString()))
        $publicKey = [Convert]::ToBase64String($rsa.ExportSubjectPublicKeyInfo())
        $privateKey = [Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey())
    }
    finally {
        $rsa.Dispose()
    }

    $sql = @"
CREATE SCHEMA IF NOT EXISTS "dmscs";
CREATE TABLE IF NOT EXISTS "dmscs"."OpenIddictKey" (
    "Id" SERIAL,
    "KeyId" VARCHAR(64) NOT NULL,
    "PublicKey" BYTEA NOT NULL,
    "PrivateKey" TEXT NOT NULL,
    "CreatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "CreatedBy" VARCHAR(256),
    "LastModifiedAt" TIMESTAMP,
    "ModifiedBy" VARCHAR(256),
    "ExpiresAt" TIMESTAMP,
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE
);
DO `$`$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PK_OpenIddictKey'
                   AND conrelid = '"dmscs"."OpenIddictKey"'::regclass) THEN
        ALTER TABLE "dmscs"."OpenIddictKey" ADD CONSTRAINT "PK_OpenIddictKey" PRIMARY KEY ("Id");
    END IF;
END`$`$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO "dmscs"."OpenIddictKey" ("KeyId", "PublicKey", "PrivateKey", "IsActive")
SELECT $(ConvertTo-PgLiteral $keyId), decode($(ConvertTo-PgLiteral $publicKey), 'base64'),
       pgp_sym_encrypt($(ConvertTo-PgLiteral $privateKey), $(ConvertTo-PgLiteral $EncryptionKey)), TRUE
WHERE NOT EXISTS (SELECT 1 FROM "dmscs"."OpenIddictKey" WHERE "IsActive");
SELECT count(*) FROM "dmscs"."OpenIddictKey" WHERE "IsActive";
"@
    $null = Invoke-DmsPsql -Sql $sql -Database $Database
}

function Add-DmsReadOnlyClient {
    param(
        [Parameter(Mandatory)][string]$Database,
        [Parameter(Mandatory)][string]$ClientId,
        [Parameter(Mandatory)][string]$ClientSecret
    )

    # The client DMS uses to read data stores, claim sets and applications from CMS.
    # Runs after CMS has created its OpenIddict tables. Existing rows are left alone.
    $scope = 'edfi_admin_api/readonly_access'
    $client = ConvertTo-PgLiteral $ClientId
    $scopeLiteral = ConvertTo-PgLiteral $scope
    $hash = ConvertTo-PgLiteral (New-AspNetPasswordHash -Secret $ClientSecret)

    $sql = @"
BEGIN;
INSERT INTO "dmscs"."OpenIddictApplication" ("Id", "ClientId", "ClientSecret", "DisplayName", "Type", "Permissions", "ProtocolMappers")
VALUES ($(ConvertTo-PgLiteral ([guid]::NewGuid().ToString())), $client, $hash, $client, 'confidential',
        ARRAY[$scopeLiteral]::varchar[],
        jsonb_build_array(jsonb_build_object('claim.name', 'namespacePrefixes', 'claim.value', 'http://ed-fi.org', 'jsonType.label', 'String')))
ON CONFLICT ON CONSTRAINT "UX_OpenIddictApplication_ClientId" DO NOTHING;
INSERT INTO "dmscs"."OpenIddictRole" ("Id", "Name") VALUES ($(ConvertTo-PgLiteral ([guid]::NewGuid().ToString())), 'dms-client')
ON CONFLICT ON CONSTRAINT "UX_OpenIddictRole_Name" DO NOTHING;
INSERT INTO "dmscs"."OpenIddictRole" ("Id", "Name") VALUES ($(ConvertTo-PgLiteral ([guid]::NewGuid().ToString())), 'cms-client')
ON CONFLICT ON CONSTRAINT "UX_OpenIddictRole_Name" DO NOTHING;
INSERT INTO "dmscs"."OpenIddictScope" ("Id", "Name", "Description") VALUES ($(ConvertTo-PgLiteral ([guid]::NewGuid().ToString())), $scopeLiteral, $scopeLiteral)
ON CONFLICT ON CONSTRAINT "UX_OpenIddictScope_Name" DO NOTHING;
INSERT INTO "dmscs"."OpenIddictClientRole" ("ClientId", "RoleId")
SELECT a."Id", r."Id" FROM "dmscs"."OpenIddictApplication" a, "dmscs"."OpenIddictRole" r
WHERE a."ClientId" = $client AND r."Name" IN ('dms-client', 'cms-client')
ON CONFLICT ON CONSTRAINT "PK_OpenIddictClientRole" DO NOTHING;
INSERT INTO "dmscs"."OpenIddictApplicationScope" ("ApplicationId", "ScopeId")
SELECT a."Id", s."Id" FROM "dmscs"."OpenIddictApplication" a, "dmscs"."OpenIddictScope" s
WHERE a."ClientId" = $client AND s."Name" = $scopeLiteral
ON CONFLICT ON CONSTRAINT "PK_OpenIddictApplicationScope" DO NOTHING;
COMMIT;
"@
    $null = Invoke-DmsPsql -Sql $sql -Database $Database
}

function Get-DmsCmsAdminToken {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][string]$ClientId,
        [Parameter(Mandatory)][string]$ClientSecret
    )

    # Registering an existing client id is rejected; that is fine, the token request decides.
    $null = Invoke-WebRequest -Method Post -Uri "$BaseUrl/connect/register" -SkipHttpErrorCheck -Body @{
        ClientId     = $ClientId
        ClientSecret = $ClientSecret
        DisplayName  = $ClientId
    }

    $response = Invoke-RestMethod -Method Post -Uri "$BaseUrl/connect/token" -Body @{
        client_id     = $ClientId
        client_secret = $ClientSecret
        grant_type    = 'client_credentials'
        scope         = 'edfi_admin_api/full_access'
    }
    return $response.access_token
}

function Invoke-DmsCmsApi {
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$Token,
        [object]$Body
    )

    $parameters = @{
        Method  = $Method
        Uri     = $Uri
        Headers = @{ Authorization = "Bearer $Token" }
    }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = $Body | ConvertTo-Json -Depth 5
    }
    return Invoke-WebRequest @parameters
}

function Get-DmsImageVersion {
    param([Parameter(Mandatory)][string]$Image)

    # Published images carry e.g. "dms-pre-8.1.0-beta.0.1.32"; the schema tool uses "8.1.0-beta.0.1.32".
    $label = docker image inspect $Image --format '{{ index .Config.Labels "org.opencontainers.image.version" }}'
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($label)) {
        throw "Could not read the version label of image '$Image'."
    }
    return ($label.Trim() -replace '^(dms|cs)-pre-', '' -replace '^(dms|cs)-', '' -replace '^v', '')
}

function Get-DmsImageDigest {
    param([Parameter(Mandatory)][string]$Image)

    $digest = docker image inspect $Image --format '{{ index .RepoDigests 0 }}'
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($digest)) {
        throw "Could not read the digest of image '$Image'."
    }
    return $digest.Trim()
}

function Export-DmsApiSchema {
    param(
        [Parameter(Mandatory)][string]$Image,
        [Parameter(Mandatory)][string]$Destination
    )

    # Copy the ApiSchema files bundled in the DMS image, so provisioning uses exactly what DMS loads.
    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    $null = New-Item -ItemType Directory -Path $Destination

    $containerId = docker create $Image
    if ($LASTEXITCODE -ne 0) { throw "docker create failed for '$Image'." }
    try {
        docker cp "${containerId}:/app/ApiSchema/." $Destination *> $null
        if ($LASTEXITCODE -ne 0) { throw "Could not copy /app/ApiSchema out of '$Image'." }
    }
    finally {
        docker rm $containerId *> $null
    }

    $manifestPath = Join-Path $Destination 'bootstrap-api-schema-manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "Image '$Image' has no /app/ApiSchema/bootstrap-api-schema-manifest.json."
    }

    # Core first, then extensions, as container paths under /schema.
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $projects = @($manifest.projects | Sort-Object { [bool]$_.isExtensionProject })
    return @($projects | ForEach-Object { '/schema/' + $_.schemaPath })
}

function Invoke-DmsSchemaTool {
    param(
        [Parameter(Mandatory)][string]$Version,
        [Parameter(Mandatory)][string]$SchemaDirectory,
        [Parameter(Mandatory)][string[]]$Arguments
    )

    # Runs api-schema-tools in a throwaway .NET SDK container on the stack's network, so no
    # local .NET is needed. The installed tool is cached per version in a named volume.
    $toolPath = "/tools/$Version"
    $script = "set -e; if [ ! -x $toolPath/api-schema-tools ]; then " +
        "dotnet tool install --tool-path $toolPath EdFi.Api.SchemaTools --add-source $script:SchemaToolsFeed --version $Version > /dev/null; fi; " +
        "exec $toolPath/api-schema-tools `"`$@`""

    $output = docker run --rm --network dms-local `
        -v "${script:SchemaToolsVolume}:/tools" `
        -v "$((Resolve-Path -LiteralPath $SchemaDirectory).Path):/schema:ro" `
        $script:DotNetSdkImage sh -c $script api-schema-tools @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    return [pscustomobject]@{ ExitCode = $exitCode; Output = ($output -join [Environment]::NewLine) }
}

Export-ModuleMember -Function Get-DmsSettings, Invoke-DmsWithEnvironment, Invoke-DmsPsql, Wait-DmsPostgres,
    Wait-DmsHttpOk, Initialize-DmsSigningKey, Add-DmsReadOnlyClient, Get-DmsCmsAdminToken, Invoke-DmsCmsApi,
    Get-DmsImageVersion, Get-DmsImageDigest, Export-DmsApiSchema, Invoke-DmsSchemaTool,
    New-AspNetPasswordHash, ConvertTo-PgLiteral

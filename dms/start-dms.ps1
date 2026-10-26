# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

#Requires -Version 7

<#
.SYNOPSIS
    Starts a minimal local Ed-Fi DMS stack from published images and checks that it works.

.DESCRIPTION
    Starts PostgreSQL, the Configuration Service (self-contained identity) and DMS, running the
    setup steps between them in the order DMS needs:

      1. PostgreSQL, then the OpenIddict signing key (must exist before the Configuration Service starts)
      2. Configuration Service, then the CMSReadOnlyAccess client DMS uses to read it
      3. One data store registered in the Configuration Service
      4. DMS database schema provisioned with api-schema-tools (in a throwaway .NET SDK container)
      5. DMS, then a self-check: a client application gets a token and GET /data/ed/students returns 200

    The first run pins the exact images and schema tool version DMS_IMAGE_TAG (default "pre")
    points to, in .dms-versions.json. Later runs reuse that pin. Use -Update to move to the newest.

    Re-running against a stack that is already up is safe: every step skips work already done.

.PARAMETER Update
    Resolve DMS_IMAGE_TAG again. When the DMS version changes, the data is reset (after confirmation).

.PARAMETER Force
    With -Update, reset without asking for confirmation.

.EXAMPLE
    ./start-dms.ps1

.EXAMPLE
    ./start-dms.ps1 -Update
#>
[CmdletBinding()]
param(
    [Switch]
    $Update,

    [Switch]
    $Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DmsSetup.psm1') -Force

$composeFile = Join-Path $PSScriptRoot 'docker-compose.yml'
$envFile = Join-Path $PSScriptRoot '.env'
$versionsFile = Join-Path $PSScriptRoot '.dms-versions.json'
$credentialsFile = Join-Path $PSScriptRoot '.credentials.json'
$schemaDirectory = Join-Path $PSScriptRoot '.apischema'

$dataStoreName = 'Local Development Data Store'
$vendorName = 'Local Development Vendor'
$applicationName = 'Local Development Application'

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Compose {
    # Compose gets the same effective settings the setup steps use, including the selected images.
    $composeArguments = $args
    Invoke-DmsWithEnvironment -Variables $composeEnvironment -ScriptBlock {
        docker compose -f $composeFile --env-file $envFile @composeArguments
    }
    if ($LASTEXITCODE -ne 0) { throw "docker compose $($composeArguments -join ' ') failed with exit code $LASTEXITCODE." }
}

# --- Prerequisites and settings ---------------------------------------------------------------

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker is not running. Start Docker Desktop and try again.'
}

if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '.env.example') -Destination $envFile
    Write-Host "Created $envFile from .env.example." -ForegroundColor Yellow
}
$settings = Get-DmsSettings -Path $envFile -AdditionalNames @('DMS_IMAGE', 'CONFIGURATION_SERVICE_IMAGE', 'SCHEMA_TOOLS_VERSION')
$database = $settings['POSTGRES_DB_NAME']
$tag = if ($settings['DMS_IMAGE_TAG']) { $settings['DMS_IMAGE_TAG'] } else { 'pre' }
$cmsUrl = "http://localhost:$($settings['CONFIGURATION_SERVICE_PORT'])"
$dmsUrl = "http://localhost:$($settings['DMS_PORT'])"

$encryptionKey = $settings['CONFIGURATION_SERVICE_DATABASE_ENCRYPTION_KEY']
if ($encryptionKey.Length -lt 32 -or $encryptionKey.Substring(0, 32) -eq 'YourSecureEncryptionKey32Characters'.Substring(0, 32)) {
    throw 'CONFIGURATION_SERVICE_DATABASE_ENCRYPTION_KEY in .env must be at least 32 characters and not the shipped placeholder.'
}

# --- Versions ---------------------------------------------------------------------------------

function Resolve-DmsVersions {
    Write-Step "Resolving '$tag' images"
    $dmsTagImage = "edfialliance/ed-fi-api:$tag"
    $cmsTagImage = "edfialliance/ed-fi-api-configuration-service:$tag"
    foreach ($image in @($dmsTagImage, $cmsTagImage)) {
        docker pull -q $image | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "docker pull $image failed." }
    }
    return [ordered]@{
        tag                         = $tag
        dmsImage                    = Get-DmsImageDigest $dmsTagImage
        dmsVersion                  = Get-DmsImageVersion $dmsTagImage
        configurationServiceImage   = Get-DmsImageDigest $cmsTagImage
        configurationServiceVersion = Get-DmsImageVersion $cmsTagImage
        resolvedAt                  = (Get-Date).ToUniversalTime().ToString('o')
    }
}

$pinned = if (Test-Path -LiteralPath $versionsFile) { Get-Content -LiteralPath $versionsFile -Raw | ConvertFrom-Json -AsHashtable } else { $null }
$explicitDmsImage = $settings['DMS_IMAGE']

if ($null -eq $pinned -or $Update) {
    $resolved = Resolve-DmsVersions
    # Reset only when the DMS image actually used changes. An explicit DMS_IMAGE is not moved by
    # the tag, so a newer tag must not wipe data that the same image will keep serving.
    $dmsImageChanges = $null -ne $pinned -and -not $explicitDmsImage -and $pinned.dmsImage -ne $resolved.dmsImage
    if ($dmsImageChanges) {
        Write-Warning "DMS moves from $($pinned.dmsVersion) to $($resolved.dmsVersion). The database schema may change, so the local DMS data will be deleted."
        if (-not $Force) {
            $answer = Read-Host 'Reset the local DMS data and update? (y/N)'
            if ($answer -notmatch '^(y|yes)$') {
                Write-Host 'Update cancelled; keeping the pinned versions.'
                return
            }
        }
        & (Join-Path $PSScriptRoot 'stop-dms.ps1') -v
    }
    elseif ($null -ne $pinned -and $explicitDmsImage) {
        Write-Host "DMS_IMAGE is set explicitly ($explicitDmsImage); the '$tag' tag does not change it."
    }
    elseif ($null -ne $pinned) {
        Write-Host "DMS is already at $($resolved.dmsVersion)."
    }
    $resolved | ConvertTo-Json | Set-Content -LiteralPath $versionsFile
    $pinned = $resolved
}

$dmsImage = if ($explicitDmsImage) { $explicitDmsImage } else { $pinned.dmsImage }
$cmsImage = if ($settings['CONFIGURATION_SERVICE_IMAGE']) { $settings['CONFIGURATION_SERVICE_IMAGE'] } else { $pinned.configurationServiceImage }
foreach ($image in @($dmsImage, $cmsImage)) {
    docker image inspect $image *> $null
    if ($LASTEXITCODE -ne 0) {
        docker pull -q $image | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "docker pull $image failed." }
    }
}
$schemaToolsVersion = if ($settings['SCHEMA_TOOLS_VERSION']) { $settings['SCHEMA_TOOLS_VERSION'] } else { Get-DmsImageVersion $dmsImage }

$composeEnvironment = @{} + $settings
$composeEnvironment['DMS_IMAGE'] = $dmsImage
$composeEnvironment['CONFIGURATION_SERVICE_IMAGE'] = $cmsImage
Write-Host "DMS $(Get-DmsImageVersion $dmsImage), Configuration Service $(Get-DmsImageVersion $cmsImage), api-schema-tools $schemaToolsVersion"

# --- 1. PostgreSQL and signing key ------------------------------------------------------------

Write-Step 'Starting PostgreSQL'
Invoke-Compose up -d db
Wait-DmsPostgres

Write-Step 'Ensuring the OpenIddict signing key'
Initialize-DmsSigningKey -Database $database -EncryptionKey $settings['CONFIGURATION_SERVICE_IDENTITY_ENCRYPTION_KEY']

# --- 2. Configuration Service and the client DMS uses ------------------------------------------

Write-Step 'Starting the Configuration Service'
Invoke-Compose up -d --no-deps config
Wait-DmsHttpOk -Url "$cmsUrl/health" -Name 'Configuration Service' -Container 'adminapp-dms-config'

Write-Step "Ensuring the $($settings['DMS_CONFIGURATION_SERVICE_CLIENT_ID']) client"
Add-DmsReadOnlyClient -Database $database -ClientId $settings['DMS_CONFIGURATION_SERVICE_CLIENT_ID'] -ClientSecret $settings['DMS_CONFIGURATION_SERVICE_CLIENT_SECRET']

# --- 3. Data store ----------------------------------------------------------------------------

Write-Step 'Ensuring the data store'
$cmsToken = Get-DmsCmsAdminToken -BaseUrl $cmsUrl -ClientId $settings['CMS_ADMIN_CLIENT_ID'] -ClientSecret $settings['CMS_ADMIN_CLIENT_SECRET']
$dataStores = @((Invoke-DmsCmsApi -Method Get -Uri "$cmsUrl/v3/dataStores" -Token $cmsToken).Content | ConvertFrom-Json)
$dataStore = $dataStores | Where-Object { $_.name -eq $dataStoreName } | Select-Object -First 1
if ($dataStore) {
    $dataStoreId = $dataStore.id
}
else {
    $response = Invoke-DmsCmsApi -Method Post -Uri "$cmsUrl/v3/dataStores" -Token $cmsToken -Body @{
        dataStoreType    = 'Development'
        name             = $dataStoreName
        provider         = 'postgresql'
        connectionString = "host=dms-postgresql;port=5432;username=postgres;password=$($settings['POSTGRES_PASSWORD']);database=$database"
    }
    $dataStoreId = ($response.Content | ConvertFrom-Json).id
}
Write-Host "Data store id: $dataStoreId"

# --- 4. Schema provisioning -------------------------------------------------------------------

Write-Step 'Provisioning the DMS database schema'
$schemaFiles = Export-DmsApiSchema -Image $dmsImage -Destination $schemaDirectory

$hashResult = Invoke-DmsSchemaTool -Version $schemaToolsVersion -SchemaDirectory $schemaDirectory -Arguments (@('hash') + $schemaFiles)
if ($hashResult.ExitCode -ne 0 -or $hashResult.Output -notmatch 'Effective schema hash: ([0-9a-f]{64})') {
    throw "api-schema-tools hash failed:`n$($hashResult.Output)"
}
$expectedHash = $Matches[1]

$currentHash = ''
if ((Invoke-DmsPsql -Database $database -Sql "SELECT to_regclass('dms.""EffectiveSchema""') IS NOT NULL;") -eq 't') {
    $currentHash = Invoke-DmsPsql -Database $database -Sql 'SELECT "EffectiveSchemaHash" FROM dms."EffectiveSchema" LIMIT 1;'
}

if ($currentHash -eq $expectedHash) {
    Write-Host 'Schema already provisioned for this DMS version.'
}
elseif (-not [string]::IsNullOrWhiteSpace($currentHash)) {
    throw "The database was provisioned for a different DMS schema ($currentHash, expected $expectedHash). Reset it with ./stop-dms.ps1 -v and start again."
}
else {
    $provisionArguments = @('ddl', 'provision', '--dialect', 'pgsql', '--create-database',
        '--connection-string', "host=dms-postgresql;port=5432;username=postgres;password=$($settings['POSTGRES_PASSWORD']);database=$database")
    foreach ($file in $schemaFiles) { $provisionArguments += @('--schema', $file) }
    $provisionResult = Invoke-DmsSchemaTool -Version $schemaToolsVersion -SchemaDirectory $schemaDirectory -Arguments $provisionArguments
    if ($provisionResult.ExitCode -ne 0) {
        throw "api-schema-tools ddl provision failed:`n$($provisionResult.Output)"
    }
    Write-Host 'Schema provisioned.'
}

# --- 5. DMS and self-check ----------------------------------------------------------------------

Write-Step 'Starting DMS'
Invoke-Compose up -d --no-deps dms
Wait-DmsHttpOk -Url "$dmsUrl/health" -Name 'DMS' -Container 'adminapp-dms-api'

Write-Step 'Ensuring the client application'
$applications = @((Invoke-DmsCmsApi -Method Get -Uri "$cmsUrl/v3/applications" -Token $cmsToken).Content | ConvertFrom-Json)
$application = $applications | Where-Object { $_.applicationName -eq $applicationName } | Select-Object -First 1

$hasCredentialsFile = Test-Path -LiteralPath $credentialsFile
if ($hasCredentialsFile -and -not $application) {
    # The database was reset outside stop-dms.ps1 -v (for example its volume was deleted), so the
    # saved secret belongs to an application that no longer exists and cannot work anywhere.
    Write-Warning "The application in $credentialsFile no longer exists (the database was reset). Creating a new one; its credentials replace the old ones."
    $hasCredentialsFile = $false
}

if ($hasCredentialsFile) {
    $credentials = Get-Content -LiteralPath $credentialsFile -Raw | ConvertFrom-Json
}
elseif ($application) {
    # The secret is only returned on creation; never rotate it behind the developer's back.
    throw "The application '$applicationName' exists but $credentialsFile is missing, so its secret is unknown. Reset with ./stop-dms.ps1 -v."
}
else {
    $vendors = @((Invoke-DmsCmsApi -Method Get -Uri "$cmsUrl/v3/vendors" -Token $cmsToken).Content | ConvertFrom-Json)
    $vendor = $vendors | Where-Object { $_.company -eq $vendorName } | Select-Object -First 1
    if ($vendor) {
        $vendorId = $vendor.id
    }
    else {
        $response = Invoke-DmsCmsApi -Method Post -Uri "$cmsUrl/v3/vendors" -Token $cmsToken -Body @{
            company             = $vendorName
            contactName         = 'Local Developer'
            contactEmailAddress = 'developer@example.com'
            namespacePrefixes   = 'uri://ed-fi.org,uri://gbisd.edu,uri://tpdm.ed-fi.org'
        }
        $vendorId = [long](([string]$response.Headers.Location) -split '/')[-1]
    }

    $response = Invoke-DmsCmsApi -Method Post -Uri "$cmsUrl/v3/applications" -Token $cmsToken -Body @{
        vendorId                 = $vendorId
        applicationName          = $applicationName
        claimSetName             = 'EdFiSandbox'
        educationOrganizationIds = @(255901, 19255901)
        dataStoreIds             = @($dataStoreId)
    }
    $created = $response.Content | ConvertFrom-Json
    $credentials = [ordered]@{ key = $created.key; secret = $created.secret }
    $credentials | ConvertTo-Json | Set-Content -LiteralPath $credentialsFile
}

Write-Step 'Checking DMS end to end'
$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($credentials.key):$($credentials.secret)"))
$dmsToken = $null
$deadline = (Get-Date).AddSeconds(60)
while (-not $dmsToken -and (Get-Date) -lt $deadline) {
    # A just-created application can get 401 for a few seconds.
    $response = Invoke-WebRequest -Method Post -Uri "$dmsUrl/oauth/token" -SkipHttpErrorCheck `
        -Headers @{ Authorization = "Basic $basic" } -Body @{ grant_type = 'client_credentials' }
    if ($response.StatusCode -eq 200) {
        $dmsToken = ($response.Content | ConvertFrom-Json).access_token
    }
    else {
        Start-Sleep -Seconds 2
    }
}
if (-not $dmsToken) {
    throw "Could not get a token from $dmsUrl/oauth/token (last status $($response.StatusCode)). Check: docker logs adminapp-dms-api"
}

$response = Invoke-WebRequest -Uri "$dmsUrl/data/ed-fi/students" -SkipHttpErrorCheck -Headers @{ Authorization = "Bearer $dmsToken" }
if ($response.StatusCode -ne 200) {
    throw "GET /data/ed-fi/students returned $($response.StatusCode): $($response.Content)`nCheck: docker logs adminapp-dms-api"
}

Write-Host ''
Write-Host 'DMS is up and serving requests.' -ForegroundColor Green
Write-Host ''
Write-Host "  DMS API                $dmsUrl"
Write-Host "  Configuration Service  $cmsUrl"
Write-Host "  PostgreSQL             localhost:$($settings['POSTGRES_PORT']) (postgres / see .env)"
Write-Host ''
Write-Host '  DMS client application (token: POST /oauth/token, Basic auth)'
Write-Host "    key     $($credentials.key)"
Write-Host "    secret  $($credentials.secret)"
Write-Host ''
Write-Host '  Configuration Service admin client (token: POST /connect/token, scope edfi_admin_api/full_access)'
Write-Host "    client_id      $($settings['CMS_ADMIN_CLIENT_ID'])"
Write-Host "    client_secret  $($settings['CMS_ADMIN_CLIENT_SECRET'])"
Write-Host ''
Write-Host 'Stop with ./stop-dms.ps1 (add -v to delete all data).'

# Local DMS Environment

> [!WARNING]
> **Local development only.** The default secrets in `.env.example` are public.

A minimal [Ed-Fi Data Management Service (DMS)](https://github.com/Ed-Fi-Alliance-OSS/Data-Management-Service)
stack that runs from published images. It does not need a DMS checkout or a local .NET install,
and it is independent of the Admin App Docker setup in [`compose/`](../compose/readme.md).

| Container | What it is | Host URL |
|---|---|---|
| `adminapp-dms-api` | DMS (Ed-Fi API), `edfialliance/ed-fi-api` | <http://localhost:8090> |
| `adminapp-dms-config` | Configuration Service, with built-in (self-contained) OAuth | <http://localhost:8091> |
| `adminapp-dms-postgresql` | PostgreSQL 18, shared by both services | `localhost:5436` |

Ports are set in `.env`. The containers share the `dms-local` Docker network and the
`adminapp-dms` Compose project.

## Prerequisites

- Docker Desktop (running)
- PowerShell 7+
- Internet access the first time: Docker Hub, `mcr.microsoft.com` and the Ed-Fi Azure Artifacts feed

## Start and stop

```pwsh
./dms/start-dms.ps1             # start, set up anything missing, self-check
./dms/start-dms.ps1 -Update     # move to the newest "pre" build (resets data if DMS changed)
./dms/stop-dms.ps1              # stop, keep data
./dms/stop-dms.ps1 -v           # stop and delete all data
```

The first run takes a few minutes, mostly for image downloads. Later runs take about half a
minute. Running `start-dms.ps1` against a stack that is already running is safe.

The script ends by printing the URLs and two sets of credentials:

- **DMS client application**: a key and secret for `POST http://localhost:8090/oauth/token`
  (HTTP Basic auth, `grant_type=client_credentials`). The application uses the
  `EdFiSandbox` claim set and education organizations `255901` and `19255901`. The key and
  secret are saved in `dms/.credentials.json`.
- **Configuration Service admin client**: `CMS_ADMIN_CLIENT_ID` / `CMS_ADMIN_CLIENT_SECRET`
  from `.env`, for `POST http://localhost:8091/connect/token` with
  `scope=edfi_admin_api/full_access`.

Quick check:

```pwsh
$c = Get-Content ./dms/.credentials.json -Raw | ConvertFrom-Json
$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($c.key):$($c.secret)"))
$token = (Invoke-RestMethod -Method Post http://localhost:8090/oauth/token `
  -Headers @{ Authorization = "Basic $basic" } -Body @{ grant_type = 'client_credentials' }).access_token
Invoke-RestMethod http://localhost:8090/data/ed-fi/academicSubjectDescriptors -Headers @{ Authorization = "Bearer $token" }
```

## What `start-dms.ps1` does

The order matters. DMS does not create its own database schema, and if DMS starts before the
schema exists it answers every request with HTTP 503 until it is restarted.

1. **Versions.** On the first run, it pulls `DMS_IMAGE_TAG` (default `pre`) and pins the exact
   image digests in `.dms-versions.json`. The `api-schema-tools` version comes from the DMS
   image's version label. Later runs reuse the pin, so a moving `pre` tag never changes your
   environment by surprise. `-Update` re-resolves the tag.
2. **PostgreSQL**, then the **OpenIddict signing key**. The Configuration Service needs the key
   before it starts and never creates one itself.
3. **Configuration Service**, then the `CMSReadOnlyAccess` client DMS uses to read it.
4. **Data store** `Local Development Data Store`, registered through the Configuration Service API.
5. **Schema provisioning.** The ApiSchema files are copied out of the DMS image, so the schema
   always matches what DMS loads. `api-schema-tools ddl provision` then runs in a throwaway
   `mcr.microsoft.com/dotnet/sdk:10.0` container. The tool is cached in the
   `adminapp-dms-schema-tools` volume.
6. **DMS**, then a **self-check**. It creates a vendor and application if needed, gets a DMS
   token and expects `GET /data/ed-fi/students` to return 200.

The setup steps are trimmed ports of `eng/docker-compose` in the DMS repository:
`bootstrap-published-dms.ps1`, `setup-openiddict.ps1` and `provision-dms-schema.ps1`.

## Local files

All of these are git-ignored:

| File | Purpose | Removed by `stop-dms.ps1 -v` |
|---|---|---|
| `.env` | Your settings, copied from `.env.example` | no |
| `.dms-versions.json` | Pinned image digests and versions | no (only `-Update` changes it) |
| `.credentials.json` | DMS client application key and secret | yes |
| `.apischema/` | ApiSchema files extracted from the DMS image | yes |

To pin explicitly instead, set `DMS_IMAGE`, `CONFIGURATION_SERVICE_IMAGE` and/or
`SCHEMA_TOOLS_VERSION` in `.env`.

## Troubleshooting

- **"provisioned for a different DMS schema"**: the database was set up by another DMS version.
  Run `./dms/stop-dms.ps1 -v`, then start again.
- **"application exists but .credentials.json is missing"**: the secret can't be recovered.
  Run `./dms/stop-dms.ps1 -v`.
- **"The application in .credentials.json no longer exists"** (warning): the database was reset
  outside `stop-dms.ps1 -v`, for example by `docker system prune` or `compose/stop.ps1 -V`. The
  latter removes **every** Docker volume, including this stack's. The script creates a new
  application and saves its new credentials. To start from scratch on purpose, use
  `./dms/stop-dms.ps1 -v`.
- **A collection returns `[]` after a successful POST**: this is expected for student-related
  resources. `EdFiSandbox` filters them by relationship to the application's education
  organizations, so a student appears only once it is enrolled in one of them, for example through
  a `studentSchoolAssociation`.
- **Port already in use**: change `DMS_PORT`, `CONFIGURATION_SERVICE_PORT` or `POSTGRES_PORT` in `.env`.
- **Anything else**: `docker logs adminapp-dms-api` or `docker logs adminapp-dms-config`.

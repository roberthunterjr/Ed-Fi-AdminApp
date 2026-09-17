# Admin API Information/Tenancy Endpoint Changes — AdminApp Impact & Plan

> Updated to reflect what Admin API actually shipped, superseding the
> original version of this doc (which analyzed a `specificationVersion`
> format change that was ultimately **not** made).

## Summary of what changed in Admin API

1. **`specificationVersion` did NOT change format.** It's still exactly
   `"v1"` / `"v2"` / `"v3"` (`adminApiMode.ToString().ToLowerInvariant()` in
   `ReadInformation.cs`). The format-change concern this doc originally
   analyzed was resolved by *not* making that change — see "Resolved:
   `specificationVersion` mitigation is not needed" below.
2. **`version` is now a single shared value across V1/V2/V3** (e.g.
   `"2.4.0"`), sourced from one place (`ApiInformationHelper.Version`)
   instead of a different literal per mode. The shared value has no
   bearing on version *selection* logic, but AdminApp still depends on
   `version` being present: `validateAdminApiUrl()`
   (`packages/api/src/utils/api-metadata-utils.ts:280-285`) rejects the
   Admin API URL when the field is absent.
3. **The `tenancy` object was replaced by a `urls.tenancy` link.** The
   `{"tenancy": {"multitenantMode": ..., "tenants": [...]}}` block no
   longer appears in the Information response. In its place, `GET /` now
   returns a `urls` object holding the absolute URL of the new tenancy
   endpoint:

   ```json
   "urls": {
     "openApiMetadata": "https://host/swagger/2.4.0/swagger.json",
     "tenancy": "https://host/v2/tenancy"
   }
   ```

   For V1 the value is an empty string (`"tenancy": ""`) — V1 has no
   tenancy endpoint. This is the change that actually affects AdminApp —
   see below.

   AdminApp should **read the endpoint address from `urls.tenancy`** rather
   than constructing `/v{n}/tenancy` from the detected specification
   version. The link is authoritative and covers host/prefix differences
   the client cannot infer.

4. **New endpoints**: `GET /v2/tenancy` and `GET /v3/tenancy` (anonymous),
   returning `{"tenants": ["tenant1", "tenant2"]}` — tenant names only, no
   `multitenantMode` field. Tenant mode is now implied by the array:

   - `tenants: []` — Admin API is in single-tenant mode.
   - `tenants: ["…", …]` — Admin API is in multi-tenant mode.

5. **New validation**: `GET /v{2,3}/tenancy` returns **503** if the
   `MultiTenancy` flag is `true` but zero tenants are configured
   (previously this silently returned an empty tenant list). The 503 exists
   so that a misconfigured multi-tenant/single-tenant setup is reported
   instead of being silently reinterpreted as single-tenant, which keeps
   the "empty array means single-tenant" rule above trustworthy.

   The response body differs per specification version. V2 returns a bare
   message:

   ```json
   {
     "message": "MultiTenancy is enabled but no tenants are configured. Check the Tenants section of appsettings."
   }
   ```

   V3 returns problem details:

   ```json
   {
     "type": "urn:ed-fi:management-api:service-unavailable",
     "title": "Error",
     "status": 503,
     "detail": "MultiTenancy is enabled but no tenants are configured. Check the Tenants section of appsettings.",
     "correlationId": "0HNO9PVAK5HPV:00000005"
   }
   ```

6. **`urls.openApiMetadata` version segment now varies per mode**
   (`/swagger/1.4.4/…`, `/swagger/2.4.0/…`, `/swagger/3.0.0/…`). Nothing in
   AdminApp reads this field, so no action is required — recorded here only
   so it does not need to be re-investigated.

## Scope: V1 is unchanged

V1 behavior stays exactly as it works today. When the detected
`specificationVersion` is `v1`, AdminApp makes no tenancy call and keeps
its current tenant-mode handling (ODS API URL-pattern inference). The
practical rule for the code: **if `urls.tenancy` is missing or an empty
string, skip the tenancy call and fall back**, which naturally covers both
V1 and any older Admin API build that predates the `urls` block.

## Resolved: `specificationVersion` mitigation is not needed

The original "Open questions" section asked whether Admin API's format
change was worth making at all, since its only stated motivation (removing
a hardcoded `"v1"/"v2"/"v3"` literal in `ReadInformation.cs`) could be met
without touching the wire format. That's exactly what happened:
`specificationVersion` is now derived from `AdminApiVersions`
(`.ToString()` gives `"v1"/"v2"/"v3"` via `AdminApiMode.ToString()`
directly) rather than a hardcoded literal — same wire value, cleaner
source internally. **No AdminApp-side normalization is needed.** The
`normalizeSpecificationVersion()` plan from the original version of this
doc should not be implemented — there is nothing to normalize.

## New: `tenancy` removal breaks explicit tenant-mode detection

`packages/api/src/utils/api-metadata-utils.ts` — `getAdminApiTenantMode()`:

```ts
export const getAdminApiTenantMode = (
  adminApiInfo?: { tenancy?: { multitenantMode?: boolean } }
): 'MultiTenant' | 'SingleTenant' | undefined => {
  if (adminApiInfo?.tenancy?.multitenantMode !== undefined) {
    return adminApiInfo.tenancy.multitenantMode ? 'MultiTenant' : 'SingleTenant';
  }
  return undefined;
};
```

`adminApiInfo.tenancy` is now always `undefined` (the field doesn't exist
in the response anymore), so `adminApiInfo?.tenancy?.multitenantMode` is
always `undefined`, and this function always returns `undefined`.

**This is not a hard failure** — `determineTenantModeFromMetadata()`
(the only caller) is written with exactly this fallback in mind:

```ts
export const determineTenantModeFromMetadata = (
  odsApiMeta: OdsApiMeta,
  adminApiInfo?: { tenancy?: { multitenantMode?: boolean } }
): 'MultiTenant' | 'SingleTenant' => {
  const adminMode = getAdminApiTenantMode(adminApiInfo);
  if (adminMode !== undefined) {
    return adminMode;
  }
  return determineTenantModeFromOdsMetadata(odsApiMeta);
};
```

So tenant-mode detection silently falls back to ODS API URL-pattern
inference (checking for `tenantIdentifier` in the ODS discovery URL) on
every call now, instead of using Admin API's explicit signal. Functionally
this likely still produces the correct mode in practice (the ODS-side
inference is independent and was already the fallback path), but:

- The "priority 1: use Admin API's explicit field" code path is now dead
  in practice — it will never fire again until this is addressed.
- Any future case where ODS URL-pattern inference and Admin API's actual
  configuration diverge (e.g. an ODS API not yet following the
  `tenantIdentifier` URL convention) will silently pick the wrong mode
  with no error, since the explicit signal that used to catch this is gone.
- `validateAdminApiUrl()`'s tenant-mode compatibility check
  (`Only validate compatibility if Admin API explicitly defines
  multitenantMode`) is now **always skipped** — it logs "Admin API does
  not provide multitenantMode field, skipping tenant mode compatibility
  check" on every request, permanently, since that field can never be
  present again.

## More severe: multi-tenant bootstrap now provisions the single-tenant shape

Tenant-*mode* detection degrades gracefully. Tenant-*name* discovery does
not. `bootstrapCredentials()` in
`packages/api/src/admin-api-version-strategy/v2-admin-api-version.strategy.ts:147`
branches on the stored environment mode, then reads the tenant list off
`GET /` for multi-tenant environments:

```ts
const isMultiTenant = config?.meta?.mode === 'MultiTenant';

if (isMultiTenant) {
  const rootResponse = await rootClient
    .get<{ tenancy?: { multitenantMode?: boolean; tenants?: string[] } }>('/')
    .then((r) => r.data);

  if (
    rootResponse?.tenancy?.multitenantMode === true &&
    Array.isArray(rootResponse.tenancy.tenants) &&
    rootResponse.tenancy.tenants.length > 0
  ) {
    tenantNames = rootResponse.tenancy.tenants;
  } else {
    tenantNames = ['default'];   // inner fallback — now always taken
  }
} else {
  tenantNames = ['default'];     // single-tenant workflow — correct, keep as is
}
```

`['default']` appears twice and means two different things. The outer
`else` (line 172) is the **intended single-tenant workflow**: a
single-tenant Admin API is represented as one tenant named `default`, and
`registerCredentials()` receives `isMultiTenant: false` alongside it. That
path is correct and must be preserved unchanged.

The problem is the *inner* fallback (line 164), which lives inside the
multi-tenant branch. Its guard reads `rootResponse.tenancy`, which no
longer exists, so it can never be satisfied — every multi-tenant
environment now takes it. Bootstrap therefore registers and stores Admin
API credentials for a tenant named `default` under a multi-tenant target
where no such tenant exists, and the real tenants get no credentials at
all. The single-tenant tenant name is being applied to a multi-tenant
environment. Unlike the tenant-mode fallback, this produces a wrong
result rather than the same answer by another route, and it does so
silently — the log line says only "root endpoint did not return tenant
list, falling back to default".

The identical pattern exists in `getTenants()` on both Admin API services —
`admin-api.v2.service.ts:1385` and `admin-api.v3.service.ts:889` — and
that is the more consequential one, because `getTenants()` is the primary
tenant-discovery path, called on every sync from
`packages/api/src/sb-sync/edfi/adminapi-sync.service.ts:212`. Bootstrap
only runs for brand-new environments; `getTenants()` runs every time.
Both now resolve every multi-tenant environment to `['default']` and log
"Single-tenant mode detected, using default tenant".

One simplification applies to these two: they currently make the root call
*authenticated*, logging in first to obtain an environment-level bearer
token (`admin-api.v3.service.ts:858-884`). The tenancy endpoint is
anonymous, so tenant discovery no longer needs a token at all.

## Call sites to update

| Location | What it reads | Effect today |
| --- | --- | --- |
| `packages/api/src/utils/api-metadata-utils.ts:14` | `AdminApiInfo.tenancy` type | Models a shape that no longer exists |
| `packages/api/src/utils/api-metadata-utils.ts:84` | `adminApiInfo.tenancy.multitenantMode` | Always `undefined`; function always returns `undefined` |
| `packages/api/src/utils/api-metadata-utils.ts:261` | `getAdminApiTenantMode(metadata)` | Compatibility check permanently skipped |
| `packages/api/src/sb-environments-global/sb-environments-global.controller.ts:224` | inline `adminApiInfo?.tenancy?.multitenantMode` | Compatibility check permanently skipped |
| `packages/api/src/sb-environments-global/sb-environments-edfi.services.ts:189` | inline `adminApiInfo?.tenancy?.multitenantMode` | Compatibility check permanently skipped |
| `packages/api/src/admin-api-version-strategy/v2-admin-api-version.strategy.ts:157` | `tenancy.tenants` for multi-tenant bootstrap | **Guard never satisfied; multi-tenant environments provisioned as `['default']`** (the outer single-tenant `['default']` at line 172 is correct and stays) |
| `packages/api/src/teams/edfi-tenants/starting-blocks/v2/admin-api.v2.service.ts:1385` | `tenancy.tenants` in `getTenants()` | **Every sync discovers `['default']` for multi-tenant environments** |
| `packages/api/src/teams/edfi-tenants/starting-blocks/v3/admin-api.v3.service.ts:889` | `tenancy.tenants` in `getTenants()` | **Every sync discovers `['default']` for multi-tenant environments** |
| `packages/api/src/teams/edfi-tenants/starting-blocks/v2/admin-api.v2.service.ts:85` | `TenancyResponse` interface | Stale type describing the removed shape |
| `packages/api/src/teams/edfi-tenants/starting-blocks/v3/admin-api.v3.service.ts:54` | `TenancyResponse` interface | Stale type describing the removed shape |

## Proposed plan

1. **Resolve the tenancy endpoint from `urls.tenancy`** on the `GET /`
   response rather than constructing the path. If the field is missing or
   empty — V1, or an older Admin API — skip the tenancy call entirely and
   keep today's behavior. It's anonymous, same as `GET /`, so no new auth
   plumbing is needed.
2. **Derive tenant mode from the tenant array**, since `multitenantMode` is
   no longer provided: a non-empty `tenants` array means multi-tenant, an
   empty array means single-tenant. The 503 validation is what makes this
   safe — a multi-tenant Admin API with no configured tenants fails the
   call instead of returning `[]`, so an empty array from a *successful*
   call reliably means single-tenant rather than "misconfigured".
3. **Put both of the above in one shared helper**, so the tenancy fetch,
   the mode derivation, and the 503 handling exist in exactly one place.
   The helper resolves `urls.tenancy`, returns the tenant list on success,
   and on a 503 throws a typed error carrying Admin API's own text —
   `detail ?? message`, covering the V3 problem-details body and the V2
   bare-message body. Each caller then translates that one error into its
   own idiom rather than re-implementing the parsing. See "Handling the 503
   in each context" below.
4. **Update `getAdminApiTenantMode()` / `determineTenantModeFromMetadata()`**
   to take the tenancy response (or a derived mode) instead of the old
   `adminApiInfo.tenancy` shape, restoring the "explicit Admin API signal
   takes priority over ODS URL inference" behavior the code was originally
   written to have, and update the two inline `multitenantMode` checks in
   `sb-environments-global.controller.ts` and `sb-environments-edfi.services.ts`
   to go through it rather than reading the removed field directly.
5. **Fix `getTenants()` on both Admin API services** — the primary
   tenant-discovery path, and the highest-impact fix. Source tenant names
   from the tenancy endpoint instead of `tenancyResponse.tenancy`, and drop
   the now-unused `TenancyResponse` interface from both files. The tenancy
   endpoint is anonymous, so the bearer-token login that currently precedes
   the root call is no longer needed for discovery. As in bootstrap, the
   `['default']` single-tenant branch stays valid — it must be reached
   because tenancy returned `[]`, never because a call failed.
6. **Fix multi-tenant bootstrap discovery** in
   `v2-admin-api-version.strategy.ts`: source tenant names from the tenancy
   endpoint instead of `rootResponse.tenancy`. The
   single-tenant workflow — outer `else`, `tenantNames = ['default']`,
   `registerCredentials(..., false)` — stays exactly as it is. Only the
   multi-tenant branch changes. Inside it, `['default']` must stop being
   the fallback: a multi-tenant environment whose tenant list cannot be
   retrieved should fail bootstrap the way an unreachable root already does
   (log and return), because provisioning `default` on a multi-tenant
   target writes credentials for a tenant that does not exist.
7. **Update tests** that mock the removed shape. Both
   `packages/api/src/utils/api-metadata-utils.spec.ts` (the
   `getAdminApiTenantMode` / `determineTenantModeFromMetadata` suites and
   `makeAdminMeta`) and
   `packages/api/src/admin-api-version-strategy/v2-admin-api-version.strategy.spec.ts:151,223`
   currently mock `tenancy: { multitenantMode, tenants }`. That shape can
   no longer occur, so those tests pass while the code paths they cover are
   broken in production. Replace them with mocks of `urls.tenancy` plus the
   tenancy endpoint call, and add coverage for the empty-`urls.tenancy`
   skip path and the 503 response.

## The shared tenancy helper

All tenancy access goes through one helper so that the endpoint
resolution, the mode derivation, and the failure classification exist in a
single place. Its contract:

- **Input**: the Admin API `GET /` response (or the environment, from
  which it fetches `GET /`).
- **`urls.tenancy` missing or empty** — return "not supported", no HTTP
  call. Covers V1 and any Admin API build predating the `urls` block.
  Callers fall back to today's behavior.
- **200** — return the tenant list. A non-empty array means multi-tenant;
  `[]` means single-tenant.
- **Any error** — throw a typed error carrying the parsed message
  (`detail ?? message`, covering the V3 problem-details body and the V2
  bare-message body) plus a classification the caller can branch on.

**Invariant: no error status may ever be interpreted as single-tenant.**
Only a successful response with `tenants: []` means single-tenant.
Without this rule a transient fault would silently downgrade a
multi-tenant environment to single-tenant and mis-provision it.

### Failure classification

The parsing is shared across statuses; the *policy* is not, because the
statuses carry different amounts of usable information.

| Condition | Classification | Message shown |
| --- | --- | --- |
| 503 with a parsable body | Misconfigured Admin API | Admin API's own text, verbatim — it names the appsettings fix |
| 500, or any 5xx with no parsable body | Tenancy unavailable | Neutral text ("could not determine tenancy for this Admin API"); the raw response is logged, not displayed |
| 404 | Not supported | None — treated like an empty `urls.tenancy`: skip and fall back |
| 401 / 403 | Tenancy unavailable | As above; the endpoint is anonymous, so this indicates a proxy or gateway, not an auth requirement |

Two details behind the table. A 500's text is generally not actionable and
may expose server internals, so it must not be surfaced the way the 503
text is — the blocking behavior is identical, only the wording differs,
and it must not claim the appsettings cause. And a bare 503 from a reverse
proxy or a stopped container carries no JSON body and is *not* the
misconfiguration case, which is why the first row keys off a parsable body
rather than the status alone.

## Handling the 503 in each context

Two contexts call the helper, and each already has an established way to
report a setup failure. The helper's typed error is translated into that
existing idiom rather than introducing a third mechanism.

**Validation** — `validateAdminApiUrl()` in `api-metadata-utils.ts`, plus
the environment-creation paths in `sb-environments-global.controller.ts`
and `sb-environments-edfi.services.ts`. These already throw
`ValidationHttpException` for tenant-mode incompatibility, so a
misconfigured-Admin-API error becomes another `ValidationHttpException`
carrying the helper's message. The operator sees it while entering the
Admin API URL, which is the earliest useful moment.

**Sync and bootstrap** — `bootstrapCredentials()` in
`v2-admin-api-version.strategy.ts`, called from
`packages/api/src/sb-sync/edfi/adminapi-sync.service.ts:205`. That method
already returns structured outcomes for setup failures
(`NO_ADMIN_API_CONFIG` at line 183, `INVALID_VERSION` at line 195), so the
error becomes one more of those, e.g.
`{ status: 'ADMIN_API_MISCONFIGURED', message }`, and sync stops before
`getTenants()`. This rides the existing status contract into the sync
queue and the environment's sync state; no new plumbing is required.

`bootstrapCredentials()` currently returns `Promise<void>`
(`admin-api-version-strategy.interface.ts:65`). Having it throw and
letting `adminapi-sync.service.ts` map the error to a status is the
smaller change and leaves the strategy interface unchanged.

Why block rather than warn: today bootstrap's failure path logs and
returns (`v2-admin-api-version.strategy.ts:168-171`), so sync proceeds and
fails later at `getTenants()` with an auth error that does not name the
real cause. Blocking with Admin API's own message points the operator
straight at the fix. It also matters for scheduled resyncs — a
log-only failure repeats on every run with nobody watching, whereas the
status return lands on the environment's sync state as a persistent,
actionable failure instead of an environment that quietly never syncs.

## Open questions

- **Resolved**: the tenancy endpoint is called **on demand only** — from
  the paths that actually need tenant mode or tenant names
  (`validateAdminApiUrl()`, the two environment-creation paths,
  `getTenants()`, and `bootstrapCredentials()`). `fetchAdminApiInfo()` is
  not changed to fetch tenancy alongside `GET /`, so metadata fetches that
  never look at tenancy pay no extra round trip and cannot fail on a 503
  they don't care about.
- **Resolved**: whether the 503 should block or warn. It blocks, in both
  contexts, via each context's existing failure mechanism — see "Handling
  the 503 in each context" above.

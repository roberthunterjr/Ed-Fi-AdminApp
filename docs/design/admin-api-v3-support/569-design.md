# AC-569 ApiClient Management V3 — Design

## Context

[AC-569](https://edfi.atlassian.net/browse/AC-569) ("Admin App can manage
ApiClients - V3", under epic [AC-522](https://edfi.atlassian.net/browse/AC-522))
has two deliverables:

1. **V3 support** for the ApiClient (Credentials) pages — list, view, create,
   edit, delete, and reset-credentials.
2. **Remove the `Status` field** from the list and detail pages, for **both v2
   and v3**. Sourced from a team Slack decision; the field isn't useful to
   users. The AC notes: *"By reusing the same pages for v2 and v3 the 'fix' is
   in a single place."*

Deliverable 2 makes this ticket different from AC-527/568/530/585, where V2
behavior was strictly out of scope. Here a V2-affecting change is the explicit
requirement.

## Verified findings

All checked against the running local stack and the current source, not assumed.

### The V3 backend already exists — but with inconsistent route casing

`AdminApiControllerV3` already has all six ApiClient endpoints and
`AdminApiServiceV3` all six matching methods. No new endpoints are needed.

However the V3 module spells the resource **`apiclients`** (all lowercase) in
two places, while V2 uses **`apiClients`** (camelCase):

| Surface | V2 | V3 |
|---|---|---|
| Controller route decorators (inbound, 6 sites) | `apiClients` | `apiclients` |
| Service upstream URLs (outbound, 5 sites) | `apiClients` | `apiclients` |

The upstream Admin API V3 declares the paths as **`/v3/apiClients`** in its own
swagger (confirmed live: `['/v3/apiClients', '/v3/apiClients/{id}',
'/v3/apiClients/{id}/reset-credential']`), matching the rename the Ed-Fi team
made for consistency.

Both casings currently resolve upstream — ASP.NET Core routing is
case-insensitive by default, and `GET /v3/apiClients?…&applicationId=1`
returned **200** while the lowercase form returned the same 400
("missing applicationId") rather than a 404. So **this is a consistency
alignment, not an outage fix.** The same holds for our own BFF: no
`case sensitive routing` override exists in `packages/api`, so the FE's
camelCase requests currently match the lowercase V3 routes.

Aligning both surfaces to `apiClients` matches V2, matches upstream's declared
contract, and removes the trap if either side ever enables case-sensitive
routing.

### DTO divergence is exactly one field

`Get/Post/PutApiClientDtoV3` already exist and are correct. They differ from
their V2 counterparts in exactly one field name:

| | V2 | V3 |
|---|---|---|
| Wire DTOs (`Get`/`Post`/`Put`) | `odsInstanceIds: number[]` | `dataStoreIds: number[]` |
| Form DTOs (`PostForm`/`PutForm`) | `odsInstanceId: number` | `dataStoreId: number` |

`keyStatus: string` is present in **both** Get DTOs and is unchanged.

The V3 controller does **not** normalize `dataStoreIds` back to
`odsInstanceIds` — `getApiClients`/`getApiClient` return the service result
unmodified — so the rename genuinely reaches the frontend. (A `dataStoreId` →
`odsInstanceId` mapping does appear at
`admin-api.v3.controller.ts:363`, but that is an *inbound* mapping: it queries
the local `edorg` table by its own column name using the V3 request's field. It
is not a response normalization.)

### `SelectOds` and the submitted id are already correct for V3

Both forms render `<SelectOds useInstanceId …>`, so they submit the local ODS
record's `odsInstanceId`, not its local `id`. `SelectOds` reads
`odsQueries.getAll` — the **local, version-agnostic** BFF query established by
[AC-529](./529-design.md) — so the control itself needs no change.

The open question was whether that local column holds the *V3 data store id*.
**Verified: it does.** `sync-ods.ts:88` writes `odsInstanceId: sbOds.id`, and
comparing the running AdminApp database against the live V3 tenant:

| local `ods` row | `odsInstanceId` | name | upstream V3 `dataStores` |
|---|---|---|---|
| 7 | 1 | tenant1 ODS | id=1 "tenant1 ODS" (ODS) |
| 8 | 2 | Demo DS | id=2 "Demo DS" (Sample) |

So V3 forms will submit the correct data store id. No change required, and no
residual risk here.

### `Status` renders in three places, not two

The AC says "the list page and the details page", but `keyStatus` is displayed
at three sites:

| File | What |
|---|---|
| `ApiClientsPage.tsx:72-73` | list column, `accessorKey: 'keyStatus'`, `header: 'Status'` |
| `ViewApiClient.tsx:64-65` | detail page `AttributeContainer label="Status"` |
| `EditApiClient.tsx:112-113` | Edit form, read-only `<Text>{apiClient.keyStatus}</Text>` |

**Decision: remove all three.** Leaving it on the Edit form — a page users
reach constantly — would read as an oversight rather than a decision.

### Three user-visible "ODS" labels

`CreateApiClientPage.tsx:124`, `EditApiClient.tsx:97`, and
`ViewApiClient.tsx:47` label the field "ODS". AC-529 established
`useOdsTerminology()`, which returns `"Data Store"` for v3 tenants. Without
wiring these up, a V3 tenant sees "ODS" here while the ODS pages themselves say
"Data Store".

## Approach

### 1. Backend (`packages/api`) — casing rename only

Rename `apiclients` → `apiClients` in:

- `admin-api.v3.controller.ts` — 6 route decorators (`@Get`, `@Get(':id')`,
  `@Put(':id')`, `@Post`, `@Put(':id/reset-credential')`, `@Delete(':id')`).
- `admin-api.v3.service.ts` — 5 upstream URL template strings.

No endpoint, signature, or behavior change. Existing V3 controller/service
specs that assert on these paths are updated to the new casing.

### 2. Models (`packages/models`) — a shared form base, no wire changes

**Wire DTOs: unchanged.** `Get/Post/PutApiClientDtoV3` are already correct.

**`keyStatus` stays on the Get DTOs.** The API returns it; removing it from the
wire model would be a change with no benefit. It arrives on the instance because
it is declared `@Expose()` on both Get DTOs — **not** because extraneous values
are tolerated. Serialization is `excludeExtraneousValues: true` on both hops
(`makeSerializer` in `packages/models/src/utils/make-serializer.ts`, and the
global `ClassSerializerInterceptor` in `packages/api/src/main.ts`), so any wire
field without a matching `@Expose()` is **silently dropped**. Only `keyStatus`'s
*display* is removed here.

> This is not a footnote. That exact mechanism is what hid the `key`/`clientId`
> bug fixed in this ticket: Admin API V3 returns the credential as `clientId` on
> `GET /v3/apiClients` but as `key` on `POST`, and because `GetApiClientDtoV3`
> declared only `key`, `excludeExtraneousValues` dropped it on every list/get
> with no error. When adding or reviewing a V3 DTO, verify each property name
> against the actual wire payload — a mismatch fails silently, not loudly.

**New shared form base**, following the pattern
`PostApplicationFormBase` already establishes in the same file. Add to
`edfi-admin-api.dto.ts` (the established home for version-agnostic classes —
it already holds `PostVendorDto`, `PostApplicationFormBase`,
`PostApiClientResponseDtoBase`):

```ts
export class PostApiClientFormBase {
  @Expose()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  name: string;

  @Expose()
  @IsBoolean()
  isApproved: boolean;

  @Expose()
  @IsNumber()
  applicationId: number;
}
```

Then reshape the four existing form DTOs to extend it, keeping each version's
own field name — mirroring `PostApplicationFormDtoV2/V3`:

```ts
// edfi-admin-api.v2.dto.ts
export class PostApiClientFormDtoV2 extends PostApiClientFormBase {
  @Expose()
  @IsNumber()
  odsInstanceId: number;
}
export class PutApiClientFormDtoV2 extends PostApiClientFormDtoV2 {
  @Expose()
  @IsNumber()
  id: number;
}

// edfi-admin-api.v3.dto.ts — identical, with dataStoreId
```

This keeps AC-524's "every DTO has a V3 twin" convention intact while removing
the triplicated common fields.

**Two traps to avoid here:**

- The current `PutApiClientFormDtoV2`/`V3` are **standalone**, not extending
  Post. Reshaping them to `extends Post…` must preserve the exact same field
  set: `name`, `isApproved`, `applicationId`, `odsInstanceId`/`dataStoreId`,
  `id`. Field *order* changes, which is irrelevant to validation.
- `PutApplicationFormDtoV2` declares its `id` with **no decorators**. Do **not**
  copy that: ApiClient's current `id` carries `@Expose() @IsNumber()`, and
  dropping those would silently remove both validation and class-transformer
  exposure.

### 3. FE API layer — add `apiClientQueriesV3`

`queries.v7.ts` has only `apiClientQueriesV2`. Add `apiClientQueriesV3`
mirroring it with the V3 DTOs, covering all members the pages use: `getAll`
(with its `applicationId` query-string builder), `getOne`, `post`, `put`,
`resetCreds`, and `delete`. `EntityQueryBuilder` already resolves
`admin-api/${edfiTenant.sbEnvironment.version}/`, so no path plumbing is needed.

### 4. FE pages — `ApiClientV2Plus`, following the Application pattern

Rename `Pages/ApiClientV2` → `Pages/ApiClientV2Plus`. There is no V1 ApiClient
page and no `v1` route branch, so the "V2Plus" name is accurate per the naming
rule in [529-design.md](./529-design.md).

Add two files, mirroring `ApplicationV2Plus`:

- **`apiClientConfig.ts`** — `useApiClientConfig` via `createVersionedResource`,
  a discriminated union carrying `version`, `queries`, and the per-branch DTO
  classes (`PostDto`, `PutDto`, `PostFormDto`, `PutFormDto`).
- **`apiClientEntity.ts`** — an `ApiClientEntity` union type plus
  `getDataStoreIds(apiClient)`, probing `'odsInstanceIds' in apiClient`. Split
  into its own file for the same reason `applicationEntity.ts` was: specs that
  mock the config wholesale can still import the real helper without dragging in
  the query-builder chain.

**Read sites** (2) use the helper: `ViewApiClient.tsx:48-49` (display) and
`EditApiClient.tsx:54` (form default `odsInstanceIds[0]`).

**Write sites / forms** use the `odsFieldName` pattern established by
`ApplicationV2Plus/CreateApplicationPage.tsx`, which solves this identical
field-name divergence. `CreateApiClientPage` and `EditApiClient` each:

1. Dispatch via `useApiClientConfig.match({ v2, v3 })` into a generic inner
   form, passing the diverging field's name as a typed prop:

   ```tsx
   v2: (cfg) => <CreateApiClientForm<PostApiClientFormDtoV2> config={cfg} odsFieldName="odsInstanceId" />,
   v3: (cfg) => <CreateApiClientForm<PostApiClientFormDtoV3> config={cfg} odsFieldName="dataStoreId" />,
   ```

   with `odsFieldName: 'odsInstanceId' | 'dataStoreId'` on the props.

2. Use the standard intersection-typed `field()` / `errorMessage()` accessors
   for the shared fields, plus two scoped accessors for the diverging one:

   ```ts
   const odsField = () => props.odsFieldName as Path<D>;
   const odsErrorMessage = (): string | undefined =>
     (errors as Record<string, { message?: unknown } | undefined>)[props.odsFieldName]
       ?.message as string | undefined;
   ```

   `field()`/`errorMessage()` **cannot** cover the diverging field: their
   parameter type is `keyof V2 & keyof V3` (the intersection), which excludes a
   renamed field. That is exactly why the scoped accessor exists.

3. Build the wire payload from the branch's own DTO class and key —
   `odsInstanceIds: [data.odsInstanceId]` for v2, `dataStoreIds: [data.dataStoreId]`
   for v3 — which the `.match()` generic keeps type-correct per branch.

**Deliberately not chosen:** collapsing the two form DTOs into one shared class.
It would remove the divergence at the cost of breaking AC-524's versioned-DTO
convention, and the `odsFieldName` prop makes the versioned approach cheap
(one prop plus two 3-line accessors, not the ~10 scattered casts a naive
per-branch approach would need).

### 5. Remove `Status` (both versions)

Delete the three display sites listed above. Because the pages are shared
across v2 and v3, this satisfies the AC's "fix in a single place" for both
versions at once. No DTO change.

### 6. Version-aware "ODS" labels

Wire the three labels to `useOdsTerminology()` so v3 tenants read "Data Store".
`CreateApplicationForm` already calls this hook, so a shared form consuming it
is precedented.

**The hook moves to `helpers/` as part of this ticket.** It currently lives in
`Pages/Ods/`, and ApiClient would be its *third* consumer area — the Ods pages,
ApplicationV2Plus (four components), and now ApiClientV2Plus. A cross-feature
hook reached via `../Ods/…` from two unrelated page folders is the wrong shape;
`helpers/` is where shared hooks live.

Move both files:

- `Pages/Ods/useOdsTerminology.ts` → `helpers/useOdsTerminology.ts`
- `Pages/Ods/useOdsTerminology.spec.ts` → `helpers/useOdsTerminology.spec.ts`

**Blast radius: 14 existing files** — 10 source importers and 4 spec files whose
`jest.mock` path strings reference it:

| Area | Files |
|---|---|
| `Pages/Ods/` | `OdssPage.tsx`, `OdsPage.tsx`, `CreateOdsPage.tsx`, `useOdsActions.tsx`, `useOdssActions.tsx` |
| `Pages/ApplicationV2Plus/` | `ApplicationsPage.tsx`, `CreateApplicationPage.tsx`, `EditApplication.tsx`, `ViewApplication.tsx` |
| `routes/` | `ods.routes.tsx` |
| spec mock paths | `ApplicationsPage.spec.tsx`, `CreateApplicationPage.spec.tsx`, `EditApplication.spec.tsx`, `ViewApplication.spec.tsx` |

This touches V2 code paths in ApplicationV2Plus and Pages/Ods. That is accepted:
the change is import-path-only, with no behavioral effect on either version.

Three specifics that make the move safe:

1. **The hook must stop importing its own barrel.** It currently does
   `import { useTeamEdfiTenantNavContextLoaded } from '../../helpers'`. Once the
   file lives *inside* `helpers/`, that becomes a self-referential barrel import.
   Change it to the direct module: `from './navContext'` (which is what
   `helpers/index.tsx` re-exports it from).
2. **Add it to `helpers/index.tsx`** alongside the other twelve exports, and let
   consumers import it from `'../../helpers'` like every other helper. This adds
   no new circular-import exposure: `helpers/index.tsx` does participate in the
   known cycle (it re-exports `./useNavToParent`, which imports `'../routes'` —
   the same edge behind the `claimsetConfig` bug, see
   [admin-api-v3-support/README.md](./README.md)), but every one of the 14
   affected files **already** imports from that barrel for other helpers, so the
   module graph is unchanged.
3. **The 4 `jest.mock('../Ods/useOdsTerminology', …)` path strings are not
   compiler-checked.** A missed one fails loudly rather than silently — Jest
   throws "Cannot find module" for a mock path that no longer resolves — so the
   test suite is the safety net here, not `tsc`.

Because the circular-init class of bug only manifests in the Rollup production
bundle, this move must be verified with `npm run build:fe` (production config),
not just the dev server and unit tests.

### 7. Routing

`apiClients.routes.tsx` gates all five routes with `VersioningHoc v2={…}` and no
`v3`. Add `v3` branches pointing at the same (now version-aware) components:
create, index, detail, breadcrumb, and list. No new paths.

The reset-credentials hook (`useResetIntegrationApiClientCredentials`) wraps
`apiClientQueriesV2.resetCreds`; it is repointed at the config's queries so it
resolves per version.

## Testing plan

- **Models:** specs asserting each reshaped form DTO still validates the same
  field set (a 3-char-minimum `name`, required `isApproved`/`applicationId`, the
  version's own ods/dataStore field, and `id` on the Put variants) — these guard
  the inheritance refactor, whose main risk is silently dropping a field or a
  decorator. Include a case proving `id` on the Put DTOs is still
  `@Expose()`d and `@IsNumber()`-validated.
- **FE query wiring:** a spec asserting `apiClientQueriesV3`'s members build
  `admin-api/v3/…/apiClients…` paths with the V3 request DTOs — a mis-wired
  builder reusing a V2 DTO would otherwise typecheck and pass everything else.
- **Config:** an unmocked `apiClientConfig.spec.ts` asserting the real
  version→queries/DTO mapping, following `profileConfig.spec.ts`. Every
  per-page spec mocks the config, so without this a mis-keyed branch would pass
  everything.
- **Forms:** specs asserting each branch submits the correct payload key —
  v2 → `odsInstanceIds`, v3 → `dataStoreIds` — which is the single most
  breakable part of this change.
- **Status removal:** specs asserting no "Status" column/attribute renders on
  the list and detail pages for **either** version.
- **Labels:** a spec asserting the field label reads "Data Store" for v3 and
  "ODS" for v2.
- **Backend:** update the existing V3 controller/service specs to the new
  `apiClients` casing; they should fail against the old lowercase paths.
- **`useOdsTerminology` move:** its relocated spec must pass unchanged (the
  hook's behavior does not change), and the full `test:fe` suite must pass —
  that is what catches a stale `jest.mock` path. Additionally `npm run build:fe`
  must be clean under the production config, since a circular-initialization
  regression from the new `helpers/` placement would only surface in the Rollup
  bundle.
- **Manual:** on a V3 tenant, create → view → edit → reset credentials →
  delete an ApiClient, confirming the created client is bound to the selected
  data store. Then the same on a V2 tenant to confirm no regression, plus
  confirming Status is gone from both.

## Scope summary

**In scope:** V3 support for ApiClient list/view/create/edit/delete/reset;
the `apiclients` → `apiClients` casing alignment in the V3 BFF; a shared
`PostApiClientFormBase` with versioned subclasses; `apiClientQueriesV3`;
`ApiClientV2Plus` with config + entity helper + the `odsFieldName` form pattern;
removal of `Status` from three sites for both versions; version-aware "ODS"
labels; moving `useOdsTerminology()` (and its spec) from `Pages/Ods/` to
`helpers/`, updating its 14 dependents; `v3` route branches.

**Out of scope:** any change to the ApiClient wire DTOs or to `keyStatus`
itself; V1 (no V1 ApiClient page exists); any *behavioral* change to the Ods or
Application pages (the `useOdsTerminology` move is import-paths only); the
`admin-api/v2`-hardcoded URLs in
`api-v2/useGetManyApplications.ts` and `useGetOneApplication.ts` (Application's
concern, not ApiClient's).

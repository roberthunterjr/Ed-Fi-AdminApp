# Server-Side Sorting & Pagination Design

Date: 2026-09-14

Branch base: **AC-618** (TypeORM 0.3.31 → 1.1.0 bump, not yet merged to
`main`).

## Background

`docs/design/admin-app-sorting-pagination-analysis.md` found that every
Admin App list table except SbSyncQueue fetches its full dataset and sorts
/paginates client-side via TanStack Table, and that Admin App's own
controllers expose no `offset`/`limit`/`orderBy`/`direction` query params.
This document designs the fix.

## Scope

Two resource groups, each requiring a different backend approach. Frontend
work (a new server-side table wrapper) is shared by both groups.

### Group A — Admin-API-proxied resources

Vendors, Applications, ApiClients, Claimsets, Profiles, DataStores/Odss,
ResourceClaims. Admin App's `admin-api.v1/v2/v3.controller.ts` proxy these to
the real upstream Admin API, then filter the result in app code with
`checkId(id, validIds)`.

Constraints (verified against `ODS-Admin-API`, the reference
Admin API 2.3 source):

- **v1**: upstream only supports `offset`/`limit` (`CommonQueryParams`),
  sorting is hardcoded server-side and ignores `orderBy`/`direction`
  entirely (verified in `ReadVendor.cs`/`GetVendorsQuery.cs` for v1 vs
  v2/v3).
- **v2/v3**: upstream supports the full `offset`/`limit`/`orderBy`/
  `direction` set plus per-resource named filters.
- Filtering by `validIds` happens **after** the upstream HTTP call, in app
  code (`checkId`, `where-ids.ts:18-24`). `validIds` is either `true`
  (unrestricted access — the common case) or a `Set` of allowed IDs (scoped
  access). Real server-side pagination against the upstream API is only
  numerically correct when `validIds === true`; for scoped users, an
  upstream page could yield fewer rows after filtering.

Decisions already made with the user:

- **v1-backed pages stay exactly as they are today** (client-side
  `SbaaTableProvider`, unchanged). Only v2/v3-backed Group A pages migrate
  to server-side sort/pagination.
- **Scoped users (`validIds !== true`) fall back to today's client-side
  behavior** on a per-request basis, even on v2/v3. Only unrestricted users
  get real server-side pagination for Group A resources.

### Group B — Admin App-native resources

Roles, Users, Teams, Edorgs, EdfiTenants, UserTeamMemberships, Ownerships,
IntegrationApps, IntegrationProviders. These live in Admin App's own
database and already filter with `whereIds(validIds)` **inside** the SQL
query (e.g. `edorgs.controller.ts:62`), so server-side `orderBy`/`offset`/
`limit` is straightforward and always numerically correct — no `validIds`
fallback needed. Same TypeORM pattern SbSyncQueue already uses
(`sb-sync.controller.ts:186-215`).

## Backend design

### Shared query params DTO

A `ListQueryParamsDto` (name to be finalized during implementation) with:

- `offset?: number` — pagination start
- `limit?: number` — pagination page size, capped at a max via
  class-validator
- `orderBy?: string` — column to sort by, validated against a per-resource
  allow-list of real column names (mirrors the Admin API's own
  `_orderByColumnVendors`-style lookup); an unrecognized value is a 400
- `direction?: 'asc' | 'desc'`

Bound via `@Query()` on each affected list endpoint.

### Group B controllers/services

Mirror the SbSyncQueue TypeORM pattern:

```
findAndCount({
  where: _.omitBy({ ...whereIds(validIds), ...otherScoping }, _.isUndefined),
  order: orderBy ? { [orderBy]: direction ?? 'asc' } : undefined,
  skip: offset,
  take: limit,
})
```

returning `{ data, rowCount }`.

**TypeORM 1.1.0 note**: 1.1.0 throws when a `where` (and, to be verified
during implementation, `order`) field is `undefined` instead of silently
dropping it, per the fix already applied in `8fe2ac7` (ownerships). All
`where`/`order` object construction in this work uses
`_.omitBy(obj, _.isUndefined)` rather than manual conditional spreads, from
the start — not as a follow-up fix.

### Group A controllers/services

Each `admin-api.v2/v3.controller.ts` list endpoint gains the same
`ListQueryParamsDto`. In the service layer:

- When `validIds === true`: replace the hardcoded `offset=0&limit=10000`
  with the real incoming `offset`/`limit`, and (v2/v3 only) `orderBy`/
  `direction`, passed straight through to the upstream Admin API call.
- When `validIds !== true`: ignore incoming pagination/sort params and keep
  today's fetch-all(10000)-then-filter-client-side behavior.
- v1-backed endpoints: not touched by this work (see Scope decision above).

Response shape for all migrated Group A endpoints:
`{ data, rowCount, serverPaginated: boolean }`. `serverPaginated` is `false`
whenever the fallback path was used (scoped user), so the frontend can
detect it and act accordingly (see Error handling).

## Frontend design

Add `SbaaTableAllInOneServerSide` to `common-ui/src/lib/sbaaTable/`: the
same composition as the existing `SbaaTableAllInOne` (search, filters,
table, pagination) but wrapping `SbaaTableProviderServerSide` instead of
`SbaaTableProvider` — mirroring what `SbSyncQueuesTable` already hand-rolls
(`SbSyncQueuesPage.tsx:147-294`).

Each migrated resource page:

- Swaps `SbaaTableAllInOne` → `SbaaTableAllInOneServerSide`.
- Changes its `queries.getAll`-style hook from "fetch everything, return an
  array" to "build a URL from `getSortParams`/`getPaginationParams`/
  `getColumnFilterParam` (existing helpers in
  `common-ui/src/lib/dataTable/index.tsx`), fetch `{ data, rowCount,
  serverPaginated? }`."

No new client-side state management is introduced — this reuses the
existing URL-param helpers.

## Error handling

- Unknown `orderBy` column → 400, via the per-resource column allow-list.
- `limit`/`offset` validated non-negative and within a max via
  class-validator on the DTO.
- v1-backed Group A resources are out of scope for this work entirely (not
  migrated) — no error path needed there.
- Group A scoped-user fallback: page/hook reads `serverPaginated` from the
  response. When `false`, the page falls back to the client-side experience
  (equivalent to today's behavior) rather than presenting a broken or
  partial server-side pagination UI.

## Testing

Per migrated resource:

- Backend: unit tests for the controller/service covering valid params,
  invalid `orderBy`, v2 vs v3 behavior (Group A), and the
  `validIds !== true` fallback (Group A only).
- Frontend: one test per page confirming it renders with
  `SbaaTableAllInOneServerSide` and issues the expected query.

No new E2E scenarios are required beyond exercising one representative page
end-to-end (Vendors) and regression-checking existing Playwright specs for
the other migrated pages still pass.

## Out of scope

- v1-backed Group A pages (Vendors/Applications/etc. when the environment's
  Admin API is v1) — remain client-side, unchanged.
- Any change to the underlying Admin API itself.
- Any change to authorization/`validIds` computation.

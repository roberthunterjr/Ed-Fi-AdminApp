# Admin App Sorting/Pagination Analysis: `offset`, `limit`, `orderBy`, `direction`

Date: 2026-09-14

## Purpose

Determine whether Admin App endpoints use the `offset`, `limit`, `orderBy`,
and `direction` query-param keywords that the Admin API 2.3 spec defines for
pagination and sorting, confirm how table sorting/pagination is actually
implemented under the hood, and flag any gaps.

## Summary

Admin App's list tables share one component (`SbaaTable` in
`common-ui/src/lib/sbaaTable/`) built on `@tanstack/react-table` v8.21.3, driven
by one of two context providers:

- **`SbaaTableProvider.tsx`** (client-side, used by almost every page): calls
  `getSortedRowModel()`, `getPaginationRowModel()`, `getFilteredRowModel()`.
  `manualSorting`/`manualPagination`/`manualFiltering` are left at their
  default (`false`), so TanStack Table sorts, filters, and paginates rows
  **already loaded into memory**. Sort/page state is synced to URL search
  params via `getSortParams`/`getPaginationParams` in
  `common-ui/src/lib/dataTable/index.tsx`, but that's just URL bookkeeping —
  it isn't sent to the API as sort/pagination instructions.
- **`SbaaTableProviderServerSide.tsx`**: same shape, but sets
  `manualFiltering`/`manualSorting`/`manualPagination: true` and derives
  `pageCount` from a server-supplied `rowCount`. Here TanStack Table only
  renders whatever page of pre-sorted, pre-filtered data it's handed; sorting
  and pagination are performed server-side.

**Only one page uses the server-side variant:** the Starting Blocks Sync
Queue page (`SbSyncQueuesPage.tsx`). It's backed by
`packages/api/src/sb-sync/sb-sync.controller.ts` (`GET /`, lines 186–215),
which accepts real `@Query()` params — `colFilter`, `pageIndex`, `pageSize`,
`sortCol`, `sortDesc` — and does `queryRepository.orderBy(...).offset(...).limit(...)`
in TypeORM. This is genuine server-side sort/filter/pagination.

**Every other list page is client-side-only**: Vendors, Applications,
ApiClients, Claimsets, Profiles, DataStores, Odss, Roles, Users, Teams,
Edorgs, EdfiTenants, UserTeamMemberships, Ownerships, IntegrationApps,
IntegrationProviders.

## Gap vs. Admin API 2.3 spec

Verified against the reference Admin API 2.3 source
(`C:\dev\ed-fi\ODS-Admin-API`, matching `EdFi.Suite3.ODS.AdminApi.2.3.3`).
Its list endpoints (vendors, applications, claim sets, resource claims,
profiles, etc.) share a `CommonQueryParams` struct
(`Application/EdFi.Ods.AdminApi.Common/Infrastructure/CommonQueryParams.cs:14-21`)
bound via `[FromQuery]` to exactly these four query-string names:

- `offset` (int?) — pagination start
- `limit` (int?) — pagination page size
- `orderBy` (string?) — column to sort by
- `direction` (string?) — `Asc`/`Ascending` or `Desc`/`Descending`, case-insensitive, defaults to ascending (`SortingDirectionHelper.cs:24-43`)

Defaults come from app settings `DefaultPageSizeOffset` and
`DefaultPageSizeLimit`, not hardcoded literals.

There is **no `query` parameter** anywhere in the Admin API 2.3 source —
free-text filtering is done per-resource with named params instead (e.g.
`ReadVendor.cs:32` takes `company`, `namespacePrefixes`, `contactName`,
`contactEmailAddress`, not a generic `query`). There is also **no
change-query concept** (`minChangeVersion`/`maxChangeVersion`) in this Admin
API repo at all — that idea doesn't apply here; earlier drafts of this doc
incorrectly attributed it to Admin API 2.3 without verifying against source,
and that claim has been removed.

So the Admin API 2.3 spec's real pagination/sort keywords are `offset`,
`limit`, `orderBy`, `direction` — not `query`. Admin App proxies to that real
Admin API through `admin-api.v1/v2/v3.service.ts`, but:

- The proxy **hardcodes `offset=0&limit=10000`** on every call to the
  upstream Admin API for vendors, applications, apiClients, claimSets,
  resourceClaims, dataStores, and profiles (v3 service, lines 369, 444, 528,
  613, 689, 735, 798) — it always fetches up to 10,000 rows in one shot and
  hands the full list back.
- Admin App's own controllers for these resources
  (`admin-api.v1/v2/v3.controller.ts`) expose **no `offset`, `limit`,
  `orderBy`, or `direction` query params at all** — plain `@Get('vendors')`,
  `@Get('applications')`, etc., with nothing for filtering, pagination, or
  sorting.

So the "fetch up to 10,000 rows, then sort/filter/paginate client-side in
TanStack Table" pattern is baked in end-to-end, from the Admin API proxy
layer through Admin App's own controllers to the frontend.

## Endpoints with sortable/paginated tables but no server-side `offset`/`limit`/`orderBy`/`direction` support

Vendors, Applications, ApiClients, Claimsets, Profiles, DataStores, Odss,
Roles, Users, Teams, Edorgs, EdfiTenants, UserTeamMemberships, Ownerships,
IntegrationApps, IntegrationProviders — all list-table pages except
SbSyncQueue.

## Risk

The 10,000-row hardcoded cap means any Admin API instance with more than
10,000 records of a given resource type will silently truncate results in
Admin App's tables — sorting/pagination will only ever operate on the first
10,000 rows returned by the upstream call, not the full dataset.

## Correction: `orderBy`/`direction` are v2/v3-only in the real Admin API

Verified directly against `ODS-Admin-API`'s versioned source (vendors
endpoint used as the representative case, same pattern holds across
resources):

- **V1** (`EdFi.Ods.AdminApi.V1/Features/Vendors/ReadVendor.cs:28`,
  `.../Infrastructure/Database/Queries/GetVendorsQuery.cs:45-56`): binds
  `CommonQueryParams` but only reads `Offset`/`Limit` — the query is
  hardcoded to `.OrderBy(v => v.VendorName)` and never looks at
  `commonQueryParams.OrderBy`/`Direction`. No per-column filter params
  either. **V1 supports pagination (`offset`/`limit`) only — no sorting, no
  filtering.**
- **V2** (`EdFi.Ods.AdminApi/Features/Vendors/ReadVendor.cs:32`,
  `.../Infrastructure/Database/Queries/GetVendorsQuery.cs:63-85`) and **V3**
  (`EdFi.Ods.AdminApi.V3/...` — identical shape) both read `OrderBy` via a
  `_orderByColumnVendors` lookup and apply `Direction` through
  `OrderByColumn(columnToOrderBy, commonQueryParams.IsDescending)`, plus
  accept per-column filters (`id`, `company`, `namespacePrefixes`,
  `contactName`, `contactEmailAddress`). **Full `offset`/`limit`/`orderBy`/`direction`
  support is v2/v3 only.**

This means Admin App can't simply proxy the same query params through
regardless of which Admin API version an instance runs — a v1-only Admin API
instance would still need client-side sorting for any endpoint Admin App
built to expect server-side `orderBy`/`direction`.

## Recommendation

Treat SbSyncQueue's server-side pattern (`SbaaTableProviderServerSide` +
`colFilter`/`pageIndex`/`pageSize`/`sortCol`/`sortDesc` query params) as the
template, but scope it to what each Admin API version actually supports:

1. For Admin App's `admin-api.v2`/`v3.controller.ts` endpoints: add
   `offset`/`limit`/`orderBy`/`direction` query params, matching the real
   `CommonQueryParams` convention, and pass them through to the upstream
   call instead of the hardcoded `offset=0&limit=10000`.
2. For `admin-api.v1.controller.ts`: only `offset`/`limit` pagination can be
   proxied server-side — `orderBy`/`direction` aren't available in v1's
   Admin API, so sorting must stay client-side (or the v1 code path skips
   server-side sorting entirely) for any Admin App instance pointed at a v1
   Admin API.
3. Switch each affected frontend page from `SbaaTableProvider` to
   `SbaaTableProviderServerSide` only for the resources/versions where the
   full param set is actually available.

This is a larger, cross-cutting change and is out of scope for this analysis
— flagged here for prioritization.

See [Server Side Sorting and Pagination design](2026-09-14-server-side-sorting-pagination-design.md)

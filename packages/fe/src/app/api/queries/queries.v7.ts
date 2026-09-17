import {
  ApiClientResponseV2,
  ApiClientResponseV3,
  ApplicationResponseV2,
  CopyClaimsetDtoV2,
  CopyClaimsetDtoV3,
  GetApiClientDtoV2,
  GetApiClientDtoV3,
  GetApplicationDtoV2,
  GetApplicationDtoV3,
  GetClaimsetMultipleDtoV2,
  GetClaimsetMultipleDtoV3,
  GetClaimsetSingleDtoV2,
  GetClaimsetSingleDtoV3,
  GetDataStoreSummaryDtoV3,
  GetOdsInstanceSummaryDtoV2,
  GetProfileDtoV2,
  GetProfileDtoV3,
  GetVendorDtoV2,
  GetVendorDtoV3,
  Id,
  PostApiClientDtoV2,
  PostApiClientDtoV3,
  PostApiClientResponseDtoV2,
  PostApiClientResponseDtoV3,
  PostInstanceDtoV2,
  ImportClaimsetSingleDtoV2,
  ImportClaimsetSingleDtoV3,
  PostApplicationFormDtoV2,
  PostApplicationFormDtoV3,
  PostApplicationResponseDtoV3,
  PostClaimsetDtoV2,
  PostProfileDtoV2,
  PostProfileDtoV3,
  PostVendorDtoV2,
  PostVendorDtoV3,
  PutApiClientDtoV2,
  PutApiClientDtoV3,
  PutApplicationFormDtoV2,
  PutApplicationFormDtoV3,
  PutClaimsetFormDtoV2,
  PutProfileDtoV2,
  PutProfileDtoV3,
  PutVendorDtoV2,
  PutVendorDtoV3,
} from '@edanalytics/models';
import { GetEdfiTenantDto } from '@edanalytics/models';
import { QueryKey } from '@tanstack/react-query';
import { EntityQueryBuilder, StandardQueryKeyParams, queryKeyNew, standardPath } from './builder';
import { TeamOptions } from './team-options';

// Reproduces the corresponding entity's own `getAll` key (id: undefined -> 'list'),
// so a put/post/delete's default invalidation actually matches the list query
// it's meant to refresh, instead of a mismatched literal key. See applicationQueriesV2's
// `put` below for the original instance of this pattern.
const listKeyToInvalidate = (base: {
  standardQueryKeyParams: StandardQueryKeyParams;
  teamId?: number | string;
}) => [queryKeyNew({ ...base.standardQueryKeyParams, teamId: base.teamId, id: undefined })];

// Like `listKeyToInvalidate`, but for `put` specifically: also keeps the
// builder's own default key (`base.standard`, built with `id: false`), which
// matches this entity's `getOne` cache too. `put`'s mutation doesn't create a
// new id, so unlike post/delete there's an existing detail cache an edit page
// navigates back to -- dropping `base.standard` here left it stale after a
// successful edit until the default 5-minute staleTime elapsed.
const putKeysToInvalidate = (base: {
  standard: QueryKey;
  standardQueryKeyParams: StandardQueryKeyParams;
  teamId?: number | string;
}) => [base.standard, ...listKeyToInvalidate(base)];

// See the comment above apiClientQueriesV2's `.delete(...)` call for why this
// shape (rather than the builder's declared `path` overload type) is needed.
type ApiClientDeletePathBase = {
  id: string | number;
  edfiTenant?: GetEdfiTenantDto;
  teamId?: string | number;
  queryParams?: {
    edfiTenant?: GetEdfiTenantDto;
    teamId?: string | number;
  };
};

export const applicationQueriesV2 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Application',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getAll('getAll', { ResDto: GetApplicationDtoV2 })
  .getOne('getOne', { ResDto: GetApplicationDtoV2 })
  .put(
    'put',
    {
      ResDto: GetApplicationDtoV2,
      ReqDto: PutApplicationFormDtoV2,
      // Explicit rather than relying on the builder's default (which happens
      // to prefix-match `getAll`'s key here only because this `put` has no
      // custom `path` override). Spelling it out avoids a repeat of the
      // ApiClient bug this fixes elsewhere (a future `path` override on this
      // `put` would silently break invalidation again if left implicit).
      // Uses `putKeysToInvalidate` (not `listKeyToInvalidate`) so the entity's
      // own `getOne` cache stays invalidated too, alongside the list.
      keysToInvalidate: putKeysToInvalidate,
    }
  )
  .put(
    'resetCreds',
    {
      ResDto: undefined as unknown as ApplicationResponseV2,
      ReqDto: Id,
    },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'application',
        adminApi: true,
        id: `${base.entity.id}/reset-credential`,
      })
  )
  .post('post', { ResDto: undefined as unknown as ApplicationResponseV2, ReqDto: PostApplicationFormDtoV2 })
  .delete('delete')
  .build();

export const applicationQueriesV3 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Application',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getAll('getAll', { ResDto: GetApplicationDtoV3 })
  .getOne('getOne', { ResDto: GetApplicationDtoV3 })
  .put(
    'put',
    {
      ResDto: GetApplicationDtoV3,
      ReqDto: PutApplicationFormDtoV3,
      // See applicationQueriesV2's `put` for why this is spelled out explicitly.
      keysToInvalidate: putKeysToInvalidate,
    }
  )
  .post('post', { ResDto: PostApplicationResponseDtoV3, ReqDto: PostApplicationFormDtoV3 })
  .delete('delete')
  .build();

// Shared by `getAll`'s `path` and `put`'s `keysToInvalidate` below, so the
// mutation's invalidation always targets the exact same key the Credentials
// list page queries against - regardless of `applicationId` filtering.
const apiClientListPathOverride = (
  base: { edfiTenant?: GetEdfiTenantDto; teamId?: string | number },
  applicationId?: number
) => {
  const query = applicationId === undefined ? '' : `?applicationId=${applicationId}`;
  return standardPath({
    edfiTenant: base.edfiTenant,
    teamId: base.teamId,
    kebabCaseName: 'apiClient',
    adminApi: true,
    id: query,
  });
};

export const apiClientQueriesV2 = new EntityQueryBuilder({
  adminApi: true,
  name: 'ApiClient',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getAll(
    'getAll',
    { ResDto: GetApiClientDtoV2 },
    (base, extras: { applicationId?: number }) =>
      apiClientListPathOverride(base, extras?.applicationId)
  )
  .getOne('getOne', { ResDto: GetApiClientDtoV2 },
    (base) => {
      return standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'apiClient',
        adminApi: true,
        id: base.id,
      });
    })
  .put(
    'put',
    {
      ResDto: GetApiClientDtoV2,
      ReqDto: PutApiClientDtoV2,
      // The default invalidation key alone can't be used here: this `put`'s own
      // `path` (below) builds the mutation's URL from `entity.id`, and that
      // same path doubles as the builder's default invalidation key
      // (builder.ts's `put`), so it never matches the Credentials list's key,
      // which embeds `?applicationId=...` (`getAll`'s own `path`, above).
      // Recompute the exact list key via the same helper `getAll` uses, and
      // keep `base.standard` (the default key) too -- it happens to equal
      // this entity's `getOne` key, since `getOne` computes the identical
      // standardPath. Dropping it would leave a cached `getOne` result stale
      // after a successful edit.
      keysToInvalidate: (base) => [
        base.standard,
        queryKeyNew({
          kebabCaseName: 'apiClient',
          teamId: base.teamId,
          edfiTenant: base.edfiTenant,
          pathOverride: apiClientListPathOverride(base, base.entity.applicationId),
        }),
      ],
    },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'apiClient',
        adminApi: true,
        id: base.entity.id,
      })
  )
  .put(
    'resetCreds',
    {
      ResDto: undefined as unknown as ApiClientResponseV2,
      ReqDto: Id,
    },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'apiClient',
        adminApi: true,
        id: `${base.entity.id}/reset-credential`,
      })
  )
  .post(
    'post',
    { ResDto: PostApiClientResponseDtoV2, ReqDto: PostApiClientDtoV2 },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'apiClient',
        adminApi: true,
      })
  )
  .delete(
    'delete',
    {},
    // The builder's `path` overload types its 3rd arg as a bare function, but the
    // runtime implementation (builder.ts's `delete()`) only recognizes it when it's
    // wrapped as `{ path: fn }` (it does `'path' in pathConfig`), and calls it with
    // either `{ queryParams, id }` (from mutationFn) or `{ ...queryParams, id }`
    // (from onSuccess) depending on caller - hence the dual `queryParams?.x ?? x`
    // lookups below. Cast through `unknown` (not `any`) since the declared overload
    // type doesn't describe this actual shape.
    {
      path: (base: ApiClientDeletePathBase) => {
        const edfiTenant = base.queryParams?.edfiTenant ?? base.edfiTenant;
        const teamId = base.queryParams?.teamId ?? base.teamId;
        return standardPath({
          edfiTenant,
          teamId,
          kebabCaseName: 'apiClient',
          adminApi: true,
          id: base.id,
        });
      },
    } as unknown as (
      base: { id: string | number },
      extras: unknown
    ) => string
  )
  .build();

export const apiClientQueriesV3 = new EntityQueryBuilder({
  adminApi: true,
  name: 'ApiClient',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getAll(
    'getAll',
    { ResDto: GetApiClientDtoV3 },
    (base, extras: { applicationId?: number }) =>
      apiClientListPathOverride(base, extras?.applicationId)
  )
  .getOne('getOne', { ResDto: GetApiClientDtoV3 },
    (base) => {
      return standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'apiClient',
        adminApi: true,
        id: base.id,
      });
    })
  .put(
    'put',
    {
      ResDto: GetApiClientDtoV3,
      ReqDto: PutApiClientDtoV3,
      // See apiClientQueriesV2's `put` for why this is spelled out explicitly
      // (including keeping `base.standard` alongside the recomputed list key).
      keysToInvalidate: (base) => [
        base.standard,
        queryKeyNew({
          kebabCaseName: 'apiClient',
          teamId: base.teamId,
          edfiTenant: base.edfiTenant,
          pathOverride: apiClientListPathOverride(base, base.entity.applicationId),
        }),
      ],
    },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'apiClient',
        adminApi: true,
        id: base.entity.id,
      })
  )
  .put(
    'resetCreds',
    {
      ResDto: undefined as unknown as ApiClientResponseV3,
      ReqDto: Id,
    },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'apiClient',
        adminApi: true,
        id: `${base.entity.id}/reset-credential`,
      })
  )
  .post(
    'post',
    { ResDto: PostApiClientResponseDtoV3, ReqDto: PostApiClientDtoV3 },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'apiClient',
        adminApi: true,
      })
  )
  .delete(
    'delete',
    {},
    // The builder's `path` overload types its 3rd arg as a bare function, but the
    // runtime implementation (builder.ts's `delete()`) only recognizes it when it's
    // wrapped as `{ path: fn }` (it does `'path' in pathConfig`), and calls it with
    // either `{ queryParams, id }` (from mutationFn) or `{ ...queryParams, id }`
    // (from onSuccess) depending on caller - hence the dual `queryParams?.x ?? x`
    // lookups below. Cast through `unknown` (not `any`) since the declared overload
    // type doesn't describe this actual shape.
    {
      path: (base: ApiClientDeletePathBase) => {
        const edfiTenant = base.queryParams?.edfiTenant ?? base.edfiTenant;
        const teamId = base.queryParams?.teamId ?? base.teamId;
        return standardPath({
          edfiTenant,
          teamId,
          kebabCaseName: 'apiClient',
          adminApi: true,
          id: base.id,
        });
      },
    } as unknown as (
      base: { id: string | number },
      extras: unknown
    ) => string
  )
  .build();

export const claimsetQueriesV2 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Claimset',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getOne('getOne', { ResDto: GetClaimsetSingleDtoV2 })
  .post(
    'createExport',
    { ResDto: Id, ReqDto: class Nothing {} },
    (base, pathParams: { ids: number[] }) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'claimset',
        adminApi: true,
        id: `export?id=${pathParams.ids.join('&id=')}`,
      })
  )
  .getAll('getAll', { ResDto: GetClaimsetMultipleDtoV2 })
  .put('put', { ResDto: GetClaimsetSingleDtoV2, ReqDto: PutClaimsetFormDtoV2 })
  .post('post', { ResDto: GetClaimsetSingleDtoV2, ReqDto: PostClaimsetDtoV2 })
  .post(
    'import',
    {
      ResDto: Id,
      ReqDto: ImportClaimsetSingleDtoV2,
      keysToInvalidate: (base) => [
        queryKeyNew({
          ...base.standardQueryKeyParams,
          pathOverride: undefined,
          id: undefined,
        }),
      ],
    },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'claimset',
        adminApi: true,
        id: `import`,
      })
  )
  .post(
    'copy',
    {
      ResDto: Id,
      ReqDto: CopyClaimsetDtoV2,
      keysToInvalidate: (params) => [
        params.standard,
        queryKeyNew({
          kebabCaseName: 'claimset',
          edfiTenant: params.edfiTenant,
          id: false,
        }),
      ],
    },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'claimset',
        adminApi: true,
        id: `copy`,
      })
  )
  .delete('delete')
  .build();

export const claimsetQueriesV3 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Claimset',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getOne('getOne', { ResDto: GetClaimsetSingleDtoV3 })
  .getAll('getAll', { ResDto: GetClaimsetMultipleDtoV3 })
  .post(
    'createExport',
    { ResDto: Id, ReqDto: class Nothing {} },
    (base, pathParams: { ids: number[] }) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'claimset',
        adminApi: true,
        id: `export?id=${pathParams.ids.join('&id=')}`,
      })
  )
  .post(
    'import',
    {
      ResDto: Id,
      ReqDto: ImportClaimsetSingleDtoV3,
      keysToInvalidate: (base) => [
        queryKeyNew({
          ...base.standardQueryKeyParams,
          pathOverride: undefined,
          id: undefined,
        }),
      ],
    },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'claimset',
        adminApi: true,
        id: `import`,
      })
  )
  .post(
    'copy',
    {
      ResDto: Id,
      ReqDto: CopyClaimsetDtoV3,
      keysToInvalidate: (params) => [
        params.standard,
        queryKeyNew({
          kebabCaseName: 'claimset',
          edfiTenant: params.edfiTenant,
          id: false,
        }),
      ],
    },
    (base) =>
      standardPath({
        edfiTenant: base.edfiTenant,
        teamId: base.teamId,
        kebabCaseName: 'claimset',
        adminApi: true,
        id: `copy`,
      })
  )
  .delete('delete')
  .build();

export const vendorQueriesV2 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Vendor',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getOne('getOne', { ResDto: GetVendorDtoV2 })
  .getAll('getAll', { ResDto: GetVendorDtoV2 })
  .put('put', {
    ResDto: GetVendorDtoV2,
    ReqDto: PutVendorDtoV2,
    keysToInvalidate: putKeysToInvalidate,
  })
  .post('post', { ResDto: Id, ReqDto: PostVendorDtoV2, keysToInvalidate: listKeyToInvalidate })
  .delete('delete', { keysToInvalidate: listKeyToInvalidate })
  .build();

export const vendorQueriesV3 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Vendor',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getOne('getOne', { ResDto: GetVendorDtoV3 })
  .getAll('getAll', { ResDto: GetVendorDtoV3 })
  .put('put', {
    ResDto: GetVendorDtoV3,
    ReqDto: PutVendorDtoV3,
    keysToInvalidate: putKeysToInvalidate,
  })
  .post('post', { ResDto: Id, ReqDto: PostVendorDtoV3, keysToInvalidate: listKeyToInvalidate })
  .delete('delete', { keysToInvalidate: listKeyToInvalidate })
  .build();

export const profileQueriesV2 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Profile',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getOne('getOne', { ResDto: GetProfileDtoV2 })
  .getAll('getAll', { ResDto: GetProfileDtoV2 })
  .put('put', {
    ResDto: GetProfileDtoV2,
    ReqDto: PutProfileDtoV2,
    keysToInvalidate: putKeysToInvalidate,
  })
  .post('post', {
    ResDto: GetProfileDtoV2,
    ReqDto: PostProfileDtoV2,
    keysToInvalidate: listKeyToInvalidate,
  })
  .delete('delete', { keysToInvalidate: listKeyToInvalidate })
  .build();

export const profileQueriesV3 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Profile',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getOne('getOne', { ResDto: GetProfileDtoV3 })
  .getAll('getAll', { ResDto: GetProfileDtoV3 })
  .put('put', {
    ResDto: GetProfileDtoV3,
    ReqDto: PutProfileDtoV3,
    keysToInvalidate: putKeysToInvalidate,
  })
  .post('post', {
    ResDto: GetProfileDtoV3,
    ReqDto: PostProfileDtoV3,
    keysToInvalidate: listKeyToInvalidate,
  })
  .delete('delete', { keysToInvalidate: listKeyToInvalidate })
  .build();

export const odsInstancesV2 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Odsinstance',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getAll('getAll', { ResDto: GetOdsInstanceSummaryDtoV2 })
  .build();

export const dataStoresV3 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Datastore',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .getAll('getAll', { ResDto: GetDataStoreSummaryDtoV3 })
  .build();

export const instancesV2 = new EntityQueryBuilder({
  adminApi: true,
  name: 'Instance',
  includeEdfiTenant: true,
  includeTeam: TeamOptions.Required,
})
  .post('post', { ResDto: Id, ReqDto: PostInstanceDtoV2 })
  .delete('delete')
  .build();

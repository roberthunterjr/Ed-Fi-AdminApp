import {
  PostApiClientDtoV2,
  PostApiClientDtoV3,
  PostApiClientFormDtoV2,
  PostApiClientFormDtoV3,
  PutApiClientDtoV2,
  PutApiClientDtoV3,
  PutApiClientFormDtoV2,
  PutApiClientFormDtoV3,
} from '@edanalytics/models';
// Import builders directly from queries.v7, NOT the `../../api` barrel: the
// barrel participates in a circular import that can leave these builders
// `undefined` when a config module is captured mid-init in the production
// bundle. See docs/design/admin-api-v3-support/README.md ("Config modules must
// bypass the api barrel") for the full mechanism.
import { apiClientQueriesV2, apiClientQueriesV3 } from '../../api/queries/queries.v7';
import { createVersionedResource } from '../../api/queries/versioned';

// Re-exported for consumers of `./apiClientConfig` — the type and helper live in
// apiClientEntity.ts, which has no dependency on the query-builder chain above,
// so specs that mock this whole module can still pull in the real
// `getDataStoreIds`.
export { getDataStoreIds } from './apiClientEntity';
export type { ApiClientEntity } from './apiClientEntity';

export type ApiClientConfig =
  | {
      version: 'v2';
      queries: typeof apiClientQueriesV2;
      PostDto: typeof PostApiClientDtoV2;
      PutDto: typeof PutApiClientDtoV2;
      PostFormDto: typeof PostApiClientFormDtoV2;
      PutFormDto: typeof PutApiClientFormDtoV2;
    }
  | {
      version: 'v3';
      queries: typeof apiClientQueriesV3;
      PostDto: typeof PostApiClientDtoV3;
      PutDto: typeof PutApiClientDtoV3;
      PostFormDto: typeof PostApiClientFormDtoV3;
      PutFormDto: typeof PutApiClientFormDtoV3;
    };

// Do NOT add an explicit `: () => ApiClientConfig` return-type annotation here.
// It silently erases the `.match` static property `createVersionedResource`
// attaches to the returned function — every `.match()` call site would still
// type-check, but fail at runtime, with no compile error pointing back here.
export const useApiClientConfig = createVersionedResource<ApiClientConfig>({
  v2: {
    version: 'v2',
    queries: apiClientQueriesV2,
    PostDto: PostApiClientDtoV2,
    PutDto: PutApiClientDtoV2,
    PostFormDto: PostApiClientFormDtoV2,
    PutFormDto: PutApiClientFormDtoV2,
  },
  v3: {
    version: 'v3',
    queries: apiClientQueriesV3,
    PostDto: PostApiClientDtoV3,
    PutDto: PutApiClientDtoV3,
    PostFormDto: PostApiClientFormDtoV3,
    PutFormDto: PutApiClientFormDtoV3,
  },
});

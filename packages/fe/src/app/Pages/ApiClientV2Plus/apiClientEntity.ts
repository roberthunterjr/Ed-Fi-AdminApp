import { GetApiClientDtoV2, GetApiClientDtoV3 } from '@edanalytics/models';

// Split out from apiClientConfig.ts so this type and its one pure helper have
// zero dependency on the query-builder chain (`../../api/queries/queries.v7`,
// which pulls in ESM-only packages Jest can't parse without extra config).
// Specs that mock `./apiClientConfig` wholesale can still import the real
// `getDataStoreIds` from here without dragging that chain in.
export type ApiClientEntity = GetApiClientDtoV2 | GetApiClientDtoV3;

// V2 API clients carry `odsInstanceIds`; V3 clients carry `dataStoreIds` for the
// same concept. Centralized here so every consumer probes the field name the same
// way, and so there's exactly one guard against either field being absent.
export const getDataStoreIds = (apiClient: ApiClientEntity): number[] =>
  ('odsInstanceIds' in apiClient ? apiClient.odsInstanceIds : apiClient.dataStoreIds) ?? [];

import 'reflect-metadata';

// Deliberately imports './apiClientEntity' directly and NOT './apiClientConfig':
// the config module pulls in the query-builder chain
// ('../../api/queries/queries.v7'), which Jest can't parse without extra
// config. apiClientEntity.ts exists precisely so this helper can be tested in
// isolation.
import { ApiClientEntity, getDataStoreIds } from './apiClientEntity';

// The two "missing"/"empty" shapes below aren't constructible from the real
// DTO classes (their fields are non-optional), but they're exactly what the
// `?? []` guard exists for when the API omits the field.
const asEntity = (value: object) => value as unknown as ApiClientEntity;

describe('getDataStoreIds', () => {
  it('returns odsInstanceIds for a V2 entity', () => {
    expect(getDataStoreIds(asEntity({ odsInstanceIds: [1, 2] }))).toEqual([1, 2]);
  });

  it('returns dataStoreIds for a V3 entity', () => {
    expect(getDataStoreIds(asEntity({ dataStoreIds: [3, 4] }))).toEqual([3, 4]);
  });

  it('returns an empty array when neither field is present', () => {
    expect(getDataStoreIds(asEntity({ id: 1, name: 'no ids' }))).toEqual([]);
  });

  it('returns the empty array as-is when the id list is empty', () => {
    expect(getDataStoreIds(asEntity({ odsInstanceIds: [] }))).toEqual([]);
    expect(getDataStoreIds(asEntity({ dataStoreIds: [] }))).toEqual([]);
  });
});

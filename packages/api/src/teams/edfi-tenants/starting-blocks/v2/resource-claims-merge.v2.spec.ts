import 'reflect-metadata';
import { GetResourceClaimDetailDtoV2, GetResourceClaimDtoV2 } from '@edanalytics/models';
import { mergeResourceClaimsV2 } from './resource-claims-merge.v2';

describe('mergeResourceClaimsV2', () => {
  it('keeps an existing resource claim that already has actions untouched', () => {
    const existing: GetResourceClaimDtoV2[] = [
      {
        id: '1',
        name: 'types',
        actions: [{ name: 'Read', enabled: true }],
        authorizationStrategyOverridesForCRUD: [],
        _defaultAuthorizationStrategiesForCRUD: [],
        children: [],
      } as unknown as GetResourceClaimDtoV2,
    ];
    const detail: GetResourceClaimDetailDtoV2[] = [
      { id: 1, name: 'types', parentId: 0, parentName: null, children: [] } as unknown as GetResourceClaimDetailDtoV2,
    ];

    const result = mergeResourceClaimsV2(existing, detail);

    expect(result).toEqual(existing);
  });

  it('adds a denied placeholder for a child present in the detail tree but missing from the existing claim set', () => {
    const existing: GetResourceClaimDtoV2[] = [
      {
        id: '1',
        name: 'types',
        actions: [{ name: 'Read', enabled: true }],
        authorizationStrategyOverridesForCRUD: [],
        _defaultAuthorizationStrategiesForCRUD: [],
        children: [],
      } as unknown as GetResourceClaimDtoV2,
    ];
    const detail: GetResourceClaimDetailDtoV2[] = [
      {
        id: 1,
        name: 'types',
        parentId: 0,
        parentName: null,
        children: [{ id: 12, name: 'schoolYearType', parentId: 1, parentName: 'types', children: [] }],
      } as unknown as GetResourceClaimDetailDtoV2,
    ];

    const result = mergeResourceClaimsV2(existing, detail);

    expect(result).toHaveLength(1);
    expect(result[0].children).toEqual([
      {
        id: '12',
        name: 'schoolYearType',
        actions: [],
        authorizationStrategyOverridesForCRUD: [],
        _defaultAuthorizationStrategiesForCRUD: [],
        children: [],
      },
    ]);
  });

  it('adds a denied placeholder (with its own denied subtree) for a whole branch missing from the existing claim set', () => {
    const existing: GetResourceClaimDtoV2[] = [];
    const detail: GetResourceClaimDetailDtoV2[] = [
      {
        id: 1,
        name: 'types',
        parentId: 0,
        parentName: null,
        children: [{ id: 12, name: 'schoolYearType', parentId: 1, parentName: 'types', children: [] }],
      } as unknown as GetResourceClaimDetailDtoV2,
    ];

    const result = mergeResourceClaimsV2(existing, detail);

    expect(result).toEqual([
      {
        id: '1',
        name: 'types',
        actions: [],
        authorizationStrategyOverridesForCRUD: [],
        _defaultAuthorizationStrategiesForCRUD: [],
        children: [
          {
            id: '12',
            name: 'schoolYearType',
            actions: [],
            authorizationStrategyOverridesForCRUD: [],
            _defaultAuthorizationStrategiesForCRUD: [],
            children: [],
          },
        ],
      },
    ]);
  });

  it('preserves an existing entry the detail tree omits, rather than silently dropping it', () => {
    // The resourceClaims-detail endpoint is meant to be the complete
    // hierarchy, but if it's ever incomplete relative to what the
    // claimset itself already reports (a version skew, a transient
    // truncation), the claimset's own data should win rather than vanish.
    const existing: GetResourceClaimDtoV2[] = [
      {
        id: '1',
        name: 'types',
        actions: [{ name: 'Read', enabled: true }],
        authorizationStrategyOverridesForCRUD: [],
        _defaultAuthorizationStrategiesForCRUD: [],
        children: [],
      } as unknown as GetResourceClaimDtoV2,
    ];

    const result = mergeResourceClaimsV2(existing, []);

    expect(result).toEqual(existing);
  });
});

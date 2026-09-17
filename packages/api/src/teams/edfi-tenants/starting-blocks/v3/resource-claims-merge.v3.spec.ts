import 'reflect-metadata';
import { GetResourceClaimDetailDtoV3, GetResourceClaimDtoV3 } from '@edanalytics/models';
import { mergeResourceClaimsV3 } from './resource-claims-merge.v3';

describe('mergeResourceClaimsV3', () => {
  it('leaves an existing (already-populated) flat resource claim list untouched when nothing is missing', () => {
    const existing: GetResourceClaimDtoV3[] = [
      {
        name: 'types',
        claimName: 'http://ed-fi.org/ods/identity/claims/domains/edFiTypes',
        parentClaimName: null,
        actions: [{ name: 'Read', enabled: true }],
        _defaultAuthorizationStrategies: [],
        authorizationStrategyOverrides: [],
      } as unknown as GetResourceClaimDtoV3,
    ];
    const detail: GetResourceClaimDetailDtoV3[] = [
      { id: 1, name: 'types', parentId: 0, parentName: null, children: [] } as unknown as GetResourceClaimDetailDtoV3,
    ];

    const result = mergeResourceClaimsV3(existing, detail);

    expect(result).toEqual(existing);
  });

  it('preserves the existing list untouched when the detail tree is empty, rather than dropping it', () => {
    // The resourceClaims-detail endpoint is meant to be the complete
    // hierarchy, but if it's ever incomplete relative to what the
    // claimset itself already reports, the claimset's own data should win
    // rather than vanish.
    const existing: GetResourceClaimDtoV3[] = [
      {
        name: 'types',
        claimName: 'http://ed-fi.org/ods/identity/claims/domains/edFiTypes',
        parentClaimName: null,
        actions: [{ name: 'Read', enabled: true }],
        _defaultAuthorizationStrategies: [],
        authorizationStrategyOverrides: [],
      } as unknown as GetResourceClaimDtoV3,
    ];

    const result = mergeResourceClaimsV3(existing, []);

    expect(result).toEqual(existing);
  });

  it('appends a synthesized denied entry for a child present in the detail tree but missing from the flat list, parented under the real claimName', () => {
    const existing: GetResourceClaimDtoV3[] = [
      {
        name: 'types',
        claimName: 'http://ed-fi.org/ods/identity/claims/domains/edFiTypes',
        parentClaimName: null,
        actions: [{ name: 'Read', enabled: true }],
        _defaultAuthorizationStrategies: [],
        authorizationStrategyOverrides: [],
      } as unknown as GetResourceClaimDtoV3,
    ];
    const detail: GetResourceClaimDetailDtoV3[] = [
      {
        id: 1,
        name: 'types',
        parentId: 0,
        parentName: null,
        children: [{ id: 12, name: 'schoolYearType', parentId: 1, parentName: 'types', children: [] }],
      } as unknown as GetResourceClaimDetailDtoV3,
    ];

    const result = mergeResourceClaimsV3(existing, detail);

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      name: 'schoolYearType',
      claimName: expect.any(String),
      parentClaimName: 'http://ed-fi.org/ods/identity/claims/domains/edFiTypes',
      actions: [],
      _defaultAuthorizationStrategies: [],
      authorizationStrategyOverrides: [],
    });
  });

  it('gives a synthesized entry a claimName distinct from any real claimName, and chains a missing grandchild under its missing parent', () => {
    const existing: GetResourceClaimDtoV3[] = [];
    const detail: GetResourceClaimDetailDtoV3[] = [
      {
        id: 1,
        name: 'types',
        parentId: 0,
        parentName: null,
        children: [{ id: 12, name: 'schoolYearType', parentId: 1, parentName: 'types', children: [] }],
      } as unknown as GetResourceClaimDetailDtoV3,
    ];

    const result = mergeResourceClaimsV3(existing, detail);

    expect(result).toHaveLength(2);
    const typesEntry = result.find((rc) => rc.name === 'types')!;
    const schoolYearTypeEntry = result.find((rc) => rc.name === 'schoolYearType')!;
    expect(typesEntry.parentClaimName).toBeNull();
    expect(schoolYearTypeEntry.parentClaimName).toBe(typesEntry.claimName);
    expect(schoolYearTypeEntry.claimName).not.toBe(typesEntry.claimName);
  });

  it('does not conflate same-named children in different branches (branch-safe matching)', () => {
    // Both "types" and "identity" have a child literally named "descriptor"
    // in the detail tree. "types/descriptor" already has actions;
    // "identity/descriptor" does not, so it's missing from `existing`.
    // Matching by bare name alone would incorrectly resolve
    // "identity/descriptor" to the "types" one already in the map.
    const typesClaimName = 'http://ed-fi.org/ods/identity/claims/domains/types';
    const identityClaimName = 'http://ed-fi.org/ods/identity/claims/domains/identity';
    const typesDescriptorClaimName = `${typesClaimName}/descriptor`;
    const existing: GetResourceClaimDtoV3[] = [
      {
        name: 'types',
        claimName: typesClaimName,
        parentClaimName: null,
        actions: [{ name: 'Read', enabled: true }],
        _defaultAuthorizationStrategies: [],
        authorizationStrategyOverrides: [],
      },
      {
        name: 'identity',
        claimName: identityClaimName,
        parentClaimName: null,
        actions: [{ name: 'Read', enabled: true }],
        _defaultAuthorizationStrategies: [],
        authorizationStrategyOverrides: [],
      },
      {
        name: 'descriptor',
        claimName: typesDescriptorClaimName,
        parentClaimName: typesClaimName,
        actions: [{ name: 'Read', enabled: true }],
        _defaultAuthorizationStrategies: [],
        authorizationStrategyOverrides: [],
      },
    ] as unknown as GetResourceClaimDtoV3[];
    const detail: GetResourceClaimDetailDtoV3[] = [
      {
        id: 1,
        name: 'types',
        parentId: 0,
        parentName: null,
        children: [{ id: 3, name: 'descriptor', parentId: 1, parentName: 'types', children: [] }],
      },
      {
        id: 2,
        name: 'identity',
        parentId: 0,
        parentName: null,
        children: [{ id: 4, name: 'descriptor', parentId: 2, parentName: 'identity', children: [] }],
      },
    ] as unknown as GetResourceClaimDetailDtoV3[];

    const result = mergeResourceClaimsV3(existing, detail);

    // The real types/descriptor is untouched.
    const typesDescriptor = result.find(
      (rc) => rc.name === 'descriptor' && rc.parentClaimName === typesClaimName
    );
    expect(typesDescriptor?.claimName).toBe(typesDescriptorClaimName);
    expect(typesDescriptor?.actions).toEqual([{ name: 'Read', enabled: true }]);

    // A separate, denied placeholder was added for identity/descriptor,
    // parented under identity — not merged into types/descriptor.
    const identityDescriptors = result.filter(
      (rc) => rc.name === 'descriptor' && rc.parentClaimName === identityClaimName
    );
    expect(identityDescriptors).toHaveLength(1);
    expect(identityDescriptors[0].actions).toEqual([]);
    expect(identityDescriptors[0].claimName).not.toBe(typesDescriptorClaimName);
  });

  it('reconnects an existing child of a missing parent, instead of orphaning it', () => {
    // "types" has no actions (missing from `existing`), but its child
    // "schoolYearType" does have actions and is present, already correctly
    // recorded with parentClaimName pointing at types' real claim URI.
    const typesClaimName = 'http://ed-fi.org/ods/identity/claims/domains/types';
    const existing: GetResourceClaimDtoV3[] = [
      {
        name: 'schoolYearType',
        claimName: `${typesClaimName}/schoolYearType`,
        parentClaimName: typesClaimName,
        actions: [{ name: 'Read', enabled: true }],
        _defaultAuthorizationStrategies: [],
        authorizationStrategyOverrides: [],
      },
    ] as unknown as GetResourceClaimDtoV3[];
    const detail: GetResourceClaimDetailDtoV3[] = [
      {
        id: 1,
        name: 'types',
        parentId: 0,
        parentName: null,
        children: [
          { id: 12, name: 'schoolYearType', parentId: 1, parentName: 'types', children: [] },
        ],
      },
    ] as unknown as GetResourceClaimDetailDtoV3[];

    const result = mergeResourceClaimsV3(existing, detail);

    const typesEntry = result.find((rc) => rc.name === 'types')!;
    const schoolYearTypeEntry = result.find((rc) => rc.name === 'schoolYearType')!;
    // The synthesized "types" placeholder reused the real URI recovered
    // from its existing child, rather than fabricating a new one — so the
    // pre-existing schoolYearType record still correctly nests under it.
    expect(typesEntry.claimName).toBe(typesClaimName);
    expect(schoolYearTypeEntry.parentClaimName).toBe(typesEntry.claimName);
  });

  it('never assigns the same claimName to two different missing parents that each have a same-named orphaned child', () => {
    // Both "courseTranscripts" and "assessments" are missing (no actions),
    // and each has a real, already-existing child that happens to be named
    // "extension" — a name collision that, without consuming a matched
    // orphan candidate, would make both placeholders resolve to the exact
    // same claimName (and therefore the same React row id downstream).
    // Which one recovers its true parent first is inherently ambiguous
    // without ids on the wire, but the two must never collide.
    const existing: GetResourceClaimDtoV3[] = [
      {
        name: 'extension',
        claimName: 'http://ed-fi.org/ods/identity/claims/domains/courseTranscripts/extension',
        parentClaimName: 'http://ed-fi.org/ods/identity/claims/domains/courseTranscripts',
        actions: [{ name: 'Read', enabled: true }],
        _defaultAuthorizationStrategies: [],
        authorizationStrategyOverrides: [],
      },
      {
        name: 'extension',
        claimName: 'http://ed-fi.org/ods/identity/claims/domains/assessments/extension',
        parentClaimName: 'http://ed-fi.org/ods/identity/claims/domains/assessments',
        actions: [{ name: 'Read', enabled: true }],
        _defaultAuthorizationStrategies: [],
        authorizationStrategyOverrides: [],
      },
    ] as unknown as GetResourceClaimDtoV3[];
    const detail: GetResourceClaimDetailDtoV3[] = [
      {
        id: 1,
        name: 'courseTranscripts',
        parentId: 0,
        parentName: null,
        children: [
          { id: 3, name: 'extension', parentId: 1, parentName: 'courseTranscripts', children: [] },
        ],
      },
      {
        id: 2,
        name: 'assessments',
        parentId: 0,
        parentName: null,
        children: [{ id: 4, name: 'extension', parentId: 2, parentName: 'assessments', children: [] }],
      },
    ] as unknown as GetResourceClaimDetailDtoV3[];

    const result = mergeResourceClaimsV3(existing, detail);

    const addedParents = result.filter(
      (rc) => rc.name === 'courseTranscripts' || rc.name === 'assessments'
    );
    expect(addedParents).toHaveLength(2);
    expect(new Set(addedParents.map((rc) => rc.claimName)).size).toBe(2);
  });
});

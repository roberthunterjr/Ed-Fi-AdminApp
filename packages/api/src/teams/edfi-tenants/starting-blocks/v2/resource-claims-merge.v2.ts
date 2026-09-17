import { GetResourceClaimDetailDtoV2, GetResourceClaimDtoV2 } from '@edanalytics/models';

// AC-439: Admin Api v2's `GET claimSets/{id}` silently excludes any
// resourceClaims item (at any depth) that has no actions associated — so
// types/descriptors like `schoolYearType` never appear on the claimset
// display. `GET resourceClaims` (see AdminApiServiceV2.getResourceClaims)
// returns the complete hierarchy regardless of actions, so we use it as the
// source of truth for which nodes exist, and fill in any node missing from
// the claimset's own (possibly pruned) `resourceClaims` tree with a
// synthesized entry that has no actions/authorization strategies at all —
// which the existing ResourceClaimsTableV2 already renders as "Denied" for
// every action column.
const buildDeniedNode = (detail: GetResourceClaimDetailDtoV2): GetResourceClaimDtoV2 =>
  ({
    // GetResourceClaimDtoV2.id is declared `string` (existing claimset
    // entries carry it as a string), but the resourceClaims-detail endpoint
    // returns a numeric id — coerce so every entry in a merged response has
    // a consistently-typed id.
    id: String(detail.id),
    name: detail.name,
    actions: [],
    authorizationStrategyOverridesForCRUD: [],
    _defaultAuthorizationStrategiesForCRUD: [],
    children: detail.children.map(buildDeniedNode),
  }) as unknown as GetResourceClaimDtoV2;

export const mergeResourceClaimsV2 = (
  existing: GetResourceClaimDtoV2[],
  detail: GetResourceClaimDetailDtoV2[]
): GetResourceClaimDtoV2[] => {
  const existingById = new Map(existing.map((rc) => [String(rc.id), rc]));
  const matchedIds = new Set<string>();

  const merged = detail.map((detailNode) => {
    const id = String(detailNode.id);
    const existingNode = existingById.get(id);
    if (!existingNode) {
      return buildDeniedNode(detailNode);
    }
    matchedIds.add(id);
    return {
      ...existingNode,
      children: mergeResourceClaimsV2(existingNode.children, detailNode.children),
    };
  });

  // The resourceClaims-detail endpoint is meant to be the complete
  // hierarchy, but if it's ever incomplete relative to what the claimset
  // itself already reports, keep whatever the claimset already had rather
  // than silently dropping it.
  const unmatchedExisting = existing.filter((rc) => !matchedIds.has(String(rc.id)));

  return [...merged, ...unmatchedExisting];
};

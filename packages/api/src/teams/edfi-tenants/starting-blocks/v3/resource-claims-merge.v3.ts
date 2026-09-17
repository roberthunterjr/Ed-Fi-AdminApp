import { GetResourceClaimDetailDtoV3, GetResourceClaimDtoV3 } from '@edanalytics/models';

// AC-439: Admin Api v3's `GET claimSets/{id}` silently excludes any
// resourceClaims item (at any depth) that has no actions associated — so
// types/descriptors like `schoolYearType` never appear on the claimset
// display. `GET resourceClaims` returns the complete hierarchy regardless of
// actions, so we use it as the source of truth for which nodes exist.
//
// Unlike V2, V3's claimset resourceClaims is a *flat* list joined by
// claimName/parentClaimName (a real claim URI) rather than nested `children`,
// and the resourceClaims-detail endpoint has no `claimName` at all — only a
// plain `name`/`parentName`/`id`. So matching existing <-> detail nodes has
// to go by plain `name`, and any node missing from the existing list needs a
// synthesized claimName manufactured for it (and used as its own children's
// parentClaimName), built from its ancestor path so it can never collide
// with a real claim URI or with a same-named node in another branch.
const SYNTHETIC_CLAIM_NAME_PREFIX = 'synthetic-resource-claim:';

const groupByParentClaimName = (resourceClaims: GetResourceClaimDtoV3[]) => {
  const byParent = new Map<string | null, GetResourceClaimDtoV3[]>();
  resourceClaims.forEach((rc) => {
    const bucket = byParent.get(rc.parentClaimName) ?? [];
    bucket.push(rc);
    byParent.set(rc.parentClaimName, bucket);
  });
  return byParent;
};

// An existing item whose own recorded parentClaimName doesn't match any
// other existing item's claimName — i.e. its real parent was itself
// excluded from this claimset response (the same actions-based exclusion
// this whole merge works around), not merely absent because we haven't
// looked at it yet.
const findOrphans = (existing: GetResourceClaimDtoV3[]) => {
  const claimNames = new Set(existing.map((rc) => rc.claimName));
  return existing.filter((rc) => rc.parentClaimName !== null && !claimNames.has(rc.parentClaimName));
};

const buildDeniedEntry = (name: string, claimName: string, parentClaimName: string | null) =>
  ({
    name,
    claimName,
    parentClaimName,
    actions: [],
    _defaultAuthorizationStrategies: [],
    authorizationStrategyOverrides: [],
  }) as unknown as GetResourceClaimDtoV3;

export const mergeResourceClaimsV3 = (
  existing: GetResourceClaimDtoV3[],
  detail: GetResourceClaimDetailDtoV3[]
): GetResourceClaimDtoV3[] => {
  // Scoping candidate matches to the exact resolved parent (rather than a
  // flat by-name map covering the whole list) keeps two same-named nodes in
  // different branches from resolving to each other.
  const existingByParentClaimName = groupByParentClaimName(existing);
  // Existing items whose real parent is missing from `existing` — used to
  // recover a missing node's real claimName from one of its own real
  // children, scoped to only genuinely orphaned candidates so an unrelated
  // same-named node elsewhere in the tree can't be mistaken for it. A copy
  // because matched orphans are removed as they're consumed below.
  const unclaimedOrphans = [...findOrphans(existing)];
  const added: GetResourceClaimDtoV3[] = [];

  const walk = (nodes: GetResourceClaimDetailDtoV3[], parentClaimName: string | null) => {
    const candidates = existingByParentClaimName.get(parentClaimName) ?? [];

    nodes.forEach((node) => {
      const existingEntry = candidates.find((rc) => rc.name === node.name);
      let resolvedClaimName: string;

      if (existingEntry) {
        resolvedClaimName = existingEntry.claimName;
      } else {
        // node has no actions, so it's missing here. Before fabricating a
        // claimName for it, check whether one of its own children is a
        // real orphan — that child's recorded parentClaimName IS this
        // node's real claim URI, known even though the node itself was
        // excluded. Reusing it (instead of a synthetic value) keeps that
        // real child correctly attached under the placeholder we add.
        //
        // Removing a matched orphan once it's consumed prevents two
        // different missing parents that happen to share a same-named
        // orphan candidate from both resolving to that same real claimName
        // (which would otherwise collide as the same claimName/row id).
        // Without ids on the wire there's no way to tell which of two such
        // candidates a given missing parent *actually* owns — this only
        // guarantees the two placeholders never collide, not which one
        // recovers correctly.
        const childNames = new Set(node.children.map((child) => child.name));
        const realChildIndex = unclaimedOrphans.findIndex((rc) => childNames.has(rc.name));
        const realChild = realChildIndex === -1 ? undefined : unclaimedOrphans[realChildIndex];
        if (realChild) {
          unclaimedOrphans.splice(realChildIndex, 1);
        }
        resolvedClaimName =
          realChild?.parentClaimName ??
          `${SYNTHETIC_CLAIM_NAME_PREFIX}${parentClaimName ?? 'root'}/${node.name}`;
        added.push(buildDeniedEntry(node.name, resolvedClaimName, parentClaimName));
      }

      walk(node.children, resolvedClaimName);
    });
  };

  walk(detail, null);

  return [...existing, ...added];
};

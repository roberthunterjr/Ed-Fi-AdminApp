/** TypeORM's object syntax for `relations`: `true` loads a relation, a nested object also loads its relations. */
export type FindOptionsRelationTree = { [relation: string]: true | FindOptionsRelationTree };

/**
 * Converts dotted relation paths (`['ods', 'ods.edfiTenant']`) into the object syntax TypeORM 1.x
 * requires (`{ ods: { edfiTenant: true } }`); it rejects the old string-array syntax.
 */
export const toFindOptionsRelations = (paths: string[]): FindOptionsRelationTree => {
  const tree: FindOptionsRelationTree = {};
  for (const path of paths) {
    let node = tree;
    for (const name of path.split('.')) {
      const child = node[name];
      if (child === undefined || child === true) {
        node[name] = {};
      }
      node = node[name] as FindOptionsRelationTree;
    }
  }
  return collapseLeaves(tree);
};

/** Turns relations with nothing nested under them into `true`. */
const collapseLeaves = (tree: FindOptionsRelationTree): FindOptionsRelationTree =>
  Object.fromEntries(
    Object.entries(tree).map(([name, child]) => {
      const nested = collapseLeaves(child as FindOptionsRelationTree);
      return [name, Object.keys(nested).length ? nested : true];
    }),
  );

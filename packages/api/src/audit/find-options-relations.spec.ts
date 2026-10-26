import { toFindOptionsRelations } from './find-options-relations';

describe('toFindOptionsRelations', () => {
  it('turns plain relation names into flags', () => {
    expect(toFindOptionsRelations(['role', 'team'])).toEqual({ role: true, team: true });
  });

  it('nests a dotted path', () => {
    expect(toFindOptionsRelations(['ods.edfiTenant'])).toEqual({ ods: { edfiTenant: true } });
  });

  it('merges paths that share a prefix, in either order', () => {
    const expected = { ods: { edfiTenant: true, sbEnvironment: true } };
    expect(toFindOptionsRelations(['ods', 'ods.edfiTenant', 'ods.sbEnvironment'])).toEqual(
      expected,
    );
    expect(toFindOptionsRelations(['ods.edfiTenant', 'ods', 'ods.sbEnvironment'])).toEqual(
      expected,
    );
  });

  it('nests deeper paths', () => {
    expect(toFindOptionsRelations(['edorg.ods.edfiTenant'])).toEqual({
      edorg: { ods: { edfiTenant: true } },
    });
  });

  it('ignores duplicates', () => {
    expect(toFindOptionsRelations(['role', 'role', 'ods.edfiTenant', 'ods.edfiTenant'])).toEqual({
      role: true,
      ods: { edfiTenant: true },
    });
  });

  it('returns an empty object for no paths', () => {
    expect(toFindOptionsRelations([])).toEqual({});
  });

  it('never returns an array, which TypeORM 1.x rejects', () => {
    expect(Array.isArray(toFindOptionsRelations(['role']))).toBe(false);
  });
});

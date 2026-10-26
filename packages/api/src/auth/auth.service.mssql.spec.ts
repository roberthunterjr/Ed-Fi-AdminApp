import 'reflect-metadata';

jest.mock('config', () => {
  const config = { DB_ENGINE: 'mssql' };
  return { __esModule: true, ...config, default: config };
});

import { AuthService } from './auth.service';

/**
 * MSSQL binds a comma-joined string as a single nvarchar, so `IN ('1,2,3')` fails with
 * "Conversion failed when converting the nvarchar value '1,2,3' to data type int" as soon as
 * a team owns more than one id. The query builders must receive real arrays instead.
 */
describe('AuthService.constructTeamOwnerships (mssql)', () => {
  const chain = (result: unknown[] = []) => {
    const qb = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
    };
    return qb;
  };

  const build = (ownerships: object[], edorgs: object[] = []) => {
    const edorgQb = chain(edorgs);
    const closureQb = chain();
    const service = new AuthService(
      { findBy: jest.fn().mockResolvedValue([]) } as never,
      { findBy: jest.fn().mockResolvedValue([{ id: 3, sbEnvironmentId: 1 }]) } as never,
      { createQueryBuilder: jest.fn().mockReturnValue(edorgQb) } as never,
      { createQueryBuilder: jest.fn().mockReturnValue(closureQb) } as never,
      { find: jest.fn().mockResolvedValue(ownerships) } as never,
      {} as never,
      {} as never,
      { getTreeRepository: jest.fn().mockReturnValue({}) } as never,
      { get: jest.fn(), set: jest.fn(), del: jest.fn() } as never,
    );
    return { service, edorgQb, closureQb };
  };

  const privilegeIds = ['team.sb-environment.edfi-tenant.ods:read'];
  const odsOwnership = {
    ods: { id: 7, edfiTenantId: 3 },
    role: { privilegeIds, privileges: privilegeIds.map((code) => ({ code })) },
  };
  const rootEdorgs = [1, 2, 3, 4, 5].map((id) => ({ id, odsId: 7, parentId: null }));

  it('passes arrays, not comma-joined strings, when an ODS ownership has several edorgs', async () => {
    const { service, edorgQb, closureQb } = build([odsOwnership], rootEdorgs);

    await service.constructTeamOwnerships(1);

    const [, , , joinParams] = edorgQb.leftJoin.mock.calls[0];
    expect(joinParams).toEqual({ edorgs: [-1] });
    expect(edorgQb.where.mock.calls[0][0]).toContain('IN (:...odss)');
    expect(edorgQb.where.mock.calls[0][1]).toEqual({ odss: [7] });

    const [closureSql, closureParams] = closureQb.andWhere.mock.calls[0];
    expect(closureSql).toContain('IN (:...ancestors)');
    expect(closureSql).toContain('IN (:...descendants)');
    expect(closureParams).toEqual({ ancestors: [1, 2, 3, 4, 5], descendants: [1, 2, 3, 4, 5] });
  });

  it('keeps every statement under the 2,100-parameter limit for large edorg sets', async () => {
    const manyEdorgs = Array.from({ length: 1200 }, (_, i) => ({
      id: i + 1,
      odsId: 7,
      parentId: null,
    }));
    const { service, closureQb } = build([odsOwnership], manyEdorgs);

    await service.constructTeamOwnerships(1);

    const batches = closureQb.andWhere.mock.calls.map(([, params]) => params);
    expect(batches.length).toBeGreaterThan(1);
    batches.forEach(({ ancestors, descendants }) => {
      expect(ancestors.length + descendants.length).toBeLessThan(2100);
    });
    const covered = new Set(batches.flatMap(({ ancestors }) => ancestors));
    expect(covered.size).toBe(1200);
  });

  it('never renders an empty IN () when the team owns nothing', async () => {
    const { service, edorgQb, closureQb } = build([]);

    await service.constructTeamOwnerships(1);

    expect(edorgQb.where.mock.calls[0][1]).toEqual({ odss: [-1] });
    expect(closureQb.andWhere.mock.calls[0][1]).toEqual({ ancestors: [-1], descendants: [-1] });
  });
});

import 'reflect-metadata';
import { QueryRunner } from 'typeorm';
import { RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000 } from './1791417600000-RemoveIntegrationProviderPrivilegesFromGlobalAdmin';
import { AddMissingPrivilegesToGlobalAdmin1791158400000 } from './1791158400000-AddMissingPrivilegesToGlobalAdmin';
import { AC644_ALL_PRIVILEGE_CODES } from '../shared/ac644-privilege-snapshot';
import { GLOBAL_ADMIN_WITHHELD_PRIVILEGE_CODES } from '../shared/global-admin-withheld-privileges';
import { runMigrationSmokeTest } from '../../../test/helpers/migration-smoke-test.helper';

runMigrationSmokeTest(RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000);

/** QueryRunner whose SELECT returns `selectRows`; UPDATE calls are recorded. */
const queryRunnerReturning = (selectRows: { privilegeIds: string[] | null }[]) => {
  const query = jest.fn(async (sql: string) => (sql.startsWith('SELECT') ? selectRows : undefined));
  return { query, queryRunner: { query } as unknown as QueryRunner };
};
const updateCalls = (query: jest.Mock) =>
  query.mock.calls.filter(([sql]) => (sql as string).startsWith('UPDATE'));

describe('RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000 (pgsql)', () => {
  const migration = new RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000();

  describe('up()', () => {
    it('only selects role 2 when it is a UserGlobal role', async () => {
      const { query, queryRunner } = queryRunnerReturning([]);
      await migration.up(queryRunner);
      expect(query).toHaveBeenCalledWith(
        `SELECT "privilegeIds" FROM "role" WHERE "id" = $1 AND "type" = $2`,
        [2, '"UserGlobal"']
      );
    });

    it('does nothing when role 2 is missing or not a UserGlobal role', async () => {
      const { query, queryRunner } = queryRunnerReturning([]);
      await migration.up(queryRunner);
      expect(updateCalls(query)).toHaveLength(0);
    });

    it('removes the integration-provider codes and keeps every other code in order', async () => {
      const current = [
        'me:read',
        'integration-provider:read',
        'team.integration-provider.application:read',
        'role:read',
        'legacy:code',
      ];
      const { query, queryRunner } = queryRunnerReturning([{ privilegeIds: current }]);

      await migration.up(queryRunner);

      const [[sql, [written, id]]] = updateCalls(query);
      expect(sql).toBe(`UPDATE "role" SET "privilegeIds" = $1 WHERE "id" = $2`);
      expect(id).toBe(2);
      expect(written).toEqual(['me:read', 'role:read', 'legacy:code']);
    });

    it('writes nothing when role 2 holds none of the withheld codes', async () => {
      const { query, queryRunner } = queryRunnerReturning([{ privilegeIds: ['me:read'] }]);
      await migration.up(queryRunner);
      expect(updateCalls(query)).toHaveLength(0);
    });

    it('writes nothing when privilegeIds is null', async () => {
      const { query, queryRunner } = queryRunnerReturning([{ privilegeIds: null }]);
      await migration.up(queryRunner);
      expect(updateCalls(query)).toHaveLength(0);
    });

    it('leaves role 2 with every AC-644 code except the withheld ones after the backfill', async () => {
      const backfill = queryRunnerReturning([{ privilegeIds: [] }]);
      await new AddMissingPrivilegesToGlobalAdmin1791158400000().up(backfill.queryRunner);
      const [[, [backfilled]]] = updateCalls(backfill.query);

      const { query, queryRunner } = queryRunnerReturning([{ privilegeIds: backfilled }]);
      await migration.up(queryRunner);

      const [[, [written]]] = updateCalls(query);
      expect(written).toEqual(
        AC644_ALL_PRIVILEGE_CODES.filter((code) => !GLOBAL_ADMIN_WITHHELD_PRIVILEGE_CODES.includes(code))
      );
      expect(written).not.toContain('integration-provider:read');
    });
  });

  describe('down()', () => {
    it('re-adds the withheld codes without duplicating any', async () => {
      const current = ['me:read', 'integration-provider:read'];
      const { query, queryRunner } = queryRunnerReturning([{ privilegeIds: current }]);

      await migration.down(queryRunner);

      const [[, [written]]] = updateCalls(query);
      expect(written.slice(0, current.length)).toEqual(current);
      expect(new Set(written)).toEqual(new Set([...current, ...GLOBAL_ADMIN_WITHHELD_PRIVILEGE_CODES]));
      expect(written).toHaveLength(new Set(written).size);
    });

    it('does nothing when role 2 is missing or not a UserGlobal role', async () => {
      const { query, queryRunner } = queryRunnerReturning([]);
      await migration.down(queryRunner);
      expect(updateCalls(query)).toHaveLength(0);
    });
  });
});

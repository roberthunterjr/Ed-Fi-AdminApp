import 'reflect-metadata';
import { QueryRunner } from 'typeorm';
import { RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000 } from './1791417600000-RemoveIntegrationProviderPrivilegesFromGlobalAdmin';
import { AddMissingPrivilegesToGlobalAdmin1791158400000 } from './1791158400000-AddMissingPrivilegesToGlobalAdmin';
import { AC644_ALL_PRIVILEGE_CODES } from '../shared/ac644-privilege-snapshot';
import { GLOBAL_ADMIN_WITHHELD_PRIVILEGE_CODES } from '../shared/global-admin-withheld-privileges';
import { runMigrationSmokeTest } from '../../../test/helpers/migration-smoke-test.helper';

runMigrationSmokeTest(RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000);

/** QueryRunner whose SELECT returns `selectRows`; UPDATE calls are recorded. */
const queryRunnerReturning = (selectRows: { privilegeIds: string | null }[]) => {
  const query = jest.fn(async (sql: string) => (sql.startsWith('SELECT') ? selectRows : undefined));
  return { query, queryRunner: { query } as unknown as QueryRunner };
};
const updateCalls = (query: jest.Mock) =>
  query.mock.calls.filter(([sql]) => (sql as string).startsWith('UPDATE'));

describe('RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000 (mssql)', () => {
  const migration = new RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000();

  describe('up()', () => {
    it('only selects role 2 when it is a UserGlobal role', async () => {
      const { query, queryRunner } = queryRunnerReturning([]);
      await migration.up(queryRunner);
      expect(query).toHaveBeenCalledWith(
        `SELECT [privilegeIds] FROM [role] WHERE [id] = @0 AND [type] = @1`,
        [2, '"UserGlobal"']
      );
    });

    it('does nothing when role 2 is missing or not a UserGlobal role', async () => {
      const { query, queryRunner } = queryRunnerReturning([]);
      await migration.up(queryRunner);
      expect(updateCalls(query)).toHaveLength(0);
    });

    it('removes the integration-provider codes from the comma-separated list and keeps the rest in order', async () => {
      const current = [
        'me:read',
        'integration-provider:read',
        'team.integration-provider.application:read',
        'role:read',
        'legacy:code',
      ];
      const { query, queryRunner } = queryRunnerReturning([{ privilegeIds: current.join(',') }]);

      await migration.up(queryRunner);

      const [[sql, [written, id]]] = updateCalls(query);
      expect(sql).toBe(`UPDATE [role] SET [privilegeIds] = @0 WHERE [id] = @1`);
      expect(id).toBe(2);
      expect(written).toBe('me:read,role:read,legacy:code');
    });

    it('does not remove codes that merely contain a withheld code as a substring', async () => {
      const current = 'legacy-integration-provider:read-all,integration-provider:read';
      const { query, queryRunner } = queryRunnerReturning([{ privilegeIds: current }]);
      await migration.up(queryRunner);
      const [[, [written]]] = updateCalls(query);
      expect(written).toBe('legacy-integration-provider:read-all');
    });

    it.each([
      ['an empty string', ''],
      ['null', null],
      ['a list without withheld codes', 'me:read,role:read'],
    ])('writes nothing for %s', async (_, value) => {
      const { query, queryRunner } = queryRunnerReturning([{ privilegeIds: value }]);
      await migration.up(queryRunner);
      expect(updateCalls(query)).toHaveLength(0);
    });

    it('leaves role 2 with every AC-644 code except the withheld ones after the backfill', async () => {
      const backfill = queryRunnerReturning([{ privilegeIds: '' }]);
      await new AddMissingPrivilegesToGlobalAdmin1791158400000().up(backfill.queryRunner);
      const [[, [backfilled]]] = updateCalls(backfill.query);

      const { query, queryRunner } = queryRunnerReturning([{ privilegeIds: backfilled as string }]);
      await migration.up(queryRunner);

      const [[, [written]]] = updateCalls(query);
      expect(written).toBe(
        AC644_ALL_PRIVILEGE_CODES.filter((code) => !GLOBAL_ADMIN_WITHHELD_PRIVILEGE_CODES.includes(code)).join(',')
      );
    });
  });

  describe('down()', () => {
    it('re-adds the withheld codes without duplicating any', async () => {
      const { query, queryRunner } = queryRunnerReturning([
        { privilegeIds: 'me:read,integration-provider:read' },
      ]);

      await migration.down(queryRunner);

      const [[, [written]]] = updateCalls(query);
      const codes = (written as string).split(',');
      expect(codes.slice(0, 2)).toEqual(['me:read', 'integration-provider:read']);
      expect(new Set(codes)).toEqual(
        new Set(['me:read', ...GLOBAL_ADMIN_WITHHELD_PRIVILEGE_CODES])
      );
      expect(codes).toHaveLength(new Set(codes).size);
    });
  });
});

import 'reflect-metadata';
import { QueryRunner } from 'typeorm';
import { OdsManageSyncQueue1792100000000 } from './1792100000000-OdsManageSyncQueue';
import { runMigrationSmokeTest } from '../../../test/helpers/migration-smoke-test.helper';

runMigrationSmokeTest(OdsManageSyncQueue1792100000000);

const makeQueryRunner = (hasArchive: boolean): QueryRunner =>
  ({
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes("to_regclass('pgboss.archive')")) {
        return Promise.resolve([{ hasArchive }]);
      }
      return Promise.resolve([{}]);
    }),
  }) as unknown as QueryRunner;

const sqlCalls = (queryRunner: QueryRunner): string[] =>
  (queryRunner.query as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as string);

const metadataValue = (queryRunner: QueryRunner): string => {
  const call = (queryRunner.query as jest.Mock).mock.calls.find(
    (c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO "typeorm_metadata"'),
  );
  return (call?.[1] as string[])[3];
};

describe.each([
  ['legacy (pgboss.archive exists)', true],
  ['v12 (no pgboss.archive)', false],
])('OdsManageSyncQueue1792100000000 %s', (_label, hasArchive) => {
  describe('up()', () => {
    it('drops and recreates sb_sync_queue including ods-manage jobs', async () => {
      const queryRunner = makeQueryRunner(hasArchive);
      await new OdsManageSyncQueue1792100000000().up(queryRunner);
      const calls = sqlCalls(queryRunner);

      const dropIdx = calls.findIndex((s) => s.includes('DROP MATERIALIZED VIEW "sb_sync_queue"'));
      const createIdx = calls.findIndex((s) =>
        s.includes('CREATE MATERIALIZED VIEW "sb_sync_queue"'),
      );
      expect(dropIdx).toBeGreaterThanOrEqual(0);
      expect(createIdx).toBeGreaterThan(dropIdx);
      const create = calls[createIdx];
      expect(create).toContain("where name in ('sbe-sync', 'edfi-tenant-sync', 'ods-manage')");
      expect(create).toContain(
        `case when job."name" = 'sbe-sync' then 'SbEnvironment' when job."name" = 'ods-manage' then 'OdsManage' else 'EdfiTenant' end`,
      );
      expect(create).not.toContain("'sbe-sync', 'edfi-tenant-sync')");
      if (hasArchive) {
        expect(create).toContain('from pgboss.archive');
        expect(create).not.toContain('created_on as createdon');
      } else {
        expect(create).not.toContain('from pgboss.archive');
        expect(create).toContain('created_on as createdon');
      }
    });

    it('recreates the sb_sync_queue_tsvector index after the view', async () => {
      const queryRunner = makeQueryRunner(hasArchive);
      await new OdsManageSyncQueue1792100000000().up(queryRunner);
      const calls = sqlCalls(queryRunner);
      const createIdx = calls.findIndex((s) =>
        s.includes('CREATE MATERIALIZED VIEW "sb_sync_queue"'),
      );
      const indexIdx = calls.findIndex((s) => s.includes('CREATE INDEX "sb_sync_queue_tsvector"'));
      expect(indexIdx).toBeGreaterThan(createIdx);
      expect(calls[indexIdx]).toContain('USING gin');
    });

    it('recreates the refresh triggers with ods-manage in the WHEN clauses', async () => {
      const queryRunner = makeQueryRunner(hasArchive);
      await new OdsManageSyncQueue1792100000000().up(queryRunner);
      const calls = sqlCalls(queryRunner);
      expect(
        calls.some((s) =>
          s.includes('DROP TRIGGER IF EXISTS "sb_sync_queue_refresh_insert_update"'),
        ),
      ).toBe(true);
      expect(
        calls.some((s) => s.includes('DROP TRIGGER IF EXISTS "sb_sync_queue_refresh_delete"')),
      ).toBe(true);
      const triggerSql = calls.filter((s) => s.includes('CREATE TRIGGER')).join('\n');
      expect(triggerSql).toContain(
        `WHEN (NEW."name" = 'sbe-sync' OR NEW."name" = 'edfi-tenant-sync' OR NEW."name" = 'ods-manage')`,
      );
      expect(triggerSql).toContain(
        `WHEN (OLD."name" = 'sbe-sync' OR OLD."name" = 'edfi-tenant-sync' OR OLD."name" = 'ods-manage')`,
      );
    });

    it('rewrites the typeorm_metadata row for the materialized view', async () => {
      const queryRunner = makeQueryRunner(hasArchive);
      await new OdsManageSyncQueue1792100000000().up(queryRunner);
      const calls = sqlCalls(queryRunner);
      expect(calls.some((s) => s.includes('DELETE FROM "typeorm_metadata"'))).toBe(true);
      const value = metadataValue(queryRunner);
      expect(value).toContain("'ods-manage'");
      expect(value).toContain("'OdsManage'");
    });
  });

  describe('down()', () => {
    it('restores the previous definition without ods-manage', async () => {
      const queryRunner = makeQueryRunner(hasArchive);
      await new OdsManageSyncQueue1792100000000().down(queryRunner);
      const calls = sqlCalls(queryRunner);
      const create = calls.find((s) => s.includes('CREATE MATERIALIZED VIEW "sb_sync_queue"'));
      expect(create).toBeDefined();
      expect(create).toContain("where name in ('sbe-sync', 'edfi-tenant-sync')");
      expect(create).not.toContain('ods-manage');
      expect(create).not.toContain('OdsManage');
      expect(create).toContain(
        `case when job."name" = 'sbe-sync' then 'SbEnvironment' else 'EdfiTenant' end`,
      );
      const triggerSql = calls.filter((s) => s.includes('CREATE TRIGGER')).join('\n');
      expect(triggerSql).toContain(
        `WHEN (NEW."name" = 'sbe-sync' OR NEW."name" = 'edfi-tenant-sync')`,
      );
      expect(triggerSql).not.toContain('ods-manage');
      expect(metadataValue(queryRunner)).not.toContain('ods-manage');
    });
  });
});

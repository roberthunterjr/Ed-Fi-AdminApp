import 'reflect-metadata';
import { OdsManageSyncQueue1792100000000 } from './1792100000000-OdsManageSyncQueue';
import {
  createMockQueryRunner,
  runMigrationSmokeTest,
} from '../../../test/helpers/migration-smoke-test.helper';

runMigrationSmokeTest(OdsManageSyncQueue1792100000000);

describe('OdsManageSyncQueue1792100000000 (mssql) SQL', () => {
  const sqlOf = async (direction: 'up' | 'down') => {
    const queryRunner = createMockQueryRunner();
    await new OdsManageSyncQueue1792100000000()[direction](queryRunner);
    return (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => String(sql)).join('\n');
  };

  it('up() recreates the view including ods-manage', async () => {
    const sql = await sqlOf('up');
    expect(sql).toContain('CREATE VIEW [sb_sync_queue]');
    expect(sql).toContain("WHEN jq.[name] = 'ods-manage' THEN 'OdsManage'");
    expect(sql).toContain("IN ('sbe-sync', 'edfi-tenant-sync', 'ods-manage')");
  });

  it('down() restores the previous definition', async () => {
    const sql = await sqlOf('down');
    expect(sql).toContain("IN ('sbe-sync', 'edfi-tenant-sync')");
    expect(sql).not.toContain('OdsManage');
  });
});

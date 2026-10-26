import 'reflect-metadata';
import { CreateAuditLog1792000000001 } from './1792000000001-CreateAuditLog';
import {
  createMockQueryRunner,
  runMigrationSmokeTest,
} from '../../../test/helpers/migration-smoke-test.helper';

runMigrationSmokeTest(CreateAuditLog1792000000001);

describe('CreateAuditLog1792000000001 (pgsql) SQL', () => {
  const sqlFor = async (direction: 'up' | 'down') => {
    const queryRunner = createMockQueryRunner();
    await new CreateAuditLog1792000000001()[direction](queryRunner);
    return (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => String(sql)).join('\n');
  };

  it('creates the audit_log table with every column and both indexes', async () => {
    const sql = await sqlFor('up');
    expect(sql).toContain('CREATE TABLE "audit_log"');
    for (const column of [
      'id',
      'eventType',
      'timestamp',
      'actorUsername',
      'actorType',
      'sourceIpAddress',
      'httpVerb',
      'httpUrl',
      'statusCode',
      'oidcIssuer',
      'details',
    ]) {
      expect(sql).toContain(`"${column}"`);
    }
    expect(sql).toContain('IDX_audit_log_timestamp');
    expect(sql).toContain('IDX_audit_log_actorUsername');
    expect(sql).not.toContain('FOREIGN KEY');
  });

  it('stores the timestamp as an absolute instant (timestamptz)', async () => {
    const sql = await sqlFor('up');
    expect(sql).toMatch(/"timestamp"\s+TIMESTAMP WITH TIME ZONE NOT NULL/);
  });

  it('drops the indexes and table on down', async () => {
    const sql = await sqlFor('down');
    expect(sql).toContain('DROP INDEX "IDX_audit_log_actorUsername"');
    expect(sql).toContain('DROP INDEX "IDX_audit_log_timestamp"');
    expect(sql).toContain('DROP TABLE "audit_log"');
  });
});

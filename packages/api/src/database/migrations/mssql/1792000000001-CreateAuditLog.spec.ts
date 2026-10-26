import 'reflect-metadata';
import { CreateAuditLog1792000000001 } from './1792000000001-CreateAuditLog';
import {
  createMockQueryRunner,
  runMigrationSmokeTest,
} from '../../../test/helpers/migration-smoke-test.helper';

runMigrationSmokeTest(CreateAuditLog1792000000001);

describe('CreateAuditLog1792000000001 (mssql) SQL', () => {
  const sqlFor = async (direction: 'up' | 'down') => {
    const queryRunner = createMockQueryRunner();
    await new CreateAuditLog1792000000001()[direction](queryRunner);
    return (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => String(sql)).join('\n');
  };

  it('creates the audit_log table with every column and both indexes', async () => {
    const sql = await sqlFor('up');
    expect(sql).toContain('CREATE TABLE [audit_log]');
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
      expect(sql).toContain(`[${column}]`);
    }
    expect(sql).toContain('BIGINT IDENTITY(1,1)');
    expect(sql).toContain('[details]         NVARCHAR(max)');
    expect(sql).toContain('IDX_audit_log_timestamp');
    expect(sql).toContain('IDX_audit_log_actorUsername');
    expect(sql).not.toContain('FOREIGN KEY');
  });

  it('stores the timestamp as datetimeoffset so the instant does not depend on the host time zone', async () => {
    const sql = await sqlFor('up');
    expect(sql).toMatch(/\[timestamp\]\s+datetimeoffset NOT NULL/);
    expect(sql).not.toContain('datetime2');
  });

  it('keeps the other column types unchanged', async () => {
    const sql = await sqlFor('up');
    for (const definition of [
      /\[id\]\s+BIGINT IDENTITY\(1,1\) NOT NULL/,
      /\[eventType\]\s+NVARCHAR\(30\) NOT NULL/,
      /\[actorUsername\]\s+NVARCHAR\(256\) NULL/,
      /\[actorType\]\s+NVARCHAR\(20\) NULL/,
      /\[sourceIpAddress\]\s+NVARCHAR\(45\) NULL/,
      /\[httpVerb\]\s+NVARCHAR\(10\) NULL/,
      /\[httpUrl\]\s+NVARCHAR\(2048\) NULL/,
      /\[statusCode\]\s+INT NULL/,
      /\[oidcIssuer\]\s+NVARCHAR\(512\) NULL/,
      /\[details\]\s+NVARCHAR\(max\) NULL/,
    ]) {
      expect(sql).toMatch(definition);
    }
  });

  it('drops the indexes and table on down, guarded by OBJECT_ID', async () => {
    const sql = await sqlFor('down');
    expect(sql).toContain('DROP INDEX [IDX_audit_log_actorUsername] ON [audit_log]');
    expect(sql).toContain('DROP INDEX [IDX_audit_log_timestamp] ON [audit_log]');
    expect(sql).toContain('DROP TABLE [audit_log]');
    expect(sql).toContain("IF OBJECT_ID('[audit_log]', 'U') IS NOT NULL");
  });
});

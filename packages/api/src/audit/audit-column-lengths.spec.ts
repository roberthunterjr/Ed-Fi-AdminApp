import 'reflect-metadata';
import { AuditLog } from '@edanalytics/models-server';
import { getMetadataArgsStorage, QueryRunner } from 'typeorm';
import { createMockQueryRunner } from '../test/helpers/migration-smoke-test.helper';
import { CreateAuditLog1792000000001 as MssqlCreateAuditLog } from '../database/migrations/mssql/1792000000001-CreateAuditLog';
import { CreateAuditLog1792000000001 as PgsqlCreateAuditLog } from '../database/migrations/pgsql/1792000000001-CreateAuditLog';
import { AUDIT_COLUMN_LENGTHS } from './audit-column-lengths';

const upSql = async (migration: { up(queryRunner: QueryRunner): Promise<void> }) => {
  const queryRunner = createMockQueryRunner();
  await migration.up(queryRunner);
  return (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => String(sql)).join('\n');
};

describe('AUDIT_COLUMN_LENGTHS', () => {
  const entries = Object.entries(AUDIT_COLUMN_LENGTHS);

  it('covers every length-limited column of the AuditLog entity with its declared length', () => {
    const limited = getMetadataArgsStorage()
      .columns.filter(
        (column) =>
          column.target === AuditLog &&
          column.options.length &&
          // nvarchar(MAX) is unbounded, not a numeric limit
          String(column.options.length).toUpperCase() !== 'MAX',
      )
      .map((column) => [column.propertyName, Number(column.options.length)]);

    expect(Object.fromEntries(limited)).toEqual(AUDIT_COLUMN_LENGTHS);
  });

  it('matches the PostgreSQL migration', async () => {
    const sql = await upSql(new PgsqlCreateAuditLog());
    for (const [column, length] of entries) {
      expect(sql).toMatch(new RegExp(`"${column}"\\s+character varying\\(${length}\\)`));
    }
  });

  it('matches the SQL Server migration', async () => {
    const sql = await upSql(new MssqlCreateAuditLog());
    for (const [column, length] of entries) {
      expect(sql).toMatch(new RegExp(`\\[${column}\\]\\s+NVARCHAR\\(${length}\\)`));
    }
  });
});

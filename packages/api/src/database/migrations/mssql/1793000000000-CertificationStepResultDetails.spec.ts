import 'reflect-metadata';
import { CertificationStepResultDetails1793000000000 } from './1793000000000-CertificationStepResultDetails';
import {
  createMockQueryRunner,
  runMigrationSmokeTest,
} from '../../../test/helpers/migration-smoke-test.helper';

runMigrationSmokeTest(CertificationStepResultDetails1793000000000);

describe('CertificationStepResultDetails1793000000000 (mssql) SQL', () => {
  const sqlOf = async (direction: 'up' | 'down') => {
    const queryRunner = createMockQueryRunner();
    await new CertificationStepResultDetails1793000000000()[direction](queryRunner);
    return (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => String(sql));
  };

  it('clears leftover errors before adding the required kind column', async () => {
    const sql = await sqlOf('up');
    const clear = sql.findIndex((s) => s.includes('DELETE FROM [cert].[scenario_step_error]'));
    const kind = sql.findIndex((s) => s.includes('[kind] NVARCHAR(50) NOT NULL'));
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(kind).toBeGreaterThan(clear);
  });

  it('adds the response status and encrypted snapshot to the step row', async () => {
    const sql = (await sqlOf('up')).join('\n');
    expect(sql).toContain('ALTER TABLE [cert].[scenario_step] ADD [responseStatus] INT NULL');
    expect(sql).toContain('ALTER TABLE [cert].[scenario_step] ADD [responseSnapshot] NVARCHAR(max) NULL');
  });

  it('replaces the old error columns with kind, field, expected, observed and message', async () => {
    const sql = (await sqlOf('up')).join('\n');
    for (const column of ['property', 'validation', 'description']) {
      expect(sql).toContain(`DROP COLUMN [${column}]`);
    }
    expect(sql).toContain('[field] NVARCHAR(500) NULL');
    for (const column of ['expected', 'observed', 'message']) {
      expect(sql).toContain(`[${column}] NVARCHAR(max) NULL`);
    }
  });

  it('down restores the CertificationStepRuns1792000000000 error columns', async () => {
    const sql = (await sqlOf('down')).join('\n');
    expect(sql).toContain('[property] NVARCHAR(500) NULL');
    expect(sql).toContain('[description] NVARCHAR(max) NULL');
    expect(sql).toContain('[validation] NVARCHAR(max) NULL');
    for (const column of ['kind', 'field', 'expected', 'observed', 'message', 'responseStatus', 'responseSnapshot']) {
      expect(sql).toContain(`DROP COLUMN [${column}]`);
    }
  });
});

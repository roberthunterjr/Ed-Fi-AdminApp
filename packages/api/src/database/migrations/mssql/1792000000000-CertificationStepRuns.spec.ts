import 'reflect-metadata';
import { CertificationStepRuns1792000000000 } from './1792000000000-CertificationStepRuns';
import {
  createMockQueryRunner,
  runMigrationSmokeTest,
} from '../../../test/helpers/migration-smoke-test.helper';

runMigrationSmokeTest(CertificationStepRuns1792000000000);

describe('CertificationStepRuns1792000000000 (mssql) SQL', () => {
  const upSql = async () => {
    const queryRunner = createMockQueryRunner();
    await new CertificationStepRuns1792000000000().up(queryRunner);
    return (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => String(sql)).join('\n');
  };

  it('avoids a second cascade path from edfi_tenant (SQL Server error 1785)', async () => {
    const sql = await upSql();
    expect(sql).toMatch(/REFERENCES \[edfi_tenant\]\(\[id\]\)\s+ON DELETE CASCADE/);
    expect(sql).toMatch(/REFERENCES \[ods\]\(\[id\]\)\s+ON DELETE NO ACTION/);
  });

  it('uses filtered unique indexes for the nullable odsId', async () => {
    const sql = await upSql();
    expect(sql).toMatch(/UNIQUE INDEX \[UQ_cert_certification_process_ods\][\s\S]*WHERE \[odsId\] IS NOT NULL/);
    expect(sql).toMatch(/UNIQUE INDEX \[UQ_cert_certification_process_no_ods\][\s\S]*WHERE \[odsId\] IS NULL/);
  });
});

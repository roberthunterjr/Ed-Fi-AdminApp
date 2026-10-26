import 'reflect-metadata';
import { CertificationStepRuns1792000000000 } from './1792000000000-CertificationStepRuns';
import {
  createMockQueryRunner,
  runMigrationSmokeTest,
} from '../../../test/helpers/migration-smoke-test.helper';

runMigrationSmokeTest(CertificationStepRuns1792000000000);

describe('CertificationStepRuns1792000000000 (pgsql) SQL', () => {
  const upSql = async () => {
    const queryRunner = createMockQueryRunner();
    await new CertificationStepRuns1792000000000().up(queryRunner);
    return (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => String(sql)).join('\n');
  };

  it('drops the unlinked certification_ods_api table', async () => {
    expect(await upSql()).toContain('DROP TABLE IF EXISTS "cert"."certification_ods_api"');
  });

  it('keys the process on the real tenant and ODS, with null-safe uniqueness', async () => {
    const sql = await upSql();
    expect(sql).toContain('REFERENCES "edfi_tenant"("id")');
    expect(sql).toContain('REFERENCES "ods"("id")');
    expect(sql).toMatch(/UNIQUE INDEX "UQ_cert_certification_process_ods"[\s\S]*WHERE "odsId" IS NOT NULL/);
    expect(sql).toMatch(/UNIQUE INDEX "UQ_cert_certification_process_no_ods"[\s\S]*WHERE "odsId" IS NULL/);
  });

  it('makes a re-run replace the step row and records the step file name', async () => {
    const sql = await upSql();
    expect(sql).toContain('UNIQUE ("certificationProcessId", "stepId")');
    expect(sql).toContain('ADD "fileName" character varying(255) NOT NULL');
  });
});

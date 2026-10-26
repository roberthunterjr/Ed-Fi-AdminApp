import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AC-466: makes the certification run tables usable.
 *
 * The run tables were created by CertificationSchema1778026000000 but never written,
 * so they are dropped and recreated in their new shape. Catalog rows are cleared so the
 * next startup re-syncs them with the new step_catalog.fileName column.
 */
export class CertificationStepRuns1792000000000 implements MigrationInterface {
  name = 'CertificationStepRuns1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cert"."scenario_step_error"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cert"."scenario_step"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cert"."certification_process_scenario"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cert"."certification_process"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cert"."certification_ods_api"`);

    // Cascades to areas, scenarios, steps and parameters; the next startup re-syncs them.
    await queryRunner.query(`DELETE FROM "cert"."catalog_version"`);
    await queryRunner.query(
      `ALTER TABLE "cert"."step_catalog" ADD "fileName" character varying(255) NOT NULL`
    );

    await queryRunner.query(`
      CREATE TABLE "cert"."certification_process" (
        "certificationProcessId" SERIAL NOT NULL,
        "edfiTenantId"           integer NOT NULL,
        "odsId"                  integer,
        "catalogVersionId"       integer NOT NULL,
        "status"                 character varying(50) NOT NULL,
        "createdAt"              TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"              TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cert_certification_process" PRIMARY KEY ("certificationProcessId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."certification_process"
        ADD CONSTRAINT "FK_cert_certification_process_edfiTenant"
        FOREIGN KEY ("edfiTenantId") REFERENCES "edfi_tenant"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."certification_process"
        ADD CONSTRAINT "FK_cert_certification_process_ods"
        FOREIGN KEY ("odsId") REFERENCES "ods"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."certification_process"
        ADD CONSTRAINT "FK_cert_certification_process_catalogVersion"
        FOREIGN KEY ("catalogVersionId") REFERENCES "cert"."catalog_version"("catalogVersionId")
        ON DELETE RESTRICT
    `);
    // A nullable column in a plain UNIQUE would allow duplicate no-ODS processes (NULL <> NULL).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_cert_certification_process_ods"
        ON "cert"."certification_process" ("edfiTenantId", "odsId", "catalogVersionId")
        WHERE "odsId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_cert_certification_process_no_ods"
        ON "cert"."certification_process" ("edfiTenantId", "catalogVersionId")
        WHERE "odsId" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "cert"."certification_process_scenario" (
        "certificationProcessId" integer NOT NULL,
        "scenarioId"             integer NOT NULL,
        "status"                 character varying(50) NOT NULL,
        "capturedVars"           jsonb,
        "updatedAt"              TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cert_certification_process_scenario"
          PRIMARY KEY ("certificationProcessId", "scenarioId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."certification_process_scenario"
        ADD CONSTRAINT "FK_cert_process_scenario_process"
        FOREIGN KEY ("certificationProcessId")
        REFERENCES "cert"."certification_process"("certificationProcessId") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."certification_process_scenario"
        ADD CONSTRAINT "FK_cert_process_scenario_scenario"
        FOREIGN KEY ("scenarioId") REFERENCES "cert"."scenario_catalog"("scenarioId")
        ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TABLE "cert"."scenario_step" (
        "stepRunId"              SERIAL NOT NULL,
        "certificationProcessId" integer NOT NULL,
        "scenarioId"             integer NOT NULL,
        "stepId"                 integer NOT NULL,
        "status"                 character varying(50) NOT NULL,
        "inputs"                 jsonb,
        "runAt"                  TIMESTAMP NOT NULL,
        CONSTRAINT "PK_cert_scenario_step" PRIMARY KEY ("stepRunId"),
        CONSTRAINT "UQ_cert_scenario_step_process_step" UNIQUE ("certificationProcessId", "stepId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."scenario_step"
        ADD CONSTRAINT "FK_cert_scenario_step_process"
        FOREIGN KEY ("certificationProcessId")
        REFERENCES "cert"."certification_process"("certificationProcessId") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."scenario_step"
        ADD CONSTRAINT "FK_cert_scenario_step_scenario"
        FOREIGN KEY ("scenarioId") REFERENCES "cert"."scenario_catalog"("scenarioId")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."scenario_step"
        ADD CONSTRAINT "FK_cert_scenario_step_step"
        FOREIGN KEY ("stepId") REFERENCES "cert"."step_catalog"("stepId") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE TABLE "cert"."scenario_step_error" (
        "errorId"     SERIAL NOT NULL,
        "stepRunId"   integer NOT NULL,
        "property"    character varying(500),
        "description" text,
        "validation"  text,
        CONSTRAINT "PK_cert_scenario_step_error" PRIMARY KEY ("errorId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."scenario_step_error"
        ADD CONSTRAINT "FK_cert_scenario_step_error_stepRun"
        FOREIGN KEY ("stepRunId") REFERENCES "cert"."scenario_step"("stepRunId") ON DELETE CASCADE
    `);
  }

  /** Restores the exact shape created by CertificationSchema1778026000000. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cert"."scenario_step_error"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cert"."scenario_step"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cert"."certification_process_scenario"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cert"."certification_process"`);
    await queryRunner.query(`ALTER TABLE "cert"."step_catalog" DROP COLUMN "fileName"`);

    await queryRunner.query(`
      CREATE TABLE "cert"."certification_ods_api" (
        "odsId"    SERIAL NOT NULL,
        "odsUrl"   character varying(2048) NOT NULL,
        "clientId" character varying(255) NOT NULL,
        CONSTRAINT "PK_cert_certification_ods_api" PRIMARY KEY ("odsId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "cert"."certification_process" (
        "certificationProcessId" SERIAL NOT NULL,
        "odsId"                  integer NOT NULL,
        "catalogVersionId"       integer NOT NULL,
        "status"                 character varying(50) NOT NULL,
        "createdAt"              TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"              TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cert_certification_process" PRIMARY KEY ("certificationProcessId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."certification_process"
        ADD CONSTRAINT "FK_cert_certification_process_ods"
        FOREIGN KEY ("odsId") REFERENCES "cert"."certification_ods_api"("odsId") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."certification_process"
        ADD CONSTRAINT "FK_cert_certification_process_catalogVersion"
        FOREIGN KEY ("catalogVersionId") REFERENCES "cert"."catalog_version"("catalogVersionId")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE TABLE "cert"."certification_process_scenario" (
        "certificationProcessId" integer NOT NULL,
        "scenarioId"             integer NOT NULL,
        "status"                 character varying(50) NOT NULL,
        CONSTRAINT "PK_cert_certification_process_scenario"
          PRIMARY KEY ("certificationProcessId", "scenarioId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."certification_process_scenario"
        ADD CONSTRAINT "FK_cert_process_scenario_process"
        FOREIGN KEY ("certificationProcessId")
        REFERENCES "cert"."certification_process"("certificationProcessId") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."certification_process_scenario"
        ADD CONSTRAINT "FK_cert_process_scenario_scenario"
        FOREIGN KEY ("scenarioId") REFERENCES "cert"."scenario_catalog"("scenarioId")
        ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE TABLE "cert"."scenario_step" (
        "stepRunId"              SERIAL NOT NULL,
        "certificationProcessId" integer NOT NULL,
        "scenarioId"             integer NOT NULL,
        "stepId"                 integer NOT NULL,
        "status"                 character varying(50) NOT NULL,
        "runAt"                  TIMESTAMP,
        CONSTRAINT "PK_cert_scenario_step" PRIMARY KEY ("stepRunId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."scenario_step"
        ADD CONSTRAINT "FK_cert_scenario_step_process"
        FOREIGN KEY ("certificationProcessId")
        REFERENCES "cert"."certification_process"("certificationProcessId") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."scenario_step"
        ADD CONSTRAINT "FK_cert_scenario_step_scenario"
        FOREIGN KEY ("scenarioId") REFERENCES "cert"."scenario_catalog"("scenarioId")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."scenario_step"
        ADD CONSTRAINT "FK_cert_scenario_step_step"
        FOREIGN KEY ("stepId") REFERENCES "cert"."step_catalog"("stepId") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE TABLE "cert"."scenario_step_error" (
        "errorId"     SERIAL NOT NULL,
        "stepRunId"   integer NOT NULL,
        "description" text,
        "validation"  text,
        CONSTRAINT "PK_cert_scenario_step_error" PRIMARY KEY ("errorId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cert"."scenario_step_error"
        ADD CONSTRAINT "FK_cert_scenario_step_error_stepRun"
        FOREIGN KEY ("stepRunId") REFERENCES "cert"."scenario_step"("stepRunId") ON DELETE CASCADE
    `);
  }
}

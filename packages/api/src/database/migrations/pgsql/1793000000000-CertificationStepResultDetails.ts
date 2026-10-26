import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AC-690: a step result keeps the response status and an encrypted response snapshot, and
 * each error says what kind it is and what was expected vs. observed.
 *
 * Old step results were already deleted (the feature isn't in production); leftover error
 * rows are cleared so the required kind column can be added.
 */
export class CertificationStepResultDetails1793000000000 implements MigrationInterface {
  name = 'CertificationStepResultDetails1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cert"."scenario_step" ADD "responseStatus" integer NULL`);
    await queryRunner.query(`ALTER TABLE "cert"."scenario_step" ADD "responseSnapshot" text NULL`);

    await queryRunner.query(`DELETE FROM "cert"."scenario_step_error"`);
    for (const column of ['property', 'validation', 'description']) {
      await queryRunner.query(`ALTER TABLE "cert"."scenario_step_error" DROP COLUMN "${column}"`);
    }
    await queryRunner.query(
      `ALTER TABLE "cert"."scenario_step_error" ADD "kind" character varying(50) NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "cert"."scenario_step_error" ADD "field" character varying(500) NULL`
    );
    for (const column of ['expected', 'observed', 'message']) {
      await queryRunner.query(`ALTER TABLE "cert"."scenario_step_error" ADD "${column}" text NULL`);
    }
  }

  /** Restores the shape created by CertificationStepRuns1792000000000. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "cert"."scenario_step_error"`);
    for (const column of ['kind', 'field', 'expected', 'observed', 'message']) {
      await queryRunner.query(`ALTER TABLE "cert"."scenario_step_error" DROP COLUMN "${column}"`);
    }
    await queryRunner.query(
      `ALTER TABLE "cert"."scenario_step_error" ADD "property" character varying(500) NULL`
    );
    await queryRunner.query(`ALTER TABLE "cert"."scenario_step_error" ADD "description" text NULL`);
    await queryRunner.query(`ALTER TABLE "cert"."scenario_step_error" ADD "validation" text NULL`);

    await queryRunner.query(`ALTER TABLE "cert"."scenario_step" DROP COLUMN "responseSnapshot"`);
    await queryRunner.query(`ALTER TABLE "cert"."scenario_step" DROP COLUMN "responseStatus"`);
  }
}

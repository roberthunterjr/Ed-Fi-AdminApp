import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AC-466: makes the certification run tables usable (see the pgsql twin for the rationale).
 *
 * edfi_tenant -> ods already cascades, so certification_process cascades from edfi_tenant only
 * and uses NO ACTION for odsId, as edorg, integration_app and ownership do. Otherwise SQL Server
 * rejects the second cascade path (error 1785).
 */
export class CertificationStepRuns1792000000000 implements MigrationInterface {
  name = 'CertificationStepRuns1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.dropRunTables(queryRunner);
    await queryRunner.query(`IF OBJECT_ID('[cert].[certification_ods_api]', 'U') IS NOT NULL DROP TABLE [cert].[certification_ods_api]`);

    // Cascades to areas, scenarios, steps and parameters; the next startup re-syncs them.
    await queryRunner.query(`DELETE FROM [cert].[catalog_version]`);
    await queryRunner.query(`ALTER TABLE [cert].[step_catalog] ADD [fileName] NVARCHAR(255) NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE [cert].[certification_process] (
        [certificationProcessId] INT IDENTITY(1,1) NOT NULL,
        [edfiTenantId]           INT NOT NULL,
        [odsId]                  INT NULL,
        [catalogVersionId]       INT NOT NULL,
        [status]                 NVARCHAR(50) NOT NULL,
        [createdAt]              datetime2 NOT NULL DEFAULT getdate(),
        [updatedAt]              datetime2 NOT NULL DEFAULT getdate(),
        CONSTRAINT [PK_cert_certification_process] PRIMARY KEY ([certificationProcessId])
      )
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[certification_process]
        ADD CONSTRAINT [FK_cert_certification_process_edfiTenant]
        FOREIGN KEY ([edfiTenantId]) REFERENCES [edfi_tenant]([id]) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[certification_process]
        ADD CONSTRAINT [FK_cert_certification_process_ods]
        FOREIGN KEY ([odsId]) REFERENCES [ods]([id]) ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[certification_process]
        ADD CONSTRAINT [FK_cert_certification_process_catalogVersion]
        FOREIGN KEY ([catalogVersionId]) REFERENCES [cert].[catalog_version]([catalogVersionId])
        ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX [UQ_cert_certification_process_ods]
        ON [cert].[certification_process] ([edfiTenantId], [odsId], [catalogVersionId])
        WHERE [odsId] IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX [UQ_cert_certification_process_no_ods]
        ON [cert].[certification_process] ([edfiTenantId], [catalogVersionId])
        WHERE [odsId] IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE [cert].[certification_process_scenario] (
        [certificationProcessId] INT NOT NULL,
        [scenarioId]             INT NOT NULL,
        [status]                 NVARCHAR(50) NOT NULL,
        [capturedVars]           NVARCHAR(max) NULL,
        [updatedAt]              datetime2 NOT NULL DEFAULT getdate(),
        CONSTRAINT [PK_cert_certification_process_scenario]
          PRIMARY KEY ([certificationProcessId], [scenarioId])
      )
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[certification_process_scenario]
        ADD CONSTRAINT [FK_cert_process_scenario_process]
        FOREIGN KEY ([certificationProcessId])
        REFERENCES [cert].[certification_process]([certificationProcessId]) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[certification_process_scenario]
        ADD CONSTRAINT [FK_cert_process_scenario_scenario]
        FOREIGN KEY ([scenarioId]) REFERENCES [cert].[scenario_catalog]([scenarioId])
        ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TABLE [cert].[scenario_step] (
        [stepRunId]              INT IDENTITY(1,1) NOT NULL,
        [certificationProcessId] INT NOT NULL,
        [scenarioId]             INT NOT NULL,
        [stepId]                 INT NOT NULL,
        [status]                 NVARCHAR(50) NOT NULL,
        [inputs]                 NVARCHAR(max) NULL,
        [runAt]                  datetime2 NOT NULL,
        CONSTRAINT [PK_cert_scenario_step] PRIMARY KEY ([stepRunId]),
        CONSTRAINT [UQ_cert_scenario_step_process_step] UNIQUE ([certificationProcessId], [stepId])
      )
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[scenario_step]
        ADD CONSTRAINT [FK_cert_scenario_step_process]
        FOREIGN KEY ([certificationProcessId])
        REFERENCES [cert].[certification_process]([certificationProcessId]) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[scenario_step]
        ADD CONSTRAINT [FK_cert_scenario_step_scenario]
        FOREIGN KEY ([scenarioId]) REFERENCES [cert].[scenario_catalog]([scenarioId])
        ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[scenario_step]
        ADD CONSTRAINT [FK_cert_scenario_step_step]
        FOREIGN KEY ([stepId]) REFERENCES [cert].[step_catalog]([stepId]) ON DELETE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE [cert].[scenario_step_error] (
        [errorId]     INT IDENTITY(1,1) NOT NULL,
        [stepRunId]   INT NOT NULL,
        [property]    NVARCHAR(500) NULL,
        [description] NVARCHAR(max),
        [validation]  NVARCHAR(max),
        CONSTRAINT [PK_cert_scenario_step_error] PRIMARY KEY ([errorId])
      )
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[scenario_step_error]
        ADD CONSTRAINT [FK_cert_scenario_step_error_stepRun]
        FOREIGN KEY ([stepRunId]) REFERENCES [cert].[scenario_step]([stepRunId]) ON DELETE CASCADE
    `);
  }

  /** Restores the exact shape created by CertificationSchema1778026000000. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropRunTables(queryRunner);
    await queryRunner.query(`ALTER TABLE [cert].[step_catalog] DROP COLUMN [fileName]`);

    await queryRunner.query(`
      CREATE TABLE [cert].[certification_ods_api] (
        [odsId]    INT IDENTITY(1,1) NOT NULL,
        [odsUrl]   NVARCHAR(2048) NOT NULL,
        [clientId] NVARCHAR(255) NOT NULL,
        CONSTRAINT [PK_cert_certification_ods_api] PRIMARY KEY ([odsId])
      )
    `);
    await queryRunner.query(`
      CREATE TABLE [cert].[certification_process] (
        [certificationProcessId] INT IDENTITY(1,1) NOT NULL,
        [odsId]                  INT NOT NULL,
        [catalogVersionId]       INT NOT NULL,
        [status]                 NVARCHAR(50) NOT NULL,
        [createdAt]              datetime2 NOT NULL DEFAULT getdate(),
        [updatedAt]              datetime2 NOT NULL DEFAULT getdate(),
        CONSTRAINT [PK_cert_certification_process] PRIMARY KEY ([certificationProcessId])
      )
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[certification_process]
        ADD CONSTRAINT [FK_cert_certification_process_ods]
        FOREIGN KEY ([odsId]) REFERENCES [cert].[certification_ods_api]([odsId]) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[certification_process]
        ADD CONSTRAINT [FK_cert_certification_process_catalogVersion]
        FOREIGN KEY ([catalogVersionId]) REFERENCES [cert].[catalog_version]([catalogVersionId])
        ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      CREATE TABLE [cert].[certification_process_scenario] (
        [certificationProcessId] INT NOT NULL,
        [scenarioId]             INT NOT NULL,
        [status]                 NVARCHAR(50) NOT NULL,
        CONSTRAINT [PK_cert_certification_process_scenario]
          PRIMARY KEY ([certificationProcessId], [scenarioId])
      )
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[certification_process_scenario]
        ADD CONSTRAINT [FK_cert_process_scenario_process]
        FOREIGN KEY ([certificationProcessId])
        REFERENCES [cert].[certification_process]([certificationProcessId]) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[certification_process_scenario]
        ADD CONSTRAINT [FK_cert_process_scenario_scenario]
        FOREIGN KEY ([scenarioId]) REFERENCES [cert].[scenario_catalog]([scenarioId])
        ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE TABLE [cert].[scenario_step] (
        [stepRunId]              INT IDENTITY(1,1) NOT NULL,
        [certificationProcessId] INT NOT NULL,
        [scenarioId]             INT NOT NULL,
        [stepId]                 INT NOT NULL,
        [status]                 NVARCHAR(50) NOT NULL,
        [runAt]                  datetime2,
        CONSTRAINT [PK_cert_scenario_step] PRIMARY KEY ([stepRunId])
      )
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[scenario_step]
        ADD CONSTRAINT [FK_cert_scenario_step_process]
        FOREIGN KEY ([certificationProcessId])
        REFERENCES [cert].[certification_process]([certificationProcessId]) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[scenario_step]
        ADD CONSTRAINT [FK_cert_scenario_step_scenario]
        FOREIGN KEY ([scenarioId]) REFERENCES [cert].[scenario_catalog]([scenarioId])
        ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[scenario_step]
        ADD CONSTRAINT [FK_cert_scenario_step_step]
        FOREIGN KEY ([stepId]) REFERENCES [cert].[step_catalog]([stepId]) ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      CREATE TABLE [cert].[scenario_step_error] (
        [errorId]     INT IDENTITY(1,1) NOT NULL,
        [stepRunId]   INT NOT NULL,
        [description] NVARCHAR(max),
        [validation]  NVARCHAR(max),
        CONSTRAINT [PK_cert_scenario_step_error] PRIMARY KEY ([errorId])
      )
    `);
    await queryRunner.query(`
      ALTER TABLE [cert].[scenario_step_error]
        ADD CONSTRAINT [FK_cert_scenario_step_error_stepRun]
        FOREIGN KEY ([stepRunId]) REFERENCES [cert].[scenario_step]([stepRunId]) ON DELETE CASCADE
    `);
  }

  private async dropRunTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`IF OBJECT_ID('[cert].[scenario_step_error]', 'U') IS NOT NULL DROP TABLE [cert].[scenario_step_error]`);
    await queryRunner.query(`IF OBJECT_ID('[cert].[scenario_step]', 'U') IS NOT NULL DROP TABLE [cert].[scenario_step]`);
    await queryRunner.query(`IF OBJECT_ID('[cert].[certification_process_scenario]', 'U') IS NOT NULL DROP TABLE [cert].[certification_process_scenario]`);
    await queryRunner.query(`IF OBJECT_ID('[cert].[certification_process]', 'U') IS NOT NULL DROP TABLE [cert].[certification_process]`);
  }
}

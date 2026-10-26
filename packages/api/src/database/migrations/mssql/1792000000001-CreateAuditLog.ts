import { MigrationInterface, QueryRunner } from 'typeorm';

/** AC-396: creates the audit_log table. No foreign keys, so entries outlive the rows they describe. */
export class CreateAuditLog1792000000001 implements MigrationInterface {
  name = 'CreateAuditLog1792000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE [audit_log] (
        [id]              BIGINT IDENTITY(1,1) NOT NULL,
        [eventType]       NVARCHAR(30) NOT NULL,
        [timestamp]       datetimeoffset NOT NULL,
        [actorUsername]   NVARCHAR(256) NULL,
        [actorType]       NVARCHAR(20) NULL,
        [sourceIpAddress] NVARCHAR(45) NULL,
        [httpVerb]        NVARCHAR(10) NULL,
        [httpUrl]         NVARCHAR(2048) NULL,
        [statusCode]      INT NULL,
        [oidcIssuer]      NVARCHAR(512) NULL,
        [details]         NVARCHAR(max) NULL,
        CONSTRAINT [PK_audit_log] PRIMARY KEY ([id])
      )
    `);
    await queryRunner.query(`CREATE INDEX [IDX_audit_log_timestamp] ON [audit_log] ([timestamp])`);
    await queryRunner.query(
      `CREATE INDEX [IDX_audit_log_actorUsername] ON [audit_log] ([actorUsername])`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `IF OBJECT_ID('[audit_log]', 'U') IS NOT NULL DROP INDEX [IDX_audit_log_actorUsername] ON [audit_log]`
    );
    await queryRunner.query(
      `IF OBJECT_ID('[audit_log]', 'U') IS NOT NULL DROP INDEX [IDX_audit_log_timestamp] ON [audit_log]`
    );
    await queryRunner.query(`IF OBJECT_ID('[audit_log]', 'U') IS NOT NULL DROP TABLE [audit_log]`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

const viewSql = (withOdsManage: boolean) => {
  const typeCase = withOdsManage
    ? `CASE WHEN jq.[name] = 'sbe-sync' THEN 'SbEnvironment' WHEN jq.[name] = 'ods-manage' THEN 'OdsManage' ELSE 'EdfiTenant' END`
    : `CASE WHEN jq.[name] = 'sbe-sync' THEN 'SbEnvironment' ELSE 'EdfiTenant' END`;
  const names = withOdsManage
    ? `'sbe-sync', 'edfi-tenant-sync', 'ods-manage'`
    : `'sbe-sync', 'edfi-tenant-sync'`;
  return `SELECT jq.[id], ${typeCase} AS [type], COALESCE(sbe.[name], et.[name], 'resource no longer exists') AS [name], COALESCE(sbe.[id], et.[sbEnvironmentId]) AS [sbEnvironmentId], et.[id] AS [edfiTenantId], jq.[data] AS [dataText], jq.[data], jq.[state], jq.[createdon], jq.[completedon], jq.[output], CASE WHEN JSON_VALUE(jq.[output], '$.hasChanges') = 'true' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS [hasChanges] FROM [job_queue] jq LEFT JOIN [sb_environment] sbe ON JSON_VALUE(jq.[data], '$.sbEnvironmentId') = CAST(sbe.[id] AS NVARCHAR) LEFT JOIN [edfi_tenant] et ON JSON_VALUE(jq.[data], '$.edfiTenantId') = CAST(et.[id] AS NVARCHAR) WHERE jq.[name] IN (${names})`;
};

export class OdsManageSyncQueue1792100000000 implements MigrationInterface {
  name = 'OdsManageSyncQueue1792100000000';

  private async rebuild(queryRunner: QueryRunner, withOdsManage: boolean) {
    await queryRunner.query(
      `DELETE FROM [typeorm_metadata] WHERE [type] IN ('VIEW', 'MATERIALIZED_VIEW') AND [name] = 'sb_sync_queue'`,
    );
    await queryRunner.query(`DROP VIEW IF EXISTS [sb_sync_queue]`);
    const definition = viewSql(withOdsManage);
    await queryRunner.query(`CREATE VIEW [sb_sync_queue] AS ${definition}`);
    await queryRunner.query(
      `INSERT INTO [typeorm_metadata] ([schema], [type], [name], [value]) VALUES (@0, @1, @2, @3)`,
      ['public', 'VIEW', 'sb_sync_queue', definition],
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.rebuild(queryRunner, true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rebuild(queryRunner, false);
  }
}

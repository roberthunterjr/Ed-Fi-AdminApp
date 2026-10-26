import { MigrationInterface, QueryRunner } from 'typeorm';
import { hasPgbossArchive } from './pgboss-compat';

const SYNC_JOB_NAMES = ['sbe-sync', 'edfi-tenant-sync'];
const SYNC_JOB_NAMES_WITH_ODS_MANAGE = [...SYNC_JOB_NAMES, 'ods-manage'];

const inList = (names: string[]) => names.map((n) => `'${n}'`).join(', ');

const typeCase = (withOdsManage: boolean) =>
  withOdsManage
    ? `case when job."name" = 'sbe-sync' then 'SbEnvironment' when job."name" = 'ods-manage' then 'OdsManage' else 'EdfiTenant' end`
    : `case when job."name" = 'sbe-sync' then 'SbEnvironment' else 'EdfiTenant' end`;

/** The SELECT body of the sb_sync_queue materialized view (also stored in typeorm_metadata). */
const viewDefinition = (archiveExists: boolean, withOdsManage: boolean): string => {
  const names = inList(withOdsManage ? SYNC_JOB_NAMES_WITH_ODS_MANAGE : SYNC_JOB_NAMES);
  const jobCte = archiveExists
    ? // Legacy branch: pg-boss <=v9 camelCase schema with pgboss.archive table
      `with job as (select id, name, data, state, createdon, completedon, output
    from pgboss.job
    where name in (${names})
    union
    select id, name, data, state, createdon, completedon, output
    from pgboss.archive
    where name in (${names}))`
    : // v12 branch: pg-boss v10+ snake_case schema - pgboss.archive no longer exists
      `with job as (select id, name, data, state, created_on as createdon, completed_on as completedon, output
    from pgboss.job
    where name in (${names}))`;
  return `${jobCte}
select job."id",
${typeCase(withOdsManage)}     "type",
coalesce(sb_environment."name", edfi_tenant."name", 'resource no longer exists') "name",
coalesce(sb_environment."id", edfi_tenant."sbEnvironmentId")                     "sbEnvironmentId",
edfi_tenant."id"                                                                 "edfiTenantId",
"data"::text                                                                     "dataText",
data,
state,
createdon,
completedon,
output,
(job.output -> 'hasChanges')::bool                                               "hasChanges"
from job
left join public.sb_environment on (job.data -> 'sbEnvironmentId')::int = sb_environment.id
left join public.edfi_tenant on (job.data -> 'edfiTenantId')::int = edfi_tenant.id`;
};

const triggerSql = (names: string[]) => {
  const when = (alias: 'NEW' | 'OLD') => names.map((n) => `${alias}."name" = '${n}'`).join(' OR ');
  return `CREATE TRIGGER "sb_sync_queue_refresh_insert_update" AFTER INSERT OR UPDATE ON "pgboss"."job" FOR EACH ROW WHEN (${when('NEW')}) EXECUTE FUNCTION refresh_sync_view();
      CREATE TRIGGER "sb_sync_queue_refresh_delete" AFTER DELETE ON "pgboss"."job" FOR EACH ROW WHEN (${when('OLD')}) EXECUTE FUNCTION refresh_sync_view();`;
};

export class OdsManageSyncQueue1792100000000 implements MigrationInterface {
  name = 'OdsManageSyncQueue1792100000000';

  private async rebuild(queryRunner: QueryRunner, withOdsManage: boolean, withIndex: boolean) {
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3`,
      ['MATERIALIZED_VIEW', 'sb_sync_queue', 'public'],
    );
    await queryRunner.query(`DROP MATERIALIZED VIEW "sb_sync_queue"`);

    const definition = viewDefinition(await hasPgbossArchive(queryRunner), withOdsManage);
    await queryRunner.query(`CREATE MATERIALIZED VIEW "sb_sync_queue" AS ${definition}`);

    // Dropping the materialized view dropped its index; the triggers live on pgboss.job and
    // survive, so they are replaced to change their WHEN clauses.
    if (withIndex) {
      await queryRunner.query(
        `CREATE INDEX "sb_sync_queue_tsvector" ON "sb_sync_queue" USING gin (jsonb_to_tsvector('english', output, '["string"]'))`,
      );
    }
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "sb_sync_queue_refresh_insert_update" ON "pgboss"."job"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "sb_sync_queue_refresh_delete" ON "pgboss"."job"`,
    );
    await queryRunner.query(
      triggerSql(withOdsManage ? SYNC_JOB_NAMES_WITH_ODS_MANAGE : SYNC_JOB_NAMES),
    );

    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES (DEFAULT, $1, DEFAULT, $2, $3, $4)`,
      ['public', 'MATERIALIZED_VIEW', 'sb_sync_queue', definition],
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.rebuild(queryRunner, true, true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The prior state (after EnvNav) had no tsvector index, so none is recreated here.
    await this.rebuild(queryRunner, false, false);
  }
}

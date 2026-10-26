import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  GLOBAL_ADMIN_ROLE_ID,
  GLOBAL_ADMIN_ROLE_TYPE,
} from '../shared/ac644-privilege-snapshot';
import { GLOBAL_ADMIN_WITHHELD_PRIVILEGE_CODES } from '../shared/global-admin-withheld-privileges';

/**
 * Undoes the part of the AC-644 backfill that granted the integration-provider privileges to
 * Global admin (role 2). No migration had granted them before, so the Integration Providers
 * menu was hidden; the backfill made it appear. Only a UserGlobal role at id 2 is touched, and
 * every other code it holds is kept.
 */
export class RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000
  implements MigrationInterface
{
  name = 'RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const current = await this.selectPrivileges(queryRunner);
    if (!current) return;

    const kept = current.filter((code) => !GLOBAL_ADMIN_WITHHELD_PRIVILEGE_CODES.includes(code));
    if (kept.length === current.length) return;

    await this.updatePrivileges(queryRunner, kept);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restores the post-AC-644 state, where role 2 held these codes.
    const current = await this.selectPrivileges(queryRunner);
    if (!current) return;

    const missing = GLOBAL_ADMIN_WITHHELD_PRIVILEGE_CODES.filter((code) => !current.includes(code));
    if (!missing.length) return;

    await this.updatePrivileges(queryRunner, [...current, ...missing]);
  }

  private async selectPrivileges(queryRunner: QueryRunner): Promise<string[] | undefined> {
    const rows: { privilegeIds: string[] | null }[] = await queryRunner.query(
      `SELECT "privilegeIds" FROM "role" WHERE "id" = $1 AND "type" = $2`,
      [GLOBAL_ADMIN_ROLE_ID, GLOBAL_ADMIN_ROLE_TYPE]
    );
    return rows.length ? rows[0].privilegeIds ?? [] : undefined;
  }

  private async updatePrivileges(queryRunner: QueryRunner, codes: string[]): Promise<void> {
    await queryRunner.query(`UPDATE "role" SET "privilegeIds" = $1 WHERE "id" = $2`, [
      codes,
      GLOBAL_ADMIN_ROLE_ID,
    ]);
  }
}

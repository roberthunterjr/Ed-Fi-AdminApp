import { Logger } from '@nestjs/common';
import config from 'config';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Seeding1697203599392 implements MigrationInterface {
  name = 'Seeding1697203599392';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rolesCount = await queryRunner.query(
      `SELECT COUNT(*) as r_count
       FROM "role"`
    );
    if (Number(rolesCount[0].r_count) === 0) {
      Logger.verbose('Seeding roles');
      await queryRunner.query(
        `INSERT INTO "role" ("id", "name", "description", "type") VALUES
        (1, 'Tenant user global role', 'Standard tenant user', '"UserGlobal"'),
        (2, 'Global admin', 'Global admin', '"UserGlobal"'),
        (3, 'Global viewer', 'Global viewer', '"UserGlobal"'),
        (4, 'Shared-instance ownership', 'Shared-instance ownership', '"ResourceOwnership"'),
        (5, 'Full ownership', 'Full ownership', '"ResourceOwnership"'),
        (6, 'Tenant admin', 'Tenant admin', '"UserTenant"'),
        (7, 'Tenant viewer', 'Tenant viewer', '"UserTenant"'),
        (8, 'Standard tenant access', 'Tenant user', '"UserTenant"')`
      );
      await queryRunner.query(`SELECT setval('"role_id_seq"', 8)`);
      const allPrivileges = (await queryRunner.query('SELECT * FROM "privilege"')).map(
        (p) => p.code
      );
      await queryRunner.query(
        `INSERT INTO "role_privileges_privilege" ("roleId", "privilegeCode") VALUES
        (1, 'me:read'),
        (1, 'privilege:read'),
        ${allPrivileges.map((p: any) => `(2, '${p}')`).join(',\n')},
        ${allPrivileges
          .filter((p) => p.endsWith(':read'))
          .map((p: any) => `(3, '${p}')`)
          .join(',\n')},
        ${allPrivileges
          .filter(
            (p) => p.startsWith('tenant.sbe') && (p.includes('.application') || p.endsWith(':read'))
          )
          .map((p: any) => `(4, '${p}')`)
          .join(',\n')},
        ${allPrivileges
          .filter((p) => p.startsWith('tenant.sbe'))
          .map((p: any) => `(5, '${p}')`)
          .join(',\n')},
        ${allPrivileges
          .filter((p) => p.startsWith('tenant.'))
          .map((p: any) => `(6, '${p}')`)
          .join(',\n')},
        ${allPrivileges
          .filter((p) => p.startsWith('tenant.') && p.endsWith(':read'))
          .map((p: any) => `(7, '${p}')`)
          .join(',\n')},
        ${allPrivileges
          .filter(
            (p) => p.startsWith('tenant.') && (p.includes('.application') || p.endsWith(':read'))
          )
          .map((p: any) => `(8, '${p}')`)
          .join(',\n')}
        `
      );
    }
    const idpsCount = await queryRunner.query('SELECT COUNT(*) as i_count FROM "oidc"');
    if (Number(idpsCount[0].i_count) === 0) {
      if (config.SAMPLE_OIDC_CONFIG?.clientSecret) {
        Logger.verbose('Seeding OIDC connection');
        const oidc = config.SAMPLE_OIDC_CONFIG;
        await queryRunner.query(
          `INSERT INTO "oidc"
        ("issuer", "clientId", "clientSecret", "scope") values
        ('${oidc.issuer}', '${oidc.clientId}', '${oidc.clientSecret}', '${oidc.scope}')`
        );
      } else {
        Logger.warn(
          'SAMPLE_OIDC_CONFIG.clientSecret is not set, skipping seeding of the sample OIDC connection. You will need to add one to the database in order to log in.'
        );
      }
    }

    const userCount = await queryRunner.query('SELECT COUNT(*) as u_count FROM "user"');
    if (Number(userCount[0].u_count) === 0) {
      if (config.ADMIN_USERNAME) {
        Logger.verbose('Seeding initial user');
        await queryRunner.query(
          `INSERT INTO "user" ("username", "roleId", "isActive") VALUES
        ('${config.ADMIN_USERNAME}', 2, true)`
        );
      } else {
        Logger.warn(
          'No ADMIN_USERNAME found, skipping seeding of initial user. You will need to add a user to the database in order to log in.'
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // not reversible
  }
}

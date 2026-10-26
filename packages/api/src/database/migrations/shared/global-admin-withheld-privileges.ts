/**
 * Frozen list of privilege codes withheld from the seeded Global admin role (id 2).
 *
 * No migration granted these codes to any role before AC-644. The AC-644 backfill
 * (AddMissingPrivilegesToGlobalAdmin1791158400000) copied every code into role 2, which made
 * the Integration Providers menu appear for Global admins. They are removed again by the
 * RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000 migrations, which are the
 * only users of this list.
 *
 * Do NOT import from @edanalytics/models here: migrations must not change meaning when the
 * model changes.
 */
export const GLOBAL_ADMIN_WITHHELD_PRIVILEGE_CODES: readonly string[] = [
  'integration-provider:create',
  'integration-provider:delete',
  'integration-provider:read',
  'integration-provider:update',
  'team.integration-provider.application:read',
  'team.integration-provider.application:reset-credentials',
];

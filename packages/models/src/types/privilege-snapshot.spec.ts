import { privilegeCodes } from './privileges';

/**
 * Every privilege code that the seeded Global admin role (id 2) is guaranteed to hold.
 *
 * If this test fails, you added or removed a privilege. You MUST decide whether Global admin
 * should hold it:
 *   - Yes: write pgsql + mssql migrations that add the new code to Global admin (role id 2)
 *     (see 1791158400000-AddMissingPrivilegesToGlobalAdmin for the pattern), and add it to
 *     GLOBAL_ADMIN_PRIVILEGE_SNAPSHOT. Otherwise Global admins will get 403 when granting the
 *     new privilege (AC-644).
 *   - No: add it to GLOBAL_ADMIN_WITHHELD_PRIVILEGES instead.
 */
const GLOBAL_ADMIN_PRIVILEGE_SNAPSHOT = [
  'edorg:read',
  'me:read',
  'ods:read',
  'ods:read-row-counts',
  'ownership:create',
  'ownership:delete',
  'ownership:read',
  'ownership:update',
  'role:create',
  'role:delete',
  'role:read',
  'role:update',
  'sb-environment.edfi-tenant:create',
  'sb-environment.edfi-tenant:delete',
  'sb-environment.edfi-tenant:read',
  'sb-environment.edfi-tenant:refresh-resources',
  'sb-environment.edfi-tenant:update',
  'sb-environment:create',
  'sb-environment:delete',
  'sb-environment:read',
  'sb-environment:refresh-resources',
  'sb-environment:update',
  'sb-sync-queue:archive',
  'sb-sync-queue:read',
  'team.ownership:read',
  'team.role:create',
  'team.role:delete',
  'team.role:read',
  'team.role:update',
  'team.sb-environment.edfi-tenant.claimset:create',
  'team.sb-environment.edfi-tenant.claimset:delete',
  'team.sb-environment.edfi-tenant.claimset:read',
  'team.sb-environment.edfi-tenant.claimset:update',
  'team.sb-environment.edfi-tenant.ods.edorg.application:create',
  'team.sb-environment.edfi-tenant.ods.edorg.application:delete',
  'team.sb-environment.edfi-tenant.ods.edorg.application:read',
  'team.sb-environment.edfi-tenant.ods.edorg.application:reset-credentials',
  'team.sb-environment.edfi-tenant.ods.edorg.application:update',
  'team.sb-environment.edfi-tenant.ods.edorg:read',
  'team.sb-environment.edfi-tenant.ods:create-edorg',
  'team.sb-environment.edfi-tenant.ods:delete-edorg',
  'team.sb-environment.edfi-tenant.ods:read',
  'team.sb-environment.edfi-tenant.ods:read-row-counts',
  'team.sb-environment.edfi-tenant.profile:create',
  'team.sb-environment.edfi-tenant.profile:delete',
  'team.sb-environment.edfi-tenant.profile:read',
  'team.sb-environment.edfi-tenant.profile:update',
  'team.sb-environment.edfi-tenant.vendor:create',
  'team.sb-environment.edfi-tenant.vendor:delete',
  'team.sb-environment.edfi-tenant.vendor:read',
  'team.sb-environment.edfi-tenant.vendor:update',
  'team.sb-environment.edfi-tenant:create-ods',
  'team.sb-environment.edfi-tenant:delete-ods',
  'team.sb-environment.edfi-tenant:read',
  'team.sb-environment:create-tenant',
  'team.sb-environment:delete-tenant',
  'team.sb-environment:read',
  'team.user-team-membership:create',
  'team.user-team-membership:delete',
  'team.user-team-membership:read',
  'team.user-team-membership:update',
  'team.user:read',
  'team:create',
  'team:delete',
  'team:read',
  'team:update',
  'user-team-membership:create',
  'user-team-membership:delete',
  'user-team-membership:read',
  'user-team-membership:update',
  'user:create',
  'user:delete',
  'user:read',
  'user:update',
];

/**
 * Privilege codes deliberately withheld from Global admin. Holding integration-provider:read
 * shows the Integration Providers menu, which must stay hidden; the codes are removed by the
 * RemoveIntegrationProviderPrivilegesFromGlobalAdmin1791417600000 migrations. Because of the
 * AC-644 no-escalation rule, Global admins also cannot grant these codes to anyone.
 */
const GLOBAL_ADMIN_WITHHELD_PRIVILEGES = [
  'integration-provider:create',
  'integration-provider:delete',
  'integration-provider:read',
  'integration-provider:update',
  'team.integration-provider.application:read',
  'team.integration-provider.application:reset-credentials',
];

describe('privilege snapshot (AC-644 tripwire)', () => {
  it('accounts for every privilege as either held by or withheld from Global admin', () => {
    const actual: string[] = [...privilegeCodes].sort();
    const expected = [...GLOBAL_ADMIN_PRIVILEGE_SNAPSHOT, ...GLOBAL_ADMIN_WITHHELD_PRIVILEGES].sort();
    const added = actual.filter((c) => !expected.includes(c));
    const removed = expected.filter((c) => !actual.includes(c));
    if (added.length || removed.length) {
      throw new Error(
        `Privilege list changed (added: [${added.join(', ')}], removed: [${removed.join(', ')}]). ` +
          'New privilege added: either write a migration adding it to Global admin (role 2) and ' +
          'add it to GLOBAL_ADMIN_PRIVILEGE_SNAPSHOT, or add it to GLOBAL_ADMIN_WITHHELD_PRIVILEGES.'
      );
    }
    expect(actual).toEqual(expected);
  });

  it('never lists a privilege as both held and withheld', () => {
    const overlap = GLOBAL_ADMIN_PRIVILEGE_SNAPSHOT.filter((c) =>
      GLOBAL_ADMIN_WITHHELD_PRIVILEGES.includes(c)
    );
    expect(overlap).toEqual([]);
  });

  it('withholds the integration-provider privileges so the Integration Providers menu stays hidden', () => {
    expect(GLOBAL_ADMIN_PRIVILEGE_SNAPSHOT).not.toContain('integration-provider:read');
    expect(GLOBAL_ADMIN_WITHHELD_PRIVILEGES).toContain('integration-provider:read');
  });
});

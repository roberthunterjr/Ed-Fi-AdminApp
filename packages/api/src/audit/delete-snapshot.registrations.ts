import {
  EdfiTenant,
  Edorg,
  IntegrationProvider,
  Ods,
  Ownership,
  Role,
  SbEnvironment,
  Team,
  User,
  UserTeamMembership,
} from '@edanalytics/models-server';
import { registerDeleteSnapshot } from './delete-snapshot.registry';

/**
 * Delete snapshots. Each builder is an allowlist: it names the fields it keeps, using names
 * instead of ids, and never reads emails, passwords, secrets, tokens or other credentials.
 * Every entity decorated with @AuditDelete must be registered here.
 */

type Named = { name?: string | null } | null | undefined;

const nameOf = (target: Named): string | null => target?.name ?? null;

/** ODS and edorg names repeat across tenants, so their labels carry the tenant name. */
const withTenant = (name: string | null | undefined, tenant: Named): string | null => {
  const tenantName = nameOf(tenant);
  return name && tenantName ? `${name} (${tenantName})` : (name ?? null);
};

const ownershipResource = (ownership: Ownership): { type: string; name: string | null } | null => {
  if (ownership.sbEnvironment) {
    return { type: 'sbEnvironment', name: nameOf(ownership.sbEnvironment) };
  }
  if (ownership.edfiTenant) {
    return { type: 'edfiTenant', name: nameOf(ownership.edfiTenant) };
  }
  if (ownership.ods) {
    return { type: 'ods', name: withTenant(ownership.ods.dbName, ownership.ods.edfiTenant) };
  }
  if (ownership.edorg) {
    return {
      type: 'edorg',
      name: withTenant(ownership.edorg.nameOfInstitution, ownership.edorg.edfiTenant),
    };
  }
  if (ownership.integrationProvider) {
    return { type: 'integrationProvider', name: nameOf(ownership.integrationProvider) };
  }
  return null;
};

registerDeleteSnapshot(
  User,
  (user) => ({
    username: user.username,
    userType: user.userType,
    role: nameOf(user.role),
  }),
  { relations: ['role'] },
);

registerDeleteSnapshot(Team, (team) => ({ name: team.name }));

registerDeleteSnapshot(
  Ownership,
  (ownership) => {
    const resource = ownershipResource(ownership);
    return {
      team: nameOf(ownership.team),
      role: nameOf(ownership.role),
      resourceType: resource?.type ?? null,
      resource: resource?.name ?? null,
    };
  },
  {
    relations: [
      'team',
      'role',
      'sbEnvironment',
      'edfiTenant',
      'ods',
      'ods.edfiTenant',
      'edorg',
      'edorg.edfiTenant',
      'integrationProvider',
    ],
  },
);

registerDeleteSnapshot(
  UserTeamMembership,
  (membership) => ({
    username: membership.user?.username ?? null,
    team: nameOf(membership.team),
    role: nameOf(membership.role),
  }),
  { relations: ['user', 'team', 'role'] },
);

registerDeleteSnapshot(
  EdfiTenant,
  (tenant) => ({
    name: tenant.name,
    environment: nameOf(tenant.sbEnvironment),
  }),
  { relations: ['sbEnvironment'] },
);

registerDeleteSnapshot(
  Ods,
  (ods) => ({
    dbName: ods.dbName,
    tenant: nameOf(ods.edfiTenant),
  }),
  { relations: ['edfiTenant'] },
);

// educationOrganizationId is the business key shown to users, not the surrogate row id.
registerDeleteSnapshot(
  Edorg,
  (edorg) => ({
    nameOfInstitution: edorg.nameOfInstitution,
    educationOrganizationId: edorg.educationOrganizationId,
    ods: edorg.ods?.dbName ?? null,
  }),
  { relations: ['ods'] },
);

registerDeleteSnapshot(Role, (role) => ({ name: role.name, type: role.type }));

registerDeleteSnapshot(IntegrationProvider, (provider) => ({ name: provider.name }));

// SbEnvironment holds configPublic (admin API URL) and encrypted configPrivate: name only.
registerDeleteSnapshot(SbEnvironment, (environment) => ({ name: environment.name }));

/** The entities whose deletes are audited; the registrations spec checks each has a builder. */
export const AUDITED_DELETE_ENTITIES = [
  User,
  Team,
  Ownership,
  UserTeamMembership,
  EdfiTenant,
  Ods,
  Edorg,
  Role,
  IntegrationProvider,
  SbEnvironment,
];

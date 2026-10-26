import 'reflect-metadata';
import {
  Edorg,
  EdfiTenant,
  IntegrationProvider,
  Ods,
  Ownership,
  Role,
  SbEnvironment,
  Team,
  User,
  UserTeamMembership,
} from '@edanalytics/models-server';
import { AUDIT_DELETE_METADATA, AuditDeleteMetadata } from './audit-delete.decorator';
import { getDeleteSnapshotBuilder, getDeleteSnapshotRelations } from './delete-snapshot.registry';
import { AUDITED_DELETE_ENTITIES } from './delete-snapshot.registrations';
import { UsersGlobalController } from '../users-global/users-global.controller';
import { TeamsGlobalController } from '../teams/teams-global.controller';
import { OwnershipsGlobalController } from '../ownerships-global/ownerships-global.controller';
import { UserTeamMembershipsGlobalController } from '../user-team-memberships-global/user-team-memberships-global.controller';
import { UserTeamMembershipsController } from '../teams/user-team-memberships/user-team-memberships.controller';
import { EdfiTenantsGlobalController } from '../edfi-tenants-global/edfi-tenants-global.controller';
import { EdfiTenantsController } from '../teams/edfi-tenants/edfi-tenants.controller';
import { OdssController } from '../teams/edfi-tenants/odss/odss.controller';
import { EdorgsController } from '../teams/edfi-tenants/edorgs/edorgs.controller';
import { RolesGlobalController } from '../roles-global/roles-global.controller';
import { RolesController } from '../teams/roles/roles.controller';
import { IntegrationProvidersGlobalController } from '../integration-providers-global/integration-providers-global.controller';
import { SbEnvironmentsGlobalController } from '../sb-environments-global/sb-environments-global.controller';

// The real AuthService fails type-checking under the stale node_modules; the test never needs it.
jest.mock('../auth/auth.service', () => ({ AuthService: class AuthService {} }));

const FORBIDDEN_KEYS = [
  'password',
  'clientSecret',
  'secret',
  'token',
  'email',
  'configPrivate',
  'configPublic',
  'adminApiUrl',
  'clientId',
];

const role = Object.assign(new Role(), { id: 5, name: 'Admin' });
const team = Object.assign(new Team(), { id: 3, name: 'Team A' });
const user = Object.assign(new User(), {
  id: 7,
  username: 'jdoe',
  userType: 'human',
  clientId: 'client-secret-id',
  givenName: 'John',
  role,
});

const expectNoForbiddenKeys = (snapshot: Record<string, unknown>) => {
  const keys = Object.keys(snapshot).map((k) => k.toLowerCase());
  FORBIDDEN_KEYS.forEach((forbidden) => expect(keys).not.toContain(forbidden.toLowerCase()));
};

/** The @Delete handler is named `remove` on most controllers and `delete` on a few. */
const deleteHandler = (controller: { prototype: object }): object => {
  const proto = controller.prototype as { remove?: object; delete?: object };
  return (proto.remove ?? proto.delete) as object;
};

const build = (entity: unknown, target: unknown) => {
  const builder = getDeleteSnapshotBuilder(entity as never);
  expect(builder).toBeDefined();
  return (builder as (t: unknown) => Record<string, unknown>)(target);
};

describe('delete snapshot registrations', () => {
  it('registers a builder for every audited entity', () => {
    expect(AUDITED_DELETE_ENTITIES).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    AUDITED_DELETE_ENTITIES.forEach((entity) =>
      expect(getDeleteSnapshotBuilder(entity)).toBeDefined(),
    );
  });

  it('registers a builder for every entity named by an @AuditDelete decorator', () => {
    const controllers = [
      UsersGlobalController,
      TeamsGlobalController,
      OwnershipsGlobalController,
      UserTeamMembershipsGlobalController,
      UserTeamMembershipsController,
      EdfiTenantsGlobalController,
      EdfiTenantsController,
      OdssController,
      EdorgsController,
      RolesGlobalController,
      RolesController,
      IntegrationProvidersGlobalController,
      SbEnvironmentsGlobalController,
    ];
    controllers.forEach((controller) => {
      const meta: AuditDeleteMetadata = Reflect.getMetadata(
        AUDIT_DELETE_METADATA,
        deleteHandler(controller),
      );
      expect(meta).toBeDefined();
      expect(getDeleteSnapshotBuilder(meta.entity)).toBeDefined();
    });
  });

  it('decorates each delete handler with the right entity and id param', () => {
    const meta = (c: { prototype: object }) =>
      Reflect.getMetadata(AUDIT_DELETE_METADATA, deleteHandler(c));
    expect(meta(UsersGlobalController)).toEqual({ entity: User, idParam: 'userId' });
    expect(meta(TeamsGlobalController)).toEqual({ entity: Team, idParam: 'teamId' });
    expect(meta(OwnershipsGlobalController)).toEqual({
      entity: Ownership,
      idParam: 'ownershipId',
    });
    expect(meta(UserTeamMembershipsGlobalController)).toEqual({
      entity: UserTeamMembership,
      idParam: 'userTeamMembershipId',
    });
    expect(meta(UserTeamMembershipsController)).toEqual({
      entity: UserTeamMembership,
      idParam: 'userTeamMembershipId',
    });
    expect(meta(EdfiTenantsGlobalController)).toEqual({
      entity: EdfiTenant,
      idParam: 'edfiTenantId',
    });
    expect(meta(EdfiTenantsController)).toEqual({ entity: EdfiTenant, idParam: 'edfiTenantId' });
    expect(meta(OdssController)).toEqual({ entity: Ods, idParam: 'odsId' });
    expect(meta(EdorgsController)).toEqual({ entity: Edorg, idParam: 'edorgId' });
    expect(meta(RolesGlobalController)).toEqual({ entity: Role, idParam: 'roleId' });
    expect(meta(RolesController)).toEqual({ entity: Role, idParam: 'roleId' });
    expect(meta(IntegrationProvidersGlobalController)).toEqual({
      entity: IntegrationProvider,
      idParam: 'id',
    });
    expect(meta(SbEnvironmentsGlobalController)).toEqual({
      entity: SbEnvironment,
      idParam: 'sbEnvironmentId',
    });
  });

  describe('User', () => {
    it('snapshots username, user type and role name only', () => {
      const snapshot = build(User, user);
      expect(snapshot).toEqual({ username: 'jdoe', userType: 'human', role: 'Admin' });
      expectNoForbiddenKeys(snapshot);
    });
    it('tolerates a missing role', () => {
      expect(
        build(User, Object.assign(new User(), { username: 'm', userType: 'machine' })),
      ).toEqual({ username: 'm', userType: 'machine', role: null });
    });
    it('loads the role relation', () => {
      expect(getDeleteSnapshotRelations(User)).toEqual(['role']);
    });
  });

  describe('Team', () => {
    it('snapshots the team name only', () => {
      const snapshot = build(Team, team);
      expect(snapshot).toEqual({ name: 'Team A' });
      expectNoForbiddenKeys(snapshot);
    });
  });

  describe('Ownership', () => {
    const base = { id: 1, team, role };
    it.each([
      ['sbEnvironment', Object.assign(new SbEnvironment(), { name: 'env1' }), 'env1'],
      ['edfiTenant', Object.assign(new EdfiTenant(), { name: 'tenant1' }), 'tenant1'],
      ['ods', Object.assign(new Ods(), { dbName: 'ods_1' }), 'ods_1'],
      ['edorg', Object.assign(new Edorg(), { nameOfInstitution: 'District' }), 'District'],
      [
        'integrationProvider',
        Object.assign(new IntegrationProvider(), { name: 'Provider' }),
        'Provider',
      ],
    ])('snapshots team, role and %s name', (type, resource, resourceName) => {
      const snapshot = build(Ownership, Object.assign(new Ownership(), base, { [type]: resource }));
      expect(snapshot).toEqual({
        team: 'Team A',
        role: 'Admin',
        resourceType: type,
        resource: resourceName,
      });
      expectNoForbiddenKeys(snapshot);
    });
    it.each([
      ['ods', Object.assign(new Ods(), { dbName: 'ods_1' }), 'ods_1 (tenant1)'],
      [
        'edorg',
        Object.assign(new Edorg(), { nameOfInstitution: 'District' }),
        'District (tenant1)',
      ],
    ])('labels an %s resource with its tenant name', (type, resource, label) => {
      const edfiTenant = Object.assign(new EdfiTenant(), { name: 'tenant1' });
      const snapshot = build(
        Ownership,
        Object.assign(new Ownership(), base, { [type]: Object.assign(resource, { edfiTenant }) }),
      );
      expect(snapshot).toEqual({
        team: 'Team A',
        role: 'Admin',
        resourceType: type,
        resource: label,
      });
    });
    it('tolerates missing relations', () => {
      expect(build(Ownership, Object.assign(new Ownership(), { id: 1 }))).toEqual({
        team: null,
        role: null,
        resourceType: null,
        resource: null,
      });
    });
    it('loads team, role, resource and resource tenant relations', () => {
      expect(getDeleteSnapshotRelations(Ownership)).toEqual([
        'team',
        'role',
        'sbEnvironment',
        'edfiTenant',
        'ods',
        'ods.edfiTenant',
        'edorg',
        'edorg.edfiTenant',
        'integrationProvider',
      ]);
    });
  });

  describe('UserTeamMembership', () => {
    it('snapshots username, team name and role name only', () => {
      const snapshot = build(
        UserTeamMembership,
        Object.assign(new UserTeamMembership(), { id: 9, user, team, role }),
      );
      expect(snapshot).toEqual({ username: 'jdoe', team: 'Team A', role: 'Admin' });
      expectNoForbiddenKeys(snapshot);
    });
    it('tolerates missing relations', () => {
      expect(build(UserTeamMembership, new UserTeamMembership())).toEqual({
        username: null,
        team: null,
        role: null,
      });
    });
    it('loads user, team and role relations', () => {
      expect(getDeleteSnapshotRelations(UserTeamMembership)).toEqual(['user', 'team', 'role']);
    });
  });

  describe('EdfiTenant', () => {
    const sbEnvironment = Object.assign(new SbEnvironment(), {
      id: 2,
      name: 'Env 1',
      configPublic: { adminApiUrl: 'https://u:p@admin.example' },
    });
    it('snapshots tenant name and environment name only', () => {
      const snapshot = build(
        EdfiTenant,
        Object.assign(new EdfiTenant(), { id: 4, name: 'tenant1', sbEnvironment }),
      );
      expect(snapshot).toEqual({ name: 'tenant1', environment: 'Env 1' });
      expectNoForbiddenKeys(snapshot);
    });
    it('tolerates a missing environment', () => {
      expect(build(EdfiTenant, Object.assign(new EdfiTenant(), { name: 't' }))).toEqual({
        name: 't',
        environment: null,
      });
    });
    it('loads the environment relation', () => {
      expect(getDeleteSnapshotRelations(EdfiTenant)).toEqual(['sbEnvironment']);
    });
  });

  describe('Ods', () => {
    it('snapshots db name and tenant name only', () => {
      const snapshot = build(
        Ods,
        Object.assign(new Ods(), {
          id: 6,
          dbName: 'ods_1',
          edfiTenant: Object.assign(new EdfiTenant(), { name: 'tenant1' }),
        }),
      );
      expect(snapshot).toEqual({ dbName: 'ods_1', tenant: 'tenant1' });
      expectNoForbiddenKeys(snapshot);
    });
    it('tolerates a missing tenant', () => {
      expect(build(Ods, Object.assign(new Ods(), { dbName: 'ods_1' }))).toEqual({
        dbName: 'ods_1',
        tenant: null,
      });
    });
    it('loads the tenant relation', () => {
      expect(getDeleteSnapshotRelations(Ods)).toEqual(['edfiTenant']);
    });
  });

  describe('Edorg', () => {
    it('snapshots institution name, education organization id and ODS db name only', () => {
      const snapshot = build(
        Edorg,
        Object.assign(new Edorg(), {
          id: 8,
          nameOfInstitution: 'District',
          educationOrganizationId: 255901,
          ods: Object.assign(new Ods(), { dbName: 'ods_1' }),
        }),
      );
      expect(snapshot).toEqual({
        nameOfInstitution: 'District',
        educationOrganizationId: 255901,
        ods: 'ods_1',
      });
      expectNoForbiddenKeys(snapshot);
    });
    it('tolerates a missing ODS', () => {
      expect(
        build(
          Edorg,
          Object.assign(new Edorg(), { nameOfInstitution: 'D', educationOrganizationId: 1 }),
        ),
      ).toEqual({ nameOfInstitution: 'D', educationOrganizationId: 1, ods: null });
    });
    it('loads the ODS relation', () => {
      expect(getDeleteSnapshotRelations(Edorg)).toEqual(['ods']);
    });
  });

  describe('Role', () => {
    it('snapshots role name and type only', () => {
      const snapshot = build(
        Role,
        Object.assign(new Role(), {
          id: 5,
          name: 'Admin',
          type: 'UserTeam',
          description: 'd',
          privilegeIds: ['me:read'],
        }),
      );
      expect(snapshot).toEqual({ name: 'Admin', type: 'UserTeam' });
      expectNoForbiddenKeys(snapshot);
    });
  });

  describe('IntegrationProvider', () => {
    it('snapshots the provider name only', () => {
      const snapshot = build(
        IntegrationProvider,
        Object.assign(new IntegrationProvider(), { id: 1, name: 'Provider', description: 'x' }),
      );
      expect(snapshot).toEqual({ name: 'Provider' });
      expectNoForbiddenKeys(snapshot);
    });
  });

  describe('SbEnvironment', () => {
    it('snapshots the environment name only, never its config', () => {
      const snapshot = build(
        SbEnvironment,
        Object.assign(new SbEnvironment(), {
          id: 2,
          name: 'Env 1',
          envLabel: 'prod',
          configPublic: { adminApiUrl: 'https://u:p@admin.example' },
          configPrivate: { adminApiKey: 'k', adminApiSecret: 's' },
        }),
      );
      expect(snapshot).toEqual({ name: 'Env 1' });
      expectNoForbiddenKeys(snapshot);
    });
  });
});

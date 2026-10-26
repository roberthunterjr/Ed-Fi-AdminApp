import 'reflect-metadata';
import { EdfiTenant, Ods } from '@edanalytics/models-server';
import { DataSource } from 'typeorm';
import {
  AUDIT_ADMIN_API_DELETE_METADATA,
  AuditAdminApiDeleteMetadata,
} from './audit-admin-api-delete.decorator';
import { adminApiDeleteSnapshots } from './admin-api-delete.snapshots';
import './delete-snapshot.registrations';
import { AdminApiServiceV1 } from '../teams/edfi-tenants/starting-blocks/v1/admin-api.v1.service';
import { AdminApiServiceV2 } from '../teams/edfi-tenants/starting-blocks/v2/admin-api.v2.service';
import { AdminApiServiceV3 } from '../teams/edfi-tenants/starting-blocks/v3/admin-api.v3.service';
import { AdminApiControllerV1 } from '../teams/edfi-tenants/starting-blocks/v1/admin-api.v1.controller';
import { AdminApiControllerV2 } from '../teams/edfi-tenants/starting-blocks/v2/admin-api.v2.controller';
import { AdminApiControllerV3 } from '../teams/edfi-tenants/starting-blocks/v3/admin-api.v3.controller';

// The real AuthService fails type-checking under the stale node_modules; the test never needs it.
jest.mock('../auth/auth.service', () => ({ AuthService: class AuthService {} }));

const FORBIDDEN_KEYS = [
  'contactEmailAddress',
  'contactName',
  'key',
  'clientId',
  'secret',
  'definition',
];

const edfiTenant = Object.assign(new EdfiTenant(), { id: 4, name: 'tenant1' });

const resolve = (services: Map<unknown, unknown>) => ({
  get: (token: unknown) => services.get(token),
});

const ctx = (services: Map<unknown, unknown>, id: number) => ({
  moduleRef: resolve(services) as never,
  edfiTenant,
  id,
});

const expectNoForbiddenKeys = (snapshot: Record<string, unknown> | undefined) =>
  FORBIDDEN_KEYS.forEach((key) => expect(Object.keys(snapshot ?? {})).not.toContain(key));

describe('Admin API delete snapshots', () => {
  it('snapshots a vendor company only, for every version', async () => {
    const vendor = {
      company: 'Acme',
      contactName: 'Jo',
      contactEmailAddress: 'jo@acme.test',
      namespacePrefixes: ['uri://acme'],
    };
    for (const [version, service] of [
      ['v1', AdminApiServiceV1],
      ['v2', AdminApiServiceV2],
      ['v3', AdminApiServiceV3],
    ] as const) {
      const getVendor = jest.fn().mockResolvedValue(vendor);
      const snapshot = await adminApiDeleteSnapshots[version].vendor(
        ctx(new Map([[service, { getVendor }]]), 9),
      );
      expect(snapshot).toEqual({ company: 'Acme' });
      expect(getVendor).toHaveBeenCalledWith(edfiTenant, 9);
      expectNoForbiddenKeys(snapshot);
    }
  });

  it('snapshots application name, claim set and education organization ids', async () => {
    const application = {
      id: 3,
      applicationName: 'App',
      claimSetName: 'Roster',
      vendorId: 9,
      educationOrganizationIds: [255901],
      key: 'k',
      secret: 's',
    };
    for (const [version, service] of [
      ['v2', AdminApiServiceV2],
      ['v3', AdminApiServiceV3],
    ] as const) {
      const snapshot = await adminApiDeleteSnapshots[version].application(
        ctx(new Map([[service, { getApplication: jest.fn().mockResolvedValue(application) }]]), 3),
      );
      expect(snapshot).toEqual({
        applicationName: 'App',
        claimSetName: 'Roster',
        educationOrganizationIds: [255901],
      });
      expectNoForbiddenKeys(snapshot);
    }
  });

  it('snapshots a v1 application using its education organization ids', async () => {
    const application = {
      applicationName: 'App',
      claimSetName: 'Roster',
      _educationOrganizationIds: [1, 2],
    };
    const snapshot = await adminApiDeleteSnapshots.v1.application(
      ctx(new Map([[AdminApiServiceV1, { getApplication: async () => application }]]), 3),
    );
    expect(snapshot).toEqual({
      applicationName: 'App',
      claimSetName: 'Roster',
      educationOrganizationIds: [1, 2],
    });
  });

  it('snapshots an API client name, never its key', async () => {
    const apiClient = { id: 1, name: 'Client', key: 'abc', isApproved: true };
    for (const [version, service] of [
      ['v2', AdminApiServiceV2],
      ['v3', AdminApiServiceV3],
    ] as const) {
      const snapshot = await adminApiDeleteSnapshots[version].apiClient(
        ctx(new Map([[service, { getApiClient: jest.fn().mockResolvedValue(apiClient) }]]), 1),
      );
      expect(snapshot).toEqual({ name: 'Client' });
      expectNoForbiddenKeys(snapshot);
    }
  });

  it('snapshots a claim set name only', async () => {
    const claimset = { id: 1, name: 'Roster', resourceClaims: [{ name: 'x' }] };
    expect(
      await adminApiDeleteSnapshots.v1.claimset(
        ctx(new Map([[AdminApiServiceV1, { getClaimset: async () => claimset }]]), 1),
      ),
    ).toEqual({ name: 'Roster' });
    for (const [version, service] of [
      ['v2', AdminApiServiceV2],
      ['v3', AdminApiServiceV3],
    ] as const) {
      expect(
        await adminApiDeleteSnapshots[version].claimset(
          ctx(new Map([[service, { getClaimsetBasic: async () => claimset }]]), 1),
        ),
      ).toEqual({ name: 'Roster' });
    }
  });

  it('snapshots a profile name, never its definition', async () => {
    const profile = { id: 1, name: 'Profile', definition: '<Profile/>' };
    for (const [version, service] of [
      ['v2', AdminApiServiceV2],
      ['v3', AdminApiServiceV3],
    ] as const) {
      const snapshot = await adminApiDeleteSnapshots[version].profile(
        ctx(new Map([[service, { getProfile: async () => profile }]]), 1),
      );
      expect(snapshot).toEqual({ name: 'Profile' });
      expectNoForbiddenKeys(snapshot);
    }
  });

  describe('instance', () => {
    it('reuses the Ods snapshot of the local row found by instance manage id', async () => {
      const findOneBy = jest
        .fn()
        .mockResolvedValue(Object.assign(new Ods(), { dbName: 'ods_1', status: 'Created' }));
      const snapshot = await adminApiDeleteSnapshots.v3.instance(
        ctx(new Map([[DataSource, { manager: { findOneBy } }]]), 12),
      );
      expect(snapshot).toEqual({ dbName: 'ods_1', tenant: 'tenant1' });
      expect(findOneBy).toHaveBeenCalledWith(Ods, { edfiTenantId: 4, instanceManageId: 12 });
    });

    it('returns nothing when no local ODS matches', async () => {
      const findOneBy = jest.fn().mockResolvedValue(null);
      expect(
        await adminApiDeleteSnapshots.v2.instance(
          ctx(new Map([[DataSource, { manager: { findOneBy } }]]), 12),
        ),
      ).toBeUndefined();
    });
  });

  describe('controller decoration', () => {
    const meta = (controller: { prototype: object }, handler: string) =>
      Reflect.getMetadata(
        AUDIT_ADMIN_API_DELETE_METADATA,
        (controller.prototype as Record<string, object>)[handler],
      ) as AuditAdminApiDeleteMetadata | undefined;

    it.each([
      ['deleteVendor', 'vendorId', 'vendor'],
      ['deleteApplication', 'applicationId', 'application'],
      ['deleteClaimset', 'claimsetId', 'claimset'],
    ] as const)('decorates v1 %s', (handler, idParam, key) => {
      const m = meta(AdminApiControllerV1, handler);
      expect(m?.idParam).toBe(idParam);
      expect(m?.load).toBe(adminApiDeleteSnapshots.v1[key]);
    });

    it.each([
      ['v2', AdminApiControllerV2],
      ['v3', AdminApiControllerV3],
    ] as const)('decorates every %s delete handler', (version, controller) => {
      [
        ['deleteVendor', 'vendorId', 'vendor'],
        ['deleteApplication', 'applicationId', 'application'],
        ['deleteApiClient', 'apiclientId', 'apiClient'],
        ['deleteClaimset', 'claimsetId', 'claimset'],
        ['deleteInstance', 'instanceManageId', 'instance'],
        ['deleteProfile', 'profileId', 'profile'],
      ].forEach(([handler, idParam, key]) => {
        const m = meta(controller, handler);
        expect(m?.idParam).toBe(idParam);
        expect(m?.load).toBe(
          adminApiDeleteSnapshots[version][key as keyof typeof adminApiDeleteSnapshots.v2],
        );
      });
    });
  });
});

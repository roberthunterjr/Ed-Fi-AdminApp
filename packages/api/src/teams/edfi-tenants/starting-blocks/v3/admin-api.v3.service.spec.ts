import 'reflect-metadata';
import { EdfiTenant, SbEnvironment } from '@edanalytics/models-server';
import { AdminApiServiceV3 } from './admin-api.v3.service';
import * as adminApiTenancy from '../../../../utils/admin-api-tenancy';
import { AdminApiTenancyError } from '../../../../utils/admin-api-tenancy';
import * as apiMetadataUtils from '../../../../utils/api-metadata-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('AdminApiServiceV3', () => {
  let service: AdminApiServiceV3;

  const mockEdfiTenant: Partial<EdfiTenant> = {
    id: 1,
    name: 'test-tenant',
    sbEnvironment: {
      id: 1,
      name: 'Test Environment',
      adminApiUrl: 'https://api.test.com',
    } as SbEnvironment,
  };

  beforeEach(() => {
    service = new AdminApiServiceV3();
  });

  describe('login', () => {
    const mockSbEnvironment: Partial<SbEnvironment> = {
      id: 1,
      name: 'Test Environment',
      adminApiUrl: 'https://api.test.com',
      configPublic: {
        version: 'v3',
        values: {
          tenants: {
            'test-tenant': { adminApiKey: 'test-key' },
          },
        },
      } as any,
      configPrivate: {
        tenants: {
          'test-tenant': { adminApiSecret: 'test-secret' },
        },
      } as any,
    };

    it('returns NO_CONFIG when configPublic.version is not v3', async () => {
      const environment = {
        ...mockSbEnvironment,
        configPublic: { version: 'v2', values: {} } as any,
      } as SbEnvironment;

      const result = await service.login(environment, 1, 'test-tenant');

      expect(result).toEqual({ status: 'NO_CONFIG' });
    });

    it('returns NO_TENANT_CONFIG when the requested tenant has no credentials', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      const result = await service.login(environment, 1, 'unknown-tenant');

      expect(result).toEqual({ status: 'NO_TENANT_CONFIG' });
    });
  });

  describe('getTenants', () => {
    const mockSbEnvironment: Partial<SbEnvironment> = {
      id: 1,
      name: 'Test Environment',
      adminApiUrl: 'https://api.test.com',
      configPublic: {
        version: 'v3',
        values: { tenants: { 'test-tenant': { adminApiKey: 'test-key' } } },
      } as any,
      configPrivate: {
        tenants: { 'test-tenant': { adminApiSecret: 'test-secret' } },
      } as any,
    };

    beforeEach(() => {
      // getTenants() discovers tenants via fetchAdminApiInfo + fetchAdminApiTenancy
      // rather than an authenticated GET /. Mock fetchAdminApiInfo here so tests
      // never issue a real axios call; individual tests mock fetchAdminApiTenancy's
      // resolution/rejection directly.
      jest.spyOn(apiMetadataUtils, 'fetchAdminApiInfo').mockResolvedValue({
        specificationVersion: 'v3',
        urls: { tenancy: 'https://api.test.com/v3/tenancy' },
      });
    });

    it('discovers the tenant names from the tenancy endpoint in multi-tenant mode', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      const tenancySpy = jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: ['tenant-a', 'tenant-b'],
        mode: 'MultiTenant',
      });

      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      const mockApiGet = jest
        .fn()
        .mockResolvedValueOnce({
          data: { id: 'tenant-a', name: 'Tenant A', dataStores: [] },
        })
        .mockResolvedValueOnce({
          data: { id: 'tenant-b', name: 'Tenant B', dataStores: [] },
        });
      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({ get: mockApiGet });

      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-tenant-a') return 'token-tenant-a';
        if (key === '1-tenant-b') return 'token-tenant-b';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);
      const names = result.map((t) => t.name);

      expect(apiMetadataUtils.fetchAdminApiInfo).toHaveBeenCalledWith(environment.adminApiUrl);
      expect(tenancySpy).toHaveBeenCalled();
      expect(names).toEqual(['tenant-a', 'tenant-b']);
      expect(mockApiGet).toHaveBeenCalledWith(
        'tenants/tenant-a/dataStores/edOrgs',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token-tenant-a',
            tenant: 'tenant-a',
          }),
        }),
      );
    });

    it('uses the default tenant when the tenancy endpoint reports single-tenant', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: [],
        mode: 'SingleTenant',
      });

      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      const mockApiGet = jest.fn().mockResolvedValueOnce({
        data: { id: 'default', name: 'Default', dataStores: [] },
      });
      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({ get: mockApiGet });

      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-default') return 'token-default';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);
      const names = result.map((t) => t.name);

      expect(names).toEqual(['default']);
    });

    it('uses the default tenant when Admin API exposes no tenancy endpoint', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({ supported: false });

      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      const mockApiGet = jest.fn().mockResolvedValueOnce({
        data: { id: 'default', name: 'Default', dataStores: [] },
      });
      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({ get: mockApiGet });

      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-default') return 'token-default';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);
      const names = result.map((t) => t.name);

      expect(names).toEqual(['default']);
    });

    it('propagates the error instead of falling back to default when tenancy is misconfigured', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      const detail =
        'MultiTenancy is enabled but no tenants are configured. Check the Tenants section of appsettings.';
      const tenancyError = new AdminApiTenancyError('MISCONFIGURED', detail, detail);
      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockRejectedValue(tenancyError);

      const error = await service.getTenants(environment).catch((e) => e);

      expect(error).toBe(tenancyError);
      expect(error).toBeInstanceOf(AdminApiTenancyError);
      expect(error.detail).toBe(detail);
    });

    it('propagates the error instead of falling back to default when tenancy is unavailable', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      const tenancyError = new AdminApiTenancyError(
        'UNAVAILABLE',
        'Could not determine tenancy for this Management API.',
      );
      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockRejectedValue(tenancyError);

      const error = await service.getTenants(environment).catch((e) => e);

      expect(error).toBe(tenancyError);
      expect(error).toBeInstanceOf(AdminApiTenancyError);
      expect(error.kind).toBe('UNAVAILABLE');
    });
  });

  describe('initializeApiClient', () => {
    it('creates an axios client with a /v3/ baseURL', () => {
      const client = (service as any).initializeApiClient(
        { adminApiUrl: 'https://api.test.com' } as SbEnvironment,
        false,
      );

      expect(client.defaults.baseURL).toBe('https://api.test.com/v3/');
    });
  });

  describe('getVendors', () => {
    it('returns vendors mapped through the V3 DTO serializer', async () => {
      const mockGet = jest
        .fn()
        .mockResolvedValue([
          {
            id: 1,
            company: 'Acme',
            contactName: 'Jane',
            contactEmailAddress: 'jane@acme.com',
            namespacePrefixes: '',
          },
        ]);
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getVendors(mockEdfiTenant as EdfiTenant);

      expect(mockGet).toHaveBeenCalledWith('vendors?offset=0&limit=10000');
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('Acme');
    });
  });

  describe('postVendor', () => {
    it('returns the new vendor id parsed from the Location header', async () => {
      const mockPost = jest
        .fn()
        .mockResolvedValue({ headers: { location: 'https://api.test.com/v3/vendors/42' } });
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ post: mockPost });

      const result = await service.postVendor(
        mockEdfiTenant as EdfiTenant,
        {
          company: 'Acme',
        } as any,
      );

      expect(mockPost).toHaveBeenCalledWith('vendors', { company: 'Acme' });
      expect(result).toEqual({ id: 42 });
    });
  });

  describe('getApplications', () => {
    it('returns applications with dataStoreIds populated', async () => {
      const mockGet = jest.fn().mockResolvedValue([
        {
          id: 1,
          applicationName: 'App1',
          vendorId: 1,
          claimSetName: 'Default',
          profileIds: [],
          educationOrganizationIds: [255901],
          dataStoreIds: [10],
        },
      ]);
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getApplications(mockEdfiTenant as EdfiTenant);

      expect(mockGet).toHaveBeenCalledWith('applications?offset=0&limit=10000');
      expect(result[0].dataStoreIds).toEqual([10]);
    });
  });

  describe('getApiClients', () => {
    it('requests apiclients filtered by applicationId and returns dataStoreIds', async () => {
      const mockGet = jest.fn().mockResolvedValue([
        {
          id: 1,
          name: 'client',
          clientId: 'key',
          isApproved: true,
          useSandbox: false,
          sandboxType: 0,
          applicationId: 5,
          keyStatus: 'Active',
          dataStoreIds: [10],
        },
      ]);
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getApiClients(mockEdfiTenant as EdfiTenant, 5);

      expect(mockGet).toHaveBeenCalledWith('apiClients?offset=0&limit=10000&applicationId=5');
      expect(result[0].dataStoreIds).toEqual([10]);
    });

    // Admin API V3's GET/list apiClients response uses `clientId`, not `key`,
    // for the credential value (its own POST response uses `key` for the same
    // concept) — see edfi-admin-api.v3.dto.spec.ts for the DTO-level test.
    // This test guards the service-layer wiring end to end.
    it('maps the wire field `clientId` onto `key`', async () => {
      const mockGet = jest.fn().mockResolvedValue([
        {
          id: 1,
          name: 'client',
          clientId: 'Ihu78396gvdt',
          isApproved: true,
          useSandbox: false,
          sandboxType: 0,
          applicationId: 5,
          keyStatus: 'Active',
          dataStoreIds: [10],
        },
      ]);
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getApiClients(mockEdfiTenant as EdfiTenant, 5);

      expect(result[0].key).toBe('Ihu78396gvdt');
    });
  });

  describe('getClaimsets', () => {
    it('returns claimsets mapped through the V3 DTO serializer', async () => {
      const mockGet = jest
        .fn()
        .mockResolvedValue([
          { id: 1, claimSetName: 'Default', _isSystemReserved: true, _applications: [] },
        ]);
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getClaimsets(mockEdfiTenant as EdfiTenant);

      expect(mockGet).toHaveBeenCalledWith('claimSets?offset=0&limit=10000');
      expect(result[0].displayName).toBe('Default');
    });
  });

  describe('getClaimsetBasic', () => {
    it('fetches only the claimSet detail route, without merging in the resourceClaims hierarchy', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        id: 1,
        claimSetName: 'SIS Vendor',
        _isSystemReserved: true,
        _applications: [],
        resourceClaims: [],
      });
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getClaimsetBasic(mockEdfiTenant as EdfiTenant, 1);

      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith('claimSets/1');
      expect(result._isSystemReserved).toBe(true);
    });
  });

  describe('getClaimset', () => {
    it('requests the single claimSet detail route and returns the mapped DTO', async () => {
      const mockGet = jest.fn().mockImplementation((path: string) => {
        if (path === 'claimSets/1') {
          return Promise.resolve({
            id: 1,
            claimSetName: 'SIS Vendor',
            _isSystemReserved: true,
            _applications: [],
            resourceClaims: [],
          });
        }
        if (path === 'resourceClaims?offset=0&limit=10000') {
          return Promise.resolve([]);
        }
        throw new Error(`Unexpected path: ${path}`);
      });
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getClaimset(mockEdfiTenant as EdfiTenant, 1);

      expect(mockGet).toHaveBeenCalledWith('claimSets/1');
      expect(result.id).toBe(1);
      expect(result.displayName).toBe('SIS Vendor');
    });

    it('merges in resource claims missing from the claimset (no actions) as denied placeholders', async () => {
      const mockGet = jest.fn().mockImplementation((path: string) => {
        if (path === 'claimSets/1') {
          return Promise.resolve({
            id: 1,
            claimSetName: 'Ed-Fi Sandbox',
            _isSystemReserved: true,
            _applications: [],
            resourceClaims: [
              {
                name: 'types',
                claimName: 'http://ed-fi.org/ods/identity/claims/domains/edFiTypes',
                parentClaimName: null,
                actions: [{ name: 'Read', enabled: true }],
                _defaultAuthorizationStrategies: [],
                authorizationStrategyOverrides: [],
              },
            ],
          });
        }
        if (path === 'resourceClaims?offset=0&limit=10000') {
          return Promise.resolve([
            {
              id: 1,
              name: 'types',
              parentId: 0,
              parentName: null,
              children: [{ id: 12, name: 'schoolYearType', parentId: 1, parentName: 'types', children: [] }],
            },
          ]);
        }
        throw new Error(`Unexpected path: ${path}`);
      });
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getClaimset(mockEdfiTenant as EdfiTenant, 1);

      const schoolYearType = result.resourceClaims.find((rc) => rc.name === 'schoolYearType');
      expect(schoolYearType).toBeDefined();
      expect(schoolYearType!.actions).toEqual([]);
      expect(schoolYearType!.parentClaimName).toBe(
        'http://ed-fi.org/ods/identity/claims/domains/edFiTypes'
      );
    });

    it('falls back to the claimset unmerged when the resourceClaims-hierarchy fetch fails', async () => {
      const originalResourceClaims = [
        {
          name: 'types',
          claimName: 'http://ed-fi.org/ods/identity/claims/domains/edFiTypes',
          parentClaimName: null,
          actions: [{ name: 'Read', enabled: true }],
          _defaultAuthorizationStrategies: [],
          authorizationStrategyOverrides: [],
        },
      ];
      const mockGet = jest.fn().mockImplementation((path: string) => {
        if (path === 'claimSets/1') {
          return Promise.resolve({
            id: 1,
            claimSetName: 'Ed-Fi Sandbox',
            _isSystemReserved: true,
            _applications: [],
            resourceClaims: originalResourceClaims,
          });
        }
        if (path === 'resourceClaims?offset=0&limit=10000') {
          return Promise.reject(new Error('resourceClaims endpoint unavailable'));
        }
        throw new Error(`Unexpected path: ${path}`);
      });
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getClaimset(mockEdfiTenant as EdfiTenant, 1);

      expect(result.resourceClaims).toEqual(originalResourceClaims);
    });

    it('still rejects when the claimset fetch itself fails', async () => {
      const mockGet = jest.fn().mockImplementation((path: string) => {
        if (path === 'claimSets/1') {
          return Promise.reject(new Error('claimset endpoint unavailable'));
        }
        if (path === 'resourceClaims?offset=0&limit=10000') {
          return Promise.resolve([]);
        }
        throw new Error(`Unexpected path: ${path}`);
      });
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      await expect(service.getClaimset(mockEdfiTenant as EdfiTenant, 1)).rejects.toThrow(
        'claimset endpoint unavailable'
      );
    });
  });

  describe('getResourceClaims', () => {
    it('requests the full resourceClaims hierarchy and returns it mapped through the V3 detail DTO', async () => {
      const mockGet = jest
        .fn()
        .mockResolvedValue([{ id: 1, name: 'types', parentId: 0, parentName: null, children: [] }]);
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getResourceClaims(mockEdfiTenant as EdfiTenant);

      expect(mockGet).toHaveBeenCalledWith('resourceClaims?offset=0&limit=10000');
      expect(result[0].name).toBe('types');
    });
  });

  describe('copyClaimset', () => {
    it('parses the new claimset id from the Location header', async () => {
      const mockPost = jest
        .fn()
        .mockResolvedValue({ headers: { location: 'https://api.test.com/v3/claimSets/99' } });
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ post: mockPost });

      const result = await service.copyClaimset(mockEdfiTenant as EdfiTenant, {
        originalId: 1,
        name: 'Copy',
      });

      expect(mockPost).toHaveBeenCalledWith('claimSets/copy', { originalId: 1, name: 'Copy' });
      expect(result.id).toBe(99);
    });
  });

  describe('getDataStores', () => {
    it('requests the dataStores route and returns dataStoreType', async () => {
      const mockGet = jest.fn().mockResolvedValue([{ id: 1, name: 'Ods1', dataStoreType: 'Ods' }]);
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getDataStores(mockEdfiTenant as EdfiTenant);

      expect(mockGet).toHaveBeenCalledWith('dataStores?offset=0&limit=10000');
      expect(result[0].dataStoreType).toBe('Ods');
    });
  });

  describe('getProfiles', () => {
    it('returns profiles mapped through the V3 DTO serializer', async () => {
      const mockGet = jest
        .fn()
        .mockResolvedValue([{ id: 1, name: 'Profile1', definition: '<a/>' }]);
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getProfiles(mockEdfiTenant as EdfiTenant);

      expect(mockGet).toHaveBeenCalledWith('profiles?offset=0&limit=10000');
      expect(result[0].displayName).toBe('Profile1');
    });
  });

  describe('deleteVendor', () => {
    it('calls delete on the correct route and returns undefined', async () => {
      const mockDelete = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ delete: mockDelete });

      const result = await service.deleteVendor(mockEdfiTenant as EdfiTenant, 7);

      expect(mockDelete).toHaveBeenCalledWith('vendors/7');
      expect(result).toBeUndefined();
    });
  });

  describe('getAdminApiClientForEnvironment', () => {
    const buildEnv = (tenants: Record<string, unknown>): SbEnvironment =>
      ({
        id: 1,
        name: 'Test Environment',
        adminApiUrl: 'https://api.test.com',
        configPublic: { version: 'v3', values: { tenants } } as any,
      } as SbEnvironment);

    it('prefers the "default" tenant when available', () => {
      const environment = buildEnv({ 'tenant-a': {}, default: {} });
      const usingEnvSpy = jest
        .spyOn(service as any, 'getAdminApiClientUsingEnv')
        .mockReturnValue('client' as any);

      const result = service.getAdminApiClientForEnvironment(environment);

      expect(usingEnvSpy).toHaveBeenCalledWith(environment, undefined, 'default');
      expect(result).toBe('client');
    });

    it('falls back to the first available tenant when "default" is absent', () => {
      const environment = buildEnv({ 'tenant-a': {}, 'tenant-b': {} });
      const usingEnvSpy = jest
        .spyOn(service as any, 'getAdminApiClientUsingEnv')
        .mockReturnValue('client' as any);

      service.getAdminApiClientForEnvironment(environment);

      expect(usingEnvSpy).toHaveBeenCalledWith(environment, undefined, 'tenant-a');
    });

    it('passes undefined tenantName when no tenants are configured', () => {
      const environment = buildEnv({});
      const usingEnvSpy = jest
        .spyOn(service as any, 'getAdminApiClientUsingEnv')
        .mockReturnValue('client' as any);

      service.getAdminApiClientForEnvironment(environment);

      expect(usingEnvSpy).toHaveBeenCalledWith(environment, undefined, undefined);
    });
  });

  describe('triggerEdOrgRefresh', () => {
    const env = {
      id: 1,
      name: 'Test Environment',
      adminApiUrl: 'https://api.test.com',
      configPublic: { version: 'v3', values: { tenants: { default: {} } } } as any,
    } as SbEnvironment;

    it('should return the jobId when the refresh endpoint succeeds', async () => {
      const mockClient = { post: jest.fn().mockResolvedValue({ jobId: 'job-abc-123' }) };
      const getClientSpy = jest
        .spyOn(service, 'getAdminApiClientForEnvironment')
        .mockReturnValue(mockClient as any);

      const result = await service.triggerEdOrgRefresh(env);

      expect(getClientSpy).toHaveBeenCalledWith(env);
      expect(mockClient.post).toHaveBeenCalledWith('dataStores/edOrgs/refresh');
      expect(result).toBe('job-abc-123');
    });

    it('should return null and log a warning when the response has no jobId', async () => {
      const mockClient = { post: jest.fn().mockResolvedValue({}) };
      jest.spyOn(service, 'getAdminApiClientForEnvironment').mockReturnValue(mockClient as any);
      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      const result = await service.triggerEdOrgRefresh(env);

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing jobId'));
    });

    it('should return null and log a warning when the Admin API call throws', async () => {
      const mockClient = { post: jest.fn().mockRejectedValue(new Error('Network error')) };
      jest.spyOn(service, 'getAdminApiClientForEnvironment').mockReturnValue(mockClient as any);
      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      const result = await service.triggerEdOrgRefresh(env);

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to trigger EdOrg refresh')
      );
    });
  });

  describe('pollJobStatus', () => {
    const env = {
      id: 1,
      name: 'Test Environment',
      adminApiUrl: 'https://api.test.com',
      configPublic: { version: 'v3', values: { tenants: { default: {} } } } as any,
    } as SbEnvironment;
    const jobId = 'job-abc-123';

    it('should return "completed" when the job completes on the first poll', async () => {
      const mockClient = { get: jest.fn().mockResolvedValue({ status: 'completed' }) };
      jest.spyOn(service, 'getAdminApiClientForEnvironment').mockReturnValue(mockClient as any);

      const result = await service.pollJobStatus(env, jobId);

      expect(mockClient.get).toHaveBeenCalledWith(`jobs/${jobId}`);
      expect(result).toBe('completed');
    });

    it('should return "failed" when the Admin API reports the job failed', async () => {
      const mockClient = { get: jest.fn().mockResolvedValue({ status: 'failed' }) };
      jest.spyOn(service, 'getAdminApiClientForEnvironment').mockReturnValue(mockClient as any);

      const result = await service.pollJobStatus(env, jobId);

      expect(result).toBe('failed');
    });

    it('should return "timeout" after exhausting max poll attempts', async () => {
      // testing.js sets ADMINAPI_REFRESH_POLL_ATTEMPTS to 3, so after 3 "running" responses it times out
      const mockClient = { get: jest.fn().mockResolvedValue({ status: 'running' }) };
      jest.spyOn(service, 'getAdminApiClientForEnvironment').mockReturnValue(mockClient as any);
      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      const result = await service.pollJobStatus(env, jobId);

      expect(mockClient.get).toHaveBeenCalledTimes(3);
      expect(result).toBe('timeout');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('did not complete'));
    });

    it('should return "timeout" and log an error when the poll HTTP call throws', async () => {
      const mockClient = { get: jest.fn().mockRejectedValue(new Error('Connection refused')) };
      jest.spyOn(service, 'getAdminApiClientForEnvironment').mockReturnValue(mockClient as any);
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      const result = await service.pollJobStatus(env, jobId);

      expect(result).toBe('timeout');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Poll attempt'));
    });
  });

  describe('postInstance', () => {
    it('posts instance payload to dataStores/manage and returns id from location header', async () => {
      const payload = { name: 'My DB Instance', databaseTemplate: 'Minimal' };
      const mockPost = jest.fn().mockResolvedValue({
        headers: { location: '/v3/dataStores/manage/123' },
      });
      const getAdminApiClientSpy = jest
        .spyOn(service as any, 'getAdminApiClient')
        .mockReturnValue({ post: mockPost });

      const result = await service.postInstance({ id: 1 } as any, payload as any);

      expect(getAdminApiClientSpy).toHaveBeenCalledWith({ id: 1 }, true);
      expect(mockPost).toHaveBeenCalledWith('dataStores/manage', payload);
      expect(result).toEqual({ id: 123 });
    });

    it('throws when Location header is missing or invalid', async () => {
      const payload = { name: 'My DB Instance', databaseTemplate: 'Minimal' };
      const mockPost = jest.fn().mockResolvedValue({ headers: { location: undefined } });
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ post: mockPost });

      await expect(service.postInstance({ id: 1 } as any, payload as any)).rejects.toThrow(
        'Admin API did not return a Location header containing the created instance id.'
      );
      expect(mockPost).toHaveBeenCalledWith('dataStores/manage', payload);
    });
  });

  describe('deleteInstance', () => {
    it('calls admin API DELETE dataStores/manage/:id and resolves undefined', async () => {
      const instanceManageId = 123;
      const mockDelete = jest.fn().mockResolvedValue(undefined);
      const getAdminApiClientSpy = jest
        .spyOn(service as any, 'getAdminApiClient')
        .mockReturnValue({ delete: mockDelete });

      await expect(service.deleteInstance({ id: 1 } as any, instanceManageId)).resolves.toBeUndefined();

      expect(getAdminApiClientSpy).toHaveBeenCalledWith({ id: 1 }, true);
      expect(mockDelete).toHaveBeenCalledWith(`dataStores/manage/${instanceManageId}`);
    });

    it('rethrows when admin API delete fails', async () => {
      const instanceManageId = 123;
      const mockDelete = jest.fn().mockRejectedValue(new Error('failed to delete'));
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ delete: mockDelete });

      await expect(service.deleteInstance({ id: 1 } as any, instanceManageId)).rejects.toThrow(
        'failed to delete'
      );
      expect(mockDelete).toHaveBeenCalledWith(`dataStores/manage/${instanceManageId}`);
    });
  });
});

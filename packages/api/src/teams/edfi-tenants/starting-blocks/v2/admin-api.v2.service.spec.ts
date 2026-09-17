import 'reflect-metadata';
import { SbEnvironment } from '@edanalytics/models-server';
import { AdminApiServiceV2 } from './admin-api.v2.service';
import { StartingBlocksServiceV2 } from './starting-blocks.v2.service';
import { CustomHttpException } from '../../../../utils';
import * as adminApiTenancy from '../../../../utils/admin-api-tenancy';
import { AdminApiTenancyError } from '../../../../utils/admin-api-tenancy';
import * as apiMetadataUtils from '../../../../utils/api-metadata-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('AdminApiServiceV2 - Extension Methods', () => {
  let service: AdminApiServiceV2;
  let mockStartingBlocksService: Partial<StartingBlocksServiceV2>;

  const mockSbEnvironment: Partial<SbEnvironment> = {
    id: 1,
    name: 'Test Environment',
    adminApiUrl: 'https://api.test.com',
    configPublic: {
      version: 'v2',
      values: {
        tenants: {
          'test-tenant': {
            adminApiKey: 'test-key',
          },
        },
      },
    } as any,
    configPrivate: {
      version: 'v2',
      tenants: {
        'test-tenant': {
          adminApiSecret: 'test-secret',
        },
      },
    } as any,
  };

  beforeEach(() => {
    mockStartingBlocksService = {
      saveAdminApiCredentials: jest.fn(),
    };
    service = new AdminApiServiceV2(mockStartingBlocksService as StartingBlocksServiceV2);

    // getTenants() now discovers tenants via fetchAdminApiInfo + fetchAdminApiTenancy
    // instead of an authenticated GET /. Mock fetchAdminApiInfo here so tests that
    // don't care about its return value never issue a real axios call; individual
    // getTenants tests mock fetchAdminApiTenancy's resolution/rejection directly.
    jest.spyOn(apiMetadataUtils, 'fetchAdminApiInfo').mockResolvedValue({
      specificationVersion: 'v2',
      urls: { tenancy: 'https://api.test.com/v2/tenancy' },
    });
  });

  describe('getTenants', () => {
    it('should successfully return tenants in multi-tenant mode with EdOrgs and odsInstances', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      // Mock the tenancy discovery call in multi-tenant mode
      const tenancySpy = jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: ['tenant-one', 'tenant-two'],
        mode: 'MultiTenant',
      });

      // Mock tenant details responses (camelCase format)
      const mockDetailsResponseOne = {
        data: {
          id: 'tenant-one',
          name: 'Tenant One',
          odsInstances: [
            {
              id: 1,
              name: 'ODS One',
              odsInstanceManageId: 101,
              instanceType: 'Production',
              educationOrganizations: [
                {
                  educationOrganizationId: 255901,
                  nameOfInstitution: 'School One',
                  shortNameOfInstitution: 'S1',
                  discriminator: 'edfi.School',
                  parentId: 255900,
                },
              ],
            },
          ],
        },
      };

      const mockDetailsResponseTwo = {
        data: {
          id: 'tenant-two',
          name: 'Tenant Two',
          odsInstances: [
            {
              id: 2,
              name: 'ODS Two',
              odsInstanceManageId: null,
              instanceType: 'Test',
              educationOrganizations: [
                {
                  educationOrganizationId: 255902,
                  nameOfInstitution: 'School Two',
                  discriminator: 'edfi.School',
                },
              ],
            },
          ],
        },
      };

      // Mock login method to return success
      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      // Mock admin API client for tenant details
      const mockApiGet = jest.fn()
        .mockResolvedValueOnce(mockDetailsResponseOne)
        .mockResolvedValueOnce(mockDetailsResponseTwo);

      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      // Mock token cache to return tenant-specific tokens
      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-tenant-one') return 'token-tenant-one';
        if (key === '1-tenant-two') return 'token-tenant-two';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);

      // Confirm tenant discovery actually went through the tenancy endpoint helper,
      // not merely mocked past without being exercised.
      expect(apiMetadataUtils.fetchAdminApiInfo).toHaveBeenCalledWith(environment.adminApiUrl);
      expect(tenancySpy).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(mockApiGet).toHaveBeenCalledWith('tenants/tenant-one/odsInstances/edOrgs', expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-tenant-one',
          tenant: 'tenant-one',
        }),
      }));
      expect(mockApiGet).toHaveBeenCalledWith('tenants/tenant-two/odsInstances/edOrgs', expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-tenant-two',
          tenant: 'tenant-two',
        }),
      }));

      // Verify first tenant
      expect(result[0]).toMatchObject({
        id: 'tenant-one',
        name: 'tenant-one',
      });
      expect(result[0].odsInstances).toHaveLength(1);
      expect(result[0].odsInstances![0]).toMatchObject({
        id: 1,
        name: 'ODS One',
        instanceManageId: 101,
        instanceType: 'Production',
      });
      expect(result[0].odsInstances![0].edOrgs).toHaveLength(1);
      expect(result[0].odsInstances![0].edOrgs![0]).toMatchObject({
        instanceId: 1,
        instanceName: 'ODS One',
        educationOrganizationId: 255901,
        nameOfInstitution: 'School One',
        shortNameOfInstitution: 'S1',
        discriminator: 'edfi.School',
        parentId: 255900,
      });

      // Verify second tenant
      expect(result[1]).toMatchObject({
        id: 'tenant-two',
        name: 'tenant-two',
      });
      expect(result[1].odsInstances).toHaveLength(1);
      expect(result[1].odsInstances![0].id).toBe(2);
      expect(result[1].odsInstances![0].instanceManageId).toBeNull();
      expect(result[1].odsInstances![0].edOrgs).toHaveLength(1);
      expect(result[1].odsInstances![0].edOrgs![0]).toMatchObject({
        instanceId: 2,
        instanceName: 'ODS Two',
        educationOrganizationId: 255902,
        nameOfInstitution: 'School Two',
        discriminator: 'edfi.School',
      });
    });

    it('should use default tenant in single-tenant mode (tenancy reports an empty tenants array)', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      // Mock the tenancy discovery call reporting single-tenant mode
      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: [],
        mode: 'SingleTenant',
      });

      const mockDefaultTenantDetails = {
        data: {
          id: 'default',
          name: 'Default',
          odsInstances: [
            {
              id: 1,
              name: 'ODS Default',
              instanceType: 'Production',
              educationOrganizations: [],
            },
          ],
        },
      };

      // Mock login method to return success
      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      // Mock admin API client for tenant details
      const mockApiGet = jest.fn().mockResolvedValueOnce(mockDefaultTenantDetails);

      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      // Mock token cache to return tenant-specific tokens
      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-default') return 'token-default';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);

      expect(result).toHaveLength(1);
      expect(mockApiGet).toHaveBeenCalledWith('tenants/default/odsInstances/edOrgs', expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-default',
          tenant: 'default',
        }),
      }));
      expect(result[0]).toMatchObject({
        id: 'default',
        name: 'default',
      });
    });

    it('should handle tenant details endpoint failure gracefully', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: ['tenant-one'],
        mode: 'MultiTenant',
      });

      // Mock login method to return success
      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      // Mock tenant details endpoint to fail
      const mockApiGet = jest.fn().mockRejectedValueOnce(new Error('Details endpoint error'));

      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      // Mock token cache to return tenant-specific tokens
      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-tenant-one') return 'token-tenant-one';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'tenant-one',
        name: 'tenant-one',
        odsInstances: [],
      });
    });

    it('should fall back to the default tenant when the tenancy endpoint is unsupported (404-equivalent)', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      // fetchAdminApiTenancy maps a 404 (or an environment without a tenancy
      // endpoint) to { supported: false }; getTenants treats that identically
      // to a successful empty-tenants response and proceeds with the normal
      // per-tenant discovery flow for a single 'default' tenant.
      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({ supported: false });

      const mockDefaultTenantDetails = {
        data: {
          id: 'default',
          name: 'Default',
          odsInstances: [],
        },
      };

      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      const mockApiGet = jest.fn().mockResolvedValueOnce(mockDefaultTenantDetails);
      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-default') return 'token-default';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'default',
        name: 'default',
      });
    });

    it("should use tenant name 'default' when environment name is empty and the tenancy endpoint is unsupported", async () => {
      const envWithoutName = { ...mockSbEnvironment, name: '' } as SbEnvironment;

      // Note: unlike the pre-migration behavior (which special-cased a 404 from
      // the root endpoint into a synthetic tenant named after the environment,
      // falling back to the literal 'Default Tenant' when the name was empty),
      // getTenants no longer treats "unsupported" as a distinct short-circuit.
      // It always proceeds through the normal per-tenant flow, so the tenant's
      // name is the discovered tenant name ('default'), never derived from
      // environment.name.
      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({ supported: false });

      const mockDefaultTenantDetails = {
        data: {
          id: 'default',
          name: 'Default',
          odsInstances: [],
        },
      };

      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      const mockApiGet = jest.fn().mockResolvedValueOnce(mockDefaultTenantDetails);
      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-default') return 'token-default';
        return 'mock-token';
      });

      const result = await service.getTenants(envWithoutName);

      expect(result[0].name).toBe('default');
    });

    it('should propagate AdminApiTenancyError unchanged for tenancy failures (auth, network, server errors)', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      // Any failure reported by fetchAdminApiTenancy must propagate as-is —
      // never translated, wrapped, or treated as a single-tenant fallback.
      const tenancyError = new AdminApiTenancyError(
        'UNAVAILABLE',
        'Could not determine tenancy for this Management API.'
      );
      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockRejectedValue(tenancyError);

      await expect(service.getTenants(environment)).rejects.toBe(tenancyError);
    });

    it('should propagate AdminApiTenancyError unchanged when tenancy is misconfigured', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      const detail =
        'MultiTenancy is enabled but no tenants are configured. Check the Tenants section of appsettings.';
      const tenancyError = new AdminApiTenancyError('MISCONFIGURED', detail, detail);
      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockRejectedValue(tenancyError);

      const error = await service.getTenants(environment).catch((e) => e);

      expect(error).toBe(tenancyError);
      expect(error).toBeInstanceOf(AdminApiTenancyError);
      expect(error.kind).toBe('MISCONFIGURED');
      expect(error.detail).toBe(detail);
    });

    it('should return TenantDto array with correct structure', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: ['tenant-one'],
        mode: 'MultiTenant',
      });

      const mockDetailsResponse = {
        data: {
          id: 'tenant-one',
          name: 'Tenant One',
          odsInstances: [
            {
              id: 1,
              name: 'ODS One',
              educationOrganizations: [],
            },
          ],
        },
      };

      // Mock login method to return success
      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      // Mock admin API client for tenant details
      const mockApiGet = jest.fn().mockResolvedValueOnce(mockDetailsResponse);

      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      // Mock token cache to return tenant-specific tokens
      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-tenant-one') return 'token-tenant-one';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);

      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('odsInstances');
      expect(result[0].odsInstances![0]).toHaveProperty('edOrgs');
      expect(typeof result[0].id).toBe('string');
      expect(typeof result[0].name).toBe('string');
      expect(Array.isArray(result[0].odsInstances)).toBe(true);
      expect(Array.isArray(result[0].odsInstances![0].edOrgs)).toBe(true);
    });

    it('should set ODS instance ID to null when id is missing', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: ['tenant-one'],
        mode: 'MultiTenant',
      });

      const mockDetailsResponse = {
        data: {
          id: 'tenant-one',
          name: 'Tenant One',
          odsInstances: [
            { name: 'ODS 1', instanceType: 'Type1', educationOrganizations: [] },
            { name: 'ODS 2', instanceType: 'Type2', educationOrganizations: [] },
          ],
        },
      };

      // Mock login method to return success
      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      // Mock admin API client for tenant details
      const mockApiGet = jest.fn().mockResolvedValueOnce(mockDetailsResponse);

      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      // Mock token cache to return tenant-specific tokens
      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-tenant-one') return 'token-tenant-one';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);

      expect(result[0].odsInstances![0].id).toBeNull();
      expect(result[0].odsInstances![1].id).toBeNull();
    });

    it('should use fallback name "Unknown ODS Instance" for ODS instances with missing names', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: ['tenant-one'],
        mode: 'MultiTenant',
      });

      const mockDetailsResponse = {
        data: {
          id: 'tenant-one',
          name: 'Tenant One',
          odsInstances: [
            { id: 1, educationOrganizations: [] },
            { id: 2, educationOrganizations: [] },
            { id: 3, educationOrganizations: [] },
          ],
        },
      };

      // Mock login method to return success
      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      // Mock admin API client for tenant details
      const mockApiGet = jest.fn().mockResolvedValueOnce(mockDetailsResponse);

      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      // Mock token cache to return tenant-specific tokens
      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-tenant-one') return 'token-tenant-one';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);

      expect(result[0].odsInstances![0].name).toBe('Unknown ODS Instance');
      expect(result[0].odsInstances![1].name).toBe('Unknown ODS Instance');
      expect(result[0].odsInstances![2].name).toBe('Unknown ODS Instance');
    });

    it('should use default tenant when tenancy.tenants array is empty', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: [],
        mode: 'SingleTenant',
      });

      const mockDefaultTenantDetails = {
        data: {
          id: 'default',
          name: 'Default',
          odsInstances: [],
        },
      };

      // Mock login method to return success
      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      // Mock admin API client for tenant details
      const mockApiGet = jest.fn().mockResolvedValueOnce(mockDefaultTenantDetails);

      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      // Mock token cache to return tenant-specific tokens
      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-default') return 'token-default';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('default');
    });

    it('should authenticate per tenant by calling login when the tenant token is not cached', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      // getTenants no longer needs an environment-level token to discover
      // tenants (the tenancy endpoint is anonymous), so this test now covers
      // only the per-tenant login that happens further down in the method.
      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: ['tenant-one'],
        mode: 'MultiTenant',
      });

      const mockDetailsResponse = {
        data: {
          id: 'tenant-one',
          name: 'Tenant One',
          odsInstances: [],
        },
      };

      // No token cached for the tenant, so getTenants must call login() to obtain one.
      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-tenant-one') return 'token-tenant-one';
        return undefined;
      });

      // Mock login method
      const mockLogin = jest.fn().mockResolvedValue({ status: 'SUCCESS' });
      jest.spyOn(service as any, 'login').mockImplementation(mockLogin);

      // Mock admin API client for tenant details
      const mockApiGet = jest.fn().mockResolvedValueOnce(mockDetailsResponse);

      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      const result = await service.getTenants(environment);

      expect(mockLogin).toHaveBeenCalledWith(environment, environment.id, 'tenant-one');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tenant-one');
    });

    it('should populate instanceId and instanceName in education organizations from parent ODS instance', async () => {
      const environment = mockSbEnvironment as SbEnvironment;

      jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
        supported: true,
        tenants: ['tenant-one'],
        mode: 'MultiTenant',
      });

      const mockDetailsResponse = {
        data: {
          id: 'tenant-one',
          name: 'Tenant One',
          odsInstances: [
            {
              id: 999,
              name: 'Test ODS',
              instanceType: 'Production',
              educationOrganizations: [
                {
                  educationOrganizationId: 12345,
                  nameOfInstitution: 'Test School',
                  discriminator: 'edfi.School',
                },
              ],
            },
          ],
        },
      };

      // Mock login method to return success
      jest.spyOn(service as any, 'login').mockResolvedValue({ status: 'SUCCESS' });

      // Mock admin API client for tenant details
      const mockApiGet = jest.fn().mockResolvedValueOnce(mockDetailsResponse);

      jest.spyOn(service as any, 'initializeApiClient').mockReturnValue({
        get: mockApiGet,
      });

      // Mock token cache to return tenant-specific tokens
      (service as any).adminApiTokens.get = jest.fn((key: string) => {
        if (key === '1-tenant-one') return 'token-tenant-one';
        return 'mock-token';
      });

      const result = await service.getTenants(environment);

      expect(result[0].odsInstances![0].edOrgs![0].instanceId).toBe(999);
      expect(result[0].odsInstances![0].edOrgs![0].instanceName).toBe('Test ODS');
    });
  });

  describe('postInstance', () => {
    it('posts instance payload and returns id from location header', async () => {
      const payload = { name: 'My DB Instance', databaseTemplate: 'Minimal' };
      const mockPost = jest.fn().mockResolvedValue({
        headers: { location: '/v2/odsInstances/manage/123' },
      });
      const getAdminApiClientSpy = jest
        .spyOn(service as any, 'getAdminApiClient')
        .mockReturnValue({ post: mockPost });

      const result = await service.postInstance({ id: 1 } as any, payload as any);

      expect(getAdminApiClientSpy).toHaveBeenCalledWith({ id: 1 }, true);
      expect(mockPost).toHaveBeenCalledWith('odsInstances/manage', payload);
      expect(result).toEqual({ id: 123 });
    });

    it('rethrows error when posting instance fails', async () => {
      const payload = { name: 'My DB Instance', databaseTemplate: 'Minimal' };
      const expectedError = new Error('failed to create');
      const mockPost = jest.fn().mockRejectedValue(expectedError);
      const getAdminApiClientSpy = jest
        .spyOn(service as any, 'getAdminApiClient')
        .mockReturnValue({ post: mockPost });

      await expect(service.postInstance({ id: 1 } as any, payload as any)).rejects.toThrow(
        'failed to create'
      );
      expect(getAdminApiClientSpy).toHaveBeenCalledWith({ id: 1 }, true);
      expect(mockPost).toHaveBeenCalledWith('odsInstances/manage', payload);
    });

    it('throws when Location header is missing or invalid', async () => {
      const payload = { name: 'My DB Instance', databaseTemplate: 'Minimal' };
      const mockPost = jest.fn().mockResolvedValue({
        headers: { location: undefined },
      });
      const getAdminApiClientSpy = jest
        .spyOn(service as any, 'getAdminApiClient')
        .mockReturnValue({ post: mockPost });

      await expect(service.postInstance({ id: 1 } as any, payload as any)).rejects.toThrow(
        'Admin API did not return a Location header containing the created instance id.'
      );
      expect(getAdminApiClientSpy).toHaveBeenCalledWith({ id: 1 }, true);
      expect(mockPost).toHaveBeenCalledWith('odsInstances/manage', payload);
    });
  });

  describe('triggerEdOrgRefresh', () => {
    const env = mockSbEnvironment as SbEnvironment;

    it('should return the jobId when the refresh endpoint succeeds', async () => {
      const mockClient = { post: jest.fn().mockResolvedValue({ jobId: 'job-abc-123' }) };
      const getClientSpy = jest
        .spyOn(service, 'getAdminApiClientForEnvironment')
        .mockReturnValue(mockClient as any);

      const result = await service.triggerEdOrgRefresh(env);

      expect(getClientSpy).toHaveBeenCalledWith(env);
      expect(mockClient.post).toHaveBeenCalledWith('odsInstances/edOrgs/refresh');
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
    const env = mockSbEnvironment as SbEnvironment;
    const jobId = 'job-abc-123';

    it('should return "completed" when the job completes on the first poll', async () => {
      const mockClient = { get: jest.fn().mockResolvedValue({ status: 'completed' }) };
      jest.spyOn(service, 'getAdminApiClientForEnvironment').mockReturnValue(mockClient as any);

      const result = await service.pollJobStatus(env, jobId);

      expect(mockClient.get).toHaveBeenCalledWith(`jobs/${jobId}`);
      expect(result).toBe('completed');
    });

    it('should return "completed" after a few "running" responses', async () => {
      const mockClient = {
        get: jest.fn()
          .mockResolvedValueOnce({ status: 'running' })
          .mockResolvedValueOnce({ status: 'running' })
          .mockResolvedValueOnce({ status: 'completed' }),
      };
      jest.spyOn(service, 'getAdminApiClientForEnvironment').mockReturnValue(mockClient as any);

      const result = await service.pollJobStatus(env, jobId);

      expect(mockClient.get).toHaveBeenCalledTimes(3);
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
  describe('deleteInstance', () => {
    it('calls admin API DELETE odsInstances/manage/:id and resolves undefined', async () => {
      const instanceManageId = 123;
      const mockDelete = jest.fn().mockResolvedValue(undefined);
      const getAdminApiClientSpy = jest
        .spyOn(service as any, 'getAdminApiClient')
        .mockReturnValue({ delete: mockDelete });

      await expect(service.deleteInstance({ id: 1 } as any, instanceManageId)).resolves.toBeUndefined();

      expect(getAdminApiClientSpy).toHaveBeenCalledWith({ id: 1 }, true);
      expect(mockDelete).toHaveBeenCalledWith(`odsInstances/manage/${instanceManageId}`);
    });

    it('rethrows when admin API delete fails', async () => {
      const instanceManageId = 123;
      const expectedError = new Error('failed to delete');
      const mockDelete = jest.fn().mockRejectedValue(expectedError);
      const getAdminApiClientSpy = jest
        .spyOn(service as any, 'getAdminApiClient')
        .mockReturnValue({ delete: mockDelete });

      await expect(service.deleteInstance({ id: 1 } as any, instanceManageId)).rejects.toThrow(
        'failed to delete'
      );
      expect(getAdminApiClientSpy).toHaveBeenCalledWith({ id: 1 }, true);
      expect(mockDelete).toHaveBeenCalledWith(`odsInstances/manage/${instanceManageId}`);
    });
  });

  describe('getClaimsetBasic', () => {
    it('fetches only the claimSet detail route, without merging in the resourceClaims hierarchy', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        id: 1,
        name: 'Ed-Fi Sandbox',
        _isSystemReserved: true,
        _applications: [],
        resourceClaims: [],
      });
      jest.spyOn(service as any, 'getAdminApiClient').mockReturnValue({ get: mockGet });

      const result = await service.getClaimsetBasic({ id: 1 } as any, 1);

      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith('claimSets/1');
      expect(result._isSystemReserved).toBe(true);
    });
  });

  describe('getClaimset', () => {
    it.each([
      ['NaN', NaN],
      ['zero', 0],
      ['negative', -5],
      ['non-integer', 1.5],
      ['Infinity', Infinity],
    ])('should reject with a 400 CustomHttpException for a %s claimSetId', async (_desc, claimSetId) => {
      const error: CustomHttpException = await service
        .getClaimset({ id: 1 } as any, claimSetId)
        .then(() => {
          throw new Error('expected getClaimset to reject');
        })
        .catch((e) => e);

      expect(error).toBeInstanceOf(CustomHttpException);
      expect(error.getStatus()).toBe(400);
    });

    it('merges in resource claims missing from the claimset (no actions) as denied placeholders', async () => {
      const mockGet = jest.fn().mockImplementation((path: string) => {
        if (path === 'claimSets/1') {
          return Promise.resolve({
            id: 1,
            name: 'Ed-Fi Sandbox',
            _isSystemReserved: true,
            _applications: [],
            resourceClaims: [
              {
                id: '1',
                name: 'types',
                actions: [{ name: 'Read', enabled: true }],
                authorizationStrategyOverridesForCRUD: [],
                _defaultAuthorizationStrategiesForCRUD: [],
                children: [],
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

      const result = await service.getClaimset({ id: 1 } as any, 1);

      expect(result.resourceClaims[0].children).toHaveLength(1);
      expect(result.resourceClaims[0].children[0]).toMatchObject({ name: 'schoolYearType' });
      expect(result.resourceClaims[0].children[0].actions).toEqual([]);
    });

    it('falls back to the claimset unmerged when the resourceClaims-hierarchy fetch fails', async () => {
      const originalResourceClaims = [
        {
          id: '1',
          name: 'types',
          actions: [{ name: 'Read', enabled: true }],
          authorizationStrategyOverridesForCRUD: [],
          _defaultAuthorizationStrategiesForCRUD: [],
          children: [],
        },
      ];
      const mockGet = jest.fn().mockImplementation((path: string) => {
        if (path === 'claimSets/1') {
          return Promise.resolve({
            id: 1,
            name: 'Ed-Fi Sandbox',
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

      const result = await service.getClaimset({ id: 1 } as any, 1);

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

      await expect(service.getClaimset({ id: 1 } as any, 1)).rejects.toThrow(
        'claimset endpoint unavailable'
      );
    });
  });
});

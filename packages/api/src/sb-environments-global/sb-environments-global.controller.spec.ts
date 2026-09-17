import 'reflect-metadata';
import { SbEnvironmentsGlobalController } from './sb-environments-global.controller';
import * as utils from '../utils';
import { ValidationHttpException } from '../utils';
import * as adminApiTenancy from '../utils/admin-api-tenancy';
import { AdminApiTenancyError } from '../utils/admin-api-tenancy';

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  fetchOdsApiMetadata: jest.fn(),
  fetchAdminApiInfo: jest.fn(),
}));

describe('SbEnvironmentsGlobalController.checkEdFiVersionAndTenantMode', () => {
  let controller: SbEnvironmentsGlobalController;

  beforeEach(() => {
    controller = new SbEnvironmentsGlobalController(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );

    (utils.fetchOdsApiMetadata as jest.Mock).mockResolvedValue({
      version: '5.3',
      urls: { dataManagementApi: 'https://ods.test.com/data/v3' },
    });
    (utils.fetchAdminApiInfo as jest.Mock).mockResolvedValue({
      specificationVersion: 'v3',
      urls: { tenancy: 'https://api.test.com/tenants' },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports isMultiTenant from the Admin API tenancy signal when Admin API is compatible with ODS', async () => {
    jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
      supported: true,
      tenants: [],
      mode: 'SingleTenant',
    });

    const result = await controller.checkEdFiVersionAndTenantMode({
      odsApiDiscoveryUrl: 'https://ods.test.com',
      adminApiUrl: 'https://api.test.com',
    });

    expect(result).toEqual({
      odsVersion: '5.3',
      version: 'v3',
      isMultiTenant: false,
    });
  });

  it('surfaces a 503 tenancy misconfiguration as a ValidationHttpException carrying the Admin API detail (mirrors sb-environments-edfi.services.spec.ts)', async () => {
    const detail =
      'MultiTenancy is enabled but no tenants are configured. Check the Tenants section of appsettings.';
    jest
      .spyOn(adminApiTenancy, 'fetchAdminApiTenancy')
      .mockRejectedValue(new AdminApiTenancyError('MISCONFIGURED', detail, detail));

    const error = await controller
      .checkEdFiVersionAndTenantMode({
        odsApiDiscoveryUrl: 'https://ods.test.com',
        adminApiUrl: 'https://api.test.com',
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ValidationHttpException);
    expect(JSON.stringify(error.getResponse())).toContain(detail);
  });

  it('rejects with a tenant-mode-mismatch ValidationHttpException when the Admin API tenancy signal disagrees with the ODS URL pattern, and fetches tenancy only once (regression guard)', async () => {
    // ODS discovery URL has no tenantIdentifier segment -> SingleTenant by URL inference.
    // Admin API reports MultiTenant. Only honoring the Admin API signal (rather than a
    // regression back to raw adminApiInfo, which has no .mode field) can produce this
    // mismatch; a silent fallback to ODS inference would make both sides agree and this
    // compatibility check would never fire.
    jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy').mockResolvedValue({
      supported: true,
      tenants: ['tenant-a', 'tenant-b'],
      mode: 'MultiTenant',
    });

    const error = await controller
      .checkEdFiVersionAndTenantMode({
        odsApiDiscoveryUrl: 'https://ods.test.com',
        adminApiUrl: 'https://api.test.com',
      })
      .catch((e) => e);

    expect(adminApiTenancy.fetchAdminApiTenancy).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ValidationHttpException);
    const response = error.getResponse();
    expect(response.data.errors.adminApiUrl.message).toMatch(
      /must both be configured with the same tenant mode/,
    );
    expect(response.data.errors.adminApiUrl.message).toContain('Ed-Fi API = SingleTenant');
    expect(response.data.errors.adminApiUrl.message).toContain('Management API = MultiTenant');
  });

  it('skips the tenancy fetch and tenant-mode compatibility check when no adminApiUrl is provided', async () => {
    jest.spyOn(adminApiTenancy, 'fetchAdminApiTenancy');

    const result = await controller.checkEdFiVersionAndTenantMode({
      odsApiDiscoveryUrl: 'https://ods.test.com',
    });

    expect(adminApiTenancy.fetchAdminApiTenancy).not.toHaveBeenCalled();
    expect(result.version).toBe('');
  });
});

describe('SbEnvironmentsGlobalController.findOne', () => {
  it('loads the environment with the { edfiTenants: { odss: { edorgs: true } } } relations shape TypeORM 1.1.0 requires', async () => {
    const sbEnvironmentsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 5,
        configPublic: {},
        edfiTenants: [],
      }),
    };
    const controller = new SbEnvironmentsGlobalController(
      undefined as never,
      undefined as never,
      sbEnvironmentsRepository as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );

    await controller.findOne(5);

    expect(sbEnvironmentsRepository.findOne).toHaveBeenCalledWith({
      where: { id: 5 },
      relations: { edfiTenants: { odss: { edorgs: true } } },
    });
  });
});

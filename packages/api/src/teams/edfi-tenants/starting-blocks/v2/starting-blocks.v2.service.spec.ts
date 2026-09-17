import { Test, TestingModule } from '@nestjs/testing';
import { getEntityManagerToken, getRepositoryToken } from '@nestjs/typeorm';
import { EdfiTenant, SbEnvironment } from '@edanalytics/models-server';
import { CacheService } from '../../../../app/cache.module';
import { StartingBlocksServiceV2 } from './starting-blocks.v2.service';

describe('StartingBlocksServiceV2 — syncTenants ownership cache flush', () => {
  let service: StartingBlocksServiceV2;
  let edfiTenantsRepository: { find: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let sbEnvironmentsRepository: { save: jest.Mock };
  let cacheService: { flushAll: jest.Mock };

  const sbEnvironment = {
    id: 1,
    configPublic: { values: { tenants: {} } },
  } as unknown as SbEnvironment;

  beforeEach(async () => {
    edfiTenantsRepository = {
      find: jest.fn(),
      save: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    sbEnvironmentsRepository = { save: jest.fn().mockResolvedValue(sbEnvironment) };
    cacheService = { flushAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StartingBlocksServiceV2,
        { provide: getRepositoryToken(EdfiTenant), useValue: edfiTenantsRepository },
        { provide: getRepositoryToken(SbEnvironment), useValue: sbEnvironmentsRepository },
        { provide: getEntityManagerToken(), useValue: {} },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get(StartingBlocksServiceV2);
    // Credential regeneration is a separate concern (Admin API keygen); stub it
    // out so this test can isolate the flush trigger condition in syncTenants.
    jest
      .spyOn(service, 'regenerateAdminApiCredentials')
      .mockResolvedValue({ status: 'SUCCESS' } as never);
  });

  it('flushes the ownership cache when a new tenant is discovered', async () => {
    jest.spyOn(service.tenantMgmtService, 'list').mockResolvedValue({
      status: 'SUCCESS',
      data: [{ Name: 'default', AllowedEdOrgs: [] }],
    } as never);
    edfiTenantsRepository.find.mockResolvedValue([]);

    await service.syncTenants(sbEnvironment);

    expect(cacheService.flushAll).toHaveBeenCalledTimes(1);
  });

  it('flushes the ownership cache when an existing tenant is removed', async () => {
    jest.spyOn(service.tenantMgmtService, 'list').mockResolvedValue({
      status: 'SUCCESS',
      data: [],
    } as never);
    edfiTenantsRepository.find.mockResolvedValue([
      { id: 1, name: 'stale', sbEnvironmentId: 1 },
    ]);

    await service.syncTenants(sbEnvironment);

    expect(cacheService.flushAll).toHaveBeenCalledTimes(1);
  });

  it('does not flush the ownership cache when the tenant set is unchanged', async () => {
    jest.spyOn(service.tenantMgmtService, 'list').mockResolvedValue({
      status: 'SUCCESS',
      data: [{ Name: 'default', AllowedEdOrgs: [] }],
    } as never);
    edfiTenantsRepository.find.mockResolvedValue([
      { id: 1, name: 'default', sbEnvironmentId: 1 },
    ]);

    await service.syncTenants(sbEnvironment);

    expect(cacheService.flushAll).not.toHaveBeenCalled();
  });
});

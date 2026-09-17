import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getEntityManagerToken, getRepositoryToken } from '@nestjs/typeorm';
import { EdfiTenant, SbEnvironment } from '@edanalytics/models-server';
import { CacheService } from '../../../../app/cache.module';
import { StartingBlocksServiceV1 } from './starting-blocks.v1.service';

describe('StartingBlocksServiceV1.syncTenantResourceTree', () => {
  it('loads the SbEnvironment with the { edfiTenants: true } relations shape TypeORM 1.1.0 requires', async () => {
    const sbEnvironmentsRepository = {
      findOne: jest.fn().mockResolvedValue({ edfiTenants: [{}, {}] }),
    };
    const service = new StartingBlocksServiceV1(
      {} as never,
      sbEnvironmentsRepository as never,
      {} as never,
      {} as never,
    );

    const result = await service.syncTenantResourceTree(
      { sbEnvironmentId: 7 } as never,
      {} as never,
    );

    expect(sbEnvironmentsRepository.findOne).toHaveBeenCalledWith({
      where: { id: 7 },
      relations: { edfiTenants: true },
    });
    // Guard clause below the relations load, reached only if the query resolved correctly
    expect(result).toEqual({ status: 'INVALID_ENVIRONMENT_TENANTS' });

  });
});
  
describe('StartingBlocksServiceV1 — syncEnvironmentEverything ownership cache flush', () => {
  let service: StartingBlocksServiceV1;
  let edfiTenantsRepository: { find: jest.Mock; save: jest.Mock };
  let sbEnvironmentsRepository: { findOne: jest.Mock; save: jest.Mock };
  let cacheService: { flushAll: jest.Mock };

  const sbEnvironment = {
    id: 1,
    configPublic: { adminApiUrl: 'https://adminapi.district.example.com' },
  } as unknown as SbEnvironment;
  const meta = { domainName: 'district.example.com', envlabel: 'Test' } as never;

  beforeEach(async () => {
    edfiTenantsRepository = {
      find: jest.fn(),
      save: jest.fn(),
    };
    sbEnvironmentsRepository = {
      // syncTenantResourceTree requires exactly one linked edfiTenant to proceed.
      findOne: jest.fn().mockResolvedValue({ id: 1, edfiTenants: [{ id: 1 }] }),
      save: jest.fn().mockResolvedValue(sbEnvironment),
    };
    cacheService = { flushAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StartingBlocksServiceV1,
        { provide: getRepositoryToken(EdfiTenant), useValue: edfiTenantsRepository },
        { provide: getRepositoryToken(SbEnvironment), useValue: sbEnvironmentsRepository },
        { provide: getEntityManagerToken(), useValue: { transaction: jest.fn() } },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get(StartingBlocksServiceV1);
    // Resource-tree persistence is a separate concern; stub the transaction
    // boundary so this test can isolate the flush trigger condition.
    jest.spyOn(service, 'syncTenantResourceTree').mockResolvedValue({
      status: 'SUCCESS',
      data: {
        hasChanges: false,
        edorg: { inserted: 0, updated: 0, deleted: 0 },
        ods: { inserted: 0, updated: 0, deleted: 0 },
      },
    });
  });

  it('flushes the ownership cache when the environment has no existing tenant (first sync)', async () => {
    edfiTenantsRepository.find.mockResolvedValue([]);
    edfiTenantsRepository.save.mockResolvedValue({ id: 5, sbEnvironmentId: 1 });

    const result = await service.syncEnvironmentEverything(sbEnvironment, meta);

    expect(cacheService.flushAll).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('SUCCESS');
    expect(result.status === 'SUCCESS' && result.data.tenant).toBe('created');
  });

  it('does not flush the ownership cache when a tenant already exists for the environment', async () => {
    edfiTenantsRepository.find.mockResolvedValue([{ id: 5, sbEnvironmentId: 1 }]);

    const result = await service.syncEnvironmentEverything(sbEnvironment, meta);

    expect(cacheService.flushAll).not.toHaveBeenCalled();
    expect(result.status).toBe('SUCCESS');
    expect(result.status === 'SUCCESS' && result.data.tenant).toBeNull();
  });
});

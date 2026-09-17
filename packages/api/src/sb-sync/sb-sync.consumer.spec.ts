/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SbEnvironment, EdfiTenant } from '@edanalytics/models-server';
import { SbSyncConsumer } from './sb-sync.consumer';
import { AdminApiSyncService } from './edfi/adminapi-sync.service';
import {
  StartingBlocksServiceV1,
  StartingBlocksServiceV2,
} from '../teams/edfi-tenants/starting-blocks';
import { MetadataService } from '../teams/edfi-tenants/starting-blocks/metadata.service';
import { ENV_SYNC_CHNL } from './sb-sync.module';

jest.mock('config', () => ({
  __esModule: true,
  default: {
    SB_SYNC_CRON: '0 2 * * *',
    DB_ENGINE: 'pgsql',
    ADMINAPI_REFRESH_POLL_ATTEMPTS: 3,
    ADMINAPI_REFRESH_POLL_INTERVAL_MS: 0,
  },
}));

describe('SbSyncConsumer — SYNC_SCHEDULER_CHNL', () => {
  let consumer: SbSyncConsumer;
  let sbEnvironmentsRepository: any;
  let jobQueue: any;

  const sbEnv = { id: 1 } as SbEnvironment;
  const adminApiEnv = { id: 2 } as SbEnvironment;

  beforeEach(async () => {
    const qbSb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([sbEnv]),
    };
    const qbAdminApi = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([adminApiEnv]),
    };

    sbEnvironmentsRepository = {
      createQueryBuilder: jest.fn().mockReturnValueOnce(qbSb).mockReturnValueOnce(qbAdminApi),
    };

    jobQueue = {
      createQueue: jest.fn().mockResolvedValue(undefined),
      schedule: jest.fn().mockResolvedValue(undefined),
      work: jest.fn().mockImplementationOnce((_name, handler) => handler()),
      send: jest.fn().mockResolvedValue('job-id'),
      start: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SbSyncConsumer,
        { provide: getRepositoryToken(SbEnvironment), useValue: sbEnvironmentsRepository },
        {
          provide: getRepositoryToken(EdfiTenant),
          useValue: { findOne: jest.fn(), find: jest.fn() },
        },
        { provide: 'IJobQueueService', useValue: jobQueue },
        { provide: StartingBlocksServiceV1, useValue: {} },
        { provide: StartingBlocksServiceV2, useValue: {} },
        { provide: MetadataService, useValue: {} },
        { provide: AdminApiSyncService, useValue: {} },
      ],
    }).compile();

    consumer = module.get<SbSyncConsumer>(SbSyncConsumer);
    await consumer.onModuleInit();
  });

  it('should enqueue Admin API environments onto ENV_SYNC_CHNL during the scheduler run', () => {
    expect(jobQueue.send).toHaveBeenCalledWith(
      ENV_SYNC_CHNL,
      { sbEnvironmentId: adminApiEnv.id },
      { singletonKey: String(adminApiEnv.id), expireInHours: 1 },
    );
  });

  it('should still enqueue SB environments onto ENV_SYNC_CHNL', () => {
    expect(jobQueue.send).toHaveBeenCalledWith(
      ENV_SYNC_CHNL,
      { sbEnvironmentId: sbEnv.id },
      { singletonKey: String(sbEnv.id), expireInHours: 1 },
    );
  });
});

describe('SbSyncConsumer — refreshSbEnvironment', () => {
  let consumer: SbSyncConsumer;
  let sbEnvironmentsRepository: any;
  let adminapiSyncService: any;

  const adminApiEnv = { id: 2, name: 'Test Env' } as SbEnvironment;

  beforeEach(async () => {
    const qbSbNull = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const qbAdminApi = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(adminApiEnv),
    };

    sbEnvironmentsRepository = {
      createQueryBuilder: jest.fn().mockReturnValueOnce(qbSbNull).mockReturnValueOnce(qbAdminApi),
    };

    adminapiSyncService = {
      syncEnvironmentData: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SbSyncConsumer,
        { provide: getRepositoryToken(SbEnvironment), useValue: sbEnvironmentsRepository },
        {
          provide: getRepositoryToken(EdfiTenant),
          useValue: { findOne: jest.fn(), find: jest.fn() },
        },
        {
          provide: 'IJobQueueService',
          useValue: {
            createQueue: jest.fn(),
            schedule: jest.fn(),
            work: jest.fn(),
            start: jest.fn(),
          },
        },
        { provide: StartingBlocksServiceV1, useValue: {} },
        { provide: StartingBlocksServiceV2, useValue: {} },
        { provide: MetadataService, useValue: {} },
        { provide: AdminApiSyncService, useValue: adminapiSyncService },
      ],
    }).compile();

    consumer = module.get<SbSyncConsumer>(SbSyncConsumer);
  });

  it('should carry the sync status through the thrown exception when the Admin API sync fails', async () => {
    adminapiSyncService.syncEnvironmentData.mockResolvedValue({
      status: 'ADMIN_API_MISCONFIGURED',
      message: 'appsettings tenancy config is invalid',
    });

    await expect(consumer.refreshSbEnvironment(adminApiEnv.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'appsettings tenancy config is invalid',
        data: { status: 'ADMIN_API_MISCONFIGURED' },
      }),
    });
  });
});

describe('SbSyncConsumer — refreshEdfiTenant', () => {
  let consumer: SbSyncConsumer;
  let edfiTenantsRepository: any;
  let adminapiSyncService: any;
  let metadataService: any;

  const adminApiEnv = { id: 2, name: 'Test Env', startingBlocks: false } as SbEnvironment;
  const edfiTenant = { id: 5, name: 'Test Tenant', sbEnvironment: adminApiEnv } as EdfiTenant;

  beforeEach(async () => {
    edfiTenantsRepository = {
      findOne: jest.fn().mockResolvedValue(edfiTenant),
    };

    adminapiSyncService = {
      syncTenantData: jest.fn(),
    };

    metadataService = {
      getMetadata: jest.fn().mockResolvedValue({ status: 'SUCCESS', data: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SbSyncConsumer,
        { provide: getRepositoryToken(SbEnvironment), useValue: {} },
        { provide: getRepositoryToken(EdfiTenant), useValue: edfiTenantsRepository },
        {
          provide: 'IJobQueueService',
          useValue: {
            createQueue: jest.fn(),
            schedule: jest.fn(),
            work: jest.fn(),
            start: jest.fn(),
          },
        },
        { provide: StartingBlocksServiceV1, useValue: {} },
        { provide: StartingBlocksServiceV2, useValue: {} },
        { provide: MetadataService, useValue: metadataService },
        { provide: AdminApiSyncService, useValue: adminapiSyncService },
      ],
    }).compile();

    consumer = module.get<SbSyncConsumer>(SbSyncConsumer);
  });

  it('should carry the sync status through the thrown exception when the Admin API tenant sync fails', async () => {
    adminapiSyncService.syncTenantData.mockResolvedValue({
      status: 'ADMIN_API_MISCONFIGURED',
      message: 'appsettings tenancy config is invalid',
    });

    await expect(consumer.refreshEdfiTenant(edfiTenant.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'appsettings tenancy config is invalid',
        data: { status: 'ADMIN_API_MISCONFIGURED' },
      }),
    });

    expect(edfiTenantsRepository.findOne).toHaveBeenCalledWith({
      where: { id: edfiTenant.id },
      relations: { sbEnvironment: true },
    });
  });
});

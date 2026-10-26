import 'reflect-metadata';
import { EdfiTenant, Edorg, Ods, SbEnvironment, SbSyncQueue } from '@edanalytics/models-server';
import { PostOdsDto } from '@edanalytics/models';
import { NotFoundException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { OdssService } from './odss.service';
import { StartingBlocksServiceV2 } from '../starting-blocks';
import { OdsRowCountService } from '../starting-blocks/v2/ods-rowcount.service';

const mockOdssRepository = () => ({
  findOneBy: jest.fn(),
  findBy: jest.fn(),
  save: jest.fn(),
});

const mockEdorgsRepository = () => ({
  findBy: jest.fn(),
  save: jest.fn(),
});

describe('OdssService', () => {
  let service: OdssService;
  let odssRepository: ReturnType<typeof mockOdssRepository>;
  let edorgsRepository: ReturnType<typeof mockEdorgsRepository>;
  let startingBlocksServiceV2: Partial<StartingBlocksServiceV2>;
  let syncQueueRepository: { findOneBy: jest.Mock };

  const mockSbEnvironment: Partial<SbEnvironment> = { id: 1, version: 'v2' };
  const mockEdfiTenant: Partial<EdfiTenant> = { id: 10, sbEnvironmentId: 1, name: 'test-tenant' };

  beforeEach(() => {
    odssRepository = mockOdssRepository();
    edorgsRepository = mockEdorgsRepository();
    syncQueueRepository = { findOneBy: jest.fn() };
    startingBlocksServiceV2 = {
      odsRowCountService: { rowCount: jest.fn() } as unknown as OdsRowCountService,
    };

    service = new OdssService(
      odssRepository as unknown as Repository<Ods>,
      edorgsRepository as unknown as Repository<Edorg>,
      startingBlocksServiceV2 as StartingBlocksServiceV2,
      syncQueueRepository as unknown as Repository<SbSyncQueue>
    );

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('uses dto.templateName in odss create flow', async () => {
      const dto = {
        name: 'ODS One',
        templateName: 'TemplateNameValue',
        databaseTemplate: 'DatabaseTemplateValue',
      } as PostOdsDto;
      const sbEnvironment = {
        ...mockSbEnvironment,
        startingBlocks: false,
      } as SbEnvironment;
      const createdOds = { id: 1, odsInstanceName: 'ODS One' };

      startingBlocksServiceV2.createOds = jest
        .fn()
        .mockResolvedValue({ status: 'SUCCESS' });
      odssRepository.findOneBy.mockResolvedValue(createdOds);

      await service.create(sbEnvironment, mockEdfiTenant as EdfiTenant, dto);

      expect(startingBlocksServiceV2.createOds).toHaveBeenCalledWith(
        sbEnvironment,
        mockEdfiTenant,
        'ODS One',
        'TemplateNameValue'
      );
    });
  });

  describe('findOdsManageJob', () => {
    const JOB_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
    const job = (over: Record<string, unknown> = {}) => ({
      id: JOB_ID,
      type: 'OdsManage',
      edfiTenantId: 10,
      data: { operation: 'create' },
      ...over,
    });

    it('returns the job for matching tenant and operation', async () => {
      const row = job();
      syncQueueRepository.findOneBy.mockResolvedValue(row);
      await expect(service.findOdsManageJob(10, JOB_ID, 'create')).resolves.toBe(row);
      expect(syncQueueRepository.findOneBy).toHaveBeenCalledWith({ id: JOB_ID });
    });

    it('matches operation when data arrives as a JSON string', async () => {
      const row = job({ data: JSON.stringify({ operation: 'delete' }) });
      syncQueueRepository.findOneBy.mockResolvedValue(row);
      await expect(service.findOdsManageJob(10, JOB_ID, 'delete')).resolves.toBe(row);
    });

    it('404 for a job in another tenant', async () => {
      syncQueueRepository.findOneBy.mockResolvedValue(job({ edfiTenantId: 99 }));
      await expect(service.findOdsManageJob(10, JOB_ID, 'create')).rejects.toThrow(NotFoundException);
    });

    it('404 for an sbe-sync (SbEnvironment) job id', async () => {
      syncQueueRepository.findOneBy.mockResolvedValue(job({ type: 'SbEnvironment' }));
      await expect(service.findOdsManageJob(10, JOB_ID, 'create')).rejects.toThrow(NotFoundException);
    });

    it('404 when operation does not match (delete job via create endpoint)', async () => {
      syncQueueRepository.findOneBy.mockResolvedValue(job({ data: { operation: 'delete' } }));
      await expect(service.findOdsManageJob(10, JOB_ID, 'create')).rejects.toThrow(NotFoundException);
    });

    it('404 for a non-UUID id without querying', async () => {
      await expect(service.findOdsManageJob(10, 'x', 'create')).rejects.toThrow(NotFoundException);
      expect(syncQueueRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('propagates operational query failures instead of reporting 404', async () => {
      syncQueueRepository.findOneBy.mockRejectedValue(
        new QueryFailedError('select', [JOB_ID], new Error('canceling statement due to statement timeout'))
      );
      await expect(service.findOdsManageJob(10, JOB_ID, 'create')).rejects.toThrow(QueryFailedError);
    });

    it('rethrows unexpected non-query errors', async () => {
      syncQueueRepository.findOneBy.mockRejectedValue(new Error('connection lost'));
      await expect(service.findOdsManageJob(10, JOB_ID, 'create')).rejects.toThrow('connection lost');
    });

    it('404 for an unknown id', async () => {
      syncQueueRepository.findOneBy.mockResolvedValue(null);
      await expect(service.findOdsManageJob(10, '00000000-0000-4000-8000-000000000000', 'create')).rejects.toThrow(NotFoundException);
    });
  });
});

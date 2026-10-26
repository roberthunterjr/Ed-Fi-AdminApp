/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EdfiTenant } from '@edanalytics/models-server';
import { OdsManageJobData } from '@edanalytics/models';
import { OdsManageJobService } from './ods-manage-job.service';
import { AdminApiVersionStrategyFactory } from '../admin-api-version-strategy';
import { ENV_SYNC_CHNL } from './sb-sync.module';
import { Job } from './job-queue/job-queue.interface';
import { pollAdminApiJob } from '../teams/edfi-tenants/starting-blocks/admin-api-refresh-poll.util';

jest.mock('config', () => ({
  __esModule: true,
  default: {
    DB_ENGINE: 'pgsql',
    ADMINAPI_DATASTORE_JOB_POLL_INTERVAL_MS: 0,
    ADMINAPI_DATASTORE_JOB_POLL_ATTEMPTS: 3,
  },
}));

jest.mock('../teams/edfi-tenants/starting-blocks/admin-api-refresh-poll.util', () => ({
  pollAdminApiJob: jest.fn(),
}));

describe('OdsManageJobService', () => {
  let service: OdsManageJobService;
  let edfiTenantsRepository: any;
  let jobQueue: any;
  let strategyFactory: any;
  let adminApiService: any;
  const client = { get: jest.fn() };
  const pollMock = pollAdminApiJob as jest.Mock;

  const job = {
    id: 'queue-job-1',
    name: 'ods-manage',
    data: {
      sbEnvironmentId: 7,
      edfiTenantId: 11,
      adminApiJobId: 'job-1',
      operation: 'create',
      odsName: 'ods-x',
      odsId: null,
    },
  } as unknown as Job<OdsManageJobData>;

  const tenant = { id: 11, name: 't', sbEnvironment: { id: 7, name: 'env', version: 'v3' } };

  beforeEach(async () => {
    pollMock.mockReset();
    adminApiService = { getAdminApiClient: jest.fn().mockReturnValue(client) };
    strategyFactory = {
      getStrategy: jest.fn().mockReturnValue({ getAdminApiService: () => adminApiService }),
    };
    edfiTenantsRepository = { findOne: jest.fn().mockResolvedValue(tenant) };
    jobQueue = { send: jest.fn().mockResolvedValue('id') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OdsManageJobService,
        { provide: getRepositoryToken(EdfiTenant), useValue: edfiTenantsRepository },
        { provide: 'IJobQueueService', useValue: jobQueue },
        { provide: AdminApiVersionStrategyFactory, useValue: strategyFactory },
      ],
    }).compile();
    service = module.get(OdsManageJobService);
  });

  it('resolves with completed message when Admin API job completes', async () => {
    pollMock.mockResolvedValue({ outcome: 'completed' });
    await expect(service.handle(job)).resolves.toEqual({
      message: 'Admin API job job-1 completed.',
    });
    expect(pollMock).toHaveBeenCalledWith(client, 'job-1', expect.anything(), expect.any(String), {
      maxAttempts: 3,
      intervalMs: 0,
      retryOnError: true,
    });
  });

  it('throws with Admin API errorMessage verbatim when job errors', async () => {
    pollMock.mockResolvedValue({ outcome: 'failed', errorMessage: 'Database "x" already exists' });
    await expect(service.handle(job)).rejects.toThrow('Database "x" already exists');
  });

  it('throws generic failure message when errorMessage is null', async () => {
    pollMock.mockResolvedValue({ outcome: 'failed', errorMessage: null });
    await expect(service.handle(job)).rejects.toThrow('Admin API job job-1 failed.');
  });

  it('throws timeout message when polling times out', async () => {
    pollMock.mockResolvedValue({ outcome: 'timeout' });
    await expect(service.handle(job)).rejects.toThrow('Timed out waiting for Admin API job job-1.');
  });

  it('throws a could-not-check message when polling ends on an Admin API error', async () => {
    pollMock.mockResolvedValue({ outcome: 'error', message: 'connect ECONNREFUSED' });
    await expect(service.handle(job)).rejects.toThrow(
      "Couldn't check Admin API job job-1: connect ECONNREFUSED"
    );
  });

  it('sends one ENV_SYNC_CHNL job for the environment on success and on failure', async () => {
    pollMock.mockResolvedValueOnce({ outcome: 'completed' });
    await service.handle(job);
    expect(jobQueue.send).toHaveBeenCalledTimes(1);
    expect(jobQueue.send).toHaveBeenCalledWith(
      ENV_SYNC_CHNL,
      { sbEnvironmentId: 7 },
      { expireInHours: 2 }
    );

    jobQueue.send.mockClear();
    pollMock.mockResolvedValueOnce({ outcome: 'failed', errorMessage: 'boom' });
    await expect(service.handle(job)).rejects.toThrow('boom');
    expect(jobQueue.send).toHaveBeenCalledTimes(1);
    expect(jobQueue.send).toHaveBeenCalledWith(
      ENV_SYNC_CHNL,
      { sbEnvironmentId: 7 },
      { expireInHours: 2 }
    );
  });

  it('throws when the edfi tenant no longer exists', async () => {
    edfiTenantsRepository.findOne.mockResolvedValue(null);
    await expect(service.handle(job)).rejects.toThrow(/tenant 11/i);
    expect(pollMock).not.toHaveBeenCalled();
    expect(jobQueue.send).toHaveBeenCalledTimes(1);
    expect(jobQueue.send).toHaveBeenCalledWith(
      ENV_SYNC_CHNL,
      { sbEnvironmentId: 7 },
      { expireInHours: 2 }
    );
  });

  it('fails clearly when the Admin API version has no manage endpoints', async () => {
    adminApiService = {};
    strategyFactory.getStrategy.mockReturnValue({ getAdminApiService: () => adminApiService });
    await expect(service.handle(job)).rejects.toThrow(/does not support/i);
    expect(pollMock).not.toHaveBeenCalled();
    expect(jobQueue.send).toHaveBeenCalledTimes(1);
    expect(jobQueue.send).toHaveBeenCalledWith(
      ENV_SYNC_CHNL,
      { sbEnvironmentId: 7 },
      { expireInHours: 2 }
    );
  });

  it('still resolves with the completed message when the follow-up sync send rejects', async () => {
    pollMock.mockResolvedValue({ outcome: 'completed' });
    jobQueue.send.mockRejectedValue(new Error('queue down'));
    await expect(service.handle(job)).resolves.toEqual({
      message: 'Admin API job job-1 completed.',
    });
  });

  it('still throws the verbatim Admin API errorMessage when the follow-up sync send rejects', async () => {
    pollMock.mockResolvedValue({ outcome: 'failed', errorMessage: 'Database "x" already exists' });
    jobQueue.send.mockRejectedValue(new Error('queue down'));
    await expect(service.handle(job)).rejects.toThrow('Database "x" already exists');
  });
});

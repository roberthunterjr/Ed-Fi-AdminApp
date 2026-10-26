import { OdsManageJobData } from '@edanalytics/models';
import { EdfiTenant } from '@edanalytics/models-server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosInstance } from 'axios';
import config from 'config';
import { Repository } from 'typeorm';
import { AdminApiVersionStrategyFactory } from '../admin-api-version-strategy';
import { pollAdminApiJob } from '../teams/edfi-tenants/starting-blocks/admin-api-refresh-poll.util';
import { IJobQueueService, Job } from './job-queue/job-queue.interface';
import { ENV_SYNC_CHNL } from './sb-sync.module';

type ManageCapableAdminApiService = {
  getAdminApiClient(edfiTenant: EdfiTenant, notJustData?: boolean): AxiosInstance;
};

/**
 * Worker for the `ods-manage` queue. Tracks an Admin API datastore create/delete job to
 * completion and mirrors its outcome onto the Admin App job (a thrown error is stored as
 * `output.message` by the queue backends).
 */
@Injectable()
export class OdsManageJobService {
  private readonly logger = new Logger(OdsManageJobService.name);

  constructor(
    @InjectRepository(EdfiTenant)
    private readonly edfiTenantsRepository: Repository<EdfiTenant>,
    @Inject('IJobQueueService')
    private readonly jobQueue: IJobQueueService,
    private readonly strategyFactory: AdminApiVersionStrategyFactory
  ) {}

  async handle(job: Job<OdsManageJobData>): Promise<{ message: string }> {
    const { sbEnvironmentId, edfiTenantId, adminApiJobId } = job.data;
    try {
      const edfiTenant = await this.edfiTenantsRepository.findOne({
        where: { id: edfiTenantId },
        relations: { sbEnvironment: true },
      });
      if (!edfiTenant) {
        throw new Error(`Edfi tenant ${edfiTenantId} no longer exists.`);
      }

      const service = this.strategyFactory
        .getStrategy(edfiTenant.sbEnvironment.version)
        .getAdminApiService() as unknown as Partial<ManageCapableAdminApiService>;
      if (typeof service?.getAdminApiClient !== 'function') {
        throw new Error(
          `Admin API version ${edfiTenant.sbEnvironment.version} does not support tracking datastore jobs.`
        );
      }
      const client = service.getAdminApiClient(edfiTenant);

      const rawAttempts = Number(config.ADMINAPI_DATASTORE_JOB_POLL_ATTEMPTS);
      const rawInterval = Number(config.ADMINAPI_DATASTORE_JOB_POLL_INTERVAL_MS);
      const result = await pollAdminApiJob(
        client,
        adminApiJobId,
        this.logger,
        `${job.data.operation} of ${job.data.odsName} in tenant ${edfiTenant.name}`,
        {
          maxAttempts: Number.isFinite(rawAttempts) && rawAttempts >= 1 ? rawAttempts : 720,
          intervalMs: Number.isFinite(rawInterval) && rawInterval >= 0 ? rawInterval : 5000,
          // A transient Admin API error must not end tracking early with a false timeout.
          retryOnError: true,
        }
      );

      if (result.outcome === 'completed') {
        return { message: `Admin API job ${adminApiJobId} completed.` };
      }
      if (result.outcome === 'failed') {
        throw new Error(result.errorMessage ?? `Admin API job ${adminApiJobId} failed.`);
      }
      if (result.outcome === 'error') {
        throw new Error(`Couldn't check Admin API job ${adminApiJobId}: ${result.message}`);
      }
      throw new Error(`Timed out waiting for Admin API job ${adminApiJobId}.`);
    } finally {
      // A failed follow-up sync must never replace the real job outcome.
      try {
        await this.jobQueue.send(ENV_SYNC_CHNL, { sbEnvironmentId }, { expireInHours: 2 });
      } catch (sendError) {
        this.logger.warn(
          `Failed to queue environment sync for environment ${sbEnvironmentId}: ${(sendError as Error).message}`
        );
      }
    }
  }
}

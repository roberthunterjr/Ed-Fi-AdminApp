import { OdsManageJobData } from '@edanalytics/models';
import { SbSyncQueue } from '@edanalytics/models-server';
import { Repository } from 'typeorm';
import { IJobQueueService } from './job-queue/job-queue.interface';
import { ODS_MANAGE_CHNL } from './sb-sync.module';

const MAX_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 500;

/**
 * Queues an `ods-manage` job and waits only until its row is visible in the sync queue view
 * (not until it finishes), so the caller can return the job to the frontend quickly.
 *
 * Returns only the id and state: the response reaches team users, and a job that already
 * failed would otherwise carry its output (including the stack). The team job endpoint
 * exposes the error message.
 *
 * Returns undefined if the row isn't visible in time, so the caller shows no banner rather
 * than one linking to a job page that would 404. The job itself still runs.
 */
export async function queueOdsManageJob(
  jobQueue: IJobQueueService,
  queueRepository: Repository<SbSyncQueue>,
  data: OdsManageJobData
): Promise<SbSyncQueue | undefined> {
  const id = await jobQueue.send(ODS_MANAGE_CHNL, data, {
    // pg-boss 12 only honors expireInSeconds; the handler polls Admin API for up to ~1h.
    expireInSeconds: 7200,
    retryLimit: 0,
  });

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const queueItem = await queueRepository.findOneBy({ id });
    if (queueItem) {
      const result = new SbSyncQueue();
      result.id = id;
      result.state = queueItem.state;
      return result;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return undefined;
}

import { Logger } from '@nestjs/common';
import { AxiosInstance, isAxiosError } from 'axios';
import config from 'config';

/**
 * Run the Admin API job to refresh the EdOrgs for the given environment. This is a long-running operation, so it returns a job ID that can be polled for completion.
 * @param client - The Admin API client for the environment (from getAdminApiClientForEnvironment())
 * @param refreshPath - The version-specific refresh endpoint (e.g. 'odsInstances/edOrgs/refresh' for v2, 'dataStores/edOrgs/refresh' for v3)
 * @param logger - The calling service's logger, so log output is attributed to the right service
 * @param environmentName - The environment's display name, for logging
 * @returns Promise<string | null> - The job ID if successfully triggered, otherwise null
 */
export async function triggerEdOrgRefresh(
  client: AxiosInstance,
  refreshPath: string,
  logger: Logger,
  environmentName: string
): Promise<string | null> {
  try {
    const response = await client.post(refreshPath);
    const jobId = (response as { jobId?: string })?.jobId ?? null;
    if (!jobId) {
      logger.warn(`EdOrg refresh response missing jobId for environment ${environmentName}`);
      return null;
    }
    logger.log(`EdOrg refresh triggered for ${environmentName}, jobId: ${jobId}`);
    return jobId;
  } catch (error) {
    logger.warn(
      `Failed to trigger EdOrg refresh for environment ${environmentName}: ${(error as Error).message}`
    );
    return null;
  }
}

export type AdminApiJobPollResult =
  | { outcome: 'completed' }
  | { outcome: 'failed'; errorMessage: string | null }
  | { outcome: 'timeout' }
  /** Only with `retryOnError`: the attempt budget ended while the last poll was still erroring. */
  | { outcome: 'error'; message: string };

/**
 * Polls GET jobs/{jobId} until the job reaches a terminal state or the attempt limit is reached.
 * Admin API reports status as Pending | InProgress | Completed | Error; comparison is case-insensitive
 * and 'failed' is also treated as a failure.
 * @param client - The Admin API client for the environment (from getAdminApiClientForEnvironment())
 * @param jobId - The Admin API job ID
 * @param logger - The calling service's logger, so log output is attributed to the right service
 * @param label - A display label (e.g. the environment name), for logging
 * @param options - maxAttempts and intervalMs (ms between attempts). With `retryOnError`, a non-404
 *   error is retried within the attempt budget (and reported as an `error` outcome if the budget
 *   ends while still erroring) instead of ending the poll immediately as a `timeout`.
 */
export async function pollAdminApiJob(
  client: AxiosInstance,
  jobId: string,
  logger: Logger,
  label: string,
  options: { maxAttempts: number; intervalMs: number; retryOnError?: boolean }
): Promise<AdminApiJobPollResult> {
  const { maxAttempts, intervalMs, retryOnError = false } = options;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.get(`jobs/${jobId}`);
      lastError = null;
      const body = response as unknown as { status?: string; errorMessage?: string | null };
      const status = body?.status?.toLowerCase();
      if (status === 'completed') return { outcome: 'completed' };
      if (status === 'error' || status === 'failed') {
        return { outcome: 'failed', errorMessage: body?.errorMessage ?? null };
      }
    } catch (error) {
      // A 404 right after triggering the job can simply mean the job's status
      // row hasn't been persisted yet (observed in practice: the job starts executing
      // milliseconds after the first poll 404s) — keep retrying through the attempt
      // budget instead of treating a single 404 as proof the endpoint is unsupported.
      if (isAxiosError(error) && error.response?.status === 404) {
        lastError = null;
        logger.debug(
          `Job ${jobId} not found (404) on attempt ${attempt}/${maxAttempts} for ${label} — retrying`
        );
      } else if (retryOnError) {
        lastError = error as Error;
        logger.warn(
          `Poll attempt ${attempt}/${maxAttempts} failed for job ${jobId}: ${lastError.message} — retrying`
        );
      } else {
        logger.error(
          `Poll attempt ${attempt}/${maxAttempts} failed for job ${jobId}: ${(error as Error).message}`
        );
        return { outcome: 'timeout' };
      }
    }

    if (attempt < maxAttempts) {
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  if (lastError) {
    logger.error(
      `Job ${jobId} could not be checked after ${maxAttempts} poll attempts for ${label}: ${lastError.message}`
    );
    return { outcome: 'error', message: lastError.message };
  }

  logger.warn(`Job ${jobId} did not complete after ${maxAttempts} poll attempts for ${label}`);
  return { outcome: 'timeout' };
}

/**
 * Polls GET jobs/{jobId} until the job reaches a terminal state or the attempt limit is reached.
 * Poll parameters are driven by ADMINAPI_REFRESH_POLL_ATTEMPTS and ADMINAPI_REFRESH_POLL_INTERVAL_MS config.
 * @param client - The Admin API client for the environment (from getAdminApiClientForEnvironment())
 * @param jobId - The job ID returned by triggerEdOrgRefresh()
 * @param logger - The calling service's logger, so log output is attributed to the right service
 * @param environmentName - The environment's display name, for logging
 * @returns 'completed' | 'failed' | 'timeout'
 */
export async function pollJobStatus(
  client: AxiosInstance,
  jobId: string,
  logger: Logger,
  environmentName: string
): Promise<'completed' | 'failed' | 'timeout'> {
  const rawMaxAttempts = Number(config.ADMINAPI_REFRESH_POLL_ATTEMPTS);
  const rawIntervalMs = Number(config.ADMINAPI_REFRESH_POLL_INTERVAL_MS);
  const maxAttempts: number = Number.isFinite(rawMaxAttempts) && rawMaxAttempts >= 1 ? rawMaxAttempts : 10;
  const intervalMs: number = Number.isFinite(rawIntervalMs) && rawIntervalMs >= 0 ? rawIntervalMs : 5000;

  const result = await pollAdminApiJob(client, jobId, logger, `environment ${environmentName}`, {
    maxAttempts,
    intervalMs,
  });
  // retryOnError is never set here, so an 'error' outcome cannot occur.
  return result.outcome === 'error' ? 'timeout' : result.outcome;
}

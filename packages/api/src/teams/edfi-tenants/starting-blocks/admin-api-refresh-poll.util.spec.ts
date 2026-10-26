import { Logger } from '@nestjs/common';
import { AxiosInstance } from 'axios';
import config from 'config';
import { pollAdminApiJob, pollJobStatus } from './admin-api-refresh-poll.util';

jest.mock('config', () => ({
  ADMINAPI_REFRESH_POLL_ATTEMPTS: 5,
  ADMINAPI_REFRESH_POLL_INTERVAL_MS: 0,
}));

const make404 = (): Error & { isAxiosError: true; response: { status: number } } =>
  Object.assign(new Error('Request failed with status code 404'), {
    isAxiosError: true as const,
    response: { status: 404 },
  });

describe('pollJobStatus', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test');
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  });

  it('retries past an initial 404 (job status row not yet persisted) and returns completed once the job is found', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(make404())
      .mockResolvedValueOnce({ status: 'Completed' });
    const client = { get } as unknown as AxiosInstance;

    const result = await pollJobStatus(client, 'job-123', logger, 'Test Env');

    expect(result).toBe('completed');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('logs a per-attempt 404 at debug (not warn), including the environment name', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(make404())
      .mockResolvedValueOnce({ status: 'Completed' });
    const client = { get } as unknown as AxiosInstance;

    await pollJobStatus(client, 'job-123', logger, 'Test Env');

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Test Env'));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns timeout after exhausting all attempts if every poll 404s', async () => {
    const get = jest.fn().mockRejectedValue(make404());
    const client = { get } as unknown as AxiosInstance;

    const result = await pollJobStatus(client, 'job-123', logger, 'Test Env');

    expect(result).toBe('timeout');
    expect(get).toHaveBeenCalledTimes(Number(config.ADMINAPI_REFRESH_POLL_ATTEMPTS));
  });

  it('returns timeout immediately on a non-404 error without retrying', async () => {
    const get = jest.fn().mockRejectedValue(new Error('network error'));
    const client = { get } as unknown as AxiosInstance;

    const result = await pollJobStatus(client, 'job-123', logger, 'Test Env');

    expect(result).toBe('timeout');
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('pollAdminApiJob', () => {
  let logger: Logger;
  const options = { maxAttempts: 3, intervalMs: 0 };

  beforeEach(() => {
    logger = new Logger('test');
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  });

  it('returns completed for status "Completed"', async () => {
    const get = jest.fn().mockResolvedValue({ status: 'Completed' });
    const client = { get } as unknown as AxiosInstance;

    await expect(pollAdminApiJob(client, 'job-1', logger, 'Label', options)).resolves.toEqual({
      outcome: 'completed',
    });
  });

  it('returns failed with errorMessage for status "Error"', async () => {
    const get = jest
      .fn()
      .mockResolvedValue({ status: 'Error', errorMessage: 'Database "x" already exists' });
    const client = { get } as unknown as AxiosInstance;

    await expect(pollAdminApiJob(client, 'job-1', logger, 'Label', options)).resolves.toEqual({
      outcome: 'failed',
      errorMessage: 'Database "x" already exists',
    });
  });

  it('keeps polling through Pending and InProgress', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ status: 'Pending' })
      .mockResolvedValueOnce({ status: 'InProgress' })
      .mockResolvedValueOnce({ status: 'Completed' });
    const client = { get } as unknown as AxiosInstance;

    await expect(pollAdminApiJob(client, 'job-1', logger, 'Label', options)).resolves.toEqual({
      outcome: 'completed',
    });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('returns timeout after maxAttempts 404s', async () => {
    const get = jest.fn().mockRejectedValue(make404());
    const client = { get } as unknown as AxiosInstance;

    await expect(pollAdminApiJob(client, 'job-1', logger, 'Label', options)).resolves.toEqual({
      outcome: 'timeout',
    });
    expect(get).toHaveBeenCalledTimes(3);
  });
});

describe('pollAdminApiJob retryOnError', () => {
  let logger: Logger;
  const options = { maxAttempts: 3, intervalMs: 0, retryOnError: true };

  beforeEach(() => {
    logger = new Logger('test');
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  });

  it('retries past a non-404 error and returns completed', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(new Error('Request failed with status code 500'))
      .mockResolvedValueOnce({ status: 'Completed' });
    const client = { get } as unknown as AxiosInstance;

    await expect(pollAdminApiJob(client, 'job-1', logger, 'Label', options)).resolves.toEqual({
      outcome: 'completed',
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('returns an error outcome with the message when the budget ends on an error', async () => {
    const get = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const client = { get } as unknown as AxiosInstance;

    await expect(pollAdminApiJob(client, 'job-1', logger, 'Label', options)).resolves.toEqual({
      outcome: 'error',
      message: 'connect ECONNREFUSED',
    });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('returns timeout (not error) when the last attempt was a 404 after earlier errors', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(make404());
    const client = { get } as unknown as AxiosInstance;

    await expect(pollAdminApiJob(client, 'job-1', logger, 'Label', options)).resolves.toEqual({
      outcome: 'timeout',
    });
  });

  it('without retryOnError still returns timeout immediately on a non-404 error', async () => {
    const get = jest.fn().mockRejectedValue(new Error('network error'));
    const client = { get } as unknown as AxiosInstance;

    await expect(
      pollAdminApiJob(client, 'job-1', logger, 'Label', { maxAttempts: 3, intervalMs: 0 })
    ).resolves.toEqual({ outcome: 'timeout' });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('pollJobStatus status mapping', () => {
  const logger = new Logger('test');

  it('still accepts lowercase "completed"', async () => {
    const get = jest.fn().mockResolvedValue({ status: 'completed' });
    const client = { get } as unknown as AxiosInstance;

    await expect(pollJobStatus(client, 'job-1', logger, 'Env')).resolves.toBe('completed');
  });

  it('maps "Error" to "failed"', async () => {
    const get = jest.fn().mockResolvedValue({ status: 'Error', errorMessage: 'boom' });
    const client = { get } as unknown as AxiosInstance;

    await expect(pollJobStatus(client, 'job-1', logger, 'Env')).resolves.toBe('failed');
  });
});

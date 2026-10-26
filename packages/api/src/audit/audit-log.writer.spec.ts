import { Logger } from '@nestjs/common';
import { AuditLog } from '@edanalytics/models-server';
import { Repository } from 'typeorm';
import { AuditEvent, AuditEventType } from './audit-event';
import { AuditEventQueue } from './audit-event.queue';
import { AuditLogWriter } from './audit-log.writer';

const event = (httpUrl: string): AuditEvent => ({
  eventType: AuditEventType.Action,
  timestamp: new Date('2026-01-01T00:00:00Z'),
  httpUrl,
});

describe('AuditLogWriter', () => {
  const options = { flushIntervalMs: 1000, batchSize: 100, retryDelaysMs: [10, 20] };
  let insert: jest.Mock;
  let repo: Repository<AuditLog>;
  let queue: AuditEventQueue;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    insert = jest.fn().mockResolvedValue(undefined);
    repo = { insert } as unknown as Repository<AuditLog>;
    queue = new AuditEventQueue(100);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('inserts queued events on flush', async () => {
    queue.enqueue(event('/1'));
    queue.enqueue(event('/2'));

    await new AuditLogWriter(queue, repo, true, options).flush();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0].map((e: AuditEvent) => e.httpUrl)).toEqual(['/1', '/2']);
    expect(queue.size).toBe(0);
  });

  it('does not touch the repository when the queue is empty', async () => {
    await new AuditLogWriter(queue, repo, true, options).flush();

    expect(insert).not.toHaveBeenCalled();
  });

  it('retries a failed insert until it succeeds', async () => {
    insert.mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('down'));
    queue.enqueue(event('/1'));

    const flushing = new AuditLogWriter(queue, repo, true, options).flush();
    await jest.advanceTimersByTimeAsync(30);
    await flushing;

    expect(insert).toHaveBeenCalledTimes(3);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs the events and resolves when every attempt fails', async () => {
    insert.mockRejectedValue(new Error('down'));
    queue.enqueue(event('/lost'));

    const flushing = new AuditLogWriter(queue, repo, true, options).flush();
    await jest.advanceTimersByTimeAsync(30);
    await expect(flushing).resolves.toBeUndefined();

    // three batch attempts, then one attempt for the single row
    expect(insert).toHaveBeenCalledTimes(4);
    expect(errorSpy.mock.calls.some(([message]) => String(message).includes('/lost'))).toBe(true);
  });

  it('retries rows one at a time after the batch fails, so a bad row only loses itself', async () => {
    const persisted: string[] = [];
    insert.mockImplementation(async (rows: AuditEvent[]) => {
      if (rows.some((row) => row.httpUrl === '/poison')) throw new Error('value too long');
      persisted.push(...rows.map((row) => row.httpUrl as string));
    });
    ['/1', '/poison', '/2'].forEach((url) => queue.enqueue(event(url)));

    const flushing = new AuditLogWriter(queue, repo, true, options).flush();
    await jest.advanceTimersByTimeAsync(30);
    await expect(flushing).resolves.toBeUndefined();

    expect(persisted).toEqual(['/1', '/2']);
    const notPersisted = errorSpy.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes('Audit event not persisted'));
    expect(notPersisted).toHaveLength(1);
    expect(notPersisted[0]).toContain('/poison');
  });

  it('keeps flushing within one call while a full batch is waiting', async () => {
    const small = { ...options, batchSize: 2 };
    ['/1', '/2', '/3', '/4', '/5'].forEach((url) => queue.enqueue(event(url)));

    await new AuditLogWriter(queue, repo, true, small).flush();

    // two full batches; the single leftover row waits for the next tick
    expect(insert).toHaveBeenCalledTimes(2);
    expect(queue.size).toBe(1);
  });

  it('skips the row-by-row fallback on a connection error', async () => {
    insert.mockRejectedValue(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    ['/1', '/2'].forEach((url) => queue.enqueue(event(url)));

    const flushing = new AuditLogWriter(queue, repo, true, options).flush();
    await jest.advanceTimersByTimeAsync(30);
    await flushing;

    expect(insert).toHaveBeenCalledTimes(3);
    const notPersisted = errorSpy.mock.calls.filter(([message]) =>
      String(message).includes('Audit event not persisted'),
    );
    expect(notPersisted).toHaveLength(2);
  });

  it('flushes on the timer', async () => {
    const writer = new AuditLogWriter(queue, repo, true, options);
    writer.onModuleInit();
    queue.enqueue(event('/1'));

    await jest.advanceTimersByTimeAsync(1000);

    expect(insert).toHaveBeenCalledTimes(1);
    await writer.onApplicationShutdown();
  });

  it('stops the timer and flushes everything remaining on shutdown', async () => {
    const writer = new AuditLogWriter(queue, repo, true, { ...options, batchSize: 2 });
    writer.onModuleInit();
    for (let i = 0; i < 5; i++) queue.enqueue(event(`/${i}`));

    await writer.onApplicationShutdown();

    expect(queue.size).toBe(0);
    expect(insert).toHaveBeenCalledTimes(3);
    queue.enqueue(event('/after'));
    await jest.advanceTimersByTimeAsync(5000);
    expect(queue.size).toBe(1);
  });

  it('never calls the repository when disabled', async () => {
    const writer = new AuditLogWriter(queue, repo, false, options);
    writer.onModuleInit();
    queue.enqueue(event('/1'));

    await jest.advanceTimersByTimeAsync(5000);
    await writer.flush();
    await writer.onApplicationShutdown();

    expect(insert).not.toHaveBeenCalled();
  });

  it('resolves and logs every event even when serialization throws', async () => {
    insert.mockRejectedValue(new Error('down'));
    const circular: AuditEvent = event('/circular');
    (circular as unknown as { self: unknown }).self = circular;
    queue.enqueue(circular);
    queue.enqueue({ ...event('/bigint'), details: 1n as unknown as string });

    const flushing = new AuditLogWriter(queue, repo, true, options).flush();
    await jest.advanceTimersByTimeAsync(30);
    await expect(flushing).resolves.toBeUndefined();

    expect(errorSpy.mock.calls.filter(([m]) => String(m).includes('not persisted'))).toHaveLength(
      2,
    );
  });

  it('keeps only one flush in flight while an insert is pending', async () => {
    insert.mockReturnValue(new Promise(() => undefined));
    const writer = new AuditLogWriter(queue, repo, true, options);
    writer.onModuleInit();
    queue.enqueue(event('/1'));

    await jest.advanceTimersByTimeAsync(5000);
    queue.enqueue(event('/2'));
    await jest.advanceTimersByTimeAsync(5000);

    expect(insert).toHaveBeenCalledTimes(1);
  });

  describe('shutdown timeout', () => {
    const notPersistedUrls = () =>
      errorSpy.mock.calls
        .map(([message]) => String(message))
        .filter((message) => message.startsWith('Audit event not persisted'));

    it('gives up after the timeout and logs the in-flight and queued events', async () => {
      insert.mockReturnValue(new Promise(() => undefined));
      const writer = new AuditLogWriter(queue, repo, true, {
        ...options,
        shutdownTimeoutMs: 5000,
      });
      writer.onModuleInit();
      queue.enqueue(event('/in-flight'));
      await jest.advanceTimersByTimeAsync(1000);
      queue.enqueue(event('/queued-1'));
      queue.enqueue(event('/queued-2'));

      let done = false;
      const shutdown = writer.onApplicationShutdown().then(() => (done = true));
      await jest.advanceTimersByTimeAsync(4999);
      expect(done).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await expect(shutdown).resolves.toBe(true);

      const logged = notPersistedUrls();
      expect(logged).toHaveLength(3);
      ['/in-flight', '/queued-1', '/queued-2'].forEach((url, i) =>
        expect(logged[i]).toContain(url),
      );
      expect(queue.size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('shuts down without waiting for the timeout when inserts are fast', async () => {
      const writer = new AuditLogWriter(queue, repo, true, {
        ...options,
        shutdownTimeoutMs: 5000,
      });
      writer.onModuleInit();
      queue.enqueue(event('/1'));

      let done = false;
      const shutdown = writer.onApplicationShutdown().then(() => (done = true));
      await jest.advanceTimersByTimeAsync(0);

      expect(done).toBe(true);
      await shutdown;
      expect(insert).toHaveBeenCalledTimes(1);
      expect(notPersistedUrls()).toHaveLength(0);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  it('waits for an in-flight flush on shutdown', async () => {
    let finish: () => void = () => undefined;
    insert.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const writer = new AuditLogWriter(queue, repo, true, options);
    writer.onModuleInit();
    queue.enqueue(event('/1'));
    await jest.advanceTimersByTimeAsync(1000);

    let done = false;
    const shutdown = writer.onApplicationShutdown().then(() => (done = true));
    await jest.advanceTimersByTimeAsync(100);
    expect(done).toBe(false);

    finish();
    await shutdown;
    expect(done).toBe(true);
  });
});

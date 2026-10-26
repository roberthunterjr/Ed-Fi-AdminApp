import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { AuditLog } from '@edanalytics/models-server';
import { Repository } from 'typeorm';
import { AuditEvent } from './audit-event';
import { AuditEventQueue } from './audit-event.queue';
import { safeStringify } from './audit-sanitizer';

export interface AuditLogWriterOptions {
  flushIntervalMs: number;
  batchSize: number;
  retryDelaysMs: number[];
  /** How long shutdown waits for pending inserts before logging the remaining events instead. */
  shutdownTimeoutMs: number;
}

const DEFAULT_OPTIONS: AuditLogWriterOptions = {
  flushIntervalMs: 1000,
  // Each row binds 10 parameters, and SQL Server allows at most 2100 per statement:
  // keep batchSize at or below ~200.
  batchSize: 100,
  retryDelaysMs: [250, 1000],
  shutdownTimeoutMs: 5000,
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Persists queued audit events in the background so requests never wait on the database. */
@Injectable()
export class AuditLogWriter implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AuditLogWriter.name);
  private readonly options: AuditLogWriterOptions;
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private pendingBatch: AuditEvent[] = [];
  private abandoned = false;

  constructor(
    private readonly queue: AuditEventQueue,
    private readonly repo: Repository<AuditLog>,
    private readonly enabled: boolean,
    options: Partial<AuditLogWriterOptions> = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  onModuleInit(): void {
    if (!this.enabled) {
      return;
    }
    this.timer = setInterval(() => void this.flush(), this.options.flushIntervalMs);
    this.timer.unref?.();
  }

  /** Never rejects, and never waits longer than shutdownTimeoutMs for the database. */
  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    if (!this.enabled) {
      return;
    }
    if (!(await this.drainWithin(this.options.shutdownTimeoutMs))) {
      this.abandonRemaining();
    }
  }

  /** Resolves true when every event was handled before the timeout, false otherwise. */
  private async drainWithin(timeoutMs: number): Promise<boolean> {
    let timeout: NodeJS.Timeout | undefined;
    const timedOut = new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => resolve(false), timeoutMs);
      timeout.unref?.();
    });
    try {
      return await Promise.race([this.drain().then(() => true), timedOut]);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async drain(): Promise<void> {
    await this.inFlight;
    while (!this.abandoned && this.queue.size > 0) {
      await this.flush();
    }
  }

  /**
   * Logs the in-flight batch and the queue so nothing is silently lost. An in-flight insert that
   * still completes later can leave an event both in the table and in the log.
   */
  private abandonRemaining(): void {
    this.abandoned = true;
    const remaining = [...this.pendingBatch, ...this.queue.drain(this.queue.size)];
    this.pendingBatch = [];
    remaining.forEach((event) => this.logNotPersisted(event));
  }

  /** Never rejects. Concurrent callers share the flush already in progress. */
  flush(): Promise<void> {
    if (!this.enabled) {
      return Promise.resolve();
    }
    this.inFlight ??= this.flushAll().finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  /** Keeps writing batches within one tick while the queue holds at least a full batch. */
  private async flushAll(): Promise<void> {
    do {
      const outcome = await this.flushBatch();
      if (outcome !== 'ok') {
        return; // empty queue, or the database is failing: wait for the next tick
      }
    } while (!this.abandoned && this.queue.size >= this.options.batchSize);
  }

  private async flushBatch(): Promise<'empty' | 'ok' | 'failed'> {
    const batch = this.queue.drain(this.options.batchSize);
    if (batch.length === 0) {
      return 'empty';
    }
    this.pendingBatch = batch;
    try {
      const result = await this.insertWithRetry(batch);
      if (result === 'ok') {
        return 'ok';
      }
      // A connection failure would fail every row too, so skip the row-by-row fallback
      if (result === 'connection') {
        batch.forEach((event) => this.logNotPersisted(event));
      } else {
        await this.insertOneByOne(batch);
      }
      return 'failed';
    } finally {
      this.pendingBatch = [];
    }
  }

  /** After the batch fails for good, a single bad row must not take the other rows down with it. */
  private async insertOneByOne(batch: AuditEvent[]): Promise<void> {
    for (const event of batch) {
      if (this.abandoned) {
        return; // shutdown already logged this batch
      }
      try {
        await this.repo.insert([event]);
      } catch {
        this.logNotPersisted(event);
      }
    }
  }

  private logNotPersisted(event: AuditEvent): void {
    this.logger.error(`Audit event not persisted: ${safeStringify(event)}`);
  }

  private async insertWithRetry(batch: AuditEvent[]): Promise<'ok' | 'connection' | 'rejected'> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.repo.insert(batch);
        return 'ok';
      } catch (error) {
        if (attempt >= this.options.retryDelaysMs.length) {
          this.logger.error(`Audit insert failed after ${attempt + 1} attempts: ${error}`);
          return isConnectionError(error) ? 'connection' : 'rejected';
        }
        await delay(this.options.retryDelaysMs[attempt]);
      }
    }
  }
}

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ESOCKET', // mssql
  'ETIMEOUT', // mssql
  'ECONNCLOSED', // mssql
  'ELOGIN', // mssql
  '57P01', // pg: admin shutdown
  '57P02', // pg: crash shutdown
  '57P03', // pg: cannot connect now
]);

/** True when the database itself is unreachable, as opposed to rejecting a particular row. */
export const isConnectionError = (error: unknown): boolean => {
  const err = error as
    | { code?: unknown; driverError?: { code?: unknown; originalError?: { code?: unknown } } }
    | undefined;
  const codes = [err?.code, err?.driverError?.code, err?.driverError?.originalError?.code];
  return codes.some(
    (code) =>
      typeof code === 'string' && (CONNECTION_ERROR_CODES.has(code) || code.startsWith('08')),
  );
};

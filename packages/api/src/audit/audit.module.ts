import { Global, Logger, Module, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '@edanalytics/models-server';
import config from 'config';
import { Repository } from 'typeorm';
import { AuditActionMiddleware } from './audit-action.middleware';
import { AuditDeleteInterceptor } from './audit-delete.interceptor';
import { AUDIT_ENABLED } from './audit-enabled.token';
import { AuditEventQueue } from './audit-event.queue';
import { AuditEventRecorder } from './audit-event.recorder';
import { AuditLogWriter } from './audit-log.writer';
import './delete-snapshot.registrations';

export { AUDIT_ENABLED };
export const AUDIT_QUEUE_CAPACITY = 10_000;

/** Audit logging is ON unless the flag is explicitly false ('false' in any case, or boolean false). */
export const isAuditEnabled = (value: unknown): boolean =>
  !(value === false || (typeof value === 'string' && value.trim().toLowerCase() === 'false'));

export const auditProviders: Provider[] = [
  {
    provide: AUDIT_ENABLED,
    useFactory: () => {
      const enabled = isAuditEnabled(config.AUDIT_LOGGING_ENABLED);
      if (!enabled) {
        new Logger('AuditModule').warn(
          'Audit logging is DISABLED (AUDIT_LOGGING_ENABLED=false). No audit rows will be written.',
        );
      }
      return enabled;
    },
  },
  { provide: AuditEventQueue, useFactory: () => new AuditEventQueue(AUDIT_QUEUE_CAPACITY) },
  {
    provide: AuditEventRecorder,
    useFactory: (queue: AuditEventQueue, enabled: boolean) =>
      new AuditEventRecorder(queue, enabled),
    inject: [AuditEventQueue, AUDIT_ENABLED],
  },
  {
    provide: AuditLogWriter,
    useFactory: (queue: AuditEventQueue, repo: Repository<AuditLog>, enabled: boolean) =>
      new AuditLogWriter(queue, repo, enabled),
    inject: [AuditEventQueue, getRepositoryToken(AuditLog), AUDIT_ENABLED],
  },
  AuditActionMiddleware,
  { provide: APP_INTERCEPTOR, useClass: AuditDeleteInterceptor },
];

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: auditProviders,
  exports: [AuditEventRecorder, AUDIT_ENABLED],
})
export class AuditModule {}

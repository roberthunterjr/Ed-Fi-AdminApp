import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { DataSource } from 'typeorm';
import { AUDIT_DELETE_METADATA, AuditDeleteMetadata } from './audit-delete.decorator';
import { AUDIT_ENABLED } from './audit-enabled.token';
import { setAuditSnapshot } from './audit-request-context';
import { getDeleteSnapshotBuilder, getDeleteSnapshotFindOptions } from './delete-snapshot.registry';

/**
 * Loads the entity named by `@AuditDelete` before the handler runs and attaches an allowlisted
 * snapshot to the request. Never throws: a failed lookup only skips the snapshot. Does nothing when
 * audit logging is disabled.
 */
@Injectable()
export class AuditDeleteInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditDeleteInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
    @Inject(AUDIT_ENABLED) private readonly enabled: boolean,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (!this.enabled) {
      return next.handle();
    }
    try {
      await this.snapshot(context);
    } catch (err) {
      this.logger.warn(
        `Delete snapshot skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return next.handle();
  }

  private async snapshot(context: ExecutionContext): Promise<void> {
    if (context.getType() !== 'http') return;
    const meta = this.reflector.get<AuditDeleteMetadata | undefined>(
      AUDIT_DELETE_METADATA,
      context.getHandler(),
    );
    if (!meta) return;
    const build = getDeleteSnapshotBuilder(meta.entity);
    if (!build) return;

    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.params?.[meta.idParam];
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return;
    const id = Number(raw);
    if (!Number.isSafeInteger(id)) return;

    const pk = this.dataSource.getMetadata(meta.entity).primaryColumns[0]?.propertyName;
    if (!pk) return;
    const found = await this.dataSource.manager.findOne(
      meta.entity as never,
      getDeleteSnapshotFindOptions(meta.entity, pk, id),
    );
    if (!found) return;
    setAuditSnapshot(req, build(found as never));
  }
}

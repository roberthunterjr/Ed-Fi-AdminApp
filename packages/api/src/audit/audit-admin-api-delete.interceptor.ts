import type { EdfiTenant } from '@edanalytics/models-server';
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import {
  AUDIT_ADMIN_API_DELETE_METADATA,
  AuditAdminApiDeleteMetadata,
} from './audit-admin-api-delete.decorator';
import { AUDIT_ENABLED } from './audit-enabled.token';
import { setAuditSnapshot } from './audit-request-context';

/** Longest the DELETE waits for its pre-delete snapshot before proceeding without one. */
export const SNAPSHOT_TIMEOUT_MS = 5000;

/**
 * Loads the Admin API resource named by `@AuditAdminApiDelete` before the handler runs and attaches
 * an allowlisted snapshot to the request. Never throws: a failed lookup only skips the snapshot.
 * Does nothing when audit logging is disabled. Must run after SbEnvironmentEdfiTenantInterceptor.
 */
@Injectable()
export class AuditAdminApiDeleteInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditAdminApiDeleteInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
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
        `Admin API delete snapshot skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return next.handle();
  }

  private async snapshot(context: ExecutionContext): Promise<void> {
    if (context.getType() !== 'http') return;
    const meta = this.reflector.get<AuditAdminApiDeleteMetadata | undefined>(
      AUDIT_ADMIN_API_DELETE_METADATA,
      context.getHandler(),
    );
    if (!meta) return;

    const req = context.switchToHttp().getRequest<Request & { edfiTenant?: EdfiTenant }>();
    const edfiTenant = req.edfiTenant;
    if (!edfiTenant) {
      // Means this interceptor ran before SbEnvironmentEdfiTenantInterceptor; don't fail silently
      throw new Error('request has no edfiTenant (check interceptor order)');
    }
    const raw = req.params?.[meta.idParam];
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return;
    const id = Number(raw);
    if (!Number.isSafeInteger(id)) return;

    const snapshot = await this.withDeadline(
      meta.load({ moduleRef: this.moduleRef, edfiTenant, id }),
    );
    if (snapshot) setAuditSnapshot(req, snapshot);
  }

  /**
   * The Admin API clients have no HTTP timeout, so an unresponsive read must not hold back the
   * DELETE. The loader is not cancellable; on expiry its eventual result is simply ignored.
   */
  private withDeadline<T>(work: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`snapshot lookup exceeded ${SNAPSHOT_TIMEOUT_MS}ms`)),
        SNAPSHOT_TIMEOUT_MS,
      );
    });
    // Without this a late rejection of `work` after the deadline would be unhandled
    work.catch(() => undefined);
    return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { resolveActor } from './audit-actor.resolver';
import { AuditEventType } from './audit-event';
import { AuditEventRecorder } from './audit-event.recorder';
import { getAuditOidcIssuer, getAuditSnapshot } from './audit-request-context';
import { safeStringify } from './audit-sanitizer';

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/**
 * Recorded when the connection closes before the response finished. Express's default 200 would
 * otherwise make an aborted request look successful. 499 is nginx's "client closed request".
 */
const ABORTED_STATUS_CODE = 499;

/** Records one Action audit event per write request, with the final response status. */
@Injectable()
export class AuditActionMiddleware {
  private readonly logger = new Logger(AuditActionMiddleware.name);

  constructor(private readonly recorder: AuditEventRecorder) {}

  handle = (req: Request, res: Response, next: NextFunction): void => {
    if (!AUDITED_METHODS.has(req.method)) {
      return next();
    }
    const timestamp = new Date();
    let recorded = false;
    const record = () => {
      if (recorded) {
        return;
      }
      recorded = true;
      try {
        const actor = resolveActor(req);
        const statusCode = res.writableFinished ? res.statusCode : ABORTED_STATUS_CODE;
        // A handler can still reject after the snapshot was taken (e.g. a 403 for ed-orgs the user
        // does not control); nothing was deleted then, so the snapshot would be misleading.
        const snapshot = res.writableFinished && statusCode >= 400 ? undefined : getAuditSnapshot(req);
        this.recorder.record({
          eventType: AuditEventType.Action,
          timestamp,
          actorUsername: actor?.username ?? null,
          actorType: actor?.type ?? null,
          sourceIpAddress: req.ip,
          httpVerb: req.method,
          httpUrl: req.originalUrl,
          statusCode,
          oidcIssuer: this.sessionOidcIssuer(req),
          details: snapshot ? safeStringify(snapshot) : null,
        });
      } catch (error) {
        this.logger.error(`Failed to record audit action: ${error}`);
      }
    };
    res.once('finish', record);
    res.once('close', record);
    next();
  };

  /**
   * The issuer URL of the OIDC provider the session was authenticated through. Null for machine
   * users (bearer tokens carry no session), unauthenticated requests, or when the session is
   * unreadable, so a session problem never costs the Action row.
   */
  private sessionOidcIssuer(req: Request): string | null {
    try {
      return getAuditOidcIssuer(req) ?? req.session?.oidcIssuer ?? null;
    } catch (error) {
      this.logger.warn(`Could not read oidcIssuer from the session: ${error}`);
      return null;
    }
  }
}

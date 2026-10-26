import { Injectable, Logger } from '@nestjs/common';
import { AUDIT_COLUMN_LENGTHS } from './audit-column-lengths';
import { AuditEvent } from './audit-event';
import { AuditEventQueue } from './audit-event.queue';
import { safeStringify, sanitizeText, stripQueryString } from './audit-sanitizer';

/** Removes control characters and caps every string column so no value can make the insert fail. */
function sanitizeEvent(event: AuditEvent): AuditEvent {
  return {
    ...event,
    eventType: sanitizeText(
      event.eventType,
      AUDIT_COLUMN_LENGTHS.eventType,
    ) as AuditEvent['eventType'],
    actorUsername: sanitizeText(event.actorUsername, AUDIT_COLUMN_LENGTHS.actorUsername),
    actorType: sanitizeText(
      event.actorType,
      AUDIT_COLUMN_LENGTHS.actorType,
    ) as AuditEvent['actorType'],
    sourceIpAddress: sanitizeText(event.sourceIpAddress, AUDIT_COLUMN_LENGTHS.sourceIpAddress),
    httpVerb: sanitizeText(event.httpVerb, AUDIT_COLUMN_LENGTHS.httpVerb),
    httpUrl: event.httpUrl
      ? sanitizeText(stripQueryString(event.httpUrl), AUDIT_COLUMN_LENGTHS.httpUrl)
      : null,
    oidcIssuer: sanitizeText(event.oidcIssuer, AUDIT_COLUMN_LENGTHS.oidcIssuer),
  };
}

/** Event type and query-free URL only: the raw event may hold secrets in its query string. */
function describeForLog(event: AuditEvent): string {
  const eventType = sanitizeText(String(event?.eventType), AUDIT_COLUMN_LENGTHS.eventType);
  const url =
    typeof event?.httpUrl === 'string'
      ? sanitizeText(stripQueryString(event.httpUrl), AUDIT_COLUMN_LENGTHS.httpUrl)
      : null;
  return [eventType, url].filter(Boolean).join(' ');
}

/** Entry point for emitting audit events. Never throws: auditing must not break the request. */
@Injectable()
export class AuditEventRecorder {
  constructor(
    private readonly queue: AuditEventQueue,
    private readonly enabled: boolean,
    private readonly logger: Logger = new Logger(AuditEventRecorder.name),
  ) {}

  record(event: AuditEvent): void {
    if (!this.enabled) {
      return;
    }
    try {
      const sanitized = sanitizeEvent(event);
      if (!this.queue.enqueue(sanitized)) {
        this.logger.warn(`Audit queue full, event not persisted: ${safeStringify(sanitized)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to record audit event ${describeForLog(event)}: ${error}`);
    }
  }
}

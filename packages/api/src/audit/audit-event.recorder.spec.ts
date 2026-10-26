import { Logger } from '@nestjs/common';
import { AUDIT_COLUMN_LENGTHS } from './audit-column-lengths';
import { AuditEvent, AuditEventType } from './audit-event';
import { AuditEventQueue } from './audit-event.queue';
import { AuditEventRecorder } from './audit-event.recorder';

const event = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  eventType: AuditEventType.Action,
  timestamp: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('AuditEventRecorder', () => {
  const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;

  beforeEach(() => jest.clearAllMocks());

  it('records nothing when disabled', () => {
    const queue = new AuditEventQueue(10);

    new AuditEventRecorder(queue, false, logger).record(event());

    expect(queue.size).toBe(0);
  });

  it('sanitizes the username and strips the query string from the url', () => {
    const queue = new AuditEventQueue(10);

    new AuditEventRecorder(queue, true, logger).record(
      event({ actorUsername: 'ali\nce', httpUrl: '/api/things?token=secret#frag' }),
    );

    const [recorded] = queue.drain(1);
    expect(recorded.actorUsername).toBe('alice');
    expect(recorded.httpUrl).toBe('/api/things');
  });

  it('truncates overlong values', () => {
    const queue = new AuditEventQueue(10);

    new AuditEventRecorder(queue, true, logger).record(
      event({ actorUsername: 'a'.repeat(300), httpUrl: '/' + 'b'.repeat(3000) }),
    );

    const [recorded] = queue.drain(1);
    expect(recorded.actorUsername).toHaveLength(256);
    expect(recorded.httpUrl).toHaveLength(2048);
  });

  it('caps every string column to its database length', () => {
    const queue = new AuditEventQueue(10);

    new AuditEventRecorder(queue, true, logger).record(
      event({
        eventType: 'x'.repeat(300) as AuditEvent['eventType'],
        actorType: 'm'.repeat(300) as AuditEvent['actorType'],
        sourceIpAddress: '1'.repeat(300),
        oidcIssuer: 'o'.repeat(600),
        httpVerb: 'D'.repeat(300),
      }),
    );

    const [recorded] = queue.drain(1);
    expect(recorded.eventType).toHaveLength(AUDIT_COLUMN_LENGTHS.eventType);
    expect(recorded.actorType).toHaveLength(AUDIT_COLUMN_LENGTHS.actorType);
    expect(recorded.sourceIpAddress).toHaveLength(AUDIT_COLUMN_LENGTHS.sourceIpAddress);
    expect(recorded.oidcIssuer).toHaveLength(AUDIT_COLUMN_LENGTHS.oidcIssuer);
    expect(recorded.httpVerb).toHaveLength(AUDIT_COLUMN_LENGTHS.httpVerb);
  });

  it('removes control characters from every string column', () => {
    const queue = new AuditEventQueue(10);

    new AuditEventRecorder(queue, true, logger).record(
      event({ sourceIpAddress: '10.0.0.1\r\n', oidcIssuer: 'id\u00001', httpVerb: 'DEL\tETE' }),
    );

    const [recorded] = queue.drain(1);
    expect(recorded.sourceIpAddress).toBe('10.0.0.1');
    expect(recorded.oidcIssuer).toBe('id1');
    expect(recorded.httpVerb).toBe('DELETE');
  });

  it('logs only the event type and query-free url when recording fails', () => {
    const queue = new AuditEventQueue(10);
    jest.spyOn(queue, 'enqueue').mockImplementation(() => {
      throw new Error('boom');
    });
    const recorder = new AuditEventRecorder(queue, true, logger);

    expect(() =>
      recorder.record(
        event({ actorUsername: 'alice', httpUrl: '/api/things?token=secret', details: 'snap' }),
      ),
    ).not.toThrow();

    expect(logger.error).toHaveBeenCalledTimes(1);
    const message = String((logger.error as jest.Mock).mock.calls[0][0]);
    expect(message).toContain('boom');
    expect(message).toContain('Action');
    expect(message).toContain('/api/things');
    expect(message).not.toContain('secret');
    expect(message).not.toContain('alice');
    expect(message).not.toContain('snap');
  });

  it('logs the event and does not throw when the queue is full', () => {
    const queue = new AuditEventQueue(0);
    const recorder = new AuditEventRecorder(queue, true, logger);

    expect(() => recorder.record(event({ httpUrl: '/overflow' }))).not.toThrow();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String((logger.warn as jest.Mock).mock.calls[0][0])).toContain('/overflow');
  });
});

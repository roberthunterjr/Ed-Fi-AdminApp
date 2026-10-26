import { AuditEvent, AuditEventType } from './audit-event';
import { AuditEventQueue } from './audit-event.queue';

const eventAt = (httpUrl: string): AuditEvent => ({
  eventType: AuditEventType.Action,
  timestamp: new Date(),
  httpUrl,
});

describe('AuditEventQueue', () => {
  it('rejects events once capacity is reached', () => {
    const queue = new AuditEventQueue(2);

    expect(queue.enqueue(eventAt('/1'))).toBe(true);
    expect(queue.enqueue(eventAt('/2'))).toBe(true);
    expect(queue.enqueue(eventAt('/3'))).toBe(false);
    expect(queue.size).toBe(2);
  });

  it('drains events in FIFO order', () => {
    const queue = new AuditEventQueue(2);
    queue.enqueue(eventAt('/1'));
    queue.enqueue(eventAt('/2'));

    expect(queue.drain(10).map((e) => e.httpUrl)).toEqual(['/1', '/2']);
    expect(queue.size).toBe(0);
  });

  it('drains at most the requested number of events', () => {
    const queue = new AuditEventQueue(3);
    queue.enqueue(eventAt('/1'));
    queue.enqueue(eventAt('/2'));

    expect(queue.drain(1).map((e) => e.httpUrl)).toEqual(['/1']);
    expect(queue.size).toBe(1);
  });
});

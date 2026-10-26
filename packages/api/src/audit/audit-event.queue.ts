import { AuditEvent } from './audit-event';

export class AuditEventQueue {
  private readonly events: AuditEvent[] = [];

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.events.length;
  }

  enqueue(event: AuditEvent): boolean {
    if (this.events.length >= this.capacity) {
      return false;
    }
    this.events.push(event);
    return true;
  }

  drain(max: number): AuditEvent[] {
    return this.events.splice(0, max);
  }
}

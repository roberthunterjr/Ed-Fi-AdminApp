export interface RunSlot {
  release(): void;
}

/**
 * In-memory guard for certification runs on this API instance:
 * one run per key (process + scenario, whose captured values a run rewrites)
 * and a global cap so runs can't exhaust the server.
 */
export class RunLimiter {
  private readonly busyKeys = new Set<string>();
  private running = 0;

  constructor(private readonly maxConcurrent: number) {}

  tryAcquire(key: string): RunSlot | 'busy-key' | 'at-capacity' {
    if (this.busyKeys.has(key)) return 'busy-key';
    if (this.running >= this.maxConcurrent) return 'at-capacity';

    this.busyKeys.add(key);
    this.running++;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.busyKeys.delete(key);
        this.running--;
      },
    };
  }
}

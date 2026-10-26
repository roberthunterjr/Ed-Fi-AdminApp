import { RunLimiter } from './run-limiter';

describe('RunLimiter', () => {
  it('allows one run per key at a time', () => {
    const limiter = new RunLimiter(2);
    const slot = limiter.tryAcquire('7:12');
    expect(slot).toEqual({ release: expect.any(Function) });
    expect(limiter.tryAcquire('7:12')).toBe('busy-key');
  });

  it('caps the number of simultaneous runs', () => {
    const limiter = new RunLimiter(1);
    limiter.tryAcquire('a');
    expect(limiter.tryAcquire('b')).toBe('at-capacity');
  });

  it('frees the key and the slot on release, once', () => {
    const limiter = new RunLimiter(1);
    const slot = limiter.tryAcquire('a');
    if (typeof slot === 'string') throw new Error('expected a slot');
    slot.release();
    slot.release();
    expect(typeof limiter.tryAcquire('a')).toBe('object');
    expect(limiter.tryAcquire('b')).toBe('at-capacity');
  });
});

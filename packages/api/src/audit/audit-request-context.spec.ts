import type { Request } from 'express';
import { getAuditSnapshot, setAuditSnapshot } from './audit-request-context';

describe('audit request context', () => {
  it('returns undefined when no snapshot was set', () => {
    expect(getAuditSnapshot({} as Request)).toBeUndefined();
  });

  it('round-trips a snapshot per request', () => {
    const a = {} as Request;
    const b = {} as Request;

    setAuditSnapshot(a, { id: 1 });

    expect(getAuditSnapshot(a)).toEqual({ id: 1 });
    expect(getAuditSnapshot(b)).toBeUndefined();
  });
});

import type { Request } from 'express';
import { resolveActor } from './audit-actor.resolver';

const req = (user?: unknown) => ({ user }) as unknown as Request;

describe('resolveActor', () => {
  it('returns null without a user', () => {
    expect(resolveActor(req())).toBeNull();
  });

  it('returns null when the user has no username', () => {
    expect(resolveActor(req({ userType: 'human' }))).toBeNull();
  });

  it('resolves a session user as type user', () => {
    expect(resolveActor(req({ username: 'alice', userType: 'human' }))).toEqual({
      username: 'alice',
      type: 'user',
    });
  });

  it('resolves a machine user (bearer token) as type machine', () => {
    expect(resolveActor(req({ username: 'svc', userType: 'machine' }))).toEqual({
      username: 'svc',
      type: 'machine',
    });
  });
});

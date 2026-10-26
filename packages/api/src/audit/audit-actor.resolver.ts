import type { Request } from 'express';
import type { User } from '@edanalytics/models-server';

export interface AuditActor {
  username: string;
  type: 'user' | 'machine';
}

/**
 * Resolves who made the request. AuthenticatedGuard sets `req.user` to the User entity for both
 * session logins and bearer-token (machine) auth; machine users have `userType === 'machine'`.
 */
export const resolveActor = (req: Request): AuditActor | null => {
  const user = (req as Request & { user?: Partial<User> }).user;
  if (!user?.username) {
    return null;
  }
  return { username: user.username, type: user.userType === 'machine' ? 'machine' : 'user' };
};

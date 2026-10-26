import type { Request } from 'express';

const AUDIT_SNAPSHOT = Symbol('auditSnapshot');

type WithSnapshot = Request & { [AUDIT_SNAPSHOT]?: Record<string, unknown> };

/** Attaches a pre-change snapshot of an entity to the request, to be stored in the audit details. */
export const setAuditSnapshot = (req: Request, snapshot: Record<string, unknown>): void => {
  (req as WithSnapshot)[AUDIT_SNAPSHOT] = snapshot;
};

export const getAuditSnapshot = (req: Request): Record<string, unknown> | undefined =>
  (req as WithSnapshot)[AUDIT_SNAPSHOT];

const AUDIT_OIDC_ISSUER = Symbol('auditOidcIssuer');

type WithOidcIssuer = Request & { [AUDIT_OIDC_ISSUER]?: string };

/**
 * Keeps the issuer on the request for handlers that destroy the session (logout), after which
 * `req.session` is gone by the time the Action row is written.
 */
export const setAuditOidcIssuer = (req: Request, issuer: string | null | undefined): void => {
  if (issuer) (req as WithOidcIssuer)[AUDIT_OIDC_ISSUER] = issuer;
};

export const getAuditOidcIssuer = (req: Request): string | undefined =>
  (req as WithOidcIssuer)[AUDIT_OIDC_ISSUER];

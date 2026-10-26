/**
 * Maximum lengths of the audit_log string columns. Values longer than these make the database reject
 * the whole insert, so the recorder caps every value to them. audit-column-lengths.spec.ts keeps
 * this in step with the AuditLog entity and both migrations.
 */
export const AUDIT_COLUMN_LENGTHS = {
  eventType: 30,
  actorUsername: 256,
  actorType: 20,
  sourceIpAddress: 45,
  httpVerb: 10,
  httpUrl: 2048,
  oidcIssuer: 512,
} as const;

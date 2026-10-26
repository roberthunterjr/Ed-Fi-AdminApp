export const AuditEventType = {
  Action: 'Action',
  LoginSuccess: 'LoginSuccess',
  LoginFailure: 'LoginFailure',
  Logout: 'Logout',
} as const;

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];

export interface AuditEvent {
  eventType: AuditEventType;
  timestamp: Date;
  actorUsername?: string | null;
  actorType?: 'user' | 'machine' | null;
  sourceIpAddress?: string | null;
  httpVerb?: string | null;
  httpUrl?: string | null;
  statusCode?: number | null;
  oidcIssuer?: string | null;
  details?: string | null;
}

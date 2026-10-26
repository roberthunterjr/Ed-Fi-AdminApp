import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import * as config from 'config';

const isPgsql = config.DB_ENGINE === 'pgsql';
// The SQL Server migration uses NVARCHAR. A 'varchar' mapping makes TypeORM bind non-Unicode
// parameters, which corrupts text outside the database code page (e.g. usernames, snapshot names).
const stringType = isPgsql ? 'varchar' : 'nvarchar';

/** One audit trail entry. Deliberately has no relations so entries outlive the rows they describe. */
@Entity({ name: 'audit_log' })
export class AuditLog {
  // bigint comes back from the driver as a string.
  // 'increment' (not 'identity') makes TypeORM leave the column out of INSERTs; with 'identity'
  // it sends DEFAULT, which SQL Server rejects for an identity column. The migrations own the DDL.
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: stringType, length: 30 })
  eventType: string;

  @Index('IDX_audit_log_timestamp')
  // An absolute instant with its offset on both engines, so it never depends on the host time zone
  @Column({ type: isPgsql ? 'timestamptz' : 'datetimeoffset' })
  timestamp: Date;

  @Index('IDX_audit_log_actorUsername')
  @Column({ type: stringType, length: 256, nullable: true })
  actorUsername: string | null;

  @Column({ type: stringType, length: 20, nullable: true })
  actorType: 'user' | 'machine' | null;

  @Column({ type: stringType, length: 45, nullable: true })
  sourceIpAddress: string | null;

  @Column({ type: stringType, length: 10, nullable: true })
  httpVerb: string | null;

  @Column({ type: stringType, length: 2048, nullable: true })
  httpUrl: string | null;

  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ type: stringType, length: 512, nullable: true })
  oidcIssuer: string | null;

  @Column(
    isPgsql
      ? { type: 'text', nullable: true }
      : { type: 'nvarchar', length: 'MAX', nullable: true },
  )
  details: string | null;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CatalogVersion } from './cert-catalog-version.entity';
import { EdfiTenant } from './edfi-tenant.entity';
import { Ods } from './ods.entity';

/**
 * One certification attempt per (tenant, ODS, catalog version); the catalog version fixes the SIS version.
 * The two partial unique indexes are created by migration 1792000000000; they are declared here with
 * synchronize disabled only so `migrations:generate` doesn't emit a DROP INDEX for them.
 */
@Index('UQ_cert_certification_process_ods', { synchronize: false })
@Index('UQ_cert_certification_process_no_ods', { synchronize: false })
@Entity({ schema: 'cert', name: 'certification_process' })
export class CertificationProcess {
  @PrimaryGeneratedColumn()
  certificationProcessId: number;

  @ManyToOne('EdfiTenant', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'edfiTenantId' })
  edfiTenant: EdfiTenant;

  @Column()
  edfiTenantId: number;

  // The DB constraint is CASCADE on pgsql and NO ACTION on mssql (see CertificationStepRuns1792000000000).
  @ManyToOne('Ods', { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'odsId' })
  ods: Ods | null;

  @Column({ type: 'int', nullable: true })
  odsId: number | null;

  @ManyToOne(() => CatalogVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'catalogVersionId' })
  catalogVersion: CatalogVersion;

  @Column()
  catalogVersionId: number;

  @Column({ type: 'varchar', length: 50 })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

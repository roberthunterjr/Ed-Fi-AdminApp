import * as config from 'config';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CertificationProcess } from './cert-certification-process.entity';
import { ScenarioCatalog } from './cert-scenario-catalog.entity';

@Entity({ schema: 'cert', name: 'certification_process_scenario' })
export class CertificationProcessScenario {
  @PrimaryColumn()
  certificationProcessId: number;

  @PrimaryColumn()
  scenarioId: number;

  @ManyToOne(() => CertificationProcess, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'certificationProcessId' })
  certificationProcess: CertificationProcess;

  @ManyToOne(() => ScenarioCatalog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scenarioId' })
  scenario: ScenarioCatalog;

  @Column({ type: 'varchar', length: 50 })
  status: string;

  /**
   * Bruno runtime variables captured by this scenario's steps, restored into its next run.
   * Stored as plaintext on purpose (AC-466 D4): certification ODSs hold synthetic data.
   */
  @Column({ type: config.DB_ENGINE === 'pgsql' ? 'jsonb' : 'simple-json', nullable: true })
  capturedVars: Record<string, string | number | boolean | null> | null;

  @UpdateDateColumn()
  updatedAt: Date;
}

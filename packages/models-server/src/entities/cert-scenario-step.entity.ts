import { CertStepSnapshotEnvelope } from '@edanalytics/models';
import * as config from 'config';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CertificationProcess } from './cert-certification-process.entity';
import { ScenarioCatalog } from './cert-scenario-catalog.entity';
import { StepCatalog } from './cert-step-catalog.entity';
import { encryptedJsonTransformer } from '../utils/encrypted-json.transformer';

/** The latest result of one step in one process; a re-run updates this row. */
@Entity({ schema: 'cert', name: 'scenario_step' })
@Unique('UQ_cert_scenario_step_process_step', ['certificationProcessId', 'stepId'])
export class ScenarioStep {
  @PrimaryGeneratedColumn()
  stepRunId: number;

  @ManyToOne(() => CertificationProcess, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'certificationProcessId' })
  certificationProcess: CertificationProcess;

  @Column()
  certificationProcessId: number;

  @ManyToOne(() => ScenarioCatalog, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'scenarioId' })
  scenario: ScenarioCatalog;

  @Column()
  scenarioId: number;

  @ManyToOne(() => StepCatalog, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stepId' })
  step: StepCatalog;

  @Column()
  stepId: number;

  @Column({ type: 'varchar', length: 50 })
  status: string;

  /** The values the user entered, kept so the page can prefill a re-run. */
  @Column({ type: config.DB_ENGINE === 'pgsql' ? 'jsonb' : 'simple-json', nullable: true })
  inputs: Record<string, string> | null;

  @Column()
  runAt: Date;

  /** HTTP status of the Ed-Fi API response; null when the request was never sent. */
  @Column({ type: 'int', nullable: true })
  responseStatus: number | null;

  /** Encrypted response snapshot, read only by the snapshot endpoint. Cleared when the request is decided (AC-660). */
  @Column({ type: 'text', nullable: true, select: false, transformer: encryptedJsonTransformer })
  responseSnapshot: CertStepSnapshotEnvelope | null;
}

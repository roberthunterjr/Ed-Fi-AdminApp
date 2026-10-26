import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ScenarioStep } from './cert-scenario-step.entity';

@Entity({ schema: 'cert', name: 'scenario_step_error' })
export class ScenarioStepError {
  @PrimaryGeneratedColumn()
  errorId: number;

  @ManyToOne(() => ScenarioStep, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stepRunId' })
  stepRun: ScenarioStep;

  @Column()
  stepRunId: number;

  /** A CERT_STEP_ERROR_KIND value; plain text so new kinds need no migration. */
  @Column({ type: 'varchar', length: 50 })
  kind: string;

  /** The field that didn't match, e.g. `birthCity`; null for an exception. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  field: string | null;

  @Column({ type: 'text', nullable: true })
  expected: string | null;

  /** For an exception, what the API returned (e.g. "The API returned HTTP 404 Not Found."). */
  @Column({ type: 'text', nullable: true })
  observed: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;
}

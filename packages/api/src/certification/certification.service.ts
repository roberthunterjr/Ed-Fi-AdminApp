import {
  CERT_PROCESS_STATUS,
  CERT_SCENARIO_STATUS,
  CERT_STEP_STATUS,
  CertificationStepRunDto,
  CertScenarioStatus,
  isSupportedSisVersion,
} from '@edanalytics/models';
import {
  CertificationProcess,
  CertificationProcessScenario,
  EdfiTenant,
  SbEnvironment,
  ScenarioStep,
  ScenarioStepError,
  StepCatalog,
} from '@edanalytics/models-server';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import config from 'config';
import fs from 'fs';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ValidationHttpException } from '../utils';
import { ArtifactService } from './artifact/artifact.service';
import { CertificationTarget, CertificationTargetService } from './certification-target.service';
import { RunLimiter } from './run-limiter';
import { buildBrunoArgs, runBrunoCli } from './runner/bruno-cli';
import {
  cleanMessage,
  incompleteRunReport,
  ParsedBrunoReport,
  parseBrunoReport,
  readBrunoReport,
} from './runner/bruno-report';
import { sanitizeCapturedVars } from './runner/captured-vars';
import { createRunWorkspace, readStepInputNames } from './runner/run-workspace';
import { validateStepInputs } from './runner/step-inputs';

export const CERT_RUN_MESSAGES = {
  runtimeNotReady:
    "Certification isn't available yet because its test scenarios are still loading. Try again in a minute.",
  unsupportedVersion: "This SIS version isn't supported yet. Supported: v5.",
  busyScenario: 'Another step of this scenario is running. Wait for it to finish, then try again.',
  atCapacity: 'Too many certification steps are running right now. Try again in a minute.',
};

export interface RunStepParams {
  sbEnvironment: SbEnvironment;
  edfiTenant: EdfiTenant;
  sisVersion: string;
  stepId: number;
  odsId?: number | null;
  token: string;
  inputs: Record<string, string>;
}

/** A scenario passes when all its enabled steps pass; any failed step fails it. */
export const deriveScenarioStatus = (
  enabledStepIds: number[],
  runs: { stepId: number; status: string }[],
): CertScenarioStatus => {
  if (runs.some((run) => run.status === CERT_STEP_STATUS.failed))
    return CERT_SCENARIO_STATUS.failed;
  const passed = new Set(
    runs.filter((run) => run.status === CERT_STEP_STATUS.success).map((run) => run.stepId),
  );
  return enabledStepIds.every((stepId) => passed.has(stepId))
    ? CERT_SCENARIO_STATUS.completed
    : CERT_SCENARIO_STATUS.inprogress;
};

/** A finite number above zero, else the fallback, so a bad config value can't disable a cap or timeout. */
export const positiveNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isSslVerificationDisabled = () =>
  config.SSL_VERIFICATION === false || config.SSL_VERIFICATION === 'false';

/** Key names only, never values, so logs can't leak captured data. */
const describeKeys = (value: unknown): string =>
  value !== null && typeof value === 'object'
    ? Object.keys(value).slice(0, 50).join(', ') || 'none'
    : 'none';

/** [sisVersion, area, scenario, fileName], straight from the catalog. */
const stepSegments = (step: StepCatalog): string[] => [
  step.scenario.area.catalogVersion.dataStandardVersion,
  step.scenario.area.name,
  step.scenario.name,
  step.fileName,
];

@Injectable()
export class CertificationService {
  private readonly logger = new Logger(CertificationService.name);
  private readonly runLimiter = new RunLimiter(
    positiveNumber(config.CERT_BRUNO_MAX_CONCURRENT_RUNS, 2),
  );

  constructor(
    private readonly artifactService: ArtifactService,
    private readonly targetService: CertificationTargetService,
    @InjectRepository(StepCatalog)
    private readonly stepRepository: Repository<StepCatalog>,
    @InjectRepository(CertificationProcess)
    private readonly processRepository: Repository<CertificationProcess>,
    @InjectRepository(CertificationProcessScenario)
    private readonly processScenarioRepository: Repository<CertificationProcessScenario>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Runs one catalog step with the artifact's Bruno CLI against the tenant's ODS/API (AC-466)
   * and saves the result. The token is used only for this run and is never stored or logged.
   */
  async runStep(params: RunStepParams): Promise<CertificationStepRunDto> {
    if (!this.artifactService.isRunTimeReady || !fs.existsSync(this.artifactService.brunoCliPath)) {
      throw new ServiceUnavailableException(CERT_RUN_MESSAGES.runtimeNotReady);
    }
    if (!isSupportedSisVersion(params.sisVersion)) {
      throw new ValidationHttpException(CERT_RUN_MESSAGES.unsupportedVersion);
    }

    const step = await this.findRunnableStep(params.stepId, params.sisVersion);
    // The step file is what runs, so it decides which inputs are expected (not the synced catalog rows).
    const inputNames = await readStepInputNames(this.artifactService.sisRoot, stepSegments(step));
    const inputErrors = validateStepInputs(inputNames, params.inputs);
    if (inputErrors.length > 0) {
      throw new ValidationHttpException(...inputErrors);
    }

    // null (from a JSON body) means "not chosen", the same as omitted.
    const odsId = params.odsId ?? null;
    const target = await this.targetService.resolve({
      sbEnvironment: params.sbEnvironment,
      edfiTenant: params.edfiTenant,
      odsId,
    });
    const certificationProcess = await this.findOrCreateProcess(
      params.edfiTenant.id,
      odsId,
      step.scenario.area.catalogVersionId,
    );

    const slot = this.runLimiter.tryAcquire(
      `${certificationProcess.certificationProcessId}:${step.scenarioId}`,
    );
    if (slot === 'busy-key') throw new ConflictException(CERT_RUN_MESSAGES.busyScenario);
    if (slot === 'at-capacity') throw new ServiceUnavailableException(CERT_RUN_MESSAGES.atCapacity);
    try {
      const parsed = await this.execute(step, certificationProcess, target, params);
      return await this.saveResult(step, certificationProcess, params.inputs, parsed);
    } finally {
      slot.release();
    }
  }

  /** The catalog is the allowlist: only enabled steps of the active catalog for this version and artifact run. */
  private async findRunnableStep(stepId: number, sisVersion: string): Promise<StepCatalog> {
    const step = await this.stepRepository.findOne({
      where: { stepId },
      relations: { scenario: { area: { catalogVersion: true } } },
    });
    if (!step) throw new NotFoundException();
    const { scenario } = step;
    const { area } = scenario;
    const { catalogVersion } = area;
    const runnable =
      step.isEnabled &&
      scenario.isEnabled &&
      area.isEnabled &&
      catalogVersion.isActive &&
      catalogVersion.dataStandardVersion === sisVersion &&
      catalogVersion.artifactVersion === this.artifactService.currentRef;
    if (!runnable) throw new NotFoundException();
    return step;
  }

  private async findOrCreateProcess(
    edfiTenantId: number,
    odsId: number | null,
    catalogVersionId: number,
  ): Promise<CertificationProcess> {
    const where = { edfiTenantId, odsId: odsId ?? IsNull(), catalogVersionId };
    const existing = await this.processRepository.findOne({ where });
    if (existing) return existing;
    try {
      return await this.processRepository.save(
        this.processRepository.create({
          edfiTenantId,
          odsId,
          catalogVersionId,
          status: CERT_PROCESS_STATUS.inprogress,
        }),
      );
    } catch (error) {
      // Two first runs can race; the unique index lets only one insert win.
      const created = await this.processRepository.findOne({ where });
      if (created) return created;
      throw error;
    }
  }

  private async execute(
    step: StepCatalog,
    certificationProcess: CertificationProcess,
    target: CertificationTarget,
    { token, inputs }: RunStepParams,
  ): Promise<ParsedBrunoReport> {
    const scenarioRow = await this.processScenarioRepository.findOne({
      where: {
        certificationProcessId: certificationProcess.certificationProcessId,
        scenarioId: step.scenarioId,
      },
    });
    const storedVars = scenarioRow?.capturedVars ?? null;
    const restoredVars = sanitizeCapturedVars(storedVars ?? {}) ?? {};
    if (storedVars && sanitizeCapturedVars(storedVars) === null) {
      this.logger.warn(
        `Certification step ${step.stepId}: stored captured values were invalid and were ignored (keys: ${describeKeys(
          storedVars,
        )})`,
      );
    }
    const timeoutMs = positiveNumber(config.CERT_BRUNO_RUN_TIMEOUT_MS, 45000);
    const startedAt = Date.now();
    const workspace = await createRunWorkspace({
      sisRoot: this.artifactService.sisRoot,
      stepSegments: stepSegments(step),
      inputs,
      resourceBaseUrl: target.resourceBaseUrl,
      oauthUrl: target.oauthUrl,
      tokenExpiresAt: Math.floor((startedAt + timeoutMs) / 1000) + 60,
      restoredVars,
    });

    try {
      const cli = await runBrunoCli({
        cliPath: this.artifactService.brunoCliPath,
        cwd: workspace.dir,
        args: buildBrunoArgs({
          stepPath: workspace.stepPath,
          insecure: isSslVerificationDisabled(),
        }),
        token,
        timeoutMs,
      });
      const parsed = cli.timedOut
        ? incompleteRunReport()
        : parseBrunoReport(await readBrunoReport(workspace.reportPath), {
            stepPath: workspace.stepPath,
            token,
          });
      this.logger.log(
        `Certification step ${step.stepId} finished: exit=${cli.exitCode} timedOut=${cli.timedOut} ` +
          `complete=${parsed.complete} passed=${parsed.passed} ms=${Date.now() - startedAt}`,
      );
      if (parsed.capturedVarsRejectedKeys) {
        this.logger.warn(
          `Certification step ${step.stepId}: captured values failed validation and were not stored ` +
            `(keys: ${parsed.capturedVarsRejectedKeys.join(', ') || 'none'})`,
        );
      }
      if (!parsed.complete && cli.stderrTail) {
        this.logger.warn(
          `Certification step ${step.stepId} stderr: ${cleanMessage(cli.stderrTail, token)}`,
        );
      }
      return parsed;
    } finally {
      await workspace
        .dispose()
        .catch(() =>
          this.logger.warn(`Certification step ${step.stepId}: temporary workspace cleanup failed`),
        );
    }
  }

  /** One transaction: replace the step's row and errors, then update the scenario. */
  private saveResult(
    step: StepCatalog,
    certificationProcess: CertificationProcess,
    inputs: Record<string, string>,
    parsed: ParsedBrunoReport,
  ): Promise<CertificationStepRunDto> {
    const { certificationProcessId } = certificationProcess;
    const { stepId, scenarioId } = step;
    const ranAt = new Date();
    const status = parsed.passed ? CERT_STEP_STATUS.success : CERT_STEP_STATUS.failed;

    return this.dataSource.transaction(async (em) => {
      const stepRuns = em.getRepository(ScenarioStep);
      const existing = await stepRuns.findOne({ where: { certificationProcessId, stepId } });
      const stepRun = await stepRuns.save(
        Object.assign(existing ?? stepRuns.create({ certificationProcessId, scenarioId, stepId }), {
          status,
          inputs,
          runAt: ranAt,
          // Always written, so a re-run that sent nothing never keeps a stale status or snapshot.
          responseStatus: parsed.responseStatus,
          responseSnapshot: parsed.responseSnapshot,
        }),
      );

      const errors = em.getRepository(ScenarioStepError);
      await errors.delete({ stepRunId: stepRun.stepRunId });
      if (parsed.errors.length > 0) {
        await errors.save(
          parsed.errors.map((error) => ({ stepRunId: stepRun.stepRunId, ...error })),
        );
      }

      const enabledStepIds = (
        await em.getRepository(StepCatalog).find({ where: { scenarioId, isEnabled: true } })
      ).map((catalogStep) => catalogStep.stepId);
      const runs = await stepRuns.find({ where: { certificationProcessId, scenarioId } });
      const scenarioStatus = deriveScenarioStatus(enabledStepIds, runs);

      const scenarios = em.getRepository(CertificationProcessScenario);
      const scenarioRow =
        (await scenarios.findOne({ where: { certificationProcessId, scenarioId } })) ??
        scenarios.create({ certificationProcessId, scenarioId, capturedVars: null });
      scenarioRow.status = scenarioStatus;
      if (parsed.complete && parsed.capturedVars) {
        scenarioRow.capturedVars = parsed.capturedVars;
      }
      await scenarios.save(scenarioRow);
      await em
        .getRepository(CertificationProcess)
        .update({ certificationProcessId }, { updatedAt: ranAt });

      return {
        stepId,
        status,
        ranAt: ranAt.toISOString(),
        scenarioStatus,
        responseStatus: parsed.responseStatus,
        errors: parsed.errors,
      };
    });
  }
}

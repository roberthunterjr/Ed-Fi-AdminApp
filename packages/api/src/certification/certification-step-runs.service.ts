import {
  CertificationScenarioStatusDto,
  CERT_SNAPSHOT_STATE,
  CertificationStepRunsDto,
  CertificationStepSnapshotDto,
  CertStepErrorKind,
  isSupportedSisVersion,
  toCertificationScenarioStatusDto,
  toCertificationStepRunsDto,
  toCertificationStepSnapshotDto,
} from '@edanalytics/models';
import {
  CatalogVersion,
  CertificationProcess,
  CertificationProcessScenario,
  ScenarioCatalog,
  ScenarioStep,
  ScenarioStepError,
} from '@edanalytics/models-server';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ValidationHttpException } from '../utils';
import { ArtifactService } from './artifact/artifact.service';
import { CERT_RUN_MESSAGES, isCurrentCatalogVersion } from './certification.service';

export interface FindStepRunsParams {
  edfiTenantId: number;
  odsId: number | null;
  sisVersion: string;
  scenarioId: number;
}

export interface FindScenarioStatusesParams {
  edfiTenantId: number;
  odsId: number | null;
  sisVersion: string;
}

const EMPTY: CertificationStepRunsDto = { scenarioStatus: null, steps: [] };

/**
 * Reads the saved step results that CertificationService.runStep writes (AC-475).
 * Read-only: it never creates a certification process and never contacts the ODS/API.
 */
@Injectable()
export class CertificationStepRunsService {
  private readonly logger = new Logger(CertificationStepRunsService.name);

  constructor(
    @InjectRepository(ScenarioCatalog)
    private readonly scenarioRepository: Repository<ScenarioCatalog>,
    @InjectRepository(CertificationProcess)
    private readonly processRepository: Repository<CertificationProcess>,
    @InjectRepository(CertificationProcessScenario)
    private readonly processScenarioRepository: Repository<CertificationProcessScenario>,
    @InjectRepository(ScenarioStep)
    private readonly stepRunRepository: Repository<ScenarioStep>,
    @InjectRepository(ScenarioStepError)
    private readonly stepErrorRepository: Repository<ScenarioStepError>,
    @InjectRepository(CatalogVersion)
    private readonly catalogVersionRepository: Repository<CatalogVersion>,
    private readonly artifactService: ArtifactService,
  ) {}

  async findStepRuns(params: FindStepRunsParams): Promise<CertificationStepRunsDto> {
    if (!isSupportedSisVersion(params.sisVersion)) {
      throw new ValidationHttpException(CERT_RUN_MESSAGES.unsupportedVersion);
    }

    // runStep keys the process on step.scenario.area.catalogVersionId; take the same value
    // from the requested scenario so a read always finds the process a run wrote. This is
    // deliberately not isCurrentCatalogVersion: saved results stay readable for the
    // scenario's own catalog version even if it is no longer the configured one.
    const scenario = await this.scenarioRepository.findOne({
      where: { scenarioId: params.scenarioId },
      relations: { area: { catalogVersion: true } },
    });
    if (!scenario || scenario.area.catalogVersion.dataStandardVersion !== params.sisVersion) {
      return EMPTY;
    }

    const certificationProcess = await this.processRepository.findOne({
      where: {
        edfiTenantId: params.edfiTenantId,
        odsId: params.odsId ?? IsNull(),
        catalogVersionId: scenario.area.catalogVersionId,
      },
    });
    if (!certificationProcess) return EMPTY;

    const { certificationProcessId } = certificationProcess;
    const { scenarioId } = params;
    const [stepRuns, scenarioRow] = await Promise.all([
      this.stepRunRepository.find({ where: { certificationProcessId, scenarioId } }),
      this.processScenarioRepository.findOne({ where: { certificationProcessId, scenarioId } }),
    ]);
    const errors =
      stepRuns.length > 0
        ? await this.stepErrorRepository.find({
            where: { stepRunId: In(stepRuns.map((stepRun) => stepRun.stepRunId)) },
            order: { errorId: 'ASC' },
          })
        : [];

    return toCertificationStepRunsDto({
      scenarioStatus: (scenarioRow?.status ?? null) as CertificationStepRunsDto['scenarioStatus'],
      steps: stepRuns.map((stepRun) => ({
        stepId: stepRun.stepId,
        status: stepRun.status as CertificationStepRunsDto['steps'][number]['status'],
        ranAt: stepRun.runAt.toISOString(),
        inputs: stepRun.inputs,
        responseStatus: stepRun.responseStatus ?? null,
        errors: errors
          .filter((error) => error.stepRunId === stepRun.stepRunId)
          .map((error) => ({
            kind: error.kind as CertStepErrorKind,
            field: error.field,
            expected: error.expected,
            observed: error.observed,
            message: error.message,
          })),
      })),
    });
  }

  /**
   * Every scenario's saved status for the current catalog version, read-only: it never
   * creates a certification process. Scenarios without a saved row are left out.
   */
  async findScenarioStatuses(
    params: FindScenarioStatusesParams,
  ): Promise<CertificationScenarioStatusDto[]> {
    if (!isSupportedSisVersion(params.sisVersion)) {
      throw new ValidationHttpException(CERT_RUN_MESSAGES.unsupportedVersion);
    }

    const catalogVersions = await this.catalogVersionRepository.find({
      where: { dataStandardVersion: params.sisVersion, isActive: true },
    });
    const catalogVersion = catalogVersions.find((version) =>
      isCurrentCatalogVersion(version, params.sisVersion, this.artifactService.currentRef),
    );
    if (!catalogVersion) {
      // An empty list reads as "no runs" to the caller, so make this case diagnosable.
      this.logger.warn(
        `No current catalog version for ${params.sisVersion}: configured artifact ref is ${
          this.artifactService.currentRef ?? 'not set'
        }; active versions: ${
          catalogVersions.map((version) => version.artifactVersion).join(', ') || 'none'
        }.`,
      );
      return [];
    }

    const certificationProcess = await this.processRepository.findOne({
      where: {
        edfiTenantId: params.edfiTenantId,
        odsId: params.odsId ?? IsNull(),
        catalogVersionId: catalogVersion.catalogVersionId,
      },
    });
    if (!certificationProcess) return [];

    const rows = await this.processScenarioRepository.find({
      where: { certificationProcessId: certificationProcess.certificationProcessId },
    });

    return toCertificationScenarioStatusDto(
      rows.map((row) => ({
        scenarioId: row.scenarioId,
        status: row.status as CertificationScenarioStatusDto['status'],
      })),
    );
  }

  /**
   * The decrypted response snapshot of one step's latest run (AC-690). A run that received a
   * response but has no snapshot had it cleared when the request was decided (AC-660).
   */
  async findStepSnapshot(
    params: Omit<FindStepRunsParams, 'scenarioId'> & { stepId: number },
  ): Promise<CertificationStepSnapshotDto> {
    if (!isSupportedSisVersion(params.sisVersion)) {
      throw new ValidationHttpException(CERT_RUN_MESSAGES.unsupportedVersion);
    }
    const stepRun = await this.stepRunRepository.findOne({
      where: {
        stepId: params.stepId,
        certificationProcess: {
          edfiTenantId: params.edfiTenantId,
          odsId: params.odsId ?? IsNull(),
        },
      },
      select: { stepRunId: true, responseStatus: true, responseSnapshot: true },
    });
    if (!stepRun) throw new NotFoundException();

    const snapshot = stepRun.responseSnapshot;
    if (snapshot) return toCertificationStepSnapshotDto(snapshot);
    return toCertificationStepSnapshotDto({
      state:
        stepRun.responseStatus === null ? CERT_SNAPSHOT_STATE.none : CERT_SNAPSHOT_STATE.deleted,
    });
  }
}

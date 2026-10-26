import { Expose, Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Matches } from 'class-validator';
import { makeSerializer } from '../utils/make-serializer';

/** SIS data standard versions Admin App can certify. Add one only after its scenarios are tested. */
export const SUPPORTED_SIS_VERSIONS = ['v5'] as const;
export type SisVersion = (typeof SUPPORTED_SIS_VERSIONS)[number];
export const isSupportedSisVersion = (version: string): version is SisVersion =>
  (SUPPORTED_SIS_VERSIONS as readonly string[]).includes(version);

export const CERT_STEP_STATUS = { success: 'success', failed: 'failed' } as const;
export type CertStepStatus = (typeof CERT_STEP_STATUS)[keyof typeof CERT_STEP_STATUS];

export const CERT_SCENARIO_STATUS = {
  inprogress: 'inprogress',
  failed: 'failed',
  completed: 'completed',
} as const;
export type CertScenarioStatus = (typeof CERT_SCENARIO_STATUS)[keyof typeof CERT_SCENARIO_STATUS];

/** What kind of problem a step error describes. Stored as plain text, so new kinds need no migration. */
export const CERT_STEP_ERROR_KIND = {
  /** The step stopped: a script threw, the request couldn't be sent, or the run didn't finish. Supersedes assertions. */
  exception: 'exception',
  /** A field didn't match what the step expects; one row per field. */
  assertion: 'assertion',
} as const;
export type CertStepErrorKind = (typeof CERT_STEP_ERROR_KIND)[keyof typeof CERT_STEP_ERROR_KIND];

/** A larger response body is never trimmed: the snapshot keeps only its size. */
export const CERT_SNAPSHOT_MAX_BYTES = 65536;

/** What a step result stores (encrypted) about the Ed-Fi API response. */
export type CertStepSnapshotEnvelope =
  { state: 'body'; body: string } | { state: 'tooLarge'; sizeBytes: number };

/** `none`: the request was never sent. `deleted`: the snapshot was cleared when the request was decided. */
export const CERT_SNAPSHOT_STATE = {
  body: 'body',
  tooLarge: 'tooLarge',
  none: 'none',
  deleted: 'deleted',
} as const;
export type CertSnapshotState = (typeof CERT_SNAPSHOT_STATE)[keyof typeof CERT_SNAPSHOT_STATE];

/** Moving a process past `inprogress` (e.g. Ready for Review) belongs to AC-659. */
export const CERT_PROCESS_STATUS = { inprogress: 'inprogress' } as const;

/**
 * Body of POST .../certification/sis/:sisVersion/steps/:stepId/run.
 * The token is never persisted or logged. Input keys and values are checked
 * against the step's catalog parameters in the service.
 */
export class PostCertificationStepRunDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  odsId?: number;

  @Expose()
  @IsString()
  @Matches(/^[\x21-\x7E]{1,4096}$/, { message: 'token must be 1-4096 visible ASCII characters' })
  token: string;

  @Expose()
  @IsObject()
  inputs: Record<string, string>;
}

export class CertificationStepRunErrorDto {
  @Expose()
  kind: CertStepErrorKind;

  /** The field that didn't match, e.g. `birthCity`; null for an exception. */
  @Expose()
  field: string | null;

  @Expose()
  expected: string | null;

  /** For an exception, what the API returned (e.g. "The API returned HTTP 404 Not Found."). */
  @Expose()
  observed: string | null;

  @Expose()
  message: string | null;
}

export class CertificationStepRunDto {
  @Expose()
  stepId: number;

  @Expose()
  status: CertStepStatus;

  /** ISO 8601 instant the step ran. */
  @Expose()
  ranAt: string;

  @Expose()
  scenarioStatus: CertScenarioStatus;

  /** HTTP status of the Ed-Fi API response; null when the request was never sent. */
  @Expose()
  responseStatus: number | null;

  @Expose()
  @Type(() => CertificationStepRunErrorDto)
  errors: CertificationStepRunErrorDto[];
}

export const toCertificationStepRunDto = makeSerializer<
  CertificationStepRunDto,
  CertificationStepRunDto
>(CertificationStepRunDto);

/** The last saved result of one step, as read back by GET .../step-runs (AC-475). */
export class CertificationSavedStepRunDto {
  @Expose()
  stepId: number;

  @Expose()
  status: CertStepStatus;

  /** ISO 8601 instant the step ran. */
  @Expose()
  ranAt: string;

  /** The values the vendor typed, keyed by parameter name; used to prefill a re-run. */
  @Expose()
  inputs: Record<string, string> | null;

  /** HTTP status of the Ed-Fi API response; null when the request was never sent. */
  @Expose()
  responseStatus: number | null;

  @Expose()
  @Type(() => CertificationStepRunErrorDto)
  errors: CertificationStepRunErrorDto[];
}

/** Saved results of one scenario's steps; steps that never ran are left out. */
export class CertificationStepRunsDto {
  @Expose()
  scenarioStatus: CertScenarioStatus | null;

  @Expose()
  @Type(() => CertificationSavedStepRunDto)
  steps: CertificationSavedStepRunDto[];
}

export const toCertificationStepRunsDto = makeSerializer<
  CertificationStepRunsDto,
  CertificationStepRunsDto
>(CertificationStepRunsDto);

/** GET .../step-runs/:stepId/snapshot: the step's decrypted response snapshot (AC-690). */
export class CertificationStepSnapshotDto {
  @Expose()
  state: CertSnapshotState;

  /** Formatted JSON (or the raw text when the body isn't JSON); only for `body`. */
  @Expose()
  body?: string;

  /** Only for `tooLarge`. */
  @Expose()
  sizeBytes?: number;
}

export const toCertificationStepSnapshotDto = makeSerializer<
  CertificationStepSnapshotDto,
  CertificationStepSnapshotDto
>(CertificationStepSnapshotDto);

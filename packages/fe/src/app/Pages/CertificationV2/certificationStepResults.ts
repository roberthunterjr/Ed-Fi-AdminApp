import {
  CERT_SCENARIO_STATUS,
  CertificationStepParameterDto,
  CertScenarioStatus,
  CertStepStatus,
} from '@edanalytics/models';
import { isUserInputParameter } from './certificationCatalog';

export type StatusDisplay = { label: string; textColor: string; dotColor: string };

export type StepDisplayStatus = 'notExecuted' | 'running' | 'success' | 'failed';

/**
 * The one place a step status gets its label and colours. New states (such as
 * "Environment unreachable" in AC-654) are added here only.
 */
export const STEP_STATUS_DISPLAY: Record<StepDisplayStatus, StatusDisplay> = {
  notExecuted: { label: 'Not executed', textColor: 'gray.600', dotColor: 'gray.400' },
  running: { label: 'Running', textColor: 'blue.600', dotColor: 'blue.500' },
  success: { label: 'Successful', textColor: 'green.700', dotColor: 'green.500' },
  failed: { label: 'Failed', textColor: 'red.600', dotColor: 'red.500' },
};

/** An unknown saved status shows as failed: it must never look like a pass. */
export const toDisplayStatus = (
  saved: CertStepStatus | undefined,
  isRunning: boolean,
): StepDisplayStatus => {
  if (isRunning) return 'running';
  if (saved === undefined) return 'notExecuted';
  return saved === 'success' ? 'success' : 'failed';
};

export type ScenarioDisplayStatus = Exclude<StepDisplayStatus, 'running'> | 'inProgress';

/**
 * Same labels/colours as `STEP_STATUS_DISPLAY`, plus the scenario-only "in progress" state.
 * Purple, not orange: orange reads as a warning or a run that is happening now.
 */
export const SCENARIO_STATUS_DISPLAY: Record<ScenarioDisplayStatus, StatusDisplay> = {
  notExecuted: STEP_STATUS_DISPLAY.notExecuted,
  success: STEP_STATUS_DISPLAY.success,
  failed: STEP_STATUS_DISPLAY.failed,
  inProgress: { label: 'In progress', textColor: 'purple.700', dotColor: 'purple.500' },
};

// Exhaustive on purpose: a status added to or renamed in models fails the build here.
const SCENARIO_STATUS_TO_DISPLAY: Record<CertScenarioStatus, ScenarioDisplayStatus> = {
  [CERT_SCENARIO_STATUS.completed]: 'success',
  [CERT_SCENARIO_STATUS.inprogress]: 'inProgress',
  [CERT_SCENARIO_STATUS.failed]: 'failed',
};

/** An unknown saved status shows as failed: it must never look like a pass. */
export const toScenarioDisplayStatus = (
  saved: CertScenarioStatus | undefined,
): ScenarioDisplayStatus => {
  if (saved === undefined) return 'notExecuted';
  // hasOwn, so a value such as "constructor" can't resolve to an inherited member.
  return Object.hasOwn(SCENARIO_STATUS_TO_DISPLAY, saved)
    ? SCENARIO_STATUS_TO_DISPLAY[saved]
    : 'failed';
};

const REASON_PHRASES: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/** `HTTP 404 Not Found`; the number alone when the reason phrase isn't one we know. */
export const httpStatusLabel = (status: number): string =>
  REASON_PHRASES[status] ? `HTTP ${status} ${REASON_PHRASES[status]}` : `HTTP ${status}`;

/**
 * The colour of the API response badge. A passing step met the status it expects (a "was
 * Deleted" step checks for 404), so it's green whatever the code; otherwise the code decides.
 */
export const httpStatusColorScheme = (
  status: number,
  stepStatus: CertStepStatus,
): 'green' | 'orange' | 'red' => {
  if (stepStatus === 'success' || (status >= 200 && status < 300)) return 'green';
  return status >= 300 && status < 400 ? 'orange' : 'red';
};

/** The run API's `inputs`: typed values of `input` parameters, keyed by parameter name. */
export const toRunInputs = (
  parameters: CertificationStepParameterDto[],
  valuesById: Record<string, string>,
): Record<string, string> =>
  Object.fromEntries(
    parameters
      .filter(isUserInputParameter)
      .map((parameter) => [parameter.name, (valuesById[parameter.parameterId] ?? '').trim()]),
  );

/** Field values keyed by parameter ID, prefilled from a saved run's inputs (keyed by name). */
export const toParameterValues = (
  parameters: CertificationStepParameterDto[],
  savedInputs: Record<string, string> | null | undefined,
): Record<string, string> =>
  Object.fromEntries(
    parameters
      .filter(isUserInputParameter)
      .map((parameter) => [String(parameter.parameterId), savedInputs?.[parameter.name] ?? '']),
  );

export const STEP_NOT_FOUND_MESSAGE =
  'This step is no longer in the active certification catalog. The list has been reloaded.';

export type RunErrorKind =
  { kind: 'api'; message: string; notFound: boolean } | { kind: 'unknown' };

/**
 * The API client throws only the response body, so the API's own errors are told apart by
 * their shape. Anything else (a proxy's HTML page, a dropped connection) is unknown: the run
 * may still have finished and been saved.
 */
export const classifyRunError = (error: unknown): RunErrorKind => {
  if (typeof error !== 'object' || error === null) return { kind: 'unknown' };
  const body = error as {
    data?: { errors?: Record<string, { message?: string }> };
    statusCode?: unknown;
    message?: unknown;
  };

  const validationMessage =
    body.data?.errors && Object.values(body.data.errors).find((e) => e?.message)?.message;
  if (validationMessage) return { kind: 'api', message: validationMessage, notFound: false };

  if (typeof body.statusCode === 'number') {
    if (body.statusCode === 404) {
      return { kind: 'api', message: STEP_NOT_FOUND_MESSAGE, notFound: true };
    }
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    if (typeof message === 'string' && message) {
      return { kind: 'api', message, notFound: false };
    }
  }
  return { kind: 'unknown' };
};

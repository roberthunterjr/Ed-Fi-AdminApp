import {
  CERT_STEP_ERROR_KIND,
  CertStepErrorKind,
  CertStepSnapshotEnvelope,
} from '@edanalytics/models';
import * as fs from 'fs';
import { CAPTURE_VARS_FILE, RESTORE_VARS_FILE } from './bridge-requests';
import { CapturedVars, sanitizeCapturedVars } from './captured-vars';
import {
  buildSnapshot,
  evaluatePath,
  expectedPhrase,
  fieldLabel,
  joinExpected,
  observedFromMessage,
  parseEqualityTest,
  redactToken,
  renderObserved,
  whatWeSawLine,
} from './step-result-details';

export interface StepRunError {
  kind: CertStepErrorKind;
  field: string | null;
  expected: string | null;
  observed: string | null;
  message: string | null;
}

export interface ParsedBrunoReport {
  /** False when the run didn't finish, so its results (and captured values) can't be trusted. */
  complete: boolean;
  passed: boolean;
  errors: StepRunError[];
  /** HTTP status of the Ed-Fi API response; null when the request was never sent. */
  responseStatus: number | null;
  /** The response body to store (encrypted); null when there was no response. */
  responseSnapshot: CertStepSnapshotEnvelope | null;
  /** Runtime variables after the step ran; null when unavailable (leave the stored ones alone). */
  capturedVars: CapturedVars | null;
  /** Keys (never values) of a capture body that failed validation, capped; null when nothing was rejected. */
  capturedVarsRejectedKeys: string[] | null;
}

export const INCOMPLETE_RUN_MESSAGE =
  "The step didn't finish. Check that the Ed-Fi API is reachable and try again.";

const MAX_MESSAGE_LENGTH = 1000;
const MAX_DETAIL_LENGTH = 500;
const MAX_REJECTED_KEYS = 50;
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

interface ReportTest {
  description?: string;
  status?: string;
  error?: unknown;
  isScriptError?: boolean;
}

interface ReportAssertion {
  lhsExpr?: string;
  rhsExpr?: string;
  operator?: string;
  rhsOperand?: string;
  status?: string;
  error?: unknown;
}

interface ReportResponse {
  status?: unknown;
  statusText?: unknown;
  data?: unknown;
}

interface ReportResult {
  test?: { filename?: string };
  request?: { data?: unknown };
  response?: ReportResponse;
  error?: unknown;
  status?: string;
  skipped?: boolean;
  assertionResults?: ReportAssertion[];
  testResults?: ReportTest[];
  preRequestTestResults?: ReportTest[];
  postResponseTestResults?: ReportTest[];
}

/** Strips ANSI codes, redacts the token and caps the length before anything is stored. */
export const cleanMessage = (
  message: unknown,
  token: string,
  maxLength = MAX_MESSAGE_LENGTH,
): string => {
  let text = typeof message === 'string' ? message : JSON.stringify(message ?? '');
  text = text.replace(ANSI_PATTERN, '');
  text = redactToken(text, token);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

const exceptionError = (message: string, observed: string | null): StepRunError => ({
  kind: CERT_STEP_ERROR_KIND.exception,
  field: null,
  expected: null,
  observed,
  message,
});

export const incompleteRunReport = (): ParsedBrunoReport => ({
  complete: false,
  passed: false,
  errors: [exceptionError(INCOMPLETE_RUN_MESSAGE, null)],
  responseStatus: null,
  responseSnapshot: null,
  capturedVars: null,
  capturedVarsRejectedKeys: null,
});

const normalizePath = (filename?: string): string => (filename ?? '').split('\\').join('/');

type CapturedVarsReading = Pick<ParsedBrunoReport, 'capturedVars' | 'capturedVarsRejectedKeys'>;

/**
 * Captured values are only trusted when the capture request ran cleanly (like the restore check).
 * A failed capture reports {} and would wipe the stored values, so it returns null instead.
 * A capture holding the bearer token is rejected whole.
 */
const readCapturedVars = (
  capture: ReportResult | undefined,
  token: string,
): CapturedVarsReading => {
  const none: CapturedVarsReading = { capturedVars: null, capturedVarsRejectedKeys: null };
  if (!capture || capture.error || capture.status !== 'skipped') return none;
  const data = capture.request?.data;
  if (typeof data !== 'string') return none;
  try {
    const parsed: unknown = JSON.parse(data);
    const capturedVars = sanitizeCapturedVars(parsed);
    const keys =
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.keys(parsed)
        : [];
    // Captured keys and values are saved, and the token must never be: drop the whole capture if either holds it.
    const holdsToken =
      !!token &&
      (keys.some((key) => key.includes(token)) || JSON.stringify(parsed).includes(token));
    if (capturedVars && !holdsToken) return { capturedVars, capturedVarsRejectedKeys: null };
    return {
      capturedVars: null,
      capturedVarsRejectedKeys: keys
        .slice(0, MAX_REJECTED_KEYS)
        .map((key) => (token && key.includes(token) ? '[REDACTED]' : key)),
    };
  } catch {
    return none;
  }
};

/** Exceptions stop the step, so they supersede its assertions (AC-690). */
const collectExceptions = (step: ReportResult, token: string): StepRunError[] => {
  // statusText comes from the vendor's server: redact and cap it like any stored text.
  const line = whatWeSawLine({ status: undefined, ...step.response });
  const observed = line === null ? null : cleanMessage(line, token, MAX_DETAIL_LENGTH);
  const messages: unknown[] = [];
  if (step.skipped) messages.push('The step was skipped.');
  if (step.error) messages.push(step.error);
  for (const test of [
    ...(step.preRequestTestResults ?? []),
    ...(step.postResponseTestResults ?? []),
  ]) {
    if (test.status !== 'pass' && test.isScriptError) messages.push(test.error);
  }
  for (const test of step.testResults ?? []) {
    if (test.status !== 'pass' && test.isScriptError) messages.push(test.error);
  }
  return messages.map((message) => exceptionError(cleanMessage(message, token), observed));
};

/** One row per failed field, then one per failed `test()` check, in report order. */
const collectAssertions = (step: ReportResult, token: string): StepRunError[] => {
  const response = step.response ?? {};
  const hasBody = 'data' in response;
  const detail = (text: string) => cleanMessage(text, token, MAX_DETAIL_LENGTH);

  const byField = new Map<string, ReportAssertion[]>();
  for (const assertion of step.assertionResults ?? []) {
    if (assertion.status === 'pass') continue;
    const lhsExpr = assertion.lhsExpr ?? '';
    byField.set(lhsExpr, [...(byField.get(lhsExpr) ?? []), assertion]);
  }
  const rows: StepRunError[] = [...byField].map(([lhsExpr, failed]) => {
    const message = cleanMessage(failed[0].error, token);
    const value = hasBody
      ? evaluatePath(lhsExpr, { status: response.status, body: response.data })
      : undefined;
    // Render uncapped, so detail() redacts the token before it caps the text.
    const observed =
      value !== undefined ? renderObserved(value, Infinity) : observedFromMessage(message);
    return {
      kind: CERT_STEP_ERROR_KIND.assertion,
      field: detail(fieldLabel(lhsExpr)),
      expected: detail(
        joinExpected(
          failed.map((assertion) =>
            expectedPhrase(
              assertion.operator ?? '',
              assertion.rhsOperand ?? '',
              assertion.rhsExpr ?? '',
            ),
          ),
        ),
      ),
      observed: observed === null ? null : detail(observed),
      message,
    };
  });

  const tests = [
    ...(step.preRequestTestResults ?? []),
    ...(step.testResults ?? []),
    ...(step.postResponseTestResults ?? []),
  ];
  for (const test of tests) {
    if (test.status === 'pass' || test.isScriptError) continue;
    const message = cleanMessage(test.error, token);
    const equality = parseEqualityTest(message);
    rows.push({
      kind: CERT_STEP_ERROR_KIND.assertion,
      field: detail(test.description ?? ''),
      expected: equality ? detail(equality.expected) : null,
      observed: equality ? detail(equality.observed) : null,
      message,
    });
  }
  return rows;
};

/**
 * Turns Bruno's JSON report into the step's verdict. A request whose own `status` is
 * `pass` can still have failed tests, so the verdict comes from errors, assertions and tests.
 */
export const parseBrunoReport = (
  report: unknown,
  { stepPath, token }: { stepPath: string; token: string },
): ParsedBrunoReport => {
  const iteration = Array.isArray(report) ? report[0] : undefined;
  const results: ReportResult[] = Array.isArray(iteration?.results) ? iteration.results : [];
  const find = (relativePath: string) =>
    results.find((result) => normalizePath(result.test?.filename) === relativePath);

  const restore = find(RESTORE_VARS_FILE);
  const step = find(stepPath);
  // If restore failed, capture would report {} and wipe good values: treat as incomplete.
  if (!step || !restore || restore.error || restore.status !== 'skipped') {
    return incompleteRunReport();
  }

  const exceptions = collectExceptions(step, token);
  const errors = exceptions.length > 0 ? exceptions : collectAssertions(step, token);
  // A request that was never sent reports status 'error' and data null: no status, no snapshot.
  const status = step.response?.status;
  const sent = typeof status === 'number';

  return {
    complete: true,
    passed: errors.length === 0,
    errors,
    responseStatus: sent ? status : null,
    responseSnapshot: sent ? buildSnapshot(step.response?.data, token) : null,
    ...readCapturedVars(find(CAPTURE_VARS_FILE), token),
  };
};

/** Reads report.json; null when Bruno never wrote it or it isn't JSON. */
export const readBrunoReport = async (reportPath: string): Promise<unknown> => {
  try {
    return JSON.parse(await fs.promises.readFile(reportPath, 'utf8'));
  } catch {
    return null;
  }
};

import { CERT_SNAPSHOT_MAX_BYTES, CertStepSnapshotEnvelope } from '@edanalytics/models';

/**
 * Pure helpers that turn Bruno's assertions and the Ed-Fi API response into what a vendor
 * reads: a field name, what was expected, what was observed, and a response snapshot.
 */

const MAX_DETAIL_LENGTH = 500;

const cap = (text: string, maxLength = MAX_DETAIL_LENGTH): string =>
  text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;

/**
 * Replaces the token with [REDACTED] in stored text. The token can hold any visible ASCII, so
 * besides the raw form this also matches its JSON-escaped form (serialized values, snapshots)
 * and the single-quoted form Bruno's assertion messages use.
 */
export const redactToken = (text: string, token: string): string => {
  if (!token) return text;
  const forms = new Set([
    token,
    JSON.stringify(token).slice(1, -1),
    token.replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
  ]);
  let redacted = text;
  for (const form of forms) redacted = redacted.split(form).join('[REDACTED]');
  return redacted;
};

/** `res.body[0].birthCity` → `birthCity`; list queries read their single record at `[0]`. */
export const fieldLabel = (lhsExpr: string): string => {
  if (lhsExpr === 'res.status') return 'HTTP status';
  if (lhsExpr === 'res.body') return 'Response body';
  return lhsExpr.replace(/^res\.body(\[0\])?\.?/, '') || lhsExpr;
};

const PHRASES: Record<string, (operand: string) => string> = {
  isString: () => 'text',
  isNotEmpty: () => 'not empty',
  isDefined: () => 'present',
  isUndefined: () => 'absent',
  isNumber: () => 'a number',
  isBoolean: () => 'true or false',
  isArray: () => 'a list',
  isJson: () => 'a JSON object',
  eq: (operand) => `equal to ${operand}`,
  neq: (operand) => `not equal to ${operand}`,
  gt: (operand) => `greater than ${operand}`,
  gte: (operand) => `${operand} or more`,
  length: (operand) => `length ${operand}`,
};

/** A lowercase phrase for one Bruno assertion operator; unknown operators keep their raw text. */
export const expectedPhrase = (operator: string, rhsOperand: string, rhsExpr: string): string =>
  PHRASES[operator]?.(rhsOperand) ?? rhsExpr;

export const joinExpected = (phrases: string[]): string => {
  const text = phrases.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The walker's result for a value that isn't there. */
export const MISSING: unique symbol = Symbol('missing');

const PATH_PATTERN = /^res\.(status|body)((?:\.[A-Za-z_$][\w$]*|\[\d+\])*)$/;
const SEGMENT_PATTERN = /\.([A-Za-z_$][\w$]*)|\[(\d+)\]/g;

/**
 * Reads `res.status` / `res.body…` from the response without eval. Returns MISSING when a
 * value on the path is absent, and undefined when the expression isn't one it can walk.
 */
export const evaluatePath = (
  lhsExpr: string,
  response: { status: unknown; body: unknown },
): unknown => {
  const match = PATH_PATTERN.exec(lhsExpr);
  if (!match) return undefined;
  let value: unknown = match[1] === 'status' ? response.status : response.body;
  for (const [, name, index] of match[2].matchAll(SEGMENT_PATTERN)) {
    if (value === null || value === undefined) return MISSING;
    const key = name ?? Number(index);
    if (typeof value !== 'object' && typeof value !== 'string') return MISSING;
    // Own properties only: `constructor` or `toString` on a record are not response fields.
    if (!Object.prototype.hasOwnProperty.call(Object(value), key)) return MISSING;
    value = (value as Record<string | number, unknown>)[key];
  }
  return value === undefined ? MISSING : value;
};

/** Bruno evaluates a path under a missing record to a TypeError object. */
const isBrunoTypeError = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as { name?: unknown }).name === 'TypeError';

/** `maxLength` lets a caller redact the full text before capping it (see bruno-report). */
export const renderObserved = (value: unknown, maxLength = MAX_DETAIL_LENGTH): string => {
  if (value === MISSING || value === undefined || isBrunoTypeError(value)) return 'Missing';
  if (value === '') return 'Empty text';
  if (Array.isArray(value) && value.length === 0) return 'Empty list';
  if (value === null) return 'null';
  if (typeof value === 'object' && Object.keys(value).length === 0) return 'Empty object';
  const text = JSON.stringify(value);
  return text === undefined ? 'Missing' : cap(text, maxLength);
};

/** The observed value inside Bruno's own message, e.g. `expected 404 to equal 200` → `404`. */
export const observedFromMessage = (message: string): string | null => {
  if (/^\.empty was passed non-string primitive undefined/.test(message)) return 'Missing';
  const match = /^expected (.+?) (?:not )?to /s.exec(message);
  if (!match) return null;
  const observed = match[1];
  if (observed === 'undefined' || observed.startsWith("{ name: 'TypeError'")) return 'Missing';
  return cap(observed);
};

/** Reads `expectChanged` / `expectUnchanged` failures: `expected A to (not )?equal B`. */
export const parseEqualityTest = (
  message: string,
): { expected: string; observed: string } | null => {
  const match = /^expected (.+?) to (not )?equal (.+)$/s.exec(message);
  if (!match) return null;
  const [, observed, negated, other] = match;
  return {
    expected: cap(`${negated ? 'Different from' : 'Equal to'} ${other}`),
    observed: cap(observed),
  };
};

/** What the API returned, for an exception; null when the request was never sent. */
export const whatWeSawLine = (response: {
  status: unknown;
  statusText?: unknown;
  data?: unknown;
}): string | null => {
  const { status, statusText, data } = response;
  if (typeof status !== 'number') return null;
  const ok = status >= 200 && status < 300;
  if (ok && Array.isArray(data) && data.length === 0) return 'The API returned 0 records.';
  if (ok && Array.isArray(data) && data.length > 1) {
    return `The API returned ${data.length} records; this step expects exactly 1.`;
  }
  const reason = typeof statusText === 'string' && statusText ? ` ${statusText}` : '';
  return `The API returned HTTP ${status}${reason}.`;
};

/** The response body as stored: formatted JSON or raw text, token redacted, never trimmed. */
export const buildSnapshot = (data: unknown, token: string): CertStepSnapshotEnvelope | null => {
  if (data === undefined) return null;
  let text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  text = redactToken(text, token);
  const sizeBytes = Buffer.byteLength(text, 'utf8');
  return sizeBytes > CERT_SNAPSHOT_MAX_BYTES
    ? { state: 'tooLarge', sizeBytes }
    : { state: 'body', body: text };
};

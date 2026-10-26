export type CapturedValue = string | number | boolean | null;
export type CapturedVars = Record<string, CapturedValue>;

export const MAX_CAPTURED_VARS_BYTES = 64 * 1024;
const KEY_PATTERN = /^[\w.-]{1,100}$/;
// The last four are env-file variables: Bruno resolves runtime vars before env vars, so a captured
// key with one of these names would override the run's host/token settings.
const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'resourceBaseUrl',
  'oauthUrl',
  'edFiCertToken',
  'edFiCertTokenExpiration',
]);

/**
 * Captured values come back from artifact scripts and go into the next run,
 * so only a small, flat object of primitives is accepted. Anything else returns null.
 */
export const sanitizeCapturedVars = (value: unknown): CapturedVars | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  const clean: CapturedVars = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!KEY_PATTERN.test(key) || FORBIDDEN_KEYS.has(key)) return null;
    const isPrimitive =
      entry === null || ['string', 'number', 'boolean'].includes(typeof entry);
    if (!isPrimitive) return null;
    clean[key] = entry as CapturedValue;
  }

  if (Buffer.byteLength(JSON.stringify(clean), 'utf8') > MAX_CAPTURED_VARS_BYTES) return null;
  return clean;
};

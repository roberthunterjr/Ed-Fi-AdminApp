import JSON5 from 'json5';

// Environment variables that config/custom-environment-variables.js maps with `__format: 'json'`.
// node-config parses these with JSON5 and rethrows the JSON5 parse message (e.g.
// "JSON5: invalid character 'S' at 1:16"), which reveals a character and position of the secret
// value. Checking them first, with the same parser, lets us fail with a redacted message instead
// while accepting exactly what node-config accepts.
export const JSON_ENV_VARS: readonly string[] = [
  'DB_SECRET_VALUE',
  'DB_ENCRYPTION_SECRET_VALUE',
  'SESSION_SECRET_VALUE',
  'SAMPLE_OIDC_CONFIG',
  'AUTH0_CONFIG_SECRET_VALUE',
  // Not secrets, but mapped with __format json so they reach the throttler as numbers.
  'RATE_LIMIT_TTL',
  'RATE_LIMIT_LIMIT',
];

export function assertJsonEnvVarsParse(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of JSON_ENV_VARS) {
    const value = env[name];
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }
    try {
      JSON5.parse(value);
    } catch {
      // Deliberately do not include or chain the original error: it can contain the value.
      throw new Error(
        `${name} is not valid JSON. The value is not shown here to avoid logging secrets; check quoting and escaping.`
      );
    }
  }
}

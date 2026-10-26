// Sample keys committed to packages/api/config/*.js templates and compose/.env.example for
// local/testing use. They are publicly known - never valid in a real deployment.
export const KNOWN_SAMPLE_KEYS: readonly string[] = [
  'bbeadc2d4d15f5c9cfc2239b682cca392b233ee6979b6b9578d256aa01a7c565',
  'ef9c1dcd53175358daefcce54891e1779f9837d5ff25c74a674de3d1a749d81f',
  '4bb5c8ddaee19b8734675193868cd83511b04ee29ed7cc9aebc0dff5b3079dda',
];

const VALID_KEY_PATTERN = /^[0-9a-f]{64}$/i;

export interface DbEncryptionSecret {
  KEY?: string;
  IV?: string;
}

/**
 * Throws if the DB encryption key is missing, malformed, or still equal to a
 * sample value committed to a config template, so a misconfigured deployment
 * fails to start instead of silently encrypting sb_environment.configPrivate
 * with a known key.
 */
export function assertValidDbEncryptionSecret(
  secret: DbEncryptionSecret | undefined
): asserts secret is DbEncryptionSecret & { KEY: string } {
  const key = secret?.KEY;
  if (!key || !VALID_KEY_PATTERN.test(key)) {
    throw new Error('DB_ENCRYPTION_SECRET.KEY must be a 64-character hex string');
  }
  if (KNOWN_SAMPLE_KEYS.includes(key.toLowerCase())) {
    throw new Error('DB_ENCRYPTION_SECRET.KEY must be configured to a value other than the committed sample key');
  }
}

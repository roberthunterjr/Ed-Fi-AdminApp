// Values committed or documented in this repo as samples. They are publicly known and are never
// valid in a real production deployment.
export const KNOWN_SAMPLE_SECRETS: readonly string[] = [
  'postgres',
  'YourStrong!Passw0rd',
  'big-secret-123',
  // Public fallbacks in compose/adminapp-services.yml
  'adminapp-secret',
  'adminapp-dev-secret',
];

const KNOWN_SAMPLE_SECRETS_LOWER = KNOWN_SAMPLE_SECRETS.map((secret) => secret.toLowerCase());

const PLACEHOLDER_PATTERN = /^(<.*>|change-me)/i;

export interface ProductionSecretsInput {
  nodeEnv: string | undefined;
  dbEngine: 'pgsql' | 'mssql';
  /**
   * Locally configured DB secret. Pass `undefined` when the DB secret comes from AWS Secrets
   * Manager: those values are operator-managed and are not inspected here.
   */
  dbSecret?: unknown;
  /**
   * Only checked when provided. Without a client secret the first-run OIDC seeding is skipped,
   * so there is nothing to validate.
   */
  sampleOidcClientSecret?: unknown;
}

const DB_REMEDIATION =
  'Set a real value via the DB_SECRET_VALUE environment variable or the DATABASE_SECRET AWS secret (see docs/secret-rotation.md).';
const OIDC_REMEDIATION =
  'Set a real value via the SAMPLE_OIDC_CONFIG environment variable (see docs/secret-rotation.md).';

function describeProblem(name: string, value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return `${name} is missing or blank`;
  }
  const normalized = value.trim().toLowerCase();
  if (PLACEHOLDER_PATTERN.test(normalized) || KNOWN_SAMPLE_SECRETS_LOWER.includes(normalized)) {
    return `${name} is still a placeholder or known sample value`;
  }
  return undefined;
}

/**
 * Throws, listing every offending variable, when a production deployment would start with a
 * missing, placeholder or publicly known secret. Does nothing outside NODE_ENV=production so
 * local development with sample values keeps working. The encryption key is validated
 * separately by assertValidDbEncryptionSecret.
 */
export function assertProductionSecrets(input: ProductionSecretsInput): void {
  if (input.nodeEnv !== 'production') {
    return;
  }

  const problems: { text: string; remediation: string }[] = [];

  if (input.dbSecret !== undefined) {
    const field = input.dbEngine === 'mssql' ? 'MSSQL_DB_PASSWORD' : 'DB_PASSWORD';
    // DB_SECRET_VALUE is JSON-parsed, so it can be null or another primitive.
    const password =
      typeof input.dbSecret === 'object' && input.dbSecret !== null
        ? (input.dbSecret as Record<string, unknown>)[field]
        : undefined;
    const problem = describeProblem(`DB_SECRET_VALUE.${field}`, password);
    if (problem) {
      problems.push({ text: problem, remediation: DB_REMEDIATION });
    }
  }

  if (input.sampleOidcClientSecret !== undefined) {
    const problem = describeProblem('SAMPLE_OIDC_CONFIG.clientSecret', input.sampleOidcClientSecret);
    if (problem) {
      problems.push({ text: problem, remediation: OIDC_REMEDIATION });
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: insecure production configuration.\n${problems
        .map((p) => `  - ${p.text}. ${p.remediation}`)
        .join('\n')}`
    );
  }
}

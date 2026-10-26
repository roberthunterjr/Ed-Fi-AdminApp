import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

jest.mock('@aws-sdk/client-secrets-manager');

// The real 'config/lib/defer' module ships as ESM-only, which this project's
// Jest/Node setup can't require as CommonJS (see the ~50 pre-existing failing
// suites on `npm run test:api`, unrelated to this change). Stub deferConfig as
// the identity function so default.js's SESSION_SECRET callback can be called
// directly, without needing the real defer plumbing.
jest.mock('config/lib/defer', () => ({ deferConfig: (fn: unknown) => fn }), { virtual: true });

const defaultConfig = require('./default.js');

function resolveSessionSecret(context: Record<string, unknown>): unknown {
  return (defaultConfig.SESSION_SECRET as (this: unknown) => unknown).call(context);
}

function resolveDbEncryptionSecret(context: Record<string, unknown>): unknown {
  return (defaultConfig.DB_ENCRYPTION_SECRET as (this: unknown) => unknown).call(context);
}

describe('default.js SESSION_SECRET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps a single local secret in an array', () => {
    const result = resolveSessionSecret({ SESSION_SECRET_VALUE: 'a-local-secret' });
    expect(result).toEqual(['a-local-secret']);
  });

  it('passes through an array of local secrets unchanged, newest first', () => {
    const result = resolveSessionSecret({ SESSION_SECRET_VALUE: ['new-secret', 'old-secret'] });
    expect(result).toEqual(['new-secret', 'old-secret']);
  });

  it('fetches and wraps a single secret from AWS Secrets Manager', async () => {
    const send = jest.fn().mockResolvedValue({ SecretString: JSON.stringify('from-aws') });
    (SecretsManagerClient as unknown as jest.Mock).mockImplementation(() => ({ send }));

    const result = await resolveSessionSecret({
      AWS_SESSION_SECRET: 'arn:aws:secretsmanager:session-secret',
      AWS_REGION: 'us-east-2',
    });

    expect(result).toEqual(['from-aws']);
  });

  it('passes through an array of secrets fetched from AWS Secrets Manager', async () => {
    const send = jest.fn().mockResolvedValue({ SecretString: JSON.stringify(['new-aws-secret', 'old-aws-secret']) });
    (SecretsManagerClient as unknown as jest.Mock).mockImplementation(() => ({ send }));

    const result = await resolveSessionSecret({
      AWS_SESSION_SECRET: 'arn:aws:secretsmanager:session-secret',
      AWS_REGION: 'us-east-2',
    });

    expect(result).toEqual(['new-aws-secret', 'old-aws-secret']);
  });

  it('rejects when AWS Secrets Manager returns no secret string', async () => {
    const send = jest.fn().mockResolvedValue({ SecretString: undefined });
    (SecretsManagerClient as unknown as jest.Mock).mockImplementation(() => ({ send }));

    await expect(
      resolveSessionSecret({
        AWS_SESSION_SECRET: 'arn:aws:secretsmanager:session-secret',
        AWS_REGION: 'us-east-2',
      })
    ).rejects.toThrow('No client config values defined for the session secret when requesting secrets');
  });
});

describe('default.js DB_ENCRYPTION_SECRET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds KEY/IV from the locally-configured object value', () => {
    const result = resolveDbEncryptionSecret({
      DB_ENCRYPTION_SECRET_VALUE: { KEY: 'a'.repeat(64), IV: 'unused' },
    });
    expect(result).toEqual({ KEY: 'a'.repeat(64), IV: 'unused' });
  });

  // Regression test for the DB_ENCRYPTION_SECRET_VALUE override bug flagged in
  // AC-637's PR review: before custom-environment-variables.js mapped this key
  // with __format: 'json', `this.DB_ENCRYPTION_SECRET_VALUE` here would be the
  // raw env var STRING, and spreading a string yields indexed characters
  // instead of {KEY, IV} - silently breaking an operator's override attempt.
  it('would not have produced a usable KEY/IV if DB_ENCRYPTION_SECRET_VALUE stayed an unparsed string', () => {
    const result = resolveDbEncryptionSecret({
      DB_ENCRYPTION_SECRET_VALUE: '{"KEY":"' + 'a'.repeat(64) + '","IV":"unused"}',
    }) as Record<string, unknown>;
    expect(result.KEY).toBeUndefined();
  });
});

describe('default.js AUDIT_LOGGING_ENABLED', () => {
  it('is enabled by default', () => {
    expect(defaultConfig.AUDIT_LOGGING_ENABLED).toBe(true);
  });
});

import { assertProductionSecrets, KNOWN_SAMPLE_SECRETS, ProductionSecretsInput } from './production-secrets';

const valid: ProductionSecretsInput = {
  nodeEnv: 'production',
  dbEngine: 'pgsql',
  dbSecret: { DB_PASSWORD: 'a-real-strong-password' },
  sampleOidcClientSecret: 'a-real-client-secret',
};

describe('assertProductionSecrets', () => {
  it('accepts real values in production', () => {
    expect(() => assertProductionSecrets(valid)).not.toThrow();
  });

  it.each(['development', 'testing', undefined])('does nothing when NODE_ENV is %s', (nodeEnv) => {
    expect(() =>
      assertProductionSecrets({ nodeEnv, dbEngine: 'pgsql', dbSecret: { DB_PASSWORD: 'postgres' } })
    ).not.toThrow();
  });

  it.each(KNOWN_SAMPLE_SECRETS)('rejects the known sample DB password %s', (sample) => {
    expect(() => assertProductionSecrets({ ...valid, dbSecret: { DB_PASSWORD: sample } })).toThrow(
      /DB_SECRET_VALUE\.DB_PASSWORD/
    );
  });

  it.each(['', '   ', undefined, null, 42])('rejects a missing or blank DB password (%p)', (value) => {
    expect(() => assertProductionSecrets({ ...valid, dbSecret: { DB_PASSWORD: value } })).toThrow(
      /DB_SECRET_VALUE\.DB_PASSWORD is missing or blank/
    );
  });

  it.each(['<set-me>', 'change-me', 'CHANGE-ME-set-a-strong-password', 'change-me-generate-with-openssl-rand'])(
    'rejects the placeholder %s',
    (placeholder) => {
      expect(() => assertProductionSecrets({ ...valid, dbSecret: { DB_PASSWORD: placeholder } })).toThrow(
        /placeholder or known sample value/
      );
    }
  );

  it('checks MSSQL_DB_PASSWORD, not DB_PASSWORD, when the engine is mssql', () => {
    expect(() =>
      assertProductionSecrets({
        ...valid,
        dbEngine: 'mssql',
        dbSecret: { DB_PASSWORD: 'postgres', MSSQL_DB_PASSWORD: 'a-real-strong-password' },
      })
    ).not.toThrow();
    expect(() =>
      assertProductionSecrets({
        ...valid,
        dbEngine: 'mssql',
        dbSecret: { DB_PASSWORD: 'a-real-strong-password', MSSQL_DB_PASSWORD: 'YourStrong!Passw0rd' },
      })
    ).toThrow(/DB_SECRET_VALUE\.MSSQL_DB_PASSWORD/);
  });

  it('checks DB_PASSWORD, not MSSQL_DB_PASSWORD, when the engine is pgsql', () => {
    expect(() =>
      assertProductionSecrets({
        ...valid,
        dbSecret: { DB_PASSWORD: 'a-real-strong-password', MSSQL_DB_PASSWORD: 'YourStrong!Passw0rd' },
      })
    ).not.toThrow();
  });

  it.each([null, false, 0, '', 'text'])('rejects a non-object DB secret (%p)', (dbSecret) => {
    expect(() => assertProductionSecrets({ ...valid, dbSecret })).toThrow(
      /DB_SECRET_VALUE\.DB_PASSWORD is missing or blank/
    );
  });

  it('does not inspect the DB password when the DB secret comes from AWS Secrets Manager', () => {
    expect(() => assertProductionSecrets({ ...valid, dbSecret: undefined })).not.toThrow();
  });

  it('skips the OIDC check when no sample client secret is configured', () => {
    expect(() => assertProductionSecrets({ ...valid, sampleOidcClientSecret: undefined })).not.toThrow();
  });

  it.each(['big-secret-123', '', '  ', 'change-me-generate-with-openssl-rand', '<set-me>'])(
    'rejects the sample OIDC client secret %p when one is configured',
    (secret) => {
      expect(() => assertProductionSecrets({ ...valid, sampleOidcClientSecret: secret })).toThrow(
        /SAMPLE_OIDC_CONFIG\.clientSecret/
      );
    }
  );

  it('reports every problem in one error', () => {
    let message = '';
    try {
      assertProductionSecrets({
        nodeEnv: 'production',
        dbEngine: 'pgsql',
        dbSecret: { DB_PASSWORD: 'postgres' },
        sampleOidcClientSecret: 'big-secret-123',
      });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('DB_SECRET_VALUE.DB_PASSWORD');
    expect(message).toContain('SAMPLE_OIDC_CONFIG.clientSecret');
    expect(message).toContain(
      'Set a real value via the DB_SECRET_VALUE environment variable or the DATABASE_SECRET AWS secret (see docs/secret-rotation.md).'
    );
    expect(message).toContain(
      'Set a real value via the SAMPLE_OIDC_CONFIG environment variable (see docs/secret-rotation.md).'
    );
  });

  it('does not suggest AWS Secrets Manager for the sample OIDC client secret', () => {
    let message = '';
    try {
      assertProductionSecrets({ ...valid, sampleOidcClientSecret: 'big-secret-123' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('SAMPLE_OIDC_CONFIG.clientSecret');
    expect(message).not.toContain('AWS');
  });

  it.each([' postgres', 'Postgres', 'POSTGRES ', ' change-me', 'Big-Secret-123', ' yourstrong!passw0rd'])(
    'rejects %p after trimming and ignoring case',
    (value) => {
      expect(() => assertProductionSecrets({ ...valid, dbSecret: { DB_PASSWORD: value } })).toThrow(
        /placeholder or known sample value/
      );
    }
  );

  it.each(['adminapp-secret', 'adminapp-dev-secret'])('rejects the public compose fallback %s', (value) => {
    expect(KNOWN_SAMPLE_SECRETS).toContain(value);
    expect(() => assertProductionSecrets({ ...valid, sampleOidcClientSecret: value })).toThrow(
      /SAMPLE_OIDC_CONFIG\.clientSecret/
    );
  });

  it.each(['<set-me>', '<your-strong-password>', '<anything>'])(
    'rejects the angle-bracket placeholder %s',
    (value) => {
      expect(() => assertProductionSecrets({ ...valid, dbSecret: { DB_PASSWORD: value } })).toThrow(
        /placeholder or known sample value/
      );
    }
  );

  it('never echoes the secret value in the error', () => {
    expect(() => assertProductionSecrets({ ...valid, dbSecret: { DB_PASSWORD: ' Postgres' } })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('Postgres') })
    );
  });
});

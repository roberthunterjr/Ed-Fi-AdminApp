const customEnvironmentVariables = require('./custom-environment-variables.js');

describe('custom-environment-variables.js', () => {
  it('maps SESSION_SECRET_VALUE using the __name/__format keys config v5 requires', () => {
    // The plain `name`/`format` keys look plausible but are silently ignored by
    // config v5 (node_modules/config/lib/util.js expects __name/__format), which
    // breaks JSON parsing of the matching environment variable - this bit
    // SESSION_SECRET_VALUE in AC-637.
    expect(customEnvironmentVariables.SESSION_SECRET_VALUE).toEqual({
      __name: 'SESSION_SECRET_VALUE',
      __format: 'json',
    });
  });

  it('maps DB_ENCRYPTION_SECRET_VALUE as a JSON-parsed object, not a bare string', () => {
    // A bare string mapping leaves `this.DB_ENCRYPTION_SECRET_VALUE` as the raw
    // env var string; default.js spreads it (`{ ...this.DB_ENCRYPTION_SECRET_VALUE }`),
    // which on a string spreads into indexed characters instead of {KEY, IV},
    // silently breaking an operator's attempt to override the encryption key.
    expect(customEnvironmentVariables.DB_ENCRYPTION_SECRET_VALUE).toEqual({
      __name: 'DB_ENCRYPTION_SECRET_VALUE',
      __format: 'json',
    });
  });

  it('maps SAMPLE_OIDC_CONFIG and AUTH0_CONFIG_SECRET_VALUE as JSON objects so partial overrides merge', () => {
    expect(customEnvironmentVariables.SAMPLE_OIDC_CONFIG).toEqual({
      __name: 'SAMPLE_OIDC_CONFIG',
      __format: 'json',
    });
    expect(customEnvironmentVariables.AUTH0_CONFIG_SECRET_VALUE).toEqual({
      __name: 'AUTH0_CONFIG_SECRET_VALUE',
      __format: 'json',
    });
  });

  it('maps DB_SECRET_VALUE with __name/__format (the plain name/format form is ignored by config v5)', () => {
    expect(customEnvironmentVariables.DB_SECRET_VALUE).toEqual({
      __name: 'DB_SECRET_VALUE',
      __format: 'json',
    });
  });

  it('maps AUDIT_LOGGING_ENABLED to the AUDIT_LOGGING_ENABLED env var', () => {
    expect(customEnvironmentVariables.AUDIT_LOGGING_ENABLED).toBe('AUDIT_LOGGING_ENABLED');
  });
});

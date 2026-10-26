import * as path from 'path';
import { assertJsonEnvVarsParse, JSON_ENV_VARS } from './json-env-preflight';

describe('JSON_ENV_VARS', () => {
  it('matches the keys mapped with __format json in custom-environment-variables.js', () => {
    const mapping = require(path.resolve(__dirname, '../../config/custom-environment-variables.js'));
    const jsonKeys = Object.entries(mapping)
      .filter(([, value]) => typeof value === 'object' && (value as { __format?: string }).__format === 'json')
      .map(([key]) => key);
    expect([...JSON_ENV_VARS].sort()).toEqual(jsonKeys.sort());
  });
});

describe('assertJsonEnvVarsParse', () => {
  it('accepts valid JSON, unset and empty values', () => {
    expect(() =>
      assertJsonEnvVarsParse({ DB_SECRET_VALUE: '{"DB_PASSWORD":"x"}', SAMPLE_OIDC_CONFIG: '', SESSION_SECRET_VALUE: undefined })
    ).not.toThrow();
  });

  it('names the variable but never leaks the malformed value', () => {
    let message = '';
    try {
      assertJsonEnvVarsParse({ DB_SECRET_VALUE: '{"DB_PASSWORD":S3cretPass}' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe(
      'DB_SECRET_VALUE is not valid JSON. The value is not shown here to avoid logging secrets; check quoting and escaping.'
    );
    expect(message).not.toContain('S3cretPass');
  });


  it('accepts JSON5-only values that node-config also accepts', () => {
    expect(() => assertJsonEnvVarsParse({ DB_SECRET_VALUE: "{DB_PASSWORD:'S3cretPass',}" })).not.toThrow();
  });

  it('still rejects invalid JSON5 with the redacted message', () => {
    let message = '';
    try {
      assertJsonEnvVarsParse({ DB_SECRET_VALUE: '{"DB_PASSWORD":S3cretPass}' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('DB_SECRET_VALUE is not valid JSON');
    expect(message).not.toContain('S3cretPass');
    expect(message).not.toContain('DB_PASSWORD');
  });

  it('does not chain the original parse error', () => {
    const thrown = (() => {
      try {
        assertJsonEnvVarsParse({ SAMPLE_OIDC_CONFIG: '{bad S3cretPass' });
      } catch (e) {
        return e as Error;
      }
      return undefined;
    })();
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.cause).toBeUndefined();
  });
});

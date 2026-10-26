import { assertValidDbEncryptionSecret } from './db-encryption-secret';

describe('assertValidDbEncryptionSecret', () => {
  it('accepts a configured 64-character hex key', () => {
    expect(() =>
      assertValidDbEncryptionSecret({ KEY: 'a'.repeat(64), IV: 'unused' })
    ).not.toThrow();
  });

  it('throws when the secret is undefined', () => {
    expect(() => assertValidDbEncryptionSecret(undefined)).toThrow(
      'DB_ENCRYPTION_SECRET.KEY must be a 64-character hex string'
    );
  });

  it('throws when KEY is missing', () => {
    expect(() => assertValidDbEncryptionSecret({ IV: 'unused' })).toThrow(
      'DB_ENCRYPTION_SECRET.KEY must be a 64-character hex string'
    );
  });

  it('throws when KEY is not 64 hex characters', () => {
    expect(() => assertValidDbEncryptionSecret({ KEY: 'not-hex', IV: 'unused' })).toThrow(
      'DB_ENCRYPTION_SECRET.KEY must be a 64-character hex string'
    );
  });

  it('throws when KEY still equals a sample key committed to a config template', () => {
    expect(() =>
      assertValidDbEncryptionSecret({
        KEY: 'bbeadc2d4d15f5c9cfc2239b682cca392b233ee6979b6b9578d256aa01a7c565',
        IV: 'unused',
      })
    ).toThrow('DB_ENCRYPTION_SECRET.KEY must be configured to a value other than the committed sample key');
  });

  it('throws when KEY matches a sample key regardless of case', () => {
    expect(() =>
      assertValidDbEncryptionSecret({
        KEY: 'BBEADC2D4D15F5C9CFC2239B682CCA392B233EE6979B6B9578D256AA01A7C565',
        IV: 'unused',
      })
    ).toThrow('DB_ENCRYPTION_SECRET.KEY must be configured to a value other than the committed sample key');
  });

  it('throws when KEY still equals the key that used to ship in compose/.env.example', () => {
    expect(() =>
      assertValidDbEncryptionSecret({
        KEY: '4bb5c8ddaee19b8734675193868cd83511b04ee29ed7cc9aebc0dff5b3079dda',
        IV: 'unused',
      })
    ).toThrow('DB_ENCRYPTION_SECRET.KEY must be configured to a value other than the committed sample key');
  });
});

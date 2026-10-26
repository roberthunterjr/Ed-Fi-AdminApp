import { ValueTransformer } from 'typeorm';
import { EncryptionTransformer } from 'typeorm-encrypted';

const transformer = () => {
  if (!('DB_SECRETS_ENCRYPTION' in global) || !DB_SECRETS_ENCRYPTION) {
    throw new Error('DB_SECRETS_ENCRYPTION not defined');
  }
  return new EncryptionTransformer({
    key: DB_SECRETS_ENCRYPTION.KEY,
    algorithm: 'aes-256-cbc',
    ivLength: 16,
  });
};

/**
 * Stores a JSON value in a text column, encrypted at rest with the same key and cipher as
 * sb_environment.configPrivate. The column holds one base64 string, so it works on both engines.
 *
 * `to(undefined)` stays undefined: save() reloads the row without select: false columns and
 * compares through this transformer, so mapping undefined to null would make a null written on
 * purpose look unchanged, and the old value would never be cleared.
 */
export const encryptedJsonTransformer: ValueTransformer = {
  from: (value) =>
    value === null || value === undefined ? null : JSON.parse(transformer().from(value)),
  to: (value) => {
    if (value === undefined) return undefined;
    return value === null ? null : transformer().to(JSON.stringify(value));
  },
};

import { MAX_ODS_NAME_LENGTH, MAX_PORTABLE_DATABASE_NAME_LENGTH, ODS_NAME_PATTERN } from './ods-name';

/**
 * Pins AdminApp to the database name ODS-Admin-API builds in
 * OdsInstanceManageDatabaseNameFormatter (V2) / DataStoreManageDatabaseNameFormatter (V3).
 *
 * The expected values are written as independent literals rather than derived from the module
 * under test, so drift on either side of the contract fails here.
 */
describe('MAX_ODS_NAME_LENGTH contract with ODS-Admin-API', () => {
  it('is 46', () => {
    expect(MAX_ODS_NAME_LENGTH).toBe(46);
  });

  it('mirrors the formatters’ portable limit of 63', () => {
    expect(MAX_PORTABLE_DATABASE_NAME_LENGTH).toBe(63);
  });

  it('produces a database name of exactly the portable limit at the maximum name length', () => {
    const databaseName = `EdFi_Ods_${'a'.repeat(MAX_ODS_NAME_LENGTH)}_Minimal`;

    expect(databaseName).toHaveLength(MAX_PORTABLE_DATABASE_NAME_LENGTH);
  });

  it('leaves no room for a longer name', () => {
    const oversized = `EdFi_Ods_${'a'.repeat(MAX_ODS_NAME_LENGTH + 1)}_Minimal`;

    expect(oversized.length).toBeGreaterThan(MAX_PORTABLE_DATABASE_NAME_LENGTH);
  });
});

describe('ODS_NAME_PATTERN contract with ODS-Admin-API', () => {
  // Written as an independent literal so drift from the AdminApi validators' own
  // "^[A-Za-z0-9 _]+$" fails here rather than silently at request time.
  it('matches the pattern the AdminApi validators enforce', () => {
    expect(ODS_NAME_PATTERN.source).toBe('^[A-Za-z0-9 _]+$');
  });

  it.each(['Instance One', 'Instance_One', 'ODS123'])('accepts %s', (name) => {
    expect(ODS_NAME_PATTERN.test(name)).toBe(true);
  });

  it.each(['Instance-One', 'Instance.One', '数', ''])('rejects %s', (name) => {
    expect(ODS_NAME_PATTERN.test(name)).toBe(false);
  });

  it('keeps the character cap equivalent to a byte cap', () => {
    const longest = 'a'.repeat(MAX_ODS_NAME_LENGTH);

    expect(ODS_NAME_PATTERN.test(longest)).toBe(true);
    expect(Buffer.byteLength(longest, 'utf8')).toBe(MAX_ODS_NAME_LENGTH);
  });
});

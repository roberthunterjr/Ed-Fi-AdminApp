import { certificationUnsupportedMessage, supportsCertification } from './certification-support';

describe('supportsCertification', () => {
  it.each([
    ['5.0.0'],
    ['5.0.1'],
    ['5.2.0'],
    ['6.0.0'],
    // String comparison would put "10.0.0" before "5.0.0".
    ['10.0.0'],
    ['5.1.0-pre'],
    ['5.0.0+build.7'],
    [' 5.0.0 '],
  ])('supports Ed-Fi data model %p', (odsDsVersion) => {
    expect(supportsCertification(odsDsVersion)).toBe(true);
  });

  it.each([
    ['4.0.0'],
    ['4.9.9'],
    ['3.3.1-b'],
    // A prerelease of 5.0.0 comes before 5.0.0.
    ['5.0.0-pre'],
  ])('does not support Ed-Fi data model %p', (odsDsVersion) => {
    expect(supportsCertification(odsDsVersion)).toBe(false);
  });

  it.each([
    [undefined],
    [''],
    ['unknown'],
    ['5'],
    ['5.0'],
    ['v5'],
    ['5.x.0'],
    ['5.0.0.1'],
    // Not valid semver: leading zeros and empty prerelease or build identifiers.
    ['05.0.0'],
    ['5.01.0'],
    ['5.0.0+.'],
    ['5.0.0+build.'],
    ['5.1.0-alpha..1'],
    ['5.1.0-'],
  ])(
    'treats an undeterminable data model %p as unsupported',
    (odsDsVersion) => {
      expect(supportsCertification(odsDsVersion)).toBe(false);
    },
  );

  // odsApiMeta is saved verbatim from the ODS/API, so the type isn't guaranteed at runtime.
  it.each([[5], [null], [{ version: '5.0.0' }]])(
    'treats a non-string data model %p as unsupported instead of throwing',
    (odsDsVersion) => {
      expect(supportsCertification(odsDsVersion as never)).toBe(false);
    },
  );
});

// The stored version is only refreshed when an environment is connected, and re-connecting
// means deleting it (tenants, ODSs, ownerships, saved runs), so the message must state the
// facts without telling the admin to do that.
describe('certificationUnsupportedMessage', () => {
  it('names the stored version and that it is not refreshed after an upgrade', () => {
    expect(certificationUnsupportedMessage('4.0.0')).toBe(
      "Certification requires Ed-Fi Data Standard 5.0.0 or later. This environment's data standard version is 4.0.0, as recorded when it was connected to Admin App. If its Ed-Fi API has been upgraded since then, Admin App doesn't detect the new version yet.",
    );
  });

  it.each([[undefined], [''], [5 as never]])(
    'says the version could not be read for %p',
    (odsDsVersion) => {
      expect(certificationUnsupportedMessage(odsDsVersion)).toBe(
        "Certification requires Ed-Fi Data Standard 5.0.0 or later. Admin App couldn't read this environment's data standard version from its Ed-Fi API when the environment was connected.",
      );
    },
  );

  it.each([['4.0.0'], [undefined]])('never tells the admin to connect %p again', (odsDsVersion) => {
    expect(certificationUnsupportedMessage(odsDsVersion)).not.toMatch(/connect the environment again|delete/i);
  });
});

/** Certification is offered only for Ed-Fi Data Model 5.0.0 or later (ODS/API 7.x). */
export const MIN_CERTIFICATION_DATA_MODEL = '5.0.0';

// MAJOR.MINOR.PATCH with an optional prerelease and build, as in semver.org: no leading
// zeros, no empty identifiers. Each repetition must consume a literal ".", so it stays linear.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Whether an environment's Ed-Fi data model (`odsDsVersion`) supports certification.
 * Compared as semver, so "10.0.0" is later than "5.0.0" and "5.0.0-pre" is earlier.
 * A missing or unparseable version is unsupported.
 */
export const supportsCertification = (odsDsVersion: string | undefined): boolean => {
  // odsApiMeta is saved verbatim from the ODS/API, so don't trust the declared type.
  if (typeof odsDsVersion !== 'string') return false;
  const match = SEMVER.exec(odsDsVersion.trim());
  if (!match) return false;
  const [, major, minor, patch, prerelease] = match;
  const core = [Number(major), Number(minor), Number(patch)];
  const min = MIN_CERTIFICATION_DATA_MODEL.split('.').map(Number);
  const firstDiff = core.findIndex((part, i) => part !== min[i]);
  // Equal cores: a prerelease comes before the release.
  return firstDiff === -1 ? prerelease === undefined : core[firstDiff] > min[firstDiff];
};

/**
 * Why certification isn't offered. Shared by the API refusal and the certification pages so
 * both say the same thing. Uses the UI's "data standard" wording.
 * The stored version is only refreshed when an environment is connected (and by the Starting
 * Blocks sync); editing it doesn't. Re-connecting means deleting the environment, so the
 * message states the facts and doesn't prescribe that.
 */
export const certificationUnsupportedMessage = (odsDsVersion: string | undefined): string => {
  const requirement = `Certification requires Ed-Fi Data Standard ${MIN_CERTIFICATION_DATA_MODEL} or later.`;
  return typeof odsDsVersion === 'string' && odsDsVersion.trim()
    ? `${requirement} This environment's data standard version is ${odsDsVersion.trim()}, as recorded when it was connected to Admin App. If its Ed-Fi API has been upgraded since then, Admin App doesn't detect the new version yet.`
    : `${requirement} Admin App couldn't read this environment's data standard version from its Ed-Fi API when the environment was connected.`;
};

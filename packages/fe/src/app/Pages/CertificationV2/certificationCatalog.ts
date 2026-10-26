import {
  CertificationCatalogVersionDto,
  CertificationStepDto,
  CertificationStepParameterDto,
} from '@edanalytics/models';

/**
 * "5.2.0" -> "v5"; undefined when the version has no leading number.
 * Matches the catalog sync, which only loads artifact folders named like `v5`.
 */
export const toDataStandardMajor = (odsDsVersion: string | undefined) => {
  const major = /^\s*v?(\d+)/i.exec(odsDsVersion ?? '')?.[1];
  return major === undefined ? undefined : `v${Number(major)}`;
};

/**
 * The active catalog version for the data standard. The catalog sync deactivates the
 * previous version for a data standard when it loads a new one, so at most one matches.
 */
export const selectCatalogVersion = (
  versions: CertificationCatalogVersionDto[],
  dataStandardVersion: string | undefined,
) =>
  dataStandardVersion === undefined
    ? undefined
    : versions.find(
        (version) =>
          version.isActive &&
          version.dataStandardVersion.toLowerCase() === dataStandardVersion.toLowerCase(),
      );

/** "v2.1.0" -> "2.1.0", as in "Certification 2.1.0". */
export const formatArtifactVersion = (artifactVersion: string) =>
  artifactVersion.replace(/^v/i, '');

export const byDisplayOrder = <T extends { displayOrder: number }>(items: T[]) =>
  [...items].sort((a, b) => a.displayOrder - b.displayOrder);

const firstNonBlank = (preferred: string | null | undefined, fallback: string) =>
  preferred?.trim() || fallback;

export const displayNameOf = (item: { displayName: string | null; name: string }) =>
  firstNonBlank(item.displayName, item.name);

export const stepNameOf = (step: CertificationStepDto) =>
  firstNonBlank(step.displayName, step.stepName);

/** Only `input` parameters are typed by the user; `context` and `reference` ones are filled in by the app. */
export const isUserInputParameter = (parameter: CertificationStepParameterDto) =>
  parameter.type === 'input';

// A Bruno ordering trick in parameter names, not meant for users.
const KEEP_AT_END = /_KEEP_IT_AT_THE_END\b/gi;
const FORMAT_HINT = /\b(?:YYYY-MM-DD|MM\/DD\/YYYY|HH:MM(?::SS)?)\b/i;

/** "STUDENT_UNIQUE_ID" / "schoolId" -> "Student unique id" / "School id". */
export const toSentenceCase = (text: string) => {
  const words = text
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Label and optional format hint (such as YYYY-MM-DD) for a parameter's input field. */
export const parameterFieldOf = (parameter: CertificationStepParameterDto) => {
  const name = parameter.name.replace(KEEP_AT_END, '');
  const source = firstNonBlank(parameter.description?.replace(KEEP_AT_END, ''), name);
  const hint = FORMAT_HINT.exec(source)?.[0].toUpperCase();
  const label = toSentenceCase(source.replace(FORMAT_HINT, '')) || toSentenceCase(name);
  return { label, hint };
};

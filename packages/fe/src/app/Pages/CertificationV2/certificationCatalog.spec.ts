import 'reflect-metadata';
import { CertificationCatalogVersionDto } from '@edanalytics/models';
import {
  displayNameOf,
  formatArtifactVersion,
  isUserInputParameter,
  parameterFieldOf,
  selectCatalogVersion,
  stepNameOf,
  toDataStandardMajor,
  toSentenceCase,
} from './certificationCatalog';

const version = (
  catalogVersionId: number,
  dataStandardVersion: string,
  artifactVersion = 'v2.1.0',
  isActive = true,
) =>
  ({
    catalogVersionId,
    dataStandardVersion,
    artifactVersion,
    isActive,
  }) as CertificationCatalogVersionDto;

describe('toDataStandardMajor', () => {
  it.each([
    ['5.2.0', 'v5'],
    ['6.1.0', 'v6'],
    ['4', 'v4'],
    ['v5.0', 'v5'],
    ['', undefined],
    [undefined, undefined],
    ['unknown', undefined],
  ])('maps %p to %p', (input, expected) => {
    expect(toDataStandardMajor(input)).toBe(expected);
  });
});

describe('selectCatalogVersion', () => {
  it('picks the version for the data standard', () => {
    expect(selectCatalogVersion([version(1, 'v4'), version(2, 'v5')], 'v5')?.catalogVersionId).toBe(
      2,
    );
  });

  it('ignores inactive versions', () => {
    expect(selectCatalogVersion([version(2, 'v5', 'v2.1.0', false)], 'v5')).toBeUndefined();
  });

  it('returns undefined without a match or a data standard', () => {
    expect(selectCatalogVersion([version(1, 'v4')], 'v6')).toBeUndefined();
    expect(selectCatalogVersion([version(1, 'v4')], undefined)).toBeUndefined();
  });
});

describe('formatArtifactVersion', () => {
  it.each([
    ['v2.1.0', '2.1.0'],
    ['2.1.0', '2.1.0'],
  ])('formats %p as %p', (input, expected) => {
    expect(formatArtifactVersion(input)).toBe(expected);
  });
});

describe('displayNameOf / stepNameOf', () => {
  it('prefers the display name and falls back to the name', () => {
    expect(displayNameOf({ displayName: 'Calendar Dates', name: 'CalendarDates' })).toBe(
      'Calendar Dates',
    );
    expect(displayNameOf({ displayName: '  ', name: 'CalendarDates' })).toBe('CalendarDates');
    expect(stepNameOf({ displayName: null, stepName: '01 - Step' } as never)).toBe('01 - Step');
  });
});

describe('isUserInputParameter', () => {
  it.each([
    ['input', true],
    ['context', false],
    ['reference', false],
  ])('%s is user input: %s', (type, expected) => {
    expect(isUserInputParameter({ parameterId: 1, type, name: 'n', description: null })).toBe(
      expected,
    );
  });
});

describe('toSentenceCase', () => {
  it.each([
    ['STUDENT_UNIQUE_ID', 'Student unique id'],
    ['FIRST SCHOOL ID', 'First school id'],
    ['schoolId', 'School id'],
    ['', ''],
  ])('formats %p as %p', (input, expected) => {
    expect(toSentenceCase(input)).toBe(expected);
  });
});

describe('parameterFieldOf', () => {
  const parameter = (name: string, description: string | null) => ({
    parameterId: 1,
    type: 'input',
    name,
    description,
  });

  it('uses the description in sentence case', () => {
    expect(parameterFieldOf(parameter('studentUniqueId', 'STUDENT_UNIQUE_ID'))).toEqual({
      label: 'Student unique id',
      hint: undefined,
    });
  });

  it('moves a date format out of the label into the hint', () => {
    expect(parameterFieldOf(parameter('beginDate', 'FIRST BEGIN DATE YYYY-MM-DD'))).toEqual({
      label: 'First begin date',
      hint: 'YYYY-MM-DD',
    });
  });

  it('falls back to the name and strips the Bruno ordering suffix', () => {
    expect(parameterFieldOf(parameter('behaviorDescriptor_KEEP_IT_AT_THE_END', null))).toEqual({
      label: 'Behavior descriptor',
      hint: undefined,
    });
  });
});

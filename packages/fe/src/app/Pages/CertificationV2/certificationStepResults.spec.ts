import 'reflect-metadata';
import { CertificationStepParameterDto, CertScenarioStatus } from '@edanalytics/models';
import {
  classifyRunError,
  SCENARIO_STATUS_DISPLAY,
  httpStatusColorScheme,
  httpStatusLabel,
  STEP_NOT_FOUND_MESSAGE,
  STEP_STATUS_DISPLAY,
  toDisplayStatus,
  toParameterValues,
  toRunInputs,
  toScenarioDisplayStatus,
} from './certificationStepResults';

const parameters = [
  { parameterId: 484, type: 'input', name: 'schoolId', description: 'FIRST SCHOOL ID' },
  {
    parameterId: 485,
    type: 'input',
    name: 'beginDate',
    description: 'FIRST BEGIN DATE YYYY-MM-DD',
  },
  { parameterId: 486, type: 'context', name: 'calendarReference', description: null },
] as CertificationStepParameterDto[];

describe('toDisplayStatus', () => {
  it('shows a running step as running, even over a saved failure', () => {
    expect(toDisplayStatus('failed', true)).toBe('running');
  });

  it('shows a step that never ran as not executed', () => {
    expect(toDisplayStatus(undefined, false)).toBe('notExecuted');
  });

  it.each([
    ['success', 'success'],
    ['failed', 'failed'],
  ] as const)('maps a saved %s status', (saved, expected) => {
    expect(toDisplayStatus(saved, false)).toBe(expected);
  });

  it('never shows an unknown saved status as successful', () => {
    expect(toDisplayStatus('weird' as never, false)).toBe('failed');
  });
});

describe('STEP_STATUS_DISPLAY', () => {
  it('uses the agreed labels', () => {
    expect(Object.values(STEP_STATUS_DISPLAY).map((display) => display.label)).toEqual([
      'Not executed',
      'Running',
      'Successful',
      'Failed',
    ]);
  });
});

describe('toScenarioDisplayStatus', () => {
  it('shows a scenario that never ran as not executed', () => {
    expect(toScenarioDisplayStatus(undefined)).toBe('notExecuted');
  });

  it.each([
    ['completed', 'success'],
    ['inprogress', 'inProgress'],
    ['failed', 'failed'],
  ] as const)('maps a saved %s status', (saved, expected) => {
    expect(toScenarioDisplayStatus(saved)).toBe(expected);
  });

  it('never shows an unknown saved status as successful', () => {
    expect(toScenarioDisplayStatus('bogus' as CertScenarioStatus)).toBe('failed');
  });

  it('does not resolve a prototype member name to a display status', () => {
    expect(toScenarioDisplayStatus('constructor' as CertScenarioStatus)).toBe('failed');
  });
});

describe('SCENARIO_STATUS_DISPLAY', () => {
  it('shows "In progress" for the inProgress status', () => {
    expect(SCENARIO_STATUS_DISPLAY.inProgress.label).toBe('In progress');
  });
});

describe('toRunInputs', () => {
  it('keys trimmed input values by parameter name and leaves out non-input parameters', () => {
    expect(toRunInputs(parameters, { '484': ' 255901 ', '485': '2026-08-01', '486': 'x' })).toEqual(
      { schoolId: '255901', beginDate: '2026-08-01' },
    );
  });
});

describe('toParameterValues', () => {
  it('prefills input fields from saved inputs and ignores names the step no longer has', () => {
    expect(toParameterValues(parameters, { schoolId: '255901', removedParam: 'z' })).toEqual({
      '484': '255901',
      '485': '',
    });
  });

  it.each([null, undefined])('starts every input field empty when saved inputs are %s', (saved) => {
    expect(toParameterValues(parameters, saved)).toEqual({ '484': '', '485': '' });
  });
});

describe('classifyRunError', () => {
  it('returns the message of a validation error body', () => {
    expect(
      classifyRunError({
        data: { errors: { 'inputs.schoolId': { message: 'schoolId is required' } } },
      }),
    ).toEqual({ kind: 'api', message: 'schoolId is required', notFound: false });
  });

  it('returns the message of a Nest error body', () => {
    const message =
      'Another step of this scenario is running. Wait for it to finish, then try again.';
    expect(classifyRunError({ statusCode: 409, message, error: 'Conflict' })).toEqual({
      kind: 'api',
      message,
      notFound: false,
    });
  });

  it('returns the first message when a Nest error body has a list', () => {
    expect(classifyRunError({ statusCode: 503, message: ['Too many runs.', 'Other'] })).toEqual({
      kind: 'api',
      message: 'Too many runs.',
      notFound: false,
    });
  });

  it('flags a missing step and explains it', () => {
    expect(classifyRunError({ statusCode: 404, message: 'Not Found' })).toEqual({
      kind: 'api',
      message: STEP_NOT_FOUND_MESSAGE,
      notFound: true,
    });
    expect(STEP_NOT_FOUND_MESSAGE).toBe(
      'This step is no longer in the active certification catalog. The list has been reloaded.',
    );
  });

  it.each([
    ['a gateway HTML page', '<html>504 Gateway Time-out</html>'],
    ['a network error', { isAxiosError: true, message: 'Network Error' }],
    ['nothing', undefined],
    ['an empty validation body', { data: { errors: {} } }],
  ])('treats %s as unknown', (_label, error) => {
    expect(classifyRunError(error)).toEqual({ kind: 'unknown' });
  });
});

describe('httpStatusLabel', () => {
  it.each([
    [200, 'HTTP 200 OK'],
    [404, 'HTTP 404 Not Found'],
    [500, 'HTTP 500 Internal Server Error'],
    [418, 'HTTP 418'],
  ])('labels %i as %s', (status, label) => {
    expect(httpStatusLabel(status)).toBe(label);
  });
});

describe('httpStatusColorScheme', () => {
  // A passing step met its expected status, e.g. the 404 a "was Deleted" step checks for.
  it.each([200, 302, 404, 500])('shows %i as green when the step passed', (status) => {
    expect(httpStatusColorScheme(status, 'success')).toBe('green');
  });

  it.each([
    [200, 'green'],
    [299, 'green'],
    [301, 'orange'],
    [399, 'orange'],
    [400, 'red'],
    [404, 'red'],
    [500, 'red'],
    [503, 'red'],
  ])('shows %i as %s when the step failed', (status, colorScheme) => {
    expect(httpStatusColorScheme(status, 'failed')).toBe(colorScheme);
  });
});

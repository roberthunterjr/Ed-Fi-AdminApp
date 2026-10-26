import 'reflect-metadata';
import { render, screen } from '@testing-library/react';
import { CertificationSavedStepRunDto } from '@edanalytics/models';
import { CertificationStepResult } from './CertificationStepResult';

const fieldsRun: CertificationSavedStepRunDto = {
  stepId: 189,
  status: 'failed',
  ranAt: '2026-10-15T15:00:00.000Z',
  inputs: { studentUniqueId: 'S1' },
  responseStatus: 200,
  errors: [
    {
      kind: 'assertion',
      field: 'birthCity',
      expected: 'Not empty',
      observed: 'Empty text',
      message: "expected '' not to be empty",
    },
    {
      kind: 'assertion',
      field: 'middleName',
      expected: 'Text, not empty',
      observed: null,
      message: 'expected undefined to be a string',
    },
  ],
};

const exceptionRun: CertificationSavedStepRunDto = {
  ...fieldsRun,
  responseStatus: 404,
  errors: [
    {
      kind: 'exception',
      field: null,
      expected: null,
      observed: 'The API returned HTTP 404 Not Found.',
      message:
        'No Student found, or multiple records were returned. Check your parameters and try again.',
    },
  ],
};

const renderResult = (run: CertificationSavedStepRunDto | undefined, isRunning = false) =>
  render(<CertificationStepResult run={run} isRunning={isRunning} />);

describe('CertificationStepResult', () => {
  it('prompts to execute when the step has no result', () => {
    renderResult(undefined);

    expect(screen.getByText('Not executed')).toBeTruthy();
    expect(screen.getByText('Execute this step to see its result.')).toBeTruthy();
  });

  it('shows Running while the step runs, even over a saved failure', () => {
    renderResult(exceptionRun, true);

    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('Running this step. This can take up to a minute.')).toBeTruthy();
    expect(screen.queryByText('Failed')).toBeNull();
    expect(screen.queryByText(/No Student found/)).toBeNull();
  });

  it('shows only the exception and what the API returned when the step stopped', () => {
    renderResult(exceptionRun);

    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText(/^No Student found, or multiple records/)).toBeTruthy();
    expect(screen.getByText('The API returned HTTP 404 Not Found.')).toBeTruthy();
    expect(screen.queryByText(/fields? didn't match/)).toBeNull();
  });

  it('shows one row per field with what was expected and observed', () => {
    renderResult(fieldsRun);

    expect(screen.getByText("2 fields didn't match")).toBeTruthy();
    for (const header of ['Field', 'Expected', 'Observed']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeTruthy();
    }
    const row = screen.getByRole('row', { name: /middleName/ });
    expect(row.textContent).toContain('Text, not empty');
    expect(row.textContent).toContain('—');
    expect(screen.getByRole('row', { name: /birthCity/ }).textContent).toContain('Empty text');
  });

  it("shows Bruno's message when a check has neither an expected nor an observed value", () => {
    renderResult({
      ...fieldsRun,
      errors: [
        {
          kind: 'assertion',
          field: 'enrollment count',
          expected: null,
          observed: null,
          message: 'expected 0 to be above 1',
        },
      ],
    });

    const row = screen.getByRole('row', { name: /enrollment count/ });
    expect(row.textContent).toContain('expected 0 to be above 1');
    expect(row.textContent).not.toContain('—');
  });

  it('keeps long unbroken values inside the result box', () => {
    renderResult(fieldsRun);

    const table = screen.getByRole('table');
    expect(getComputedStyle(table.parentElement as HTMLElement).overflowX).toBe('auto');
    const cell = screen.getByRole('cell', { name: 'Empty text' });
    expect(getComputedStyle(cell).overflowWrap).toBe('anywhere');
  });

  it('wraps a long unbroken exception message', () => {
    renderResult(exceptionRun);

    const message = screen.getByText(/^No Student found, or multiple records/);
    expect(getComputedStyle(message).overflowWrap).toBe('anywhere');
  });

  it("says '1 field' for a single row", () => {
    renderResult({ ...fieldsRun, errors: [fieldsRun.errors[0]] });

    expect(screen.getByText("1 field didn't match")).toBeTruthy();
  });

  it('keeps the HTTP status out of the result header, for non-technical readers', () => {
    renderResult(exceptionRun);

    expect(screen.queryByText('HTTP 404 Not Found')).toBeNull();
  });

  it('leaves the response details to their own full-width section', () => {
    renderResult(exceptionRun);

    expect(screen.queryByRole('button', { name: /View response details/ })).toBeNull();
  });

  it('shows a successful run with its time and no errors', () => {
    renderResult({ ...fieldsRun, status: 'success', errors: [] });

    expect(screen.getByText('Successful')).toBeTruthy();
    expect(screen.getByText(/^Last execution: /)).toBeTruthy();
    expect(screen.queryByText(/didn't match/)).toBeNull();
  });

  it('no longer shows the raw Bruno labels', () => {
    renderResult(fieldsRun);

    expect(screen.queryByText(/Validation errors:/)).toBeNull();
    expect(screen.queryByText(/^Property:/)).toBeNull();
  });

  it('shows the raw time when it cannot be parsed', () => {
    renderResult({ ...fieldsRun, ranAt: 'not a date' });

    expect(screen.getByText('Last execution: not a date')).toBeTruthy();
  });
});

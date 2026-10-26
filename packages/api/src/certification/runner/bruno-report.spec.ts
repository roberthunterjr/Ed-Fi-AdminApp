import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  cleanMessage,
  INCOMPLETE_RUN_MESSAGE,
  incompleteRunReport,
  parseBrunoReport,
  readBrunoReport,
} from './bruno-report';

// Real Bruno 3.4.2 reports (body kept, headers skipped), captured against a mock Ed-Fi server.
const load = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', `${name}.json`), 'utf8'));

const STEP_01 = 'v5/Student/Students/01 - 1st Student is valid.bru';
const STEP_03 = 'v5/Student/Students/03 - 1st Student - birthDate was Updated.bru';
const CAPTURED = {
  firstStudentUniqueId: 'abc123',
  firstStudentId: 'S1',
  firstStudentBirthDate: '2010-01-01',
  firstStudentBirthCity: 'Austin',
};
const TOKEN = 'tok-123';
const NOT_FOUND_MESSAGE =
  'No Student found, or multiple records were returned. Check your parameters and try again.';

const exception = (message: string, observed: string | null) => ({
  kind: 'exception',
  field: null,
  expected: null,
  observed,
  message,
});

describe('parseBrunoReport', () => {
  it('passes a step whose assertions and tests all pass, with its status, snapshot and captured values', () => {
    const result = parseBrunoReport(load('step-passed'), { stepPath: STEP_01, token: TOKEN });
    expect(result).toMatchObject({
      complete: true,
      passed: true,
      errors: [],
      responseStatus: 200,
      capturedVars: CAPTURED,
      capturedVarsRejectedKeys: null,
    });
    expect(result.responseSnapshot).toMatchObject({ state: 'body' });
    expect(JSON.parse((result.responseSnapshot as { body: string }).body)[0].birthCity).toBe(
      'Austin',
    );
  });

  it('reports only the exception when a lookup by id returns 404', () => {
    const result = parseBrunoReport(load('not-found-throw'), { stepPath: STEP_03, token: TOKEN });
    expect(result.passed).toBe(false);
    expect(result.errors).toEqual([
      exception(NOT_FOUND_MESSAGE, 'The API returned HTTP 404 Not Found.'),
    ]);
    expect(result.responseStatus).toBe(404);
    expect(result.responseSnapshot).toMatchObject({ state: 'body' });
  });

  it('reports only the exception when a query returns no records', () => {
    const result = parseBrunoReport(load('empty-array-throw'), { stepPath: STEP_01, token: TOKEN });
    expect(result.errors).toEqual([exception(NOT_FOUND_MESSAGE, 'The API returned 0 records.')]);
  });

  it('says how many records came back when a query returns more than one', () => {
    const result = parseBrunoReport(load('two-records-throw'), { stepPath: STEP_01, token: TOKEN });
    expect(result.errors).toEqual([
      exception(NOT_FOUND_MESSAGE, 'The API returned 2 records; this step expects exactly 1.'),
    ]);
  });

  it('reports one row per field with what was expected and observed', () => {
    const result = parseBrunoReport(load('partial-record'), { stepPath: STEP_01, token: TOKEN });
    expect(result.passed).toBe(false);
    expect(result.errors).toEqual([
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
        observed: 'Missing',
        message: 'expected undefined to be a string',
      },
    ]);
  });

  it("falls back to Bruno's message for the observed value when the body is missing", () => {
    const report = load('partial-record');
    delete report[0].results[1].response.data;
    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });
    expect(result.errors.find((error) => error.field === 'middleName')?.observed).toBe('Missing');
    expect(result.responseSnapshot).toBeNull();
  });

  it('turns a failed change check into an assertion row (Windows paths)', () => {
    const result = parseBrunoReport(load('test-failed'), { stepPath: STEP_03, token: TOKEN });
    expect(result).toMatchObject({ complete: true, passed: false, capturedVars: CAPTURED });
    expect(result.errors).toEqual([
      {
        kind: 'assertion',
        field: 'birthDate changed',
        expected: "Different from '2010-01-01'",
        observed: "'2010-01-01'",
        message: "expected '2010-01-01' to not equal '2010-01-01'",
      },
    ]);
  });

  it('reports a pre-request script error, with no status or snapshot because nothing was sent', () => {
    const result = parseBrunoReport(load('script-error'), { stepPath: STEP_03, token: TOKEN });
    expect(result.passed).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ kind: 'exception', field: null, observed: null });
    expect(result.errors[0].message).toMatch(/^Run "01 - 1st Student is valid" first/);
    expect(result.responseStatus).toBeNull();
    expect(result.responseSnapshot).toBeNull();
    expect(result.capturedVars).toEqual({});
  });

  it('reports an unreachable API as an exception with Bruno’s message', () => {
    const result = parseBrunoReport(load('unreachable'), { stepPath: STEP_01, token: TOKEN });
    expect(result.errors).toEqual([exception('connect ECONNREFUSED 127.0.0.1:9', null)]);
    expect(result.responseStatus).toBeNull();
    expect(result.responseSnapshot).toBeNull();
  });

  it('treats a missing report as an incomplete run', () => {
    expect(parseBrunoReport(null, { stepPath: STEP_01, token: TOKEN })).toEqual(
      incompleteRunReport(),
    );
  });

  it('treats a report without the step as an incomplete run', () => {
    expect(
      parseBrunoReport(load('step-passed'), { stepPath: 'v5/Other/x.bru', token: TOKEN }).complete,
    ).toBe(false);
  });

  it('treats a failed restore as an incomplete run, so good values are never wiped', () => {
    const report = load('step-passed');
    report[0].results[0].status = 'error';
    report[0].results[0].error = 'restore failed';
    expect(parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN }).complete).toBe(false);
  });

  it('returns null captured values when the capture body is not valid JSON', () => {
    const report = load('step-passed');
    report[0].results[2].request.data = 'not json';
    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });
    expect(result).toMatchObject({ complete: true, passed: true, capturedVars: null });
  });

  it('ignores captured values when the capture request itself failed, so stored values survive', () => {
    const report = load('step-passed');
    report[0].results[2].status = 'error';
    report[0].results[2].error = 'boom';
    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });
    expect(result).toMatchObject({ complete: true, passed: true, capturedVars: null });
  });

  it('ignores captured values when the capture request is missing', () => {
    const report = load('step-passed');
    report[0].results.splice(2, 1);
    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });
    expect(result).toMatchObject({ complete: true, passed: true, capturedVars: null });
  });

  it('reports the keys of a rejected capture body (never the values)', () => {
    const report = load('step-passed');
    report[0].results[2].request.data = '{"a":{"b":1},"c":"secret"}';
    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });
    expect(result.capturedVars).toBeNull();
    expect(result.capturedVarsRejectedKeys).toEqual(['a', 'c']);
  });

  it('rejects the whole capture when a captured value contains the token (keys only reported)', () => {
    const report = load('step-passed');
    report[0].results[2].request.data = JSON.stringify({ a: 'fine', b: `Bearer ${TOKEN}`, c: 1 });
    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });
    expect(result).toMatchObject({ complete: true, passed: true, capturedVars: null });
    expect(result.capturedVarsRejectedKeys).toEqual(['a', 'b', 'c']);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('rejects the whole capture when a captured key contains the token, and never lists that key', () => {
    const report = load('step-passed');
    report[0].results[2].request.data = JSON.stringify({ a: 'fine', [`k-${TOKEN}`]: 1 });
    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });
    expect(result).toMatchObject({ complete: true, passed: true, capturedVars: null });
    expect(result.capturedVarsRejectedKeys).toEqual(['a', '[REDACTED]']);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('caps the rejected key list', () => {
    const report = load('step-passed');
    const body: Record<string, unknown> = { nested: {} };
    for (let i = 0; i < 80; i++) body[`k${i}`] = i;
    report[0].results[2].request.data = JSON.stringify(body);
    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });
    expect(result.capturedVarsRejectedKeys).toHaveLength(50);
  });

  it('redacts the token from error messages and the snapshot', () => {
    const report = load('script-error');
    report[0].results[1].error = `Request failed with Bearer ${TOKEN}`;
    const [error] = parseBrunoReport(report, { stepPath: STEP_03, token: TOKEN }).errors;
    expect(error.message).toBe('Request failed with Bearer [REDACTED]');

    const passed = load('step-passed');
    passed[0].results[1].response.data[0].birthCity = `Bearer ${TOKEN}`;
    const result = parseBrunoReport(passed, { stepPath: STEP_01, token: TOKEN });
    expect(JSON.stringify(result.responseSnapshot)).not.toContain(TOKEN);
  });
});

describe('parseBrunoReport never stores the token', () => {
  const failingAssertion = (lhsExpr: string) => ({
    lhsExpr,
    rhsExpr: "eq 'x'",
    rhsOperand: "'x'",
    operator: 'eq',
    status: 'fail',
    error: 'expected a value to equal x',
  });

  it('redacts a token that the 500-character cap would otherwise cut in half', () => {
    const report = load('partial-record');
    const step = report[0].results[1];
    // Rendered as a quoted string, the token starts at character 494: a cap at 500 keeps 'tok-12'.
    step.response.data[0].firstName = `${'a'.repeat(492)}${TOKEN}${'b'.repeat(20)}`;
    step.assertionResults.push(failingAssertion('res.body[0].firstName'));

    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });

    const firstName = result.errors.find((error) => error.field === 'firstName');
    expect(firstName?.observed?.length).toBeLessThanOrEqual(500);
    expect(JSON.stringify(result.errors)).not.toContain('tok-1');
  });

  it('redacts a token that JSON escapes when it renders an observed value', () => {
    const quotedToken = `q"t\\k'1`;
    const report = load('partial-record');
    const step = report[0].results[1];
    step.response.data[0].firstName = `x ${quotedToken} y`;
    step.assertionResults.push(failingAssertion('res.body[0].firstName'));

    const result = parseBrunoReport(report, { stepPath: STEP_01, token: quotedToken });

    const stored = result.errors.flatMap((error) => Object.values(error)).join('\n');
    expect(stored).toContain('[REDACTED]');
    expect(stored).not.toContain(quotedToken);
    expect(stored).not.toContain(JSON.stringify(quotedToken).slice(1, -1));
  });

  it('redacts and caps the status text in what the API returned', () => {
    const report = load('not-found-throw');
    report[0].results[1].response.statusText = `Not Found ${TOKEN} ${'x'.repeat(2000)}`;

    const [error] = parseBrunoReport(report, { stepPath: STEP_03, token: TOKEN }).errors;

    expect(error.observed).not.toContain(TOKEN);
    expect(error.observed?.length).toBeLessThanOrEqual(500);
  });
});

describe('parseBrunoReport with unusual assertion paths', () => {
  it('treats an inherited property name as missing instead of failing the whole parse', () => {
    const report = load('partial-record');
    report[0].results[1].assertionResults.push({
      lhsExpr: 'res.body[0].constructor',
      rhsExpr: 'isString',
      rhsOperand: '',
      operator: 'isString',
      status: 'fail',
      error: 'expected [Function] to be a string',
    });

    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });

    expect(result.errors.find((error) => error.field === 'constructor')?.observed).toBe('Missing');
  });
});

describe('parseBrunoReport exception and assertion paths', () => {
  const scriptError = (error: string) => ({
    description: 'Script Error',
    status: 'fail',
    error,
    isScriptError: true,
  });

  it('reports a script error raised inside a tests block as an exception', () => {
    const report = load('partial-record');
    report[0].results[1].testResults = [scriptError('Cannot read properties of undefined')];

    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });

    expect(result.errors).toEqual([
      exception('Cannot read properties of undefined', 'The API returned HTTP 200 OK.'),
    ]);
  });

  it('reports a skipped step as an exception', () => {
    const report = load('script-error');
    const step = report[0].results[1];
    delete step.error;
    step.status = 'skipped';
    step.skipped = true;

    const result = parseBrunoReport(report, { stepPath: STEP_03, token: TOKEN });

    expect(result).toMatchObject({ passed: false, responseStatus: null });
    expect(result.errors).toEqual([exception('The step was skipped.', null)]);
  });

  it('gives every exception of a step the same line about what the API returned', () => {
    const report = load('not-found-throw');
    report[0].results[1].error = 'Request failed';

    const result = parseBrunoReport(report, { stepPath: STEP_03, token: TOKEN });

    expect(result.errors).toEqual([
      exception('Request failed', 'The API returned HTTP 404 Not Found.'),
      exception(NOT_FOUND_MESSAGE, 'The API returned HTTP 404 Not Found.'),
    ]);
  });

  it('lists field rows before check rows, and keeps the message of a check it cannot split', () => {
    const report = load('partial-record');
    report[0].results[1].postResponseTestResults = [
      { description: 'enrollment count', status: 'fail', error: 'expected 0 to be above 1' },
    ];

    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });

    expect(result.errors.map((error) => error.field)).toEqual([
      'birthCity',
      'middleName',
      'enrollment count',
    ]);
    expect(result.errors[2]).toEqual({
      kind: 'assertion',
      field: 'enrollment count',
      expected: null,
      observed: null,
      message: 'expected 0 to be above 1',
    });
  });

  it("reads observed values from Bruno's message when the report has no response", () => {
    const report = load('partial-record');
    delete report[0].results[1].response;

    const result = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN });

    expect(result.errors.find((error) => error.field === 'birthCity')?.observed).toBe("''");
    expect(result).toMatchObject({ responseStatus: null, responseSnapshot: null });
  });

  it('keeps the raw rule when an assertion names no operator or field', () => {
    const report = load('step-passed');
    report[0].results[1].assertionResults = [{ rhsExpr: 'isFoo', status: 'fail', error: 'boom' }];

    const [error] = parseBrunoReport(report, { stepPath: STEP_01, token: TOKEN }).errors;

    expect(error).toMatchObject({ kind: 'assertion', expected: 'IsFoo', message: 'boom' });
  });
});

describe('readBrunoReport', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-report-spec-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('parses the report Bruno wrote', async () => {
    const file = path.join(dir, 'report.json');
    fs.writeFileSync(file, JSON.stringify([{ results: [] }]));
    await expect(readBrunoReport(file)).resolves.toEqual([{ results: [] }]);
  });

  it('returns null when Bruno never wrote a report', async () => {
    await expect(readBrunoReport(path.join(dir, 'missing.json'))).resolves.toBeNull();
  });

  it('returns null when the report is not JSON', async () => {
    const file = path.join(dir, 'broken.json');
    fs.writeFileSync(file, '{ not json');
    await expect(readBrunoReport(file)).resolves.toBeNull();
  });
});

describe('cleanMessage', () => {
  it('strips ANSI colour codes', () => {
    const esc = String.fromCharCode(27);
    expect(cleanMessage(`${esc}[31mred${esc}[39m`, '')).toBe('red');
  });

  it('caps long messages', () => {
    expect(cleanMessage('x'.repeat(2000), '')).toHaveLength(1000);
  });

  it('has a vendor-readable incomplete-run message', () => {
    expect(incompleteRunReport().errors[0]).toEqual({
      kind: 'exception',
      field: null,
      expected: null,
      observed: null,
      message: INCOMPLETE_RUN_MESSAGE,
    });
  });
});

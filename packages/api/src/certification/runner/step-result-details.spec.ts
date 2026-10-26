import 'reflect-metadata';
import {
  buildSnapshot,
  evaluatePath,
  expectedPhrase,
  fieldLabel,
  joinExpected,
  MISSING,
  observedFromMessage,
  parseEqualityTest,
  redactToken,
  renderObserved,
  whatWeSawLine,
} from './step-result-details';

describe('fieldLabel', () => {
  it.each([
    ['res.body[0].birthCity', 'birthCity'],
    [
      'res.body.neglectedOrDelinquentProgramServices[0].serviceDescriptor',
      'neglectedOrDelinquentProgramServices[0].serviceDescriptor',
    ],
    ['res.body.id', 'id'],
    ['res.status', 'HTTP status'],
    ['res.body', 'Response body'],
  ])('labels %s as %s', (lhsExpr, label) => {
    expect(fieldLabel(lhsExpr)).toBe(label);
  });
});

describe('expectedPhrase and joinExpected', () => {
  it('joins the phrases of one field in sentence case', () => {
    expect(
      joinExpected([
        expectedPhrase('isString', '', 'isString'),
        expectedPhrase('isNotEmpty', '', 'isNotEmpty'),
      ]),
    ).toBe('Text, not empty');
  });

  it.each([
    ['eq', '200', 'eq 200', 'Equal to 200'],
    ['neq', 'null', 'neq null', 'Not equal to null'],
    ['gte', '1', 'gte 1', '1 or more'],
    ['gt', '0', 'gt 0', 'Greater than 0'],
    ['length', '3', 'length 3', 'Length 3'],
    ['isDefined', '', 'isDefined', 'Present'],
    ['isUndefined', '', 'isUndefined', 'Absent'],
    ['isNumber', '', 'isNumber', 'A number'],
    ['isBoolean', '', 'isBoolean', 'True or false'],
    ['isArray', '', 'isArray', 'A list'],
    ['isJson', '', 'isJson', 'A JSON object'],
    ['isFoo', 'x', 'isFoo x', 'IsFoo x'],
  ])('phrases %s %s as %s', (operator, rhsOperand, rhsExpr, phrase) => {
    expect(joinExpected([expectedPhrase(operator, rhsOperand, rhsExpr)])).toBe(phrase);
  });
});

describe('evaluatePath', () => {
  it('reports a field missing from the record', () => {
    expect(
      evaluatePath('res.body[0].middleName', { status: 200, body: [{ firstName: 'A' }] }),
    ).toBe(MISSING);
  });

  it('reports a field of a record that does not exist as missing', () => {
    expect(evaluatePath('res.body[0].id', { status: 200, body: [] })).toBe(MISSING);
  });

  it('reads the status and nested values', () => {
    expect(evaluatePath('res.status', { status: 404, body: {} })).toBe(404);
    expect(evaluatePath('res.body.x.length', { status: 200, body: { x: [1, 2] } })).toBe(2);
    expect(evaluatePath('res.body[0].birthCity', { status: 200, body: [{ birthCity: '' }] })).toBe(
      '',
    );
  });

  it('treats inherited property names as missing', () => {
    expect(evaluatePath('res.body[0].constructor', { status: 200, body: [{}] })).toBe(MISSING);
    expect(evaluatePath('res.body.toString', { status: 200, body: {} })).toBe(MISSING);
  });

  it('returns undefined for an expression it cannot walk, without throwing', () => {
    expect(evaluatePath("res('a.b')", { status: 200, body: {} })).toBeUndefined();
    expect(evaluatePath('res.body.a', { status: 200, body: 'not json' })).toBe(MISSING);
  });
});

describe('renderObserved', () => {
  it.each([
    [MISSING, 'Missing'],
    ['', 'Empty text'],
    [[], 'Empty list'],
    [{}, 'Empty object'],
    [null, 'null'],
    ['Austin', '"Austin"'],
    [404, '404'],
    [true, 'true'],
    [{ name: 'TypeError', message: 'x' }, 'Missing'],
    [{ a: 1 }, '{"a":1}'],
  ])('renders %p as %s', (value, text) => {
    expect(renderObserved(value)).toBe(text);
  });

  it('caps long values at 500 characters', () => {
    const text = renderObserved('x'.repeat(2000));
    expect(text).toHaveLength(500);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('observedFromMessage', () => {
  it.each([
    ['expected 404 to equal 200', '404'],
    ["expected '' not to be empty", "''"],
    ['.empty was passed non-string primitive undefined', 'Missing'],
    ["expected { name: 'TypeError', …(2) } to be a string", 'Missing'],
    ['expected undefined to be a string', 'Missing'],
    ['boom', null],
  ])('reads %s as %p', (message, observed) => {
    expect(observedFromMessage(message)).toBe(observed);
  });
});

describe('parseEqualityTest', () => {
  it('reads a change check', () => {
    expect(parseEqualityTest("expected '2010-01-01' to not equal '2010-01-01'")).toEqual({
      expected: "Different from '2010-01-01'",
      observed: "'2010-01-01'",
    });
  });

  it('reads an unchanged check', () => {
    expect(parseEqualityTest("expected 'B' to equal 'A'")).toEqual({
      expected: "Equal to 'A'",
      observed: "'B'",
    });
  });

  it('returns null for anything else', () => {
    expect(parseEqualityTest('boom')).toBeNull();
  });
});

describe('whatWeSawLine', () => {
  it.each([
    [{ status: 404, statusText: 'Not Found' }, 'The API returned HTTP 404 Not Found.'],
    [{ status: 200, statusText: 'OK', data: [] }, 'The API returned 0 records.'],
    [
      { status: 200, statusText: 'OK', data: [{}, {}] },
      'The API returned 2 records; this step expects exactly 1.',
    ],
    [{ status: 200, statusText: 'OK', data: {} }, 'The API returned HTTP 200 OK.'],
    [{ status: 200, statusText: 'OK', data: [{}] }, 'The API returned HTTP 200 OK.'],
    [{ status: 500 }, 'The API returned HTTP 500.'],
  ])('describes %j', (response, line) => {
    expect(whatWeSawLine(response)).toBe(line);
  });

  it('says nothing when the request was never sent', () => {
    expect(whatWeSawLine({ status: 'error' })).toBeNull();
  });
});

describe('buildSnapshot', () => {
  const TOKEN = 'tok-123';

  it('keeps a JSON body formatted', () => {
    const data = { a: 1 };
    expect(buildSnapshot(data, TOKEN)).toEqual({
      state: 'body',
      body: JSON.stringify(data, null, 2),
    });
  });

  it('keeps a non-JSON body as raw text', () => {
    expect(buildSnapshot('<html>bad gateway</html>', TOKEN)).toEqual({
      state: 'body',
      body: '<html>bad gateway</html>',
    });
  });

  it('redacts the token', () => {
    const snapshot = buildSnapshot({ echo: `Bearer ${TOKEN}` }, TOKEN);
    expect(snapshot).toMatchObject({ state: 'body' });
    expect(JSON.stringify(snapshot)).toContain('[REDACTED]');
    expect(JSON.stringify(snapshot)).not.toContain(TOKEN);
  });

  it('measures the limit in UTF-8 bytes, not characters', () => {
    expect(buildSnapshot('é'.repeat(40000), TOKEN)).toEqual({
      state: 'tooLarge',
      sizeBytes: 80000,
    });
  });

  it('keeps a body of exactly 65,536 bytes and refuses one byte more', () => {
    expect(buildSnapshot('x'.repeat(65536), TOKEN)).toMatchObject({ state: 'body' });
    expect(buildSnapshot('x'.repeat(65537), TOKEN)).toEqual({
      state: 'tooLarge',
      sizeBytes: 65537,
    });
  });

  it('has no snapshot without a body', () => {
    expect(buildSnapshot(undefined, TOKEN)).toBeNull();
  });
});

// The token DTO allows any visible ASCII, so a token can hold quotes and backslashes that
// serializing escapes: the escaped forms must be redacted too.
const QUOTED_TOKEN = `q"t\\k'1`;
const escapedForms = [
  QUOTED_TOKEN,
  JSON.stringify(QUOTED_TOKEN).slice(1, -1),
  QUOTED_TOKEN.replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
];

describe('redactToken', () => {
  it.each([
    ['raw text', `Bearer ${QUOTED_TOKEN}`],
    ['JSON-escaped text', JSON.stringify({ echo: QUOTED_TOKEN })],
    ["Bruno's single-quoted text", `expected '${escapedForms[2]}' to equal 'x'`],
  ])('redacts the token in %s', (_label, text) => {
    const redacted = redactToken(text, QUOTED_TOKEN);
    expect(redacted).toContain('[REDACTED]');
    for (const form of escapedForms) expect(redacted).not.toContain(form);
  });

  it('leaves text alone without a token', () => {
    expect(redactToken('plain', '')).toBe('plain');
  });
});

describe('buildSnapshot with a token that JSON escapes', () => {
  it('redacts the escaped token in values and keys', () => {
    const snapshot = buildSnapshot({ echo: QUOTED_TOKEN, [QUOTED_TOKEN]: 1 }, QUOTED_TOKEN);
    const body = (snapshot as { body: string }).body;
    expect(body).toContain('[REDACTED]');
    for (const form of escapedForms) expect(body).not.toContain(form);
  });
});

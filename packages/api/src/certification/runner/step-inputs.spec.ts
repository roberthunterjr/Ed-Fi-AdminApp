import { substituteStepInputs, validateStepInputs } from './step-inputs';

const STEP_01 = [
  'meta {',
  '  name: 01 - 1st Student is valid',
  '  type: http',
  '  seq: 1',
  '}',
  '',
  'get {',
  '  url: {{resourceBaseUrl}}/ed-fi/students?studentUniqueId=[ENTER FIRST STUDENT UNIQUE ID]',
  '  body: none',
  '  auth: inherit',
  '}',
  '',
  'params:query {',
  '  studentUniqueId: [ENTER FIRST STUDENT UNIQUE ID]',
  '  ~schoolId: [ENTER_SCHOOL_ID]',
  '}',
  '',
  'docs {',
  '  Example: [ENTER FIRST STUDENT UNIQUE ID] goes here',
  '}',
  '',
].join('\n');

describe('validateStepInputs', () => {
  it('accepts exactly the expected inputs', () => {
    expect(validateStepInputs(['studentUniqueId'], { studentUniqueId: '604822' })).toEqual([]);
  });

  it('reports a missing input', () => {
    expect(validateStepInputs(['studentUniqueId'], {})).toEqual([
      { field: 'inputs.studentUniqueId', message: 'Enter a value.' },
    ]);
  });

  it('reports an input the step does not take', () => {
    expect(validateStepInputs([], { notAnInput: 'x' })).toEqual([
      { field: 'inputs.notAnInput', message: "This step doesn't take this input." },
    ]);
  });

  it.each([
    "José O'Neil",
    '2010-01-01',
    'uri://ed-fi.org/ProgramTypeDescriptor#Athletics',
    '255901 (main), 2',
  ])('accepts %j', (value) => {
    expect(validateStepInputs(['v'], { v: value })).toEqual([]);
  });

  it.each([
    'a}\nscript:pre-request {',
    '{{process.env.DB_PASSWORD}}',
    '[ENTER X]',
    'a&b=c',
    'a?b',
    'line\nbreak',
    '',
    'x'.repeat(257),
  ])('rejects %j (it would break the .bru file or the query string)', (value) => {
    expect(validateStepInputs(['v'], { v: value })).toHaveLength(1);
  });

  it('rejects a non-string value', () => {
    expect(validateStepInputs(['v'], { v: 5 })).toHaveLength(1);
  });
});

describe('substituteStepInputs', () => {
  it('replaces the input token in the url line and params:query only', () => {
    const out = substituteStepInputs(STEP_01, { studentUniqueId: '604822' });
    expect(out).toContain('url: {{resourceBaseUrl}}/ed-fi/students?studentUniqueId=604822');
    expect(out).toContain('  studentUniqueId: 604822');
    expect(out).toContain('Example: [ENTER FIRST STUDENT UNIQUE ID] goes here');
  });

  it('leaves disabled (~) params untouched', () => {
    const out = substituteStepInputs(STEP_01, { studentUniqueId: '604822' });
    expect(out).toContain('~schoolId: [ENTER_SCHOOL_ID]');
  });

  it('throws, naming the key, when a provided input has no [ENTER ...] token to replace', () => {
    expect(() => substituteStepInputs(STEP_01, { studentUniqueId: '1', schoolId: '2' })).toThrow(
      'schoolId',
    );
  });

  it('handles the descriptor KEEP_IT_AT_THE_END param', () => {
    const step = [
      'get {',
      '  url: {{resourceBaseUrl}}/ed-fi/programs?programTypeDescriptor_KEEP_IT_AT_THE_END=[ENTER FIRST PROGRAM TYPE DESCRIPTOR]',
      '}',
      'params:query {',
      '  programTypeDescriptor_KEEP_IT_AT_THE_END: [ENTER FIRST PROGRAM TYPE DESCRIPTOR]',
      '}',
    ].join('\n');
    const out = substituteStepInputs(step, {
      programTypeDescriptor_KEEP_IT_AT_THE_END: 'uri://ed-fi.org/ProgramTypeDescriptor#Athletics',
    });
    expect(out).toContain('_KEEP_IT_AT_THE_END=uri://ed-fi.org/ProgramTypeDescriptor#Athletics');
  });
});

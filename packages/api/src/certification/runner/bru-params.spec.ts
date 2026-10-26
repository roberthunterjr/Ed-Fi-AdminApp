import { parseInputParams, parseQueryParams } from './bru-params';

const BRU = [
  'get {',
  '  url: {{resourceBaseUrl}}/ed-fi/schools?schoolId=[ENTER SCHOOL ID]',
  '}',
  '',
  'params:query {',
  '  localEducationAgencyId: [ENTER LEA ID]',
  '  schoolId: {{school_id}}',
  '',
  '  # a comment: [ENTER NOT AN INPUT]',
  '  ~disabledId: [ENTER_DISABLED_ID]',
  '  ~disabledContext: {{disabled_var}}',
  '  noColonLine',
  '  schoolYear: [ENTER school year]',
  '}',
  '',
  'docs {',
  '  other: [ENTER NOT IN QUERY]',
  '}',
].join('\n');

describe('parseQueryParams', () => {
  it('returns the enabled entries of params:query, skipping blanks, comments and ~ lines', () => {
    expect(parseQueryParams(BRU)).toEqual([
      { name: 'localEducationAgencyId', value: '[ENTER LEA ID]' },
      { name: 'schoolId', value: '{{school_id}}' },
      { name: 'schoolYear', value: '[ENTER school year]' },
    ]);
  });

  it('returns nothing when there is no params:query block', () => {
    expect(parseQueryParams('get {\n  url: x\n}')).toEqual([]);
  });

  it('copes with CRLF line endings', () => {
    expect(parseQueryParams('params:query {\r\n  a: [ENTER A]\r\n}\r\n')).toEqual([
      { name: 'a', value: '[ENTER A]' },
    ]);
  });
});

describe('parseInputParams', () => {
  it('returns the [ENTER ...] entries with their token and description', () => {
    expect(parseInputParams(BRU)).toEqual([
      { name: 'localEducationAgencyId', token: '[ENTER LEA ID]', description: 'LEA ID' },
      { name: 'schoolYear', token: '[ENTER school year]', description: 'school year' },
    ]);
  });

  it('gives a null description to a bare [ENTER]', () => {
    expect(parseInputParams('params:query {\n  a: [ENTER]\n}')).toEqual([
      { name: 'a', token: '[ENTER]', description: null },
    ]);
  });
});

import { MAX_CAPTURED_VARS_BYTES, sanitizeCapturedVars } from './captured-vars';

describe('sanitizeCapturedVars', () => {
  it('keeps a flat object of primitives', () => {
    const vars = { firstStudentUniqueId: 'abc123', credits: 3, active: true, exitDate: null };
    expect(sanitizeCapturedVars(vars)).toEqual(vars);
  });

  it('accepts an empty object (a step that wiped its values)', () => {
    expect(sanitizeCapturedVars({})).toEqual({});
  });

  it.each([
    ['an array', ['a']],
    ['a string', 'nope'],
    ['null', null],
    ['a nested object', { a: { b: 1 } }],
    ['a key with spaces', { 'bad key': 'x' }],
    ['a prototype key', JSON.parse('{"__proto__":"x"}')],
    ['a key that shadows resourceBaseUrl', { resourceBaseUrl: 'https://evil' }],
    ['a key that shadows oauthUrl', { oauthUrl: 'https://evil' }],
    ['a key that shadows edFiCertToken', { edFiCertToken: 'x' }],
    ['a key that shadows edFiCertTokenExpiration', { edFiCertTokenExpiration: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(sanitizeCapturedVars(value)).toBeNull();
  });

  it('rejects values larger than the size cap', () => {
    expect(sanitizeCapturedVars({ big: 'x'.repeat(MAX_CAPTURED_VARS_BYTES) })).toBeNull();
  });
});

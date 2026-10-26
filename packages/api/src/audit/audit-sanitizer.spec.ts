import { sanitizeText, stripQueryString } from './audit-sanitizer';

describe('sanitizeText', () => {
  it('strips control characters including newlines', () => {
    expect(sanitizeText('a\nb\u0000c', 10)).toBe('abc');
  });

  it('truncates to the max length', () => {
    expect(sanitizeText('x'.repeat(10000), 256)).toHaveLength(256);
  });

  it('returns null for empty or nullish input', () => {
    expect(sanitizeText('', 5)).toBeNull();
    expect(sanitizeText(undefined, 5)).toBeNull();
    expect(sanitizeText(null, 5)).toBeNull();
  });
});

describe('stripQueryString', () => {
  it('drops the query string and fragment', () => {
    expect(stripQueryString('/api/x?token=1#y')).toBe('/api/x');
  });

  it('returns urls without a query string unchanged', () => {
    expect(stripQueryString('/api/x')).toBe('/api/x');
  });
});

import { describe, expect, it } from 'vitest';
import { sanitizeTags, sanitizeText, validateMediaUrl } from '../sanitize';

describe('validateMediaUrl', () => {
  it('accepts http(s) and marks them external', () => {
    const r = validateMediaUrl('https://example.org/video.mp4');
    expect(r.ok).toBe(true);
    expect(r.isExternal).toBe(true);
  });
  it('blocks javascript:, data:, file: and credentials', () => {
    expect(validateMediaUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateMediaUrl('data:video/mp4;base64,AAAA').ok).toBe(false);
    expect(validateMediaUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateMediaUrl('https://user:pw@example.org/v.mp4').ok).toBe(false);
    expect(validateMediaUrl('').ok).toBe(false);
    expect(validateMediaUrl('not a url').ok).toBe(false);
  });
  it('accepts blob: as non-external', () => {
    const r = validateMediaUrl('blob:https://example.org/abc');
    expect(r.ok).toBe(true);
    expect(r.isExternal).toBe(false);
  });
});

describe('sanitizeText / sanitizeTags', () => {
  it('strips angle brackets and control characters and trims to max length', () => {
    expect(sanitizeText('<b>hola</b>\u0000', 10)).toBe('bhola/b');
    expect(sanitizeText('x'.repeat(50), 10)).toHaveLength(10);
    expect(sanitizeText(42, 10)).toBe('');
  });
  it('dedupes and caps tags', () => {
    expect(sanitizeTags(['a', 'a', '<b>', ''], 10, 5)).toEqual(['a', 'b']);
    expect(sanitizeTags(['1', '2', '3'], 2, 5)).toHaveLength(2);
    expect(sanitizeTags('nope', 2, 5)).toEqual([]);
  });
});

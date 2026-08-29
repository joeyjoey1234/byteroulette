import { describe, expect, it } from 'vitest';
import { sanitizeFilename } from './filename.js';

describe('sanitizeFilename', () => {
  it('preserves safe Unicode and removes path/control characters', () => {
    expect(sanitizeFilename('../雪/evil\u0000.txt')).toBe('_雪_evil_.txt');
  });
  it('replaces empty and reserved names', () => {
    expect(sanitizeFilename('...')).toBe('received-file');
    expect(sanitizeFilename('CON.txt')).toBe('received-file');
  });
  it('bounds names by Unicode code points', () => {
    expect(sanitizeFilename('a'.repeat(300))).toHaveLength(180);
  });
});

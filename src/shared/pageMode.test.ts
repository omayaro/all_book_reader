import { describe, expect, it } from 'vitest';
import {
  clampPage,
  parsePageInput,
  sanitizePageDigits,
  spreadPages,
  spreadStartPage,
  stepPage,
} from './pageMode';

describe('pageMode', () => {
  it('computes spread pairs', () => {
    expect(spreadStartPage(1)).toBe(1);
    expect(spreadStartPage(2)).toBe(1);
    expect(spreadStartPage(3)).toBe(3);
    expect(spreadPages(2, 5)).toEqual({ left: 1, right: 2 });
    expect(spreadPages(5, 5)).toEqual({ left: 5, right: null });
  });

  it('clamps and steps pages', () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(99, 10)).toBe(10);
    expect(stepPage(1, 10, 1, false)).toBe(2);
    expect(stepPage(1, 10, 1, true)).toBe(3);
    expect(stepPage(9, 10, 1, true)).toBe(10);
  });

  it('parses page number input', () => {
    expect(parsePageInput('12', 100)).toBe(12);
    expect(parsePageInput(' 3 ', 10)).toBe(3);
    expect(parsePageInput('999', 10)).toBe(10);
    expect(parsePageInput('0', 10)).toBeNull();
    expect(parsePageInput('ab', 10)).toBeNull();
    expect(parsePageInput('', 10)).toBeNull();
  });

  it('sanitizes page digits only', () => {
    expect(sanitizePageDigits('12a3')).toBe('123');
    expect(sanitizePageDigits('page 9')).toBe('9');
    expect(sanitizePageDigits('')).toBe('');
  });
});

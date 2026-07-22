import { describe, expect, it } from 'vitest';
import {
  estimateTxtByteOffset,
  estimateTxtScrollRatio,
  estimateTxtViewportByteOffset,
  preferNewlineSplit,
  txtSeekByte,
} from './txtChunk';

describe('preferNewlineSplit', () => {
  it('holds a partial trailing line when more data follows', () => {
    expect(preferNewlineSplit('a\nbc', true)).toEqual({ emit: 'a\n', hold: 'bc' });
    expect(preferNewlineSplit('abc', true)).toEqual({ emit: 'abc', hold: '' });
    expect(preferNewlineSplit('a\nbc', false)).toEqual({ emit: 'a\nbc', hold: '' });
  });
});

describe('txtSeekByte / estimateTxtScrollRatio', () => {
  it('maps ratio to byte offsets', () => {
    expect(txtSeekByte(1000, 0)).toBe(0);
    expect(txtSeekByte(1000, 0.5)).toBe(500);
    expect(txtSeekByte(1000, 1)).toBe(999);
  });

  it('estimates file progress from a loaded window', () => {
    expect(estimateTxtByteOffset(400, 600, 0)).toBe(400);
    expect(estimateTxtByteOffset(400, 600, 1)).toBe(600);
    expect(estimateTxtByteOffset(400, 600, 0.5)).toBe(500);
  });

  it('maps viewport top (scrollTop/scrollHeight) to file bytes', () => {
    // At top of stage → window start
    expect(estimateTxtViewportByteOffset(400, 600, 0, 1000)).toBe(400);
    // Halfway down the content → halfway through loaded bytes
    expect(estimateTxtViewportByteOffset(400, 600, 500, 1000)).toBe(500);
    // Near bottom: visible top is before EOF (not max-scroll = 1.0)
    expect(estimateTxtViewportByteOffset(400, 600, 900, 1000)).toBe(580);
    expect(estimateTxtScrollRatio(400, 600, 1000, 0, 1000)).toBe(0.4);
    expect(estimateTxtScrollRatio(400, 600, 1000, 500, 1000)).toBe(0.5);
  });
});

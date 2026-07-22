import { describe, expect, it } from 'vitest';
import {
  buildTxtPageStartsFromLength,
  clampTxtPage,
  TXT_PAGE_TARGET_BYTES,
  txtPageForByteOffset,
} from './txtPages';

describe('txtPages', () => {
  it('clamps page numbers', () => {
    expect(clampTxtPage(0, 10)).toBe(1);
    expect(clampTxtPage(99, 10)).toBe(10);
    expect(clampTxtPage(3.9, 10)).toBe(3);
  });

  it('builds newline-aligned page starts', () => {
    // Fake file: newline every 100 bytes; alignAfter jumps to next multiple of 100.
    const byteLength = 1000;
    const alignAfter = (from: number) => Math.min(byteLength, Math.ceil(from / 100) * 100);
    const starts = buildTxtPageStartsFromLength(byteLength, 250, alignAfter);
    expect(starts[0]).toBe(0);
    expect(starts.length).toBeGreaterThan(1);
    for (let i = 1; i < starts.length; i += 1) {
      expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
      expect(starts[i]! % 100).toBe(0);
    }
  });

  it('maps byte offset to page index', () => {
    const starts = [0, 100, 200, 350];
    expect(txtPageForByteOffset(starts, 0)).toBe(1);
    expect(txtPageForByteOffset(starts, 99)).toBe(1);
    expect(txtPageForByteOffset(starts, 100)).toBe(2);
    expect(txtPageForByteOffset(starts, 340)).toBe(3);
    expect(txtPageForByteOffset(starts, 400)).toBe(4);
  });

  it('uses an 8KiB target by default', () => {
    expect(TXT_PAGE_TARGET_BYTES).toBe(8 * 1024);
  });
});

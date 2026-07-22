import { describe, expect, it } from 'vitest';
import { pageFromStripOffset, txtThumbPreviewText, visibleStripPages } from './pageStrip';

describe('pageStrip', () => {
  it('computes visible page range with overscan', () => {
    expect(visibleStripPages(0, 300, 100, 100, 1)).toEqual({ start: 1, end: 5 });
    expect(visibleStripPages(500, 200, 100, 100, 0)).toEqual({ start: 6, end: 8 });
  });

  it('maps strip offset to page', () => {
    expect(pageFromStripOffset(0, 50, 100)).toBe(1);
    expect(pageFromStripOffset(250, 50, 100)).toBe(3);
    expect(pageFromStripOffset(99999, 50, 100)).toBe(50);
  });

  it('compacts TXT thumb preview text', () => {
    expect(txtThumbPreviewText('  a\n\nb  c  ', 5)).toBe('a b c'.slice(0, 5));
    expect(txtThumbPreviewText('hello   world')).toBe('hello world');
  });
});

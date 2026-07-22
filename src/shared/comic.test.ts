import { describe, expect, it } from 'vitest';
import {
  arrowKeyPageDelta,
  comicSpreadPages,
  filterAndSortImagePaths,
  isImageFile,
  naturalCompare,
} from './comic';

describe('comic', () => {
  it('detects image files', () => {
    expect(isImageFile('a.JPG')).toBe(true);
    expect(isImageFile('b.webp')).toBe(true);
    expect(isImageFile('note.txt')).toBe(false);
  });

  it('natural-sorts page names', () => {
    expect(naturalCompare('page2.jpg', 'page10.jpg')).toBeLessThan(0);
    expect(
      filterAndSortImagePaths(['10.png', '2.png', 'readme.txt', '1.png']),
    ).toEqual(['1.png', '2.png', '10.png']);
  });

  it('places spread pages for LTR and RTL', () => {
    expect(comicSpreadPages(1, 5, 'ltr')).toEqual({ left: 1, right: 2 });
    expect(comicSpreadPages(1, 5, 'rtl')).toEqual({ left: 2, right: 1 });
    expect(comicSpreadPages(5, 5, 'rtl')).toEqual({ left: null, right: 5 });
  });

  it('maps arrow keys to next/prev by reading direction', () => {
    expect(arrowKeyPageDelta('ArrowRight', 'ltr')).toBe(1);
    expect(arrowKeyPageDelta('ArrowLeft', 'ltr')).toBe(-1);
    expect(arrowKeyPageDelta('ArrowLeft', 'rtl')).toBe(1);
    expect(arrowKeyPageDelta('ArrowRight', 'rtl')).toBe(-1);
  });
});

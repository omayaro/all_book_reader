import { describe, expect, it } from 'vitest';
import {
  arrowKeyPageDelta,
  comicImageDisplaySize,
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

  it('sizes comic images to the container for single and two-page', () => {
    const single = comicImageDisplaySize(1000, 2000, 800, 600, 'single', 'fit-page', 1);
    expect(single.width).toBe(300);
    expect(single.height).toBe(600);

    const two = comicImageDisplaySize(1000, 2000, 800, 600, 'two', 'fit-page', 1);
    expect(two.width).toBeLessThanOrEqual((800 - 12) / 2);
    expect(two.height).toBe(600);

    const zoomedOut = comicImageDisplaySize(1000, 2000, 800, 600, 'single', 'fit-width', 0.1);
    expect(zoomedOut.width).toBe(80);
    expect(zoomedOut.height).toBe(160);
  });

  it('floors display size so fit-edge rounding cannot exceed the viewport', () => {
    // 801 * (800/801) = 800 exactly with round would be 800; floor stays <= available.
    const sized = comicImageDisplaySize(801, 801, 800, 800, 'single', 'fit-width', 1);
    expect(sized.width).toBeLessThanOrEqual(800);
    expect(sized.height).toBeLessThanOrEqual(800);
  });
});

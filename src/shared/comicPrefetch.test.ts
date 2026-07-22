import { describe, expect, it } from 'vitest';
import { comicPrefetchPages } from './comicPrefetch';

describe('comicPrefetchPages', () => {
  it('prefetches neighbors in single-page mode', () => {
    expect(comicPrefetchPages(5, 10, 'single', 2)).toEqual([3, 4, 5, 6, 7]);
    expect(comicPrefetchPages(1, 10, 'single', 2)).toEqual([1, 2, 3]);
    expect(comicPrefetchPages(10, 10, 'single', 2)).toEqual([8, 9, 10]);
  });

  it('prefetches neighboring spreads in two-page mode', () => {
    expect(comicPrefetchPages(5, 12, 'two', 1)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(comicPrefetchPages(1, 5, 'two', 1)).toEqual([1, 2, 3, 4]);
    expect(comicPrefetchPages(5, 5, 'two', 1)).toEqual([3, 4, 5]);
  });
});

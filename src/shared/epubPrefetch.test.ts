import { describe, expect, it } from 'vitest';
import { epubInitialWarmSpine, epubPrefetchSpine } from './epubPrefetch';

describe('epubPrefetchSpine', () => {
  it('prefetches neighbors around the current spine item', () => {
    expect(epubPrefetchSpine(4, 10, 2)).toEqual([2, 3, 4, 5, 6]);
    expect(epubPrefetchSpine(0, 10, 2)).toEqual([0, 1, 2]);
    expect(epubPrefetchSpine(9, 10, 2)).toEqual([7, 8, 9]);
  });
});

describe('epubInitialWarmSpine', () => {
  it('warms about 10 spine items ahead from the opening chapter', () => {
    expect(epubInitialWarmSpine(0, 20)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(epubInitialWarmSpine(17, 20)).toEqual([17, 18, 19]);
  });
});

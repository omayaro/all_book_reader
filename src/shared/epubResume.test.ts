import { describe, expect, it } from 'vitest';
import {
  epubPageFromSpineIndex,
  epubResumeSpineIndex,
  epubSavedTotalIsLocationMap,
} from './epubResume';

describe('epubResumeSpineIndex', () => {
  it('opens the first spine item when lastPage is 1', () => {
    expect(epubResumeSpineIndex(1, 1, 12)).toBe(0);
    expect(epubResumeSpineIndex(1, 800, 12)).toBe(0);
  });

  it('maps a mid-book location page onto a later spine item', () => {
    expect(epubResumeSpineIndex(400, 800, 12)).toBe(5);
    expect(epubResumeSpineIndex(800, 800, 12)).toBe(11);
  });

  it('does not start at chapter 1 when lastPage > 1', () => {
    expect(epubResumeSpineIndex(50, 200, 10)).toBeGreaterThan(0);
  });

  it('round-trips a location-style page through a spine index', () => {
    const total = 198;
    const spine = 69;
    for (const page of [1, 20, 99, 150, 198]) {
      const index = epubResumeSpineIndex(page, total, spine);
      expect(epubResumeSpineIndex(epubPageFromSpineIndex(index, total, spine), total, spine)).toBe(
        index,
      );
    }
  });

  it('maps spine index 0 to page 1 and the last spine to the last page', () => {
    expect(epubPageFromSpineIndex(0, 198, 69)).toBe(1);
    expect(epubPageFromSpineIndex(68, 198, 69)).toBe(198);
    expect(epubPageFromSpineIndex(10, 69, 69)).toBe(11);
  });
});

describe('epubSavedTotalIsLocationMap', () => {
  it('treats spine-sized totals as temporary', () => {
    expect(epubSavedTotalIsLocationMap(69, 69)).toBe(false);
    expect(epubSavedTotalIsLocationMap(1, 12)).toBe(false);
  });

  it('treats a much larger total as generated locations', () => {
    expect(epubSavedTotalIsLocationMap(800, 69)).toBe(true);
  });
});

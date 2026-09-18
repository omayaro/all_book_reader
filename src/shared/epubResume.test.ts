import { describe, expect, it } from 'vitest';
import {
  epubAcceptLivePage,
  epubNavDelta,
  epubOpeningSpineIndices,
  epubPageFromSpineIndex,
  epubPersistedPage,
  epubResumeSpineIndex,
  epubSavedTotalIsLocationMap,
  epubStepPage,
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

  it('treats a larger generated location count as a location map', () => {
    expect(epubSavedTotalIsLocationMap(800, 69)).toBe(true);
    expect(epubSavedTotalIsLocationMap(98, 69)).toBe(true);
  });
});

describe('epubPersistedPage', () => {
  it('does not persist page 1 when a later spine is visible', () => {
    expect(epubPersistedPage(6, 69, 98, 0, 98)).toBe(epubPageFromSpineIndex(6, 98, 69));
    expect(epubPersistedPage(6, 69, 98, 0, 98)).toBeGreaterThan(1);
  });

  it('keeps a matching CFI location when it agrees with the spine', () => {
    expect(epubPersistedPage(0, 69, 98, 0, 98)).toBe(1);
  });
});

describe('epubOpeningSpineIndices', () => {
  it('includes the paired page in two-page mode', () => {
    expect(epubOpeningSpineIndices(6, false)).toEqual([6]);
    expect(epubOpeningSpineIndices(6, true)).toEqual([6, 7]);
  });
});

describe('epubStepPage', () => {
  it('advances one page at a time from page 1', () => {
    let page = 1;
    for (let i = 0; i < 10; i += 1) page = epubStepPage(page, 1, 198);
    expect(page).toBe(11);
  });

  it('does not produce spine-ratio pages like 18 or 1339', () => {
    expect(epubStepPage(1, 1, 198)).toBe(2);
    expect(epubStepPage(1, 1, 1339)).toBe(2);
    expect(epubStepPage(2, -1, 198)).toBe(1);
  });
});

describe('epubNavDelta', () => {
  it('uses spine order then percentage inside a chapter', () => {
    expect(epubNavDelta(0, 1)).toBe(1);
    expect(epubNavDelta(4, 3)).toBe(-1);
    expect(epubNavDelta(2, 2, 0.1, 0.4)).toBe(1);
    expect(epubNavDelta(2, 2, 0.4, 0.1)).toBe(-1);
    expect(epubNavDelta(2, 2, 0.2, 0.2)).toBe(0);
  });
});

describe('epubAcceptLivePage', () => {
  it('discards ratio and location-index jumps', () => {
    expect(epubAcceptLivePage(1, 18, 198)).toBe(1);
    expect(epubAcceptLivePage(1, 1339, 1339)).toBe(1);
    expect(epubAcceptLivePage(5, 6, 100)).toBe(6);
    expect(epubAcceptLivePage(5, 7, 100)).toBe(7);
  });
});

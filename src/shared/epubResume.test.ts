import { describe, expect, it } from 'vitest';
import { epubResumeSpineIndex } from './epubResume';

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
});

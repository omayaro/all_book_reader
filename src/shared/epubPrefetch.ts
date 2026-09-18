import { clampPage } from './pageMode';

/** Spine items ahead/behind the current chapter to keep warm. */
export const EPUB_PREFETCH_RADIUS = 2;

/** After open, warm this many spine items so the next turns feel instant. */
export const EPUB_INITIAL_WARM_COUNT = 10;

/**
 * 0-based linear spine indices to keep loaded around the current chapter.
 */
export function epubPrefetchSpine(
  spineIndex: number,
  spineLength: number,
  radius: number = EPUB_PREFETCH_RADIUS,
): number[] {
  if (spineLength < 1) return [];
  const center = Math.min(spineLength - 1, Math.max(0, Math.floor(spineIndex)));
  const r = Math.max(0, Math.floor(radius));
  const indices: number[] = [];
  for (let i = center - r; i <= center + r; i += 1) {
    if (i >= 0 && i < spineLength) indices.push(i);
  }
  return indices;
}

/**
 * 0-based linear spine indices to prefetch after first paint (does not block display).
 */
export function epubInitialWarmSpine(
  spineIndex: number,
  spineLength: number,
  count: number = EPUB_INITIAL_WARM_COUNT,
): number[] {
  if (spineLength < 1 || count < 1) return [];
  const start = Math.min(spineLength - 1, Math.max(0, Math.floor(spineIndex)));
  const indices: number[] = [];
  for (let i = start; i < spineLength && indices.length < count; i += 1) {
    indices.push(i);
  }
  return indices;
}

/** Clamp a 0-based spine index. */
export function clampSpineIndex(index: number, spineLength: number): number {
  if (spineLength < 1) return 0;
  return clampPage(index + 1, spineLength) - 1;
}

import { spreadStartPage, clampPage } from './pageMode';
import type { PageMode } from '../types';

/** How many page-steps ahead/behind to keep warm (single: pages, two: spreads). */
export const COMIC_PREFETCH_RADIUS = 2;

/**
 * 1-based page numbers to keep loaded around the current view.
 * Includes the current page (and spread partner in two-page mode).
 */
export function comicPrefetchPages(
  page: number,
  totalPages: number,
  pageMode: PageMode,
  radius: number = COMIC_PREFETCH_RADIUS,
): number[] {
  if (totalPages < 1) return [];
  const step = pageMode === 'two' ? 2 : 1;
  const center =
    pageMode === 'two' ? spreadStartPage(page) : clampPage(page, totalPages);
  const pages = new Set<number>();
  const r = Math.max(0, Math.floor(radius));
  for (let d = -r; d <= r; d += 1) {
    const start = center + d * step;
    if (start < 1 || start > totalPages) continue;
    pages.add(start);
    if (pageMode === 'two' && start + 1 <= totalPages) {
      pages.add(start + 1);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

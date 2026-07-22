import { clampPage } from './pageMode';

export const PAGE_STRIP_ITEM_HEIGHT = 112;
export const PAGE_STRIP_OVERSCAN = 4;

/** Inclusive 1-based page range visible in a virtualized strip. */
export function visibleStripPages(
  scrollTop: number,
  viewportHeight: number,
  totalPages: number,
  itemHeight: number = PAGE_STRIP_ITEM_HEIGHT,
  overscan: number = PAGE_STRIP_OVERSCAN,
): { start: number; end: number } {
  const total = Math.max(0, Math.floor(totalPages));
  if (total < 1) return { start: 1, end: 0 };
  const firstIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const lastIndex = Math.min(
    total - 1,
    Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan,
  );
  return { start: firstIndex + 1, end: lastIndex + 1 };
}

/** Map a Y position inside the strip content to a 1-based page. */
export function pageFromStripOffset(
  offsetY: number,
  totalPages: number,
  itemHeight: number = PAGE_STRIP_ITEM_HEIGHT,
): number {
  const index = Math.floor(offsetY / itemHeight);
  return clampPage(index + 1, totalPages);
}

/** Compact preview text drawn into TXT strip thumbnails. */
export function txtThumbPreviewText(text: string, maxChars = 220): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

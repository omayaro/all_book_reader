import { clampPage } from './pageMode';
import { epubPageFromSpineIndex, epubResumeSpineIndex } from './epubResume';

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

/** Strip tags/entities from a chapter so the strip can show real page text. */
export function htmlToThumbText(html: string): string {
  const without = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : ' ';
    });
  return without.replace(/\s+/g, ' ').trim();
}

/** First raster image href in chapter HTML, if any. */
export function firstHtmlImgSrc(html: string): string | null {
  const match = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  const src = match?.[1]?.trim() ?? '';
  if (!src || /^data:/i.test(src)) return null;
  return src;
}

/**
 * Slice chapter text so adjacent location-pages in the same spine
 * show different preview windows.
 */
export function epubThumbPreviewText(
  chapterText: string,
  page: number,
  totalPages: number,
  spineLength: number,
  maxChars = 220,
): string {
  const text = chapterText.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const spines = Math.max(1, Math.floor(spineLength) || 1);
  const total = Math.max(1, Math.floor(totalPages) || 1);
  const index = epubResumeSpineIndex(page, total, spines);
  const startPage = epubPageFromSpineIndex(index, total, spines);
  const endPage =
    index + 1 < spines ? epubPageFromSpineIndex(index + 1, total, spines) : total + 1;
  const span = Math.max(1, endPage - startPage);
  const offset = Math.max(0, Math.floor(page) - startPage);
  const maxStart = Math.max(0, text.length - maxChars);
  const from =
    span <= 1 ? 0 : Math.min(maxStart, Math.round((offset / Math.max(1, span - 1)) * maxStart));
  return txtThumbPreviewText(text.slice(from), maxChars);
}

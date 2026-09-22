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

/** Strip tags/entities from a chapter so the strip can show real page text. */
export function htmlToThumbText(html: string): string {
  const without = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<title\b[\s\S]*?<\/title>/gi, ' ')
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
    })
    .replace(/\bpage-\d+\b/gi, ' ');
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
 * Chapter preview for one spine item. Does not slide the same HTML across
 * multiple strip slots — uniqueness comes from one slot per file.
 */
export function epubThumbPreviewText(
  chapterText: string,
  _page?: number,
  _totalPages?: number,
  _spineLength?: number,
  maxChars = 220,
): string {
  return txtThumbPreviewText(chapterText.replace(/\s+/g, ' ').trim(), maxChars);
}

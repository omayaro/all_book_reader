import { getExtension } from './format';
import { spreadStartPage } from './pageMode';

export type ReadingDirection = 'ltr' | 'rtl';

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
]);

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(filePath));
}

/** Natural sort so page2 comes before page10. */
export function naturalCompare(a: string, b: string): number {
  const ax: Array<string | number> = [];
  const bx: Array<string | number> = [];
  a.replace(/(\d+)|(\D+)/g, (_, num: string, text: string) => {
    ax.push(num ? Number(num) : text.toLowerCase());
    return '';
  });
  b.replace(/(\d+)|(\D+)/g, (_, num: string, text: string) => {
    bx.push(num ? Number(num) : text.toLowerCase());
    return '';
  });
  const len = Math.max(ax.length, bx.length);
  for (let i = 0; i < len; i += 1) {
    if (ax[i] === undefined) return -1;
    if (bx[i] === undefined) return 1;
    if (ax[i] === bx[i]) continue;
    return ax[i]! < bx[i]! ? -1 : 1;
  }
  return 0;
}

export function filterAndSortImagePaths(paths: string[]): string[] {
  return paths.filter(isImageFile).sort(naturalCompare);
}

export function isReadingDirection(value: unknown): value is ReadingDirection {
  return value === 'ltr' || value === 'rtl';
}

/**
 * Two-page spread placement.
 * LTR: left=N, right=N+1
 * RTL: right=N, left=N+1 (page 1 on the right)
 */
export function comicSpreadPages(
  page: number,
  totalPages: number,
  direction: ReadingDirection,
): { left: number | null; right: number | null } {
  const start = spreadStartPage(page);
  const first = start;
  const second = start + 1 <= totalPages ? start + 1 : null;
  if (direction === 'ltr') {
    return { left: first, right: second };
  }
  return { left: second, right: first };
}

/**
 * Arrow-key page delta for reading direction.
 * LTR: Right = next (+1), Left = previous (-1)
 * RTL: Left = next (+1), Right = previous (-1)
 */
export function arrowKeyPageDelta(
  key: 'ArrowLeft' | 'ArrowRight',
  direction: ReadingDirection,
): number {
  if (direction === 'ltr') {
    return key === 'ArrowRight' ? 1 : -1;
  }
  return key === 'ArrowLeft' ? 1 : -1;
}

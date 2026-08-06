import { naturalCompare, isImageFile } from './comic';
import { isSupportedBookFile } from './format';

/** Book formats plus standalone image files eligible for PageUp/PageDown folder nav. */
export function isNavigableBookFileName(fileName: string): boolean {
  return isSupportedBookFile(fileName) || isImageFile(fileName);
}

/**
 * Next/previous basename in the same folder by natural name order.
 * `dirEntries` should already be filtered to navigable files (or sibling folders).
 */
export function resolveFolderSiblingBasename(
  currentBase: string,
  dirEntries: string[],
  delta: number,
): string | null {
  if (!Number.isFinite(delta) || delta === 0) return null;
  if (!currentBase || currentBase === '.' || currentBase === '..') return null;

  const sorted = [...new Set(dirEntries)].sort(naturalCompare);
  const currentLower = currentBase.toLowerCase();
  const index = sorted.findIndex((name) => name.toLowerCase() === currentLower);
  if (index < 0) return null;

  const sibling = sorted[index + delta];
  return sibling ?? null;
}

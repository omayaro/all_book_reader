import { naturalCompare, isImageFile } from './comic';
import { isSupportedBookFile } from './format';

/** Book formats plus standalone image files eligible for PageUp/PageDown folder nav. */
export function isNavigableBookFileName(fileName: string): boolean {
  return isSupportedBookFile(fileName) || isImageFile(fileName);
}

function entryKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
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

  const sorted = [...new Set(dirEntries.map((name) => name.normalize('NFC')))].sort(
    naturalCompare,
  );
  const currentKey = entryKey(currentBase);
  const index = sorted.findIndex((name) => entryKey(name) === currentKey);
  if (index < 0) return null;

  const sibling = sorted[index + delta];
  return sibling ?? null;
}

import { clampPage } from './pageMode';

/**
 * Map a saved location-style page onto a 0-based linear spine index.
 * Uses lastPage / totalPages ratio so a previous locations.generate index
 * opens near the same chapter before CFI locations are ready.
 */
export function epubResumeSpineIndex(
  lastPage: number,
  totalPages: number,
  spineLength: number,
): number {
  if (spineLength < 1) return 0;
  const page = clampPage(lastPage, Math.max(1, totalPages));
  const total = Math.max(1, Math.floor(totalPages) || 1);
  if (total <= 1 || page <= 1) return 0;
  const ratio = (page - 1) / Math.max(1, total - 1);
  return Math.min(spineLength - 1, Math.round(ratio * (spineLength - 1)));
}

/** Inverse of epubResumeSpineIndex: persist a 1-based page from the visible spine. */
export function epubPageFromSpineIndex(
  spineIndex: number,
  totalPages: number,
  spineLength: number,
): number {
  if (spineLength < 1) return 1;
  const index = Math.min(spineLength - 1, Math.max(0, Math.floor(spineIndex)));
  const total = Math.max(1, Math.floor(totalPages) || 1);
  if (total <= 1 || spineLength === 1) return 1;
  if (total === spineLength) return index + 1;
  return Math.min(total, Math.round((index / (spineLength - 1)) * (total - 1)) + 1);
}

/** True when saved totalPages is from locations.generate, not temporary spine length. */
export function epubSavedTotalIsLocationMap(savedTotalPages: number, spineLength: number): boolean {
  const spine = Math.max(1, Math.floor(spineLength) || 1);
  const saved = Math.max(0, Math.floor(savedTotalPages) || 0);
  return saved > spine;
}

/**
 * Page number to persist from the visible spine.
 * Ignores CFI locations that collapse to page 1 while a later chapter is on screen.
 */
export function epubPersistedPage(
  spineIndex: number,
  spineLength: number,
  fallbackTotal: number,
  locationFromCfi?: number,
  locationTotal?: number,
): number {
  const locTotal = Math.max(0, Math.floor(locationTotal || 0));
  const total = locTotal > 1 ? locTotal : Math.max(1, Math.floor(fallbackTotal) || 1);
  const spinePage = epubPageFromSpineIndex(spineIndex, total, spineLength);
  if (locTotal < 1 || locationFromCfi == null || !Number.isFinite(locationFromCfi) || locationFromCfi < 0) {
    return spinePage;
  }
  const cfiPage = clampPage(locationFromCfi + 1, locTotal);
  if (spineIndex > 0 && cfiPage <= 1) return spinePage;
  return cfiPage;
}

/** Spine indices that belong to the first painted spread, not a user page turn. */
export function epubOpeningSpineIndices(spineIndex: number, twoPage: boolean): number[] {
  const index = Math.max(0, Math.floor(spineIndex));
  return twoPage ? [index, index + 1] : [index];
}

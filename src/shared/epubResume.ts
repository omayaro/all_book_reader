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

/** True when saved totalPages is from locations.generate, not temporary spine length. */
export function epubSavedTotalIsLocationMap(savedTotalPages: number, spineLength: number): boolean {
  const spine = Math.max(1, Math.floor(spineLength) || 1);
  const saved = Math.max(0, Math.floor(savedTotalPages) || 0);
  return saved > spine * 2;
}

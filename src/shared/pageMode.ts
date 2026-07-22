/** For PDF spread: left page of the pair containing `page` (1-based). */
export function spreadStartPage(page: number): number {
  const p = Math.max(1, Math.floor(page));
  return p % 2 === 0 ? p - 1 : p;
}

export function spreadPages(
  page: number,
  totalPages: number,
): { left: number; right: number | null } {
  const left = spreadStartPage(page);
  const right = left + 1 <= totalPages ? left + 1 : null;
  return { left, right };
}

export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(totalPages) || totalPages < 1) return 1;
  if (!Number.isFinite(page)) return 1;
  return Math.min(totalPages, Math.max(1, Math.floor(page)));
}

export function stepPage(
  page: number,
  totalPages: number,
  delta: number,
  twoPage: boolean,
): number {
  const step = twoPage ? 2 : 1;
  return clampPage(page + delta * step, totalPages);
}

/** Keep digits only for the page number field. */
export function sanitizePageDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Parse user page input (e.g. "12") into a clamped 1-based page, or null if invalid. */
export function parsePageInput(raw: string, totalPages: number): number | null {
  const trimmed = sanitizePageDigits(raw);
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 1) return null;
  return clampPage(value, totalPages);
}

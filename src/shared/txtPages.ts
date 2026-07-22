/** Target payload per TXT page (Option B: fixed chunk pages). */
export const TXT_PAGE_TARGET_BYTES = 8 * 1024;

export function clampTxtPage(page: number, totalPages: number): number {
  const total = Math.max(1, Math.floor(totalPages) || 1);
  if (!Number.isFinite(page)) return 1;
  return Math.min(total, Math.max(1, Math.floor(page)));
}

/**
 * 1-based page index for a byte offset given monotonic page start offsets.
 * Picks the last page whose start is <= offset.
 */
export function txtPageForByteOffset(pageStarts: number[], byteOffset: number): number {
  if (pageStarts.length === 0) return 1;
  const offset = Math.max(0, Math.floor(byteOffset));
  let lo = 0;
  let hi = pageStarts.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = pageStarts[mid]!;
    if (start <= offset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans + 1;
}

/** Advance pageStarts by repeatedly taking ~target bytes, aligned to newlines. */
export function buildTxtPageStartsFromLength(
  byteLength: number,
  targetBytes: number,
  alignAfter: (from: number) => number,
): number[] {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return [0];
  const target = Math.max(1, Math.floor(targetBytes) || TXT_PAGE_TARGET_BYTES);
  const starts = [0];
  let pos = 0;
  while (pos < byteLength) {
    let next = Math.min(pos + target, byteLength);
    if (next < byteLength) {
      const aligned = alignAfter(next);
      next = aligned > pos ? aligned : Math.min(pos + target, byteLength);
    }
    if (next <= pos) {
      next = Math.min(pos + target, byteLength);
    }
    if (next >= byteLength) break;
    pos = next;
    starts.push(pos);
  }
  return starts;
}

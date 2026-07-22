import { clampScrollRatio } from './recent';

/** Prefer splitting after a newline so chunks stay readable. */
export function preferNewlineSplit(chunk: string, hasMore: boolean): {
  emit: string;
  hold: string;
} {
  if (!hasMore || chunk.length === 0) {
    return { emit: chunk, hold: '' };
  }
  const lastNl = chunk.lastIndexOf('\n');
  if (lastNl < 0 || lastNl === chunk.length - 1) {
    return { emit: chunk, hold: '' };
  }
  return {
    emit: chunk.slice(0, lastNl + 1),
    hold: chunk.slice(lastNl + 1),
  };
}

/** Map a 0–1 resume ratio to a file byte offset. */
export function txtSeekByte(byteLength: number, ratio: number): number {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return 0;
  const r = clampScrollRatio(ratio);
  if (r <= 0) return 0;
  if (r >= 1) return Math.max(0, byteLength - 1);
  return Math.min(byteLength - 1, Math.floor(byteLength * r));
}

export function clampTxtByteOffset(offset: number, byteLength: number): number {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return 0;
  if (!Number.isFinite(offset) || offset <= 0) return 0;
  return Math.min(byteLength - 1, Math.max(0, Math.floor(offset)));
}

/**
 * File byte at the top of the visible viewport inside a loaded window.
 * Uses scrollTop/scrollHeight (not max-scroll) so the visible top maps correctly.
 */
export function estimateTxtViewportByteOffset(
  windowStart: number,
  windowEnd: number,
  scrollTop: number,
  scrollHeight: number,
): number {
  const span = Math.max(0, windowEnd - windowStart);
  if (span <= 0) return Math.max(0, Math.floor(windowStart));
  if (!Number.isFinite(scrollHeight) || scrollHeight <= 0) {
    return Math.max(0, Math.floor(windowStart));
  }
  const top = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  const frac = Math.min(1, top / scrollHeight);
  return Math.floor(windowStart + frac * span);
}

/** @deprecated Prefer estimateTxtViewportByteOffset for viewport-top resume. */
export function estimateTxtByteOffset(
  windowStart: number,
  position: number,
  viewRatio: number,
): number {
  const span = Math.max(0, position - windowStart);
  const local = clampScrollRatio(viewRatio);
  return Math.floor(windowStart + local * span);
}

/** Combine file window + viewport top into a 0–1 file progress ratio. */
export function estimateTxtScrollRatio(
  windowStart: number,
  position: number,
  byteLength: number,
  scrollTop: number,
  scrollHeight: number,
): number {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return 0;
  return clampScrollRatio(
    estimateTxtViewportByteOffset(windowStart, position, scrollTop, scrollHeight) / byteLength,
  );
}

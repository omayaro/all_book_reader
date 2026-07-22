import { clampPage } from './pageMode';

export interface ReadingPosition {
  bookId: string;
  page: number;
  totalPages: number;
}

export function createReadingPosition(
  bookId: string,
  page: number,
  totalPages: number,
): ReadingPosition {
  return {
    bookId,
    page: clampPage(page, totalPages),
    totalPages: Math.max(1, Math.floor(totalPages) || 1),
  };
}

export function serializeReadingPosition(pos: ReadingPosition): string {
  return JSON.stringify(pos);
}

export function deserializeReadingPosition(raw: string): ReadingPosition | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ReadingPosition>;
    if (typeof parsed.bookId !== 'string' || typeof parsed.page !== 'number') {
      return null;
    }
    const total = typeof parsed.totalPages === 'number' ? parsed.totalPages : 1;
    return createReadingPosition(parsed.bookId, parsed.page, total);
  } catch {
    return null;
  }
}

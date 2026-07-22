import type { BookFormat, RecentBook } from '../types';
import { getBookTitle } from './format';

export interface UpsertRecentInput {
  id: string;
  path: string;
  format: BookFormat;
  lastPage?: number;
  totalPages?: number;
  title?: string;
  lastOpenedAt?: string;
  missing?: boolean;
}

export function upsertRecentBook(
  list: RecentBook[],
  input: UpsertRecentInput,
  maxRecent = 20,
): RecentBook[] {
  const now = input.lastOpenedAt ?? new Date().toISOString();
  const existing = list.find((b) => b.id === input.id || b.path === input.path);
  const next: RecentBook = {
    id: input.id,
    path: input.path,
    title: input.title ?? existing?.title ?? getBookTitle(input.path),
    lastOpenedAt: now,
    lastPage: input.lastPage ?? existing?.lastPage ?? 1,
    totalPages: input.totalPages ?? existing?.totalPages ?? 1,
    format: input.format,
    missing: input.missing ?? false,
  };

  const filtered = list.filter((b) => b.id !== next.id && b.path !== next.path);
  return [next, ...filtered].slice(0, Math.max(1, maxRecent));
}

export function updateRecentProgress(
  list: RecentBook[],
  idOrPath: string,
  lastPage: number,
  totalPages?: number,
): RecentBook[] {
  return list.map((book) => {
    if (book.id !== idOrPath && book.path !== idOrPath) return book;
    return {
      ...book,
      lastPage,
      totalPages: totalPages ?? book.totalPages,
      lastOpenedAt: new Date().toISOString(),
      missing: false,
    };
  });
}

export function markMissingBooks(
  list: RecentBook[],
  existingPaths: Set<string>,
): RecentBook[] {
  return list.map((book) => ({
    ...book,
    missing: !existingPaths.has(book.path),
  }));
}

export function removeRecentBook(list: RecentBook[], idOrPath: string): RecentBook[] {
  return list.filter((book) => book.id !== idOrPath && book.path !== idOrPath);
}

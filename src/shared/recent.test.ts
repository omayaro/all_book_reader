import { describe, expect, it } from 'vitest';
import {
  clearRecentBooks,
  markMissingBooks,
  removeRecentBook,
  updateRecentProgress,
  upsertRecentBook,
} from './recent';
import type { RecentBook } from '../types';

function book(partial: Partial<RecentBook> & Pick<RecentBook, 'id' | 'path'>): RecentBook {
  return {
    title: partial.title ?? 't',
    lastOpenedAt: partial.lastOpenedAt ?? '2026-01-01T00:00:00.000Z',
    lastPage: partial.lastPage ?? 1,
    totalPages: partial.totalPages ?? 10,
    format: partial.format ?? 'pdf',
    missing: partial.missing ?? false,
    id: partial.id,
    path: partial.path,
    lastScrollRatio: partial.lastScrollRatio,
    lastByteOffset: partial.lastByteOffset,
  };
}

describe('recent', () => {
  it('upserts to front and caps at maxRecent', () => {
    let list: RecentBook[] = [];
    for (let i = 0; i < 25; i += 1) {
      list = upsertRecentBook(
        list,
        { id: `id-${i}`, path: `C:\\b\\${i}.pdf`, format: 'pdf' },
        20,
      );
    }
    expect(list).toHaveLength(20);
    expect(list[0]?.id).toBe('id-24');
  });

  it('updates progress and removes entries', () => {
    const list = [
      book({ id: 'a', path: 'C:\\a.pdf', lastPage: 1 }),
      book({ id: 'b', path: 'C:\\b.pdf' }),
    ];
    const updated = updateRecentProgress(list, 'a', 5, 12, 0.42, 12_345);
    expect(updated[0]?.lastPage).toBe(5);
    expect(updated[0]?.totalPages).toBe(12);
    expect(updated[0]?.lastScrollRatio).toBe(0.42);
    expect(updated[0]?.lastByteOffset).toBe(12_345);
    expect(removeRecentBook(updated, 'b')).toHaveLength(1);
  });

  it('preserves byte offset when only ratio is updated', () => {
    const list = [book({ id: 't', path: 'C:\\t.txt', format: 'txt', lastByteOffset: 9000 })];
    const updated = updateRecentProgress(list, 't', 1, 1, 0.5);
    expect(updated[0]?.lastScrollRatio).toBe(0.5);
    expect(updated[0]?.lastByteOffset).toBe(9000);
  });

  it('clears all recent books so reopen starts at page 1', () => {
    const list = [
      book({ id: 'a', path: 'C:\\a.pdf', lastPage: 9, lastByteOffset: 1000 }),
      book({ id: 'b', path: 'C:\\b.pdf', lastPage: 3 }),
    ];
    const cleared = clearRecentBooks();
    expect(cleared).toEqual([]);
    const reopened = upsertRecentBook(cleared, {
      id: 'a',
      path: 'C:\\a.pdf',
      format: 'pdf',
    });
    expect(reopened).toHaveLength(1);
    expect(reopened[0]?.lastPage).toBe(1);
    expect(reopened[0]?.lastByteOffset).toBeUndefined();
    expect(list).toHaveLength(2);
  });

  it('marks missing books', () => {
    const list = [
      book({ id: 'a', path: 'C:\\a.pdf' }),
      book({ id: 'b', path: 'C:\\b.pdf' }),
    ];
    const marked = markMissingBooks(list, new Set(['C:\\a.pdf']));
    expect(marked.find((b) => b.id === 'a')?.missing).toBe(false);
    expect(marked.find((b) => b.id === 'b')?.missing).toBe(true);
  });
});

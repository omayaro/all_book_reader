import { useEffect, useRef } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import type { PageMode } from '../types';
import { clampPage } from '../shared/pageMode';

interface EpubViewerProps {
  data: ArrayBuffer;
  fontSize: number;
  pageMode: PageMode;
  page: number;
  searchQuery: string;
  searchDirection: 'next' | 'prev' | null;
  searchNonce: number;
  onPageChange: (page: number, totalPages: number) => void;
  onSearchDone: (message: string) => void;
}

export function EpubViewer({
  data,
  fontSize,
  pageMode,
  page,
  searchQuery,
  searchDirection,
  searchNonce,
  onPageChange,
  onSearchDone,
}: EpubViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const syncedPageRef = useRef(page);

  useEffect(() => {
    if (!hostRef.current) return;
    const book = ePub(data.slice(0));
    bookRef.current = book;
    const rendition = book.renderTo(hostRef.current, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: pageMode === 'two' ? 'always' : 'none',
    });
    renditionRef.current = rendition;

    void book.ready.then(async () => {
      await book.locations.generate(1000);
      const total = book.locations.length() || 1;
      const locationIndex = Math.max(0, Math.min(total - 1, page - 1));
      syncedPageRef.current = locationIndex + 1;
      const cfi = book.locations.cfiFromLocation(locationIndex);
      await rendition.display(cfi || undefined);
      onPageChange(locationIndex + 1, total);
    });

    rendition.on('relocated', (location: { start: { location?: number } }) => {
      const total = book.locations.length() || 1;
      const current = (location.start.location ?? 0) + 1;
      const next = Math.min(total, Math.max(1, current));
      syncedPageRef.current = next;
      onPageChange(next, total);
    });

    return () => {
      rendition.destroy();
      void book.destroy();
      bookRef.current = null;
      renditionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when book binary changes
  }, [data]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    rendition.spread(pageMode === 'two' ? 'always' : 'none');
    rendition.themes.fontSize(`${fontSize}px`);
  }, [pageMode, fontSize]);

  useEffect(() => {
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (!book || !rendition) return;
    const total = book.locations.length() || 1;
    const target = clampPage(page, total);
    if (target === syncedPageRef.current) return;
    syncedPageRef.current = target;
    const cfi = book.locations.cfiFromLocation(target - 1);
    void rendition.display(cfi || undefined);
  }, [page]);

  useEffect(() => {
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (!searchDirection || !searchQuery.trim() || !book || !rendition) return;

    void (async () => {
      try {
        type EpubSearchResult = { cfi: string };
        const results = (await (
          book as Book & {
            search?: (q: string) => Promise<EpubSearchResult[]>;
          }
        ).search?.(searchQuery)) as EpubSearchResult[] | undefined;

        if (!results || results.length === 0) {
          onSearchDone('No matches found.');
          return;
        }
        const target =
          searchDirection === 'next' ? results[0] : results[results.length - 1];
        if (!target) {
          onSearchDone('No matches found.');
          return;
        }
        await rendition.display(target.cfi);
        onSearchDone('Match displayed.');
      } catch {
        onSearchDone('Search is unavailable for this EPUB.');
      }
    })();
  }, [searchNonce, searchDirection, searchQuery, onSearchDone]);

  return <div className={`epub-viewer${pageMode === 'two' ? ' two-column' : ''}`} ref={hostRef} />;
}

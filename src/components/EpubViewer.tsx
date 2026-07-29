import { useEffect, useRef } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import type { PageMode } from '../types';
import { clampPage } from '../shared/pageMode';

export interface EpubNavigator {
  next: () => Promise<void>;
  prev: () => Promise<void>;
}

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
  onNavigatorReady?: (navigator: EpubNavigator | null) => void;
}

function hostSize(host: HTMLElement): { width: number; height: number } {
  return {
    width: Math.max(1, Math.floor(host.clientWidth)),
    height: Math.max(1, Math.floor(host.clientHeight)),
  };
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
  onNavigatorReady,
}: EpubViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const syncedPageRef = useRef(page);
  const onNavigatorReadyRef = useRef(onNavigatorReady);
  onNavigatorReadyRef.current = onNavigatorReady;

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const book = ePub(data.slice(0));
    bookRef.current = book;
    // Percentage sizing keeps epubjs' own window resize listener enabled.
    const rendition = book.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: pageMode === 'two' ? 'always' : 'none',
    });
    renditionRef.current = rendition;

    const navigator: EpubNavigator = {
      next: () => Promise.resolve(rendition.next()).then(() => undefined),
      prev: () => Promise.resolve(rendition.prev()).then(() => undefined),
    };
    onNavigatorReadyRef.current?.(navigator);

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

    // epub.js iframes swallow keys; re-dispatch so App page/zoom handlers still run
    // after the user focuses content (common after maximize/fullscreen).
    const onIframeKey = (event: KeyboardEvent) => {
      const key = event.key;
      const nav =
        key === 'PageDown' ||
        key === 'PageUp' ||
        key === 'ArrowLeft' ||
        key === 'ArrowRight' ||
        key === '+' ||
        key === '-' ||
        event.code === 'NumpadAdd' ||
        event.code === 'NumpadSubtract';
      if (!nav) return;
      event.preventDefault();
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    rendition.on('keydown', onIframeKey);

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSize = { width: 0, height: 0 };
    const resizeToHost = () => {
      const size = hostSize(host);
      if (
        Math.abs(size.width - lastSize.width) < 2 &&
        Math.abs(size.height - lastSize.height) < 2
      ) {
        return;
      }
      lastSize = size;
      rendition.resize(size.width, size.height);
    };
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeToHost, 80);
    });
    observer.observe(host);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      rendition.off('keydown', onIframeKey);
      onNavigatorReadyRef.current?.(null);
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

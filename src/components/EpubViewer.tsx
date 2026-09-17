import { useEffect, useRef } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import type { PageMode } from '../types';
import { clampPage } from '../shared/pageMode';
import { normalizeEpubEntryPath } from '../shared/epubEntryPath';
import { epubInitialWarmSpine, epubPrefetchSpine } from '../shared/epubPrefetch';
import { epubResumeSpineIndex, epubSavedTotalIsLocationMap } from '../shared/epubResume';
import { loadEpubFontFaceCss, rewriteSectionAssets } from '../epubAssets';
import { clearEpubEntryCache, readEpubEntryCached } from '../epubEntryCache';
import { epubDirectoryUrl, epubIpcRequest } from '../epubRequest';

export interface EpubNavigator {
  next: () => Promise<void>;
  prev: () => Promise<void>;
}

interface EpubViewerProps {
  bookId: string;
  fontSize: number;
  pageMode: PageMode;
  page: number;
  savedTotalPages: number;
  searchQuery: string;
  searchDirection: 'next' | 'prev' | null;
  searchNonce: number;
  onPageChange: (page: number, totalPages: number) => void;
  onSearchDone: (message: string) => void;
  onNavigatorReady?: (navigator: EpubNavigator | null) => void;
}

type SpineSection = { linear?: boolean; url?: string; href?: string };

function hostSize(host: HTMLElement): { width: number; height: number } {
  return {
    width: Math.max(1, Math.floor(host.clientWidth)),
    height: Math.max(1, Math.floor(host.clientHeight)),
  };
}

function linearSpineUrls(book: Book): string[] {
  const urls: string[] = [];
  book.spine.each((section: SpineSection) => {
    if (section.linear && section.url) urls.push(section.url);
  });
  return urls;
}

function prefetchSpine(book: Book, spineIndex: number): void {
  const urls = linearSpineUrls(book);
  const keep = [
    ...new Set([
      ...epubPrefetchSpine(spineIndex, urls.length),
      ...epubInitialWarmSpine(spineIndex, urls.length),
    ]),
  ];
  void Promise.all(
    keep.map((index) => {
      const url = urls[index];
      if (!url) return Promise.resolve(null);
      return readEpubEntryCached(normalizeEpubEntryPath(url), 'low').catch(() => null);
    }),
  );
}

export function EpubViewer({
  bookId,
  fontSize,
  pageMode,
  page,
  savedTotalPages,
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
  const savedTotalRef = useRef(savedTotalPages);
  savedTotalRef.current = savedTotalPages;
  const initialPageRef = useRef(page);
  const allowResumeSnapRef = useRef(true);
  const onNavigatorReadyRef = useRef(onNavigatorReady);
  onNavigatorReadyRef.current = onNavigatorReady;

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    clearEpubEntryCache();
    const openedAt = Date.now();
    const book = ePub(epubDirectoryUrl(), {
      requestMethod: ((url: string, type: string) => epubIpcRequest(url, type)) as Book['settings']['requestMethod'],
      replacements: 'none',
      openAs: 'directory',
    });
    bookRef.current = book;
    // Percentage sizing keeps epubjs' own window resize listener enabled.
    const rendition = book.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: pageMode === 'two' ? 'always' : 'none',
    });
    renditionRef.current = rendition;
    allowResumeSnapRef.current = true;
    initialPageRef.current = page;
    syncedPageRef.current = page;

    let cancelled = false;
    let generateTimer: ReturnType<typeof setTimeout> | null = null;
    let fontCssUrl: string | null = null;

    const applyFontCss = (cssUrl: string): void => {
      type EpubContents = { addStylesheet?: (url: string) => Promise<unknown> };
      const raw = (
        rendition as Rendition & { getContents?: () => EpubContents | EpubContents[] }
      ).getContents?.();
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const contents of list) {
        void contents.addStylesheet?.(cssUrl);
      }
    };

    const syncFromCurrentCfi = (total: number): void => {
      const current = rendition.currentLocation() as { start?: { cfi?: string } };
      const cfi = current?.start?.cfi;
      if (!cfi) {
        onPageChange(syncedPageRef.current, total);
        return;
      }
      const fromCfi = Number(book.locations.locationFromCfi(cfi));
      const next =
        Number.isFinite(fromCfi) && fromCfi >= 0 ? clampPage(fromCfi + 1, total) : 1;
      syncedPageRef.current = next;
      onPageChange(next, total);
    };

    const runLocationGenerate = (): void => {
      const tGenerate = Date.now();
      void book.locations
        .generate(1000)
        .then(async () => {
          if (cancelled) return;
          const total = book.locations.length() || 1;
          console.info(`[epub] locations.generate ${Date.now() - tGenerate}ms total=${total}`);
          const urls = linearSpineUrls(book);
          if (
            allowResumeSnapRef.current &&
            epubSavedTotalIsLocationMap(savedTotalRef.current, urls.length)
          ) {
            const locationIndex = Math.max(0, Math.min(total - 1, initialPageRef.current - 1));
            syncedPageRef.current = locationIndex + 1;
            const cfi = book.locations.cfiFromLocation(locationIndex);
            await rendition.display(cfi || undefined);
            if (!cancelled) onPageChange(locationIndex + 1, total);
            return;
          }
          syncFromCurrentCfi(total);
        })
        .catch((error: unknown) => {
          console.info('[epub] locations.generate failed', error);
        });
    };

    const scheduleLocationGenerate = (): void => {
      if (generateTimer) clearTimeout(generateTimer);
      generateTimer = setTimeout(() => {
        generateTimer = null;
        if (!cancelled) runLocationGenerate();
      }, 2000);
    };

    const markUserNav = (): void => {
      allowResumeSnapRef.current = false;
      scheduleLocationGenerate();
    };
    const navigator: EpubNavigator = {
      next: () => {
        markUserNav();
        return Promise.resolve(rendition.next()).then(() => undefined);
      },
      prev: () => {
        markUserNav();
        return Promise.resolve(rendition.prev()).then(() => undefined);
      },
    };
    onNavigatorReadyRef.current?.(navigator);

    const rewriteHook = (output: string, section: { url: string; output: string }) => {
      return rewriteSectionAssets(book.resources, section.output || output, section.url)
        .then((next) => {
          section.output = next;
        })
        .catch((error: unknown) => {
          console.info('[epub] rewrite failed', error);
          section.output = output;
        });
    };
    book.spine.hooks.serialize.register(rewriteHook);

    void book.ready
      .then(async () => {
        if (cancelled) return;
        const urls = linearSpineUrls(book);
        const spineIndex = epubResumeSpineIndex(page, savedTotalRef.current, urls.length);
        await rendition.display(spineIndex);
        if (cancelled) return;
        console.info(
          `[epub] first display ${Date.now() - openedAt}ms spine=${spineIndex + 1}/${urls.length || 1}`,
        );
        const reportedTotal = Math.max(1, savedTotalRef.current, urls.length || 1);
        syncedPageRef.current = page;
        onPageChange(page, reportedTotal);
        prefetchSpine(book, spineIndex);
        scheduleLocationGenerate();
        void loadEpubFontFaceCss(book.resources).then((cssUrl) => {
          if (cancelled || !cssUrl) return;
          fontCssUrl = cssUrl;
          applyFontCss(cssUrl);
        });
      })
      .catch((error: unknown) => {
        console.info('[epub] book.ready failed', error);
      });

    rendition.on('rendered', () => {
      if (fontCssUrl) applyFontCss(fontCssUrl);
    });

    rendition.on('relocated', (location: { start: { location?: number; index?: number } }) => {
      const total = book.locations.length();
      if (!total) return;
      const current = (location.start.location ?? 0) + 1;
      const next = Math.min(total, Math.max(1, current));
      syncedPageRef.current = next;
      onPageChange(next, total);
      if (typeof location.start.index === 'number') {
        prefetchSpine(book, location.start.index);
      }
    });

    // epub.js iframes swallow keys; re-dispatch so App page/zoom handlers still run
    // after the user focuses content (common after maximize/fullscreen).
    const onIframeKey = (event: KeyboardEvent) => {
      const key = event.key;
      const nav =
        key === 'PageDown' ||
        key === 'PageUp' ||
        key === 'Home' ||
        key === 'End' ||
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
      cancelled = true;
      if (generateTimer) clearTimeout(generateTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      rendition.off('keydown', onIframeKey);
      onNavigatorReadyRef.current?.(null);
      rendition.destroy();
      void book.destroy();
      bookRef.current = null;
      renditionRef.current = null;
      clearEpubEntryCache();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the open book changes
  }, [bookId]);

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
    const locCount = book.locations.length();
    if (!locCount) {
      if (page === syncedPageRef.current) return;
      allowResumeSnapRef.current = false;
      const urls = linearSpineUrls(book);
      const spineIndex = epubResumeSpineIndex(page, savedTotalPages, urls.length);
      syncedPageRef.current = page;
      void rendition.display(spineIndex);
      return;
    }
    const target = clampPage(page, locCount);
    if (target === syncedPageRef.current) return;
    allowResumeSnapRef.current = false;
    syncedPageRef.current = target;
    const cfi = book.locations.cfiFromLocation(target - 1);
    void rendition.display(cfi || undefined);
  }, [page, savedTotalPages]);

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
        allowResumeSnapRef.current = false;
        await rendition.display(target.cfi);
        onSearchDone('Match displayed.');
      } catch {
        onSearchDone('Search is unavailable for this EPUB.');
      }
    })();
  }, [searchNonce, searchDirection, searchQuery, onSearchDone]);

  return <div className={`epub-viewer${pageMode === 'two' ? ' two-column' : ''}`} ref={hostRef} />;
}

import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import type { PageMode } from '../types';
import { clampPage } from '../shared/pageMode';
import { normalizeEpubEntryPath } from '../shared/epubEntryPath';
import { epubInitialWarmSpine, epubPrefetchSpine } from '../shared/epubPrefetch';
import {
  epubNavDelta,
  epubOpeningSpineIndices,
  epubResumeSpineIndex,
  epubSavedTotalIsLocationMap,
  epubStepPage,
} from '../shared/epubResume';
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

const EpubHost = memo(function EpubHost({
  bookId,
  pageMode,
  pageRef,
  savedTotalRef,
  syncedPageRef,
  initialPageRef,
  allowResumeSnapRef,
  generateDoneRef,
  externalJumpRef,
  bookRef,
  renditionRef,
  onPageChangeRef,
  onNavigatorReadyRef,
}: {
  bookId: string;
  pageMode: PageMode;
  pageRef: { current: number };
  savedTotalRef: { current: number };
  syncedPageRef: { current: number };
  initialPageRef: { current: number };
  allowResumeSnapRef: { current: boolean };
  generateDoneRef: { current: boolean };
  externalJumpRef: { current: boolean };
  bookRef: { current: Book | null };
  renditionRef: { current: Rendition | null };
  onPageChangeRef: { current: (page: number, totalPages: number) => void };
  onNavigatorReadyRef: { current: EpubViewerProps['onNavigatorReady'] };
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    clearEpubEntryCache();
    const openedAt = Date.now();
    const page = pageRef.current;
    const book = ePub(epubDirectoryUrl(), {
      requestMethod: ((url: string, type: string) => epubIpcRequest(url, type)) as Book['settings']['requestMethod'],
      replacements: 'none',
      openAs: 'directory',
    });
    bookRef.current = book;
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
    const openingSpines = new Set<number>();

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

    generateDoneRef.current = false;
    let pendingDelta = 0;
    let lastSpine = -1;
    let lastPercentage = 0;
    let ignoreRelocateUntil = 0;

    const liveTotal = (): number => {
      const urls = linearSpineUrls(book);
      if (generateDoneRef.current) {
        const loc = book.locations.length();
        if (loc > 1) return loc;
      }
      return Math.max(1, savedTotalRef.current, urls.length || 1);
    };

    const reportPage = (next: number, total: number): void => {
      const page = clampPage(next, total);
      syncedPageRef.current = page;
      onPageChangeRef.current(page, total);
    };

    const applyNavDelta = (delta: number): void => {
      if (delta === 0) return;
      reportPage(epubStepPage(syncedPageRef.current, delta, liveTotal()), liveTotal());
    };

    const runLocationGenerate = (): void => {
      const tGenerate = Date.now();
      void book.locations
        .generate(1000)
        .then(async () => {
          if (cancelled) return;
          generateDoneRef.current = true;
          const total = book.locations.length() || 1;
          console.info(`[epub] locations.generate ${Date.now() - tGenerate}ms total=${total}`);
          const urls = linearSpineUrls(book);
          const saved = savedTotalRef.current;
          const similarTotal = saved > 1 && Math.abs(saved - total) / Math.max(total, 1) < 0.25;
          if (
            allowResumeSnapRef.current &&
            similarTotal &&
            initialPageRef.current > 1 &&
            epubSavedTotalIsLocationMap(saved, urls.length)
          ) {
            const expectedSpine = epubResumeSpineIndex(initialPageRef.current, saved, urls.length);
            const locationIndex = Math.max(0, Math.min(total - 1, initialPageRef.current - 1));
            const cfi = book.locations.cfiFromLocation(locationIndex);
            externalJumpRef.current = true;
            await rendition.display(cfi || undefined);
            if (cancelled) return;
            const snapped = rendition.currentLocation() as { start?: { index?: number; cfi?: string } };
            const snappedSpine = typeof snapped?.start?.index === 'number' ? snapped.start.index : 0;
            if (expectedSpine > 0 && snappedSpine === 0) {
              externalJumpRef.current = true;
              await rendition.display(expectedSpine);
              if (cancelled) return;
            }
          }
          reportPage(syncedPageRef.current, total);
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
        pendingDelta = 1;
        return Promise.resolve(rendition.next()).then(() => undefined);
      },
      prev: () => {
        markUserNav();
        pendingDelta = -1;
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
        for (const index of epubOpeningSpineIndices(spineIndex, pageMode === 'two')) {
          openingSpines.add(index);
        }
        await rendition.display(spineIndex);
        if (cancelled) return;
        console.info(
          `[epub] first display ${Date.now() - openedAt}ms spine=${spineIndex + 1}/${urls.length || 1}`,
        );
        lastSpine = spineIndex;
        lastPercentage = 0;
        const reportedTotal = Math.max(1, savedTotalRef.current, urls.length || 1);
        syncedPageRef.current = page;
        onPageChangeRef.current(page, reportedTotal);
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

    rendition.on(
      'relocated',
      (location: { start?: { index?: number; percentage?: number; cfi?: string } }) => {
        const spineIndex = typeof location?.start?.index === 'number' ? location.start.index : -1;
        const percentage =
          typeof location?.start?.percentage === 'number' ? location.start.percentage : lastPercentage;
        if (spineIndex >= 0) prefetchSpine(book, spineIndex);
        if (externalJumpRef.current) {
          externalJumpRef.current = false;
          lastSpine = spineIndex;
          lastPercentage = percentage;
          return;
        }
        if (pendingDelta === 0 && Date.now() < ignoreRelocateUntil) {
          lastSpine = spineIndex;
          lastPercentage = percentage;
          return;
        }
        if (pendingDelta === 0 && allowResumeSnapRef.current && spineIndex >= 0 && openingSpines.has(spineIndex)) {
          lastSpine = spineIndex;
          lastPercentage = percentage;
          return;
        }
        allowResumeSnapRef.current = false;
        const delta =
          pendingDelta !== 0
            ? pendingDelta
            : epubNavDelta(lastSpine, spineIndex, lastPercentage, percentage);
        pendingDelta = 0;
        lastSpine = spineIndex;
        lastPercentage = percentage;
        applyNavDelta(delta);
      },
    );

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
      ignoreRelocateUntil = Date.now() + 250;
      rendition.resize(size.width, size.height);
    };
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeToHost, 80);
    });
    observer.observe(host);

    const notifyNavigator = onNavigatorReadyRef.current;
    return () => {
      cancelled = true;
      if (generateTimer) clearTimeout(generateTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      rendition.off('keydown', onIframeKey);
      notifyNavigator?.(null);
      rendition.destroy();
      void book.destroy();
      bookRef.current = null;
      renditionRef.current = null;
      clearEpubEntryCache();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the open book changes
  }, [bookId, pageMode]);

  return <div className="epub-host" ref={hostRef} />;
});

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
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const syncedPageRef = useRef(page);
  const savedTotalRef = useRef(savedTotalPages);
  savedTotalRef.current = savedTotalPages;
  const pageRef = useRef(page);
  pageRef.current = page;
  const initialPageRef = useRef(page);
  const allowResumeSnapRef = useRef(true);
  const generateDoneRef = useRef(false);
  const externalJumpRef = useRef(false);
  const onNavigatorReadyRef = useRef(onNavigatorReady);
  onNavigatorReadyRef.current = onNavigatorReady;
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

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
    if (page === syncedPageRef.current) return;
    allowResumeSnapRef.current = false;
    externalJumpRef.current = true;
    syncedPageRef.current = page;
    const urls = linearSpineUrls(book);
    const locCount = book.locations.length();
    const total = Math.max(1, locCount || savedTotalPages, urls.length || 1);
    const spineIndex = epubResumeSpineIndex(page, total, urls.length);
    let beforeCfi = '';
    try {
      const before = rendition.currentLocation() as { start?: { cfi?: string } };
      beforeCfi = before?.start?.cfi || '';
    } catch {
      beforeCfi = '';
    }
    if (!generateDoneRef.current || !locCount) {
      void rendition.display(spineIndex);
      return;
    }
    const target = clampPage(page, locCount);
    const cfi = book.locations.cfiFromLocation(target - 1);
    const shown = cfi ? rendition.display(cfi) : rendition.display(spineIndex);
    void Promise.resolve(shown).then(() => {
      let nowCfi = '';
      let nowSpine = -1;
      try {
        const now = rendition.currentLocation() as { start?: { index?: number; cfi?: string } };
        nowCfi = now?.start?.cfi || '';
        nowSpine = typeof now?.start?.index === 'number' ? now.start.index : -1;
      } catch {
        nowSpine = -1;
      }
      const moved = Boolean(nowCfi && nowCfi !== beforeCfi);
      if (moved) return;
      if (nowSpine === spineIndex && spineIndex >= 0) return;
      externalJumpRef.current = true;
      void rendition.display(spineIndex);
    });
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
        externalJumpRef.current = true;
        await rendition.display(target.cfi);
        onSearchDone('Match displayed.');
      } catch {
        onSearchDone('Search is unavailable for this EPUB.');
      }
    })();
  }, [searchNonce, searchDirection, searchQuery, onSearchDone]);

  return (
    <div className={`epub-viewer${pageMode === 'two' ? ' two-column' : ''}`}>
      <EpubHost
        bookId={bookId}
        pageMode={pageMode}
        pageRef={pageRef}
        savedTotalRef={savedTotalRef}
        syncedPageRef={syncedPageRef}
        initialPageRef={initialPageRef}
        allowResumeSnapRef={allowResumeSnapRef}
        generateDoneRef={generateDoneRef}
        externalJumpRef={externalJumpRef}
        bookRef={bookRef}
        renditionRef={renditionRef}
        onPageChangeRef={onPageChangeRef}
        onNavigatorReadyRef={onNavigatorReadyRef}
      />
    </div>
  );
}

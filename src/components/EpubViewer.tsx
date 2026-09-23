import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import type { PageMode } from '../types';
import { clampPage } from '../shared/pageMode';
import { normalizeEpubEntryPath } from '../shared/epubEntryPath';
import { epubInitialWarmSpine, epubPrefetchSpine } from '../shared/epubPrefetch';
import {
  epubOpeningSpineIndices,
  epubResumeSpineIndex,
  epubSavedTotalIsLocationMap,
  epubUiSpineIndex,
} from '../shared/epubResume';
import { sanitizeEpubCfi } from '../shared/recent';
import {
  buildEpubToc,
  flattenNavItems,
  tocIndexForSpine,
  type EpubTocItem,
} from '../shared/epubToc';
import { loadEpubFontFaceCss, rewriteSectionAssets } from '../epubAssets';
import { clearEpubEntryCache, readEpubEntryCached } from '../epubEntryCache';
import { epubDirectoryUrl, epubIpcRequest } from '../epubRequest';

export interface EpubNavigator {
  next: () => Promise<void>;
  prev: () => Promise<void>;
  displayItem: (item: EpubTocItem) => Promise<void>;
}

interface EpubViewerProps {
  bookId: string;
  fontSize: number;
  pageMode: PageMode;
  page: number;
  savedTotalPages: number;
  resumeCfi?: string;
  searchQuery: string;
  searchDirection: 'next' | 'prev' | null;
  searchNonce: number;
  onPageChange: (page: number, totalPages: number, lastCfi?: string) => void;
  onSearchDone: (message: string) => void;
  onNavigatorReady?: (navigator: EpubNavigator | null) => void;
  onTocChange?: (items: EpubTocItem[]) => void;
  onTocActive?: (index: number) => void;
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

function linearSpineHrefs(book: Book): string[] {
  const hrefs: string[] = [];
  book.spine.each((section: SpineSection) => {
    if (section.linear && section.href) hrefs.push(section.href);
  });
  return hrefs;
}

function displayTocItem(rendition: Rendition, item: EpubTocItem): Promise<void> {
  const target =
    item.hash && item.href ? `${item.href}#${item.hash}` : item.href;
  if (item.spineIndex >= 0 && !item.hash) {
    return Promise.resolve(rendition.display(item.spineIndex)).then(() => undefined);
  }
  if (target) {
    return Promise.resolve(rendition.display(target)).catch(() => {
      if (item.spineIndex >= 0) return Promise.resolve(rendition.display(item.spineIndex));
    }).then(() => undefined);
  }
  if (item.spineIndex >= 0) {
    return Promise.resolve(rendition.display(item.spineIndex)).then(() => undefined);
  }
  return Promise.resolve();
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
  resumeCfiRef,
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
  onTocChangeRef,
  onTocActiveRef,
}: {
  bookId: string;
  pageMode: PageMode;
  pageRef: { current: number };
  resumeCfiRef: { current: string | undefined };
  savedTotalRef: { current: number };
  syncedPageRef: { current: number };
  initialPageRef: { current: number };
  allowResumeSnapRef: { current: boolean };
  generateDoneRef: { current: boolean };
  externalJumpRef: { current: boolean };
  bookRef: { current: Book | null };
  renditionRef: { current: Rendition | null };
  onPageChangeRef: { current: (page: number, totalPages: number, lastCfi?: string) => void };
  onNavigatorReadyRef: { current: EpubViewerProps['onNavigatorReady'] };
  onTocChangeRef: { current: EpubViewerProps['onTocChange'] };
  onTocActiveRef: { current: EpubViewerProps['onTocActive'] };
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
      flow: pageMode === 'two' ? 'paginated' : 'scrolled',
      manager: pageMode === 'two' ? 'default' : 'continuous',
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
    let lastPercentage = 0;
    let ignoreRelocateUntil = 0;

    const liveTotal = (): number => Math.max(1, linearSpineUrls(book).length || 1);

    const reportPage = (next: number, total: number, cfi?: string): void => {
      const page = clampPage(next, total);
      syncedPageRef.current = page;
      onPageChangeRef.current(page, total, sanitizeEpubCfi(cfi));
    };

    const runLocationGenerate = (): void => {
      const tGenerate = Date.now();
      void book.locations
        .generate(1000)
        .then(() => {
          if (cancelled) return;
          generateDoneRef.current = true;
          const locTotal = book.locations.length() || 1;
          console.info(`[epub] locations.generate ${Date.now() - tGenerate}ms total=${locTotal}`);
          reportPage(syncedPageRef.current, liveTotal());
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
    const tocItems: EpubTocItem[] = [];
    const publishTocActive = (spineIndex: number, hash = ''): void => {
      if (tocItems.length < 1) return;
      onTocActiveRef.current?.(tocIndexForSpine(tocItems, spineIndex, hash));
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
      displayItem: (item) => {
        markUserNav();
        externalJumpRef.current = true;
        return displayTocItem(rendition, item);
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
        const spineCount = Math.max(1, urls.length || 1);
        const saved = savedTotalRef.current;
        const spineIndex = epubSavedTotalIsLocationMap(saved, spineCount)
          ? epubResumeSpineIndex(page, saved, spineCount)
          : epubUiSpineIndex(page, spineCount);
        for (const index of epubOpeningSpineIndices(spineIndex, pageMode === 'two')) {
          openingSpines.add(index);
        }
        const resumeCfi = sanitizeEpubCfi(resumeCfiRef.current);
        try {
          if (resumeCfi) await rendition.display(resumeCfi);
          else await rendition.display(spineIndex);
        } catch {
          await rendition.display(spineIndex);
        }
        if (cancelled) return;
        console.info(
          `[epub] first display ${Date.now() - openedAt}ms spine=${spineIndex + 1}/${spineCount}${resumeCfi ? ' cfi' : ''}`,
        );
        lastPercentage = 0;
        const uiPage = spineIndex + 1;
        syncedPageRef.current = uiPage;
        onPageChangeRef.current(uiPage, spineCount);
        prefetchSpine(book, spineIndex);
        void book.loaded.navigation
          .then(() => {
            if (cancelled) return;
            const nodes = flattenNavItems(book.navigation.toc ?? []);
            const items = buildEpubToc(nodes, linearSpineHrefs(book));
            tocItems.splice(0, tocItems.length, ...items);
            onTocChangeRef.current?.(items);
            publishTocActive(spineIndex);
          })
          .catch(() => {
            if (cancelled) return;
            const items = buildEpubToc([], linearSpineHrefs(book));
            tocItems.splice(0, tocItems.length, ...items);
            onTocChangeRef.current?.(items);
            publishTocActive(spineIndex);
          });
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
      (location: { start?: { index?: number; percentage?: number; cfi?: string; href?: string } }) => {
        const spineIndex = typeof location?.start?.index === 'number' ? location.start.index : -1;
        const percentage =
          typeof location?.start?.percentage === 'number' ? location.start.percentage : lastPercentage;
        if (spineIndex >= 0) prefetchSpine(book, spineIndex);
        if (externalJumpRef.current) {
          externalJumpRef.current = false;
          lastPercentage = percentage;
          if (spineIndex >= 0) {
            reportPage(spineIndex + 1, liveTotal(), location.start?.cfi);
            const href = typeof location?.start?.href === 'string' ? location.start.href : '';
            const hash = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
            publishTocActive(spineIndex, hash);
          }
          return;
        }
        if (pendingDelta === 0 && Date.now() < ignoreRelocateUntil) {
          lastPercentage = percentage;
          return;
        }
        if (pendingDelta === 0 && allowResumeSnapRef.current && spineIndex >= 0 && openingSpines.has(spineIndex)) {
          lastPercentage = percentage;
          return;
        }
        allowResumeSnapRef.current = false;
        pendingDelta = 0;
        lastPercentage = percentage;
        if (spineIndex >= 0) {
          reportPage(spineIndex + 1, liveTotal(), location.start?.cfi);
          const href = typeof location?.start?.href === 'string' ? location.start.href : '';
          const hash = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
          publishTocActive(spineIndex, hash);
        }
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
  resumeCfi,
  searchQuery,
  searchDirection,
  searchNonce,
  onPageChange,
  onSearchDone,
  onNavigatorReady,
  onTocChange,
  onTocActive,
}: EpubViewerProps) {
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const syncedPageRef = useRef(page);
  const savedTotalRef = useRef(savedTotalPages);
  savedTotalRef.current = savedTotalPages;
  const pageRef = useRef(page);
  pageRef.current = page;
  const resumeCfiRef = useRef(resumeCfi);
  resumeCfiRef.current = resumeCfi;
  const initialPageRef = useRef(page);
  const allowResumeSnapRef = useRef(true);
  const generateDoneRef = useRef(false);
  const externalJumpRef = useRef(false);
  const onNavigatorReadyRef = useRef(onNavigatorReady);
  onNavigatorReadyRef.current = onNavigatorReady;
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const onTocChangeRef = useRef(onTocChange);
  onTocChangeRef.current = onTocChange;
  const onTocActiveRef = useRef(onTocActive);
  onTocActiveRef.current = onTocActive;

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
    const spineIndex = epubUiSpineIndex(page, urls.length);
    void rendition.display(spineIndex);
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
        resumeCfiRef={resumeCfiRef}
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
        onTocChangeRef={onTocChangeRef}
        onTocActiveRef={onTocActiveRef}
      />
    </div>
  );
}

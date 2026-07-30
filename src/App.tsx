import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi } from './api';
import { Home } from './components/Home';
import { TxtViewer } from './components/TxtViewer';
import { PdfViewer } from './components/PdfViewer';
import { EpubViewer, type EpubNavigator } from './components/EpubViewer';
import { ComicViewer } from './components/ComicViewer';
import { PagePreviewStrip } from './components/PagePreviewStrip';
import { clampFontSize, clampZoom, isThemeSetting, mergeSettings, zoomAtMax, zoomAtMin } from './shared/settings';
import { clampScrollRatio } from './shared/recent';
import { nextTheme, resolveTheme } from './shared/theme';
import { isSupportedBookFile } from './shared/format';
import {
  arrowKeyPageDelta,
  isReadingDirection,
  type ReadingDirection,
} from './shared/comic';
import { parsePageInput, sanitizePageDigits, stepPage } from './shared/pageMode';
import type {
  AppSettings,
  FitMode,
  OpenBookResult,
  PageMode,
  RecentBook,
} from './types';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export default function App() {
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [settings, setSettings] = useState<AppSettings>(mergeSettings());
  const [book, setBook] = useState<OpenBookResult | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [status, setStatus] = useState('Ready');
  const [dragging, setDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDirection, setSearchDirection] = useState<'next' | 'prev' | null>(null);
  const [searchNonce, setSearchNonce] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const txtProgressRef = useRef({ ratio: 0, byteOffset: 0 });
  const readerStageRef = useRef<HTMLDivElement>(null);
  const epubNavRef = useRef<EpubNavigator | null>(null);
  const resolvedTheme = resolveTheme(settings.theme);

  const persistSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const next = await getApi().saveSettings(partial);
    setSettings(next);
    return next;
  }, []);

  const refreshState = useCallback(async () => {
    const state = await getApi().getState();
    setRecentBooks(state.recentBooks);
    setSettings(state.settings);
  }, []);

  const openResult = useCallback((result: OpenBookResult | null) => {
    if (!result) return;
    const startPage = result.lastPage || 1;
    if (result.format === 'txt') {
      txtProgressRef.current = {
        ratio: clampScrollRatio(result.lastScrollRatio ?? 0),
        byteOffset: Math.max(0, Math.floor(result.lastByteOffset ?? 0)),
      };
    }
    setBook(result);
    setPage(startPage);
    setPageInput(String(startPage));
    setStatus(`Opened ${result.title}`);
    void (async () => {
      await refreshState();
      // After load, force height-aware fit for PDF/comics (Fit Page @ zoom 1).
      if (result.format === 'pdf' || result.format === 'comic') {
        await persistSettings({ fitMode: 'fit-page', zoom: 1 });
      }
    })();
  }, [refreshState, persistSettings]);

  const flushTxtProgress = useCallback(async () => {
    if (!book || book.format !== 'txt') return;
    const { ratio, byteOffset } = txtProgressRef.current;
    await getApi().updateProgress(
      book.id,
      page,
      book.totalPages,
      clampScrollRatio(ratio),
      byteOffset,
    );
  }, [book, page]);

  const openDialog = useCallback(async () => {
    await flushTxtProgress();
    const result = await getApi().openFileDialog();
    openResult(result);
  }, [openResult, flushTxtProgress]);

  const openFolderDialog = useCallback(async () => {
    await flushTxtProgress();
    const result = await getApi().openFolderDialog();
    openResult(result);
  }, [openResult, flushTxtProgress]);

  const openPath = useCallback(
    async (filePath: string) => {
      // Folders are allowed (comics); files must be a known extension.
      const looksLikeFile = /\.[^./\\]+$/.test(filePath);
      if (looksLikeFile && !isSupportedBookFile(filePath)) {
        setStatus('Only .txt, .pdf, .epub, .zip, and .cbz files are supported.');
        return;
      }
      await flushTxtProgress();
      const result = await getApi().openPath(filePath);
      openResult(result);
    },
    [openResult, flushTxtProgress],
  );

  const openSeriesSibling = useCallback(
    async (delta: number) => {
      if (!book) return;
      if (book.format === 'txt') {
        await flushTxtProgress();
      } else {
        await getApi().updateProgress(book.id, page, book.totalPages);
      }
      const nextPath = await getApi().resolveSeriesSibling(book.path, delta);
      if (!nextPath) {
        setStatus(delta > 0 ? 'No next volume found.' : 'No previous volume found.');
        return;
      }
      const result = await getApi().openPath(nextPath);
      openResult(result);
    },
    [book, page, flushTxtProgress, openResult],
  );

  const closeBook = useCallback(async () => {
    if (book) {
      if (book.format === 'txt') {
        await flushTxtProgress();
      } else {
        await getApi().updateProgress(book.id, page, book.totalPages);
      }
    }
    await getApi().closeBook();
    setBook(null);
    setStatus('Ready');
    await refreshState();
  }, [book, page, refreshState, flushTxtProgress]);

  const applyTxtPage = useCallback(
    (nextPage: number, totalPages: number, startByte: number, text: string, byteLength: number) => {
      const ratio = byteLength > 0 ? startByte / byteLength : 0;
      txtProgressRef.current = { ratio, byteOffset: startByte };
      setPage(nextPage);
      setPageInput(String(nextPage));
      setBook((current) =>
        current
          ? {
              ...current,
              lastPage: nextPage,
              totalPages,
              textContent: text,
              textWindowStart: startByte,
              lastByteOffset: startByte,
              lastScrollRatio: clampScrollRatio(ratio),
            }
          : current,
      );
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (!book) return;
        void getApi()
          .updateProgress(book.id, nextPage, totalPages, clampScrollRatio(ratio), startByte)
          .then(setRecentBooks);
      }, 200);
    },
    [book],
  );

  const scheduleProgressSave = useCallback(
    (nextPage: number, totalPages: number) => {
      if (!book) return;
      if (book.format === 'txt') {
        void getApi()
          .readTxtPage(nextPage)
          .then((result) => {
            applyTxtPage(
              result.page,
              result.totalPages,
              result.startByte,
              result.text,
              result.byteLength,
            );
            readerStageRef.current?.scrollTo({ top: 0 });
          })
          .catch(() => setStatus('Failed to load text page.'));
        return;
      }
      setPage(nextPage);
      setPageInput(String(nextPage));
      setBook((current) =>
        current ? { ...current, lastPage: nextPage, totalPages } : current,
      );
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void getApi()
          .updateProgress(book.id, nextPage, totalPages)
          .then(setRecentBooks);
      }, 300);
    },
    [book, applyTxtPage],
  );

  const zoomBy = useCallback(
    (delta: number) => {
      if (!book) return;
      if (book.format === 'pdf' || book.format === 'comic') {
        setSettings((prev) => {
          const nextZoom = clampZoom(prev.zoom + delta);
          if (nextZoom === prev.zoom) return prev;
          void getApi().saveSettings({ zoom: nextZoom }).then(setSettings);
          return { ...prev, zoom: nextZoom };
        });
        return;
      }
      setSettings((prev) => {
        const nextFont = clampFontSize(prev.fontSize + (delta > 0 ? 2 : -2));
        if (nextFont === prev.fontSize) return prev;
        void getApi().saveSettings({ fontSize: nextFont }).then(setSettings);
        return { ...prev, fontSize: nextFont };
      });
    },
    [book],
  );

  const focusReader = useCallback(() => {
    window.requestAnimationFrame(() => {
      readerStageRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const goToPage = useCallback(
    (raw: string, options?: { focusReader?: boolean }) => {
      if (!book) return false;
      const total = Math.max(1, book.totalPages || 1);
      const next = parsePageInput(raw, total);
      if (next == null) {
        setStatus('Enter a valid page number.');
        setPageInput(String(page));
        return false;
      }
      scheduleProgressSave(next, total);
      setStatus(`Jumped to page ${next}`);
      if (options?.focusReader !== false) focusReader();
      return true;
    },
    [book, page, scheduleProgressSave, focusReader],
  );

  const movePage = useCallback(
    (delta: number) => {
      if (!book) return;
      // EPUB: turn via rendition next/prev so navigation survives maximize/fullscreen resize.
      // Location-index display() often no-ops for adjacent pages after the manager clears.
      if (book.format === 'epub' && epubNavRef.current) {
        if (delta > 0) void epubNavRef.current.next();
        else if (delta < 0) void epubNavRef.current.prev();
        return;
      }
      const total = Math.max(1, book.totalPages || 1);
      const twoPage =
        settings.pageMode === 'two' && (book.format === 'pdf' || book.format === 'comic');
      scheduleProgressSave(stepPage(page, total, delta, twoPage), total);
    },
    [book, page, scheduleProgressSave, settings.pageMode],
  );

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    return getApi().onMenuEvent((channel, payload) => {
      switch (channel) {
        case 'menu:open':
          void openDialog();
          break;
        case 'menu:openFolder':
          void openFolderDialog();
          break;
        case 'menu:close':
          void closeBook();
          break;
        case 'menu:pageMode':
          void persistSettings({ pageMode: payload as PageMode });
          break;
        case 'menu:fitMode':
          void persistSettings({ fitMode: payload as FitMode });
          break;
        case 'menu:readingDirection':
          if (isReadingDirection(payload)) {
            void persistSettings({ readingDirection: payload });
          }
          break;
        case 'menu:toolbarVisible':
          if (payload === 'toggle') {
            void persistSettings({ toolbarVisible: !settings.toolbarVisible });
          } else {
            void persistSettings({ toolbarVisible: payload === true });
          }
          break;
        case 'menu:theme':
          void persistSettings({ theme: nextTheme(settings.theme) });
          break;
        case 'menu:zoom':
          zoomBy(payload === 'in' ? 0.1 : -0.1);
          break;
        case 'menu:fontSize':
          if (book && book.format !== 'pdf' && book.format !== 'comic') {
            zoomBy(payload === 'in' ? 0.1 : -0.1);
          } else {
            void persistSettings({
              fontSize: clampFontSize(settings.fontSize + (payload === 'in' ? 2 : -2)),
            });
          }
          break;
        default:
          break;
      }
    });
  }, [
    openDialog,
    openFolderDialog,
    closeBook,
    persistSettings,
    book,
    zoomBy,
    settings.theme,
    settings.fontSize,
    settings.toolbarVisible,
  ]);

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const filePath = getApi().getPathForFile(file);
      if (filePath) void openPath(filePath);
      else setStatus('Could not resolve dropped file path.');
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [openPath]);

  useEffect(() => {
    const flush = () => {
      if (!book) return;
      if (book.format === 'txt') {
        void flushTxtProgress();
        return;
      }
      void getApi().updateProgress(book.id, page, book.totalPages);
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [book, page, flushTxtProgress]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      // Ctrl+→ / Ctrl+← set reading direction (must run before page-turn arrows).
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === 'ArrowRight' || event.key === 'ArrowLeft')
      ) {
        event.preventDefault();
        void persistSettings({
          readingDirection: event.key === 'ArrowRight' ? 'ltr' : 'rtl',
        });
        return;
      }

      if (!book) return;

      // PageUp / PageDown: previous / next series volume (filename number ±1).
      if (event.key === 'PageDown') {
        event.preventDefault();
        void openSeriesSibling(1);
        return;
      }
      if (event.key === 'PageUp') {
        event.preventDefault();
        void openSeriesSibling(-1);
        return;
      }
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        (event.key === 'ArrowRight' || event.key === 'ArrowLeft')
      ) {
        event.preventDefault();
        // Comics use reading direction; other formats stay LTR (Right = next).
        const direction =
          book.format === 'comic' ? settings.readingDirection : 'ltr';
        movePage(arrowKeyPageDelta(event.key, direction));
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Home') {
        event.preventDefault();
        goToPage('1');
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'End') {
        event.preventDefault();
        goToPage(String(Math.max(1, book.totalPages || 1)));
        return;
      }

      // Zoom: bare +/- only (no Ctrl). Handle in renderer — menu accelerators
      // often miss when the reader stage has focus (e.g. single-page mode).
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === '+' || event.code === 'NumpadAdd') {
          event.preventDefault();
          zoomBy(0.1);
          return;
        }
        if (event.key === '-' || event.code === 'NumpadSubtract') {
          event.preventDefault();
          zoomBy(-0.1);
        }
      }
      // Font size (Ctrl+/-) stays on View menu accelerators.
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [book, movePage, openSeriesSibling, goToPage, zoomBy, settings.readingDirection, persistSettings]);

  const runSearch = (direction: 'next' | 'prev') => {
    setSearchDirection(direction);
    setSearchNonce((value) => value + 1);
  };

  return (
    <div
      className={`app${dragging ? ' dragging' : ''}${!book || !settings.toolbarVisible ? ' toolbar-hidden' : ''}`}
    >
      {book && settings.toolbarVisible && (
      <div className="toolbar">
        <label className="toolbar-pin" title="Uncheck to hide the options toolbar">
          <input
            type="checkbox"
            checked={settings.toolbarVisible}
            onChange={(event) => {
              void persistSettings({ toolbarVisible: event.target.checked });
            }}
          />
          <span>Pin toolbar</span>
        </label>
        <button type="button" onClick={() => void openDialog()}>
          Open
        </button>
        <button type="button" onClick={() => void openFolderDialog()}>
          Open Folder
        </button>
        <button type="button" onClick={() => void closeBook()} disabled={!book}>
          Close
        </button>
        <button
          type="button"
          onClick={() => void persistSettings({ pageMode: 'single' })}
          disabled={settings.pageMode === 'single'}
        >
          Single
        </button>
        <button
          type="button"
          onClick={() => void persistSettings({ pageMode: 'two' })}
          disabled={settings.pageMode === 'two'}
        >
          Two Pages
        </button>
        {(book?.format === 'pdf' || book?.format === 'comic') && (
          <>
            <button type="button" onClick={() => void persistSettings({ fitMode: 'fit-width' })}>
              Fit Width
            </button>
            <button type="button" onClick={() => void persistSettings({ fitMode: 'fit-page' })}>
              Fit Page
            </button>
          </>
        )}
        {book?.format === 'comic' && (
          <button
            type="button"
            onClick={() =>
              void persistSettings({
                readingDirection:
                  settings.readingDirection === 'rtl' ? 'ltr' : ('rtl' as ReadingDirection),
              })
            }
            title="Toggle reading direction for two-page view"
          >
            {settings.readingDirection === 'rtl' ? 'RTL (←)' : 'LTR (→)'}
          </button>
        )}
        <button
          type="button"
          disabled={!book || ((book.format === 'pdf' || book.format === 'comic') && zoomAtMin(settings.zoom))}
          onClick={() => zoomBy(-0.1)}
          title="Zoom out (-)"
        >
          −
        </button>
        <button
          type="button"
          disabled={!book || ((book.format === 'pdf' || book.format === 'comic') && zoomAtMax(settings.zoom))}
          onClick={() => zoomBy(0.1)}
          title="Zoom in (+)"
        >
          +
        </button>
        <button
          type="button"
          disabled={!book}
          onClick={() => void openSeriesSibling(-1)}
          title="Previous book (Page Up)"
        >
          Page Up
        </button>
        <button
          type="button"
          disabled={!book}
          onClick={() => void openSeriesSibling(1)}
          title="Next book (Page Down)"
        >
          Page Down
        </button>
        <button
          type="button"
          disabled={!book}
          onClick={() => goToPage('1')}
          title="First page (Home)"
        >
          Home
        </button>
        <button
          type="button"
          disabled={!book}
          onClick={() => goToPage(String(Math.max(1, book.totalPages || 1)))}
          title="Last page (End)"
        >
          End
        </button>
        <label className="page-jump" title="Go to page">
          <span>Page</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="page-input"
            value={pageInput}
            disabled={!book}
            onChange={(event) => setPageInput(sanitizePageDigits(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                goToPage(pageInput, { focusReader: true });
                return;
              }
              const allow =
                event.key === 'Backspace' ||
                event.key === 'Delete' ||
                event.key === 'Tab' ||
                event.key === 'Escape' ||
                event.key === 'ArrowLeft' ||
                event.key === 'ArrowRight' ||
                event.key === 'Home' ||
                event.key === 'End' ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                /^\d$/.test(event.key);
              if (!allow) event.preventDefault();
            }}
            onBlur={() => {
              if (book) setPageInput(String(page));
            }}
          />
          <span className="page-total">/ {book?.totalPages || 1}</span>
          <button
            type="button"
            disabled={!book}
            onClick={() => goToPage(pageInput, { focusReader: true })}
          >
            Go
          </button>
        </label>
        <label className="theme-select" title="Theme">
          <span>Theme</span>
          <select
            value={settings.theme}
            onChange={(event) => {
              const value = event.target.value;
              if (isThemeSetting(value)) void persistSettings({ theme: value });
            }}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <input
          type="search"
          placeholder="Search in book"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') runSearch(event.shiftKey ? 'prev' : 'next');
          }}
          disabled={!book}
        />
        <button type="button" disabled={!book} onClick={() => runSearch('prev')}>
          Find Prev
        </button>
        <button type="button" disabled={!book} onClick={() => runSearch('next')}>
          Find Next
        </button>
        <div className="spacer" />
        <div className="status">
          {book ? `${book.title} · page ${page}` : status}
        </div>
      </div>
      )}

      {!book ? (
        <Home
          books={recentBooks}
          onOpenDialog={() => void openDialog()}
          onOpenFolder={() => void openFolderDialog()}
          onOpenBook={(item) => void openPath(item.path)}
          onRemove={(item) => {
            void getApi()
              .removeRecent(item.id)
              .then(setRecentBooks);
          }}
        />
      ) : (
        <div className="reader">
          <div
            className="reader-stage"
            ref={readerStageRef}
            tabIndex={-1}
            aria-label="Reader"
          >
            {book.format === 'txt' && book.textContent != null && (
              <TxtViewer
                bookId={book.id}
                text={book.textContent}
                page={page}
                totalPages={book.totalPages}
                fontSize={settings.fontSize}
                pageMode={settings.pageMode}
                searchQuery={searchQuery}
                searchDirection={searchDirection}
                searchNonce={searchNonce}
                onSearchDone={setStatus}
                onPageChange={applyTxtPage}
              />
            )}
            {book.format === 'pdf' && book.fileData && (
              <PdfViewer
                data={book.fileData}
                page={page}
                pageMode={settings.pageMode}
                fitMode={settings.fitMode}
                zoom={settings.zoom}
                searchQuery={searchQuery}
                searchDirection={searchDirection}
                searchNonce={searchNonce}
                onPageChange={scheduleProgressSave}
                onSearchDone={setStatus}
              />
            )}
            {book.format === 'epub' && book.fileData && (
              <EpubViewer
                data={book.fileData}
                fontSize={settings.fontSize}
                pageMode={settings.pageMode}
                page={page}
                searchQuery={searchQuery}
                searchDirection={searchDirection}
                searchNonce={searchNonce}
                onPageChange={scheduleProgressSave}
                onSearchDone={setStatus}
                onNavigatorReady={(nav) => {
                  epubNavRef.current = nav;
                }}
              />
            )}
            {book.format === 'comic' && (
              <ComicViewer
                page={page}
                totalPages={book.totalPages}
                pageMode={settings.pageMode}
                fitMode={settings.fitMode}
                zoom={settings.zoom}
                readingDirection={settings.readingDirection}
                onPageMeta={(total) => {
                  if (total !== book.totalPages) {
                    scheduleProgressSave(page, total);
                  }
                }}
              />
            )}
          </div>
          {(book.format === 'pdf' || book.format === 'comic' || book.format === 'txt') &&
            book.totalPages > 0 && (
            <PagePreviewStrip
              format={book.format}
              bookId={book.id}
              totalPages={book.totalPages}
              page={page}
              pageMode={settings.pageMode}
              readingDirection={settings.readingDirection}
              pdfData={book.format === 'pdf' ? book.fileData : undefined}
              onSelectPage={(next) => {
                scheduleProgressSave(next, book.totalPages);
                setStatus(`Jumped to page ${next}`);
                focusReader();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

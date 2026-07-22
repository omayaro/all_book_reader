import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi } from './api';
import { Home } from './components/Home';
import { TxtViewer } from './components/TxtViewer';
import { PdfViewer } from './components/PdfViewer';
import { EpubViewer } from './components/EpubViewer';
import { ComicViewer } from './components/ComicViewer';
import { clampFontSize, clampZoom, isThemeSetting, mergeSettings } from './shared/settings';
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
  const readerStageRef = useRef<HTMLDivElement>(null);
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
    setBook(result);
    setPage(startPage);
    setPageInput(String(startPage));
    setStatus(`Opened ${result.title}`);
    void refreshState();
  }, [refreshState]);

  const openDialog = useCallback(async () => {
    const result = await getApi().openFileDialog();
    openResult(result);
  }, [openResult]);

  const openFolderDialog = useCallback(async () => {
    const result = await getApi().openFolderDialog();
    openResult(result);
  }, [openResult]);

  const openPath = useCallback(
    async (filePath: string) => {
      // Folders are allowed (comics); files must be a known extension.
      const looksLikeFile = /\.[^./\\]+$/.test(filePath);
      if (looksLikeFile && !isSupportedBookFile(filePath)) {
        setStatus('Only .txt, .pdf, .epub, .zip, and .cbz files are supported.');
        return;
      }
      const result = await getApi().openPath(filePath);
      openResult(result);
    },
    [openResult],
  );

  const closeBook = useCallback(async () => {
    if (book) {
      await getApi().updateProgress(book.id, page, book.totalPages);
    }
    await getApi().closeBook();
    setBook(null);
    setStatus('Ready');
    await refreshState();
  }, [book, page, refreshState]);

  const scheduleProgressSave = useCallback(
    (nextPage: number, totalPages: number) => {
      if (!book) return;
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
    [book],
  );

  const zoomBy = useCallback(
    (delta: number) => {
      if (!book) return;
      if (book.format === 'pdf' || book.format === 'comic') {
        void persistSettings({ zoom: clampZoom(settings.zoom + delta) });
        return;
      }
      void persistSettings({
        fontSize: clampFontSize(settings.fontSize + (delta > 0 ? 2 : -2)),
      });
    },
    [book, persistSettings, settings.zoom, settings.fontSize],
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
          // Same behavior as toolbar +/- (PDF/comic zoom, TXT/EPUB font size).
          if (book) {
            const delta = payload === 'in' ? 0.1 : -0.1;
            if (book.format === 'pdf' || book.format === 'comic') {
              void persistSettings({ zoom: clampZoom(settings.zoom + delta) });
            } else {
              void persistSettings({
                fontSize: clampFontSize(settings.fontSize + (delta > 0 ? 2 : -2)),
              });
            }
          }
          break;
        case 'menu:fontSize':
          void persistSettings({
            fontSize: clampFontSize(settings.fontSize + (payload === 'in' ? 2 : -2)),
          });
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
    settings.theme,
    settings.zoom,
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
      if (book) {
        void getApi().updateProgress(book.id, page, book.totalPages);
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [book, page]);

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

      if (event.key === 'PageDown') {
        event.preventDefault();
        movePage(1);
        return;
      }
      if (event.key === 'PageUp') {
        event.preventDefault();
        movePage(-1);
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
  }, [book, movePage, zoomBy, settings.readingDirection, persistSettings]);

  const runSearch = (direction: 'next' | 'prev') => {
    setSearchDirection(direction);
    setSearchNonce((value) => value + 1);
  };

  return (
    <div
      className={`app${dragging ? ' dragging' : ''}${settings.toolbarVisible ? '' : ' toolbar-hidden'}`}
    >
      {settings.toolbarVisible && (
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
        <button type="button" disabled={!book} onClick={() => zoomBy(-0.1)} title="Zoom out (-)">
          −
        </button>
        <button type="button" disabled={!book} onClick={() => zoomBy(0.1)} title="Zoom in (+)">
          +
        </button>
        <button type="button" disabled={!book} onClick={() => movePage(-1)} title="Page Up">
          Page Up
        </button>
        <button type="button" disabled={!book} onClick={() => movePage(1)} title="Page Down">
          Page Down
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
                text={book.textContent}
                fontSize={settings.fontSize}
                pageMode={settings.pageMode}
                searchQuery={searchQuery}
                searchDirection={searchDirection}
                searchNonce={searchNonce}
                onSearchDone={setStatus}
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
        </div>
      )}
    </div>
  );
}

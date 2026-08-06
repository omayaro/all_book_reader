import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { buildBookId } from '../src/shared/bookId';
import { detectFormat, getBookTitle, isSupportedBookFile } from '../src/shared/format';
import { isImageFile } from '../src/shared/comic';
import {
  isNavigableBookFileName,
  resolveFolderSiblingBasename,
} from '../src/shared/seriesSibling';
import {
  GITHUB_LATEST_RELEASE_API,
  GITHUB_RELEASES_URL,
  isNewerVersion,
  normalizeVersion,
} from '../src/shared/appUpdate';
import type { AppSettings, OpenBookResult } from '../src/types';
import {
  clearComicSession,
  openComicArchive,
  openComicFolder,
  openComicImageFile,
  readComicPage,
} from './comicSession';
import { clearTxtSession, openTxtSession, readTxtPage } from './txtSession';
import { AppStore } from './store';

const isDevRuntime = Boolean(process.defaultApp);
let mainWindow: BrowserWindow | null = null;
let store: AppStore;

function configurePortableUserData(): void {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) {
    app.setPath('userData', path.join(portableDir, 'AllBookReaderData'));
  }
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open'),
        },
        {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => mainWindow?.webContents.send('menu:openFolder'),
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow?.webContents.send('menu:close'),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Single Page',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.send('menu:pageMode', 'single'),
        },
        {
          label: 'Two Pages',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.send('menu:pageMode', 'two'),
        },
        { type: 'separator' },
        {
          label: 'Reading Direction: Left to Right',
          accelerator: 'CmdOrCtrl+Right',
          click: () => mainWindow?.webContents.send('menu:readingDirection', 'ltr'),
        },
        {
          label: 'Reading Direction: Right to Left',
          accelerator: 'CmdOrCtrl+Left',
          click: () => mainWindow?.webContents.send('menu:readingDirection', 'rtl'),
        },
        { type: 'separator' },
        {
          label: 'Fit Width',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.webContents.send('menu:fitMode', 'fit-width'),
        },
        {
          label: 'Fit Page',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.send('menu:fitMode', 'fit-page'),
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'Plus',
          click: () => mainWindow?.webContents.send('menu:zoom', 'in'),
        },
        {
          label: 'Zoom Out',
          accelerator: '-',
          click: () => mainWindow?.webContents.send('menu:zoom', 'out'),
        },
        {
          label: 'Larger Font',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => mainWindow?.webContents.send('menu:fontSize', 'in'),
        },
        {
          label: 'Smaller Font',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow?.webContents.send('menu:fontSize', 'out'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Dark Mode',
          accelerator: 'CmdOrCtrl+D',
          click: () => mainWindow?.webContents.send('menu:theme'),
        },
        {
          label: 'Toggle Toolbar',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow?.webContents.send('menu:toolbarVisible', 'toggle'),
        },
        { type: 'separator' },
        { role: 'reload', label: 'Reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'toggleDevTools', label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: () => {
            void shell.openExternal(GITHUB_RELEASES_URL);
          },
        },
        {
          label: 'About All Book Reader',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            void dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About All Book Reader',
              message: 'All Book Reader',
              detail:
                `Version ${app.getVersion()}\n\nRead TXT, PDF, EPUB, and ZIP/CBZ comics on Windows.\n\nSupports single/two-page view, resume, recent books, and drag-and-drop.`,
              buttons: ['OK'],
              defaultId: 0,
              noLink: true,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openBookFromPath(filePath: string): Promise<OpenBookResult | null> {
  if (!filePath) return null;

  let isDirectory = false;
  try {
    isDirectory = fs.statSync(filePath).isDirectory();
  } catch {
    await dialog.showMessageBox(mainWindow!, {
      type: 'error',
      title: 'File not found',
      message: 'The selected file could not be found.',
    });
    store.refreshMissingFlags();
    return null;
  }

  const isImage = !isDirectory && isImageFile(filePath);
  if (!isDirectory && !isSupportedBookFile(filePath) && !isImage) {
    await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      title: 'Unsupported file',
      message:
        'Only .txt, .pdf, .epub, .zip, .cbz, and image files (or an image folder) are supported.',
    });
    return null;
  }

  const format = isDirectory || isImage ? 'comic' : detectFormat(filePath);
  if (!format) return null;

  const stat = fs.statSync(filePath);
  const id = buildBookId({
    path: filePath,
    size: isDirectory ? 0 : stat.size,
    mtimeMs: stat.mtimeMs,
  });
  const title = getBookTitle(filePath);
  const existing = store.getState().recentBooks.find((b) => b.path === filePath);
  const lastPage = existing?.lastPage ?? 1;

  clearComicSession();
  clearTxtSession();

  if (format === 'comic') {
    try {
      const comic = isDirectory
        ? openComicFolder(filePath)
        : isImage
          ? openComicImageFile(filePath)
          : await openComicArchive(filePath);
      const totalPages = comic.entries.length;
      store.upsertRecent({
        id,
        path: filePath,
        format,
        title,
        lastPage: Math.min(lastPage, totalPages),
        totalPages,
      });
      return {
        path: filePath,
        title,
        format,
        id,
        lastPage: Math.min(lastPage, totalPages),
        totalPages,
        comicPageCount: totalPages,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open comic.';
      await dialog.showMessageBox(mainWindow!, {
        type: 'error',
        title: 'Could not open comic',
        message,
      });
      return null;
    }
  }

  const totalPages = existing?.totalPages ?? 1;
  const result: OpenBookResult = {
    path: filePath,
    title,
    format,
    id,
    lastPage,
    totalPages,
    lastScrollRatio: existing?.lastScrollRatio,
    lastByteOffset: existing?.lastByteOffset,
  };

  if (format === 'txt') {
    const pageResult = openTxtSession(
      filePath,
      existing?.lastPage ?? 1,
      existing?.lastByteOffset,
    );
    result.textContent = pageResult.text;
    result.totalPages = pageResult.totalPages;
    result.lastPage = pageResult.page;
    result.textByteLength = pageResult.byteLength;
    result.textWindowStart = pageResult.startByte;
    result.textPosition = pageResult.endByte;
    result.lastByteOffset = pageResult.startByte;
    store.upsertRecent({
      id,
      path: filePath,
      format,
      title,
      lastPage: pageResult.page,
      totalPages: pageResult.totalPages,
      lastScrollRatio:
        pageResult.byteLength > 0 ? pageResult.startByte / pageResult.byteLength : 0,
      lastByteOffset: pageResult.startByte,
    });
    return result;
  }

  store.upsertRecent({
    id,
    path: filePath,
    format,
    title,
    lastPage,
    totalPages,
    lastScrollRatio: existing?.lastScrollRatio,
    lastByteOffset: existing?.lastByteOffset,
  });

  const buf = fs.readFileSync(filePath);
  result.fileData = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return result;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'All Book Reader',
    backgroundColor: '#dfe8e4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL || isDevRuntime) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173');
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('books:getState', () => {
    store.refreshMissingFlags();
    return store.getState();
  });

  ipcMain.handle('books:openDialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open Book',
      properties: ['openFile'],
      filters: [
        {
          name: 'Books',
          extensions: ['txt', 'pdf', 'epub', 'zip', 'cbz', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return openBookFromPath(result.filePaths[0]!);
  });

  ipcMain.handle('books:openFolderDialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open Image Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return openBookFromPath(result.filePaths[0]!);
  });

  ipcMain.handle('books:openPath', async (_event, filePath: string) => {
    return openBookFromPath(filePath);
  });

  ipcMain.handle(
    'books:resolveSeriesSibling',
    (_event, filePath: string, delta: number) => {
      if (typeof filePath !== 'string' || !filePath) return null;
      if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) {
        return null;
      }

      let currentIsDirectory = false;
      try {
        currentIsDirectory = fs.statSync(filePath).isDirectory();
      } catch {
        return null;
      }

      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        return null;
      }

      const candidates: string[] = [];
      for (const name of entries) {
        const full = path.join(dir, name);
        let entryIsDirectory = false;
        try {
          entryIsDirectory = fs.statSync(full).isDirectory();
        } catch {
          continue;
        }
        if (currentIsDirectory) {
          if (entryIsDirectory) candidates.push(name);
        } else if (!entryIsDirectory && isNavigableBookFileName(name)) {
          candidates.push(name);
        }
      }

      const sibling = resolveFolderSiblingBasename(base, candidates, delta);
      return sibling ? path.join(dir, sibling) : null;
    },
  );

  ipcMain.handle('books:close', () => {
    clearComicSession();
    clearTxtSession();
  });

  ipcMain.handle('comic:readPage', async (_event, index: number) => {
    return readComicPage(index);
  });

  ipcMain.handle('txt:readPage', (_event, page: number) => {
    return readTxtPage(page);
  });

  ipcMain.handle(
    'books:updateProgress',
    (
      _event,
      idOrPath: string,
      lastPage: number,
      totalPages?: number,
      lastScrollRatio?: number,
      lastByteOffset?: number,
    ) => {
      return store.updateProgress(
        idOrPath,
        lastPage,
        totalPages,
        lastScrollRatio,
        lastByteOffset,
      );
    },
  );

  ipcMain.handle('books:removeRecent', (_event, idOrPath: string) => {
    return store.removeRecent(idOrPath);
  });

  ipcMain.handle('books:saveSettings', (_event, partial: Partial<AppSettings>) => {
    return store.saveSettings(partial);
  });

  ipcMain.handle('updates:check', async () => {
    const currentVersion = app.getVersion();
    try {
      const response = await fetch(GITHUB_LATEST_RELEASE_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'AllBookReader',
        },
      });
      if (!response.ok) {
        return {
          currentVersion,
          latestVersion: null,
          latestTag: null,
          htmlUrl: GITHUB_RELEASES_URL,
          hasUpdate: false,
          error: `GitHub returned ${response.status}`,
        };
      }
      const data = (await response.json()) as {
        tag_name?: string;
        html_url?: string;
      };
      const latestTag = typeof data.tag_name === 'string' ? data.tag_name : null;
      const latestVersion = latestTag ? normalizeVersion(latestTag) : null;
      return {
        currentVersion,
        latestVersion,
        latestTag,
        htmlUrl:
          typeof data.html_url === 'string' && data.html_url
            ? data.html_url
            : GITHUB_RELEASES_URL,
        hasUpdate: Boolean(latestVersion && isNewerVersion(latestVersion, currentVersion)),
      };
    } catch (error) {
      return {
        currentVersion,
        latestVersion: null,
        latestTag: null,
        htmlUrl: GITHUB_RELEASES_URL,
        hasUpdate: false,
        error: error instanceof Error ? error.message : 'Update check failed',
      };
    }
  });

  ipcMain.handle('updates:openReleases', async (_event, url?: string) => {
    const target =
      typeof url === 'string' && /^https:\/\/github\.com\//i.test(url)
        ? url
        : GITHUB_RELEASES_URL;
    await shell.openExternal(target);
  });
}

configurePortableUserData();

app.whenReady().then(async () => {
  store = new AppStore(app.getPath('userData'));

  // Headless resume check: ABR_E2E_TXT_RESUME=<path> ABR_E2E_TXT_OFFSET=<bytes>
  const e2ePath = process.env.ABR_E2E_TXT_RESUME;
  if (e2ePath) {
    const filePath = path.resolve(e2ePath);
    const offset = Number(process.env.ABR_E2E_TXT_OFFSET || '13723349');
    const ratio = Number(process.env.ABR_E2E_TXT_RATIO || '0.4885');
    if (!fs.existsSync(filePath)) {
      console.error('E2E FAIL: file not found', filePath);
      app.exit(1);
      return;
    }
    const stat = fs.statSync(filePath);
    const id = buildBookId({
      path: filePath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
    store.upsertRecent({ id, path: filePath, format: 'txt', title: getBookTitle(filePath) });
    store.updateProgress(id, 1, 1, ratio, offset);
    const result = await openBookFromPath(filePath);
    const windowStart = result?.textWindowStart ?? -1;
    const preview = (result?.textContent ?? '').slice(0, 60).replace(/\s+/g, ' ');
    const ok =
      Boolean(result) &&
      result!.format === 'txt' &&
      (result!.lastPage ?? 0) > 1 &&
      (result!.totalPages ?? 0) > 100 &&
      windowStart > 1_000_000 &&
      Math.abs(windowStart - offset) < 16_384;
    console.log(
      JSON.stringify({
        ok,
        offset,
        windowStart,
        lastPage: result?.lastPage,
        totalPages: result?.totalPages,
        preview,
      }),
    );
    clearTxtSession();
    app.exit(ok ? 0 : 1);
    return;
  }

  registerIpc();
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

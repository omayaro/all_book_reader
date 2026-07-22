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
import type { AppSettings, OpenBookResult } from '../src/types';
import {
  clearComicSession,
  openComicArchive,
  openComicFolder,
  readComicPage,
} from './comicSession';
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
          label: 'About All Book Reader',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            void dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About All Book Reader',
              message: 'All Book Reader',
              detail:
                'Version 1.0.0\n\nRead TXT, PDF, EPUB, and ZIP/CBZ comics on Windows.\n\nSupports single/two-page view, resume, recent books, and drag-and-drop.',
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

  if (!isDirectory && !isSupportedBookFile(filePath)) {
    await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      title: 'Unsupported file',
      message: 'Only .txt, .pdf, .epub, .zip, and .cbz files (or an image folder) are supported.',
    });
    return null;
  }

  const format = isDirectory ? 'comic' : detectFormat(filePath);
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

  if (format === 'comic') {
    try {
      const comic = isDirectory
        ? openComicFolder(filePath)
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
  store.upsertRecent({
    id,
    path: filePath,
    format,
    title,
    lastPage,
    totalPages,
  });

  const result: OpenBookResult = {
    path: filePath,
    title,
    format,
    id,
    lastPage,
    totalPages,
  };

  if (format === 'txt') {
    result.textContent = fs.readFileSync(filePath, 'utf8');
  } else {
    const buf = fs.readFileSync(filePath);
    result.fileData = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

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
        { name: 'Books', extensions: ['txt', 'pdf', 'epub', 'zip', 'cbz'] },
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

  ipcMain.handle('books:close', () => {
    clearComicSession();
  });

  ipcMain.handle('comic:readPage', async (_event, index: number) => {
    return readComicPage(index);
  });

  ipcMain.handle(
    'books:updateProgress',
    (_event, idOrPath: string, lastPage: number, totalPages?: number) => {
      return store.updateProgress(idOrPath, lastPage, totalPages);
    },
  );

  ipcMain.handle('books:removeRecent', (_event, idOrPath: string) => {
    return store.removeRecent(idOrPath);
  });

  ipcMain.handle('books:saveSettings', (_event, partial: Partial<AppSettings>) => {
    return store.saveSettings(partial);
  });
}

configurePortableUserData();

app.whenReady().then(() => {
  store = new AppStore(app.getPath('userData'));
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

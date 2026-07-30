import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AppSettings, AppState, OpenBookResult } from '../src/types';

export interface TxtPageResult {
  text: string;
  page: number;
  totalPages: number;
  startByte: number;
  endByte: number;
  byteLength: number;
}

export interface ElectronApi {
  getState: () => Promise<AppState>;
  openFileDialog: () => Promise<OpenBookResult | null>;
  openFolderDialog: () => Promise<OpenBookResult | null>;
  openPath: (filePath: string) => Promise<OpenBookResult | null>;
  resolveSeriesSibling: (filePath: string, delta: number) => Promise<string | null>;
  closeBook: () => Promise<void>;
  readComicPage: (index: number) => Promise<ArrayBuffer>;
  readTxtPage: (page: number) => Promise<TxtPageResult>;
  updateProgress: (
    idOrPath: string,
    lastPage: number,
    totalPages?: number,
    lastScrollRatio?: number,
    lastByteOffset?: number,
  ) => Promise<AppState['recentBooks']>;
  removeRecent: (idOrPath: string) => Promise<AppState['recentBooks']>;
  saveSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
  getPathForFile: (file: File) => string;
  onMenuEvent: (handler: (channel: string, payload?: unknown) => void) => () => void;
}

const api: ElectronApi = {
  getState: () => ipcRenderer.invoke('books:getState'),
  openFileDialog: () => ipcRenderer.invoke('books:openDialog'),
  openFolderDialog: () => ipcRenderer.invoke('books:openFolderDialog'),
  openPath: (filePath: string) => ipcRenderer.invoke('books:openPath', filePath),
  resolveSeriesSibling: (filePath: string, delta: number) =>
    ipcRenderer.invoke('books:resolveSeriesSibling', filePath, delta),
  closeBook: () => ipcRenderer.invoke('books:close'),
  readComicPage: (index: number) => ipcRenderer.invoke('comic:readPage', index),
  readTxtPage: (page) => ipcRenderer.invoke('txt:readPage', page),
  updateProgress: (idOrPath, lastPage, totalPages, lastScrollRatio, lastByteOffset) =>
    ipcRenderer.invoke(
      'books:updateProgress',
      idOrPath,
      lastPage,
      totalPages,
      lastScrollRatio,
      lastByteOffset,
    ),
  removeRecent: (idOrPath) => ipcRenderer.invoke('books:removeRecent', idOrPath),
  saveSettings: (partial) => ipcRenderer.invoke('books:saveSettings', partial),
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return (file as File & { path?: string }).path ?? '';
    }
  },
  onMenuEvent: (handler) => {
    const channels = [
      'menu:open',
      'menu:openFolder',
      'menu:close',
      'menu:pageMode',
      'menu:fitMode',
      'menu:theme',
      'menu:zoom',
      'menu:fontSize',
      'menu:readingDirection',
      'menu:toolbarVisible',
    ];
    const listeners = channels.map((channel) => {
      const listener = (_event: Electron.IpcRendererEvent, payload?: unknown) => {
        handler(channel, payload);
      };
      ipcRenderer.on(channel, listener);
      return { channel, listener };
    });
    return () => {
      for (const { channel, listener } of listeners) {
        ipcRenderer.removeListener(channel, listener);
      }
    };
  },
};

contextBridge.exposeInMainWorld('api', api);

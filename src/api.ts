import type { AppSettings, AppState, OpenBookResult } from './types';

export interface ElectronApi {
  getState: () => Promise<AppState>;
  openFileDialog: () => Promise<OpenBookResult | null>;
  openFolderDialog: () => Promise<OpenBookResult | null>;
  openPath: (filePath: string) => Promise<OpenBookResult | null>;
  closeBook: () => Promise<void>;
  readComicPage: (index: number) => Promise<ArrayBuffer>;
  updateProgress: (
    idOrPath: string,
    lastPage: number,
    totalPages?: number,
  ) => Promise<AppState['recentBooks']>;
  removeRecent: (idOrPath: string) => Promise<AppState['recentBooks']>;
  saveSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
  getPathForFile: (file: File) => string;
  onMenuEvent: (handler: (channel: string, payload?: unknown) => void) => () => void;
}

export function getApi(): ElectronApi {
  if (!window.api) {
    throw new Error('Electron API is not available');
  }
  return window.api;
}

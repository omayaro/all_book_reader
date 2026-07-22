export type BookFormat = 'txt' | 'pdf' | 'epub' | 'comic';

export type PageMode = 'single' | 'two';

export type FitMode = 'fit-width' | 'fit-page';

export type ThemeSetting = 'light' | 'dark';

export type ReadingDirection = 'ltr' | 'rtl';

export interface RecentBook {
  id: string;
  path: string;
  title: string;
  lastOpenedAt: string;
  lastPage: number;
  totalPages: number;
  format: BookFormat;
  missing: boolean;
}

export interface AppSettings {
  pageMode: PageMode;
  fitMode: FitMode;
  zoom: number;
  fontSize: number;
  theme: ThemeSetting;
  readingDirection: ReadingDirection;
  /** When false, the top options toolbar is hidden (restore via View menu). */
  toolbarVisible: boolean;
  maxRecent: number;
}

export interface AppState {
  recentBooks: RecentBook[];
  settings: AppSettings;
}

export interface OpenBookResult {
  path: string;
  title: string;
  format: BookFormat;
  id: string;
  lastPage: number;
  totalPages: number;
  textContent?: string;
  fileData?: ArrayBuffer;
  /** Present when format is comic (ZIP/CBZ). Pages loaded via readComicPage. */
  comicPageCount?: number;
}

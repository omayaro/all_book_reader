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
  /** 0–1 scroll position for continuous TXT reading. */
  lastScrollRatio?: number;
  /** Absolute byte offset for TXT resume (preferred over ratio). */
  lastByteOffset?: number;
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
  textByteLength?: number;
  /** Start byte of the currently displayed TXT page. */
  textWindowStart?: number;
  /** End byte (exclusive) of the currently displayed TXT page. */
  textPosition?: number;
  fileData?: ArrayBuffer;
  /** Present when format is comic (ZIP/CBZ). Pages loaded via readComicPage. */
  comicPageCount?: number;
  /** 0–1 scroll resume point for TXT. */
  lastScrollRatio?: number;
  /** Absolute byte offset resume point for TXT. */
  lastByteOffset?: number;
}

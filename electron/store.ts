import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, AppState, RecentBook } from '../src/types';
import { mergeSettings } from '../src/shared/settings';
import {
  markMissingBooks,
  removeRecentBook,
  updateRecentProgress,
  upsertRecentBook,
} from '../src/shared/recent';

export class AppStore {
  private readonly filePath: string;
  private state: AppState;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'all-book-reader-state.json');
    this.state = this.load();
  }

  getState(): AppState {
    return {
      recentBooks: [...this.state.recentBooks],
      settings: { ...this.state.settings },
    };
  }

  getSettings(): AppSettings {
    return { ...this.state.settings };
  }

  saveSettings(partial: Partial<AppSettings>): AppSettings {
    this.state.settings = mergeSettings({ ...this.state.settings, ...partial });
    this.persist();
    return this.getSettings();
  }

  refreshMissingFlags(): RecentBook[] {
    const existing = new Set<string>();
    for (const book of this.state.recentBooks) {
      if (fs.existsSync(book.path)) existing.add(book.path);
    }
    this.state.recentBooks = markMissingBooks(this.state.recentBooks, existing);
    this.persist();
    return [...this.state.recentBooks];
  }

  upsertRecent(input: Parameters<typeof upsertRecentBook>[1]): RecentBook[] {
    this.state.recentBooks = upsertRecentBook(
      this.state.recentBooks,
      input,
      this.state.settings.maxRecent,
    );
    this.persist();
    return [...this.state.recentBooks];
  }

  updateProgress(
    idOrPath: string,
    lastPage: number,
    totalPages?: number,
    lastScrollRatio?: number,
    lastByteOffset?: number,
  ): RecentBook[] {
    this.state.recentBooks = updateRecentProgress(
      this.state.recentBooks,
      idOrPath,
      lastPage,
      totalPages,
      lastScrollRatio,
      lastByteOffset,
    );
    this.persist();
    return [...this.state.recentBooks];
  }

  removeRecent(idOrPath: string): RecentBook[] {
    this.state.recentBooks = removeRecentBook(this.state.recentBooks, idOrPath);
    this.persist();
    return [...this.state.recentBooks];
  }

  private load(): AppState {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { recentBooks: [], settings: mergeSettings() };
      }
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<AppState>;
      return {
        recentBooks: Array.isArray(raw.recentBooks) ? raw.recentBooks : [],
        settings: mergeSettings(raw.settings),
      };
    } catch {
      return { recentBooks: [], settings: mergeSettings() };
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }
}

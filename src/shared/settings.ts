import { isReadingDirection } from './comic';
import type { AppSettings, FitMode, PageMode, ThemeSetting } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  pageMode: 'single',
  fitMode: 'fit-page',
  zoom: 1,
  fontSize: 18,
  theme: 'light',
  readingDirection: 'ltr',
  toolbarVisible: true,
  maxRecent: 20,
  dismissedUpdateVersion: null,
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const MIN_FONT = 12;
const MAX_FONT = 40;

export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return DEFAULT_SETTINGS.zoom;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(zoom.toFixed(2))));
}

export function zoomAtMin(zoom: number): boolean {
  return clampZoom(zoom) <= MIN_ZOOM;
}

export function zoomAtMax(zoom: number): boolean {
  return clampZoom(zoom) >= MAX_ZOOM;
}

export function clampFontSize(size: number): number {
  if (Number.isNaN(size)) return DEFAULT_SETTINGS.fontSize;
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(size)));
}

export function isPageMode(value: unknown): value is PageMode {
  return value === 'single' || value === 'two';
}

export function isFitMode(value: unknown): value is FitMode {
  return value === 'fit-width' || value === 'fit-page';
}

export function isThemeSetting(value: unknown): value is ThemeSetting {
  return value === 'light' || value === 'dark';
}

export function mergeSettings(partial?: Partial<AppSettings> | null): AppSettings {
  const base = { ...DEFAULT_SETTINGS };
  if (!partial) return base;

  return {
    pageMode: isPageMode(partial.pageMode) ? partial.pageMode : base.pageMode,
    fitMode: isFitMode(partial.fitMode) ? partial.fitMode : base.fitMode,
    zoom: clampZoom(partial.zoom ?? base.zoom),
    fontSize: clampFontSize(partial.fontSize ?? base.fontSize),
    theme: isThemeSetting(partial.theme) ? partial.theme : base.theme,
    readingDirection: isReadingDirection(partial.readingDirection)
      ? partial.readingDirection
      : base.readingDirection,
    toolbarVisible:
      typeof partial.toolbarVisible === 'boolean'
        ? partial.toolbarVisible
        : base.toolbarVisible,
    maxRecent:
      typeof partial.maxRecent === 'number' && partial.maxRecent > 0
        ? Math.floor(partial.maxRecent)
        : base.maxRecent,
    dismissedUpdateVersion:
      typeof partial.dismissedUpdateVersion === 'string' &&
      partial.dismissedUpdateVersion.trim()
        ? partial.dismissedUpdateVersion.trim()
        : partial.dismissedUpdateVersion === null
          ? null
          : base.dismissedUpdateVersion,
  };
}

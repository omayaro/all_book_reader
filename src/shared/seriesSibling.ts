import { getExtension } from './format';

/** Fallback order after preferring the current file's extension. */
export const SERIES_EXTENSION_PRIORITY = [
  '.zip',
  '.cbz',
  '.pdf',
  '.epub',
  '.txt',
] as const;

export interface SeriesNameParts {
  /** Directory containing the current book (normalized separators preserved from input). */
  dir: string;
  /** Filename stem without trailing digits (may be empty). */
  prefix: string;
  /** Trailing digit run as written (preserves zero-padding width). */
  digits: string;
  number: number;
  /** Current extension including dot, or '' for folders / extensionless paths. */
  extension: string;
}

function splitDirBase(filePath: string): { dir: string; base: string } {
  const normalized = filePath.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  if (slash < 0) return { dir: '', base: normalized };
  return { dir: filePath.slice(0, slash), base: normalized.slice(slash + 1) };
}

function formatSeriesNumber(n: number, padWidth: number): string {
  const raw = String(n);
  return raw.length >= padWidth ? raw : raw.padStart(padWidth, '0');
}

/** Parse trailing volume digits from a book path (file or folder basename). */
export function parseSeriesName(filePath: string): SeriesNameParts | null {
  const { dir, base } = splitDirBase(filePath);
  if (!base || base === '.' || base === '..') return null;

  const extension = getExtension(filePath);
  const stem = extension ? base.slice(0, -extension.length) : base;
  const match = /^(.*?)(\d+)$/.exec(stem);
  if (!match) return null;

  const prefix = match[1] ?? '';
  const digits = match[2] ?? '';
  const number = Number(digits);
  if (!Number.isFinite(number) || number < 1) return null;

  return { dir, prefix, digits, number, extension };
}

/**
 * Candidate basenames for the series sibling at `number + delta`.
 * Prefer the current extension, then {@link SERIES_EXTENSION_PRIORITY}.
 */
export function seriesSiblingBasenames(
  filePath: string,
  delta: number,
): string[] | null {
  if (!Number.isFinite(delta) || delta === 0) return null;
  const parsed = parseSeriesName(filePath);
  if (!parsed) return null;

  const next = parsed.number + delta;
  if (next < 1) return null;

  const numStr = formatSeriesNumber(next, parsed.digits.length);
  const stem = `${parsed.prefix}${numStr}`;

  const ordered: string[] = [];
  const seen = new Set<string>();
  const pushExt = (ext: string) => {
    const key = ext.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(`${stem}${ext}`);
  };

  if (parsed.extension) pushExt(parsed.extension.toLowerCase());
  for (const ext of SERIES_EXTENSION_PRIORITY) pushExt(ext);

  return ordered;
}

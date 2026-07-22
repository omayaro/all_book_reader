import type { BookFormat } from '../types';

const SUPPORTED_EXTENSIONS: Record<string, BookFormat> = {
  '.txt': 'txt',
  '.pdf': 'pdf',
  '.epub': 'epub',
  '.zip': 'comic',
  '.cbz': 'comic',
};

export function getExtension(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const base = normalized.split('/').pop() ?? normalized;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot).toLowerCase();
}

export function detectFormat(filePath: string): BookFormat | null {
  return SUPPORTED_EXTENSIONS[getExtension(filePath)] ?? null;
}

export function isSupportedBookFile(filePath: string): boolean {
  return detectFormat(filePath) !== null;
}

export function getBookTitle(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() || filePath;
}

import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import {
  buildTxtPageStartsFromLength,
  clampTxtPage,
  TXT_PAGE_TARGET_BYTES,
  txtPageForByteOffset,
} from '../src/shared/txtPages';

const NEWLINE_SCAN_BYTES = 8 * 1024;

export interface TxtPageResult {
  text: string;
  page: number;
  totalPages: number;
  startByte: number;
  endByte: number;
  byteLength: number;
}

interface TxtSession {
  fd: number;
  path: string;
  byteLength: number;
  pageStarts: number[];
}

let session: TxtSession | null = null;

export function clearTxtSession(): void {
  if (session) {
    try {
      fs.closeSync(session.fd);
    } catch {
      // ignore close errors
    }
  }
  session = null;
}

export function getTxtSession(): TxtSession | null {
  return session;
}

/** Move forward from `from` to the byte after the next newline (or `from`). */
function alignToNewlineAfter(fd: number, byteLength: number, from: number): number {
  if (from <= 0) return 0;
  if (from >= byteLength) return byteLength;
  const scan = Math.min(NEWLINE_SCAN_BYTES, byteLength - from);
  if (scan <= 0) return from;
  const buf = Buffer.allocUnsafe(scan);
  const read = fs.readSync(fd, buf, 0, scan, from);
  const idx = buf.subarray(0, read).indexOf(0x0a);
  if (idx < 0) return from;
  return from + idx + 1;
}

function buildPageStarts(fd: number, byteLength: number): number[] {
  return buildTxtPageStartsFromLength(byteLength, TXT_PAGE_TARGET_BYTES, (from) =>
    alignToNewlineAfter(fd, byteLength, from),
  );
}

function readRange(fd: number, start: number, end: number): string {
  const size = Math.max(0, end - start);
  if (size <= 0) return '';
  const buf = Buffer.allocUnsafe(size);
  const read = fs.readSync(fd, buf, 0, size, start);
  return new StringDecoder('utf8').end(buf.subarray(0, read));
}

/**
 * Open a text file, build fixed-size (newline-aligned) pages, open resume page.
 * Prefer resumeByte when provided; else resumePage; else page 1.
 */
export function openTxtSession(
  filePath: string,
  resumePage = 1,
  resumeByte?: number,
): TxtPageResult {
  clearTxtSession();
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  const byteLength = stat.size;
  const pageStarts = buildPageStarts(fd, byteLength);
  session = { fd, path: filePath, byteLength, pageStarts };

  let page = clampTxtPage(resumePage, pageStarts.length);
  if (typeof resumeByte === 'number' && Number.isFinite(resumeByte) && resumeByte > 0) {
    page = txtPageForByteOffset(pageStarts, resumeByte);
  }
  return readTxtPage(page);
}

export function readTxtPage(page: number): TxtPageResult {
  if (!session) throw new Error('No text file is open.');
  const totalPages = Math.max(1, session.pageStarts.length);
  const p = clampTxtPage(page, totalPages);
  const startByte = session.pageStarts[p - 1] ?? 0;
  const endByte =
    p < session.pageStarts.length ? (session.pageStarts[p] ?? session.byteLength) : session.byteLength;
  const text = readRange(session.fd, startByte, endByte);
  return {
    text,
    page: p,
    totalPages,
    startByte,
    endByte,
    byteLength: session.byteLength,
  };
}

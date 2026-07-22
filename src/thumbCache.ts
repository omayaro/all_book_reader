import { getApi } from './api';
import * as pdfjs from 'pdfjs-dist';
import { txtThumbPreviewText } from './shared/pageStrip';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const MAX_THUMBS = 48;
const THUMB_WIDTH = 72;

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const order: string[] = [];

function touch(key: string): void {
  const idx = order.indexOf(key);
  if (idx >= 0) order.splice(idx, 1);
  order.push(key);
  while (order.length > MAX_THUMBS) {
    const evict = order.shift();
    if (evict) cache.delete(evict);
  }
}

function cacheKey(kind: string, page: number, token: string): string {
  return `${kind}:${token}:${page}`;
}

async function renderComicThumb(pageNumber: number): Promise<string> {
  const buffer = await getApi().readComicPage(pageNumber - 1);
  const blob = new Blob([new Uint8Array(buffer)]);
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, THUMB_WIDTH / Math.max(1, bitmap.width));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2d context');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    bitmap.close();
  }
}

async function renderPdfThumb(
  doc: pdfjs.PDFDocumentProxy,
  pageNumber: number,
): Promise<string> {
  const pdfPage = await doc.getPage(pageNumber);
  const base = pdfPage.getViewport({ scale: 1 });
  const scale = THUMB_WIDTH / Math.max(1, base.width);
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.72);
}

export function getComicThumbUrl(pageNumber: number, bookId: string): Promise<string> {
  const key = cacheKey('comic', pageNumber, bookId);
  const hit = cache.get(key);
  if (hit) {
    touch(key);
    return Promise.resolve(hit);
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = renderComicThumb(pageNumber)
      .then((url) => {
        cache.set(key, url);
        touch(key);
        inflight.delete(key);
        return url;
      })
      .catch((error) => {
        inflight.delete(key);
        throw error;
      });
    inflight.set(key, pending);
  }
  return pending;
}

export function getPdfThumbUrl(
  doc: pdfjs.PDFDocumentProxy,
  pageNumber: number,
  bookId: string,
): Promise<string> {
  const key = cacheKey('pdf', pageNumber, bookId);
  const hit = cache.get(key);
  if (hit) {
    touch(key);
    return Promise.resolve(hit);
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = renderPdfThumb(doc, pageNumber)
      .then((url) => {
        cache.set(key, url);
        touch(key);
        inflight.delete(key);
        return url;
      })
      .catch((error) => {
        inflight.delete(key);
        throw error;
      });
    inflight.set(key, pending);
  }
  return pending;
}

export function clearThumbCache(): void {
  cache.clear();
  inflight.clear();
  order.length = 0;
}

export async function loadPdfDocument(data: ArrayBuffer): Promise<pdfjs.PDFDocumentProxy> {
  return pdfjs.getDocument({ data: data.slice(0) }).promise;
}

const TXT_THUMB_HEIGHT = 84;

async function renderTxtThumb(pageNumber: number): Promise<string> {
  const page = await getApi().readTxtPage(pageNumber);
  const preview = txtThumbPreviewText(page.text);
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = TXT_THUMB_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '9px Consolas, "Courier New", monospace';
  const lineHeight = 11;
  const maxWidth = THUMB_WIDTH - 8;
  const x = 4;
  let y = 12;
  const words = preview.length > 0 ? preview.split(' ') : [' '];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
      if (y > TXT_THUMB_HEIGHT - 4) break;
    } else {
      line = test;
    }
  }
  if (y <= TXT_THUMB_HEIGHT - 4 && line) {
    ctx.fillText(line, x, y);
  }
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function getTxtThumbUrl(pageNumber: number, bookId: string): Promise<string> {
  const key = cacheKey('txt', pageNumber, bookId);
  const hit = cache.get(key);
  if (hit) {
    touch(key);
    return Promise.resolve(hit);
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = renderTxtThumb(pageNumber)
      .then((url) => {
        cache.set(key, url);
        touch(key);
        inflight.delete(key);
        return url;
      })
      .catch((error) => {
        inflight.delete(key);
        throw error;
      });
    inflight.set(key, pending);
  }
  return pending;
}

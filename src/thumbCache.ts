import { getApi } from './api';
import * as pdfjs from 'pdfjs-dist';
import { readEpubEntryCached } from './epubEntryCache';
import { parseContainerPackagePath, parseOpfSpineHrefs } from './shared/epubPackage';
import { resolveZipPath } from './shared/epubEntryPath';
import { epubResumeSpineIndex } from './shared/epubResume';
import {
  epubThumbPreviewText,
  firstHtmlImgSrc,
  htmlToThumbText,
  txtThumbPreviewText,
} from './shared/pageStrip';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const MAX_THUMBS = 48;
const THUMB_WIDTH = 72;

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const order: string[] = [];
const epubSpineCache = new Map<string, Promise<string[]>>();

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
  epubSpineCache.clear();
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

export function getEpubThumbUrl(
  pageNumber: number,
  bookId: string,
  totalPages: number,
): Promise<string> {
  const key = cacheKey('epub', pageNumber, `${bookId}:${totalPages}`);
  const hit = cache.get(key);
  if (hit) {
    touch(key);
    return Promise.resolve(hit);
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = renderEpubThumb(pageNumber, bookId, totalPages)
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

function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(new Uint8Array(buffer));
}

async function loadEpubSpineHrefs(bookId: string): Promise<string[]> {
  const hit = epubSpineCache.get(bookId);
  if (hit) return hit;
  const pending = (async () => {
    const container = decodeUtf8(await readEpubEntryCached('META-INF/container.xml', 'low'));
    const opfPath = parseContainerPackagePath(container);
    const opf = decodeUtf8(await readEpubEntryCached(opfPath, 'low'));
    return parseOpfSpineHrefs(opf, opfPath);
  })();
  epubSpineCache.set(bookId, pending);
  try {
    return await pending;
  } catch (error) {
    epubSpineCache.delete(bookId);
    throw error;
  }
}

function paintTextThumb(text: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = TXT_THUMB_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '9px sans-serif';
  ctx.textBaseline = 'top';
  const lineHeight = 11;
  const maxWidth = THUMB_WIDTH - 8;
  const x = 4;
  let y = 6;
  let line = '';
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = ch === ' ' ? '' : ch;
      y += lineHeight;
      if (y > TXT_THUMB_HEIGHT - lineHeight) break;
    } else {
      line = test;
    }
  }
  if (y <= TXT_THUMB_HEIGHT - lineHeight && line) {
    ctx.fillText(line, x, y);
  }
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function paintImageThumb(buffer: ArrayBuffer): Promise<string> {
  const blob = new Blob([new Uint8Array(buffer)]);
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(
      THUMB_WIDTH / Math.max(1, bitmap.width),
      TXT_THUMB_HEIGHT / Math.max(1, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_WIDTH;
    canvas.height = TXT_THUMB_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2d context');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const dx = Math.floor((THUMB_WIDTH - width) / 2);
    const dy = Math.floor((TXT_THUMB_HEIGHT - height) / 2);
    ctx.drawImage(bitmap, dx, dy, width, height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    bitmap.close();
  }
}

async function renderEpubThumb(
  pageNumber: number,
  bookId: string,
  totalPages: number,
): Promise<string> {
  const hrefs = await loadEpubSpineHrefs(bookId);
  if (hrefs.length < 1) throw new Error('EPUB spine is empty');
  const spineIndex = epubResumeSpineIndex(pageNumber, totalPages, hrefs.length);
  const href = hrefs[spineIndex];
  if (!href) throw new Error('Missing EPUB spine href');
  const html = decodeUtf8(await readEpubEntryCached(href, 'low'));
  const preview = epubThumbPreviewText(
    htmlToThumbText(html),
    pageNumber,
    totalPages,
    hrefs.length,
  );
  if (preview.length >= 24) return paintTextThumb(preview);
  const imgSrc = firstHtmlImgSrc(html);
  if (imgSrc) {
    try {
      const imgPath = resolveZipPath(href, imgSrc);
      const image = await readEpubEntryCached(imgPath, 'low');
      return await paintImageThumb(image);
    } catch {
      /* fall through to whatever text we have */
    }
  }
  if (preview) return paintTextThumb(preview);
  return paintTextThumb(' ');
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

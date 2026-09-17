import { EPUB_REQUEST_ORIGIN, normalizeEpubEntryPath } from './shared/epubEntryPath';
import { readEpubEntryCached } from './epubEntryCache';

const XML_EXTS = new Set(['xml', 'opf', 'ncx']);

function extensionOf(entryPath: string): string {
  const base = entryPath.split('/').pop() ?? entryPath;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

function mimeForExt(ext: string): string {
  switch (ext) {
    case 'css':
      return 'text/css';
    case 'js':
      return 'text/javascript';
    case 'xhtml':
    case 'xht':
      return 'application/xhtml+xml';
    case 'html':
    case 'htm':
      return 'text/html';
    case 'xml':
    case 'opf':
    case 'ncx':
      return 'text/xml';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'ttf':
      return 'font/ttf';
    case 'otf':
      return 'font/otf';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function parseXml(text: string, mime: string): Document {
  return new DOMParser().parseFromString(text, mime as DOMParserSupportedType);
}

function decodeText(buffer: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(buffer);
}

/**
 * epub.js requestMethod: fetch one zip entry and parse it like the default XHR helper.
 */
export async function epubIpcRequest(
  url: string,
  type?: string,
): Promise<Document | Blob | string | ArrayBuffer | object> {
  const entryPath = normalizeEpubEntryPath(url);
  const ext = extensionOf(entryPath);
  const kind = (type || ext || '').toLowerCase();
  const buffer = await readEpubEntryCached(entryPath);

  if (kind === 'blob') {
    return new Blob([new Uint8Array(buffer)], { type: mimeForExt(ext) });
  }
  if (kind === 'binary' || kind === 'arraybuffer') {
    return buffer;
  }
  const text = decodeText(buffer);
  if (kind === 'json') {
    return JSON.parse(text) as object;
  }
  if (XML_EXTS.has(kind) || kind === 'opf') {
    return parseXml(text, 'text/xml');
  }
  if (kind === 'xhtml' || kind === 'xht') {
    return parseXml(text, 'application/xhtml+xml');
  }
  if (kind === 'html' || kind === 'htm') {
    const looksXml =
      text.trimStart().startsWith('<?xml') || /xmlns=["']http:\/\/www\.w3\.org\/1999\/xhtml["']/.test(text);
    return parseXml(text, looksXml ? 'application/xhtml+xml' : 'text/html');
  }
  if (kind === 'text' || kind === 'css') {
    return text;
  }
  return text;
}

export function epubDirectoryUrl(): string {
  return `${EPUB_REQUEST_ORIGIN}/`;
}

/** Origin used by the renderer custom request so epub.js can resolve relative hrefs. */
export const EPUB_REQUEST_ORIGIN = 'https://abr-epub.local';

/** Strip URL origin, query, hash, and leading slashes to a zip entry path. */
export function normalizeEpubEntryPath(raw: string): string {
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep original */
  }
  value = value.replace(/\\/g, '/');
  if (value.startsWith(EPUB_REQUEST_ORIGIN)) {
    value = value.slice(EPUB_REQUEST_ORIGIN.length);
  } else {
    value = value.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '');
  }
  value = value.replace(/^\/+/, '');
  const cut = value.split('#')[0] ?? value;
  return (cut.split('?')[0] ?? cut).replace(/^\/+/, '');
}

/** Resolve `href` against a zip file path (POSIX, `..` safe). */
export function resolveZipPath(fromFile: string, href: string): string {
  const base = fromFile.replace(/\\/g, '/');
  const slash = base.lastIndexOf('/');
  const dir = slash >= 0 ? base.slice(0, slash) : '';
  const combined = dir ? `${dir}/${href.replace(/\\/g, '/')}` : href.replace(/\\/g, '/');
  const parts: string[] = [];
  for (const part of combined.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

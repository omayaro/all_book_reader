/** Custom scheme registered in Electron so iframe img/css can load zip entries. */
export const EPUB_REQUEST_SCHEME = 'abr-epub';

/** Origin used by the renderer custom request so epub.js can resolve relative hrefs. */
export const EPUB_REQUEST_ORIGIN = `${EPUB_REQUEST_SCHEME}://book`;

function collapseDotSegments(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

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
  return collapseDotSegments((cut.split('?')[0] ?? cut).replace(/^\/+/, ''));
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

const FONT_EXT = /\.(ttf|otf|woff2?|eot)$/i;

/** Embedded font files must not block first paint (often tens of MB). */
export function isEpubFontPath(href: string): boolean {
  const path = normalizeEpubEntryPath(href);
  const base = path.split('/').pop() ?? path;
  return FONT_EXT.test(base);
}

/** POSIX relative path from a zip file to another zip file. */
export function posixRelativeFromFile(fromFile: string, toFile: string): string {
  const fromNorm = normalizeEpubEntryPath(fromFile);
  const toNorm = normalizeEpubEntryPath(toFile);
  const slash = fromNorm.lastIndexOf('/');
  const fromDir = slash >= 0 ? fromNorm.slice(0, slash) : '';
  const fromParts = fromDir ? fromDir.split('/') : [];
  const toParts = toNorm.split('/').filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
    i += 1;
  }
  const ups = fromParts.length - i;
  const down = toParts.slice(i);
  if (ups === 0 && down.length === 0) {
    const name = toNorm.split('/').pop() ?? toNorm;
    return name;
  }
  return [...Array.from({ length: ups }, () => '..'), ...down].join('/');
}

export function mimeForEpubEntry(entryPath: string): string {
  const base = (normalizeEpubEntryPath(entryPath).split('/').pop() ?? entryPath).toLowerCase();
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : '';
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

function hrefVariants(sectionPath: string, href: string): string[] {
  const abs = normalizeEpubEntryPath(href);
  const rel = posixRelativeFromFile(sectionPath, abs);
  const sectionNorm = normalizeEpubEntryPath(sectionPath);
  const slash = sectionNorm.lastIndexOf('/');
  const sectionDir = slash >= 0 ? sectionNorm.slice(0, slash) : '';
  const uncollapsed = sectionDir ? `${sectionDir}/${rel}` : abs;
  const variants = [
    href,
    abs,
    rel,
    `./${rel}`,
    uncollapsed,
    `${EPUB_REQUEST_ORIGIN}/${abs}`,
    `${EPUB_REQUEST_ORIGIN}/${uncollapsed}`,
  ];
  try {
    variants.push(decodeURIComponent(href));
  } catch {
    /* ignore */
  }
  try {
    variants.push(decodeURIComponent(rel));
  } catch {
    /* ignore */
  }
  return [...new Set(variants.filter(Boolean))].sort((a, b) => b.length - a.length);
}

/** Replace chapter-relative (and absolute) asset hrefs with blob URLs. */
export function applyEpubAssetReplacements(
  content: string,
  sectionPath: string,
  replacements: Array<{ href: string; blobUrl: string }>,
): string {
  let next = content;
  const sorted = [...replacements]
    .filter((item) => item.href && item.blobUrl)
    .sort((a, b) => b.href.length - a.href.length);
  for (const { href, blobUrl } of sorted) {
    for (const variant of hrefVariants(sectionPath, href)) {
      if (variant && next.includes(variant)) {
        next = next.split(variant).join(blobUrl);
      }
    }
  }
  return next;
}

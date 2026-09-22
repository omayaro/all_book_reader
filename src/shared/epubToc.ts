import { normalizeEpubEntryPath, resolveZipPath } from './epubEntryPath';

export interface EpubTocNode {
  label: string;
  href: string;
}

export interface EpubTocItem {
  id: string;
  label: string;
  href: string;
  hash: string;
  spineIndex: number;
}

function decodeXmlText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/\s+/g, ' ')
    .trim();
}

function splitHref(raw: string): { file: string; hash: string } {
  const trimmed = raw.trim().replace(/\\/g, '/');
  const hashAt = trimmed.indexOf('#');
  if (hashAt < 0) return { file: trimmed.split('?')[0] ?? trimmed, hash: '' };
  return {
    file: (trimmed.slice(0, hashAt).split('?')[0] ?? '').trim(),
    hash: trimmed.slice(hashAt + 1).trim(),
  };
}

function basename(path: string): string {
  const clean = normalizeEpubEntryPath(path);
  const slash = clean.lastIndexOf('/');
  return slash >= 0 ? clean.slice(slash + 1) : clean;
}

/** Match a TOC href to a linear spine index, or -1. */
export function spineIndexForHref(href: string, spineHrefs: string[]): number {
  const file = normalizeEpubEntryPath(splitHref(href).file);
  if (!file) return -1;
  const fileBase = basename(file);
  let loose = -1;
  for (let i = 0; i < spineHrefs.length; i += 1) {
    const spine = normalizeEpubEntryPath(spineHrefs[i] ?? '');
    if (!spine) continue;
    if (spine === file || spine.endsWith(`/${file}`) || file.endsWith(`/${spine}`)) {
      return i;
    }
    if (basename(spine) === fileBase) loose = i;
  }
  return loose;
}

export function assignTocSpineIndices(
  nodes: EpubTocNode[],
  spineHrefs: string[],
): EpubTocItem[] {
  return nodes.map((node, index) => {
    const { file, hash } = splitHref(node.href);
    return {
      id: `toc-${index}`,
      label: node.label || `Item ${index + 1}`,
      href: file || node.href,
      hash,
      spineIndex: spineIndexForHref(node.href, spineHrefs),
    };
  });
}

/** When the book has no nav/ncx, list each spine file. */
export function tocFromSpine(spineHrefs: string[]): EpubTocItem[] {
  return spineHrefs.map((href, index) => {
    const file = normalizeEpubEntryPath(href);
    const name = basename(file).replace(/\.[^.]+$/, '') || `Page ${index + 1}`;
    return {
      id: `spine-${index}`,
      label: decodeURIComponent(name.replace(/_/g, ' ')),
      href: file,
      hash: '',
      spineIndex: index,
    };
  });
}

/**
 * Current spine → TOC row.
 * Uses the last item that starts at or before this spine (chapter spans many files).
 * Same-file TOC rows stay on the first item of that file unless `hash` matches.
 */
export function tocIndexForSpine(
  items: EpubTocItem[],
  spineIndex: number,
  hash = '',
): number {
  if (items.length === 0) return 0;
  const spine = Math.max(0, Math.floor(spineIndex));
  let best = 0;
  let sawExact = false;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    if (item.spineIndex < 0) continue;
    if (item.spineIndex < spine) {
      best = i;
      sawExact = false;
      continue;
    }
    if (item.spineIndex !== spine) continue;
    if (hash && item.hash && item.hash === hash) return i;
    if (!sawExact) {
      best = i;
      sawExact = true;
    } else if (hash && !item.hash) {
      continue;
    }
  }
  return best;
}

export function flattenNavItems(
  nodes: Array<{ label?: string; href?: string; subitems?: unknown[] }>,
  baseFile = '',
): EpubTocNode[] {
  const out: EpubTocNode[] = [];
  const walk = (list: Array<{ label?: string; href?: string; subitems?: unknown[] }>) => {
    for (const node of list) {
      const label = decodeXmlText(String(node.label ?? ''));
      const href = String(node.href ?? '').trim();
      if (label && href) {
        const resolved = baseFile && !/^[a-z][a-z0-9+.-]*:/i.test(href) ? resolveZipPath(baseFile, href) : href;
        out.push({ label, href: resolved });
      }
      if (Array.isArray(node.subitems) && node.subitems.length) {
        walk(node.subitems as Array<{ label?: string; href?: string; subitems?: unknown[] }>);
      }
    }
  };
  walk(nodes);
  return out;
}

function eachAnchor(html: string, visit: (href: string, label: string) => void): void {
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = (match[1] ?? '').match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const label = decodeXmlText((match[2] ?? '').replace(/<[^>]+>/g, ' '));
    if (label) visit(href, label);
  }
}

/** EPUB3 nav.xhtml toc links in document order. */
export function parseNavXhtml(xml: string, navPath: string): EpubTocNode[] {
  const toc =
    xml.match(/<nav\b[^>]*epub:type\s*=\s*["'][^"']*toc[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i)?.[1] ??
    xml.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ??
    xml;
  const nodes: EpubTocNode[] = [];
  eachAnchor(toc, (href, label) => {
    nodes.push({ label, href: resolveZipPath(navPath, href) });
  });
  return nodes;
}

/** EPUB2 toc.ncx navPoints in document order. */
export function parseNcx(xml: string, ncxPath: string): EpubTocNode[] {
  const nodes: EpubTocNode[] = [];
  const re =
    /<navLabel>\s*<text\b[^>]*>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const label = decodeXmlText(match[1] ?? '');
    const src = match[2];
    if (label && src) nodes.push({ label, href: resolveZipPath(ncxPath, src) });
  }
  return nodes;
}

export function buildEpubToc(
  nodes: EpubTocNode[],
  spineHrefs: string[],
): EpubTocItem[] {
  if (nodes.length > 0) return assignTocSpineIndices(nodes, spineHrefs);
  return tocFromSpine(spineHrefs);
}

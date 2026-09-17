import {
  applyEpubAssetReplacements,
  isEpubFontPath,
  normalizeEpubEntryPath,
  posixRelativeFromFile,
} from './shared/epubEntryPath';
import { readEpubEntryCached } from './epubEntryCache';

type EpubResources = {
  urls: string[];
  cssUrls: string[];
  replacementUrls: string[];
  createUrl: (url: string) => Promise<string>;
  settings: {
    resolver: (href: string, absolute?: boolean) => string;
    request: (url: string, type?: string) => Promise<unknown>;
  };
};

function zipPathOf(resources: EpubResources, href: string): string {
  return normalizeEpubEntryPath(resources.settings.resolver(href));
}

function contentMentions(content: string, candidate: string | undefined): boolean {
  if (!candidate) return false;
  if (content.includes(candidate)) return true;
  try {
    const decoded = decodeURIComponent(candidate);
    return decoded !== candidate && content.includes(decoded);
  } catch {
    return false;
  }
}

function mentionsAsset(content: string, sectionPath: string, href: string): boolean {
  const abs = normalizeEpubEntryPath(href);
  const rel = posixRelativeFromFile(sectionPath, abs);
  return (
    contentMentions(content, href) ||
    contentMentions(content, abs) ||
    contentMentions(content, rel) ||
    contentMentions(content, `./${rel}`)
  );
}

async function ensureAssetUrl(resources: EpubResources, index: number): Promise<void> {
  if (resources.replacementUrls[index]) return;
  const href = resources.urls[index];
  if (!href || isEpubFontPath(href)) return;
  const absolute = resources.settings.resolver(href);
  resources.replacementUrls[index] = await resources.createUrl(absolute);
}

async function ensureCssUrl(resources: EpubResources, index: number, cssZipPath: string): Promise<void> {
  if (resources.replacementUrls[index]) return;
  const href = resources.urls[index];
  if (!href) return;
  const absolute = resources.settings.resolver(href);
  const text = (await resources.settings.request(absolute, 'text')) as string;
  const nested: Array<{ href: string; blobUrl: string }> = [];
  for (let i = 0; i < resources.urls.length; i += 1) {
    if (i === index) continue;
    const nestedHref = resources.urls[i];
    if (!nestedHref || resources.cssUrls.includes(nestedHref)) continue;
    if (isEpubFontPath(nestedHref)) continue;
    const nestedAbs = zipPathOf(resources, nestedHref);
    if (!mentionsAsset(text, cssZipPath, nestedAbs) && !contentMentions(text, nestedHref)) {
      continue;
    }
    await ensureAssetUrl(resources, i);
    const blobUrl = resources.replacementUrls[i];
    if (blobUrl) nested.push({ href: nestedAbs, blobUrl });
  }
  const rewritten = applyEpubAssetReplacements(text, cssZipPath, nested);
  const blob = new Blob([rewritten], { type: 'text/css' });
  resources.replacementUrls[index] = URL.createObjectURL(blob);
}

/**
 * Create blob URLs for CSS/images referenced by this chapter, then rewrite the HTML.
 * Uses zip-relative hrefs (not epub.js relativeTo) so Windows / https origins still match.
 */
export async function rewriteSectionAssets(
  resources: unknown,
  html: string,
  sectionUrl: string,
): Promise<string> {
  const res = resources as EpubResources;
  if (!res?.urls?.length) return html;
  const sectionPath = normalizeEpubEntryPath(sectionUrl);
  const needed: number[] = [];
  for (let i = 0; i < res.urls.length; i += 1) {
    const href = res.urls[i];
    if (!href || isEpubFontPath(href)) continue;
    const abs = zipPathOf(res, href);
    if (mentionsAsset(html, sectionPath, abs) || contentMentions(html, href)) {
      needed.push(i);
    }
  }
  const cssNeeded = needed.filter((i) => res.cssUrls.includes(res.urls[i]!));
  const assetNeeded = needed.filter((i) => !res.cssUrls.includes(res.urls[i]!));
  for (const i of assetNeeded) {
    await ensureAssetUrl(res, i);
  }
  for (const i of cssNeeded) {
    await ensureCssUrl(res, i, zipPathOf(res, res.urls[i]!));
  }
  const replacements = needed
    .map((i) => {
      const href = res.urls[i];
      const blobUrl = res.replacementUrls[i];
      if (!href || !blobUrl) return null;
      return { href: zipPathOf(res, href), blobUrl };
    })
    .filter((item): item is { href: string; blobUrl: string } => item != null);
  return applyEpubAssetReplacements(html, sectionPath, replacements);
}

function fontMime(entryPath: string): string {
  const base = entryPath.split('/').pop() ?? entryPath;
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
  if (ext === 'woff2') return 'font/woff2';
  if (ext === 'woff') return 'font/woff';
  if (ext === 'otf') return 'font/otf';
  return 'font/ttf';
}

function fontFamilyFromPath(entryPath: string): string {
  const base = (entryPath.split('/').pop() ?? entryPath).replace(/\.[^.]+$/, '');
  return base || 'Embedded';
}

/** Load embedded fonts after first paint and return a stylesheet blob URL. */
export async function loadEpubFontFaceCss(resources: unknown): Promise<string | null> {
  const res = resources as EpubResources;
  if (!res?.urls?.length) return null;
  const fonts = [...new Set(res.urls.filter(isEpubFontPath))];
  if (fonts.length === 0) return null;
  const rules: string[] = [];
  for (const href of fonts) {
    const absolute = res.settings.resolver(href);
    const entryPath = normalizeEpubEntryPath(absolute);
    const buffer = await readEpubEntryCached(entryPath, 'low');
    const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: fontMime(entryPath) }));
    const family = fontFamilyFromPath(entryPath);
    rules.push(`@font-face { font-family: "${family}"; src: url("${url}"); }`);
  }
  return URL.createObjectURL(new Blob([rules.join('\n')], { type: 'text/css' }));
}

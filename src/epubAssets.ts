import { isEpubFontPath, normalizeEpubEntryPath } from './shared/epubEntryPath';
import { readEpubEntryCached } from './epubEntryCache';

type EpubResources = {
  urls: string[];
  cssUrls: string[];
  replacementUrls: string[];
  relativeTo: (absolute: string) => string[];
  createUrl: (url: string) => Promise<string>;
  substitute: (content: string, url?: string) => string;
  settings: {
    resolver: (href: string, absolute?: boolean) => string;
    request: (url: string, type?: string) => Promise<unknown>;
  };
};

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

async function ensureAssetUrl(resources: EpubResources, index: number): Promise<void> {
  if (resources.replacementUrls[index]) return;
  const href = resources.urls[index];
  if (!href || isEpubFontPath(href)) return;
  const absolute = resources.settings.resolver(href);
  resources.replacementUrls[index] = await resources.createUrl(absolute);
}

async function ensureCssUrl(resources: EpubResources, index: number): Promise<void> {
  if (resources.replacementUrls[index]) return;
  const href = resources.urls[index];
  if (!href) return;
  const absolute = resources.settings.resolver(href);
  const text = (await resources.settings.request(absolute, 'text')) as string;
  const nested = resources.relativeTo(absolute);
  for (let i = 0; i < resources.urls.length; i += 1) {
    if (i === index) continue;
    const nestedHref = resources.urls[i];
    if (!nestedHref || resources.cssUrls.includes(nestedHref)) continue;
    if (isEpubFontPath(nestedHref) || isEpubFontPath(nested[i] ?? '')) continue;
    if (contentMentions(text, nestedHref) || contentMentions(text, nested[i])) {
      await ensureAssetUrl(resources, i);
    }
  }
  const rewritten = resources.substitute(text, absolute);
  const blob = new Blob([rewritten], { type: 'text/css' });
  resources.replacementUrls[index] = URL.createObjectURL(blob);
}

/**
 * Create blob URLs for CSS/images referenced by this chapter, then rewrite the HTML.
 * Fonts are skipped here so a 20–30MB font pack cannot block first paint.
 */
export async function rewriteSectionAssets(
  resources: unknown,
  html: string,
  sectionUrl: string,
): Promise<string> {
  const res = resources as EpubResources;
  if (!res?.urls?.length) return html;
  const relative = res.relativeTo(sectionUrl);
  const needed: number[] = [];
  for (let i = 0; i < res.urls.length; i += 1) {
    const href = res.urls[i];
    if (href && isEpubFontPath(href)) continue;
    if (contentMentions(html, href) || contentMentions(html, relative[i])) {
      needed.push(i);
    }
  }
  const cssNeeded = needed.filter((i) => res.cssUrls.includes(res.urls[i]!));
  const assetNeeded = needed.filter((i) => !res.cssUrls.includes(res.urls[i]!));
  for (const i of assetNeeded) {
    await ensureAssetUrl(res, i);
  }
  for (const i of cssNeeded) {
    await ensureCssUrl(res, i);
  }
  return res.substitute(html, sectionUrl);
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

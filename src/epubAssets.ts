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
  if (!href) return;
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
    if (resources.cssUrls.includes(resources.urls[i]!)) continue;
    if (
      contentMentions(text, resources.urls[i]) ||
      contentMentions(text, nested[i])
    ) {
      await ensureAssetUrl(resources, i);
    }
  }
  const rewritten = resources.substitute(text, absolute);
  const blob = new Blob([rewritten], { type: 'text/css' });
  resources.replacementUrls[index] = URL.createObjectURL(blob);
}

/**
 * Create blob URLs for CSS/images referenced by this chapter, then rewrite the HTML.
 * Avoids epub.js' full-book replacements() which would fetch every asset before first paint.
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
    if (contentMentions(html, res.urls[i]) || contentMentions(html, relative[i])) {
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

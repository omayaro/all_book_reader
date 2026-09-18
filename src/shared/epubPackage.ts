import { resolveZipPath } from './epubEntryPath';

function attr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1] ?? null;
}

function eachTag(xml: string, localName: string, visit: (attrs: string) => void): void {
  const re = new RegExp(`<(?:[\\w.-]+:)?${localName}\\b([^>]*)>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    visit(match[1] ?? '');
  }
}

/** OPF path from META-INF/container.xml. */
export function parseContainerPackagePath(xml: string): string {
  const match = xml.match(/full-path\s*=\s*["']([^"']+)["']/i);
  if (!match?.[1]) {
    throw new Error('Invalid EPUB container.xml (missing rootfile full-path).');
  }
  return match[1].replace(/\\/g, '/');
}

/**
 * Linear spine item hrefs resolved to zip entry paths.
 * `packagePath` is the OPF path inside the archive (e.g. OEBPS/content.opf).
 */
export function parseOpfSpineHrefs(opfXml: string, packagePath: string): string[] {
  const hrefById = new Map<string, string>();
  eachTag(opfXml, 'item', (attrs) => {
    const id = attr(attrs, 'id');
    const href = attr(attrs, 'href');
    if (id && href) hrefById.set(id, href);
  });

  const spine: string[] = [];
  eachTag(opfXml, 'itemref', (attrs) => {
    const linear = attr(attrs, 'linear');
    if (linear && linear.toLowerCase() === 'no') return;
    const idref = attr(attrs, 'idref');
    if (!idref) return;
    const href = hrefById.get(idref);
    if (!href) return;
    spine.push(resolveZipPath(packagePath, href));
  });

  if (spine.length === 0) {
    throw new Error('Invalid EPUB package (empty spine).');
  }
  return spine;
}

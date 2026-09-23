import { describe, expect, it } from 'vitest';
import {
  assignTocSpineIndices,
  buildEpubToc,
  flattenNavItems,
  parseNavXhtml,
  parseNcx,
  tocFromSpine,
  tocIndexForSpine,
} from './epubToc';

const SPINE = [
  'OEBPS/Text/page-1.html',
  'OEBPS/Text/page-5.html',
  'OEBPS/Text/page-6.html',
  'OEBPS/Text/page-20.html',
];

describe('parseNavXhtml / parseNcx', () => {
  it('reads nested EPUB3 toc links', () => {
    const xml = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="Text/page-1.html">처음으로</a></li>
        <li>
          <a href="Text/page-5.html">1장 5초의 법칙</a>
          <ol><li><a href="Text/page-6.html#wake">Wake Up</a></li></ol>
        </li>
        <li><a href="Text/page-20.html">2장</a></li>
      </ol>
    </nav>
  </body>
</html>`;
    expect(parseNavXhtml(xml, 'OEBPS/nav.xhtml')).toEqual([
      { label: '처음으로', href: 'OEBPS/Text/page-1.html', depth: 0 },
      { label: '1장 5초의 법칙', href: 'OEBPS/Text/page-5.html', depth: 0 },
      { label: 'Wake Up', href: 'OEBPS/Text/page-6.html#wake', depth: 0 },
      { label: '2장', href: 'OEBPS/Text/page-20.html', depth: 0 },
    ]);
  });

  it('reads NCX navPoints', () => {
    const xml = `<?xml version="1.0"?>
<ncx>
  <navMap>
    <navPoint id="n1"><navLabel><text>Cover</text></navLabel><content src="page-1.html"/></navPoint>
    <navPoint id="n2"><navLabel><text>Chapter 1</text></navLabel><content src="page-5.html"/></navPoint>
  </navMap>
</ncx>`;
    expect(parseNcx(xml, 'OEBPS/toc.ncx')).toEqual([
      { label: 'Cover', href: 'OEBPS/page-1.html', depth: 0 },
      { label: 'Chapter 1', href: 'OEBPS/page-5.html', depth: 0 },
    ]);
  });
});

describe('tocIndexForSpine', () => {
  const items = assignTocSpineIndices(
    [
      { label: 'Cover', href: 'OEBPS/Text/page-1.html', depth: 0 },
      { label: '1장', href: 'OEBPS/Text/page-5.html', depth: 0 },
      { label: '2장', href: 'OEBPS/Text/page-20.html', depth: 0 },
    ],
    SPINE,
  );

  it('keeps a multi-file chapter highlighted until the next TOC file', () => {
    expect(tocIndexForSpine(items, 0)).toBe(0);
    expect(tocIndexForSpine(items, 1)).toBe(1);
    expect(tocIndexForSpine(items, 2)).toBe(1);
    expect(tocIndexForSpine(items, 3)).toBe(2);
  });

  it('prefers a matching hash inside the same file', () => {
    const withHash = assignTocSpineIndices(
      [
        { label: 'Ch', href: 'OEBPS/Text/page-6.html', depth: 0 },
        { label: 'Wake', href: 'OEBPS/Text/page-6.html#wake', depth: 1 },
      ],
      SPINE,
    );
    expect(tocIndexForSpine(withHash, 2)).toBe(0);
    expect(tocIndexForSpine(withHash, 2, 'wake')).toBe(1);
  });
});

describe('buildEpubToc', () => {
  it('falls back to spine names when nav is empty', () => {
    const items = buildEpubToc([], ['OEBPS/ch1.xhtml', 'OEBPS/notes.xhtml']);
    expect(items.map((item) => item.label)).toEqual(['ch1', 'notes']);
    expect(items.every((item) => item.depth === 0)).toBe(true);
    expect(tocFromSpine(['a/b/c.html'])[0]?.spineIndex).toBe(0);
  });
});

describe('flattenNavItems', () => {
  it('indents a chapter under its part', () => {
    const nodes = flattenNavItems([
      {
        label: '1부',
        href: 'Text/part.html',
        subitems: [{ label: '1장', href: 'Text/ch1.html' }],
      },
    ]);
    expect(nodes.map((node) => ({ label: node.label, depth: node.depth }))).toEqual([
      { label: '1부', depth: 0 },
      { label: '1장', depth: 1 },
    ]);
    const items = buildEpubToc(nodes, ['OEBPS/Text/part.html', 'OEBPS/Text/ch1.html']);
    expect(items.map((item) => item.depth)).toEqual([0, 1]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  EPUB_REQUEST_ORIGIN,
  applyEpubAssetReplacements,
  isEpubFontPath,
  normalizeEpubEntryPath,
  posixRelativeFromFile,
  resolveZipPath,
} from './epubEntryPath';

describe('normalizeEpubEntryPath', () => {
  it('strips the request origin and leading slash', () => {
    expect(normalizeEpubEntryPath(`${EPUB_REQUEST_ORIGIN}/OEBPS/ch1.xhtml`)).toBe(
      'OEBPS/ch1.xhtml',
    );
    expect(normalizeEpubEntryPath('/OEBPS/ch1.xhtml')).toBe('OEBPS/ch1.xhtml');
  });

  it('decodes URI components and drops hash/query', () => {
    expect(normalizeEpubEntryPath('OEBPS/My%20Book.xhtml#frag')).toBe('OEBPS/My Book.xhtml');
    expect(normalizeEpubEntryPath('OEBPS/ch.xhtml?x=1')).toBe('OEBPS/ch.xhtml');
  });

  it('collapses parent-directory segments after the origin', () => {
    expect(
      normalizeEpubEntryPath(`${EPUB_REQUEST_ORIGIN}/OEBPS/Text/../Images/image-1.jpg`),
    ).toBe('OEBPS/Images/image-1.jpg');
  });
});

describe('isEpubFontPath', () => {
  it('detects embedded font files', () => {
    expect(isEpubFontPath('OEBPS/Fonts/KOPUSMjL.ttf')).toBe(true);
    expect(isEpubFontPath('../Fonts/KOPUSGoB.ttf')).toBe(true);
    expect(isEpubFontPath('OEBPS/Styles/style.css')).toBe(false);
    expect(isEpubFontPath('OEBPS/Images/cover.jpg')).toBe(false);
  });
});

describe('resolveZipPath', () => {
  it('resolves hrefs relative to the OPF', () => {
    expect(resolveZipPath('OEBPS/content.opf', 'Text/ch1.xhtml')).toBe('OEBPS/Text/ch1.xhtml');
    expect(resolveZipPath('OEBPS/content.opf', '../Images/cover.png')).toBe('Images/cover.png');
  });
});

describe('posixRelativeFromFile', () => {
  it('builds the chapter-relative hrefs used in EPUB HTML', () => {
    expect(
      posixRelativeFromFile('OEBPS/Text/page-1.html', 'OEBPS/Images/image-1.jpg'),
    ).toBe('../Images/image-1.jpg');
    expect(
      posixRelativeFromFile('OEBPS/Text/page-1.html', 'OEBPS/Styles/style.css'),
    ).toBe('../Styles/style.css');
  });
});

describe('applyEpubAssetReplacements', () => {
  it('rewrites relative image and stylesheet hrefs to blob URLs', () => {
    const html = `<link href="../Styles/style.css"/><img src="../Images/image-1.jpg"/>`;
    const next = applyEpubAssetReplacements(html, 'OEBPS/Text/page-1.html', [
      { href: 'OEBPS/Styles/style.css', blobUrl: 'blob:css' },
      { href: 'OEBPS/Images/image-1.jpg', blobUrl: 'blob:img' },
    ]);
    expect(next).toContain('blob:css');
    expect(next).toContain('blob:img');
    expect(next).not.toContain('../Styles/style.css');
    expect(next).not.toContain('../Images/image-1.jpg');
  });

  it('rewrites origin-prefixed src values to blob URLs, not a mixed origin URL', () => {
    const html = `<img src="${EPUB_REQUEST_ORIGIN}/OEBPS/Text/../Images/image-1.jpg"/>`;
    const next = applyEpubAssetReplacements(html, 'OEBPS/Text/page-1.html', [
      { href: 'OEBPS/Images/image-1.jpg', blobUrl: 'blob:img' },
    ]);
    expect(next).toContain('src="blob:img"');
    expect(next).not.toContain(EPUB_REQUEST_ORIGIN);
  });
});

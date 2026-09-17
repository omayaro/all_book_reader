import { describe, expect, it } from 'vitest';
import {
  EPUB_REQUEST_ORIGIN,
  isEpubFontPath,
  normalizeEpubEntryPath,
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

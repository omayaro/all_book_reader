import { describe, expect, it } from 'vitest';
import { pageFromStripOffset, txtThumbPreviewText, visibleStripPages, htmlToThumbText, firstHtmlImgSrc, epubThumbPreviewText } from './pageStrip';

describe('pageStrip', () => {
  it('computes visible page range with overscan', () => {
    expect(visibleStripPages(0, 300, 100, 100, 1)).toEqual({ start: 1, end: 5 });
    expect(visibleStripPages(500, 200, 100, 100, 0)).toEqual({ start: 6, end: 8 });
  });

  it('maps strip offset to page', () => {
    expect(pageFromStripOffset(0, 50, 100)).toBe(1);
    expect(pageFromStripOffset(250, 50, 100)).toBe(3);
    expect(pageFromStripOffset(99999, 50, 100)).toBe(50);
  });

  it('compacts TXT thumb preview text', () => {
    expect(txtThumbPreviewText('  a\n\nb  c  ', 5)).toBe('a b c'.slice(0, 5));
    expect(txtThumbPreviewText('hello   world')).toBe('hello world');
  });

  it('strips chapter HTML into preview text', () => {
    expect(htmlToThumbText('<p>Hello&nbsp;<b>world</b></p>')).toBe('Hello world');
    expect(htmlToThumbText('<style>p{color:red}</style><p>본문</p>')).toBe('본문');
  });

  it('finds the first chapter image src', () => {
    expect(firstHtmlImgSrc('<p>x</p><img alt="" src="../Images/cover.jpg">')).toBe(
      '../Images/cover.jpg',
    );
    expect(firstHtmlImgSrc('<img src="data:image/png;base64,xx">')).toBeNull();
  });

  it('slices the same spine so later pages show later text', () => {
    const chapter = 'AAA '.repeat(80) + 'BBB '.repeat(80);
    const early = epubThumbPreviewText(chapter, 1, 10, 2);
    const later = epubThumbPreviewText(chapter, 5, 10, 2);
    expect(early.length).toBeGreaterThan(10);
    expect(later.length).toBeGreaterThan(10);
    expect(early).not.toBe(later);
  });
});

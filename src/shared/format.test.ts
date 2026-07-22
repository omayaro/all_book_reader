import { describe, expect, it } from 'vitest';
import { detectFormat, getBookTitle, getExtension, isSupportedBookFile } from './format';

describe('format', () => {
  it('detects supported extensions case-insensitively', () => {
    expect(detectFormat('C:\\Books\\a.PDF')).toBe('pdf');
    expect(detectFormat('/tmp/story.Txt')).toBe('txt');
    expect(detectFormat('novel.epub')).toBe('epub');
    expect(detectFormat('manga.CBZ')).toBe('comic');
    expect(detectFormat('pages.zip')).toBe('comic');
  });

  it('rejects unsupported files', () => {
    expect(isSupportedBookFile('notes.docx')).toBe(false);
    expect(detectFormat('archive.rar')).toBeNull();
  });

  it('extracts extension and title', () => {
    expect(getExtension('C:\\Books\\My Book.pdf')).toBe('.pdf');
    expect(getBookTitle('C:\\Books\\My Book.pdf')).toBe('My Book.pdf');
  });
});

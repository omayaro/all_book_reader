import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isNavigableBookFileName,
  resolveFolderSiblingBasename,
} from './seriesSibling';

describe('isNavigableBookFileName', () => {
  it('accepts book and image extensions', () => {
    expect(isNavigableBookFileName('a.pdf')).toBe(true);
    expect(isNavigableBookFileName('a.epub')).toBe(true);
    expect(isNavigableBookFileName('a.txt')).toBe(true);
    expect(isNavigableBookFileName('a.zip')).toBe(true);
    expect(isNavigableBookFileName('a.cbz')).toBe(true);
    expect(isNavigableBookFileName('a.jpg')).toBe(true);
    expect(isNavigableBookFileName('a.PNG')).toBe(true);
    expect(isNavigableBookFileName('a.docx')).toBe(false);
  });
});

describe('resolveFolderSiblingBasename', () => {
  const yolang = [
    '용랑전 2부 - 중원요란전 01.zip',
    '용랑전 2부 - 중원요란전 02.zip',
    '용랑전 2부 - 중원요란전 03.zip',
    '용랑전 2부 - 중원요란전 04.zip',
    '용랑전 2부 - 중원요란전 05.zip',
    '용랑전 2부 - 중원요란전 06(디카).zip',
    '용랑전 2부 - 중원요란전 07.zip',
    '용랑전 2부 - 중원요란전 08.zip',
    '용랑전 2부 - 중원요란전 09(번역).zip',
  ];

  it('walks irregular suffixes by folder name order', () => {
    expect(resolveFolderSiblingBasename('용랑전 2부 - 중원요란전 05.zip', yolang, 1)).toBe(
      '용랑전 2부 - 중원요란전 06(디카).zip',
    );
    expect(resolveFolderSiblingBasename('용랑전 2부 - 중원요란전 06(디카).zip', yolang, 1)).toBe(
      '용랑전 2부 - 중원요란전 07.zip',
    );
    expect(resolveFolderSiblingBasename('용랑전 2부 - 중원요란전 09(번역).zip', yolang, -1)).toBe(
      '용랑전 2부 - 중원요란전 08.zip',
    );
  });

  it('handles ranges and 화 suffixes', () => {
    const names = [
      '열혈강호 638.zip',
      '열혈강호 639.zip',
      '열혈강호 640-641.zip',
      '열혈강호 642.zip',
      '열혈강호 643.zip',
      '열혈강호 644화.zip',
      '열혈강호 645화.zip',
    ];
    expect(resolveFolderSiblingBasename('열혈강호 639.zip', names, 1)).toBe(
      '열혈강호 640-641.zip',
    );
    expect(resolveFolderSiblingBasename('열혈강호 640-641.zip', names, 1)).toBe(
      '열혈강호 642.zip',
    );
    expect(resolveFolderSiblingBasename('열혈강호 643.zip', names, 1)).toBe(
      '열혈강호 644화.zip',
    );
  });

  it('handles spaced suffix after volume number', () => {
    const names = [
      '하백의 신부 10.zip',
      '하백의 신부 11 - 디카.zip',
      '하백의 신부 12.zip',
    ];
    expect(resolveFolderSiblingBasename('하백의 신부 10.zip', names, 1)).toBe(
      '하백의 신부 11 - 디카.zip',
    );
    expect(resolveFolderSiblingBasename('하백의 신부 11 - 디카.zip', names, 1)).toBe(
      '하백의 신부 12.zip',
    );
  });

  it('returns null at ends or for invalid delta / missing current', () => {
    const names = ['a01.zip', 'a02.zip'];
    expect(resolveFolderSiblingBasename('a01.zip', names, 0)).toBeNull();
    expect(resolveFolderSiblingBasename('a01.zip', names, -1)).toBeNull();
    expect(resolveFolderSiblingBasename('a02.zip', names, 1)).toBeNull();
    expect(resolveFolderSiblingBasename('missing.zip', names, 1)).toBeNull();
  });

  it('matches current basename case-insensitively', () => {
    expect(resolveFolderSiblingBasename('Vol01.ZIP', ['vol01.zip', 'vol02.zip'], 1)).toBe(
      'vol02.zip',
    );
  });

  it('can move between different supported extensions by name order', () => {
    const names = ['chapter1.pdf', 'chapter2.epub', 'chapter3.zip', 'cover.jpg'];
    expect(resolveFolderSiblingBasename('chapter1.pdf', names, 1)).toBe('chapter2.epub');
    expect(resolveFolderSiblingBasename('chapter3.zip', names, 1)).toBe('cover.jpg');
  });

  it('matches Unicode-normalized basenames (NFC vs NFD)', () => {
    const names = [
      '용랑전 2부 - 중원요란전 05.zip',
      '용랑전 2부 - 중원요란전 06(디카).zip',
    ];
    expect(
      resolveFolderSiblingBasename(names[0]!.normalize('NFD'), names, 1),
    ).toBe(names[1]);
  });
});

describe('samples folder navigation (optional)', () => {
  it('walks real 용랑전 zips in samples/ by name order', () => {
    const samplesDir = path.resolve(__dirname, '../../samples');
    if (!fs.existsSync(samplesDir)) return;

    const entries = fs
      .readdirSync(samplesDir)
      .filter((name) => fs.statSync(path.join(samplesDir, name)).isFile())
      .filter((name) => isNavigableBookFileName(name));

    const yolang = entries.filter((name) => name.includes('용랑전') && name.endsWith('.zip'));
    expect(yolang.length).toBeGreaterThanOrEqual(9);

    const vol05 = yolang.find((name) => name.includes('05.zip'));
    const vol06 = yolang.find((name) => name.includes('06('));
    const vol07 = yolang.find((name) => name.includes('07.zip'));
    expect(vol05 && vol06 && vol07).toBeTruthy();

    expect(resolveFolderSiblingBasename(vol05!, entries, 1)).toBe(vol06);
    expect(resolveFolderSiblingBasename(vol06!, entries, 1)).toBe(vol07);
    expect(resolveFolderSiblingBasename(vol06!, entries, -1)).toBe(vol05);
  });
});

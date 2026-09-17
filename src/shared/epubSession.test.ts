import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { isEpubFontPath, resolveZipPath } from './epubEntryPath';
import { epubPrefetchSpine } from './epubPrefetch';
import {
  clearEpubSession,
  openEpubArchive,
  readEpubEntry,
  type EpubSession,
} from '../../electron/epubSession';

function createStoreZip(files: Record<string, string | Uint8Array>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const names = Object.keys(files);
  for (const name of names) {
    const body = files[name]!;
    const data = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const localFull = Buffer.concat([local, nameBuf, data]);
    locals.push(localFull);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += localFull.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Fixture</dc:title>
    <dc:identifier id="id">fixture</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;

function chapter(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${title}</title><link rel="stylesheet" href="style.css"/></head>
  <body><h1>${title}</h1><p>${body}</p></body>
</html>`;
}

describe('epubSession', () => {
  const dirs: string[] = [];

  afterEach(() => {
    clearEpubSession();
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function writeFixture(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abr-epub-'));
    dirs.push(dir);
    const filePath = path.join(dir, 'book.epub');
    const zip = createStoreZip({
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF,
      'OEBPS/nav.xhtml': chapter('Nav', 'Table of contents'),
      'OEBPS/ch1.xhtml': chapter('Chapter 1', 'First chapter body UNIQUE_CH1'),
      'OEBPS/ch2.xhtml': chapter('Chapter 2', 'Second chapter body UNIQUE_CH2'),
      'OEBPS/style.css': 'body { font-family: serif; }',
    });
    fs.writeFileSync(filePath, zip);
    return filePath;
  }

  it('opens spine metadata and the first chapter without a full-file buffer', async () => {
    const filePath = writeFixture();
    const opened = await openEpubArchive(filePath);
    expect(opened.spineHrefs).toEqual(['OEBPS/ch1.xhtml', 'OEBPS/ch2.xhtml']);
    expect(opened.packagePath).toBe('OEBPS/content.opf');
    expect(opened.entries.length).toBeGreaterThanOrEqual(6);
    expect('fileData' in opened).toBe(false);

    const first = await readEpubEntry(opened.spineHrefs[0]!);
    expect(new TextDecoder().decode(first)).toContain('UNIQUE_CH1');
  });
});

const OPEN_BUDGET_MS = 1000;

function findFiveSecondRuleSample(): string | null {
  const dir = path.resolve('samples');
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir);
  const match =
    names.find((name) => /5초|5-second|5sec/i.test(name) && name.toLowerCase().endsWith('.epub')) ??
    names.find(
      (name) => name.toLowerCase().endsWith('.epub') && !name.toLowerCase().includes('frankenstein'),
    );
  return match ? path.join(dir, match) : null;
}

async function readPaintAssets(session: EpubSession, spineIndex: number): Promise<void> {
  const href = session.spineHrefs[spineIndex];
  if (!href) throw new Error(`Missing spine item ${spineIndex}`);
  const html = new TextDecoder().decode(await readEpubEntry(href, 'high'));
  for (const entry of session.entries) {
    if (entry.toLowerCase().endsWith('.css')) await readEpubEntry(entry, 'high');
  }
  const refs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]!);
  for (const src of refs) {
    if (/^[a-z]+:/i.test(src)) continue;
    const resolved = resolveZipPath(href, src);
    if (isEpubFontPath(resolved)) continue;
    try {
      await readEpubEntry(resolved, 'high');
    } catch {
      /* optional */
    }
  }
}

describe('epub 5-second-rule sample open budget', () => {
  const sample = findFiveSecondRuleSample();

  afterEach(() => {
    clearEpubSession();
  });

  it.skipIf(!sample)('opens the first chapter (html+css+images, no fonts) within 1s', async () => {
    const t0 = Date.now();
    const opened = await openEpubArchive(sample!);
    expect(opened.spineHrefs.length).toBeGreaterThan(1);
    await readPaintAssets(opened, 0);
    expect(Date.now() - t0).toBeLessThan(OPEN_BUDGET_MS);
  });

  it.skipIf(!sample)('reopens at the end and reads the previous chapter within 1s', async () => {
    const t0 = Date.now();
    const opened = await openEpubArchive(sample!);
    const last = opened.spineHrefs.length - 1;
    await readPaintAssets(opened, last);
    for (const index of epubPrefetchSpine(last, opened.spineHrefs.length, 1)) {
      if (index !== last) await readPaintAssets(opened, index);
    }
    expect(Date.now() - t0).toBeLessThan(OPEN_BUDGET_MS);
  });

  it.skipIf(!sample)('reopens in the middle and reads neighbors within 1s', async () => {
    const t0 = Date.now();
    const opened = await openEpubArchive(sample!);
    const mid = Math.floor(opened.spineHrefs.length / 2);
    await readPaintAssets(opened, mid);
    for (const index of epubPrefetchSpine(mid, opened.spineHrefs.length, 1)) {
      if (index !== mid) await readPaintAssets(opened, index);
    }
    expect(Date.now() - t0).toBeLessThan(OPEN_BUDGET_MS);
  });
});

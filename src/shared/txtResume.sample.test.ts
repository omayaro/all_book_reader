import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { updateRecentProgress, upsertRecentBook } from './recent';
import { clearTxtSession, openTxtSession, readTxtPage } from '../../electron/txtSession';
import { TXT_PAGE_TARGET_BYTES } from './txtPages';

describe('txt fixed pages resume', () => {
  let tmpDir = '';
  let samplePath = '';

  afterEach(() => {
    clearTxtSession();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    tmpDir = '';
    samplePath = '';
  });

  function writeLargeSample(): { path: string; midOffset: number } {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abr-txt-pages-'));
    samplePath = path.join(tmpDir, 'book.txt');
    const line = 'Chapter line for pagination testing.\n';
    const chunks: string[] = [];
    // ~40 pages worth so mid-file seek is meaningful.
    const targetBytes = TXT_PAGE_TARGET_BYTES * 40;
    while (Buffer.byteLength(chunks.join(''), 'utf8') < targetBytes) {
      chunks.push(line);
    }
    const body = chunks.join('');
    fs.writeFileSync(samplePath, `START_MARKER\n${body}MID_MARKER_UNIQUE\n${body}END_MARKER\n`, 'utf8');
    const midOffset = Buffer.byteLength(`START_MARKER\n${body}`, 'utf8');
    return { path: samplePath, midOffset };
  }

  it('opens a mid-file byte as a stable page (not file start)', () => {
    const sample = writeLargeSample();
    const resumed = openTxtSession(sample.path, 1, sample.midOffset);
    expect(resumed.totalPages).toBeGreaterThan(10);
    expect(resumed.page).toBeGreaterThan(1);
    expect(Math.abs(resumed.startByte - sample.midOffset)).toBeLessThan(TXT_PAGE_TARGET_BYTES + 1024);
    expect(resumed.text).toContain('MID_MARKER_UNIQUE');

    clearTxtSession();
    const fromStart = openTxtSession(sample.path, 1);
    expect(fromStart.page).toBe(1);
    expect(fromStart.startByte).toBe(0);
    expect(fromStart.text).toContain('START_MARKER');
    expect(fromStart.text.slice(0, 40)).not.toBe(resumed.text.slice(0, 40));
  });

  it('round-trips store progress → reopen same page', () => {
    const sample = writeLargeSample();
    const mid = openTxtSession(sample.path, 1, sample.midOffset);
    let list = upsertRecentBook([], {
      id: 'sample-txt',
      path: sample.path,
      format: 'txt',
    });
    list = updateRecentProgress(
      list,
      'sample-txt',
      mid.page,
      mid.totalPages,
      mid.startByte / mid.byteLength,
      mid.startByte,
    );

    clearTxtSession();
    const again = openTxtSession(
      sample.path,
      list[0]!.lastPage ?? 1,
      list[0]!.lastByteOffset,
    );
    expect(again.page).toBe(mid.page);
    expect(again.startByte).toBe(mid.startByte);
    expect(readTxtPage(again.page).text.slice(0, 80)).toBe(mid.text.slice(0, 80));
  });
});

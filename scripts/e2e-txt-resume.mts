/**
 * End-to-end (main-process path): persist mid-file byte, reopen samples/TestFile.txt
 * via fixed page index (Option B).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBookId } from '../src/shared/bookId';
import { AppStore } from '../electron/store';
import { clearTxtSession, openTxtSession } from '../electron/txtSession';

const samplePath = path.resolve('samples/TestFile.txt');
const SAVED_OFFSET = 13_723_349;
const SAVED_RATIO = 0.4885;

function main(): void {
  if (!fs.existsSync(samplePath)) {
    console.error('FAIL: missing', samplePath);
    process.exit(1);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abr-txt-pages-'));
  const store = new AppStore(tmp);
  const stat = fs.statSync(samplePath);
  const id = buildBookId({
    path: samplePath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  });

  store.upsertRecent({
    id,
    path: samplePath,
    format: 'txt',
    title: 'TestFile.txt',
  });
  store.updateProgress(id, 1, 1, SAVED_RATIO, SAVED_OFFSET);

  const existing = store.getState().recentBooks.find((b) => b.path === samplePath);
  if (!existing?.lastByteOffset) {
    console.error('FAIL: store did not persist lastByteOffset', existing);
    process.exit(1);
  }

  clearTxtSession();
  const chunk = openTxtSession(
    samplePath,
    existing.lastPage ?? 1,
    existing.lastByteOffset,
  );
  const startChunk = openTxtSession(samplePath, 1);
  clearTxtSession();

  console.log({
    persistedOffset: existing.lastByteOffset,
    page: chunk.page,
    totalPages: chunk.totalPages,
    startByte: chunk.startByte,
    startPreview: startChunk.text.slice(0, 40).replace(/\s+/g, ' '),
    resumePreview: chunk.text.slice(0, 40).replace(/\s+/g, ' '),
  });

  const ok =
    chunk.page > 1 &&
    chunk.totalPages > 1000 &&
    Math.abs(chunk.startByte - SAVED_OFFSET) < 16_384 &&
    chunk.text.slice(0, 40) !== startChunk.text.slice(0, 40);

  fs.rmSync(tmp, { recursive: true, force: true });

  if (!ok) {
    console.error('FAIL: fixed-page reopen did not restore mid-file position');
    process.exit(1);
  }
  console.log('OK: Option B page resume works for TestFile.txt');
}

main();

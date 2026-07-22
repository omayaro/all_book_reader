import fs from 'node:fs';
import path from 'node:path';
import { clearTxtSession, openTxtSession } from '../electron/txtSession';

const samplePath = path.resolve('samples/TestFile.txt');
const SAVED_OFFSET = 13_723_349;

function main(): void {
  if (!fs.existsSync(samplePath)) {
    console.error('FAIL: missing', samplePath);
    process.exit(1);
  }

  clearTxtSession();
  const fromStart = openTxtSession(samplePath, 1);
  clearTxtSession();
  const resumed = openTxtSession(samplePath, 1, SAVED_OFFSET);
  clearTxtSession();

  console.log({
    startPage: fromStart.page,
    resumePage: resumed.page,
    totalPages: resumed.totalPages,
    saved: SAVED_OFFSET,
    startByte: resumed.startByte,
    delta: resumed.startByte - SAVED_OFFSET,
    startPreview: fromStart.text.slice(0, 50).replace(/\s+/g, ' '),
    resumePreview: resumed.text.slice(0, 50).replace(/\s+/g, ' '),
  });

  const ok =
    resumed.page > 1 &&
    Math.abs(resumed.startByte - SAVED_OFFSET) < 16_384 &&
    resumed.text.slice(0, 40) !== fromStart.text.slice(0, 40);

  if (!ok) {
    console.error('FAIL');
    process.exit(1);
  }
  console.log('OK: verify-txt-resume (Option B)');
}

main();

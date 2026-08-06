/**
 * Local smoke: open each samples/*.zip via the same comicSession path as Electron main.
 * Run: node scripts/smoke-comic-open.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  openComicArchive,
  clearComicSession,
  readComicPage,
} = require(path.join(root, 'dist-electron/electron/comicSession.js'));

const samplesDir = path.join(root, 'samples');
const zips = fs
  .readdirSync(samplesDir)
  .filter((name) => name.toLowerCase().endsWith('.zip'))
  .sort((a, b) => a.localeCompare(b, 'ko'));

if (zips.length === 0) {
  console.error('No sample zips found in samples/');
  process.exit(1);
}

const OPEN_BUDGET_MS = 500;
const FIRST_PAGE_BUDGET_MS = 2000;
const WARM10_BUDGET_MS = 15000;

const results = [];

for (const name of zips) {
  const full = path.join(samplesDir, name);
  const sizeMb = +(fs.statSync(full).size / (1024 * 1024)).toFixed(1);

  clearComicSession();
  const tOpen = Date.now();
  const session = await openComicArchive(full);
  const openMs = Date.now() - tOpen;

  const tPage = Date.now();
  const page0 = await readComicPage(0);
  const page0Ms = Date.now() - tPage;

  const warmCount = Math.min(10, session.entries.length);
  const tWarm = Date.now();
  for (let i = 0; i < warmCount; i += 1) {
    await readComicPage(i);
  }
  const warm10Ms = Date.now() - tWarm;

  clearComicSession();

  const row = {
    name,
    sizeMb,
    pages: session.entries.length,
    openMs,
    page0Ms,
    page0Bytes: page0.byteLength,
    warm10Ms,
    openOk: openMs <= OPEN_BUDGET_MS,
    page0Ok: page0Ms <= FIRST_PAGE_BUDGET_MS && page0.byteLength > 1000,
    warmOk: warm10Ms <= WARM10_BUDGET_MS,
  };
  results.push(row);
  console.log(JSON.stringify(row));
}

// Simulate PageDown: open 05, then switch to 06(디카) measuring open+page0
const vol05 = zips.find((n) => n.includes('05.zip'));
const vol06 = zips.find((n) => n.includes('06('));
if (vol05 && vol06) {
  clearComicSession();
  await openComicArchive(path.join(samplesDir, vol05));
  await readComicPage(0);
  clearComicSession();
  const tSwitch = Date.now();
  const next = await openComicArchive(path.join(samplesDir, vol06));
  await readComicPage(0);
  const switchMs = Date.now() - tSwitch;
  clearComicSession();
  const switchRow = {
    scenario: 'PageDown 05 -> 06(디카) open+page0',
    switchMs,
    pages: next.entries.length,
    ok: switchMs <= OPEN_BUDGET_MS + FIRST_PAGE_BUDGET_MS,
  };
  console.log(JSON.stringify(switchRow));
  results.push(switchRow);
}

const failed = results.filter((r) =>
  'openOk' in r ? !(r.openOk && r.page0Ok && r.warmOk) : r.ok === false,
);
console.log(
  JSON.stringify({
    summary: failed.length === 0 ? 'PASS' : 'FAIL',
    budgets: { OPEN_BUDGET_MS, FIRST_PAGE_BUDGET_MS, WARM10_BUDGET_MS },
    failed: failed.map((r) => r.name || r.scenario),
  }),
);
process.exit(failed.length === 0 ? 0 : 1);

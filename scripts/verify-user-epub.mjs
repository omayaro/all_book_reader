import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  openEpubArchive,
  clearEpubSession,
  readEpubEntry,
} = require(path.join(root, 'dist-electron/electron/epubSession.js'));

const CDP_PORT = 9333;
const epub =
  process.env.ABR_VERIFY_EPUB ||
  'Z:\\SOUNGHWAN\\Amway\\BookReading\\5초의 법칙 - 멜 로빈스\\5초의 법칙-멜 로빈스 (2017).epub';
const exe = path.join(root, 'release/win-unpacked/All Book Reader.exe');

function log(label, value) {
  console.log(JSON.stringify({ label, value }));
}

function killApp() {
  try {
    execSync('taskkill /F /IM "All Book Reader.exe" /T', { stdio: 'ignore' });
  } catch {
    /* not running */
  }
}

async function verifySession() {
  if (!fs.existsSync(epub)) {
    throw new Error(`EPUB not found: ${epub}`);
  }
  const t0 = Date.now();
  clearEpubSession();
  const session = await openEpubArchive(epub);
  const openMs = Date.now() - t0;
  const first = session.spineHrefs[0];
  const t1 = Date.now();
  const html = await readEpubEntry(first, 'high');
  const htmlMs = Date.now() - t1;
  const text = Buffer.from(html).toString('utf8');
  log('session', {
    openMs,
    htmlMs,
    spine: session.spineHrefs.length,
    first,
    htmlHasImg: /<img/i.test(text),
    htmlPreview: text.replace(/\s+/g, ' ').slice(0, 180),
  });
  clearEpubSession();
  if (openMs + htmlMs > 1000) {
    throw new Error(`session open too slow: ${openMs + htmlMs}ms`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCdpPages() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      if (res.ok) {
        const targets = await res.json();
        const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pages.length) return pages;
      }
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error('CDP page target not found');
}

function attachCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const consoles = [];
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')));
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params?.args || [])
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ');
      consoles.push(text);
    }
    if (msg.method === 'Log.entryAdded') {
      consoles.push(String(msg.params?.entry?.text || msg.params?.entry?.args || ''));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoles.push(`EXCEPTION ${msg.params?.exceptionDetails?.text || ''}`);
    }
    if (msg.id != null && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    }
  });
  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.result?.subtype === 'error') {
      throw new Error(result.result.description ?? 'evaluate error');
    }
    return result.result?.value;
  }
  return { ws, ready, send, evaluate, consoles };
}

async function verifyUi() {
  if (!fs.existsSync(exe)) throw new Error(`missing exe ${exe}`);
  killApp();
  const child = spawn(exe, [`--remote-debugging-port=${CDP_PORT}`], {
    cwd: path.dirname(exe),
    detached: false,
    stdio: 'ignore',
  });
  const pages = await waitForCdpPages();
  let session = null;
  for (const page of pages) {
    const candidate = attachCdp(page.webSocketDebuggerUrl);
    await candidate.ready;
    await candidate.send('Runtime.enable');
    await candidate.send('Log.enable');
    for (let i = 0; i < 20; i += 1) {
      if (await candidate.evaluate('Boolean(window.api)')) {
        session = candidate;
        break;
      }
      await sleep(250);
    }
    if (session) break;
    candidate.ws.close();
  }
  if (!session) {
    throw new Error('window.api never appeared');
  }

  for (let i = 0; i < 40; i += 1) {
    if (await session.evaluate(`Boolean(document.querySelector('.home') || document.querySelector('.reader'))`)) {
      break;
    }
    await sleep(250);
  }

  await sleep(800);
  await session.evaluate(`window.api.saveSettings({ pageMode: 'single' })`);
  await sleep(200);
  const openedAt = Date.now();
  const openExpr = `window.dispatchEvent(new CustomEvent('abr:open-path', { detail: ${JSON.stringify(epub)} }))`;
  await session.evaluate(openExpr);
  await session.evaluate(`console.info('hello-verify')`);

  let probe = null;
  for (let i = 0; i < 48; i += 1) {
    probe = await session.evaluate(`
      (() => {
        const iframe = document.querySelector('.epub-viewer iframe');
        const doc = iframe && iframe.contentDocument;
        const imgs = doc ? [...doc.images] : [];
        const bodyText = doc?.body ? (doc.body.innerText || '').trim() : '';
        const html = doc?.documentElement ? doc.documentElement.outerHTML : '';
        return {
          home: Boolean(document.querySelector('.home')),
          hasViewer: Boolean(document.querySelector('.epub-viewer')),
          viewerW: document.querySelector('.epub-viewer')?.clientWidth || 0,
          viewerH: document.querySelector('.epub-viewer')?.clientHeight || 0,
          viewerHTML: (document.querySelector('.epub-viewer')?.innerHTML || '').slice(0, 240),
          pageInput: document.querySelector('.page-input')?.value || '',
          allIframes: document.querySelectorAll('iframe').length,
          status: document.querySelector('.status')?.textContent || '',
          iframeCount: document.querySelectorAll('.epub-viewer iframe').length,
          iframeW: iframe ? iframe.clientWidth : 0,
          iframeH: iframe ? iframe.clientHeight : 0,
          bodyText: bodyText.slice(0, 120),
          imgCount: imgs.length,
          imgSrc: imgs[0] ? String(imgs[0].getAttribute('src') || '').slice(0, 120) : '',
          imgCurrentSrc: imgs[0] ? String(imgs[0].currentSrc || '').slice(0, 120) : '',
          imgW: imgs[0] ? imgs[0].naturalWidth : 0,
          imgH: imgs[0] ? imgs[0].naturalHeight : 0,
          htmlHasBlob: html.includes('blob:'),
          htmlHasAbr: html.includes('abr-epub:'),
          htmlPreview: html.replace(/\\s+/g, ' ').slice(0, 220),
        };
      })()
    `);
    if (probe?.imgW > 10 || (probe?.bodyText && probe.bodyText.length > 5) || probe?.htmlHasBlob) break;
    await sleep(250);
  }
  const uiMs = Date.now() - openedAt;
  log('ui', { uiMs, probe, consoles: session.consoles.slice(-30) });

  const painted = Boolean(probe?.imgW > 10 || (probe?.bodyText && probe.bodyText.length > 5) || probe?.htmlHasBlob);
  if (!painted) {
    await session.evaluate(`
      [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'Close')?.click()
    `);
    await sleep(800);
    await session.evaluate(openExpr);
    for (let i = 0; i < 40; i += 1) {
      probe = await session.evaluate(`
        (() => {
          const iframe = document.querySelector('.epub-viewer iframe');
          const doc = iframe && iframe.contentDocument;
          const imgs = doc ? [...doc.images] : [];
          const bodyText = doc?.body ? (doc.body.innerText || '').trim() : '';
          const html = doc?.documentElement ? doc.documentElement.outerHTML : '';
          return {
            home: Boolean(document.querySelector('.home')),
            hasViewer: Boolean(document.querySelector('.epub-viewer')),
            viewerHTML: (document.querySelector('.epub-viewer')?.innerHTML || '').slice(0, 240),
            pageInput: document.querySelector('.page-input')?.value || '',
            iframeCount: document.querySelectorAll('.epub-viewer iframe').length,
            bodyText: bodyText.slice(0, 120),
            imgW: imgs[0] ? imgs[0].naturalWidth : 0,
            htmlHasBlob: html.includes('blob:'),
          };
        })()
      `);
      if (probe?.imgW > 10 || (probe?.bodyText && probe.bodyText.length > 5) || probe?.htmlHasBlob) break;
      await sleep(250);
    }
    log('ui-retry', { probe, consoles: session.consoles.filter((line) => String(line).includes('[epub]')).slice(-8) });
  }
  if (!(probe?.imgW > 10 || (probe?.bodyText && probe.bodyText.length > 5) || probe?.htmlHasBlob)) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error(`EPUB UI did not paint: ${JSON.stringify(probe)}`);
  }

  for (let i = 0; i < 8; i += 1) {
    await session.evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      }))
    `);
    await sleep(120);
  }
  await sleep(800);
  const afterTurn = await session.evaluate(`
    window.api.getState().then((state) => {
      const book = (state.recentBooks || []).find((item) => String(item.path || '').toLowerCase().includes('epub'))
        || (state.recentBooks || [])[0];
      return { page: book?.lastPage, total: book?.totalPages, path: book?.path || '' };
    })
  `);
  log('afterTurn', afterTurn);
  const startPage = Math.max(1, Number(probe?.pageInput) || 1);
  if (
    !(
      afterTurn?.page >= startPage &&
      afterTurn.page <= startPage + 12 &&
      afterTurn.page < 400
    )
  ) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error(`page turns were not sequential ±1: ${JSON.stringify(afterTurn)}`);
  }
  let tocLayout = null;
  for (let i = 0; i < 20; i += 1) {
    tocLayout = await session.evaluate(`
      (() => {
        const toc = document.querySelector('.epub-toc');
        const stage = document.querySelector('.reader-stage');
        const strip = document.querySelector('.page-preview-strip');
        const tr = toc && toc.getBoundingClientRect();
        const st = stage && stage.getBoundingClientRect();
        const labels = [...document.querySelectorAll('.epub-toc-item')].map((el) => el.textContent || '');
        return {
          hasToc: Boolean(toc),
          hasStrip: Boolean(strip),
          tocLeft: tr ? Math.round(tr.left) : 0,
          stageRight: st ? Math.round(st.right) : 0,
          count: labels.length,
          active: [...document.querySelectorAll('.epub-toc-item.active')].map((el) => el.textContent || ''),
          labels: labels.slice(0, 8),
        };
      })()
    `);
    if (tocLayout?.hasToc && tocLayout.count >= 2) break;
    await sleep(250);
  }
  log('toc', tocLayout);
  if (!tocLayout?.hasToc || tocLayout.count < 2) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error(`EPUB table of contents missing: ${JSON.stringify(tocLayout)}`);
  }
  if (tocLayout.hasStrip) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error('EPUB still shows the page strip');
  }
  if (!(tocLayout.tocLeft + 4 >= tocLayout.stageRight)) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error(`EPUB TOC is not on the right: ${JSON.stringify(tocLayout)}`);
  }
  await session.evaluate(`
    [...document.querySelectorAll('button')].find((el) => (el.textContent || '').includes('Two Pages'))?.click()
  `);
  await sleep(2500);
  const twoPageToc = await session.evaluate(`
    (() => {
      const toc = document.querySelector('.epub-toc');
      return {
        hasToc: Boolean(toc),
        count: document.querySelectorAll('.epub-toc-item').length,
        twoPages: [...document.querySelectorAll('button')].some((el) => (el.textContent || '').includes('Two Pages') && el.disabled),
      };
    })()
  `);
  log('twoPageToc', twoPageToc);
  if (!twoPageToc?.hasToc || twoPageToc.count < 2) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error(`Two Pages should keep the TOC: ${JSON.stringify(twoPageToc)}`);
  }
  await sleep(3500);
  const afterGenerate = await session.evaluate(`
    window.api.getState().then((state) => {
      const book = (state.recentBooks || []).find((item) => String(item.path || '').toLowerCase().includes('epub'))
        || (state.recentBooks || [])[0];
      const iframe = document.querySelector('.epub-viewer iframe');
      const doc = iframe && iframe.contentDocument;
      return {
        page: book?.lastPage,
        total: book?.totalPages,
        bodyText: doc?.body ? (doc.body.innerText || '').trim().slice(0, 80) : '',
      };
    })
  `);
  log('afterGenerate', { afterGenerate, consoles: session.consoles.filter((line) => String(line).includes('[epub]')).slice(-8) });
  if (!(afterGenerate?.page > 1)) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error(`locations.generate reset progress to page 1: ${JSON.stringify(afterGenerate)}`);
  }
  if (Math.abs((afterGenerate?.page || 0) - (afterTurn?.page || 0)) > 2 || afterGenerate.page > 50) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error(`locations.generate remapped the live page: ${JSON.stringify({ afterTurn, afterGenerate })}`);
  }
  const beforeJumpText = afterGenerate?.bodyText || '';
  const tocJump = await session.evaluate(`
    (() => {
      const buttons = [...document.querySelectorAll('.epub-toc-item')];
      const current = document.querySelector('.epub-toc-item.active');
      const later = buttons.find((el, index) => el !== current && index >= 5) || buttons[buttons.length - 1];
      if (!later) return { ok: false };
      later.click();
      return { ok: true, label: later.textContent || '' };
    })()
  `);
  if (!tocJump?.ok) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error('TOC item was not clickable');
  }
  await sleep(1200);
  const afterJump = await session.evaluate(`
    window.api.getState().then((state) => {
      const book = (state.recentBooks || []).find((item) => String(item.path || '').toLowerCase().includes('epub'))
        || (state.recentBooks || [])[0];
      const iframe = document.querySelector('.epub-viewer iframe');
      const doc = iframe && iframe.contentDocument;
        return {
          page: book?.lastPage,
          total: book?.totalPages,
          lastCfi: book?.lastCfi || '',
          jumpMode: 'toc',
          active: [...document.querySelectorAll('.epub-toc-item.active')].map((el) => el.textContent || ''),
          bodyText: doc?.body ? (doc.body.innerText || '').trim().slice(0, 80) : '',
        };
    })
  `);
  log('afterJump', { afterJump, beforeJumpText, tocJump });
  if (!(afterJump?.page >= 1)) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error(`TOC jump did not keep a page: ${JSON.stringify(afterJump)}`);
  }
  if (!(afterJump?.lastCfi && String(afterJump.lastCfi).startsWith('epubcfi('))) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error(`TOC jump did not save a CFI: ${JSON.stringify(afterJump)}`);
  }
  if (tocJump.label && afterJump?.active?.[0] && afterJump.active[0] !== tocJump.label) {
    session.ws.close();
    try {
      if (child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    killApp();
    throw new Error(`TOC highlight did not follow the click: ${JSON.stringify({ tocJump, afterJump })}`);
  }
  await session.evaluate(`window.dispatchEvent(new Event('beforeunload'))`);
  await sleep(400);
  session.ws.close();
  try {
    if (child.pid) process.kill(child.pid);
  } catch {
    /* ignore */
  }
  killApp();
  await sleep(500);

  const child2 = spawn(exe, [`--remote-debugging-port=${CDP_PORT}`], {
    cwd: path.dirname(exe),
    detached: false,
    stdio: 'ignore',
  });
  const pages2 = await waitForCdpPages();
  let session2 = null;
  for (const page of pages2) {
    const candidate = attachCdp(page.webSocketDebuggerUrl);
    await candidate.ready;
    await candidate.send('Runtime.enable');
    await candidate.send('Log.enable');
    for (let i = 0; i < 20; i += 1) {
      if (await candidate.evaluate('Boolean(window.api)')) {
        session2 = candidate;
        break;
      }
      await sleep(250);
    }
    if (session2) break;
    candidate.ws.close();
  }
  if (!session2) {
    killApp();
    throw new Error('window.api never appeared on reopen');
  }
  for (let i = 0; i < 40; i += 1) {
    if (await session2.evaluate(`Boolean(document.querySelector('.home') || document.querySelector('.reader'))`)) {
      break;
    }
    await sleep(250);
  }
  await session2.evaluate(openExpr);
  let resumeProbe = null;
  for (let i = 0; i < 48; i += 1) {
    resumeProbe = await session2.evaluate(`
      window.api.getState().then((state) => {
        const book = (state.recentBooks || []).find((item) => String(item.path || '').includes('5'))
          || (state.recentBooks || [])[0];
        const iframe = document.querySelector('.epub-viewer iframe');
        const doc = iframe && iframe.contentDocument;
        return {
          page: book?.lastPage || 0,
          total: book?.totalPages || 0,
          hasViewer: Boolean(document.querySelector('.epub-viewer')),
          iframeCount: document.querySelectorAll('.epub-viewer iframe').length,
          bodyText: doc?.body ? (doc.body.innerText || '').trim().slice(0, 80) : '',
        };
      })
    `);
    if (resumeProbe?.hasViewer && resumeProbe.page > 1 && (resumeProbe.iframeCount > 0 || (resumeProbe.bodyText && resumeProbe.bodyText.length > 5))) break;
    await sleep(250);
  }
  let resumeLog = session2.consoles.find((line) => String(line).includes('[epub] first display'));
  for (let i = 0; i < 16 && !resumeLog; i += 1) {
    await sleep(250);
    resumeLog = session2.consoles.find((line) => String(line).includes('[epub] first display'));
  }
  const spineMatch = String(resumeLog || '').match(/spine=(\d+)\//);
  const resumeSpine = spineMatch ? Number(spineMatch[1]) : 0;
  log('resume', { resumeProbe, resumeLog, resumeSpine });
  await sleep(3500);
  const resumeAfterGenerate = await session2.evaluate(`
    window.api.getState().then((state) => {
      const book = (state.recentBooks || []).find((item) => String(item.path || '').includes('5'))
        || (state.recentBooks || [])[0];
      const iframe = document.querySelector('.epub-viewer iframe');
      const doc = iframe && iframe.contentDocument;
      return {
        page: book?.lastPage || 0,
        total: book?.totalPages || 0,
        bodyText: doc?.body ? (doc.body.innerText || '').trim().slice(0, 80) : '',
      };
    })
  `);
  const generateLog = session2.consoles.find((line) => String(line).includes('locations.generate'));
  log('resumeAfterGenerate', { resumeAfterGenerate, generateLog });
  session2.ws.close();
  try {
    if (child2.pid) process.kill(child2.pid);
  } catch {
    /* ignore */
  }
  killApp();
  if (!(resumeProbe?.page > 1)) {
    throw new Error(`EPUB did not resume away from page 1: ${JSON.stringify(resumeProbe)}`);
  }
  if (!(resumeSpine > 1)) {
    throw new Error(`EPUB resume opened cover spine: ${JSON.stringify({ resumeLog, resumeSpine })}`);
  }
  if (!(resumeProbe?.bodyText && resumeProbe.bodyText.length > 5) && !(resumeAfterGenerate?.bodyText && resumeAfterGenerate.bodyText.length > 5)) {
    throw new Error(`EPUB resume did not show chapter text: ${JSON.stringify({ resumeProbe, resumeAfterGenerate })}`);
  }
  if (!(resumeAfterGenerate?.page > 1)) {
    throw new Error(`EPUB resume lost progress after locations.generate: ${JSON.stringify(resumeAfterGenerate)}`);
  }
  if (Math.abs((resumeAfterGenerate?.page || 0) - (afterJump?.page || 0)) > 5) {
    throw new Error(`EPUB resume page drifted: ${JSON.stringify({ afterJump, resumeAfterGenerate })}`);
  }
}

const mode = process.argv[2] || 'all';
if (mode === 'session' || mode === 'all') await verifySession();
if (mode === 'ui' || mode === 'all') await verifyUi();
console.log('OK');

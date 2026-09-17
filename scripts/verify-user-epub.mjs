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

  const openedAt = Date.now();
  const openExpr = `window.dispatchEvent(new CustomEvent('abr:open-path', { detail: ${JSON.stringify(epub)} }))`;
  await session.evaluate(openExpr);

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
    if (probe?.imgW > 10 || (probe?.bodyText && probe.bodyText.length > 5)) break;
    if (probe?.home && !probe?.hasViewer) {
      await session.evaluate(openExpr);
    }
    await sleep(250);
  }
  const uiMs = Date.now() - openedAt;
  log('ui', { uiMs, probe, consoles: session.consoles.slice(-30) });

  session.ws.close();
  try {
    if (child.pid) process.kill(child.pid);
  } catch {
    /* ignore */
  }
  killApp();

  const painted = Boolean(probe?.imgW > 10 || (probe?.bodyText && probe.bodyText.length > 5));
  if (!painted) {
    throw new Error(`EPUB UI did not paint: ${JSON.stringify(probe)}`);
  }
  if (uiMs > 3000) {
    throw new Error(`EPUB UI paint too slow: ${uiMs}ms`);
  }
}

const mode = process.argv[2] || 'all';
if (mode === 'session' || mode === 'all') await verifySession();
if (mode === 'ui' || mode === 'all') await verifyUi();
console.log('OK');

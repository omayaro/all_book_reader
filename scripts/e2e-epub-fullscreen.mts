/**
 * EPUB open → fullscreen-sized viewport → PageDown / toolbar must change page.
 * Requires: electron with --remote-debugging-port=9223 and vite on :5173.
 */
import fs from 'node:fs';
import path from 'node:path';

const CDP_PORT = 9223;
const samplesDir = path.resolve('samples');
const epub =
  fs
    .readdirSync(samplesDir)
    .map((name) => path.join(samplesDir, name))
    .find((p) => p.toLowerCase().endsWith('.epub') && !p.toLowerCase().includes('frankenstein')) ??
  path.join(samplesDir, 'frankenstein.epub');

type CdpMessage = { id?: number; method?: string; result?: unknown; error?: unknown };

async function main(): Promise<void> {
  if (!fs.existsSync(epub)) {
    console.error('FAIL: missing epub', epub);
    process.exit(1);
  }

  const targets = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()) as Array<{
    type: string;
    webSocketDebuggerUrl: string;
  }>;
  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) {
    console.error('FAIL: no CDP page target');
    process.exit(1);
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')));
  });

  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data)) as CdpMessage;
    if (msg.id != null && pending.has(msg.id)) {
      const entry = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    }
  });

  function send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate<T>(expression: string): Promise<T> {
    const result = (await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result: { value?: T; description?: string; subtype?: string } };
    if (result.result.subtype === 'error') {
      throw new Error(result.result.description ?? 'evaluate error');
    }
    return result.result.value as T;
  }

  await send('Runtime.enable');
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 1500));

  for (let i = 0; i < 40; i++) {
    if (await evaluate<boolean>('Boolean(window.api)')) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  await evaluate(`window.api.saveSettings({ toolbarVisible: true })`);
  await evaluate(`window.api.openPath(${JSON.stringify(epub)})`);
  await evaluate('location.reload()');
  await new Promise((r) => setTimeout(r, 1500));
  for (let i = 0; i < 40; i++) {
    if (await evaluate<boolean>('Boolean(window.api)')) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await evaluate(`window.api.saveSettings({ toolbarVisible: true })`);

  const titleNeedle = JSON.stringify(path.basename(epub).normalize('NFC').slice(0, 10));
  const clicked = await evaluate<{ ok: boolean }>(`
    (() => {
      const rows = [...document.querySelectorAll('.book-row')];
      const match = rows.find((el) => (el.textContent || '').includes(${titleNeedle})) || rows[0];
      if (!match) return { ok: false };
      match.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { ok: true };
    })()
  `);
  if (!clicked.ok) {
    console.error('FAIL: could not open book from recent list');
    process.exit(2);
  }

  let ready: { page: string; total: string; hasIframe: boolean } | null = null;
  for (let i = 0; i < 60; i++) {
    ready = await evaluate(`
      (() => {
        const pageInput = document.querySelector('input.page-input');
        const total = document.querySelector('.page-total');
        return {
          page: pageInput ? pageInput.value : '',
          total: total ? total.textContent : '',
          hasIframe: Boolean(document.querySelector('.epub-viewer iframe')),
        };
      })()
    `);
    const totalNum = Number((ready?.total || '').replace(/\D/g, ''));
    if (ready?.hasIframe && totalNum > 1) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready?.hasIframe) {
    console.error('FAIL: epub iframe never appeared', ready);
    process.exit(3);
  }

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 1000));

  const pageBefore = await evaluate<string>(
    `document.querySelector('input.page-input')?.value || ''`,
  );

  await evaluate(`
    (() => {
      const iframe = document.querySelector('.epub-viewer iframe');
      const doc = iframe && iframe.contentDocument;
      if (doc) {
        doc.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'PageDown', code: 'PageDown', bubbles: true, cancelable: true,
        }));
        return 'iframe';
      }
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'PageDown', code: 'PageDown', bubbles: true, cancelable: true,
      }));
      return 'window';
    })()
  `);
  await new Promise((r) => setTimeout(r, 900));

  let pageAfter = await evaluate<string>(
    `document.querySelector('input.page-input')?.value || ''`,
  );

  if (pageAfter === pageBefore) {
    await evaluate(`
      [...document.querySelectorAll('button')]
        .find((b) => (b.title || '') === 'Page Down')
        ?.click()
    `);
    await new Promise((r) => setTimeout(r, 900));
    pageAfter = await evaluate<string>(
      `document.querySelector('input.page-input')?.value || ''`,
    );
  }

  console.log({ epub, pageBefore, pageAfter, total: ready.total });
  await send('Emulation.clearDeviceMetricsOverride');
  ws.close();

  if (!pageBefore || pageAfter === pageBefore) {
    console.error('FAIL: page did not advance after fullscreen-sized viewport');
    process.exit(5);
  }

  console.log('OK: EPUB page navigation works after fullscreen-sized resize');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

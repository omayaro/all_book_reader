import { protocol } from 'electron';
import {
  EPUB_REQUEST_SCHEME,
  isEpubFontPath,
  mimeForEpubEntry,
  normalizeEpubEntryPath,
} from '../src/shared/epubEntryPath';
import { readEpubEntry } from './epubSession';

/** Must run before `app.ready` so iframe img/css can use `abr-epub://`. */
export function registerEpubScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: EPUB_REQUEST_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Serve the open EPUB's zip entries to the renderer iframe.
 * Embedded fonts are skipped here so first paint is not blocked; the viewer injects them later.
 */
export function installEpubProtocolHandler(): void {
  protocol.handle(EPUB_REQUEST_SCHEME, async (request) => {
    const entryPath = normalizeEpubEntryPath(request.url);
    if (!entryPath || isEpubFontPath(entryPath)) {
      return new Response('', { status: 404 });
    }
    try {
      const data = await readEpubEntry(entryPath, 'high');
      return new Response(Buffer.from(data), {
        headers: {
          'content-type': mimeForEpubEntry(entryPath),
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        },
      });
    } catch {
      return new Response('', { status: 404 });
    }
  });
}

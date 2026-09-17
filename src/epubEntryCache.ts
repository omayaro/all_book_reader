import { getApi } from './api';
import { normalizeEpubEntryPath } from './shared/epubEntryPath';

const cache = new Map<string, ArrayBuffer>();
const inflight = new Map<string, Promise<ArrayBuffer>>();

export function clearEpubEntryCache(): void {
  cache.clear();
  inflight.clear();
}

export function getCachedEpubEntry(entryPath: string): ArrayBuffer | undefined {
  return cache.get(normalizeEpubEntryPath(entryPath));
}

/** Load (or reuse) one EPUB zip entry via IPC. */
export function readEpubEntryCached(entryPath: string): Promise<ArrayBuffer> {
  const key = normalizeEpubEntryPath(entryPath);
  if (!key) return Promise.reject(new Error('Missing EPUB entry path'));
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = getApi()
    .readEpubEntry(key)
    .then((buffer) => {
      cache.set(key, buffer);
      inflight.delete(key);
      return buffer;
    })
    .catch((error: unknown) => {
      inflight.delete(key);
      throw error;
    });
  inflight.set(key, request);
  return request;
}

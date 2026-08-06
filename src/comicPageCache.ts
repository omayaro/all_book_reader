import { getApi } from './api';

export interface ComicPageImage {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
}

const cache = new Map<string, ComicPageImage>();
const inflight = new Map<string, Promise<ComicPageImage>>();
/** Bumped on clear so in-flight decodes from a previous book are discarded. */
let cacheGeneration = 0;

function pageKey(bookId: string, pageNumber: number): string {
  return `${bookId}:${pageNumber}`;
}

async function decodePageImage(pageNumber: number): Promise<ComicPageImage> {
  const buffer = await getApi().readComicPage(pageNumber - 1);
  const blob = new Blob([new Uint8Array(buffer)]);
  const url = URL.createObjectURL(blob);
  try {
    const natural = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Failed to decode comic page'));
      img.src = url;
    });
    return { url, naturalWidth: natural.width, naturalHeight: natural.height };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** Load (or reuse) a decoded comic page. pageNumber is 1-based. */
export function getComicPageImage(bookId: string, pageNumber: number): Promise<ComicPageImage> {
  if (!bookId) return Promise.reject(new Error('Missing book id'));
  const key = pageKey(bookId, pageNumber);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  let pending = inflight.get(key);
  if (!pending) {
    const gen = cacheGeneration;
    pending = decodePageImage(pageNumber)
      .then((image) => {
        inflight.delete(key);
        if (gen !== cacheGeneration) {
          URL.revokeObjectURL(image.url);
          throw new Error('Stale comic page decode');
        }
        cache.set(key, image);
        return image;
      })
      .catch((error) => {
        inflight.delete(key);
        throw error;
      });
    inflight.set(key, pending);
  }
  return pending;
}

/** Drop cached pages for `bookId` that are not in `keep` (1-based). Also drops other books. */
export function retainComicPages(bookId: string, keep: number[]): void {
  const keepSet = new Set(keep.map((pageNumber) => pageKey(bookId, pageNumber)));
  for (const [key, image] of cache) {
    if (keepSet.has(key)) continue;
    URL.revokeObjectURL(image.url);
    cache.delete(key);
  }
}

export function clearComicPageCache(): void {
  cacheGeneration += 1;
  for (const image of cache.values()) {
    URL.revokeObjectURL(image.url);
  }
  cache.clear();
  inflight.clear();
}

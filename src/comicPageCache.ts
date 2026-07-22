import { getApi } from './api';

export interface ComicPageImage {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
}

const cache = new Map<number, ComicPageImage>();
const inflight = new Map<number, Promise<ComicPageImage>>();

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
export function getComicPageImage(pageNumber: number): Promise<ComicPageImage> {
  const hit = cache.get(pageNumber);
  if (hit) return Promise.resolve(hit);

  let pending = inflight.get(pageNumber);
  if (!pending) {
    pending = decodePageImage(pageNumber)
      .then((image) => {
        cache.set(pageNumber, image);
        inflight.delete(pageNumber);
        return image;
      })
      .catch((error) => {
        inflight.delete(pageNumber);
        throw error;
      });
    inflight.set(pageNumber, pending);
  }
  return pending;
}

/** Drop cached pages that are not in `keep` (1-based). */
export function retainComicPages(keep: number[]): void {
  const keepSet = new Set(keep);
  for (const [pageNumber, image] of cache) {
    if (keepSet.has(pageNumber)) continue;
    URL.revokeObjectURL(image.url);
    cache.delete(pageNumber);
  }
}

export function clearComicPageCache(): void {
  for (const image of cache.values()) {
    URL.revokeObjectURL(image.url);
  }
  cache.clear();
  inflight.clear();
}

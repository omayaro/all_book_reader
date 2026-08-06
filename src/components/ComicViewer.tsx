import { useEffect, useRef, useState } from 'react';
import {
  clearComicPageCache,
  getComicPageImage,
  retainComicPages,
  type ComicPageImage,
} from '../comicPageCache';
import { comicImageDisplaySize, comicSpreadPages, type ReadingDirection } from '../shared/comic';
import { comicInitialWarmPages, comicPrefetchPages } from '../shared/comicPrefetch';
import { measureReaderStage, stabilizeViewportSize } from '../readerViewport';
import { useReaderDragPan } from '../useReaderDragPan';
import type { FitMode, PageMode } from '../types';

interface ComicViewerProps {
  page: number;
  totalPages: number;
  pageMode: PageMode;
  fitMode: FitMode;
  zoom: number;
  readingDirection: ReadingDirection;
  onPageMeta: (totalPages: number) => void;
}

export function ComicViewer({
  page,
  totalPages,
  pageMode,
  fitMode,
  zoom,
  readingDirection,
  onPageMeta,
}: ComicViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [leftPage, setLeftPage] = useState<ComicPageImage | null>(null);
  const [rightPage, setRightPage] = useState<ComicPageImage | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  useReaderDragPan(hostRef);

  useEffect(() => {
    onPageMeta(totalPages);
  }, [totalPages, onPageMeta]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const stage = el.closest('.reader-stage');
    if (!(stage instanceof HTMLElement)) return;

    const update = () => {
      const measured = measureReaderStage(el);
      const borderX = pageMode === 'two' ? 24 : 12;
      const borderY = 12;
      const next = {
        width: Math.max(40, measured.width - borderX),
        height: Math.max(40, measured.height - borderY),
      };
      setViewport((prev) => stabilizeViewportSize(prev, next));
    };
    update();
    // border-box: ignore content-box shrink when overflow scrollbars appear.
    const ro = new ResizeObserver(update);
    ro.observe(stage, { box: 'border-box' });
    return () => ro.disconnect();
  }, [pageMode]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const pair =
        pageMode === 'two'
          ? comicSpreadPages(page, totalPages, readingDirection)
          : { left: page, right: null as number | null };

      try {
        const [nextLeft, nextRight] = await Promise.all([
          pair.left != null ? getComicPageImage(pair.left) : Promise.resolve(null),
          pair.right != null ? getComicPageImage(pair.right) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setLeftPage(nextLeft);
        setRightPage(nextRight);
      } catch {
        if (!cancelled) {
          setLeftPage(null);
          setRightPage(null);
        }
        return;
      }

      // Near pages for flipping + ~10-page warm window so a large ZIP feels ready sooner.
      const keep = [
        ...new Set([
          ...comicPrefetchPages(page, totalPages, pageMode),
          ...comicInitialWarmPages(page, totalPages, pageMode),
        ]),
      ].sort((a, b) => a - b);
      void Promise.all(keep.map((p) => getComicPageImage(p).catch(() => null))).then(() => {
        if (!cancelled) retainComicPages(keep);
      });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [page, pageMode, totalPages, readingDirection]);

  useEffect(() => {
    return () => clearComicPageCache();
  }, []);

  useEffect(() => {
    document.querySelector('.reader-stage')?.scrollTo({ top: 0, left: 0 });
  }, [zoom, page, pageMode]);

  const leftSize =
    leftPage &&
    comicImageDisplaySize(
      leftPage.naturalWidth,
      leftPage.naturalHeight,
      viewport.width,
      viewport.height,
      pageMode,
      fitMode,
      zoom,
    );
  const rightSize =
    rightPage &&
    comicImageDisplaySize(
      rightPage.naturalWidth,
      rightPage.naturalHeight,
      viewport.width,
      viewport.height,
      pageMode,
      fitMode,
      zoom,
    );

  return (
    <div ref={hostRef} className="comic-viewer-host">
      <div className={`comic-viewer${pageMode === 'two' ? ' two' : ''}`}>
        {leftPage && leftSize ? (
          <img
            src={leftPage.url}
            alt={`Page ${page}`}
            width={leftSize.width}
            height={leftSize.height}
            style={{ width: leftSize.width, height: leftSize.height }}
            draggable={false}
          />
        ) : (
          <div className="comic-placeholder" />
        )}
        {pageMode === 'two' &&
          (rightPage && rightSize ? (
            <img
              src={rightPage.url}
              alt="Page spread"
              width={rightSize.width}
              height={rightSize.height}
              style={{ width: rightSize.width, height: rightSize.height }}
              draggable={false}
            />
          ) : (
            <div className="comic-placeholder" />
          ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getApi } from '../api';
import { comicSpreadPages, type ReadingDirection } from '../shared/comic';
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
  const [leftUrl, setLeftUrl] = useState<string | null>(null);
  const [rightUrl, setRightUrl] = useState<string | null>(null);

  useEffect(() => {
    onPageMeta(totalPages);
  }, [totalPages, onPageMeta]);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    const load = async () => {
      const pair =
        pageMode === 'two'
          ? comicSpreadPages(page, totalPages, readingDirection)
          : { left: page, right: null as number | null };

      const loadOne = async (pageNumber: number | null): Promise<string | null> => {
        if (pageNumber == null) return null;
        const buffer = await getApi().readComicPage(pageNumber - 1);
        const blob = new Blob([new Uint8Array(buffer)]);
        const url = URL.createObjectURL(blob);
        urls.push(url);
        return url;
      };

      const nextLeft = await loadOne(pair.left);
      const nextRight = await loadOne(pair.right);
      if (cancelled) {
        for (const url of urls) URL.revokeObjectURL(url);
        return;
      }
      setLeftUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextLeft;
      });
      setRightUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextRight;
      });
    };

    void load().catch(() => {
      if (!cancelled) {
        setLeftUrl(null);
        setRightUrl(null);
      }
    });

    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [page, pageMode, totalPages, readingDirection]);

  useEffect(() => {
    document.querySelector('.reader-stage')?.scrollTo({ top: 0, left: 0 });
  }, [zoom, page, pageMode]);

  const objectFit = fitMode === 'fit-page' ? 'contain' : 'contain';
  const widthStyle =
    pageMode === 'two'
      ? `min(48%, ${Math.round(46 * zoom)}vw)`
      : `min(100%, ${Math.round(90 * zoom)}vw)`;

  return (
    <div className={`comic-viewer${pageMode === 'two' ? ' two' : ''}`}>
      {leftUrl ? (
        <img src={leftUrl} alt={`Page ${page}`} style={{ width: widthStyle, objectFit }} />
      ) : (
        <div className="comic-placeholder" />
      )}
      {pageMode === 'two' &&
        (rightUrl ? (
          <img src={rightUrl} alt="Page spread" style={{ width: widthStyle, objectFit }} />
        ) : (
          <div className="comic-placeholder" />
        ))}
    </div>
  );
}

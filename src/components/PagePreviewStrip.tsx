import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  clearThumbCache,
  getComicThumbUrl,
  getPdfThumbUrl,
  getTxtThumbUrl,
  loadPdfDocument,
} from '../thumbCache';
import { comicSpreadPages, type ReadingDirection } from '../shared/comic';
import { spreadPages } from '../shared/pageMode';
import {
  PAGE_STRIP_ITEM_HEIGHT,
  pageFromStripOffset,
  visibleStripPages,
} from '../shared/pageStrip';
import type { PageMode } from '../types';

interface PagePreviewStripProps {
  format: 'pdf' | 'comic' | 'txt';
  bookId: string;
  totalPages: number;
  page: number;
  pageMode: PageMode;
  readingDirection: ReadingDirection;
  pdfData?: ArrayBuffer;
  onSelectPage: (page: number) => void;
}

export function PagePreviewStrip({
  format,
  bookId,
  totalPages,
  page,
  pageMode,
  readingDirection,
  pdfData,
  onSelectPage,
}: PagePreviewStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const dragRef = useRef(false);

  const activePages = useMemo(() => {
    const set = new Set<number>();
    // TXT two-column is layout-only (not a page spread).
    if (pageMode === 'two' && format !== 'txt') {
      if (format === 'comic') {
        const pair = comicSpreadPages(page, totalPages, readingDirection);
        if (pair.left != null) set.add(pair.left);
        if (pair.right != null) set.add(pair.right);
      } else {
        const pair = spreadPages(page, totalPages);
        set.add(pair.left);
        if (pair.right != null) set.add(pair.right);
      }
    } else {
      set.add(page);
    }
    return set;
  }, [format, page, pageMode, readingDirection, totalPages]);

  const range = visibleStripPages(scrollTop, viewportHeight, totalPages);

  useEffect(() => {
    clearThumbCache();
    setThumbs({});
    setPdfDoc(null);
    return () => clearThumbCache();
  }, [bookId, format]);

  useEffect(() => {
    if (format !== 'pdf' || !pdfData) {
      setPdfDoc(null);
      return;
    }
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    void loadPdfDocument(pdfData).then((loaded) => {
      if (cancelled) {
        void loaded.destroy();
        return;
      }
      doc = loaded;
      setPdfDoc(loaded);
    });
    return () => {
      cancelled = true;
      if (doc) void doc.destroy();
      setPdfDoc(null);
    };
  }, [format, pdfData]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const top = (page - 1) * PAGE_STRIP_ITEM_HEIGHT;
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;
    if (top < viewTop || top + PAGE_STRIP_ITEM_HEIGHT > viewBottom) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + PAGE_STRIP_ITEM_HEIGHT / 2);
    }
  }, [page]);

  useEffect(() => {
    if (range.end < range.start) return;
    let cancelled = false;
    const pages: number[] = [];
    for (let p = range.start; p <= range.end; p += 1) pages.push(p);

    const load = async () => {
      // Prefer the current page(s) so the strip isn't blank while neighbors load.
      const ordered = [
        ...[...activePages].filter((p) => p >= range.start && p <= range.end),
        ...pages.filter((p) => !activePages.has(p)),
      ];
      for (const p of ordered) {
        if (cancelled) return;
        if (thumbs[p]) continue;
        try {
          const url =
            format === 'comic'
              ? await getComicThumbUrl(p, bookId)
              : format === 'txt'
                ? await getTxtThumbUrl(p, bookId)
                : pdfDoc
                  ? await getPdfThumbUrl(pdfDoc, p, bookId)
                  : null;
          if (!url || cancelled) continue;
          setThumbs((prev) => (prev[p] ? prev : { ...prev, [p]: url }));
        } catch {
          // Ignore individual thumb failures.
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // thumbs intentionally omitted to avoid reload loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, format, bookId, pdfDoc, activePages]);

  const selectFromClientY = (clientY: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetY = el.scrollTop + (clientY - rect.top);
    onSelectPage(pageFromStripOffset(offsetY, totalPages));
  };

  return (
    <aside className="page-preview-strip" aria-label="Page previews">
      <div
        ref={scrollerRef}
        className="page-preview-scroller"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          dragRef.current = true;
          selectFromClientY(e.clientY);
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          selectFromClientY(e.clientY);
        }}
        onMouseUp={() => {
          dragRef.current = false;
        }}
        onMouseLeave={() => {
          dragRef.current = false;
        }}
      >
        <div
          className="page-preview-spacer"
          style={{ height: totalPages * PAGE_STRIP_ITEM_HEIGHT }}
        >
          {Array.from({ length: Math.max(0, range.end - range.start + 1) }, (_, i) => {
            const pageNumber = range.start + i;
            const active = activePages.has(pageNumber);
            return (
              <button
                key={pageNumber}
                type="button"
                className={`page-preview-item${active ? ' active' : ''}`}
                style={{ top: (pageNumber - 1) * PAGE_STRIP_ITEM_HEIGHT }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPage(pageNumber);
                }}
                title={`Page ${pageNumber}`}
              >
                {thumbs[pageNumber] ? (
                  <img src={thumbs[pageNumber]} alt="" draggable={false} />
                ) : (
                  <div className="page-preview-placeholder" />
                )}
                <span>{pageNumber}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

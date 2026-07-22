import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { FitMode, PageMode } from '../types';
import { clampPage, spreadPages } from '../shared/pageMode';
import { findNextPageMatch, findPrevPageMatch } from '../shared/search';
import { measureReaderStage, stabilizeViewportSize } from '../readerViewport';
import { useReaderDragPan } from '../useReaderDragPan';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  data: ArrayBuffer;
  page: number;
  pageMode: PageMode;
  fitMode: FitMode;
  zoom: number;
  searchQuery: string;
  searchDirection: 'next' | 'prev' | null;
  searchNonce: number;
  onPageChange: (page: number, totalPages: number) => void;
  onSearchDone: (message: string) => void;
}

export function PdfViewer({
  data,
  page,
  pageMode,
  fitMode,
  zoom,
  searchQuery,
  searchDirection,
  searchNonce,
  onPageChange,
  onSearchDone,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const pageTextsRef = useRef<string[]>([]);
  useReaderDragPan(containerRef);

  useEffect(() => {
    let cancelled = false;
    const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
    void loadingTask.promise.then(async (pdf) => {
      if (cancelled) return;
      setDoc(pdf);
      setTotalPages(pdf.numPages);
      const texts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i += 1) {
        const pdfPage = await pdf.getPage(i);
        const content = await pdfPage.getTextContent();
        texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      }
      pageTextsRef.current = texts;
      onPageChange(clampPage(page, pdf.numPages), pdf.numPages);
    });
    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when binary changes
  }, [data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stage = el.closest('.reader-stage');
    if (!(stage instanceof HTMLElement)) return;
    const update = () => {
      const measured = measureReaderStage(el);
      setStageSize((prev) => stabilizeViewportSize(prev, measured));
    };
    update();
    // border-box: ignore content-box shrink when overflow scrollbars appear.
    const ro = new ResizeObserver(update);
    ro.observe(stage, { box: 'border-box' });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || !leftCanvasRef.current) return;
    let cancelled = false;

    const render = async () => {
      const current = clampPage(page, totalPages);
      const pair =
        pageMode === 'two'
          ? spreadPages(current, totalPages)
          : { left: current, right: null as number | null };

      const borderX = pageMode === 'two' ? 24 : 12;
      const borderY = 12;
      const area = {
        width: Math.max(40, stageSize.width - borderX),
        height: Math.max(40, stageSize.height - borderY),
      };

      await drawPage(doc, pair.left, leftCanvasRef.current!, area, fitMode, zoom, pageMode === 'two');
      if (cancelled) return;
      if (pageMode === 'two' && pair.right && rightCanvasRef.current) {
        rightCanvasRef.current.style.display = 'block';
        await drawPage(doc, pair.right, rightCanvasRef.current, area, fitMode, zoom, true);
      } else if (rightCanvasRef.current) {
        rightCanvasRef.current.style.display = 'none';
        rightCanvasRef.current.width = 0;
        rightCanvasRef.current.height = 0;
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [doc, page, pageMode, fitMode, zoom, totalPages, stageSize]);

  useEffect(() => {
    containerRef.current
      ?.closest('.reader-stage')
      ?.scrollTo({ top: 0, left: 0 });
  }, [zoom, page, pageMode]);

  useEffect(() => {
    if (!searchDirection || !searchQuery.trim()) return;
    const result =
      searchDirection === 'next'
        ? findNextPageMatch(pageTextsRef.current, searchQuery, page)
        : findPrevPageMatch(pageTextsRef.current, searchQuery, page);
    if (!result) {
      onSearchDone('No matches found.');
      return;
    }
    onPageChange(result.page, totalPages);
    onSearchDone(`Found on page ${result.page}`);
  }, [searchNonce, searchDirection, searchQuery, page, totalPages, onPageChange, onSearchDone]);

  return (
    <div className="pdf-viewer" ref={containerRef}>
      <canvas ref={leftCanvasRef} />
      {pageMode === 'two' ? <canvas ref={rightCanvasRef} /> : null}
    </div>
  );
}

async function drawPage(
  doc: pdfjs.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  area: { width: number; height: number },
  fitMode: FitMode,
  zoom: number,
  split: boolean,
): Promise<void> {
  const pdfPage = await doc.getPage(pageNumber);
  const base = pdfPage.getViewport({ scale: 1 });
  const gap = split ? 12 : 0;
  const availableWidth = Math.max(40, (area.width - gap) / (split ? 2 : 1));
  const availableHeight = Math.max(40, area.height);
  const widthScale = availableWidth / base.width;
  const heightScale = availableHeight / base.height;
  const fitScale = fitMode === 'fit-page' ? Math.min(widthScale, heightScale) : widthScale;
  // Floor scale slightly so canvas pixels don't toggle scrollbar at the fit edge.
  const viewport = pdfPage.getViewport({ scale: Math.max(0.01, fitScale * zoom * 0.999) });
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pdfPage.render({ canvasContext: context, viewport }).promise;
}

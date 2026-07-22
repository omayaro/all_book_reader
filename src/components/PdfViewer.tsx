import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { FitMode, PageMode } from '../types';
import { clampPage, spreadPages } from '../shared/pageMode';
import { findNextPageMatch, findPrevPageMatch } from '../shared/search';

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
  const pageTextsRef = useRef<string[]>([]);

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
    if (!doc || !leftCanvasRef.current) return;
    let cancelled = false;

    const render = async () => {
      const current = clampPage(page, totalPages);
      const pair =
        pageMode === 'two'
          ? spreadPages(current, totalPages)
          : { left: current, right: null as number | null };

      await drawPage(doc, pair.left, leftCanvasRef.current!, containerRef.current, fitMode, zoom, pageMode === 'two');
      if (cancelled) return;
      if (pair.right && rightCanvasRef.current) {
        rightCanvasRef.current.style.display = 'block';
        await drawPage(
          doc,
          pair.right,
          rightCanvasRef.current,
          containerRef.current,
          fitMode,
          zoom,
          true,
        );
      } else if (rightCanvasRef.current) {
        rightCanvasRef.current.style.display = 'none';
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [doc, page, pageMode, fitMode, zoom, totalPages]);

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
      <canvas ref={rightCanvasRef} />
    </div>
  );
}

async function drawPage(
  doc: pdfjs.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  container: HTMLDivElement | null,
  fitMode: FitMode,
  zoom: number,
  split: boolean,
): Promise<void> {
  const pdfPage = await doc.getPage(pageNumber);
  const base = pdfPage.getViewport({ scale: 1 });
  const availableWidth = Math.max(320, (container?.clientWidth ?? 800) / (split ? 2.1 : 1.05));
  const availableHeight = Math.max(320, (container?.clientHeight ?? 600) - 24);
  const widthScale = availableWidth / base.width;
  const heightScale = availableHeight / base.height;
  const fitScale = fitMode === 'fit-page' ? Math.min(widthScale, heightScale) : widthScale;
  const viewport = pdfPage.getViewport({ scale: fitScale * zoom });
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pdfPage.render({ canvasContext: context, viewport }).promise;
}

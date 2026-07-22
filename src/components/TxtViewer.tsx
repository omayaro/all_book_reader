import { useEffect, useRef } from 'react';
import { getApi } from '../api';
import type { PageMode } from '../types';
import { findNextMatch, findPrevMatch } from '../shared/search';

interface TxtViewerProps {
  bookId: string;
  text: string;
  page: number;
  totalPages: number;
  fontSize: number;
  pageMode: PageMode;
  searchQuery: string;
  searchDirection: 'next' | 'prev' | null;
  searchNonce: number;
  onSearchDone: (message: string) => void;
  onPageChange: (
    page: number,
    totalPages: number,
    startByte: number,
    text: string,
    byteLength: number,
  ) => void;
}

export function TxtViewer({
  bookId,
  text,
  page,
  totalPages,
  fontSize,
  pageMode,
  searchQuery,
  searchDirection,
  searchNonce,
  onSearchDone,
  onPageChange,
}: TxtViewerProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const cursorRef = useRef(0);
  const textRef = useRef(text);
  const pageRef = useRef(page);

  useEffect(() => {
    textRef.current = text;
    pageRef.current = page;
    cursorRef.current = 0;
    const stage = preRef.current?.closest('.reader-stage');
    if (stage instanceof HTMLElement) stage.scrollTop = 0;
  }, [bookId, text, page]);

  useEffect(() => {
    if (!preRef.current || searchDirection) return;
    preRef.current.innerHTML = escapeHtml(text);
  }, [text, searchDirection, page]);

  useEffect(() => {
    if (!searchDirection || !searchQuery.trim() || !preRef.current) return;
    let cancelled = false;

    const run = async () => {
      onSearchDone('Searching…');
      let currentPage = pageRef.current;
      let haystack = textRef.current;
      let match =
        searchDirection === 'next'
          ? findNextMatch(haystack, searchQuery, cursorRef.current)
          : findPrevMatch(haystack, searchQuery, cursorRef.current);

      // Walk pages until a match is found (Option B: fixed pages).
      while (!match && !cancelled) {
        const nextPage =
          searchDirection === 'next' ? currentPage + 1 : currentPage - 1;
        if (nextPage < 1 || nextPage > totalPages) break;
        const loaded = await getApi().readTxtPage(nextPage);
        if (cancelled) return;
        currentPage = loaded.page;
        haystack = loaded.text;
        textRef.current = loaded.text;
        pageRef.current = loaded.page;
        onPageChange(loaded.page, loaded.totalPages, loaded.startByte, loaded.text, loaded.byteLength);
        cursorRef.current = searchDirection === 'next' ? 0 : haystack.length;
        match =
          searchDirection === 'next'
            ? findNextMatch(haystack, searchQuery, 0)
            : findPrevMatch(haystack, searchQuery, haystack.length);
      }

      if (cancelled) return;
      if (!match) {
        onSearchDone('No matches found.');
        return;
      }

      cursorRef.current =
        searchDirection === 'next' ? match.index + match.length : match.index;
      const before = escapeHtml(haystack.slice(0, match.index));
      const hit = escapeHtml(haystack.slice(match.index, match.index + match.length));
      const after = escapeHtml(haystack.slice(match.index + match.length));
      if (preRef.current) {
        preRef.current.innerHTML = `${before}<mark class="search-hit">${hit}</mark>${after}`;
        preRef.current.querySelector('mark')?.scrollIntoView({ block: 'center' });
      }
      onSearchDone(`Found on page ${currentPage}`);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    searchNonce,
    searchDirection,
    searchQuery,
    onSearchDone,
    onPageChange,
    totalPages,
  ]);

  return (
    <pre
      ref={preRef}
      className={`txt-viewer${pageMode === 'two' ? ' two-column' : ''}`}
      style={{ fontSize }}
    />
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

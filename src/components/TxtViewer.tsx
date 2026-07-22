import { useEffect, useMemo, useRef } from 'react';
import type { PageMode } from '../types';
import { findNextMatch, findPrevMatch } from '../shared/search';

interface TxtViewerProps {
  text: string;
  fontSize: number;
  pageMode: PageMode;
  searchQuery: string;
  searchDirection: 'next' | 'prev' | null;
  searchNonce: number;
  onSearchDone: (message: string) => void;
}

export function TxtViewer({
  text,
  fontSize,
  pageMode,
  searchQuery,
  searchDirection,
  searchNonce,
  onSearchDone,
}: TxtViewerProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const cursorRef = useRef(0);

  const html = useMemo(() => escapeHtml(text), [text]);

  useEffect(() => {
    if (!searchDirection || !searchQuery.trim() || !preRef.current) return;
    const match =
      searchDirection === 'next'
        ? findNextMatch(text, searchQuery, cursorRef.current)
        : findPrevMatch(text, searchQuery, cursorRef.current);
    if (!match) {
      onSearchDone('No matches found.');
      return;
    }
    cursorRef.current =
      searchDirection === 'next' ? match.index + match.length : match.index;
    const before = escapeHtml(text.slice(0, match.index));
    const hit = escapeHtml(text.slice(match.index, match.index + match.length));
    const after = escapeHtml(text.slice(match.index + match.length));
    preRef.current.innerHTML = `${before}<mark class="search-hit">${hit}</mark>${after}`;
    const mark = preRef.current.querySelector('mark');
    mark?.scrollIntoView({ block: 'center' });
    onSearchDone(`Found at character ${match.index + 1}`);
  }, [searchNonce, searchDirection, searchQuery, text, onSearchDone]);

  useEffect(() => {
    if (preRef.current) preRef.current.innerHTML = html;
  }, [html]);

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

export interface SearchMatch {
  index: number;
  length: number;
}

export function findAllMatches(haystack: string, query: string): SearchMatch[] {
  const q = query.trim();
  if (!q || !haystack) return [];
  const source = haystack.toLowerCase();
  const needle = q.toLowerCase();
  const matches: SearchMatch[] = [];
  let from = 0;
  while (from <= source.length) {
    const index = source.indexOf(needle, from);
    if (index === -1) break;
    matches.push({ index, length: needle.length });
    from = index + Math.max(1, needle.length);
  }
  return matches;
}

export function findNextMatch(
  haystack: string,
  query: string,
  fromIndex: number,
): SearchMatch | null {
  const matches = findAllMatches(haystack, query);
  if (matches.length === 0) return null;
  return matches.find((m) => m.index >= fromIndex) ?? matches[0] ?? null;
}

export function findPrevMatch(
  haystack: string,
  query: string,
  fromIndex: number,
): SearchMatch | null {
  const matches = findAllMatches(haystack, query);
  if (matches.length === 0) return null;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i];
    if (match && match.index < fromIndex) return match;
  }
  return matches[matches.length - 1] ?? null;
}

/** Find page (1-based) containing a text match, scanning forward from fromPage. */
export function findNextPageMatch(
  pages: string[],
  query: string,
  fromPage: number,
): { page: number; match: SearchMatch } | null {
  if (pages.length === 0 || !query.trim()) return null;
  const start = Math.max(0, Math.min(pages.length - 1, Math.floor(fromPage) - 1));
  for (let offset = 0; offset < pages.length; offset += 1) {
    const pageIndex = (start + offset) % pages.length;
    const match = findNextMatch(pages[pageIndex] ?? '', query, 0);
    if (match) return { page: pageIndex + 1, match };
  }
  return null;
}

export function findPrevPageMatch(
  pages: string[],
  query: string,
  fromPage: number,
): { page: number; match: SearchMatch } | null {
  if (pages.length === 0 || !query.trim()) return null;
  const start = Math.max(0, Math.min(pages.length - 1, Math.floor(fromPage) - 1));
  for (let offset = 0; offset < pages.length; offset += 1) {
    const pageIndex = (start - offset + pages.length) % pages.length;
    const matches = findAllMatches(pages[pageIndex] ?? '', query);
    const match = matches[matches.length - 1];
    if (match) return { page: pageIndex + 1, match };
  }
  return null;
}

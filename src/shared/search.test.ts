import { describe, expect, it } from 'vitest';
import {
  findAllMatches,
  findNextMatch,
  findNextPageMatch,
  findPrevMatch,
  findPrevPageMatch,
} from './search';

describe('search', () => {
  it('finds case-insensitive matches', () => {
    expect(findAllMatches('Hello hello HELLO', 'hello')).toHaveLength(3);
  });

  it('finds next and previous matches', () => {
    const text = 'one two one';
    expect(findNextMatch(text, 'one', 0)?.index).toBe(0);
    expect(findNextMatch(text, 'one', 1)?.index).toBe(8);
    expect(findPrevMatch(text, 'one', 8)?.index).toBe(0);
  });

  it('finds matches across pages', () => {
    const pages = ['alpha', 'bravo cat', 'delta'];
    expect(findNextPageMatch(pages, 'cat', 1)?.page).toBe(2);
    expect(findPrevPageMatch(pages, 'alpha', 3)?.page).toBe(1);
    expect(findNextPageMatch(pages, 'missing', 1)).toBeNull();
  });
});

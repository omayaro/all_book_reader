import { describe, expect, it } from 'vitest';
import { buildBookId } from './bookId';

describe('bookId', () => {
  it('builds id from path size and mtime', () => {
    expect(
      buildBookId({ path: 'C:\\Books\\A.pdf', size: 10, mtimeMs: 100 }),
    ).toBe('c:/books/a.pdf|10|100');
  });

  it('defaults missing size/mtime to 0', () => {
    expect(buildBookId({ path: '/tmp/b.txt' })).toBe('/tmp/b.txt|0|0');
  });
});

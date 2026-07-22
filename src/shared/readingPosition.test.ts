import { describe, expect, it } from 'vitest';
import {
  createReadingPosition,
  deserializeReadingPosition,
  serializeReadingPosition,
} from './readingPosition';

describe('readingPosition', () => {
  it('creates clamped positions', () => {
    expect(createReadingPosition('id', 50, 10)).toEqual({
      bookId: 'id',
      page: 10,
      totalPages: 10,
    });
  });

  it('round-trips serialization', () => {
    const pos = createReadingPosition('a', 3, 9);
    const raw = serializeReadingPosition(pos);
    expect(deserializeReadingPosition(raw)).toEqual(pos);
  });

  it('returns null for invalid json', () => {
    expect(deserializeReadingPosition('not-json')).toBeNull();
    expect(deserializeReadingPosition('{}')).toBeNull();
  });
});

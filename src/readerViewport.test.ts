import { describe, expect, it } from 'vitest';
import { stabilizeViewportSize } from './readerViewport';

describe('stabilizeViewportSize', () => {
  it('keeps previous size for tiny changes', () => {
    const prev = { width: 800, height: 600 };
    expect(stabilizeViewportSize(prev, { width: 801, height: 600 })).toBe(prev);
    expect(stabilizeViewportSize(prev, { width: 800, height: 603 })).toBe(prev);
  });

  it('accepts real viewport changes', () => {
    const prev = { width: 800, height: 600 };
    const next = { width: 820, height: 600 };
    expect(stabilizeViewportSize(prev, next)).toEqual(next);
  });
});

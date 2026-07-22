import { describe, expect, it } from 'vitest';
import { dragPanScroll, stageCanPan } from './dragPan';

describe('dragPan', () => {
  it('moves scroll opposite to pointer delta', () => {
    expect(dragPanScroll(100, 50, 200, 100, 220, 80)).toEqual({
      left: 80,
      top: 70,
    });
  });

  it('detects when a stage can pan', () => {
    const stage = {
      scrollWidth: 1200,
      clientWidth: 800,
      scrollHeight: 600,
      clientHeight: 600,
    } as HTMLElement;
    expect(stageCanPan(stage)).toBe(true);

    const fitted = {
      scrollWidth: 800,
      clientWidth: 800,
      scrollHeight: 600,
      clientHeight: 600,
    } as HTMLElement;
    expect(stageCanPan(fitted)).toBe(false);
  });
});

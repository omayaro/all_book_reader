import { describe, expect, it } from 'vitest';
import { clampFontSize, clampZoom, mergeSettings } from './settings';

describe('settings', () => {
  it('clamps zoom and font size', () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(9)).toBe(3);
    expect(clampFontSize(5)).toBe(12);
    expect(clampFontSize(99)).toBe(40);
  });

  it('merges partial settings with defaults', () => {
    const merged = mergeSettings({ theme: 'dark', zoom: 1.5, pageMode: 'two' });
    expect(merged.theme).toBe('dark');
    expect(merged.zoom).toBe(1.5);
    expect(merged.pageMode).toBe('two');
    expect(merged.fitMode).toBe('fit-width');
    expect(merged.maxRecent).toBe(20);
    expect(merged.readingDirection).toBe('ltr');
    expect(merged.toolbarVisible).toBe(true);
  });

  it('merges toolbar visibility', () => {
    expect(mergeSettings({ toolbarVisible: false }).toolbarVisible).toBe(false);
    expect(mergeSettings({ toolbarVisible: true }).toolbarVisible).toBe(true);
  });

  it('ignores invalid values', () => {
    const merged = mergeSettings({
      theme: 'neon' as never,
      pageMode: 'triple' as never,
    });
    expect(merged.theme).toBe('light');
    expect(merged.pageMode).toBe('single');
    expect(merged.readingDirection).toBe('ltr');
    expect(merged.toolbarVisible).toBe(true);
  });

  it('maps legacy system theme to light', () => {
    expect(mergeSettings({ theme: 'system' as never }).theme).toBe('light');
  });
});

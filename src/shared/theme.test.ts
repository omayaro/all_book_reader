import { describe, expect, it } from 'vitest';
import { nextTheme, resolveTheme } from './theme';

describe('theme', () => {
  it('resolves light and dark themes', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('toggles between light and dark', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});

import type { ThemeSetting } from '../types';

export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(theme: ThemeSetting): ResolvedTheme {
  return theme;
}

export function nextTheme(theme: ThemeSetting): ThemeSetting {
  return theme === 'light' ? 'dark' : 'light';
}

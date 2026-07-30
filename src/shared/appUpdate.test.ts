import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  isNewerVersion,
  normalizeVersion,
  shouldShowUpdateBanner,
} from './appUpdate';

describe('appUpdate', () => {
  it('normalizes leading v', () => {
    expect(normalizeVersion('v1.0.3')).toBe('1.0.3');
    expect(normalizeVersion('1.0.3')).toBe('1.0.3');
  });

  it('compares semver parts', () => {
    expect(compareSemver('1.0.2', '1.0.3')).toBeLessThan(0);
    expect(compareSemver('1.1.0', '1.0.9')).toBeGreaterThan(0);
    expect(compareSemver('v1.0.3', '1.0.3')).toBe(0);
  });

  it('detects newer releases', () => {
    expect(isNewerVersion('1.0.4', '1.0.3')).toBe(true);
    expect(isNewerVersion('1.0.3', '1.0.3')).toBe(false);
    expect(isNewerVersion('1.0.2', '1.0.3')).toBe(false);
  });

  it('hides banner when dismissed for that version', () => {
    expect(shouldShowUpdateBanner('1.0.4', '1.0.3', null)).toBe(true);
    expect(shouldShowUpdateBanner('1.0.4', '1.0.3', 'v1.0.4')).toBe(false);
    expect(shouldShowUpdateBanner('1.0.5', '1.0.3', '1.0.4')).toBe(true);
    expect(shouldShowUpdateBanner(null, '1.0.3', null)).toBe(false);
  });
});

/** Strip optional leading `v` from GitHub tags / version strings. */
export function normalizeVersion(tagOrVersion: string): string {
  return tagOrVersion.trim().replace(/^v/i, '');
}

function parseSemverParts(version: string): number[] {
  const core = normalizeVersion(version).split('-')[0] ?? '';
  const parts = core.split('.').map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

/** Compare semver-like strings. Returns negative if a < b, 0 if equal, positive if a > b. */
export function compareSemver(a: string, b: string): number {
  const left = parseSemverParts(a);
  const right = parseSemverParts(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareSemver(latest, current) > 0;
}

export function shouldShowUpdateBanner(
  latestVersion: string | null | undefined,
  currentVersion: string,
  dismissedUpdateVersion: string | null | undefined,
): boolean {
  if (!latestVersion || !isNewerVersion(latestVersion, currentVersion)) return false;
  if (
    dismissedUpdateVersion &&
    normalizeVersion(dismissedUpdateVersion) === normalizeVersion(latestVersion)
  ) {
    return false;
  }
  return true;
}

export const GITHUB_RELEASES_URL =
  'https://github.com/omayaro/all_book_reader/releases';

export const GITHUB_LATEST_RELEASE_API =
  'https://api.github.com/repos/omayaro/all_book_reader/releases/latest';

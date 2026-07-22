export interface FileIdentityInput {
  path: string;
  size?: number;
  mtimeMs?: number;
}

/** Stable id from absolute path plus optional size/mtime. */
export function buildBookId(input: FileIdentityInput): string {
  const pathKey = input.path.replace(/\\/g, '/').toLowerCase();
  const size = input.size ?? 0;
  const mtime = input.mtimeMs ?? 0;
  return `${pathKey}|${size}|${mtime}`;
}

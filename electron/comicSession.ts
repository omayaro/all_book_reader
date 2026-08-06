import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { filterAndSortImagePaths, isImageFile } from '../src/shared/comic';

export interface ComicSession {
  sourcePath: string;
  entries: string[];
  kind: 'archive' | 'folder';
  zip?: JSZip;
}

let session: ComicSession | null = null;

export function clearComicSession(): void {
  session = null;
}

export function getComicSession(): ComicSession | null {
  return session;
}

export async function openComicArchive(filePath: string): Promise<ComicSession> {
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);
  const names: string[] = [];
  zip.forEach((relativePath, file) => {
    if (file.dir) return;
    const base = relativePath.replace(/\\/g, '/');
    if (base.includes('__MACOSX/')) return;
    if (isImageFile(base)) names.push(base);
  });
  const entries = filterAndSortImagePaths(names);
  if (entries.length === 0) {
    throw new Error('No image files found in the archive.');
  }
  session = { sourcePath: filePath, entries, kind: 'archive', zip };
  return session;
}

export function openComicFolder(folderPath: string): ComicSession {
  const names = fs
    .readdirSync(folderPath)
    .filter((name) => {
      const full = path.join(folderPath, name);
      return fs.statSync(full).isFile() && isImageFile(name);
    })
    .map((name) => path.join(folderPath, name));
  const entries = filterAndSortImagePaths(names);
  if (entries.length === 0) {
    throw new Error('No image files found in the folder.');
  }
  session = { sourcePath: folderPath, entries, kind: 'folder' };
  return session;
}

/** Open a single image file as a one-page comic (folder-order nav sibling). */
export function openComicImageFile(filePath: string): ComicSession {
  if (!isImageFile(filePath)) {
    throw new Error('Not an image file.');
  }
  session = { sourcePath: filePath, entries: [filePath], kind: 'folder' };
  return session;
}

export async function readComicPage(index: number): Promise<ArrayBuffer> {
  if (!session) throw new Error('No comic is open.');
  const entry = session.entries[index];
  if (!entry) throw new Error('Page out of range.');

  if (session.kind === 'folder') {
    const buf = fs.readFileSync(entry);
    return toArrayBuffer(buf);
  }

  const file = session.zip?.file(entry);
  if (!file) throw new Error('Missing page in archive.');
  const u8 = await file.async('uint8array');
  return toArrayBuffer(u8);
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';
import { filterAndSortImagePaths, isImageFile } from '../src/shared/comic';

export interface ComicSession {
  sourcePath: string;
  entries: string[];
  kind: 'archive' | 'folder';
  zipfile?: ZipFile;
  zipEntryByName?: Map<string, Entry>;
}

let session: ComicSession | null = null;
/** yauzl allows only one openReadStream at a time per zipfile. */
let zipReadChain: Promise<unknown> = Promise.resolve();

export function clearComicSession(): void {
  const zipfile = session?.zipfile;
  session = null;
  zipReadChain = Promise.resolve();
  if (zipfile) {
    try {
      zipfile.close();
    } catch {
      /* already closed */
    }
  }
}

export function getComicSession(): ComicSession | null {
  return session;
}

function openZipFile(filePath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(error ?? new Error('Failed to open zip archive.'));
        return;
      }
      resolve(zipfile);
    });
  });
}

function listImageEntries(zipfile: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const found: Entry[] = [];
    zipfile.on('error', reject);
    zipfile.on('entry', (entry: Entry) => {
      const base = entry.fileName.replace(/\\/g, '/');
      if (!base.endsWith('/') && !base.includes('__MACOSX/') && isImageFile(base)) {
        found.push(entry);
      }
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(found));
    zipfile.readEntry();
  });
}

function readZipEntryBuffer(zipfile: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error('Failed to read zip entry.'));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}

/**
 * Open a ZIP/CBZ without loading the whole file into memory.
 * Only the central directory is scanned for image entry names; page bytes are read on demand.
 */
export async function openComicArchive(filePath: string): Promise<ComicSession> {
  const zipfile = await openZipFile(filePath);
  let imageEntries: Entry[];
  try {
    imageEntries = await listImageEntries(zipfile);
  } catch (error) {
    try {
      zipfile.close();
    } catch {
      /* ignore */
    }
    throw error;
  }

  const names = filterAndSortImagePaths(imageEntries.map((entry) => entry.fileName.replace(/\\/g, '/')));
  if (names.length === 0) {
    try {
      zipfile.close();
    } catch {
      /* ignore */
    }
    throw new Error('No image files found in the archive.');
  }

  const byNorm = new Map<string, Entry>();
  for (const entry of imageEntries) {
    byNorm.set(entry.fileName.replace(/\\/g, '/'), entry);
  }
  const zipEntryByName = new Map<string, Entry>();
  for (const name of names) {
    const entry = byNorm.get(name);
    if (entry) zipEntryByName.set(name, entry);
  }

  session = {
    sourcePath: filePath,
    entries: names,
    kind: 'archive',
    zipfile,
    zipEntryByName,
  };
  zipReadChain = Promise.resolve();
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
  const entryName = session.entries[index];
  if (!entryName) throw new Error('Page out of range.');

  if (session.kind === 'folder') {
    const buf = fs.readFileSync(entryName);
    return toArrayBuffer(buf);
  }

  const zipfile = session.zipfile;
  const entry = session.zipEntryByName?.get(entryName);
  if (!zipfile || !entry) throw new Error('Missing page in archive.');

  const read = zipReadChain.then(() => readZipEntryBuffer(zipfile, entry));
  zipReadChain = read.then(
    () => undefined,
    () => undefined,
  );
  const buf = await read;
  return toArrayBuffer(buf);
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

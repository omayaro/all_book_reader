import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';
import { normalizeEpubEntryPath } from '../src/shared/epubEntryPath';
import { parseContainerPackagePath, parseOpfSpineHrefs } from '../src/shared/epubPackage';

export interface EpubSession {
  sourcePath: string;
  entries: string[];
  spineHrefs: string[];
  packagePath: string;
  zipfile: ZipFile;
  zipEntryByName: Map<string, Entry>;
}

let session: EpubSession | null = null;
/** yauzl allows only one openReadStream at a time per zipfile. */
let zipReadChain: Promise<unknown> = Promise.resolve();

export function clearEpubSession(): void {
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

export function getEpubSession(): EpubSession | null {
  return session;
}

function openZipFile(filePath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(error ?? new Error('Failed to open EPUB archive.'));
        return;
      }
      resolve(zipfile);
    });
  });
}

function listEntries(zipfile: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const found: Entry[] = [];
    zipfile.on('error', reject);
    zipfile.on('entry', (entry: Entry) => {
      const base = entry.fileName.replace(/\\/g, '/');
      if (!base.endsWith('/') && !base.includes('__MACOSX/')) {
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
        reject(error ?? new Error('Failed to read EPUB entry.'));
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

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

function buildEntryMap(entries: Entry[]): Map<string, Entry> {
  const map = new Map<string, Entry>();
  for (const entry of entries) {
    const name = normalizeEpubEntryPath(entry.fileName);
    if (!name) continue;
    map.set(name, entry);
    map.set(name.toLowerCase(), entry);
  }
  return map;
}

function lookupEntry(map: Map<string, Entry>, rawPath: string): Entry | undefined {
  const name = normalizeEpubEntryPath(rawPath);
  return map.get(name) ?? map.get(name.toLowerCase());
}

async function readNamedEntry(
  zipfile: ZipFile,
  map: Map<string, Entry>,
  rawPath: string,
): Promise<Buffer> {
  const entry = lookupEntry(map, rawPath);
  if (!entry) throw new Error(`Missing EPUB entry: ${rawPath}`);
  const read = zipReadChain.then(() => readZipEntryBuffer(zipfile, entry));
  zipReadChain = read.then(
    () => undefined,
    () => undefined,
  );
  return read;
}

/**
 * Open an EPUB without loading the whole file into memory.
 * Only the central directory is scanned; entry bytes are read on demand.
 */
export async function openEpubArchive(filePath: string): Promise<EpubSession> {
  const zipfile = await openZipFile(filePath);
  let listed: Entry[];
  try {
    listed = await listEntries(zipfile);
  } catch (error) {
    try {
      zipfile.close();
    } catch {
      /* ignore */
    }
    throw error;
  }

  const zipEntryByName = buildEntryMap(listed);
  zipReadChain = Promise.resolve();

  try {
    const container = await readNamedEntry(zipfile, zipEntryByName, 'META-INF/container.xml');
    const packagePath = parseContainerPackagePath(container.toString('utf8'));
    const opf = await readNamedEntry(zipfile, zipEntryByName, packagePath);
    const spineHrefs = parseOpfSpineHrefs(opf.toString('utf8'), packagePath);
    const entries = [...new Set(listed.map((entry) => normalizeEpubEntryPath(entry.fileName)))].filter(
      Boolean,
    );

    session = {
      sourcePath: filePath,
      entries,
      spineHrefs,
      packagePath,
      zipfile,
      zipEntryByName,
    };
    return session;
  } catch (error) {
    try {
      zipfile.close();
    } catch {
      /* ignore */
    }
    zipReadChain = Promise.resolve();
    throw error;
  }
}

export async function readEpubEntry(entryPath: string): Promise<ArrayBuffer> {
  if (!session) throw new Error('No EPUB is open.');
  const buf = await readNamedEntry(session.zipfile, session.zipEntryByName, entryPath);
  return toArrayBuffer(buf);
}

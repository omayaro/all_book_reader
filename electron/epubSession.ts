import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';
import { normalizeEpubEntryPath } from '../src/shared/epubEntryPath';
import { parseContainerPackagePath, parseOpfSpineHrefs } from '../src/shared/epubPackage';

export type EpubReadPriority = 'high' | 'low';

export interface EpubSession {
  sourcePath: string;
  entries: string[];
  spineHrefs: string[];
  packagePath: string;
  zipfile: ZipFile;
  zipEntryByName: Map<string, Entry>;
}

interface ZipReadJob {
  entry: Entry;
  priority: EpubReadPriority;
  resolve: (buf: Buffer) => void;
  reject: (error: unknown) => void;
}

let session: EpubSession | null = null;
const zipJobs: ZipReadJob[] = [];
let zipPumping = false;

export function clearEpubSession(): void {
  const zipfile = session?.zipfile;
  session = null;
  const pending = zipJobs.splice(0);
  zipPumping = false;
  for (const job of pending) {
    job.reject(new Error('EPUB session closed.'));
  }
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

function enqueueZipRead(entry: Entry, priority: EpubReadPriority): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const job: ZipReadJob = { entry, priority, resolve, reject };
    if (priority === 'high') {
      const firstLow = zipJobs.findIndex((item) => item.priority === 'low');
      if (firstLow === -1) zipJobs.push(job);
      else zipJobs.splice(firstLow, 0, job);
    } else {
      zipJobs.push(job);
    }
    void pumpZipReads();
  });
}

async function pumpZipReads(): Promise<void> {
  if (zipPumping) return;
  zipPumping = true;
  while (session && zipJobs.length > 0) {
    const job = zipJobs.shift();
    if (!job) break;
    const zipfile = session.zipfile;
    try {
      const buf = await readZipEntryBuffer(zipfile, job.entry);
      job.resolve(buf);
    } catch (error) {
      job.reject(error);
    }
  }
  zipPumping = false;
  if (session && zipJobs.length > 0) void pumpZipReads();
}

async function readNamedEntry(
  zipfile: ZipFile,
  map: Map<string, Entry>,
  rawPath: string,
  priority: EpubReadPriority,
): Promise<Buffer> {
  const entry = lookupEntry(map, rawPath);
  if (!entry) throw new Error(`Missing EPUB entry: ${rawPath}`);
  if (!session || session.zipfile !== zipfile) {
    return readZipEntryBuffer(zipfile, entry);
  }
  return enqueueZipRead(entry, priority);
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
  zipJobs.length = 0;
  zipPumping = false;

  const opened: EpubSession = {
    sourcePath: filePath,
    entries: [],
    spineHrefs: [],
    packagePath: '',
    zipfile,
    zipEntryByName,
  };
  session = opened;

  try {
    const container = await readNamedEntry(zipfile, zipEntryByName, 'META-INF/container.xml', 'high');
    const packagePath = parseContainerPackagePath(container.toString('utf8'));
    const opf = await readNamedEntry(zipfile, zipEntryByName, packagePath, 'high');
    const spineHrefs = parseOpfSpineHrefs(opf.toString('utf8'), packagePath);
    const entries = [...new Set(listed.map((entry) => normalizeEpubEntryPath(entry.fileName)))].filter(
      Boolean,
    );
    opened.entries = entries;
    opened.spineHrefs = spineHrefs;
    opened.packagePath = packagePath;
    return opened;
  } catch (error) {
    clearEpubSession();
    throw error;
  }
}

export async function readEpubEntry(
  entryPath: string,
  priority: EpubReadPriority = 'high',
): Promise<ArrayBuffer> {
  if (!session) throw new Error('No EPUB is open.');
  const buf = await readNamedEntry(session.zipfile, session.zipEntryByName, entryPath, priority);
  return toArrayBuffer(buf);
}

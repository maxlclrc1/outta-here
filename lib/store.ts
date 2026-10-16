import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

// A small JSON document store that mirrors the shape the app expects:
// documents live at slash-separated paths with an even number of segments
// (`trips/t1`, `trips/t1/members/u1`), and a collection is the odd-length prefix.
// Everything is kept in memory and flushed to data/db.json shortly after each write (see below).

export type Json = Record<string, unknown>;
type Doc = { data: Json; version: number; updatedAt: number };
type State = { docs: Map<string, Doc>; bus: EventEmitter; timer: NodeJS.Timeout | null; diskGood: boolean; broken: string | null; failures: number };

// OUTTA_DATA_DIR lets the test runner use a throwaway database (scripts/test.mjs)
const DATA_DIR = process.env.OUTTA_DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'db.json');
// the copy of db.json from before the latest save, kept for recovery
const BACKUP = FILE + '.bak';
const SEGMENT = /^(?!\.\.?$)[A-Za-z0-9_\-.~:@+]{1,200}$/;

// Keeping the database safe on disk:
// - Every save goes to db.json.tmp first, is flushed to disk, then renamed over db.json in one
//   step, so db.json is always either the old version or the new one, never half-written.
// - Before that rename, the current db.json (known to be good) is copied to db.json.bak.
// - A save that fails (disk full, permissions) leaves db.json as it was, and is retried.
// - On startup, a db.json that can't be read is kept as db.json.corrupt-<time> and the backup
//   is loaded instead. If neither can be read, saving is refused (nothing is overwritten) until
//   someone fixes or removes the files.
type Loaded = { docs: Map<string, Doc>; diskGood: boolean; broken: string | null };
function readDb(file: string): Map<string, Doc> {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not a database object');
  return new Map(Object.entries(raw as Record<string, Doc>));
}
function load(): Loaded {
  try { return { docs: readDb(FILE), diskGood: true, broken: null }; }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' && !fs.existsSync(BACKUP)) return { docs: new Map(), diskGood: false, broken: null }; // first run
    const missing = (e as NodeJS.ErrnoException).code === 'ENOENT';
    let kept = '';
    if (!missing) { kept = `${FILE}.corrupt-${Date.now()}`; try { fs.copyFileSync(FILE, kept); } catch { kept = ''; } }
    try {
      const docs = readDb(BACKUP);
      console.error(`[store] ${missing ? 'data/db.json is missing' : 'data/db.json could not be read' + (kept ? ` (kept as ${path.basename(kept)})` : '')}; loaded the backup from ${new Date(fs.statSync(BACKUP).mtimeMs).toISOString()}.`);
      return { docs, diskGood: false, broken: null };
    } catch {
      const msg = `The database file couldn’t be read${kept ? ` (a copy is kept as ${path.basename(kept)})` : ''} and there’s no usable backup, so saving is turned off to avoid overwriting it. Fix or remove data/db.json and restart.`;
      console.error('[store] ' + msg);
      return { docs: new Map(), diskGood: false, broken: msg };
    }
  }
}

const g = globalThis as unknown as { __outtaStore?: State };

function state(): State {
  if (!g.__outtaStore) {
    const { docs, diskGood, broken } = load();
    const bus = new EventEmitter();
    bus.setMaxListeners(0);
    g.__outtaStore = { docs, bus, timer: null, diskGood, broken, failures: 0 };
  }
  return g.__outtaStore;
}

function writeFileDurably(file: string, text: string) {
  const fd = fs.openSync(file, 'w');
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
/** Writes the in-memory database to disk now. Throws if the write failed; db.json is then unchanged. */
export function flushNow() {
  const s = state();
  if (s.broken) throw new StoreError('unavailable', s.broken);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  try {
    writeFileDurably(tmp, JSON.stringify(Object.fromEntries(s.docs)));
    if (s.diskGood) { fs.copyFileSync(FILE, BACKUP + '.tmp'); fs.renameSync(BACKUP + '.tmp', BACKUP); }
    fs.renameSync(tmp, FILE);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw e;
  }
  s.diskGood = true;
  try { const dir = fs.openSync(DATA_DIR, 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); } } catch {} // best effort: make the rename itself durable
}

function persist(delay = 150) {
  const s = state();
  if (s.timer) return;
  s.timer = setTimeout(() => {
    s.timer = null;
    try { flushNow(); s.failures = 0; }
    catch (e) {
      // the last good db.json is untouched; keep the changes in memory and try again
      s.failures++;
      console.error('[store] Saving the database failed, will retry:', (e as Error).message);
      persist(Math.min(30000, 1000 * 2 ** Math.min(s.failures, 5)));
    }
  }, delay);
}

export function segments(p: string, parity: 'doc' | 'collection'): string[] {
  const segs = String(p || '').split('/');
  if (segs.length > 16 || !segs.every((x) => SEGMENT.test(x))) throw new StoreError('invalid_argument', `Bad path: ${p}`);
  if ((segs.length % 2 === 0) !== (parity === 'doc')) throw new StoreError('invalid_argument', `Wrong segment count for a ${parity}: ${p}`);
  return segs;
}

export class StoreError extends Error {
  constructor(public code: 'invalid_argument' | 'unavailable' | 'permission_denied' | 'conflict', message: string) {
    super(message);
  }
}

// Each viewer's data/users/<id>/... subtree is private to that viewer.
function visible(p: string, user: string) {
  const segs = p.split('/');
  return !(segs[0] === 'data' && segs[1] === 'users' && segs[2] !== user);
}

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
export function merge(target: Json, patch: Json): Json {
  const out: Json = { ...target };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k] as Json, v) : v;
  return out;
}

function changed(p: string) {
  persist();
  state().bus.emit('change', p);
}

/** The stored data at a path, with no access checks (for the access rules themselves). */
export function rawDoc(p: string): Json | null {
  return state().docs.get(p)?.data ?? null;
}

export function getDoc(p: string, user: string) {
  segments(p, 'doc');
  const d = visible(p, user) ? state().docs.get(p) : undefined;
  return d ? { exists: true, data: d.data, version: d.version } : { exists: false };
}

const writable = () => { const b = state().broken; if (b) throw new StoreError('unavailable', b); };

export function setDoc(p: string, data: Json, user: string) {
  segments(p, 'doc');
  writable();
  if (!visible(p, user)) throw new StoreError('invalid_argument', 'Not your data');
  if (!isObj(data)) throw new StoreError('invalid_argument', 'Document body must be an object');
  if (JSON.stringify(data).length > 256 * 1024) throw new StoreError('invalid_argument', 'Document is over 256 KiB, even after trimming old change history. Nothing was saved.');
  const prev = state().docs.get(p);
  state().docs.set(p, { data, version: (prev?.version || 0) + 1, updatedAt: Date.now() });
  changed(p);
}

export function updateDoc(p: string, patch: Json, user: string) {
  segments(p, 'doc');
  const prev = visible(p, user) ? state().docs.get(p) : undefined;
  if (!prev) throw new StoreError('invalid_argument', 'Document does not exist');
  setDoc(p, merge(prev.data, patch), user);
}

export function deleteDoc(p: string, user: string) {
  segments(p, 'doc');
  writable();
  if (!visible(p, user)) throw new StoreError('invalid_argument', 'Not your data');
  if (state().docs.delete(p)) changed(p);
}

export function listCollection(coll: string, user: string) {
  const depth = segments(coll, 'collection').length + 1;
  const prefix = coll + '/';
  const out: { id: string; data: Json; version: number }[] = [];
  for (const [p, d] of state().docs) {
    if (p.startsWith(prefix) && p.split('/').length === depth && visible(p, user)) out.push({ id: p.slice(prefix.length), data: d.data, version: d.version });
  }
  return out;
}

export function onChange(fn: (p: string) => void) {
  const bus = state().bus;
  bus.on('change', fn);
  return () => bus.off('change', fn);
}

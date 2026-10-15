import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

// A small JSON document store that mirrors the shape the app expects:
// documents live at slash-separated paths with an even number of segments
// (`trips/t1`, `trips/t1/members/u1`), and a collection is the odd-length prefix.
// Everything is kept in memory and flushed to data/db.json shortly after each write.

export type Json = Record<string, unknown>;
type Doc = { data: Json; version: number; updatedAt: number };
type State = { docs: Map<string, Doc>; bus: EventEmitter; timer: NodeJS.Timeout | null };

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const SEGMENT = /^(?!\.\.?$)[A-Za-z0-9_\-.~:@+]{1,200}$/;

const g = globalThis as unknown as { __outtaStore?: State };

function state(): State {
  if (!g.__outtaStore) {
    const docs = new Map<string, Doc>();
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Record<string, Doc>;
      for (const [k, v] of Object.entries(raw)) docs.set(k, v);
    } catch {
      // first run: no database yet
    }
    const bus = new EventEmitter();
    bus.setMaxListeners(0);
    g.__outtaStore = { docs, bus, timer: null };
  }
  return g.__outtaStore;
}

function persist() {
  const s = state();
  if (s.timer) return;
  s.timer = setTimeout(() => {
    s.timer = null;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(s.docs)));
    fs.renameSync(tmp, FILE);
  }, 150);
}

export function segments(p: string, parity: 'doc' | 'collection'): string[] {
  const segs = String(p || '').split('/');
  if (segs.length > 16 || !segs.every((x) => SEGMENT.test(x))) throw new StoreError('invalid_argument', `Bad path: ${p}`);
  if ((segs.length % 2 === 0) !== (parity === 'doc')) throw new StoreError('invalid_argument', `Wrong segment count for a ${parity}: ${p}`);
  return segs;
}

export class StoreError extends Error {
  constructor(public code: 'invalid_argument' | 'unavailable', message: string) {
    super(message);
  }
}

// Each viewer's data/users/<id>/... subtree is private to that viewer.
function visible(p: string, user: string) {
  const segs = p.split('/');
  return !(segs[0] === 'data' && segs[1] === 'users' && segs[2] !== user);
}

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
function merge(target: Json, patch: Json): Json {
  const out: Json = { ...target };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k] as Json, v) : v;
  return out;
}

function changed(p: string) {
  persist();
  state().bus.emit('change', p);
}

export function getDoc(p: string, user: string) {
  segments(p, 'doc');
  const d = visible(p, user) ? state().docs.get(p) : undefined;
  return d ? { exists: true, data: d.data, version: d.version } : { exists: false };
}

export function setDoc(p: string, data: Json, user: string) {
  segments(p, 'doc');
  if (!visible(p, user)) throw new StoreError('invalid_argument', 'Not your data');
  if (!isObj(data)) throw new StoreError('invalid_argument', 'Document body must be an object');
  if (JSON.stringify(data).length > 256 * 1024) throw new StoreError('invalid_argument', 'Document is over 256 KiB');
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

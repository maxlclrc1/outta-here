import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { allPaths, rawDoc } from '@/lib/store';
import { listAssets } from '@/lib/assets';

// Which browser owns which id.
//
// Each browser still makes up its own id, but it's no longer enough to send it: the server gives
// the browser a secret the first time it uses a new id (an HttpOnly, SameSite=Strict cookie named
// outta_<id>) and keeps only a hash of it in data/keys.json. Every request then has to carry the
// cookie that matches the id it claims. Nothing in this file is ever sent back except the cookie.
//
// Ids that already appear in the data but have no secret yet (from before this existed) are
// locked: knowing one isn't proof of owning it, so nobody can claim it by asking. The person who
// runs the app makes a one-time sign-in link for it instead (scripts/claim-link.mjs), which
// leaves a hashed code in data/claims/; opening that link binds the id to that browser.

const DATA_DIR = process.env.OUTTA_DATA_DIR || path.join(process.cwd(), 'data');
const KEYS = path.join(DATA_DIR, 'keys.json'), CLAIMS = path.join(DATA_DIR, 'claims');
export const ID = /^[A-Za-z0-9_\-]{4,64}$/;
type Key = { h: string; at: number };
const g = globalThis as unknown as { __outtaKeys?: Map<string, Key> };
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function keys(): Map<string, Key> {
  if (!g.__outtaKeys) {
    let raw: Record<string, Key> = {};
    try { raw = JSON.parse(fs.readFileSync(KEYS, 'utf8')); }
    catch (e) {
      // a damaged keys file must not be read as "nobody has a key" (that would unlock every id)
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('data/keys.json can’t be read; fix or restore it before starting.');
    }
    g.__outtaKeys = new Map(Object.entries(raw));
  }
  return g.__outtaKeys;
}
// written like the database: to a temporary file, flushed, then swapped in
function saveKeys() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = KEYS + '.tmp', fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeSync(fd, JSON.stringify(Object.fromEntries(keys()))); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, KEYS);
}

export const cookieName = (id: string) => 'outta_' + id;
function cookieOf(req: Request, id: string) {
  const want = cookieName(id) + '=';
  for (const part of (req.headers.get('cookie') || '').split(';')) { const c = part.trim(); if (c.startsWith(want)) return c.slice(want.length); }
  return '';
}
function matches(id: string, secret: string) {
  const k = keys().get(id); if (!k || !secret) return false;
  const a = Buffer.from(sha(secret), 'hex'), b = Buffer.from(k.h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/** True if this request carries the secret for this id. */
export function owns(req: Request, id: string) { return ID.test(id) && matches(id, cookieOf(req, id)); }
/** Every id this browser's cookies prove it owns (to recover after local storage was cleared). */
export function ownedIds(req: Request) {
  return (req.headers.get('cookie') || '').split(';').map(c => c.trim()).filter(c => c.startsWith('outta_'))
    .map(c => c.slice(6, c.indexOf('='))).filter(id => ID.test(id) && owns(req, id));
}
/** Does this id already appear anywhere in the data (from before ids had secrets)? */
function known(id: string) {
  const quoted = JSON.stringify(id);
  for (const p of allPaths()) { if (p.split('/').includes(id) || JSON.stringify(rawDoc(p)).includes(quoted)) return true; }
  return listAssets().some(a => a.by === id);
}
function bind(id: string) {
  const secret = crypto.randomBytes(32).toString('base64url');
  keys().set(id, { h: sha(secret), at: Date.now() }); saveKeys();
  return secret;
}

export type Claim = { ok: true; id: string; secret?: string } | { ok: false; status: number; code: string; message: string };
/** A browser asking to use an id: fine if it already owns it, or if the id is brand new. */
export function claimId(req: Request, id: string): Claim {
  if (!ID.test(id)) return { ok: false, status: 400, code: 'invalid_argument', message: 'That isn’t a valid id.' };
  if (owns(req, id)) return { ok: true, id };
  if (keys().has(id)) return { ok: false, status: 409, code: 'id_taken', message: 'This browser can’t prove it’s you anymore (its sign-in was cleared, or this is a new device). Ask whoever runs the app for a sign-in link.' };
  if (known(id)) return { ok: false, status: 403, code: 'needs_claim_link', message: 'Outta Here now checks who’s who. To pick up your plans on this browser, ask whoever runs the app for your sign-in link.' };
  return { ok: true, id, secret: bind(id) };
}
/** A browser opening a one-time sign-in link made with scripts/claim-link.mjs. */
export function claimWithCode(code: string): Claim {
  const bad: Claim = { ok: false, status: 403, code: 'bad_link', message: 'That sign-in link doesn’t work (it was used already or it expired). Ask for a new one.' };
  if (!/^[A-Za-z0-9_\-]{20,80}$/.test(code)) return bad;
  const file = path.join(CLAIMS, sha(code) + '.json');
  let c: { id?: string; exp?: number };
  try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return bad; }
  try { fs.rmSync(file, { force: true }); } catch {} // single use, even if it turns out to be expired
  if (!c.id || !ID.test(c.id) || !(Number(c.exp) > Date.now())) return bad;
  return { ok: true, id: c.id, secret: bind(c.id) };
}

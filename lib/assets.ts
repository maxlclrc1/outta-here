import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = path.join(process.env.OUTTA_DATA_DIR || path.join(process.cwd(), 'data'), 'uploads');
export const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = /^(image\/(png|jpeg|gif|webp|heic|heif|avif)|application\/pdf)$/;

type Meta = { id: string; contentType: string; sizeBytes: number; by: string; at: number; tid?: string };

// Uploads are boarding passes and trip photos. Limits that fit that, per plan:
export const QUOTA = { perPersonFiles: +(process.env.OUTTA_UPLOAD_FILES_PER_PERSON || 0) || 120, perPersonBytes: 250 * 1024 * 1024, perPlanFiles: 1000, perPlanBytes: 1024 * 1024 * 1024 };

// What the bytes actually are, from their first few bytes (not the name or the declared type)
function sniff(b: Buffer): string | null {
  const s = (from: number, to: number) => b.subarray(from, to).toString('latin1');
  if (b.length >= 8 && b[0] === 0x89 && s(1, 4) === 'PNG') return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (s(0, 6) === 'GIF87a' || s(0, 6) === 'GIF89a') return 'image/gif';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'image/webp';
  if (s(0, 5) === '%PDF-') return 'application/pdf';
  if (s(4, 8) === 'ftyp') {
    const brands = s(8, Math.min(b.length, 64));
    if (/avi[fs]/.test(brands)) return 'image/avif';
    if (/hei[cxms]|hev[cx]/.test(brands)) return 'image/heic';
    if (/mif1|msf1/.test(brands)) return 'image/heif';
  }
  return null;
}
// HEIC/HEIF/AVIF share a container and phones label them loosely, so they count as one family
const family = (t: string) => (/^image\/(heic|heif|avif)$/.test(t) ? 'heif' : t);

function usage(tid: string, by: string) {
  const u = { planFiles: 0, planBytes: 0, mineFiles: 0, mineBytes: 0 };
  let names: string[] = []; try { names = fs.readdirSync(DIR).filter(n => n.endsWith('.json')); } catch { return u; }
  for (const n of names) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8')) as Meta;
      if (m.tid !== tid) continue;
      u.planFiles++; u.planBytes += m.sizeBytes;
      if (m.by === by) { u.mineFiles++; u.mineBytes += m.sizeBytes; }
    } catch {}
  }
  return u;
}
const metaPath = (id: string) => path.join(DIR, id + '.json');
const filePath = (id: string) => path.join(DIR, id);
const validId = (id: string) => /^[0-9a-f]{32}$/.test(id);

export function saveAsset(bytes: Buffer, contentType: string, by: string, tid: string): Meta {
  const fail = (code: string, msg: string) => Object.assign(new Error(msg), { code });
  if (!TYPES.test(contentType)) throw fail('unsupported_type', 'Use a photo, screenshot or PDF.');
  if (!bytes.length) throw fail('invalid_argument', 'That file is empty.');
  if (bytes.length > MAX_BYTES) throw fail('too_large', 'File is over 20 MB.');
  const real = sniff(bytes);
  if (!real || family(real) !== family(contentType)) throw fail('unsupported_type', 'That file isn’t a photo or PDF it says it is.');
  const u = usage(tid, by);
  if (u.mineFiles + 1 > QUOTA.perPersonFiles || u.mineBytes + bytes.length > QUOTA.perPersonBytes) throw fail('quota_exceeded', 'You’ve uploaded as much as one person can for this plan. Delete some photos first.');
  if (u.planFiles + 1 > QUOTA.perPlanFiles || u.planBytes + bytes.length > QUOTA.perPlanBytes) throw fail('quota_exceeded', 'This plan has reached its upload limit. Delete some photos first.');
  fs.mkdirSync(DIR, { recursive: true });
  const id = crypto.randomBytes(16).toString('hex');
  const meta: Meta = { id, contentType, sizeBytes: bytes.length, by, at: Date.now(), tid };
  // write both or neither: a failure part-way leaves no stray file behind
  try { fs.writeFileSync(filePath(id), bytes); fs.writeFileSync(metaPath(id), JSON.stringify(meta)); }
  catch (e) { fs.rmSync(filePath(id), { force: true }); fs.rmSync(metaPath(id), { force: true }); throw Object.assign(e as Error, { code: 'store_unavailable' }); }
  return meta;
}

export function readAsset(id: string) {
  if (!validId(id)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath(id), 'utf8')) as Meta;
    return { meta, bytes: fs.readFileSync(filePath(id)) };
  } catch {
    return null;
  }
}

export function deleteAsset(id: string, by: string) {
  const a = readAsset(id);
  if (!a) return 'not_found';
  if (a.meta.by !== by) return 'not_uploader';
  fs.rmSync(filePath(id), { force: true });
  fs.rmSync(metaPath(id), { force: true });
  return 'ok';
}

/** Every upload's details (for cleaning up after a deleted plan). */
export function listAssets(): Meta[] {
  let names: string[] = []; try { names = fs.readdirSync(DIR).filter(n => n.endsWith('.json')); } catch { return []; }
  const out: Meta[] = [];
  for (const n of names) { try { out.push(JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8')) as Meta); } catch {} }
  return out;
}
/** Marks an older upload (saved before uploads recorded their plan) as belonging to this plan. */
export function claimAsset(id: string, tid: string) {
  if (!validId(id)) return;
  try { const m = JSON.parse(fs.readFileSync(metaPath(id), 'utf8')) as Meta; if (!m.tid) fs.writeFileSync(metaPath(id), JSON.stringify({ ...m, tid })); } catch {}
}
/** Removes an upload's file, then its details. True if it's gone (or was already). */
export function removeAssetFiles(id: string) {
  if (!validId(id)) return false;
  try { fs.rmSync(filePath(id), { force: true }); fs.rmSync(metaPath(id), { force: true }); return true; } catch { return false; }
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = path.join(process.cwd(), 'data', 'uploads');
export const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = /^(image\/(png|jpeg|gif|webp|heic|heif|avif)|application\/pdf)$/;

type Meta = { id: string; contentType: string; sizeBytes: number; by: string; at: number };
const metaPath = (id: string) => path.join(DIR, id + '.json');
const filePath = (id: string) => path.join(DIR, id);
const validId = (id: string) => /^[0-9a-f]{32}$/.test(id);

export function saveAsset(bytes: Buffer, contentType: string, by: string): Meta {
  if (!TYPES.test(contentType)) throw Object.assign(new Error('Use a photo, screenshot or PDF.'), { code: 'unsupported_type' });
  if (bytes.length > MAX_BYTES) throw Object.assign(new Error('File is over 20 MB.'), { code: 'too_large' });
  fs.mkdirSync(DIR, { recursive: true });
  const id = crypto.randomBytes(16).toString('hex');
  const meta: Meta = { id, contentType, sizeBytes: bytes.length, by, at: Date.now() };
  fs.writeFileSync(filePath(id), bytes);
  fs.writeFileSync(metaPath(id), JSON.stringify(meta));
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

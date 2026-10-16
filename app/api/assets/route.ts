import { NextResponse } from 'next/server';
import { MAX_BYTES, saveAsset } from '@/lib/assets';
import { inTrip } from '@/lib/access';
import { allow, retryAfter } from '@/lib/limits';
import { userOf } from '@/lib/user';

export const runtime = 'nodejs';

const fail = (code: string, message: string, status: number, headers?: Record<string, string>) => NextResponse.json({ code, message }, { status, headers });

// Uploads (boarding passes, trip photos) belong to a plan, and only people in it can add them.
export async function POST(req: Request) {
  const user = userOf(req), tid = req.headers.get('x-outta-plan') || '';
  if (!/^[A-Za-z0-9_\-]{4,40}$/.test(tid)) return fail('invalid_argument', 'Say which plan this upload is for.', 400);
  if (!inTrip(tid, user)) return fail('permission_denied', 'Only people in this plan can add files to it.', 403);
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) return fail('too_large', 'File is over 20 MB.', 413);
  const key = `up:${user}:${tid}`, ms = 10 * 60 * 1000;
  if (!allow(key, 60, ms)) return fail('rate_limited', 'Too many uploads at once. Give it a few minutes.', 429, { 'Retry-After': String(retryAfter(key, ms)) });
  try {
    const bytes = Buffer.from(await req.arrayBuffer());
    const meta = saveAsset(bytes, type, user, tid);
    return NextResponse.json({ id: meta.id, url: '/_blob/' + meta.id, sizeBytes: meta.sizeBytes, contentType: meta.contentType });
  } catch (e) {
    const code = (e as { code?: string }).code || 'store_unavailable';
    const status = code === 'too_large' ? 413 : code === 'quota_exceeded' ? 413 : code === 'unsupported_type' ? 415 : code === 'store_unavailable' ? 500 : 400;
    return fail(code, code === 'store_unavailable' ? 'Couldn’t save the file.' : (e as Error).message, status);
  }
}

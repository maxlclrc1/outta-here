import { NextResponse } from 'next/server';
import { MAX_BYTES, saveAsset } from '@/lib/assets';
import { userOf } from '@/lib/user';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return NextResponse.json({ code: 'too_large', message: 'File is over 20 MB.' }, { status: 413 });
  try {
    const bytes = Buffer.from(await req.arrayBuffer());
    const meta = saveAsset(bytes, type, userOf(req));
    return NextResponse.json({ id: meta.id, url: '/_blob/' + meta.id, sizeBytes: meta.sizeBytes, contentType: meta.contentType });
  } catch (e) {
    const code = (e as { code?: string }).code || 'store_unavailable';
    return NextResponse.json({ code, message: (e as Error).message }, { status: code === 'store_unavailable' ? 500 : 400 });
  }
}

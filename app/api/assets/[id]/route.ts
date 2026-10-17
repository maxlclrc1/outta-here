import { NextResponse } from 'next/server';
import { deleteAsset, readAsset } from '@/lib/assets';
import { guard, userOf } from '@/lib/user';
import { rawDoc } from '@/lib/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  // Files are opened by <img> and links, which can't say who is asking, so anyone with a
  // file's link can open it (the link is 128 random bits). Files from a deleted plan stop working.
  const a = readAsset((await params).id);
  if (!a || (a.meta.tid && !rawDoc('trips/' + a.meta.tid))) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(a.bytes), {
    headers: {
      'Content-Type': a.meta.contentType, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      // images: never run as a page, whatever is inside (PDFs open in the browser's own sandboxed viewer)
      ...(a.meta.contentType === 'application/pdf' ? {} : { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" }),
    },
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const no = guard(req); if (no) return no;
  const r = deleteAsset((await params).id, userOf(req));
  if (r === 'ok') return NextResponse.json({ ok: true });
  return NextResponse.json({ code: r, message: r === 'not_uploader' ? 'Only the person who uploaded this can delete it.' : 'Not found' }, { status: r === 'not_uploader' ? 403 : 404 });
}

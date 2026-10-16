import { NextResponse } from 'next/server';
import { deleteDoc, getDoc, listCollection, rawDoc, segments, setDoc, StoreError, updateDoc, type Json } from '@/lib/store';
import { checkWrite, listable, readable } from '@/lib/access';
import { honoreeItinerary } from '@/lib/privacy';
import { userOf } from '@/lib/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { op: 'get' | 'set' | 'update' | 'delete' | 'list'; path: string; data?: Json };

export async function POST(req: Request) {
  const user = userOf(req), ctx = { user, invite: (req.headers.get('x-outta-invite') || '').slice(0, 40) };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ code: 'invalid_argument', message: 'Body must be JSON' }, { status: 400 });
  }
  try {
    const { op, path } = body;
    switch (op) {
      case 'get': {
        const r = getDoc(path, user);
        const data = r.exists ? readable(path, r.data as Json, ctx) : null;
        return NextResponse.json(data ? { ...r, data } : { exists: false });
      }
      case 'list': {
        const docs = listCollection(path, user).map(d => ({ ...d, data: listable(`${path}/${d.id}`, d.data, ctx) })).filter(d => d.data);
        return NextResponse.json({ docs });
      }
      case 'set': case 'update': case 'delete': {
        segments(path, 'doc');
        checkWrite(op, path, body.data, rawDoc(path), ctx);
        if (op === 'set') setDoc(path, body.data ?? {}, user);
        else if (op === 'update') { const prev = /^trips\/[^/]+$/.test(path) ? rawDoc(path) : null; updateDoc(path, prev ? honoreeItinerary(prev, body.data ?? {}, user) : body.data ?? {}, user); }
        else deleteDoc(path, user);
        return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ code: 'invalid_argument', message: 'Unknown op' }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof StoreError) return NextResponse.json({ code: e.code, message: e.message }, { status: e.code === 'permission_denied' ? 403 : 400 });
    console.error(e);
    return NextResponse.json({ code: 'unavailable', message: 'Store error' }, { status: 500 });
  }
}

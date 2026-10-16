import { NextResponse } from 'next/server';
import { deleteDoc, getDoc, listCollection, rawDoc, segments, setDoc, StoreError, updateDoc, type Json } from '@/lib/store';
import { checkWrite, listable, readable } from '@/lib/access';
import { honoreeItinerary } from '@/lib/privacy';
import { keepManaged, mergeListsIn } from '@/lib/merge';
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
        const prev = rawDoc(path), isPlan = /^trips\/[^/]+$/.test(path), isMine = path === `${path.split('/').slice(0, 3).join('/')}/${user}` && /^trips\/[^/]+\/members\//.test(path);
        let data = body.data ?? {};
        // what will actually be written: lists merged with others' edits, surprises kept,
        // and a member's whole-record save never changing what organizers manage
        if (isPlan && op === 'update' && prev) data = honoreeItinerary(prev, mergeListsIn(prev, data), user);
        if (isPlan && op === 'set') { const { _base, ...rest } = data; data = rest; }
        if (isMine && op === 'set' && prev) data = keepManaged(prev, data);
        checkWrite(op, path, data, prev, ctx);
        if (op === 'set') setDoc(path, data, user);
        else if (op === 'update') updateDoc(path, data, user);
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

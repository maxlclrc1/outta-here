import { NextResponse } from 'next/server';
import { deleteDoc, getDoc, listCollection, setDoc, StoreError, updateDoc, type Json } from '@/lib/store';
import { userOf } from '@/lib/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { op: 'get' | 'set' | 'update' | 'delete' | 'list'; path: string; data?: Json };

export async function POST(req: Request) {
  const user = userOf(req);
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ code: 'invalid_argument', message: 'Body must be JSON' }, { status: 400 });
  }
  try {
    switch (body.op) {
      case 'get': return NextResponse.json(getDoc(body.path, user));
      case 'list': return NextResponse.json({ docs: listCollection(body.path, user) });
      case 'set': setDoc(body.path, body.data ?? {}, user); return NextResponse.json({ ok: true });
      case 'update': updateDoc(body.path, body.data ?? {}, user); return NextResponse.json({ ok: true });
      case 'delete': deleteDoc(body.path, user); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ code: 'invalid_argument', message: 'Unknown op' }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof StoreError) return NextResponse.json({ code: e.code, message: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ code: 'unavailable', message: 'Store error' }, { status: 500 });
  }
}

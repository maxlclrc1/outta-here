import { NextResponse } from 'next/server';
import { checkMemberDays, checkPlanDates } from '@/lib/planDates';
import { deletePlan } from '@/lib/deletePlan';
import { deleteDoc, getDoc, listCollection, merge, rawDoc, segments, setDoc, StoreError, updateDoc, type Json } from '@/lib/store';
import { boundLog } from '@/lib/changelog';
import { keepDecisionsValid } from '@/lib/integrity';
import { checkWrite, listable, readable } from '@/lib/access';
import { honoreeItinerary } from '@/lib/privacy';
import { checkExpected, keepManaged, mergeListsIn } from '@/lib/merge';
import { crossSite, CROSS_SITE, unverified, UNVERIFIED, userOf } from '@/lib/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { op: 'get' | 'set' | 'update' | 'delete' | 'list'; path: string; data?: Json };

export async function POST(req: Request) {
  if (crossSite(req)) return NextResponse.json(CROSS_SITE, { status: 403 });
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
        if (user === 'anonymous') return NextResponse.json(unverified(req) ? UNVERIFIED : { code: 'unauthenticated', message: 'Say who you are (x-outta-user) to change anything.' }, { status: 401 });
        segments(path, 'doc');
        // a whole plan is only ever deleted together with everything in it (lib/deletePlan.ts)
        if (op === 'delete' && /^trips\/[^/]+$/.test(path)) { deletePlan(path.slice(6), user); return NextResponse.json({ ok: true }); }
        const prev = rawDoc(path), isPlan = /^trips\/[^/]+$/.test(path), isMine = path === `${path.split('/').slice(0, 3).join('/')}/${user}` && /^trips\/[^/]+\/members\//.test(path);
        let data = body.data ?? {};
        // Undo/Restore: only if what it would put back hasn't changed since (lib/merge.ts)
        if (isPlan && data && typeof data === 'object' && '_expect' in data) { const { _expect, ...rest } = data as Json; if (op === 'update' && prev) checkExpected(prev, _expect); data = rest; }
        // the plan's dates must be real dates (lib/planDates.ts); checked on what was sent
        if (isPlan && op !== 'delete' && data && typeof data === 'object') checkPlanDates(data);
        if (/^trips\/[^/]+\/members\/[^/]+$/.test(path) && op !== 'delete' && data && typeof data === 'object') checkMemberDays(data, prev);
        // what will actually be written: lists merged with others' edits, surprises kept,
        // and a member's whole-record save never changing what organizers manage
        if (isPlan && op === 'update' && prev) data = honoreeItinerary(prev, mergeListsIn(prev, data), user);
        if (isPlan && op === 'set') { const { _base, ...rest } = data; data = rest; }
        if (isMine && op === 'set' && prev) data = keepManaged(prev, data);
        // decisions that follow from this write (unlocking a removed place, a change of plan kind), checked like any other
        let cleanup: Json | null = null;
        if (isPlan && op !== 'delete') {
          const v = keepDecisionsValid(prev, data, op === 'set' || !prev ? data : merge(prev, data));
          if (v.refuse) throw new StoreError('conflict', v.refuse);
          data = v.data; cleanup = v.cleanup;
        }
        checkWrite(op, path, data, prev, ctx);
        if (cleanup) data = { ...data, ...cleanup };
        // plans: written whole, with the change log kept within its limits (lib/changelog.ts)
        if (isPlan && op !== 'delete' && (op === 'set' || prev)) setDoc(path, boundLog(op === 'set' ? data : merge(prev!, data)), user);
        else if (op === 'set') setDoc(path, data, user);
        else if (op === 'update') updateDoc(path, data, user);
        else deleteDoc(path, user);
        return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ code: 'invalid_argument', message: 'Unknown op' }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof StoreError) return NextResponse.json({ code: e.code, message: e.message }, { status: e.code === 'permission_denied' ? 403 : e.code === 'unavailable' ? 503 : e.code === 'conflict' ? 409 : 400 });
    console.error(e);
    return NextResponse.json({ code: 'unavailable', message: 'Store error' }, { status: 500 });
  }
}

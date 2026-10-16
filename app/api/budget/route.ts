import { NextResponse } from 'next/server';
import { budgetCapOf, budgetCheck, type Check } from '@/lib/budget';
import { inTrip } from '@/lib/access';
import { userOf } from '@/lib/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Budget fit for a plan, without sending anyone's budget (see lib/budget.ts).
export async function POST(req: Request) {
  const user = userOf(req);
  let body: { tid?: string; checks?: Check[] };
  try { body = await req.json(); } catch { return NextResponse.json({ code: 'invalid_argument', message: 'Body must be JSON' }, { status: 400 }); }
  const tid = String(body.tid || '');
  if (!/^[A-Za-z0-9_\-]{4,40}$/.test(tid)) return NextResponse.json({ code: 'invalid_argument', message: 'Bad plan id' }, { status: 400 });
  if (!inTrip(tid, user)) return NextResponse.json({ code: 'permission_denied', message: 'You don’t have access to this.' }, { status: 403 });
  const checks = Array.isArray(body.checks) ? body.checks.slice(0, 40) : [];
  return NextResponse.json({ cap: budgetCapOf(tid, user), results: checks.map(c => budgetCheck(tid, user, c || {})) });
}

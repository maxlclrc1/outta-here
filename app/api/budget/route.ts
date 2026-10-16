import { NextResponse } from 'next/server';
import { budgetBandOf, budgetCheck, normalize, rateCheck, type Check } from '@/lib/budget';
import { inTrip } from '@/lib/access';
import { userOf } from '@/lib/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (code: string, message: string, status: number) => NextResponse.json({ code, message }, { status });

// Budget fit for a plan, without sending or giving away anyone's budget (see lib/budget.ts).
export async function POST(req: Request) {
  const user = userOf(req);
  let body: { tid?: unknown; checks?: unknown };
  try { body = await req.json(); } catch { return fail('invalid_argument', 'Body must be JSON', 400); }
  const tid = typeof body.tid === 'string' ? body.tid : '';
  if (!/^[A-Za-z0-9_\-]{4,40}$/.test(tid)) return fail('invalid_argument', 'Bad plan id', 400);
  if (!inTrip(tid, user)) return fail('permission_denied', 'You don’t have access to this.', 403);
  if (!Array.isArray(body.checks) || body.checks.length > 20) return fail('invalid_argument', 'Send up to 20 checks', 400);
  const checks = body.checks.map(c => normalize(tid, c));
  if (checks.some(c => !c)) return fail('invalid_argument', 'Bad check', 400);
  if (!rateCheck(user, tid, checks as Check[])) return fail('rate_limited', 'Too many budget checks. Try again later.', 429);
  return NextResponse.json({ band: budgetBandOf(tid, user), results: (checks as Check[]).map(c => budgetCheck(tid, user, c)) });
}

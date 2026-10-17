import { NextResponse } from 'next/server';
import { deletePlan } from '@/lib/deletePlan';
import { StoreError } from '@/lib/store';
import { guard, userOf } from '@/lib/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Deletes a whole plan in one step (lib/deletePlan.ts). Safe to repeat: deleting a plan that's
// already gone answers ok with deleted: false.
export async function DELETE(req: Request, { params }: Ctx) {
  const no = guard(req); if (no) return no;
  try {
    return NextResponse.json({ ok: true, ...deletePlan((await params).id, userOf(req)) });
  } catch (e) {
    if (e instanceof StoreError) return NextResponse.json({ code: e.code, message: e.message }, { status: e.code === 'permission_denied' ? 403 : e.code === 'unavailable' ? 503 : 400 });
    console.error('Plan delete failed', e instanceof Error ? e.name : 'error');
    return NextResponse.json({ code: 'unavailable', message: 'Couldn’t delete the plan. Try again.' }, { status: 500 });
  }
}

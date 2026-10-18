import type { Json } from '@/lib/store';

// The plan's who-pays setting, as the server reads it (the app's paysMode/payerId in 05-trip-layout.js).
// 'split' (also any plan without the setting): each person pays their share from their own budget.
// 'one': trip.payer (or the organizer) covers everyone. 'company': a company pays; no personal budgets.
export type Pays = 'split' | 'one' | 'company';
export const paysOf = (t: Json | null | undefined): Pays => (t && (t.pays === 'one' || t.pays === 'company') ? t.pays : 'split');
export const payerOf = (t: Json | null | undefined) => (paysOf(t) === 'one' ? String(t!.payer || t!.createdBy || '') : '');

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : +String(v ?? '') || 0);
// how many people a total is shared over: confirmed, else going, else everyone still in (the app's planHeads).
// Adults only: a family plan's kids (members' `kids`) aren't counted until kids have their own pricing.
export function headsOf(ms: Json[]) {
  const st = (m: Json) => String(m.status || 'maybe');
  const firm = ms.filter(m => ['booked', 'confirmed'].includes(st(m))).length, max = firm + ms.filter(m => st(m) === 'in').length;
  return Math.max(1, firm || max || ms.length);
}
/**
 * A member's budget as the per-person amount the plan's prices are compared with. Saved budgets are
 * never changed; this only decides which count: splitting, everyone's own; one payer, only theirs, a
 * total for the group shared over the headcount; a company, nobody's (0 means "no budget").
 */
export function budgetFor(t: Json | null | undefined, id: string, budget: unknown, ms: Json[]) {
  const p = paysOf(t), b = Math.max(0, num(budget));
  if (p === 'company') return 0;
  if (p === 'one') return id === payerOf(t) ? Math.round(b / headsOf(ms)) : 0;
  return b;
}

import { listCollection, rawDoc, type Json } from '@/lib/store';

// Budget fit, worked out on the server so nobody's budget is sent to anyone else.
// The app asks "does a price of lo–hi fit the crew?" and gets back counts: how many it
// fits, how many it's a stretch for, how many it's over for. People are only named when
// they chose that ("Name me when something is over my budget"), or when it's you.
// It also answers the one aggregate the app already shows everyone: the lowest budget
// set in the crew (the cap the AI plans around).

export type Check = { lo?: number; hi?: number; key?: string; exclude?: string[]; myBudget?: number };
type Group = { count: number; ids: string[] };
export type Result = { n: number; total: number; fits: Group; stretch: Group; over: Group; hard: Group; hardOpen: Group };

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : +String(v ?? '') || 0);
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

function members(tid: string, user: string, c: Check) {
  const skip = new Set(Array.isArray(c.exclude) ? c.exclude.slice(0, 50).map(String) : []);
  return listCollection(`trips/${tid}/members`, user)
    .filter(d => d.data.status !== 'out' && !d.data.removed && !skip.has(d.id))
    .map(d => ({ id: d.id, budget: d.id === user && c.myBudget !== undefined ? Math.max(0, num(c.myBudget)) : Math.max(0, num(d.data.budget)), named: d.id === user || !!d.data.budgetPublic, hard: isObj(d.data.hard) && !!d.data.hard.budget }));
}
const group = (ms: { id: string; named: boolean }[]): Group => ({ count: ms.length, ids: ms.filter(m => m.named).map(m => m.id) });

export function budgetCheck(tid: string, user: string, c: Check): Result {
  const ms = members(tid, user, c), withB = ms.filter(m => m.budget > 0);
  const lo = Math.max(0, num(c.lo)), hi = Math.max(lo, num(c.hi) || lo);
  const consent = isObj(rawDoc('trips/' + tid)?.consent) ? (rawDoc('trips/' + tid)!.consent as Json) : {};
  const agreed = (id: string) => !!c.key && isObj(consent[c.key]) && !!(consent[c.key] as Json)[id];
  const hard = lo ? withB.filter(m => m.hard && lo > m.budget) : [];
  return {
    n: withB.length, total: ms.length,
    fits: group(withB.filter(m => m.budget >= hi)),
    stretch: group(withB.filter(m => m.budget < hi && m.budget >= lo)),
    over: group(withB.filter(m => m.budget < lo)),
    hard: group(hard), hardOpen: group(hard.filter(m => !agreed(m.id))),
  };
}
export function budgetCapOf(tid: string, user: string) {
  const b = members(tid, user, {}).map(m => m.budget).filter(x => x > 0);
  return b.length ? { cap: Math.min(...b), n: b.length } : null;
}

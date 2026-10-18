import { listCollection, rawDoc, type Json } from '@/lib/store';
import { budgetFor } from '@/lib/pays';

// Budget fit, worked out on the server so nobody's budget is sent to anyone else.
// The app asks "does a price of lo–hi fit the crew?" and gets back counts: how many it
// fits, how many it's a stretch for, how many it's over for. People are only named when
// they chose that ("Name me when something is over my budget"), or when it's you.
// It also gives a band for the tightest budget in the crew, which the AI plans around.

export type Check = { lo?: number; hi?: number; pitch?: string; key?: string; exclude?: string[]; myBudget?: number };

// Nobody's exact budget is given out, and prices can't be used to pin one down:
// - The crew-wide figure is a band ("€250–300"), never the lowest budget itself.
// - A check on one of the plan's pitches uses that pitch's real price from the plan.
// - Any other price (all-in totals, what-ifs) is snapped to a ~10% grid first, so
//   asking €412 and €413 gives the same answer.
// - Each person gets a limited number of distinct prices per plan per hour, and a
//   limited number of requests per minute (see rateCheck).
const BAND = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
const FINE = [1, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3, 3.3, 3.6, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 9];
const grid = (steps: number[], v: number) => { if (v <= 0) return [0]; const e = Math.pow(10, Math.floor(Math.log10(v))); return [...steps.map(x => x * e / 10), ...steps.map(x => x * e), ...steps.map(x => x * e * 10)]; };
export function band(v: number) { const g = grid(BAND, v), lo = Math.max(...g.filter(x => x <= v)), hi = Math.min(...g.filter(x => x > v)); return { lo: Math.round(lo), hi: Math.round(hi) }; }
export function snap(v: number) { if (v <= 0) return 0; const g = grid(FINE, v); return Math.round(g.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a)); }
// "€650–800" → [650, 800], the same way the app reads pitch prices
function priceRange(s: unknown): [number, number] | null {
  const n = String(s ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/g); if (!n) return null;
  const v = n.map(Number).filter(x => x > 0).slice(0, 2); return v.length ? [Math.min(...v), Math.max(...v)] : null;
}
export function pitchRange(tid: string, id: string): [number, number] | null {
  const items = (rawDoc('trips/' + tid)?.pitches as Json | undefined)?.items;
  const p = Array.isArray(items) ? (items as Json[]).find(x => isObj(x) && x.id === id) : null;
  return p ? priceRange(p.perPerson) : null;
}
// what a check actually compares against, and whether it's a valid request at all
const ID = /^[A-Za-z0-9_\-]{1,64}$/, KEY = /^[a-z]:[A-Za-z0-9_|\-]{1,60}$/;
export function normalize(tid: string, c: unknown): Check | null {
  if (!isObj(c)) return null;
  const n = (v: unknown) => v === undefined ? 0 : typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1e7 ? v : NaN;
  const out: Check = {};
  if (c.key !== undefined) { if (typeof c.key !== 'string' || !KEY.test(c.key)) return null; out.key = c.key; }
  if (c.exclude !== undefined) { if (!Array.isArray(c.exclude) || c.exclude.length > 1 || !c.exclude.every(x => typeof x === 'string' && ID.test(x))) return null; out.exclude = c.exclude as string[]; }
  if (c.myBudget !== undefined) { const b = n(c.myBudget); if (isNaN(b)) return null; out.myBudget = Math.round(b); }
  if (c.pitch !== undefined) {
    if (typeof c.pitch !== 'string' || !ID.test(c.pitch)) return null;
    const r = pitchRange(tid, c.pitch); out.pitch = c.pitch; out.lo = r ? r[0] : 0; out.hi = r ? r[1] : 0;
    return out;
  }
  let lo = n(c.lo), hi = n(c.hi); if (isNaN(lo) || isNaN(hi)) return null;
  if (hi && hi < lo) [lo, hi] = [hi, lo];
  out.lo = snap(lo); out.hi = hi ? snap(hi) : 0;
  return out;
}
const RL = new Map<string, { t0: number; points: Set<string>; reqs: number[] }>();
export const LIMITS = { pointsPerHour: 40, requestsPerMinute: 40 };
/** Counts this request against the person's limits; returns false if it's over. */
export function rateCheck(user: string, tid: string, checks: Check[]) {
  const k = user + '|' + tid, now = Date.now();
  let r = RL.get(k); if (!r || now - r.t0 > 36e5) { r = { t0: now, points: new Set(), reqs: [] }; RL.set(k, r); }
  r.reqs = r.reqs.filter(t => now - t < 6e4);
  if (r.reqs.length >= LIMITS.requestsPerMinute) return false;
  const fresh = checks.map(c => `${c.lo}|${c.hi}|${(c.exclude || []).join()}|${c.myBudget ?? ''}`).filter(p => !r!.points.has(p));
  if (r.points.size + new Set(fresh).size > LIMITS.pointsPerHour) return false;
  r.reqs.push(now); fresh.forEach(p => r!.points.add(p));
  if (RL.size > 5000) for (const [kk, v] of RL) if (now - v.t0 > 36e5) RL.delete(kk);
  return true;
}
type Group = { count: number; ids: string[] };
export type Result = { n: number; total: number; fits: Group; stretch: Group; over: Group; hard: Group; hardOpen: Group };

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : +String(v ?? '') || 0);
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

// Budgets follow the plan's who-pays setting (lib/pays.ts): only the ones that count, as per-person amounts.
function members(tid: string, user: string, c: Check) {
  const skip = new Set(Array.isArray(c.exclude) ? c.exclude.slice(0, 50).map(String) : []), t = rawDoc('trips/' + tid);
  const ms = listCollection(`trips/${tid}/members`, user).filter(d => d.data.status !== 'out' && !d.data.removed && !skip.has(d.id));
  const all = ms.map(d => ({ id: d.id, ...d.data }) as Json);
  return ms.map(d => ({ id: d.id, budget: budgetFor(t, d.id, d.id === user && c.myBudget !== undefined ? c.myBudget : d.data.budget, all), named: d.id === user || !!d.data.budgetPublic, hard: isObj(d.data.hard) && !!d.data.hard.budget }));
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
/** The crew-wide figure: a band the lowest budget falls in, and how many budgets are set. */
export function budgetBandOf(tid: string, user: string) {
  const b = members(tid, user, {}).map(m => m.budget).filter(x => x > 0);
  return b.length ? { ...band(Math.min(...b)), n: b.length } : null;
}

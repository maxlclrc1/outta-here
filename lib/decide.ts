import { StoreError, listCollection, type Json } from '@/lib/store';
import { budgetFor } from '@/lib/pays';

// The plan's decision rules, checked on the server for every write that locks or unlocks
// something. They mirror what the app shows next to the votes (src/app/05j-decide.js):
// - "Who can lock decisions: Organizers only" (perm.lock = 'org'): only organizers lock or
//   unlock where, when and the stay.
// - The decision style (decide.style): "Everyone gets a say" (nothing locks while someone
//   passed on it, or for dates, can't make them), "Majority rules" (enough yes votes), or
//   "Just pick something" (after the deadline, organizers only). A final-vote winner can
//   always be locked.
// - Hard limits, in every style: nothing locks over someone's hard budget limit or firm
//   free days unless that person agreed to that option (consent).
// - Votes and consent are personal: you can only write your own.

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const deny = (msg: string) => new StoreError('permission_denied', msg);
const isOrg = (t: Json, user: string) => t.createdBy === user || (isObj(t.orgs) && !!t.orgs[user]);
const num = (v: unknown) => +String(v ?? 0) || 0;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function span(a: string, b: string) {
  const out: string[] = []; const d = new Date(a + 'T00:00:00Z'), end = new Date(b + 'T00:00:00Z');
  while (d <= end && out.length < 92) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
// can this member make these days (allowing a day late/early if they said they're flexible)?
function fits(m: Json, days: string[]) {
  const has = new Set(Array.isArray(m.days) ? m.days as string[] : []), f = isObj(m.flex) ? m.flex : {};
  if (days.every(x => has.has(x))) return true;
  if (days.length > 1 && f.late && !has.has(days[0]) && days.slice(1).every(x => has.has(x))) return true;
  if (days.length > 1 && f.early && !has.has(days[days.length - 1]) && days.slice(0, -1).every(x => has.has(x))) return true;
  return false;
}
const priceLo = (s: unknown) => { const n = String(s ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/g); const v = (n || []).map(Number).filter(x => x > 0).slice(0, 2); return v.length ? Math.min(...v) : 0; };

type Opt = { kind: 'pitch' | 'dates' | 'dest'; key: string; yes: string[]; no: string[]; winner?: boolean; lo: number; days: string[] | null };

function swipeOf(t: Json, pid: string, uid: string) { const s = isObj(t.swipes) && isObj(t.swipes[pid]) ? (t.swipes[pid] as Json)[uid] : 0; return num(s); }
function runoffWinner(t: Json, active: Json[]) {
  const r = isObj(t.runoff) ? t.runoff : null; if (!r || !r.key) return null;
  const items = (isObj(t.pitches) && Array.isArray(t.pitches.items) ? t.pitches.items : []) as Json[];
  const ps = (Array.isArray(r.ids) ? r.ids : []).map(id => items.find(x => x.id === id)).filter(Boolean) as Json[];
  if (ps.length < 2) return null;
  const votes = (isObj(t.roVotes) && isObj(t.roVotes[r.key as string]) ? t.roVotes[r.key as string] : {}) as Json;
  const count = (id: unknown) => active.filter(m => votes[m.id as string] === id).length, waiting = active.filter(m => !votes[m.id as string]);
  const score = (p: Json) => active.reduce((n, m) => { const s = swipeOf(t, p.id as string, m.id as string); return n + (s === 1 ? 2 : s === 0.5 ? 1 : 0); }, 0);
  const ranked = [...ps].sort((a, b) => count(b.id) - count(a.id) || score(b) - score(a) || num(b.vibeMatch) - num(a.vibeMatch));
  return !waiting.length || count(ranked[0].id) > active.length / 2 ? ranked[0].id : null;
}

// which option a write is locking, worked out from what it sets
function optionOf(t: Json, next: Json, active: Json[]): Opt[] {
  const out: Opt[] = [], dests = (Array.isArray(next.destinations) ? next.destinations : []) as Json[];
  const destChanged = 'lockedDest' in next && next.lockedDest && !same(next.lockedDest, t.lockedDest);
  const datesChanged = 'lockedDates' in next && isObj(next.lockedDates) && !same(next.lockedDates, t.lockedDates);
  const L = isObj(next.lockedDates) ? next.lockedDates : null, d = dests.find(x => x.id === next.lockedDest);
  const items = (isObj(next.pitches) && Array.isArray(next.pitches.items) ? next.pitches.items : []) as Json[];
  // a Trip Match pitch locks its place and its dates: both at once, or just the place when the plan's
  // dates were locked first (then the pitch must be for those same dates)
  const p = destChanged && d && L ? items.find(x => String(x.small ? x.title : x.city || '').toLowerCase() === String(d.city || '').toLowerCase() && x.start === L.start && (x.end || x.start) === L.end) : null;
  if (p) {
    const id = p.id as string;
    out.push({ kind: 'pitch', key: 'p:' + id, yes: active.filter(m => swipeOf(next, id, m.id as string) === 1).map(m => m.id as string), no: active.filter(m => swipeOf(next, id, m.id as string) === -1).map(m => m.id as string), winner: runoffWinner(next, active) === id, lo: priceLo(p.perPerson), days: span(L!.start as string, L!.end as string) });
    return out;
  }
  if (destChanged) out.push({ kind: 'dest', key: 'x:' + next.lockedDest, yes: active.filter(m => Array.isArray(m.votes) && m.votes.includes(next.lockedDest)).map(m => m.id as string), no: [], lo: 0, days: null });
  if (datesChanged) {
    const days = span(L!.start as string, L!.end as string), picked = active.filter(m => Array.isArray(m.days) && m.days.length);
    out.push({ kind: 'dates', key: `d:${L!.start}|${L!.end}`, yes: picked.filter(m => fits(m, days)).map(m => m.id as string), no: picked.filter(m => !fits(m, days)).map(m => m.id as string), lo: 0, days });
  }
  return out;
}

/** Throws if this change to a plan (stored `t`, merged result `next`) breaks its decision rules. */
export function checkDecision(tid: string, t: Json, patch: Json, next: Json, user: string) {
  const org = isOrg(t, user);
  // votes and consent are your own
  const onlyMine = (o: unknown) => !isObj(o) || Object.values(o).every(v => !isObj(v) || Object.keys(v).every(k => k === user));
  if (!onlyMine(patch.consent)) throw deny('You can only agree to an option for yourself.');
  if (!onlyMine(patch.swipes) || !onlyMine(patch.roVotes)) throw deny('You can only vote for yourself.');

  const destMoved = 'lockedDest' in patch && !same(patch.lockedDest, t.lockedDest);
  const datesMoved = 'lockedDates' in patch && !same(patch.lockedDates, t.lockedDates);
  const stayMoved = 'stay' in patch && (patch.stay === null ? !!t.stay : isObj(patch.stay) && 'name' in patch.stay && !(isObj(t.stay) && t.stay.name === patch.stay.name));
  if (!destMoved && !datesMoved && !stayMoved) return;
  if (isObj(t.perm) && t.perm.lock === 'org' && !org) throw deny('Only organizers can lock or change decisions in this plan. Your vote still counts.');

  const active = listCollection(`trips/${tid}/members`, user).map(d => ({ id: d.id, ...d.data }) as Json).filter(m => m.status !== 'out' && !m.removed);
  const rules = { style: 'all', pct: 50, by: '', ...(isObj(next.decide) ? next.decide : {}) } as Json;
  const consent = isObj(next.consent) ? next.consent : {};
  for (const o of optionOf(t, next, active)) {
    if (!o.winner) {
      const n = active.length;
      if (rules.style === 'majority') {
        const need = Math.max(1, Math.ceil(n * num(rules.pct) / 100 - 1e-9));
        if (o.yes.length < need) throw deny(`Majority rules: this needs ${need} yes, it has ${o.yes.length}.`);
      } else if (rules.style === 'pick' && (!rules.by || today() > String(rules.by))) {
        if (!org) throw deny(`${rules.by ? 'Voting has closed. ' : ''}An organizer makes the pick now.`);
      } else if (o.no.length) throw deny(o.kind === 'dates' ? 'Everyone gets a say here, and someone can’t make these dates. Try a final vote or other dates.' : 'Everyone gets a say here, and someone passed on this. Try a final vote or another option.');
    }
    // hard limits, whatever the style, unless that person agreed to this option
    const agreed = (id: string) => isObj(consent[o.key]) && !!(consent[o.key] as Json)[id];
    const hit = active.some(m => {
      if (agreed(m.id as string)) return false;
      const h = isObj(m.hard) ? m.hard : {};
      if (h.days && o.days && Array.isArray(m.days) && m.days.length && !fits(m, o.days)) return true;
      // a budget limit counts only where that budget does (see lib/pays.ts): one payer's total per person, no company limits
      const b = budgetFor(next, String(m.id), m.budget, active);
      return !!(h.budget && o.lo && b > 0 && o.lo > b);
    });
    if (hit) throw deny('This is over someone’s hard limit. They have to agree to it first.');
  }
}

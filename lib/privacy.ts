import { listCollection, rawDoc, type Json } from '@/lib/store';

// Things in a plan that some members chose to keep from others. The server removes them
// before anything is sent, so they never reach a browser that isn't meant to see them:
// - Personal needs a member shared with "Only organizers": other non-organizers don't get
//   those sections. (The AI still plans around them: /api/ai adds them, unnamed.)
// - Check-ins from someone who chose "Hide where I check in": others get when, not where.
//   An SOS ("I'm lost") is the exception and is always shared, as the app promises.
// - Surprise itinerary stops: the guest of honor gets a placeholder at that time instead,
//   until a planner reveals it. Change-log entries about a surprise are left out for them.
// - "Planners only" chat posts: never sent to the guest of honor.

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const isOrg = (t: Json, user: string) => t.createdBy === user || (isObj(t.orgs) && !!t.orgs[user]);
export const isHonoree = (t: Json | null, user: string) => !!t && !!t.honoree && t.honoree === user;

const NEED_FIELDS: Record<string, string[]> = {
  diet: ['diet', 'dietNote'],
  access: ['access', 'accessNote'],
  travel: ['depart', 'arrive', 'maxTravel', 'noRedeye', 'noFly'],
};
const orgOnlySections = (needs: Json) => Object.keys(NEED_FIELDS).filter(sec => isObj(needs.share) && needs.share[sec] === 'org');

/** Another member's record, as this person may see it. */
export function memberFor(t: Json, owner: string, data: Json, user: string): Json {
  if (owner === user) return data;
  const out: Json = { ...data };
  if (isObj(data.needs) && !isOrg(t, user)) {
    const hide = orgOnlySections(data.needs);
    if (hide.length) { const n: Json = { ...data.needs }; for (const sec of hide) for (const f of NEED_FIELDS[sec]) delete n[f]; out.needs = n; }
  }
  if (data.hideLoc) {
    const when = (c: unknown) => (isObj(c) ? { at: c.at } : c);
    if (isObj(data.checkin)) out.checkin = when(data.checkin);
    if (Array.isArray(data.checkins)) out.checkins = data.checkins.map(when);
  }
  return out;
}

const placeholder = (i: Json): Json => ({ id: i.id, date: i.date, time: i.time, secret: true, title: 'Surprise', note: '', kind: 'surprise' });
const hiddenItem = (i: unknown): i is Json => isObj(i) && !!i.secret && !i.revealed;

/** The plan document, as this person may see it. */
export function tripFor(t: Json, user: string): Json {
  if (!isHonoree(t, user)) return t;
  const out: Json = { ...t };
  const items = Array.isArray(t.itinerary) ? t.itinerary : [];
  const secretIds = new Set(items.filter(hiddenItem).map(i => (i as Json).id));
  out.itinerary = items.map(i => (hiddenItem(i) ? placeholder(i) : i));
  if (isObj(t.changes)) {
    const changes: Json = {};
    for (const [id, x] of Object.entries(t.changes)) {
      if (!isObj(x)) { changes[id] = x; continue; }
      const u = isObj(x.undo) ? x.undo : null;
      if (u && isObj(u.item) && (u.item.secret || secretIds.has(u.item.id))) continue; // about a surprise
      if (u && isObj(u.patch) && Array.isArray(u.patch.itinerary)) changes[id] = { ...x, undo: { ...u, patch: { ...u.patch, itinerary: u.patch.itinerary.map(i => (hiddenItem(i) ? placeholder(i) : i)) } } };
      else changes[id] = x;
    }
    out.changes = changes;
  }
  return out;
}

/** A chat post, or nothing if it's for planners only and this is the guest of honor. */
export function feedFor(t: Json | null, data: Json, user: string): Json | null {
  return data.secret && isHonoree(t, user) ? null : data;
}

/**
 * The guest of honor only ever has placeholders for surprises, so when they save the
 * itinerary the real surprise stops are put back (and can't be removed by them).
 */
export function honoreeItinerary(prev: Json, patch: Json, user: string): Json {
  if (!isHonoree(prev, user) || !Array.isArray(patch.itinerary)) return patch;
  const stored = (Array.isArray(prev.itinerary) ? prev.itinerary : []).filter(hiddenItem) as Json[];
  const byId = new Map(stored.map(i => [i.id, i]));
  const kept = patch.itinerary.map(i => (isObj(i) && byId.has(i.id) ? byId.get(i.id) : i));
  const missing = stored.filter(i => !kept.some(k => isObj(k) && k.id === i.id));
  return { ...patch, itinerary: [...kept, ...missing] };
}

/** Needs other members shared only with organizers, unnamed, for this person's AI requests. */
export function hiddenNeedsText(tid: string, user: string) {
  const t = rawDoc('trips/' + tid); if (!t || isOrg(t, user)) return '';
  const lines: string[] = [];
  for (const d of listCollection(`trips/${tid}/members`, user)) {
    const m = d.data, needs = isObj(m.needs) ? m.needs : null;
    if (d.id === user || !needs || m.status === 'out' || m.removed) continue;
    for (const sec of orgOnlySections(needs)) {
      const set = NEED_FIELDS[sec].filter(f => { const v = needs[f]; return v !== undefined && v !== '' && v !== false && v !== 0 && !(Array.isArray(v) && !v.length); });
      if (set.length) lines.push(`- ${sec}: ${set.map(f => `${f} ${Array.isArray(needs[f]) ? (needs[f] as unknown[]).join(', ') : String(needs[f])}`).join('; ')}`);
    }
  }
  return lines.length ? `More needs in the group, shared only with the organizers (plan around them, never mention or hint at who has them):\n${lines.join('\n')}` : '';
}

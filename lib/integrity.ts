// Rules that keep a plan's saved data consistent with itself. No imports (plain data in, plain data
// out), so they can be checked on their own (tests/plan-integrity.mjs).
type Json = { [k: string]: any };
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

// Free days are picked as date ranges, up to four per person (src/app/02-setup-invites.js). They're
// stored as the plain list of dates, so a range is a run of back-to-back days: ranges that overlap or
// touch are one range.
export const RANGE_MAX = 4;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function rangeCount(days: unknown): number {
  const ds = [...new Set(Array.isArray(days) ? days.filter(d => typeof d === 'string' && DAY.test(d)) : [])].sort();
  let n = 0;
  ds.forEach((d, i) => { if (!i || Date.parse(ds[i - 1] + 'T00:00:00Z') + 864e5 !== Date.parse(d + 'T00:00:00Z')) n++; });
  return n;
}
/** Why this list of free days can't be saved over the one before, or '' if it can. A record saved
 * before the limit with more ranges stays as it is and can still be edited, as long as the change
 * doesn't add a range. */
export function rangeLimitError(next: unknown, prev: unknown): string {
  const n = rangeCount(next);
  return n > RANGE_MAX && n > rangeCount(prev) ? `You can add up to ${RANGE_MAX} date ranges. This has ${n}: change or remove one first.` : '';
}

// Keeping a plan's decisions pointing at things that exist (called for every plan write, app/api/db).
// Returns the write with any decision that follows from it added (so it goes through the same
// permission and lock rules as an explicit change), plus a cleanup for an older plan that already
// holds a broken reference (applied after the write is allowed: it isn't anyone's decision, so it
// never needs an organizer).
// - A locked place has to be one of the plan's ideas: locking one that isn't is refused, and a
//   write that removes the locked idea unlocks it (the plan goes back to choosing; nothing else
//   gets locked in its place).
// - Pitches are made for one kind of plan: a dinner or day out (small, with a time and a place) or a
//   weekend or trip (a city, flights, a stay). Changing between the two clears the pitches and the
//   final vote, unlocks the place and the dates, and, for a plan that's no longer small, its meeting
//   time and venue. Ideas and votes stay; changes within a kind (weekend to trip) keep everything.
const SMALL = ['hangout', 'day'];
const isSmall = (s: unknown) => SMALL.includes(String(s || 'trip'));
const lockGone = (t: Json) => !!t.lockedDest && !(Array.isArray(t.destinations) && (t.destinations as Json[]).some(d => isObj(d) && d.id === t.lockedDest));
export function keepDecisionsValid(prev: Json | null, data: Json, next: Json): { data: Json; cleanup: Json | null; refuse?: string } {
  const out: Json = { ...data };
  if ('size' in data && prev && isSmall(data.size) !== isSmall(prev.size)) {
    for (const k of ['pitches', 'runoff', 'lockedDest', 'lockedDates']) if (!(k in data) && prev[k] != null) out[k] = null;
    if (!isSmall(data.size)) for (const k of ['time', 'venue']) if (!(k in data) && prev[k]) out[k] = '';
  }
  const after = { ...next, ...out };
  if ('lockedDest' in data && data.lockedDest && lockGone(after)) return { data, cleanup: null, refuse: 'That place isn’t one of the ideas anymore. Pick another one.' };
  if (after.lockedDest && lockGone(after)) {
    if (prev && lockGone(prev) && prev.lockedDest === after.lockedDest) return { data: out, cleanup: { lockedDest: null } };
    out.lockedDest = null;
  }
  return { data: out, cleanup: null };
}

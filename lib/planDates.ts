import { StoreError, type Json } from '@/lib/store';

// The plan's own dates, checked whenever a plan is written: the window people pick days in
// (winStart, winEnd), the RSVP deadline (rsvpBy), the voting deadline (decide.by), the locked
// dates (lockedDates: null, or { start, end }, both required, end on or after start; one-day
// plans use the same day twice) and each pitch's dates (pitches.items[i].start / .end:
// optional, since pitches can be saved without dates, but real dates when present).
// Each must be a real calendar day written YYYY-MM-DD. The deadlines are optional: null or ''
// clears them. Only the fields being written are checked, so a plan that already holds a bad
// value can still be saved (the app ignores bad stored dates when it shows them).

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; // rejects 2026-02-30, 2026-13-01
}
const bad = (field: string, v: unknown, optional: boolean) =>
  new StoreError('invalid_argument', `${field} must be a date like 2026-11-20${optional ? ', or empty to clear it' : ''}. Got ${v === undefined ? 'nothing' : String(JSON.stringify(v)).slice(0, 40)}.`);

/** Throws a 400-style error if this plan write sets any of its dates to something that isn't a date. */
export function checkPlanDates(data: Json) {
  for (const k of ['winStart', 'winEnd']) if (k in data && data[k] !== null && !isDay(data[k])) throw bad(k, data[k], false);
  if ('rsvpBy' in data && data.rsvpBy !== null && data.rsvpBy !== '' && !isDay(data.rsvpBy)) throw bad('rsvpBy', data.rsvpBy, true);
  if ('decide' in data && data.decide !== null && !isObj(data.decide)) throw new StoreError('invalid_argument', 'decide must be an object.');
  if (isObj(data.decide) && 'by' in data.decide && data.decide.by !== null && data.decide.by !== '' && !isDay(data.decide.by)) throw bad('decide.by', data.decide.by, true);
  if ('lockedDates' in data && data.lockedDates !== null) {
    const L = data.lockedDates;
    if (!isObj(L)) throw new StoreError('invalid_argument', 'lockedDates must be { start, end } or null to unlock.');
    const extra = Object.keys(L).filter(k => k !== 'start' && k !== 'end');
    if (extra.length) throw new StoreError('invalid_argument', `lockedDates only takes start and end (got ${extra.slice(0, 3).join(', ')}).`);
    for (const k of ['start', 'end']) if (!isDay(L[k])) throw bad('lockedDates.' + k, L[k], false);
    if ((L.end as string) < (L.start as string)) throw new StoreError('invalid_argument', 'lockedDates.end must be on or after lockedDates.start.');
  }
  const items = isObj(data.pitches) && Array.isArray(data.pitches.items) ? data.pitches.items : [];
  items.forEach((x, i) => {
    if (!isObj(x)) return;
    for (const k of ['start', 'end']) if (k in x && x[k] != null && !isDay(x[k])) throw bad(`pitches.items[${i}].${k}`, x[k], false);
    if (isDay(x.start) && isDay(x.end) && x.end < x.start) throw new StoreError('invalid_argument', `pitches.items[${i}].end must be on or after its start.`);
  });
  if (isDay(data.winStart) && isDay(data.winEnd) && data.winEnd < data.winStart) throw new StoreError('invalid_argument', 'winEnd must be on or after winStart.');
}

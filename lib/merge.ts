import type { Json } from '@/lib/store';

// Keeping people's edits when two of them save at the same time.
//
// Lists (the itinerary, the destinations, the pitches) are saved whole. The app now says
// which items it started from (`_base.<list>.ids`) and which ones it changed or added
// (`_base.<list>.changed`). With that, the server can merge instead of replace:
// - items you changed or added: yours
// - items you didn't touch: whatever is stored now (so you don't undo someone's newer edit)
// - items you removed (in what you started from, not in what you sent): removed
// - items someone else added since you loaded the plan: kept, after yours
// A list sent without `_base` is replaced as before (organizers creating a plan, older tabs).

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const LISTS: string[][] = [['itinerary'], ['destinations'], ['pitches', 'items']];
const get = (o: unknown, path: string[]) => path.reduce<unknown>((x, k) => (isObj(x) ? x[k] : undefined), o);

function mergeList(stored: unknown[], sent: unknown[], base: { ids?: unknown; changed?: unknown }) {
  const baseIds = new Set(Array.isArray(base.ids) ? base.ids.map(String) : []);
  const changed = new Set(Array.isArray(base.changed) ? base.changed.map(String) : []);
  const now = new Map(stored.filter(isObj).filter(i => i.id != null).map(i => [String(i.id), i]));
  const out: unknown[] = [], seen = new Set<string>();
  for (const item of sent) {
    const id = isObj(item) && item.id != null ? String(item.id) : null;
    if (!id) { out.push(item); continue; }
    seen.add(id);
    if (changed.has(id) || !baseIds.has(id)) out.push(item); // yours: changed or new
    else if (now.has(id)) out.push(now.get(id)); // untouched by you: keep the latest
    // untouched by you and since removed by someone else: stays removed
  }
  for (const [id, item] of now) if (!seen.has(id) && !baseIds.has(id)) out.push(item); // added by someone else meanwhile
  return out;
}

/** A plan update with any whole lists merged against what's stored; `_base` is removed. */
export function mergeListsIn(prev: Json, patch: Json): Json {
  if (!isObj(patch._base)) return patch;
  const base = patch._base as Json, out: Json = { ...patch };
  delete out._base;
  for (const path of LISTS) {
    const key = path.join('.'), sent = get(out, path), b = base[key];
    if (!Array.isArray(sent) || !isObj(b)) continue;
    const stored = get(prev, path), merged = mergeList(Array.isArray(stored) ? stored : [], sent, b);
    if (path.length === 1) out[path[0]] = merged;
    else out[path[0]] = { ...(out[path[0]] as Json), [path[1]]: merged };
  }
  return out;
}

// Fields on a member's record that others manage: whether they're in, and if an organizer
// counted them out or removed them. Saving your record as a whole can't change these;
// you change your own status with an explicit update (the app's "I'm in" / "Can't make it").
const MANAGED = ['status', 'countedOut', 'droppedAt', 'removed'];
/** A member replacing their own existing record keeps the managed fields as stored. */
export function keepManaged(prev: Json, data: Json): Json {
  const out: Json = { ...data };
  for (const k of MANAGED) { if (k in prev) out[k] = prev[k]; else delete out[k]; }
  return out;
}

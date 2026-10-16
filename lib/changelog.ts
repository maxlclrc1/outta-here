import type { Json } from '@/lib/store';

// Keeping a plan's change log (`changes`) from growing until the plan can't be saved.
// Applied to the whole plan right before it's written, so it also shrinks older plans the
// next time anyone saves them. In order, until the log fits its budget:
//  1. Entries with nothing left to show are dropped (no text), and undone entries lose
//     their undo copy (it can't be used again).
//  2. Only the newest MAX_ENTRIES entries are kept.
//  3. Older entries lose their undo copy, oldest first. The newest KEEP_UNDO entries that
//     can be undone are never touched, so recent Undo / Restore keeps working.
//  4. If it's still over budget, the oldest of the rest are dropped.
// Nothing outside the log is ever removed. If the plan is still too big after this, the
// save is refused with a clear message (see setDoc in lib/store.ts) rather than losing data.

export const LOG_LIMITS = { maxEntries: 100, maxBytes: 64 * 1024, keepUndo: 10 };
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const at = (x: Json) => (typeof x.at === 'number' ? x.at : +String(x.at ?? 0) || 0);
const bytes = (v: unknown) => JSON.stringify(v ?? null).length;

export function boundLog(doc: Json, limits = LOG_LIMITS): Json {
  if (!isObj(doc.changes)) return doc;
  // newest first; drop leftovers without text (e.g. a "seen" mark on an entry already trimmed)
  let list = Object.entries(doc.changes)
    .filter((e): e is [string, Json] => isObj(e[1]) && typeof e[1].text === 'string')
    .map(([id, x]): [string, Json] => [id, x.undone && 'undo' in x ? withoutUndo(x) : x])
    .sort((a, b) => at(b[1]) - at(a[1]))
    .slice(0, limits.maxEntries);
  const keep = new Set(list.filter(([, x]) => x.undo && !x.undone).slice(0, limits.keepUndo).map(([id]) => id));
  let size = bytes(Object.fromEntries(list));
  for (let i = list.length - 1; i >= 0 && size > limits.maxBytes; i--) {
    const [id, x] = list[i];
    if (keep.has(id) || !('undo' in x)) continue;
    const slim = withoutUndo(x); size -= bytes(x) - bytes(slim); list[i] = [id, slim];
  }
  for (let i = list.length - 1; i >= 0 && size > limits.maxBytes; i--) {
    if (keep.has(list[i][0])) continue;
    size -= bytes(list[i][1]) + list[i][0].length + 4; list = [...list.slice(0, i), ...list.slice(i + 1)];
  }
  return { ...doc, changes: Object.fromEntries(list) };
}
function withoutUndo(x: Json): Json { const { undo: _u, ...rest } = x; return rest; }

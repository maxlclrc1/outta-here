// Small in-memory limits for expensive or abusable routes (AI, uploads). They reset when the
// server restarts, and they key on the browser-supplied id, so they slow down mistakes and
// casual abuse, not a determined attacker who switches ids.
const hits = new Map<string, number[]>(), running = new Map<string, number>();

/** Records one use of `key` if fewer than `max` happened in the last `ms`; false if over. */
export function allow(key: string, max: number, ms: number) {
  const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < ms);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now); hits.set(key, list);
  if (hits.size > 10000) for (const [k, v] of hits) if (!v.some(t => now - t < 36e5)) hits.delete(k);
  return true;
}
/** Seconds until `key` gets a free slot again (for Retry-After). */
export function retryAfter(key: string, ms: number) {
  const list = hits.get(key) || []; return list.length ? Math.max(1, Math.ceil((list[0] + ms - Date.now()) / 1000)) : 1;
}
/** At most `max` at once for `key`; call the returned function when done. Null if over. */
export function enter(key: string, max: number): (() => void) | null {
  const n = running.get(key) || 0; if (n >= max) return null;
  running.set(key, n + 1); let done = false;
  return () => { if (done) return; done = true; const m = (running.get(key) || 1) - 1; if (m > 0) running.set(key, m); else running.delete(key); };
}

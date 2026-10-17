// Test helper: lets a test script act as the people it plays, the way their browsers would.
// The server only accepts an id with the cookie it gave that id's browser (lib/identity.ts).
// Test scripts make up their people, so this claims each id the first time it's used, before it
// appears in any data, as a real new browser does. For ids that belong to a Playwright browser
// in the test, it uses that browser's cookie. tests/identity.mjs doesn't use this: it checks what
// happens without the right cookie.
const BASE = process.env.BASE || 'http://localhost:3000';
const raw = globalThis.fetch.bind(globalThis);
const jar = new Map(), contexts = [];
const ID = /^[A-Za-z0-9_\-]{4,64}$/;

async function claimOne(id) {
  if (jar.has(id) || !ID.test(id)) return;
  for (const c of contexts) { const k = (await c.cookies().catch(() => [])).find(x => x.name === 'outta_' + id); if (k) { jar.set(id, k.value); return; } }
  const r = await raw(BASE + '/api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
  const m = (r.headers.get('set-cookie') || '').match(/^outta_[^=]+=([^;]+)/);
  if (r.ok && m) jar.set(id, m[1]);
}
/** Claim these ids now (for people who show up in data before they do anything themselves). */
export async function claim(...ids) { for (const id of ids) await claimOne(id); }
/** The cookie header that proves this id, if the test owns it. */
export const cookieFor = id => (jar.has(id) ? `outta_${id}=${jar.get(id)}` : '');
/** Use the cookies of browsers this test opens, for ids those browsers own. */
export function trackBrowser(b) { const orig = b.newContext.bind(b); b.newContext = async (...a) => { const c = await orig(...a); contexts.push(c); return c; }; return b; }

/** Make every request to the app carry the cookie for the id it says it is. */
export function install() {
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url instanceof Request ? url.url : url);
    if (!u.startsWith(BASE) || u.startsWith(BASE + '/api/me')) return raw(url, opts);
    const headers = { ...(opts.headers || {}) }, who = headers['x-outta-user'] || new URL(u).searchParams.get('u');
    // people a request mentions are claimed first, as their own browsers would have been
    if (typeof opts.body === 'string') for (const [, id] of opts.body.matchAll(/"(u_[A-Za-z0-9_\-]{2,62})"/g)) await claimOne(id);
    if (who) { await claimOne(who); const c = cookieFor(who); if (c) headers.cookie = headers.cookie ? headers.cookie + '; ' + c : c; }
    return raw(url, { ...opts, headers });
  };
}

// Part of npm test / npm run test:server (runs against a throwaway server; needs OUTTA_TEST_DATA).
// The identity mechanism itself (lib/identity.ts, app/api/me/route.ts, scripts/claim-link.mjs):
// the cookie, what is stored, which claims are accepted, sign-in links, and recovering an id.
// Checks status codes, error codes, cookie attributes and stored state, not message wording.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = process.env.BASE || 'http://localhost:3000', DATA = process.env.OUTTA_TEST_DATA, ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!DATA) { console.log('FAIL needs OUTTA_TEST_DATA (run through npm test)'); process.exit(1); }
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const sha = s => createHash('sha256').update(s).digest('hex');
const keys = () => { try { return JSON.parse(readFileSync(join(DATA, 'keys.json'), 'utf8')); } catch { return {}; } };
const r = Math.random().toString(36).slice(2, 8), A = 'u_ana00' + r, L = 'u_old00' + r, T = 'idc' + r;
const secrets = []; // every secret seen, to check none of them leak anywhere
const me = async (body, headers = {}, type = 'application/json') => {
  const res = await fetch(BASE + '/api/me', { method: 'POST', headers: { 'content-type': type, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const set = res.headers.get('set-cookie') || '', secret = (set.match(/^outta_[^=]+=([^;]+)/) || [])[1] || '', text = await res.text();
  if (secret) secrets.push(secret);
  let json = {}; try { json = JSON.parse(text); } catch {}
  return { status: res.status, set, secret, text, json, headers: [...res.headers].filter(([k]) => k !== 'set-cookie').map(x => x.join(':')).join('\n') };
};
const ck = (id, s) => `outta_${id}=${s}`;
const db = (id, cookie, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': id, ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ op, path, data }) }).then(async x => ({ status: x.status, ...(await x.json()) }));
const canWrite = (id, secret) => db(id, ck(id, secret), 'set', `data/users/${id}/probe`, { at: Date.now() }).then(x => x.ok === true);
const owned = cookie => fetch(BASE + '/api/me', { headers: cookie ? { cookie } : {} }).then(x => x.json()).then(j => j.ids || []);
const link = id => { const x = spawnSync(process.execPath, [join(ROOT, 'scripts/claim-link.mjs'), id], { env: { ...process.env, OUTTA_DATA_DIR: DATA }, encoding: 'utf8' }); return ((x.stdout || '').match(/#claim=([A-Za-z0-9_\-]+)/) || [])[1] || ''; };

// 1. the cookie
const a = await me({ id: A });
check('a new id is claimed (200, with a secret)', a.status === 200 && a.json.id === A && a.secret.length >= 40);
check('the cookie is HttpOnly and SameSite=Strict, for the whole app', /;\s*HttpOnly/i.test(a.set) && /;\s*SameSite=Strict/i.test(a.set) && /;\s*Path=\//i.test(a.set));
check('…not Secure over plain http (it would never be sent back)', !/;\s*Secure/i.test(a.set));
{ const x = await me({ id: 'u_https0' + r }, { 'x-forwarded-proto': 'https' }); check('…and Secure when the app is reached over https', /;\s*Secure/i.test(x.set)); }
check('claiming again with that cookie is fine and doesn’t issue a new secret', await me({ id: A }, { cookie: ck(A, a.secret) }).then(x => x.status === 200 && !x.secret));

// 2. the secret stays secret
{ const k = keys()[A]; check('keys.json stores the secret’s sha256 hash for the id', k && k.h === sha(a.secret)); }
{ const file = readFileSync(join(DATA, 'keys.json'), 'utf8'); check('…and never the secret itself', secrets.every(s => !file.includes(s))); }
check('the secret isn’t in the response body or other headers', !a.text.includes(a.secret) && !a.headers.includes(a.secret));
{ const g = await fetch(BASE + '/api/me', { headers: { cookie: ck(A, a.secret) } }), t = await g.text(); check('GET /api/me lists the id without the secret', JSON.parse(t).ids?.includes(A) && !t.includes(a.secret)); }

// 3. claims from other sites, and bodies that aren't JSON
for (const [label, headers] of [['an Origin from another site', { origin: 'http://evil.example' }], ['Sec-Fetch-Site: cross-site', { 'sec-fetch-site': 'cross-site' }], ['Sec-Fetch-Site: same-site', { 'sec-fetch-site': 'same-site' }]]) {
  const id = 'u_xsite0' + r + label.length, x = await me({ id }, headers);
  check(`a claim with ${label} is refused (403), sets no cookie, stores nothing`, x.status === 403 && !x.set && !keys()[id], `${x.status}`);
}
{ const host = new URL(BASE).host, x = await me({ id: 'u_same00' + r }, { origin: 'http://' + host, 'sec-fetch-site': 'same-origin' }); check('a claim from the app’s own page is accepted', x.status === 200 && !!x.secret); }
for (const type of ['text/plain', 'application/x-www-form-urlencoded']) {
  const id = 'u_form00' + r + type.length, x = await me(type === 'text/plain' ? JSON.stringify({ id }) : `id=${id}`, {}, type);
  check(`a ${type} body is refused (415) and stores nothing`, x.status === 415 && !x.set && !keys()[id], `${x.status}`);
}

// 4. someone else's id, and ids from before secrets existed
{ const x = await me({ id: A }); check('claiming an id that has a secret, without its cookie, is refused (409 id_taken)', x.status === 409 && x.json.code === 'id_taken' && !x.set); }
{ const x = await me({ id: A }, { cookie: ck(A, randomBytes(32).toString('base64url')) }); check('…and with a wrong cookie too', x.status === 409 && x.json.code === 'id_taken' && !x.set); }
check('…and Ana’s own cookie still works afterwards', await canWrite(A, a.secret));
// L is mentioned in a plan (as people from before were) but never had a secret
await db(A, ck(A, a.secret), 'set', 'trips/' + T, { name: 'Old plan', createdBy: A, createdAt: Date.now(), people: { [A]: true, [L]: true } });
{ const x = await me({ id: L }); check('an existing id without a secret is refused (403 needs_claim_link)', x.status === 403 && x.json.code === 'needs_claim_link' && !x.set, x.json.code); }
check('…nothing is stored for it', !keys()[L]);
{ const x = await db(L, '', 'update', 'trips/' + T, { name: 'x' }); check('…and requests using it can’t change anything (401 unauthenticated)', x.status === 401 && x.code === 'unauthenticated'); }

// 5. sign-in links: work once; used, expired and made-up links fail and leave everyone as they were
const code = link(L);
check('the operator script makes a link', code.length >= 30);
check('…and stores only a hash of its code', existsSync(join(DATA, 'claims', sha(code) + '.json')) && !readFileSync(join(DATA, 'claims', sha(code) + '.json'), 'utf8').includes(code));
const l1 = await me({ code });
check('opening the link signs that browser in as that person (200, cookie)', l1.status === 200 && l1.json.id === L && !!l1.secret && /HttpOnly/i.test(l1.set));
check('…who can now act as themselves', await canWrite(L, l1.secret));
{ const x = await me({ code }); check('the same link a second time is refused (403 bad_link), no cookie', x.status === 403 && x.json.code === 'bad_link' && !x.set); }
check('…and the person it signed in is still signed in', await canWrite(L, l1.secret) && keys()[L].h === sha(l1.secret));
{ // an expired link for the same person
  const old = randomBytes(24).toString('base64url'); mkdirSync(join(DATA, 'claims'), { recursive: true });
  writeFileSync(join(DATA, 'claims', sha(old) + '.json'), JSON.stringify({ id: L, exp: Date.now() - 1000 }));
  const x = await me({ code: old });
  check('an expired link is refused (403 bad_link), no cookie', x.status === 403 && x.json.code === 'bad_link' && !x.set);
  check('…it can’t be tried again either', !existsSync(join(DATA, 'claims', sha(old) + '.json')));
  check('…and it didn’t touch the person’s sign-in', await canWrite(L, l1.secret) && keys()[L].h === sha(l1.secret));
}
for (const [label, c] of [['a made-up code', randomBytes(24).toString('base64url')], ['a malformed code', '../../keys'], ['an empty code', '']]) {
  const x = await me({ code: c }); check(`${label} is refused (403 bad_link) and changes nothing`, x.status === 403 && !x.set && keys()[L].h === sha(l1.secret) && keys()[A].h === sha(a.secret));
}
{ // a failed attempt doesn't use up someone else's pending link
  const M = 'u_mia00' + r; await db(A, ck(A, a.secret), 'update', 'trips/' + T, { people: { [M]: true } });
  const mc = link(M); await me({ code: mc.slice(0, -2) + (mc.endsWith('AA') ? 'BB' : 'AA') }); await me({ id: M });
  const x = await me({ code: mc });
  check('wrong codes and a plain claim before it don’t spoil a person’s real link', x.status === 200 && x.json.id === M && (await canWrite(M, x.secret)));
}

// 6. a browser that lost its local storage but kept its cookie
check('its cookie alone tells it which id it is', (await owned(ck(A, a.secret))).join() === A);
check('…with several cookies it gets back only the ones it really owns', (await owned(`${ck(A, a.secret)}; ${ck(L, randomBytes(32).toString('base64url'))}`)).join() === A);
check('…a cookie for an id it doesn’t own gets nothing', (await owned(ck(L, a.secret))).length === 0);
check('…and with its cookie it carries on as the same person', await me({ id: A }, { cookie: ck(A, a.secret) }).then(x => x.status === 200) && await canWrite(A, a.secret));
check('…but its cookie doesn’t let it claim someone else', await me({ id: L }, { cookie: ck(A, a.secret) }).then(x => x.status === 409 && !x.set));

// nothing secret in the server's output
{ const log = existsSync(join(DATA, 'server.log')) ? readFileSync(join(DATA, 'server.log'), 'utf8') : null;
  check('no secret or sign-in code appears in the server’s log', log !== null && secrets.concat(code).every(s => !log.includes(s))); }
await db(A, ck(A, a.secret), 'delete', 'trips/' + T);
process.exit(fails ? 1 : 0);

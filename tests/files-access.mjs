// Part of npm test / npm run test:server (runs against a throwaway server).
// Who can get at uploaded files (boarding passes, photos) through the API. A file's link
// (/_blob/<id>, 128 random bits) opens it for anyone who has it, by design (images can't say who is
// asking), so what matters is who is ever sent that link: a boarding pass only to its owner, the
// photo album only to people in the plan. And only the uploader can delete a file.
import { install } from './_identity.mjs'; install(); // act as the test's people (see the file)
const BASE = process.env.BASE || 'http://localhost:3000';
const call = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_ana00' + r, B = 'u_bea00' + r, X = 'u_link00' + r, T = 'fa' + r, P = 'trips/' + T;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f6b7d40000000049454e44ae426082', 'hex');
const upload = async u => (await (await fetch(BASE + '/api/assets', { method: 'POST', headers: { 'content-type': 'image/png', 'x-outta-user': u, 'x-outta-plan': T }, body: png })).json()).id;
const files = v => JSON.stringify(v ?? null).match(/\b[0-9a-f]{32}\b/g) || [];

await call(A, 'set', P, { name: 'Files', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true } });
await call(B, 'set', `${P}/members/${B}`, { nick: 'Bea', status: 'in' });
const pass = await upload(B), photo = await upload(A);
await call(B, 'update', P, { tickets: { [B]: { flight: 'TP123', asset: pass, type: 'image/png', price: 210 } } });
await call(A, 'set', `${P}/photos/ph1`, { asset: photo, by: A, at: Date.now() });

// boarding passes: the owner gets the file, everyone else only that they've booked
{ const t = (await call(B, 'get', P)).data; check('the owner gets their own boarding pass file', t.tickets[B].asset === pass && t.tickets[B].type === 'image/png'); }
{ const t = (await call(A, 'get', P)).data; check('another member sees that they booked (and the flight), not the file', t.tickets[B].flight === 'TP123' && !('asset' in t.tickets[B]) && !files(t).includes(pass)); }
{ const t = (await call(X, 'get', P)).data; check('someone with only the plan’s link never gets the file’s link', !!t && !files(t).includes(pass) && !('asset' in (t.tickets?.[B] || {}))); }
{ const l = ((await call(A, 'list', 'trips')).docs || []).find(d => d.id === T)?.data; check('…nor does a member through the plan list', !!l && !files(l).includes(pass)); }
check('…and the owner can still open it', (await fetch(BASE + '/_blob/' + pass)).status === 200);
check('a boarding pass stays stored whole on the server (nothing was lost)', (await call(B, 'update', P, { name: 'Files!' })).ok && (await call(B, 'get', P)).data.tickets[B].asset === pass);

// the photo album: people in the plan, not link holders
check('a member sees the album’s photos', ((await call(B, 'list', `${P}/photos`)).docs || []).some(d => d.data.asset === photo));
check('someone with only the link doesn’t', !((await call(X, 'list', `${P}/photos`)).docs || []).length && !(await call(X, 'get', `${P}/photos/ph1`)).exists);

// deleting and replacing files
check('another member can’t delete someone’s file (403)', (await fetch(BASE + '/api/assets/' + pass, { method: 'DELETE', headers: { 'x-outta-user': A } })).status === 403 && (await fetch(BASE + '/_blob/' + pass)).status === 200);
check('someone outside the plan can’t either', (await fetch(BASE + '/api/assets/' + photo, { method: 'DELETE', headers: { 'x-outta-user': X } })).status === 403);
check('uploading never replaces an existing file: each upload gets a new id', (await upload(A)) !== photo && (await fetch(BASE + '/_blob/' + photo)).status === 200);
check('someone outside the plan can’t upload into it', (await fetch(BASE + '/api/assets', { method: 'POST', headers: { 'content-type': 'image/png', 'x-outta-user': X, 'x-outta-plan': T }, body: png })).status === 403);
check('made-up or malformed file ids open nothing', (await fetch(BASE + '/_blob/' + '0'.repeat(32))).status === 404 && (await fetch(BASE + '/_blob/..%2Fkeys.json')).status === 404);
check('the uploader can delete their own file', (await fetch(BASE + '/api/assets/' + photo, { method: 'DELETE', headers: { 'x-outta-user': A } })).status === 200 && (await fetch(BASE + '/_blob/' + photo)).status === 404);

// a deleted plan's files stop opening
await fetch(BASE + '/api/plans/' + T, { method: 'DELETE', headers: { 'x-outta-user': A } });
check('after the plan is deleted, its boarding pass no longer opens', (await fetch(BASE + '/_blob/' + pass)).status === 404);
process.exit(fails ? 1 : 0);

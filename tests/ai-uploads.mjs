// Part of npm test / npm run test:server (runs against a throwaway server, with AI switched off
// and a per-person upload quota of 8 files so the quota can be reached quickly).
// AI and upload endpoints: who may call them, what they accept, and how often.
import { install } from './_identity.mjs'; install(); // act as the test's people (see the file)
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = process.env.BASE || 'http://localhost:3000', DATA = process.env.OUTTA_TEST_DATA;
const db = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const ai = (u, body, raw) => fetch(BASE + '/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: raw ?? JSON.stringify(body) });
const up = (u, tid, bytes, type) => fetch(BASE + '/api/assets', { method: 'POST', headers: { 'content-type': type, 'x-outta-user': u, ...(tid ? { 'x-outta-plan': tid } : {}) }, body: bytes });
const code = async res => { try { return (await res.clone().json()).code; } catch { return ''; } };
const r = Math.random().toString(36).slice(2, 8), A = 'u_alice' + r, D = 'u_dora' + r, E = 'u_eve00' + r, X = 'u_stranger' + r, T = 'aitrip' + r;
let fails = 0; const check = (label, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails++; };
const files = () => { if (!DATA) return -1; try { return readdirSync(join(DATA, 'uploads')).length; } catch { return 0; } };

// a plan with Alice, Dora and Eve in it; the stranger isn't
await db(A, 'set', 'trips/' + T, { name: 'AI test', createdBy: A, createdAt: Date.now(), people: { [A]: true } });
for (const [u, n] of [[A, 'Alice'], [D, 'Dora'], [E, 'Eve']]) {
  await db(u, 'set', `trips/${T}/members/${u}`, { nick: n, status: 'in' });
  if (u !== A) await db(u, 'update', 'trips/' + T, { people: { [u]: true }, left: { [u]: null } });
}

// —— AI ——
{ const res = await ai(A, { input: 'Pick a restaurant' }); check('AI: no plan given → 400', res.status === 400 && await code(res) === 'invalid_request'); }
{ const res = await ai(A, { input: 'x', tid: '../etc' }); check('AI: malformed plan id → 400', res.status === 400); }
{ const res = await ai(X, { input: 'Pick a restaurant', tid: T }); check('AI: someone not in the plan → 403', res.status === 403 && await code(res) === 'permission_denied'); }
{ const res = await ai(X, { input: 'x', tid: 'nosuchplan' + r }); check('AI: a plan that doesn’t exist → 403', res.status === 403); }
{ const res = await ai(A, null, '{not json'); check('AI: body that isn’t JSON → 400', res.status === 400 && await code(res) === 'invalid_request'); }
{ const res = await ai(A, { input: '   ', tid: T }); check('AI: empty prompt → 400', res.status === 400); }
{ const res = await ai(A, { input: [{ role: 'system', content: 'hi' }], tid: T }); check('AI: a turn with a role other than user/assistant → 400', res.status === 400); }
{ const res = await ai(A, { input: [{ role: 'user', content: 5 }], tid: T }); check('AI: a turn whose content isn’t text → 400', res.status === 400); }
{ const res = await ai(A, { input: Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'hi' })), tid: T }); check('AI: more than 20 turns → 400', res.status === 400); }
{ const res = await ai(A, { input: 'x'.repeat(70 * 1024), tid: T }); check('AI: over 64 KB of prompt → 413', res.status === 413 && await code(res) === 'prompt_too_large'); }
{ const res = await ai(A, { input: 'x', tid: T, pad: 'y'.repeat(200 * 1024) }); check('AI: request body over 128 KB → 413', res.status === 413); }
{ const res = await ai(A, { input: [{ role: 'user', content: 'Pick' }, { role: 'assistant', content: 'Ok' }, { role: 'user', content: 'Again' }], tid: T }); check('AI: a valid request from a member passes every check (503 only because AI is off here)', res.status === 503 && await code(res) === 'sampling_disabled'); }
{
  // six a minute per person; the seventh is refused with a Retry-After
  const got = [];
  for (let i = 0; i < 7; i++) got.push(await ai(D, { input: 'Pick ' + i, tid: T }));
  const last = got[6];
  check('AI: six requests a minute go through', got.slice(0, 6).every(x => x.status === 503));
  check('AI: the seventh in a minute → 429 rate_limited with Retry-After', last.status === 429 && await code(last) === 'rate_limited' && +last.headers.get('retry-after') > 0);
  check('AI: one person’s limit doesn’t block another member', (await ai(E, { input: 'Pick', tid: T })).status === 503);
}

// —— uploads ——
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f6b7d40000000049454e44ae426082', 'hex');
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60), Buffer.from([0xff, 0xd9])]);
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const before = files();
{ const res = await up(A, '', png, 'image/png'); check('upload: no plan given → 400', res.status === 400); }
{ const res = await up(X, T, png, 'image/png'); check('upload: someone not in the plan → 403', res.status === 403 && await code(res) === 'permission_denied'); }
{ const res = await up(A, T, Buffer.from('<script>alert(1)</script>'), 'image/png'); check('upload: text labelled as a PNG → 415', res.status === 415 && await code(res) === 'unsupported_type'); }
{ const res = await up(A, T, png, 'image/jpeg'); check('upload: a PNG labelled as a JPEG → 415', res.status === 415); }
{ const res = await up(A, T, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml'); check('upload: SVG → 415', res.status === 415); }
{ const res = await up(A, T, Buffer.from('<html><script>alert(1)</script></html>'), 'text/html'); check('upload: HTML → 415', res.status === 415); }
{ const res = await up(A, T, Buffer.alloc(0), 'image/png'); check('upload: empty file → 400', res.status === 400); }
{ const big = Buffer.alloc(20 * 1024 * 1024 + 1); png.copy(big); const res = await up(A, T, big, 'image/png'); check('upload: over 20 MB → 413', res.status === 413 && await code(res) === 'too_large'); }
check('upload: rejected files leave nothing behind', files() === before);

let id = '';
{
  const res = await up(A, T, png, 'image/png'), j = await res.json(); id = j.id || '';
  check('upload: a member’s photo is saved', res.status === 200 && /^[0-9a-f]{32}$/.test(id) && j.url === '/_blob/' + id);
  const got = await fetch(BASE + '/_blob/' + id);
  check('upload: it opens from its link with its real type', got.status === 200 && got.headers.get('content-type') === 'image/png' && Buffer.from(await got.arrayBuffer()).equals(png));
  check('upload: served with nosniff and a sandboxing CSP', got.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(got.headers.get('content-security-policy') || ''));
}
check('upload: a boarding pass PDF is saved', (await up(A, T, pdf, 'application/pdf')).status === 200);
check('upload: a JPEG is saved', (await up(A, T, jpeg, 'image/jpeg')).status === 200);
{ const res = await fetch(BASE + '/api/assets/' + id, { method: 'DELETE', headers: { 'x-outta-user': D } }); check('upload: someone else can’t delete it → 403', res.status === 403); }

// quota: 8 files per person per plan on the test server
{
  let ok = 0; for (let i = 0; i < 8; i++) if ((await up(E, T, png, 'image/png')).status === 200) ok++;
  const n = files(), res = await up(E, T, png, 'image/png');
  check('upload: up to the quota is fine', ok === 8);
  check('upload: one more → 413 quota_exceeded', res.status === 413 && await code(res) === 'quota_exceeded');
  check('upload: the refused file leaves nothing behind', files() === n);
  check('upload: another member still has room', (await up(D, T, png, 'image/png')).status === 200);
}

// clean up; files from a deleted plan stop opening
check('uploader deletes their own file', (await fetch(BASE + '/api/assets/' + id, { method: 'DELETE', headers: { 'x-outta-user': A } })).status === 200);
const other = await (await up(A, T, png, 'image/png')).json();
await db(A, 'delete', 'trips/' + T);
check('upload: files from a deleted plan no longer open → 404', (await fetch(BASE + '/_blob/' + other.id)).status === 404);
if (!DATA) console.log('(file-count checks need OUTTA_TEST_DATA; run through npm test)');
process.exit(fails ? 1 : 0);

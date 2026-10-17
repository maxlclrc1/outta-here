// Part of npm test / npm run test:server (runs against a throwaway server; needs OUTTA_TEST_DATA
// to look at its files). Deleting a plan is one server step: everything in it and its uploaded
// files go together, or nothing does; other plans and files they still use are never touched.
import { install } from './_identity.mjs'; install(); // act as the test's people (see the file)
import { readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const BASE = process.env.BASE || 'http://localhost:3000', DATA = process.env.OUTTA_TEST_DATA;
if (!DATA) { console.log('FAIL needs OUTTA_TEST_DATA (run through npm test)'); process.exit(1); }
const UP = join(DATA, 'uploads'), DB = join(DATA, 'db.json');
const db = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const del = (u, tid) => fetch(BASE + '/api/plans/' + tid, { method: 'DELETE', headers: { 'x-outta-user': u } }).then(async r => ({ status: r.status, ...(await r.json()) }));
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f6b7d40000000049454e44ae426082', 'hex');
const upload = async (u, tid) => (await (await fetch(BASE + '/api/assets', { method: 'POST', headers: { 'content-type': 'image/png', 'x-outta-user': u, 'x-outta-plan': tid }, body: png })).json()).id;
const r = Math.random().toString(36).slice(2, 8), A = 'u_ana00' + r, B = 'u_bea00' + r, T1 = 'del' + r, T2 = 'keep' + r, T3 = 'dbdel' + r;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const onDisk = () => Object.keys(JSON.parse(readFileSync(DB, 'utf8')));
const of = tid => onDisk().filter(p => p === 'trips/' + tid || p.startsWith(`trips/${tid}/`) || p.endsWith('/spend-' + tid));
const has = id => existsSync(join(UP, id)) && existsSync(join(UP, id + '.json'));
const plan = (tid, extra = {}) => db(A, 'set', 'trips/' + tid, { name: 'Plan ' + tid, createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true }, ...extra });

// a plan with everything in it
await plan(T1, { changes: { c1: { text: 'Dates locked', by: A, at: 1, area: 'dates', act: 'all' } } });
await db(A, 'set', `trips/${T1}/members/${A}`, { nick: 'Ana', status: 'in' });
await db(B, 'set', `trips/${T1}/members/${B}`, { nick: 'Bea', status: 'in' });
const pass = await upload(B, T1), ph1 = await upload(A, T1), ph2 = await upload(B, T1), shared = await upload(A, T1);
await db(B, 'update', 'trips/' + T1, { tickets: { [B]: { flight: 'TP123', asset: pass, type: 'image/png' } } });
for (const [id, a] of [['p1', ph1], ['p2', ph2]]) await db(A, 'set', `trips/${T1}/photos/${id}`, { asset: a, by: A, at: Date.now() });
await db(A, 'set', `trips/${T1}/expenses/e1`, { title: 'Hotel', amount: 300, by: A, at: 1 });
await db(A, 'set', `trips/${T1}/packing/k1`, { text: 'Sunscreen', kind: 'group', at: 1 });
await db(A, 'set', `trips/${T1}/feed/f1`, { text: 'Hi', by: A, at: 1 });
await db(B, 'set', `data/users/${B}/spend-${T1}`, { items: [{ amount: 12 }] });
// an older upload (from before uploads recorded their plan) that only this plan uses, and one nobody uses
const legacy = await upload(A, T1), loose = await upload(A, T1);
for (const id of [legacy, loose]) { const m = JSON.parse(readFileSync(join(UP, id + '.json'), 'utf8')); delete m.tid; writeFileSync(join(UP, id + '.json'), JSON.stringify(m)); }
await db(A, 'set', `trips/${T1}/photos/p3`, { asset: legacy, by: A, at: Date.now() });
// another plan, with its own photo and a photo it shares with the first plan
await plan(T2); await db(A, 'set', `trips/${T2}/members/${A}`, { nick: 'Ana', status: 'in' });
const own2 = await upload(A, T2);
await db(A, 'set', `trips/${T2}/photos/q1`, { asset: own2, by: A, at: 1 }); await db(A, 'set', `trips/${T2}/photos/q2`, { asset: shared, by: A, at: 1 });
await db(A, 'set', `trips/${T1}/photos/p4`, { asset: shared, by: A, at: 1 });
// a crew template made from the first plan
const K = 'crew' + r; await db(A, 'set', 'crews/' + K, { name: 'Crew', people: { [A]: true }, by: A, at: 1, templates: { t1: { from: T1, fromName: 'Plan', name: 'Again' } } });
await new Promise(res => setTimeout(res, 400));
const before = of(T1).length, t2Before = of(T2).sort().join();
check('setup: the plan has its records on disk', before >= 10, before + ' records');

// who may delete
{ const x = await del(B, T1); check('a member who isn’t an organizer can’t delete it (403)', x.status === 403 && x.code === 'permission_denied', x.message); }
{ const x = await del('u_stranger' + r, T1); check('someone outside the plan can’t either', x.status === 403); }
{ const x = await del(A, 'bad id!'); check('a malformed plan id is a 400', x.status === 400); }
check('…and after those, nothing is gone', of(T1).length === before && [pass, ph1, ph2, shared, legacy].every(has));

// a delete that can't be saved: nothing is removed
mkdirSync(DB + '.tmp'); // makes every database write fail
{ const x = await del(A, T1); check('when the database can’t be saved, the delete fails clearly (503)', x.status === 503 && /nothing was deleted|database|saving/i.test(x.message), `${x.status} ${x.message}`); }
rmSync(DB + '.tmp', { recursive: true });
{ const g = await db(A, 'get', 'trips/' + T1), m = await db(A, 'list', `trips/${T1}/members`);
  check('…the plan and everything in it are all still there', g.exists && m.docs.length === 2 && (await db(A, 'list', `trips/${T1}/photos`)).docs.length === 4);
  check('…and so are its files', [pass, ph1, ph2, shared, legacy].every(has)); }

// the real delete
{ const x = await del(A, T1);
  check('an organizer deletes it in one request', x.status === 200 && x.ok && x.deleted === true && x.records === before, JSON.stringify(x));
  check('every record of the plan is gone from disk (plan, change log, members, photos, expenses, packing, chat, private spend list)', of(T1).length === 0, of(T1).join());
  check('its boarding pass and photos are deleted', ![pass, ph1, ph2].some(has));
  check('an older file only this plan used is deleted too', !has(legacy));
  check('a file another plan still uses is kept', has(shared));
  check('a file no plan mentions isn’t touched', has(loose));
  check('the other plan is untouched, with its own photo', of(T2).sort().join() === t2Before && has(own2));
  check('the crew’s template made from it stays', !!(await db(A, 'get', 'crews/' + K)).data?.templates?.t1); }
{ const x = await db(A, 'get', 'trips/' + T1); check('opening it now finds nothing', !x.exists); }

// retrying
{ const x = await del(A, T1); check('deleting it again is a harmless success', x.status === 200 && x.deleted === false && x.records === 0, JSON.stringify(x)); }
check('…and changes nothing else', of(T2).sort().join() === t2Before && has(own2) && has(shared) && has(loose));
{ const [x, y] = await Promise.all([del(A, T2), del(A, T2)]); check('two deletes of the same plan at once: both succeed, it’s deleted once', x.status === 200 && y.status === 200 && [x.deleted, y.deleted].sort().join() === 'false,true' && of(T2).length === 0, `${x.deleted} ${y.deleted}`); }
check('…and the shared file goes once no plan uses it', !has(shared) && !has(own2));

// leftover files of an already-deleted plan get cleared by the next delete
{
  await plan(T3); await db(A, 'set', `trips/${T3}/members/${A}`, { nick: 'Ana', status: 'in' });
  const orphan = await upload(A, T3); const m = JSON.parse(readFileSync(join(UP, orphan + '.json'), 'utf8')); writeFileSync(join(UP, orphan + '.json'), JSON.stringify({ ...m, tid: 'gone' + r }));
  // the older way (deleting the plan record through /api/db) now deletes everything too
  const x = await db(A, 'delete', 'trips/' + T3);
  check('deleting a plan through /api/db removes everything in it too', x.ok && of(T3).length === 0);
  check('…and clears leftover files from plans that no longer exist', !has(orphan));
}
await db(A, 'delete', 'crews/' + K);
process.exit(fails ? 1 : 0);

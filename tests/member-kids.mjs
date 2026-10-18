// Part of npm test / npm run test:server (runs against a throwaway server).
// Kids an adult brings to a family plan are a count on that adult's own member record (`kids`, missing
// means 0): a whole number from 0 to 12, and only the adult who owns the record can change it. Organizers
// still manage whether others are coming, and records without the field read as before.
import { install } from './_identity.mjs'; install(); // act as the test's people (see the file)
const BASE = process.env.BASE || 'http://localhost:3000';
const db = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_ana0' + r, B = 'u_ben0' + r, C = 'u_cy00' + r, X = 'u_xan0' + r, T = 'kids' + r;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const mem = u => `trips/${T}/members/${u}`, kidsOf = async u => (await db(A, 'get', mem(u))).data?.kids;

await db(A, 'set', 'trips/' + T, { name: 'Family trip', mode: 'family', size: 'weekend', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true }, destinations: [] });
await db(A, 'set', mem(A), { nick: 'Ana', status: 'in', days: [] });
await db(B, 'set', mem(B), { nick: 'Ben', status: 'in', days: [] });

check('a record without kids reads as before (no field, so 0)', (await db(A, 'get', mem(B))).data && !('kids' in (await db(A, 'get', mem(B))).data));
{ const x = await db(A, 'update', mem(A), { kids: 2 }); check('an adult sets their own count', x.status === 200 && await kidsOf(A) === 2, x.message); }
{ const x = await db(B, 'set', mem(B), { nick: 'Ben', status: 'in', days: [], kids: 12 }); check('…in a whole-record save too, up to 12', x.status === 200 && await kidsOf(B) === 12, x.message); }
for (const v of [13, -1, 1.5, '2', true, [1], { n: 1 }]) {
  const x = await db(A, 'update', mem(A), { kids: v });
  check(`kids ${JSON.stringify(v)} is refused`, x.status === 400 && /whole number from 0 to 12/.test(x.message || ''), `${x.status} ${x.message}`);
}
check('…and the saved count is untouched', await kidsOf(A) === 2);
{ const x = await db(A, 'update', mem(A), { kids: 0 }); check('0 is fine', x.status === 200 && await kidsOf(A) === 0); }
{ const x = await db(A, 'update', mem(A), { kids: null }); check('null clears it (reads as 0)', x.status === 200 && !(await kidsOf(A))); }

// ownership: nobody else, organizers included, can set someone's count
{ const x = await db(A, 'update', mem(B), { kids: 1 }); check('the organizer can’t change another adult’s count', x.status === 403 && await kidsOf(B) === 12, `${x.status} ${x.message}`); }
{ const x = await db(A, 'update', mem(B), { status: 'confirmed', kids: 1 }); check('…even alongside a change they may make', x.status === 403); }
{ const x = await db(A, 'update', mem(B), { status: 'confirmed' }); check('…but can still change whether they’re coming, as before', x.status === 200 && (await db(A, 'get', mem(B))).data?.status === 'confirmed', x.message); }
{ const x = await db(A, 'set', mem(C), { nick: 'Cy', status: 'in', kids: 3 }); check('nobody can create someone else’s record with kids in it', x.status === 403, `${x.status} ${x.message}`); }
{ const x = await db(X, 'get', mem(B)); check('someone outside the plan doesn’t see the count', !x.data || !('kids' in x.data)); }

await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
process.exit(fails ? 1 : 0);

// Part of npm test / npm run test:server (runs against a throwaway server). To run alone against
// your own running app instead (writes to its data/): BASE=http://localhost:3000 node <this file>
// A plan's dates (window, RSVP deadline, voting deadline) must be real dates; bad ones get a 400.
const BASE = process.env.BASE || 'http://localhost:3000';
const call = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_ana00' + r, T = 'dates' + r, P = 'trips/' + T;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const base = { name: 'Dates', createdBy: A, createdAt: Date.now(), people: { [A]: true } };
const get = async () => (await call(A, 'get', P)).data;

// creating
{ const x = await call(A, 'set', 'trips/x' + T, { ...base, winStart: '2026-02-30', winEnd: '2026-03-04' }); check('a new plan with an impossible date is refused (400)', x.status === 400 && x.code === 'invalid_argument' && /winStart/.test(x.message), x.message); }
check('…and isn’t created', !(await call(A, 'get', 'trips/x' + T)).exists);
check('a plan with no dates at all is fine (they’re optional)', (await call(A, 'set', P, base)).ok);
check('valid dates are saved as sent', (await call(A, 'update', P, { winStart: '2026-11-01', winEnd: '2026-11-30', rsvpBy: '2026-10-25', decide: { style: 'pick', by: '2026-10-28' } })).ok);
{ const t = await get(); check('…exactly', t.winStart === '2026-11-01' && t.winEnd === '2026-11-30' && t.rsvpBy === '2026-10-25' && t.decide.by === '2026-10-28'); }
check('a leap day is a date', (await call(A, 'update', P, { rsvpBy: '2028-02-29' })).ok);

// bad values for each field
const BAD = ['2026-02-30', '2026-13-01', '2027-02-29', '20261120', '2026-11-20T10:00', ' 2026-11-20', 'tomorrow', '2026-11-20"><img src=x>', 20261120, true, ['2026-11-20'], { d: 1 }];
for (const [field, patch] of [['winStart', v => ({ winStart: v })], ['winEnd', v => ({ winEnd: v })], ['rsvpBy', v => ({ rsvpBy: v })], ['decide.by', v => ({ decide: { by: v } })]]) {
  const refused = [];
  for (const v of BAD) { const x = await call(A, 'update', P, patch(v)); if (!(x.status === 400 && x.code === 'invalid_argument' && x.message.includes(field))) refused.push(JSON.stringify(v) + '→' + x.status); }
  check(`${field}: every malformed value gets a clear 400`, !refused.length, refused.join(', '));
}
{ const t = await get(); check('…and nothing was changed by the refused writes', t.winStart === '2026-11-01' && t.winEnd === '2026-11-30' && t.rsvpBy === '2028-02-29' && t.decide.by === '2026-10-28'); }
{ const x = await call(A, 'update', P, { winStart: '2026-12-10', winEnd: '2026-12-01' }); check('a window that ends before it starts is refused', x.status === 400 && /winEnd/.test(x.message)); }
{ const x = await call(A, 'update', P, { decide: 'pick' }); check('decide that isn’t an object is refused', x.status === 400); }

// clearing optional deadlines
check('the RSVP deadline can be cleared with null', (await call(A, 'update', P, { rsvpBy: null })).ok && (await get()).rsvpBy === null);
check('…or with an empty value', (await call(A, 'update', P, { rsvpBy: '' })).ok);
check('the voting deadline can be cleared', (await call(A, 'update', P, { decide: { by: '' } })).ok && (await get()).decide.by === '');
check('other changes to the plan still save normally', (await call(A, 'update', P, { name: 'Renamed' })).ok && (await get()).name === 'Renamed');
await call(A, 'delete', P);
process.exit(fails ? 1 : 0);

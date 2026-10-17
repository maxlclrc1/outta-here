// Part of npm test / npm run test:server (runs against a throwaway server). To run alone against
// your own running app instead (writes to its data/): BASE=http://localhost:3000 node <this file>
// Plan values shared screens rely on (stop dates and times, destination codes, nights, size,
// task due dates, members' days) are refused with a 400 naming the field when malformed.
const BASE = process.env.BASE || 'http://localhost:3000';
const call = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_ana00' + r, T = 'vals' + r, P = 'trips/' + T, M = `${P}/members/${A}`;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const get = async (p = P) => (await call(A, 'get', p)).data;
const stop = (id, x = {}) => ({ id, title: 'Stop ' + id, kind: 'food', date: '2026-11-21', time: '20:30', ...x });
check('a plan with valid values saves', (await call(A, 'set', P, { name: 'Values', createdBy: A, createdAt: Date.now(), people: { [A]: true }, size: 'trip', nights: 3,
  itinerary: [stop('i1'), stop('i2', { date: '', time: '' }), { id: 'i3', title: 'No date or time', kind: 'plan' }],
  destinations: [{ id: 'd1', city: 'Lisbon', code: 'LIS' }, { id: 'd2', city: 'Somewhere', code: '' }, { id: 'd3', city: 'Cabin' }],
  tasks: { t1: { title: 'Book', due: '2026-11-01' }, t2: { title: 'Pack', due: '' } } })).ok);
check('…a member’s days save', (await call(A, 'set', M, { nick: 'Ana', status: 'in', days: ['2026-11-20', '2026-11-21'], pref: ['2026-11-21'] })).ok);
check('…and so do empty ones', (await call(A, 'update', M, { days: [], pref: [] })).ok);
for (const [label, patch] of [['every plan size', null], ['nights 0 and 90', { nights: 0 }], ['', { nights: 90 }], ['clearing a task’s due date', { tasks: { t1: { due: '' } } }], ['a lowercase airport code', { destinations: [{ id: 'd1', city: 'Lisbon', code: 'lis' }] }]]) {
  if (!patch) { let ok = true; for (const s of ['hangout', 'day', 'weekend', 'trip']) ok = ok && (await call(A, 'update', P, { size: s })).ok; check(label + ' is accepted', ok); continue; }
  const x = await call(A, 'update', P, patch); if (label) check(label + ' is accepted', x.ok, x.message);
}

const BAD = [
  ['itinerary[0].time', { itinerary: [stop('i1', { time: '7pm' })] }], ['itinerary[0].time', { itinerary: [stop('i1', { time: '24:00' })] }],
  ['itinerary[0].time', { itinerary: [stop('i1', { time: '9:30' })] }], ['itinerary[0].time', { itinerary: [stop('i1', { time: 2030 })] }],
  ['itinerary[1].date', { itinerary: [stop('i1'), stop('i2', { date: 'tomorrow' })] }], ['itinerary[0].date', { itinerary: [stop('i1', { date: '2026-02-30' })] }],
  ['itinerary[0]', { itinerary: ['a stop'] }],
  ['destinations[0].code', { destinations: [{ id: 'd1', city: 'Lisbon', code: 5 }] }], ['destinations[0].code', { destinations: [{ id: 'd1', city: 'Lisbon', code: 'LISB' }] }],
  ['destinations[0].code', { destinations: [{ id: 'd1', city: 'Lisbon', code: 'L1S' }] }], ['destinations[0].city', { destinations: [{ id: 'd1', city: 5 }] }],
  ['nights', { nights: '3' }], ['nights', { nights: -1 }], ['nights', { nights: 2.5 }], ['nights', { nights: 91 }],
  ['size', { size: 'huge' }], ['size', { size: 3 }], ['tasks.t1.due', { tasks: { t1: { due: 'friday' } } }],
];
{
  const before = JSON.stringify(await get()), wrong = [];
  for (const [field, patch] of BAD) { const x = await call(A, 'update', P, patch); if (!(x.status === 400 && x.code === 'invalid_argument' && x.message.includes(field))) wrong.push(`${JSON.stringify(patch).slice(0, 60)} → ${x.status} ${x.message}`); }
  check(`each of ${BAD.length} malformed plan values gets a 400 naming the field`, !wrong.length, wrong.join(' | '));
  check('…and none of them changed the plan', JSON.stringify(await get()) === before);
}
{ const x = await call(A, 'update', P, { itinerary: [stop('i1'), stop('i9', { time: 'noon' })], _base: { itinerary: { ids: ['i1', 'i2', 'i3'], changed: ['i9'] } } }); check('…also when the itinerary is merged with others’ edits', x.status === 400 && /itinerary\[1\]\.time/.test(x.message)); }
{
  const wrong = [];
  for (const [field, patch] of [['days', { days: 'monday' }], ['days', { days: ['2026-02-30'] }], ['days', { days: [20261120] }], ['pref', { pref: 'x' }], ['days', { days: Array(401).fill('2026-11-20') }]]) {
    const x = await call(A, 'update', M, patch); if (!(x.status === 400 && x.message.includes(field))) wrong.push(`${JSON.stringify(patch).slice(0, 40)} → ${x.status}`);
  }
  check('malformed member days get a 400 naming the field', !wrong.length, wrong.join(' | '));
  check('…and the member’s days are unchanged', JSON.stringify((await get(M)).days) === '[]');
}
check('other saves still work as before', (await call(A, 'update', P, { name: 'Renamed' })).ok && (await call(A, 'update', M, { nick: 'Ana B' })).ok);
await call(A, 'delete', P);
process.exit(fails ? 1 : 0);

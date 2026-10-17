// Part of npm test / npm run test:server (runs against a throwaway server). To run alone against
// your own running app instead (writes to its data/): BASE=http://localhost:3000 node <this file>
// Undo/Restore saves only if what it would put back is unchanged (`_expect`, lib/merge.ts).
const BASE = process.env.BASE || 'http://localhost:3000';
const call = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_ana00' + r, B = 'u_bea00' + r, T = 'undo' + r, P = 'trips/' + T;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const get = async () => (await call(A, 'get', P)).data;
const stop = (id, title, date = '2026-11-21') => ({ id, title, date, time: '20:00', kind: 'food' });
await call(A, 'set', P, { name: 'Undo', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true }, lockedDates: { start: '2026-11-20', end: '2026-11-23' }, decide: { style: 'all', pct: 50, by: '' },
  stay: { name: 'Flat', total: 900 }, itinerary: [stop('i1', 'Fado'), stop('i2', 'Brunch', '2026-11-22')] });
await call(B, 'set', `${P}/members/${B}`, { nick: 'Bea', status: 'in' });
const note = id => ({ changes: { [id]: { text: 'Undone: test', by: A, at: Date.now(), area: 'dates', act: '' } } });

// whole fields
{ const x = await call(A, 'update', P, { lockedDates: null, ...note('n1'), _expect: { lockedDates: { end: '2026-11-23', start: '2026-11-20' } } }); check('a matching expectation saves (key order doesn’t matter)', x.ok && (await get()).lockedDates === null); }
check('…and the expectation itself isn’t stored', !('_expect' in (await get())));
{ const x = await call(A, 'update', P, { lockedDates: { start: '2026-11-20', end: '2026-11-23' }, ...note('n2'), _expect: { lockedDates: { start: '2026-12-01', end: '2026-12-03' } } }); const t = await get();
  check('a stale expectation is refused with 409 conflict', x.status === 409 && x.code === 'conflict' && /locked dates changed since/.test(x.message), x.message);
  check('…and nothing in that save is written, not even its log entry', t.lockedDates === null && !t.changes?.n2); }
check('null and missing count as the same', (await call(A, 'update', P, { meet: { text: 'Cafe' }, _expect: { meet: null } })).ok);

// a path into a field: only that part has to match
await call(A, 'update', P, { decide: { pct: 75 } }); // someone changes another part of the rules
{ const x = await call(A, 'update', P, { decide: { style: 'majority' }, _expect: { 'decide.style': 'all' } }); check('a path expectation ignores other parts of the field', x.ok && (await get()).decide.style === 'majority' && (await get()).decide.pct === 75); }
{ const x = await call(A, 'update', P, { decide: { style: 'pick' }, _expect: { 'decide.style': 'all' } }); check('…but is refused when that part changed', x.status === 409 && (await get()).decide.style === 'majority'); }

// one item of a list, by id
await call(B, 'update', P, { itinerary: [stop('i1', 'Fado night'), stop('i2', 'Brunch', '2026-11-22')], _base: { itinerary: { ids: ['i1', 'i2'], changed: ['i1'] } } }); // Bea renames i1
{ const x = await call(A, 'update', P, { itinerary: [stop('i1', 'Fado', '2026-11-20'), stop('i2', 'Brunch', '2026-11-22')], _base: { itinerary: { ids: ['i1', 'i2'], changed: ['i1'] } }, _expect: { 'itinerary#i1': stop('i1', 'Fado') } });
  const t = await get(); check('undoing a stop that was edited since is refused', x.status === 409 && /a stop in the itinerary changed since/.test(x.message) && t.itinerary[0].title === 'Fado night', x.message); }
{ const x = await call(A, 'update', P, { itinerary: [stop('i1', 'Fado night'), stop('i2', 'Brunch', '2026-11-23')], _base: { itinerary: { ids: ['i1', 'i2'], changed: ['i2'] } }, _expect: { 'itinerary#i2': stop('i2', 'Brunch', '2026-11-22') } });
  check('undoing a stop nobody touched works, and keeps the other stop’s newer edit', x.ok && (await get()).itinerary.map(i => i.title + '@' + i.date).join() === 'Fado night@2026-11-21,Brunch@2026-11-23'); }
{ const x = await call(A, 'update', P, { itinerary: [stop('i1', 'Fado night'), stop('i2', 'Brunch', '2026-11-23'), stop('i3', 'Boat')], _base: { itinerary: { ids: ['i1', 'i2'], changed: ['i3'] } }, _expect: { 'itinerary#i3': null } });
  check('restoring a deleted stop works when it isn’t back already (null = not in the list)', x.ok && (await get()).itinerary.length === 3); }
{ const x = await call(A, 'update', P, { itinerary: [stop('i1', 'Fado night'), stop('i2', 'Brunch', '2026-11-23'), stop('i3', 'Boat')], _expect: { 'itinerary#i3': null } }); check('…and is refused once it is', x.status === 409); }

// two people pressing Undo at the same moment: only one goes through
{
  await call(A, 'update', P, { stay: null });
  const undo = u => call(u, 'update', P, { stay: { name: 'Flat', total: 900 }, ...note('race-' + u), _expect: { stay: null } });
  const [x, y] = await Promise.all([undo(A), undo(B)]);
  check('two undos of the same change at once: one saves, the other gets a conflict', [x.status, y.status].sort().join() === '200,409', `${x.status}, ${y.status}`);
}
{ const x = await call(A, 'update', P, { name: 'x', _expect: 'stay' }); check('a malformed expectation is a 400', x.status === 400); }
check('saves without an expectation are unchanged', (await call(A, 'update', P, { name: 'Renamed' })).ok && (await get()).name === 'Renamed');
await call(A, 'delete', P);
process.exit(fails ? 1 : 0);

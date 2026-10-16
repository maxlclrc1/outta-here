// Run with the app running (npm run dev): npm run test:server
// Two people saving at once shouldn't undo each other (audit findings #9 and #10).
const BASE = process.env.BASE || 'http://localhost:3000';
const db = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_ari' + r, B = 'u_bea' + r, T = 'conc' + r;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const plan = async () => (await db(A, 'get', 'trips/' + T)).data;
const ids = list => list.map(i => i.id).join(',');
// what the app sends: the whole list, plus which items it started from and which it changed
const base = (key, startedFrom, sent) => { const was = new Map(startedFrom.map(i => [i.id, JSON.stringify(i)])); return { [key]: { ids: [...was.keys()], changed: sent.filter(i => was.get(i.id) !== JSON.stringify(i)).map(i => i.id) } }; };
const saveList = (u, startedFrom, sent) => db(u, 'update', 'trips/' + T, { itinerary: sent, _base: base('itinerary', startedFrom, sent) });
const it = (id, title, time = '12:00') => ({ id, date: '2026-11-21', time, title, kind: 'plan' });

await db(A, 'set', 'trips/' + T, { name: 'Overlap', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true }, itinerary: [it('a', 'Brunch'), it('b', 'Museum', '15:00')], destinations: [{ id: 'd1', city: 'Lisbon' }], pitches: { at: 1, items: [{ id: 'p1', city: 'Porto' }] } });
for (const [u, nick] of [[A, 'Ari'], [B, 'Bea']]) await db(u, 'set', `trips/${T}/members/${u}`, { nick, status: 'in', budget: 300 });

// #9: both load the plan, then both save
const aView = (await plan()).itinerary, bView = (await db(B, 'get', 'trips/' + T)).data.itinerary;
await saveList(A, aView, [...aView, it('c', 'Fado night', '21:00')]);
await saveList(B, bView, [...bView, it('d', 'Sunset at the viewpoint', '19:00')]);
let now = (await plan()).itinerary;
check('two people adding stops at once keeps both', now.some(i => i.id === 'c') && now.some(i => i.id === 'd'), ids(now));
check('…in a sensible order (the latest save’s list, then the other’s new stop)', ids(now) === 'a,b,d,c', ids(now));
const aView2 = await plan().then(t => t.itinerary);
await saveList(A, aView2, aView2.map(i => i.id === 'b' ? { ...i, time: '16:30' } : i));
await saveList(B, bView, [...bView, it('e', 'Pastéis', '10:00')]); // B is still on its old copy of "Museum"
now = (await plan()).itinerary;
check('a stale save doesn’t undo someone’s newer edit', now.find(i => i.id === 'b').time === '16:30' && now.some(i => i.id === 'e'), JSON.stringify(now.find(i => i.id === 'b')));
const aView3 = await plan().then(t => t.itinerary), bView3 = (await db(B, 'get', 'trips/' + T)).data.itinerary;
await saveList(A, aView3, [...aView3, it('f', 'Tram 28')]);
await saveList(B, bView3, bView3.filter(i => i.id !== 'a'));
now = (await plan()).itinerary;
check('deleting a stop still deletes it', !now.some(i => i.id === 'a'));
check('…without losing a stop someone added meanwhile', now.some(i => i.id === 'f'), ids(now));
const aView4 = await plan().then(t => t.itinerary), bView4 = (await db(B, 'get', 'trips/' + T)).data.itinerary;
await saveList(A, aView4, aView4.filter(i => i.id !== 'c'));
await saveList(B, bView4, [...bView4, it('g', 'Late snack')]); // B still has "c"
now = (await plan()).itinerary;
check('a stale save doesn’t bring back a stop someone deleted', !now.some(i => i.id === 'c') && now.some(i => i.id === 'g'), ids(now));
// the same for destinations and pitches
const t5 = await plan();
await db(A, 'update', 'trips/' + T, { destinations: [...t5.destinations, { id: 'd2', city: 'Porto' }], _base: { destinations: { ids: ['d1'], changed: ['d2'] } } });
await db(B, 'update', 'trips/' + T, { destinations: [...t5.destinations, { id: 'd3', city: 'Sintra' }], _base: { destinations: { ids: ['d1'], changed: ['d3'] } } });
check('two people suggesting places at once keeps both', ids((await plan()).destinations) === 'd1,d3,d2', ids((await plan()).destinations));
await db(A, 'update', 'trips/' + T, { pitches: { at: 2, items: [{ id: 'p2', city: 'Faro' }] }, _base: { 'pitches.items': { ids: ['p1'], changed: ['p2'] } } });
check('a new round of pitches still replaces the old round', ids((await plan()).pitches.items) === 'p2');
check('the bookkeeping isn’t stored', !('_base' in await plan()));

// #10: an organizer counts Bea out while her tab still says she's in
await db(A, 'update', `trips/${T}/members/${B}`, { status: 'out', countedOut: true });
await db(B, 'update', `trips/${T}/members/${B}`, { budget: 350, updatedAt: Date.now() }); // what the app sends now
let bea = (await db(A, 'get', `trips/${T}/members/${B}`)).data;
check('saving your details doesn’t undo being counted out', bea.status === 'out' && bea.countedOut === true && bea.budget === undefined, JSON.stringify({ status: bea.status }));
check('…and the detail is saved', (await db(B, 'get', `trips/${T}/members/${B}`)).data.budget === 350);
await db(B, 'set', `trips/${T}/members/${B}`, { nick: 'Bea', status: 'in', budget: 400, countedOut: false, updatedAt: Date.now() }); // an old-style whole-record save
bea = (await db(B, 'get', `trips/${T}/members/${B}`)).data;
check('a whole-record save can’t undo it either', bea.status === 'out' && bea.countedOut === true && bea.budget === 400, JSON.stringify({ status: bea.status, countedOut: bea.countedOut }));
await db(A, 'update', `trips/${T}/members/${B}`, { droppedAt: 123 });
await db(B, 'set', `trips/${T}/members/${B}`, { nick: 'Bea', status: 'in', updatedAt: Date.now() });
check('…nor a drop-out', (await db(B, 'get', `trips/${T}/members/${B}`)).data.droppedAt === 123);
check('saying you’re back in yourself still works', (await db(B, 'update', `trips/${T}/members/${B}`, { status: 'in', countedOut: false })).status === 200 && (await db(B, 'get', `trips/${T}/members/${B}`)).data.status === 'in');

await db(A, 'delete', 'trips/' + T);
console.log(fails ? `${fails} FAILED` : 'concurrency checks passed'); process.exit(fails ? 1 : 0);

// Part of npm test / npm run test:server (runs against a throwaway server). To run alone against
// your own running app instead (writes to its data/): BASE=http://localhost:3000 node <this file>
// The plan's decision rules are enforced by the server, not just shown by the app.
const BASE = process.env.BASE || 'http://localhost:3000';
const db = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_org' + r, B = 'u_bea' + r, C = 'u_cal' + r, T = 'dectrip' + r;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const up = (u, data) => db(u, 'update', 'trips/' + T, data);
const allowed = res => res.status === 200, rejected = res => res.status === 403;
const days = ['2026-11-20', '2026-11-21', '2026-11-22'];
const P1 = { id: 'p1', city: 'Lisbon', start: days[0], end: days[2], perPerson: '€650–800' }, P2 = { id: 'p2', city: 'Porto', start: days[0], end: days[2], perPerson: '€300–350' };
const lockPitch = (u, p) => up(u, { destinations: [{ id: 'd1', city: 'Lisbon' }, { id: 'd2', city: 'Porto' }], lockedDest: p.id === 'p1' ? 'd1' : 'd2', lockedDates: { start: p.start, end: p.end } });
const reset = () => up(A, { lockedDest: null, lockedDates: null });
await db(A, 'set', 'trips/' + T, { name: 'Rules', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true, [C]: true }, destinations: [{ id: 'd1', city: 'Lisbon' }, { id: 'd2', city: 'Porto' }], pitches: { at: 1, items: [P1, P2] }, lockedDest: null, lockedDates: null });
await db(A, 'set', `trips/${T}/members/${A}`, { nick: 'Ari', status: 'in', days, votes: ['d1'] });
await db(B, 'set', `trips/${T}/members/${B}`, { nick: 'Bea', status: 'in', days, votes: ['d1'] });
await db(C, 'set', `trips/${T}/members/${C}`, { nick: 'Cal', status: 'in', days: days.slice(0, 2), budget: 500, hard: { budget: true } });

// who can lock
await up(A, { perm: { lock: 'org' } });
check('organizers-only: a member can’t lock where', rejected(await up(B, { lockedDest: 'd1' })));
check('organizers-only: a member can’t lock or switch the stay', rejected(await up(B, { stay: { name: 'Alfama flat' } })));
check('organizers-only: the organizer can', allowed(await up(A, { lockedDest: 'd1' })));
check('organizers-only: a member can’t unlock either', rejected(await up(B, { lockedDest: null })));
check('a member can still mark the stay booked', allowed(await up(A, { stay: { name: 'Alfama flat' } })) && allowed(await up(B, { stay: { booked: true, total: 900 } })));
await up(A, { perm: { lock: 'all' }, lockedDest: null });

// everyone gets a say (default style)
await up(B, { swipes: { p1: { [B]: -1 } } });
check('everyone gets a say: can’t lock a pitch someone passed on', rejected(await lockPitch(A, P1)));
check('everyone gets a say: can’t lock dates someone with free days can’t make', rejected(await up(A, { lockedDates: { start: days[0], end: days[2] } })));
check('…but can lock dates everyone can make', allowed(await up(B, { lockedDates: { start: days[0], end: days[1] } })));
await reset();

// a final-vote winner can be locked even with a pass
await up(A, { runoff: { key: 'ro1', ids: ['p1', 'p2'] } });
for (const u of [A, B, C]) await up(u, { roVotes: { ro1: { [u]: 'p2' } } });
await up(B, { swipes: { p2: { [B]: -1 } } });
check('a final-vote winner can be locked', allowed(await lockPitch(A, P2)));
await up(A, { runoff: null }); await reset();

// majority rules, and hard limits
await up(A, { decide: { style: 'majority', pct: 60 }, swipes: { p1: { [A]: 1 } } });
check('majority: not enough yes votes is rejected', rejected(await lockPitch(A, P1)));
await up(B, { swipes: { p1: { [B]: 1 } } });
const hard = await lockPitch(A, P1);
check('majority can’t override a hard budget limit', rejected(hard) && /hard limit/.test(hard.message), hard.message);
check('nobody can agree on someone else’s behalf', rejected(await up(B, { consent: { 'p:p1': { [C]: true } } })));
check('the person can agree for themselves', allowed(await up(C, { consent: { 'p:p1': { [C]: true } } })));
check('…then the majority can lock it', allowed(await lockPitch(A, P1)));
await reset();

// votes are personal
check('can’t swipe for someone else', rejected(await up(B, { swipes: { p2: { [C]: 1 } } })));
check('can’t vote in the final round for someone else', rejected(await up(B, { roVotes: { ro2: { [C]: 'p1' } } })));
check('can’t change someone else’s votes, days or limits', rejected(await db(B, 'update', `trips/${T}/members/${C}`, { votes: ['d2'] })) && rejected(await db(B, 'update', `trips/${T}/members/${C}`, { hard: { budget: false } })));
check('your own votes still work', allowed(await up(B, { swipes: { p2: { [B]: 1 } } })) && allowed(await db(B, 'update', `trips/${T}/members/${B}`, { votes: ['d2'] })));
check('marking someone as dropped out still works', allowed(await db(B, 'update', `trips/${T}/members/${C}`, { status: 'out', droppedAt: Date.now() })));
await db(C, 'update', `trips/${T}/members/${C}`, { status: 'in' });

// just pick something
await up(A, { decide: { style: 'pick', by: '2020-01-01' } });
check('after the deadline, a member can’t pick', rejected(await up(B, { lockedDest: 'd2' })));
check('…an organizer can', allowed(await up(A, { lockedDest: 'd2' })));
await reset();

// the other write route: organizers replacing the whole plan document
const doc = (await db(A, 'get', 'trips/' + T)).data;
await up(A, { decide: { style: 'majority', pct: 50 }, consent: { 'p:p1': { [C]: null } } });
check('replacing the whole plan can’t skip the rules', rejected(await db(A, 'set', 'trips/' + T, { ...doc, decide: { style: 'majority', pct: 50 }, consent: {}, lockedDest: 'd1', lockedDates: { start: days[0], end: days[2] } })));

await db(A, 'delete', 'trips/' + T);
console.log(fails ? `${fails} FAILED` : 'decision rule checks passed'); process.exit(fails ? 1 : 0);

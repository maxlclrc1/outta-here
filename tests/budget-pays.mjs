// Part of npm test / npm run test:server (runs against a throwaway server).
// Budgets follow the plan's who-pays setting (lib/pays.ts), in the budget check, the AI's spending cap
// (the band) and the hard-limit rule on locking. Splitting: everyone's own budget. One person paying:
// only theirs, as a total for the group split over the headcount; other people's old budgets and hard
// limits no longer count. A company paying: no personal budgets count. Saved budgets aren't changed.
import { install } from './_identity.mjs'; install(); // act as the test's people (see the file)
const BASE = process.env.BASE || 'http://localhost:3000';
const db = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const fit = (u, tid, checks) => fetch(BASE + '/api/budget', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ tid, checks }) }).then(r => r.json());
const r = Math.random().toString(36).slice(2, 8), A = 'u_ana0' + r, B = 'u_ben0' + r, C = 'u_cy00' + r, T = 'bpays' + r;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const days = ['2026-11-20', '2026-11-21', '2026-11-22'], P1 = { id: 'p1', city: 'Lisbon', start: days[0], end: days[2], perPerson: '$650–800' };
const up = data => db(A, 'update', 'trips/' + T, data);
const lock = () => up({ lockedDest: 'd1', lockedDates: { start: P1.start, end: P1.end } }), unlock = () => up({ lockedDest: null, lockedDates: null });
const check1 = async () => { const x = await fit(A, T, [{ pitch: 'p1', key: 'p:p1' }]); return { ...x.results[0], band: x.band }; };
const counts = x => `n=${x.n} fits=${x.fits.count} stretch=${x.stretch.count} over=${x.over.count} hard=${x.hard.count} band=${x.band ? x.band.lo + '–' + x.band.hi : 'none'}`;

await db(A, 'set', 'trips/' + T, { name: 'Who pays', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true, [C]: true }, destinations: [{ id: 'd1', city: 'Lisbon' }], pitches: { at: 1, items: [P1] }, lockedDest: null, lockedDates: null });
await db(A, 'set', `trips/${T}/members/${A}`, { nick: 'Ana', status: 'in', days, budget: 2000 });
await db(B, 'set', `trips/${T}/members/${B}`, { nick: 'Ben', status: 'in', days, budget: 300, hard: { budget: true } });
await db(C, 'set', `trips/${T}/members/${C}`, { nick: 'Cy', status: 'in', days, budget: 1000 });

// splitting (no setting): as before
{ const x = await check1(); check('split: everyone’s budget counts per person (Ben’s $300 is over, and it’s a hard limit)', x.n === 3 && x.fits.count === 2 && x.over.count === 1 && x.hard.count === 1 && x.band.lo <= 300 && x.band.hi > 300, counts(x)); }
{ const x = await lock(); check('split: locking a $650 trip is blocked by Ben’s hard limit', x.status === 403 && /hard limit/.test(x.message || ''), x.message); }

// one person (Ana) pays: her $2,000 is the total for 3 people, about $667 each; Ben's and Cy's don't count
await up({ pays: 'one', payer: A });
{ const x = await check1(); check('one payer: only Ana’s budget counts, as $2,000 ÷ 3 ≈ $667 a person (a stretch for $650–800)', x.n === 1 && x.stretch.count === 1 && x.over.count === 0 && x.hard.count === 0 && x.band.lo <= 667 && x.band.hi > 667, counts(x)); }
{ const x = await lock(); check('one payer: Ben’s old hard limit no longer blocks locking', x.status === 200, x.message); await unlock(); }
await db(A, 'update', `trips/${T}/members/${A}`, { budget: 1500, hard: { budget: true } });
{ const x = await lock(); check('one payer: the payer’s own hard limit does ($1,500 ÷ 3 = $500 a person, under $650)', x.status === 403 && /hard limit/.test(x.message || ''), x.message); }
await db(A, 'update', `trips/${T}/members/${A}`, { budget: 2000, hard: { budget: false } });
check('…and nobody’s saved budget was changed', (await db(B, 'get', `trips/${T}/members/${B}`)).data?.budget === 300 && (await db(C, 'get', `trips/${T}/members/${C}`)).data?.budget === 1000);
await up({ payer: C });
{ const x = await check1(); check('one payer: changing the payer to Cy uses Cy’s budget instead ($1,000 ÷ 3 ≈ $333, over)', x.n === 1 && x.over.count === 1 && x.band.lo <= 333 && x.band.hi > 333, counts(x)); }

// a company pays: no personal budgets
await up({ pays: 'company' });
{ const x = await check1(); check('company: no personal budgets count, and the AI gets no cap', x.n === 0 && x.hard.count === 0 && !x.band, counts(x)); }
{ const x = await lock(); check('company: nobody’s hard limit blocks locking', x.status === 200, x.message); await unlock(); }

// back to splitting
await up({ pays: 'split' });
{ const x = await check1(); check('back to split: everyone’s budgets and Ben’s hard limit are back', x.n === 3 && x.hard.count === 1, counts(x)); }
{ const x = await lock(); check('…and he blocks the lock again', x.status === 403); }

await fetch(BASE + '/api/plans/' + T, { method: 'DELETE', headers: { 'x-outta-user': A } });
process.exit(fails ? 1 : 0);

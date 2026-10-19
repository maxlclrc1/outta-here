// Part of npm test / npm run test:server (runs against a throwaway server). To run alone:
// BASE=http://localhost:3000 node --experimental-strip-types tests/plan-integrity.mjs
// (loads lib/integrity.ts for the older-data checks: records saved before these rules can't be made
// through the API any more, so their handling is checked on the rule itself)
// A plan's saved data stays consistent with itself, whatever the app sends:
// 1. free days in at most four ranges per person (older records with more can still be edited);
// 2. a locked place is always one of the ideas (removing it unlocks it; nothing else is locked);
// 3. switching between a dinner/day out and a weekend/trip doesn't carry over the other kind's
//    pitches, final vote or locks; ideas and votes stay.
import { install } from './_identity.mjs'; install(); // act as the test's people (see the file)
import { rangeCount, rangeLimitError, keepDecisionsValid } from '../lib/integrity.ts';
const BASE = process.env.BASE || 'http://localhost:3000';
const db = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_org' + r, B = 'u_bea' + r;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const span = (a, z) => { const o = []; for (let d = new Date(a + 'T00:00:00Z'); d <= new Date(z + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) o.push(d.toISOString().slice(0, 10)); return o; };
const rs = (...pairs) => pairs.flatMap(([a, z]) => span(a, z));
const plan = async (T, extra = {}) => { await db(A, 'set', 'trips/' + T, { name: 'Plan', size: 'weekend', nights: 2, winStart: '2026-11-01', winEnd: '2026-11-30', destinations: [{ id: 'd1', city: 'Lisbon' }, { id: 'd2', city: 'Porto' }], people: { [A]: true, [B]: true }, createdBy: A, createdAt: Date.now(), ...extra });
  for (const [u, nick] of [[A, 'Ali'], [B, 'Bea']]) await db(u, 'set', `trips/${T}/members/${u}`, { nick, status: 'in', days: span('2026-11-20', '2026-11-22'), votes: ['d2'] }); };
const get = async T => (await db(A, 'get', 'trips/' + T)).data;

// —— 1. four ranges ——
{ const T = 'pi1' + r; await plan(T); const me = `trips/${T}/members/${B}`;
  const four = rs(['2026-11-02', '2026-11-03'], ['2026-11-10', '2026-11-12'], ['2026-11-17', '2026-11-17'], ['2026-11-25', '2026-11-26']);
  check('four separate ranges save', (await db(B, 'update', me, { days: four })).status === 200 && rangeCount((await db(B, 'get', me)).data.days) === 4);
  const five = [...four, '2026-11-29'], x = await db(B, 'update', me, { days: five, flex: { late: true } });
  const after = (await db(B, 'get', me)).data;
  check('a fifth separate range is refused, with the reason', x.status === 400 && /up to 4 date ranges/.test(x.message), `${x.status} ${x.message}`);
  check('…and nothing in that write is saved (not the days, not what came with them)', after.days.join() === four.join() && !after.flex?.late, after.days.length);
  check('…on a whole-record save too', (await db(B, 'set', me, { nick: 'Bea', status: 'in', days: five })).status === 400);
  const touching = [...four, ...span('2026-11-04', '2026-11-05'), ...span('2026-11-11', '2026-11-14')];
  check('ranges that overlap or touch an existing one are the same range, so they save, every day kept', (await db(B, 'update', me, { days: touching })).status === 200 && [...new Set((await db(B, 'get', me)).data.days)].sort().join() === [...new Set(touching)].sort().join() && rangeCount(touching) === 4);
  check('fewer ranges always save', (await db(B, 'update', me, { days: four.slice(0, 2) })).status === 200); }
// older records with more than four
{ const six = rs(['2026-11-01', '2026-11-01'], ['2026-11-03', '2026-11-03'], ['2026-11-05', '2026-11-05'], ['2026-11-07', '2026-11-07'], ['2026-11-09', '2026-11-09'], ['2026-11-11', '2026-11-11']);
  check('an older record with six ranges can be saved as it is', rangeLimitError(six, six) === '');
  check('…edited without adding a range (one removed, one changed)', rangeLimitError(six.slice(1), six) === '' && rangeLimitError([...six.slice(0, 5), '2026-11-13'], six) === '');
  check('…but not given a seventh', /up to 4/.test(rangeLimitError([...six, '2026-11-20'], six)));
  check('days in any order, repeated, are counted once', rangeCount(['2026-11-03', '2026-11-01', '2026-11-02', '2026-11-02']) === 1 && rangeCount(['2026-11-30', '2026-12-01']) === 1); }

// —— 2. the locked place ——
{ const T = 'pi2' + r; await plan(T, { lockedDest: 'd2' });
  await db(B, 'update', 'trips/' + T, { destinations: [{ id: 'd2', city: 'Porto' }] });
  check('removing an idea that isn’t locked leaves the lock alone', (await get(T)).lockedDest === 'd2');
  // Bea's screen didn't know Porto was locked: she sends only the ideas
  await db(B, 'update', 'trips/' + T, { destinations: [{ id: 'd3', city: 'Madrid' }] });
  { const t = await get(T); check('removing the locked idea unlocks it, and nothing else is locked', t.lockedDest === null && t.destinations.length === 1, JSON.stringify(t.lockedDest)); }
  const x = await db(A, 'update', 'trips/' + T, { lockedDest: 'gone' });
  check('locking a place that isn’t an idea is refused', x.status === 409 && (await get(T)).lockedDest === null, `${x.status} ${x.message}`); }
{ const T = 'pi3' + r; await plan(T, { lockedDest: 'd2', perm: { lock: 'org' } });
  const x = await db(B, 'update', 'trips/' + T, { destinations: [{ id: 'd1', city: 'Lisbon' }] });
  check('where only organizers change decisions, someone else can’t unlock by removing the idea', x.status === 403 && (await get(T)).lockedDest === 'd2' && (await get(T)).destinations.length === 2, `${x.status} ${x.message}`); }
// older plans that already point at a missing place
{ const prev = { size: 'weekend', destinations: [{ id: 'd1', city: 'Lisbon' }], lockedDest: 'old' };
  const v = keepDecisionsValid(prev, { name: 'x' }, { ...prev, name: 'x' });
  check('an older plan’s missing lock is cleared after the write is allowed (it isn’t anyone’s decision)', !('lockedDest' in v.data) && v.cleanup?.lockedDest === null && !v.refuse);
  const w = keepDecisionsValid(prev, { lockedDest: 'd1' }, { ...prev, lockedDest: 'd1' });
  check('…and locking a real idea on it works as usual', w.data.lockedDest === 'd1' && !w.cleanup && !w.refuse); }

// —— 3. changing the kind of plan ——
const tripPitch = { id: 'tp', city: 'Porto', start: '2026-11-20', end: '2026-11-22', perPerson: '$400' }, dinnerPitch = { id: 'sp', small: true, title: 'Tacos', city: 'Tacos', start: '2026-11-20', end: '2026-11-20', time: '19:30' };
{ const T = 'pi4' + r; await plan(T, { lockedDest: 'd2', lockedDates: { start: '2026-11-20', end: '2026-11-22' }, pitches: { at: 1, items: [tripPitch] }, swipes: { tp: { [A]: 1 } } });
  await db(A, 'update', 'trips/' + T, { size: 'hangout', nights: 0 });
  const t = await get(T);
  check('trip → dinner: the trip’s pitches and final vote are cleared, the place and dates unlocked', !t.pitches && !t.runoff && t.lockedDest === null && t.lockedDates === null, JSON.stringify({ p: t.pitches, d: t.lockedDest, L: t.lockedDates }));
  check('…ideas and votes stay', t.destinations.length === 2 && (await db(A, 'get', `trips/${T}/members/${B}`)).data.votes.includes('d2'));
  check('…and reopening it reads the same', (await get(T)).size === 'hangout' && !(await get(T)).pitches);
  await db(A, 'update', 'trips/' + T, { pitches: { at: 2, items: [dinnerPitch] }, lockedDest: 'd1', lockedDates: { start: '2026-11-20', end: '2026-11-20' }, time: '19:30', venue: 'Taqueria' });
  await db(A, 'update', 'trips/' + T, { size: 'trip', nights: 3 });
  const u = await get(T);
  check('dinner → trip: the dinner’s pitches, time and venue are cleared, the place and day unlocked', !u.pitches && u.lockedDest === null && u.lockedDates === null && u.time === '' && u.venue === '', JSON.stringify({ p: u.pitches, t: u.time, v: u.venue }));
  await db(A, 'update', 'trips/' + T, { pitches: { at: 3, items: [tripPitch] }, lockedDest: 'd2' });
  await db(A, 'update', 'trips/' + T, { size: 'weekend', nights: 2 });
  check('within a kind (trip → weekend), the pitches and the lock stay', (await get(T)).pitches?.items?.length === 1 && (await get(T)).lockedDest === 'd2'); }
{ const T = 'pi5' + r; await plan(T, { lockedDest: 'd2', perm: { lock: 'org' } });
  const x = await db(B, 'update', 'trips/' + T, { size: 'hangout', nights: 0 });
  check('where only organizers change decisions, someone else can’t unlock by switching the kind of plan', x.status === 403 && (await get(T)).size === 'weekend', `${x.status} ${x.message}`); }

for (const T of ['pi1', 'pi2', 'pi3', 'pi4', 'pi5']) await fetch(`${BASE}/api/plans/${T}${r}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
console.log(fails ? `${fails} FAILED` : 'all plan integrity checks passed'); process.exit(fails ? 1 : 0);

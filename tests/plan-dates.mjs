// Part of npm test / npm run test:server (runs against a throwaway server). To run alone against
// your own running app instead (writes to its data/): BASE=http://localhost:3000 node <this file>
// A plan's dates (window, RSVP and voting deadlines, locked dates, pitch dates) must be real
// dates; bad ones get a 400 naming the field.
import { install } from './_identity.mjs'; install(); // act as the test's people (see the file)
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

// locked dates: null, or { start, end } with real dates, end on or after start
check('locking real dates works', (await call(A, 'update', P, { lockedDates: { start: '2026-11-05', end: '2026-11-08' } })).ok && (await get()).lockedDates.end === '2026-11-08');
check('a one-day lock (start = end) works', (await call(A, 'update', P, { lockedDates: { start: '2026-11-06', end: '2026-11-06' } })).ok);
check('unlocking with null works', (await call(A, 'update', P, { lockedDates: null })).ok && (await get()).lockedDates === null);
{
  const cases = [[{ start: '2026-11-31', end: '2026-12-02' }, 'lockedDates.start'], [{ start: '2026-11-05', end: 'soon' }, 'lockedDates.end'], [{ start: '2026-11-05' }, 'lockedDates.end'],
    [{ end: '2026-11-05' }, 'lockedDates.start'], [{ start: '2026-11-08', end: '2026-11-05' }, 'lockedDates.end'], [{ start: '2026-11-05', end: '2026-11-08', at: 1 }, 'lockedDates'],
    ['2026-11-05', 'lockedDates'], [['2026-11-05', '2026-11-08'], 'lockedDates'], [{ start: 20261105, end: 20261108 }, 'lockedDates.start'], [{}, 'lockedDates.start']];
  const wrong = [];
  for (const [v, field] of cases) { const x = await call(A, 'update', P, { lockedDates: v }); if (!(x.status === 400 && x.code === 'invalid_argument' && x.message.includes(field))) wrong.push(JSON.stringify(v) + '→' + x.status + ' ' + x.message); }
  check('lockedDates: every malformed value gets a 400 naming the field', !wrong.length, wrong.join(' | '));
  check('…and the plan stays unlocked', (await get()).lockedDates === null);
}
{ const x = await call(A, 'set', 'trips/y' + T, { ...base, lockedDates: { start: 'x', end: 'y' } }); check('a new plan with bad locked dates isn’t created', x.status === 400 && !(await call(A, 'get', 'trips/y' + T)).exists); }

// pitch dates: optional, but real dates when present
const pitch = (id, extra) => ({ id, city: 'City ' + id, perPerson: '$300', ...extra });
check('pitches with real dates save', (await call(A, 'update', P, { pitches: { at: 1, items: [pitch('p1', { start: '2026-11-05', end: '2026-11-08' }), pitch('p2', { small: true, title: 'Bowling', start: '2026-11-06', end: '2026-11-06', time: '19:00' })] } })).ok);
check('pitches with no dates (or null) still save', (await call(A, 'update', P, { pitches: { at: 2, items: [pitch('p3'), pitch('p4', { start: null, end: null })] } })).ok);
{
  const cases = [[{ start: '2026-11-31', end: '2026-12-02' }, 'pitches.items[1].start'], [{ start: '2026-11-05', end: 'Nov 8' }, 'pitches.items[1].end'], [{ start: '', end: '2026-11-08' }, 'pitches.items[1].start'],
    [{ start: '2026-11-08', end: '2026-11-05' }, 'pitches.items[1].end'], [{ start: 20261105 }, 'pitches.items[1].start']];
  const wrong = [];
  for (const [v, field] of cases) { const x = await call(A, 'update', P, { pitches: { at: 3, items: [pitch('p5', { start: '2026-11-05', end: '2026-11-08' }), pitch('p6', v)] } }); if (!(x.status === 400 && x.code === 'invalid_argument' && x.message.includes(field))) wrong.push(JSON.stringify(v) + '→' + x.status + ' ' + x.message); }
  check('pitch dates: every malformed value gets a 400 naming the pitch and field', !wrong.length, wrong.join(' | '));
  check('…and the stored pitches are unchanged', (await get()).pitches.items.map(x => x.id).join() === 'p3,p4');
}
{ const x = await call(A, 'update', P, { pitches: { at: 4, items: [pitch('p3'), pitch('p7', { start: 'bad', end: 'bad' })] }, _base: { 'pitches.items': { ids: ['p3', 'p4'], changed: ['p7'] } } }); check('…also when a pitch list is merged with others’ edits', x.status === 400 && /pitches\.items\[1\]\.start/.test(x.message)); }
// the normal flow: a round of pitches, then locking the winner's place and dates together
await call(A, 'update', P, { winStart: '2026-11-01', winEnd: '2026-11-30', decide: { style: 'all', by: '' }, destinations: [{ id: 'd1', city: 'Lisbon' }], pitches: { at: 5, items: [pitch('pl', { city: 'Lisbon', start: '2026-11-12', end: '2026-11-15' })] } });
check('locking a pitch’s place and dates still works', (await call(A, 'update', P, { lockedDest: 'd1', lockedDates: { start: '2026-11-12', end: '2026-11-15' } })).ok && (await get()).lockedDates.start === '2026-11-12');

// clearing optional deadlines
check('the RSVP deadline can be cleared with null', (await call(A, 'update', P, { rsvpBy: null })).ok && (await get()).rsvpBy === null);
check('…or with an empty value', (await call(A, 'update', P, { rsvpBy: '' })).ok);
check('the voting deadline can be cleared', (await call(A, 'update', P, { decide: { by: '' } })).ok && (await get()).decide.by === '');
check('other changes to the plan still save normally', (await call(A, 'update', P, { name: 'Renamed' })).ok && (await get()).name === 'Renamed');
await call(A, 'delete', P); await call(A, 'delete', 'trips/y' + T);
process.exit(fails ? 1 : 0);

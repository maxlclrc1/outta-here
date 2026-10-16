// Run with the app running (npm run dev): npm run test:server
// (uses node --experimental-strip-types to load lib/changelog.ts for the legacy-plan checks)
// The change log stays bounded without breaking recent undo or losing plan data (finding #11).
import { boundLog, LOG_LIMITS } from '../lib/changelog.ts';
const BASE = process.env.BASE || 'http://localhost:3000';
const db = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_ari' + r;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const size = v => JSON.stringify(v).length, kb = n => Math.round(n / 1024) + ' KB';
const stop = (i, pad = 0) => ({ id: 's' + i, date: '2026-11-21', time: '12:00', title: 'Stop ' + i + ' ' + 'x'.repeat(pad), kind: 'plan' });
const entry = (i, extra = {}) => ({ text: 'Change ' + i, by: A, at: 1_000_000 + i, act: 'all', ...extra });
const plan = (T, extra) => db(A, 'set', 'trips/' + T, { name: 'Log', createdBy: A, createdAt: Date.now(), people: { [A]: true }, ...extra });
const get = async T => (await db(A, 'get', 'trips/' + T)).data;

// 1. only the newest entries are kept
const T1 = 'log1' + r;
await plan(T1, { changes: Object.fromEntries(Array.from({ length: 150 }, (_, i) => ['e' + i, entry(i)])) });
let t = await get(T1), ids = Object.keys(t.changes);
check(`at most ${LOG_LIMITS.maxEntries} entries are kept`, ids.length === LOG_LIMITS.maxEntries, `${ids.length} kept`);
check('…the newest ones', ids.includes('e149') && ids.includes('e50') && !ids.includes('e49'));

// 2. big undo copies: old ones are let go, the newest ones stay usable
const T2 = 'log2' + r, big = Array.from({ length: 12 }, (_, j) => stop(j, 300)); // ~4.5 KB per undo copy
await plan(T2, { itinerary: [stop(0)], changes: Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['u' + i, entry(i, { undo: { k: 'set', patch: { itinerary: big } } })])) });
t = await get(T2);
const withUndo = Object.entries(t.changes).filter(([, x]) => x.undo).map(([id]) => id);
check('the log stays within its budget', size(t.changes) <= LOG_LIMITS.maxBytes, kb(size(t.changes)));
check(`the newest ${LOG_LIMITS.keepUndo} undoable changes keep their undo`, Array.from({ length: LOG_LIMITS.keepUndo }, (_, k) => 'u' + (29 - k)).every(id => withUndo.includes(id)), withUndo.join(','));
check('…exactly as they were', JSON.stringify(t.changes.u29.undo.patch.itinerary) === JSON.stringify(big));
check('older entries are still listed, just without undo', !!t.changes.u5 && !t.changes.u5.undo && t.changes.u5.text === 'Change 5');

// 3. undo after trimming, the way the app does it
const u = t.changes.u29.undo;
const res = await db(A, 'update', 'trips/' + T2, { ...u.patch, changes: { u29: { undone: { by: A, at: Date.now() } }, z1: entry(999, { text: 'Undone: Change 29' }) } });
t = await get(T2);
check('undo still works after trimming', res.status === 200 && t.itinerary.length === 12 && t.changes.u29.undone);
check('…and the used undo copy is let go', !t.changes.u29.undo);

// 4. a save near the size limit trims the log instead of failing, and keeps every stop
const T3 = 'log3' + r, stops = Array.from({ length: 120 }, (_, i) => stop(i, 1500)); // ~190 KB of real plan
await plan(T3, { itinerary: stops });
for (let i = 0; i < 4; i++) await db(A, 'update', 'trips/' + T3, { changes: Object.fromEntries(Array.from({ length: 10 }, (_, j) => ['n' + i + j, entry(i * 10 + j, { undo: { k: 'item', item: stop(j, 1500) } })])) });
const near = await db(A, 'update', 'trips/' + T3, { name: 'Still saving' });
t = await get(T3);
check('a plan near the limit still saves', near.status === 200 && t.name === 'Still saving', `${kb(size(t))} stored`);
check('…with every stop intact', t.itinerary.length === 120 && JSON.stringify(t.itinerary) === JSON.stringify(stops));

// 5. if the real plan is too big, the save is refused clearly and nothing is lost
const tooBig = await db(A, 'update', 'trips/' + T3, { itinerary: [...stops, ...Array.from({ length: 60 }, (_, i) => stop(200 + i, 1500))] });
const after = await get(T3);
check('a plan whose own data is too big gets a clear error', tooBig.status === 400 && /256 KiB/.test(tooBig.message), tooBig.message);
check('…and nothing already saved is dropped', after.itinerary.length === 120 && after.name === 'Still saving');

// 6. older plans that already went over the limit (the server never stores these now, so
// this checks the trimming itself): they come back under, with all real data kept
const legacy = { name: 'Old plan', createdBy: A, itinerary: stops.slice(0, 60), changes: Object.fromEntries(Array.from({ length: 400 }, (_, i) => ['l' + i, entry(i, { undo: { k: 'set', patch: { itinerary: big } }, seen: { [A]: true } })])) };
legacy.changes.orphan = { seen: { [A]: true } }; legacy.changes.l399.undone = { by: A, at: 1 };
const fixed = boundLog(legacy);
check('an oversized older plan comes back under the limit', size(legacy) > 256 * 1024 && size(fixed) < 256 * 1024, `${kb(size(legacy))} → ${kb(size(fixed))}`);
check('…with everything outside the log unchanged', JSON.stringify({ ...fixed, changes: 0 }) === JSON.stringify({ ...legacy, changes: 0 }));
check('…keeping undo for the newest changes that can still be undone', Array.from({ length: 10 }, (_, k) => 'l' + (398 - k)).every(id => fixed.changes[id]?.undo));
check('…and letting go of leftovers and used undo copies', !('orphan' in fixed.changes) && !fixed.changes.l399.undo);

for (const T of [T1, T2, T3]) await db(A, 'delete', 'trips/' + T);
console.log(fails ? `${fails} FAILED` : 'change log checks passed'); process.exit(fails ? 1 : 0);

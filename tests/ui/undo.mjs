// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Undo and Restore never erase edits made since: Ali (organizer) undoes changes while Bea edits
// the same plan from another browser. Covers the original data loss (undoing a date move used to
// put back the whole old itinerary, deleting stops added since), conflicts that must be refused,
// and ordinary undo.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const mk = async (name, link = '') => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(BASE + '/' + link); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p);
  return { p, uid: await p.evaluate(() => localStorage.outta_uid) };
};
const A = await mk('Ali');
await A.p.click('[data-act=newTrip]'); await settle(A.p); await A.p.click('[data-size=trip]'); await settle(A.p); await A.p.locator('[data-mode]').first().click(); await settle(A.p);
await A.p.fill('#nt-name', 'Lisbon'); await A.p.click('#newTrip [type=submit]'); await A.p.waitForSelector('.setup'); await A.p.click('[data-act=setupLater]'); await settle(A.p);
const tid = (await A.p.evaluate(() => location.hash)).slice(1), P = 'trips/' + tid;
const B = await mk('Bea', '#' + tid); await B.p.waitForSelector('.welcome'); await B.p.click('[data-join=in]'); await B.p.waitForTimeout(600);
const skip = B.p.locator('[data-act=setupLater]'); if (await skip.count()) await skip.click();
const stop = (id, title, date, time = '20:00') => ({ id, title, date, time, kind: 'food' });
await api(A.uid, 'update', P, { destinations: [{ id: 'd1', city: 'Lisbon' }], lockedDest: 'd1', lockedDates: { start: '2026-11-20', end: '2026-11-23' }, itinerary: [stop('i1', 'Fado', '2026-11-21'), stop('i2', 'Brunch', '2026-11-22', '11:00')] });
await A.p.waitForTimeout(900);
const plan = async () => (await api(A.uid, 'get', P)).data;
const entry = async re => Object.entries((await plan()).changes || {}).filter(([, x]) => re.test(x.text) && !x.undone).sort((a, b) => b[1].at - a[1].at)[0]?.[0];
// what the app sends when Bea edits the itinerary: only her items count as changed
const beaEdits = async fn => { const list = (await plan()).itinerary, next = fn(list.map(i => ({ ...i }))); await api(B.uid, 'update', P, { itinerary: next, _base: { itinerary: { ids: list.map(i => i.id), changed: next.filter(i => JSON.stringify(i) !== JSON.stringify(list.find(x => x.id === i.id))).map(i => i.id) } } }); await A.p.waitForTimeout(900); };
const toast = async () => (await A.p.locator('#toast').innerText().catch(() => '')).trim();
const undo = async re => {
  const id = await entry(re); if (!id) return 'no entry';
  await A.p.locator('.bottomnav [data-sec=home]').click(); await settle(A.p); await A.p.locator('.subtab[data-tab=log]').click(); await settle(A.p);
  await A.p.locator(`[data-undo="${id}"]`).dispatchEvent('click'); await A.p.waitForTimeout(1300); return toast();
};
const moveDates = async start => {
  await A.p.locator('.bottomnav [data-sec=home]').click(); await settle(A.p); await A.p.locator('.subtab[data-tab=overview]').click(); await settle(A.p);
  await A.p.locator('[data-recover=dates]').dispatchEvent('click'); await settle(A.p);
  await A.p.fill('#rc-start', start); await A.p.locator('#rc-start').blur(); await A.p.waitForTimeout(500);
  await A.p.locator('[data-act=recoverApply]').dispatchEvent('click'); await A.p.waitForTimeout(1200);
};
const its = t => t.itinerary.map(i => `${i.id}:${i.title}@${i.date}`).join(' ');

// 1. the original data loss: dates moved (itinerary shifted with them), Bea adds a stop, Ali undoes
await moveDates('2026-12-04');
{ const t = await plan(); expect('moving the dates shifts the itinerary', t.lockedDates.start === '2026-12-04' && t.itinerary.every(i => i.date >= '2026-12-04'), its(t)); }
await beaEdits(l => [...l, stop('i9', 'Boat trip', '2026-12-06')]);
{ const m = await undo(/^Dates moved|dates/i); const t = await plan();
  expect('undoing the date move puts the dates and shifted stops back', t.lockedDates.start === '2026-11-20' && t.itinerary.find(i => i.id === 'i1').date === '2026-11-21' && t.itinerary.find(i => i.id === 'i2').date === '2026-11-22', `${m} | ${its(t)}`);
  expect('…and keeps the stop Bea added since (this used to be deleted)', t.itinerary.some(i => i.id === 'i9' && i.title === 'Boat trip'), its(t)); }

// 2. conflict: dates moved, Bea renames a shifted stop, Ali's undo is refused
await moveDates('2026-12-10');
await beaEdits(l => l.map(i => i.id === 'i1' ? { ...i, title: 'Fado at Clube' } : i));
{ const before = await plan(), m = await undo(/dates/i), t = await plan();
  expect('undoing a date move after someone edited a shifted stop is refused, with a reason', /Couldn’t undo/.test(m) && /Fado at Clube/.test(m), m);
  expect('…and nothing changes: new dates and Bea’s rename stay', t.lockedDates.start === '2026-12-10' && its(t) === its(before) && t.itinerary.find(i => i.id === 'i1').title === 'Fado at Clube'); }

// 3. one stop: Ali moves it, Bea renames it, Ali's undo is refused
const editStop = async (id, time) => {
  await A.p.locator('.bottomnav [data-sec=plan]').click(); await settle(A.p); await A.p.locator('.subtab[data-tab=plan]').click(); await settle(A.p);
  await A.p.locator(`[data-edititem=${id}]`).dispatchEvent('click'); await settle(A.p); await A.p.fill('#ei-time', time); await A.p.locator('#editItemForm [type=submit]').click(); await A.p.waitForTimeout(1200);
};
await editStop('i2', '12:30');
await beaEdits(l => l.map(i => i.id === 'i2' ? { ...i, title: 'Late brunch' } : i));
{ const m = await undo(/Brunch/), t = await plan(), i2 = t.itinerary.find(i => i.id === 'i2');
  expect('undoing a stop move after someone edited that stop is refused, naming it as it is now', /Couldn’t undo: “Late brunch”/.test(m) && i2.title === 'Late brunch' && i2.time === '12:30', `${m} | ${i2.title} ${i2.time}`); }

// 4. ordinary undo of one stop, while Bea edits a different stop
await editStop('i1', '21:30');
await beaEdits(l => l.map(i => i.id === 'i2' ? { ...i, title: 'Lazy brunch' } : i));
{ const m = await undo(/Fado at Clube/), t = await plan();
  expect('undoing a stop move works and keeps Bea’s edit to another stop', t.itinerary.find(i => i.id === 'i1').time === '20:00' && t.itinerary.find(i => i.id === 'i2').title === 'Lazy brunch', `${m} | ${its(t)}`); }

// 5. restoring a deleted stop while Bea adds another
await A.p.locator('.bottomnav [data-sec=plan]').click(); await settle(A.p); await A.p.locator('.subtab[data-tab=plan]').click(); await settle(A.p);
await A.p.locator('[data-delitem=i2]').dispatchEvent('click'); await A.p.waitForTimeout(1200);
await beaEdits(l => [...l, stop('i7', 'Tram 28', '2026-12-11')]);
{ const m = await undo(/Lazy brunch/), t = await plan(); expect('restoring a deleted stop brings it back and keeps the stop added since', t.itinerary.some(i => i.id === 'i2' && i.title === 'Lazy brunch') && t.itinerary.some(i => i.id === 'i7'), `${m} | ${its(t)}`); }

// 6. a field: Ali unlocks the dates, Bea locks other dates, Ali's undo is refused; then ordinary undo
await A.p.locator('.bottomnav [data-sec=plan]').click(); await settle(A.p); await A.p.locator('.subtab[data-tab=dates]').click(); await settle(A.p);
await A.p.locator('[data-act=unlockDates]').first().dispatchEvent('click'); await A.p.waitForTimeout(1200);
await api(B.uid, 'update', P, { lockedDates: { start: '2026-12-12', end: '2026-12-14' } }); await A.p.waitForTimeout(900);
{ const m = await undo(/Dates unlocked/), t = await plan(); expect('undoing an unlock after someone locked other dates is refused; their dates stay', /Couldn’t undo: the locked dates/.test(m) && t.lockedDates.start === '2026-12-12', `${m} | ${JSON.stringify(t.lockedDates)}`); }
await A.p.locator('.bottomnav [data-sec=plan]').click(); await settle(A.p); await A.p.locator('.subtab[data-tab=dates]').click(); await settle(A.p);
await A.p.locator('[data-act=unlockDates]').first().dispatchEvent('click'); await A.p.waitForTimeout(1200);
{ const m = await undo(/Dates unlocked/), t = await plan(); expect('ordinary undo of an unlock locks the dates again', t.lockedDates?.start === '2026-12-12', `${m} | ${JSON.stringify(t.lockedDates)}`); }

// 7. entries saved before this change (no record of what they changed)
await api(A.uid, 'update', P, { changes: {
  old1: { text: 'Old itinerary change', area: 'plan', by: A.uid, at: Date.now(), act: 'all', undo: { k: 'set', patch: { itinerary: [stop('i1', 'Fado', '2026-11-21')] } } },
  old2: { text: 'Old currency change', area: 'money', by: A.uid, at: Date.now(), act: '', undo: { k: 'set', patch: { currency: 'GBP' } } } } });
await A.p.waitForTimeout(900);
{ const m = await undo(/Old itinerary change/), t = await plan(); expect('an old whole-itinerary undo is refused instead of replacing the itinerary', /can’t be undone safely/.test(m) && t.itinerary.length >= 4, `${m} | ${t.itinerary.length} stops`); }
{ const m = await undo(/Old currency change/), t = await plan(); expect('an old simple undo with nothing changed since still works', t.currency === 'GBP', `${m} | ${t.currency}`); }

await api(A.uid, 'delete', P);
console.log('errors', errs); await b.close();
process.exit(fails ? 1 : 0);

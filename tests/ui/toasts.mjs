// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Success messages only after the save worked. Every toast that appears is recorded (not just the
// last one), so a "Saved…" that flashes before an error is caught. Covers saving a crew (also when
// the plan can't be linked to it), editing a stop, removing someone and locking a pitch, each when
// the save works and when it fails.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(450));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const mk = async (name, hash = '') => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
  // every message the toast shows, in order
  await c.addInitScript(() => { window.__toasts = []; new MutationObserver(() => { const t = document.querySelector('#toast'); const v = t && t.textContent.trim(); if (v && window.__toasts[window.__toasts.length - 1] !== v) window.__toasts.push(v); }).observe(document, { subtree: true, childList: true, characterData: true }); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(BASE + '/' + hash); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p);
  return { p, c, id: await p.evaluate(() => localStorage.outta_uid) };
};
const go = async (p, sec, tab) => { await p.locator(`.bottomnav [data-sec=${sec}]`).click(); await settle(p); if (tab) { await p.locator(`.subtab[data-tab=${tab}]`).click(); await settle(p); } };
const newPlan = async (x, name) => {
  await x.p.locator('[data-act=home]').first().click().catch(() => {}); await settle(x.p);
  await x.p.click('[data-act=newTrip]'); await settle(x.p); await x.p.click('[data-size=trip]'); await settle(x.p); await x.p.locator('[data-mode]').first().click(); await settle(x.p);
  await x.p.fill('#nt-name', name); await x.p.click('#newTrip [type=submit]'); await x.p.waitForSelector('.setup'); await x.p.click('[data-act=setupLater]'); await settle(x.p);
  return (await x.p.evaluate(() => location.hash)).slice(1);
};
// run an action, optionally with saves to the plan failing, and return every toast shown
const run = async (x, tid, failing, fn) => {
  // start clean: the last step's toast may still be on screen
  await x.p.evaluate(() => { const t = document.querySelector('#toast'); if (t) { t.textContent = ''; t.hidden = true; } window.__toasts = []; });
  if (failing) await x.c.route('**/api/db', async r => { const q = JSON.parse(r.request().postData() || '{}'); if (q.op === 'update' && q.path === 'trips/' + tid) return r.fulfill({ status: 500, json: { code: 'unavailable', message: 'Store error' } }); r.fallback(); });
  try { await fn(); await x.p.waitForTimeout(1500); } finally { if (failing) await x.c.unroute('**/api/db'); }
  return x.p.evaluate(() => window.__toasts);
};
const failed = ts => ts.some(t => /couldn’t save|try again/i.test(t));

const A = await mk('Ana');
const T1 = await newPlan(A, 'Lisbon'), P1 = 'trips/' + T1;
const B = await mk('Ben', '#' + T1), C = await mk('Cat', '#' + T1);
for (const x of [B, C]) { await x.p.click('[data-join=in]'); await x.p.waitForTimeout(700); const sk = x.p.locator('[data-act=setupLater]'); if (await sk.count()) { await sk.click(); await settle(x.p); } }
await A.p.waitForTimeout(800);

// 1. saving a crew: when linking the plan fails, no "Saved…"; when it works, "Saved…"
await go(A.p, 'home', 'settings');
{ const ts = await run(A, T1, true, async () => { await A.p.fill('#crew-name', 'The Six'); await A.p.locator('#crewForm [type=submit]').click(); });
  expect('crew save that can’t link the plan: an error, and never “Saved…”', failed(ts) && !ts.some(t => /^Saved/.test(t)), JSON.stringify(ts));
  expect('…and the plan isn’t linked to a crew', !(await api(A.id, 'get', P1)).data.crewId); }
await go(A.p, 'home', 'settings');
{ const ts = await run(A, T1, false, async () => { await A.p.fill('#crew-name', 'The Six'); await A.p.locator('#crewForm [type=submit]').click(); });
  expect('crew save that works: “Saved…”', ts.some(t => /^Saved “The Six”/.test(t)) && !failed(ts), JSON.stringify(ts));
  expect('…and the plan is linked', !!(await api(A.id, 'get', P1)).data.crewId); }

// 2. editing a stop
await api(A.id, 'update', P1, { lockedDates: { start: '2026-11-20', end: '2026-11-22' }, destinations: [{ id: 'd1', city: 'Lisbon' }], itinerary: [{ id: 'i1', date: '2026-11-21', time: '20:00', title: 'Fado', kind: 'food' }] }); await A.p.waitForTimeout(900);
const editStop = async time => { await go(A.p, 'plan', 'plan'); await A.p.locator('[data-edititem=i1]').dispatchEvent('click'); await settle(A.p); await A.p.fill('#ei-time', time); await A.p.locator('#editItemForm [type=submit]').click(); };
{ const ts = await run(A, T1, true, () => editStop('21:30'));
  expect('editing a stop that fails to save: an error, and never “The crew sees it now”', failed(ts) && !ts.some(t => /crew sees it now/.test(t)), JSON.stringify(ts));
  expect('…and the stop is unchanged', (await api(A.id, 'get', P1)).data.itinerary[0].time === '20:00'); }
{ const ts = await run(A, T1, false, () => editStop('21:30'));
  expect('editing a stop that saves: its message', ts.some(t => /crew sees it now/.test(t)) && !failed(ts), JSON.stringify(ts)); }

// 3. removing someone
const remove = async who => { await go(A.p, 'home', 'crew'); await A.p.locator(`[data-rmmember="${who}"]`).first().dispatchEvent('click'); await settle(A.p); await A.p.locator(`[data-rmdo="${who}"]`).first().dispatchEvent('click'); };
{ const ts = await run(A, T1, true, () => remove(B.id));
  expect('removing someone when the plan can’t be saved: an error, and never “was removed”', failed(ts) && !ts.some(t => /was removed/.test(t)), JSON.stringify(ts)); }
{ const ts = await run(A, T1, false, () => remove(C.id));
  expect('removing someone that works: “was removed”', ts.some(t => /Cat was removed/.test(t)) && !failed(ts), JSON.stringify(ts)); }

// 4. locking a pitch everyone said yes to
const pitch = { id: 'p1', city: 'Porto', code: 'OPO', start: '2026-11-20', end: '2026-11-22', tagline: 'x', why: 'y', perPerson: '$300', vibeMatch: 80, highlights: [], weather: '' };
await api(A.id, 'update', P1, { lockedDates: null, lockedDest: null, pitches: { at: 1, items: [pitch] }, swipes: { p1: { [A.id]: 1 } } });
await api(B.id, 'update', P1, { swipes: { p1: { [B.id]: 1 } } }); await A.p.waitForTimeout(900);
const lock = async () => { await go(A.p, 'plan', 'match'); await A.p.locator('[data-lockpitch=p1]').first().dispatchEvent('click'); };
{ const ts = await run(A, T1, true, lock);
  expect('locking a pitch that fails to save: an error, and never “Locked:”', failed(ts) && !ts.some(t => /^Locked:/.test(t)), JSON.stringify(ts));
  expect('…and nothing is locked', !(await api(A.id, 'get', P1)).data.lockedDest); }
{ const ts = await run(A, T1, false, lock);
  expect('locking a pitch that saves: “Locked: Porto…”', ts.some(t => /^Locked: Porto/.test(t)) && !failed(ts), JSON.stringify(ts)); }
await api(A.id, 'delete', P1);
console.log('errors', errs); await b.close();
process.exit(fails ? 1 : 0);

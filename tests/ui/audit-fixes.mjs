// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Bugs found in the pre-launch audit, each pinned here:
// 1. A locked place that's no longer among the ideas (removed by someone whose screen didn't know it was
//    locked, or older saved data) was shown as locked with whichever idea led the vote. It reads as open.
// 2. A change that waits a moment before saving (a ★ favorite) was lost if the page was refreshed or
//    closed right away. Leaving the page now sends it.
// 3. Someone an organizer removed was counted as “Can’t go” in the headcount.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 240) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(450));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Maya'); await p.click('.join-card [type=submit]'); await settle(p);
const A = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), B = 'u_bea00' + r, tids = [];
const wk = ['2026-11-20', '2026-11-21', '2026-11-22'];
const mk = async (T, extra = {}) => { tids.push(T); await api(A, 'set', 'trips/' + T, { name: 'Cabin weekend', size: 'weekend', mode: 'friends', nights: 2, winStart: '2026-11-01', winEnd: '2026-11-30', destinations: [{ id: 'd1', city: 'Lisbon' }, { id: 'd2', city: 'Porto' }], itinerary: [], people: { [A]: true, [B]: true }, createdBy: A, createdAt: Date.now(), ...extra });
  for (const [u, nick] of [[A, 'Maya'], [B, 'Bea']]) await api(u, 'set', `trips/${T}/members/${u}`, { nick, status: 'in', seen: true, days: wk, votes: ['d1'], updatedAt: Date.now() }); };
const open = async T => { await p.goto(`${BASE}/#${T}`); await settle(p); await p.waitForSelector('.ov-hero'); await p.waitForTimeout(600); };
const txt = async s => (await p.locator(s).first().innerText()).replace(/\s+/g, ' ');

// —— 1. a locked place that's gone isn't shown as locked ——
{ const T = 'af1' + r; await mk(T, { lockedDest: 'd2', lockedDates: { start: wk[0], end: wk[2] } });
  await open(T); expect('locked: Porto is on', /It’s on/.test(await txt('.ovh-meta')) && /Porto/.test(await txt('.ovh-meta')));
  // Bea removes Porto from a screen that didn't know it was locked: only the ideas change
  await api(B, 'update', 'trips/' + T, { destinations: [{ id: 'd1', city: 'Lisbon' }] }); await p.waitForTimeout(1300); await settle(p);
  const m = await txt('.ovh-meta');
  expect('with Porto gone, the cover doesn’t claim Lisbon (the vote leader) is locked', !/It’s on/.test(m) && /where still open/i.test(m), m);
  expect('…the Where tile isn’t marked done', !(await p.locator('.glance[data-tab=match].g-done').count()));
  await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.click('.subtab[data-tab=match]'); await settle(p);
  expect('…and Trip Match isn’t “Decided”, so the place can be chosen again', !(await p.locator('.decided-sum').count()) && (await p.locator('[data-lockdest=d1]').count()) >= 1); }
{ const T = 'af2' + r; await mk(T, { lockedDest: 'old-id' }); await open(T);
  expect('older data pointing at a missing place opens as still choosing', /where still open|Picking where/i.test(await txt('.ovh-meta')) && !/Lisbon/.test(await txt('.ovh-meta')), await txt('.ovh-meta')); }

// —— 2. a change made just before a refresh is kept ——
// (its own browser context with no request routing: Playwright's routing cancels requests sent as a page unloads)
{ const T = 'af3' + r; await mk(T);
  const q = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); q.on('pageerror', e => errs.push(e.message));
  await q.goto(BASE + '/'); await q.fill('#join-name', 'Cy'); await q.click('.join-card [type=submit]'); await settle(q);
  const Q = await q.evaluate(() => localStorage.outta_uid);
  await api(A, 'update', 'trips/' + T, { people: { [Q]: true } }); await api(Q, 'set', `trips/${T}/members/${Q}`, { nick: 'Cy', status: 'in', seen: true, days: wk, updatedAt: Date.now() });
  await q.goto(`${BASE}/#${T}`); await settle(q); await q.waitForSelector('.ov-hero'); await q.waitForTimeout(600);
  await q.click('.bottomnav [data-sec=plan]'); await settle(q); await q.click('.subtab[data-tab=dates]'); await settle(q);
  await q.click('[data-act=starMode]'); await q.click('.avail .day[data-day="2026-11-21"]'); await q.waitForTimeout(100);
  await q.reload(); await settle(q); await q.waitForTimeout(900);
  const pref = (await api(Q, 'get', `trips/${T}/members/${Q}`)).data.pref || [];
  expect('a ★ favorite tapped right before refreshing is saved', pref.includes('2026-11-21'), JSON.stringify(pref)); }

// —— 3. a removed person isn't counted as “Can’t go” ——
{ const T = 'af4' + r; await mk(T); await open(T);
  await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.click('.subtab[data-tab=crew]'); await settle(p);
  const out = async () => (await p.locator('.hc .hc-b.lvl-out b').innerText()).trim();
  expect('before: nobody can’t go', (await out()) === '0', await out());
  await api(A, 'update', `trips/${T}/members/${B}`, { status: 'out', removed: true }); await p.waitForTimeout(1300); await settle(p);
  expect('after removing Bea: still nobody “can’t go”, and Going drops to 1', (await out()) === '0' && (await p.locator('.hc .hc-b.lvl-in b').innerText()).trim() === '1', await txt('.hc'));
  await api(A, 'update', `trips/${T}/members/${A}`, { status: 'out' }); await p.waitForTimeout(1300); await settle(p);
  expect('someone who says they can’t make it is still counted there', (await out()) === '1', await txt('.hc')); }

expect('no page errors', !errs.length, errs.join('; '));
for (const T of tids) await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// The app side of the plan integrity rules (the server side is tests/plan-integrity.mjs):
// 1. free days the server refuses (more than four ranges) say why, show what's actually saved, and
//    aren't retried forever;
// 2. switching a trip to a dinner and back starts the choosing again: no trip pitches on a dinner,
//    nothing shown as locked, ideas kept, the same after reopening;
// 3. older plans saved before these rules (a lock on a missing place, another kind's pitches) open as
//    still choosing, without the other kind's pitches.
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
  for (const [u, nick] of [[A, 'Maya'], [B, 'Bea']]) await api(u, 'set', `trips/${T}/members/${u}`, { nick, status: 'in', seen: true, days: wk, votes: ['d2'], updatedAt: Date.now() }); };
const open = async T => { await p.goto(`${BASE}/#${T}`); await p.reload(); await settle(p); await p.waitForSelector('.bottomnav'); if (!(await p.locator('.ov-hero').count())) { await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.click('.subtab[data-tab=overview]'); await settle(p); } await p.waitForSelector('.ov-hero'); await p.waitForTimeout(600); };
const go = async (sec, tab) => { await p.click(`.bottomnav [data-sec=${sec}]`); await settle(p); await p.click(`.subtab[data-tab=${tab}]`); await settle(p); };
const txt = async s => (await p.locator(s).first().innerText()).replace(/\s+/g, ' ');

// —— 1. a refused range write ——
{ const T = 'ui1' + r; await mk(T); await open(T); await go('plan', 'dates');
  let refused = 0;
  await p.route('**/api/db', async route => { const body = JSON.parse(route.request().postData() || '{}');
    if (body.op === 'update' && body.path === `trips/${T}/members/${A}` && body.data?.days) { refused++; return route.fulfill({ status: 400, json: { code: 'invalid_argument', message: 'You can add up to 4 date ranges. This has 5: change or remove one first.' } }); }
    return route.continue(); });
  await p.click('.avail .day[data-day="2026-11-03"]'); await p.click('.avail .day[data-day="2026-11-04"]'); await p.waitForTimeout(1500); await settle(p);
  expect('the server’s reason is shown', /up to 4 date ranges/.test(await p.locator('#toast').innerText()), await p.locator('#toast').innerText());
  expect('…and the calendar goes back to what’s saved', !/mine/.test(await p.locator('.avail .day[data-day="2026-11-03"]').getAttribute('class')) && /Nov 20 – Nov 22/.test(await txt('.avail .ranges')) && !/Nov 3/.test(await txt('.avail .ranges')), await txt('.avail .ranges'));
  // another change of your own (how flexible you are) saves your record again: the refused days mustn't go with it
  await p.locator('.dates-more summary').click(); await p.click('[data-flex=late]'); await p.waitForTimeout(1800);
  expect('…and the other change still saves', (await api(A, 'get', `trips/${T}/members/${A}`)).data.flex?.late === true);
  expect('…without sending the refused days again', refused === 1, refused);
  await p.unroute('**/api/db'); }

// —— 2. trip → dinner → trip ——
{ const T = 'ui2' + r; await mk(T, { size: 'trip', nights: 2, lockedDest: 'd2', lockedDates: { start: wk[0], end: wk[2] }, pitches: { at: 1, items: [{ id: 'tp', city: 'Porto', start: wk[0], end: wk[2], tagline: 'x', why: 'y', perPerson: '$400', highlights: [] }] } });
  await open(T); expect('a locked trip', /It’s on/.test(await txt('.ovh-meta')));
  await go('home', 'settings'); await p.click('[data-setsize=hangout]'); await p.waitForTimeout(1300); await settle(p);
  expect('switching to a dinner says what happened', /crew picks again/.test(await p.locator('#toast').innerText()) && /ideas and votes are kept/i.test(await p.locator('#toast').innerText()), await p.locator('#toast').innerText());
  const t = (await api(A, 'get', 'trips/' + T)).data;
  expect('…saved: no trip pitches, nothing locked, the ideas kept', t.size === 'hangout' && !t.pitches && !t.lockedDest && !t.lockedDates && t.destinations.length === 2);
  await open(T); expect('reopened, the dinner is still choosing (no place carried over as locked)', /Picking the plan and the day/.test(await txt('.ovh-meta')), await txt('.ovh-meta'));
  await go('plan', 'match'); expect('…and Plan Match has no trip pitches or “Decided”', !(await p.locator('#pitch, .decided-sum, .sb-row').count()));
  await api(A, 'update', 'trips/' + T, { lockedDest: 'd1', lockedDates: { start: wk[0], end: wk[0] }, time: '19:30', venue: 'Taqueria' }); await p.waitForTimeout(900);
  await go('home', 'settings'); await p.click('[data-setsize=trip]'); await p.waitForTimeout(1300); await settle(p);
  const u = (await api(A, 'get', 'trips/' + T)).data;
  expect('back to a trip: the dinner’s lock, time and venue are cleared', u.size === 'trip' && !u.lockedDest && !u.lockedDates && !u.time && !u.venue, JSON.stringify({ d: u.lockedDest, t: u.time }));
  await open(T); expect('…reopened, the trip is choosing where and when', /Picking where and when/.test(await txt('.ovh-meta')), await txt('.ovh-meta')); }

// —— 3. older plans, as they were saved before these rules ——
{ const T = 'ui3' + r; await mk(T, { size: 'hangout', nights: 0, lockedDates: { start: wk[0], end: wk[0] } });
  // what an older plan holds: a lock on a place that's gone, and a trip's pitches on what's now a dinner
  await p.route('**/api/db', async route => { const body = JSON.parse(route.request().postData() || '{}');
    if (body.op !== 'get' || body.path !== 'trips/' + T) return route.continue();
    const res = await route.fetch(), j = await res.json();
    if (j.data) Object.assign(j.data, { lockedDest: 'old-id', pitches: { at: 1, items: [{ id: 'tp', city: 'Porto', start: wk[0], end: wk[0], tagline: 'x', why: 'y', perPerson: '$400', highlights: [] }, { id: 'sp', small: true, title: 'Tacos', city: 'Tacos', where: 'Taqueria', start: wk[0], end: wk[0], time: '19:30', tagline: 'x', why: 'y', perPerson: '$20', highlights: [] }] } });
    return route.fulfill({ response: res, json: j }); });
  await open(T);
  expect('an older plan with a lock on a missing place opens as still choosing', !/It’s on/.test(await txt('.ovh-meta')) && /still open/.test(await txt('.ovh-meta')), await txt('.ovh-meta'));
  await go('plan', 'match');
  const shown = await p.locator('#pitch').getAttribute('data-pid').catch(() => '');
  expect('…and only the dinner’s own pitch is shown, not the trip’s', shown === 'sp' && !/Porto/.test(await p.locator('.sb-row').allInnerTexts().then(x => x.join(' '))), shown);
  await p.unroute('**/api/db'); }

expect('no page errors', !errs.length, errs.join('; '));
for (const T of tids) await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

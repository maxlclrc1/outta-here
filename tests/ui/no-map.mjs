// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// The crew map is postponed. Choosing where still works without it: browse the ideas, vote, lock one, and
// the plan home shows it. A plan saved with old map data (coordinates, pinned places) still opens, and no
// screen links to a map that isn't there: no Map tab, no "Crew map" button, no map quick action.
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
const A = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), B = `u_bea00${r}`, T = 'nm' + r, P = 'trips/' + T;
const wk = ['2026-11-20', '2026-11-21', '2026-11-22'];
const go = async (sec, tab) => { await p.click(`.bottomnav [data-sec=${sec}]`); await settle(p); if (tab) { await p.click(`.subtab[data-tab=${tab}]`); await settle(p); } };
// saved the way older plans were: pinned places and coordinates on the picks
await api(A, 'set', P, { name: 'Cabin weekend', size: 'weekend', mode: 'friends', nights: 2, winStart: '2026-11-01', winEnd: '2026-11-30', itinerary: [], people: { [A]: true, [B]: true }, createdBy: A, createdAt: Date.now(),
  destinations: [{ id: 'd1', city: 'Lisbon', by: B }, { id: 'd2', city: 'Porto', by: B }], lockedDates: { start: wk[0], end: wk[2] },
  geo: { wynwood: { name: 'Old pin', lat: 38.7, lng: -9.1, kind: 'activity' } }, spots: { city: 'Porto', at: 1, items: [{ name: 'Old Bar', type: 'bar', area: 'Ribeira', why: 'x', price: '$$', lat: 41.14, lng: -8.61 }] } });
for (const [u, nick] of [[A, 'Maya'], [B, 'Bea']]) await api(u, 'set', `${P}/members/${u}`, { nick, status: 'in', seen: true, days: wk, updatedAt: Date.now() });
await api(B, 'update', `${P}/members/${B}`, { votes: ['d2'] });
await p.goto(`${BASE}/#${T}`); await settle(p); await p.waitForSelector('.ov-hero');

// —— browse, vote, lock, without a map ——
await go('plan', 'match');
expect('the ideas are listed to compare and vote on', /Lisbon/.test(await p.locator('body').innerText()) && await p.locator('[data-vote=d2]').count() === 1);
await p.click('[data-vote=d2]'); await settle(p); await p.waitForTimeout(900);
expect('voting works', ((await api(A, 'get', `${P}/members/${A}`)).data.votes || []).includes('d2'));
await p.locator('[data-lockdest=d2]').first().click(); await settle(p); await p.waitForTimeout(1500);
const t = (await api(A, 'get', P)).data;
expect('locking works, and the dates stay as they were', t.lockedDest === 'd2' && t.lockedDates.start === wk[0], JSON.stringify({ d: t.lockedDest, L: t.lockedDates }));
await go('home', 'overview');
{ const m = (await p.locator('.ovh-meta').innerText()).replace(/\s+/g, ' ');
  expect('the plan home shows the decision', /It’s on/.test(m) && /Porto/.test(m), m); }

// —— nothing points at a map ——
const noMap = async where => expect(`${where}: no map tab or map button`, !(await p.locator('[data-tab=map], [data-act=pinPlaces], svg.map').count()) && !/Crew map|places pinned|Full map/i.test(await p.locator('body').innerText()));
await noMap('plan home');
await go('live'); expect('Live has Today, Bucket list and Hype, no Map', !/^Map$/m.test(await p.locator('.subtabs, [role=tablist]').first().innerText().catch(() => '')) && !(await p.locator('.subtab[data-tab=map]').count())); await noMap('Live');
await api(A, 'update', P, { stay: { name: 'Casa Azul', kind: 'rental', area: 'Ribeira', perNight: '$300', lat: 41.14, lng: -8.61 } }); await p.waitForTimeout(900);
await go('book', 'stays'); await noMap('a locked stay');
expect('…the stay still links out to find it', await p.locator('a', { hasText: 'Open in Maps' }).count() >= 1);
await go('plan', 'spots'); await noMap('picks saved with old coordinates');

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

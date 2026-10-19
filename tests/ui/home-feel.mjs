// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// The plan home is one big next move, then "The plan so far": a road of stages and the plan's tiles in one
// card, with every other step folded under "Everything else". Your answer isn't asked twice (when the
// next move is your RSVP, the ladder card is left out). Undecided tiles invite instead of listing what's
// missing. The milestone toast on the plan home just celebrates (the next move is already on screen),
// and reaching a new stage lights up the road once.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 220) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(450));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Maya'); await p.click('.join-card [type=submit]'); await settle(p);
const A = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), B = 'u_bea00' + r, T = 'hf' + r;
await api(A, 'set', 'trips/' + T, { name: 'Cabin weekend', size: 'weekend', mode: 'friends', nights: 2, winStart: '2026-11-01', winEnd: '2026-11-30', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true }, destinations: [], itinerary: [] });
await api(A, 'set', `trips/${T}/members/${A}`, { nick: 'Maya', status: 'in', seen: true, days: [], updatedAt: Date.now() });
await api(B, 'set', `trips/${T}/members/${B}`, { nick: 'Bea', status: 'in', seen: true, days: ['2026-11-20'], updatedAt: Date.now() });
const open = async () => { await p.goto(`${BASE}/#${T}`); await p.reload(); await settle(p); await p.waitForSelector('.ov-hero'); await p.waitForTimeout(500); };
await open();

// —— deciding ——
const blocks = await p.locator('#app > section, #app > div.journey > section, #app > .ov-folds').evaluateAll(els => els.filter(e => e.offsetParent !== null).map(e => e.className.split(' ').filter(c => /^(ov-|j-|card$)/.test(c)).join('.')));
expect('the plan home is the cover, the next move, the plan so far, you, and the folds', blocks.join(' | ') === 'ov-hero | j-focus | card.ov-progress.j-track | card.ov-me | ov-folds', blocks.join(' | '));
expect('the next move has an icon and one bright button', (await p.locator('.j-focus .j-ico').count()) === 1 && (await p.locator('.btn.primary:visible').count()) === 1);
expect('the tiles live inside “The plan so far”, with the road', (await p.locator('.ov-progress .glance-grid .glance').count()) === 4 && (await p.locator('.ov-progress .j-road li').count()) === 6 && /The plan so far/.test(await p.locator('.ovp-head').innerText()));
const tiles = (await p.locator('.glance b').allInnerTexts()).join(' | ');
expect('undecided tiles invite you in', tiles === 'Add your free days | Toss in an idea | Set yours | Add the first one', tiles);
expect('every other step is folded under “Everything else”', /Everything else/.test(await p.locator('.j-more summary').innerText()) && (await p.locator('.j-more:not([open])').count()) === 1 && !(await p.locator('.j-row:visible').count()));
await p.locator('.j-more summary').click(); await settle(p);
expect('…and opens to show them', (await p.locator('.j-row:visible').count()) >= 1);
expect('the folds sit side by side', await p.locator('.ov-folds > .ov-fold').evaluateAll(els => els.length === 2 && Math.abs(els[0].getBoundingClientRect().top - els[1].getBoundingClientRect().top) < 2));

// —— dates locked: the next move is confirming, so the ladder isn't repeated; a new stage lights up ——
const wk = ['2026-11-20', '2026-11-21', '2026-11-22']; await api(A, 'update', `trips/${T}/members/${A}`, { days: wk }); await api(B, 'update', `trips/${T}/members/${B}`, { days: wk });
await api(A, 'update', 'trips/' + T, { destinations: [{ id: 'd1', city: 'Catskills' }], lockedDest: 'd1', lockedDates: { start: '2026-11-20', end: '2026-11-22' } });
// as if this device last saw the plan while it was still deciding
await p.waitForTimeout(800); await p.evaluate(t => localStorage.setItem('outta_stage_' + t, '1'), T);
await p.reload(); await settle(p); await p.waitForSelector('.ov-hero'); await p.waitForTimeout(500);
expect('when the next move is your own answer, it’s asked once', /Lock in that you’re coming/.test(await p.locator('.j-focus h2').innerText()) && !(await p.locator('.ov-me, .crew-now .ladder').count()) && (await p.locator('.j-focus [data-status=confirmed]').count()) === 1);
expect('reaching a new stage lights up the road', (await p.locator('.j-road.leveled li.j-cur').count()) === 1 && /New stage/.test(await p.locator('.ovp-head').innerText()));
expect('decided tiles are marked done', (await p.locator('.glance.g-done').count()) === 2);
await open();
expect('…only once', !(await p.locator('.j-road.leveled').count()));
await p.locator('.j-focus [data-status=confirmed]').click(); await settle(p); await p.waitForTimeout(400);
expect('confirming saves as before', (await api(A, 'get', `trips/${T}/members/${A}`)).data.status === 'confirmed');
expect('…and the ladder comes back (in who’s coming) once it’s no longer the next move', (await p.locator('.ov-me .ladder, .crew-now .ladder').count()) === 1);
// a milestone reached while on the plan home only celebrates
await p.evaluate(() => showMilestone('Dates locked', { k: 'confirm', label: 'Confirm you’re coming' })).catch(() => {});
await api(B, 'update', `trips/${T}/members/${B}`, { status: 'confirmed', updatedAt: Date.now() }); await p.waitForTimeout(1500);
expect('a milestone on the plan home has no second “Go” button', !(await p.locator('.milestone [data-ms-go]').count()) || !(await p.locator('.milestone .ms-next').count()));

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Adding free days takes a tap, not a form. When someone else can already do a window you haven't
// answered for, one "Works for me" adds those days. A tap marks a day free and another takes it off
// (★ Favorites mode stars days instead, keeping the saved `pref` list). Your days are solid, friends'
// show as dots. A saved count and "Back to the plan" confirm it; the trip window and flexibility settings
// are folded away (open when the window needs fixing). Days already saved, stars included, are kept.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 220) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(450));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Maya'); await p.click('.join-card [type=submit]'); await settle(p);
const A = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), B = 'u_bea00' + r, T = 'fd' + r;
const wk = ['2026-11-20', '2026-11-21', '2026-11-22'];
await api(A, 'set', 'trips/' + T, { name: 'Cabin weekend', size: 'weekend', mode: 'friends', nights: 2, winStart: '2026-11-01', winEnd: '2026-11-30', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true }, destinations: [], itinerary: [] });
// Maya saved one day with a star before; Bea can do the weekend of the 20th
await api(A, 'set', `trips/${T}/members/${A}`, { nick: 'Maya', status: 'in', seen: true, days: ['2026-11-05'], pref: ['2026-11-05'], updatedAt: Date.now() });
await api(B, 'set', `trips/${T}/members/${B}`, { nick: 'Bea', status: 'in', seen: true, days: wk, updatedAt: Date.now() });
await p.goto(`${BASE}/#${T}`); await settle(p); await p.waitForSelector('.bottomnav');
await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.click('.subtab[data-tab=dates]'); await settle(p);
const mine = async () => (await api(A, 'get', `trips/${T}/members/${A}`)).data;
const day = d => p.locator(`.avail .day[data-day="${d}"]`);

expect('days already saved show, with their star', /mine/.test(await day('2026-11-05').getAttribute('class')) && (await day('2026-11-05').locator('.star').count()) === 1);
expect('friends’ days show as dots, yours as solid', (await day('2026-11-20').locator('.dots').innerText()) === '•' && !/mine/.test(await day('2026-11-20').getAttribute('class')));
expect('a window Bea can do is offered in one tap', /Bea can do Fri, Nov 20 → Sun, Nov 22/.test(await p.locator('.avail-ask').innerText()));
expect('the window and flexibility settings are folded away', (await p.locator('.dates-more:not([open]) #win-start').count()) === 1);
await p.click('[data-addwin]'); await settle(p); await p.waitForTimeout(500);
{ const m = await mine(); expect('“Works for me” saves those three days, keeping the old ones', wk.every(d => m.days.includes(d)) && m.days.includes('2026-11-05') && m.pref.includes('2026-11-05'), m.days.join()); }
expect('…the offer goes away and the window works for everyone', !(await p.locator('.avail-ask').count()) && /2\/2/.test(await p.locator('.bw').first().innerText()));
expect('…and a saved count confirms it', /4 days saved/.test(await p.locator('.avail-done').innerText()));
await day('2026-11-10').click(); await p.waitForTimeout(1300);
expect('a tap marks a day free', (await mine()).days.includes('2026-11-10') && /5 days saved/.test(await p.locator('.avail-done').innerText()));
await day('2026-11-10').click(); await p.waitForTimeout(1300);
{ const m = await mine(); expect('a second tap takes it off (no hidden ★ step)', !m.days.includes('2026-11-10') && !(m.pref || []).includes('2026-11-10')); }
await p.click('[data-act=starMode]'); await settle(p);
expect('★ Favorites switches what a tap does', (await p.locator('[data-act=starMode][aria-pressed=true]').count()) === 1 && /favorite days/.test(await p.locator('.avail').innerText()));
await day('2026-11-21').click(); await p.waitForTimeout(1300);
expect('in ★ mode a tap stars the day', (await mine()).pref.includes('2026-11-21'));
await day('2026-11-21').click(); await p.waitForTimeout(1300);
{ const m = await mine(); expect('…and a second tap unstars it, keeping you free that day', !m.pref.includes('2026-11-21') && m.days.includes('2026-11-21')); }
await p.click('[data-act=starMode]'); await settle(p);
await p.click('.avail-done [data-tab=overview]'); await settle(p);
expect('“Back to the plan” goes to the plan home, where the next move has moved on', (await p.locator('.ov-hero').count()) === 1 && !/free days/i.test(await p.locator('.j-focus h2').innerText()), await p.locator('.j-focus h2').innerText());

// a window that needs fixing opens the settings
await api(A, 'update', 'trips/' + T, { winStart: null }); await p.waitForTimeout(900);
await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.click('.subtab[data-tab=dates]'); await settle(p);
expect('a missing trip window opens the settings to fix it', (await p.locator('.dates-more[open] #win-start').count()) === 1);

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

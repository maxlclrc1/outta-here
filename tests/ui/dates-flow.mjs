// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Coordinating dates: before you've answered, the calendar leads; once you have, the best dates so far
// lead, with how many have shared their days and a nudge for whoever hasn't. Someone who hasn't answered
// is "waiting on", never listed as unable to make it. Once the dates are locked, the screen says so and
// points at the next decision instead of asking for days again. Existing lock rules still apply.
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
const A = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), [B, C, D] = ['bea', 'cyy', 'dev'].map(n => `u_${n}00${r}`), T = 'df' + r;
const wk = ['2026-11-20', '2026-11-21', '2026-11-22'], wk2 = ['2026-11-27', '2026-11-28', '2026-11-29'];
await api(A, 'set', 'trips/' + T, { name: 'Cabin weekend', size: 'weekend', mode: 'friends', nights: 2, winStart: '2026-11-01', winEnd: '2026-11-30', destinations: [], itinerary: [], people: { [A]: true, [B]: true, [C]: true, [D]: true }, createdBy: A, createdAt: Date.now() });
await api(A, 'set', `trips/${T}/members/${A}`, { nick: 'Maya', status: 'in', seen: true, days: [], updatedAt: Date.now() });
for (const [u, nick, days] of [[B, 'Bea', wk], [C, 'Cy', wk2], [D, 'Dev', []]]) await api(u, 'set', `trips/${T}/members/${u}`, { nick, status: 'in', seen: true, days, updatedAt: Date.now() });
const dates = async () => { await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.click('.subtab[data-tab=dates]'); await settle(p); };
const top = sel => p.locator(sel).first().evaluate(e => e.getBoundingClientRect().top);
await p.goto(`${BASE}/#${T}`); await settle(p); await p.waitForSelector('.bottomnav'); await dates();

// —— before you've answered: the calendar leads ——
expect('before you answer, your calendar comes first', (await top('.avail')) < (await top('.dates-best')));
await p.click('[data-act=allDays]'); await settle(p); await p.waitForTimeout(900);
// —— once you have: the best dates lead, honestly ——
expect('once you’ve answered, the best dates so far come first', (await top('.dates-best')) < (await top('.avail')) && /Best dates so far/.test(await p.locator('.dates-best h2').innerText()));
expect('…with how many have shared their days, and a nudge for who hasn’t', /3 of 4 have shared their days/.test(await p.locator('.dates-heard').innerText()) && /Nudge Dev/.test(await p.locator('.dates-best [data-jnudge=dates]').innerText()));
{ const row = (await p.locator('.bw').first().innerText()).replace(/\s+/g, ' ');
  expect('someone who hasn’t answered is “waiting on”, not “can’t make it”', /Can’t make it: Cy/.test(row) && /Waiting on Dev/.test(row) && !/Missing|Can’t make it:[^W]*Dev/.test(row), row);
  expect('…and shows as a “?” rather than a no', (await p.locator('.bw').first().locator('.av-wait').count()) === 1); }
// —— everyone free that weekend: lock it, and the screen moves on ——
await api(C, 'update', `trips/${T}/members/${C}`, { days: [...wk, ...wk2] }); await api(D, 'update', `trips/${T}/members/${D}`, { days: wk }); await p.waitForTimeout(1200);
expect('when everyone has answered, it says so', /Everyone has shared their days/.test(await p.locator('.dates-heard').innerText()) && !(await p.locator('.dates-best [data-jnudge]').count()));
await p.locator('.bw.bw-all [data-lockdates]').first().click(); await settle(p); await p.waitForTimeout(1800);
expect('locking saves the dates as before', (await api(A, 'get', 'trips/' + T)).data.lockedDates?.start === '2026-11-20');
{ const t = (await p.locator('.decided-sum').innerText()).replace(/\s+/g, ' ');
  expect('locked: the dates say decided, and nobody is asked for days again', /Decided/i.test(t) && /Fri, Nov 20 → Sun, Nov 22/.test(t) && /Everyone marked these days as free/.test(t) && !(await p.locator('.avail:visible').count()), t);
  expect('…and the next decision is one tap away', /Next: Choose where to go/.test(t)); }
await p.click('.decided-sum [data-jgo]'); await settle(p);
expect('…which goes to choosing where', (await p.locator('.subtab.on').innerText()).trim() === 'Trip Match');

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Free days are picked as date ranges: tap the first day, then the last (either order; the same day twice
// is one day), and every day in between counts. Up to four ranges, each shown, editable and removable;
// overlapping or touching ranges become one, so no day is lost. They're saved as the plain list of dates
// the group logic already reads, so the best dates use every range. On a phone a single tap selects (the
// calendar opts out of double-tap zoom; pinch zoom stays on), and a click works the same on desktop.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 240) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(350));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const r = Math.random().toString(36).slice(2, 7), B = 'u_bea00' + r, T = 'dr' + r;
const span = (a, z) => { const o = []; for (let d = new Date(a + 'T00:00:00Z'); d <= new Date(z + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) o.push(d.toISOString().slice(0, 10)); return o; };

// —— a phone ——
const c = await b.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined }); await c.route('**/api/ai/status', x => x.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Maya'); await p.tap('.join-card [type=submit]'); await settle(p);
const A = await p.evaluate(() => localStorage.outta_uid);
await api(A, 'set', 'trips/' + T, { name: 'Cabin weekend', size: 'weekend', mode: 'friends', nights: 2, winStart: '2026-11-01', winEnd: '2026-12-10', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true }, destinations: [], itinerary: [] });
await api(A, 'set', `trips/${T}/members/${A}`, { nick: 'Maya', status: 'confirmed', seen: true, days: [], updatedAt: Date.now() });
await api(B, 'set', `trips/${T}/members/${B}`, { nick: 'Bea', status: 'in', seen: true, days: span('2026-11-20', '2026-11-22'), updatedAt: Date.now() });
const open = async () => { await p.goto(`${BASE}/#${T}`); await settle(p); await p.waitForSelector('.bottomnav'); await p.tap('.bottomnav [data-sec=plan]'); await settle(p); await p.tap('.subtab[data-tab=dates]'); await settle(p); };
await open();
const day = d => p.locator(`.avail .day[data-day="${d}"]`), cls = async d => (await day(d).getAttribute('class')) || '';
const mine = async () => (await api(A, 'get', `trips/${T}/members/${A}`)).data.days || [];
const save = () => p.waitForTimeout(1100);
const ranges = async () => (await p.locator('.avail .rng b').allInnerTexts());

{ const ta = await day('2026-11-10').evaluate(e => getComputedStyle(e).touchAction), vp = await p.getAttribute('meta[name=viewport]', 'content');
  expect('date cells opt out of double-tap zoom, so one tap is a tap', ta === 'manipulation', ta);
  expect('…without turning off zoom for the app', !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?!\d)/.test(vp), vp); }
expect('the picker says to tap a first and a last day', /first day you could do, then the last/i.test(await p.locator('.r-hint').innerText()));

// a range, inclusive, with quick taps (what used to zoom), and the scale stays put
await day('2026-11-10').tap(); expect('the first tap marks the start, nothing saved yet', /r-pick/.test(await cls('2026-11-10')) && /Starts Tue, Nov 10/.test(await p.locator('.r-hint').innerText()));
await day('2026-11-14').tap(); await save();
{ const d = await mine(); expect('10–14 Nov means the 10th through the 14th, all five days', d.join() === span('2026-11-10', '2026-11-14').join(), d.join()); }
expect('…the page didn’t zoom', await p.evaluate(() => (window.visualViewport?.scale || 1) === 1));
expect('start, end and the days between look different', /r-start/.test(await cls('2026-11-10')) && /r-end/.test(await cls('2026-11-14')) && /r-mid/.test(await cls('2026-11-12')));
expect('…and the range is listed', (await ranges()).join('|') === 'Nov 10 – Nov 14', (await ranges()).join('|'));

// reversed endpoints, and the same day twice
await day('2026-11-22').tap(); await day('2026-11-20').tap(); await save();
expect('tapping the end before the start still makes the range', span('2026-11-20', '2026-11-22').every(async x => x) && (await mine()).includes('2026-11-21') && (await ranges()).includes('Nov 20 – Nov 22'));
await day('2026-11-26').tap(); await day('2026-11-26').tap(); await save();
expect('the same day twice is just that day', (await mine()).includes('2026-11-26') && !(await mine()).includes('2026-11-25') && (await ranges()).includes('Thu, Nov 26'));
// a month boundary
await day('2026-11-29').tap(); await day('2026-12-02').tap(); await save();
{ const d = await mine(); expect('a range across the month counts Nov 29, 30, Dec 1 and 2, no day off', ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'].every(x => d.includes(x)) && !d.includes('2026-11-28') && !d.includes('2026-12-03'), d.join());
  expect('…four ranges now, and no “add another”', (await ranges()).length === 4 && !(await p.locator('[data-act=rangeAdd]').count()) && /4 of 4/i.test(await p.locator('.avail .ranges').innerText())); }

// a fifth is refused; a range that overlaps one is merged, nothing lost
const before = (await mine()).join();
await day('2026-11-05').tap(); await day('2026-11-06').tap(); await save();
expect('a fifth separate range is refused, and nothing changes', (await mine()).join() === before && /up to 4 date ranges/i.test(await p.locator('#toast').innerText()));
await day('2026-11-13').tap(); await day('2026-11-17').tap(); await save();
{ const d = await mine(); expect('an overlapping range joins the one it overlaps (still four), keeping every day', span('2026-11-10', '2026-11-17').every(x => d.includes(x)) && (await ranges())[0] === 'Nov 10 – Nov 17' && (await ranges()).length === 4, (await ranges()).join('|')); }

// edit and remove
await p.tap('[data-editrange="2026-11-26|2026-11-26"]'); await settle(p);
expect('Edit says which range is changing', /Changing Thu, Nov 26/.test(await p.locator('.r-hint').innerText()) && /r-editing/.test(await cls('2026-11-26')));
await day('2026-11-24').tap(); await day('2026-11-25').tap(); await save();
{ const d = await mine(); expect('…and the new days replace it', d.includes('2026-11-24') && d.includes('2026-11-25') && !d.includes('2026-11-26'), (await ranges()).join('|')); }
await p.tap('[data-rmrange="2026-11-29|2026-12-02"]'); await save();
{ const d = await mine(); expect('removing a range takes off only its days, and “add another” comes back', !d.includes('2026-11-30') && d.includes('2026-11-24') && (await p.locator('[data-act=rangeAdd]').count()) === 1, d.join()); }
await p.tap('[data-act=rangeAdd]'); await settle(p);
expect('“Add another date range” asks for its first day', /first day of another range/i.test(await p.locator('.r-hint').innerText()));

// saved and loaded: every range, and the group uses them all
await open();
expect('after a reload all three ranges are back', (await ranges()).join('|') === 'Nov 10 – Nov 17|Nov 20 – Nov 22|Nov 24 – Nov 25', (await ranges()).join('|'));
{ const top = (await p.locator('.bw').first().innerText()).replace(/\s+/g, ' ');
  expect('the best dates come from the second range, where Bea is free too', /Nov 20 → Sun, Nov 22/.test(top) && /2\/2 are free/.test(top), top); }
// free is not confirmed: once locked, both are said
await api(A, 'update', 'trips/' + T, { lockedDates: { start: '2026-11-20', end: '2026-11-22' } }); await p.waitForTimeout(1000); await open();
{ const t = (await p.locator('.decided-sum').innerText()).replace(/\s+/g, ' ');
  expect('locked: who marked the days free and who confirmed are told apart', /Everyone marked these days as free/.test(t) && /1 of 2 confirmed they’re coming/.test(t), t); }
await api(A, 'update', 'trips/' + T, { lockedDates: null });

// —— desktop: a click works the same ——
const dc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await dc.route('**/api/ai/status', x => x.fulfill({ json: { enabled: false } }));
const q = await dc.newPage(); q.on('pageerror', e => errs.push(e.message));
await q.goto(BASE + '/'); await q.fill('#join-name', 'Bea'); await q.click('.join-card [type=submit]'); await settle(q);
const Q = await q.evaluate(() => localStorage.outta_uid);
await api(A, 'update', 'trips/' + T, { people: { [A]: true, [B]: true, [Q]: true } });
await api(Q, 'set', `trips/${T}/members/${Q}`, { nick: 'Cy', status: 'in', seen: true, days: [], updatedAt: Date.now() });
await q.goto(`${BASE}/#${T}`); await settle(q); await q.waitForSelector('.ov-hero'); await q.waitForTimeout(500); await q.click('.bottomnav [data-sec=plan]'); await settle(q); await q.click('.subtab[data-tab=dates]'); await settle(q);
await q.click('.avail .day[data-day="2026-11-03"]'); await q.click('.avail .day[data-day="2026-11-05"]'); await q.waitForTimeout(1100);
{ const d = (await api(Q, 'get', `trips/${T}/members/${Q}`)).data.days || []; expect('desktop: two clicks save the range', d.join() === span('2026-11-03', '2026-11-05').join(), d.join()); }

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// From decisions to a plan: the cover says what's decided as decided and what isn't as still open; once
// both are locked it's "It's on", and "confirmed" is told apart from "going". The plan home shows who's
// confirmed, going but not confirmed, undecided and out, by name, with one nudge only when the next-move
// card isn't already asking the same people. A dinner with its place locked only asks for a time.
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
const A = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), [B, C, E] = ['bea', 'cyy', 'eli'].map(n => `u_${n}00${r}`);
const txt = async sel => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ');
const open = async T => { await p.goto(`${BASE}/#${T}`); await settle(p); await p.waitForSelector('.ov-hero'); await p.waitForTimeout(700); };
const make = async (T, size, wk, extra) => {
  await api(A, 'set', 'trips/' + T, { name: size === 'hangout' ? 'Taco night' : 'Cabin weekend', size, mode: 'friends', winStart: '2026-11-01', winEnd: '2026-11-30', destinations: [{ id: 'd1', city: size === 'hangout' ? 'Tacombi' : 'Porto' }], itinerary: [], people: { [A]: true, [B]: true, [C]: true, [E]: true }, createdBy: A, createdAt: Date.now(), ...extra });
  for (const [u, nick, status] of [[A, 'Maya', 'confirmed'], [B, 'Bea', 'confirmed'], [C, 'Cy', 'in'], [E, 'Eli', 'maybe']]) await api(u, 'set', `trips/${T}/members/${u}`, { nick, status, seen: true, days: wk, updatedAt: Date.now() });
};

// —— a weekend: where is locked, the dates aren't yet ——
const W = 'cw' + r, wk = ['2026-11-20', '2026-11-21', '2026-11-22'];
await make(W, 'weekend', wk, { nights: 2, lockedDest: 'd1' });
await open(W);
{ const m = await txt('.ovh-meta');
  expect('half-decided: what’s locked is shown, and what isn’t says it’s still open', /Porto/.test(m) && /dates still open/i.test(m) && !/It’s on/.test(m), m);
  expect('…and no “who’s coming” breakdown before the dates are set', !(await p.locator('.crew-now').count()) && await p.locator('.ov-me').count() > 0); }
// both locked
await api(A, 'update', 'trips/' + W, { lockedDates: { start: wk[0], end: wk[2] } }); await p.waitForTimeout(1200); await open(W);
{ const m = await txt('.ovh-meta'), who = await txt('.ovh-who');
  expect('both decided: the cover says it’s on, with the place and dates', /It’s on/.test(m) && /Porto/.test(m) && /Nov 20 – Nov 22/.test(m), m);
  expect('…and tells confirmed apart from going and maybe', /2 confirmed · 1 going · 1 maybe/.test(who), who); }
{ const cn = await txt('.crew-now');
  expect('who’s coming, by name: confirmed, going but not confirmed, undecided', /2 of 4 confirmed/.test(cn) && /Confirmed · 2 Maya, Bea/.test(cn) && /Going, not confirmed yet · 1 Cy/.test(cn) && /Haven’t decided · 1 Eli/.test(cn), cn);
  expect('…with your own answer in the same card (asked once on the home)', await p.locator('.crew-now .ladder').count() === 1 && !(await p.locator('.ov-me').count()));
  const focus = await p.locator('.j-focus').getAttribute('data-key'), nudges = await p.locator('.crew-now [data-jnudge]').count();
  expect('one nudge, and only when the next-move card isn’t already asking', focus === 'jf-confirm' ? nudges === 0 : nudges === 1 && /Nudge Cy/.test(await txt('.crew-now [data-jnudge]')), `${focus} ${nudges}`); }
// a member drops out: the card follows the real answers
await api(C, 'update', `trips/${W}/members/${C}`, { status: 'out' }); await api(E, 'update', `trips/${W}/members/${E}`, { status: 'confirmed' }); await p.waitForTimeout(1400);
{ const cn = await txt('.crew-now');
  expect('when everyone has answered, it says so, and who can’t make it is listed', /Everyone’s answered ✓/.test(cn) && /Can’t make it · 1 Cy/.test(cn) && /Confirmed · 3 Maya, Bea, Eli/.test(cn) && !(await p.locator('.crew-now [data-jnudge]').count()), cn); }

// —— a dinner with its place and day locked only needs a time ——
const H = 'ch' + r;
await make(H, 'hangout', ['2026-11-20'], { nights: 0, lockedDest: 'd1', lockedDates: { start: '2026-11-20', end: '2026-11-20' } });
await open(H);
{ const f = await txt('.j-focus');
  expect('a locked dinner asks for a time, not an itinerary', /What time are you meeting/.test(f) && /Tacombi, Fri, Nov 20/.test(f) && await p.locator('.j-focus #plan-time').count() === 1 && !/first stop/i.test(f) && !(await p.locator('.j-focus .j-help').count()), f); }
await p.fill('#plan-time', '19:30'); await p.click('#timeForm [type=submit]'); await settle(p); await p.waitForTimeout(1200);
{ const t = (await api(A, 'get', 'trips/' + H)).data, m = await txt('.ovh-meta');
  expect('setting it saves the time and shows it on the cover', t.time === '19:30' && /7:30/.test(m), `${t.time} · ${m}`);
  expect('…and the next move moves on', !/What time/.test(await txt('.j-focus'))); }

expect('no page errors', !errs.length, errs.join('; '));
for (const T of [W, H]) await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

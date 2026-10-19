// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Opening a plan's invite link on a new phone is one screen: the plan (who invited you, its name, only
// what's decided, how many are in), your name, and your answer. Answering joins you through the usual
// join, with no second "are you in?" screen. Then only what the plan needs from you: your free days while
// the dates are open, or straight to the plan with a "you're in" moment. The organizer sees it right away.
// Turned-off links and deleted plans say so kindly; coming back after joining goes straight to the plan.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 220) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(450));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const fresh = async url => { const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } })); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(url); return p; };
const A = await fresh(BASE + '/'); await A.fill('#join-name', 'Maya'); await A.click('.join-card [type=submit]'); await settle(A);
const uid = await A.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), tids = [];
async function plan(extra = {}) {
  const tid = 'ij' + r + tids.length, key = 'k' + r; tids.push(tid);
  await api(uid, 'set', 'trips/' + tid, { name: 'Cabin weekend', size: 'weekend', mode: 'friends', nights: 2, winStart: '2026-11-01', winEnd: '2026-11-30', destinations: [], itinerary: [], people: { [uid]: true }, createdBy: uid, createdAt: Date.now(), inviteKey: key, ...extra });
  await api(uid, 'set', `trips/${tid}/members/${uid}`, { nick: 'Maya', status: 'in', seen: true, days: [], updatedAt: Date.now() });
  return { tid, link: `${BASE}/p/${tid}?k=${key}` };
}
const member = async (tid, p) => (await api(uid, 'get', `trips/${tid}/members/${await p.evaluate(() => localStorage.outta_uid)}`)).data;

// —— dates still open ——
const P1 = await plan();
const J = await fresh(P1.link); await J.waitForSelector('.jp-cover', { timeout: 8000 });
{ const t = (await J.locator('.jp-card').innerText()).replace(/\s+/g, ' ');
  expect('the invite link opens on the plan itself: who invited you, its name, what’s still open', /Maya invited you/.test(t) && /Cabin weekend/.test(t) && /Picking where and when together/.test(t), t.slice(0, 200));
  expect('…with your name and your answer on the same screen, no generic sign-up', (await J.locator('#join-name').count()) === 1 && /I’m in/.test(await J.locator('.jp-in').innerText()) && (await J.locator('[data-ans=maybe]').count()) === 1 && !/What do your friends call you/.test(t)); }
await J.fill('#join-name', 'Jo'); await J.click('.jp-in'); await J.waitForSelector('.setup', { timeout: 8000 }); await settle(J);
expect('“I’m in” joins right away, with no second “are you in?” screen', !(await J.locator('.welcome').count()) && (await member(P1.tid, J))?.status === 'in' && (await member(P1.tid, J))?.nick === 'Jo');
expect('…and the one thing the plan needs from them is next: their free days', /Step 1 of 1/i.test(await J.locator('.setup-top .label').innerText()) && /One quick question/.test(await J.locator('.setup-hi').innerText()) && (await J.locator('.setup .cal').count()) === 1);
await A.goto(`${BASE}/#${P1.tid}`); await settle(A); await A.waitForSelector('.ov-hero');
expect('the organizer sees them in, without chasing', /2 going/.test(await A.locator('.ovh-who').innerText()), await A.locator('.ovh-who').innerText());
await J.click('[data-act=weekends]'); await J.click('[data-act=setupNext]'); await settle(J);
expect('after the days, they’re on the plan', (await J.locator('.ov-hero').count()) === 1 && !(await J.locator('.setup').count()));
await J.goto(P1.link); await settle(J); await J.waitForSelector('.ov-hero', { timeout: 8000 });
expect('coming back to the link after joining goes straight to the plan', !(await J.locator('.jp-card, .welcome').count()));

// —— dates set: nothing to ask, a moment and the plan ——
const P2 = await plan({ destinations: [{ id: 'd1', city: 'Catskills' }], lockedDest: 'd1', lockedDates: { start: '2026-11-20', end: '2026-11-22' } });
const K = await fresh(P2.link); await K.waitForSelector('.jp-cover', { timeout: 8000 });
expect('decided details show as they are', /Nov 20 – Nov 22 · Catskills/.test(await K.locator('.jp-facts').innerText()));
await K.fill('#join-name', 'Kai'); await K.click('.jp-in'); await K.waitForSelector('.ov-hero', { timeout: 8000 });
expect('with the dates set, “I’m in” goes straight to the plan with a “you’re in” moment', !(await K.locator('.setup').count()) && /You’re in/i.test(await K.locator('.launch').innerText().catch(() => '')) && (await member(P2.tid, K))?.status === 'in');
const M = await fresh(P2.link); await M.waitForSelector('.jp-cover'); await M.fill('#join-name', 'Mo'); await M.click('[data-ans=maybe]'); await M.waitForSelector('.ov-hero', { timeout: 8000 }); await settle(M);
expect('“Maybe” is saved as a maybe', (await member(P2.tid, M))?.status === 'maybe');

// —— links that don't work ——
const X = await fresh(`${BASE}/p/${P2.tid}?k=wrongkey`); await X.waitForSelector('.jp-off', { timeout: 8000 });
expect('a turned-off link says so, with no answer buttons', /invite link was turned off/i.test(await X.locator('.jp-off').innerText()) && !(await X.locator('[data-ans=maybe]').count()) && (await X.locator('.jp-in').innerText()) === 'Continue');
await X.fill('#join-name', 'Xan'); await X.click('.jp-in'); await settle(X); await X.waitForTimeout(800);
expect('…and continuing doesn’t join them', !(await member(P2.tid, X)));
const G = await fresh(`${BASE}/#zzgone${r}`); await G.waitForSelector('.jp-off', { timeout: 8000 });
expect('a deleted plan says so', /isn’t here anymore/.test(await G.locator('.jp-off').innerText()));

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

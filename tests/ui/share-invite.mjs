// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Invitations read like a friend asking, from what the plan actually says. The WhatsApp message is the
// plan (bold) with an emoji for the occasion, then only what's decided (else "Picking … together"),
// who's in so far, and what tapping lets you do; the link preview says the same, with the organizer's
// name. Nothing undecided is filled in with a guess.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 260) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Maya'); await p.click('.join-card [type=submit]'); await settle(p);
const A = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), tids = [];
async function plan(data, going = []) {
  const tid = 'si' + r + tids.length, key = 'kq7x' + tids.length; tids.push(tid);
  const others = going.map((nick, i) => [`u_g${i}0${tids.length}${r}`, nick]);
  await api(A, 'set', 'trips/' + tid, { winStart: '2026-11-01', winEnd: '2026-11-30', destinations: [], itinerary: [], people: Object.fromEntries([A, ...others.map(([u]) => u)].map(u => [u, true])), createdBy: A, createdAt: Date.now(), inviteKey: key, ...data });
  await api(A, 'set', `trips/${tid}/members/${A}`, { nick: 'Maya', status: 'in', seen: true, days: [], updatedAt: Date.now() });
  for (const [u, nick] of others) await api(u, 'set', `trips/${tid}/members/${u}`, { nick, status: 'in', days: [], updatedAt: Date.now() });
  await p.goto(`${BASE}/#${tid}`); await settle(p); await p.waitForSelector('.bottomnav'); await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.click('.subtab[data-tab=crew]'); await settle(p);
  const msg = decodeURIComponent((await p.locator('a.wa').first().getAttribute('href')).slice(20)), link = `${BASE}/p/${tid}?k=${key}`;
  const html = await (await fetch(link)).text(), desc = html.match(/og:description" content="([^"]*)/)?.[1].replace(/&#39;/g, '’') || '';
  const img = await fetch((html.match(/og:image" content="([^"]*)/)?.[1] || '').replace(/&amp;/g, '&')), size = (await img.arrayBuffer()).byteLength;
  return { msg, desc, link, img: img.status === 200 && img.headers.get('content-type') === 'image/png' && size < 300_000, size };
}
const lines = m => m.split('\n');

{ const x = await plan({ name: 'Friday dinner', size: 'hangout', mode: 'friends', nights: 0, city: 'Brooklyn' });
  expect('a dinner with a city and no day yet', lines(x.msg).slice(0, 3).join(' | ') === '🍻 *Friday dinner* | Brooklyn | No app, no sign-up. Tap to say if you’re in and which days work 👇' && lines(x.msg)[3] === x.link, x.msg);
  expect('…its preview says the same, with who invited you', x.desc === 'Maya invited you · Friends hangout · Brooklyn · Picking the day together. Tap to say if you’re in.' && x.img, `${x.desc} (${x.size} bytes)`); }
{ const x = await plan({ name: 'Sarah’s Last Fling', size: 'weekend', mode: 'bachelorette', nights: 2 });
  expect('a bachelorette with nothing decided doesn’t guess', lines(x.msg).slice(0, 3).join(' | ') === '💍 *Sarah’s Last Fling* | Picking where and when together | No app, no sign-up. Tap to say if you’re in and when you’re free 👇', x.msg);
  expect('…nor does its preview', x.desc === 'Maya invited you · Bachelorette weekend · Picking where and when together. Tap to say if you’re in.' && x.img, x.desc); }
{ const x = await plan({ name: 'Spring trip', size: 'trip', mode: 'friends', nights: 4, lockedDates: { start: '2026-11-12', end: '2026-11-16' } });
  expect('a trip with dates but no place asks to vote on where', lines(x.msg).slice(0, 3).join(' | ') === '✈️ *Spring trip* | Nov 12 – Nov 16 | No app, no sign-up. Tap to say if you’re in and vote on where 👇', x.msg);
  expect('…and its preview says where is still being picked', x.desc === 'Maya invited you · Friends trip · Nov 12 – Nov 16 · Picking where together. Tap to say if you’re in.', x.desc); }
{ const x = await plan({ name: 'Beach day', size: 'day', mode: 'friends', nights: 0, city: 'Queens', destinations: [{ id: 'd1', city: 'Rockaway' }], lockedDest: 'd1', lockedDates: { start: '2026-11-21', end: '2026-11-21' } }, ['Bea', 'Cy']);
  expect('a decided day out says when, where and who’s in', lines(x.msg).slice(0, 3).join(' | ') === '☀️ *Beach day* | Sat, Nov 21 · Rockaway · 3 in so far | No app, no sign-up. Tap to say if you’re in 👇', x.msg);
  expect('…its preview counts who’s going, without their names', x.desc === 'Maya invited you · Friends day out · Rockaway · Nov 21 · 3 going. Tap to say if you’re in.' && !/Bea|Cy\b/.test(x.desc) && x.img, x.desc); }

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

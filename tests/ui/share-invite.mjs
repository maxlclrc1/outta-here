// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Invitations read like a friend in the group chat. The WhatsApp message is the plan with only what's
// decided and an emoji, then a short casual ask that fits the plan's stage ("we doing this? 👀"), then the
// link. The preview doesn't repeat it: the plan's name and one line, what's confirmed or who it's from.
// Nothing undecided is filled in with a guess.
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

const ASK = { open: ['we doing this? 👀', 'okay, who’s in? 🫶', 'be honest, you in? 👀'], small: ['who’s in? 🫶', 'you coming? 👀', 'in or out? 👀'], where: ['dates are set, now where? 👀', 'we doing this? 👀'], set: ['it’s happening 🔥 you in?', 'locked in. you coming? 👀', 'okay this is real. who’s in? 🫶'] };
const casual = m => !/Tap|No app|sign-up|\*/.test(m) && lines(m).length === 3;
{ const x = await plan({ name: 'Friday dinner', size: 'hangout', mode: 'friends', nights: 0, city: 'Brooklyn' });
  expect('a dinner with a city and no day yet: the plan, then a casual ask, then the link', lines(x.msg)[0] === 'Friday dinner — Brooklyn 🍻' && ASK.small.includes(lines(x.msg)[1]) && lines(x.msg)[2] === x.link && casual(x.msg), x.msg);
  expect('…its preview is the name and one line: the confirmed city', x.desc === 'Brooklyn' && x.img, `${x.desc} (${x.size} bytes)`); }
{ const x = await plan({ name: 'Sarah’s Last Fling', size: 'weekend', mode: 'bachelorette', nights: 2 });
  expect('a bachelorette with nothing decided adds no made-up details', lines(x.msg)[0] === 'Sarah’s Last Fling 💍' && ASK.open.includes(lines(x.msg)[1]) && casual(x.msg), x.msg);
  expect('…nor does its preview', x.desc === 'From Maya' && x.img, x.desc); }
{ const x = await plan({ name: 'Spring trip', size: 'trip', mode: 'friends', nights: 4, lockedDates: { start: '2026-11-12', end: '2026-11-16' } });
  expect('a trip with dates but no place says the dates and asks where', lines(x.msg)[0] === 'Spring trip — Nov 12 – Nov 16 ✈️' && ASK.where.includes(lines(x.msg)[1]), x.msg);
  expect('…and its preview shows only the confirmed dates', x.desc === 'Nov 12 – Nov 16', x.desc); }
{ const x = await plan({ name: 'Beach day', size: 'day', mode: 'friends', nights: 0, city: 'Queens', destinations: [{ id: 'd1', city: 'Rockaway' }], lockedDest: 'd1', lockedDates: { start: '2026-11-21', end: '2026-11-21' } }, ['Bea', 'Cy']);
  expect('a decided day out with people in says so, like a friend would', lines(x.msg).slice(0, 2).join(' | ') === 'Beach day — Sat, Nov 21, Rockaway ☀️ | 3 of us are in already 👀 you?' && casual(x.msg), x.msg);
  expect('…its preview is when and where, without anyone’s names', x.desc === 'Nov 21 · Rockaway' && !/Bea|Cy\b|Maya/.test(x.desc) && x.img, x.desc); }
// the preview never repeats the message's ask
{ const again = await plan({ name: 'Sarah’s Last Fling', size: 'weekend', mode: 'bachelorette', nights: 2 }); expect('another plan at the same stage gets an ask from the same set, and its preview has no call to action', ASK.open.includes(lines(again.msg)[1]) && !/in\?|👀|🫶|Tap/.test(again.desc)); }

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

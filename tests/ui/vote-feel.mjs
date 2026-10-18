// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Voting feels like the setup: on Trip Match the deck comes first (steering and the rules fold away),
// with the crew's swipe progress; the three votes are labeled, pressable buttons that throw the card and
// cheer; on the scoreboard your vote can be changed with a three-way control; a match and every lock get a
// celebration. Saved votes, the vote values and locking are unchanged, and reduced motion skips the motion.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 200) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(450));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const r = Math.random().toString(36).slice(2, 7), tids = [];
const days = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
const pitch = (id, city) => ({ id, city, code: city.slice(0, 3).toUpperCase(), start: days[0], end: days[3], tagline: 'Nice', why: 'Because', perPerson: '$500–600', vibeMatch: 80, highlights: [], weather: '' });
async function setup(motion) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: motion }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/'); await p.fill('#join-name', 'Maya'); await p.click('.join-card [type=submit]'); await settle(p);
  const A = await p.evaluate(() => localStorage.outta_uid), B = 'u_bea00' + r + tids.length, T = 'vf' + r + tids.length; tids.push([T, A]);
  // Bea's yes on Lisbon and pass on Porto were saved before; Maya hasn't swiped
  await api(A, 'set', 'trips/' + T, { name: 'Vote trip', size: 'trip', mode: 'friends', nights: 3, winStart: '2026-11-01', winEnd: '2026-11-30', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true },
    destinations: [{ id: 'd1', city: 'Lisbon' }, { id: 'd2', city: 'Porto' }], itinerary: [], pitches: { at: 1, items: [pitch('p1', 'Lisbon'), pitch('p2', 'Porto')] }, swipes: { p1: { [B]: 1 }, p2: { [B]: -1 } } });
  await api(A, 'set', `trips/${T}/members/${A}`, { nick: 'Maya', status: 'in', seen: true, days, updatedAt: Date.now() });
  await api(B, 'set', `trips/${T}/members/${B}`, { nick: 'Bea', status: 'in', seen: true, days, updatedAt: Date.now() });
  await p.goto(`${BASE}/#${T}`); await settle(p); await p.waitForSelector('.bottomnav');
  await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.click('.subtab[data-tab=match]'); await settle(p);
  return { p, A, B, T, mine: async pid => (await api(A, 'get', 'trips/' + T)).data.swipes?.[pid]?.[A] };
}

// —— with motion ——
{ const { p, T, mine } = await setup('no-preference');
  const order = await p.evaluate(() => ['.vote-head', '#pitch', '.scoreboard'].map(s => document.querySelector(s)?.getBoundingClientRect().top ?? -1));
  expect('the deck comes right after a compact header, before the scoreboard', order.every(x => x >= 0) && order[0] < order[1] && order[1] < order[2], order.join(' < '));
  expect('steering and the rules are folded away once there are pitches', (await p.locator('.m-more:not([open]) #pitch-note').count()) === 1);
  expect('the crew’s progress counts saved votes: 2 of 4 swipes in, 2 left for Maya', /2\/4 swipes in/.test(await p.locator('.vprog-top').innerText()) && /2 left for you/.test(await p.locator('.vprog-top').innerText()) && (await p.locator('.vp-av.fin').count()) === 1);
  expect('the three votes are labeled buttons', (await p.locator('.vote-row .swipe-btn').allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim()).join(' | ') === '✕ PASS | ≈ COULD WORK | ♥ I’D GO' && (await p.locator('.vote-row [aria-label="I\'d go"]').count()) === 1);
  await p.click('.vote-row .swipe-btn.yes'); await p.waitForTimeout(60);
  expect('“I’d go” throws the card right and cheers', (await p.locator('.pitch-ghost.fly-yes').count()) === 1 && /I’d go/.test(await p.locator('.vote-pop').innerText().catch(() => '')));
  expect('…while the next card is already there (no wait for the throw)', (await p.locator('#pitch').getAttribute('data-pid')) === 'p2');
  await p.waitForTimeout(500);
  expect('a match on Lisbon gets the celebration', /It’s a match!/i.test(await p.locator('.launch').innerText().catch(() => '')) && (await mine('p1')) === 1);
  await settle(p); await p.waitForTimeout(1500);
  expect('…and the match card with the lock button', (await p.locator('.match [data-lockpitch=p1]').count()) === 1);
  await p.click('.vote-row .swipe-btn.meh'); await p.waitForTimeout(600); await settle(p);
  expect('“Could work” saves the same value as before (0.5)', (await mine('p2')) === 0.5);
  expect('everyone’s swiped: a full bar', /Everyone’s swiped/.test(await p.locator('.vprog-top').innerText()) && (await p.locator('.vprog .setup-bar.full').count()) === 1);
  const seg = p.locator('.sb-row', { hasText: 'Porto' }).locator('.vseg');
  expect('on the scoreboard, your vote shows in a three-way control', (await seg.locator('.vs-opt.on').getAttribute('aria-label')) === 'Could work');
  await seg.locator('[aria-label=Pass]').click(); await p.waitForTimeout(600); await settle(p);
  expect('…and changing it saves the new vote', (await mine('p2')) === -1 && (await seg.locator('.vs-opt.on').getAttribute('aria-label')) === 'Pass' && (await seg.locator('[aria-label=Pass]').getAttribute('aria-pressed')) === 'true');
  await p.locator('.match [data-lockpitch=p1]').click(); await p.waitForTimeout(500);
  expect('locking the match gets a “Locked in!” celebration and is saved as before', /Locked in!/i.test(await p.locator('.launch').innerText().catch(() => '')) && (await api(tids[0][1], 'get', 'trips/' + T)).data.lockedDest === 'd1');
  await settle(p); await p.waitForTimeout(1500);
  await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.click('.subtab[data-tab=dates]'); await settle(p);
  await api(tids[0][1], 'update', 'trips/' + T, { lockedDates: null }); await p.waitForTimeout(900);
  expect('best dates show who can go', (await p.locator('.bw').first().locator('.av').count()) === 2 && (await p.locator('.bw.bw-all').count()) >= 1);
  await p.locator('[data-lockdates]').first().click(); await p.waitForTimeout(500);
  expect('locking dates gets a “Dates locked!” celebration and is saved', /Dates locked!/i.test(await p.locator('.launch').innerText().catch(() => '')) && !!(await api(tids[0][1], 'get', 'trips/' + T)).data.lockedDates); }

// —— reduced motion: no flying card or overlays, votes still save right away ——
{ const { p, mine } = await setup('reduce');
  await p.click('.vote-row .swipe-btn.yes'); await p.waitForTimeout(80);
  expect('reduced motion: the card isn’t thrown', !(await p.locator('.pitch-ghost').count()));
  await p.waitForTimeout(500);
  expect('…no celebration overlay, and the vote is saved', !(await p.locator('.launch').count()) && (await mine('p1')) === 1); }

expect('no page errors', !errs.length, errs.join('; '));
for (const [T, A] of tids) await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

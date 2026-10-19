// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Choosing where, once the dates are locked: it's the next move; Trip Match shows a shortlist (top three,
// the rest one tap away) with honest tags from the pitches' own data (lowest estimate, best vibe match,
// crew favorite), vote counts that keep yes, could work, passed and not-yet apart, and pitches made for
// other dates set aside (they can't be locked, so the locked dates never move). The server checks a pitch
// lock against the locked dates with the pitch's own votes. Once locked: the result and the next step.
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
const A = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), [B, C] = ['bea', 'cyy'].map(n => `u_${n}00${r}`), T = 'wf' + r, P = 'trips/' + T;
const wk = ['2026-11-20', '2026-11-21', '2026-11-22'];
const pitch = (id, city, perPerson, vibeMatch, start = '2026-11-20', end = '2026-11-22') => ({ id, city, code: '', start, end, tagline: 'x', why: 'y', perPerson, vibeMatch, highlights: [], weather: '' });
await api(A, 'set', P, { name: 'Cabin weekend', size: 'weekend', mode: 'friends', nights: 2, winStart: '2026-11-01', winEnd: '2026-11-30', destinations: [], itinerary: [], people: { [A]: true, [B]: true, [C]: true }, createdBy: A, createdAt: Date.now(),
  lockedDates: { start: wk[0], end: wk[2] }, pitches: { at: 1, items: [pitch('p1', 'Lisbon', '$400–500', 80), pitch('p2', 'Porto', '$300', 90), pitch('p3', 'Madrid', '$600', 70), pitch('p4', 'Seville', '$500', 60), pitch('p5', 'Rome', '$450', 85, '2026-11-27', '2026-11-29')] } });
for (const [u, nick] of [[A, 'Maya'], [B, 'Bea'], [C, 'Cy']]) await api(u, 'set', `${P}/members/${u}`, { nick, status: 'in', seen: true, days: wk, updatedAt: Date.now() });
await api(B, 'update', P, { swipes: { p1: { [B]: 1 } } }); await api(C, 'update', P, { swipes: { p1: { [C]: -1 } } });
await p.goto(`${BASE}/#${T}`); await settle(p); await p.waitForSelector('.ov-hero');
expect('with the dates locked, choosing where is the next move', /where/i.test(await p.locator('.j-focus h2').innerText()), await p.locator('.j-focus h2').innerText());
await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.click('.subtab[data-tab=match]'); await settle(p);

// —— the shortlist ——
expect('a pitch for other dates is set aside, with the locked dates shown', /Your dates are set: Fri, Nov 20 → Sun, Nov 22/.test(await p.locator('.m-off').innerText()) && /1 of these was for other dates/.test(await p.locator('.m-off').innerText()));
expect('…it never comes up to swipe, and isn’t counted in the progress', (await p.locator('#pitch').getAttribute('data-pid')) !== 'p5' && /2\/12 swipes in/.test(await p.locator('.vprog-top').innerText()), await p.locator('.vprog-top').innerText());
const rows = async () => (await p.locator('.scoreboard > .sb-row').allInnerTexts()).map(x => x.replace(/\s+/g, ' '));
{ const rs = await rows();
  expect('the scoreboard is a shortlist of three, with the rest one tap away', rs.length === 3 && /Top picks/.test(await p.locator('.scoreboard h3').innerText()) && /See 1 more/.test(await p.locator('[data-key=sb-more] summary').innerText()), rs.length);
  expect('…and the other-dates pitch apart, without a lock button', /Pitched for other dates \(1\)/.test(await p.locator('[data-key=sb-off] summary').innerText()) && !(await p.locator('[data-lockpitch=p5]').count()));
  const porto = rs.find(x => /^Porto/.test(x)) || '', lisbon = (await p.locator('.sb-row', { hasText: 'Lisbon' }).first().textContent()).replace(/\s+/g, ' ');
  expect('honest tags from the pitches’ own data: lowest estimate and best vibe match', /Lowest estimate/.test(porto) && /Best vibe match/.test(porto), porto);
  expect('…and the crew favorite from real votes', /Crew favorite/.test(lisbon), lisbon);
  expect('votes keep yes, passed and not-yet apart', /1 yes · 0 could work · 1 passed · waiting on Maya/.test(lisbon), lisbon); }

// —— the server checks a pitch lock against the locked dates, with that pitch's own votes ——
await api(B, 'update', P, { swipes: { p2: { [B]: 1 } } }); await api(C, 'update', P, { swipes: { p2: { [C]: -1 } } });
{ const x = await api(A, 'update', P, { destinations: [{ id: 'dp', city: 'Porto' }], lockedDest: 'dp' });
  expect('with someone passing on Porto, the server won’t lock it', x.status === 403 && (await api(A, 'get', P)).data.lockedDest !== 'dp', `${x.status} ${x.message}`); }
await api(C, 'update', P, { swipes: { p2: { [C]: 1 } } }); await p.waitForTimeout(900);
await p.click('[data-swipe="p2|1"]').catch(() => {}); await settle(p); await p.waitForTimeout(900);
await p.locator('[data-lockpitch=p2]').first().click(); await settle(p); await p.waitForTimeout(1800);
{ const t = (await api(A, 'get', P)).data, d = (t.destinations || []).find(x => x.id === t.lockedDest);
  expect('once everyone says yes, Porto locks and the dates stay as they were', d?.city === 'Porto' && t.lockedDates.start === '2026-11-20' && t.lockedDates.end === '2026-11-22', JSON.stringify({ d: d?.city, L: t.lockedDates })); }
await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.click('.subtab[data-tab=match]'); await settle(p);
{ const t = (await p.locator('.decided-sum').innerText()).replace(/\s+/g, ' ');
  expect('locked: the result, not an unfinished vote, and the next step', /Decided/i.test(t) && /Porto/.test(t) && /Fri, Nov 20 → Sun, Nov 22/.test(t) && /Next:/.test(t) && !(await p.locator('#pitch:visible').count()), t); }

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${T}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

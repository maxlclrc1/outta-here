// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Family plans: next to "Are you in?", an adult says how many kids they're bringing (− / +, 0 to 12),
// saved as a count on their own record; the crew list shows "Rae + 2 kids". Kids follow their adult:
// they aren't people in the plan, so headcounts don't change yet. Other plan types show none of this,
// even for a record that has a count, and records without one read as 0.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 240) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Rae'); await p.click('.join-card [type=submit]'); await settle(p);
const A = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), B = 'u_bea00' + r, tids = [];
async function plan(mode) {
  const tid = 'ki' + r + tids.length; tids.push(tid);
  await api(A, 'set', 'trips/' + tid, { name: `${mode} weekend`, size: 'weekend', mode, nights: 2, winStart: '2026-12-01', winEnd: '2026-12-20', destinations: [], itinerary: [], people: { [A]: true, [B]: true }, createdBy: A, createdAt: Date.now() });
  await api(A, 'set', `trips/${tid}/members/${A}`, { nick: 'Rae', status: 'in', seen: true, days: [], updatedAt: Date.now() });
  await api(B, 'set', `trips/${tid}/members/${B}`, { nick: 'Bea', status: 'in', seen: true, days: [], kids: 3, updatedAt: Date.now() });
  await p.goto(`${BASE}/#${tid}`); await settle(p); await p.waitForSelector('.bottomnav'); await p.waitForTimeout(500);
  return tid;
}
const crew = async () => { await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.click('.subtab[data-tab=crew]'); await settle(p); return (await p.locator('.crew-row b').allInnerTexts()).join(' / ').replace(/\s+/g, ' '); };
const overview = async () => { await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.click('.subtab[data-tab=overview]'); await settle(p); };
const mine = async tid => (await api(A, 'get', `trips/${tid}/members/${A}`)).data;

// —— family ——
{ const tid = await plan('family');
  const step = p.locator('.ov-me .kids-step');
  expect('family: “Bringing kids?” sits with the RSVP ladder, starting at 0', (await step.count()) === 1 && (await step.locator('.kids-n').innerText()) === '0' && await step.locator('[data-kids="-1"]').isDisabled());
  const who = await p.locator('.ovh-who').innerText();
  await step.locator('[data-kids="1"]').click(); await step.locator('[data-kids="1"]').click(); await p.waitForTimeout(1200);
  expect('…+ twice saves 2 on Rae’s own record', (await mine(tid))?.kids === 2 && (await step.locator('.kids-n').innerText()) === '2');
  expect('…without changing Rae’s RSVP or the headcount', (await mine(tid))?.status === 'in' && (await p.locator('.ovh-who').innerText()) === who, who);
  { const t = await crew(); expect('the crew list shows “Rae + 2 kids” and “Bea + 3 kids”', /Rae \+ 2 kids \(you\)/.test(t) && /Bea \+ 3 kids/.test(t), t); }
  await overview(); await step.locator('[data-kids="-1"]').click(); await p.waitForTimeout(1200);
  { const t = await crew(); expect('− brings it to 1 (“+ 1 kid”)', (await mine(tid))?.kids === 1 && /Rae \+ 1 kid \(you\)/.test(t), t); }
  await overview(); await step.locator('[data-kids="-1"]').click(); await p.waitForTimeout(1200);
  { const t = await crew(); expect('…and to 0, where the name stands alone and − is off', (await mine(tid))?.kids === 0 && /Rae \(you\)/.test(t) && !/Rae \+/.test(t), t); }
  await overview(); expect('…− is disabled at 0', await step.locator('[data-kids="-1"]').isDisabled());
  await p.locator('.ov-me [data-status=out]').click(); await settle(p);
  expect('saying you can’t go hides the kids control', !(await p.locator('.kids-step').count())); }

// —— other plan types: nothing new, even with a saved count ——
{ const tid = await plan('friends');
  expect('friends: no kids control', !(await p.locator('.kids-step').count()));
  const t = await crew(); expect('…and the crew list ignores Bea’s saved count', /Bea/.test(t) && !/kid/.test(t), t); }

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

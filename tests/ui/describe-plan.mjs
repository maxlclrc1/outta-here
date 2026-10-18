// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// "Describe your plan": the new-plan screen leads with one box. The sentence is read into chips you can
// tap to change (what it didn't say is an "Add …" chip or a marked guess, never a made-up fact). "Create
// plan & invite friends" makes a real plan with the same fields as the step-by-step form (still on the
// same screen) and lands on the plan home with the WhatsApp invite as the next move.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 240) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Maya'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid), tids = [];
const start = async () => { if (await p.locator('[data-act=home]').count()) { await p.locator('[data-act=home]').first().dispatchEvent('click'); await settle(p); } await p.click('[data-act=newTrip]'); await settle(p); };
const chips = async () => Object.fromEntries(await p.locator('.sh-chip').evaluateAll(els => els.map(e => [e.dataset.shedit, `${e.className.match(/is-(set|guess|empty)/)?.[1]}: ${e.querySelector('b').textContent.trim()}`])));
const describe = async text => { await start(); await p.fill('#nd-text', text); await p.click('.nd-go'); await settle(p); };

// —— the box leads; the step-by-step sizes stay below it ——
await start();
expect('“Make a plan” leads with one box and an example', (await p.locator('#nd-text').count()) === 1 && /Greece/.test(await p.locator('#nd-text').getAttribute('placeholder')) && (await p.locator('.btn.primary:visible').count()) === 1);
expect('…with the step-by-step sizes still there', (await p.locator('[data-size]').count()) === 4);
await p.click('.nd-go'); await settle(p);
expect('an empty box doesn’t go anywhere', (await p.locator('#nd-text').count()) === 1 && !(await p.locator('.sh').count()));

// —— the example from the brief ——
await p.fill('#nd-text', 'Plan a long weekend in Greece with five friends in June, around €500 each, beaches and nightlife.'); await p.click('.nd-go'); await settle(p);
{ const ch = await chips();
  expect('it reads the place, the size, the month, who, the budget and the vibe', ch.place === 'set: Greece' && /^set: Friends weekend · 3 nights$/.test(ch.kind) && /^set: June · Jun 1 – Jun 30$/.test(ch.when) && ch.who === 'set: You + 5 friends' && ch.budget === 'set: €500 each' && ch.vibe === 'set: beaches · nightlife', JSON.stringify(ch));
  expect('…names it, and says the plan is taking shape with three steps', /Greece long weekend/.test(await p.locator('.nf-pv-title').innerText()) && /taking shape/i.test(await p.locator('.nf-head h1').innerText()) && (await p.locator('.sh-step').count()) === 3); }
await p.click('[data-shedit=budget]'); await settle(p); await p.fill('#sh-budget', '600'); await p.click('[data-act=shapeSave]'); await settle(p);
expect('tapping a chip edits it', (await chips()).budget === 'set: €600 each');
await p.click('[data-shedit=who]'); await settle(p); await p.fill('#sh-people', '7'); await p.locator('#sh-people').press('Enter'); await settle(p);
expect('…and Enter saves', (await chips()).who === 'set: You + 6 friends');
await p.click('[data-act=shapeCreate]'); await p.waitForSelector('.ov-hero', { timeout: 8000 }); await settle(p);
{ const tid = (await p.evaluate(() => location.hash)).slice(1); tids.push(tid); const t = (await api(uid, 'get', 'trips/' + tid)).data, me = (await api(uid, 'get', `trips/${tid}/members/${uid}`)).data;
  expect('“Create plan & invite friends” makes a real plan from the chips', t.name === 'Greece long weekend' && t.size === 'weekend' && t.nights === 3 && t.currency === 'EUR' && /-06-01$/.test(t.winStart) && /-06-30$/.test(t.winEnd) && t.mode === 'friends' && t.pays === 'split', JSON.stringify({ n: t.name, s: t.size, ni: t.nights, c: t.currency, a: t.winStart, z: t.winEnd }));
  expect('…the place, vibe and group size steer the AI pitches', t.pitchNote === 'Greece · beaches, nightlife · about 7 people', t.pitchNote);
  expect('…your budget is saved as your share', me.budget === 600 && me.status === 'in', JSON.stringify({ b: me.budget })); }
expect('…and it lands on the plan with the WhatsApp invite as the next move (no setup first)', !(await p.locator('.setup').count()) && /Get everyone into the plan/.test(await p.locator('.j-focus h2').innerText()) && (await p.locator('.j-focus a.wa').count()) === 1);

// —— a vague sentence: guesses are marked, missing details are “Add …” ——
await describe('something fun with the crew');
{ const ch = await chips();
  expect('what the words didn’t say is never presented as fact', ch.place === 'empty: Anywhere' && ch.budget === 'empty: Add a budget' && ch.who === 'empty: How many?' && /^guess: /.test(ch.when) && /^guess: /.test(ch.kind), JSON.stringify(ch));
  expect('…and guesses are labelled as guesses', /a guess/i.test(await p.locator('[data-shedit=when] .sh-k').innerText())); }

// —— a dinner needs its city before it can be created ——
await p.click('[data-act=cancelNew]'); await settle(p);
await describe('Dinner Friday with the crew, $40 each');
{ const ch = await chips(); expect('a dinner is a hangout in dollars, this coming Friday', /^set: Friends hangout$/.test(ch.kind) && ch.budget === 'set: $40 each' && /^set: Friday · /.test(ch.when) && /Friday dinner/.test(await p.locator('.nf-pv-title').innerText()), JSON.stringify(ch)); }
expect('…and without a city it says so instead of creating', await p.locator('[data-act=shapeCreate]').isDisabled() && /Add the city/.test(await p.locator('.sh').innerText()));
await p.click('[data-shedit=place]'); await settle(p); await p.fill('#sh-place', 'Brooklyn'); await p.click('[data-act=shapeSave]'); await settle(p);
expect('…until the city is added', !(await p.locator('[data-act=shapeCreate]').isDisabled()));
await p.click('[data-act=shapeBack]'); await settle(p);
expect('back keeps what you wrote', /Dinner Friday/.test(await p.locator('#nd-text').inputValue()));

// —— the step-by-step form still works ——
await p.click('[data-size=weekend]'); await settle(p);
expect('picking a size still opens the step-by-step flow', (await p.locator('[data-mode=friends]').count()) === 1);

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

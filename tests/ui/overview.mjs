// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// The redesigned home and plan home: the home screen has one bright action and plan cards that open
// the plan; the plan home leads with the plan's cover, then one next move whose button follows the
// plan's real state; the hero's Invite only shows when inviting isn't already the next move; and
// someone who hasn't answered an invite sees just the invitation (no planning tabs or menu) until
// they answer or choose to look around.
import { claim, install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 200) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(500));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const page = async (name, hash = '') => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(BASE + '/' + hash); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p); return p;
};
// what's on the screen itself (not the passing milestone toast)
const visible = (p, sel) => p.locator(sel).evaluateAll(els => els.filter(e => e.offsetParent !== null && !e.closest('#milestone, .milestone, #toast')).map(e => e.textContent.trim()));
const reopen = async (p, tid) => { await p.goto(`${BASE}/#${tid}`); await settle(p); await p.waitForSelector('.ov-hero', { timeout: 8000 }); await p.waitForTimeout(400); };

// —— home ——
const A = await page('Ana'), uid = await A.evaluate(() => localStorage.outta_uid);
expect('a new person’s home has one bright action: Make a plan', (await visible(A, '.btn.primary')).join('|') === 'Make a plan', (await visible(A, '.btn.primary')).join('|'));
await A.click('[data-act=newTrip]'); await settle(A); await A.click('[data-size=weekend]'); await settle(A); await A.click('[data-mode=friends]'); await settle(A);
await A.fill('#nt-name', 'Cabin weekend'); await A.click('#newTrip [type=submit]'); await A.waitForSelector('.setup'); await A.click('[data-act=setupLater]'); await settle(A);
const tid = (await A.evaluate(() => location.hash)).slice(1);

// —— the plan home, before anyone joins ——
await reopen(A, tid);
expect('the plan home leads with the plan’s name and what it is', (await A.locator('.ov-hero .ovh-title').innerText()) === 'Cabin weekend' && /Friends weekend/.test(await A.locator('.ov-hero .ovh-top').innerText()));
expect('alone, the next move is inviting the crew, and it’s the only bright button', (await visible(A, '.btn.primary')).join('|') === 'Send the invite' && /Get everyone into the plan/.test(await A.locator('.j-focus h2').innerText()), (await visible(A, '.btn.primary')).join('|'));
expect('…so the cover doesn’t repeat an Invite button', !(await A.locator('.ov-hero [data-tab=crew]').count()));
expect('no “TBD” placeholders on the plan home', !/\bTBD\b/.test(await A.locator('body').innerText()));
expect('progress is shown once, compactly', (await A.locator('.j-strip').count()) === 1 && /1 of 6/.test(await A.locator('.ovp-head').innerText()));

// —— an invitee, before answering ——
const key = (await api(uid, 'get', 'trips/' + tid)).data.inviteKey, J = await page('Jo', `#${tid}.${key}`);
await J.waitForSelector('.welcome', { timeout: 8000 });
expect('an invitee sees the invitation with the plan’s name and who invited them', /Ana invited you/.test(await J.locator('.welcome').innerText()) && /Cabin weekend/.test(await J.locator('.welcome').innerText()));
expect('…and not the planning tabs or the menu yet', !(await J.locator('.bottomnav').count()) && !(await J.locator('.subtabs').count()) && !(await J.locator('.j-focus').count()));
await J.locator('[data-act=peek]').click(); await settle(J);
expect('“Look around the plan first” shows the menu, with the invitation still on top', (await J.locator('.bottomnav').count()) === 1 && (await J.locator('.welcome [data-join=in]').count()) === 1);
await J.click('[data-join=in]'); await settle(J); if (await J.locator('[data-act=setupLater]').count()) { await J.click('[data-act=setupLater]'); await settle(J); }
await reopen(J, tid);
expect('once they’re in, they get the plan home, not the invitation', !(await J.locator('.welcome').count()) && (await J.locator('.ov-hero .ovh-title').count()) === 1 && (await J.locator('.bottomnav').count()) === 1);

// —— with the crew in, the next move moves on ——
await reopen(A, tid);
const f2 = await A.locator('.j-focus h2').innerText();
expect('with someone in, the next move is no longer inviting', !/Get everyone into the plan/.test(f2), f2);
expect('…and the cover offers Invite instead', (await A.locator('.ov-hero [data-tab=crew]').count()) === 1);
expect('…still with only one bright button', (await visible(A, '.btn.primary')).length <= 1, (await visible(A, '.btn.primary')).join('|'));
expect('the cover counts who’s going', /2 going/.test(await A.locator('.ovh-who').innerText()), await A.locator('.ovh-who').innerText());
// dates and place locked: the cover shows them and a countdown, and the tiles say they're done
await api(uid, 'update', 'trips/' + tid, { destinations: [{ id: 'd1', city: 'Catskills' }], lockedDest: 'd1', lockedDates: { start: '2026-12-04', end: '2026-12-06' } });
await reopen(A, tid);
expect('locked in: the cover shows where, when and the countdown', /Catskills · Dec 4/.test(await A.locator('.ovh-meta').innerText()) && /days to go/.test(await A.locator('.ovh-count').innerText()));
expect('…and the When and Where tiles are marked done', (await A.locator('.glance.g-done').count()) >= 2);

// —— home with a plan ——
await A.click('[data-act=home] >> nth=0'); await settle(A);
expect('home with plans: still one bright action, and the plan as a card', (await visible(A, '.btn.primary')).join('|') === 'Make a plan' && /Cabin weekend/.test(await A.locator('.pcard').first().innerText()), (await visible(A, '.btn.primary')).join('|'));
await A.locator('.pcard [data-open]').first().click(); await A.waitForSelector('.ov-hero'); await settle(A);
expect('tapping the card opens the plan', (await A.locator('.ov-hero .ovh-title').innerText()) === 'Cabin weekend');

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

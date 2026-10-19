// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// The quick setup after creating or joining a plan plays like a run of quick wins: one continuous
// progress bar that grows as each question is answered and is full once the last one is; the button
// says "Skip" until something's picked, then "Continue" ("Finish" on the last); answers get a cheer;
// finishing lands on the plan. Someone joining from an invite goes straight into it with a welcome,
// with no "step done" banner or toast on top.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 200) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(450));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const page = async (name, hash = '') => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(BASE + '/' + hash); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p); return p;
};
// the bar's fill as a share of its track, rounded to whole percent
const fill = async p => p.locator('.setup-bar').evaluate(el => Math.round(el.firstElementChild.getBoundingClientRect().width / el.getBoundingClientRect().width * 100));
const go = p => p.locator('.setup-go').innerText().then(s => s.trim().toLowerCase());
const next = async p => { await p.click('[data-act=setupNext]'); await settle(p); };
const A = await page('Maya'), uid = await A.evaluate(() => localStorage.outta_uid);
await A.click('[data-act=newTrip]'); await settle(A); await A.click('[data-size=weekend]'); await settle(A); await A.click('[data-mode=friends]'); await settle(A);
await A.fill('#nt-name', 'Cabin weekend'); await A.click('#newTrip [type=submit]'); await A.waitForSelector('.setup'); await settle(A);
const tid = (await A.evaluate(() => location.hash)).slice(1);

// —— the organizer: 4 questions ——
expect('one continuous bar, no segments', (await A.locator('.setup-bar').count()) === 1 && !(await A.locator('.setup-prog').count()));
expect('step 1, nothing picked: an empty bar and “Skip”', (await fill(A)) <= 6 && (await go(A)) === 'skip', `${await fill(A)}% ${await go(A)}`);
await A.click('[data-act=allDays]'); await settle(A);
expect('picking days fills a quarter of the bar and the button says “Continue”', Math.abs((await fill(A)) - 25) <= 2 && (await go(A)) === 'continue', `${await fill(A)}% ${await go(A)}`);
await next(A);
expect('step 2: the answer gets a cheer, and the bar keeps its quarter', (await A.locator('.setup-praise').count()) === 1 && Math.abs((await fill(A)) - 25) <= 2 && (await go(A)) === 'skip', `${await fill(A)}%`);
await A.fill('#me-home', 'Brooklyn');
expect('typing an answer grows the bar to half and flips to “Continue” right away', Math.abs((await fill(A)) - 50) <= 2 && (await go(A)) === 'continue', `${await fill(A)}% ${await go(A)}`);
await next(A); await A.click('[data-budget]'); await settle(A);
expect('step 3 answered: three quarters', Math.abs((await fill(A)) - 75) <= 2, `${await fill(A)}%`);
await next(A);
expect('last step, unanswered: “Skip and finish”', (await go(A)) === 'skip and finish' && !(await A.locator('.setup-bar.full').count()));
await A.locator('[data-quiz]').first().click(); await settle(A);
expect('answering the last question fills the whole bar, and the button says “Finish”', (await fill(A)) === 100 && (await A.locator('.setup-bar.full').count()) === 1 && (await go(A)) === 'finish', `${await fill(A)}%`);
await next(A);
expect('finishing lands on the plan', !(await A.locator('.setup').count()) && (await A.locator('.ov-hero').count()) === 1);
{ const me = (await api(uid, 'get', `trips/${tid}/members/${uid}`)).data; expect('…with every answer saved', me.days?.length > 0 && me.home === 'Brooklyn' && me.budget > 0 && Object.keys(me.quiz || {}).length === 1, JSON.stringify({ home: me.home, budget: me.budget })); }

// —— an invited friend ——
const key = (await api(uid, 'get', 'trips/' + tid)).data.inviteKey;
const J = await page('Jo', `#${tid}.${key}`); await J.waitForSelector('.setup'); await settle(J); await J.waitForTimeout(600);
expect('saying “I’m in” on the invitation opens a one-question setup with a welcome', /You’re in! One quick question and you’re done/.test(await J.locator('.setup-hi').innerText()));
expect('…with no “step done” banner or toast on top', !(await J.locator('.milestone').count()) && !(await J.locator('#toast.show, #toast.on').count()) && !/A few quick questions first/.test(await J.locator('#toast').innerText().catch(() => '')));
await J.click('[data-act=setupLater]'); await settle(J);
expect('“Do this later” still goes to the plan', !(await J.locator('.setup').count()) && (await J.locator('.bottomnav').count()) === 1);

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

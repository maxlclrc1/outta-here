// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// The new-plan flow: size, type, then the basics, with a progress bar, back and cancel. The quick
// "when" picks fill the dates, the cover preview shows the name as it's typed, and the plan is saved
// with everything chosen (type, size, city, window, currency, nights, the guest of honor's name).
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 200) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Ana'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid), day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const prog = async () => [await p.locator('.nf-prog').getAttribute('aria-valuenow'), await p.locator('.nf-prog').getAttribute('aria-valuemax')].join('/');

await p.click('[data-act=newTrip]'); await settle(p);
expect('step 1 of 3: what are we planning, with the four sizes', (await prog()) === '1/3' && (await p.locator('[data-size]').count()) === 4, await prog());
await p.click('[data-size=weekend]'); await settle(p);
expect('step 2: the ten types, worded for a weekend, with guest-of-honor tags', (await prog()) === '2/3' && (await p.locator('[data-mode]').count()) === 10 && (await p.locator('[data-mode=friends] b').innerText()) === 'Friends weekend' && (await p.locator('[data-mode=birthday] .nf-tag').count()) === 1);
await p.locator('.nf-nav[data-act=backSize]').click(); await settle(p);
expect('back goes to the sizes', (await prog()) === '1/3' && (await p.locator('[data-size]').count()) === 4);
await p.click('[data-size=weekend]'); await settle(p); await p.click('[data-mode=birthday]'); await settle(p);
expect('step 3: the basics', (await prog()) === '3/3' && (await p.locator('#nt-name').count()) === 1 && !(await p.locator('#nt-city').count()));
await p.fill('#nt-name', 'Dev turns 30');
expect('the cover preview shows the name as it’s typed', (await p.locator('.nf-pv-title').innerText()) === 'Dev turns 30');
await p.locator('.nf-chip', { hasText: 'In 1–3 months' }).click(); await settle(p);
expect('a quick “when” pick fills the dates and is shown as picked', (await p.inputValue('#nt-start')) === day(30) && (await p.inputValue('#nt-end')) === day(100) && /on/.test(await p.locator('.nf-chip', { hasText: 'In 1–3 months' }).getAttribute('class')));
expect('…and the name is still there after it', (await p.inputValue('#nt-name')) === 'Dev turns 30');
await p.locator('.nf-more summary').click(); await p.selectOption('#nt-cur', 'EUR'); await p.selectOption('#nt-nights', '3'); await p.fill('#nt-honoree', 'Dev');
await p.click('#newTrip [type=submit]');
expect('creating it shows the launch moment', await p.waitForSelector('.launch', { timeout: 3000 }).then(() => true).catch(() => false));
await p.waitForSelector('.setup', { timeout: 8000 });
const tid = (await p.evaluate(() => location.hash)).slice(1), t = (await api(uid, 'get', 'trips/' + tid)).data;
expect('the plan is saved with everything chosen', t.name === 'Dev turns 30' && t.size === 'weekend' && t.mode === 'birthday' && t.winStart === day(30) && t.winEnd === day(100) && t.currency === 'EUR' && t.nights === 3 && t.honoreeName === 'Dev' && t.honoreeFree === true, JSON.stringify({ n: t.name, s: t.size, m: t.mode, a: t.winStart, b: t.winEnd, c: t.currency, nights: t.nights, h: t.honoreeName }));
await p.waitForTimeout(1900);
expect('the launch moment clears itself', !(await p.locator('.launch').count()));

// a hangout: the city is asked for, and cancel leaves the flow with nothing made
await p.click('[data-act=setupLater]'); await settle(p); await p.locator('[data-act=home]').first().dispatchEvent('click'); await settle(p);
await p.click('[data-act=newTrip]'); await settle(p);
await p.click('[data-size=hangout]'); await settle(p); await p.click('[data-mode=family]'); await settle(p);
expect('a hangout asks for the city, with this week’s quick picks, on a blank form (not the last one)', (await p.locator('#nt-city').count()) === 1 && (await p.locator('.nf-chip').allInnerTexts()).join('|') === 'Today|This week|Next 2 weeks' && (await p.inputValue('#nt-name')) === '');
const before = (await api(uid, 'list', 'trips')).docs.length;
await p.locator('.nf-nav[data-act=cancelNew]').click(); await settle(p);
expect('cancel goes home and makes nothing', (await p.locator('.home-hero').count()) === 1 && (await api(uid, 'list', 'trips')).docs.length === before);

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

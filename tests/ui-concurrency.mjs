// Run with the app running (npm run dev). Needs Playwright:
//   PLAYWRIGHT=/path/to/playwright/index.mjs CHROMIUM=/path/to/chromium node tests/ui-concurrency.mjs
// Real browsers reproducing audit findings #9 and #10 through the app itself.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errs = []; let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const db = (p, op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
const join = async (name, link = '') => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); await p.goto(BASE + '/' + link); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p); return p; };
const later = async p => { const l = p.locator('[data-act=setupLater]'); if (await l.count()) { await l.click(); await settle(p); } };

const a = await join('Ari');
await a.click('[data-act=newTrip]'); await settle(a); await a.click('[data-size=weekend]'); await settle(a); await a.locator('[data-mode]').first().click(); await settle(a);
await a.fill('#nt-name', 'Overlap'); await a.click('#newTrip [type=submit]'); await a.waitForSelector('.setup'); await later(a);
const hash = await a.evaluate(() => location.hash), tid = hash.slice(1);
const bea = await join('Bea', hash); await bea.waitForSelector('.welcome'); await bea.click('[data-join=in]'); await later(bea); await bea.waitForTimeout(800);
await db(a, 'update', 'trips/' + tid, { lockedDest: null, lockedDates: { start: '2026-11-20', end: '2026-11-22' } }); await a.waitForTimeout(800);
for (const p of [a, bea]) { await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.locator('.subtab[data-tab=plan]').click(); await settle(p); }

// #9: both add a stop to the same day at the same moment
const add = (p, title) => p.evaluate(title => { const f = document.querySelector('form.addItem'); f.querySelector('input[id^="ai-title"]').value = title; f.requestSubmit(); }, title);
await Promise.all([add(a, 'Fado night'), add(bea, 'Sunset viewpoint')]);
await a.waitForTimeout(1500);
const titles = (await db(a, 'get', 'trips/' + tid)).data.itinerary.map(i => i.title);
check('two people adding stops at the same time keeps both', titles.includes('Fado night') && titles.includes('Sunset viewpoint'), titles.join(', '));

// #10: Bea taps a free day (saved half a second later); meanwhile the organizer counts her out
const beaId = await bea.evaluate(() => localStorage.outta_uid);
await bea.locator('.subtab[data-tab=dates]').click(); await settle(bea);
await bea.evaluate(() => document.querySelectorAll('details.more-opts').forEach(d => d.open = true)); await bea.locator('.day').first().dispatchEvent('click');
await db(a, 'update', `trips/${tid}/members/${beaId}`, { status: 'out', countedOut: true });
await bea.waitForTimeout(2000);
const doc = (await db(bea, 'get', `trips/${tid}/members/${beaId}`)).data;
check('Bea’s save right after being counted out doesn’t undo it', doc.status === 'out' && doc.countedOut === true, `status ${doc.status}`);
check('…and her day is saved', (doc.days || []).length === 1);

check('no page errors', !errs.length, errs.join(' | '));
await db(a, 'delete', 'trips/' + tid);
console.log(fails ? `${fails} FAILED` : 'ui concurrency checks passed'); await b.close(); process.exit(fails ? 1 : 0);

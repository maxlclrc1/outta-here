// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const skipSetup = async p => { await p.waitForTimeout(250); const l = p.locator('[data-act=setupLater]'); if (await l.count()) { await l.click(); await p.waitForSelector('.bottomnav'); await p.waitForTimeout(300); } };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [], prompts = [];
const expect = (label, ok, detail = '') => console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`);
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const db = (p, op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
const mk = async (name, link) => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
  await c.route('**/api/ai', async r => { prompts.push(JSON.parse(r.request().postData()).input); r.fulfill({ json: { text: JSON.stringify({ days: [] }), truncated: false } }); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto((process.env.BASE || 'http://localhost:3000') + '/' + (link || '')); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p); return p;
};
const txt = async (p, s) => (await p.locator(s).first().innerText()).replace(/\n+/g, ' | ');
const go = async (p, sec, tab) => { await p.click(`.bottomnav [data-sec=${sec}]`); await settle(p); if (tab) { await p.locator(`.subtab[data-tab=${tab}]`).click(); await settle(p); } };
const a = await mk('Ali');
await a.click('[data-act=newTrip]'); await settle(a); await a.click('[data-size=weekend]'); await settle(a); await a.locator('[data-mode]').first().click(); await settle(a);
await a.fill('#nt-name', 'Birthday'); await a.click('#newTrip [type=submit]'); await a.waitForSelector('.setup'); await skipSetup(a); await settle(a);
const hash = await a.evaluate(() => location.hash), tid = hash.slice(1);
const j = await mk('Jay', hash), k = await mk('Kim', hash);
for (const p of [j, k]) { await p.waitForSelector('.welcome, .setup, .ov-hero'); await p.locator('[data-join=in]').click({ timeout: 2500 }).catch(() => {}); await skipSetup(p); await p.waitForTimeout(500); }
await db(a, 'update', 'trips/' + tid, { destinations: [{ id: 'd1', city: 'Lisbon' }], lockedDest: 'd1', lockedDates: { start: '2026-11-20', end: '2026-11-22' },
  itinerary: [{ id: 'i1', date: '2026-11-21', time: '20:30', title: 'Birthday dinner', kind: 'food' }, { id: 'i2', date: '2026-11-22', time: '11:00', title: 'Brunch', kind: 'food' }] });
await a.waitForTimeout(800);
// 1. Ali moves the dinner; Jay sees it at once
await go(a, 'plan', 'plan'); await go(j, 'home', 'overview');
await a.locator('[data-edititem=i1]').dispatchEvent('click'); await settle(a);
await a.selectOption('#ei-date', '2026-11-20'); await a.fill('#ei-time', '21:00'); await a.locator('#editItemForm [type=submit]').click(); await a.waitForTimeout(1500);
{ const m = await txt(j, '#toast'); console.log('Jay toast:', m); expect('a moved stop reaches the crew right away', /moved to/.test(m), m); }
console.log('Jay banner:', await txt(j, '.live-changes'));
console.log('Jay tab badge:', await j.locator('.subtab[data-tab=log] .count').innerText().catch(() => 'none'));
await j.locator('.live-changes [data-ack]').first().dispatchEvent('click'); await j.waitForTimeout(800);
{ const n = await j.locator('.live-changes').count(); console.log('Jay banner after ack:', n); expect('“Got it” clears the banner', n === 0); }
await go(a, 'home', 'log');
console.log('Ali log row:', await txt(a, '.log-row'));
// 2. Ali undoes it
await a.locator('.log-row [data-undo]').first().dispatchEvent('click'); await a.waitForTimeout(1200);
const it = (await db(a, 'get', 'trips/' + tid)).data.itinerary.find(i => i.id === 'i1'); console.log('after undo:', it.date, it.time); expect('undo moves the stop back', it.date === '2026-11-21' && it.time === '20:30');
console.log('Kim banner:', await txt(k, '.live-changes').catch(() => 'none'));
// 3. Jay deletes brunch; Ali (organizer) can restore
await go(j, 'plan', 'plan'); await j.locator('[data-delitem=i2]').dispatchEvent('click'); await j.waitForTimeout(1200);
await a.reload(); await settle(a); await go(a, 'home', 'log');
console.log('Ali sees:', await txt(a, '.log-row'));
await a.locator('.log-row [data-undo]').first().dispatchEvent('click'); await a.waitForTimeout(1000);
{ const back = (await db(a, 'get', 'trips/' + tid)).data.itinerary.some(i => i.id === 'i2'); console.log('brunch back:', back); expect('an organizer can restore a deleted stop', back); }
// 4. needs
await go(j, 'home', 'crew');
await j.locator('[data-need="diet|vegetarian"]').dispatchEvent('click'); await j.waitForTimeout(300); await j.locator('[data-need="diet|nuts"]').dispatchEvent('click'); await j.waitForTimeout(300);
await j.fill('#nd-dietNote', 'severe, carry an EpiPen'); await j.locator('#nd-dietNote').blur(); await j.waitForTimeout(300);
await j.locator('[data-need="access|stepfree"]').dispatchEvent('click'); await j.waitForTimeout(300); await j.selectOption('#nd-share-access', 'org'); await j.waitForTimeout(300);
await j.fill('#nd-depart', '09:00'); await j.locator('#nd-depart').blur(); await j.selectOption('#nd-maxTravel', '4'); await j.waitForTimeout(300); await j.selectOption('#nd-share-travel', 'named'); await j.waitForTimeout(1000);
console.log('Jay needs saved:', JSON.stringify((await db(j, 'get', `trips/${tid}/members/${await j.evaluate(() => localStorage.outta_uid)}`)).data.needs));
await a.reload(); await settle(a); await go(a, 'plan', 'plan'); console.log('Ali (organizer) sees:', await txt(a, '.needs-sum'));
await go(k, 'plan', 'plan'); { const t = await txt(k, '.needs-sum'); console.log('Kim sees:', t); expect('organizer-only needs are hidden from other members', !/Step-free/.test(t) && /Vegetarian/.test(t), t); }
await a.locator('[data-act=plan]').dispatchEvent('click'); await a.waitForTimeout(1200);
const pr = prompts[prompts.length - 1] || ''; console.log('AI needs block:', pr.slice(pr.indexOf('Practical needs'), pr.indexOf('Give every price')).replace(/\n/g, ' / '), '| mentions Jay?', /Jay/.test(pr.slice(pr.indexOf('Practical needs'))));
await j.locator('.my-needs').screenshot({ path: 'needs-mine.png' }); await go(j, 'home', 'log'); await j.screenshot({ path: 'log.png', fullPage: true });
console.log('errors', errs); await b.close();

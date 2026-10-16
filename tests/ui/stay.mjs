// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(500));
const db = (p, op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto((process.env.BASE || 'http://localhost:3000') + '/'); await p.fill('#join-name', 'Ali'); await p.click('.join-card [type=submit]'); await settle(p);
await p.click('[data-act=newTrip]'); await settle(p); await p.click('[data-size=weekend]'); await settle(p); await p.locator('[data-mode]').first().click(); await settle(p);
await p.evaluate(() => { const d = document.querySelector('.more-opts-inline'); if (d) d.open = true; }); await p.selectOption('#nt-cur', 'EUR'); await p.fill('#nt-name', 'Cabin'); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); await p.click('[data-act=setupLater]'); await settle(p);
const tid = (await p.evaluate(() => location.hash)).slice(1);
await db(p, 'update', 'trips/' + tid, { destinations: [{ id: 'd1', city: 'Catskills' }], lockedDest: 'd1', lockedDates: { start: '2026-11-20', end: '2026-11-22' }, stays: { city: 'Catskills', items: [{ id: 'a1', name: 'AI Lodge', kind: 'hotel', area: 'Phoenicia', perNight: '€180–220', perPerson: '€90', sleeps: '4', why: 'x', pros: [] }], at: 1 } });
await p.waitForTimeout(700);
await p.click('.bottomnav [data-sec=book]'); await settle(p); await p.click('.subtab[data-tab=stays]'); await settle(p);
await p.click('[data-act=addStayOpen]'); await settle(p);
await p.fill('#os-url', 'https://www.airbnb.com/rooms/12345'); await p.fill('#os-total', '640'); await p.fill('#os-sleeps', '6'); await p.fill('#os-note', 'Hot tub and a fire pit');
await p.click('#ownStayForm [data-how=add]'); await p.waitForTimeout(800); await settle(p);
console.log('own card:', (await p.locator('.own-stay').innerText()).replace(/\n+/g, ' | '));
// lock the AI one first, then switch to the crew's own find
await p.locator('[data-lockstay]').first().dispatchEvent('click'); await p.waitForTimeout(800);
console.log('locked AI:', (await p.locator('.locked-stay h2').innerText()));
await p.locator('[data-lockown]').first().dispatchEvent('click'); await p.waitForTimeout(1000); await settle(p);
console.log('locked own:', (await p.locator('.locked-stay').innerText()).replace(/\n+/g, ' | ').slice(0, 220));
const st = (await db(p, 'get', 'trips/' + tid)).data.stay; console.log('saved stay keys:', Object.keys(st).sort().join(','), '| perPerson left over from AI?', 'perPerson' in st);
await p.fill('#sb-total', '700'); await p.click('#stayBookForm [type=submit]'); await p.waitForTimeout(800); await settle(p);
console.log('booked:', await p.locator('.locked-stay').innerText().then(t => t.split('\n').slice(-1)[0]));
await p.click('.bottomnav [data-sec=money]'); await settle(p); await p.click('.subtab[data-tab=cost]'); await settle(p);
console.log('cost stay row:', (await p.locator('.cost-row', { hasText: 'Stay' }).innerText()).replace(/\n+/g, ' | '));
await p.click('.bottomnav [data-sec=book]'); await settle(p); await p.click('.subtab[data-tab=stays]'); await settle(p); await p.screenshot({ path: 'stay.png', fullPage: true });
console.log('errors', errs); await b.close();

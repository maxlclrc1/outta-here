// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
const expect = (label, ok, detail = '') => console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`);
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(500));
const db = (p, op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
const txt = async s => (await p.locator(s).first().innerText()).replace(/\n+/g, ' | ');
await p.goto((process.env.BASE || 'http://localhost:3000') + '/'); await p.fill('#join-name', 'Ali'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid);
await p.click('[data-act=newTrip]'); await settle(p); await p.click('[data-size=trip]'); await settle(p); await p.locator('[data-mode]').first().click(); await settle(p);
await p.evaluate(() => { const d = document.querySelector('.more-opts-inline'); if (d) d.open = true; }); await p.selectOption('#nt-cur', 'EUR'); await p.fill('#nt-name', 'Lisbon'); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); await p.click('[data-act=setupLater]'); await settle(p);
const tid = (await p.evaluate(() => location.hash)).slice(1);
await db(p, 'update', `trips/${tid}/members/${uid}`, { status: 'confirmed' });
const mem = (id, nick, x = {}) => db(p, 'set', `trips/${tid}/members/${id}`, { nick, home: 'Berlin', budget: 0, status: 'confirmed', days: [], votes: [], updatedAt: Date.now(), ...x });
for (const [id, n] of [['u2', 'Alex'], ['u3', 'Sam'], ['u4', 'Jo'], ['u5', 'Kim'], ['u6', 'Lee']]) await mem(id, n, id === 'u3' ? { cond: { under: 560 } } : {});
await db(p, 'update', 'trips/' + tid, { people: { u2: true, u3: true, u4: true, u5: true, u6: true }, destinations: [{ id: 'd1', city: 'Lisbon' }], lockedDest: 'd1', lockedDates: { start: '2026-11-20', end: '2026-11-23' },
  stay: { name: 'Alfama flat', total: 900, booked: true }, tickets: { u2: { flight: 'TP123', price: 210 } },
  costs: { food: { low: 200, high: 200, src: 'estimate' }, local: { low: 50, high: 50, src: 'estimate' } },
  tasks: { t1: { title: 'Book the boat', owner: 'u2', due: '', done: false } }, itinerary: [{ id: 'i1', date: '2026-11-21', time: '20:00', title: 'Fado night', kind: 'nightlife' }] });
await p.waitForTimeout(900);
await p.locator('[data-recover=drop]').dispatchEvent('click'); await settle(p);
await p.selectOption('#recover-who', 'u2'); await p.waitForTimeout(500);
{ const t = await txt('#recover-box .impact'); console.log('IMPACT:', t); expect('a drop-out shows the new share of the stay', /6 → 5/.test(t) && /€150 → €180/.test(t), t); }
console.log('STEPS:', (await p.locator('#recover-box .check-line').allInnerTexts()).join(' / '));
await p.check('#rc-act-replace'); await p.selectOption('#rc-owner-t1', 'u3'); await p.check('#rc-act-ask');
await p.locator('[data-act=recoverApply]').dispatchEvent('click'); await p.waitForTimeout(1200); await settle(p);
console.log('toast:', await txt('#toast'));
const t = (await db(p, 'get', 'trips/' + tid)).data, alex = (await db(p, 'get', `trips/${tid}/members/u2`)).data;
console.log('alex:', alex.status, '| tasks:', Object.values(t.tasks).map(x => `${x.title} → ${x.owner}`).join('; '), '| check:', t.check?.q, '| log:', JSON.stringify(Object.values(t.changes)[0]));
{ const t = await txt('.changes'); console.log('CARD:', t); expect('the change and a crew check-in are shown', /Alex dropped out/.test(t) && /What do we do/.test(t)); }
await p.locator('[data-check=go]').dispatchEvent('click'); await p.waitForTimeout(600); console.log('vote:', await txt('.check'));
// price change
await p.locator('[data-recover=price]').dispatchEvent('click'); await settle(p);
await p.selectOption('#rc-line', 'stay'); await p.waitForTimeout(400); await p.fill('#rc-amount', '1300'); await p.locator('#rc-amount').blur(); await p.waitForTimeout(500);
console.log('PRICE IMPACT:', await txt('#recover-box .impact'));
await p.locator('[data-act=recoverApply]').dispatchEvent('click'); await p.waitForTimeout(900);
{ const v = (await db(p, 'get', 'trips/' + tid)).data.stay.total; console.log('stay total:', v); expect('a new stay price is saved', v === 1300); }
// dates move
await p.locator('[data-recover=dates]').dispatchEvent('click'); await settle(p);
await p.fill('#rc-start', '2026-12-04'); await p.locator('#rc-start').blur(); await p.waitForTimeout(500);
console.log('end auto:', await p.inputValue('#rc-end'));
console.log('DATES IMPACT:', await txt('#recover-box .impact'), '| steps', (await p.locator('#recover-box .check-line').allInnerTexts()).join(' / '));
await p.locator('[data-act=recoverApply]').dispatchEvent('click'); await p.waitForTimeout(900);
const t2 = (await db(p, 'get', 'trips/' + tid)).data; expect('moving the dates moves the itinerary with them', t2.lockedDates?.start === '2026-12-04' && t2.itinerary.every(i => i.date >= '2026-12-04')); console.log('dates:', JSON.stringify(t2.lockedDates), 'itin:', t2.itinerary.map(i => i.date).join(','), 'tasks:', Object.values(t2.tasks).map(x => x.title).join('; '));
// a drop from elsewhere is logged too
await p.click('.bottomnav [data-sec=home]').catch(() => {}); await settle(p); await p.locator('.subtab[data-tab=crew]').click(); await settle(p);
await p.locator('[data-status=out]').first().dispatchEvent('click'); await p.waitForTimeout(900);
const log = Object.values((await db(p, 'get', 'trips/' + tid)).data.changes).sort((a, b) => b.at - a.at)[0]; console.log('self drop log:', JSON.stringify(log));
await p.locator('.subtab[data-tab=overview]').click(); await settle(p); await p.screenshot({ path: 'recover.png', fullPage: true });
console.log('errors', errs); await b.close();

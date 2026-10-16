// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
const expect = (label, ok, detail = '') => console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`);
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(500));
const db = (p, op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
const toast = async () => { await p.waitForTimeout(300); return (await p.locator('#toast').isVisible()) ? p.locator('#toast').innerText() : '(no toast)'; };
await p.goto((process.env.BASE || 'http://localhost:3000') + '/'); await p.fill('#join-name', 'Ali'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid);
await p.click('[data-act=newTrip]'); await settle(p); await p.click('[data-size=trip]'); await settle(p); await p.locator('[data-mode]').first().click(); await settle(p);
await p.evaluate(() => { const d = document.querySelector('.more-opts-inline'); if (d) d.open = true; }); await p.selectOption('#nt-cur', 'EUR'); await p.fill('#nt-name', 'Summer'); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); await p.click('[data-act=setupLater]'); await settle(p);
const tid = (await p.evaluate(() => location.hash)).slice(1);
const mem = (id, nick, x = {}) => db(p, 'set', `trips/${tid}/members/${id}`, { nick, home: 'Berlin', budget: 0, status: 'in', days: [], votes: [], updatedAt: Date.now(), ...x });
await mem('u_two00', 'Jay'); await mem('u_three0', 'Sam', { budget: 500, hard: { budget: true } });
await db(p, 'update', 'trips/' + tid, { people: { u_two00: true, u_three0: true }, pitches: { at: 1, items: [
  { id: 'pA', city: 'Lisbon', code: 'LIS', start: '2026-11-20', end: '2026-11-23', tagline: 'x', why: 'x', perPerson: '€650–800', vibeMatch: 80, highlights: [], weather: '' },
  { id: 'pB', city: 'Porto', code: 'OPO', start: '2026-11-20', end: '2026-11-23', tagline: 'y', why: 'y', perPerson: '€350–420', vibeMatch: 70, highlights: [], weather: '' }] },
});
// each person records their own swipes (the server only accepts your own votes)
const as = (u, data) => fetch((process.env.BASE || 'http://localhost:3000') + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op: 'update', path: 'trips/' + tid, data }) });
await as(uid, { swipes: { pA: { [uid]: 1 }, pB: { [uid]: 1 } } }); await as('u_two00', { swipes: { pA: { u_two00: 1 }, pB: { u_two00: -1 } } }); await as('u_three0', { swipes: { pA: { u_three0: -1 }, pB: { u_three0: 1 } } });
await p.waitForTimeout(800);
await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.locator('.subtab[data-tab=match]').click(); await settle(p);
console.log('rule line:', await p.locator('.rule-line').first().innerText());
const row = c => p.locator('.linkrow', { hasText: c });
{ const c = (await row('Lisbon').locator('.rule-fit').innerText()).replace(/\n/g, ' | '); console.log('Lisbon chips:', c); expect('a pitch over a hard limit is flagged', /hard limit/.test(c), c); }
await row('Porto').locator('[data-lockpitch]').dispatchEvent('click'); { const m = await toast(); console.log('lock Porto (all):', m); expect('everyone gets a say: a pitch someone passed on can’t be locked', /passed on it/.test(m), m); }
// switch to majority
await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.locator('.subtab[data-tab=settings]').click(); await settle(p);
await p.click('[data-decide=majority]'); await p.waitForTimeout(600); await p.selectOption('#dec-pct', '60'); await p.waitForTimeout(600);
console.log('decide saved:', JSON.stringify((await db(p, 'get', 'trips/' + tid)).data.decide));
await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.locator('.subtab[data-tab=match]').click(); await settle(p);
console.log('rule line:', await p.locator('.rule-line').first().innerText());
console.log('Lisbon chips:', (await row('Lisbon').locator('.rule-fit').innerText()).replace(/\n/g, ' | '));
await row('Lisbon').locator('[data-lockpitch]').dispatchEvent('click'); { const m = await toast(); console.log('lock Lisbon (majority, Sam hard 500):', m); expect('a majority can’t override a hard limit', /hard limit/.test(m), m); }
// Sam agrees
await as('u_three0', { consent: { 'p:pA': { u_three0: true } } }); await p.waitForTimeout(700);
{ const c = (await row('Lisbon').locator('.rule-fit').innerText()).replace(/\n/g, ' | '); console.log('Lisbon chips after consent:', c); expect('after agreeing, it can be locked', /Can lock/.test(c), c); }
await row('Lisbon').locator('[data-lockpitch]').dispatchEvent('click'); await p.waitForTimeout(700);
{ const L = (await db(p, 'get', 'trips/' + tid)).data.lockedDates; console.log('locked:', JSON.stringify(L)); expect('the agreed pitch is locked', L && L.start === '2026-11-20'); }
// my own hard limit + condition
await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.locator('.subtab[data-tab=crew]').click(); await settle(p);
await p.fill('#me-budget', '400'); await p.locator('#me-budget').blur(); await p.waitForTimeout(800);
await p.check('#me-hardBudget'); await p.waitForTimeout(500);
await p.fill('#me-condUnder', '300'); await p.fill('#me-condNote', 'we leave Friday evening'); await p.locator('#me-condNote').blur(); await p.waitForTimeout(800);
await db(p, 'update', 'trips/' + tid, { costs: { stay: { low: 320, high: 400, src: 'quote' } } }); await p.waitForTimeout(800);
console.log('me saved:', JSON.stringify((await db(p, 'get', `trips/${tid}/members/${uid}`)).data).match(/"hard".*?\}|"cond".*?\}/g));
console.log('limits card:', (await p.locator('.limits').innerText()).replace(/\n+/g, ' | ').slice(-200));
console.log('cond list:', (await p.locator('.cond-list').innerText()).replace(/\n+/g, ' | '));
await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.locator('.subtab[data-tab=match]').click(); await settle(p);
console.log('Porto row (me hard 400, €350):', (await row('Porto').locator('.rule-fit').innerText()).replace(/\n/g, ' | '), '| ask:', await row('Porto').locator('[data-consent]').count());
console.log('Lisbon ask:', await row('Lisbon').locator('[data-consent]').count());
await p.screenshot({ path: 'decide-match.png', fullPage: true });
await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.locator('.subtab[data-tab=settings]').click(); await settle(p);
await p.locator('#decide-card').screenshot({ path: 'decide-card.png' });
console.log('errors', errs); await b.close();

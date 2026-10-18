// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const skipSetup = async p => { await p.waitForTimeout(250); const l = p.locator('[data-act=setupLater]'); if (await l.count()) { await l.click(); await p.waitForSelector('.bottomnav'); await p.waitForTimeout(300); } };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const db = (p, op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
const mk = async (name, link) => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
  await c.route('**/api/ai', r => r.fulfill({ json: { text: '{}', truncated: false } }));
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto((process.env.BASE || 'http://localhost:3000') + '/' + (link || '')); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p); return p;
};
const J = async (p, label) => {
  const focus = (await p.locator('.j-focus').innerText()).replace(/\n+/g, ' | ');
  const rows = await p.locator('.j-row').evaluateAll(els => els.map(e => `[${e.className.replace('j-row s-', '')}] ${e.querySelector('b').textContent} — ${e.querySelector('.small').textContent}`));
  const strip = await p.locator('.j-strip li.j-cur span').innerText();
  console.log(`\n== ${label} (stage: ${strip})\n  FOCUS: ${focus}\n  ${rows.join('\n  ')}`);
};
const home = async p => { await p.click('.bottomnav [data-sec=home]').catch(() => {}); await settle(p); await p.locator('.subtab[data-tab=overview]').click().catch(() => {}); await settle(p); await p.locator('.j-more').evaluate(d => d.open = true).catch(() => {}); };
const create = async (p, size, name, opts = {}) => {
  if (await p.locator('[data-act=home]').count()) { await p.locator('[data-act=home]').first().dispatchEvent('click'); await settle(p); }
  await p.click('[data-act=newTrip]'); await settle(p); await p.click(`[data-size=${size}]`); await settle(p);
  if (opts.mode) { await p.click(`[data-mode=${opts.mode}]`); await settle(p); } else { await p.locator('[data-mode]').first().click(); await settle(p); }
  await p.fill('#nt-name', name); if (await p.locator('#nt-city').count()) await p.fill('#nt-city', 'Brooklyn');
  await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); await skipSetup(p); await settle(p);
  return (await p.evaluate(() => location.hash));
};
// ---------- A. hangout ----------
const a = await mk('Ali');
const h1 = await create(a, 'hangout', 'Friday dinner'); const t1 = h1.slice(1);
await home(a); await J(a, 'Hangout, just created');
const j = await mk('Jay', h1); await j.waitForSelector('.welcome'); await j.click('[data-join=in]'); await skipSetup(j); await settle(j);
await db(a, 'update', `trips/${t1}/members/${await a.evaluate(() => localStorage.outta_uid)}`, { days: ['2026-10-17', '2026-10-18'] });
await db(j, 'update', `trips/${t1}/members/${await j.evaluate(() => localStorage.outta_uid)}`, { days: ['2026-10-17'] });
await a.waitForTimeout(800); await home(a); await J(a, 'Hangout, Jay joined, days in');
await db(a, 'update', 'trips/' + t1, { destinations: [{ id: 'd1', city: 'Tacos + karaoke' }], lockedDest: 'd1' }); await a.waitForTimeout(800); await home(a); await J(a, 'Hangout, plan picked');
const lockBtn = a.locator('[data-lockdates]').first(); if (await lockBtn.count()) { await lockBtn.dispatchEvent('click'); await a.waitForTimeout(800); }
await home(a); await J(a, 'Hangout, day locked from the guide');
await db(a, 'update', 'trips/' + t1, { venue: 'Los Tacos No. 1', time: '19:30' }); await a.waitForTimeout(600); await home(a); await J(a, 'Hangout, venue set');
// ---------- B. birthday surprise ----------
const h2 = await create(a, 'weekend', 'Dev turns 30', { mode: 'birthday' }); const t2 = h2.slice(1);
const d2 = await mk('Dev', h2); await d2.waitForSelector('.welcome'); await d2.click('[data-join=in]'); await skipSetup(d2); await settle(d2);
await home(a); await J(a, 'Birthday, planner view');
const devId = await d2.evaluate(() => localStorage.outta_uid);
const sel = a.locator('.j-focus #set-honoree'); if (await sel.count()) { await sel.selectOption(devId); await a.waitForTimeout(800); } else console.log('  (no inline honoree picker in focus)');
await home(a); await J(a, 'Birthday, after picking Dev');
await home(d2); await J(d2, 'Birthday, Dev (guest of honor) view'); console.log('  surprise note:', await d2.locator('.journey .small.muted').last().innerText().catch(() => 'none'));
// ---------- C. multi-day trip ----------
const h3 = await create(a, 'trip', 'Lisbon'); const t3 = h3.slice(1);
const k = await mk('Kim', h3); await k.waitForSelector('.welcome'); await k.click('[data-join=in]'); await skipSetup(k); await settle(k);
await home(a); await J(a, 'Trip, undecided');
await db(a, 'update', 'trips/' + t3, { destinations: [{ id: 'd1', city: 'Lisbon', code: 'LIS' }], lockedDest: 'd1', lockedDates: { start: '2026-11-20', end: '2026-11-23' } }); await a.waitForTimeout(800);
await home(a); await J(a, 'Trip, decided');
await a.locator('.j-focus .j-help').dispatchEvent('click'); await a.waitForTimeout(700);
console.log('  help → tab:', await a.locator('.subtab.on').innerText(), '| glowing:', await a.locator('.beacon').evaluateAll(e => e.map(x => x.id || x.className).join(',')));
console.log('  pill on other tab:', (await a.locator('.j-pill').innerText().catch(() => 'none')).replace(/\n/g, ' '));
await a.click('.bottomnav [data-sec=plan]'); await settle(a); await a.locator('.subtab[data-tab=match]').click(); await settle(a);
console.log('  trip match after lock:', (await a.locator('.decided-sum').innerText()).replace(/\n+/g, ' | '), '| details closed:', !(await a.locator('details.more-opts').evaluate(d => d.open)));
await home(a); await a.screenshot({ path: 'j-trip.png', fullPage: true });
await home(d2); await d2.screenshot({ path: 'j-dev.png', fullPage: true });
console.log('\nerrors', errs); await b.close();

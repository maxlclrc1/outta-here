// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
const S = './ft-';
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(450));
const skipSetup = async p => { await p.waitForTimeout(300); const l = p.locator('[data-act=setupLater]'); if (await l.count()) { await l.click(); await p.waitForSelector('.bottomnav'); await p.waitForTimeout(300); } };
const mk = async (n, link = '') => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); await p.goto((process.env.BASE || 'http://localhost:3000') + '/' + link); await p.fill('#join-name', n); await p.click('.join-card [type=submit]'); await settle(p); return p; };
const over = []; const go = async (p, sec, tab) => { await p.click('.bottomnav [data-sec=' + sec + ']'); await settle(p); if (tab) { await p.click('.subtab[data-tab=' + tab + ']'); await settle(p); } if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) over.push(sec + '/' + tab); };
const txt = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '(missing ' + sel + ')')).replace(/\n+/g, ' | ');
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log('FAIL', name, e.message.split('\n').filter(l => /waiting for|intercepts|not visible|outside/.test(l)).slice(0, 3).join(' / ')); } };
const db = (p, op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
const a = await mk('Ali');
await a.click('[data-act=newTrip]'); await settle(a); await a.click('[data-size=weekend]'); await settle(a); await a.locator('[data-mode]').first().click(); await settle(a);
await a.fill('#nt-name', 'Cabin weekend'); await a.click('#newTrip [type=submit]'); await a.waitForSelector('.setup'); await skipSetup(a);
const tid = (await a.evaluate(() => location.hash)).slice(1);
const j = await mk('Jay', '#' + tid); await j.waitForSelector('.welcome, .setup, .ov-hero'); await j.locator('[data-join=in]').click({ timeout: 2500 }).catch(() => {}); await skipSetup(j);
const k = await mk('Kim', '#' + tid); await k.waitForSelector('.welcome, .setup, .ov-hero'); await skipSetup(k); await k.locator('.ov-me [data-status=maybe]').click().catch(() => {}); // joined from the invitation, then says maybe
await a.waitForTimeout(800);
await step('P2 commitment', async () => {
  await go(a, 'home', 'crew'); console.log('P2 headcount:', await txt(a, '.hc'));
  await a.fill('#rsvp-by', '2026-10-20'); await a.press('#rsvp-by', 'Tab'); await a.waitForTimeout(500);
  console.log('P2 rsvp card:', (await txt(a, '.rsvp')).slice(0, 260));
  await j.click('.subtab[data-tab=overview]'); await settle(j); await j.locator('.ladder [data-status=confirmed]').click(); await j.waitForTimeout(600); console.log('P2 Jay after confirming (fresh) opens setup:', await j.locator('.setup').count()); await skipSetup(j);
  await a.waitForTimeout(500); console.log('P2 after Jay confirms:', await txt(a, '.hc'));
});
await step('P3 flexible dates', async () => {
  const win = await a.evaluate(() => 0); await go(a, 'plan', 'dates');
  await a.click('[data-act=allDays]'); await a.waitForTimeout(300);
  const d1 = await a.locator('.cal .day').nth(1).getAttribute('data-day'); await a.click('[data-act=starMode]'); await a.locator(`.cal .day[data-day="${d1}"]`).click(); await a.waitForTimeout(300); await a.click('[data-act=starMode]');
  console.log('P3 Ali star on', d1, ':', await a.locator('.cal .day.pref').count());
  await go(k, 'plan', 'dates'); await k.click('[data-act=allDays]'); await k.waitForTimeout(300);
  await go(j, 'plan', 'dates'); const days = await j.locator('.cal .day').evaluateAll(els => els.map(e => e.dataset.day));
  for (const d of [days[1], days[days.length - 1]]) { await j.locator(`.cal .day[data-day="${d}"]`).dispatchEvent('click'); await j.waitForTimeout(20); }
  await j.locator('[data-flex=late]').dispatchEvent('click'); await j.waitForTimeout(800); await a.waitForTimeout(800);
  console.log('P3 best (Ali):', (await txt(a, '.grid2 > .card:nth-child(2)')).slice(0, 300));
});
await step('lock dest+dates', async () => {
  await go(a, 'plan', 'match'); await a.fill('#ad-city', 'Catskills'); await a.click('#addDest [type=submit]'); await a.waitForTimeout(400); await a.locator('[data-lockdest]').first().click(); await a.waitForTimeout(400);
  await go(a, 'plan', 'dates'); await a.locator('[data-lockdates]').first().click(); await a.waitForTimeout(600);
  await go(a, 'home', 'overview'); console.log('P1/P2 move after decided (Ali):', await txt(a, '.j-focus'), '| stage', await txt(a, '.j-strip li.j-cur'));
  await go(k, 'home', 'overview'); console.log('P2 Kim move:', await txt(k, '.j-focus'));
});
await step('P4 tasks', async () => {
  await go(a, 'home', 'tasks'); await a.locator('[data-taskidea]').first().dispatchEvent('click'); await a.waitForTimeout(400);
  await a.fill('#task-title', 'Buy groceries'); await a.click('#addTask [type=submit]'); await a.waitForTimeout(400);
  const ids = await a.locator('.task-main').evaluateAll(els => els.map(e => e.dataset.task));
  await go(j, 'home', 'tasks'); await j.locator(`[data-taketask="${ids[0]}"]`).dispatchEvent('click'); await j.waitForTimeout(400);
  await j.fill(`#task-due-${ids[0]}`, '2026-10-19'); await j.press(`#task-due-${ids[0]}`, 'Tab'); await j.waitForTimeout(600);
  await a.waitForTimeout(500); console.log('P4 owners (Ali):', await a.locator('.task-meta select').evaluateAll(els => els.map(e => e.selectedOptions[0]?.textContent)), '| due:', await a.locator('.task-meta input[type=date]').evaluateAll(els => els.map(e => e.value)));
  await go(a, 'home', 'overview'); console.log('P4 move:', await txt(a, '.j-focus'));
});
await step('P5 cost', async () => {
  await db(a, 'update', `trips/${tid}/members/${await a.evaluate(() => localStorage.outta_uid)}`, { budget: 500 });
  await go(a, 'money', 'cost'); await a.locator('.cost-row', { hasText: 'Stay' }).locator('summary').click(); await a.fill('#cost-low-stay', '150'); await a.fill('#cost-high-stay', '220'); await a.press('#cost-high-stay', 'Tab'); await a.waitForTimeout(400);
  await a.locator('.cost-row', { hasText: 'Food' }).locator('summary').click(); await a.fill('#cost-low-food', '120'); await a.fill('#cost-high-food', '180'); await a.selectOption('#cost-src-food', 'quote'); await a.waitForTimeout(600);
  console.log('P5 cost:', (await txt(a, '.cost')).slice(0, 420));
  await a.screenshot({ path: S + 'cost.png', fullPage: true });
});
await step('P6 group fit', async () => {
  const mkp = (id, city, pp) => ({ id, city, code: '', start: '2026-10-23', end: '2026-10-25', tagline: 'x', why: 'y', perPerson: pp, vibeMatch: 80, highlights: [], weather: '' });
  await db(a, 'update', 'trips/' + tid, { pitches: { items: [mkp('p1', 'Hudson', '$300–450'), mkp('p2', 'Montauk', '$600–900')], at: Date.now() } });
  await a.waitForTimeout(600); await go(a, 'plan', 'match'); await a.evaluate(() => document.querySelectorAll('details.more-opts').forEach(d => d.open = true)); console.log('P6 card chips:', await txt(a, '#pitch .fit'));
  await a.click('.swipe-btn.meh'); await a.waitForTimeout(400); console.log('P6 scoreboard:', (await txt(a, '.linkrow')).slice(0, 200));
});
await step('P7 what if', async () => {
  await go(a, 'plan', 'whatif'); console.log('P7 now cost row:', await a.locator('.wi-row', { hasText: 'Each, all in' }).innerText().then(t => t.replace(/\n+/g, ' | ')));
  await a.selectOption('#wi-nights-0', '1'); await a.waitForTimeout(500); console.log('P7 1 night cost row:', await a.locator('.wi-row', { hasText: 'Each, all in' }).innerText().then(t => t.replace(/\n+/g, ' | ')));
  await a.screenshot({ path: S + 'whatif.png', fullPage: true });
});
await step('P8 recovery', async () => {
  await go(a, 'home', 'overview'); await a.locator('[data-recover=drop]').dispatchEvent('click'); await settle(a);
  const kid = await k.evaluate(() => localStorage.outta_uid); await a.selectOption('#recover-who', kid); await a.waitForTimeout(400);
  console.log('P8 impact:', await txt(a, '.recover'));
  await a.locator('[data-act=recoverApply]').dispatchEvent('click'); await a.waitForTimeout(800); console.log('P8 toast:', await txt(a, '#toast'));
});
await step('P9 reminders', async () => {
  await a.click('[data-act=home] >> nth=0'); await settle(a); await a.waitForTimeout(1500); console.log('P9 Ali inbox:', await txt(a, '.inbox'));
  await a.screenshot({ path: S + 'inbox.png', fullPage: true }); await a.click('[data-open]'); await a.waitForSelector('.bottomnav'); await settle(a);
});
await step('P10 access', async () => {
  await go(a, 'home', 'settings'); await a.locator('[data-act=linkReset]').dispatchEvent('click'); await a.waitForTimeout(600);
  const z = await mk('Zed', '#' + tid); await z.waitForTimeout(1500); console.log('P10 old link for new person:', await txt(z, 'section.card h1'));
  const newLink = await a.evaluate(() => document.querySelector('.invite-link')?.textContent);
  await a.selectOption('#perm-lock', 'org'); await a.waitForTimeout(500);
  await go(j, 'plan', 'dates'); const btn = j.locator('[data-lockdates]').first(); if (await btn.count()) { await btn.dispatchEvent('click'); await j.waitForTimeout(300); console.log('P10 Jay lock:', await txt(j, '#toast')); } else console.log('P10 no lock button for Jay');
  await go(a, 'home', 'crew'); await a.screenshot({ path: S + 'crew.png', fullPage: true });
});
console.log('horizontal overflow on:', over); console.log('errors', errs); await b.close();

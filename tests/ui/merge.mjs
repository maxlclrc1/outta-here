// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(500));
for (const ai of [false, true]) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  if (ai) { await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } })); await c.route('**/api/ai', r => r.fulfill({ json: { text: JSON.stringify({ pitches: [{ city: 'Lisbon', code: 'LIS', start: '2026-11-20', end: '2026-11-23', tagline: 'x', why: 'y', perPerson: '$700', vibeMatch: 80, highlights: [] }] }), truncated: false } })); }
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.BASE || 'http://localhost:3000') + '/'); await p.fill('#join-name', 'Ali'); await p.click('.join-card [type=submit]'); await settle(p);
  await p.click('[data-act=newTrip]'); await settle(p); await p.click('[data-size=trip]'); await settle(p); await p.locator('[data-mode]').first().click(); await settle(p);
  await p.fill('#nt-name', 'Merge test'); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); await p.click('[data-act=setupLater]'); await settle(p);
  await p.click('.bottomnav [data-sec=plan]'); await settle(p);
  console.log(ai ? 'AI on' : 'AI off', 'tabs:', (await p.locator('.subtab').allInnerTexts()).join(', '));
  await p.click('.subtab[data-tab=match]'); await settle(p);
  if (ai) { await p.click('[data-act=genPitches]'); await p.waitForSelector('#pitch'); await settle(p); }
  const order = await p.evaluate(() => [...document.querySelectorAll('#app > section, #app > div.empty')].map(e => e.querySelector('h2,h1,b')?.textContent?.trim()).filter(Boolean).slice(0, 6));
  console.log('  page order:', order.join(' → '));
  await p.fill('#ad-city', 'Mexico City'); await p.fill('#ad-code', 'MEX'); await p.click('#addDest [type=submit]'); await p.waitForTimeout(500);
  await p.fill('#ad-city', 'Montreal'); await p.click('#addDest [type=submit]'); await p.waitForTimeout(500);
  await p.locator('.own-picks [data-lockdest]').first().dispatchEvent('click'); await p.waitForTimeout(600);
  console.log('  own picks:', (await p.locator('.own-picks').innerText()).replace(/\n+/g, ' | ').slice(0, 260));
  await p.click('.bottomnav [data-sec=home]'); await settle(p); console.log('  move:', (await p.locator('.j-focus').innerText().catch(() => '-')).replace(/\n+/g, ' | ').slice(0, 120));
  if (!ai) await p.screenshot({ path: 'merge-off.png', fullPage: true });
  await c.close();
}
console.log('errors', errs); await b.close();

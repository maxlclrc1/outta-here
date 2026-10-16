// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
await p.goto((process.env.BASE || 'http://localhost:3000') + '/'); await p.fill('#join-name', 'Ali'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
await p.click('[data-act=demo]'); await p.waitForTimeout(1200);
const lost = p.locator('[data-act=lostOpen]').first(); await lost.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
check('“I’m lost” sheet opens and takes focus', await p.evaluate(() => !!document.querySelector('.sheet')?.contains(document.activeElement)), await p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
check('Escape closes it', !(await p.locator('.sheet').count()));
check('focus goes back to the button that opened it', await p.evaluate(() => document.activeElement?.dataset?.act === 'lostOpen'));
const toast = await p.locator('#toast').getAttribute('role'); check('toasts are announced', toast === 'status');
const unlabeled = await p.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=file]), select, textarea')].filter(el => !el.closest('label') && !el.getAttribute('aria-label') && !(el.id && document.querySelector(`label[for="${el.id}"]`))).map(el => el.id));
check('every visible field has a label', !unlabeled.length, unlabeled.join(','));
check('no page errors', !errs.length, errs.join('|'));
console.log(fails ? `${fails} FAILED` : 'a11y checks passed'); await b.close();

// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const skipSetup = async p => { await p.waitForTimeout(250); const l = p.locator('[data-act=setupLater]'); if (await l.count()) { await l.click(); await p.waitForSelector('.bottomnav'); await p.waitForTimeout(300); } };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
const mk = async (n) => { const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.grantPermissions(['clipboard-read','clipboard-write']); const p = await c.newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); p.on('console', m => m.type() === 'error' && !/fonts\.g|net::ERR|_blob/.test(m.text()) && errs.push(n + ' console: ' + m.text())); await p.goto((process.env.BASE || 'http://localhost:3000') + '/'); await p.fill('#join-name', n); await p.click('.join-card [type=submit]'); return p; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(300));
const shot = (p, n) => p.screenshot({ path: './pl-' + n + '.png', fullPage: true });
const a = await mk('Ali'); await settle(a); await shot(a, '1-home-empty');
await a.click('[data-act=newCrew] >> nth=0'); await a.fill('#nc-name', 'Taco Crew'); await a.click('#newCrewForm [type=submit]'); await a.waitForSelector('text=Invite to the crew'); await settle(a);
const crewHash = await a.evaluate(() => location.hash); console.log('crew hash', crewHash);
await shot(a, '2-crew-page');
const j = await mk('Jay'); await j.goto((process.env.BASE || 'http://localhost:3000') + '/' + crewHash); await j.waitForSelector('text=Invite to the crew'); await settle(j);
console.log('jay crew members:', await j.locator('section.stack .chip').allInnerTexts());
// Ali plans a hangout from the crew page
await a.click('[data-startcrew] >> nth=0'); await settle(a); await shot(a, '3-size');
await a.click('[data-size=hangout]'); await settle(a); await a.click('[data-mode=friends]'); await settle(a);
await a.fill('#nt-name', 'Friday tacos'); await a.fill('#nt-city', 'Brooklyn'); await a.click('#newTrip [type=submit]'); await a.waitForSelector('.pass, .passport, .setup').then(() => skipSetup(a)); await settle(a);
await shot(a, '4-hangout-overview');
console.log('nav sections:', await a.locator('.bottomnav .bn span').allInnerTexts());
console.log('pass title:', await a.locator('.ev-title').innerText(), '| hero:', await a.locator('.j-focus h2').innerText());
const tid = await a.evaluate(() => location.hash);
// Jay sees it on home
await j.click('[data-act=home] >> nth=0'); await settle(j); console.log('jay home deciding:', await j.locator('.plan-row h3').allInnerTexts());
await j.click('[data-open]'); await j.waitForSelector('.pass, .passport, .setup').then(() => skipSetup(j)); await j.click('[data-status=in]'); await skipSetup(j); await settle(j);
// Ali: plan tabs
await a.click('.bottomnav [data-sec=plan]'); await settle(a); console.log('plan tabs:', await a.locator('.subtab').allInnerTexts());
await a.click('.subtab[data-tab=match]'); await a.fill('#ad-city', 'Tacos at Los Tacos No.1'); await a.click('#addDest [type=submit]'); await a.waitForTimeout(400); await a.locator('[data-lockdest]').first().click();
await a.click('.subtab[data-tab=dates]'); console.log('length select:', await a.locator('#nights option').allInnerTexts());
await a.click('[data-act=allDays]'); await j.click('.bottomnav [data-sec=plan]'); await settle(j); await j.click('.subtab[data-tab=dates]'); await j.locator('.day').nth(2).click(); await a.waitForTimeout(1500);
console.log('best day:', await a.locator('[data-lockdates]').count(), await a.locator('.card .mono').first().innerText().catch(()=>'-'));
await a.locator('[data-lockdates]').first().click(); await a.waitForTimeout(500);
await a.click('.bottomnav [data-sec=home]'); await settle(a); await a.click('.subtab[data-tab=overview]'); await settle(a);
console.log('pass pill:', await a.locator('.pass .on-pill, .pass .pill, .passport .stage-pill').first().innerText()); await shot(a, '5-locked');
// home master planner
await a.click('[data-act=home] >> nth=0'); await settle(a); await shot(a, '7-home');
console.log('coming up:', await a.locator('.plan-row h3').allInnerTexts());
await a.click('[data-crew] >> nth=0'); await settle(a);
// grow
await a.click('[data-open]'); await a.waitForSelector('.pass, .passport, .setup').then(() => skipSetup(a)); await settle(a); await a.click('[data-act=growPlan]'); await a.waitForTimeout(600); await settle(a);
console.log('after grow nav:', await a.locator('.bottomnav .bn span').allInnerTexts(), '| chip', await a.locator('.pass .label, .pp-k').first().innerText());
console.log('errors', errs); await b.close();

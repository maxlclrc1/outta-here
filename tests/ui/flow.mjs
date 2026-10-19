// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const skipSetup = async p => { await p.waitForTimeout(250); const l = p.locator('[data-act=setupLater]'); if (await l.count()) { await l.click(); await p.waitForSelector('.bottomnav'); await p.waitForTimeout(300); } };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errs = [], log = (...a) => console.log(...a);
const mk = async (name) => { const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.grantPermissions(['clipboard-read','clipboard-write']); const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); p.on('console', m => m.type() === 'error' && !/fonts\.g|net::ERR|_blob/.test(m.text()) && errs.push(name + ' console: ' + m.text())); await p.goto((process.env.BASE || 'http://localhost:3000') + '/'); return p; };
const go = async (p, sec, tab) => { await p.click('.bottomnav [data-sec=' + sec + ']'); await p.click('.subtab[data-tab=' + tab + ']'); };
const a = await mk('A');
await a.fill('#join-name', 'Ali'); await a.click('.join-card [type=submit]');
await a.click('[data-act=newTrip]'); await a.click('[data-size=trip]'); await a.click('[data-mode=birthday]');
await a.fill('#nt-name', 'Dev turns 30'); await a.evaluate(() => { const d = document.querySelector('.more-opts-inline'); if (d) d.open = true; }); await a.fill('#nt-honoree','Dev'); await a.click('#newTrip [type=submit]'); await a.waitForSelector('.ov-hero, .pass, .passport, .setup').then(() => skipSetup(a));
const hash = await a.evaluate(() => location.hash);
const bp = await mk('B'); await bp.goto((process.env.BASE || 'http://localhost:3000') + '/' + hash); await bp.fill('#join-name', 'Dev'); await bp.click('.join-card [type=submit]'); await bp.waitForSelector('.ov-hero, .pass, .passport, .setup').then(() => skipSetup(bp));
await bp.locator('[data-join=in]').click({ timeout: 2500 }).catch(() => {}); await skipSetup(bp); // the invitation's answer (the RSVP ladder shows once they're in)
// budgets + homes
await go(a,'home','crew'); await a.fill('#me-home','JFK'); await a.fill('#me-budget','900'); await a.locator('#me-budget').blur(); await a.fill('#me-venmo','ali-v'); await a.locator('#me-venmo').blur();
await go(bp,'home','crew'); await bp.fill('#me-home','LAX'); await bp.fill('#me-budget','700'); await bp.locator('#me-budget').blur();
// dates: one picks every day, the other a range
await go(a,'plan','dates'); await a.click('[data-act=allDays]'); await go(bp,'plan','dates'); await bp.locator('.day').nth(4).click(); await bp.locator('.day').nth(6).click();
await a.waitForTimeout(1500);
log('best windows A:', await a.locator('[data-lockdates]').count(), await a.locator('.card .mono').first().innerText().catch(()=>'-'));
await a.locator('[data-lockdates]').first().click();
// where
await go(a,'plan','match'); await a.fill('#ad-city','Nashville'); await a.fill('#ad-code','BNA'); await a.click('#addDest [type=submit]'); await a.waitForTimeout(800);
await go(bp,'plan','match'); await bp.waitForTimeout(800); await bp.locator('[data-vote]').first().click(); await bp.waitForTimeout(500);
await a.locator('[data-lockdest]').first().click().catch(()=>log('no lockdest btn'));
await a.waitForTimeout(800);
// honoree
await go(a,'home','settings'); await a.selectOption('#set-honoree', { label: 'Dev' }); await a.waitForTimeout(800);
// expenses: Ali pays 300 split default
await go(a,'money','money'); log('default split chips on:', await a.locator('[data-split].on').allInnerTexts());
await a.fill('#ex-what','Dinner'); await a.fill('#ex-amt','300'); await a.click('#expForm [type=submit]'); await a.waitForTimeout(800);
log('settle text:', await a.locator('text=Settle up').count() ? await a.locator('.linkrow').last().innerText() : 'none');
// tickets
await go(a,'book','tickets'); await a.fill('#tk-flight','B6 1'); await a.click('#tkForm [type=submit]'); await a.waitForTimeout(600);
await go(bp,'book','tickets'); await bp.waitForTimeout(600); await bp.fill('#tk-flight','AA 2'); await bp.click('#tkForm [type=submit]'); await bp.waitForTimeout(1200);
await go(a,'home','overview'); await a.waitForTimeout(800); log('A pass pill:', await a.locator('.pass .on-pill, .pass .pill, .passport .stage-pill').first().innerText());
log('steps done:', await a.locator('.step.ok').count());
// quiz tie: A Big club, B Dive bar
await go(a,'plan','spots'); await a.click('[data-quiz="night|Big club"]'); await go(bp,'plan','spots'); await bp.click('[data-quiz="night|Dive bar"]'); await a.waitForTimeout(1200);
log('tie tags:', await a.locator('.tie').count(), 'persona:', await a.locator('.blend h2').innerText().catch(()=>'-'));
// nudge copy
await go(a,'home','crew'); await a.click('[data-act=copyNudge]'); await a.waitForTimeout(300);
log('clipboard:', (await a.evaluate(() => navigator.clipboard.readText()).catch(()=>'(no read)')).slice(0,160));
// B (honoree) meter
await go(bp,'money','meter'); log('B meter banner:', await bp.locator('.banner').first().innerText().catch(()=>'-'));
log('errors', errs);
await b.close();

// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const skipSetup = async p => { await p.waitForTimeout(250); const l = p.locator('[data-act=setupLater]'); if (await l.count()) { await l.click(); await p.waitForSelector('.bottomnav'); await p.waitForTimeout(300); } };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); const p = await c.newPage();
await p.goto((process.env.BASE || 'http://localhost:3000') + '/'); await p.fill('#join-name','Kim'); await p.click('.join-card [type=submit]');
await p.click('[data-act=newTrip]'); await p.click('[data-size=trip]'); await p.click('[data-mode=friends]'); await p.fill('#nt-name','T'); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.ov-hero, .pass, .passport, .setup').then(() => skipSetup(p));
await p.click('.bottomnav [data-sec=home]'); await p.click('.subtab[data-tab=crew]');
await p.tap('#me-home'); await p.keyboard.type('ORD');
await p.tap('#me-budget'); await p.keyboard.type('650');
await p.tap('#me-venmo'); await p.keyboard.type('kim');
await p.tap('h2'); await p.waitForTimeout(1200);
console.log(await p.evaluate(async () => { const r = await fetch('/api/db',{method:'POST',headers:{'Content-Type':'application/json','x-outta-user':localStorage.outta_uid},body:JSON.stringify({op:'get',path:'trips/'+location.hash.slice(1)+'/members/'+localStorage.outta_uid})}); const d=(await r.json()).data; return {home:d.home,budget:d.budget,venmo:d.venmo}; }));
await b.close();

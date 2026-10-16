// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const skipSetup = async p => { await p.waitForTimeout(250); const l = p.locator('[data-act=setupLater]'); if (await l.count()) { await l.click(); await p.waitForSelector('.bottomnav'); await p.waitForTimeout(300); } };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
const S = './v-';
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(350));
const mk = async (n, vp = { width: 390, height: 844 }, scheme = 'light') => { const c = await b.newContext({ viewport: vp, colorScheme: scheme }); const p = await c.newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); await p.goto((process.env.BASE || 'http://localhost:3000') + '/'); await p.fill('#join-name', n); await p.click('.join-card [type=submit]'); await settle(p); return p; };
const go = async (p, sec, tab) => { await p.click('.bottomnav [data-sec=' + sec + ']'); await settle(p); if (tab) { await p.click('.subtab[data-tab=' + tab + ']'); await settle(p); } };
// 1. delete permission + leaving
const a = await mk('Ali');
await a.click('[data-act=newCrew] >> nth=0'); await a.fill('#nc-name', 'Taco Crew'); await a.click('#newCrewForm [type=submit]'); await a.waitForSelector('text=Invite to the crew'); await settle(a);
const crewHash = await a.evaluate(() => location.hash);
await a.click('[data-startcrew] >> nth=0'); await settle(a); await a.click('[data-size=hangout]'); await settle(a);
await a.fill('#nt-name', 'Friday tacos at a really long named place downtown'); await a.fill('#nt-city', 'Brooklyn'); await a.click('#newTrip [type=submit]'); await a.waitForSelector('.pass, .passport, .setup').then(() => skipSetup(a)); await settle(a);
const tid = await a.evaluate(() => location.hash);
const j = await mk('Jay'); await j.goto((process.env.BASE || 'http://localhost:3000') + '/' + crewHash); await j.waitForSelector('text=Invite to the crew'); await settle(j);
await j.click('[data-act=home] >> nth=0'); await settle(j);
console.log('Jay sees delete on Ali plan:', await j.locator('[data-homedel]').count(), '| Ali:', await (async () => { await a.click('[data-act=home] >> nth=0'); await settle(a); return a.locator('[data-homedel]').count(); })());
await a.screenshot({ path: S + 'home-phone.png', fullPage: true });
await j.click('[data-open]'); await j.waitForSelector('.pass, .passport, .setup').then(() => skipSetup(j)); await j.click('[data-status=in]'); await skipSetup(j); await settle(j);
await go(j, 'home', 'settings'); console.log('Jay settings delete btn:', await j.locator('[data-act=askDelete]').count(), '| type section (hangout):', await j.locator('text=Type').count());
await j.click('[data-act=askLeave]'); await settle(j); console.log('leave banner:', await j.locator('.banner').first().innerText());
await j.click('[data-act=doLeave]'); await j.waitForTimeout(1200); await settle(j);
console.log('Jay plans after leaving:', await j.locator('.plan-row h3').allInnerTexts(), '| toast:', await j.locator('#toast').innerText());
// rejoin via link
await j.goto((process.env.BASE || 'http://localhost:3000') + '/' + tid); await j.waitForTimeout(2500); await j.screenshot({ path: S + 'rejoin.png', fullPage: true }); await j.waitForSelector('[data-status=in]'); await j.click('[data-status=in]'); await skipSetup(j); await j.waitForTimeout(800); await j.click('[data-act=home] >> nth=0'); await settle(j);
console.log('Jay plans after rejoin:', await j.locator('.plan-row h3').allInnerTexts());
// 2. hangout empty states + month labels
await a.click('[data-open]'); await a.waitForSelector('.pass, .passport, .setup').then(() => skipSetup(a)); await settle(a);
await go(a, 'plan', 'spots'); console.log('spots empty:', (await a.locator('.empty').first().innerText()).replace(/\n/g, ' | '));
await go(a, 'plan', 'match'); console.log('match (AI off):', (await a.locator('.empty').first().innerText()).replace(/\n/g, ' | '));
await go(a, 'plan', 'dates'); console.log('months:', await a.locator('.cal-month').allInnerTexts());
await a.screenshot({ path: S + 'dates.png', fullPage: true });
await go(a, 'money', 'meter'); console.log('meter pot line:', await a.locator('text=Put in the group pot').count(), '| placeholder:', await a.getAttribute('#sp-note', 'placeholder'));
// reload keeps tab
await a.reload(); await a.waitForSelector('.bottomnav'); await settle(a); console.log('after reload tab:', await a.evaluate(() => document.querySelector('.subtab.on')?.dataset.tab));
// 3. demo: pot, dates, map, times, contrast
for (const [n, vp, sc] of [['dk', { width: 1280, height: 900 }, 'dark'], ['ph', { width: 390, height: 844 }, 'dark']]) {
  const d = await mk('Dee', vp, sc); await d.click('[data-act=demo]'); await settle(d);
  await go(d, 'money', 'pot'); console.log(n, 'pot rows:', (await d.locator('.nudge').allInnerTexts()).map(x => x.replace(/\n/g, ' ')));
  await go(d, 'plan', 'dates'); console.log(n, 'date buttons:', await d.locator('[data-lockdates]').allInnerTexts(), '| locked pill:', await d.locator('.card .pill.in').count());
  await go(d, 'plan', 'match'); await d.screenshot({ path: S + n + '-match.png' });
  await go(d, 'live', 'live'); await d.screenshot({ path: S + n + '-live.png', fullPage: true });
  await go(d, 'memories', 'awards'); await d.screenshot({ path: S + n + '-awards.png' });
  await go(d, 'home', 'overview'); console.log(n, 'overview pills:', await d.locator('.on-pill').allInnerTexts());
  await d.screenshot({ path: S + n + '-overview.png', fullPage: true });
}
console.log('errors', errs); await b.close();

// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Regression tests for the reliability fixes.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = (process.env.BASE || 'http://localhost:3000') + '';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const db = (p, op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
let fails = 0; const check = (l, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${extra ? ' · ' + extra : ''}`); if (!ok) fails++; };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
let aiDelay = 0, failNextUpdate = false;
await ctx.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
await ctx.route('**/api/ai', async r => { await new Promise(res => setTimeout(res, aiDelay)); r.fulfill({ json: { text: JSON.stringify({ pitches: [{ city: 'Late City', code: 'LTC', start: '2026-11-20', end: '2026-11-22', tagline: 'x', why: 'y', perPerson: '€100', vibeMatch: 50, highlights: 'not a list', weather: '' }] }), truncated: false } }); });
await ctx.route('**/api/db', async r => { const body = JSON.parse(r.request().postData() || '{}'); if (failNextUpdate && body.op === 'update' && /^trips\/[^/]+$/.test(body.path)) { failNextUpdate = false; return r.fulfill({ status: 500, json: { code: 'unavailable', message: 'Store error' } }); } r.continue(); });
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Ali'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid);
const mkPlan = async name => { await p.locator('[data-act=home]').first().dispatchEvent('click').catch(() => {}); await settle(p); await p.click('[data-act=newTrip]'); await settle(p); await p.click('[data-size=weekend]'); await settle(p); await p.locator('[data-mode]').first().click(); await settle(p); await p.fill('#nt-name', name); return p; };

// 1. double submit creates one plan
await mkPlan('Once only');
await p.evaluate(() => { const f = document.getElementById('newTrip'); f.requestSubmit(); f.requestSubmit(); f.requestSubmit(); });
await p.waitForSelector('.setup'); await p.click('[data-act=setupLater]'); await settle(p);
const mine = (await db(p, 'list', 'trips')).docs.filter(d => d.data.name === 'Once only');
check('submitting the create form three times makes one plan', mine.length === 1, `${mine.length} made`);
const A = mine[0].id;

// 2. a late AI reply doesn't land in another plan
await mkPlan('Plan B'); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); await p.click('[data-act=setupLater]'); await settle(p);
const B = (await p.evaluate(() => location.hash)).slice(1);
await p.evaluate(id => { location.hash = id; }, A); await p.waitForTimeout(1200);
await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.locator('.subtab[data-tab=match]').click(); await settle(p);
aiDelay = 1500; await p.locator('[data-act=genPitches]').first().click(); await p.waitForTimeout(150);
await p.evaluate(id => { location.hash = id; }, B); await p.waitForTimeout(2400);
const bPitches = (await db(p, 'get', 'trips/' + B)).data.pitches, aPitches = (await db(p, 'get', 'trips/' + A)).data.pitches;
check('AI answer for plan A is not written into plan B', !bPitches && !aPitches, (await p.locator('#toast').innerText().catch(() => '')));
// 2b. a malformed list from the AI doesn't break the pitch
aiDelay = 0; await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.locator('.subtab[data-tab=match]').click(); await settle(p);
await p.locator('[data-act=genPitches]').first().click(); await p.waitForTimeout(800);
check('AI reply with a bad highlights field still makes a pitch', ((await db(p, 'get', 'trips/' + B)).data.pitches?.items || []).length === 1);

// 3. a failed save puts the screen back
await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.locator('.subtab[data-tab=settings]').click(); await settle(p);
failNextUpdate = true; await p.click('[data-setsize=trip]'); await p.waitForTimeout(1200);
const sizeOn = await p.locator('[data-setsize].on').innerText();
check('after a failed save, the screen shows what is saved', /weekend/i.test(sizeOn), `shows ${sizeOn}; toast: ${await p.locator('#toast').innerText().catch(() => '')}`);
check('a server error doesn’t switch the plan to view-only', !(await p.locator('.banner', { hasText: 'view this plan but not edit' }).count()));

// 4. an edit made just before leaving is saved
await p.locator('.subtab[data-tab=crew]').click(); await settle(p);
await p.fill('#me-budget', '777'); await p.locator('#me-budget').dispatchEvent('change');
await p.locator('[data-act=home]').first().dispatchEvent('click'); await p.waitForTimeout(1200);
check('budget typed right before going home is saved', (await db(p, 'get', `trips/${B}/members/${uid}`)).data.budget === 777);

// 5. updating the crew from a plan keeps templates, DNA and its creator
const K = 'relcrew' + Math.random().toString(36).slice(2, 8);
await db(p, 'set', 'crews/' + K, { name: 'Six', people: { [uid]: true, u_other1: true }, profiles: { [uid]: { nick: 'Ali' } }, by: uid, at: 1, templates: { t1: { name: 'Our weekend', tasks: [] } }, dna: { notes: { n1: { text: 'pool', by: uid } } } });
await db(p, 'update', 'trips/' + B, { crewId: K }); await p.evaluate(id => { location.hash = id; }, B); await p.waitForTimeout(1200);
await p.reload(); await settle(p); await p.waitForTimeout(800);
await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.locator('.subtab[data-tab=settings]').click(); await settle(p);
await p.locator('[data-act=syncCrew]').dispatchEvent('click'); await p.waitForTimeout(1000);
const crew = (await db(p, 'get', 'crews/' + K)).data;
check('“Update crew” keeps templates, DNA, creator and other members', !!crew.templates?.t1 && !!crew.dna?.notes?.n1 && crew.by === uid && crew.people?.u_other1);

// 6. deleting a crew asks first
await p.locator('[data-act=home]').first().dispatchEvent('click'); await settle(p); await p.waitForTimeout(600); await p.evaluate(K => document.querySelector(`[data-crew="${K}"]`)?.click(), K); await settle(p); await p.waitForTimeout(400);
console.log('  on crew page:', await p.locator('h1').first().innerText(), errs, await p.evaluate(() => location.hash)); await p.locator(`[data-delcrew="${K}"]`).dispatchEvent('click'); await settle(p);
check('deleting a crew asks for confirmation', (await db(p, 'get', 'crews/' + K)).exists && await p.locator(`[data-delcrewdo="${K}"]`).count() === 1);
await p.locator(`[data-delcrewdo="${K}"]`).dispatchEvent('click'); await p.waitForTimeout(800);
check('…and deletes after confirming', !(await db(p, 'get', 'crews/' + K)).exists);

check('no page errors', !errs.length, errs.join(' | '));
console.log(fails ? `${fails} FAILED` : 'all reliability checks passed'); await b.close(); process.exit(fails ? 1 : 0);

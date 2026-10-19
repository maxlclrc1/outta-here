// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const skipSetup = async p => { await p.waitForTimeout(250); const l = p.locator('[data-act=setupLater]'); if (await l.count()) { await l.click(); await p.waitForSelector('.bottomnav'); await p.waitForTimeout(300); } };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [], prompts = [];
const S = './pm-';
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const P = (title, vibe) => ({ title, tagline: title + ' night', where: 'Williamsburg', date: '2026-10-17', time: '19:30', perPerson: '$30–45', vibeMatch: vibe, why: 'Because.', steps: [{ time: '19:30', title }] });
let round = 0;
const mk = async (name, link) => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
  await c.route('**/api/ai', async r => { prompts.push(JSON.parse(r.request().postData()).input); round++;
    const items = round === 1 ? [P('Tacos', 90), P('Bowling', 80), P('Movie', 60), P('Rooftop', 70)] : [P('Dumplings', 85), P('Arcade', 75)];
    r.fulfill({ json: { text: JSON.stringify({ pitches: items }), truncated: false } }); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto((process.env.BASE || 'http://localhost:3000') + '/' + (link || '')); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p); return p;
};
const a = await mk('Ali');
await a.click('[data-act=newTrip]'); await settle(a); await a.click('[data-size=hangout]'); await settle(a); await a.click('[data-mode=friends]'); await settle(a);
await a.fill('#nt-name', 'Saturday'); await a.fill('#nt-city', 'Brooklyn'); await a.click('#newTrip [type=submit]'); await a.waitForSelector('.ov-hero, .pass, .passport, .setup').then(() => skipSetup(a)); await settle(a);
const tid = await a.evaluate(() => location.hash);
const j = await mk('Jay', tid), k = await mk('Kim', tid);
for (const p of [j, k]) { await p.waitForSelector('.welcome, .setup, .ov-hero'); await p.locator('[data-join=in]').click({ timeout: 2500 }).catch(() => {}); await skipSetup(p); await p.waitForTimeout(600); }
const toMatch = async p => { await p.click('.bottomnav [data-sec=plan]'); await settle(p); await p.click('.subtab[data-tab=match]'); await settle(p); };
await toMatch(a); await a.fill('#pitch-note', 'no karaoke, near the L'); await a.click('[data-act=genPitches]'); await a.waitForSelector('#pitch'); await settle(a);
console.log('prompt 1 has note:', prompts[0].includes('no karaoke, near the L'), '| has history:', prompts[0].includes('How the crew'));
const plan = { Ali: { Tacos: 1, Bowling: 1, Movie: -1, Rooftop: -1 }, Jay: { Tacos: 1, Bowling: -1, Movie: -1, Rooftop: 1 }, Kim: { Tacos: -1, Bowling: 1, Movie: -1, Rooftop: -1 } };
for (const [p, n] of [[a, 'Ali'], [j, 'Jay'], [k, 'Kim']]) {
  if (p !== a) await toMatch(p);
  for (let i = 0; i < 4; i++) { const t = (await p.locator('#pitch h2').innerText()).trim(); await p.click(plan[n][t] === 1 ? '.swipe-btn.yes' : '.swipe-btn.no'); await p.waitForTimeout(500); }
}
await a.waitForTimeout(800); await settle(a);
await a.click('.subtab[data-tab=dates]'); await settle(a); console.log('Ali next move:', await a.locator('.j-pill').first().innerText().catch(() => '-')); await a.click('.subtab[data-tab=match]'); await settle(a); console.log('beacon on settle:', await a.locator('.settle.beacon').count()); console.log('settle card:', (await a.locator('.settle').innerText()).replace(/\n+/g, ' | '));
await a.screenshot({ path: S + 'settle.png', fullPage: true });
await a.click('[data-act=startRunoff]'); await a.waitForTimeout(800);
await j.click('.subtab[data-tab=dates]'); await settle(j); console.log('Jay next move:', (await j.locator('.j-pill').innerText().catch(() => '-')).replace(/\n/g,' ')); await j.click('.subtab[data-tab=match]'); await j.waitForSelector('.runoff'); await settle(j);
const vote = async (p, t) => { await p.locator('.ro-opt', { hasText: t }).click(); await p.waitForTimeout(700); };
await vote(a, 'Tacos'); await vote(j, 'Bowling');
console.log('after 2 votes:', (await k.locator('.runoff').innerText().catch(async () => { await toMatch(k); return k.locator('.runoff').innerText(); })).replace(/\n+/g, ' | '));
await vote(k, 'Tacos'); await a.waitForTimeout(800); await settle(a);
console.log('result:', (await a.locator('.runoff').innerText()).replace(/\n+/g, ' | '));
await a.screenshot({ path: S + 'runoff.png', fullPage: true });
await a.locator('.runoff [data-lockpitch]').click(); await a.waitForTimeout(800); await settle(a);
console.log('locked:', await a.locator('.runoff .pill.in').count(), '| pass:', await a.evaluate(() => document.querySelector('.mini-name')?.textContent));
await a.evaluate(() => document.querySelectorAll('details.more-opts').forEach(d => d.open = true)); await a.click('.match ~ * [data-act=genPitches], [data-act=genPitches] >> nth=0'); await a.waitForTimeout(1500); await settle(a);
console.log('prompt 2 history:\n' + (prompts[1].match(/How the crew[\s\S]*?(?=\n[A-Z])/) || ['(none)'])[0]);
console.log('runoff cleared:', await a.locator('.runoff').count(), '| steer hint:', await a.locator('.steer .small').innerText().catch(() => '-'));
console.log('errors', errs); await b.close();

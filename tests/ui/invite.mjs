// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Invite links after the organizer makes a new one: the old link shows "turned off", the new one
// joins, and the page of someone who only has a link never holds the invite key.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const open = async (name, hash = '') => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
  const seen = []; c.on('response', async res => { if (res.url().endsWith('/api/db')) { try { seen.push(await res.text()); } catch {} } });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(BASE + '/' + hash); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p); await p.waitForTimeout(500);
  return { p, seen };
};
const A = await open('Ana'), uid = await A.p.evaluate(() => localStorage.outta_uid);
await A.p.click('[data-act=newTrip]'); await settle(A.p); await A.p.click('[data-size=trip]'); await settle(A.p); await A.p.locator('[data-mode]').first().click(); await settle(A.p);
await A.p.fill('#nt-name', 'Porto'); await A.p.click('#newTrip [type=submit]'); await A.p.waitForSelector('.setup'); await A.p.click('[data-act=setupLater]'); await settle(A.p);
const tid = (await A.p.evaluate(() => location.hash)).slice(1);
// the organizer makes a new link (twice, so there's an old key and a current one)
const reset = async () => { await A.p.locator('.bottomnav [data-sec=home]').click(); await settle(A.p); await A.p.locator('.subtab[data-tab=settings]').click(); await settle(A.p); await A.p.locator('[data-act=linkReset]').dispatchEvent('click'); await A.p.waitForTimeout(900); return (await api(uid, 'get', 'trips/' + tid)).data.inviteKey; };
const oldKey = await reset(), newKey = await reset();
expect('the organizer can make a new link, and sees its key', !!oldKey && !!newKey && oldKey !== newKey);

// someone with the old link
const V = await open('Vic', `#${tid}.${oldKey}`);
{ const t = await V.p.innerText('body'); expect('the old link shows that it was turned off', /This invite link was turned off/.test(t), t.slice(0, 120)); }
expect('…and the page never received the current key', !V.seen.some(x => x.includes(newKey)));
// someone with the new link
const W = await open('Wen', `#${tid}.${newKey}`);
await W.p.waitForSelector('.welcome', { timeout: 8000 }).catch(() => {});
expect('the new link opens the invite to join', (await W.p.locator('[data-join=in]').count()) === 1);
expect('…and before joining, the page didn’t receive the key either', !W.seen.some(x => x.includes(`"inviteKey":"${newKey}"`)));
await W.p.click('[data-join=in]'); await W.p.waitForTimeout(900);
{ const wid = await W.p.evaluate(() => localStorage.outta_uid); expect('…and joining works', !!(await api(uid, 'get', 'trips/' + tid)).data.people?.[wid]); }
await api(uid, 'delete', 'trips/' + tid);
console.log('errors', errs); await b.close();
process.exit(fails ? 1 : 0);

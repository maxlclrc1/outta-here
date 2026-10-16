// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// A plan that already holds bad dates (saved before they were checked) still opens: the bad
// values show as not set, nothing crashes, and an organizer can set them again.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(300));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const tid = 'dt' + Math.random().toString(36).slice(2, 8);
// what an old plan might hold: none of these are dates
const STORED = { winStart: '2026-11-01"><b>', winEnd: 'next month', rsvpBy: '2026-02-30', decide: { style: 'pick', by: 'soon' } };

const c = await b.newContext({ viewport: { width: 390, height: 844 } });
await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
// the server no longer accepts bad dates, so the stored ones are added to what it sends back
let inject = true;
await c.route('**/api/db', async r => {
  const q = JSON.parse(r.request().postData() || '{}'), res = await r.fetch();
  if (!inject || q.op !== 'get' || q.path !== 'trips/' + tid) return r.fulfill({ response: res });
  const j = await res.json(); if (j.exists) j.data = { ...j.data, ...STORED };
  r.fulfill({ response: res, json: j });
});
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Ana'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid);
await api(uid, 'set', 'trips/' + tid, { name: 'Old plan', createdBy: uid, createdAt: Date.now(), people: { [uid]: true }, size: 'trip', mode: 'friends', nights: 3, winStart: '2026-11-01', winEnd: '2026-11-30', destinations: [], vibes: [], itinerary: [] });
await api(uid, 'set', `trips/${tid}/members/${uid}`, { nick: 'Ana', status: 'in' });
await p.goto(BASE + '/#' + tid); await settle(p); await p.waitForTimeout(600);
const skip = p.locator('[data-act=setupLater]'); if (await skip.count()) { await skip.click(); await settle(p); }
const broken = async () => (await p.locator('text=This screen hit a problem').count()) > 0;
const visited = [];
for (const [sec, tab] of [['home', 'overview'], ['home', 'crew'], ['home', 'settings'], ['plan', 'dates'], ['plan', 'match'], ['plan', 'whatif'], ['plan', 'plan']]) {
  await p.locator(`.bottomnav [data-sec=${sec}]`).click(); await settle(p);
  await p.locator(`.subtab[data-tab=${tab}]`).click().catch(() => {}); await settle(p);
  visited.push(tab + (await broken() ? ' ✗' : ''));
}
expect('a plan with bad stored dates opens on every tab without “This screen hit a problem”', !visited.some(v => v.endsWith('✗')), visited.join(', '));
expect('…and without page errors', !errs.length, errs.slice(0, 2).join(' | '));
await p.locator('.bottomnav [data-sec=plan]').click(); await settle(p); await p.locator('.subtab[data-tab=dates]').click(); await settle(p);
{ const v = await p.evaluate(() => [document.querySelector('#win-start')?.value, document.querySelector('#win-end')?.value]); expect('the bad window shows as not set', v[0] === '' && v[1] === '', JSON.stringify(v)); }
await p.locator('.bottomnav [data-sec=home]').click(); await settle(p); await p.locator('.subtab[data-tab=crew]').click(); await settle(p);
{ const t = await p.innerText('body'); expect('the bad RSVP deadline isn’t shown as a date', !/Answer by|Answers closed|Invalid/.test(t)); }
await p.locator('.subtab[data-tab=settings]').click(); await settle(p);
{ const v = await p.locator('#dec-by').inputValue().catch(() => 'missing'); expect('the bad voting deadline shows as empty', v === '', v); }
// an organizer sets the window again; the server takes the real dates
inject = false;
await p.locator('.bottomnav [data-sec=plan]').click(); await settle(p); await p.locator('.subtab[data-tab=dates]').click(); await settle(p);
await p.fill('#win-start', '2026-12-01'); await p.fill('#win-end', '2026-12-20'); await p.locator('#win-end').dispatchEvent('change'); await p.waitForTimeout(1200);
{ const t = (await api(uid, 'get', 'trips/' + tid)).data; expect('…and the organizer can set real dates again', t.winStart === '2026-12-01' && t.winEnd === '2026-12-20', `${t.winStart} → ${t.winEnd}`); }
await api(uid, 'delete', 'trips/' + tid);
console.log('errors', errs); await b.close();
process.exit(fails ? 1 : 0);

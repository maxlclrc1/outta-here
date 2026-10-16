// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// A plan that already holds bad dates (saved before they were checked) still opens: the bad
// values show as not set, nothing crashes, and an organizer can set them again. Covers the
// window and deadlines, then locked dates and pitch dates, and the normal ways of locking.
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
let inject = true; const STORE = {};
await c.route('**/api/db', async r => {
  const q = JSON.parse(r.request().postData() || '{}'), res = await r.fetch();
  const plan = id => inject && STORE[id], id = String(q.path || '').replace(/^trips\//, '');
  if (q.op === 'get' && plan(id)) { const j = await res.json(); if (j.exists) j.data = { ...j.data, ...STORE[id] }; return r.fulfill({ response: res, json: j }); }
  if (q.op === 'list' && q.path === 'trips' && inject) { const j = await res.json(); j.docs = (j.docs || []).map(d => STORE[d.id] ? { ...d, data: { ...d.data, ...STORE[d.id] } } : d); return r.fulfill({ response: res, json: j }); }
  r.fulfill({ response: res });
});
STORE[tid] = STORED;
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

// —— locked dates and pitch dates ——
const t2 = 'dl' + Math.random().toString(36).slice(2, 8), P = 'trips/' + t2;
const good = { id: 'pg', city: 'Lisbon', code: 'LIS', start: '2026-11-12', end: '2026-11-15', tagline: 'Tiles and tascas', why: 'Cheap and sunny', perPerson: '$500', vibeMatch: 80, highlights: ['Alfama'], weather: 'Mild' };
await api(uid, 'set', P, { name: 'Lisbon trip', createdBy: uid, createdAt: Date.now(), people: { [uid]: true }, size: 'trip', mode: 'friends', nights: 3, winStart: '2026-11-01', winEnd: '2026-11-30', destinations: [{ id: 'd1', city: 'Lisbon' }], vibes: [], itinerary: [], pitches: { at: 1, items: [good] } });
await api(uid, 'set', `${P}/members/${uid}`, { nick: 'Ana', status: 'in', days: ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'] });
// stored before checks existed: a lock with a bad end, and a pitch with impossible dates
STORE[t2] = { lockedDates: { start: '2026-11-05', end: 'oops' }, pitches: { at: 1, items: [good, { ...good, id: 'pb', city: 'Porto', code: 'OPO', start: '2026-11-31', end: 'never' }] } };
inject = true; errs.length = 0;
await p.goto(BASE + '/'); await settle(p); await p.waitForTimeout(600);
expect('home screen: a plan with bad locked dates is listed without crashing', !(await broken()) && (await p.innerText('body')).includes('Lisbon trip'));
await p.goto(BASE + '/#' + t2); await settle(p); await p.waitForTimeout(600);
{ const sk = p.locator('[data-act=setupLater]'); if (await sk.count()) { await sk.click(); await settle(p); } }
const seen = [];
for (const [sec, tab] of [['home', 'overview'], ['plan', 'dates'], ['plan', 'match'], ['plan', 'whatif'], ['plan', 'plan'], ['book', 'flights'], ['book', 'stays'], ['live', 'live'], ['money', 'cost']]) {
  await p.locator(`.bottomnav [data-sec=${sec}]`).click(); await settle(p);
  await p.locator(`.subtab[data-tab=${tab}]`).click().catch(() => {}); await settle(p);
  seen.push(tab + (await broken() ? ' ✗' : ''));
}
expect('bad locked dates and pitch dates: every tab opens without “This screen hit a problem”', !seen.some(v => v.endsWith('✗')), seen.join(', '));
expect('…and without page errors', !errs.length, errs.slice(0, 2).join(' | '));
await p.locator('.bottomnav [data-sec=plan]').click(); await settle(p); await p.locator('.subtab[data-tab=dates]').click(); await settle(p);
{ const t = await p.innerText('body'); expect('the bad lock shows as not locked (no half-empty “Decided” card; dates can be picked again)', !(await p.locator('.decided-sum').count()) && !/Locked:/.test(t) && (await p.locator('[data-lockdates]').count()) > 0); }
await p.locator('.subtab[data-tab=match]').click(); await settle(p);
{ const t = await p.innerText('main, body'); expect('the pitch with good dates still shows them; the impossible one isn’t shown as a real date', /Nov 12/.test(t) && !/Dec 1\b|Invalid|NaN/.test(t)); }
{ const st = (await api(uid, 'get', P)).data; expect('nothing cleaned up was saved back', !('lockedDates' in st) && st.pitches.items.length === 1); }
// the normal flows, with the plan as the server really holds it
inject = false; await p.reload(); await settle(p); await p.waitForTimeout(500);
await p.locator('.bottomnav [data-sec=plan]').click(); await settle(p); await p.locator('.subtab[data-tab=dates]').click(); await settle(p);
const pick = await p.locator('[data-lockdates]').first().getAttribute('data-lockdates');
await p.locator('[data-lockdates]').first().dispatchEvent('click'); await p.waitForTimeout(1200);
{ const L = (await api(uid, 'get', P)).data.lockedDates; expect('locking dates from the Dates tab still saves them', L && `${L.start}|${L.end}` === pick, JSON.stringify(L)); }
await api(uid, 'update', P, { lockedDates: null, swipes: { pg: { [uid]: 1 } } }); await p.waitForTimeout(800);
await p.locator('.subtab[data-tab=match]').click(); await settle(p);
await p.locator('[data-lockpitch=pg]').first().dispatchEvent('click'); await p.waitForTimeout(1200);
{ const t = (await api(uid, 'get', P)).data; expect('locking a matched pitch still locks its place and dates', t.lockedDest === 'd1' && t.lockedDates?.start === '2026-11-12' && t.lockedDates?.end === '2026-11-15', JSON.stringify(t.lockedDates)); }
await api(uid, 'delete', P);
console.log('errors', errs); await b.close();
process.exit(fails ? 1 : 0);

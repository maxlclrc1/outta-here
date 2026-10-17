// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// When the budget check is rate-limited, budget guidance stays visible, marked as an earlier
// check (or "unavailable" if there's none yet), instead of turning into "nobody set a budget".
// Locking waits for a real check, and the server still refuses a lock over a hard limit.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
let busy = false, asked = 0;
await c.route('**/api/budget', r => { asked++; return busy ? r.fulfill({ status: 429, headers: { 'Retry-After': '5' }, json: { code: 'rate_limited', message: 'Too many budget checks' } }) : r.fallback(); });
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Ana'); await p.click('.join-card [type=submit]'); await settle(p);
const A = await p.evaluate(() => localStorage.outta_uid), B = 'u_bea00' + Math.random().toString(36).slice(2, 8);
await p.click('[data-act=newTrip]'); await settle(p); await p.click('[data-size=trip]'); await settle(p); await p.locator('[data-mode]').first().click(); await settle(p);
await p.fill('#nt-name', 'Budget trip'); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); await p.click('[data-act=setupLater]'); await settle(p);
const tid = (await p.evaluate(() => location.hash)).slice(1), P = 'trips/' + tid;
await api(A, 'update', `${P}/members/${A}`, { budget: 1000, status: 'in' });
await api(B, 'set', `${P}/members/${B}`, { nick: 'Bea', status: 'in', budget: 300, hard: { budget: true } });
await api(B, 'update', P, { people: { [B]: true } });
const pitch = (id, city, perPerson) => ({ id, city, code: '', start: '2026-11-12', end: '2026-11-15', tagline: 'x', why: 'y', perPerson, vibeMatch: 80, highlights: [], weather: '' });
await api(A, 'update', P, { destinations: [{ id: 'd1', city: 'Lisbon' }, { id: 'd2', city: 'Porto' }], pitches: { at: 1, items: [pitch('p1', 'Lisbon', '$400–500'), pitch('p2', 'Porto', '$200')] }, swipes: { p2: { [A]: 1 } } });
await api(B, 'update', P, { swipes: { p2: { [B]: 1 } } });
await p.waitForTimeout(900);
const chips = async () => { await p.locator('.bottomnav [data-sec=plan]').click(); await settle(p); await p.locator('.subtab[data-tab=match]').click(); await settle(p); return (await p.innerText('body')).replace(/\n+/g, ' | '); };
const toast = async () => (await p.locator('#toast').innerText().catch(() => '')).trim();
const lockP2 = async () => { await p.locator('[data-lockpitch=p2]').first().dispatchEvent('click'); await p.waitForTimeout(1000); return toast(); };

// 1. a confirmed check
{ const t = await chips(); expect('a confirmed check shows the fit and the over-budget warning', /Fits 2\/2 budgets/.test(t) && /Over budget for/.test(t) && !/earlier check/.test(t), t.match(/(Fits|Over)[^|]*/g)?.join(' / ')); }

// 2. rate-limited after that: the last confirmed answers stay, marked as earlier
busy = true; const before = asked;
await api(A, 'update', P, { name: 'Budget trip!' }); await p.waitForTimeout(1200); // any change makes the app ask again
{ const t = await chips();
  expect('the app asked again and was refused', asked > before);
  expect('a rate-limited check keeps the fit, marked as an earlier check', /Fits 2\/2 budgets \(earlier check\)/.test(t), t.match(/(Fits|Over|Nobody|Budget check)[^|]*/g)?.join(' / '));
  expect('…and keeps the over-budget warning, marked too', /Over budget for [^|]* \(earlier check\)/.test(t));
  expect('…never “nobody set a budget”', !/Nobody set a budget yet/.test(t));
  expect('the pitches’ lock lines: the hard-limit warning is marked earlier, the other says limits can’t be checked (not “Can lock”)', /Over a hard limit for [^|]* \(earlier check\)/.test(t) && /Budget limits can’t be checked right now/.test(t)); }
// 3. locking while only an earlier check is known
{ const m = await lockP2(), t = (await api(A, 'get', P)).data; expect('locking waits for a confirmed check', /Couldn’t confirm everyone’s budget limits/.test(m) && !t.lockedDates, m); }
// …and the server still refuses a lock over a hard limit, whatever the app could check
{ const x = await api(A, 'update', P, { lockedDest: 'd1', lockedDates: { start: '2026-11-12', end: '2026-11-15' } }); expect('the server still refuses locking a pitch over someone’s hard limit', x.status === 403 && /hard limit/.test(x.message), x.message); }

// 4. rate-limited before any answer: "unavailable", and locking is refused
await p.reload(); await settle(p); await p.waitForTimeout(800);
{ const t = await chips(); expect('with no earlier answer, it says the check is unavailable (not “no budgets”)', /Budget check unavailable right now/.test(t) && !/Nobody set a budget yet|Fits 2\/2 budgets/.test(t), t.match(/(Fits|Over|Nobody|Budget check)[^|]*/g)?.join(' / ')); }
{ const m = await lockP2(); expect('…and locking says it couldn’t check', /Couldn’t check everyone’s budget limits/.test(m) && !(await api(A, 'get', P)).data.lockedDates, m); }

// 5. once checks work again, the app asks again by itself and shows a confirmed answer
busy = false; await p.waitForTimeout(6500);
{ const t = await chips(); expect('after the wait it checks again and shows a fresh answer', /Fits 2\/2 budgets/.test(t) && !/earlier check|unavailable/.test(t)); }
{ const m = await lockP2(), t = (await api(A, 'get', P)).data; expect('…and the pitch that fits everyone can be locked', t.lockedDest === 'd2' && t.lockedDates?.start === '2026-11-12', m); }
await api(A, 'delete', P);
console.log('errors', errs); await b.close();
process.exit(fails ? 1 : 0);

// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// A guest of honor whose share is covered doesn't count when a shared cost is split per person:
// 4 people with the bride covered and a $1,200 stay is $400 each for the 3 who pay, not $300 (the
// same split expenses and settle-up use). Budget checks use that corrected number.
import { claim, install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
const expect = (label, ok, detail = '') => console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`);
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(500));
const db = (p, op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto((process.env.BASE || 'http://localhost:3000') + '/'); await p.fill('#join-name', 'Kim'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid);
await p.click('[data-act=newTrip]'); await settle(p); await p.click('[data-size=weekend]'); await settle(p); await p.click('[data-mode=bachelorette]'); await settle(p);
await p.fill('#nt-name', 'Bach'); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); await p.click('[data-act=setupLater]'); await settle(p);
const tid = (await p.evaluate(() => location.hash)).slice(1), r = Math.random().toString(36).slice(2, 6);
const BEA = 'u_bea0' + r, CAM = 'u_cam0' + r, DEE = 'u_dee0' + r; // Dee is the bride
await claim(BEA, CAM, DEE);
const mem = (id, nick, x = {}) => db(p, 'set', `trips/${tid}/members/${id}`, { nick, home: 'Austin', budget: 0, status: 'confirmed', days: [], votes: [], updatedAt: Date.now(), ...x });
await mem(BEA, 'Bea'); await mem(CAM, 'Cam'); await mem(DEE, 'Dee');
await db(p, 'update', `trips/${tid}/members/${uid}`, { status: 'confirmed', budget: 400 });
await db(p, 'update', 'trips/' + tid, { people: { [BEA]: true, [CAM]: true, [DEE]: true }, honoree: DEE, stay: { name: 'Villa', total: 1200 } });
await p.waitForTimeout(800);
await p.click('.bottomnav [data-sec=money]'); await settle(p); await p.click('.subtab[data-tab=cost]'); await settle(p);
const stayRow = async () => (await p.locator('.cost-row', { hasText: 'Stay' }).first().innerText()).replace(/\n+/g, ' | ');
const card = async () => { await p.waitForTimeout(900); return (await p.locator('.cost-card, .card', { hasText: 'budget' }).first().innerText()).replace(/\n+/g, ' | '); };
// a member changing their own RSVP
const as = (u, data) => fetch((process.env.BASE || 'http://localhost:3000') + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op: 'update', path: `trips/${tid}/members/${u}`, data }) }).then(x => x.json());
const set = async data => { await db(p, 'update', 'trips/' + tid, data); await p.waitForTimeout(900); await settle(p); };

// covered (the default): $1,200 split 3 ways, and Kim's $400 budget is over once the 10% buffer is on
{ const s = await stayRow(); expect('covered bride: the stay is split among the 3 who pay ($400 each)', /split 3 ways/.test(s) && /\$400\b/.test(s) && !/\$300\b/.test(s), s); }
{ const c = await card(); expect('…and the budget check uses $400 (over Kim’s $400 budget with the buffer)', /Over your \$400 budget/.test(c) && /Over budget for Kim/i.test(c) && !/Fits 1\/1/i.test(c), c.slice(0, 900)); }

// not covered: back to everyone, $300 each, which fits
await set({ honoreeFree: false });
{ const s = await stayRow(); expect('bride not covered: split 4 ways ($300 each), as before', /split 4 ways/.test(s) && /\$300\b/.test(s), s); }
{ const c = await card(); expect('…and $300 (+buffer) fits Kim’s budget', /Fits your \$400 budget/.test(c) && /Fits 1\/1 budget/i.test(c) && !/Over budget for/i.test(c), c.slice(0, 900)); }

// edge cases
await set({ honoreeFree: true });
await as(DEE, { status: 'maybe' }); await p.waitForTimeout(900); await settle(p);
{ const s = await stayRow(); expect('a covered bride who isn’t counted yet (only a maybe) isn’t taken off twice', /split 3 ways/.test(s) && /\$400\b/.test(s), s); }
await as(DEE, { status: 'confirmed' }); await as(BEA, { status: 'out' }); await as(CAM, { status: 'out' }); await as(uid, { status: 'out' }); await p.waitForTimeout(900); await settle(p);
{ const s = await stayRow(); expect('if the covered bride is the only one counted, the stay isn’t divided by 0', /for 1 person/.test(s) && /\$1,200/.test(s) && !/NaN|Infinity/.test(s), s); }
await set({ honoree: 'u_gone0' + r }); await as(uid, { status: 'confirmed' }); await p.waitForTimeout(900); await settle(p);
{ const s = await stayRow(); expect('an honoree who isn’t in the plan takes no one off the split', /split 2 ways/.test(s) && /\$600\b/.test(s), s); }

expect('no page errors', !errs.length, errs.join('; '));
await db(p, 'delete', 'trips/' + tid);
await b.close();

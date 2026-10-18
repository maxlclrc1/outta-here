// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Pitch and What-if prices follow who pays (trip.pays). Splitting: per person, as before. One person
// paying: the total for everyone leads (per person × the headcount), the per-person price is context,
// and it says the payer covers everyone; the budget chip is the payer's total. A company paying: the
// company total leads, it's called a company expense, and there's no personal budget check.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 240) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Ana'); await p.click('.join-card [type=submit]'); await settle(p);
const A = await p.evaluate(() => localStorage.outta_uid), B = 'u_bea00' + Math.random().toString(36).slice(2, 8);
await p.click('[data-act=newTrip]'); await settle(p); await p.click('[data-size=trip]'); await settle(p); await p.click('[data-mode=friends]'); await settle(p);
await p.fill('#nt-name', 'Price trip'); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); await p.click('[data-act=setupLater]'); await settle(p);
const tid = (await p.evaluate(() => location.hash)).slice(1), P = 'trips/' + tid;
await api(A, 'update', `${P}/members/${A}`, { budget: 1000, status: 'in' });
await api(B, 'set', `${P}/members/${B}`, { nick: 'Bea', status: 'in', budget: 300 });
await api(B, 'update', P, { people: { [B]: true } });
const pitch = (id, city, perPerson) => ({ id, city, code: '', start: '2026-11-12', end: '2026-11-15', tagline: 'x', why: 'y', perPerson, vibeMatch: 80, highlights: [], weather: '' });
await api(A, 'update', P, { pays: 'split', destinations: [{ id: 'd1', city: 'Lisbon' }, { id: 'd2', city: 'Porto' }], pitches: { at: 1, items: [pitch('p1', 'Lisbon', '$400–500'), pitch('p2', 'Porto', '$200')] },
  lockedDates: { start: '2026-11-12', end: '2026-11-15' }, costs: { food: { low: 100, high: 100, src: 'estimate', by: A, at: 1 } } });
await p.waitForTimeout(900);
const go = async tab => { await p.locator('.bottomnav [data-sec=plan]').click(); await settle(p); await p.locator(`.subtab[data-tab=${tab}]`).click(); await settle(p); await p.waitForTimeout(600); };
const card = async () => { await go('match'); return { pitch: (await p.locator('#pitch .pitch-body').innerText()).replace(/\s+/g, ' '), board: (await p.locator('.linkrow').allInnerTexts()).join(' / ').replace(/\s+/g, ' ') }; };
const whatif = async () => { await go('whatif'); return (await p.locator('.whatif').textContent()).replace(/\s+/g, ' '); };
const setPays = async (pays, payer) => { await api(A, 'update', P, { pays, payer: payer || null }); await p.waitForTimeout(900); };

// —— split: per person, as before ——
{ const { pitch: t, board } = await card();
  expect('split: the pitch shows the per-person price', /Per person \$400–500/i.test(t) && !/everyone|company/i.test(t), t);
  expect('…the scoreboard too', /\$400–500/.test(board) && /\$200/.test(board) && !/for everyone|company total/.test(board), board);
  expect('…and the budget chip checks everyone’s budgets', /Fits 1\/2 budgets|Over budget for|A stretch for/.test(t), t); }
{ const w = await whatif();
  expect('split: What-if prices are each, with the budgets row', /Each, all in/.test(w) && /Fits budgets/.test(w) && !/Everyone, all in|Company total/.test(w), w.slice(0, 400)); }

// —— one person pays (Ana) ——
await setPays('one', A);
{ const { pitch: t, board } = await card();
  expect('one payer: the pitch leads with the total for everyone (2 × per person)', /For everyone \$800–\$1,000/i.test(t) && /2 × \$400–\$500 each/.test(t), t);
  expect('…says the payer covers everyone', /You’re covering everyone/.test(t), t);
  expect('…and checks the payer’s total budget, not each person’s', /your total budget/.test(t) && !/\d\/2 budgets/.test(t), t);
  expect('…the scoreboard shows totals for everyone', /\$800–\$1,000 for everyone/.test(board) && /\$400 for everyone/.test(board), board); }
{ const w = await whatif(), m = w.match(/Everyone, all in\s*\$([\d,]+)\S*\s*2 × \$([\d,]+)/);
  expect('one payer: What-if leads with everyone’s total, 2 × each', !!m && +m[1].replace(/,/g, '') === 2 * +m[2].replace(/,/g, ''), w.match(/Everyone, all in.{0,80}/)?.[0]);
  expect('…with the payer’s total budget and who covers it', /Your total budget/.test(w) && !/Fits budgets/.test(w) && /You’re covering everyone/.test(w), w.slice(0, 500)); }

// —— the company pays ——
await setPays('company');
{ const { pitch: t, board } = await card();
  expect('company: the pitch leads with the company total', /Company total \$800–\$1,000/i.test(t) && /2 × \$400–\$500 each/.test(t), t);
  expect('…called a company expense, with no personal budget check', /company expense, not anyone’s own budget/i.test(t) && /Company expense, no personal budgets/.test(t) && !/Fits|Over budget|budgets set/.test(t), t);
  expect('…the scoreboard shows company totals', /\$800–\$1,000 company total/.test(board), board); }
{ const w = await whatif();
  expect('company: What-if shows the company total and no budget row', /Company total/.test(w) && /2 × \$/.test(w) && !/Fits budgets|total budget/i.test(w) && /company expense/i.test(w), w.slice(0, 500)); }

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

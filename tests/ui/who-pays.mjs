// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Who pays (trip.pays: split / one / company, trip.payer). Creation asks it with the kind of plan's
// default and wording (small friends plans aren't asked and split); Settings changes it. When one person
// covers everything, they see the total and pay back anyone who fronted money; everyone else sees
// "Covered by …" and isn't asked for a budget; there's no group pot. When a company pays: no budgets,
// no per-person headline, no pot, and expenses are shown as what each person claims back. Plans
// without the setting work as before (split).
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 220) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const page = async (name, hash = '') => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(BASE + '/' + hash); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p); return p;
};
const A = await page('Rae'), uid = await A.evaluate(() => localStorage.outta_uid), tids = [];
const home = async p => { if (await p.locator('[data-act=home]').count()) { await p.locator('[data-act=home]').first().dispatchEvent('click'); await settle(p); } };
async function create(sz, mode, pick) {
  await home(A); await A.click('[data-act=newTrip]'); await settle(A); await A.click(`[data-size=${sz}]`); await settle(A); await A.click(`[data-mode=${mode}]`); await settle(A);
  const opts = await A.locator('.nf-pay b').allInnerTexts(), on = await A.locator('.nf-pay.on b').allInnerTexts();
  if (pick) { await A.locator('.nf-pay', { hasText: pick }).click(); await settle(A); }
  await A.fill('#nt-name', `${mode} ${sz}`); if (await A.locator('#nt-city').count()) await A.fill('#nt-city', 'Denver');
  await A.click('#newTrip [type=submit]'); await A.waitForSelector('.setup'); const tid = (await A.evaluate(() => location.hash)).slice(1); tids.push(tid);
  await A.click('[data-act=setupLater]'); await settle(A);
  return { tid, opts, on: on.join(), t: (await api(uid, 'get', 'trips/' + tid)).data };
}
const go = async (p, sec, tab) => { await p.click(`.bottomnav [data-sec=${sec}]`); await settle(p); if (tab && await p.locator(`.subtab[data-tab=${tab}]`).count()) { await p.click(`.subtab[data-tab=${tab}]`); await settle(p); } };
const text = p => p.locator('body').innerText();

// —— creation ——
{ const r = await create('weekend', 'family');
  expect('family: asked, defaulting to “I’m covering it”', r.on === 'I’m covering it' && r.opts.join('|') === 'I’m covering it|We’re splitting it', r.opts.join('|'));
  expect('…saved as one person paying, the creator', r.t.pays === 'one' && r.t.payer === uid, `${r.t.pays} ${r.t.payer === uid}`); }
{ const r = await create('trip', 'work'); expect('work: defaults to the company paying', r.on === 'The company’s paying' && r.t.pays === 'company' && !r.t.payer, r.opts.join('|')); }
{ const r = await create('weekend', 'bachelorette'); expect('celebration: defaults to splitting', r.on === 'We’re splitting it' && r.t.pays === 'split'); }
{ const r = await create('hangout', 'friends'); expect('a small friends plan isn’t asked, and splits', !r.opts.length && r.t.pays === 'split'); }
const fr = await create('weekend', 'friends', 'I’m treating everyone');
expect('friends weekend: asked; picking “I’m treating everyone” saves it', fr.on === 'Everyone pays their own way' && fr.t.pays === 'one' && fr.t.payer === uid);

// —— one person pays (Rae), Jo joins ——
const T = fr.tid, key = (await api(uid, 'get', 'trips/' + T)).data.inviteKey;
await api(uid, 'update', 'trips/' + T, { costs: { food: { low: 100, high: 100, src: 'estimate', by: uid, at: 1 } } });
const J = await page('Jo', `#${T}.${key}`); await J.waitForSelector('.welcome'); await J.click('[data-join=in]'); await J.waitForSelector('.setup');
const jsteps = (await J.locator('.setup-top .label').textContent()).replace(/^.*Step /, 'Step ');
expect('Jo isn’t asked for a budget (no budget step)', !(await J.locator('[data-budget]').count()) && jsteps === 'Step 1 of 3', jsteps);
await J.click('[data-act=setupLater]'); await settle(J);
const jid = await J.evaluate(() => localStorage.outta_uid);
await api(jid, 'set', `trips/${T}/expenses/e1`, { title: 'Gas', amount: 60, paidBy: jid, split: [uid, jid], by: jid, at: Date.now() });
await J.waitForTimeout(800);
expect('Jo’s plan home says it’s covered by Rae', /Covered by Rae/.test(await J.locator('.glance-grid').innerText()));
await go(J, 'money', 'cost'); { const t = await text(J); expect('Jo’s cost card: “Covered by Rae”, no numbers or budget', /Covered by Rae/.test(t) && !/The cost of saying yes|Fits \d/.test(t)); }
await go(J, 'money', 'money'); { const t = await text(J); expect('Jo’s expenses: covered banner, and Rae pays Jo back the $60 he fronted', /Covered by Rae/.test(t) && /Rae pays Jo \$60/.test(t.replace(/\s+/g, ' ')) && /Paying people back/.test(t) && !/Split between/.test(t), t.match(/Rae pays[^\n]*/)?.[0]); }
expect('…and no group pot', !(await J.locator('.subtab[data-tab=pot]').count()));
await go(A, 'money', 'cost'); await A.waitForTimeout(500);
{ const t = (await text(A)).replace(/\s+/g, ' '), m = t.match(/EVERYONE, ALL IN \$(\d+) 2 × \$(\d+) each/i); expect('Rae (paying) sees the total for everyone (2 people × the per-person amount), with no budget check', /What it’ll cost you/.test(t) && !!m && +m[1] === 2 * +m[2] && !/Fits \d/.test(t), t.match(/Everyone, all in.{0,60}/i)?.[0]); }
await go(A, 'money', 'money'); { const t = (await text(A)).replace(/\s+/g, ' '); expect('Rae’s expenses: she pays Jo back', /You’re covering this/.test(t) && /Rae pays Jo \$60/.test(t)); }

// budgets: Rae's is the total for everyone; Jo isn't asked for one
await go(A, 'home', 'crew');
expect('Rae’s budget field says it’s the total for everyone', /Budget for everyone/i.test(await A.locator('label:has(#me-budget)').innerText()));
await A.fill('#me-budget', '150'); await A.locator('#me-budget').blur(); await A.waitForTimeout(900);
await go(A, 'money', 'cost'); expect('…and the cost card compares the group total with it', /over your \$150 total budget/i.test(await text(A)));
await go(J, 'home', 'crew'); expect('Jo has no budget field', !(await J.locator('#me-budget').count()));

// —— Settings: switch to the company, then back to splitting ——
await go(A, 'home', 'settings');
expect('Settings shows who’s paying, with Rae covering it', (await A.locator('.pays-card .nf-pay.on b').innerText()) === 'I’m treating everyone' && (await A.locator('#set-payer').inputValue()) === uid);
await A.locator('.pays-card [data-setpays=company]').click(); await A.waitForTimeout(900);
expect('switching to the company is saved', (await api(uid, 'get', 'trips/' + T)).data.pays === 'company');
await go(A, 'money', 'money'); { const t = (await text(A)).replace(/\s+/g, ' '); expect('company: expenses show what each person claims back, no settle-up', /To claim back/.test(t) && /Jo \$60/.test(t) && !/Settle up|pays Jo/.test(t), t.match(/To claim back.{0,80}/)?.[0]); }
await go(A, 'money', 'cost'); { const t = await text(A); expect('company: the cost card is for the company, no per-person headline or budgets', /What it’ll cost the company/.test(t) && !/Each person, all in|Fits \d/.test(t)); }
await go(J, 'home', 'overview'); expect('company: Jo isn’t nudged to set a budget', !/set your budget/i.test(await text(J)));
await go(A, 'home', 'settings'); await A.locator('.pays-card [data-setpays=split]').click(); await A.waitForTimeout(900);
await go(A, 'money', 'money'); { const t = (await text(A)).replace(/\s+/g, ' '); expect('back to splitting: the original split and settle-up return', /Settle up/i.test(t) && /Rae pays Jo \$30/.test(t) && /Split between/i.test(t), t.match(/Rae pays[^S]{0,40}/)?.[0]); }
expect('…and the group pot is back', (await A.locator('.subtab[data-tab=pot]').count()) === 1);
await go(A, 'home', 'crew'); expect('splitting again: the budget field is your own share', /Your max, your share/i.test(await A.locator('label:has(#me-budget)').innerText()));

// —— a plan saved before who-pays existed ——
{ const tid = 'wp' + Math.random().toString(36).slice(2, 8); tids.push(tid);
  await api(uid, 'set', 'trips/' + tid, { name: 'Old trip', size: 'weekend', mode: 'friends', nights: 2, winStart: '2026-12-01', winEnd: '2026-12-20', destinations: [], itinerary: [], people: { [uid]: true }, createdBy: uid, createdAt: Date.now() });
  await api(uid, 'set', `trips/${tid}/members/${uid}`, { nick: 'Rae', status: 'in', days: [], updatedAt: Date.now() });
  await A.goto(`${BASE}/#${tid}`); await settle(A); await A.waitForSelector('.bottomnav'); await go(A, 'money', 'cost');
  expect('an older plan splits, as before', /The cost of saying yes/.test(await text(A)) && (await A.locator('.subtab[data-tab=pot]').count()) === 1); }

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// The rest of plan type (after plan-types.mjs): cost hints and the cost/deals AI requests, picks
// without a map, where an added pick lands in the itinerary, and the crew DNA line. Family trips and team
// offsites aren't described as nights out; friends plans keep the original wording and behavior.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const c = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
// the AI is "on"; every request's prompt is recorded and answered with an empty reply
const sent = [];
await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
await c.route('**/api/ai', r => { const x = JSON.parse(r.request().postData() || '{}'); sent.push(typeof x.input === 'string' ? x.input : JSON.stringify(x.input)); r.fulfill({ json: { text: '{}', truncated: false } }); });
const db = (op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
await p.goto(BASE + '/'); await p.fill('#join-name', 'Rae'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), tids = [];

// a plan with a locked city and dates, as saved data (disposable)
const START = '2026-12-04', END = '2026-12-06';
async function plan(mode, size, extra = {}) {
  const tid = 'pd' + mode.slice(0, 3) + r + tids.length; tids.push(tid);
  await db('set', 'trips/' + tid, { name: `${mode} ${size}`, size, mode, nights: 2, currency: 'USD', winStart: '2026-12-01', winEnd: '2026-12-20', destinations: [{ id: 'd1', city: 'Denver' }], lockedDest: 'd1',
    lockedDates: { start: START, end: END }, itinerary: [], people: { [uid]: true }, createdBy: uid, createdAt: Date.now(), ...extra });
  await db('set', `trips/${tid}/members/${uid}`, { nick: 'Rae', status: 'in', days: [], quiz: {}, updatedAt: Date.now() });
  return tid;
}
async function open(tid, sec, tab) {
  await p.goto(`${BASE}/#${tid}`); await settle(p); await p.waitForTimeout(500);
  if (await p.locator('[data-act=setupLater]').count()) { await p.click('[data-act=setupLater]'); await settle(p); }
  await p.click(`.bottomnav [data-sec=${sec}]`); await settle(p); await p.click(`.subtab[data-tab=${tab}]`); await settle(p);
}
const ask = async act => { const n = sent.length; await p.locator(`[data-act=${act}]`).first().dispatchEvent('click'); for (let i = 0; i < 40 && sent.length === n; i++) await p.waitForTimeout(100); await settle(p); return sent[n] || ''; };
const body = () => p.locator('body').innerText();
const row = async label => (await p.locator('.cost-row', { hasText: label }).first().innerText()).replace(/\n+/g, ' | ');
const NIGHTY = /night out|cover|nightlife|rounds/i;
const spot = (name, type, lat, lng) => ({ name, type, area: 'LoDo', why: 'x', price: '$$', cover: 'Free', bestNight: 'Sat', tip: '', lat, lng });

// —— 1. cost hints and the cost / deals requests ——
for (const [mode, size, food, fun] of [['family', 'weekend', 'Every meal and snack', 'Tickets, entry fees, rentals'], ['work', 'trip', 'Every meal and team dinner', 'Team activity, tickets, entry fees']]) {
  const tid = await plan(mode, size);
  await open(tid, 'money', 'cost');
  const f = await row('Food'), a = await row('Activities');
  expect(`${mode}: the cost card describes food and activities without nights out or cover`, f.includes(food) && a.includes(fun) && !NIGHTY.test(f + a), `${f} / ${a}`);
  const prompt = await ask('costAI');
  expect(`${mode}: the cost estimate request uses the same plain lines (same keys)`, prompt.includes(`- food: Food & drinks (${food})`) && prompt.includes(`- fun: Activities (${fun})`) && !/night out|cover charge|Tickets, cover/i.test(prompt), (prompt.match(/- (food|fun):.*/g) || []).join(' / '));
}
{ const tid = await plan('friends', 'weekend'); await open(tid, 'money', 'cost');
  const f = await row('Food'), a = await row('Activities'), prompt = await ask('costAI');
  expect('friends: cost lines unchanged (“Every meal and night out”, “Tickets, cover, rentals”)', f.includes('Every meal and night out') && a.includes('Tickets, cover, rentals') && prompt.includes('- food: Food & drinks (Every meal and night out)'), `${f} / ${a}`); }
{ // deals: what the AI is asked to price, and how it's shown (including a reply saved before this change)
  const deal = pp => ({ city: 'Denver', start: START, at: Date.now(), data: { verdict: 'fits', perPerson: pp, flights: [], savings: [] } });
  const work = await plan('work', 'trip'); await open(work, 'book', 'flights');
  const prompt = await ask('deals');
  expect('work: the price check asks for activities, not nightlife', /"activities":"\$"/.test(prompt) && !/nightlife/i.test(prompt), (prompt.match(/"perPerson":\{[^}]*\}/) || [])[0]);
  await db('update', 'trips/' + work, { deals: deal({ flights: '$300', food: '$150', nightlife: '$120', total: '$900' }) }); await p.waitForTimeout(900); await settle(p);
  const shown = await p.locator('.split').first().innerText();
  expect('work: an older price check’s “nightlife” amount shows as activities', /activities/i.test(shown) && /\$120/.test(shown) && !/nightlife/i.test(shown), shown.replace(/\n+/g, ' | '));
  const fr = await plan('friends', 'trip', { deals: deal({ flights: '$300', nightlife: '$120', total: '$900' }) }); await open(fr, 'book', 'flights');
  const prompt2 = await ask('deals'), shown2 = await p.locator('.split').first().innerText();
  expect('friends: the price check still asks for and shows nightlife', /"nightlife":"\$"/.test(prompt2) && /nightlife/i.test(shown2) && /\$120/.test(shown2), shown2.replace(/\n+/g, ' | '));
}

// —— 2. no map (postponed): picks are asked for without coordinates, and Live has no map ——
{ const tid = await plan('friends', 'weekend', { spots: { city: 'Denver', at: 1, items: [spot('Club Vault', 'club', 39.75, -105.0)] } });
  await open(tid, 'plan', 'spots'); const prompt = await ask('spots');
  expect('the picks request doesn’t ask for coordinates', prompt.length > 0 && !/lat\/lng|"lat"|coordinates/i.test(prompt), prompt.slice(-160));
  await open(tid, 'live', 'live');
  expect('…and Live has no Map tab or map link', !(await p.locator('.subtab[data-tab=map], [data-tab=map]').count()), ''); }

// —— 3. adding picks to the itinerary ——
async function addAll(tid) {
  await open(tid, 'plan', 'spots');
  const n = await p.locator('[data-addspot]').count();
  for (let i = 0; i < n; i++) { await p.locator('[data-addspot]').nth(i).dispatchEvent('click'); await p.waitForTimeout(700); }
  await settle(p); return Object.fromEntries(((await db('get', 'trips/' + tid)).data.itinerary || []).map(i => [i.title, `${i.time} ${i.kind}`]));
}
{ const it = await addAll(await plan('family', 'weekend', { spots: { city: 'Denver', at: 1, items: [spot('Corner Cafe', 'cafe', 0, 0), spot('Diner Co', 'restaurant', 0, 0), spot('Science Museum', 'museum', 0, 0), spot('City Park', 'park', 0, 0)] } }));
  expect('family: a café is breakfast, a restaurant dinner, a museum and a park daytime activities', it['Corner Cafe'] === '09:30 food' && it['Diner Co'] === '18:30 food' && it['Science Museum'] === '10:00 activity' && it['City Park'] === '10:00 activity', JSON.stringify(it)); }
{ const it = await addAll(await plan('work', 'trip', { spots: { city: 'Denver', at: 1, items: [spot('Quiet Bar', 'bar', 0, 0), spot('Axe Throwing', 'activity', 0, 0), spot('Team Steakhouse', 'restaurant', 0, 0), spot('Art Tour', 'tour', 0, 0)] } }));
  expect('work: a relaxed bar is an 8pm evening, the team activity and tour daytime, the restaurant dinner', it['Quiet Bar'] === '20:00 chill' && it['Axe Throwing'] === '10:00 activity' && it['Art Tour'] === '10:00 activity' && it['Team Steakhouse'] === '18:30 food', JSON.stringify(it)); }
{ const it = await addAll(await plan('friends', 'weekend', { spots: { city: 'Denver', at: 1, items: [spot('Club Vault', 'club', 0, 0), spot('Taco Food Hall', 'late-night food', 0, 0)] } }));
  expect('friends: picks still land as nightlife at 10:30pm (late-night food at 1:30am)', it['Club Vault'] === '22:30 nightlife' && it['Taco Food Hall'] === '01:30 nightlife', JSON.stringify(it)); }

// —— 4. the crew DNA line ——
// two plans each with five late “nightlife” stops, the way earlier versions added family and work picks
const late = () => ['A', 'B', 'C', 'D', 'E'].map((x, i) => ({ id: 'i' + x, date: START, time: '22:30', title: 'Stop ' + x, kind: 'nightlife', note: '' }));
async function dnaLine(mode) {
  const K = 'cr' + mode.slice(0, 3) + r;
  await db('set', 'crews/' + K, { name: mode === 'friends' ? 'The Six' : 'The Lees', people: { [uid]: true }, profiles: { [uid]: { nick: 'Rae' } }, by: uid, at: Date.now() });
  const t1 = await plan(mode, 'weekend', { crewId: K, itinerary: late() }); await plan(mode, 'weekend', { crewId: K, itinerary: late() });
  await open(t1, 'plan', 'match'); await p.waitForTimeout(600);
  const l = p.locator('.dna-line'); const text = (await l.count()) ? await l.first().textContent() : '(no DNA line)';
  await db('delete', 'crews/' + K); return text;
}
{ const t = await dnaLine('family'); expect('family: the crew isn’t called night owls or here for the nights out', !/Night owls|nights out/i.test(t), t); }
{ const t = await dnaLine('work'); expect('work: the same for a team', !/Night owls|nights out/i.test(t), t); }
{ const t = await dnaLine('friends'); expect('friends: a crew that really goes out late still gets both traits', /Night owls/.test(t) && /nights out/.test(t), t); }

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

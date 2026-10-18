// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Which features a plan shows depends on its kind (Friends, Celebration, Family, Work) and size.
// Family and team plans don't get the group pot, the hangover index, the bucket list or awards (team
// plans no Wrapped either); small plans stay light (no map or bucket list; friends hangouts no to-dos);
// celebrations keep their guest-of-honor features. Hiding is display only: a plan that already has
// to-dos, bucket items, pot entries or award votes keeps showing them, and nothing is deleted.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 240) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
const db = (op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
await p.goto(BASE + '/'); await p.fill('#join-name', 'Rae'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), tids = [];

async function plan(mode, size, extra = {}, sub = {}) {
  const tid = 'fe' + r + tids.length; tids.push(tid); const small = size === 'hangout' || size === 'day';
  await db('set', 'trips/' + tid, { name: `${mode || 'old'} ${size}`, size, ...(mode ? { mode } : {}), nights: small ? 0 : 2, city: 'Denver', currency: 'USD', winStart: '2026-12-01', winEnd: '2026-12-20',
    destinations: [{ id: 'd1', city: 'Denver' }], lockedDest: 'd1', lockedDates: { start: '2026-12-04', end: small ? '2026-12-04' : '2026-12-06' }, itinerary: [], people: { [uid]: true }, createdBy: uid, createdAt: Date.now(), ...extra });
  await db('set', `trips/${tid}/members/${uid}`, { nick: 'Rae', status: 'in', days: [], quiz: {}, updatedAt: Date.now() });
  for (const [col, docs] of Object.entries(sub)) for (const [id, data] of Object.entries(docs)) await db('set', `trips/${tid}/${col}/${id}`, data);
  return tid;
}
async function open(tid) {
  await p.goto(`${BASE}/#${tid}`); await settle(p);
  if (!(await p.waitForSelector('.bottomnav', { timeout: 8000 }).catch(() => null))) { await p.reload(); await settle(p); await p.waitForSelector('.bottomnav'); }
  await p.waitForTimeout(400);
}
// every section's sub-tabs, as "Section: tab, tab"
async function tabs() {
  const out = [];
  for (const sec of await p.locator('.bottomnav .bn').evaluateAll(els => els.map(e => e.dataset.sec))) {
    await p.click(`.bottomnav [data-sec=${sec}]`); await settle(p);
    out.push(`${sec}: ${(await p.locator('.subtab').allInnerTexts()).join(', ') || '-'}`);
  }
  return out.join(' | ');
}
const has = (t, words) => words.every(w => t.includes(w)), lacks = (t, words) => words.every(w => !t.includes(w));

// —— away ——
{ const t = await tabs(await open(await plan('friends', 'trip')));
  expect('friends trip: everything, as before', has(t, ['To-dos', 'Map', 'Bucket list', 'Group pot', 'Wrapped', 'Awards', 'Flights']), t); }
{ const t = await tabs(await open(await plan('bachelorette', 'weekend')));
  expect('bachelorette weekend: pot, bucket list, awards and Wrapped stay', has(t, ['To-dos', 'Map', 'Bucket list', 'Group pot', 'Wrapped', 'Awards']), t); }
{ const tid = await plan('family', 'trip'); await open(tid); const t = await tabs();
  expect('family trip: no group pot, bucket list or awards; the recap stays', lacks(t, ['Group pot', 'Bucket list', 'Awards']) && has(t, ['Wrapped', 'Photos', 'Map', 'To-dos', 'Packing']), t);
  await p.click('.bottomnav [data-sec=live]'); await settle(p); await p.click('.subtab[data-tab=live]'); await settle(p);
  expect('…and no hangover index in Live', !/Hangover index/.test(await p.locator('body').innerText())); }
{ const t = await tabs(await open(await plan('work', 'trip')));
  expect('team offsite: no pot, bucket list, awards or Wrapped; Memories is just the photos', lacks(t, ['Group pot', 'Bucket list', 'Awards', 'Wrapped']) && has(t, ['memories: -', 'To-dos', 'Map']), t); }

// —— small ——
{ const t = await tabs(await open(await plan('friends', 'hangout')));
  expect('friends hangout: light (no to-dos, map or bucket list)', lacks(t, ['To-dos', 'Map', 'Bucket list', 'Group pot']) && has(t, ['Hype', 'Recap', 'Awards']), t); }
{ const t = await tabs(await open(await plan('birthday', 'hangout')));
  expect('birthday hangout: keeps to-dos (planning a surprise), no map', has(t, ['To-dos', 'Awards']) && lacks(t, ['Map', 'Bucket list']), t);
  await p.click('.bottomnav [data-sec=home]'); await settle(p); await p.click('.subtab[data-tab=settings]'); await settle(p);
  expect('…and its guest of honor setting', /The birthday star/.test(await p.locator('body').innerText())); }
{ const t = await tabs(await open(await plan('work', 'day')));
  expect('team day out: no map, bucket list, awards or recap (Memories is just the photos)', lacks(t, ['Map', 'Bucket list', 'Awards', 'Recap']) && has(t, ['To-dos', 'memories: -']), t); }
{ const t = await tabs(await open(await plan(undefined, 'hangout')));
  expect('an old hangout without a type is a friends hangout', lacks(t, ['To-dos', 'Map']) && has(t, ['Awards']), t); }

// —— features a plan already uses stay, and nothing is deleted ——
{ const tid = await plan('family', 'trip', { superVotes: { s0: { [uid]: uid } } }, { pot: { p1: { kind: 'in', amount: 50, by: uid, at: 1 } }, bucket: { b1: { text: 'See the lake', points: 1, doneBy: [], by: uid, at: 1 } } });
  await open(tid); const t = await tabs();
  expect('a family trip that already has pot money, bucket items and award votes still shows them', has(t, ['Group pot', 'Bucket list', 'Awards']), t);
  expect('…and the data is still there', (await db('list', `trips/${tid}/pot`)).docs?.length === 1 && (await db('list', `trips/${tid}/bucket`)).docs?.length === 1); }
{ const tid = await plan('friends', 'hangout', { tasks: { t1: { title: 'Book the table', owner: '', due: '', done: false, by: uid, at: 1 } } });
  await open(tid); const t = await tabs();
  expect('a friends hangout with to-dos still shows To-dos', has(t, ['To-dos']), t); }

// —— the plan home and the journey ——
{ const tid = await plan('friends', 'hangout'); await open(tid);
  expect('a friends hangout’s plan home has no To-dos tile (a Chat tile instead)', !(await p.locator('.glance[data-tab=tasks]').count()) && (await p.locator('.glance[data-tab=hype]').count()) === 1); }
{ const tid = await plan('work', 'trip', { lockedDates: { start: '2026-09-01', end: '2026-09-03' } }); await open(tid);
  await p.locator('.j-more summary').click().catch(() => {}); const j = (await p.locator('.journey').textContent()).replace(/\s+/g, ' ');
  expect('after a team offsite, nobody is told to watch the Wrapped', !/Wrapped/.test(j), j.slice(0, 200)); }
{ const tid = await plan('friends', 'trip', { lockedDates: { start: '2026-09-01', end: '2026-09-03' } }); await open(tid);
  await p.locator('.j-more summary').click().catch(() => {}); const j = (await p.locator('.journey').textContent()).replace(/\s+/g, ' ');
  expect('…a friends trip still is', /Wrapped/.test(j), j.slice(0, 600)); }

// —— setup ——
async function setupSteps(sz, mode) {
  if (await p.locator('[data-act=home]').count()) { await p.locator('[data-act=home]').first().dispatchEvent('click'); await settle(p); }
  await p.click('[data-act=newTrip]'); await settle(p); await p.click(`[data-size=${sz}]`); await settle(p); await p.click(`[data-mode=${mode}]`); await settle(p);
  await p.fill('#nt-name', `${mode} setup`); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup');
  tids.push((await p.evaluate(() => location.hash)).slice(1));
  return (await p.locator('.setup-top .label').textContent()).replace(/^.*Step /, 'Step ');
}
expect('family trip setup skips the vibe questions (3 steps)', (await setupSteps('trip', 'family')) === 'Step 1 of 3');
expect('team offsite setup skips them too, and the budget (the company pays)', (await setupSteps('trip', 'work')) === 'Step 1 of 2');
expect('friends trip setup keeps them (4 steps)', (await setupSteps('trip', 'friends')) === 'Step 1 of 4');

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

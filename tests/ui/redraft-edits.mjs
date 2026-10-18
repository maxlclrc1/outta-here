// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// What a redraft (the itinerary generator) and the hangover replan may change. Only AI stops nobody
// touched are replaced. An AI stop someone renamed stays (and isn't frozen in time); one someone moved
// is held at its new time; stops typed in stay fixed; added picks stay but aren't frozen; a deleted
// stop doesn't come back, even when the AI suggests it again, until someone undoes the delete. Older
// stops without the new records aren't treated as edited. Surprises stay hidden from the guest of
// honor and still hold their slot. Small plans get quiz questions that fit an evening or a day.
import { claim, install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 260) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const c = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
const sent = []; let reply = {};
await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
await c.route('**/api/ai', r => { const x = JSON.parse(r.request().postData() || '{}'); sent.push(typeof x.input === 'string' ? x.input : JSON.stringify(x.input)); r.fulfill({ json: { text: JSON.stringify(reply), truncated: false } }); });
const db = (op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
// another planner, reading the plan from their own "browser"
const asOther = (u, path) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op: 'get', path }) }).then(x => x.json());
await p.goto(BASE + '/'); await p.fill('#join-name', 'Rae'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), tids = [];

async function plan(mode, size, extra = {}) {
  const tid = 're' + r + tids.length; tids.push(tid); const small = size === 'hangout' || size === 'day';
  await db('set', 'trips/' + tid, { name: `${mode} ${size}`, size, mode, nights: small ? 0 : 2, city: 'Denver', currency: 'USD', winStart: '2026-12-01', winEnd: '2026-12-08',
    destinations: [{ id: 'd1', city: 'Denver' }], lockedDest: 'd1', itinerary: [], people: { [uid]: true }, createdBy: uid, createdAt: Date.now(), ...extra });
  await db('set', `trips/${tid}/members/${uid}`, { nick: 'Rae', status: 'in', days: [], quiz: {}, updatedAt: Date.now() });
  return tid;
}
async function open(tid, sec, tab) {
  await p.goto(`${BASE}/#${tid}`); await settle(p);
  if (!(await p.waitForSelector('.bottomnav, [data-act=setupLater]', { timeout: 8000 }).catch(() => null))) { await p.reload(); await settle(p); await p.waitForSelector('.bottomnav, [data-act=setupLater]'); }
  await p.waitForTimeout(500);
  if (await p.locator('[data-act=setupLater]').count()) { await p.click('[data-act=setupLater]'); await settle(p); }
  await p.click(`.bottomnav [data-sec=${sec}]`); await settle(p); await p.click(`.subtab[data-tab=${tab}]`); await settle(p);
}
const ask = async (act, data) => { reply = data; const n = sent.length; await p.locator(`[data-act=${act}]`).first().dispatchEvent('click'); for (let i = 0; i < 40 && sent.length === n; i++) await p.waitForTimeout(100); await p.waitForTimeout(800); await settle(p); return sent[n] || ''; };
const saved = async tid => (await db('get', 'trips/' + tid)).data;
const byTitle = list => Object.fromEntries((list || []).map(i => [i.title, i]));
const section = (req, head, next) => (req.split(head)[1] || '').split(next)[0];
const FIX = 'Fixed commitments', REST = 'Also already on the plan', GONE = 'The crew removed these';

// —— a trip with every kind of stop ——
const D1 = '2026-12-04', D2 = '2026-12-05', PLANNER = 'u_pln0' + r;
await claim(PLANNER);
const tid = await plan('friends', 'trip', { lockedDates: { start: D1, end: '2026-12-06' }, people: { [uid]: true, [PLANNER]: true }, itinerary: [
  { id: 'a1', date: D1, time: '10:00', title: 'AI Brunch', kind: 'food', note: '', ai: true },
  { id: 'a2', date: D1, time: '14:00', title: 'AI Museum', kind: 'activity', note: '', ai: true },
  { id: 'a3', date: D2, time: '19:00', title: 'AI Dinner', kind: 'food', note: '', ai: true },
  { id: 'a4', date: D1, time: '22:00', title: 'AI Bar', kind: 'nightlife', note: '', ai: true },
  { id: 'p1', date: D1, time: '22:30', title: 'Club Vault', kind: 'nightlife', note: 'pick', src: 'pick' },
  { id: 'm1', date: D2, time: '17:00', title: 'Game at Ball Arena', kind: 'plan', note: '' },
  { id: 'L1', date: D1, time: '12:30', title: 'Old Taco Spot', kind: 'food', note: '' }, // from before stops recorded where they came from
  { id: 's1', date: D2, time: '21:00', title: 'Surprise cake', kind: 'plan', note: '', secret: true },
  { id: 's2', date: D2, time: '23:00', title: 'Secret karaoke', kind: 'plan', note: '', secret: true }] });
await db('set', `trips/${tid}/members/${PLANNER}`, { nick: 'Pat', status: 'in', days: [], updatedAt: Date.now() });
await open(tid, 'plan', 'plan');
const edit = async (id, { title, time }) => {
  await p.locator(`[data-edititem="${id}"]`).dispatchEvent('click'); await settle(p);
  if (title) await p.fill('#ei-title', title); if (time) await p.fill('#ei-time', time);
  await p.locator('#editItemForm [type=submit]').click(); await p.waitForTimeout(900); await settle(p);
};
await edit('a1', { title: 'Brunch at Snooze' });   // renamed only
await edit('a3', { time: '20:30' });               // moved
await p.locator('[data-delitem="a4"]').dispatchEvent('click'); await p.waitForTimeout(900); await settle(p); // deleted
await p.locator('[data-delitem="s2"]').dispatchEvent('click'); await p.waitForTimeout(900); await settle(p); // a surprise, deleted
{ const t = await saved(tid), it = byTitle(t.itinerary);
  expect('renaming an AI stop records the rename (and only that)', JSON.stringify(it['Brunch at Snooze']?.edited) === '{"title":true}' && it['Brunch at Snooze'].ai === true, JSON.stringify(it['Brunch at Snooze']));
  expect('moving an AI stop records the move (and only that)', JSON.stringify(it['AI Dinner']?.edited) === '{"time":true}' && it['AI Dinner'].time === '20:30', JSON.stringify(it['AI Dinner']));
  expect('the other AI stops aren’t marked as edited', !it['AI Museum'].edited);
  expect('a deleted stop is remembered by name; a deleted surprise isn’t written where the guest of honor could read it', JSON.stringify(t.dropped) === '["AI Bar"]', JSON.stringify(t.dropped)); }

// —— the redraft ——
{
  const draft = { days: [{ date: D1, items: [{ time: '22:00', title: 'AI Bar', kind: 'nightlife', note: '' }, { time: '13:00', title: 'New Lunch', kind: 'food', note: '' }] }, { date: D2, items: [{ time: '11:00', title: 'Red Rocks hike', kind: 'activity', note: '' }] }] };
  const req = await ask('plan', draft), fixed = section(req, FIX, REST), rest = section(req, REST, GONE), gone = section(req, GONE, 'Arrival');
  expect('the redraft request holds the typed-in game and the moved dinner at their times', fixed.includes(`- ${D2} 17:00: Game at Ball Arena`) && fixed.includes(`- ${D2} 20:30: AI Dinner`) && fixed.includes(`- ${D2} 21:00: Surprise cake`), fixed.trim());
  expect('…keeps the renamed brunch, the pick and the older stop as already on the plan, not fixed', rest.includes('Brunch at Snooze') && rest.includes('Club Vault') && rest.includes('Old Taco Spot') && !fixed.includes('Brunch at Snooze') && !fixed.includes('Club Vault') && !fixed.includes('Old Taco Spot'), rest.trim());
  expect('…tells the AI not to add the deleted bar back, and doesn’t list the untouched AI museum', gone.includes('AI Bar') && !req.includes('AI Museum') && !req.includes('Secret karaoke'), gone.trim());
  const it = byTitle((await saved(tid)).itinerary);
  expect('after the redraft: the untouched AI stop is replaced', !it['AI Museum'] && it['New Lunch']?.ai && it['Red Rocks hike']?.ai, Object.keys(it).join(', '));
  expect('…the renamed and moved stops survive with their edits', it['Brunch at Snooze']?.time === '10:00' && it['AI Dinner']?.time === '20:30' && it['AI Dinner'].date === D2);
  expect('…the game, the pick, the older stop and the surprise are untouched', it['Game at Ball Arena']?.time === '17:00' && it['Club Vault']?.time === '22:30' && !it['Club Vault'].edited && it['Old Taco Spot'] && it['Surprise cake']?.secret);
  expect('…and the deleted bar didn’t come back, though the AI suggested it', !it['AI Bar'] && !it['Secret karaoke']);
}
// “Remove AI items” clears only untouched AI stops
await open(tid, 'plan', 'plan');
await p.locator('[data-act=clearAI]').dispatchEvent('click'); await p.waitForTimeout(900);
{ const it = byTitle((await saved(tid)).itinerary); expect('“Remove AI items” keeps edited AI stops', !it['New Lunch'] && !it['Red Rocks hike'] && it['Brunch at Snooze'] && it['AI Dinner'], Object.keys(it).join(', ')); }

// —— the hangover replan follows the same rules ——
{
  await db('update', 'trips/' + tid, { itinerary: [...(await saved(tid)).itinerary, { id: 'a5', date: D1, time: '15:00', title: 'AI Rooftop', kind: 'nightlife', note: '', ai: true }], hangover: { [D1]: { [uid]: 4 } } });
  await open(tid, 'live', 'live');
  const req = await ask('hangPlan', { note: 'Rough.', items: [{ time: '12:00', title: 'Recovery brunch', kind: 'food', note: '' }, { time: '22:00', title: 'AI Bar', kind: 'nightlife', note: '' }] });
  const today = (req.split("Today's plan")[1] || '').split(FIX)[0].split(REST)[0];
  expect('the hangover replan only offers the day’s untouched AI stop to rewrite', today.includes('AI Rooftop') && !/Brunch at Snooze|Club Vault|Old Taco Spot/.test(today), today.trim());
  expect('…and lists the edited brunch, the pick and the older stop as already on the plan, and the deleted bar as removed', section(req, REST, GONE).includes('Brunch at Snooze') && section(req, REST, GONE).includes('Club Vault') && section(req, GONE, 'Reply').includes('AI Bar'), section(req, REST, 'Reply').trim());
  await p.locator('[data-act=hangApply]').dispatchEvent('click'); await p.waitForTimeout(900);
  const it = byTitle((await saved(tid)).itinerary);
  expect('after the replan: the AI stop is rewritten, everything a person added or changed stays, the deleted bar stays gone', !it['AI Rooftop'] && it['Recovery brunch'] && it['Brunch at Snooze'] && it['Club Vault'] && it['Old Taco Spot'] && !it['AI Bar'], Object.keys(it).join(', '));
}

// —— undoing the delete brings it back and lets the AI suggest it again ——
{
  await open(tid, 'home', 'log');
  await p.locator('.log-row', { hasText: 'AI Bar removed from the plan' }).locator('[data-undo]').dispatchEvent('click'); await p.waitForTimeout(1200);
  const t = await saved(tid);
  expect('undoing the delete puts the bar back and takes it off the removed list', byTitle(t.itinerary)['AI Bar'] && !(t.dropped || []).includes('AI Bar'), JSON.stringify(t.dropped));
}

// —— a surprise, seen by the guest of honor ——
{
  await db('update', 'trips/' + tid, { honoree: uid, mode: 'birthday' }); // Rae is now the birthday star
  await open(tid, 'plan', 'plan');
  const req = await ask('plan', { days: [{ date: D2, items: [{ time: '21:00', title: 'Late show', kind: 'activity', note: '' }] }] });
  expect('the guest of honor’s redraft holds the surprise’s slot without naming it', section(req, FIX, REST).includes(`- ${D2} 21:00: Surprise`) && !req.includes('Surprise cake') && !req.includes('Secret karaoke'), section(req, FIX, REST).trim());
  const other = byTitle((await asOther(PLANNER, 'trips/' + tid)).data?.itinerary);
  expect('…and after they save it, the real surprise is still in the plan for the planners', other['Surprise cake']?.secret && other['Surprise cake'].time === '21:00', Object.keys(other).join(', '));
}

// —— small plans ——
const NIGHTLY = /Daytime is for|At sunrise|Sleeping it off/;
for (const mode of ['friends', 'couples', 'birthday']) {
  const t = await plan(mode, 'hangout'); await open(t, 'plan', 'spots');
  const qs = (await p.locator('.q b').allInnerTexts()).join('|'), os = (await p.locator('.q [data-quiz]').allInnerTexts()).join('|');
  expect(`${mode} hangout: evening questions, nothing about daytime or sunrise`, qs === 'Perfect night out?|What’s playing?|You head home…|Spending style' && os.includes('Around midnight') && !NIGHTLY.test(qs + os), qs);
}
{ const t = await plan('friends', 'day'); await open(t, 'plan', 'spots');
  const qs = (await p.locator('.q b').allInnerTexts()).join('|'); expect('friends day out: questions about the day, not a night out', qs === 'The day is for…|And after?|Spending style', qs); }
for (const size of ['weekend', 'trip']) {
  const t = await plan('friends', size); await open(t, 'plan', 'spots');
  const qs = (await p.locator('.q b').allInnerTexts()).join('|'); expect(`friends ${size}: the original five questions`, qs === 'Perfect night out?|What’s playing?|You head home…|Spending style|Daytime is for…', qs);
}
{ const t = await plan('family', 'hangout'); await open(t, 'plan', 'spots');
  expect('family dinner: still the meal questions', (await p.locator('.q b').allInnerTexts()).join('|') === 'What kind of meal?|And after?|Spending style'); }
{ const t = await plan('work', 'day'); await open(t, 'plan', 'spots');
  expect('team outing: still the outing questions', (await p.locator('.q b').allInnerTexts())[0] === 'Best kind of team outing?'); }

expect('no page errors', !errs.length, errs.join('; '));
for (const t of tids) await fetch(`${BASE}/api/plans/${t}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

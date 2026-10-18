// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Plan type × plan size, after small plans got types (Task 27): every type gets small-plan framing
// that isn't a trip; family and team quizzes fit a dinner or a day out; family and work itineraries
// can't get nightlife stops (in the request or in what's saved); stops the crew typed in are sent
// to every AI itinerary request as commitments and kept; and a new small birthday plan doesn't
// cover the birthday star until someone turns it on. Friends plans and old plans stay as they were.
import { claim, install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 220) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const c = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
// the AI is "on"; every prompt is recorded, and `reply` is what the next request gets back
const sent = []; let reply = {};
await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
await c.route('**/api/ai', r => { const x = JSON.parse(r.request().postData() || '{}'); sent.push(typeof x.input === 'string' ? x.input : JSON.stringify(x.input)); r.fulfill({ json: { text: JSON.stringify(reply), truncated: false } }); });
const db = (op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
await p.goto(BASE + '/'); await p.fill('#join-name', 'Rae'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), tids = [];

const START = '2026-12-04', DAYS = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08'];
// a plan as saved data (disposable): an idea or city to go with, and every day free
async function plan(mode, size, extra = {}) {
  const tid = 'ts' + r + tids.length; tids.push(tid); const small = size === 'hangout' || size === 'day';
  await db('set', 'trips/' + tid, { name: `${mode || 'none'} ${size}`, size, ...(mode === undefined ? {} : { mode }), nights: small ? 0 : 2, city: 'Denver', currency: 'USD', winStart: DAYS[0], winEnd: DAYS[7],
    destinations: [{ id: 'd1', city: small ? 'Union Station' : 'Denver' }], lockedDest: 'd1', itinerary: [], people: { [uid]: true }, createdBy: uid, createdAt: Date.now(), ...extra });
  await db('set', `trips/${tid}/members/${uid}`, { nick: 'Rae', status: 'in', days: DAYS, quiz: {}, updatedAt: Date.now() });
  return tid;
}
async function open(tid, sec, tab) {
  await p.goto(`${BASE}/#${tid}`); await settle(p);
  // the first open right after joining sometimes lands before the plan list has loaded: reload once
  if (!(await p.waitForSelector('.bottomnav, [data-act=setupLater]', { timeout: 8000 }).catch(() => null))) { await p.reload(); await settle(p); await p.waitForSelector('.bottomnav, [data-act=setupLater]'); }
  await p.waitForTimeout(500);
  if (await p.locator('[data-act=setupLater]').count()) { await p.click('[data-act=setupLater]'); await settle(p); }
  await p.click(`.bottomnav [data-sec=${sec}]`); await settle(p); await p.click(`.subtab[data-tab=${tab}]`); await settle(p);
}
const ask = async (act, data = {}) => { reply = data; const n = sent.length; await p.locator(`[data-act=${act}]`).first().dispatchEvent('click'); for (let i = 0; i < 40 && sent.length === n; i++) await p.waitForTimeout(100); await p.waitForTimeout(700); await settle(p); return sent[n] || ''; };
const questions = () => p.locator('.q b').allInnerTexts();
const options = () => p.locator('.q [data-quiz]').allInnerTexts();
const saved = async tid => (await db('get', 'trips/' + tid)).data;
const typeLine = s => (s.match(/(Plan|Trip) type: .*/) || [])[0] || '';

// —— 1. framing: every type, small and large ——
const SMALL_AI = { bachelorette: 'A bachelorette night or day out', bachelor: 'A bachelor night or day out', birthday: 'A birthday plan, built around one special meal or night out', couples: 'A plan for a few couples', family: 'A family outing', college: 'A cheap night or day out for students', festival: 'A plan built around a concert or festival', sports: 'A plan built around a game', work: 'A work team outing' };
for (const [mode, line] of Object.entries(SMALL_AI)) {
  const tid = await plan(mode, mode === 'festival' ? 'day' : 'hangout');
  await open(tid, 'plan', 'match'); const pitch = await ask('genPitches');
  expect(`${mode}, small: pitched as “${line}…”, never as a trip`, pitch.includes(line) && !/\btrips?\b|offsite|several couples|getaway/i.test(pitch), typeLine(pitch) + ' | ' + ((pitch.match(/\btrips?\b|offsite|several couples|getaway/i) || [])[0] || ''));
}
for (const [mode, line] of Object.entries({ couples: 'A trip with several couples', birthday: 'A birthday trip', festival: 'A trip built around a music festival', sports: 'A trip built around a sports game', work: 'A work team offsite', family: 'A family trip with mixed ages' })) {
  const tid = await plan(mode, 'trip');
  await open(tid, 'plan', 'match'); const pitch = await ask('genPitches');
  expect(`${mode}, trip: keeps its trip framing (“${line}”)`, pitch.includes(line), typeLine(pitch));
}
{ const tid = await plan('friends', 'hangout'); await open(tid, 'plan', 'match'); const pitch = await ask('genPitches');
  expect('friends hangout: pitch unchanged (no type line, friend group, original mix)', /Plan type: one evening out or in\.\n/.test(pitch) && /to a friend group/.test(pitch) && /mix a dinner-and-drinks night/.test(pitch), typeLine(pitch)); }

// —— 2. questions that fit the size ——
{ const tid = await plan('family', 'hangout'); await open(tid, 'plan', 'spots');
  const qs = await questions(), os = await options();
  expect('family dinner: meal questions, nothing about days, evenings or theme parks', qs.join('|') === 'What kind of meal?|And after?|Spending style' && !os.some(o => /theme park|pool|beach/i.test(o)), qs.join('|'));
  await p.locator('.q').first().locator('[data-quiz]').first().click(); await p.waitForTimeout(700); await settle(p);
  const spots = await ask('spots');
  expect('family dinner: picks ask for places to eat for all ages, with the dinner answers', /mostly places to eat that work for all ages/.test(spots) && /What kind of meal\? 100% Casual & kid-friendly/.test(spots) && !/Days are for|theme park|trip days/i.test(spots), (spots.match(/Give 9 .*/) || [])[0]); }
{ const tid = await plan('family', 'day'); await open(tid, 'plan', 'spots');
  const qs = await questions(); expect('family day out: questions about the one day', qs.join('|') === 'The day is for…|Ideal pace?|Spending style' && !(await options()).includes('Packed days'), qs.join('|')); }
{ const tid = await plan('family', 'weekend'); await open(tid, 'plan', 'spots');
  const qs = await questions(); expect('family weekend: the family trip questions, as before', qs.join('|') === 'Ideal pace?|Days are for…|Evenings are for…|Spending style', qs.join('|')); }
{ const tid = await plan('work', 'hangout'); await open(tid, 'plan', 'spots');
  const qs = await questions(); expect('team lunch: outing questions, not work sessions or evenings', qs.join('|') === 'Best kind of team outing?|The vibe?|Spending style', qs.join('|'));
  const spots = await ask('spots');
  expect('team lunch: picks are for a team outing, not an offsite', /places for a work team outing for an evening/.test(spots) && /restaurants that take group bookings/.test(spots) && !/offsite/i.test(spots), spots.slice(0, 120)); }
{ const tid = await plan('work', 'trip'); await open(tid, 'plan', 'spots');
  const qs = await questions(); expect('team offsite: the offsite questions, as before', qs[0] === 'Best team activity?' && qs[1] === 'Work vs team time?', qs.join('|'));
  const spots = await ask('spots'); expect('team offsite: picks for an offsite, as before', /places for a work team offsite for a group trip/.test(spots)); }
{ const tid = await plan('friends', 'hangout'); await open(tid, 'plan', 'spots');
  expect('friends hangout: the friends evening questions (Task 29)', (await questions()).join('|') === 'Perfect night out?|What’s playing?|You head home…|Spending style'); }

// —— 3. itinerary stop kinds ——
const draft = days => ({ days: days.map(([date, kind, title]) => ({ date, items: [{ time: '20:00', title, kind, note: '' }] })) });
for (const [mode, kinds] of [['family', 'food|activity|travel|chill'], ['work', 'food|activity|work|travel|chill'], ['friends', 'food|activity|nightlife|travel|chill']]) {
  const tid = await plan(mode, 'trip', { lockedDates: { start: START, end: '2026-12-06' } });
  await open(tid, 'plan', 'plan');
  const req = await ask('plan', draft([[START, 'nightlife', 'Late Club'], ['2026-12-05', 'work', 'Strategy session']]));
  const it = Object.fromEntries(((await saved(tid)).itinerary || []).map(i => [i.title, i.kind]));
  const shown = await p.locator('.tline', { hasText: 'Late Club' }).first().innerText().catch(() => '');
  if (mode === 'friends') expect('friends trip: the request offers nightlife and a nightlife stop stays one', req.includes(`"kind":"${kinds}"`) && it['Late Club'] === 'nightlife', JSON.stringify(it));
  else expect(`${mode} trip: the request offers ${kinds} (no nightlife), and a nightlife reply is saved and shown as chill`, req.includes(`"kind":"${kinds}"`) && !/nightlife/i.test(req) && it['Late Club'] === 'chill' && /chill/i.test(shown) && !/nightlife/i.test(shown), `${(req.match(/"kind":"[^"]*"/g) || []).pop()} ${JSON.stringify(it)}`);
  if (mode === 'work') expect('team offsite: work sessions are a stop kind', it['Strategy session'] === 'work');
  if (mode === 'family') expect('family trip: a work stop isn’t one of its kinds, so it becomes an activity', it['Strategy session'] === 'activity');
}
{ const tid = await plan('family', 'hangout', { lockedDates: { start: START, end: START } }); await open(tid, 'plan', 'plan');
  reply = { items: [{ time: '19:00', title: 'Bar Nine', kind: 'nightlife', note: '' }] };
  const req = await ask('plan', reply), it = (await saved(tid)).itinerary || [];
  expect('family dinner: the plan request offers food|activity|chill, and a nightlife reply is saved as chill', req.includes('"kind":"food|activity|chill"') && it[0]?.kind === 'chill', `${(req.match(/"kind":"[^"]*"/) || [])[0]} ${it[0]?.kind}`); }

// —— 4. stops the crew typed in reach the AI as commitments and stay ——
{
  const tid = await plan('sports', 'trip', { lockedDates: { start: START, end: '2026-12-06' }, itinerary: [
    { id: 'pk1', date: START, time: '22:30', title: 'Club Vault', kind: 'nightlife', note: 'x', src: 'pick' },
    { id: 'ai1', date: START, time: '12:00', title: 'AI Lunch', kind: 'food', note: '', ai: true }] });
  await open(tid, 'plan', 'plan');
  await p.fill(`#ai-title-${START}`, 'Nuggets game at Ball Arena'); await p.fill(`#ai-time-${START}`, '19:00'); await p.locator(`.addItem[data-date="${START}"] [type=submit]`).click(); await p.waitForTimeout(900); await settle(p);
  const typed = ((await saved(tid)).itinerary || []).find(i => i.title === 'Nuggets game at Ball Arena');
  expect('a stop typed in is saved as a plain stop (kind plan, not AI)', typed && typed.kind === 'plan' && !typed.ai && typed.time === '19:00', JSON.stringify(typed));
  const req = await ask('plan', draft([[START, 'food', 'Pre-game BBQ']]));
  const fixed = (req.split('Fixed commitments')[1] || '').split('Also already on the plan')[0], rest = (req.split('Also already on the plan')[1] || '').split('Arrival')[0];
  expect('the itinerary request lists the typed-in game as a fixed commitment, with its time', /keep them exactly as they are/.test(req) && fixed.includes(`- ${START} 19:00: Nuggets game at Ball Arena`), fixed.slice(0, 200));
  expect('…an added pick as already on the plan (not frozen), and not the AI stop it will replace', !fixed.includes('Club Vault') && rest.includes('Club Vault') && !req.includes('AI Lunch'), rest.slice(0, 160));
  const after = Object.fromEntries(((await saved(tid)).itinerary || []).map(i => [i.title, `${i.time} ${i.kind}${i.ai ? ' ai' : ''}`]));
  expect('…and after the redraft the game and the pick are kept as they were, the old AI stop replaced', after['Nuggets game at Ball Arena'] === '19:00 plan' && after['Club Vault'] === '22:30 nightlife' && !after['AI Lunch'] && after['Pre-game BBQ'] === '20:00 food ai', JSON.stringify(after));
  // the hangover replan rewrites the day but keeps the game
  await db('update', 'trips/' + tid, { hangover: { [START]: { [uid]: 4 } } });
  await open(tid, 'live', 'live');
  reply = { note: 'Rough.', items: [{ time: '11:00', title: 'Recovery brunch', kind: 'food', note: '' }] };
  const hreq = await ask('hangPlan', reply); await p.locator('[data-act=hangApply]').dispatchEvent('click'); await p.waitForTimeout(900);
  const h = Object.fromEntries(((await saved(tid)).itinerary || []).filter(i => i.date === START).map(i => [i.title, i.time]));
  expect('the hangover replan is told the game is fixed, and keeps it and the added pick (Task 29) while rewriting the AI stops', /Fixed commitments[\s\S]*Nuggets game at Ball Arena/.test(hreq) && !hreq.split('Fixed commitments')[0].includes('Nuggets') && h['Nuggets game at Ball Arena'] === '19:00' && h['Recovery brunch'] === '11:00' && h['Club Vault'] === '22:30', JSON.stringify(h));
}
{ const tid = await plan('friends', 'hangout', { lockedDates: { start: START, end: START }, itinerary: [{ id: 'm1', date: START, time: '18:30', title: 'Table at Tavernetta', kind: 'plan', note: 'booked' }] });
  await open(tid, 'plan', 'plan');
  const req = await ask('plan', { items: [{ time: '21:00', title: 'Dessert', kind: 'food', note: '' }] });
  const it = (await saved(tid)).itinerary || [];
  expect('a hangout plan request lists the booked table as a commitment, and keeps it', req.includes(`- ${START} 18:30: Table at Tavernetta (booked)`) && /Fixed commitments/.test(req) && it.some(i => i.title === 'Table at Tavernetta' && i.time === '18:30') && it.some(i => i.title === 'Dessert'), JSON.stringify(it.map(i => i.title))); }

// —— 5. guest-of-honor coverage default ——
async function createUI(sz, mode) {
  if (await p.locator('[data-act=home]').count()) { await p.locator('[data-act=home]').first().dispatchEvent('click'); await settle(p); }
  await p.click('[data-act=newTrip]'); await settle(p); await p.click(`[data-size=${sz}]`); await settle(p); await p.click(`[data-mode=${mode}]`); await settle(p);
  await p.fill('#nt-name', `${mode} ${sz}`); if (await p.locator('#nt-city').count()) await p.fill('#nt-city', 'Denver');
  await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); const tid = (await p.evaluate(() => location.hash)).slice(1); tids.push(tid); return tid;
}
{
  const DEV = 'u_dev0' + r; await claim(DEV);
  const tid = await createUI('hangout', 'birthday');
  expect('a new birthday hangout doesn’t cover the birthday star by default', (await saved(tid)).honoreeFree === false);
  await db('set', `trips/${tid}/members/${DEV}`, { nick: 'Dev', status: 'in', days: [], updatedAt: Date.now() });
  await db('update', 'trips/' + tid, { people: { [uid]: true, [DEV]: true } });
  await db('update', `trips/${tid}/members/${uid}`, { status: 'in' });
  await open(tid, 'home', 'settings'); await p.selectOption('#set-honoree', DEV); await p.waitForTimeout(900); await settle(p);
  expect('…Settings shows “pays nothing” unchecked once Dev is picked', !(await p.locator('#set-free').isChecked()));
  await db('set', `trips/${tid}/expenses/e1`, { title: 'Dinner', amount: 90, paidBy: uid, split: [uid, DEV], by: uid, at: Date.now() });
  const owes = async () => { await open(tid, 'money', 'money'); return (await p.locator('body').innerText()).replace(/\n+/g, ' | '); };
  const food = async () => { await open(tid, 'money', 'cost'); return (await p.locator('.cost-row', { hasText: 'Food' }).first().innerText()).replace(/\n+/g, ' | '); };
  { const t = await owes(), f = await food(); expect('…so Dev owes half the dinner, and the cost card counts $45 a head', /Dev[^|]*\$45/.test(t) && /\$45\b/.test(f), `${(t.match(/Dev[^|]*\$\d+/) || [])[0]} / ${f}`); }
  await open(tid, 'home', 'settings'); await p.locator('#set-free').check(); await p.waitForTimeout(900);
  expect('turning it on is saved', (await saved(tid)).honoreeFree === true);
  { const t = await owes(), f = await food(); expect('…then Dev owes nothing and the cost card counts the $90 for the one who pays', !/Dev[^|]*\$45/.test(t) && /\$90\b/.test(f), f); }
}
{ const tid = await createUI('weekend', 'birthday'); expect('a new birthday weekend still covers the birthday star by default (unchanged)', (await saved(tid)).honoreeFree === true); }
{ const tid = await createUI('hangout', 'bachelorette'); expect('a new bachelorette hangout keeps the default as before', (await saved(tid)).honoreeFree === true); }

// —— 6. old small plans ——
for (const [label, mode] of [['no type', undefined], ['an unknown type', 'retreat']]) {
  const tid = await plan(mode, 'hangout'); await open(tid, 'plan', 'match');
  const pitch = await ask('genPitches'); await p.click('.subtab[data-tab=spots]'); await settle(p);
  expect(`an old hangout with ${label} stays a friends plan`, /Plan type: one evening out or in\.\n/.test(pitch) && /to a friend group/.test(pitch) && (await questions())[0] === 'Perfect night out?' && JSON.stringify((await saved(tid)).mode) === JSON.stringify(mode), typeLine(pitch));
}

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

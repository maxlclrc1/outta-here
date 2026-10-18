// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Small plans (hangouts and days out) pick a type like weekends and trips do: a family dinner, a
// team lunch and a birthday night out get their own wording, questions and AI framing; a friends
// hangout stays as it was; small plans saved without a type (or with one the app doesn't know)
// stay friends plans. A birthday doesn't assume a guest of honor until someone is picked. Checks
// the creation screens, the saved plan, the questions shown and the AI requests sent.
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
await c.route('**/api/ai', r => { const x = JSON.parse(r.request().postData() || '{}'); sent.push(typeof x.input === 'string' ? x.input : JSON.stringify(x.input)); r.fulfill({ json: { text: '{"items":[],"pitches":[]}', truncated: false } }); });
const db = (op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
await p.goto(BASE + '/'); await p.fill('#join-name', 'Rae'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid), tids = [];

const home = async () => { if (await p.locator('[data-act=home]').count()) { await p.locator('[data-act=home]').first().dispatchEvent('click'); await settle(p); } };
// through the real creation screens; returns the type labels the picker showed, and the new plan
async function create(sz, mode, name) {
  await home(); await p.click('[data-act=newTrip]'); await settle(p); await p.click(`[data-size=${sz}]`); await settle(p);
  const labels = await p.locator('[data-mode] b').allInnerTexts();
  await p.click(`[data-mode=${mode}]`); await settle(p);
  const chip = (await p.locator('.mode-chip').first().textContent()).trim();
  await p.fill('#nt-name', name); await p.fill('#nt-city', 'Denver'); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup');
  return { labels, chip, tid: await finish((await p.evaluate(() => location.hash)).slice(1)) };
}
// an idea to vote on and every day in the window free, so pitches and picks can be asked for
async function finish(tid) {
  tids.push(tid);
  const t = (await db('get', 'trips/' + tid)).data, days = []; for (let d = new Date(t.winStart + 'T00:00Z'); d <= new Date(t.winEnd + 'T00:00Z'); d = new Date(+d + 864e5)) days.push(d.toISOString().slice(0, 10));
  await db('update', 'trips/' + tid, { destinations: [{ id: 'd1', city: 'Union Station' }], lockedDest: 'd1' });
  await db('update', `trips/${tid}/members/${uid}`, { days, status: 'in' });
  return tid;
}
async function open(tid, sec, tab) {
  await p.goto(`${BASE}/#${tid}`); await settle(p); await p.waitForTimeout(500);
  if (await p.locator('[data-act=setupLater]').count()) { await p.click('[data-act=setupLater]'); await settle(p); }
  await p.click(`.bottomnav [data-sec=${sec}]`); await settle(p); await p.click(`.subtab[data-tab=${tab}]`); await settle(p);
}
const ask = async act => { const n = sent.length; await p.locator(`[data-act=${act}]`).first().dispatchEvent('click'); for (let i = 0; i < 40 && sent.length === n; i++) await p.waitForTimeout(100); await settle(p); return sent[n] || ''; };
const questions = () => p.locator('.q b').allInnerTexts();
const saved = async tid => (await db('get', 'trips/' + tid)).data;
const FRIENDS_Q = 'Perfect night out?|What’s playing?|You head home…|Spending style|Daytime is for…';
const PARTY = /friend group|dinner-and-drinks|karaoke|nightlife|Perfect night out|adults|trip/i;

// —— family dinner (a hangout) ——
{
  const { labels, chip, tid } = await create('hangout', 'family', 'Sunday dinner');
  expect('the hangout type picker offers the same types, worded for a small plan', labels.includes('Friends') && labels.includes('Family') && labels.includes('Team outing') && labels.includes('Birthday') && labels.length === 10 && !labels.some(l => / trip$/.test(l)), labels.join(', '));
  expect('family dinner: the form shows the chosen type', chip === 'Family', chip);
  const t = await saved(tid); expect('family dinner: saved as a family hangout (type and size kept apart)', t.mode === 'family' && t.size === 'hangout', `${t.mode} ${t.size}`);
  await open(tid, 'plan', 'match');
  const pitch = await ask('genPitches');
  expect('family dinner: pitches go to a family group, as a family outing, with a family vibe and mix', /pitching plans to a family group/.test(pitch) && /one evening out or in \(Family\. A family outing with mixed ages/.test(pitch) && /Vibe: relaxed and family-friendly/.test(pitch) && /a relaxed family meal/.test(pitch), (pitch.match(/Plan type: .*/) || [])[0]);
  expect('family dinner: no friend-group, party or trip framing', !PARTY.test(pitch), (pitch.match(PARTY) || [])[0]);
  await p.click('.subtab[data-tab=spots]'); await settle(p);
  expect('family dinner: the family questions', (await questions()).join('|') === 'Ideal pace?|Days are for…|Evenings are for…|Spending style', (await questions()).join('|'));
  const spots = await ask('spots');
  expect('family dinner: the AI context says an evening with family, people of mixed ages', /Plan type: one evening out with family\. Family\. A family outing/.test(spots) && /Group size: 1 people of mixed ages, possibly kids/.test(spots) && /local guide finding family-friendly places for an evening/.test(spots), (spots.match(/Plan type: .*/) || [])[0]);
  // size and type stay separate: making it a weekend keeps the type
  await p.click('.bottomnav [data-sec=home]').catch(() => {}); await open(tid, 'home', 'settings');
  await p.locator('[data-setsize=weekend]').dispatchEvent('click'); await p.waitForTimeout(900);
  const t2 = await saved(tid); expect('family dinner → weekend in Settings keeps it a family plan', t2.mode === 'family' && t2.size === 'weekend', `${t2.mode} ${t2.size}`);
}

// —— team lunch (a day out) ——
{
  const { chip, tid } = await create('day', 'work', 'Team lunch');
  const t = await saved(tid); expect('team lunch: saved as a work day out, shown as “Team outing”', t.mode === 'work' && t.size === 'day' && chip === 'Team outing', `${t.mode} ${t.size} ${chip}`);
  await open(tid, 'plan', 'match');
  const pitch = await ask('genPitches');
  expect('team lunch: pitches go to a work team, as a team outing, with a team mix', /pitching plans to a work team/.test(pitch) && /a full day out \(Team outing\. A work team outing/.test(pitch) && /a team lunch or dinner, a group activity/.test(pitch) && /Vibe: professional but fun/.test(pitch), (pitch.match(/Plan type: .*/) || [])[0]);
  expect('team lunch: no friend-group, party or “offsite” trip framing', !PARTY.test(pitch) && !/offsite/i.test(pitch), (pitch.match(/friend group|dinner-and-drinks|karaoke|nightlife|Perfect night out|adults|trip|offsite/i) || [])[0]);
  await p.click('.subtab[data-tab=spots]'); await settle(p);
  expect('team lunch: the team questions', (await questions())[0] === 'Best team activity?');
  const spots = await ask('spots');
  expect('team lunch: the AI context says a day out with colleagues', /Plan type: a day out with colleagues\. Team outing\./.test(spots) && /Group size: 1 colleagues/.test(spots), (spots.match(/Plan type: .*/) || [])[0]);
}

// —— birthday night out (a hangout) ——
{
  const { chip, tid } = await create('hangout', 'birthday', 'Dev’s birthday');
  let t = await saved(tid); expect('birthday night out: saved as a birthday hangout, no guest of honor yet', t.mode === 'birthday' && t.size === 'hangout' && chip === 'Birthday' && !t.honoree, `${t.mode} ${t.size} ${chip} ${t.honoree}`);
  await open(tid, 'plan', 'match');
  const pitch = await ask('genPitches');
  expect('birthday night out: pitches say it’s a birthday plan (friends, social vibe)', /one evening out or in \(Birthday\. A birthday plan, built around one special meal or night out/.test(pitch) && /to a friend group/.test(pitch) && /Vibe: fun, social/.test(pitch), (pitch.match(/Plan type: .*/) || [])[0]);
  await open(tid, 'home', 'overview');
  expect('…and nobody is nagged to choose a birthday star', !/Choose the birthday star/.test(await p.locator('body').innerText()));
  await open(tid, 'money', 'meter');
  expect('…and with nobody picked, nobody is covered', !/You’re covered/.test(await p.locator('body').innerText()));
  await open(tid, 'home', 'settings');
  const s = await p.locator('body').innerText();
  expect('Settings shows the type and the optional birthday star for a hangout', /Type/.test(s) && /The birthday star/.test(s) && (await p.locator('#set-honoree').inputValue()) === '', '');
  await p.selectOption('#set-honoree', uid); await p.waitForTimeout(900);
  t = await saved(tid); expect('picking the birthday star works on a hangout, covered by default as in trips', t.honoree === uid && t.honoreeFree !== false);
  await open(tid, 'money', 'meter');
  expect('…and they’re told they’re covered', /You’re covered/.test(await p.locator('body').innerText()));
}

// —— friends hangout: as before ——
{
  const { chip, tid } = await create('hangout', 'friends', 'Friday tacos');
  const t = await saved(tid); expect('friends hangout: saved as friends, shown as “Friends”', t.mode === 'friends' && t.size === 'hangout' && chip === 'Friends');
  await open(tid, 'plan', 'match');
  const pitch = await ask('genPitches');
  expect('friends hangout: the original pitch request (friend group, “fun, social”, dinner-and-drinks mix, no type line)', /pitching plans to a friend group/.test(pitch) && /Plan type: one evening out or in\.\n/.test(pitch) && /Vibe: fun, social\n/.test(pitch) && /mix a dinner-and-drinks night, an activity \(bowling, karaoke, a class, a show\)/.test(pitch), (pitch.match(/Plan type: .*/) || [])[0]);
  await p.click('.subtab[data-tab=spots]'); await settle(p);
  expect('friends hangout: the original five questions', (await questions()).join('|') === FRIENDS_Q);
  const spots = await ask('spots');
  expect('friends hangout: the original context (with friends, adults)', /Plan type: one evening out with friends\. \n/.test(spots) && /Group size: 1 adults/.test(spots), (spots.match(/Plan type: .*/) || [])[0]);
}

// —— small plans saved before types existed ——
for (const [label, extra] of [['no type', {}], ['an unknown type', { mode: 'retreat' }], ['“friends”', { mode: 'friends' }]]) {
  const tid = 'st' + Math.random().toString(36).slice(2, 10);
  await db('set', 'trips/' + tid, { name: 'Old hangout', size: 'hangout', city: 'Denver', nights: 0, winStart: '2026-12-01', winEnd: '2026-12-06', destinations: [], itinerary: [], people: { [uid]: true }, createdBy: uid, createdAt: Date.now(), ...extra });
  await db('set', `trips/${tid}/members/${uid}`, { nick: 'Rae', status: 'in', days: [], updatedAt: Date.now() });
  await finish(tid); await open(tid, 'plan', 'match');
  const pitch = await ask('genPitches');
  await p.click('.subtab[data-tab=spots]'); await settle(p);
  const qs = await questions();
  expect(`an old hangout with ${label} keeps the friends pitch request and questions`, /pitching plans to a friend group/.test(pitch) && /Plan type: one evening out or in\.\n/.test(pitch) && qs.join('|') === FRIENDS_Q, (pitch.match(/Plan type: .*/) || [])[0]);
  await open(tid, 'home', 'settings');
  expect('…Settings shows it as Friends', (await p.locator('.modes.compact .mode.on b').allInnerTexts()).join() === (extra.mode === 'retreat' ? '' : 'Friends'), (await p.locator('.modes.compact .mode.on b').allInnerTexts()).join());
  expect('…and nothing rewrote its type', JSON.stringify((await saved(tid)).mode) === JSON.stringify(extra.mode));
}

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Plan type changes more than one AI line: a family weekend and a team offsite get their own vibe
// quiz, AI framing, picks and Live chips, with no nightlife defaults; a friends weekend and a small
// hangout keep the original ones; plans saved without a type (or with one the app doesn't know)
// stay friends trips. Checks the questions on screen and the AI requests the app actually sends.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const c = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
// the AI is "on", and every request is recorded (prompt only) and answered with an empty reply
const sent = [];
await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
await c.route('**/api/ai', r => { const x = JSON.parse(r.request().postData() || '{}'); sent.push(typeof x.input === 'string' ? x.input : JSON.stringify(x.input)); r.fulfill({ json: { text: '{"items":[],"pitches":[]}', truncated: false } }); });
const db = (op, path, data) => p.evaluate(async ([op, path, data]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data]);
await p.goto(BASE + '/'); await p.fill('#join-name', 'Rae'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid), tids = [];

async function create(sz, mode) {
  if (await p.locator('[data-act=home]').count()) { await p.locator('[data-act=home]').first().dispatchEvent('click'); await settle(p); }
  await p.click('[data-act=newTrip]'); await settle(p); await p.click(`[data-size=${sz}]`); await settle(p);
  if (mode) { await p.click(`[data-mode=${mode}]`); await settle(p); }
  await p.fill('#nt-name', `${mode || sz} test`); if (await p.locator('#nt-city').count()) await p.fill('#nt-city', 'Denver');
  await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup');
  return finish((await p.evaluate(() => location.hash)).slice(1));
}
// destination, and every day in the window free, so pitches and picks can be asked for
async function finish(tid) {
  tids.push(tid);
  const t = (await db('get', 'trips/' + tid)).data, days = []; for (let d = new Date(t.winStart + 'T00:00Z'); d <= new Date(t.winEnd + 'T00:00Z'); d = new Date(+d + 864e5)) days.push(d.toISOString().slice(0, 10));
  await db('update', 'trips/' + tid, { destinations: [{ id: 'd1', city: 'Denver' }], lockedDest: 'd1' });
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
// answer every question on screen with its first option
const answerAll = async () => { const qs = p.locator('.q'); for (let i = 0; i < await qs.count(); i++) { await qs.nth(i).locator('[data-quiz]').first().click(); await p.waitForTimeout(350); } await p.waitForTimeout(600); await settle(p); };
// (the family and work AI lines may say “no clubs”, which is the point)
const NIGHT_RX = /nightlife|night out|club|Perfect night out|You head home|At sunrise|Sleeping it off|hangover|adults|friend group/i;
const NIGHT = { test: t => NIGHT_RX.test(t.replace(/no clubs( or bars)?/gi, '')) }, nightHit = t => (t.replace(/no clubs( or bars)?/gi, '').match(NIGHT_RX) || [])[0];
const liveText = async () => { await p.click('.bottomnav [data-sec=live]'); await settle(p); await p.click('.subtab[data-tab=live]'); await settle(p); const live = await p.locator('body').innerText(); await p.click('.subtab[data-tab=hype]'); await settle(p); return live + '\n' + await p.locator('body').innerText(); };

// —— family weekend ——
{
  const tid = await create('weekend', 'family');
  // answers this person gave before the plan was a family trip (a friends quiz) must not come along
  await db('update', `trips/${tid}/members/${uid}`, { quiz: { night: 'Big club', late: 'At sunrise', day: 'Sleeping it off' } });
  await open(tid, 'plan', 'match');
  const pitch = await ask('genPitches');
  expect('family: the pitch request frames a family group and a family-friendly vibe', /to a family group/.test(pitch) && /Vibe: relaxed and family-friendly/.test(pitch), pitch.match(/to a .*?\.|Vibe: .*/g)?.join(' / '));
  expect('family: no nightlife defaults, adult-friend framing or old quiz answers in it', !NIGHT.test(pitch), nightHit(pitch));
  await p.click('.subtab[data-tab=spots]'); await settle(p);
  const qs = await questions();
  expect('family: the quiz asks the family questions only', qs.join('|') === 'Ideal pace?|Days are for…|Evenings are for…|Spending style', qs.join('|'));
  await answerAll();
  expect('family: the crew blend has a family name', /The Go-Go Family/.test(await p.locator('body').innerText()));
  const spots = await ask('spots');
  expect('family: the picks request asks a local guide for all-ages places, no clubs or bars', /local guide finding family-friendly places/.test(spots) && /No clubs or bars/.test(spots) && /activity\|park\|museum/.test(spots), spots.slice(0, 120));
  expect('family: it carries the family quiz answers and the real group', /Ideal pace\? 100% Packed days/.test(spots) && /Group size: 1 people of mixed ages, possibly kids/.test(spots), (spots.match(/Group size: .*/) || [])[0]);
  expect('family: and nothing nightlife or club-centred', !/nightlife|club\|bar|Big club|Perfect night out|You head home|Sleeping it off|adults/i.test(spots), (spots.match(/nightlife|club\|bar|Big club|Perfect night out|You head home|Sleeping it off|adults/i) || [])[0]);
  const live = await liveText();
  expect('family: Live has no Hangover index and no “Out out” or late-night chips', !/Hangover index|Out out|Who’s still up|Outfit check/.test(live) && /Out exploring/.test(live), (live.match(/Hangover index|Out out|Who’s still up|Outfit check/) || [])[0]);
}

// —— work offsite ——
{
  const tid = await create('trip', 'work');
  await open(tid, 'plan', 'spots');
  const qs = await questions();
  expect('work: the quiz asks the team questions only', qs.join('|') === 'Best team activity?|Work vs team time?|Evenings are for…|Spending style', qs.join('|'));
  await answerAll();
  const spots = await ask('spots');
  expect('work: picks are framed for a team offsite, with the team’s answers', /places for a work team offsite/.test(spots) && /Best team activity\? 100% Something active/.test(spots) && /Group size: 1 colleagues/.test(spots), spots.slice(0, 120));
  expect('work: no nightlife scout, club defaults or adult-friend framing', !NIGHT.test(spots), nightHit(spots));
  await p.click('.subtab[data-tab=match]'); await settle(p);
  const pitch = await ask('genPitches');
  expect('work: the pitch request is to a work team and uses the team quiz', /to a work team/.test(pitch) && /Work vs team time\?/.test(pitch) && !NIGHT.test(pitch), nightHit(pitch));
  const live = await liveText();
  expect('work: Live has team check-ins and no Hangover index', /In a session/.test(live) && !/Hangover index|Out out/.test(live));
}

// —— friends weekend: unchanged ——
{
  const tid = await create('weekend', 'friends');
  await open(tid, 'plan', 'match');
  const pitch = await ask('genPitches');
  expect('friends: the pitch request is as before (friend group, fun social nightlife vibe)', /to a friend group/.test(pitch) && /Vibe: fun, social, nightlife/.test(pitch));
  await p.click('.subtab[data-tab=spots]'); await settle(p);
  const qs = await questions();
  expect('friends: the original five questions', qs.join('|') === 'Perfect night out?|What’s playing?|You head home…|Spending style|Daytime is for…', qs.join('|'));
  await answerAll();
  const spots = await ask('spots');
  expect('friends: the nightlife scout prompt, with the quiz answers and adults', /You're a nightlife scout planning a group trip/.test(spots) && /Perfect night out\? 100% Big club/.test(spots) && /Group size: 1 adults/.test(spots) && /club\|bar\|rooftop/.test(spots));
  const live = await liveText();
  expect('friends: Live keeps the Hangover index and “Out out”', /Hangover index/.test(live) && /Out out/.test(live));
}

// —— small hangout: unchanged ——
{
  const tid = await create('hangout', 'friends');
  await open(tid, 'plan', 'match');
  const pitch = await ask('genPitches');
  expect('hangout: still a friend group, “fun, social”, the original quiz', /pitching plans to a friend group/.test(pitch) && /Vibe: fun, social\n/.test(pitch));
  expect('hangout: saved as a friends plan, type and size kept apart', (await db('get', 'trips/' + tid)).data.mode === 'friends' && (await db('get', 'trips/' + tid)).data.size === 'hangout');
  await p.click('.subtab[data-tab=spots]'); await settle(p);
  expect('hangout: the original five questions', (await questions()).length === 5 && (await questions())[0] === 'Perfect night out?');
}

// —— plans saved without a type, or with one this version doesn't know: friends trips ——
for (const [label, extra] of [['no type', {}], ['an unknown type', { mode: 'retreat' }]]) {
  const tid = 'pt' + Math.random().toString(36).slice(2, 10);
  await db('set', 'trips/' + tid, { name: 'Old plan', size: 'trip', nights: 3, winStart: '2026-12-01', winEnd: '2026-12-20', destinations: [], itinerary: [], people: { [uid]: true }, createdBy: uid, createdAt: Date.now(), ...extra });
  await db('set', `trips/${tid}/members/${uid}`, { nick: 'Rae', status: 'in', days: [], updatedAt: Date.now() });
  await finish(tid); await open(tid, 'plan', 'spots');
  const qs = await questions(), spots = await ask('spots');
  expect(`a plan with ${label} keeps the friends quiz and prompts`, qs[0] === 'Perfect night out?' && qs.length === 5 && /nightlife scout/.test(spots) && /Trip type: Friends trip/.test(spots), qs.join('|'));
  expect(`…and isn’t rewritten as a new type`, JSON.stringify((await db('get', 'trips/' + tid)).data.mode) === JSON.stringify(extra.mode));
}

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

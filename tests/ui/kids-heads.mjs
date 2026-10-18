// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Family plans count kids in attendance: an attending adult (Going, Confirmed, Booked) adds their `kids`,
// at their own RSVP level; kids of someone Interested or who can't go aren't counted. Adults stay a
// separate count: "Can come" in What-if and the people costs are shared over are still adults. Missing,
// null or zero counts read exactly as before, and other plan types ignore saved counts.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 260) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Rae'); await p.click('.join-card [type=submit]'); await settle(p);
const A = await p.evaluate(() => localStorage.outta_uid), r = Math.random().toString(36).slice(2, 7), tids = [];
const days = ['2026-12-04', '2026-12-05', '2026-12-06'], U = n => `u_${n}00${r}`;
// Rae going + 2 kids, Bea confirmed + 1, Cy interested + 4 (not counted), Dee can't go + 3 (not counted),
// Eli going with no count saved, Fay going with kids: null
const crewOf = withKids => [[A, 'Rae', 'in', 2], [U('bea'), 'Bea', 'confirmed', 1], [U('cyy'), 'Cy', 'maybe', 4], [U('dee'), 'Dee', 'out', 3], [U('eli'), 'Eli', 'in', undefined], [U('fay'), 'Fay', 'in', null]]
  .map(([id, nick, status, kids]) => ({ id, doc: { nick, status, seen: true, days, updatedAt: Date.now(), ...(withKids && kids !== undefined ? { kids } : {}) } }));
async function plan(mode, withKids = true) {
  const tid = 'kh' + r + tids.length; tids.push(tid); const crew = crewOf(withKids);
  await api(A, 'set', 'trips/' + tid, { name: `${mode} weekend`, size: 'weekend', mode, nights: 2, winStart: '2026-12-01', winEnd: '2026-12-20', destinations: [{ id: 'd1', city: 'Denver' }], lockedDates: { start: days[0], end: days[2] },
    itinerary: [], people: Object.fromEntries(crew.map(x => [x.id, true])), createdBy: A, createdAt: Date.now(), pays: 'one', payer: A, costs: { food: { low: 100, high: 100, src: 'estimate', by: A, at: 1 } } });
  for (const x of crew) await api(x.id, 'set', `trips/${tid}/members/${x.id}`, x.doc);
  await p.goto(`${BASE}/#${tid}`); await settle(p); await p.waitForSelector('.bottomnav'); await p.waitForTimeout(600);
  return tid;
}
const go = async (sec, tab) => { await p.click(`.bottomnav [data-sec=${sec}]`); await settle(p); await p.click(`.subtab[data-tab=${tab}]`); await settle(p); await p.waitForTimeout(400); };
const flat = s => s.replace(/\s+/g, ' ').trim();
async function read() {
  await go('home', 'overview'); const hero = flat(await p.locator('.ovh-who').innerText());
  await go('home', 'crew'); const rsvp = flat(await p.locator('.rsvp').innerText()), blocks = (await p.locator('.rsvp .hc-b').allInnerTexts()).map(flat);
  await go('plan', 'whatif'); const can = flat(await p.locator('.wi-row', { hasText: 'Can come' }).innerText());
  await go('money', 'cost'); const cost = flat(await p.locator('.cost').innerText());
  return { hero, rsvp, blocks, can, cost };
}

// —— family, with kids ——
{ await plan('family'); const x = await read();
  expect('hero: 4 adults going bring 3 kids (Cy’s and Dee’s kids aren’t counted)', /^7 going \(4 adults, 3 kids\) · 1 maybe$/.test(x.hero), x.hero);
  expect('RSVP: plan for Bea + her kid now, up to everyone going with theirs', /Plan for 2 people \(1 adult, 1 kid\), up to 7 if everyone going confirms/.test(x.rsvp), x.rsvp);
  expect('…kids show at their adult’s level only (Confirmed +1, Going +2; none for Interested or Can’t go)', x.blocks.join(' | ') === '0 Booked | 1 Confirmed +1 kid | 3 Going +2 kids | 1 Interested | 1 Can’t go', x.blocks.join(' | '));
  expect('…and it says costs still count adults', /Stays and costs still count adults only for now/.test(x.rsvp), x.rsvp);
  expect('What-if “Can come” still counts adults (5 still in, no kids)', /5\/5/.test(x.can) && !/kid/.test(x.can), x.can);
  expect('the cost card’s group is still the adults (1 confirmed), not the party', /For everyone \(1 person\)/.test(x.cost) && /1 × \$/.test(x.cost), x.cost.slice(0, 200)); }

// —— family, nobody has a count saved: exactly as before ——
{ await plan('family', false); const x = await read();
  expect('family, no counts: hero as before', x.hero === '4 going · 1 maybe', x.hero);
  expect('…RSVP as before', /Plan for 1 person, up to 4 if everyone going confirms\. Stays and costs use this number\./.test(x.rsvp) && !/kid/i.test(x.blocks.join()), x.rsvp); }

// —— friends, with the same saved counts: ignored ——
{ await plan('friends'); const x = await read();
  expect('friends: saved counts are ignored in the hero', x.hero === '4 going · 1 maybe', x.hero);
  expect('…and the RSVP card', /Plan for 1 person, up to 4 if everyone going confirms\. Stays and costs use this number\./.test(x.rsvp) && !/kid/i.test(x.rsvp), x.rsvp);
  expect('…and the cost group', /For everyone \(1 person\)/.test(x.cost), x.cost.slice(0, 120)); }

expect('no page errors', !errs.length, errs.join('; '));
for (const tid of tids) await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': A } });
await b.close();
process.exit(fails ? 1 : 0);

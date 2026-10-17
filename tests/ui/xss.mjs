// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Cross-site scripting: every text field people (or the AI) can fill gets a harmless payload
// that would run script, or add an element, if it were ever rendered as HTML. Then every tab
// is opened. Nothing may run, no injected element may appear, no link may be javascript:,
// and the payload must still read as plain text. Normal links in chat must keep working.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(250));
// closes a double-quoted attribute, a single-quoted one, a textarea, then adds an element whose
// handler would fire; the second form sneaks a handler into an unquoted attribute
const P = `"'></textarea><img src=x data-xss onerror=__xss(this)>`, P2 = ` onmouseover=__xss(this) data-xss=1 `;
const BAD_URL = 'javascript:__xss()';

const mk = async () => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: true } }));
  // test-only hook: lets the test reach the app's state to fill the demo plan
  await c.route('**/app.js*', async r => { const res = await r.fetch(); const s = (await res.text()).replace('function openDemo() {', 'window.__S = () => S; window.__R = () => render();\nfunction openDemo() {'); r.fulfill({ response: res, body: s }); });
  await c.addInitScript(() => { window.__hits = []; window.__xss = el => window.__hits.push(el?.outerHTML || 'call'); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/'); await p.fill('#join-name', 'Ali'); await p.click('.join-card [type=submit]'); await settle(p); return p;
};
// what an injection would leave behind on the page right now
const scan = p => p.evaluate(() => ({
  hits: window.__hits.length,
  injected: document.querySelectorAll('[data-xss]').length,
  badLinks: [...document.querySelectorAll('[href],[src],[action],[formaction]')].map(e => e.getAttribute('href') || e.getAttribute('src') || e.getAttribute('action') || e.getAttribute('formaction') || '').filter(u => /^\s*(javascript|data|vbscript):/i.test(u)).length,
  handlers: [...document.querySelectorAll('*')].filter(e => [...e.attributes].some(a => /^on/i.test(a.name))).map(e => e.tagName + ' ' + [...e.attributes].filter(a => /^on/i.test(a.name)).map(a => a.name).join(',')),
  text: document.body.innerText,
}));

// —— 1. the demo plan, with every text field filled with the payload ——
const TEXT = ['name', 'city', 'title', 'note', 'flight', 'area', 'sleeps', 'perNight', 'perPerson', 'why', 'pros', 'cover', 'dress', 'tip', 'text', 'tagline', 'highlights', 'weather', 'nick', 'home', 'arrAirport', 'night', 'music', 'late', 'spend', 'day', 'bestNight', 'code', 'venmo', 'cashapp', 'caption', 'label', 'where', 'desc', 'item', 'place', 'what'];
const fill = ([P, P2, BAD, TEXT, size]) => {
  const S = window.__S(), now = Date.now(), seen = new WeakSet();
  const walk = (o) => { if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && TEXT.includes(k)) o[k] = v + P;
      else if (Array.isArray(v) && TEXT.includes(k)) o[k] = v.map(x => typeof x === 'string' ? x + P : x);
      else walk(v);
    } };
  for (const k of ['trip', 'members', 'feed', 'expenses', 'packing', 'bucket', 'pot', 'photos', 'mySpend']) walk(S[k]);
  const t = S.trip, L = t.lockedDates || {};
  t.size = size; t.name = 'Miami' + P2 + P;
  if (t.stay) t.stay.url = BAD;
  // dates are strings too: whoever writes the plan can store anything in them
  // (the RSVP deadline and earliest date are escaped the same way; a malformed stored one is
  // dropped when a plan loads, which this demo hook skips, so tests/ui/dates.mjs covers them)
  t.decide = { ...(t.decide || {}), style: 'pick', by: '2099-01-01' + P }; t.winEnd = (t.winEnd || '') + P;
  t.tasks = { tk1: { title: 'Book the van' + P, owner: '', due: '', done: false, by: 'd1', at: now } };
  t.changes = { ch1: { by: 'd1', at: now, act: '', area: 'plan', text: 'Moved dinner' + P, seen: {} } };
  t.myStays = { os1: { name: 'Cabin' + P, kind: 'rental', url: BAD, by: 'd1', at: now, note: P, area: P, sleeps: P, total: 900 } };
  t.pitches = { at: now, items: [{ id: 'px1', city: 'Lisbon' + P, code: 'LIS', start: L.start, end: L.end, tagline: P, why: P, perPerson: '$300' + P, vibeMatch: 80, highlights: [P], weather: P }] };
  S.feed = [{ id: 'f1', by: 'd1', at: now, text: 'Look ' + P + ' at https://example.com/a?b=1&c=2 ok' }, { id: 'f2', by: 'ai', at: now - 1, text: 'AI says ' + P }, ...S.feed];
  window.__R();
};
const p = await mk();
for (const size of ['trip', 'hangout']) {
  await p.locator('[data-act=demo]').first().click(); await settle(p);
  await p.evaluate(fill, [P, P2, BAD_URL, TEXT, size]); await settle(p);
  if (!(await p.locator('.bottomnav').count())) console.log('no nav; page shows:', (await p.innerText('body')).slice(0, 300));
  const secs = await p.locator('.bottomnav [data-sec]').evaluateAll(es => es.map(e => e.dataset.sec));
  expect(`${size}: the filled plan still renders`, secs.length > 0);
  const bad = [], seenTabs = [];
  for (const sec of secs) {
    await p.locator(`.bottomnav [data-sec=${sec}]`).click(); await settle(p);
    const tabs = await p.locator('.subtab[data-tab]').evaluateAll(es => es.map(e => e.dataset.tab));
    for (const tab of tabs.length ? tabs : [null]) {
      if (tab) { await p.locator(`.subtab[data-tab=${tab}]`).click(); await settle(p); }
      // open whatever opens on this tab (forms, sheets), so their fields are rendered too
      for (const sel of ['[data-act=addStay]', '[data-act=addOwnStay]']) if (await p.locator(sel).count()) { await p.locator(sel).first().click().catch(() => {}); await settle(p); }
      const s = await scan(p); seenTabs.push(tab || sec);
      if (s.hits || s.injected || s.badLinks || s.handlers.length) bad.push(`${tab || sec}: ran ${s.hits}, injected ${s.injected}, javascript: links ${s.badLinks}${s.handlers.length ? ', handlers ' + s.handlers.slice(0, 3).join('; ') : ''}`);
    }
  }
  if (errs.length) console.log('page errors so far', errs.slice(0, 3));
  expect(`${size}: no payload runs, injects an element, or becomes a javascript: link on any tab`, !bad.length, bad.join(' | ') || seenTabs.length + ' tabs');
  await p.locator('.bottomnav [data-sec=home]').click(); await settle(p);
  { const s = await scan(p); expect(`${size}: the payload shows as plain text`, s.text.includes('<img src=x data-xss onerror=__xss(this)>')); }
  if (size === 'trip') {
    await p.locator('.bottomnav [data-sec=live]').click(); await settle(p); await p.locator('.subtab[data-tab=hype]').click().catch(() => {}); await settle(p);
    const links = await p.locator('#feed a').evaluateAll(es => es.map(e => [e.getAttribute('href'), e.textContent, e.target]));
    expect('chat: a normal link still becomes a clickable link', links.some(([h, t, tg]) => h === 'https://example.com/a?b=1&c=2' && t === h && tg === '_blank'), JSON.stringify(links));
    const ai = await p.locator('#feed .bubble.ai').first().innerText().catch(() => '');
    expect('chat: an AI message with markup shows it as text', ai.includes('<img src=x'), ai.slice(0, 80));
  }
  await p.evaluate(() => { window.__hits.length = 0; });
  await p.locator('[data-act=home]').first().click().catch(() => {}); await settle(p);
}

// —— 2. a real plan through the server: names on the home screen, chat sent from the app ——
{
  const c = await mk(), uid = await c.evaluate(() => localStorage.outta_uid), tid = 'xss' + Math.random().toString(36).slice(2, 8);
  const db = (op, path, data) => c.evaluate(async ([op, path, data, uid]) => (await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': uid }, body: JSON.stringify({ op, path, data }) })).json(), [op, path, data, uid]);
  await db('set', 'trips/' + tid, { name: 'Plan' + P, createdBy: uid, createdAt: Date.now(), people: { [uid]: true }, size: 'trip', mode: 'friends', destinations: [{ id: 'd1', city: 'Porto' + P, code: 'OPO' }], lockedDest: 'd1', lockedDates: { start: '2026-12-04', end: '2026-12-06' },
    myStays: { s1: { name: 'Flat' + P, kind: 'rental', url: BAD_URL, by: uid, at: Date.now() } }, stay: { name: 'Hotel' + P, url: 'https://example.com/stay?a=1&b=2' } });
  await db('set', `trips/${tid}/members/${uid}`, { nick: 'Ali' + P, status: 'in', home: 'JFK' });
  await db('set', 'crews/c' + tid, { name: 'Crew' + P, people: { [uid]: true }, profiles: { [uid]: { nick: 'Ali' + P } }, by: uid, at: Date.now() });
  // the server now refuses a code like this, but an older plan may still hold one: add it to what the server sends
  await c.context().route('**/api/db', async r => { const q = JSON.parse(r.request().postData() || '{}'), res = await r.fetch(); if (q.op !== 'get' || q.path !== 'trips/' + tid) return r.fulfill({ response: res }); const j = await res.json(); if (j.exists) j.data.destinations = [{ id: 'd1', city: 'Porto' + P, code: 'OPO' + P }]; r.fulfill({ response: res, json: j }); });
  await c.reload(); await settle(c); await c.waitForTimeout(800);
  { const s = await scan(c); expect('home screen: plan and crew names stay inert', !s.hits && !s.injected && s.text.includes('Plan' + P.slice(0, 8)), `ran ${s.hits}, injected ${s.injected}`); }
  await c.goto(BASE + '/#' + tid); await settle(c); await c.waitForTimeout(800);
  const skip = c.locator('[data-act=setupLater]'); if (await skip.count()) { await skip.click(); await settle(c); }
  await c.locator('.bottomnav [data-sec=live]').click(); await settle(c); await c.locator('.subtab[data-tab=hype]').click().catch(() => {}); await settle(c);
  await c.fill('#fd-text', 'hi ' + P + ' https://example.org/x'); await c.locator('#feedForm [type=submit]').click(); await c.waitForTimeout(1200);
  { const s = await scan(c), link = await c.locator('#feed a[href="https://example.org/x"]').count(); expect('chat sent from the app: shown as text, link still works', !s.hits && !s.injected && s.text.includes('hi "\'></textarea><img') && link === 1, `ran ${s.hits}, injected ${s.injected}, links ${link}`); }
  await c.locator('.bottomnav [data-sec=book]').click(); await settle(c);
  const bad = [];
  for (const tab of ['flights', 'stays']) { await c.locator(`.subtab[data-tab=${tab}]`).click().catch(() => {}); await settle(c); const s = await scan(c); if (s.hits || s.injected || s.badLinks) bad.push(`${tab}: ran ${s.hits}, injected ${s.injected}, javascript: ${s.badLinks}`); }
  expect('booking links: a stored javascript: listing link or odd airport code can’t inject', !bad.length, bad.join(' | '));
  const good = await c.locator('a[href="https://example.com/stay?a=1&b=2"]').count();
  expect('booking links: a normal listing link still opens', good >= 1, good + ' found');
  await db('delete', 'trips/' + tid); await db('delete', 'crews/c' + tid);
}
console.log('errors', errs); await b.close();
process.exit(fails ? 1 : 0);

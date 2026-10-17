// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Deleting a plan from the app is one server request: on success the plan, everything in it and
// its uploaded files are gone and the app says so; on failure nothing is deleted, the plan stays
// open and the app says why. Delete shows for the creator and organizers, matching the server.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000', UP = process.env.OUTTA_TEST_DATA ? join(process.env.OUTTA_TEST_DATA, 'uploads') : null;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(400));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f6b7d40000000049454e44ae426082', 'hex');
const upload = async (u, tid) => (await (await fetch(BASE + '/api/assets', { method: 'POST', headers: { 'content-type': 'image/png', 'x-outta-user': u, 'x-outta-plan': tid }, body: png })).json()).id;
const has = id => !UP || existsSync(join(UP, id));
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Ana'); await p.click('.join-card [type=submit]'); await settle(p);
const uid = await p.evaluate(() => localStorage.outta_uid);
const newPlan = async name => {
  await p.click('[data-act=newTrip]'); await settle(p); await p.click('[data-size=trip]'); await settle(p); await p.locator('[data-mode]').first().click(); await settle(p);
  await p.fill('#nt-name', name); await p.click('#newTrip [type=submit]'); await p.waitForSelector('.setup'); await p.click('[data-act=setupLater]'); await settle(p);
  return (await p.evaluate(() => location.hash)).slice(1);
};
const toast = async () => (await p.locator('#toast').innerText().catch(() => '')).trim();
const tid = await newPlan('Lisbon'), photo = await upload(uid, tid), pass = await upload(uid, tid);
await api(uid, 'set', `trips/${tid}/photos/ph1`, { asset: photo, by: uid, at: Date.now() });
await api(uid, 'update', 'trips/' + tid, { tickets: { [uid]: { flight: 'TP1', asset: pass, type: 'image/png' } } });
await p.waitForTimeout(600);
const askDelete = async () => {
  await p.locator('.bottomnav [data-sec=home]').click(); await settle(p); await p.locator('.subtab[data-tab=settings]').click(); await settle(p);
  // after a failed try the confirm banner is still up, ready to retry
  if (!(await p.locator('[data-act=doDelete]').count())) { await p.locator('[data-act=askDelete]').dispatchEvent('click'); await settle(p); }
  await p.locator('[data-act=doDelete]').dispatchEvent('click'); await p.waitForTimeout(1200);
};

// 1. the server can't delete it right now: nothing goes, the plan stays open, the app says why
await c.route('**/api/plans/**', r => r.fulfill({ status: 503, json: { code: 'unavailable', message: 'Couldn’t save the deletion, so nothing was deleted. Try again.' } }));
await askDelete();
{ const m = await toast(), still = (await api(uid, 'get', 'trips/' + tid)).exists, here = await p.evaluate(() => location.hash);
  expect('a failed delete says nothing was deleted', /nothing was deleted/.test(m), m);
  expect('…and the plan is still there and still open', still && here === '#' + tid && (await p.locator('.bottomnav').count()) === 1 && has(photo)); }
await c.unroute('**/api/plans/**');

// 2. the real delete, from Settings
await askDelete();
{ const m = await toast(), g = await api(uid, 'get', 'trips/' + tid), photos = await api(uid, 'list', `trips/${tid}/photos`), members = await api(uid, 'list', `trips/${tid}/members`);
  expect('deleting from Settings says it’s deleted and goes home', /Trip deleted\./.test(m) && (await p.evaluate(() => location.hash)) === '', m);
  expect('…the plan and its records are gone on the server', !g.exists && !photos.docs?.length && !members.docs?.length);
  expect('…and so are its photo and boarding pass files', !has(photo) && !has(pass)); }

// 3. deleting from the home screen list, while another plan stays
const keep = await newPlan('Porto'); await p.locator('[data-act=home]').first().click().catch(() => {}); await settle(p);
const gone = await newPlan('Faro'); await p.locator('[data-act=home]').first().click().catch(() => {}); await settle(p);
if (!(await p.locator(`[data-homedel="${gone}"]`).count())) { await p.goto(BASE + '/'); await settle(p); }
await p.locator(`[data-homedel="${gone}"]`).dispatchEvent('click'); await settle(p);
await p.locator(`[data-homedo="${gone}"]`).dispatchEvent('click'); await p.waitForTimeout(1200);
{ const m = await toast(); expect('deleting from the home list works and says so', /deleted\./.test(m) && !(await api(uid, 'get', 'trips/' + gone)).exists, m); }
expect('…the other plan is still there', (await api(uid, 'get', 'trips/' + keep)).exists && (await p.innerText('body')).includes('Porto'));
await api(uid, 'delete', 'trips/' + keep);

// 4. who sees Delete: a co-organizer does (and can delete), a member doesn't (and can't)
const joinAs = async (name, t) => {
  const cx = await b.newContext({ viewport: { width: 390, height: 844 } }); await cx.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
  const q = await cx.newPage(); q.on('pageerror', e => errs.push(name + ': ' + e.message));
  await q.goto(BASE + '/#' + t); await q.fill('#join-name', name); await q.click('.join-card [type=submit]'); await settle(q);
  await q.waitForSelector('.welcome'); await q.click('[data-join=in]'); await q.waitForTimeout(600);
  const sk = q.locator('[data-act=setupLater]'); if (await sk.count()) { await sk.click(); await settle(q); }
  return { q, id: await q.evaluate(() => localStorage.outta_uid) };
};
const shared = await newPlan('Madeira');
const org = await joinAs('Olu', shared), mem = await joinAs('Max', shared);
await api(uid, 'update', 'trips/' + shared, { orgs: { [org.id]: true } }); await org.q.waitForTimeout(900);
const settingsOf = async q => { await q.locator('.bottomnav [data-sec=home]').click(); await settle(q); await q.locator('.subtab[data-tab=settings]').click(); await settle(q); return q; };
await settingsOf(mem.q);
expect('a member doesn’t see Delete, and is told only organizers can', !(await mem.q.locator('[data-act=askDelete]').count()) && /Only organizers can delete it/.test(await mem.q.innerText('body')));
{ const x = await fetch(BASE + '/api/plans/' + shared, { method: 'DELETE', headers: { 'x-outta-user': mem.id } }); expect('…and the server refuses a member who calls it anyway (403)', x.status === 403 && (await api(uid, 'get', 'trips/' + shared)).exists); }
await settingsOf(org.q);
expect('a co-organizer (not the creator) sees Delete', (await org.q.locator('[data-act=askDelete]').count()) === 1);
await org.q.locator('[data-act=askDelete]').dispatchEvent('click'); await settle(org.q); await org.q.locator('[data-act=doDelete]').dispatchEvent('click'); await org.q.waitForTimeout(1200);
{ const m = (await org.q.locator('#toast').innerText().catch(() => '')).trim(); expect('…and can delete it', /deleted\./.test(m) && !(await api(uid, 'get', 'trips/' + shared)).exists, m); }
console.log('errors', errs); await b.close();
process.exit(fails ? 1 : 0);

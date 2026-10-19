// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Two journey bugs: (1) on a phone with no share sheet and no clipboard (plain http on Wi-Fi),
// "Send the invite" on the overview must show the invite to copy by hand; (2) a change that fails
// to save while offline must not stay on screen, and once back online the screen must match what
// the server has, including other people's newer changes; your own details are saved then.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(450));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const mk = async (name, hash = '', { noShare = false } = {}) => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
  // what a browser on plain http over Wi-Fi offers: no share sheet, no clipboard
  if (noShare) await c.addInitScript(() => { for (const k of ['share', 'clipboard']) Object.defineProperty(Navigator.prototype, k, { get: () => undefined, configurable: true }); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(BASE + '/' + hash); await p.fill('#join-name', name); await p.click('.join-card [type=submit]'); await settle(p);
  return { p, c, id: await p.evaluate(() => localStorage.outta_uid) };
};
const toast = async p => (await p.locator('#toast').innerText().catch(() => '')).trim();
const go = async (p, sec, tab) => { await p.locator(`.bottomnav [data-sec=${sec}]`).click(); await settle(p); if (tab) { await p.locator(`.subtab[data-tab=${tab}]`).click(); await settle(p); } };

// 1. the invite on a phone without share or clipboard
const A = await mk('Ana', '', { noShare: true });
expect('setup: this browser has no share sheet and no clipboard', await A.p.evaluate(() => !navigator.share && !navigator.clipboard));
await A.p.click('[data-act=newTrip]'); await settle(A.p); await A.p.click('[data-size=weekend]'); await settle(A.p); await A.p.locator('[data-mode]').first().click(); await settle(A.p);
await A.p.fill('#nt-name', 'Cabin'); await A.p.click('#newTrip [type=submit]'); await A.p.waitForSelector('.setup'); await A.p.click('[data-act=setupLater]'); await settle(A.p);
const tid = (await A.p.evaluate(() => location.hash)).slice(1), P = 'trips/' + tid;
await go(A.p, 'home', 'overview');
await A.p.locator('.j-acts [data-act=copyInvite]').first().click(); await A.p.waitForTimeout(500);
{ const m = await toast(A.p), box = A.p.locator('#copybox'), v = await box.inputValue().catch(() => '');
  expect('“Send the invite” on the overview asks to copy the text by hand', /copy it/i.test(m), m);
  expect('…and the text is right there, on the overview, with the invite link', (await box.count()) === 1 && (await box.isVisible()) && v.includes('/p/' + tid), v.slice(-40));
  expect('…selected, ready to copy', await A.p.evaluate(() => document.activeElement?.id === 'copybox')); }

// 2. a to-do that fails to save while offline
const B = await mk('Ben', '#' + tid); await B.p.locator('[data-join=in]').click({ timeout: 2500 }).catch(() => {}); await B.p.waitForTimeout(700); { const sk = B.p.locator('[data-act=setupLater]'); if (await sk.count()) { await sk.click(); await settle(B.p); } }
await go(A.p, 'home', 'tasks'); const input = A.p.locator('#taskForm input, #task-title, [id^=task-new]').first();
await A.c.setOffline(true);
await input.fill('Bring snacks'); await input.press('Enter'); await A.p.waitForTimeout(1200);
{ const m = await toast(A.p), t = await A.p.innerText('main, body');
  expect('offline: saving the to-do fails with a message', /couldn’t save/i.test(m), m);
  expect('…and the unsaved to-do doesn’t stay on screen', !t.includes('Bring snacks')); }
// meanwhile Ben (online) adds one, and Ana changes her own details while still offline
await go(B.p, 'home', 'tasks'); const bi = B.p.locator('#taskForm input, #task-title, [id^=task-new]').first(); await bi.fill('Book the cabin'); await bi.press('Enter'); await B.p.waitForTimeout(900);
await go(A.p, 'home', 'crew'); await A.p.fill('#me-home', 'Porto'); await A.p.locator('#me-home').blur(); await A.p.waitForTimeout(1200);
await A.c.setOffline(false); await A.p.waitForTimeout(6000);
await go(A.p, 'home', 'tasks');
{ const t = await A.p.innerText('main, body'), saved = Object.values((await api(A.id, 'get', P)).data.tasks || {}).map(x => x.title);
  expect('back online: the server never got the failed to-do', !saved.includes('Bring snacks'), JSON.stringify(saved));
  expect('…and the screen agrees: it isn’t shown', !t.includes('Bring snacks'));
  expect('…while Ben’s newer to-do, saved meanwhile, is shown', saved.includes('Book the cabin') && t.includes('Book the cabin')); }
{ const me = (await api(A.id, 'get', `${P}/members/${A.id}`)).data; expect('Ana’s own detail changed offline is saved once she’s back online', me?.home === 'Porto', me?.home); }
// and the same to-do saves normally now
await input.fill('Bring snacks'); await input.press('Enter'); await A.p.waitForTimeout(1000);
{ const saved = Object.values((await api(A.id, 'get', P)).data.tasks || {}).map(x => x.title); expect('online again, adding it works', saved.includes('Bring snacks') && (await A.p.innerText('main, body')).includes('Bring snacks')); }
await api(A.id, 'delete', P);
console.log('errors', errs); await b.close();
process.exit(fails ? 1 : 0);

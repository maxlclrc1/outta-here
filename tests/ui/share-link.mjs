// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Shared plan links are /p/<plan>?k=<key>. A link preview (WhatsApp, iMessage) reading one gets the plan's
// card: its name, who invited you (the organizer's nickname), what it is, where/when once locked, how many
// are going, and a small PNG image; never anyone else's name, and never the invite key in the preview. A wrong or old key gets a plain card and no image. People opening the link land on the
// plan, as with the old /#plan.key links. "Send on WhatsApp" opens WhatsApp with the invite and the link.
import { install, trackBrowser } from '../_identity.mjs'; install(); // act as the test's people (see the file)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); trackBrowser(b); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + String(detail).slice(0, 220) : ''}`); if (!ok) fails++; };
const settle = p => p.waitForFunction(() => !document.documentElement.dataset.vt).then(() => p.waitForTimeout(450));
const api = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(r => r.json());
const page = async (name, url = BASE + '/') => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
  const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); await p.goto(url); return p;
};
const A = await page('Maya'); await A.fill('#join-name', 'Mayasecret'); await A.click('.join-card [type=submit]'); await settle(A);
const uid = await A.evaluate(() => localStorage.outta_uid);
await A.click('[data-act=newTrip]'); await settle(A); await A.click('[data-size=weekend]'); await settle(A); await A.click('[data-mode=friends]'); await settle(A);
await A.fill('#nt-name', 'Cabin weekend'); await A.click('#newTrip [type=submit]'); await A.waitForSelector('.setup'); await A.click('[data-act=setupLater]'); await settle(A);
const tid = (await A.evaluate(() => location.hash)).slice(1), key = (await api(uid, 'get', 'trips/' + tid)).data.inviteKey;
await api(uid, 'update', 'trips/' + tid, { destinations: [{ id: 'd1', city: 'Catskills' }], lockedDest: 'd1', lockedDates: { start: '2026-11-20', end: '2026-11-22' } });

// —— the link people send ——
await A.click('.bottomnav [data-sec=home]'); await settle(A); await A.click('.subtab[data-tab=crew]'); await settle(A);
const link = (await A.locator('.invite-link').innerText()).trim();
expect('the invite link is a plan link (with its key when it has one)', link === `${BASE}/p/${tid}${key ? '?k=' + key : ''}`, link);
const wa = await A.locator('a.wa').first().getAttribute('href');
expect('“Send on WhatsApp” opens WhatsApp with the invite and the link', wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa.slice(20)).includes(link) && /Cabin weekend/.test(decodeURIComponent(wa)), wa.slice(0, 120));
await A.click('.bottomnav [data-sec=home]'); await settle(A); await A.click('.subtab[data-tab=overview]'); await settle(A);
expect('…and it’s next to “Send the invite” while you’re alone in the plan', (await A.locator('.j-focus a.wa').count()) === 1);

// —— what WhatsApp's link preview reads ——
// someone else in the plan, whose name must never show in the preview
const BEA = 'u_bea00' + Math.random().toString(36).slice(2, 7); await api(BEA, 'set', `trips/${tid}/members/${BEA}`, { nick: 'Bea', status: 'maybe', days: [], updatedAt: Date.now() });
const html = await (await fetch(link, { headers: { 'user-agent': 'WhatsApp/2.23' } })).text();
const meta = k => html.match(new RegExp(`property="${k}" content="([^"]*)"`))?.[1] || '';
expect('the preview is titled with the plan’s name', meta('og:title') === 'Cabin weekend', meta('og:title'));
expect('…says who invited you, what it is, where and when', meta('og:description') === 'Mayasecret invited you · Friends weekend · Catskills · Nov 20 – Nov 22. Tap to say if you’re in.', meta('og:description'));
expect('…and never anyone else’s name', !/Bea/.test(html));
const img = await fetch(meta('og:image').replace(/&amp;/g, '&')), buf = Buffer.from(await img.arrayBuffer());
expect('the card image is fetched by a token, not the invite key', /\/card\?t=[0-9a-f]{24}$/.test(meta('og:image')) && !/k=/.test(meta('og:image')), meta('og:image'));
expect('the card image is a PNG small enough for WhatsApp', img.status === 200 && img.headers.get('content-type') === 'image/png' && buf.length < 300_000 && buf.length > 5_000, `${img.status} ${img.headers.get('content-type')} ${buf.length} bytes`);
await api(uid, 'update', 'trips/' + tid, { inviteKey: 'k7x9q2' }); await A.waitForTimeout(700);
{ const good = await (await fetch(`${BASE}/p/${tid}?k=k7x9q2`)).text(), im = good.match(/og:image" content="([^"]*)/)?.[1] || '';
  expect('a plan with a key shows its card with the right key, and the key isn’t in the preview', /Cabin weekend/.test(good) && !!im && !/k7x9q2/.test(good.replace(/url=[^"]*|location\.replace\([^)]*\)|href="[^"]*"/g, '')));
  expect('…its image works by token', (await fetch(im.replace(/&amp;/g, '&'))).status === 200); }
{ const bad = await (await fetch(`${BASE}/p/${tid}?k=wrongkey`)).text();
  expect('a wrong or old key gets a plain card, with no plan details or image', /You’re invited on Outta\/Here/.test(bad) && !/Cabin weekend/.test(bad) && !/og:image/.test(bad));
  expect('…and a made-up image token isn’t served', (await fetch(`${BASE}/p/${tid}/card?t=0123456789abcdef01234567`)).status === 404 && (await fetch(`${BASE}/p/${tid}/card?k=k7x9q2`)).status === 404); }

// —— a friend tapping it ——
const keyed = `${BASE}/p/${tid}?k=k7x9q2`, J = await page('Jo', keyed); await J.waitForFunction(() => location.hash.length > 1); await J.fill('#join-name', 'Jo'); await J.click('.join-card [type=submit]'); await settle(J);
await J.waitForSelector('.welcome', { timeout: 8000 });
expect('tapping the link lands on the plan’s invitation', /Mayasecret invited you/.test(await J.locator('.welcome').innerText()) && (await J.evaluate(() => location.hash)).startsWith(`#${tid}`));
await J.click('[data-join=in]'); await J.waitForSelector('.setup'); await J.waitForTimeout(1200);
{ const jid = await J.evaluate(() => localStorage.outta_uid); expect('…and joining works as before', (await api(uid, 'get', `trips/${tid}/members/${jid}`)).data?.status === 'in'); }
const old = await page('Old', `${BASE}/#${tid}.k7x9q2`); await old.fill('#join-name', 'Ola'); await old.click('.join-card [type=submit]'); await settle(old);
expect('old /#plan.key links still work', (await old.locator('.welcome').count()) === 1);

expect('no page errors', !errs.length, errs.join('; '));
await fetch(`${BASE}/api/plans/${tid}`, { method: 'DELETE', headers: { 'x-outta-user': uid } });
await b.close();
process.exit(fails ? 1 : 0);

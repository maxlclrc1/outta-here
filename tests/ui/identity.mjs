// Browser regression test, run with: npm run test:ui (needs Playwright, see README › Tests)
// Keeping your identity in a real browser (public/shim.js with lib/identity.ts): local storage
// cleared but the cookie kept comes back as the same person; a cleared cookie asks you to sign
// back in rather than quietly making someone new; a sign-in link restores you on a fresh browser.
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000', ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); const errs = [];
let fails = 0; const expect = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`); if (!ok) fails++; };
const settle = p => p.waitForTimeout(900);
const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/'); await p.fill('#join-name', 'Ana'); await p.click('.join-card [type=submit]'); await settle(p);
const id = await p.evaluate(() => localStorage.outta_uid);
const write = q => q.evaluate(async () => (await fetch('/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': localStorage.outta_uid }, body: JSON.stringify({ op: 'set', path: `data/users/${localStorage.outta_uid}/probe`, data: { at: Date.now() } }) })).status);
expect('a new browser gets an id it can act as', /^u_/.test(id) && (await write(p)) === 200);
expect('…and its cookie isn’t readable by page scripts', !(await p.evaluate(() => document.cookie)).includes('outta_'));

// local storage cleared, cookie kept
await p.evaluate(() => localStorage.clear()); await p.reload(); await settle(p);
const back = await p.evaluate(() => localStorage.outta_uid);
expect('after local storage is cleared, the same browser comes back as the same person', back === id, `${back} vs ${id}`);
expect('…and can still act as them', (await write(p)) === 200);

// cookie cleared, local storage kept: told to sign back in, never switched silently
await c.clearCookies(); await p.reload(); await settle(p);
expect('after the cookie is cleared, it asks to sign back in', /Sign back in/.test(await p.innerText('body')));
expect('…and keeps the same id rather than quietly becoming someone new', (await p.evaluate(() => localStorage.outta_uid)) === id);
expect('…while it can’t act as that person', (await write(p)) === 401);

// a sign-in link on a fresh browser
const code = (spawnSync(process.execPath, [join(ROOT, 'scripts/claim-link.mjs'), id], { env: { ...process.env, OUTTA_DATA_DIR: process.env.OUTTA_TEST_DATA }, encoding: 'utf8' }).stdout.match(/#claim=([A-Za-z0-9_\-]+)/) || [])[1];
const c2 = await b.newContext({ viewport: { width: 390, height: 844 } }); await c2.route('**/api/ai/status', r => r.fulfill({ json: { enabled: false } }));
const q = await c2.newPage(); q.on('pageerror', e => errs.push(e.message));
await q.goto(BASE + '/#claim=' + code); await settle(q);
expect('a sign-in link restores that person on a fresh browser', (await q.evaluate(() => localStorage.outta_uid)) === id && !(await q.evaluate(() => location.hash)).includes('claim'));
{ const f = q.locator('#join-name'); if (await f.count()) { await f.fill('Ana'); await q.click('.join-card [type=submit]'); await settle(q); } }
expect('…who can act as themselves there', (await write(q)) === 200);
const q2 = await (await b.newContext()).newPage(); await q2.goto(BASE + '/#claim=' + code); await settle(q2);
expect('the same link in another browser doesn’t sign it in', (await q2.evaluate(() => localStorage.outta_uid)) !== id && /Sign back in/.test(await q2.innerText('body')));
expect('…and the person it signed in stays signed in', (await write(q)) === 200);
console.log('errors', errs); await b.close();
process.exit(fails ? 1 : 0);

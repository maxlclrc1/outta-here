// Run with: npm run test:prod (builds the app for production, so it takes a minute or two).
// The identity cookie in a real production build (next build + next start, NODE_ENV=production):
// it's Secure by default; OUTTA_INSECURE_COOKIES turns that off only when it's exactly 1 or true
// (for plain http on your Wi-Fi), never for values like 0 or false; and a request that came over
// https always gets Secure. Builds into its own folder with throwaway data, and puts back the
// files Next touches while building.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = '.next-prod-test-' + process.pid;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const keep = ['tsconfig.json', 'next-env.d.ts'].map(f => [join(root, f), existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null]);
const restore = () => { for (const [f, text] of keep) { try { if (text === null) rmSync(f, { force: true }); else if (readFileSync(f, 'utf8') !== text) writeFileSync(f, text); } catch {} } try { rmSync(join(root, dist), { recursive: true, force: true }); } catch {} };
process.on('exit', restore);
const freePort = () => new Promise(res => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const next = join(root, 'node_modules/next/dist/bin/next');

console.log('Building for production…');
const built = spawnSync(process.execPath, [next, 'build'], { cwd: root, env: { ...process.env, NODE_ENV: 'production', OUTTA_DIST_DIR: dist, NEXT_TELEMETRY_DISABLED: '1' }, encoding: 'utf8' });
if (built.status !== 0) { console.log('FAIL the production build failed\n' + (built.stdout + built.stderr).slice(-1500)); process.exit(1); }

// start the built app with these settings, claim a new id, and return its Set-Cookie header
async function cookieWith(env, headers = {}) {
  const port = await freePort(), data = mkdtempSync(join(tmpdir(), 'outta-prod-'));
  const srv = spawn(process.execPath, [next, 'start', '-p', String(port)], { cwd: root, env: { ...process.env, NODE_ENV: 'production', OUTTA_DIST_DIR: dist, OUTTA_DATA_DIR: data, NEXT_TELEMETRY_DISABLED: '1', OUTTA_INSECURE_COOKIES: '', ...env }, stdio: 'ignore', detached: true });
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/api/me`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
    const r = await fetch(`http://localhost:${port}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ id: 'u_prod' + Math.random().toString(36).slice(2, 10) }) });
    return { status: r.status, set: r.headers.get('set-cookie') || '' };
  } finally { try { process.kill(-srv.pid, 'SIGKILL'); } catch {} await new Promise(r => setTimeout(r, 200)); rmSync(data, { recursive: true, force: true }); }
}
const secure = s => /;\s*Secure/i.test(s), base = s => /HttpOnly/i.test(s) && /SameSite=Strict/i.test(s);

{ const c = await cookieWith({}); check('production default: the cookie is Secure (and HttpOnly, SameSite=Strict)', c.status === 200 && secure(c.set) && base(c.set), c.set.replace(/=[^;]+/, '=<secret>')); }
{ const c = await cookieWith({ OUTTA_INSECURE_COOKIES: '1' }); check('OUTTA_INSECURE_COOKIES=1: not Secure over plain http (for Wi-Fi without https)', c.status === 200 && !secure(c.set) && base(c.set)); }
{ const c = await cookieWith({ OUTTA_INSECURE_COOKIES: 'true' }); check('OUTTA_INSECURE_COOKIES=true: the same', c.status === 200 && !secure(c.set)); }
for (const v of ['0', 'false', 'no', 'yes please']) { const c = await cookieWith({ OUTTA_INSECURE_COOKIES: v }); check(`OUTTA_INSECURE_COOKIES=${v}: still Secure (only 1 or true turn it off)`, c.status === 200 && secure(c.set)); }
{ const c = await cookieWith({ OUTTA_INSECURE_COOKIES: '1' }, { 'x-forwarded-proto': 'https' }); check('…and with the opt-out on, a request that came over https still gets Secure', c.status === 200 && secure(c.set)); }
restore();
check('the build folder and the files Next touched are put back', !existsSync(join(root, dist)) && keep.every(([f, t]) => (t === null ? !existsSync(f) : readFileSync(f, 'utf8') === t)));
process.exit(fails ? 1 : 0);

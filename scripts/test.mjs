// Runs the regression tests against a throwaway copy of the app, so they never touch your
// own data/ folder and can run while `npm run dev` is up.
//
//   node scripts/test.mjs              core: TypeScript check + build + every server suite
//   node scripts/test.mjs --server     server suites only
//   node scripts/test.mjs --ui         browser suites in tests/ui (needs Playwright, see README)
//   node scripts/test.mjs --concurrency  the real-browser concurrency test (needs Playwright)
//   add --only=<name> to run one suite, e.g. --only=privacy
//
// Every suite runs even if an earlier one fails; the command exits 1 if any failed.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), has = f => args.includes(f), only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
const mode = has('--ui') ? 'ui' : has('--concurrency') ? 'concurrency' : has('--server') ? 'server' : 'core';

const SERVER = [
  ['access', 'tests/access.mjs'],
  ['budget-privacy', 'tests/budget-privacy.mjs'],
  ['privacy', 'tests/privacy.mjs'],
  ['decisions', 'tests/decisions.mjs'],
  ['concurrency', 'tests/concurrency.mjs'],
  ['changelog', 'tests/changelog.mjs', ['--experimental-strip-types', '--no-warnings']],
  ['ai-uploads', 'tests/ai-uploads.mjs'],
  ['plan-dates', 'tests/plan-dates.mjs'],
  ['plan-values', 'tests/plan-values.mjs'],
  ['undo', 'tests/undo.mjs'],
  ['budget-pays', 'tests/budget-pays.mjs'],
  ['member-kids', 'tests/member-kids.mjs'],
  ['plan-delete', 'tests/plan-delete.mjs'],
  ['invite-key', 'tests/invite-key.mjs'],
  ['identity', 'tests/identity.mjs'],
  ['identity-claims', 'tests/identity-claims.mjs'],
  ['files-access', 'tests/files-access.mjs'],
  ['storage', 'tests/storage.mjs'],
  ['plan-integrity', 'tests/plan-integrity.mjs', ['--experimental-strip-types', '--no-warnings']],
];
const UI = readdirSync(join(root, 'tests/ui')).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort().map(f => [f.replace(/\.mjs$/, ''), 'tests/ui/' + f]);
const suites = (mode === 'ui' ? UI : mode === 'concurrency' ? [['ui-concurrency', 'tests/ui-concurrency.mjs']] : SERVER).filter(([n]) => !only || n === only);
if (!suites.length) { console.error(`No suite named "${only}".`); process.exit(1); }

const results = [];
const step = (name, ok, ms, note = '') => { results.push({ name, ok, ms, note }); console.log(`${ok ? '✓' : '✗'} ${name} (${(ms / 1000).toFixed(1)}s)${note ? ' · ' + note : ''}`); };
const sh = (name, cmd, cmdArgs) => { const t = Date.now(), r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit' }); step(name, r.status === 0, Date.now() - t); return r.status === 0; };

// browser suites need Playwright; say so plainly instead of failing obscurely
if (mode === 'ui' || mode === 'concurrency') {
  try { await import(process.env.PLAYWRIGHT || 'playwright'); }
  catch { console.error('These tests need Playwright. Set PLAYWRIGHT to its index.mjs (and CHROMIUM to a browser if Playwright has none installed). See README › Tests.'); process.exit(2); }
}

if (mode === 'core') sh('typecheck', process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit']);
if (!sh('build', process.execPath, [join(root, 'scripts/build.mjs')])) { console.error('Build failed; not running tests.'); process.exit(1); }

// a throwaway server: its own data folder, its own build folder, a free port. Next adds its
// build folder to tsconfig.json when it starts, so the file is put back afterwards.
const tsconfig = join(root, 'tsconfig.json'), tsconfigText = readFileSync(tsconfig, 'utf8');
const restoreTsconfig = () => { try { if (readFileSync(tsconfig, 'utf8') !== tsconfigText) writeFileSync(tsconfig, tsconfigText); } catch {} };
const freePort = () => new Promise(res => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort(), data = mkdtempSync(join(tmpdir(), 'outta-test-')), dist = `.next-test-${port}`;
const server = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(port)], { cwd: root, env: { ...process.env, OUTTA_DATA_DIR: data, OUTTA_DIST_DIR: dist, NEXT_TELEMETRY_DISABLED: '1', OUTTA_INSECURE_COOKIES: '1', OUTTA_AI_OFF: '1', OUTTA_UPLOAD_FILES_PER_PERSON: '8' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
// the server's output is also kept in the throwaway folder, so suites can check what it logs
let serverLog = ''; const keepLog = d => { serverLog += d; try { appendFileSync(join(data, 'server.log'), d); } catch {} };
server.stdout.on('data', keepLog); server.stderr.on('data', keepLog);
let cleaned = false, exited = false;
server.on('exit', () => { exited = true; });
const remove = () => { for (const d of [data, join(root, dist)]) try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} restoreTsconfig(); };
// stop the server, wait for it to let go of its folders, then delete them
const cleanup = async () => {
  if (cleaned) return; cleaned = true;
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  for (let i = 0; i < 50 && !exited; i++) await new Promise(r => setTimeout(r, 100));
  if (!exited) try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  await new Promise(r => setTimeout(r, 200));
  remove();
};
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('exit', () => { if (!cleaned) { try { process.kill(-server.pid, 'SIGKILL'); } catch {} remove(); } });

const base = `http://localhost:${port}`, t0 = Date.now();
for (;;) {
  try { if ((await fetch(base + '/')).ok) break; } catch {}
  if (Date.now() - t0 > 120000) { console.error('The test server didn’t start:\n' + serverLog.slice(-2000)); await cleanup(); process.exit(1); }
  await new Promise(r => setTimeout(r, 500));
}
console.log(`Test server on ${base} with a throwaway database (${data})\n`);

// run each suite; a suite fails on a nonzero exit, a "FAIL" line, page errors, or a timeout
const LIMIT = mode === 'core' || mode === 'server' ? 180000 : 300000;
for (const [name, file, nodeArgs = []] of suites) {
  const t = Date.now();
  const res = await new Promise(resolve => {
    // browser suites run in the throwaway folder so their screenshots land there too
    const p = spawn(process.execPath, [...nodeArgs, join(root, file)], { cwd: mode === 'ui' || mode === 'concurrency' ? data : root, env: { ...process.env, BASE: base, OUTTA_TEST_DATA: data, OUTTA_IDENTITY_STRICT: '1' } });
    let out = ''; p.stdout.on('data', d => { out += d; process.stdout.write(d); }); p.stderr.on('data', d => { out += d; process.stderr.write(d); });
    const timer = setTimeout(() => { p.kill('SIGKILL'); out += '\n[timed out]'; }, LIMIT);
    p.on('close', code => { clearTimeout(timer); resolve({ code, out }); });
  });
  const pageErrors = /^errors \[\s*\S/m.test(res.out) && !/^errors \[\]/m.test(res.out);
  const failLines = (res.out.match(/^FAIL\b.*$/gm) || []).length;
  const ok = res.code === 0 && !failLines && !pageErrors && !/\[timed out\]/.test(res.out);
  step(name, ok, Date.now() - t, ok ? '' : [res.code !== 0 && `exit ${res.code}`, failLines && `${failLines} FAIL`, pageErrors && 'page errors', /\[timed out\]/.test(res.out) && 'timed out'].filter(Boolean).join(', '));
  console.log('');
}

await cleanup();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` · failed: ${failed.map(r => r.name).join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);

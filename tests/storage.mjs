// Part of npm test / npm run test:server (needs no server). Runs alone too: node tests/storage.mjs
// The database file survives failed and interrupted saves, and a damaged file is never
// replaced by an empty database. Each case runs lib/store.ts in its own process against its
// own temporary folder (never this project's data/ folder).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url), root = join(dirname(here), '..');

// —— child: one store process, driven by a list of steps ——
if (process.argv[2] === 'child') {
  const store = await import(join(root, 'lib/store.ts'));
  const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), file = join(process.env.OUTTA_DATA_DIR, 'db.json');
  for (const step of JSON.parse(process.argv[3])) {
    const [op, a, b] = step;
    try {
      if (op === 'set') store.setDoc(a, b, 'u_test');
      if (op === 'flush') store.flushNow();
      if (op === 'get') out[a] = store.rawDoc(a);
      if (op === 'sleep') await sleep(a);
      if (op === 'mkdir') mkdirSync(join(process.env.OUTTA_DATA_DIR, a));
      if (op === 'rmdir') rmSync(join(process.env.OUTTA_DATA_DIR, a), { recursive: true });
      if (op === 'snap') out[a] = existsSync(file) ? readFileSync(file, 'utf8') : null;
      out[op + ':' + (a ?? '')] = 'ok';
    } catch (e) { out[op + ':' + (a ?? '')] = e.code || e.message; }
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// —— parent ——
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const dirs = [];
const fresh = () => { const d = mkdtempSync(join(tmpdir(), 'outta-store-')); dirs.push(d); return d; };
const run = (dir, steps) => {
  const r = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', here, 'child', JSON.stringify(steps)], { env: { ...process.env, OUTTA_DATA_DIR: dir }, encoding: 'utf8' });
  try { return { ...JSON.parse(r.stdout), log: r.stderr, code: r.status }; } catch { return { log: r.stderr + r.stdout, code: r.status }; }
};
const db = d => join(d, 'db.json'), bak = d => join(d, 'db.json.bak'), read = f => readFileSync(f, 'utf8'), parse = f => JSON.parse(read(f));
const plan = name => ({ name, createdBy: 'u_test', createdAt: 1 });
const project = join(realpathSync(root), 'data');

{ const d = fresh(); check('tests use a temporary folder, not the project’s data/', realpathSync(d).startsWith(realpathSync(tmpdir())) && !realpathSync(d).startsWith(project)); }

// 1. normal saves, and the backup of the last good version
{
  const d = fresh();
  const r1 = run(d, [['set', 'trips/a', plan('A')], ['flush']]);
  check('a save writes db.json', r1['flush:'] === 'ok' && parse(db(d))['trips/a'].data.name === 'A');
  check('…with nothing half-written left behind', !existsSync(db(d) + '.tmp'));
  const r2 = run(d, [['get', 'trips/a'], ['set', 'trips/b', plan('B')], ['flush']]);
  check('a restart loads what was saved', r2['trips/a']?.name === 'A');
  check('the next save keeps the previous good version as db.json.bak', Object.keys(parse(bak(d))).join() === 'trips/a' && Object.keys(parse(db(d))).sort().join() === 'trips/a,trips/b');
}

// 2. a save that fails leaves the last good database as it was, and is retried
{
  const d = fresh(); run(d, [['set', 'trips/a', plan('A')], ['flush']]); const before = read(db(d));
  // a directory where the temporary file should go makes every write fail
  const r = run(d, [['mkdir', 'db.json.tmp'], ['set', 'trips/c', plan('C')], ['flush'], ['sleep', 400], ['snap', 'during'], ['rmdir', 'db.json.tmp'], ['sleep', 2600], ['snap', 'after']]);
  check('a failed save reports the failure', r['flush:'] !== 'ok' && r['flush:'] !== undefined, r['flush:']);
  check('…and db.json is exactly as before', r.during === before);
  check('…the app keeps running and logs it', r.code === 0 && /Saving the database failed/.test(r.log));
  check('…and the change is saved once writing works again', r.after && 'trips/c' in JSON.parse(r.after));
}

// 3. a save interrupted part-way (only the temporary file is affected)
{
  const d = fresh(); run(d, [['set', 'trips/a', plan('A')], ['flush']]);
  writeFileSync(db(d) + '.tmp', '{"trips/zz":{"data":{"na'); // what a crash mid-write leaves
  const r = run(d, [['get', 'trips/a'], ['set', 'trips/b', plan('B')], ['flush']]);
  check('after an interrupted save the last complete database loads', r['trips/a']?.name === 'A');
  check('…and saving works again', r['flush:'] === 'ok' && 'trips/b' in parse(db(d)) && !existsSync(db(d) + '.tmp'));
}

// 4. a damaged db.json with a good backup: recover from the backup, keep the damaged copy
{
  const d = fresh(); run(d, [['set', 'trips/a', plan('A')], ['flush'], ['set', 'trips/b', plan('B')], ['flush']]);
  const damaged = read(db(d)).slice(0, 30); writeFileSync(db(d), damaged);
  const r = run(d, [['get', 'trips/a'], ['get', 'trips/b'], ['set', 'trips/c', plan('C')], ['flush']]);
  const kept = readdirSync(d).filter(f => f.startsWith('db.json.corrupt-'));
  check('a damaged db.json loads the backup instead of starting empty', r['trips/a']?.name === 'A', r.log.trim());
  check('…the damaged file is kept, byte for byte', kept.length === 1 && read(join(d, kept[0])) === damaged);
  check('…saving works again, with the recovered plans', r['flush:'] === 'ok' && Object.keys(parse(db(d))).sort().join() === 'trips/a,trips/c');
  check('…and the damaged file never becomes the backup', Object.keys(parse(bak(d))).join() === 'trips/a');
  const again = run(d, [['get', 'trips/c']]);
  check('…the next restart loads normally', again['trips/c']?.name === 'C' && !/could not be read/.test(again.log));
}

// 5. a damaged db.json and no usable backup: nothing is overwritten
for (const [label, setup] of [['no backup', () => {}], ['a damaged backup', d => writeFileSync(bak(d), '{"trips/a":')], ['a db.json that isn’t a database object', d => writeFileSync(db(d), '[]')]]) {
  const d = fresh(); writeFileSync(db(d), '{"trips/a":{"data":{"name":"A"},"vers'); setup(d);
  const before = read(db(d));
  const r = run(d, [['set', 'trips/new', plan('New')], ['flush'], ['sleep', 300]]);
  check(`damaged db.json with ${label}: saving is refused`, r['set:trips/new'] === 'unavailable' && r['flush:'] === 'unavailable', r['set:trips/new']);
  check('…db.json is not replaced by an empty database', read(db(d)) === before);
  check('…a copy is kept and the reason is logged', readdirSync(d).some(f => f.startsWith('db.json.corrupt-')) && /saving is turned off/.test(r.log));
}

// 6. db.json missing but a backup is there: load the backup
{
  const d = fresh(); run(d, [['set', 'trips/a', plan('A')], ['flush'], ['set', 'trips/b', plan('B')], ['flush']]); rmSync(db(d));
  const r = run(d, [['get', 'trips/a'], ['set', 'trips/c', plan('C')], ['flush']]);
  check('a missing db.json with a backup loads the backup', r['trips/a']?.name === 'A' && r['flush:'] === 'ok' && 'trips/c' in parse(db(d)));
}

// 7. first run: no files at all is still an empty database that saves normally
{ const d = fresh(); const r = run(d, [['set', 'trips/a', plan('A')], ['flush']]); check('first run starts empty and saves', r['flush:'] === 'ok' && !/\[store\]/.test(r.log)); }

for (const d of dirs) rmSync(d, { recursive: true, force: true });
process.exit(fails ? 1 : 0);

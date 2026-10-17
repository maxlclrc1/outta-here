// Makes a one-time sign-in link that puts someone back in their own identity on a browser:
// for people from before ids had secrets, someone who cleared their browser, or a new device.
// Run it on the computer that runs the app (it reads and writes the app's data/ folder):
//
//   node scripts/claim-link.mjs Ana                 find people called Ana, and their ids
//   node scripts/claim-link.mjs u_abc123…           make a link for that id
//   node scripts/claim-link.mjs u_abc123… --host 192.168.1.23:3000
//
// Give the link only to that person (in person or a chat you trust): whoever opens it first
// becomes that person in that browser. It works once and expires after 24 hours. Only a hash
// of it is saved (data/claims/).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2), host = (() => { const i = args.indexOf('--host'); return i >= 0 ? args.splice(i, 2)[1] : 'localhost:3000'; })(), q = args[0];
const DATA = process.env.OUTTA_DATA_DIR || path.join(process.cwd(), 'data');
if (!q) { console.log('Usage: node scripts/claim-link.mjs <name or id> [--host 192.168.1.23:3000]'); process.exit(2); }
let db = {}; try { db = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8')); } catch {}

if (!/^u_[A-Za-z0-9_\-]{4,62}$/.test(q)) {
  // look people up by the name they use in plans and crews
  const hits = new Map();
  for (const [p, d] of Object.entries(db)) {
    const m = p.match(/^trips\/([^/]+)\/members\/([^/]+)$/);
    if (m && String(d.data?.nick || '').toLowerCase().includes(q.toLowerCase())) (hits.get(m[2]) || hits.set(m[2], new Set()).get(m[2])).add(db['trips/' + m[1]]?.data?.name || m[1]);
  }
  if (!hits.size) { console.log(`Nobody called “${q}” found.`); process.exit(1); }
  for (const [id, plans] of hits) console.log(`${id}  in: ${[...plans].join(', ')}`);
  console.log('\nRun this again with the right id to make their link.');
  process.exit(0);
}
const code = crypto.randomBytes(24).toString('base64url');
fs.mkdirSync(path.join(DATA, 'claims'), { recursive: true });
fs.writeFileSync(path.join(DATA, 'claims', crypto.createHash('sha256').update(code).digest('hex') + '.json'), JSON.stringify({ id: q, exp: Date.now() + 24 * 36e5 }), { mode: 0o600 });
console.log(`http://${host}/#claim=${code}`);

// Builds the app from src/ into the files the browser loads.
//   node scripts/build.mjs                      → public/app.js and public/styles.css (localhost)
//   node scripts/build.mjs --claude out.html    → also a single-file page for the Claude artifact
// public/app.js and public/styles.css are generated: edit src/ instead.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const parts = dir => readdirSync(join(root, dir)).filter(f => f.endsWith('.js')).sort().map(f => read(join(dir, f)));

const js = parts('src/app').join('');
const appCss = read('src/styles/app.css');
writeFileSync(join(root, 'public/app.js'), js);
writeFileSync(join(root, 'public/styles.css'), read('src/styles/local.css') + appCss);
console.log(`public/app.js (${js.split('\n').length} lines) and public/styles.css built`);

const i = process.argv.indexOf('--claude');
if (i > -1) {
  const out = process.argv[i + 1];
  if (!out) throw new Error('Usage: node scripts/build.mjs --claude <output.html> [--share-base <url>]');
  const j = process.argv.indexOf('--share-base');
  const shareBase = j > -1 ? process.argv[j + 1] : 'https://claude.ai/artifact/36xeB3Jem5NLYP5AZy6W2a';
  // split/join instead of replace() so `$` sequences in the code are kept as written
  const html = read('src/claude/shell.html').split('{{CSS}}').join(appCss).split('{{SHARE_BASE}}').join(shareBase).split('{{JS}}').join(js);
  writeFileSync(out, html);
  console.log(`Claude page built: ${out}`);
}

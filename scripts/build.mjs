// Builds the app from src/ into the files the browser loads.
//   node scripts/build.mjs                      → public/app.js and public/styles.css (localhost)
//   node scripts/build.mjs --claude out.html    → also a single-file page for the Claude artifact
//   add --minify for production (npm run build does): smaller files, same behavior
// public/app.js and public/styles.css are generated: edit src/ instead. public/index.html
// gets a content hash on each file's URL, so browsers can cache them for a long time and
// still pick up every new build straight away (see next.config.mjs).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const parts = dir => readdirSync(join(root, dir)).filter(f => f.endsWith('.js')).sort().map(f => read(join(dir, f)));

const MINIFY = process.argv.includes('--minify');
// Next ships terser; if it ever moves, fall back to the readable build rather than fail.
async function minJs(code) {
  if (!MINIFY) return code;
  try { const { minify } = createRequire(import.meta.url)('next/dist/compiled/terser'); return (await minify(code, { compress: { passes: 2 }, mangle: true, format: { comments: false } })).code; }
  catch (e) { console.warn('Couldn’t minify the app, using the readable build:', e.message); return code; }
}
// light and safe: drops comments and extra whitespace, leaves everything else alone
const minCss = css => !MINIFY ? css : css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/;}/g, '}').trim();

const src = parts('src/app').join('');
const js = await minJs(src);
const appCss = read('src/styles/app.css');
const css = minCss(read('src/styles/local.css') + appCss);
writeFileSync(join(root, 'public/app.js'), js);
writeFileSync(join(root, 'public/styles.css'), css);
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 10);
const idx = read('public/index.html'), ver = { 'app.js': hash(js), 'styles.css': hash(css), 'shim.js': hash(read('public/shim.js')) };
const idx2 = idx.replace(/\/(app\.js|styles\.css|shim\.js)(\?v=[\w-]+)?/g, (_, f) => `/${f}?v=${ver[f]}`);
if (idx2 !== idx) writeFileSync(join(root, 'public/index.html'), idx2);
console.log(`public/app.js (${src.split('\n').length} source lines${MINIFY ? `, ${Math.round(js.length / 1024)} KB minified` : ''}) and public/styles.css built`);

const i = process.argv.indexOf('--claude');
if (i > -1) {
  const out = process.argv[i + 1];
  if (!out) throw new Error('Usage: node scripts/build.mjs --claude <output.html> [--share-base <url>]');
  const j = process.argv.indexOf('--share-base');
  const shareBase = j > -1 ? process.argv[j + 1] : 'https://claude.ai/artifact/36xeB3Jem5NLYP5AZy6W2a';
  // split/join instead of replace() so `$` sequences in the code are kept as written
  const html = read('src/claude/shell.html').split('{{CSS}}').join(minCss(appCss)).split('{{SHARE_BASE}}').join(shareBase).split('{{JS}}').join(js);
  writeFileSync(out, html);
  console.log(`Claude page built: ${out}`);
}

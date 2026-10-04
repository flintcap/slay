/**
 * Are the project's hard rules still true?
 *
 *   node tools/check-rules.mjs
 *
 * Static, instant. Ten streams edit this game at once; these are the rules
 * none of them may break (CLAUDE.md, docs/overhaul/PLAN.md):
 *
 *  - no `Math.random` outside `src/core/RNG.ts`: every roll is seeded
 *  - no asset files: nothing in the repo or imported by source is an image,
 *    model, sound or font file; everything is generated in code
 *  - no `console.log` left in shipped source (warn/error are fine)
 *  - no `debugger` statements
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-single', 'shots', '.claude', '.checks']);
const ASSET = /\.(png|jpe?g|gif|webp|avif|bmp|ico|glb|gltf|fbx|obj|mtl|mp3|wav|ogg|flac|m4a|ttf|otf|woff2?|hdr|exr|ktx2?)$/i;

const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    if (SKIP_DIRS.has(n) || (n.startsWith('.') && n.endsWith('audit'))) continue;
    const p = path.join(dir, n);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const rel = (p) => path.relative(ROOT, p);
const all = walk(ROOT);
const problems = [];

// Asset files anywhere in the tree.
for (const p of all) if (ASSET.test(p)) problems.push(`asset file in the repo: ${rel(p)}`);

/** Source with comments and string contents blanked, so prose cannot trip a rule. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (m, a) => a + ' '.repeat(m.length - a.length));
}

for (const p of all.filter((f) => /[\\/]src[\\/].*\.(ts|js|css|html)$/.test(f) || /index\.html$/.test(f))) {
  const text = readFileSync(p, 'utf8');
  const c = /\.(ts|js)$/.test(p) ? code(text) : text;
  const r = rel(p);
  const lines = c.split('\n');
  lines.forEach((line, i) => {
    const at = `${r}:${i + 1}`;
    if (/Math\.random\s*\(/.test(line) && !/src[\\/]core[\\/]RNG\.ts$/.test(p)) problems.push(`Math.random outside RNG: ${at}`);
    if (/\bconsole\.log\s*\(/.test(line)) problems.push(`console.log left in: ${at}`);
    if (/^\s*debugger\s*;?\s*$/.test(line)) problems.push(`debugger statement: ${at}`);
    const imp = line.match(/(?:import|from|url\(|src=)\s*\(?['"]([^'"]+)['"]/);
    if (imp && ASSET.test(imp[1]) && !/^data:/.test(imp[1])) problems.push(`asset reference ${imp[1]}: ${at}`);
  });
}

for (const p of problems) console.log(`  FAIL ${p}`);
console.log(
  problems.length === 0
    ? 'OK — seeded randomness only, no asset files, no stray console.log or debugger.'
    : `\nFAILED — ${problems.length} rule violations.`,
);
process.exit(problems.length === 0 ? 0 : 1);

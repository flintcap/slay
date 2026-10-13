/**
 * Charms: four sizes, magic to unique, their own lines, and they only work
 * from the pack. Static, a few seconds.
 *
 *   node tools/check-charms.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.charmsaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/charms-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const shim = `
globalThis.window = { setTimeout, clearTimeout, addEventListener(){}, localStorage: { getItem: () => null, setItem(){}, removeItem(){} } };
globalThis.localStorage = globalThis.window.localStorage;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener(){} };
await import(${JSON.stringify(path.join(OUT, 'e.mjs'))});
`;
const raw = execFileSync('node', ['--input-type=module', '-e', shim], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const r = JSON.parse(lines[lines.length - 1]);
console.log(`rarity: ${JSON.stringify(r.tally)}  sizes: ${JSON.stringify(r.bySize)}`);
console.log(`named charms: ${r.namedDefs} defined, ${r.named} rolled in 6000; ${r.dropped} dropped in ${r.kills} kills`);
for (const p of r.problems) console.log('  - ' + p);
console.log(r.problems.length ? `\nFAILED — ${r.problems.length} charm problems.` : '\nOK — charms roll right and work from the pack.');
process.exit(r.problems.length ? 1 : 0);

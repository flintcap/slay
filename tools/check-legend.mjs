/**
 * Every set and every unique has its own signature (qa-legend):
 *
 *   node tools/check-legend.mjs
 *
 * Fails when a set or unique has no signature in `src/art/items/Designs.ts`,
 * two sets share a palette or a sculpt, two uniques look the same, a unique
 * has no aura, or a set piece misses its set's sculpt or glow. Headless: see
 * `tools/legend-entry.ts`.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.legendcheck');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/legend-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 24 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const r = JSON.parse(lines[lines.length - 1]);

console.log(`${r.sets} sets, ${r.pieces} set pieces, ${r.uniques} uniques (${r.auras} with an aura)`);
console.log(`closest two set palettes: ${r.nearest.a} and ${r.nearest.b} (distance ${Math.round(r.nearest.d)})`);
if (r.problems.length) {
  console.log('\nPROBLEMS');
  for (const p of r.problems) console.log('  - ' + p);
  console.log(`\nFAILED — ${r.problems.length} problem(s).`);
  process.exit(1);
}
console.log('\nOK — every set and unique has its own signature.');

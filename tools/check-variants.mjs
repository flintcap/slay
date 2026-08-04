/**
 * Do the biome variants exist in the game, or only in the data file?
 *
 *   node tools/check-variants.mjs
 *
 * Fails when a variant never rolls, when its patch changes nothing a player
 * would notice, or when a single run wears more than one.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.variantaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/variant-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { runs, splitRuns, rows } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${runs} runs\n`);
console.log(`${pad('biome', 14)} ${pad('variant', 12)} ${pad('name', 24)} ${pad('changes', 8)} ${pad('loud', 6)} rolled`);
const dead = [];
const silent = [];
for (const r of rows) {
  if (r.rolled === 0) dead.push(`${r.biome}/${r.variant}`);
  // 'plain' is the biome's own art and is meant to change nothing.
  if (r.variant !== 'plain' && r.loud < 2) silent.push(`${r.biome}/${r.variant}`);
  console.log(
    `${pad(r.biome, 14)} ${pad(r.variant, 12)} ${pad(r.name, 24)} ${pad(r.changed, 8)} ${pad(r.loud, 6)} ${r.rolled}${
      r.rolled === 0 ? '   <-- NEVER ROLLS' : ''
    }${r.variant !== 'plain' && r.loud < 2 ? '   <-- CHANGES NOTHING VISIBLE' : ''}`,
  );
}

console.log(
  splitRuns === 0
    ? '\nevery run wears one variant across all its floors'
    : `\n${splitRuns} runs changed variant mid-descent`,
);

const bad = dead.length + silent.length + splitRuns;
console.log(
  bad === 0
    ? '\nOK — every biome variant rolls, and every one of them looks different.'
    : `\nFAILED — ${dead.length} never roll, ${silent.length} change nothing visible, ${splitRuns} split runs.`,
);
process.exit(bad === 0 ? 0 : 1);

/**
 * Is every class challenged at every depth, and walled at none?
 *
 *   node tools/check-curve.mjs                      every class, depths 1 5 12 25 40 (~2 min)
 *   node tools/check-curve.mjs --classes=ranger --depths=25 --trace
 *
 * Builds the hero a player would have at each depth and fights a real pack and
 * a real boss under the run's modifiers, over three seeds per cell. See
 * tools/curve-entry.ts for the model and the knobs used to tune
 * src/sim/HeroPower.ts. Rule from the owner: when a class is walled, make the
 * class stronger; never make monsters weaker or fewer.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.curveaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/curve-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs'), ...process.argv.slice(2)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { cases } = JSON.parse(lines[lines.length - 1]);

for (const c of cases) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(44)} ${c.detail}`);
}
const bad = cases.filter((c) => !c.ok);
console.log(bad.length === 0 ? '\nOK — every class is challenged at every depth and walled at none.' : `\nFAILED — ${bad.length} of ${cases.length}.`);
process.exit(bad.length === 0 ? 0 : 1);

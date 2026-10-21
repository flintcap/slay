/**
 * Is every class challenged at every depth, and walled at none?
 *
 *   node tools/check-curve.mjs                      every class, depths 1 5 12 25 40 (~2 min)
 *   node tools/check-curve.mjs --classes=ranger --depths=25 --trace
 *   node tools/check-curve.mjs --wide               every class at ten depths out to 60 (slow)
 *   node tools/check-curve.mjs --deep               every class at depths 30 45 60 75 90 100 (slow)
 *   node tools/check-curve.mjs --kit=rare           rares and caches only (default `chase`: sets and uniques found on the way)
 *   node tools/check-curve.mjs --jobs=2             cells at once (default 4)
 *
 * Builds the hero a player would have at each depth and fights a real pack and
 * a real boss under the run's modifiers, over three seeds per cell. See
 * tools/curve-entry.ts for the model and the knobs used to tune
 * src/sim/HeroPower.ts. Rule from the owner: when a class is walled, make the
 * class stronger; never make monsters weaker or fewer.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { promisify } from 'node:util';
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
// Each class and depth runs in its own process, a few at once: a fight leaves
// the game's module state behind, so cells sharing a process read by order.
const ENTRY = path.join(OUT, 'e.mjs');
const rest = process.argv.slice(2).filter((a) => !a.startsWith('--classes=') && !a.startsWith('--depths='));
const lastJson = (raw) => JSON.parse(raw.trim().split('\n').at(-1));
const cells = lastJson(execFileSync('node', ['--no-warnings', ENTRY, ...process.argv.slice(2), '--cells'], { encoding: 'utf8' }));
const run = promisify(execFile);
const results = new Array(cells.length);
let next = 0;
const worker = async () => {
  while (next < cells.length) {
    const i = next++;
    const [cls, depth] = cells[i];
    const { stdout, stderr } = await run('node', ['--no-warnings', ENTRY, ...rest, `--classes=${cls}`, `--depths=${depth}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (stderr) process.stderr.write(stderr);
    results[i] = lastJson(stdout).cases;
  }
};
const jobs = Number(process.argv.find((a) => a.startsWith('--jobs='))?.split('=')[1] ?? Math.min(4, availableParallelism()));
await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
rmSync(OUT, { recursive: true, force: true });
const cases = results.flat();

for (const c of cases) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(44)} ${c.detail}`);
}
const bad = cases.filter((c) => !c.ok);
console.log(bad.length === 0 ? '\nOK — every class is challenged at every depth and walled at none.' : `\nFAILED — ${bad.length} of ${cases.length}.`);
process.exit(bad.length === 0 ? 0 : 1);

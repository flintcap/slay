/**
 * Does every prop build, in every biome and variant, inside its budget and
 * its footprint?
 *
 *   node tools/check-propkit.mjs
 *
 * Headless (no browser). Fails on: a kind with no builder, a build error,
 * NaN vertices, a prop sunk below the floor or poking into the wall behind
 * it, a blocking prop much narrower than its collider (an invisible wall),
 * and triangle or draw-call budgets. Warns when a blocking prop's solid part
 * spills well past its collider, or a walk-through prop is tall enough to
 * read as solid.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.propkit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/propkit-entry.ts'), outDir: OUT, rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const d = JSON.parse(lines[lines.length - 1]);

const fails = [];
const warns = [];
if (d.missing.length) fails.push(`no builder: ${d.missing.join(' ')}`);
const FLOATERS = new Set(['voidRift', 'floatingStone', 'voidShard']);
/** Meant to be sunk in the ground. */
const SUNK = new Set(['idolHead']);
for (const r of d.rows) {
  const tag = r.kind.padEnd(16);
  const big = r.placement === 'feature';
  for (const e of r.errors.slice(0, 3)) fails.push(`${tag} build error ${e}`);
  if (r.nan) fails.push(`${tag} ${r.nan} NaN vertices`);
  if (r.minY < -0.12 && !SUNK.has(r.kind)) fails.push(`${tag} sunk ${r.minY.toFixed(2)} below the floor`);
  if (r.placement === 'wall' && r.minZ < d.wallFace - 0.06) fails.push(`${tag} pokes ${(d.wallFace - r.minZ).toFixed(2)} into the wall`);
  const triCap = r.placement === 'detail' ? 900 : big ? 9000 : 4000;
  if (r.tris > triCap) fails.push(`${tag} ${r.tris} tris > ${triCap}`);
  const callCap = r.kind.endsWith('Seal') ? 3 : r.placement === 'detail' ? 2 : big ? 7 : 5;
  if (r.calls > callCap) fails.push(`${tag} ${r.calls} draw calls > ${callCap}`);
  if (r.blocks && r.placement !== 'wall') {
    if (r.low < r.radius * 0.55) fails.push(`${tag} collider ${r.radius} but solid only ${r.low.toFixed(2)} wide: invisible wall`);
    else if (r.low > r.radius + 0.45) warns.push(`${tag} spills ${(r.low - r.radius).toFixed(2)} past its collider ${r.radius}`);
  }
  if (!r.blocks && r.placement !== 'wall' && r.placement !== 'detail' && r.maxY > 1.0 && !FLOATERS.has(r.kind)) warns.push(`${tag} walk-through but ${r.maxY.toFixed(2)} tall`);
}
console.log(`kinds ${d.rows.length}`);
const slow = [...d.rows].sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => `${r.kind} ${r.ms.toFixed(0)}ms`);
console.log(`slowest builds: ${slow.join(', ')}`);
const heavy = [...d.rows].sort((a, b) => b.tris - a.tris).slice(0, 6).map((r) => `${r.kind} ${r.tris}`);
console.log(`heaviest: ${heavy.join(', ')}`);
for (const w of warns) console.log(`warn  ${w}`);
for (const f of fails) console.log(`FAIL  ${f}`);
console.log(fails.length ? `FAIL (${fails.length})` : 'OK');
process.exit(fails.length ? 1 : 0);

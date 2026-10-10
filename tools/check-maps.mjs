/**
 * Are the zone generators sound? (map remake, docs/remake/maps.md)
 *
 * Builds areas from every zone generator in every biome that uses it, at
 * several tiers, as a single zone, a boss zone and (outdoors) a seamed pair,
 * and measures them. Hard rules fail the run:
 *  - every walkable tile is reachable from the arrival point
 *  - arrival and exit are walkable, and the exit is reachable
 *  - an arena has exactly one way in (its three-wide gate) and is reachable
 *  - nothing walkable touches the two-tile border
 * Everything else is reported: size, walkable share, largest open square,
 * share of narrow ground and the longest narrow run, rooms, height jumps,
 * generation time.
 *
 * Static: no browser, no renderer.
 *
 *   node tools/check-maps.mjs [--samples=4] [--dump=forest[:biome[:pair|boss]]] [--seed=1]
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.mapscheck');
const arg = (k, d) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/maps-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
    minify: false,
  },
});

const args = [path.join(OUT, 'entry.mjs'), arg('samples', '4')];
const dump = arg('dump', '');
if (dump) args.push(dump, arg('seed', '1'));
const raw = execFileSync('node', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });

if (dump) {
  console.log(raw);
  process.exit(0);
}

const lines = raw.trim().split('\n');
const rows = JSON.parse(lines[lines.length - 1]);
const fails = [];
for (const r of rows) {
  const tag = `${r.layout}/${r.biome}/${r.kind}@${r.depth}`;
  if (r.reached < 1) fails.push(`${tag}: ${((1 - r.reached) * 100).toFixed(2)}% of ground unreachable`);
  if (!r.entryOk) fails.push(`${tag}: arrival not walkable`);
  if (!r.exitOk) fails.push(`${tag}: exit not walkable or unreachable`);
  if (r.kind === 'boss' && r.arenaWays !== 3) fails.push(`${tag}: arena has ${r.arenaWays} shell openings (want 3)`);
  if (r.kind === 'boss' && !r.arenaReached) fails.push(`${tag}: arena unreachable`);
  if (r.border > 0) fails.push(`${tag}: ${r.border} walkable tiles on the border`);
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const max = (xs) => xs.reduce((a, b) => Math.max(a, b), 0);
const groups = new Map();
for (const r of rows) {
  const k = `${r.layout}/${r.biome}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
console.log('layout/biome               size(avg)   walk%  disc  narrow%  narrowRun  rooms  jumps  ms(avg/max)');
for (const [k, rs] of groups) {
  const size = `${Math.round(avg(rs.map((r) => r.w)))}x${Math.round(avg(rs.map((r) => r.h)))}`;
  console.log(
    `${k.padEnd(26)} ${size.padStart(9)}  ${(avg(rs.map((r) => r.share)) * 100).toFixed(0).padStart(5)}  ${avg(rs.map((r) => r.disc)).toFixed(1).padStart(4)}  ${(avg(rs.map((r) => r.narrowShare)) * 100).toFixed(1).padStart(7)}  ${String(max(rs.map((r) => r.narrowRun))).padStart(9)}  ${avg(rs.map((r) => r.rooms)).toFixed(1).padStart(5)}  ${avg(rs.map((r) => r.jumps)).toFixed(1).padStart(5)}  ${avg(rs.map((r) => r.ms)).toFixed(0).padStart(4)}/${max(rs.map((r) => r.ms)).toFixed(0)}`,
  );
}
console.log(`\n${rows.length} areas built.`);
if (fails.length) {
  console.log(`\nFAIL (${fails.length}):`);
  for (const f of fails.slice(0, 40)) console.log(`  ${f}`);
  process.exit(1);
}
console.log('PASS: every area connected, ports walkable, arenas sealed but for the gate.');

/**
 * Does the dungeon generator actually give the player variety?
 *
 * Three separate complaints get numbers here:
 *  - "every floor is the same brick maze" -> biome distribution per depth
 *  - "hallways are too tight" -> corridor open-width histogram
 *  - "nothing to interact with" -> interactable prop counts per level
 *
 * Static: no browser, no renderer, seconds to run.
 *
 *   node tools/check-mapgen.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.mapaudit');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/mapgen-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
    minify: false,
  },
});

const raw = execFileSync('node', [path.join(OUT, 'entry.mjs')], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
rmSync(OUT, { recursive: true, force: true });
// The world module logs a placeholder-catalogue warning before we print, so
// take the last line rather than the whole stream.
const lines = raw.trim().split('\n');
const { rows, biomeByDepth, biomes } = JSON.parse(lines[lines.length - 1]);

const pct = (n, d) => (d === 0 ? '  0%' : `${String(Math.round((n / d) * 100)).padStart(3)}%`);

console.log('=== biomes ===');
for (const b of biomes) console.log(`  ${b.id.padEnd(13)} unlocks at depth ${String(b.minDepth).padStart(2)}  ${b.layouts.join(', ')}`);

console.log('\n=== what biome you get, by depth (400 samples each) ===');
for (const depth of Object.keys(biomeByDepth).map(Number).sort((a, b) => a - b)) {
  const tally = biomeByDepth[depth];
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const parts = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${id} ${pct(n, total)}`);
  console.log(`  depth ${String(depth).padStart(2)}: ${parts.join('  ')}`);
}

console.log('\n=== layout shapes actually generated ===');
const byLayout = {};
for (const r of rows) byLayout[r.layout] = (byLayout[r.layout] ?? 0) + 1;
for (const [k, n] of Object.entries(byLayout).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)} ${String(n).padStart(4)} levels ${pct(n, rows.length)}`);
}

console.log('\n=== corridor width (tiles; 1 tile = 2.0m) ===');
const layouts = [...new Set(rows.map((r) => r.layout))].sort();
const header = ['layout'.padEnd(12), ...[1, 2, 3, 4, 5, 6, 7].map((w) => `w${w}`.padStart(5))].join(' ');
console.log(`  ${header}`);
for (const L of [...layouts, '(all)']) {
  const set = L === '(all)' ? rows : rows.filter((r) => r.layout === L);
  const hist = new Array(8).fill(0);
  for (const r of set) for (let i = 0; i < 8; i++) hist[i] += r.widthHist[i];
  const total = hist.reduce((a, b) => a + b, 0);
  const cells = [1, 2, 3, 4, 5, 6, 7].map((w) => pct(hist[w], total).padStart(5)).join(' ');
  console.log(`  ${L.padEnd(12)} ${cells}`);
}

const allHist = new Array(8).fill(0);
for (const r of rows) for (let i = 0; i < 8; i++) allHist[i] += r.widthHist[i];
const corridorTotal = allHist.reduce((a, b) => a + b, 0);
console.log(`\n  one-tile corridor share: ${pct(allHist[1], corridorTotal)} of all corridor tiles`);

console.log('\n=== level size ===');
for (const L of layouts) {
  const set = rows.filter((r) => r.layout === L);
  const avg = (f) => Math.round(set.reduce((a, r) => a + f(r), 0) / set.length);
  console.log(
    `  ${L.padEnd(12)} ${avg((r) => r.width)}x${avg((r) => r.height)}  rooms ${avg((r) => r.rooms)}  floor tiles ${avg((r) => r.floorTiles)}`,
  );
}

console.log('\n=== props per level ===');
const kindTally = {};
for (const r of rows) for (const [k, n] of Object.entries(r.propKinds)) kindTally[k] = (kindTally[k] ?? 0) + n;
const avgProps = (rows.reduce((a, r) => a + r.props, 0) / rows.length).toFixed(1);
const avgInter = (rows.reduce((a, r) => a + r.interactables, 0) / rows.length).toFixed(1);
console.log(`  average props: ${avgProps}   average interactable: ${avgInter}`);
const levelsWithNoInteract = rows.filter((r) => r.interactables === 0).length;
console.log(`  levels with zero interactables: ${levelsWithNoInteract} / ${rows.length} ${pct(levelsWithNoInteract, rows.length)}`);
for (const [k, n] of Object.entries(kindTally).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(14)} ${(n / rows.length).toFixed(2)} per level`);
}

console.log('\n=== room roles ===');
const roleTally = {};
for (const r of rows) for (const [k, n] of Object.entries(r.roomKinds)) roleTally[k] = (roleTally[k] ?? 0) + n;
for (const [k, n] of Object.entries(roleTally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(14)} ${(n / rows.length).toFixed(2)} per level`);
}
const shrineLevels = rows.filter((r) => r.shrineRooms > 0).length;
console.log(`  levels with a shrine room: ${shrineLevels} / ${rows.length} ${pct(shrineLevels, rows.length)}`);

console.log('\n=== connectivity (flood from the up-stairs) ===');
const noExit = rows.filter((r) => !r.exitReached);
console.log(`  levels where the exit is unreachable: ${noExit.length} / ${rows.length}`);
for (const r of noExit.slice(0, 10)) console.log(`    depth ${r.depth} level ${r.levelIndex} ${r.layout}`);
const stranded = rows
  .map((r) => ({ ...r, share: r.reached / r.floorTiles }))
  .filter((r) => r.share < 0.9)
  .sort((a, b) => a.share - b.share);
console.log(`  levels where under 90% of floor is reachable: ${stranded.length} / ${rows.length}`);
for (const r of stranded.slice(0, 10)) {
  console.log(`    depth ${r.depth} level ${r.levelIndex} ${r.layout.padEnd(10)} ${Math.round(r.share * 100)}% reachable`);
}
const avgShare = rows.reduce((a, r) => a + r.reached / r.floorTiles, 0) / rows.length;
console.log(`  average reachable share: ${(avgShare * 100).toFixed(1)}%`);

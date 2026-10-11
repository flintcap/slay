/**
 * Do ground decals lie on the ground?
 *
 *   node tools/check-decalheight.mjs
 *
 * Reported: "broken decals on the floor".
 *
 * A stain is a flat quad. Its height used to be baked into the geometry as a
 * constant — 0.018 for stains, 0.03 for telegraphs — so every decal in the game
 * sat at world zero. World zero is only the floor on the lowest height band. A
 * dungeon is built in bands of 0.45m, so a stain dropped in a raised room was
 * buried under its floor and a stain dropped in a sunken one floated over the
 * floor below, punched through by the polygon offset in ragged terrain-shaped
 * patches.
 *
 * This measures how much of the game is above band zero — that is, how much of
 * the floor the bug covered — and asserts the fix is still wired: a per-instance
 * ground height on both layers, and the dungeon feeding it the real floor.
 */
import { build } from 'vite';
import { rmSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.decalaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/decalheight-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { levels, biomes } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${levels} levels\n`);
console.log(`${pad('biome', 14)} ${pad('floor tiles', 12)} ${pad('above band 0', 13)} ${pad('share', 8)} tallest`);
let raised = 0;
let floor = 0;
for (const b of biomes) {
  raised += b.raised;
  floor += b.floorTiles;
  console.log(
    `${pad(b.biome, 14)} ${pad(b.floorTiles, 12)} ${pad(b.raised, 13)} ${pad(
      ((b.raised / Math.max(1, b.floorTiles)) * 100).toFixed(1) + '%',
      8,
    )} ${b.tallest.toFixed(2)}m`,
  );
}
console.log(
  `\n${((raised / Math.max(1, floor)) * 100).toFixed(1)}% of walkable floor is off world zero — every decal dropped there was in the wrong place.`,
);

// Numbers are history. What matters is that the wiring is still there.
const decals = readFileSync(path.join(ROOT, 'src/fx/Decals.ts'), 'utf8');
const ground = readFileSync(path.join(ROOT, 'src/fx/kit/Ground.ts'), 'utf8');
const scene = readFileSync(path.join(ROOT, 'src/scenes/DungeonScene.ts'), 'utf8');
const asks = (decals.match(/this\.groundAt\(/g) ?? []).length;
const rules = [
  ['floor marks carry a ground height', /attribute vec4 iE;\s+\/\/ floor y/, ground],
  ['they are drawn on it', /vec3 wp = vec3\(iX\.x \+ rot\.x, iE\.x \+ lift, iX\.y \+ rot\.y\);/, ground],
  ['the height is uploaded', /A\.iE\[o\] = g\.y;/, ground],
  ['telegraphs use the same layer', /this\.tells = new GroundLayer\(/, decals],
  ['the system takes a floor probe', /setGround\(fn: \(x: number, z: number\) => number\)/, decals],
  ['marks, glows and telegraphs ask for it', { test: () => asks >= 3 }, decals],
  ['the dungeon supplies the real floor', /this\.decals\.setGround\(\(x, z\) => this\.mesh\.floorY\(x, z\)\);/, scene],
];
console.log('\nand the wiring is still there:');
const unwired = [];
for (const [name, re, src] of rules) {
  const ok = re.test(src);
  if (!ok) unwired.push(name);
  console.log(`  ${pad(name, 32)} ${ok ? 'yes' : 'NO'}`);
}

console.log(
  unwired.length === 0
    ? '\nOK — decals lie on the floor they were dropped on.'
    : `\nFAILED — ${unwired.length} rules broken; decals are back at world zero.`,
);
process.exit(unwired.length === 0 ? 0 : 1);

/**
 * Where does the player get stopped by nothing?
 *
 *   node tools/check-blockers.mjs
 *
 * Every blocking prop makes a square of floor solid, sized from `def.radius`.
 * What gets drawn is the template's geometry. This lists the kinds where those
 * two disagree, worst first: `bare` is how many metres of empty-looking floor
 * are solid around the prop.
 */
import { build } from 'vite';
import { rmSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.blockaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/blockers-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { levels, blockers, kinds, fits, culprits } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
const num = (n) => n.toFixed(2);
console.log(`${levels} levels, ${blockers} blocking props placed\n`);
console.log(
  `${pad('prop', 16)} ${pad('placement', 10)} ${pad('n', 6)} ${pad('collider', 9)} ${pad('mesh', 7)} ${pad('offset', 7)} bare`,
);
// A quarter of a metre of invisible floor is inside the player's own width and
// nobody notices. Past that you walk into air.
const TOL = 0.25;
let bad = 0;
for (const k of kinds) {
  const flag = k.noMesh ? '   <-- NO MESH' : k.bareRing > TOL ? '   <-- INVISIBLE WALL' : '';
  if (k.noMesh || k.bareRing > TOL) bad++;
  console.log(
    `${pad(k.kind, 16)} ${pad(k.placement, 10)} ${pad(k.count, 6)} ${pad(num(k.colliderHalf), 9)} ${pad(
      num(k.meshHalf),
      7,
    )} ${pad(num(k.offset), 7)} ${pad(num(k.bareRing), 6)}${flag}`,
  );
}

// Part two: places the game says you can walk and the body cannot fit.
console.log('\nspots the game routes you to but your body cannot reach:');
console.log(
  `  ${pad('depth', 7)} ${pad('biome', 14)} ${pad('floor', 8)} ${pad('bare', 8)} ${pad('on prop', 8)} ${pad('cut off', 8)} share`,
);
let lost = 0;
let floor = 0;
for (const f of fits) {
  const bad2 = f.sealed + f.cutOff;
  lost += bad2;
  floor += f.navReach;
  if (bad2 === 0) continue;
  console.log(
    `  ${pad(f.depth, 7)} ${pad(f.biome, 14)} ${pad(f.navReach, 8)} ${pad(f.sealed, 8)} ${pad(f.onProp, 8)} ${pad(
      f.cutOff,
      8,
    )} ${((bad2 / Math.max(1, f.navReach)) * 100).toFixed(1)}%`,
  );
}
const lostPct = (lost / Math.max(1, floor)) * 100;
console.log(`  ${lost} of ${floor} floor tiles (${lostPct.toFixed(2)}%)`);
if (culprits.length > 0) {
  console.log('\n  blamed on:');
  for (const [k, n] of culprits) console.log(`    ${pad(k, 16)} ${n}`);
}
// Half a percent of a floor is a couple of dead ends. Past that it is the
// shape of the level and the player notices.
const FIT_TOL = 0.5;
if (lostPct > FIT_TOL) bad++;

// The numbers above only mean something while the builder still derives the
// collider the way this models it.
const src =
  readFileSync(path.join(ROOT, 'src/world/DungeonBuilder.ts'), 'utf8') +
  readFileSync(path.join(ROOT, 'src/entities/Player.ts'), 'utf8');
const rules = [
  ['collider comes from def.radius', /const r = def\.radius \* s \* 2;/],
  ['collider sits on the tile centre', /this\.colliders\.push\(\{ x: this\.tileX\(p\.x\), z: this\.tileZ\(p\.y\), w: r, d: r \}\)/],
  ['wall props are drawn offset', /const off = def\.placement === 'wall' \? \(def\.wallOffset \?\? 0\.7\) : 0;/],
  ['the player is a 0.42m disc', /readonly radius = 0\.42;/],
];
console.log('\nand the builder still works that way:');
const unwired = [];
for (const [name, re] of rules) {
  const ok = re.test(src);
  if (!ok) unwired.push(name);
  console.log(`  ${pad(name, 32)} ${ok ? 'yes' : 'NO'}`);
}

console.log(
  bad === 0 && unwired.length === 0
    ? '\nOK — every blocker you bump into is a thing you can see, and you fit everywhere you are sent.'
    : `\nFAILED — ${bad} problems, ${unwired.length} rules broken.`,
);
process.exit(bad === 0 && unwired.length === 0 ? 0 : 1);

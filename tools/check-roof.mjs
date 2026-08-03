/**
 * Are there real holes in the rock above the dungeon?
 *
 *   node tools/check-roof.mjs
 *
 * Counts two kinds, per biome: solid tiles that emit no top quad at all, and
 * neighbouring caps at different heights with nothing closing the step. Both
 * are holes you can see the void through from the game camera.
 */
import { build } from 'vite';
import { rmSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.roofaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/roof-entry.ts'),
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
console.log(
  `${pad('biome', 14)} ${pad('solid tiles', 12)} ${pad('uncapped', 10)} ${pad('open steps', 11)} worst step`,
);
let bad = 0;
for (const b of biomes) {
  const broken = b.uncapped + b.openSteps;
  bad += broken;
  console.log(
    `${pad(b.biome, 14)} ${pad(b.solidTiles, 12)} ${pad(b.uncapped, 10)} ${pad(b.openSteps, 11)} ${pad(b.worstStep + 'm', 7)}${
      b.haveHeights ? '' : ' (no heights)'
    }${broken > 0 ? '   <-- HOLES' : ''}`,
  );
}

// The model above says the rock is closed. That is only worth anything if the
// builder still works the way the model assumes, so read it and check.
const src = readFileSync(path.join(ROOT, 'src/world/DungeonBuilder.ts'), 'utf8');
const rules = [
  ['one flat rock height per level', /const roofY = maxStep \* STEP_HEIGHT \+ wallH;/],
  ['void tiles cap at it', /surfs\[BEDROCK\]\.flat\(wx, roofY, wz/],
  ['wall tiles cap at it', /this\.emitWall\(surfs, x, y, wx, wz, hy, roofY,/],
  ['every wall tile is capped', /^\s*s\.flat\(wx, topY, wz, HALF, true, x % 4, y % 4, 1\);$/m],
];
console.log('\nand the builder still works that way:');
const unwired = [];
for (const [name, re] of rules) {
  const ok = re.test(src);
  if (!ok) unwired.push(name);
  console.log(`  ${pad(name, 30)} ${ok ? 'yes' : 'NO'}`);
}
// The old bug in one line: a cap that only some wall tiles get.
if (/if \(exposed\) s\.flat\(/.test(src)) {
  unwired.push('wall caps are conditional again');
  console.log('  wall caps are conditional again  YES  <-- the original bug is back');
}

console.log(
  bad === 0 && unwired.length === 0
    ? '\nOK — the rock above the dungeon is a closed surface everywhere.'
    : `\nFAILED — ${bad} holes in the rock, ${unwired.length} rules broken.`,
);
process.exit(bad === 0 && unwired.length === 0 ? 0 : 1);

/**
 * Can a level-one character of each class actually fight?
 *
 *   node tools/check-starter-power.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.starterpower');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/starter-power-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { mobLife, mobDamage, floorOneMonsters, rows } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
console.log(`floor one: ${floorOneMonsters} monsters, ${mobLife} life each, ${mobDamage} damage a hit\n`);
console.log(
  `${pad('class', 13)} ${pad('life', 6)} ${pad('mana', 6)} ${pad('regen', 7)} ${pad('opener', 14)} ${pad('cost', 6)} ${pad('hit', 6)} ${pad('casts', 7)} ${pad('to kill', 8)} ${pad('kills/pool', 11)} hits to die`,
);
const bad = [];
for (const r of rows) {
  // Two casts of headroom on a kill, and four hits before dying, is the floor
  // below which a class cannot open a fight it did not start.
  const weak = r.killsPerPool < 2 || r.hitsToDie < 4;
  if (weak) bad.push(r.cls);
  console.log(
    `${pad(r.cls, 13)} ${pad(r.life, 6)} ${pad(r.mana, 6)} ${pad(r.manaRegen, 7)} ${pad(r.skill, 14)} ${pad(r.manaCost, 6)} ${pad(r.hit, 6)} ${pad(r.castsPerPool, 7)} ${pad(r.castsToKill, 8)} ${pad(r.killsPerPool, 11)} ${r.hitsToDie}${weak ? '   <-- CANNOT OPEN' : ''}`,
  );
}
console.log(
  bad.length === 0
    ? '\nOK — every class can fight on floor one.'
    : `\nFAILED — ${bad.join(', ')} cannot fight on floor one.`,
);
process.exit(bad.length === 0 ? 0 : 1);

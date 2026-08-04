/**
 * Can a player actually meet every named rare?
 *
 *   node tools/check-named.mjs
 *
 * Fails when a name never spawns, or when they are so common that meeting one
 * stops being worth mentioning.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.namedaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/named-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { floors, named, perFloor, rows } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${floors} floors, ${named} named rares, ${perFloor} per floor\n`);
console.log(`${pad('name', 28)} ${pad('depth', 7)} ${pad('biomes', 26)} seen`);
const dead = [];
for (const r of rows) {
  if (r.seen === 0) dead.push(r.name);
  console.log(
    `${pad(r.name, 28)} ${pad(r.minDepth + '+', 7)} ${pad((r.biomes.join(',') || 'any').slice(0, 25), 26)} ${r.seen}${
      r.seen === 0 ? '   <-- NEVER SPAWNS' : ''
    }`,
  );
}

// Roughly one every couple of floors. Rarer and it is a myth; commoner and the
// name stops carrying anything.
const tooCommon = perFloor > 1.2;
const tooRare = perFloor < 0.08;
if (tooCommon) console.log('\nnamed rares are too common to feel special');
if (tooRare) console.log('\nnamed rares are so rare a player may never meet one');

const bad = dead.length + (tooCommon ? 1 : 0) + (tooRare ? 1 : 0);
console.log(
  bad === 0
    ? '\nOK — every named rare is reachable, and meeting one is still an event.'
    : `\nFAILED — ${dead.length} never spawn.`,
);
process.exit(bad === 0 ? 0 : 1);

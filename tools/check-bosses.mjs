/**
 * Are all twenty-four bosses reachable, and are they coded soundly?
 *
 * Reported: "I only ever see the one boss." A roster is worthless if the depth
 * and biome gating only ever surfaces the first entry. This samples the real
 * picker 400 times per depth and reports what a player actually meets, then
 * checks every boss for phases, abilities that exist, adds that exist, and the
 * rest of the required fields.
 *
 *   node tools/check-bosses.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.bossaudit');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/boss-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const d = JSON.parse(lines[lines.length - 1]);

const pct = (n, t) => `${String(Math.round((n / t) * 100)).padStart(3)}%`;

console.log(`=== roster: ${d.roster.length} bosses ===`);
for (const b of d.roster) {
  console.log(
    `  ${b.name.padEnd(15)} depth ${String(b.minDepth).padStart(2)}  ${b.phases} phases  ` +
      `${String(b.abilities).padStart(2)} abilities  arenas [${b.arenas.join(',')}]  adds ${b.adds.length}`,
  );
}

console.log('\n=== who you actually fight, by depth (400 runs each) ===');
for (const depth of Object.keys(d.seenAt).map(Number).sort((a, b) => a - b)) {
  const tally = d.seenAt[depth];
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const byName = Object.fromEntries(d.roster.map((b) => [b.id, b.name]));
  const parts = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${byName[id] ?? id} ${pct(n, total)}`);
  console.log(`  depth ${String(depth).padStart(2)}: ${Object.keys(tally).length} distinct — ${parts.join('  ')}`);
}

const never = d.roster.filter((b) => !d.everSeen.includes(b.id));
console.log(`\nbosses never picked at any sampled depth: ${never.length ? never.map((b) => b.name).join(', ') : 'none'}`);

console.log('\n=== structural defects ===');
if (d.defects.length === 0) console.log('  none');
for (const x of d.defects) console.log(`  ${x.id}: ${x.problem}`);

const ok = d.defects.length === 0 && never.length === 0;
console.log(ok ? '\nOK — every boss is sound and every boss is reachable.' : '\nFAILED');
process.exit(ok ? 0 : 1);

/**
 * Does every item power actually do what its tooltip says?
 *
 *   node tools/check-items.mjs
 *
 * Covers unique signature effects, set-bonus powers, power affixes on rares,
 * authored set bonuses reaching the stat sheet, and Life/Mana Steal. See
 * `tools/items-entry.ts` for what each check means.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.itemsaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/items-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const r = JSON.parse(lines[lines.length - 1]);

console.log('loot filter, share of gear shown:', JSON.stringify(r.filterShown));
console.log('rarity hits at ilvl 90 (200k rolls, 300% MF):', JSON.stringify(r.rarityHits));
console.log(`affixes seen at T1: ${r.t1Affixes}`);
console.log(`${r.powers} powers (${r.affixPowers} can roll as affixes)`);
console.log(`${r.specials} unique specials, ${r.setPowers} set powers`);
console.log(`${r.runtimeChecks} runtime probes, ${r.runtimeFailed.length} failed`);
console.log(`rares with a power: ${(r.rareRate * 100).toFixed(1)}%   magic: ${(r.magicRate * 100).toFixed(1)}%`);
console.log('\nset            pieces  stats  power');
for (const s of r.sets) console.log(`${s.id.padEnd(18)} ${String(s.pieces).padEnd(6)} ${s.statsOk ? 'ok' : 'NO'}     ${s.powerOk ? 'ok' : 'NO'}`);
console.log('\npower affix drops:');
for (const [id, n] of Object.entries(r.affixSeen)) console.log(`  ${id.padEnd(18)} ${n}`);

if (r.problems.length) {
  console.log('\nPROBLEMS');
  for (const p of r.problems) console.log('  - ' + p);
  console.log(`\nFAILED — ${r.problems.length} problem(s).`);
  process.exit(1);
}
console.log('\nOK — every power is real, wired, and reachable.');

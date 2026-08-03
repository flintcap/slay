/**
 * A normal ring must not be a blank object.
 *
 * Jewellery has no base stats — no damage, no armour — so every point a ring,
 * amulet or charm gives comes from its affixes. Normal rarity rolled none, so a
 * white ring did literally nothing when equipped. This checks that every
 * jewellery base now rolls at least one affix at normal rarity, and that
 * weapons and armour still do not.
 *
 *   node tools/check-jewelry.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.jewel');
const ENTRY = path.join(ROOT, 'tools/.jewel-entry.ts');

writeFileSync(
  ENTRY,
  `import { createItem, rollItem } from '../src/sim/Loot';
import { streamFor } from '../src/core/RNG';
import { ITEM_BASES, JEWELRY_CATEGORIES, findBase } from '../src/data/itemBases';

const rows: Record<string, unknown>[] = [];
for (const base of ITEM_BASES) {
  if (!JEWELRY_CATEGORIES.includes(base.category)) continue;
  let blank = 0;
  const examples: string[] = [];
  for (let i = 0; i < 120; i++) {
    const rng = streamFor(i * 7919, 'jewel:' + base.id);
    const it = createItem(base.id, Math.max(base.levelReq, 10), rng, 'normal');
    const rolled = it.mods.filter((m) => m.kind !== 'implicit');
    if (rolled.length === 0) blank++;
    else if (examples.length < 1) examples.push(rolled.map((m) => m.stat + ' ' + m.value).join(', '));
  }
  rows.push({ id: base.id, category: base.category, blank, examples });
}

// Drops go through rollItem, not createItem — check that path too.
let dropBlank = 0;
let dropSeen = 0;
for (let i = 0; i < 4000 && dropSeen < 200; i++) {
  const rng = streamFor(i * 2654435761, 'drop');
  const it = rollItem(40, rng, { forceRarity: 'normal' });
  const b = findBase(it?.baseId ?? '');
  if (!it || !b || !JEWELRY_CATEGORIES.includes(b.category)) continue;
  dropSeen++;
  if (it.mods.filter((m) => m.kind !== 'implicit').length === 0) dropBlank++;
}

let armed = 0;
let checked = 0;
for (const base of ITEM_BASES) {
  if (JEWELRY_CATEGORIES.includes(base.category)) continue;
  for (let i = 0; i < 12; i++) {
    const rng = streamFor(i * 104729, 'ctrl:' + base.id);
    const it = createItem(base.id, Math.max(base.levelReq, 10), rng, 'normal');
    checked++;
    if (it.mods.some((m) => m.kind !== 'implicit')) armed++;
  }
}
console.log(JSON.stringify({ rows, drops: { seen: dropSeen, blank: dropBlank }, control: { checked, armed } }));
`,
);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: { ssr: ENTRY, outDir: OUT, rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
rmSync(ENTRY, { force: true });
const lines = raw.trim().split('\n');
const d = JSON.parse(lines[lines.length - 1]);

console.log('normal-rarity jewellery, 120 rolls each:\n');
for (const r of d.rows) {
  console.log(`  ${r.id.padEnd(20)} blank ${String(r.blank).padStart(3)}/120   e.g. ${r.examples[0] ?? '-'}`);
}
console.log(`\ndrop path (rollItem, forced normal): ${d.drops.blank} blank of ${d.drops.seen} jewellery drops`);
console.log(`control, weapons and armour that must stay unaffixed: ${d.control.armed} of ${d.control.checked} carry an affix`);

const bad = d.rows.filter((r) => r.blank > 0);
const ok = bad.length === 0 && d.drops.blank === 0 && d.control.armed === 0;
if (bad.length) console.log(`\nstill blank: ${bad.map((r) => r.id).join(', ')}`);
console.log(ok ? '\nOK — no blank jewellery, and normal gear is untouched.' : '\nFAILED');
process.exit(ok ? 0 : 1);

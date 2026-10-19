/**
 * Headless facts about charms, for `check-charms.mjs`. Prints one JSON line.
 */
import { Random } from '../src/core/RNG';
import { rollCharm, rollDrops, rollItem, getBase } from '../src/sim/Loot';
import { itemSize } from '../src/sim/Grid';
import { charmStats } from '../src/sim/Stats';
import { createCharacter } from '../src/sim/Character';
import { UNIQUES } from '../src/data/uniques';
import { getAffix } from '../src/data/affixes';
import type { Item } from '../src/types';
import { makeTrinket, packChart, rollTrinket, spendTrinket, unpackChart } from '../src/sim/Trinkets';
import { TRINKETS } from '../src/data/trinkets';

const problems: string[] = [];
const fail = (s: string): void => {
  if (problems.length < 40) problems.push(s);
};

const SIZES: Record<string, string> = { 'charm.small': '1x1', 'charm.medium': '1x2', 'charm.large': '1x3', 'charm.grand': '2x3' };
const GRAND_ONLY = new Set(['critChance', 'critDamage', 'elementalDamagePct', 'enhancedDamage', 'attackSpeed', 'castSpeed', 'skillLevels']);

for (const [id, want] of Object.entries(SIZES)) {
  const b = getBase(id);
  if (!b || b.id !== id || b.category !== 'charm') fail(`base ${id} missing`);
  else {
    const fake = { baseId: id } as Item;
    const s = itemSize(fake);
    if (`${s.w}x${s.h}` !== want) fail(`${id} is ${s.w}x${s.h}, want ${want}`);
  }
}

const rng = new Random(7);
const tally: Record<string, number> = {};
const bySize: Record<string, number> = {};
let named = 0;
for (let i = 0; i < 6000; i++) {
  const ilvl = 1 + (i % 95);
  const c = rollCharm(ilvl, rng, 200);
  tally[c.rarity] = (tally[c.rarity] ?? 0) + 1;
  bySize[c.baseId] = (bySize[c.baseId] ?? 0) + 1;
  if (c.rarity === 'normal' || c.rarity === 'set') fail(`charm rolled ${c.rarity}`);
  if (c.uniqueId) {
    named++;
    continue;
  }
  if (c.mods.length === 0) fail(`empty ${c.rarity} ${c.baseId} at ilvl ${ilvl}`);
  for (const m of c.mods) {
    const a = getAffix(m.affixId);
    if (!a || !m.affixId.startsWith('charm.')) fail(`${c.baseId} rolled non-charm line ${m.affixId}`);
    else if (a.bases && !a.bases.includes(c.baseId)) fail(`${c.baseId} rolled ${m.affixId} meant for ${a.bases}`);
    if (GRAND_ONLY.has(m.stat) && c.baseId !== 'charm.grand') fail(`${c.baseId} rolled grand-only ${m.stat}`);
  }
}

// Rings and amulets never roll charm lines, and plain drops are never charms.
for (let i = 0; i < 3000; i++) {
  const it = rollItem(10 + (i % 80), rng, { magicFind: 300 });
  if (getBase(it.baseId).category === 'charm') fail(`rollItem made a charm (${it.name})`);
  for (const m of it.mods) if (m.affixId.startsWith('charm.')) fail(`${it.baseId} rolled charm line ${m.affixId}`);
}

// Kills do drop them, rarely.
let dropped = 0;
let kills = 0;
for (let i = 0; i < 4000; i++) {
  for (const rank of ['normal', 'normal', 'normal', 'champion', 'elite'] as const) {
    kills++;
    const d = rollDrops(20 + (i % 60), rank, rng);
    dropped += d.items.filter((x) => getBase(x.baseId).category === 'charm').length;
  }
}
if (dropped === 0) fail('no charm ever dropped from kills');

// Named charms.
const named0 = UNIQUES.filter((u) => getBase(u.baseId).category === 'charm');
for (const size of Object.keys(SIZES)) if (!named0.some((u) => u.baseId === size)) fail(`no named ${size}`);

// The pack is what counts.
const c = createCharacter('Tester', 'warden', new Random(3));
c.level = 90;
const one = rollCharm(60, rng, 0, 'charm.grand');
const twinDef = named0.find((u) => u.baseId === 'charm.small')!;
let twinA: Item | null = null;
for (let i = 0; i < 20000 && !twinA; i++) {
  const x = rollCharm(90, rng, 5000, 'charm.small');
  if (x.uniqueId === twinDef.id) twinA = x;
}
if (!twinA) fail(`could not roll ${twinDef.id}`);
else {
  const twinB: Item = { ...twinA, uid: twinA.uid + 'b' };
  c.inventory = new Array(60).fill(null);
  c.inventory[0] = twinA;
  const solo = charmStats(c);
  c.inventory[5] = twinB;
  const dup = charmStats(c);
  if (JSON.stringify(solo) !== JSON.stringify(dup)) fail('two copies of a named charm both counted');
  c.level = 1;
  const young = charmStats(c);
  if (Object.values(young).some((v) => v !== 0)) fail('a charm worked below its required level');
  c.level = 90;
}
c.inventory = new Array(60).fill(null);
c.inventory[10] = one;
const st = charmStats(c);
if (!Object.values(st).some((v) => v > 0)) fail('a grand charm in the pack gave nothing');

// Trinkets: one cell, unique, rare from bosses, the commoner one far more often.
const trinkets: Record<string, number> = {};
const trng = new Random(11);
for (let i = 0; i < 20000; i++) {
  const t = rollTrinket(trng, 'boss');
  if (t) trinkets[t.baseId] = (trinkets[t.baseId] ?? 0) + 1;
}
const trinketShare = Object.values(trinkets).reduce((a, b) => a + b, 0) / 20000;
if (trinketShare < 0.04 || trinketShare > 0.1) fail(`a boss drops a trinket ${(trinketShare * 100).toFixed(1)}% of the time`);
if ((trinkets['trinket.town'] ?? 0) <= (trinkets['trinket.death'] ?? 0) * 2) fail(`trinket split ${JSON.stringify(trinkets)}`);
for (const def of TRINKETS) {
  const t = makeTrinket(def.id, trng);
  if (!t) {
    fail(`no trinket ${def.id}`);
    continue;
  }
  const sz = itemSize(t);
  if (t.rarity !== 'unique' || sz.w !== 1 || sz.h !== 1) fail(`${def.id} is ${t.rarity} ${sz.w}x${sz.h}`);
}
c.inventory = new Array(60).fill(null);
c.inventory[3] = makeTrinket('trinket.death', trng);
c.inventory[9] = makeTrinket('trinket.death', trng);
if (!spendTrinket(c, 'death') || c.inventory.filter(Boolean).length !== 1) fail('spending a trinket did not take exactly one');
if (spendTrinket(c, 'portal')) fail('spent a trinket the hero does not carry');
const seen = new Uint8Array(77);
for (const i of [0, 5, 8, 40, 76]) seen[i] = 1;
if (unpackChart(packChart(seen), 77).join() !== seen.join()) fail('a chart does not survive the portal');

console.log(JSON.stringify({ problems, tally, bySize, named, dropped, kills, namedDefs: named0.length, trinkets }));

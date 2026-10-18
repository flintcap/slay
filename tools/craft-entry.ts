/**
 * Entry point for `tools/check-craft.mjs`.
 *
 * The blacksmith's targeted crafts, driven through the same functions the
 * panel calls:
 *
 *   1. Bound reroll. Bound lines come through exactly as they were; every
 *      other line is new; no group twice; a side never past the richest drop;
 *      binding costs cloth and more gold; more lines than allowed is refused
 *      and charges nothing; the Enchanter's mark leaves with its line.
 *   2. Hone. One rung up the ladder, never a lower value, marked honed; one
 *      line per item; a line at the top of what it may reach is refused and
 *      charges nothing; uniques refused.
 */
import './depth-catalog';
import { Random } from '../src/core/RNG';
import { save } from '../src/core/Save';
import { createCharacter } from '../src/sim/Character';
import { AFFIXES, rollItem } from '../src/sim/Loot';
import { canHone, honeCost, honeLine, honeTarget, maxLocks, rerollAffixes, rerollCost } from '../src/sim/Crafting';
import { MATERIALS } from '../src/data/materials';

const problems: string[] = [];
const report: Record<string, unknown> = {};
const groupOf = (id: string) => AFFIXES.find((a) => a.id === id)?.group;
const lines = <T extends { kind: string }>(mods: T[]): T[] => mods.filter((m) => m.kind === 'prefix' || m.kind === 'suffix');

const c = createCharacter('Smith', 'warden', new Random(11));
c.level = 60;
save.account.current = c;
const stock = () => {
  c.gold = 1e9;
  for (const m of MATERIALS) save.addMaterial(m.id, 999 - save.materialCount(m.id));
};

// ---------------------------------------------------------------------------
// 1. Bound reroll
// ---------------------------------------------------------------------------
{
  let tried = 0;
  for (let s = 0; s < 40; s++) {
    stock();
    const item = rollItem(20 + s * 2, new Random(100 + s), { forceRarity: s % 4 === 0 ? 'magic' : 'rare' });
    const ls = lines(item.mods);
    if (ls.length < 2) continue;
    tried++;
    const cap = maxLocks(item);
    const at = item.mods.map((m, i) => i).filter((i) => item.mods[i]!.kind === 'prefix' || item.mods[i]!.kind === 'suffix').slice(0, cap);
    const kept = at.map((i) => JSON.stringify(item.mods[i]));
    item.enchantedMod = item.mods[at.length ? at[0]! : 0]!.affixId;
    const plain = rerollCost(item, 0);
    const bound = rerollCost(item, at.length);
    if (!(bound.gold > plain.gold) || Object.keys(bound.materials).length <= Object.keys(plain.materials).length) problems.push('binding a line costs no more than a plain reroll');
    const gold = c.gold;
    const r = rerollAffixes(item, new Random(900 + s), at);
    if (!r.ok) {
      problems.push(`bound reroll refused: ${r.reason}`);
      continue;
    }
    if (gold - c.gold !== bound.gold) problems.push(`bound reroll charged ${gold - c.gold}, not ${bound.gold}`);
    const after = lines(item.mods).map((m) => JSON.stringify(m));
    for (const k of kept) if (!after.includes(k)) problems.push(`a bound line did not come through: ${k}`);
    const groups = lines(item.mods).map((m) => groupOf(m.affixId));
    if (new Set(groups).size !== groups.length) problems.push(`a bound reroll doubled a group on ${item.name}`);
    const side = item.rarity === 'rare' ? 4 : 1;
    const p = item.mods.filter((m) => m.kind === 'prefix').length;
    const sx = item.mods.filter((m) => m.kind === 'suffix').length;
    if (p > side || sx > side) problems.push(`a bound reroll left a ${item.rarity} with ${p} prefixes and ${sx} suffixes`);
    if (item.enchantedMod !== JSON.parse(kept[0]!).affixId) problems.push('the Enchanter mark left a line that stayed');
    // Unbound now: the mark goes with the line.
    stock();
    rerollAffixes(item, new Random(1900 + s), []);
    if (item.enchantedMod && !item.mods.some((m) => m.affixId === item.enchantedMod)) problems.push('the Enchanter mark points at a line that is gone');
    // Too many bound lines: refused and free.
    stock();
    const g2 = c.gold;
    const all = item.mods.map((m, i) => i).filter((i) => item.mods[i]!.kind === 'prefix' || item.mods[i]!.kind === 'suffix');
    if (all.length > cap && rerollAffixes(item, new Random(1), all).ok) problems.push('more lines than allowed were bound');
    if (c.gold !== g2) problems.push('a refused bound reroll still charged');
  }
  report.bind = `${tried} items rerolled with bound lines`;
  if (tried < 25) problems.push(`only ${tried} items tried`);
}

// ---------------------------------------------------------------------------
// 2. Hone
// ---------------------------------------------------------------------------
{
  let honed = 0;
  let tried = 0;
  const gains: number[] = [];
  for (let s = 0; s < 60; s++) {
    stock();
    const item = rollItem(10 + s, new Random(3000 + s), { forceRarity: s % 3 === 0 ? 'magic' : 'rare' });
    const idx = item.mods.findIndex((m, i) => canHone(item, i).ok);
    if (idx < 0) continue;
    tried++;
    const before = { ...item.mods[idx]! };
    const next = honeTarget(item, idx)!;
    const gold = c.gold;
    const r = honeLine(item, idx, new Random(s));
    if (!r.ok) {
      problems.push(`hone refused: ${r.reason}`);
      continue;
    }
    const m = item.mods[idx]!;
    if (gold - c.gold !== honeCost(item).gold) problems.push('hone charged the wrong gold');
    if (m.tier !== before.tier + 1 || m.tier !== next.tier) problems.push(`hone moved tier ${before.tier} to ${m.tier}`);
    if (!(m.value > before.value)) problems.push(`hone did not raise the value (${before.value} -> ${m.value})`);
    if (!m.honed) problems.push('a honed line is not marked');
    if (m.affixId !== before.affixId || m.kind !== before.kind) problems.push('hone changed what the line is');
    gains.push(m.value / before.value - 1);
    const g2 = c.gold;
    if (item.mods.some((x, i) => canHone(item, i).ok) || honeLine(item, (idx + 1) % item.mods.length, new Random(1)).ok) problems.push('a second line was honed');
    if (c.gold !== g2) problems.push('a refused hone still charged');
    honed++;
  }
  // A line at the top of its ladder cannot be honed.
  const top = rollItem(90, new Random(77), { forceRarity: 'rare' });
  const i = top.mods.findIndex((m) => m.kind === 'prefix' || m.kind === 'suffix');
  if (i >= 0) {
    const def = AFFIXES.find((a) => a.id === top.mods[i]!.affixId)!;
    top.mods[i]!.tier = def.tiers[def.tiers.length - 1]!.tier;
    if (canHone(top, i).ok) problems.push('a line at the top of its ladder could be honed');
  }
  const unique = rollItem(40, new Random(78), { forceRarity: 'unique' });
  if (unique.rarity === 'unique' && unique.mods.some((m, k) => canHone(unique, k).ok)) problems.push('a unique could be honed');
  const avg = gains.reduce((a, b) => a + b, 0) / Math.max(1, gains.length);
  report.hone = `${honed} of ${tried} lines honed, average gain ${Math.round(avg * 100)}%; at ilvl 40 a rare costs ${JSON.stringify(honeCost(rollItem(40, new Random(5), { forceRarity: 'rare' })))}`;
  if (tried < 30) problems.push(`only ${tried} items had a line to hone`);
}

console.log(JSON.stringify({ problems, report }));

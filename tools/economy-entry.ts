/**
 * Entry point for `tools/check-economy.mjs`.
 *
 * The systems half of balance: what a descent pays, what the camp charges,
 * and whether loot keeps pace with depth. (The fight half, class against
 * depth, is the combat stream's harness.)
 *
 * One character per class plays an honest career on generated runs with the
 * real bestiary: every descent is the next depth, every monster on every
 * floor dies and drops through the real `rollDrops`, every chest opens. From
 * that it reports, by depth:
 *
 *   - character level reached, against the monster level of that depth
 *   - gold per descent, against the camp's prices at that level
 *     (a gamble, a reforge, an imbue, the next upgrade)
 *   - items per descent by rarity, and usable items for the class
 *   - how much better (vendor value) the gear dropping at that depth is
 *
 * and fails when a service is out of reach of a descent's gold, when the
 * level curve leaves a character far below its monsters, when drops stop
 * improving with depth, or when a class finds too little it can use.
 */
import './depth-catalog';
import type { CharClassId, Item, MonsterRank } from '../src/types';
import { Random } from '../src/core/RNG';
import { save } from '../src/core/Save';
import { generateRun, isPlainChest } from '../src/world/DungeonGen';
import { createCharacter, grantXp } from '../src/sim/Character';
import { bindLegacyAccount } from '../src/sim/Legacy';
import { canEquip, getBase, rollDrops, rollItem, vendorPrice } from '../src/sim/Loot';
import { upgradeCost } from '../src/sim/Crafting';
import { gamblePrice, imbueCost, reforgeCost } from '../src/sim/TownServices';
import { depthCurve } from '../src/entities/Enemy';

bindLegacyAccount(() => save.account);
const problems: string[] = [];
const CLASSES: CharClassId[] = ['warden', 'pyromancer', 'shadowblade', 'stormcaller', 'revenant', 'ranger'];
const REPORT_AT = [1, 3, 5, 10, 15, 20, 30];
const RANK_XP: Record<MonsterRank, number> = { boss: 22, rare: 5, elite: 3.2, champion: 1.9, normal: 1 };

interface Row {
  depth: number;
  level: number;
  monsterLevel: number;
  gold: number;
  items: Record<string, number>;
  usable: number;
  avgValue: number;
  gamble: number;
  reforge: number;
  imbue: number;
  upgrade: number;
}

const rows: Record<string, Row[]> = {};
const rng = new Random(2026);

for (const cls of CLASSES) {
  const c = createCharacter('Career', cls, new Random(7));
  rows[cls] = [];
  const maxDepth = Math.max(...REPORT_AT);
  for (let depth = 1; depth <= maxDepth; depth++) {
    const run = generateRun(depth, 1000 + depth * 31 + cls.length, cls);
    let gold = 0;
    const items: Item[] = [];
    const kill = (rank: MonsterRank) => {
      grantXp(c, Math.round((8 + depth * 6) * RANK_XP[rank]));
      const ilvl = Math.max(1, Math.round(depth * 1.15 + (rank === 'normal' ? 0 : 2)));
      const d = rollDrops(ilvl, rank, rng, 0, 0);
      gold += d.gold;
      items.push(...d.items);
    };
    run.levels.forEach((level, li) => {
      for (const s of level.spawns) kill(s.rank);
      const ilvl = Math.max(1, depth + li);
      for (const p of level.props) {
        if (!isPlainChest(p)) continue;
        const d = rollDrops(ilvl, p.interact === 'chest.rare' ? 'rare' : 'champion', rng, 0, 0);
        gold += Math.round(d.gold * (p.interact === 'chest.rare' ? 1.6 : 1.1));
        items.push(...d.items);
      }
    });
    kill('boss');
    c.depthRecord = depth;
    if (!REPORT_AT.includes(depth)) continue;

    const gear = items.filter((i) => {
      const b = getBase(i.baseId);
      return b.slot !== 'consumable' && b.slot !== 'none';
    });
    const byRarity: Record<string, number> = {};
    for (const i of gear) byRarity[i.rarity] = (byRarity[i.rarity] ?? 0) + 1;
    const usable = gear.filter((i) => {
      const b = getBase(i.baseId);
      return !b.classes || b.classes.includes(cls);
    }).length;
    // Magic and rare only: authored items swing the mean on a single drop.
    const rolled = gear.filter((i) => i.rarity === 'magic' || i.rarity === 'rare');
    const avgValue = rolled.length ? rolled.reduce((s, i) => s + vendorPrice(i, false), 0) / rolled.length : 0;
    const sample = rollItem(depth + 3, new Random(depth), { forceRarity: 'rare', classId: cls });
    rows[cls]!.push({
      depth,
      level: c.level,
      monsterLevel: depthCurve(depth).level,
      gold,
      items: byRarity,
      usable,
      avgValue: Math.round(avgValue),
      gamble: gamblePrice(c, 'ring'),
      reforge: reforgeCost(sample).gold,
      imbue: imbueCost(sample).gold,
      upgrade: upgradeCost(sample).gold,
    });
    void canEquip;
  }
}

// --- judgements --------------------------------------------------------------
for (const [cls, list] of Object.entries(rows)) {
  let lastValue = 0;
  for (const r of list) {
    const tag = `${cls} at depth ${r.depth}`;
    if (r.level < r.monsterLevel - 4) problems.push(`${tag}: level ${r.level} against monster level ${r.monsterLevel}`);
    if (r.depth >= 3 && r.gold < r.gamble * 1.5) problems.push(`${tag}: a descent pays ${r.gold} gold, a gamble costs ${r.gamble}`);
    if (r.depth >= 5 && r.gold < r.reforge * 3) problems.push(`${tag}: a descent pays ${r.gold} gold, a reforge costs ${r.reforge}`);
    if (r.depth >= 5 && r.gold < r.imbue) problems.push(`${tag}: a descent pays ${r.gold} gold, an imbue costs ${r.imbue}`);
    if (r.depth >= 3 && r.gold > r.gamble * 40) problems.push(`${tag}: a descent pays ${r.gold} gold, enough for ${Math.floor(r.gold / r.gamble)} gambles`);
    if (r.usable < 8) problems.push(`${tag}: only ${r.usable} usable items in a whole descent`);
    if (r.depth >= 10 && r.avgValue < lastValue * 0.9) problems.push(`${tag}: drops are worth less than at the last depth (${r.avgValue} < ${lastValue})`);
    lastValue = r.avgValue;
  }
  const deep = list[list.length - 1]!;
  const special = (deep.items.set ?? 0) + (deep.items.unique ?? 0) + (deep.items.mythic ?? 0);
  if (special < 1) problems.push(`${cls}: no set or unique in a whole descent at depth ${deep.depth}`);
}

console.log(JSON.stringify({ problems, rows }));

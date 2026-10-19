/**
 * The game half of `tools/i18n-entry.ts`: maps, quests and items from fixed
 * seeds, which must come out the same in every language (only text may
 * differ). Also checks, in English, that `itemDisplayName` puts every item's
 * name back together exactly as it was saved.
 */
import { generateRun, setMonsterCatalog } from '../src/world/DungeonGen';
import { MONSTERS, pickMonstersForDepth } from '../src/data/monsters';
import { MONSTER_AFFIXES } from '../src/data/monsterAffixes';
import { pickBossForDepth } from '../src/data/bosses';
import { namedRaresFor } from '../src/data/namedRares';
import { itemDisplayName, rollDrops, rollItem } from '../src/sim/Loot';
import { Random } from '../src/core/RNG';
import { translating } from '../src/core/I18n';
import type { CharClassId, ItemRarity } from '../src/types';

setMonsterCatalog({
  pick: (depth, biome, rng, count) => pickMonstersForDepth(depth, biome, rng, count).map((m) => m.id),
  affixes: (depth, rng, count) => {
    const pool = MONSTER_AFFIXES.filter((a) => a.minDepth <= depth);
    const out: string[] = [];
    const taken = new Set<string>();
    for (let i = 0; i < count && taken.size < pool.length; i++) {
      const legal = pool.filter((a) => !taken.has(a.id) && !(a.excludes ?? []).some((x) => taken.has(x)));
      if (legal.length === 0) break;
      const chosen = rng.weighted(legal, (a) => a.weight);
      taken.add(chosen.id);
      out.push(chosen.id);
    }
    return out;
  },
  bossFor: (depth, biome, rng) => pickBossForDepth(depth, biome, rng).id,
  nameFor: (monsterId, biome, depth, rng) => {
    const def = MONSTERS.find((m) => m.id === monsterId);
    if (!def) return null;
    const pool = namedRaresFor(def.family, monsterId, biome, depth);
    return pool.length ? rng.weighted(pool, (n) => n.weight).id : null;
  },
});

const CLASSES: CharClassId[] = ['warden', 'shadowblade', 'mage', 'paladin', 'shapeshifter'];
const RARITIES: ItemRarity[] = ['normal', 'magic', 'rare', 'unique', 'set'];

export function sample(): { runs: unknown[]; items: unknown[]; drops: unknown[]; badNames: string[] } {
  const runs = [1, 7, 19, 33, 52, 80].map((depth, i) => generateRun(depth, 9100 + i * 37, CLASSES[i % CLASSES.length]!));
  const items = [];
  const drops = [];
  const badNames: string[] = [];
  const rng = new Random(424242);
  for (let i = 0; i < 1500; i++) {
    const item = rollItem(1 + (i % 90), rng, { forceRarity: RARITIES[i % RARITIES.length], classId: CLASSES[i % CLASSES.length] });
    items.push(item);
    if (!translating() && itemDisplayName(item) !== item.name && badNames.length < 20) badNames.push(`${item.name} shows as ${itemDisplayName(item)}`);
  }
  for (let i = 0; i < 200; i++) drops.push(rollDrops(1 + (i % 80), i % 7 === 0 ? 'boss' : i % 3 === 0 ? 'elite' : 'normal', rng));
  return { runs, items, drops, badNames };
}

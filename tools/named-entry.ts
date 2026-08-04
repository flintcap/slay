/**
 * Entry point for `tools/check-named.mjs`.
 *
 * A named rare nobody can meet is a name in a data file. This rolls a lot of
 * floors with the real bestiary installed and reports which names actually
 * appear, how often one shows up, and whether any is unreachable.
 */
import { generateRun, setMonsterCatalog } from '../src/world/DungeonGen';
import { MONSTERS, pickMonstersForDepth } from '../src/data/monsters';
import { MONSTER_AFFIXES } from '../src/data/monsterAffixes';
import { pickBossForDepth } from '../src/data/bosses';
import { NAMED_RARES, namedRaresFor } from '../src/data/namedRares';

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
    if (pool.length === 0) return null;
    return rng.weighted(pool, (n) => n.weight).id;
  },
});

const seen = new Map<string, number>();
for (const n of NAMED_RARES) seen.set(n.id, 0);
let floors = 0;
let named = 0;
const RUNS = 600;
for (let i = 0; i < RUNS; i++) {
  const depth = 1 + (i % 30);
  const run = generateRun(depth, 0x7c11 + i * 4409, 'warden');
  for (const level of run.levels) {
    floors++;
    for (const s of level.spawns) {
      if (!s.named) continue;
      named++;
      seen.set(s.named, (seen.get(s.named) ?? 0) + 1);
    }
  }
}

console.log(
  JSON.stringify({
    floors,
    named,
    perFloor: +(named / Math.max(1, floors)).toFixed(2),
    rows: NAMED_RARES.map((n) => ({
      id: n.id,
      name: n.name,
      minDepth: n.minDepth,
      biomes: n.biomes ?? [],
      seen: seen.get(n.id) ?? 0,
    })).sort((a, b) => a.seen - b.seen),
  }),
);

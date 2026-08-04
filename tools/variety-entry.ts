/**
 * Entry point for `tools/check-variety.mjs`.
 *
 * Asked for: a review of monsters, spawns, balance and dungeon types, with
 * "there's only been 2 biomes so far".
 *
 * Opinions about variety are worthless next to the numbers, so this measures
 * what a player actually meets rather than what the data files contain:
 *
 *  - which biomes a run rolls, floor by floor, and how soon
 *  - which layout shapes those runs use
 *  - how many *distinct* monsters a player has fought by depth 1, 5, 10, 25
 *  - pack sizes, role mix, elite and affix rates
 *  - how much of the roster is unreachable in a normal run
 */
import { generateRun, setMonsterCatalog } from '../src/world/DungeonGen';
import { BIOMES, biomeArt, biomeForDepth } from '../src/world/Biomes';
import { MONSTERS, pickMonstersForDepth } from '../src/data/monsters';
import { MONSTER_AFFIXES } from '../src/data/monsterAffixes';
import { BOSSES, pickBossForDepth } from '../src/data/bosses';
import { streamFor } from '../src/core/RNG';

// The generator falls back to a placeholder bestiary unless the real one is
// installed, and the placeholder makes the roster look two thirds dead. This
// mirrors what `main.ts` does at boot, or the whole report measures nothing.
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
});

const RUNS = 240;
const MAX_DEPTH = 30;

interface Roll {
  depth: number;
  biome: string;
  layouts: string[];
  monsters: string[];
  bosses: string[];
  packs: number[];
  ranks: Record<string, number>;
  elites: number;
  spawns: number;
  affixes: number;
}

const rolls: Roll[] = [];
for (let r = 0; r < RUNS; r++) {
  const depth = 1 + (r % MAX_DEPTH);
  const seed = 0x51a7 + r * 7919;
  const run = generateRun(depth, seed, 'warden');
  const biome = biomeForDepth(depth, streamFor(seed, `run:${depth}`));
  const monsters = new Set<string>();
  const bosses = new Set<string>();
  const layouts = new Set<string>();
  const packs: number[] = [];
  const ranks: Record<string, number> = {};
  let elites = 0;
  let spawns = 0;
  let affixes = 0;
  for (const level of run.levels) {
    if (level.layout) layouts.add(level.layout);
    for (const s of level.spawns ?? []) {
      spawns++;
      monsters.add(s.monsterId);
      ranks[s.rank] = (ranks[s.rank] ?? 0) + 1;
      if (s.rank && s.rank !== 'normal') elites++;
      affixes += s.affixes?.length ?? 0;
    }
    // Pack sizes: spawns sharing a pack id.
    const byPack = new Map<number, number>();
    for (const s of level.spawns ?? []) {
      if (s.packId < 0) continue;
      byPack.set(s.packId, (byPack.get(s.packId) ?? 0) + 1);
    }
    packs.push(...byPack.values());
    if (level.isBossLevel) bosses.add(`${run.biome}:${depth}`);
  }
  rolls.push({
    depth,
    biome,
    layouts: [...layouts],
    monsters: [...monsters],
    bosses: [...bosses],
    packs,
    ranks,
    elites,
    spawns,
    affixes,
  });
}

// --- how soon does a player see each biome -------------------------------
const biomeByDepth: Record<number, Record<string, number>> = {};
for (const r of rolls) {
  (biomeByDepth[r.depth] ??= {});
  biomeByDepth[r.depth]![r.biome] = (biomeByDepth[r.depth]![r.biome] ?? 0) + 1;
}
/** What share of runs at or below this depth are one of the first two biomes. */
const earlySameness: Array<{ throughDepth: number; topTwoShare: number; distinct: number }> = [];
for (const d of [1, 2, 3, 5, 8, 12, 20, 30]) {
  const seen = rolls.filter((r) => r.depth <= d);
  const counts = new Map<string, number>();
  for (const r of seen) counts.set(r.biome, (counts.get(r.biome) ?? 0) + 1);
  const sorted = [...counts.values()].sort((a, b) => b - a);
  const topTwo = (sorted[0] ?? 0) + (sorted[1] ?? 0);
  earlySameness.push({
    throughDepth: d,
    topTwoShare: +((topTwo / Math.max(1, seen.length)) * 100).toFixed(1),
    distinct: counts.size,
  });
}

// --- monster variety ------------------------------------------------------
const rosterSize = MONSTERS.length;
const distinctByDepth: Array<{ throughDepth: number; distinct: number; share: number }> = [];
for (const d of [1, 3, 5, 10, 20, 30]) {
  const seen = new Set<string>();
  for (const r of rolls) if (r.depth <= d) for (const m of r.monsters) seen.add(m);
  distinctByDepth.push({
    throughDepth: d,
    distinct: seen.size,
    share: +((seen.size / rosterSize) * 100).toFixed(1),
  });
}
/** Distinct monsters inside a single run — the number that decides sameness. */
const perRun = rolls.map((r) => r.monsters.length).sort((a, b) => a - b);
const perRunMid = perRun[Math.floor(perRun.length / 2)] ?? 0;

// Which monsters never appear at all in 240 runs.
const everSeen = new Set<string>();
for (const r of rolls) for (const m of r.monsters) everSeen.add(m);
const neverSeen = MONSTERS.filter((m) => !everSeen.has(m.id)).map((m) => m.id);

// --- layout variety -------------------------------------------------------
const layoutCount = new Map<string, number>();
for (const r of rolls) for (const l of r.layouts) layoutCount.set(l, (layoutCount.get(l) ?? 0) + 1);

// --- spawn shape ----------------------------------------------------------
const allPacks = rolls.flatMap((r) => r.packs).sort((a, b) => a - b);
const packMid = allPacks[Math.floor(allPacks.length / 2)] ?? 0;
const packMax = allPacks[allPacks.length - 1] ?? 0;
const loners = allPacks.filter((n) => n <= 2).length;
const totalSpawns = rolls.reduce((n, r) => n + r.spawns, 0);
const totalElites = rolls.reduce((n, r) => n + r.elites, 0);
const totalAffixes = rolls.reduce((n, r) => n + r.affixes, 0);

// Spawn density by depth band — is a depth-30 floor actually busier?
const density: Array<{ band: string; perLevel: number; elitePct: number }> = [];
for (const [lo, hi] of [
  [1, 5],
  [6, 12],
  [13, 20],
  [21, 30],
]) {
  const band = rolls.filter((r) => r.depth >= lo! && r.depth <= hi!);
  const levels = band.reduce((n, r) => n + 1, 0) * 3;
  const sp = band.reduce((n, r) => n + r.spawns, 0);
  const el = band.reduce((n, r) => n + r.elites, 0);
  density.push({
    band: `${lo}-${hi}`,
    perLevel: +(sp / Math.max(1, levels)).toFixed(1),
    elitePct: +((el / Math.max(1, sp)) * 100).toFixed(1),
  });
}

// Rank split by depth band. "Not normal" lumps champions in with elites and
// makes the elite share look far worse than it is, so break it out.
const rankBands: Array<{ band: string; pct: Record<string, number> }> = [];
for (const [lo, hi] of [[1, 5], [6, 12], [13, 20], [21, 30]]) {
  const band = rolls.filter((r) => r.depth >= lo! && r.depth <= hi!);
  const total: Record<string, number> = {};
  let n = 0;
  for (const r of band) {
    for (const [k, v] of Object.entries(r.ranks)) {
      total[k] = (total[k] ?? 0) + v;
      n += v;
    }
  }
  const pct: Record<string, number> = {};
  for (const [k, v] of Object.entries(total)) pct[k] = +((v / Math.max(1, n)) * 100).toFixed(1);
  rankBands.push({ band: `${lo}-${hi}`, pct });
}

// --- bosses ---------------------------------------------------------------
const bossSeen = new Set<string>();
for (const r of rolls) for (const b of r.bosses) bossSeen.add(b);

console.log(
  JSON.stringify({
    biomes: BIOMES.map((b) => ({
      id: b.id,
      minDepth: b.minDepth,
      layouts: b.layouts,
      families: b.families,
      monsters: MONSTERS.filter((m) => b.families.includes(m.family)).length,
      ceiling: biomeArt(b.id).ceiling,
    })),
    earlySameness,
    biomeByDepth: Object.fromEntries(
      Object.entries(biomeByDepth)
        .filter(([d]) => Number(d) <= 12)
        .map(([d, v]) => [d, v]),
    ),
    rosterSize,
    distinctByDepth,
    perRunMid,
    neverSeen,
    layouts: [...layoutCount.entries()].sort((a, b) => b[1] - a[1]),
    packMid,
    packMax,
    lonerPct: +((loners / Math.max(1, allPacks.length)) * 100).toFixed(1),
    density,
    rankBands,
    elitePct: +((totalElites / Math.max(1, totalSpawns)) * 100).toFixed(1),
    affixPerElite: +(totalAffixes / Math.max(1, totalElites)).toFixed(2),
    bossRoster: BOSSES.length,
    bossesSeen: bossSeen.size,
  }),
);

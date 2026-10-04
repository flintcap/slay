/**
 * Entry point for `tools/check-legacy.mjs`.
 *
 * Legacy is only worth having if a run always moves it forward and if what it
 * buys is real. This checks:
 *
 *   1. A save from before Legacy loads with a sensible back-credited block.
 *   2. The renown curve: what one honest run is worth at each depth (with the
 *      real bestiary installed, so the kill counts are the game's), and how
 *      many runs the first ranks and unlocks take.
 *   3. Every perk changes the stat sheet, a multiplier or a new character.
 *   4. Points, caps, Renown gates and refunds behave.
 *   5. Unlocks turn on at exactly their rank.
 */
import type { AccountSave, MonsterRank } from '../src/types';
import { Random } from '../src/core/RNG';
import { generateRun, setMonsterCatalog } from '../src/world/DungeonGen';
import { MONSTERS, pickMonstersForDepth } from '../src/data/monsters';
import { MONSTER_AFFIXES } from '../src/data/monsterAffixes';
import { pickBossForDepth } from '../src/data/bosses';
import { namedRaresFor } from '../src/data/namedRares';
import { createCharacter } from '../src/sim/Character';
import { computeStats } from '../src/sim/Stats';
import {
  LEGACY_UNLOCKS,
  PERKS,
  RENOWN,
  bindLegacyAccount,
  buyPerk,
  canBuyPerk,
  grantRenown,
  hasUnlock,
  legacyOf,
  legacyPriceMultiplier,
  legacySalvageMultiplier,
  legacyXpMultiplier,
  pointsAvailable,
  renownForRank,
  renownRank,
  resetPerks,
} from '../src/sim/Legacy';

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

const problems: string[] = [];

function account(): AccountSave {
  return {
    version: 1,
    stash: [],
    stashTabs: 4,
    bankGold: 0,
    bestDepth: 0,
    fallen: [],
    unlocks: [],
    current: null,
    materials: {},
    settings: {
      masterVolume: 1, musicVolume: 1, sfxVolume: 1, quality: 'high', showDamageNumbers: true, screenShake: 1, cameraDistance: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Old saves
// ---------------------------------------------------------------------------
{
  const a = account();
  a.bestDepth = 12;
  a.fallen = [1, 2, 3].map((i) => ({ name: `n${i}`, classId: 'warden' as const, level: 5, depth: 3, killedBy: 'x', at: 0 }));
  const l = legacyOf(a);
  if (l.stats.deepest !== 12) problems.push('old save: deepest depth not credited');
  if (l.stats.deaths !== 3) problems.push('old save: deaths not credited');
  if (!(l.renown > 0)) problems.push('old save: no back-credited renown');
  // A corrupted block repairs instead of throwing.
  (a as unknown as { legacy: unknown }).legacy = { renown: 'x', perks: null, codex: 5, stats: null };
  const r = legacyOf(a);
  if (r.renown !== 0 || !Array.isArray(r.codex) || typeof r.stats.kills !== 'number') problems.push('corrupt legacy block not repaired');
}

// ---------------------------------------------------------------------------
// 2. The curve, from real runs
// ---------------------------------------------------------------------------
function runRenown(depth: number, seed: number, clear: boolean, firstTime: boolean): number {
  const run = generateRun(depth, seed, 'warden');
  let r = 0;
  for (let i = 0; i < run.levels.length; i++) {
    if (i > 0) r += RENOWN.floor(depth);
    for (const s of run.levels[i]!.spawns) r += RENOWN.kill(s.rank as MonsterRank, depth);
  }
  r += RENOWN.kill('boss', depth);
  if (clear) r += RENOWN.clear(depth) + (firstTime ? RENOWN.newDepth(depth) : 0);
  return Math.round(r);
}
const perRun: Record<number, number> = {};
for (const d of [1, 3, 5, 10, 20, 40]) perRun[d] = runRenown(d, 0xbeef + d, true, true);
const firstRunRank = renownRank(perRun[1]!);
if (firstRunRank < 1) problems.push(`a cleared first run reaches only rank ${firstRunRank}`);
if (firstRunRank > 4) problems.push(`a cleared first run already reaches rank ${firstRunRank}: too fast`);
// A player who clears depth N on run N.
const timeline: Array<{ run: number; rank: number }> = [];
{
  let total = 0;
  for (let run = 1; run <= 40; run++) {
    total += runRenown(run, 0xa11 + run, true, true);
    timeline.push({ run, rank: renownRank(total) });
  }
}
const runsTo = (rank: number) => timeline.find((t) => t.rank >= rank)?.run ?? Infinity;
const unlockRuns = Object.fromEntries(LEGACY_UNLOCKS.map((u) => [u.id, runsTo(u.rank)]));
if (runsTo(5) > 8) problems.push(`the Enchanter (rank 5) takes ${runsTo(5)} runs`);
if (runsTo(2) > 2) problems.push(`the Bounty Board (rank 2) takes ${runsTo(2)} runs`);
// Even a death on floor one moves you forward.
{
  const run = generateRun(1, 77, 'warden');
  let r = 0;
  for (const s of run.levels[0]!.spawns.slice(0, 10)) r += RENOWN.kill(s.rank as MonsterRank, 1);
  if (r <= 0) problems.push('a short failed run earns nothing');
}

// ---------------------------------------------------------------------------
// 3. Every perk does something
// ---------------------------------------------------------------------------
const perkRows: Array<{ id: string; ok: boolean; how: string }> = [];
for (const p of PERKS) {
  const a = account();
  bindLegacyAccount(() => a);
  const c0 = createCharacter('A', 'warden', new Random(5));
  c0.level = 20;
  const s0 = computeStats(c0);
  const xp0 = legacyXpMultiplier();
  const price0 = legacyPriceMultiplier();
  const salv0 = legacySalvageMultiplier();
  const g0 = c0.gold;
  const sk0 = c0.skillPoints;
  const inv0 = c0.inventory.filter(Boolean).length;
  const l = legacyOf(a);
  l.renown = renownForRank(30);
  l.perks[p.id] = 1;
  const c1 = createCharacter('B', 'warden', new Random(5));
  const c1b = createCharacter('A', 'warden', new Random(5));
  c1b.level = 20;
  const s1 = computeStats(c1b);
  const how: string[] = [];
  if (JSON.stringify(s0) !== JSON.stringify(s1)) how.push('stats');
  if (legacyXpMultiplier() !== xp0) how.push('xp');
  if (legacyPriceMultiplier() !== price0) how.push('price');
  if (legacySalvageMultiplier() !== salv0) how.push('salvage');
  if (c1.gold !== g0 || c1.skillPoints !== sk0 || c1.inventory.filter(Boolean).length !== inv0) how.push('new characters');
  perkRows.push({ id: p.id, ok: how.length > 0, how: how.join(',') });
  if (!how.length) problems.push(`perk ${p.id} changes nothing`);
  bindLegacyAccount(null);
}

// ---------------------------------------------------------------------------
// 4. Points, gates, caps, refunds
// ---------------------------------------------------------------------------
{
  const a = account();
  const l = legacyOf(a);
  if (pointsAvailable(a) !== 0) problems.push('a fresh account has points');
  if (buyPerk(a, 'hardy')) problems.push('bought a perk with no points');
  l.renown = renownForRank(3);
  if (pointsAvailable(a) !== 3) problems.push('rank 3 does not give 3 points');
  if (canBuyPerk(a, 'prodigy').ok) problems.push('a perk ignored its Renown gate');
  for (let i = 0; i < 3; i++) buyPerk(a, 'hardy');
  if (pointsAvailable(a) !== 0) problems.push('points not spent');
  l.renown = renownForRank(10);
  for (let i = 0; i < 6; i++) buyPerk(a, 'hardy');
  if ((l.perks.hardy ?? 0) !== 5) problems.push(`perk cap not respected: hardy at ${l.perks.hardy}`);
  resetPerks(a);
  if (pointsAvailable(a) !== 10) problems.push('refund did not return every point');
}

// ---------------------------------------------------------------------------
// 5. Unlocks fire at their rank
// ---------------------------------------------------------------------------
{
  const a = account();
  legacyOf(a);
  const fired: string[] = [];
  let r = 0;
  while (r < 30) {
    const g = grantRenown(a, renownForRank(r + 1) - legacyOf(a).renown);
    r++;
    for (const u of g.unlocked) {
      fired.push(u.id);
      if (u.rank !== r) problems.push(`unlock ${u.id} fired at rank ${r}, expected ${u.rank}`);
      if (!hasUnlock(a, u.id)) problems.push(`unlock ${u.id} announced but not active`);
    }
  }
  for (const u of LEGACY_UNLOCKS) if (!fired.includes(u.id)) problems.push(`unlock ${u.id} never fired`);
}

console.log(
  JSON.stringify({
    perRun,
    firstRunRank,
    unlockRuns,
    rankAfter: { run5: timeline[4]!.rank, run10: timeline[9]!.rank, run20: timeline[19]!.rank, run40: timeline[39]!.rank },
    perks: perkRows,
    problems,
  }),
);

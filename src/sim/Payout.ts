/**
 * SLAY — one payout path.
 *
 * Everything in a run that pays the hero asks here: a kill, a chest, a shelf,
 * a breakable, the run events (a fallen adventurer, a cursed chest, a treasure
 * runner) and the milestone caches. Each used to carry its own sums, and they
 * drifted apart. Chests and events rolled items at `depth + 2` while the
 * champion beside them dropped `depth * 1.15 + 2`, so past depth 30 a chest
 * found worse gear than the monsters guarding it. Shelves, breakables and
 * events ignored gold find, the tier's gold and the tier's magic find. Their
 * gold grew in a straight line while kill gold curves upward.
 *
 * Now three rules hold for every source:
 *
 *  1. Item level is `payoutIlvl(depth, bonus)`: the depth's item level
 *     (`itemLevelForDepth`) plus the source's bonus from `PAYOUT`. The map
 *     boss keeps its own floor (`bossIlvl`).
 *  2. Find is `findRates`: the hero's magic and gold find, shifted and scaled
 *     once by the difficulty tier.
 *  3. Gold is `payoutGold`: one curve of item level (`goldCurve`), sized by the
 *     source's weight (a normal kill is 1), with one spread, then gold find,
 *     then the tier.
 *
 * Materials come from `rollDrops` (`materialDropPool`) for every source that
 * pays them. The small sources' gold weights keep their first-floor pay at
 * depth 1 where it was; the curve then pays them more than their old straight
 * lines from depth 12 on. (Their old item level added the floor number, so on
 * the last floors of the first depths they pay a little less than they did.)
 */
import type { MonsterRank, Rng } from '../types';
import { activeDifficulty } from '../data/difficulties';
import { itemLevelForDepth } from './Difficulty';

export interface Find {
  magicFind: number;
  goldFind: number;
  /** The difficulty tier's gold, applied once to every pile. */
  goldMul: number;
}

/** No find at all, on no tier: the baseline the tools measure. */
export const NO_FIND: Find = { magicFind: 0, goldFind: 0, goldMul: 1 };

/**
 * The hero's find on the active tier, the same for every roll. A hard tier's
 * magic find is added on top, as gear would add it (+20% on Zealot). An easy
 * tier scales the hero's down and shifts it below Reaver, so it finds worse
 * even with no magic find (the shift can go below zero; `Loot.tierChance`
 * reads that as rarer). Gold find goes in as the hero has it, and the tier
 * scales the pile once, after.
 */
export function findRates(hero: { magicFind: number; goldFind: number }): Find {
  const dif = activeDifficulty();
  return {
    magicFind: hero.magicFind * Math.min(1, dif.magicFind) + (dif.magicFind - 1) * 100,
    goldFind: hero.goldFind,
    goldMul: dif.goldFind,
  };
}

/** The hero's find with a source's own bonus on top. */
export function sourceFind(find: Find, def: PayoutDef): Find {
  return { ...find, magicFind: find.magicFind + (def.magicFind ?? 0), goldFind: find.goldFind + (def.goldFind ?? 0) };
}

/** Item level of what a source at `depth` pays: the depth's, plus its bonus. */
export function payoutIlvl(depth: number, bonus = 0): number {
  return Math.max(1, itemLevelForDepth(depth) + bonus);
}

/**
 * The map boss's item level. Ranked monsters roll two over the depth, which
 * passes a flat `depth + 8` past depth 40; the boss stays two clear of them.
 */
export function bossIlvl(depth: number): number {
  return Math.max(depth + 8, payoutIlvl(depth, 4));
}

/** A normal kill's average gold at an item level, before find and spread. */
export function goldCurve(ilvl: number): number {
  const lvl = Math.max(1, Math.round(ilvl));
  return 10 + lvl * 3.4 + lvl * lvl * 0.045;
}

/** One pile of gold from a source of `weight` (a normal kill is 1). */
export function payoutGold(ilvl: number, weight: number, rng: Rng, find: Find = NO_FIND): number {
  if (weight <= 0) return 0;
  const pile = goldCurve(ilvl) * weight * rng.range(0.65, 1.45);
  return Math.max(1, Math.round(pile * (1 + Math.max(0, find.goldFind) / 100) * find.goldMul));
}

export interface PayoutDef {
  /** Item levels over the depth's own. */
  bonus: number;
  /** Gold weight. With `rank` it scales that rank's drop; without, one pile. */
  gold: number;
  /** A source that pays like a kill rolls `rollDrops` at this rank. */
  rank?: MonsterRank;
  /** Magic find over the hero's for its item rolls. */
  magicFind?: number;
  /** Gold find over the hero's. */
  goldFind?: number;
}

/** Every source that pays, and how much. */
export const PAYOUT = {
  /** A searched shelf: coins, now and then something written. */
  shelf: { bonus: 0, gold: 1.25 },
  /** A smashed barrel, crate or urn. */
  smash: { bonus: 0, gold: 0.9 },
  /** Chests pay like a kill of their rank, with more gold. */
  chest: { bonus: 2, gold: 1.1, rank: 'champion' },
  chestRare: { bonus: 2, gold: 1.6, rank: 'rare' },
  /** A warden's chest also holds one more item, two levels better. */
  chestWarden: { bonus: 2, gold: 2.2, rank: 'rare', magicFind: 150 },
  chestVault: { bonus: 2, gold: 3, rank: 'boss' },
  /** A fallen adventurer's pack: a pile and one good item, then an ambush. */
  fallen: { bonus: 2, gold: 3.75, magicFind: 60 },
  /** A cursed chest, once its curse is broken. */
  cursedChest: { bonus: 4, gold: 1.5, rank: 'boss', magicFind: 100, goldFind: 50 },
  /** A treasure runner: coins as it runs, a split sack when it falls. */
  runnerCoin: { bonus: 0, gold: 0.5 },
  /** Gold is per pile, six of them; materials as a rare's. */
  runnerSack: { bonus: 3, gold: 2.5, magicFind: 150 },
  /** A shrine bargain that pays an item: a rare, or a quarter of the time a lucky roll. */
  blessing: { bonus: 3, gold: 0, magicFind: 400 },
  /** The first monster of an ambush or a hunt carries a rare. */
  carrier: { bonus: 3, gold: 0 },
  /** A milestone cache's guaranteed items. */
  cache: { bonus: 6, gold: 0 },
} satisfies Record<string, PayoutDef>;

export type PayoutSource = keyof typeof PAYOUT;

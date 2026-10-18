/**
 * SLAY — the one depth curve.
 *
 * There is no last floor. Everything a depth asks of the hero is read from
 * here: the level its monsters spawn at, their life, damage, defense and
 * attack rating (`depthCurve`, which `Enemy` and `Boss` build on), and the
 * item level of what they drop.
 *
 * Each stat is an exponential with a linear floor, so the early floors stay
 * gentle and the late ones still climb. The hero answers with gear and with
 * levels: `sim/HeroPower.ts` compounds hero damage and life per level, and the
 * level curve in `sim/Stats.ts` keeps a hero who clears each depth once within
 * a few levels of the depth number (`tools/check-levels.mjs`), so that
 * compounding keeps pace instead of stalling.
 */

import { activeDifficulty } from '../data/difficulties';

/**
 * Monster level at a depth: the level every monster there spawns at, so the
 * gate shows the truth.
 */
export function monsterLevelForDepth(depth: number): number {
  return Math.max(1, Math.round(Math.max(1, depth) * 1.05));
}

export interface DepthCurve {
  life: number;
  damage: number;
  defense: number;
  attackRating: number;
  level: number;
}

/**
 * The monster power curve. Exponential with a linear floor so early depths stay
 * gentle and depth 40+ still climbs without integer overflow silliness.
 */
export function depthCurve(depth: number): DepthCurve {
  const d = Math.max(1, depth);
  const dif = activeDifficulty();

  // The early floors were tuned far too hot: a fresh level 1 character met
  // depth-1 damage it could not survive once two monsters connected. The base
  // damage term is lower and ramps in over the first few floors, which leaves
  // the late curve untouched — by depth 10 the eased term is ~1.
  const ease = 0.55 + 0.45 * Math.min(1, (d - 1) / 8);

  return {
    life: (24 * Math.pow(1.155, d - 1) + d * 11) * dif.monsterLife,
    damage: (3.1 * Math.pow(1.118, d - 1) + d * 1.15) * ease * dif.monsterDamage,
    defense: (8 * Math.pow(1.095, d - 1) + d * 3) * dif.monsterDefense,
    attackRating: 30 * Math.pow(1.1, d - 1) + d * 12,
    level: monsterLevelForDepth(d),
  };
}

/**
 * Item level of a normal monster's drops at a depth (`Enemy.ilvl`; champions
 * and better drop two higher). Feeds affix tier gating.
 */
export function itemLevelForDepth(depth: number): number {
  return Math.max(1, Math.round(depth * 1.15));
}

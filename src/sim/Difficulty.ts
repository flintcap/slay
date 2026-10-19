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
 * The depth ramp: monsters past depth 5 stand harder than the base curve.
 *
 * Hero power compounds faster than the base curve (`sim/HeroPower.ts`: life
 * +17% a level against monster damage +11.8% a depth), and gear adds on top,
 * so by depth 22 a well-geared hero took almost nothing and by depth 60
 * monsters barely scratched it. Tuned with `node tools/check-curve.mjs`
 * against two heroes: one in rares, who must still win everywhere, and one in
 * uniques, sets, upgrades, gems and charms (`--kit=best`), who must lose real
 * life. The owner picked the middle of a gentle and a hard curve.
 *
 * Life climbs a steady share per depth. Damage climbs faster the deeper you
 * go, because hero life outruns it more each level. Past `DEEP_FROM` both
 * climb a little more again, where the hero's levels outrun the depth.
 */
/** Depths up to here keep the base curve as it stands. */
export const RAMP_FROM = 5;
/** Where the deep extra starts. */
export const DEEP_FROM = 60;
/** Monster life: e^(LIFE_STEP) more per depth past `RAMP_FROM` (about +3.8%). */
export let LIFE_STEP = 0.0375;
/** Monster damage: e^(DAMAGE_STEP) more per depth past `RAMP_FROM`... */
export let DAMAGE_STEP = 0.029;
/** ...and a share that grows with the square of the depths past it. */
export let DAMAGE_CURVE = 0.000275;
/** Life and damage: e^(DEEP_STEP) more again per depth past `DEEP_FROM` (about +2%). */
export let DEEP_STEP = 0.0198;

/** For tuning tools only: try other ramps. */
export function tuneDepthRamp(life: number, damage: number, curve: number, deep: number): void {
  LIFE_STEP = life;
  DAMAGE_STEP = damage;
  DAMAGE_CURVE = curve;
  DEEP_STEP = deep;
}

/**
 * How much harder than the base curve monsters stand at a depth: x1 to depth
 * 5, about x1.9 life and x1.8 damage at 22, x3.7 and x3.9 at 40, x8 and x11
 * at 60. Never below 1, so no depth gets easier.
 */
export function depthRamp(depth: number): { life: number; damage: number } {
  const d = Math.max(1, depth);
  const n = Math.max(0, d - RAMP_FROM);
  const deep = DEEP_STEP * Math.max(0, d - DEEP_FROM);
  return { life: Math.exp(LIFE_STEP * n + deep), damage: Math.exp(DAMAGE_STEP * n + DAMAGE_CURVE * n * n + deep) };
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
  const ramp = depthRamp(d);

  return {
    life: (24 * Math.pow(1.155, d - 1) + d * 11) * ramp.life * dif.monsterLife,
    damage: (3.1 * Math.pow(1.118, d - 1) + d * 1.15) * ease * ramp.damage * dif.monsterDamage,
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

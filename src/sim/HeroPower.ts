/**
 * SLAY — hero power: the hero grows with its level the way the dungeon grows
 * with its depth.
 *
 * Monster life and damage compound with every depth (`depthCurve` in
 * `entities/Enemy.ts`: about +15% life and +12% damage per floor of depth).
 * Everything a hero gains per level (attribute points, skill ranks, better
 * item tiers) adds up roughly linearly, so by depth 25 a hero at the level the
 * runs pay for was dying in two seconds and doing a tenth of the damage it
 * needed. The owner's rule is to make the classes stronger, never the monsters
 * weaker, so the hero compounds too: from `FROM_LEVEL` on, every level
 * multiplies weapon and spell damage (and flat elemental adds) by `DAMAGE_PER`
 * and maximum life by `LIFE_PER`.
 *
 * Tuned with `node tools/check-curve.mjs`, which fights every class at several
 * depths. Applied at the end of `computeStats`, so every sheet shows it.
 *
 * Owned by the combat stream. No imports beyond types: `sim/Stats.ts` calls it.
 */
import type { Stats } from '../types';

/** Levels up to here use the sheet as it stands. */
export const FROM_LEVEL = 8;
/** Damage multiplier per level past `FROM_LEVEL`. */
export let DAMAGE_PER = 1.135;
/** Life multiplier per level past `FROM_LEVEL`. */
export let LIFE_PER = 1.13;

/** For tuning tools only: try other rates. */
export function tuneHeroPower(damagePer: number, lifePer: number): void {
  DAMAGE_PER = damagePer;
  LIFE_PER = lifePer;
}

/** Multipliers a hero of `level` gets on damage and on life. */
export function heroPower(level: number): { damage: number; life: number } {
  const n = Math.max(0, Math.floor(level) - FROM_LEVEL);
  return { damage: Math.pow(DAMAGE_PER, n), life: Math.pow(LIFE_PER, n) };
}

/** Folds hero power into a finished stat sheet. */
export function applyHeroPower(level: number, s: Stats): void {
  const p = heroPower(level);
  if (p.damage !== 1) {
    s.minDamage *= p.damage;
    s.maxDamage *= p.damage;
    s.fireDamage *= p.damage;
    s.coldDamage *= p.damage;
    s.lightningDamage *= p.damage;
    s.poisonDamage *= p.damage;
    s.arcaneDamage *= p.damage;
  }
  if (p.life !== 1) s.life *= p.life;
}

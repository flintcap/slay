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
 * and maximum life by `LIFE_PER`. Before the full rates catch up, gentler
 * early rates count from level 1 (`EARLY_DAMAGE_PER`, `EARLY_LIFE_PER`).
 *
 * Life regeneration is a flat amount per second, so it grows with level too,
 * or it would shrink to nothing beside the bar it fills: by the square root of
 * the life multiplier. Growing it as fast as life kept its level-7 share of
 * the bar, a few percent a second, and the curve check found every class
 * untouched from depth 18 on. Flat potion healing grows as fast as life
 * (`potionLife` in `sim/Potions.ts`): a flask is spent, regeneration is not.
 * Damage reduction is a percent (`drFraction` in `sim/Combat.ts`) and needs
 * nothing.
 *
 * Tuned with `node tools/check-curve.mjs`, which fights every class at several
 * depths. Applied at the end of `computeStats`, so every sheet shows it.
 *
 * Owned by the combat stream. No imports beyond types: `sim/Stats.ts` calls it.
 */
import type { Stats } from '../types';

/** The full rates count from here. */
export const FROM_LEVEL = 7;
/** Damage multiplier per level past `FROM_LEVEL`. */
export let DAMAGE_PER = 1.15;
/** Life multiplier per level past `FROM_LEVEL`. */
export let LIFE_PER = 1.17;
/**
 * The young hero's rates, counted from level 1. Monsters grow fastest over
 * the first floors, while their damage eases in, and on the sheet alone five
 * classes lost every try at the depth-5 boss: so a hero grows at least this
 * much a level from the start. The full rates pass these near level 20 (damage) and 23
 * (life) and rule from there, so the deep curve is the same.
 */
export let EARLY_DAMAGE_PER = 1.1;
export let EARLY_LIFE_PER = 1.12;

/** For tuning tools only: try other rates. */
export function tuneHeroPower(damagePer: number, lifePer: number, earlyDamage = EARLY_DAMAGE_PER, earlyLife = EARLY_LIFE_PER): void {
  DAMAGE_PER = damagePer;
  LIFE_PER = lifePer;
  EARLY_DAMAGE_PER = earlyDamage;
  EARLY_LIFE_PER = earlyLife;
}

/** Multipliers a hero of `level` gets on damage and on life. */
export function heroPower(level: number): { damage: number; life: number } {
  const l = Math.floor(level);
  const n = Math.max(0, l - FROM_LEVEL);
  const young = Math.max(0, l - 1);
  return {
    damage: Math.max(Math.pow(DAMAGE_PER, n), Math.pow(EARLY_DAMAGE_PER, young)),
    life: Math.max(Math.pow(LIFE_PER, n), Math.pow(EARLY_LIFE_PER, young)),
  };
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
  if (p.life !== 1) {
    s.life *= p.life;
    s.lifeRegen *= Math.sqrt(p.life);
  }
}

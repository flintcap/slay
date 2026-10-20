/**
 * SLAY — speed: how long a swing, a shot or a cast takes.
 *
 * One model for the whole game. Every place that turns attack or cast speed
 * into seconds goes through here: the basic attack, every skill, the
 * Shapeshifter's and the Paladin's runners, and the Character panel.
 *
 * - **The weapon sets the pace.** A basic attack takes one swing (or shot) of
 *   the weapon in hand: `1 / baseSpeed` seconds (`ItemBase.baseSpeed`, attacks
 *   a second). Bare hands swing at `UNARMED_APS`. Two blades take turns, one
 *   blow a swing, at `DUAL_SWING_RATE` times the two weapons' average pace.
 * - **Attack skills** take `SkillDef.attackTime` swings (default by family,
 *   `ATTACK_FACTOR`). With two blades a melee skill takes `DUAL_SKILL_STRETCH`
 *   times as long, so the left blade's swing fits in it.
 * - **Spells** take `SkillDef.castTime` seconds (default by family,
 *   `CAST_BASE`; `BASE_CAST_TIME` otherwise), whatever is in hand.
 * - **Speed from gear and buffs** is summed as a percentage and goes through
 *   `speedMultiplier`: diminishing returns that approach +`SPEED_SOFTCAP`%
 *   and never reach it. Slows on the hero (chill, entangle) are not summed
 *   into that: they multiply the result at full strength, so speed gear never
 *   waters a monster's slow down.
 * - **Ceilings.** Nothing attacks faster than `ATTACK_RATE_CAP` a second or
 *   casts faster than `CAST_RATE_CAP` a second, however it is built.
 *
 * Damage per hit never depends on any of this (owner's rule): a quicker
 * swing is more swings of the same blow, never a softer one.
 *
 * Pure: no Three.js, no scene. Reads item bases only.
 */
import type { EquipSlot, Item, ItemCategory, SkillDef } from '../types';
import { findBase } from '../data/itemBases';

/** Speed gear's effect approaches this percentage and never reaches it. */
export const SPEED_SOFTCAP = 100;
/** Slowest any action gets: 2.5x its own time. */
export const SPEED_FLOOR = 0.4;
/** Attacks (swings, shots, attack skills) a second, at most. */
export const ATTACK_RATE_CAP = 3.0;
/** Casts a second, at most. */
export const CAST_RATE_CAP = 3.4;
/** Bare hands: attacks a second. */
export const UNARMED_APS = 1.4;
/** A spell with no cast time of its own, in seconds. */
export const BASE_CAST_TIME = 0.5;
/** Two blades swing this much more often than one, each swing one blade. */
export const DUAL_SWING_RATE = 1.3;
/** A melee skill with two blades takes this much longer than with one. */
export const DUAL_SKILL_STRETCH = 1.35;

/** Weapon categories that strike in melee, and so pair as two blades. */
const MELEE: ReadonlySet<ItemCategory> = new Set(['sword', 'axe', 'mace', 'dagger', 'spear']);
const RANGED: ReadonlySet<ItemCategory> = new Set(['bow', 'crossbow']);

/**
 * Attack skills: a use is this many swings of the weapon, by effect family.
 * Anything not listed takes one swing.
 */
export const ATTACK_FACTOR: Readonly<Record<string, number>> = {
  whirlwind: 1.4,
  slam: 1.5,
};
/** Spells: a cast takes this many seconds, by effect family. */
export const CAST_BASE: Readonly<Record<string, number>> = {
  heal: 0.35,
  buff: 0.35,
  aura: 0.35,
  stance: 0.35,
  shout: 0.35,
  banner: 0.35,
  self: 0.35,
  absorb: 0.35,
  channel: 0.8,
};
/** Families that are always a weapon's work: swung, never cast. */
const ATTACK_FAMILIES: ReadonlySet<string> = new Set(['melee', 'cleave', 'whirlwind', 'slam', 'wave', 'rite']);
/** Families that are loosed: a bow's draw with a bow in hand, a throw of steel with a blade in hand. */
const LOOSED_FAMILIES: ReadonlySet<string> = new Set(['projectile', 'bolt', 'cone', 'beam', 'chain', 'meteor', 'sky']);
/** Families where two blades take turns inside the skill. */
const TWO_BLADE_FAMILIES: ReadonlySet<string> = new Set(['melee', 'cleave']);

/**
 * The multiplier on action rate from summed speed (`pct`, gear + passives +
 * buffs + stacks, may be negative) and slows on the hero (`slowPct`, zero or
 * less, applied at full strength). 1 is no change; 1.5 is half again as fast.
 */
export function speedMultiplier(pct: number, slowPct = 0): number {
  const up = pct > 0 ? pct : 0;
  const down = (pct < 0 ? pct : 0) + (slowPct < 0 ? slowPct : 0);
  const gained = (SPEED_SOFTCAP * up) / (up + SPEED_SOFTCAP);
  return Math.max(SPEED_FLOOR, (1 + gained / 100) * Math.max(0, 1 + down / 100));
}

/** What the hands hold, as far as pace goes. */
export interface Hands {
  /** Attacks a second of what is in hand, before speed (two blades: their average). */
  aps: number;
  /** Two melee weapons. */
  dual: boolean;
  /** A bow or a crossbow. */
  ranged: boolean;
  /** A melee weapon (or two). */
  melee: boolean;
}

function categoryOf(item: Item | undefined): ItemCategory | undefined {
  if (!item) return undefined;
  try {
    return findBase(item.baseId)?.category;
  } catch {
    return undefined;
  }
}

function apsOf(item: Item | undefined): number {
  if (!item) return UNARMED_APS;
  try {
    const s = findBase(item.baseId)?.baseSpeed;
    return s && s > 0 ? s : UNARMED_APS;
  } catch {
    return UNARMED_APS;
  }
}

/** Reads the pace of what the equipment puts in the hands. */
export function handsOf(equipment: Partial<Record<EquipSlot, Item>>): Hands {
  const main = equipment.mainHand;
  const off = equipment.offHand;
  const mc = categoryOf(main);
  const oc = categoryOf(off);
  const dual = !!mc && !!oc && MELEE.has(mc) && MELEE.has(oc);
  const aps = dual ? (apsOf(main) + apsOf(off)) / 2 : main ? apsOf(main) : UNARMED_APS;
  return { aps, dual, ranged: !!mc && RANGED.has(mc), melee: !!mc && MELEE.has(mc) };
}

/** Seconds one basic attack takes: a swing, a shot, or one blade's turn. */
export function basicTime(hands: Hands, attackMult: number): number {
  const rate = hands.aps * (hands.dual ? DUAL_SWING_RATE : 1) * attackMult;
  return Math.max(1 / ATTACK_RATE_CAP, 1 / Math.max(0.05, rate));
}

/** Basic attacks a second. */
export function basicRate(hands: Hands, attackMult: number): number {
  return 1 / basicTime(hands, attackMult);
}

/**
 * A weapon's own attacks a second, for its tooltip: its base pace with its
 * own speed lines (implicit, rolled, sockets) through the curve, under the
 * ceiling. The hero's other gear adds to the same sum; the character panel
 * shows that total.
 */
export function weaponRate(baseSpeed: number, ownPct: number): number {
  return Math.min(ATTACK_RATE_CAP, baseSpeed * speedMultiplier(ownPct));
}

/** Seconds a cast of `base` seconds takes at this cast speed. */
export function castSeconds(base: number, castMult: number): number {
  return Math.max(1 / CAST_RATE_CAP, base / Math.max(0.05, castMult));
}

/** Whether a skill is timed as an attack (weapon pace, attack speed) or a spell (cast time, cast speed). */
export function skillTiming(def: SkillDef, hands: Hands): 'attack' | 'spell' {
  if (def.timing) return def.timing;
  const family = (def.effect ?? 'melee').split('.')[0] ?? 'melee';
  if (ATTACK_FAMILIES.has(family)) return 'attack';
  if (LOOSED_FAMILIES.has(family)) {
    if (hands.ranged) return 'attack';
    if (hands.melee && (def.damageType ?? 'physical') === 'physical') return 'attack';
  }
  return 'spell';
}

/** How long one use of a skill takes, both ways, and which way it uses. */
export interface Pace {
  /** One plain swing (or shot) of the weapon at this attack speed. */
  swing: number;
  /** The skill used as an attack: its own swings, two blades stretched. */
  attack: number;
  /** The skill cast as a spell: its own cast time at this cast speed. */
  cast: number;
  timing: 'attack' | 'spell';
  /** The one of the two this skill takes. */
  time: number;
}

/**
 * A skill's pace. `knob` lets a skill-bending unique grow `attackTime` or
 * `castTime` (`data/skillBends.ts`); it gets the default and returns the bent value.
 */
export function skillPace(
  def: SkillDef,
  hands: Hands,
  attackMult: number,
  castMult: number,
  knob: (key: 'attackTime' | 'castTime', v: number) => number = (_k, v) => v,
): Pace {
  const family = (def.effect ?? 'melee').split('.')[0] ?? 'melee';
  const per = Math.max(0.05, hands.aps * attackMult);
  const swing = Math.max(1 / ATTACK_RATE_CAP, 1 / per);
  const factor = Math.max(0.1, knob('attackTime', def.attackTime ?? ATTACK_FACTOR[family] ?? 1));
  const stretch = hands.dual && TWO_BLADE_FAMILIES.has(family) ? DUAL_SKILL_STRETCH : 1;
  const attack = Math.max(1 / ATTACK_RATE_CAP, (factor * stretch) / per);
  const cast = castSeconds(Math.max(0.05, knob('castTime', def.castTime ?? CAST_BASE[family] ?? BASE_CAST_TIME)), castMult);
  const timing = skillTiming(def, hands);
  return { swing, attack, cast, timing, time: timing === 'attack' ? attack : cast };
}

/**
 * How fast a rush, charge or leap carries the hero, in metres a second. A
 * class stream times a move that covers ground with `travelTime`, so a 9 m
 * charge reads as a run, not a blink.
 */
export const RUSH_SPEED = 14;
/** The shortest a rush may take, however short the distance. */
export const RUSH_MIN_TIME = 0.15;

/** Seconds a rush over `distance` metres takes at `RUSH_SPEED` (or `speed`). */
export function travelTime(distance: number, speed = RUSH_SPEED): number {
  return Math.max(RUSH_MIN_TIME, Math.max(0, distance) / Math.max(1, speed));
}

/** What the character panel shows for speed: true rates and what the gear is worth. */
export interface SpeedReadout {
  /** Basic attacks a second with what is held, gear and buffs counted. */
  attackRate: number;
  /** The weapon's own pace (two blades: their average), attacks a second. */
  weaponAps: number;
  dual: boolean;
  /** Real gain from attack speed after diminishing returns, percent. */
  attackGain: number;
  /** Casts a second of a usual spell (`BASE_CAST_TIME`). */
  castRate: number;
  /** Real gain from cast speed after diminishing returns, percent. */
  castGain: number;
}

/** True speed for a hero holding `equipment` with `attackPct` and `castPct` summed speed. */
export function speedReadout(equipment: Partial<Record<EquipSlot, Item>>, attackPct: number, castPct: number): SpeedReadout {
  const hands = handsOf(equipment);
  const am = speedMultiplier(attackPct);
  const cm = speedMultiplier(castPct);
  return {
    attackRate: basicRate(hands, am),
    weaponAps: hands.aps,
    dual: hands.dual,
    attackGain: (am - 1) * 100,
    castRate: 1 / castSeconds(BASE_CAST_TIME, cm),
    castGain: (cm - 1) * 100,
  };
}

/** The effective speed bonus, in percent, that `pct` summed speed gives (for readouts). */
export function effectiveSpeedPct(pct: number, slowPct = 0): number {
  return (speedMultiplier(pct, slowPct) - 1) * 100;
}

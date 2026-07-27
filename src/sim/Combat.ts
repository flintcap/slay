/**
 * SLAY — the damage model.
 *
 * Three functions carry the whole game:
 *
 *   rollDamage   turns a stat sheet into a `DamagePacket` (range roll, enhanced
 *                damage, flat elemental adds, critical strike).
 *   mitigate     turns a packet plus a defender's sheet into damage actually
 *                taken (block, resistance, armour, flat reduction).
 *   hitChance    D2's attack-rating-versus-defense curve.
 *
 * Two deliberate design decisions live here:
 *
 *   - Resistance has diminishing returns above 50 and a hard ceiling of 85, so
 *     stacking one element can never reach immunity. A build that covers four
 *     elements badly beats a build that covers one perfectly.
 *   - Armour's denominator scales with the size of the incoming hit rather than
 *     with a level parameter, which gives the same shape as a level-scaled curve
 *     without threading levels through every call: armour is excellent against
 *     a swarm of small hits and never trivialises a depth-120 boss slam.
 */

import type { DamagePacket, DamageType, Rng, Stats, StatusApplication } from '../types';
import { RESIST_OF } from '../types';
import { effectiveDamageScale, SKILL_BY_ID } from '../data/skills';
import { effectiveRank } from './Stats';
import { statusesOf } from './Status';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Resistance below this is worth its face value. */
export const RESIST_SOFT_CAP = 50;
/** Absolute ceiling on effective resistance. Never reachable, only approached. */
export const RESIST_HARD_CAP = 85;
/** How quickly resistance past the soft cap decays toward the hard cap. */
const RESIST_DECAY = 60;
/** Resistance floor — the "Cursed" run modifier can push you deep negative. */
export const RESIST_FLOOR = -100;

/** Armour can never remove more than this fraction of a hit. */
export const ARMOR_CAP = 0.8;
/** Base of the armour denominator, plus a term proportional to hit size. */
const ARMOR_K0 = 220;
const ARMOR_K1 = 9;

/** A blocked hit still lets this fraction through. */
export const BLOCK_LEAK = 0.15;
export const BLOCK_CAP = 75;

/** Attack rating clamps — nobody whiffs forever, nobody hits forever. */
export const HIT_FLOOR = 0.05;
export const HIT_CEILING = 0.95;

// ---------------------------------------------------------------------------
// Resistance
// ---------------------------------------------------------------------------

/**
 * Raw resistance -> effective resistance, in percent.
 * Linear to 50, then asymptotic toward 85.
 */
export function effectiveResist(raw: number): number {
  if (raw <= 0) return Math.max(RESIST_FLOOR, raw);
  if (raw <= RESIST_SOFT_CAP) return raw;
  const over = raw - RESIST_SOFT_CAP;
  const room = RESIST_HARD_CAP - RESIST_SOFT_CAP;
  return RESIST_SOFT_CAP + room * (1 - Math.exp(-over / RESIST_DECAY));
}

/** Resistance of a defender against a specific damage type, post-curve. */
export function resistAgainst(defender: Stats, type: DamageType): number {
  return effectiveResist(defender[RESIST_OF[type]] ?? 0);
}

// ---------------------------------------------------------------------------
// Armour
// ---------------------------------------------------------------------------

/**
 * Fraction of a physical hit removed by armour. The denominator grows with the
 * size of the hit, so 4000 defense is a wall against 30-damage swarm attacks
 * and merely useful against a 900-damage boss overhead.
 */
export function armorReduction(defense: number, incoming: number): number {
  if (defense <= 0) return 0;
  const k = ARMOR_K0 + ARMOR_K1 * Math.max(0, incoming);
  return Math.min(ARMOR_CAP, defense / (defense + k));
}

// ---------------------------------------------------------------------------
// Damage rolls
// ---------------------------------------------------------------------------

export interface RollOpts {
  /** Skill damage multiplier. 1 is a plain weapon swing. */
  scale?: number;
  /** Overrides the packet's damage type; elemental types convert the whole hit. */
  type?: DamageType;
  ability?: string;
  source?: string;
  /** Forces the critical roll on or off (guaranteed-crit skills). */
  forceCrit?: boolean;
  /** Extra critical chance in percentage points, from the skill. */
  bonusCrit?: number;
  /** Extra critical damage in percentage points. */
  bonusCritDamage?: number;
  /** Status effects the hit should carry. */
  applies?: StatusApplication[];
  knockback?: number;
  /** True when the packet is area damage — applies `areaDamagePct`. */
  area?: boolean;
}

const ELEMENTAL_FLAT: ReadonlyArray<[DamageType, keyof Stats]> = [
  ['fire', 'fireDamage'],
  ['cold', 'coldDamage'],
  ['lightning', 'lightningDamage'],
  ['poison', 'poisonDamage'],
  ['arcane', 'arcaneDamage'],
];

/** Sum of every flat elemental add on the sheet. */
export function flatElementalTotal(stats: Stats): number {
  let total = 0;
  for (const [, key] of ELEMENTAL_FLAT) total += stats[key] ?? 0;
  return total;
}

/**
 * Rolls a damage packet from an attacker's stats.
 *
 * Physical hits carry their flat elemental adds along as one number; elemental
 * skills convert the whole swing to their element and then apply
 * `elementalDamagePct` once to the combined value.
 */
export function rollDamage(stats: Stats, rng: Rng, opts: RollOpts = {}): DamagePacket {
  const scale = opts.scale ?? 1;
  const type: DamageType = opts.type ?? 'physical';

  const min = Math.max(0, stats.minDamage);
  const max = Math.max(min, stats.maxDamage);
  const weapon = rng.range(min, max + 1) * (1 + stats.enhancedDamage / 100);
  const flatElem = flatElementalTotal(stats);
  const elemPct = 1 + stats.elementalDamagePct / 100;

  let amount: number;
  if (type === 'physical') {
    amount = weapon + flatElem * elemPct;
  } else {
    amount = (weapon + flatElem) * elemPct;
  }

  amount *= scale;
  if (opts.area) amount *= 1 + stats.areaDamagePct / 100;

  const critChance = Math.max(0, Math.min(95, stats.critChance + (opts.bonusCrit ?? 0)));
  const crit = opts.forceCrit ?? rng.chance(critChance / 100);
  if (crit) {
    const critDamage = Math.max(100, stats.critDamage + (opts.bonusCritDamage ?? 0));
    amount *= critDamage / 100;
  }

  const packet: DamagePacket = {
    amount: Math.max(1, amount),
    type,
    crit,
    source: opts.source ?? 'player',
  };
  if (opts.ability) packet.ability = opts.ability;
  if (opts.knockback) packet.knockback = opts.knockback;
  if (opts.applies && opts.applies.length > 0) packet.applies = opts.applies;
  return packet;
}

/**
 * Rolls a packet for a specific skill, folding in its per-rank damage scaling
 * and every synergy the character has invested in.
 */
export function rollSkillDamage(
  stats: Stats,
  rng: Rng,
  skillId: string,
  ranks: Record<string, number>,
  opts: RollOpts = {},
): DamagePacket {
  const def = SKILL_BY_ID[skillId];
  const hard = ranks[skillId] ?? 0;
  if (!def || hard <= 0) return rollDamage(stats, rng, opts);
  const rank = effectiveRank(hard, stats.skillLevels);
  const scale = effectiveDamageScale(skillId, rank, ranks) || 1;
  return rollDamage(stats, rng, {
    ...opts,
    scale: scale * (opts.scale ?? 1),
    type: opts.type ?? def.damageType ?? 'physical',
    ability: opts.ability ?? def.id,
  });
}

// ---------------------------------------------------------------------------
// Mitigation
// ---------------------------------------------------------------------------

export interface MitigateResult {
  amount: number;
  blocked: boolean;
  type: DamageType;
}

/**
 * Applies block, resistance, armour and flat reduction, in that order.
 * Block is rolled first because it is an avoidance mechanic, not a reduction:
 * a blocked hit leaks only `BLOCK_LEAK` before anything else touches it.
 */
export function mitigate(packet: DamagePacket, defender: Stats, rng: Rng): MitigateResult {
  let amount = Math.max(0, packet.amount);
  const type = packet.type;

  const blockChance = Math.max(0, Math.min(BLOCK_CAP, defender.blockChance));
  const blocked = blockChance > 0 && rng.chance(blockChance / 100);
  if (blocked) amount *= BLOCK_LEAK;

  const resist = resistAgainst(defender, type);
  amount *= 1 - resist / 100;

  if (type === 'physical') {
    amount *= 1 - armorReduction(defender.defense, amount);
  }

  amount -= Math.max(0, defender.damageReduction);

  return { amount: Math.max(blocked ? 0 : 1, Math.round(amount)), blocked, type };
}

/**
 * How much of a hit a defender would take on average, ignoring the block roll.
 * Used by the UI's "effective health" readout and by monster AI target choice.
 */
export function expectedMitigated(amount: number, type: DamageType, defender: Stats): number {
  const blockChance = Math.max(0, Math.min(BLOCK_CAP, defender.blockChance)) / 100;
  const afterBlock = amount * (blockChance * BLOCK_LEAK + (1 - blockChance));
  let out = afterBlock * (1 - resistAgainst(defender, type) / 100);
  if (type === 'physical') out *= 1 - armorReduction(defender.defense, out);
  return Math.max(0, out - defender.damageReduction);
}

/** Effective health pool against a given hit size and type. */
export function effectiveLife(stats: Stats, referenceHit = 100, type: DamageType = 'physical'): number {
  const taken = expectedMitigated(referenceHit, type, stats);
  if (taken <= 0) return Infinity;
  return (stats.life * referenceHit) / taken;
}

// ---------------------------------------------------------------------------
// To-hit
// ---------------------------------------------------------------------------

/**
 * D2's attack rating formula, clamped so combat never becomes a coin that only
 * lands one way. Level difference matters, but attack rating dominates.
 */
export function hitChance(
  attackRating: number,
  defenderDefense: number,
  attackerLevel: number,
  defenderLevel: number,
): number {
  const ar = Math.max(1, attackRating);
  const def = Math.max(0, defenderDefense);
  const alvl = Math.max(1, attackerLevel);
  const dlvl = Math.max(1, defenderLevel);
  const raw = ((2 * ar) / (ar + def)) * (alvl / (alvl + dlvl)) * 2;
  return Math.max(HIT_FLOOR, Math.min(HIT_CEILING, raw));
}

/** Convenience roll wrapping `hitChance`. */
export function rollHit(
  rng: Rng,
  attackRating: number,
  defenderDefense: number,
  attackerLevel: number,
  defenderLevel: number,
): boolean {
  return rng.chance(hitChance(attackRating, defenderDefense, attackerLevel, defenderLevel));
}

// ---------------------------------------------------------------------------
// Leech, thorns and on-hit
// ---------------------------------------------------------------------------

/** Life recovered from a landed hit. Only physical hits leech at full rate. */
export function lifeStolen(stats: Stats, damageDealt: number, type: DamageType = 'physical'): number {
  if (stats.lifeSteal <= 0 || damageDealt <= 0) return 0;
  const rate = type === 'physical' ? 1 : 0.5;
  return (damageDealt * stats.lifeSteal * rate) / 100;
}

export function manaStolen(stats: Stats, damageDealt: number): number {
  if (stats.manaSteal <= 0 || damageDealt <= 0) return 0;
  return (damageDealt * stats.manaSteal) / 100;
}

/**
 * Damage reflected to a melee attacker from the defender's active thorn
 * effects. `Status` owns the thorn statuses; this converts them to a number.
 */
export function thornsDamage(defenderId: string, damageTaken: number): number {
  const fraction = statusesOf(defenderId).reflectFraction();
  if (fraction <= 0) return 0;
  return damageTaken * fraction;
}

/** Applies every status a packet carries to the target's container. */
export function applyOnHit(packet: DamagePacket, targetId: string): void {
  if (!packet.applies || packet.applies.length === 0) return;
  statusesOf(targetId).applyAll(packet.applies, packet.source);
}

/**
 * Full resolution of one hit against an entity that has a status container:
 * mitigate, apply statuses, compute leech and thorns. The caller still owns the
 * life pool — this returns numbers, it does not mutate anything but statuses.
 */
export interface ResolvedHit {
  amount: number;
  blocked: boolean;
  type: DamageType;
  crit: boolean;
  lifeStolen: number;
  manaStolen: number;
  thorns: number;
  absorbed: number;
}

export function resolveHit(
  packet: DamagePacket,
  attacker: Stats,
  defender: Stats,
  defenderId: string,
  rng: Rng,
): ResolvedHit {
  const m = mitigate(packet, defender, rng);
  const container = statusesOf(defenderId);
  const afterAbsorb = container.absorbDamage(m.amount);
  const absorbed = m.amount - afterAbsorb;

  applyOnHit(packet, defenderId);

  return {
    amount: afterAbsorb,
    blocked: m.blocked,
    type: m.type,
    crit: packet.crit,
    lifeStolen: lifeStolen(attacker, afterAbsorb, m.type),
    manaStolen: manaStolen(attacker, afterAbsorb),
    thorns: thornsDamage(defenderId, afterAbsorb),
    absorbed,
  };
}

/** Shorthand for building a status application list on a skill packet. */
export function status(id: string, duration: number, magnitude = 1, stacks = 1): StatusApplication {
  return { id, duration, magnitude, stacks };
}

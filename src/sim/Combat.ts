/**
 * SLAY — the damage model.
 *
 * Three functions carry the whole game:
 *
 *   rollDamage   turns a stat sheet into a `DamagePacket` (range roll, enhanced
 *                damage, flat elemental adds, critical strike).
 *   mitigate     turns a packet plus a defender's sheet into damage actually
 *                taken (block, resistance, armour, damage reduction).
 *   hitChance    whether a weapon blow lands: attack rating against guard.
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
import { effectiveDamageScale, SKILL_BY_ID, synergyPct } from '../data/skills';
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

/**
 * The fraction of a blocked hit that gets through. None: a block turns the
 * whole blow (Player.takeDamage stops there), and the readouts say the same.
 */
export const BLOCK_LEAK = 0;
export const BLOCK_CAP = 75;

/**
 * Damage reduction is a percent off every hit after resistances and armour,
 * as every item line and the character sheet say. It used to come off as a
 * flat number, so "12% Damage Reduction" meant 12 points: most of a hit at
 * depth 3 and nothing at depth 40. A percent keeps its worth at every depth.
 */
export const DR_CAP = 50;

/** The share of a hit damage reduction takes off, 0 to `DR_CAP` percent. */
export function drFraction(defender: Stats): number {
  return Math.max(0, Math.min(DR_CAP, defender.damageReduction)) / 100;
}

/**
 * Weapon blows land at least this often, however poor the aim. There is no
 * forced miss at the top: enough attack rating makes every blow land.
 */
export const HIT_FLOOR = 0.6;
/** Miss chance at even odds is `HIT_MISS_EVEN - HIT_MISS_EASE` (8%). */
const HIT_MISS_EVEN = 0.1;
const HIT_MISS_EASE = 0.02;
/** Attack rating a hero of level 1 usually has before any gear, and per level after. */
const USUAL_AR_BASE = 145;
const USUAL_AR_PER_LEVEL = 10;

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

/** Metres a monster of ordinary size is shoved per point of `DamagePacket.knockback`. */
export const KNOCKBACK_METRES = 0.35;

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
  /**
   * Damage percent for this packet's own element only (a Mage mastery),
   * added to `elementalDamagePct`. Ignored on physical packets.
   */
  elemPct?: number;
  /**
   * More damage for this skill alone (a skill-bending unique), joining the
   * hit's one pile on both halves.
   */
  morePct?: number;
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
 * skills convert the whole swing to their element. Every percent bonus sits
 * in one pile (`bonusPiles`) and the packet remembers it (`pile`), so a bonus
 * added later on the way to the target adds to it (`addBonus`).
 */
export function rollDamage(stats: Stats, rng: Rng, opts: RollOpts = {}): DamagePacket {
  const scale = opts.scale ?? 1;
  const type: DamageType = opts.type ?? 'physical';

  const min = Math.max(0, stats.minDamage);
  const max = Math.max(min, stats.maxDamage);
  const raw = rng.range(min, max + 1);
  const flatElem = flatElementalTotal(stats);
  const piles = bonusPiles(stats, type, opts.elemPct ?? 0, (opts.area ? stats.areaDamagePct : 0) + (opts.morePct ?? 0));
  let amount = raw * piles.weapon + flatElem * piles.flat;
  const pile = raw + flatElem > 0 ? amount / (raw + flatElem) : 1;
  let parts: DamagePacket['parts'];
  if (type === 'physical' && flatElem > 0 && amount > 0) {
    // The elemental adds ride on the swing as one packet, but they are still
    // fire, cold or poison: remember their share so the number can say so.
    // Shares do not change with scale or crit, so they are taken here.
    for (const [el, key] of ELEMENTAL_FLAT) {
      const v = stats[key] ?? 0;
      if (v > 0) (parts ??= {})[el] = (v * piles.flat) / amount;
    }
  }

  amount *= scale;

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
    pile,
  };
  if (opts.ability) packet.ability = opts.ability;
  if (opts.knockback) packet.knockback = opts.knockback;
  if (opts.applies && opts.applies.length > 0) packet.applies = opts.applies;
  if (parts) packet.parts = parts;
  return packet;
}

/**
 * A skill's damage multiplier as the game should use it: the rank including
 * `+skills` from gear, and every synergy the character has invested in. Skills
 * without a damage curve return 1.
 *
 * The skill runner used to read `damageScale(hardRank)` directly, so the
 * synergies the skill tree advertises and `+skills` on gear did nothing to a
 * skill's damage.
 */
export function skillDamageScale(skills: Record<string, number>, skillLevels: number, skillId: string): number {
  const def = SKILL_BY_ID[skillId];
  const hard = skills[skillId] ?? 0;
  if (!def || hard <= 0) return 1;
  // No damage ladder (a detonation, a drain, a shout): its synergies still count.
  if (!def.damageScale) return 1 + synergyPct(skillId, skills) / 100;
  return effectiveDamageScale(skillId, effectiveRank(hard, skillLevels), skills) || 1;
}

/**
 * The lowest and highest hit a skill lands before crits, area bonuses and
 * the target's defences: the same arithmetic as `rollDamage` at both ends of
 * the weapon roll. `scale` is the skill's whole multiplier, `elemPct` its
 * element's own damage percent (`RollOpts.elemPct`). The character
 * sheet reads it so the damage it shows is the attack you actually press.
 */
export function damageRange(stats: Stats, scale: number, type: DamageType, elemPct = 0): { min: number; max: number } {
  const min = Math.max(0, stats.minDamage);
  const max = Math.max(min, stats.maxDamage);
  const flat = flatElementalTotal(stats);
  const piles = bonusPiles(stats, type, elemPct, 0);
  const at = (w: number): number => Math.max(1, (w * piles.weapon + flat * piles.flat) * scale);
  return { min: at(min), max: at(max) };
}

/**
 * The one pile of percent bonuses on each half of a hit, as multipliers.
 * Every bonus adds into it; none multiplies another. The weapon's damage
 * takes enhanced damage, and elemental damage too when the hit is an
 * element; flat elemental adds take elemental damage. The skill's own
 * element bonus (`elemPct`, a mastery) and `bothPct` (area damage, a unique's
 * more damage to the skill) join both halves.
 */
export function bonusPiles(stats: Stats, type: DamageType, elemPct: number, bothPct: number): { weapon: number; flat: number } {
  const elem = stats.elementalDamagePct + (type === 'physical' ? 0 : elemPct);
  return {
    weapon: Math.max(0, 1 + (stats.enhancedDamage + (type === 'physical' ? 0 : elem) + bothPct) / 100),
    flat: Math.max(0, 1 + (elem + bothPct) / 100),
  };
}

/**
 * Adds a "+pct% damage" bonus to a hit already rolled: into its one pile
 * (`DamagePacket.pile`), not on top of it. +50% on a hit whose sheet gives
 * +100% makes it 2.5 times its raw damage, not 3. Returns the new amount and
 * pile; a pile never falls under a hundredth.
 */
export function addBonus(amount: number, pile: number, pct: number): { amount: number; pile: number } {
  if (!pct) return { amount, pile };
  const next = Math.max(0.01, pile + pct / 100);
  return { amount: (amount * next) / Math.max(0.01, pile), pile: next };
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
 * Applies block, resistance, armour and damage reduction, in that order.
 * Block is rolled first because it is an avoidance mechanic, not a reduction:
 * a blocked hit leaks only `BLOCK_LEAK` before anything else touches it.
 */
export function mitigate(packet: DamagePacket, defender: Stats, rng: Rng, cap = BLOCK_CAP): MitigateResult {
  let amount = Math.max(0, packet.amount);
  const type = packet.type;

  const blockChance = Math.max(0, Math.min(cap, defender.blockChance));
  const blocked = blockChance > 0 && rng.chance(blockChance / 100);
  if (blocked) amount *= BLOCK_LEAK;

  const resist = resistAgainst(defender, type);
  amount *= 1 - resist / 100;

  if (type === 'physical') {
    amount *= 1 - armorReduction(defender.defense, amount);
  }

  amount *= 1 - drFraction(defender);

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
  return Math.max(0, out * (1 - drFraction(defender)));
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
 * The attack rating a hero of `level` usually has from level and dexterity,
 * before gear and skills. A monster's guard starts here (`Enemy.guard`), so
 * the to-hit roll keeps its shape at any depth however far defense climbs.
 */
export function usualAttackRating(level: number): number {
  return USUAL_AR_BASE + USUAL_AR_PER_LEVEL * (Math.max(1, level) - 1);
}

/**
 * Chance that a weapon blow lands: attack rating against the target's guard.
 * Even odds land 92%; half the guard lands 82%; twice it 97%; five times it
 * always lands. Never below `HIT_FLOOR`.
 */
export function hitChance(attackRating: number, guard: number): number {
  const r = Math.max(1, attackRating) / Math.max(1, guard);
  const miss = HIT_MISS_EVEN / r - HIT_MISS_EASE;
  return Math.max(HIT_FLOOR, Math.min(1, 1 - miss));
}

/** Convenience roll wrapping `hitChance`. */
export function rollHit(rng: Rng, attackRating: number, guard: number): boolean {
  const chance = hitChance(attackRating, guard);
  return chance >= 1 || rng.chance(chance);
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

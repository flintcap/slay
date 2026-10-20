/**
 * What the right-click attack does with the gear worn now: the hit, how often
 * it lands one, and the damage per second that makes. The Character panel's
 * attack line and the Equipment panel's Est. DPS both read this, so the two
 * never disagree.
 *
 * It follows SkillRunner's timings through `sim/Speed.ts`: attacks at the
 * weapon's pace (quicker with attack speed), spells on their cast time
 * (quicker with cast speed), and a cooldown longer than that sets the pace
 * instead. Crits are folded in at their average. It is one target, before its
 * armour and resistances, and without stacks that build in a fight (Flurry).
 */
import type { Character, DamageType, SkillDef, Stats } from '../types';
import { SKILL_BY_ID } from '../data/skills';
import { burstGrowth } from '../data/skillPower';
import { castsOnly } from '../data/itemBases';
import { damageRange, skillDamageScale } from '../sim/Combat';
import { skillRank } from '../sim/Character';
import { basicTime, handsOf, skillPace, speedMultiplier, type Pace } from '../sim/Speed';
import { bendFor, bentKnob } from '../data/skillBends';
import { beastOfSkill, formHands } from '../data/shifterPower';
import { passiveEffects } from '../sim/Passives';

/** Crit chance tops out here (Combat.rollDamage). */
const CRIT_CHANCE_CAP = 95;
/** Cooldown reduction tops out here (Player.startCooldown). */
const CDR_CAP = 60;

export interface AttackEstimate {
  /** The skill on the button, or null for the plain weapon attack. */
  def: SkillDef | null;
  rank: number;
  type: DamageType;
  /** Skill power as a multiplier on weapon damage. */
  scale: number;
  min: number;
  max: number;
  /** Seconds between attacks. */
  period: number;
  /** Average damage per second against one target, crits included. */
  dps: number;
}

/** Average damage of a hit once crits are counted: 1 + chance x (crit damage - 100%). */
export function critFactor(st: Stats): number {
  const chance = Math.max(0, Math.min(CRIT_CHANCE_CAP, st.critChance)) / 100;
  return 1 + chance * (Math.max(100, st.critDamage) / 100 - 1);
}

/**
 * One skill's numbers with the gear worn now, or null when it is not learned,
 * is a passive, or deals no damage of its own (a buff, a summon). The build
 * summary on the Character panel lists these for every skill on the bar.
 */
export function estimateSkill(c: Character, st: Stats, id: string): AttackEstimate | null {
  const def = SKILL_BY_ID[id];
  if (!def?.damageScale) return null;
  return estimateDef(c, st, def);
}

/** The right-click attack's numbers, or null when there is none (a caster with no spell on it). */
export function estimateAttack(c: Character, st: Stats): AttackEstimate | null {
  const id = c.primaryAttack;
  const def = id ? SKILL_BY_ID[id] : undefined;
  if (def) return estimateDef(c, st, def);

  // The plain weapon attack. Caster weapons have none.
  if (castsOnly(c.classId, c.equipment.mainHand?.baseId, c.equipment.offHand?.baseId)) return null;
  const r = damageRange(st, 1, 'physical');
  const period = basicTime(handsOf(c.equipment), speedMultiplier(st.attackSpeed));
  return { def: null, rank: 0, type: 'physical', scale: 1, min: r.min, max: r.max, period, dps: (((r.min + r.max) / 2) * critFactor(st)) / period };
}

/**
 * One use of `def` with the gear worn now: its real time and whether it is an
 * attack or a spell (`sim/Speed.ts`, skill-bending uniques counted). The skill
 * board's Speed line and the estimates read this, as SkillRunner does.
 */
export function paceFor(c: Character, st: Stats, def: SkillDef): Pace {
  const bend = bendFor(c, def.id);
  // A Shapeshifter skill is fought in its beast, at the beast's pace.
  return skillPace(def, formHands(handsOf(c.equipment), beastOfSkill(def)), speedMultiplier(st.attackSpeed), speedMultiplier(st.castSpeed), (k, v) => bentKnob(bend, k, v));
}

function estimateDef(c: Character, st: Stats, def: SkillDef): AttackEstimate | null {
  const rank = skillRank(c, def.id);
  if (rank <= 0 || def.targeting === 'passive') return null;
  const params = def.params ?? {};
  const num = (k: string, d: number): number => (typeof params[k] === 'number' ? (params[k] as number) : d);
  let scale = 1;
  try {
    scale = skillDamageScale(c.skills, st.skillLevels, def.id) * (def.damageScale ? 1 : burstGrowth(def.id, Math.max(0, rank - 1), num));
  } catch {
    scale = 1;
  }
  const type: DamageType = def.damageType ?? 'physical';
  // A Mage mastery raises its own element's hits only (`RollOpts.elemPct`).
  const r = damageRange(st, scale, type, type === 'physical' ? 0 : passiveEffects(c).elementPct[type] ?? 0);
  const action = paceFor(c, st, def).time;
  const cd = (def.cooldown ? def.cooldown(rank) : 0) * (1 - Math.min(CDR_CAP, st.cooldownReduction) / 100);
  const period = Math.max(action, cd);
  return { def, rank, type, scale, min: r.min, max: r.max, period, dps: (((r.min + r.max) / 2) * critFactor(st)) / period };
}

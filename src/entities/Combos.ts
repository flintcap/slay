/**
 * SLAY — skill combos.
 *
 * Every class fights better when it mixes its skills. A skill that lands on a
 * target another of your skills hit within the last few seconds is a combo:
 * the blow hits harder and carries the class's own follow-up. The same skill
 * twice in a row never combos, and neither does the free basic attack, so
 * pressing one button forever is the weakest way to play.
 *
 * Alternating two skills combos on every cast after the first. Bigger skills
 * make better finishers: the bonus grows with the payoff skill's tier.
 *
 * Rules only. `Enemy.takeDamage` holds the per-target memory and applies the
 * result; nothing here touches the scene.
 */
import { SKILLS, TREE_BY_ID } from '../data/skills';
import type { CharClassId, DamagePacket, SkillDef, StatusApplication } from '../types';

/** Seconds a hit stays open for a different skill to combo off it. */
export const COMBO_WINDOW = 4;
/** Bonus damage for a combo, percent, before the payoff's tier. */
export const COMBO_BASE_PCT = 20;
/** Extra percent per tier of the payoff skill (tier 1..6 gives 25..50%). */
export const COMBO_PER_TIER_PCT = 5;

export interface ComboDef {
  /** Shown over the target when it lands. */
  name: string;
  /** One line for tooltips and the skill tree. */
  desc: string;
  color: number;
  /** Statuses the combo leaves on the target. */
  applies?: StatusApplication[];
  /** The combo hit is always a critical strike. */
  crit?: boolean;
  /** Stuns a non-boss target for this long. */
  stagger?: number;
  /** Share of the combo hit that arcs to the nearest other enemy. */
  arc?: number;
}

export const COMBOS: Record<CharClassId, ComboDef> = {
  warden: {
    name: 'Break',
    desc: 'Staggers the target for 0.8s (not bosses).',
    color: 0xffc070,
    stagger: 0.8,
  },
  pyromancer: {
    name: 'Flashpoint',
    desc: 'Sets the target Burning with 3 stacks.',
    color: 0xff7a30,
    applies: [{ id: 'burning', duration: 5, magnitude: 1, stacks: 3 }],
  },
  shadowblade: {
    name: 'Exploit',
    desc: 'The hit is always a critical strike.',
    color: 0xb0ff60,
    crit: true,
  },
  stormcaller: {
    name: 'Overload',
    desc: '40% of the hit arcs to the nearest other enemy.',
    color: 0x80d0ff,
    arc: 0.4,
  },
  revenant: {
    name: 'Reap',
    desc: 'Weakens the target: -35% damage dealt for 6s.',
    color: 0xc080ff,
    applies: [{ id: 'weakened', duration: 6, magnitude: 1 }],
  },
  ranger: {
    name: 'Expose',
    desc: 'Makes the target Vulnerable for 6s.',
    color: 0xffe070,
    applies: [{ id: 'vulnerable', duration: 6, magnitude: 1 }],
  },
};

/**
 * Skills by the names and ids their packets carry. The skill runner stamps a
 * packet with the skill's display name; anything else (basic attack, item
 * powers, minions, arcs) carries a name that is not here and never combos.
 */
const BY_ABILITY = new Map<string, SkillDef>();
for (const s of SKILLS) {
  if (s.targeting === 'passive' || !s.damageScale) continue;
  if ((s.effect ?? '').startsWith('summon')) continue;
  BY_ABILITY.set(s.name, s);
  BY_ABILITY.set(s.id, s);
}

/** The active skill a player packet came from, if it came from one. */
export function comboSkillOf(packet: DamagePacket): SkillDef | null {
  if (packet.source !== 'player' || !packet.ability) return null;
  return BY_ABILITY.get(packet.ability) ?? null;
}

export function comboOfClass(classId: CharClassId): ComboDef {
  return COMBOS[classId];
}

/** The combo a skill finishes with, for its class. */
export function comboForSkill(skill: SkillDef): ComboDef | null {
  const cls = TREE_BY_ID[skill.treeId]?.classId;
  return cls ? COMBOS[cls] : null;
}

/** Bonus percent a skill deals as a combo finisher. */
export function comboBonusPct(skill: SkillDef): number {
  return COMBO_BASE_PCT + COMBO_PER_TIER_PCT * Math.max(1, Math.min(6, skill.tier));
}

/** Per-target memory: which skill last hit it, and when. */
export interface ComboMemory {
  lastSkillHit: string;
  lastSkillHitAt: number;
}

export interface ComboHit {
  combo: ComboDef;
  setup: string;
  payoff: SkillDef;
  bonusPct: number;
  packet: DamagePacket;
}

/**
 * Reads a player packet against a target's memory, updates the memory, and
 * returns the boosted packet when it is a combo. Returns null otherwise (the
 * memory is still updated, so this hit can set up the next one).
 */
export function resolveCombo(packet: DamagePacket, mem: ComboMemory, now: number): ComboHit | null {
  const skill = comboSkillOf(packet);
  if (!skill) return null;
  const prev = mem.lastSkillHit;
  const fresh = now - mem.lastSkillHitAt <= COMBO_WINDOW;
  mem.lastSkillHit = skill.id;
  mem.lastSkillHitAt = now;
  if (!prev || prev === skill.id || !fresh) return null;
  const combo = comboForSkill(skill);
  if (!combo) return null;
  const bonusPct = comboBonusPct(skill);
  let amount = packet.amount * (1 + bonusPct / 100);
  let crit = packet.crit;
  if (combo.crit && !crit) {
    crit = true;
    amount *= 1.5;
  }
  const applies = combo.applies ? [...(packet.applies ?? []), ...combo.applies] : packet.applies;
  const out: DamagePacket = { ...packet, amount, crit };
  if (applies) out.applies = applies;
  return { combo, setup: prev, payoff: skill, bonusPct, packet: out };
}

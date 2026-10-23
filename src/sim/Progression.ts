/**
 * SLAY — progression rules.
 *
 * Level-up rewards, respec policy, and the one rule for kill XP: `killXp`,
 * which grows with depth and rank and nothing else. The level curve it feeds
 * is `xpForLevel` in `sim/Stats.ts`.
 */

import { totalXpForLevel } from './Stats';
import { monsterLevelForDepth } from './Difficulty';
import type { MonsterRank } from '../types';
import { legacyXpMultiplier } from './Legacy';

// ---------------------------------------------------------------------------
// Points per level
// ---------------------------------------------------------------------------

export const STAT_POINTS_PER_LEVEL = 5;
export const SKILL_POINTS_PER_LEVEL = 1;

/** Extra skill points at these levels — the "build unlock" beats. */
const SKILL_MILESTONES: Record<number, number> = {
  10: 1,
  20: 1,
  30: 2,
  40: 1,
  50: 2,
  60: 1,
  70: 2,
  80: 1,
  90: 2,
  99: 3,
};

/** Extra attribute points at these levels. */
const STAT_MILESTONES: Record<number, number> = {
  20: 5,
  40: 5,
  60: 10,
  80: 10,
  99: 15,
};

import { activeDifficulty } from '../data/difficulties';
import { tr } from '../core/I18n';

export function statPointsForLevel(level: number): number {
  // Harder tiers hand out extra attribute points every level.
  return (STAT_POINTS_PER_LEVEL + (STAT_MILESTONES[level] ?? 0)) + activeDifficulty().statPointsPerLevel;
}

export function skillPointsForLevel(level: number): number {
  return SKILL_POINTS_PER_LEVEL + (SKILL_MILESTONES[level] ?? 0);
}

/** Total points a character of `level` should have earned, for save validation. */
export function totalStatPointsAt(level: number): number {
  let total = 0;
  for (let l = 2; l <= level; l++) total += statPointsForLevel(l);
  return total;
}

export function totalSkillPointsAt(level: number): number {
  let total = 1; // one point at creation
  for (let l = 2; l <= level; l++) total += skillPointsForLevel(l);
  return total;
}

export interface LevelUpReward {
  level: number;
  statPoints: number;
  skillPoints: number;
  /** Milestone text for the level-up toast, if this level has one. */
  note?: string;
}

export function levelUpRewards(level: number): LevelUpReward {
  const out: LevelUpReward = {
    level,
    statPoints: statPointsForLevel(level),
    skillPoints: skillPointsForLevel(level),
  };
  if (level === 6) out.note = tr('Second-tier skills unlocked.');
  else if (level === 12) out.note = tr('Third-tier skills unlocked.');
  else if (level === 18) out.note = tr('Fourth-tier skills unlocked.');
  else if (level === 24) out.note = tr('Fifth-tier skills unlocked.');
  else if (level === 30) out.note = tr('Capstone skills unlocked.');
  else if (STAT_MILESTONES[level] || SKILL_MILESTONES[level]) out.note = tr('Milestone: bonus points awarded.');
  return out;
}

// ---------------------------------------------------------------------------
// Experience from kills
// ---------------------------------------------------------------------------

/** How much more XP each rank pays than a normal monster. */
const KILL_XP_RANK: Record<MonsterRank, number> = { normal: 1, champion: 1.9, elite: 3.2, rare: 5, boss: 22 };

/**
 * Each kill's share now floors carry about three times the monsters they did
 * (bigger plain packs, more packs), so a tier still levels the hero at the
 * pace the curve was built for (check-levels).
 */
function crowdXp(depth: number): number {
  // Deep areas hit the per-area cap (`AREA_MONSTER_CAP`), so their crowd grew
  // less and each kill keeps more of its old share.
  return Math.min(0.75, 0.4 + Math.max(0, depth - 25) * 0.006);
}

/** XP the hero gets for a kill at a depth: what DungeonScene grants and the gate shows. */
export function killXp(depth: number, rank: MonsterRank): number {
  return Math.max(1, Math.round((8 + depth * 6) * KILL_XP_RANK[rank] * crowdXp(depth) * activeDifficulty().xp * legacyXpMultiplier()));
}

/**
 * Human-readable danger band for the depth-select UI.
 * Negative numbers mean the player is over-levelled.
 */
export function depthDangerBand(depth: number, playerLevel: number): {
  delta: number;
  label: string;
  color: number;
} {
  const delta = monsterLevelForDepth(depth) - playerLevel;
  if (delta <= -12) return { delta, label: tr('Trivial'), color: 0x7f8c8d };
  if (delta <= -5) return { delta, label: tr('Easy'), color: 0x33d64a };
  if (delta <= 4) return { delta, label: tr('Fair'), color: 0xf5d76e };
  if (delta <= 10) return { delta, label: tr('Dangerous'), color: 0xff8c33 };
  if (delta <= 20) return { delta, label: tr('Deadly'), color: 0xff5a33 };
  return { delta, label: tr('Suicidal'), color: 0xc060ff };
}

// ---------------------------------------------------------------------------
// Respec
// ---------------------------------------------------------------------------

/**
 * Minimal structural view of a character, so this module never has to import
 * `Character.ts` (which imports this one).
 */
export interface RespecTarget {
  level: number;
  gold: number;
  statPoints: number;
  skillPoints: number;
  allocated: { strength: number; dexterity: number; vitality: number; energy: number };
  skills: Record<string, number>;
}

/** Respecs granted for free over a character's life. */
export const FREE_RESPECS = 2;

export interface RespecCost {
  gold: number;
  materials: Record<string, number>;
  free: boolean;
}

/**
 * Cost scales with level and with how much is actually being unwound, so an
 * early course-correction is cheap and a level-90 rebuild is a real decision.
 */
export function respecCost(target: RespecTarget, respecsUsed: number): RespecCost {
  if (respecsUsed < FREE_RESPECS) return { gold: 0, materials: {}, free: true };
  let spent = 0;
  for (const id of Object.keys(target.skills)) spent += target.skills[id] ?? 0;
  const attrSpent =
    target.allocated.strength +
    target.allocated.dexterity +
    target.allocated.vitality +
    target.allocated.energy;
  const gold = Math.floor(
    2500 * Math.pow(target.level, 1.35) * (1 + (spent + attrSpent) / 120) * (1 + (respecsUsed - FREE_RESPECS) * 0.5),
  );
  return { gold, materials: {}, free: false };
}

/** Refunds every skill point. Returns how many were returned. */
export function respecSkills(target: RespecTarget): number {
  let refunded = 0;
  for (const id of Object.keys(target.skills)) refunded += target.skills[id] ?? 0;
  target.skills = {};
  target.skillPoints += refunded;
  return refunded;
}

/** Refunds every allocated attribute point. Returns how many were returned. */
export function respecStats(target: RespecTarget): number {
  const refunded =
    target.allocated.strength +
    target.allocated.dexterity +
    target.allocated.vitality +
    target.allocated.energy;
  target.allocated.strength = 0;
  target.allocated.dexterity = 0;
  target.allocated.vitality = 0;
  target.allocated.energy = 0;
  target.statPoints += refunded;
  return refunded;
}

export function respecAll(target: RespecTarget): { skills: number; stats: number } {
  return { skills: respecSkills(target), stats: respecStats(target) };
}

/** Validates a loaded save's point totals; returns a list of problems found. */
export function auditProgression(target: RespecTarget): string[] {
  const problems: string[] = [];
  let skillsSpent = 0;
  for (const id of Object.keys(target.skills)) skillsSpent += target.skills[id] ?? 0;
  const attrSpent =
    target.allocated.strength +
    target.allocated.dexterity +
    target.allocated.vitality +
    target.allocated.energy;

  const skillBudget = totalSkillPointsAt(target.level);
  const statBudget = totalStatPointsAt(target.level);
  if (skillsSpent + target.skillPoints > skillBudget) {
    problems.push(tr('skill points over budget ({0} > {1})', skillsSpent + target.skillPoints, skillBudget));
  }
  if (attrSpent + target.statPoints > statBudget) {
    problems.push(tr('stat points over budget ({0} > {1})', attrSpent + target.statPoints, statBudget));
  }
  return problems;
}

/** Total XP a character has earned across their whole life. */
export function lifetimeXp(level: number, xp: number): number {
  return totalXpForLevel(level) + Math.max(0, xp);
}

/**
 * SLAY — progression rules.
 *
 * Level-up rewards, respec policy, and the relationship between dungeon depth
 * and experience. The important rule in this file is the penalty band: XP from
 * a kill is scaled by how far the monster's level sits from yours, so farming
 * depth 1 at level 90 pays essentially nothing and diving twenty depths below
 * your level pays a modest premium for the risk.
 */

import { MAX_LEVEL, totalXpForLevel, xpForLevel } from './Stats';
import { monsterLevelForDepth, xpMultiplier } from './Difficulty';
import type { MonsterRank } from '../types';

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

export function statPointsForLevel(level: number): number {
  return STAT_POINTS_PER_LEVEL + (STAT_MILESTONES[level] ?? 0);
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
  if (level === 6) out.note = 'Second-tier skills unlocked.';
  else if (level === 12) out.note = 'Third-tier skills unlocked.';
  else if (level === 18) out.note = 'Fourth-tier skills unlocked.';
  else if (level === 24) out.note = 'Fifth-tier skills unlocked.';
  else if (level === 30) out.note = 'Capstone skills unlocked.';
  else if (STAT_MILESTONES[level] || SKILL_MILESTONES[level]) out.note = 'Milestone: bonus points awarded.';
  return out;
}

// ---------------------------------------------------------------------------
// Experience from kills
// ---------------------------------------------------------------------------

/** XP a single normal monster of `monsterLevel` is worth before modifiers. */
export function baseXpForMonsterLevel(monsterLevel: number): number {
  const m = Math.max(1, monsterLevel);
  // Derived directly from the level curve: roughly 40 same-level normal kills
  // per level, at every level.
  return 1.25 * m * m * Math.pow(1.06, m);
}

export const RANK_XP_MULTIPLIER: Record<MonsterRank, number> = {
  normal: 1,
  champion: 3,
  elite: 5,
  rare: 8,
  boss: 30,
};

/**
 * The penalty band.
 *
 * Within five levels either way, full value. Above that, XP decays
 * exponentially — at twenty levels over the monster you keep 12%, at forty you
 * keep under 1%. Below the monster's level you gain a premium capped at +35%,
 * enough to reward a dangerous dive without making under-levelling optimal.
 */
export function xpPenalty(playerLevel: number, monsterLevel: number): number {
  const diff = playerLevel - monsterLevel;
  if (diff > 5) return Math.max(0.004, Math.exp(-(diff - 5) / 7));
  if (diff < -5) return 1 + Math.min(0.35, (-diff - 5) * 0.03);
  return 1;
}

export interface XpGrantOpts {
  rank?: MonsterRank;
  /** Per-monster `xpMul` from its definition. */
  xpMul?: number;
  /** Party or run-modifier bonus, as a multiplier. */
  bonus?: number;
}

/**
 * XP awarded for killing a monster found at `depth`.
 * `monsterLevel` defaults to the depth curve, but elites and bosses may be
 * higher than the floor's baseline.
 */
export function xpForKill(
  depth: number,
  playerLevel: number,
  opts: XpGrantOpts & { monsterLevel?: number } = {},
): number {
  const mlvl = opts.monsterLevel ?? monsterLevelForDepth(depth);
  const base = baseXpForMonsterLevel(mlvl);
  const rank = RANK_XP_MULTIPLIER[opts.rank ?? 'normal'] ?? 1;
  const penalty = xpPenalty(playerLevel, mlvl);
  const depthBonus = xpMultiplier(depth);
  const total = base * rank * (opts.xpMul ?? 1) * penalty * depthBonus * (opts.bonus ?? 1);
  return Math.max(1, Math.floor(total));
}

/** XP for completing a quest at a depth, as a fraction of a level. */
export function xpForQuest(depth: number, playerLevel: number, rewardXp = 1): number {
  const level = Math.max(1, Math.min(MAX_LEVEL - 1, playerLevel));
  const perLevel = xpForLevel(level);
  if (!isFinite(perLevel)) return 0;
  const mlvl = monsterLevelForDepth(depth);
  return Math.floor(perLevel * 0.18 * rewardXp * xpPenalty(playerLevel, mlvl));
}

// ---------------------------------------------------------------------------
// Depth guidance
// ---------------------------------------------------------------------------

/** The depth whose monsters sit at the player's level — the "fair fight" line. */
export function recommendedDepthForLevel(level: number): number {
  let d = 1;
  while (d < 400 && monsterLevelForDepth(d + 1) <= level) d++;
  return d;
}

/** The level a player should be to fight at a depth without an XP penalty. */
export function recommendedLevelForDepth(depth: number): number {
  return monsterLevelForDepth(depth);
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
  if (delta <= -12) return { delta, label: 'Trivial', color: 0x7f8c8d };
  if (delta <= -5) return { delta, label: 'Easy', color: 0x33d64a };
  if (delta <= 4) return { delta, label: 'Fair', color: 0xf5d76e };
  if (delta <= 10) return { delta, label: 'Dangerous', color: 0xff8c33 };
  if (delta <= 20) return { delta, label: 'Deadly', color: 0xff5a33 };
  return { delta, label: 'Suicidal', color: 0xc060ff };
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
    problems.push(`skill points over budget (${skillsSpent + target.skillPoints} > ${skillBudget})`);
  }
  if (attrSpent + target.statPoints > statBudget) {
    problems.push(`stat points over budget (${attrSpent + target.statPoints} > ${statBudget})`);
  }
  return problems;
}

/** Total XP a character has earned across their whole life. */
export function lifetimeXp(level: number, xp: number): number {
  return totalXpForLevel(level) + Math.max(0, xp);
}

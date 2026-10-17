/**
 * SLAY — the authoring kit every skill tree is written with.
 *
 * Lives apart from `../skills.ts` so a class can keep its trees in a file of
 * its own (`classSkills/<class>.ts`) and `skills.ts` only spreads them in.
 * Importing these helpers from `skills.ts` itself would be a cycle: the
 * class file would run before the helpers it needs were defined.
 *
 * Pure data, no Three.js.
 */

import type { DamageType, SkillDef, SkillTargeting, StatKey } from '../../types';

export const MAX_SKILL_RANK = 20;

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Linear: value at rank 1 is `a`, each further rank adds `b`. */
export const lin = (a: number, b: number) => (r: number): number => r1(a + b * (r - 1));
/** Straight per-rank: `b` per rank, zero at rank 0. */
export const per = (b: number) => (r: number): number => r1(b * r);
/**
 * Diminishing: approaches `cap`, closing `k` of the remaining gap each rank.
 * Used for anything that must never reach 100% (block, resistance, dodge).
 */
export const dim = (cap: number, k: number) => (r: number): number => r1(cap * (1 - Math.pow(1 - k, r)));

export const mana = (a: number, b: number) => (r: number): number => Math.max(0, r1(a + b * (r - 1)));
export const cool = (a: number, b: number, min = 0.4) => (r: number): number => Math.max(min, r1(a - b * (r - 1)));

/** One skill as a tree file writes it. */
export interface Spec {
  id: string;
  name: string;
  desc: string;
  tier: number;
  col: number;
  icon: string;
  /** Defaults to 20. Capstones and one-per-run skills use lower caps. */
  max?: number;
  req?: string[];
  /** Defaults to 'passive'. */
  t?: SkillTargeting;
  /** [rank-1 cost, per-rank delta] */
  mana?: [number, number];
  /** [rank-1 cooldown, per-rank reduction, floor] */
  cd?: [number, number] | [number, number, number];
  /** [rank-1 damage multiplier, per-rank delta] */
  dmg?: [number, number];
  type?: DamageType;
  fx?: string;
  p?: Record<string, number | number[]>;
  stat?: Partial<Record<StatKey, (r: number) => number>>;
}

/** Turns a tree's specs into skill definitions. */
export function build(treeId: string, specs: Spec[]): SkillDef[] {
  return specs.map((s): SkillDef => {
    const out: SkillDef = {
      id: s.id,
      treeId,
      name: s.name,
      desc: s.desc,
      tier: s.tier,
      column: s.col,
      maxRank: s.max ?? MAX_SKILL_RANK,
      targeting: s.t ?? 'passive',
      icon: s.icon,
    };
    if (s.req) out.requires = s.req;
    if (s.mana) out.manaCost = mana(s.mana[0], s.mana[1]);
    if (s.cd) out.cooldown = cool(s.cd[0], s.cd[1], s.cd[2]);
    // To the hundredth: rounded to tenths, a small step (0.08 a rank) bought
    // nothing at some ranks, so a point in the skill only made it cheaper.
    if (s.dmg) {
      const [a, b] = s.dmg;
      out.damageScale = (r: number): number => r2(a + b * (r - 1));
    }
    if (s.type) out.damageType = s.type;
    if (s.fx) out.effect = s.fx;
    if (s.p) out.params = s.p;
    if (s.stat) out.passive = s.stat;
    return out;
  });
}

/**
 * `target` gains `pctPerRank`% damage (or effect strength, for skills without a
 * damage roll) for every rank invested in `source`. Both must live in the same
 * tree. This is the D2 mechanic that turns 20 points into a build.
 */
export interface SynergyLink {
  target: string;
  source: string;
  pctPerRank: number;
}

export const syn = (target: string, source: string, pctPerRank: number): SynergyLink => ({
  target,
  source,
  pctPerRank,
});

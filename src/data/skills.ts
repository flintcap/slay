/**
 * SLAY — skill trees.
 *
 * Fifteen trees, three per class, six tiers deep, three skills per tier. 270
 * skills, ranks 1-20, Diablo II structure:
 *
 *  - A tier unlocks when you have spent `TIER_POINTS[tier]` points anywhere in
 *    that tree AND reached `TIER_LEVEL[tier]`.
 *  - `requires` lists skills that need at least one rank first.
 *  - Synergies (see `SYNERGIES`) let one skill add a percentage per rank to
 *    another skill in the same tree. They are the reason a build is a build and
 *    not a shopping list, and the reason respeccing hurts.
 *  - Every tree's tier-6 left slot is its capstone: a skill that changes how the
 *    class is played, not one that adds a number to it.
 *
 * `effect` is a handler id the gameplay/FX layer switches on; `params` are the
 * knobs it reads. Nothing here imports Three.js — this file is pure data.
 */

import type { CharClassId, DamageType, SkillDef, SkillTargeting, SkillTreeDef, StatKey } from '../types';

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

/** Points that must already be spent in a tree before tier N opens. */
export const TIER_POINTS: readonly number[] = [0, 0, 4, 9, 15, 22, 30];
/** Character level required for tier N. */
export const TIER_LEVEL: readonly number[] = [0, 1, 6, 12, 18, 24, 30];

export const MAX_SKILL_RANK = 20;
/** Ranks above `maxRank` only come from +skills gear, and cap here. */
export const HARD_SKILL_RANK_CAP = 40;

// ---------------------------------------------------------------------------
// Scaling helpers
// ---------------------------------------------------------------------------

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Linear: value at rank 1 is `a`, each further rank adds `b`. */
const lin = (a: number, b: number) => (r: number): number => r1(a + b * (r - 1));
/** Straight per-rank: `b` per rank, zero at rank 0. */
const per = (b: number) => (r: number): number => r1(b * r);
/**
 * Diminishing: approaches `cap`, closing `k` of the remaining gap each rank.
 * Used for anything that must never reach 100% (block, resistance, dodge).
 */
const dim = (cap: number, k: number) => (r: number): number => r1(cap * (1 - Math.pow(1 - k, r)));

const mana = (a: number, b: number) => (r: number): number => Math.max(0, r1(a + b * (r - 1)));
const cool = (a: number, b: number, min = 0.4) => (r: number): number => Math.max(min, r1(a - b * (r - 1)));

// ---------------------------------------------------------------------------
// Authoring shape
// ---------------------------------------------------------------------------

interface Spec {
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

function build(treeId: string, specs: Spec[]): SkillDef[] {
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
    if (s.dmg) out.damageScale = lin(s.dmg[0], s.dmg[1]);
    if (s.type) out.damageType = s.type;
    if (s.fx) out.effect = s.fx;
    if (s.p) out.params = s.p;
    if (s.stat) out.passive = s.stat;
    return out;
  });
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

export const SKILL_TREES: SkillTreeDef[] = [
  {
    id: 'bulwark',
    name: 'Bulwark',
    classId: 'warden',
    blurb: 'The shield as a weapon. Block, absorb, and make the return trip expensive.',
  },
  {
    id: 'carnage',
    name: 'Carnage',
    classId: 'warden',
    blurb: 'Open wounds and let them work. Bleeds that spread, stack, and finish.',
  },
  {
    id: 'oath',
    name: 'Oaths',
    classId: 'warden',
    blurb: 'Shouts, standards and sworn auras — the Warden holds a line even alone.',
  },
  {
    id: 'conflagration',
    name: 'Conflagration',
    classId: 'pyromancer',
    blurb: 'Fire delivered directly, at speed, in quantity.',
  },
  {
    id: 'cinders',
    name: 'Cinders',
    classId: 'pyromancer',
    blurb: 'Burn is a resource. Apply it everywhere, spread it, then spend it.',
  },
  {
    id: 'sunfire',
    name: 'Sunfire',
    classId: 'pyromancer',
    blurb: 'Arcane and solar work: wards, meteors, and the thing you should not have made.',
  },
  {
    id: 'venom',
    name: 'Venom',
    classId: 'shadowblade',
    blurb: 'Coated edges and patient toxins. The kill happens after you have left.',
  },
  {
    id: 'shadowcraft',
    name: 'Shadowcraft',
    classId: 'shadowblade',
    blurb: 'Stealth, displacement and duplicates — control the moment you are seen.',
  },
  {
    id: 'bladework',
    name: 'Bladework',
    classId: 'shadowblade',
    blurb: 'Pure edge: attack rating, critical strikes, and the multipliers behind them.',
  },
  {
    id: 'tempest',
    name: 'Tempest',
    classId: 'stormcaller',
    blurb: 'Bolts, chains and called-down strikes. Damage from the sky.',
  },
  {
    id: 'galewalk',
    name: 'Galewalk',
    classId: 'stormcaller',
    blurb: 'Wind, motion and evasion. Standing still is the only mistake.',
  },
  {
    id: 'conduit',
    name: 'Conduit',
    classId: 'stormcaller',
    blurb: 'Static charge as ammunition: build it on everything, then close the circuit.',
  },
  {
    id: 'ossuary',
    name: 'Ossuary',
    classId: 'revenant',
    blurb: 'Bone, and the things you build out of it. An army that regrows.',
  },
  {
    id: 'blight',
    name: 'Blight',
    classId: 'revenant',
    blurb: 'Curses layered until a room kills itself.',
  },
  {
    id: 'gravepact',
    name: 'Grave Pact',
    classId: 'revenant',
    blurb: 'Life is fungible. Take theirs, spend yours, and refuse to stay dead.',
  },
];

export const TREE_BY_ID: Record<string, SkillTreeDef> = Object.create(null);
for (const t of SKILL_TREES) TREE_BY_ID[t.id] = t;

// <<APPEND>>

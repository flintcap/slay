/**
 * SLAY — what a point in a skill buys, beyond its cost and its cooldown.
 *
 * A damage skill grows through its `dmg` ladder. Everything else (armours,
 * stances, shouts, curses, summons, detonations) used to grow only cheaper
 * and faster: the per-rank numbers in the tree text were written but never
 * read, and most buffs carried the fixed numbers of the status they borrowed.
 * Here every one of them says what it does at a rank, and the skill runner
 * asks this file.
 *
 * `k` is ranks past the first (rank 1 is k = 0); `n` reads the skill's own
 * params. Pure data, no Three.js.
 */
import type { Stats } from '../types';

type Num = (key: string, d: number) => number;

/** A buff on the caster. */
export interface SelfPower {
  /** Status to grant, when it is not the skill's usual one. */
  status?: string;
  /** Stat changes at this rank, in place of the status's own. */
  mods?: Partial<Stats>;
  /** Seconds. */
  duration?: number;
  /** Flat damage soaked. */
  absorb?: number;
  /** Damage soaked, as a share of maximum life (percent). */
  absorbLifePct?: number;
  /** Heals you (and your minions) for this percent of maximum life. */
  healPct?: number;
}

/** What a curse, mark or shout leaves on a monster. */
export interface FoePower {
  status?: string;
  mods?: Partial<Stats>;
  duration?: number;
  /** Scales a damage-over-time, a hold or a link. */
  magnitude?: number;
  /** A second status the same cast leaves (a shout that fears and weakens). */
  also?: { status: string; duration: number; mods?: Partial<Stats> };
}

/** Every resistance down by `v` points. */
const shred = (v: number): Partial<Stats> => ({
  physicalResist: -v,
  fireResist: -v,
  coldResist: -v,
  lightningResist: -v,
  poisonResist: -v,
  arcaneResist: -v,
});

const r1 = (v: number): number => Math.round(v * 10) / 10;

/** Ice Armor's time at a rank: two minutes, up to three. */
export const ICE_ARMOR_SECONDS = (k: number): number => Math.min(180, 120 + 3 * k);

export const SELF_POWER: Record<string, (k: number, n: Num) => SelfPower> = {
  // Mage
  iceArmor: (k) => ({
    status: 'frostArmor',
    duration: ICE_ARMOR_SECONDS(k),
    mods: { enhancedDefense: 30 + 6 * k, coldResist: r1(10 + 1.5 * k), damageReduction: r1(3 + 0.6 * k) },
    absorbLifePct: 12 + 2 * k,
  }),

  // Knight
  shieldWall: (k, n) => ({
    mods: { blockChance: r1(n('blockPct', 12) + n('blockPerRank', 1.5) * k), damageReduction: r1(8 + n('drPerRank', 2) * k) },
  }),
  guardStance: (k, n) => ({
    mods: {
      enhancedDefense: n('defPct', 45) + n('defPerRank', 4) * k,
      damageReduction: r1(n('dr', 12) + n('drPerRank', 1.5) * k),
      moveSpeed: n('moveSpeed', -25),
    },
  }),
  aegis: (k, n) => ({ absorb: n('absorb', 60) + n('absorbPerRank', 35) * k }),
  fortressStance: (k, n) => ({
    mods: {
      enhancedDefense: n('defPct', 120) + n('defPerRank', 8) * k,
      blockChance: r1(n('blockPct', 20) + 0.5 * k),
      damageReduction: 25,
      moveSpeed: -20,
    },
  }),
  battleCry: (k, n) => ({ mods: { enhancedDamage: n('damagePct', 20) + n('perRank', 3) * k } }),
  rallyingHorn: (k, n) => ({ healPct: n('healPct', 12) + n('perRank', 2) * k }),
  bannerOfTheGate: (k, n) => ({
    mods: {
      enhancedDefense: n('defPct', 25) + n('perRank', 2) * k,
      enhancedDamage: n('dmgPct', 15) + n('perRank', 2) * k,
    },
  }),

  // Rogue
  coatBlades: (k) => ({ mods: { poisonDamage: 8 * (k + 1) } }),
  veil: (k, n) => ({
    duration: r1(n('duration', 6) + n('perRank', 0.3) * k),
    mods: { moveSpeed: n('moveSpeed', 15) + k, critChance: 100, critDamage: 20 + 4 * k },
  }),
  vanish: (k, n) => ({
    duration: r1(n('phasing', 8) + 0.25 * k),
    mods: { moveSpeed: r1(40 + 1.5 * k), critChance: 100 },
  }),

  // Ranger
  venomCoat: (k) => ({ mods: { poisonDamage: 5 + 3 * k } }),
  camouflage: (k, n) => ({
    duration: r1(n('duration', 8) + 0.3 * k),
    mods: { moveSpeed: 15, critChance: 100, critDamage: 30 + 5 * k },
  }),

  // Revenant
  boneArmor: (k, n) => ({
    absorb: n('absorb', 80) + n('absorbPerRank', 45) * k,
    mods: { defense: 12 * (k + 1) },
  }),
  bloodPact: (k, n) => ({ mods: { enhancedDamage: n('damagePct', 40) + n('perRank', 4) * k, lifeSteal: 12 } }),
  revenantForm: (k, n) => ({
    mods: { enhancedDamage: n('damagePct', 50) + n('perRank', 4) * k, damageReduction: n('dr', 30) + k },
  }),
};

export const FOE_POWER: Record<string, (k: number, n: Num) => FoePower> = {
  // Ranger
  huntersMark: (k, n) => ({ mods: shred(r1(n('amp', 12) + n('ampPerRank', 1.5) * k)) }),
  snareTrap: (k, n) => ({ duration: r1(n('root', 2.5) + n('rootPerRank', 0.2) * k) }),

  // Knight
  battleCry: (k, n) => ({ status: 'weakened', duration: r1(n('weakenDuration', 8) + 0.3 * k) }),
  intimidate: (k, n) => ({
    status: 'feared',
    duration: r1(n('fear', 3) + n('fearPerRank', 0.2) * k),
    also: { status: 'weakened', duration: n('weaken', 10) + 0.3 * k },
  }),
  tauntingRoar: (k, n) => ({
    status: 'vulnerable',
    duration: r1(n('duration', 5) + n('durationPerRank', 0.2) * k + 3),
    mods: shred(n('vulnerable', 8) * 3 + 1.5 * k),
  }),

  // Rogue
  smokeBomb: (k, n) => ({ duration: r1(n('duration', 6) + 0.2 * k) }),
  nightfall: (k, n) => ({
    mods: { attackRating: -(60 + 2 * k), critChance: -15, moveSpeed: -(25 + k) },
    duration: n('duration', 8),
  }),

  // Mage
  ionize: (k, n) => ({
    status: 'shocked',
    duration: n('duration', 10),
    mods: { lightningResist: -(n('amplifyPct', 25) + n('perRank', 3) * k), defense: -40 },
  }),

  // Revenant
  weaken: (k, n) => ({
    duration: r1(n('duration', 10) + n('perRank', 0.5) * k),
    mods: { enhancedDamage: -Math.min(55, 35 + k) },
  }),
  amplifyDamage: (k, n) => {
    const v = n('amplify', 25) + n('perRank', 2) * k;
    return { mods: { ...shred(r1(v * 0.6)), physicalResist: -v } };
  },
  terror: (k, n) => ({
    duration: r1(n('duration', 4) + n('perRank', 0.2) * k),
    mods: { moveSpeed: 20, enhancedDamage: -50, ...shred(n('amplify', 15) + k) },
  }),
  massConfusion: (k, n) => ({
    duration: r1(n('duration', 5) + n('perRank', 0.25) * k),
    mods: shred(n('friendlyFire', 20) * 0.5 + k),
  }),
  lowerResist: (k, n) => ({ mods: shred(n('resist', 40) + n('perRank', 2) * k) }),
  soulCage: (k, n) => ({
    mods: shred(n('amplify', 25) + n('perRank', 2) * k),
    magnitude: 1 + 0.08 * k,
  }),
  soulTether: (k, n) => ({
    magnitude: (n('sharePct', 35) + n('perRank', 3) * k) / Math.max(1, n('sharePct', 35)),
  }),
};

/**
 * How much harder the hits of a skill without a `dmg` ladder land at a rank:
 * a detonation, a drain, a summon's blows. 1 at rank 1. The ones the tree
 * text gives a number for use it; the rest gain 8% a rank.
 */
export const BURST_POWER: Record<string, (k: number, n: Num) => number> = {
  gorefeast: (k) => 1 + 0.08 * k,
  envenomBurst: (k, n) => ratio(n('pctPerStack', 45), n('perRank', 6), k),
  corpseExplosion: (k, n) => ratio(n('lifePct', 45), n('perRank', 4), k),
  sanguineNova: (k, n) => ratio(n('scale', 400), n('perRank', 30), k),
  exsanguinate: (k, n) => ratio(n('pctPerSecond', 5), n('perRank', 0.4), k),
  shadowClone: (k, n) => ratio(n('damagePct', 45), n('perRank', 5), k),
  raiseSkeleton: (k, n) => ratio(n('damagePct', 55), n('perRank', 6), k),
  skeletalMage: (k, n) => ratio(n('damagePct', 60), n('perRank', 7), k),
  claySentinel: (k, n) => ratio(n('damagePct', 70), 4, k),
  grandOssuary: (k) => 1 + 0.06 * k,
};

function ratio(base: number, per: number, k: number): number {
  return base > 0 ? (base + per * k) / base : 1 + 0.08 * k;
}

export function burstGrowth(id: string, k: number, n: Num): number {
  const f = BURST_POWER[id];
  return f ? f(k, n) : 1 + 0.08 * k;
}

/** A summon's body at a rank: 4% more life a rank, or the tree's own number. */
export function minionLifeGrowth(id: string, k: number, n: Num): number {
  if (id === 'claySentinel') return ratio(n('lifePct', 260), n('perRank', 15), k);
  return 1 + 0.04 * k;
}

/**
 * A buff with nothing written here still grows: its status's own bonuses
 * rise 6% a rank. Penalties (a stance's slower feet) stay as they are.
 */
export function grownMods(base: Partial<Stats> | undefined, k: number): Partial<Stats> | undefined {
  if (!base || k <= 0) return undefined;
  const out: Partial<Stats> = {};
  for (const key of Object.keys(base) as Array<keyof Stats>) {
    const v = base[key] ?? 0;
    out[key] = v > 0 && key !== 'critChance' ? r1(v * (1 + 0.06 * k)) : v;
  }
  return out;
}

/** Every bonus in a set of stat changes times `f`; penalties stay put. */
export function scaleMods(base: Partial<Stats>, f: number): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const key of Object.keys(base) as Array<keyof Stats>) {
    const v = base[key] ?? 0;
    out[key] = v > 0 && key !== 'critChance' ? r1(v * f) : v;
  }
  return out;
}

/** A curse made stronger: every penalty in it times `f`. */
export function scaleShred(base: Partial<Stats>, f: number): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const key of Object.keys(base) as Array<keyof Stats>) {
    const v = base[key] ?? 0;
    out[key] = v < 0 ? r1(v * f) : v;
  }
  return out;
}

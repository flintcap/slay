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
 * params. Rank 1 is a low base and every point after it is a clear step up:
 * the per-rank numbers here and in the trees were doubled for that, and the
 * defaults below match the trees. Pure data, no Three.js.
 */
import type { Stats } from '../types';
import { SHIFTER_FOE_POWER, SHIFTER_SELF_POWER } from './shifterPower';

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
export const ICE_ARMOR_SECONDS = (k: number): number => Math.min(180, 120 + 6 * k);

export const SELF_POWER: Record<string, (k: number, n: Num) => SelfPower> = {
  // Mage
  iceArmor: (k) => ({
    status: 'frostArmor',
    duration: ICE_ARMOR_SECONDS(k),
    mods: { enhancedDefense: 30 + 12 * k, coldResist: r1(10 + 3 * k), damageReduction: r1(3 + 1.2 * k) },
    absorbLifePct: 12 + 4 * k,
  }),

  // Knight
  shieldWall: (k, n) => ({
    mods: { blockChance: r1(n('blockPct', 12) + n('blockPerRank', 3) * k), damageReduction: r1(8 + n('drPerRank', 4) * k) },
  }),
  guardStance: (k, n) => ({
    mods: {
      enhancedDefense: n('defPct', 45) + n('defPerRank', 8) * k,
      damageReduction: r1(n('dr', 12) + n('drPerRank', 3) * k),
      moveSpeed: n('moveSpeed', -25),
    },
  }),
  aegis: (k, n) => ({ absorb: n('absorb', 60) + n('absorbPerRank', 70) * k }),
  fortressStance: (k, n) => ({
    mods: {
      enhancedDefense: n('defPct', 120) + n('defPerRank', 16) * k,
      blockChance: r1(n('blockPct', 20) + k),
      damageReduction: r1(25 + 1.5 * k),
      moveSpeed: -20,
    },
  }),
  battleCry: (k, n) => ({ mods: { enhancedDamage: n('damagePct', 20) + n('perRank', 6) * k } }),
  rallyingHorn: (k, n) => ({ healPct: n('healPct', 12) + n('perRank', 4) * k }),
  bannerOfTheGate: (k, n) => ({
    mods: {
      enhancedDefense: n('defPct', 25) + n('perRank', 4) * k,
      enhancedDamage: n('dmgPct', 15) + n('perRank', 4) * k,
    },
  }),

  // Rogue
  coatBlades: (k) => ({ mods: { poisonDamage: 8 + 16 * k } }),
  veil: (k, n) => ({
    duration: r1(n('duration', 6) + n('perRank', 0.6) * k),
    mods: { moveSpeed: n('moveSpeed', 15) + 2 * k, critChance: 100, critDamage: 20 + 8 * k },
  }),
  vanish: (k, n) => ({
    duration: r1(n('phasing', 8) + 0.5 * k),
    mods: { moveSpeed: 40 + 5 * k, critChance: 100 },
  }),

  // Ranger
  venomCoat: (k) => ({ mods: { poisonDamage: 5 + 6 * k } }),
  camouflage: (k, n) => ({
    duration: r1(n('duration', 8) + 0.6 * k),
    mods: { moveSpeed: 15, critChance: 100, critDamage: 30 + 10 * k },
  }),

  // Revenant
  boneArmor: (k, n) => ({
    absorb: n('absorb', 80) + n('absorbPerRank', 90) * k,
    mods: { defense: 12 + 24 * k },
  }),
  bloodPact: (k, n) => ({ mods: { enhancedDamage: n('damagePct', 40) + n('perRank', 8) * k, lifeSteal: 12 } }),
  revenantForm: (k, n) => ({
    mods: { enhancedDamage: n('damagePct', 50) + n('perRank', 8) * k, damageReduction: n('dr', 30) + 2 * k },
  }),

  // Paladin
  barTheDoor: (k, n) => ({
    duration: r1(n('duration', 5) + n('durationPerRank', 0.3) * k),
    mods: { blockChance: r1(n('block', 20) + n('blockPerRank', 1) * k), damageReduction: r1(n('dr', 10) + n('drPerRank', 1) * k) },
  }),
  // Paladin vigils (`scenes/paladin/Vigils.ts`): what the ring gives him, each tick.
  tallowLight: (k, n) => ({
    mods: { lifeRegen: r1(n('regen', 4) + n('regenPerRank', 3) * k), manaRegen: r1(n('mana', 1.5) + n('manaPerRank', 0.6) * k) },
  }),
  ironVigil: (k, n) => ({
    mods: { enhancedDefense: n('def', 30) + n('defPerRank', 10) * k, damageReduction: r1(n('dr', 4) + n('drPerRank', 1.2) * k) },
  }),
  fervour: (k, n) => {
    const v = r1(n('speed', 8) + n('speedPerRank', 2.4) * k);
    return { mods: { attackSpeed: v, castSpeed: v, moveSpeed: r1(n('move', 6) + n('movePerRank', 1.6) * k) } };
  },
  anoint: (k, n) => ({
    duration: r1(n('duration', 20) + n('durationPerRank', 2) * k),
    mods: { enhancedDamage: n('dmg', 20) + n('dmgPerRank', 6) * k, attackRating: n('ar', 30) + n('arPerRank', 12) * k },
  }),
  martyrsVow: (k, n) => ({
    duration: r1(n('duration', 10) + n('durationPerRank', 0.6) * k),
    absorbLifePct: n('ward', 15) + n('wardPerRank', 4) * k,
    mods: { damageReduction: r1(n('dr', 5) + n('drPerRank', 1) * k) },
  }),
  // Shapeshifter (`data/shifterPower.ts`)
  ...SHIFTER_SELF_POWER,
};

export const FOE_POWER: Record<string, (k: number, n: Num) => FoePower> = {
  // Ranger
  huntersMark: (k, n) => ({ mods: shred(r1(n('amp', 12) + n('ampPerRank', 3) * k)) }),
  snareTrap: (k, n) => ({ duration: r1(n('root', 2.5) + n('rootPerRank', 0.4) * k) }),

  // Knight
  battleCry: (k, n) => ({ status: 'weakened', duration: r1(n('weakenDuration', 8) + 0.6 * k) }),
  intimidate: (k, n) => ({
    status: 'feared',
    duration: r1(n('fear', 3) + n('fearPerRank', 0.4) * k),
    also: { status: 'weakened', duration: r1(n('weaken', 10) + 0.6 * k) },
  }),
  tauntingRoar: (k, n) => ({
    status: 'vulnerable',
    duration: r1(n('duration', 5) + n('durationPerRank', 0.4) * k + 3),
    mods: shred(n('vulnerable', 8) * 3 + 3 * k),
  }),

  // Rogue
  smokeBomb: (k, n) => ({ duration: r1(n('duration', 6) + 0.4 * k) }),
  nightfall: (k, n) => ({
    mods: { attackRating: -(60 + 4 * k), critChance: -15, moveSpeed: -(25 + 2 * k) },
    duration: r1(n('duration', 8) + 0.3 * k),
  }),

  // Mage
  ionize: (k, n) => ({
    status: 'shocked',
    duration: n('duration', 10),
    mods: { lightningResist: -(n('amplifyPct', 25) + n('perRank', 6) * k), defense: -(40 + 4 * k) },
  }),

  // Revenant
  weaken: (k, n) => ({
    duration: r1(n('duration', 10) + n('perRank', 1) * k),
    mods: { enhancedDamage: -Math.min(60, 35 + 2 * k) },
  }),
  amplifyDamage: (k, n) => {
    const v = n('amplify', 25) + n('perRank', 4) * k;
    return { mods: { ...shred(r1(v * 0.6)), physicalResist: -v } };
  },
  terror: (k, n) => ({
    duration: r1(n('duration', 4) + n('perRank', 0.4) * k),
    mods: { moveSpeed: 20, enhancedDamage: -50, ...shred(n('amplify', 15) + 2 * k) },
  }),
  massConfusion: (k, n) => ({
    duration: r1(n('duration', 5) + n('perRank', 0.5) * k),
    mods: shred(n('friendlyFire', 20) * 0.5 + 2 * k),
  }),
  lowerResist: (k, n) => ({ mods: shred(n('resist', 40) + n('perRank', 4) * k) }),
  soulCage: (k, n) => ({
    mods: shred(n('amplify', 25) + n('perRank', 4) * k),
    magnitude: 1 + 0.16 * k,
  }),
  soulTether: (k, n) => ({
    magnitude: (n('sharePct', 35) + n('perRank', 6) * k) / Math.max(1, n('sharePct', 35)),
  }),

  // Paladin (`scenes/paladin/Vigils.ts`): a censure, and what a vigil's ring does to what stands in it.
  censure: (k, n) => ({
    duration: r1(n('duration', 8) + n('durationPerRank', 0.8) * k),
    mods: { attackRating: -(n('ar', 20) + n('arPerRank', 4) * k), enhancedDefense: -(n('def', 15) + n('defPerRank', 4) * k) },
  }),
  censerSmoke: (k, n) => ({
    mods: { attackRating: -(n('ar', 15) + n('arPerRank', 3) * k), attackSpeed: -r1(n('slow', 8) + n('slowPerRank', 1.6) * k) },
  }),
  writOfAsh: (k, n) => ({ mods: shred(r1(n('shred', 8) + n('shredPerRank', 2) * k)) }),
  consecratedGround: (k, n) => ({
    mods: { moveSpeed: -r1(n('slow', 20) + n('slowPerRank', 3) * k), attackSpeed: -r1(n('drag', 5) + n('dragPerRank', 1) * k) },
  }),
  // Shapeshifter (`data/shifterPower.ts`)
  ...SHIFTER_FOE_POWER,
};

/**
 * How much harder the hits of a skill without a `dmg` ladder land at a rank:
 * a detonation, a drain, a summon's blows. 1 at rank 1. The ones the tree
 * text gives a number for use it; the rest gain 16% a rank.
 */
export const BURST_POWER: Record<string, (k: number, n: Num) => number> = {
  gorefeast: (k) => 1 + 0.16 * k,
  envenomBurst: (k, n) => ratio(n('pctPerStack', 45), n('perRank', 12), k),
  corpseExplosion: (k, n) => ratio(n('lifePct', 45), n('perRank', 8), k),
  sanguineNova: (k, n) => ratio(n('scale', 400), n('perRank', 60), k),
  exsanguinate: (k, n) => ratio(n('pctPerSecond', 5), n('perRank', 0.8), k),
  shadowClone: (k, n) => ratio(n('damagePct', 45), n('perRank', 10), k),
  raiseSkeleton: (k, n) => ratio(n('damagePct', 55), n('perRank', 12), k),
  skeletalMage: (k, n) => ratio(n('damagePct', 60), n('perRank', 14), k),
  claySentinel: (k, n) => ratio(n('damagePct', 70), 8, k),
  grandOssuary: (k) => 1 + 0.12 * k,
};

function ratio(base: number, per: number, k: number): number {
  return base > 0 ? (base + per * k) / base : 1 + 0.16 * k;
}

export function burstGrowth(id: string, k: number, n: Num): number {
  const f = BURST_POWER[id];
  return f ? f(k, n) : 1 + 0.16 * k;
}

/**
 * A summon's body at a rank: a tenth of its rank-1 life more a rank, or the
 * tree's own number (`lifePerRank`, in points of your life).
 */
export function minionLifeGrowth(id: string, k: number, n: Num): number {
  if (id === 'claySentinel') return ratio(n('lifePct', 260), n('perRank', 30), k);
  const per = n('lifePerRank', 0);
  return per > 0 ? ratio(n('lifePct', 40), per, k) : 1 + 0.1 * k;
}

/**
 * A buff with nothing written here still grows: its status's own bonuses
 * rise 12% a rank. Penalties (a stance's slower feet) stay as they are.
 */
export function grownMods(base: Partial<Stats> | undefined, k: number): Partial<Stats> | undefined {
  if (!base || k <= 0) return undefined;
  const out: Partial<Stats> = {};
  for (const key of Object.keys(base) as Array<keyof Stats>) {
    const v = base[key] ?? 0;
    out[key] = v > 0 && key !== 'critChance' ? r1(v * (1 + 0.12 * k)) : v;
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

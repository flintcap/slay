/**
 * SLAY — what the Ranger's passives do, beyond their stat tables.
 *
 * `RANGER_RULES` is spread into the passive engine's `RULES`
 * (`../Passives.ts`), so these run exactly like every other class's rules.
 * Numbers no other class has go to `e.rgr`, a small record of the Ranger's
 * own, read where the Ranger's arrows land (`scenes/ranger/RangerMoves.ts`);
 * the rest reuse the shared fields (Slip Free's shorter holds are the same
 * `ccReductionPct` the Knight's Immovable uses).
 *
 * Pure: reads a skill's params, writes numbers.
 */
import type { PassiveEffects } from '../Passives';
import { SKILL_BY_ID } from '../../data/skills';

/** The Ranger's own passive numbers. All zero for every other class. */
export interface RangerEffects {
  /** Long Eye: +% damage a metre past `longFrom` metres, up to `longCap`%. */
  longPerM: number;
  longFrom: number;
  longCap: number;
  /** Open Season: more enemies Hunter's Mark lands on, how far from the first, and crit damage on the marked. */
  openExtra: number;
  openSpread: number;
  openCritDmg: number;
  /** Clean Kill: the first arrow into an enemy at full life crits, with this much more crit damage. 0 = off. */
  cleanCritDmg: number;
  /** Through and Through: single arrows pierce (1), each enemy passed adds `passPct`%, up to `passCap`%. */
  pierceAll: number;
  passPct: number;
  passCap: number;
  /** Fletcher's Art: +% damage with bow skills. */
  bowPct: number;
  /** Bolt-Hole: below `boltBelow`% life, heal `boltHeal`% over `boltOver`s and run `boltRun`% faster; every `boltCd`s. */
  boltBelow: number;
  boltHeal: number;
  boltOver: number;
  boltRun: number;
  boltCd: number;
  /** Slip Free: Roll Away and Disengage shake a hold or slow off first (1). */
  slipFree: number;
  /** Lay of the Land: a Spike Trap where each roll and leap begins (1); traps arm at once (1); more out of each; +% trap damage. */
  footTraps: number;
  armNow: number;
  trapExtra: number;
  /** +% damage with traps, Thorn Barrier and the kestrel (Lay of the Land, Huntcraft). */
  trapPct: number;
  /** Huntcraft: traps catch from this much farther, as a percentage. */
  trapReachPct: number;
  /** Close Grouping: each arrow of one loose after the first into the same enemy, +%. */
  groupPct: number;
  /** Thicket of Shafts: seconds the shafts stand where a rain falls, and the slow in them. 0 = off. */
  thicketSec: number;
  thicketSlow: number;
  /** Murmuration: a killing arrow splits; share of the killing hit, reach, arrows a split, splits deep, most in the air. */
  murmurShare: number;
  murmurReach: number;
  murmurSplit: number;
  murmurDepth: number;
  murmurMost: number;
  /** Arrowsmith: +% damage and +% critical chance with skills that loose several arrows, and the rains. */
  multiPct: number;
  multiCrit: number;
}

export function emptyRangerEffects(): RangerEffects {
  return {
    longPerM: 0, longFrom: 0, longCap: 0, openExtra: 0, openSpread: 0, openCritDmg: 0, cleanCritDmg: 0,
    pierceAll: 0, passPct: 0, passCap: 0, bowPct: 0,
    boltBelow: 0, boltHeal: 0, boltOver: 0, boltRun: 0, boltCd: 0, slipFree: 0,
    footTraps: 0, armNow: 0, trapExtra: 0, trapPct: 0, trapReachPct: 0, groupPct: 0, thicketSec: 0, thicketSlow: 0,
    murmurShare: 0, murmurReach: 0, murmurSplit: 0, murmurDepth: 0, murmurMost: 0, multiPct: 0, multiCrit: 0,
  };
}

function param(id: string, key: string, dflt: number): number {
  const v = SKILL_BY_ID[id]?.params?.[key];
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0];
  return dflt;
}

/** "+1 every 8 ranks". */
const every = (r: number, n: number): number => (n > 0 ? Math.floor(r / n) : 0);
/** Toward `cap`, closing `k` of the gap a rank (the trees' `dim`). */
const toward = (cap: number, k: number, r: number): number => Math.round(cap * (1 - Math.pow(1 - k, r)) * 10) / 10;

type Rule = (e: PassiveEffects, r: number, id: string) => void;

export const RANGER_RULES: Record<string, Rule> = {
  // Marksman
  longEye: (e, r, id) => {
    e.rgr.longPerM = Math.max(e.rgr.longPerM, param(id, 'perMetre', 2));
    e.rgr.longFrom = param(id, 'from', 6);
    e.rgr.longCap = Math.max(e.rgr.longCap, toward(param(id, 'cap', 30), param(id, 'capRate', 0.11), r));
  },
  openSeason: (e, r, id) => {
    e.rgr.openExtra = param(id, 'extra', 2) + every(r, param(id, 'extraPerRanks', 8));
    e.rgr.openSpread = param(id, 'spread', 6);
    e.rgr.openCritDmg += param(id, 'critDmgPerRank', 6) * r;
  },
  cleanKill: (e, r, id) => {
    e.rgr.cleanCritDmg = param(id, 'critDmg', 20) + param(id, 'critDmgPerRank', 3) * (r - 1);
  },
  throughAndThrough: (e, r, id) => {
    e.rgr.pierceAll = 1;
    e.rgr.passPct = param(id, 'pct', 10) + param(id, 'pctPerRank', 1) * (r - 1);
    e.rgr.passCap = param(id, 'cap', 50);
  },
  fletchersArt: (e, r, id) => {
    e.rgr.bowPct += param(id, 'damagePerRank', 5) * r;
  },
  // Wildcraft
  boltHole: (e, r, id) => {
    e.rgr.boltBelow = param(id, 'below', 35);
    e.rgr.boltHeal = param(id, 'heal', 15) + param(id, 'healPerRank', 1) * (r - 1);
    e.rgr.boltOver = param(id, 'over', 3);
    e.rgr.boltRun = param(id, 'run', 30);
    e.rgr.boltCd = Math.max(param(id, 'cdFloor', 40), param(id, 'cooldown', 60) - param(id, 'cdPerRank', 1) * (r - 1));
  },
  slipFree: (e, r, id) => {
    e.ccReductionPct += toward(param(id, 'ccReduction', 50), param(id, 'ccRate', 0.08), r);
    const floor = param(id, 'ccFloor', 50);
    e.ccFloorPct = e.ccFloorPct > 0 ? Math.min(e.ccFloorPct, floor) : floor;
    e.rgr.slipFree = 1;
  },
  layOfTheLand: (e, r, id) => {
    e.rgr.footTraps = 1;
    e.rgr.armNow = 1;
    e.rgr.trapExtra = param(id, 'extra', 1) + every(r, param(id, 'extraPerRanks', 10));
    e.rgr.trapPct += param(id, 'damagePerRank', 2) * r;
  },
  huntcraft: (e, r, id) => {
    e.rgr.trapPct += param(id, 'damagePerRank', 6) * r;
    e.rgr.trapReachPct += param(id, 'reachPerRank', 3) * r;
  },
  // Volley
  endlessQuiver: (e, _r, id) => {
    e.freeShotEvery = Math.max(e.freeShotEvery, param(id, 'every', 3));
  },
  volleyMastery: (e, r, id) => {
    e.extraArrows += every(r, Math.max(1, param(id, 'perRanks', 5)));
  },
  closeGrouping: (e, r, id) => {
    e.rgr.groupPct = param(id, 'pct', 10) + param(id, 'pctPerRank', 2) * (r - 1);
  },
  thicketOfShafts: (e, r, id) => {
    e.rgr.thicketSec = param(id, 'duration', 4) + param(id, 'durationPerRank', 0.2) * (r - 1);
    e.rgr.thicketSlow = param(id, 'slow', 25);
  },
  murmuration: (e, r, id) => {
    e.rgr.murmurShare = param(id, 'share', 60) + param(id, 'sharePerRank', 2) * (r - 1);
    e.rgr.murmurReach = param(id, 'reach', 10);
    e.rgr.murmurSplit = param(id, 'split', 2);
    e.rgr.murmurDepth = param(id, 'depth', 3);
    e.rgr.murmurMost = param(id, 'most', 12);
  },
  arrowsmith: (e, r, id) => {
    e.rgr.multiPct += param(id, 'damagePerRank', 5) * r;
    e.rgr.multiCrit += every(r, param(id, 'critEvery', 3));
  },
};

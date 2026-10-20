/**
 * SLAY — what the Paladin's passives do, beyond their stat tables.
 *
 * `PALADIN_RULES` is spread into the passive engine's `RULES`
 * (`../Passives.ts`), so these run exactly like every other class's rules.
 * Rules that need numbers no other class has write them to `e.pal`, a small
 * record of the Paladin's own; the rest reuse the shared fields (a dent on
 * hit is just another `onHitStatuses` entry).
 *
 * Pure: reads a skill's params, writes numbers.
 */
import type { PassiveEffects } from '../Passives';
import { SKILL_BY_ID } from '../../data/skills';

/** The Paladin's own passive numbers. All zero for every other class. */
export interface PaladinEffects {
  /** Crushing Weight: more damage against a Staggered, Rung or Dented target. */
  vsBrokenPct: number;
  /** The Last Bell: every Nth Mace blow is a Toll. 0 = never. */
  tollEvery: number;
  /** A Toll's extra damage, as a percentage. */
  tollPct: number;
  /** Seconds a Toll leaves its target Rung. */
  tollRingSec: number;
  /** Bellguard: a blocked attacker is Staggered for this long. 0 = never. */
  blockStaggerSec: number;
  /** Red Rosary: a critical blow leaves this many Opened stacks. */
  critOpens: number;
  /** Red Rosary: more damage against an Opened target. */
  vsOpenedPct: number;
  /** Wide Wick: a vigil's ring reaches this much further, as a percentage. */
  vigilRadiusPct: number;
  /** Twin Wick: how many vigils may burn at once. 0 reads as one. */
  vigilSlots: number;
  /** Twin Wick: every vigil is this much stronger, as a percentage. */
  vigilPowerPct: number;
  /** Penitent Ground: physical and fire resistance off what stands in a vigil. */
  penitentShred: number;
  /** Vespers: life per second while a vigil burns. */
  vespersRegen: number;
  /** Vespers: damage reduction while a vigil burns. */
  vespersDR: number;
  /** Ember Saint: life back, as a percentage of maximum, for a death in a vigil. */
  emberHealPct: number;
  /** Saint's Reach: metres a Blade skill reaches further. */
  reachBonus: number;
  /** Saint's Reach: a Blade cut carries on into the next enemy behind its target for this share, percent. 0 = never. */
  carryPct: number;
  /** Saint's Reach: how far behind its target a cut carries, in metres. */
  carryRange: number;
}

export function emptyPaladinEffects(): PaladinEffects {
  return {
    vsBrokenPct: 0, tollEvery: 0, tollPct: 0, tollRingSec: 0, blockStaggerSec: 0, critOpens: 0, vsOpenedPct: 0,
    vigilRadiusPct: 0, vigilSlots: 0, vigilPowerPct: 0, penitentShred: 0, vespersRegen: 0, vespersDR: 0, emberHealPct: 0,
    reachBonus: 0, carryPct: 0, carryRange: 0,
  };
}

function param(id: string, key: string, dflt: number): number {
  const v = SKILL_BY_ID[id]?.params?.[key];
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0];
  return dflt;
}

type Rule = (e: PassiveEffects, r: number, id: string) => void;

export const PALADIN_RULES: Record<string, Rule> = {
  // ------------------------------------------------------------------ Mace
  crushingWeight: (e, r, id) => {
    e.pal.vsBrokenPct += param(id, 'pctPerRank', 7) * r;
  },
  bellguard: (e, r, id) => {
    e.pal.blockStaggerSec = Math.max(e.pal.blockStaggerSec, param(id, 'stagger', 1.5) + param(id, 'staggerPerRank', 0.05) * (r - 1));
  },
  ironPenance: (e, r, id) => {
    e.onHitStatuses.push({
      type: 'physical',
      id: 'dented',
      chance: param(id, 'chance', 10) + param(id, 'chancePerRank', 1) * (r - 1),
      duration: param(id, 'duration', 6),
    });
  },
  theLastBell: (e, r, id) => {
    e.pal.tollEvery = Math.max(2, Math.round(param(id, 'every', 4)));
    e.pal.tollPct += param(id, 'pct', 60) + param(id, 'pctPerRank', 4) * (r - 1);
    e.pal.tollRingSec = Math.max(e.pal.tollRingSec, param(id, 'ring', 0.8));
  },

  // ----------------------------------------------------------------- Blade
  redPsalm: (e, r, id) => {
    e.vsBleedingPct += param(id, 'pctPerRank', 6) * r;
  },
  answerInSteel: (e, r, id) => {
    e.blockCounterChance += param(id, 'chance', 12) + param(id, 'chancePerRank', 1.5) * (r - 1);
    e.blockCounterPct = Math.max(e.blockCounterPct, param(id, 'counterPct', 140));
  },
  theFifthVerse: (e, r, id) => {
    const every = Math.max(2, Math.round(param(id, 'every', 5)));
    e.guaranteedCritEvery = e.guaranteedCritEvery > 0 ? Math.min(e.guaranteedCritEvery, every) : every;
    e.guaranteedCritBonusPct += param(id, 'pct', 20) + param(id, 'pctPerRank', 3) * (r - 1);
  },
  redRosary: (e, r, id) => {
    e.pal.critOpens = Math.max(e.pal.critOpens, Math.round(param(id, 'stacks', 1) + Math.floor((r - 1) / param(id, 'stackEvery', 6))));
    e.pal.vsOpenedPct += param(id, 'pct', 15) + param(id, 'pctPerRank', 2) * (r - 1);
    e.dotTickPct += param(id, 'tickPct', 20);
  },
  saintsReach: (e, r, id) => {
    e.pal.reachBonus = Math.max(e.pal.reachBonus, param(id, 'reach', 0.4));
    e.pal.carryPct += param(id, 'carryPct', 30) + param(id, 'carryPctPerRank', 2) * (r - 1);
    e.pal.carryRange = Math.max(e.pal.carryRange, param(id, 'carry', 2));
  },

  // ------------------------------------------------------------------ Aura
  wideWick: (e, r, id) => {
    e.pal.vigilRadiusPct += param(id, 'pctPerRank', 8) * r;
  },
  penitentGround: (e, r, id) => {
    e.pal.penitentShred += param(id, 'shredPerRank', 2) * r;
  },
  vespers: (e, r, id) => {
    e.pal.vespersRegen += param(id, 'regenPerRank', 2) * r;
    e.pal.vespersDR += param(id, 'drPerRank', 1) * r;
  },
  twinWick: (e, r, id) => {
    e.pal.vigilSlots = Math.max(e.pal.vigilSlots, Math.round(param(id, 'slots', 2)));
    e.pal.vigilPowerPct += param(id, 'pct', 10) + param(id, 'pctPerRank', 2) * (r - 1);
  },
  emberSaint: (e, r, id) => {
    e.pal.emberHealPct += param(id, 'healPct', 1) + param(id, 'healPerRank', 0.3) * (r - 1);
  },
};

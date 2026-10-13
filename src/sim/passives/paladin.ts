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
}

export function emptyPaladinEffects(): PaladinEffects {
  return { vsBrokenPct: 0, tollEvery: 0, tollPct: 0, tollRingSec: 0, blockStaggerSec: 0 };
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
};

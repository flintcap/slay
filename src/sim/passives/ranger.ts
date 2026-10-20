/**
 * SLAY — what the Ranger's passives do, beyond their stat tables.
 *
 * `RANGER_RULES` is spread into the passive engine's `RULES`
 * (`../Passives.ts`), so these run exactly like every other class's rules.
 *
 * Pure: reads a skill's params, writes numbers.
 */
import type { PassiveEffects } from '../Passives';
import { SKILL_BY_ID } from '../../data/skills';

function param(id: string, key: string, dflt: number): number {
  const v = SKILL_BY_ID[id]?.params?.[key];
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0];
  return dflt;
}

type Rule = (e: PassiveEffects, r: number, id: string) => void;

export const RANGER_RULES: Record<string, Rule> = {
  endlessQuiver: (e, _r, id) => {
    e.freeShotEvery = Math.max(e.freeShotEvery, param(id, 'every', 3));
  },
  volleyMastery: (e, r, id) => {
    e.extraArrows += Math.floor(r / Math.max(1, param(id, 'perRanks', 5)));
  },
};

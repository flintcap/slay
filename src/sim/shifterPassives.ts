/**
 * SLAY — what the Shapeshifter's rule passives do, spread into the passive
 * engine's `RULES` (`Passives.ts`). Each reads its numbers from its own `p`
 * block in `data/classSkills/shapeshifter.ts`, so the tooltip is the rule.
 *
 * Passives that only count in a form are read by `entities/Shapeshift.ts`
 * (`FORM_PASSIVES`); plain stat passives need nothing here.
 */
import type { PassiveEffects } from './Passives';
import { SKILL_BY_ID } from '../data/skills';

type Rule = (e: PassiveEffects, r: number, id: string) => void;

function param(id: string, key: string, dflt: number): number {
  const v = SKILL_BY_ID[id]?.params?.[key];
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0];
  return dflt;
}

export const SHIFTER_RULES: Record<string, Rule> = {
  // ------------------------------------------------------------------ Feral
  tasteOfBlood: (e, r, id) => {
    e.vsBleedingPct += param(id, 'pctPerRank', 5) * r;
  },
  stalker: (e, r, id) => {
    e.vsDebuffedPct += param(id, 'pctPerRank', 4) * r;
  },
  openVeins: (e, r, id) => {
    e.critBleedStacks = Math.max(e.critBleedStacks, param(id, 'stacks', 1) + Math.floor(r / Math.max(1, param(id, 'perRanks', 5))));
  },
  ninthLife: (e, r, id) => {
    const cd = Math.max(60, param(id, 'cooldown', 120) - param(id, 'cdPerRank', 4) * (r - 1));
    e.cheatDeathCooldown = e.cheatDeathCooldown > 0 ? Math.min(e.cheatDeathCooldown, cd) : cd;
    e.cheatDeathHealPct = Math.max(e.cheatDeathHealPct, param(id, 'healPct', 30) + param(id, 'healPerRank', 1) * (r - 1));
    e.cheatDeathInvuln = Math.max(e.cheatDeathInvuln, param(id, 'invuln', 1.5));
  },
  nightKing: (e, r, id) => {
    e.killLifePct = Math.max(e.killLifePct, param(id, 'healOnKill', 1) + param(id, 'perRank', 0.2) * (r - 1));
  },
  // ------------------------------------------------------------------ Teeth
  packInstinct: (e, r, id) => {
    e.hitStackAttackSpeed += param(id, 'attackSpeedPerStack', 2) + param(id, 'perRank', 0.3) * (r - 1);
    e.hitStackMax = Math.max(e.hitStackMax, param(id, 'maxStacks', 5));
  },
  alpha: (e, r, id) => {
    e.minionDamagePct += param(id, 'damagePerRank', 8) * r;
    e.minionLifePct += param(id, 'lifePerRank', 6) * r;
  },
  manyMouths: (e, r, id) => {
    e.manyMouthsPct += param(id, 'pctPerRank', 1) * r;
  },
  lastWolf: (e, r, id) => {
    e.lowLifeThreshold = Math.max(e.lowLifeThreshold, param(id, 'threshold', 35));
    e.lowLifeLeechPct += param(id, 'leechPerRank', 1.5) * r;
  },
  // ------------------------------------------------------------------ Claw
  bruiser: (e, r, id) => {
    e.thornsMeleePct += param(id, 'reflect', 8) + param(id, 'perRank', 3) * (r - 1);
  },
  scarTissue: (e, r, id) => {
    e.lowLifeThreshold = Math.max(e.lowLifeThreshold, param(id, 'threshold', 35));
    e.lowLifeReductionPct += param(id, 'drPerRank', 4) * r;
  },
  oldScars: (e, r, id) => {
    e.damagePer400Life += param(id, 'damagePer400Life', 1) + param(id, 'perRank', 0.2) * (r - 1);
  },
};

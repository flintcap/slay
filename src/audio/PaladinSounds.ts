/**
 * SLAY — the Paladin's skill sounds, spread into `SKILL_SOUNDS`
 * (`SkillSounds.ts`). Same rules: one recording per stage, each built from
 * CC0 takes in `tools/audio/paladinTakes.mjs`.
 */
import type { SkillSound } from './SkillSounds';

const s = (cast: string | null, hit: string | null = null, minion: string | null = null): SkillSound => ({ cast, hit, minion });

export const PALADIN_SOUNDS: Readonly<Record<string, SkillSound>> = {
  // --- Mace ------------------------------------------------------------------
  tollingBlow: s('skill.pal.toll', 'skill.pal.tollHit'),
  shieldCrack: s('skill.pal.crack', 'skill.pal.crackHit'),
  anvilfall: s('skill.pal.anvil', 'skill.pal.anvilHit'),
  doorbreaker: s('skill.pal.door', 'skill.pal.doorHit'),
  knell: s('skill.pal.knell', 'skill.pal.knellHit'),
  pilgrimsMaul: s('skill.pal.maul', 'skill.pal.maulHit'),
  barTheDoor: s('skill.pal.bar'),
  hurlCenser: s('skill.pal.censer', 'skill.pal.censerHit'),
  relicBash: s('skill.pal.relic', 'skill.pal.relicHit'),
  ironVerdict: s('skill.pal.verdict', 'skill.pal.verdictHit'),
};

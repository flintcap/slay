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
};

/**
 * SLAY — what the Shapeshifter's skills sound like. Spread into `SKILL_SOUNDS`
 * (`audio/SkillSounds.ts`); the recordings are `tools/audio/shifter-takes.mjs`.
 * Every id is the skill's own: no Shapeshifter skill borrows another's sound.
 */
import type { SkillSound } from './SkillSounds';

const s = (cast: string | null, hit: string | null = null, minion: string | null = null): SkillSound => ({ cast, hit, minion });

export const SHIFTER_SOUNDS: Readonly<Record<string, SkillSound>> = {
  // Feral
  rake: s('skill.shift.rake', 'skill.shift.rake.hit'),
};

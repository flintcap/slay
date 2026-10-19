/**
 * SLAY — the hero's own voice.
 *
 * A woman hero sounds like a woman when she is struck, and every hero makes
 * a sound of their own at the three moments a player most needs telling
 * something without reading: the mana is gone, the pack will not take
 * another thing, and life has dropped into the red. These are short barks,
 * never long lines, and each waits a while before it comes again, so a
 * player hammering an empty skill hears it once, not on every press.
 *
 * The voice follows the class's body (`art/hero/Looks.ts`).
 */
import { HERO_LOOKS } from '../art/hero/Looks';
import type { CharClassId } from '../types';
import { audio } from './Audio';

export type HeroBark = 'noMana' | 'bagFull' | 'lowLife';
export type HeroCry = 'hurt' | 'hurtHeavy' | HeroBark;

type Voice = 'male' | 'female';

/** The bank id for each sound in each voice. A man's hurt sounds are the plain `player.*` ones. */
const IDS: Record<Voice, Record<HeroCry, string>> = {
  male: {
    hurt: 'player.hurt',
    hurtHeavy: 'player.hurtHeavy',
    noMana: 'player.male.noMana',
    bagFull: 'player.male.bagFull',
    lowLife: 'player.male.lowLife',
  },
  female: {
    hurt: 'player.female.hurt',
    hurtHeavy: 'player.female.hurtHeavy',
    noMana: 'player.female.noMana',
    bagFull: 'player.female.bagFull',
    lowLife: 'player.female.lowLife',
  },
};

/** Seconds before the same bark may sound again. */
const GAP: Record<HeroBark, number> = { noMana: 4, bagFull: 5, lowLife: 20 };

let voice: Voice = 'male';
const nextAt: Record<HeroBark, number> = { noMana: 0, bagFull: 0, lowLife: 0 };
const now = (): number => performance.now() / 1000;

/** Sets the voice to the class's body. Called when the hero is made. */
export function setHeroVoice(classId: CharClassId): void {
  voice = HERO_LOOKS[classId]?.shape.sex === 'female' ? 'female' : 'male';
}

/** The bank id of `cry` in the hero's voice. */
export function heroSound(cry: HeroCry): string {
  return IDS[voice][cry];
}

/** Every bank id this module can play, for tooling and preloading. */
export function heroSoundIds(): string[] {
  return [...new Set([...Object.values(IDS.male), ...Object.values(IDS.female)])];
}

/** The hero barks, unless the same bark sounded a moment ago. */
export function heroBark(bark: HeroBark, volume = 0.9): void {
  const t = now();
  if (t < nextAt[bark]) return;
  nextAt[bark] = t + GAP[bark];
  audio.play(IDS[voice][bark], { volume });
}

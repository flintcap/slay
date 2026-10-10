/**
 * SLAY — the audio front door.
 *
 * Every sound in the game is a recorded CC0 sample, every track a recorded
 * piece, every room a recorded bed (see `ASSETS.md`, built by
 * `tools/build-audio.mjs`). Callers only ever see `audio.play(id, opts)`,
 * `audio.music(key)` and the listener; the engine lives in `SampleEngine.ts`,
 * the id rules in `Bank.ts`, music in `Score.ts`, ambience in `Beds.ts`.
 */

import type { DamageType } from '../types';
import { bankIds, resolveSound, soundPriority as bankPriority } from './Bank';
import { SampleEngine } from './SampleEngine';

export type { PlayOpts } from './SampleEngine';

/** The one engine. Silent until the first gesture, and silent for any file that is missing. */
export const audio = new SampleEngine();

/** Element ids the sound bank understands, for tooling. */
export const AUDIO_ELEMENTS: readonly DamageType[] = ['physical', 'fire', 'cold', 'lightning', 'poison', 'arcane'];

/**
 * True when `id` plays a recorded sound, directly or through its family. Used
 * by the static checks to prove nothing the game asks for is silent.
 */
export function resolvesSound(id: string): boolean {
  return resolveSound(id) !== null;
}

/** Every sound id with recordings, for a debug browser. */
export function soundIds(): string[] {
  return bankIds();
}

/**
 * How much a sound matters when voices run short: 2 must play (the player's
 * own hits, kills, warnings, UI), 0 is texture that may be dropped first.
 */
export function soundPriority(id: string): 0 | 1 | 2 {
  return bankPriority(id);
}

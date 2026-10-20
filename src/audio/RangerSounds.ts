/**
 * SLAY — the Ranger's skill sounds, spread into `SKILL_SOUNDS`
 * (`SkillSounds.ts`). Same rules: one recording per stage, each built from
 * CC0 takes in `tools/audio/recipe.mjs` and `tools/audio/rangerTakes.mjs`.
 *
 * A Ranger skill plays its cast on the bow's release frame, not on the press
 * (`scenes/ranger/RangerMoves.ts`), and its hit where the arrow, trap or bird
 * lands.
 */
import type { SkillSound } from './SkillSounds';

const s = (cast: string | null, hit: string | null = null, minion: string | null = null): SkillSound => ({ cast, hit, minion });

export const RANGER_SOUNDS: Readonly<Record<string, SkillSound>> = {
  // --- Marksman --------------------------------------------------------------
  pierceShot: s('skill.bow.pierce', 'skill.arrow.hit'),
  // The mark lands with the string: one sound.
  huntersMark: s('skill.bow.mark'),
  aimedShot: s('skill.bow.heavy', 'skill.arrow.heavy'),
  bleedingArrow: s('skill.bow', 'skill.arrow.barb'),
  crippling: s('skill.bow.cripple', 'skill.arrow.cripple'),
  splinterShot: s('skill.bow.splinter', 'skill.arrow.splinter'),
  bankShot: s('skill.bow.bank', 'skill.arrow.bank'),
  quarrysEnd: s('skill.bow.quarry', 'skill.arrow.mark'),
  oneShot: s('skill.bow.grave', 'skill.arrow.grave'),
  // --- Wildcraft -------------------------------------------------------------
  rollAway: s('skill.roll'),
  disengage: s('skill.leap.back'),
  snareTrap: s('skill.trap.snare', 'skill.trap.snap'),
  spikeTrap: s('skill.trap.spike', 'skill.trap.spring'),
  tripwire: s('skill.trap.wire', 'skill.trap.trip'),
  waspNest: s('skill.trap.nest', 'skill.trap.swarm'),
  kestrel: s('skill.kestrel', 'skill.kestrel.stoop'),
  theWholeFloor: s('skill.trap.field'),
  thornBarrier: s('skill.thorns'),
  venomCoat: s('skill.coat.arrows'),
  camouflage: s('skill.camo'),
  // --- Volley ----------------------------------------------------------------
  twinShot: s('skill.bow.twin', 'skill.arrow.twin'),
  fanFire: s('skill.bow.fanFire', 'skill.arrow.fan'),
  scattershot: s('skill.bow.fan'),
  ricochet: s('skill.bow.ricochet', 'skill.arrow.ricochet'),
  explosiveTip: s('skill.bow.fire', 'skill.fire.burst'),
  suppressing: s('skill.bow.stream'),
  arrowRain: s('skill.bow.sky', 'skill.arrow.rain'),
  creepingBarrage: s('skill.bow.creep', 'skill.arrow.creep'),
  openQuiver: s('skill.quiver.open'),
  arrowWheel: s('skill.bow.wheel', 'skill.arrow.wheel'),
  darkenTheSky: s('skill.bow.darken', 'skill.arrow.storm'),
};

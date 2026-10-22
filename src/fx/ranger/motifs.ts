/**
 * SLAY — the Ranger's words for the uniqueness check
 * (`fx/SkillLooks.ts` spreads these in). Data only: no Three.js, so the
 * headless tools can read it.
 *
 * i18n-ignore-file: words that name what a skill draws, never shown to a player.
 */
import type { SkillMotif } from '../SkillLooks';

const m = (shape: SkillMotif['shape'], motion: SkillMotif['motion'], at?: SkillMotif['at'], size?: number): SkillMotif => ({ shape, motion, at, size });

/**
 * Each Ranger active's own drawing, on top of its family's. A shot's motif
 * lands with the arrow, on its release frame; a trap's where it is set; a
 * buff's on the hero. Every pair is used once in the game.
 */
export const RANGER_MOTIFS: Readonly<Record<string, SkillMotif>> = {
  // Marksman: one arrow, placed.
  pierceShot: m('wind streaks', 'lance'),
  huntersMark: m('hoops', 'pulse', 'target'),
  aimedShot: m('hoops', 'converge', 'target'),
  bleedingArrow: m('blood spray', 'line'),
  crippling: m('scuffs', 'zigzag'),
  splinterShot: m('bark chips', 'thrust'),
  bankShot: m('arrows', 'zigzag'),
  quarrysEnd: m('crosses', 'converge'),
  oneShot: m('crosses', 'pulse', 'target'),
  // Wildcraft: the floor works for you.
  rollAway: m('scuffs', 'trail'),
  snareTrap: m('hoops', 'ring'),
  spikeTrap: m('bone spikes', 'rise'),
  thornBarrier: m('thorns', 'wall'),
  disengage: m('leaves', 'trail'),
  venomCoat: m('thorns', 'orbit'),
  camouflage: m('leaves', 'converge'),
  tripwire: m('scuffs', 'line'),
  waspNest: m('motes', 'scatter'),
  kestrel: m('feathers', 'spiral', 'self'),
  theWholeFloor: m('saws', 'scatter'),
  // Volley: arrows in quantity.
  twinShot: m('feathers', 'fan'),
  scattershot: m('arrows', 'fan'),
  arrowRain: m('arrows', 'rain'),
  ricochet: m('glance sparks', 'zigzag'),
  fanFire: m('arrows', 'burst'),
  suppressing: m('arrows', 'line'),
  explosiveTip: m('flares', 'shatter'),
  creepingBarrage: m('arrows', 'trail'),
  openQuiver: m('feathers', 'crown', 'self'),
  arrowWheel: m('arrows', 'ring', 'self'),
  darkenTheSky: m('arrows', 'fall'),
};

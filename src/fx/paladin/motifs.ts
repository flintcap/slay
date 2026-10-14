/**
 * SLAY — the Paladin's words for the uniqueness check
 * (`fx/SkillLooks.ts` spreads these in). Data only: no Three.js, so the
 * headless tools can read it.
 */
import type { SkillMotif } from '../SkillLooks';

/** What the Paladin's own families draw on their own, before a skill's motif. */
export const PALADIN_DRAWING: Readonly<Record<string, string>> = {
  rite: 'single-target blow',
  vigil: 'ring of candles at the feet',
};

const m = (shape: SkillMotif['shape'], motion: SkillMotif['motion'], at?: SkillMotif['at'], size?: number): SkillMotif => ({ shape, motion, at, size });

/**
 * Each Paladin active's own drawing, on top of its family's. A rite's motif
 * lands on the enemy the blow found (or just in front when it found none), a
 * vigil's at his feet, a censure or the great bell on the one it names.
 * Every pair is new to the game.
 */
export const PALADIN_MOTIFS: Readonly<Record<string, SkillMotif>> = {
  // Mace: iron, rings and dust.
  tollingBlow: m('shockfronts', 'burst'),
  shieldCrack: m('sparks', 'burst', undefined, 0.8),
  anvilfall: m('cracks', 'cross'),
  doorbreaker: m('dust clouds', 'wall'),
  knell: m('halos', 'ripple'),
  pilgrimsMaul: m('stones', 'rise'),
  barTheDoor: m('domes', 'pulse'),
  hurlCenser: m('smoke clouds', 'arch'),
  relicBash: m('crosses', 'burst'),
  ironVerdict: m('light shafts', 'fall'),
  // Blade: cuts, wounds and the rites said over them.
  oathCut: m('slashes', 'thrust'),
  turnTheBlade: m('crescents', 'orbit'),
  twinVerse: m('crescents', 'zigzag'),
  feint: m('scuffs', 'sweep'),
  litany: m('sigils', 'star'),
  confessionThrust: m('blood spray', 'trail'),
  crosswise: m('crosses', 'cross'),
  mercyStroke: m('wisps', 'rise'),
  sevenfold: m('wedges', 'fan'),
  lastRites: m('crosses', 'rise'),
  // Aura: candle light, smoke, ash and bells.
  tallowLight: m('motes', 'rise'),
  ironVigil: m('halos', 'crown'),
  smoulderingRood: m('cinder beds', 'ring'),
  anoint: m('flares', 'drip', undefined, 0.6),
  censure: m('sigil brands', 'fall'),
  censerSmoke: m('smoke clouds', 'orbit'),
  fervour: m('embers', 'helix'),
  tollingBell: m('shock rings', 'ring'),
  martyrsVow: m('hearts', 'pulse'),
  writOfAsh: m('ash flurries', 'spiral'),
  consecratedGround: m('holy fields', 'ring'),
  lastHour: m('domes', 'fall', undefined, 1.4),
};

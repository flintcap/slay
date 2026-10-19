/**
 * SLAY — the Paladin's words for the uniqueness check
 * (`fx/SkillLooks.ts` spreads these in). Data only: no Three.js, so the
 * headless tools can read it.
 *
 * i18n-ignore-file: words that name what a skill draws, never shown to a player.
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
  barTheDoor: m('domes', 'pulse'),
  hurlCenser: m('smoke clouds', 'arch'),
  // Blade: cuts, wounds and the rites said over them.
  turnTheBlade: m('crescents', 'orbit'),
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

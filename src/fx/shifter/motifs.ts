/**
 * SLAY — the Shapeshifter's words for the uniqueness check
 * (`fx/SkillLooks.ts` spreads these in). Data only: no Three.js, so the
 * headless tools can read it.
 *
 * i18n-ignore-file: words that name what a skill draws, never shown to a player.
 */
import type { SkillMotif } from '../SkillLooks';

/** What the `shift` family draws on its own, before a skill's motif. */
export const SHIFTER_DRAWING: Readonly<Record<string, string>> = { shift: 'beast blow' };

/**
 * Each Shapeshifter active's own drawing (see `SkillMotif`), drawn on top of
 * the skill's own effects above. Every pair is new to the game.
 */
export const SHIFTER_MOTIFS: Readonly<Record<string, SkillMotif>> = {
  catForm: { shape: 'eyes', motion: 'rise' },
  wolfForm: { shape: 'eyes', motion: 'pulse' },
  bearForm: { shape: 'dust clouds', motion: 'burst' },
  rake: { shape: 'claw rakes', motion: 'sweep' },
  pounce: { shape: 'claw rakes', motion: 'fall' },
  slink: { shape: 'smoke puffs', motion: 'drip' },
  hamstring: { shape: 'claw rakes', motion: 'line' },
  throatTear: { shape: 'fangs', motion: 'cross' },
  killingDance: { shape: 'claw rakes', motion: 'orbit' },
  nightHunt: { shape: 'crescents', motion: 'rise' },
  snap: { shape: 'fangs', motion: 'burst' },
  huntingHowl: { shape: 'motes', motion: 'ripple' },
  lunge: { shape: 'fangs', motion: 'line' },
  worry: { shape: 'blood spray', motion: 'zigzag' },
  callThePack: { shape: 'eyes', motion: 'scatter' },
  bloodHowl: { shape: 'blood spray', motion: 'spiral' },
  ravening: { shape: 'fangs', motion: 'zigzag' },
  bloodmoon: { shape: 'crescents', motion: 'rain' },
  maul: { shape: 'claw rakes', motion: 'fan' },
  rattlingRoar: { shape: 'shockfronts', motion: 'fan' },
  hammerfall: { shape: 'craters', motion: 'cross' },
  bristle: { shape: 'thorns', motion: 'burst' },
  overrun: { shape: 'dust clouds', motion: 'line' },
  reapingSwipe: { shape: 'claw rakes', motion: 'ring' },
  bearHug: { shape: 'cracks', motion: 'converge' },
  ursaMajor: { shape: 'stars', motion: 'star' },
};

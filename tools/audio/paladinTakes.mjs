/**
 * The Paladin's skill sounds: id -> ONE take, spread into `SKILL_TAKES` in
 * `recipe.mjs`. Same take format (see the top of recipe.mjs).
 *
 * The class sounds like iron, bells, candle flame, chains and voices under a
 * vault: never chimes, never synth. Mace blows ring (a bell struck under the
 * thud), blade cuts are short and dry, auras are low and long.
 */

const x = (pack, file, o = {}) => ({ pack, file, ...o });
const BELL = (n) => `impactBell_heavy_00${n}.ogg`;
const PLATE = (n) => `impactPlate_heavy_00${n}.ogg`;

export const PALADIN_TAKES = {
  // --- Mace ------------------------------------------------------------------
  // Tolling Blow: a slow heavy whoosh, then iron on iron with a bell under it.
  'skill.pal.toll': x('swish', 'swish-11.wav', { rate: 0.6, lp: 1600, mix: [x('rsp', 'inventory/armor-light.wav', { rate: 0.8, gain: -7 })] }),
  'skill.pal.tollHit': x('ki', BELL(2), { rate: 0.62, t: 1.4, fadeOut: 0.6, mix: [x('ki', PLATE(1), { rate: 0.8, gain: -2 }), x('clink', 'thud2.wav', { rate: 0.7, gain: -4 })] }),
};

/**
 * The Ranger's newer skill sounds: id -> ONE take, spread into `SKILL_TAKES`
 * in `recipe.mjs` beside the bow rows already there. Same take format (see
 * the top of recipe.mjs).
 *
 * The class sounds like wood, gut, leather and feather: a string let go, a
 * shaft into a body, a cord snapping tight, a bird. Never steel ringing,
 * never a chime.
 */

const x = (pack, file, o = {}) => ({ pack, file, ...o });

export const RANGER_TAKES = {
  // --- Marksman ----------------------------------------------------------------
  // Splinter Shot: a short hard string, the shaft already creaking.
  'skill.bow.splinter': x('battle', 'Bow.wav', { rate: 1.04, mix: [x('mw', 'wood_cracking_02.ogg', { rate: 1.3, hp: 600, delay: 30, gain: -7 })] }),
  // ...and it bursts inside them: wood split, a spray of chips.
  'skill.arrow.splinter': x('mw', 'wood_cracking_03.ogg', { rate: 1.1, mix: [x('ki', 'impactWood_light_002.ogg', { gain: -2 }), x('tiny', 'wood-twigs-break-01.wav', { delay: 40, rate: 1.2, gain: -4 })] }),
  // Bank Shot: a leaning draw, the string and a creak of the limb.
  'skill.bow.bank': x('battle', 'Bow.wav', { rate: 0.93, mix: [x('kr', 'creak2.ogg', { rate: 1.2, hp: 500, gain: -8 })] }),
  // ...off the stone and on: a glance, then the shaft going in.
  'skill.arrow.bank': x('ki', 'impactGeneric_light_003.ogg', { rate: 1.1, mix: [x('ki', 'impactWood_medium_001.ogg', { delay: 70, gain: -2 })] }),
  // Quarry's End: a slow draw held across them, then the string.
  'skill.bow.quarry': x('wpn', 'arrow-grab-from-quiver-05.wav', { t: 0.35, mix: [x('kr', 'creak1.ogg', { rate: 0.9, delay: 120, gain: -6 }), x('battle', 'Bow.wav', { delay: 380, rate: 0.9, gain: 1 })] }),

  // --- Wildcraft ---------------------------------------------------------------
  // Snare Trap: the noose jerks shut on a leg.
  'skill.trap.snap': x('kr', 'clothBelt.ogg', { rate: 1.2, mix: [x('kr', 'metalClick.ogg', { rate: 0.8, gain: -4 }), x('tiny', 'wood-twigs-break-02.wav', { t: 0.3, gain: -5 })] }),
  // Spike Trap: boards give, and the spikes come up through them.
  'skill.trap.spring': x('ki', 'impactPlank_medium_002.ogg', { rate: 0.85, mix: [x('r80', 'blade_01.ogg', { delay: 50, rate: 0.75, gain: -2 }), x('bfh', 'bfh1_rock_breaking_02.ogg', { delay: 30, rate: 1.1, gain: -7 })] }),
  // Tripwire: cord run out between two hands and pulled taut.
  'skill.trap.wire': x('wpn', 'quiver-leather-squeeze-04.wav', { mix: [x('kr', 'clothBelt2.ogg', { delay: 160, rate: 1.1, gain: -2 })] }),
  // ...the wire goes, and something heavy hits the floor.
  'skill.trap.trip': x('kr', 'clothBelt.ogg', { rate: 1.35, mix: [x('ki', 'impactSoft_heavy_002.ogg', { delay: 90, rate: 0.8, gain: 1 }), x('dsteps', 'gravel.ogg', { delay: 110, gain: -6 })] }),
  // Wasp Nest: paper and twigs, lobbed and caught on something.
  'skill.trap.nest': x('tiny', 'cover-paper-tear-01.wav', { rate: 0.85, t: 0.4, mix: [x('kr', 'cloth3.ogg', { rate: 1.2, gain: -6 })] }),
  // ...it breaks, and the swarm comes out angry.
  'skill.trap.swarm': x('crick', 'crickets_1.mp3', { ss: 1, t: 1.1, rate: 1.9, hp: 900, fadeIn: 0.05, fadeOut: 0.4, mix: [x('tiny', 'cover-paper-tear-02.wav', { t: 0.35, gain: -3 })] }),
  // Kestrel: a whistle through the fingers, wings answering it.
  'skill.kestrel': x('tiny', 'tin-whistle-whoosh-01.wav', { mix: [x('kr', 'cloth4.ogg', { delay: 220, rate: 1.4, gain: -4 }), x('kr', 'cloth2.ogg', { delay: 330, rate: 1.5, gain: -6 })] }),
  // ...the stoop: a cry, a rush of air, talons in.
  'skill.kestrel.stoop': x('crow', 'crow_caw.wav', { t: 0.45, rate: 1.7, hp: 700, fadeOut: 0.15, gain: -4, mix: [x('swish', 'swish-3.wav', { rate: 1.3, gain: -2 }), x('kr', 'knifeSlice.ogg', { delay: 140, rate: 0.9, gain: -3 })] }),

  // --- Volley ------------------------------------------------------------------
  // Creeping Barrage: three loosings at the sky, each a touch lower.
  'skill.bow.creep': x('battle', 'Bow.wav', { rate: 0.88, mix: [110, 230].map((d, i) => x('battle', 'Bow.wav', { delay: d, rate: 0.92 + 0.05 * i, gain: -2 - i })) }),
  // ...the falls walking toward them, each a little nearer.
  'skill.arrow.creep': x('ki', 'impactWood_light_003.ogg', { rate: 0.85, mix: [90, 190, 300].map((d, i) => x('ki', `impactWood_medium_00${i + 2}.ogg`, { delay: d, rate: 0.9 + 0.04 * i, gain: -1 - i })) }),
  // Open Quiver: a hand run over the fletching, the quiver flap thrown back.
  'skill.quiver.open': x('wpn', 'arrow-return-to-quiver-04.wav', { mix: [x('wpn', 'quiver-leather-squeeze-09.wav', { delay: 120, gain: -2 }), x('wpn', 'arrow-feathers-02.wav', { delay: 200, gain: -5 })] }),
  // Arrow Wheel: a turn on the heel and the string again and again.
  'skill.bow.wheel': x('kr', 'cloth1.ogg', { rate: 1.1, gain: -2, mix: [60, 130, 200, 270].map((d, i) => x('battle', 'Bow.wav', { delay: d, rate: 1.02 + 0.04 * i, gain: -1 - i })) }),
  // ...shafts going in all round.
  'skill.arrow.wheel': x('ki', 'impactWood_light_004.ogg', { mix: [50, 110, 180].map((d, i) => x('ki', `impactWood_light_00${i}.ogg`, { delay: d, rate: 1.05 - 0.05 * i, gain: -2 - i })) }),
};

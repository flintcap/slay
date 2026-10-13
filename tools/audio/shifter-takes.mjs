/**
 * The Shapeshifter's skill sounds: id -> ONE take, spread into `SKILL_TAKES`
 * (`recipe.mjs`). Same take grammar as the recipe. Every id starts
 * `skill.shift.` so `node tools/build-audio.mjs --only=skill.shift.` rebuilds
 * exactly these.
 *
 * The forms each have a voice: the cat hisses and spits, the wolf snarls and
 * howls, the bear grunts and roars. Claws are fast, dry, close swishes; bites
 * are wet. Everything is layered from CC0 packs already listed in packs.mjs.
 */

/** One take (the recipe's own helper, repeated so this file stands alone). */
const x = (pack, file, o = {}) => ({ pack, file, ...o });

export const SHIFTER_TAKES = {
  // --- Feral: the black cat ---------------------------------------------------
  // Three dry claw strokes almost on top of each other, and a hiss under them.
  'skill.shift.rake': x('swish', 'swish-1.wav', {
    rate: 1.35,
    hp: 900,
    mix: [
      x('swish', 'swish-4.wav', { delay: 85, rate: 1.45, hp: 900, gain: -1 }),
      x('swish', 'swish-1.wav', { delay: 170, rate: 1.55, hp: 1000, gain: -2 }),
      x('creat', 'spit_02.ogg', { rate: 1.2, hp: 1200, gain: -9 }),
    ],
  }),
  'skill.shift.rake.hit': x('kr', 'knifeSlice2.ogg', { rate: 1.15, mix: [x('mud', 'mud_03.ogg', { rate: 1.3, gain: -8 })] }),
};

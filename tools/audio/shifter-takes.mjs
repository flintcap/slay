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
  // --- The changes -------------------------------------------------------------
  // Shadowcat: a breath drawn in backwards, then a spitting hiss off the top.
  'skill.shift.catForm': x('creat', 'breath.ogg', {
    rev: true,
    rate: 1.2,
    hp: 300,
    mix: [x('creat', 'spit_03.ogg', { delay: 260, rate: 0.9, hp: 700, gain: -2 }), x('wwoosh', 'wind woosh loop.ogg', { ss: 0.4, t: 0.5, delay: 120, rate: 1.4, hp: 1200, gain: -12 })],
  }),
  // Grey Wolf: cloth and leather tearing, a low snarl swelling under it.
  'skill.shift.wolfForm': x('snarl', 'monster-snarls-2.ogg', {
    ss: 0,
    t: 1.1,
    rate: 0.95,
    mix: [x('kr', 'cloth3.ogg', { rate: 0.8, gain: -4 }), x('kr', 'dropLeather.ogg', { delay: 200, rate: 0.7, gain: -6 })],
  }),
  // Great Bear: a chest-deep grunt over a thump of weight landing on the floor.
  'skill.shift.bearForm': x('creat', 'grunt_03.ogg', {
    rate: 0.62,
    lp: 2400,
    mix: [x('ki', 'impactSoft_heavy_002.ogg', { delay: 180, rate: 0.6, gain: -2 }), x('bfh', 'bfh1_wood_breaking_01.ogg', { delay: 40, rate: 0.7, gain: -10 })],
  }),

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
  // Pounce: a crouch's scuff, then the air going past.
  'skill.shift.pounce': x('kr', 'footstep04.ogg', { rate: 1.3, mix: [x('whoosh', 'whoosh2_0.wav', { delay: 90, rate: 1.25, hp: 500, gain: -2 })] }),
  'skill.shift.pounce.hit': x('ki', 'impactPunch_heavy_001.ogg', { rate: 1.2, mix: [x('creat', 'spit_01.ogg', { rate: 1.0, hp: 900, gain: -5 }), x('kr', 'knifeSlice.ogg', { delay: 30, rate: 1.4, gain: -6 })] }),
  // Slink: a long low hiss that goes quiet.
  'skill.shift.slink': x('gbreath', 'ghostbreath.flac', { ss: 0, t: 1.1, rate: 1.1, hp: 1500, fadeOut: 0.6, mix: [x('kr', 'cloth1.ogg', { rate: 0.75, gain: -10 })] }),
  // Hamstring: a low scything swish along the floor.
  'skill.shift.hamstring': x('swish', 'swish-7.wav', { rate: 0.85, lp: 3500 }),
  'skill.shift.hamstring.hit': x('kr', 'knifeSlice.ogg', { rate: 0.85, mix: [x('mud', 'mud_11.ogg', { delay: 40, rate: 1.0, gain: -6 }), x('hit5', 'hit3.ogg', { delay: 20, rate: 1.3, gain: -10 })] }),
  // Throat Tear: a snarl cut short, and the jaws.
  'skill.shift.throatTear': x('creat2', 'attack_02.ogg', { rate: 1.25, hp: 400 }),
  'skill.shift.throatTear.hit': x('water', 'splash_06.ogg', { rate: 0.9, mix: [x('creat', 'eat_02.ogg', { rate: 1.1, gain: -2 }), x('bfh', 'bfh1_wood_breaking_03.ogg', { delay: 70, rate: 1.35, gain: -7 })] }),
  // Killing Dance: a quick run of light steps and hissing claws.
  'skill.shift.killingDance': x('swish', 'swish-9.wav', {
    rate: 1.6,
    hp: 1200,
    mix: [x('swish', 'swish-12.wav', { delay: 110, rate: 1.7, hp: 1200, gain: -1 }), x('swish', 'swish-9.wav', { delay: 200, rate: 1.8, hp: 1300, gain: -2 }), x('kr', 'footstep07.ogg', { delay: 60, rate: 1.5, gain: -8 })],
  }),
  'skill.shift.killingDance.hit': x('kr', 'drawKnife2.ogg', { rate: 1.45, hp: 800, mix: [x('mud', 'mud_07.ogg', { rate: 1.5, gain: -9 })] }),
  // Night Hunt: a deep dark swell, then the cat's purr-growl in it.
  'skill.shift.nightHunt': x('dark', 'ambience-3.wav', { ss: 1, t: 1.4, rate: 0.85, fadeIn: 0.15, fadeOut: 0.5, mix: [x('creat2', 'grunt_07.ogg', { delay: 300, rate: 1.3, hp: 500, gain: -3 })] }),

  // --- Teeth: the grey wolf ---------------------------------------------------
  'skill.shift.snap': x('creat', 'barking_01.ogg', { rate: 1.25, ss: 0, t: 0.35 }),
  'skill.shift.snap.hit': x('creat', 'eat_04.ogg', { rate: 1.25, mix: [x('ki', 'impactSoft_medium_001.ogg', { rate: 1.3, gain: -6 })] }),
  // Hunting Howl: the wolf's own howl, long, with a second voice above it.
  'skill.shift.huntingHowl': x('creat', 'howl.ogg', { mix: [x('creat', 'howl.ogg', { delay: 380, rate: 1.18, gain: -8 })] }),
  'skill.shift.lunge': x('dsteps', 'gravel.ogg', { rate: 1.35, mix: [x('whoosh', 'whoosh2_0.wav', { delay: 40, rate: 0.95, gain: -3 })] }),
  'skill.shift.lunge.hit': x('creat2', 'attack_04.ogg', { rate: 1.05, mix: [x('ki', 'impactPunch_medium_002.ogg', { rate: 0.9, gain: -4 })] }),
  // Worry: a growl held through the shaking.
  'skill.shift.worry': x('snarl', 'monster-snarl-attack.ogg', { rate: 1.05 }),
  'skill.shift.worry.hit': x('kr', 'cloth4.ogg', { rate: 0.9, mix: [x('water', 'splash_02.ogg', { rate: 1.2, gain: -7 }), x('creat', 'eat_01.ogg', { rate: 0.95, gain: -5 })] }),
  // Call the Pack: one far howl and a closer answer.
  'skill.shift.callThePack': x('creat', 'howl.ogg', { rate: 0.82, lp: 2200, gain: -2, mix: [x('creat', 'barking_02.ogg', { delay: 650, rate: 0.9, gain: -6 })] }),
  'skill.shift.callThePack.bite': x('creat', 'barking_02.ogg', { rate: 1.15, ss: 0, t: 0.4, mix: [x('creat', 'eat_03.ogg', { rate: 1.2, gain: -4 })] }),
  // Blood Howl: a wet, gargled howl.
  'skill.shift.bloodHowl': x('creat', 'howl.ogg', { rate: 0.72, lp: 1800, mix: [x('creat', 'burble_02.ogg', { rate: 0.8, gain: -3 }), x('water', 'splash_09.ogg', { delay: 200, rate: 0.7, gain: -10 })] }),
  'skill.shift.ravening': x('creat2', 'attack_05.ogg', { rate: 0.95, mix: [x('dsteps', 'leaves01.ogg', { rate: 1.1, gain: -8 })] }),
  'skill.shift.ravening.hit': x('water', 'splash_04.ogg', { rate: 0.75, mix: [x('creat', 'eat_02.ogg', { rate: 0.85, gain: -2 }), x('ki', 'impactPunch_heavy_003.ogg', { rate: 0.95, gain: -5 })] }),
  // Bloodmoon: a heartbeat under a rising red howl.
  'skill.shift.bloodmoon': x('heart', 'heartbeat_fast_0.wav', { ss: 0, t: 1.4, rate: 0.9, mix: [x('creat', 'howl.ogg', { delay: 220, rate: 0.9, hp: 300, gain: -4 })] }),

  // --- Claw: the bear ---------------------------------------------------------
  'skill.shift.maul': x('swish', 'swish-13.wav', { rate: 0.62, lp: 2600, mix: [x('creat', 'grunt_01.ogg', { rate: 0.72, gain: -5 })] }),
  'skill.shift.maul.hit': x('ki', 'impactPunch_heavy_004.ogg', { rate: 0.7, mix: [x('kr', 'knifeSlice2.ogg', { rate: 0.7, gain: -6 }), x('mud', 'mud_19.ogg', { rate: 0.8, gain: -8 })] }),
  // Rattling Roar: the full roar, with the room shaking under it.
  'skill.shift.rattlingRoar': x('creat', 'roar_02.ogg', { rate: 0.78, mix: [x('troll', 'troll-roars.ogg', { ss: 0, t: 1.2, rate: 0.95, gain: -6 }), x('bfh', 'bfh1_rock_falling_02.ogg', { rate: 0.5, gain: -10 })] }),
  'skill.shift.hammerfall': x('creat2', 'grunt_08.ogg', { rate: 0.7 }),
  'skill.shift.hammerfall.hit': x('bfh', 'bfh1_rock_breaking_02.ogg', { rate: 0.75, mix: [x('ki', 'impactMining_003.ogg', { rate: 0.6, gain: -2 }), x('ki', 'impactSoft_heavy_004.ogg', { delay: 40, rate: 0.55, gain: -3 })] }),
  // Bristle: a shudder of fur and a stiff creak.
  'skill.shift.bristle': x('kr', 'creak2.ogg', { rate: 1.3, hp: 600, mix: [x('kr', 'cloth2.ogg', { rate: 1.4, gain: -3 }), x('creat2', 'grunt_06.ogg', { delay: 120, rate: 0.85, gain: -8 })] }),
  'skill.shift.overrun': x('mino', 'mino1.wav', { ss: 0, t: 1.0, rate: 0.85, mix: [x('dsteps', 'stone01.ogg', { rate: 0.7, gain: -4 }), x('dsteps', 'mud02.ogg', { delay: 180, rate: 0.7, gain: -5 })] }),
  'skill.shift.overrun.hit': x('ki', 'impactWood_heavy_002.ogg', { rate: 0.7, mix: [x('bfh', 'bfh1_hit_07.ogg', { rate: 0.85, gain: -4 })] }),
  'skill.shift.reapingSwipe': x('swish', 'swish-11.wav', { rate: 0.55, lp: 2200, mix: [x('swish', 'swish-5.wav', { delay: 130, rate: 0.6, lp: 2200, gain: -3 })] }),
  'skill.shift.reapingSwipe.hit': x('ki', 'impactPunch_heavy_000.ogg', { rate: 0.62, mix: [x('kr', 'chop.ogg', { rate: 0.75, gain: -5 })] }),
  // Bear Hug: a strained grunt held, ribs creaking.
  'skill.shift.bearHug': x('creat', 'grunt_05.ogg', { rate: 0.68, mix: [x('kr', 'creak1.ogg', { delay: 150, rate: 0.6, gain: -6 })] }),
  'skill.shift.bearHug.hit': x('bfh', 'bfh1_wood_breaking_02.ogg', { rate: 1.1, mix: [x('ki', 'impactSoft_medium_004.ogg', { rate: 0.7, gain: -3 })] }),
  // Ursa Major: stone grinding up, and the biggest roar there is.
  'skill.shift.ursaMajor': x('creat2', 'roar_05.ogg', { rate: 0.7, mix: [x('earth', 'Earth Element Magic Spell_3.ogg', { rate: 0.8, gain: -5 }), x('bfh', 'bfh1_rock_falling_04.ogg', { delay: 250, rate: 0.7, gain: -8 })] }),
};

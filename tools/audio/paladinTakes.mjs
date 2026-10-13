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
  // Shield Crack: a short shield whip, then a rim on a jaw and a small bright bell.
  'skill.pal.crack': x('swish', 'swish-4.wav', { rate: 0.9, mix: [x('kr', 'cloth3.ogg', { rate: 0.8, gain: -6 })] }),
  'skill.pal.crackHit': x('shield', 'impact.5.ogg', { rate: 0.85, mix: [x('clink', 'clink2.wav', { rate: 0.8, gain: -3 }), x('bells', 'bell_ding1.wav', { rate: 0.5, t: 0.9, fadeOut: 0.4, gain: -9 })] }),
  // Anvilfall: a long overhead draw, then a smith's hammer on cold iron.
  'skill.pal.anvil': x('battle', 'swish_3.wav', { rate: 0.55, lp: 1300, mix: [x('rsp', 'inventory/chainmail1.wav', { rate: 0.75, gain: -8 })] }),
  'skill.pal.anvilHit': x('mw', 'hammer_02.ogg', { rate: 0.7, t: 1.0, fadeOut: 0.4, mix: [x('ki', PLATE(3), { rate: 0.7, gain: -2 }), x('ki', BELL(1), { rate: 0.45, t: 1.1, fadeOut: 0.6, gain: -10 })] }),
  // Doorbreaker: boots and mail at a run, then a door coming off its hinges.
  'skill.pal.door': x('rsp', 'inventory/chainmail2.wav', { rate: 0.85, mix: [x('kr', 'footstep04.ogg', { rate: 0.8, gain: -3 }), x('kr', 'footstep06.ogg', { rate: 0.8, delay: 140, gain: -3 }), x('kr', 'footstep02.ogg', { rate: 0.8, delay: 280, gain: -3 })] }),
  'skill.pal.doorHit': x('mw', 'wood_breaking_02.ogg', { rate: 0.85, mix: [x('shield', 'impact.7.ogg', { rate: 0.75, gain: -1 }), x('ki', PLATE(4), { rate: 0.7, gain: -5 })] }),
  // Knell: a slow funeral swing, then a struck bell that rings on after the blow.
  'skill.pal.knell': x('swish', 'swish-6.wav', { rate: 0.7, lp: 1800 }),
  'skill.pal.knellHit': x('c100', 'bell_03.ogg', { rate: 0.62, t: 1.8, fadeOut: 0.8, mix: [x('ki', 'impactMetal_heavy_001.ogg', { rate: 0.75, gain: -2 }), x('c100', 'bell_01.ogg', { rate: 0.5, delay: 550, t: 1.2, fadeOut: 0.6, gain: -5 })] }),
  // Pilgrim's Maul: leather and haft creaking under the weight, then plate caving in.
  'skill.pal.maul': x('battle', 'swish_4.wav', { rate: 0.5, lp: 1200, mix: [x('kr', 'creak1.ogg', { rate: 0.7, gain: -6 })] }),
  'skill.pal.maulHit': x('ki', 'impactPunch_heavy_003.ogg', { rate: 0.6, mix: [x('mw', 'metal_slam_01.ogg', { rate: 0.7, gain: -2 }), x('bfh', 'bfh1_rock_breaking_01.ogg', { rate: 0.8, gain: -7 }), x('ki', BELL(4), { rate: 0.4, t: 1.0, fadeOut: 0.5, gain: -11 })] }),
  // Bar the Door: the shield set hard against the floor and an iron latch dropped.
  'skill.pal.bar': x('shield', 'impact.3.ogg', { rate: 0.7, mix: [x('kr', 'metalLatch.ogg', { rate: 0.75, delay: 120, gain: -1 }), x('r80', 'chain_01.ogg', { rate: 0.8, gain: -8 })] }),
  // Hurl the Censer: chain paid out and a coal-hiss trail, then coals bursting on a body.
  'skill.pal.censer': x('r80', 'chain_03.ogg', { rate: 0.9, mix: [x('swish', 'swish-9.wav', { rate: 0.8, gain: -3 }), x('crackle', 'fire-1.ogg', { t: 0.7, fadeOut: 0.3, gain: -8 })] }),
  'skill.pal.censerHit': x('ignite', 'ignition.flac', { t: 0.8, rate: 0.8, mix: [x('clink', 'bong1.wav', { rate: 0.7, gain: -2 }), x('steam', 'steam hisses - Marker #2.wav', { t: 0.6, fadeOut: 0.3, gain: -9 })] }),
  // Relic Bash: a reliquary rattling in the boss, then a dull shield blow with a clear chime.
  'skill.pal.relic': x('kr', 'handleSmallLeather2.ogg', { rate: 0.85, mix: [x('swish', 'swish-1.wav', { rate: 0.8, gain: -4 }), x('rsp', 'inventory/coin3.wav', { rate: 0.6, gain: -9 })] }),
  'skill.pal.relicHit': x('shield', 'impact.8.ogg', { rate: 0.8, mix: [x('bells', 'bell_ding4.wav', { rate: 0.8, t: 1.0, fadeOut: 0.5, gain: -5 }), x('clink', 'bing1.wav', { rate: 0.6, gain: -6 })] }),
  // Iron Verdict: a voice under the wind-up, then the great bell and the ground giving.
  'skill.pal.verdict': x('chant', 'chant5.wav', { ss: 0.4, t: 1.1, rate: 0.6, fadeIn: 0.1, fadeOut: 0.4, gain: -5, mix: [x('battle', 'swish_3.wav', { rate: 0.45, gain: -1 })] }),
  'skill.pal.verdictHit': x('ki', BELL(0), { rate: 0.42, t: 2.2, fadeOut: 1.1, mix: [x('ki', PLATE(2), { rate: 0.6 }), x('rumble', 'rumble.wav', { t: 1.2, fadeOut: 0.6, gain: -4 }), x('bfh', 'bfh1_rock_breaking_01.ogg', { rate: 0.6, gain: -5 })] }),
};

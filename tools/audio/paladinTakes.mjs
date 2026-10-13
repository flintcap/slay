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
const SW = 'sword_-_starninjas_1/sword - StarNinjas/';
const SC = 'sword_clash_-_starninjas_0/';

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

  // --- Blade -----------------------------------------------------------------
  // Oath Cut: steel drawn a hand's breadth, then a short wet cut.
  'skill.pal.oath': x('sword20', SW + 'sword.3.ogg', { rate: 1.1, hp: 300, mix: [x('kr', 'drawKnife2.ogg', { rate: 1.0, gain: -6 })] }),
  'skill.pal.oathHit': x('kr', 'knifeSlice2.ogg', { rate: 0.9, mix: [x('ki', 'impactPlate_light_002.ogg', { rate: 1.1, gain: -6 }), x('r80', 'blade_02.ogg', { rate: 1.2, gain: -9 })] }),
  // Turn the Blade: steel turned on steel and held, then the answer with a thin chime.
  'skill.pal.turn': x('sword20', SC + 'sword_clash.4.ogg', { rate: 1.15, mix: [x('kr', 'metalClick.ogg', { rate: 0.9, gain: -4 })] }),
  'skill.pal.turnHit': x('sword20', SW + 'sword.7.ogg', { rate: 0.85, mix: [x('ki', 'impactMetal_light_003.ogg', { gain: -3 }), x('bells', 'bell_ding2.wav', { rate: 1.3, t: 0.5, fadeOut: 0.3, gain: -12 })] }),
  // Twin Verse: two fast strokes, the second a touch higher.
  'skill.pal.twin': x('swish', 'swish-7.wav', { rate: 1.2, mix: [x('swish', 'swish-5.wav', { rate: 1.3, delay: 160, gain: -2 })] }),
  'skill.pal.twinHit': x('r80', 'blade_01.ogg', { rate: 1.05, mix: [x('kr', 'knifeSlice.ogg', { rate: 1.1, gain: -4 })] }),
  // Feint: a cloak flicked and one quick step, then a cut from the side.
  'skill.pal.feint': x('kr', 'cloth2.ogg', { rate: 1.2, mix: [x('kr', 'footstep08.ogg', { rate: 1.2, delay: 60, gain: -2 }), x('swish', 'swish-2.wav', { rate: 1.25, delay: 150, gain: -2 })] }),
  'skill.pal.feintHit': x('sword20', SW + 'sword.9.ogg', { rate: 0.95, mix: [x('ki', 'impactPunch_medium_001.ogg', { gain: -5 })] }),
  // Litany: a murmured line under five strokes; each cut a small dry slice.
  'skill.pal.litany': x('chant', 'chant14.wav', { ss: 0.2, t: 0.9, rate: 1.1, fadeOut: 0.3, gain: -8, mix: [x('swish', 'swish-3.wav', { rate: 1.4 }), x('swish', 'swish-8.wav', { rate: 1.4, delay: 120, gain: -1 }), x('swish', 'swish-13.wav', { rate: 1.4, delay: 240, gain: -2 })] }),
  'skill.pal.litanyHit': x('kr', 'knifeSlice.ogg', { rate: 1.3, mix: [x('r80', 'blade_03.ogg', { rate: 1.4, gain: -7 })] }),
  // Confession Thrust: boots and mail in a lunge, then a deep thrust and a breath let out.
  'skill.pal.confess': x('sword20', SW + 'sword.5.ogg', { rate: 0.8, mix: [x('kr', 'footstep01.ogg', { rate: 0.9, gain: -3 }), x('rsp', 'inventory/chainmail1.wav', { rate: 1.1, gain: -9 })] }),
  'skill.pal.confessHit': x('ki', 'impactPunch_heavy_001.ogg', { rate: 0.9, mix: [x('r80', 'blade_02.ogg', { rate: 0.75, gain: -2 }), x('chant', 'chant9.wav', { ss: 0.3, t: 0.6, rate: 0.9, fadeOut: 0.3, gain: -12 })] }),
  // Crosswise: two long strokes crossing.
  'skill.pal.cross': x('swish', 'swish-10.wav', { mix: [x('swish', 'swish-12.wav', { rate: 0.95, delay: 200 })] }),
  'skill.pal.crossHit': x('sword20', SC + 'sword_clash.7.ogg', { rate: 0.9, mix: [x('kr', 'knifeSlice2.ogg', { rate: 0.8, gain: -4 })] }),
  // Mercy Stroke: a knife drawn slow over a slow heartbeat, then one clean blow and a far bell.
  'skill.pal.mercy': x('kr', 'drawKnife3.ogg', { rate: 0.85, mix: [x('heart', 'heartbeat_slow_0.wav', { t: 0.8, fadeOut: 0.3, gain: -6 })] }),
  'skill.pal.mercyHit': x('sword20', SW + 'sword.1.ogg', { rate: 0.75, mix: [x('ki', 'impactSoft_heavy_004.ogg', { gain: -3 }), x('bells', 'bell_ding3.wav', { rate: 0.6, t: 0.9, fadeOut: 0.5, gain: -12 })] }),
  // Sevenfold: a blur of thin strokes; each thrust a light tick of steel.
  'skill.pal.seven': x('melee3', 'sword sound.wav', { rate: 1.3, mix: [x('swish', 'swish-1.wav', { rate: 1.6, delay: 90, gain: -3 }), x('swish', 'swish-4.wav', { rate: 1.6, delay: 180, gain: -4 }), x('swish', 'swish-6.wav', { rate: 1.6, delay: 270, gain: -5 })] }),
  'skill.pal.sevenHit': x('r80', 'blade_03.ogg', { rate: 1.25, mix: [x('ki', 'impactPlate_light_004.ogg', { rate: 1.3, gain: -8 })] }),
  // Last Rites: a low voice and a cloak in the dark, then the blade through and a small bell.
  'skill.pal.rites': x('chant', 'chant18.wav', { ss: 1, t: 1.0, rate: 0.7, fadeIn: 0.1, fadeOut: 0.4, gain: -6, mix: [x('kr', 'cloth4.ogg', { rate: 0.8, gain: -4 })] }),
  'skill.pal.ritesHit': x('sword20', SW + 'sword.10.ogg', { rate: 0.7, mix: [x('ki', 'impactPunch_heavy_004.ogg', { rate: 0.7, gain: -2 }), x('c100', 'bell_02.ogg', { rate: 0.55, gain: -8 })] }),
  // --- Aura ------------------------------------------------------------------
  // Tallow Light: a match struck, the wick catching, a soft voice under a vault.
  'skill.pal.tallow': x('tiny', 'match-light-01.wav', { mix: [x('flame', 'flame.ogg', { delay: 180, t: 0.8, fadeOut: 0.4, gain: -9 }), x('chant', 'ethereal_chant_Subclip 03_03.wav', { delay: 150, t: 1.1, rate: 0.8, fadeIn: 0.15, fadeOut: 0.5, gain: -12 })] }),
  // Iron Vigil: a knee in plate on stone, mail settling, a lighter at a wick.
  'skill.pal.vigil': x('ki', 'impactPlate_medium_002.ogg', { rate: 0.7, mix: [x('rsp', 'inventory/chainmail1.wav', { rate: 0.7, gain: -6 }), x('tiny', 'lighter-light-01.wav', { delay: 260, gain: -5 }), x('chant', 'chant9.wav', { ss: 0.2, t: 1.0, rate: 0.55, fadeIn: 0.2, fadeOut: 0.4, gain: -11 })] }),
  // Smouldering Rood: old wood cracking as it takes the fire.
  'skill.pal.rood': x('mw', 'wood_cracking_02.ogg', { rate: 0.75, mix: [x('r80', 'spell_fire_03.ogg', { rate: 0.7, delay: 120, gain: -4 }), x('crackle', 'fire-1.ogg', { ss: 1.0, t: 1.0, delay: 200, fadeOut: 0.4, gain: -6 })] }),
  // Anoint: a clay flask uncorked, oil poured, a breath of a hymn.
  'skill.pal.anoint': x('tiny', 'bottle-clay-uncork-01.wav', { mix: [x('tiny', 'water-pour-01.wav', { delay: 160, rate: 0.7, t: 0.7, fadeOut: 0.3, gain: -4 }), x('chant', 'ethereal_chant_Subclip 11_11.wav', { t: 0.9, rate: 0.9, fadeIn: 0.1, fadeOut: 0.4, gain: -11 })] }),
  // Censure: a page torn out and a book slammed, a voice naming the sin.
  'skill.pal.censure': x('tiny', 'cover-paper-tear-01.wav', { rate: 0.8, mix: [x('kr', 'bookClose.ogg', { rate: 0.8, delay: 90, gain: -3 }), x('chant', 'chant14.wav', { ss: 0.3, t: 0.8, rate: 0.65, fadeOut: 0.3, gain: -9 })] }),
  'skill.pal.censureHit': x('mw', 'wood_hammer_01.ogg', { rate: 0.8, mix: [x('clink', 'thud3.wav', { rate: 0.7, gain: -4 }), x('steam', 'steam hisses - Marker #4.wav', { t: 0.4, fadeOut: 0.2, gain: -12 })] }),
  // Censer Smoke: the censer shaken on its chain, thick smoke breathed out.
  'skill.pal.smoke': x('r80', 'chain_02.ogg', { rate: 0.75, mix: [x('gbreath', 'ghostbreath.flac', { t: 1.1, rate: 0.8, fadeIn: 0.1, fadeOut: 0.5, gain: -6 }), x('steam', 'steam hisses - Marker #1.wav', { t: 0.8, lp: 1500, fadeOut: 0.4, gain: -10 })] }),
  // Fervour: the heart going fast, a match flaring, the chant at a run.
  'skill.pal.fervour': x('heart', 'heartbeat_fast_0.wav', { t: 1.0, fadeOut: 0.3, gain: -3, mix: [x('tiny', 'match-light-01.wav', { rate: 1.3, gain: -6 }), x('chant', 'chant17.wav', { ss: 0.1, t: 0.9, rate: 1.1, fadeIn: 0.05, fadeOut: 0.3, gain: -9 })] }),
  // Tolling Bell: a yoke creaking as the bell is hung; each toll a deep tower bell.
  'skill.pal.bell': x('kr', 'creak3.ogg', { rate: 0.7, mix: [x('r80', 'chain_01.ogg', { rate: 0.6, gain: -6 }), x('c100', 'bell_02.ogg', { rate: 0.7, delay: 200, t: 1.2, fadeOut: 0.6, gain: -8 })] }),
  'skill.pal.bellHit': x('c100', 'gong_01.ogg', { rate: 0.7, t: 2.0, fadeOut: 1.0, mix: [x('ki', 'impactBell_heavy_003.ogg', { rate: 0.5, gain: -3 })] }),
  // Martyr's Vow: a fist on a breastplate, a slow heart, a vow sung low.
  'skill.pal.vow': x('ki', 'impactPlate_heavy_000.ogg', { rate: 0.85, mix: [x('heart', 'heartbeat_slow_0.wav', { delay: 100, t: 1.2, fadeOut: 0.4, gain: -6 }), x('chant', 'ethereal_chant_Subclip 17_17.wav', { t: 1.2, rate: 0.7, fadeIn: 0.2, fadeOut: 0.5, gain: -10 })] }),
  // Writ of Ash: a writ unrolled, its paper rattling, catching at the corner.
  'skill.pal.writ': x('kr', 'bookOpen.ogg', { rate: 0.85, mix: [x('c100', 'paper_02.ogg', { rate: 0.8, delay: 80, gain: -4 }), x('ignite', 'ignition.flac', { delay: 250, t: 0.7, rate: 1.2, fadeOut: 0.3, gain: -8 })] }),
  // Consecrated Ground: a palm on cold flagstone and a choir rising out of it.
  'skill.pal.ground': x('r80', 'stones_02.ogg', { rate: 0.7, mix: [x('chant', 'ethereal_chant_Subclip 06_06.wav', { t: 1.4, rate: 0.75, fadeIn: 0.2, fadeOut: 0.6, gain: -7 }), x('c100b', 'sfx100v2_air_01.ogg', { t: 0.8, lp: 1500, gain: -10 })] }),
  // The Last Hour: a chain running out far overhead, air moving, a voice.
  'skill.pal.hour': x('r80', 'chain_03.ogg', { rate: 0.55, mix: [x('c100b', 'sfx100v2_air_03.ogg', { rate: 0.6, lp: 1200, delay: 200, gain: -4 }), x('chant', 'chant21.wav', { ss: 0.2, t: 1.2, rate: 0.5, fadeIn: 0.1, fadeOut: 0.5, gain: -8 })] }),
  'skill.pal.hourHit': x('ki', 'impactBell_heavy_000.ogg', { rate: 0.35, t: 2.4, fadeOut: 1.2, mix: [x('mw', 'metal_falling_02.ogg', { rate: 0.6, gain: -2 }), x('bfh', 'bfh1_rock_hit_01.ogg', { rate: 0.5, gain: -4 }), x('c100', 'gong_02.ogg', { rate: 0.6, t: 1.8, fadeOut: 0.9, gain: -6 })] }),
};

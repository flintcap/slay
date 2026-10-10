/**
 * What every sound id, ambience bed and music track is made of.
 *
 * Each entry is a list of takes. One take becomes one variation file
 * (`public/assets/sounds/<id>/NN.ogg`). A take names a pack from `packs.mjs`,
 * a file inside it, and a few treatments:
 *
 *   ss, t      start and length in seconds (cut before anything else)
 *   rev        play it backwards (after the cut)
 *   rate       speed and pitch together; below 1 is lower and heavier
 *   hp, lp     high-pass and low-pass cutoffs in Hz
 *   gain       dB on top of the normalised level (to balance takes of one id)
 *   fadeIn     seconds
 *   fadeOut    seconds (a cut take always gets a short one)
 *   loops      repeat the file this many times (short loops into a bed)
 *   slices     split the file at its silences and keep this many of the
 *              longest pieces, each its own take
 *   mix        other takes laid on top, each with `delay` (ms) and `gain` (dB)
 *   keep       do not trim leading and trailing silence
 *
 * Everything here is CC0; see packs.mjs for the source pages.
 */

/** Folder inside each pack where its files live, so takes can use short names. */
export const ROOTS = {
  rsp: 'rpg_sound_pack/RPG Sound Pack/',
  r80: '80-CC0-RPG-SFX_0/',
  swish: 'swishes/swishes/',
  melee3: 'melee sounds/melee sounds/',
  battle: 'battle_sound_effects_0/battle_sound_effects/',
  zomb: 'zombies/zombies/',
  c100: '100-CC0-SFX_0/',
  c100b: 'sfx_100_v2/',
  moan: 'qubodup-GhostMoans/qubodup-GhostMoans/wav/',
  creat: '80-CC0-creature-SFX_0/',
  creat2: '80-CC0-creature-sfx-2/',
  water: 'water-splash-slime-sfx/',
  steps: 'footsteps/footsteps/',
  bfh: 'sfx_breaking_and_falling/',
  tiny: 'tinysized/sfx-cc0/',
  loops30: 'sfx_loops/',
  bang: '25-CC0-bang-sfx/',
  gob: 'goblins_0/goblins/',
  sword20: '',
  mud: '25-CC0-mud-sfx/',
  hit5: '5Hit_Sounds/ogg/',
  ice: 'icespells/',
  acc: 'accessory/sfx/',
  wpn: 'weapons-apparel/sfx/',
  shield: 'impact_-_starninjas/',
  dsteps: '[kdd]DifferentSteps_0/',
  wind: 'wind/wind/',
  yell: 'yelling sounds/yelling sounds/',
  hurt: 'death sound effect/',
  cure: 'curemagic/',
  rsfx: 'SFX/SFX/',
  scifi: 'sci-fi-sfx/',
  shatter: 'IceShatters_0/IceShatters/',
  portal4: 'tts/',
  porta: 'PortalSFX/PortalSFX/',
  mw: '100-CC0-wood-metal-SFX/',
  msfx1: 'monster_sfx_pack/monster_sfx_pack/',
  msfx2: 'monster_sfx_pack_2/monster_sfx_pack_2/',
  msfx3: 'monster-sounds-volume-2/Monster-Sounds-Volume-2/',
  dark: 'dark_ambiences/dark_ambiences/',
  kj: '',
};

/** One take. */
const x = (pack, file, o = {}) => ({ pack, file, ...o });

/** Several takes from a numbered pattern: `#` is the number, `##`/`###` zero-padded. */
const xs = (pack, pattern, nums, o = {}) =>
  nums.map((n) => x(pack, pattern.replace(/#+/, (m) => String(n).padStart(m.length, '0')), o));

const SW = 'sword_-_starninjas_1/sword - StarNinjas/';
const SC = 'sword_clash_-_starninjas_0/';

// ---------------------------------------------------------------------------
// Effects: id -> takes
// ---------------------------------------------------------------------------

export const SFX = {
  // --- interface ------------------------------------------------------------
  'ui.click': [...xs('ku', 'click#.ogg', [1, 2, 3], { rate: 0.9, lp: 6000 }), x('ku', 'mouseclick1.ogg', { rate: 0.85, lp: 5000 })],
  'ui.hover': xs('ku', 'rollover#.ogg', [2, 3, 5], { lp: 4000 }),
  'ui.open': [x('kr', 'bookOpen.ogg'), x('kr', 'handleSmallLeather.ogg'), x('kr', 'handleSmallLeather2.ogg')],
  'ui.close': [x('kr', 'bookClose.ogg'), x('kr', 'dropLeather.ogg'), x('kr', 'cloth4.ogg')],
  'ui.tab': xs('kr', 'bookFlip#.ogg', [1, 2, 3]),
  'ui.select': [...xs('kf', 'select_00#.ogg', [1, 3], { rate: 0.8, lp: 5000 }), x('kr', 'metalClick.ogg')],
  'ui.error': xs('kf', 'error_00#.ogg', [6, 7, 8], { rate: 0.8, lp: 3500 }),
  'ui.equip': [x('rsp', 'inventory/chainmail1.wav'), x('rsp', 'inventory/chainmail2.wav'), x('rsp', 'inventory/armor-light.wav'), x('kr', 'beltHandle1.ogg')],
  'ui.unequip': [x('kr', 'beltHandle2.ogg'), x('kr', 'clothBelt.ogg'), x('rsp', 'inventory/cloth-heavy.wav')],
  'ui.buy': [x('rsp', 'inventory/coin.wav'), x('rsp', 'inventory/coin2.wav'), x('kr', 'handleCoins.ogg')],
  'ui.sell': [x('kr', 'handleCoins2.ogg'), x('rsp', 'inventory/coin3.wav'), x('r80', 'item_coins_01.ogg')],
  'craft.success': [
    x('tiny', 'metal-hammer-hit-01.wav', { t: 1.4, mix: [x('magic', 'magical_6.ogg', { delay: 120, gain: -9 })] }),
    x('mw', 'hammer_01.ogg', { rate: 0.85, mix: [x('magic', 'magical_2.ogg', { delay: 90, gain: -9, t: 1 })] }),
  ],
  skillpoint: [x('magic', 'magical_2.ogg', { t: 1.2 }), x('magic', 'magical_5.ogg', { t: 1.2 })],
  levelup: [
    x('magic', 'magical_4.ogg', { mix: [x('c100', 'bell_03.ogg', { rate: 0.8, gain: -6 }), x('cure', 'Cure6.wav', { gain: -8, delay: 150 })] }),
    x('magic', 'magical_7.ogg', { mix: [x('c100', 'bell_01.ogg', { rate: 0.7, gain: -6 }), x('cure', 'Cure2.wav', { gain: -8, delay: 120 })] }),
  ],
  'quest.complete': [x('done', 'gmae.wav'), x('kj', 'Hit jingles/jingles_HIT01.ogg', { mix: [x('c100', 'bell_03.ogg', { rate: 0.9, gain: -10 })] })],
  potion: [
    x('acc', 'bottle-glass-uncork-01.wav', { mix: [x('rsp', 'inventory/bubble.wav', { delay: 260, gain: -2 })] }),
    x('acc', 'bottle-glass-uncork-03.wav', { mix: [x('rsp', 'inventory/bubble2.wav', { delay: 300, gain: -2 })] }),
    x('acc', 'vial-glass-round-uncork-01.wav', { mix: [x('rsp', 'inventory/bubble3.wav', { delay: 280, gain: -3 })] }),
  ],
  portal: [
    x('portal4', '1.mp3', { t: 2.6, fadeOut: 0.8 }),
    x('porta', 'porta.ogg', { rate: 0.8, mix: [x('scifi', 'teleport_02.ogg', { gain: -8, lp: 3000 })] }),
    x('tele', 'teleport.wav', { rate: 0.85 }),
  ],
  waypoint: [
    x('cure', 'Cure2.wav', { mix: [x('c100', 'gong_02.ogg', { rate: 0.6, gain: -9 })] }),
    x('magic', 'magical_1.ogg', { mix: [x('c100', 'bell_01.ogg', { rate: 0.6, gain: -8 })] }),
  ],
  stairs: [x('sdoor', 'stone_door.ogg'), x('c100', 'door_01.ogg', { rate: 0.75, t: 2.2, fadeOut: 0.5, lp: 3000 })],
  door: [x('kr', 'doorOpen_1.ogg'), x('kr', 'doorOpen_2.ogg'), x('mw', 'door_open_01.ogg', { rate: 0.85 })],
  chest: [
    x('acc', 'keyhole-lockbox-unlock-01.wav', { mix: [x('kr', 'creak1.ogg', { delay: 350, gain: -3 })] }),
    x('kr', 'metalLatch.ogg', { mix: [x('kr', 'creak2.ogg', { delay: 200, gain: -3 })] }),
    x('mw', 'lock_open_01.ogg', { mix: [x('kr', 'creak3.ogg', { delay: 300, gain: -3 })] }),
  ],
  shrine: [
    x('cure', 'Cure7.wav', { mix: [x('c100', 'gong_01.ogg', { rate: 0.5, gain: -10 })] }),
    x('magic', 'magical_3.ogg', { mix: [x('c100', 'gong_02.ogg', { rate: 0.5, gain: -10 })] }),
  ],

  // --- weapons --------------------------------------------------------------
  'swing.blade': [
    ...xs('battle', 'swish_#.wav', [2, 3, 4]),
    x('rsp', 'battle/swing.wav'),
    ...xs('swish', 'swish-#.wav', [7, 9], { rate: 0.9 }),
  ],
  'swing.axe': [
    x('battle', 'swish_3.wav', { rate: 0.75, lp: 3500 }),
    x('battle', 'swish_2.wav', { rate: 0.7, lp: 3500 }),
    x('rsp', 'battle/swing.wav', { rate: 0.7, lp: 3500 }),
    x('swish', 'swish-8.wav', { rate: 0.7, lp: 3500 }),
  ],
  'swing.blunt': [
    x('battle', 'swish_3.wav', { rate: 0.6, lp: 2200 }),
    x('swish', 'swish-9.wav', { rate: 0.6, lp: 2200 }),
    x('rsp', 'battle/swing2.wav', { rate: 0.6, lp: 2200 }),
  ],
  'swing.pierce': xs('swish', 'swish-#.wav', [1, 3, 5], { rate: 1.1, hp: 800 }),
  'swing.fist': xs('swish', 'swish-#.wav', [10, 11, 12], { rate: 0.8, lp: 3000 }),
  'swing.light': xs('swish', 'swish-#.wav', [2, 6, 13]),
  'swing.heavy': [
    x('battle', 'swish_3.wav', { rate: 0.55, lp: 1800, mix: [x('swish', 'swish-9.wav', { rate: 0.5, lp: 1800, gain: -3 })] }),
    ...xs('sword20', SW + 'sword.#.ogg', [3, 4, 6], { rate: 0.75, lp: 3000 }),
  ],
  'monster.swing': [
    ...xs('swish', 'swish-#.wav', [7, 8], { rate: 0.75 }),
    x('battle', 'swish_4.wav', { rate: 0.7 }),
    x('melee3', 'animal melee sound.wav'),
  ],
  'shoot.physical': [
    x('battle', 'Bow.wav'),
    x('battle', 'Bow.wav', { rate: 0.9, mix: [x('wpn', 'arrow-feathers-03.wav', { gain: -6 })] }),
    x('wpn', 'arrow-feathers-01.wav', { mix: [x('battle', 'Bow.wav', { rate: 1.08 })] }),
  ],
  'hit.melee': xs('ki', 'impactPunch_heavy_00#.ogg', [0, 1, 2, 3, 4]),
  'hit.sword': [
    ...[1, 2, 3].map((n) => x('r80', `blade_0${n}.ogg`, { mix: [x('ki', `impactPunch_medium_00${n}.ogg`, { gain: -4 })] })),
    x('kr', 'knifeSlice.ogg', { mix: [x('ki', 'impactPunch_heavy_000.ogg', { gain: -5 })] }),
  ],
  'hit.axe': [
    x('kr', 'chop.ogg', { mix: [x('ki', 'impactPunch_heavy_001.ogg', { gain: -3 })] }),
    x('kr', 'chop.ogg', { rate: 0.85, mix: [x('ki', 'impactPunch_heavy_003.ogg', { gain: -3 })] }),
    x('r80', 'blade_02.ogg', { rate: 0.75, mix: [x('ki', 'impactPunch_heavy_002.ogg', { gain: -2 })] }),
  ],
  'hit.blunt': [0, 1, 2, 3].map((n) =>
    x('ki', `impactPunch_heavy_00${n}.ogg`, { rate: 0.8, mix: [x('ki', `impactSoft_heavy_00${n}.ogg`, { gain: -3 })] }),
  ),
  'hit.pierce': [x('kr', 'knifeSlice.ogg', { rate: 1.1 }), x('kr', 'knifeSlice2.ogg'), x('r80', 'blade_01.ogg', { rate: 1.2, hp: 600 })],
  'hit.fist': xs('ki', 'impactPunch_medium_00#.ogg', [0, 1, 2, 3]),
  'hit.heavy': [
    x('ki', 'impactPunch_heavy_000.ogg', { rate: 0.7, mix: [x('bfh', 'bfh1_hit_01.ogg', { gain: -4 })] }),
    x('c100', 'slam_01.ogg', { rate: 0.8, mix: [x('ki', 'impactPunch_heavy_002.ogg', { rate: 0.75 })] }),
    x('ki', 'impactPunch_heavy_004.ogg', { rate: 0.7, mix: [x('bfh', 'bfh1_hit_02.ogg', { gain: -4 })] }),
  ],
  'hit.flesh': [6, 8, 10, 11].map((n, i) =>
    x('mud', `mud_${String(n).padStart(2, '0')}.ogg`, { rate: 0.9, mix: [x('ki', `impactSoft_medium_00${i}.ogg`, { gain: -3 })] }),
  ),
  'hit.bone': [1, 2, 3, 4].map((n) =>
    x('mw', `wood_cracking_0${n}.ogg`, { rate: 1.1, hp: 300, mix: [x('ki', `impactPunch_medium_00${n - 1}.ogg`, { gain: -6 })] }),
  ),
  'hit.metal': [
    ...xs('ki', 'impactPlate_medium_00#.ogg', [0, 1, 2]),
    x('ki', 'impactPlate_heavy_000.ogg'),
    x('ki', 'impactMetal_medium_001.ogg'),
  ],
  'hit.stone': xs('ki', 'impactMining_00#.ogg', [0, 1, 2, 3], { rate: 0.85 }),
  'hit.chitin': [
    ...[1, 2, 3].map((n) => x('tiny', `apple-cut-0${n}.wav`, { t: 0.4, mix: [x('ki', `impactGeneric_light_00${n}.ogg`, { gain: -3 })] })),
    x('creat', 'bug_03.ogg'),
  ],
  'hit.wood': [...xs('ki', 'impactWood_medium_00#.ogg', [0, 1, 2]), x('ki', 'impactPlank_medium_000.ogg')],
  'hit.ooze': [...xs('water', 'slime_##.ogg', [1, 3, 5, 7]), x('rsp', 'NPC/slime/slime8.wav')],
  'arrow.thunk': [...xs('ki', 'impactWood_light_00#.ogg', [0, 1, 2], { rate: 0.9 }), x('mw', 'wood_hit_02.ogg')],
  block: [...xs('shield', 'impact.#.ogg', [1, 2, 3, 6, 7]), x('ki', 'impactPlate_heavy_002.ogg')],
  'block.magic': [
    x('ki', 'impactGlass_medium_000.ogg', { mix: [x('magic', 'magical_6.ogg', { t: 0.6, gain: -6 })] }),
    x('elec', 'shieldhit.wav'),
    x('ki', 'impactBell_heavy_001.ogg', { rate: 0.8, hp: 300 }),
  ],
  parry: [...xs('sword20', SC + 'sword_clash.#.ogg', [1, 2, 5, 8]), ...xs('tiny', 'sword-clash-0#.wav', [3, 5])],
  crit: [
    x('ki', 'impactPunch_heavy_001.ogg', { rate: 0.75, mix: [x('bfh', 'bfh1_breaking_02.ogg', { gain: -3 })] }),
    x('ki', 'impactPunch_heavy_003.ogg', { rate: 0.75, mix: [x('bfh', 'bfh1_rock_breaking_03.ogg', { gain: -3 })] }),
    x('ki', 'impactPunch_heavy_004.ogg', { rate: 0.75, mix: [x('mw', 'wood_breaking_01.ogg', { gain: -4 })] }),
  ],
  'kill.confirm': [0, 1, 2].map((n) =>
    x('ki', `impactSoft_heavy_00${n}.ogg`, { rate: 0.7, mix: [x('mud', `mud_1${7 + n}.ogg`, { gain: -6 })] }),
  ),
  'kill.elite': [
    x('c100', 'gong_01.ogg', { rate: 0.7, mix: [x('bang', 'cannon_03.ogg', { gain: -8, lp: 1500 })] }),
    x('c100', 'gong_02.ogg', { rate: 0.6, mix: [x('bang', 'cannon_04.ogg', { gain: -8, lp: 1500 })] }),
  ],
  'kill.multi': [
    x('ki', 'impactBell_heavy_002.ogg', { rate: 0.6, mix: [x('ki', 'impactPunch_heavy_000.ogg', { rate: 0.7, gain: -2 })] }),
    x('ki', 'impactBell_heavy_004.ogg', { rate: 0.6, mix: [x('ki', 'impactPunch_heavy_002.ogg', { rate: 0.7, gain: -2 })] }),
  ],
  combo: [x('ki', 'impactBell_heavy_000.ogg', { rate: 0.9 }), x('ki', 'impactBell_heavy_003.ogg', { rate: 0.9 })],
  'death.normal': [
    x('bfh', 'bfh1_falling_05.ogg', { lp: 2500, mix: [x('mud', 'mud_17.ogg', { gain: -5 })] }),
    x('bfh', 'bfh1_falling_06.ogg', { lp: 2500, mix: [x('mud', 'mud_04.ogg', { gain: -5 })] }),
    x('bfh', 'bfh1_falling_07.ogg', { lp: 2500, mix: [x('mud', 'mud_19.ogg', { gain: -5 })] }),
  ],
  'death.heavy': [
    x('bfh', 'bfh1_falling_04.ogg', { rate: 0.7, lp: 1500, mix: [x('ki', 'impactSoft_heavy_000.ogg', { rate: 0.6 })] }),
    x('bfh', 'bfh1_falling_01.ogg', { rate: 0.7, lp: 1500, mix: [x('ki', 'impactSoft_heavy_003.ogg', { rate: 0.6 })] }),
  ],
  // A reversed bang swells up to the moment it lands: the tell before a big hit.
  telegraph: [
    x('bang', 'bang_01.ogg', { t: 0.6, rev: true, lp: 3000, fadeIn: 0.15, keep: true }),
    x('bang', 'bang_05.ogg', { t: 0.6, rev: true, lp: 3000, fadeIn: 0.15, keep: true }),
    x('bang', 'cannon_03.ogg', { t: 0.6, rev: true, lp: 3000, fadeIn: 0.15, keep: true }),
  ],
  'telegraph.long': [
    x('bang', 'cannon_02.ogg', { t: 1.1, rev: true, rate: 0.7, lp: 2500, fadeIn: 0.3, keep: true }),
    x('bang', 'bang_10.ogg', { t: 1.0, rev: true, rate: 0.7, lp: 2500, fadeIn: 0.3, keep: true }),
  ],

  // --- the hero -------------------------------------------------------------
  'player.hurt': [...xs('yell', '3grunt#.wav', [3, 4, 5]), ...xs('hit5', 'hit#.ogg', [1, 3])],
  'player.hurtHeavy': [...xs('yell', '3grunt#.wav', [1, 2, 6]), x('yell', '1yell6.wav')],
  'player.death': [...xs('hurt', '#.mp3', [4, 16, 5]), x('hit5', 'die1.ogg', { rate: 0.9 })],
  'player.evade': [
    x('kr', 'cloth1.ogg', { mix: [x('swish', 'swish-2.wav', { gain: -4 })] }),
    x('kr', 'cloth2.ogg', { mix: [x('swish', 'swish-6.wav', { gain: -4 })] }),
  ],
  'player.stunned': [x('ki', 'impactBell_heavy_004.ogg', { rate: 0.5, lp: 2000, mix: [x('yell', '3grunt2.wav', { gain: -4 })] })],
  heartbeat: [x('heart', 'heartbeat_slow_0.wav', { lp: 400 })],
  jump: xs('wpn', 'boots-leather-jump-0#.wav', [1, 2, 3]),
  land: [
    x('dsteps', 'gravel.ogg', { mix: [x('ki', 'impactSoft_medium_000.ogg', { gain: -4 })] }),
    x('kr', 'footstep05.ogg', { rate: 0.8, mix: [x('ki', 'impactSoft_medium_002.ogg', { gain: -4 })] }),
  ],

  // --- spells: cast ---------------------------------------------------------
  'cast.physical': [
    x('battle', 'swish_3.wav', { rate: 0.6, mix: [x('c100b', 'sfx100v2_air_03.ogg', { gain: -3 })] }),
    x('c100b', 'sfx100v2_air_02.ogg', { t: 0.8 }),
    x('whoosh', 'whoosh2_0.wav', { t: 0.9 }),
  ],
  'cast.fire': [...xs('r80', 'spell_fire_0#.ogg', [1, 2, 5, 6]), x('fball', '105016__julien-matthey__jm-fx-fireball-01.wav', { t: 1.2 }), x('ignite', 'ignition.flac')],
  'cast.cold': [x('freeze', 'freeze.wav', { t: 1.2 }), x('ice', 'ice.wav'), x('ice', 'ice.wav', { rate: 0.85, mix: [x('shatter', 'LedasLuzta2.ogg', { gain: -8 })] })],
  'cast.lightning': [x('elec', 'teleport_1.wav'), x('buzz', 'buzz.ogg', { t: 0.8 }), x('elec', 'hit.wav', { t: 1 }), x('elec', 'charge.wav', { t: 0.9 })],
  'cast.poison': [
    x('water', 'bubble_01.ogg'),
    x('water', 'bubble_03.ogg'),
    ...[1, 2].map((n) => x('creat', `spit_0${n}.ogg`, { mix: [x('water', 'bubble_02.ogg', { gain: -6 })] })),
    x('creat', 'burble_01.ogg'),
  ],
  'cast.arcane': [...xs('magic', 'magical_#.ogg', [1, 3, 5, 6], { t: 1.2 }), x('r80', 'spell_01.ogg'), x('r80', 'spell_02.ogg'), x('rsp', 'battle/magic1.wav')],

  // --- spells: impact -------------------------------------------------------
  'impact.fire': [
    x('r80', 'spell_fire_03.ogg'),
    x('r80', 'spell_fire_04.ogg'),
    x('flame', 'flame.ogg', { mix: [x('crackle', 'fire-1.ogg', { t: 0.8, gain: -6 })] }),
    x('boom', 'explosion.wav', { lp: 3000, gain: -2 }),
  ],
  'impact.cold': [
    ...['LedasLuzta.ogg', 'LedasLuzta2.ogg', 'LedasLuzta5.ogg'].map((f) => x('shatter', f)),
    x('ki', 'impactGlass_heavy_000.ogg'),
    x('bfh', 'bfh1_glass_breaking_01.ogg'),
  ],
  'impact.lightning': [x('elec', 'groundhit.wav'), x('elec', 'hit.wav', { t: 0.8 }), x('c100b', 'sfx100v2_thunder_01.ogg', { t: 1.2 }), x('buzz', 'buzz.ogg', { t: 0.6 })],
  'impact.poison': [...xs('water', 'splash_##.ogg', [6, 9, 10]), x('water', 'slime_09.ogg'), x('creat2', 'slime_05.ogg')],
  'impact.arcane': [
    x('magic', 'magical_6.ogg', { t: 0.8 }),
    x('r80', 'spell_02.ogg'),
    x('scifi', 'weird_02.ogg', { lp: 4000 }),
    x('ki', 'impactGlass_light_001.ogg', { mix: [x('magic', 'magical_1.ogg', { t: 0.7, gain: -6 })] }),
  ],

  // --- spells: novas, beams, cones -----------------------------------------
  'nova.physical': [
    x('c100', 'slam_02.ogg', { rate: 0.7, mix: [x('bfh', 'bfh1_rock_breaking_01.ogg', { gain: -3 })] }),
    x('bang', 'cannon_04.ogg', { lp: 1200 }),
  ],
  'nova.fire': [
    x('bang', 'bang_06.ogg', { lp: 4000, mix: [x('crackle', 'fire-1.ogg', { t: 1.2, gain: -5 })] }),
    x('bang', 'bang_10.ogg', { lp: 4000, mix: [x('crackle', 'fire-1.ogg', { ss: 1.5, t: 1.2, gain: -5 })] }),
    x('fball', '105016__julien-matthey__jm-fx-fireball-01.wav'),
  ],
  'nova.cold': [x('shatter', 'LedasLuzta4.ogg', { mix: [x('freeze', 'freeze.wav', { gain: -4 })] }), x('shatter', 'LedasLuzta33.ogg'), x('freeze', 'freeze.wav')],
  'nova.lightning': [x('c100b', 'sfx100v2_thunder_01.ogg', { t: 2, fadeOut: 0.6 }), x('elec', 'deathboom.wav', { t: 2, fadeOut: 0.6 })],
  'nova.poison': [
    x('water', 'splash_01.ogg', { rate: 0.8, mix: [x('water', 'loop_bubbles_1.ogg', { t: 1.2, gain: -6 })] }),
    x('water', 'splash_05.ogg', { rate: 0.8, mix: [x('water', 'bubble_01.ogg', { gain: -4, delay: 100 })] }),
    x('creat', 'burble_02.ogg', { rate: 0.7 }),
  ],
  'nova.arcane': [x('magic', 'magical_4.ogg'), x('magic', 'magical_7.ogg'), x('scifi', 'teleport_02.ogg', { lp: 4000 }), x('drain', 'qubodup-PowerDrain.ogg', { t: 1.5, fadeOut: 0.4 })],
  'beam.lightning': [x('elec', 'snaploop.wav', { t: 1.5 }), x('elec', 'crackleelectricityloop.wav', { loops: 3 })],
  'beam.fire': [x('flame', 'flame.ogg', { mix: [x('crackle', 'fire-1.ogg', { t: 1.2, gain: -3 })] }), x('r80', 'spell_fire_03.ogg')],
  'beam.arcane': [x('drain', 'qubodup-PowerDrain.ogg', { t: 1.2 }), x('magic', 'magical_5.ogg', { t: 1.2 })],
  'cone.fire': [x('fball', '105016__julien-matthey__jm-fx-fireball-01.wav', { rate: 0.9 }), x('r80', 'spell_fire_04.ogg')],
  'cone.cold': [x('freeze', 'freeze.wav', { ss: 0.2 }), x('ice', 'ice.wav', { rate: 0.8, mix: [x('freeze', 'freeze.wav', { gain: -6 })] })],
  'cone.poison': [x('creat', 'spit_02.ogg', { rate: 0.8 }), x('creat', 'burble_02.ogg'), x('creat', 'spit_03.ogg', { rate: 0.8 })],

  // --- spells: named ---------------------------------------------------------
  'spell.explosion': [
    ...xs('bang', 'bang_0#.ogg', [1, 3, 9], { rate: 0.85, lp: 5000 }),
    x('boom', 'explosion.wav'),
    x('scifi', 'explosion_01.ogg', { lp: 3000 }),
  ],
  'spell.meteor': [
    x('farboom', 'nenadsimic__muffled distant explosion.ogg', { t: 2.5, fadeOut: 0.8, mix: [x('bang', 'cannon_02.ogg', { rate: 0.7, gain: -2 })] }),
    x('bang', 'cannon_01.ogg', { rate: 0.6, mix: [x('bfh', 'bfh1_rock_breaking_01.ogg', { gain: -2 })] }),
  ],
  'spell.thunder': [
    x('c100b', 'sfx100v2_thunder_01.ogg', { t: 3, fadeOut: 1 }),
    x('c100b', 'sfx100v2_thunder_01.ogg', { rate: 0.85, t: 3, fadeOut: 1 }),
    x('elec', 'deathboom.wav', { t: 2.5, fadeOut: 0.8 }),
  ],
  'spell.chainLightning': [x('elec', 'snaploop.wav', { t: 0.9 }), x('elec', 'teleport_1.wav'), x('buzz', 'buzz.ogg', { ss: 0.1, t: 0.7 })],
  'spell.volley': [
    x('battle', 'Bow.wav', { mix: [x('battle', 'Bow.wav', { delay: 70, rate: 1.06, gain: -2 }), x('battle', 'Bow.wav', { delay: 150, rate: 0.94, gain: -3 })] }),
    x('wpn', 'arrow-feathers-02.wav', { mix: [x('battle', 'Bow.wav', { gain: -1 }), x('battle', 'Bow.wav', { delay: 110, rate: 1.1, gain: -3 })] }),
  ],
  'spell.whirlwind': [x('whoosh', 'whoosh2_0.wav', { t: 1.6, fadeOut: 0.5 }), x('wwoosh', 'wind woosh loop.ogg', { t: 1.5, fadeIn: 0.2, fadeOut: 0.5 })],
  'spell.summon': [
    x('earth', 'Earth Element Magic Spell_3.ogg'),
    x('gbreath', 'ghostbreath.flac', { t: 2, fadeOut: 0.6 }),
    x('portal4', '2.mp3', { t: 2, fadeOut: 0.6 }),
  ],
  'spell.shield': [
    x('elec', 'shieldhit.wav'),
    x('elec', 'powerup.wav', { t: 1.2 }),
    x('ki', 'impactBell_heavy_000.ogg', { rate: 0.8, mix: [x('magic', 'magical_2.ogg', { t: 1, gain: -6 })] }),
  ],
  'spell.heal': xs('cure', 'Cure#.wav', [1, 3, 4, 5]),
  'spell.curse': [
    x('ghost', 'ghost.wav', { t: 1.8, fadeOut: 0.5 }),
    x('drain', 'qubodup-PowerDrain.ogg', { t: 1.6, rate: 0.8, fadeOut: 0.5 }),
    x('moan', 'qubodup-GhostMoan05.wav'),
  ],
  'spell.teleportOut': [x('tele', 'teleport.wav'), x('scifi', 'teleport_01.ogg', { lp: 5000 }), x('porta', 'porta.ogg')],
  'spell.teleportIn': [x('scifi', 'teleport_02.ogg', { t: 1.2, lp: 5000 }), x('tele', 'teleport.wav', { rev: true, fadeIn: 0.1 }), x('elec', 'teleport_1.wav', { rate: 0.85 })],
  buff: [x('magic', 'magical_2.ogg'), x('magic', 'magical_5.ogg'), x('cure', 'Cure8.wav')],
  debuff: [x('drain', 'qubodup-PowerDrain.ogg', { t: 1, rate: 0.7 }), x('ghost', 'ghost.wav', { t: 1, fadeOut: 0.3 }), x('creat2', 'weird_06.ogg', { rate: 0.7 })],
  slam: [
    ...[1, 3, 7].map((n, i) => x('c100', `slam_0${n}.ogg`, { rate: 0.7, mix: [x('ki', `impactMining_00${i}.ogg`, { rate: 0.7 })] })),
    x('bfh', 'bfh1_rock_breaking_01.ogg', { rate: 0.8 }),
  ],

  // --- voices ---------------------------------------------------------------
  roar: [x('creat', 'roar_02.ogg'), ...xs('creat2', 'roar_0#.ogg', [4, 5, 6], { rate: 0.85 })],
  howl: [x('creat', 'howl.ogg', { rate: 0.9 }), x('creat', 'howl.ogg', { rate: 0.75 }), x('rsp', 'NPC/misc/wolfman.wav', { rate: 0.8 })],
  wail: [x('moan', 'qubodup-GhostMoan01.wav'), x('moan', 'qubodup-GhostMoan05.wav'), x('rsp', 'NPC/shade/shade8.wav'), x('rsp', 'NPC/shade/shade9.wav')],
  warcry: [x('yell', '2yell6.wav'), x('yell', '3yell6.wav'), x('yell', '1yell11.wav')],
  ambush: [
    x('creat', 'scream_01.ogg', { rate: 0.8, mix: [x('bang', 'cannon_05.ogg', { lp: 800, gain: -6 })] }),
    x('msfx1', 'monster-6.wav', { rate: 0.8 }),
    x('laugh', 'laugh-evil-1.ogg', { t: 2, fadeOut: 0.5 }),
  ],
  screech: [x('creat', 'scream_02.ogg'), x('creat2', 'alien_08.ogg', { rate: 0.9 }), x('rsp', 'NPC/shade/shade14.wav')],

  // --- monsters by family ---------------------------------------------------
  'monster.undead.aggro': xs('zomb', 'zombie-#.wav', [16, 17, 18, 9]),
  'monster.undead.attack': xs('zomb', 'zombie-#.wav', [24, 5, 11, 13]),
  'monster.undead.hurt': xs('zomb', 'zombie-#.wav', [3, 6, 7, 22]),
  'monster.undead.death': [...xs('zomb', 'zombie-#.wav', [19, 20, 21]), x('rsp', 'NPC/shade/shade12.wav', { rate: 0.85 })],

  'monster.demon.aggro': xs('rsp', 'NPC/gutteral beast/mnstr#.wav', [5, 9, 11, 14], { rate: 0.75 }),
  'monster.demon.attack': xs('rsp', 'NPC/gutteral beast/mnstr#.wav', [1, 12, 15, 10], { rate: 0.8 }),
  'monster.demon.hurt': xs('rsp', 'NPC/gutteral beast/mnstr#.wav', [2, 3, 8, 13], { rate: 0.85 }),
  'monster.demon.death': [
    x('rsp', 'NPC/gutteral beast/mnstr14.wav', { rate: 0.65 }),
    x('creat', 'monster_04.ogg', { rate: 0.7 }),
    x('creat2', 'monster_19.ogg', { rate: 0.75 }),
  ],

  'monster.beast.aggro': [x('creat', 'roar_02.ogg'), x('creat2', 'roar_04.ogg'), x('creat2', 'roar_06.ogg'), x('rsp', 'NPC/misc/wolfman.wav')],
  'monster.beast.attack': [...xs('creat2', 'attack_0#.ogg', [2, 3, 4]), ...xs('rsp', 'NPC/beetle/bite-small#.wav', [2, 3], { rate: 0.75 })],
  'monster.beast.hurt': [...xs('creat', 'hurt_0#.ogg', [1, 2, 3, 5]), x('creat', 'grunt_03.ogg')],
  'monster.beast.death': xs('creat2', 'die_0#.ogg', [1, 2, 3, 4]),

  'monster.construct.aggro': [
    x('c100', 'machine_01.ogg', { rate: 0.7, mix: [x('ki', 'impactMetal_heavy_000.ogg', { rate: 0.7, gain: -4 })] }),
    x('c100', 'machine_02.ogg', { rate: 0.7 }),
    x('c100', 'metal_12.ogg', { rate: 0.7 }),
  ],
  'monster.construct.attack': [...xs('ki', 'impactMetal_heavy_00#.ogg', [1, 2, 3], { rate: 0.75 }), x('mw', 'metal_slam_01.ogg', { rate: 0.8 })],
  'monster.construct.hurt': [...xs('ki', 'impactPlate_light_00#.ogg', [0, 1, 2]), x('mw', 'metal_hit_02.ogg')],
  'monster.construct.death': [
    x('bfh', 'bfh1_metal_falling_01.ogg', { rate: 0.8, mix: [x('mw', 'metal_falling_01.ogg', { gain: -3, rate: 0.8 })] }),
    x('mw', 'metal_falling_02.ogg', { rate: 0.75, mix: [x('bfh', 'bfh1_rock_falling_01.ogg', { gain: -4 })] }),
  ],

  'monster.insect.aggro': [...xs('creat', 'bug_0#.ogg', [1, 2, 4]), x('rsp', 'NPC/beetle/bite-small.wav')],
  'monster.insect.attack': [...xs('creat2', 'bug_##.ogg', [5, 6, 7]), x('rsp', 'NPC/beetle/bite-small2.wav')],
  'monster.insect.hurt': xs('creat2', 'bug_##.ogg', [8, 9, 10, 11]),
  'monster.insect.death': [
    x('creat2', 'bug_12.ogg', { mix: [x('tiny', 'apple-cut-02.wav', { gain: -4 })] }),
    x('creat2', 'bug_13.ogg', { mix: [x('mud', 'mud_06.ogg', { gain: -4 })] }),
    x('creat', 'bug_03.ogg', { rate: 0.8, mix: [x('tiny', 'apple-cut-03.wav', { gain: -4 })] }),
  ],

  'monster.aberration.aggro': [...xs('creat', 'alien_0#.ogg', [1, 2, 3]), x('creat', 'weird_01.ogg', { rate: 0.8 })],
  'monster.aberration.attack': [...xs('creat2', 'alien_##.ogg', [7, 9, 10]), x('creat', 'weird_05.ogg')],
  'monster.aberration.hurt': [...xs('creat', 'alien_0#.ogg', [4, 5, 6]), x('creat2', 'alien_11.ogg')],
  'monster.aberration.death': [x('creat2', 'alien_12.ogg', { rate: 0.75 }), x('creat2', 'weird_06.ogg', { rate: 0.7 }), x('creat', 'weird_04.ogg', { rate: 0.7 })],

  'monster.elemental.aggro': [x('r80', 'stones_03.ogg', { rate: 0.75, mix: [x('farboom', 'nenadsimic__muffled distant explosion.ogg', { t: 1.2, gain: -8 })] }), x('bfh', 'bfh1_rock_falling_01.ogg', { rate: 0.7 })],
  'monster.elemental.attack': [...xs('r80', 'stones_0#.ogg', [1, 2], { rate: 0.8 }), x('bfh', 'bfh1_rock_breaking_02.ogg', { rate: 0.8 })],
  'monster.elemental.hurt': [...xs('bfh', 'bfh1_rock_falling_0#.ogg', [4, 6, 7]), x('ki', 'impactMining_004.ogg')],
  'monster.elemental.death': [x('bfh', 'bfh1_rock_breaking_01.ogg', { rate: 0.7, mix: [x('r80', 'stones_03.ogg', { gain: -3 })] }), x('bfh', 'bfh1_rock_falling_03.ogg', { rate: 0.7 })],

  'monster.humanoid.aggro': [...xs('gob', 'goblin-#.wav', [3, 12, 9]), x('creat2', 'human_01.ogg')],
  'monster.humanoid.attack': [...xs('gob', 'goblin-#.wav', [4, 15, 5]), x('creat2', 'human_03.ogg')],
  'monster.humanoid.hurt': [...xs('gob', 'goblin-#.wav', [1, 2, 6, 7]), x('creat2', 'human_05.ogg')],
  'monster.humanoid.death': [x('creat2', 'human_02.ogg'), x('creat2', 'human_06.ogg'), x('creat2', 'human_07.ogg'), x('gob', 'goblin-12.wav', { rate: 0.85 })],

  'monster.plant.aggro': [...xs('kr', 'creak#.ogg', [1, 2, 3], { rate: 0.7 }), x('mw', 'wood_squeak_01.ogg', { rate: 0.6 })],
  'monster.plant.attack': [...xs('mw', 'wood_slam_0#.ogg', [1, 2, 3], { rate: 0.85 }), x('tiny', 'wood-twigs-break-01.wav')],
  'monster.plant.hurt': [...xs('mw', 'wood_cracking_0#.ogg', [1, 3]), x('bfh', 'bfh1_wood_hit_01.ogg'), x('tiny', 'wood-twigs-break-02.wav', { t: 0.5 })],
  'monster.plant.death': [x('mw', 'wood_breaking_01.ogg', { rate: 0.7, mix: [x('mw', 'wood_falling_01.ogg', { gain: -3 })] }), x('bfh', 'bfh1_wood_breaking_03.ogg', { rate: 0.7, mix: [x('bfh', 'bfh1_wood_falling_01.ogg', { gain: -3 })] })],

  'monster.ooze.aggro': [...xs('rsp', 'NPC/slime/slime#.wav', [8, 9], { rate: 0.8 }), x('creat', 'burble_01.ogg', { rate: 0.8 })],
  'monster.ooze.attack': [...xs('creat2', 'slime_0#.ogg', [1, 2, 3]), x('rsp', 'NPC/slime/slime6.wav')],
  'monster.ooze.hurt': [...xs('creat2', 'slime_0#.ogg', [4, 6, 7]), ...xs('rsp', 'NPC/slime/slime#.wav', [1, 3])],
  'monster.ooze.death': [x('creat2', 'slime_08.ogg', { rate: 0.8, mix: [x('water', 'splash_02.ogg', { gain: -3 })] }), x('creat', 'burble_02.ogg', { rate: 0.75, mix: [x('water', 'splash_08.ogg', { gain: -3 })] })],

  // --- bosses ---------------------------------------------------------------
  'boss.roar': [
    x('troll', 'troll-roars.ogg', { slices: 4, rate: 0.9 }),
    x('mino', 'mino1.wav', { slices: 2 }),
    ...xs('creat2', 'monster_##.ogg', [19, 20], { rate: 0.75 }),
  ],
  'boss.windup': [
    x('troll', 'troll-idle-noises.ogg', { slices: 3, rate: 0.85 }),
    x('bang', 'cannon_02.ogg', { t: 1.3, rev: true, rate: 0.6, lp: 2000, fadeIn: 0.4, keep: true }),
  ],
  'boss.slam': [
    x('bang', 'cannon_01.ogg', { lp: 2500, mix: [x('ki', 'impactMining_001.ogg', { rate: 0.6 })] }),
    x('bang', 'cannon_02.ogg', { lp: 2500, mix: [x('ki', 'impactMining_003.ogg', { rate: 0.6 })] }),
    x('farboom', 'nenadsimic__muffled distant explosion.ogg', { t: 2, fadeOut: 0.7, mix: [x('c100', 'slam_02.ogg', { rate: 0.6 })] }),
  ],
  'boss.phase': [
    x('c100', 'gong_01.ogg', { rate: 0.55, mix: [x('farboom', 'nenadsimic__muffled distant explosion.ogg', { t: 2.5, gain: -4 })] }),
    x('c100', 'gong_02.ogg', { rate: 0.5, mix: [x('creat2', 'roar_05.ogg', { rate: 0.7, gain: -3 })] }),
  ],
  'boss.intro': [
    x('c100', 'gong_01.ogg', { rate: 0.5, mix: [x('farboom', 'nenadsimic__muffled distant explosion.ogg', { t: 3, gain: -2, fadeOut: 1 })] }),
    x('ki', 'impactBell_heavy_003.ogg', { rate: 0.45, mix: [x('bang', 'cannon_02.ogg', { rate: 0.6, lp: 1500 })] }),
  ],

  // --- loot -----------------------------------------------------------------
  gold: [...xs('r80', 'item_coins_0#.ogg', [1, 2, 3]), x('rsp', 'inventory/coin.wav'), x('kr', 'handleCoins.ogg')],
  'gold.spill': [x('acc', 'coins-shake-02.wav', { t: 0.8 }), x('sack', 'gold_sack.wav', { t: 1.2 }), x('acc', 'coin-spin-fall-01.wav', { t: 1.2 })],
  'gold.land': [...xs('acc', 'coinflip-0#.wav', [1, 2, 3]), x('rsp', 'inventory/coin3.wav')],
  'loot.toss': xs('swish', 'swish-#.wav', [11, 12], { rate: 0.7, lp: 3000 }),
  'loot.clink': [...xs('r80', 'item_misc_0#.ogg', [1, 2, 3]), x('clink', 'clink1_0.wav'), x('clink', 'clink2.wav'), x('clink', 'clink3.wav')],
  'loot.grab': [x('kr', 'handleSmallLeather.ogg'), x('kr', 'cloth3.ogg'), x('rsp', 'inventory/cloth.wav')],
  // The pillar-of-light moment: a deep gong under a bright bell.
  'loot.legendary': [
    x('c100', 'gong_01.ogg', { rate: 0.45, mix: [x('c100', 'bell_03.ogg', { rate: 0.8, gain: -4 }), x('magic', 'magical_4.ogg', { gain: -6 })] }),
    x('ki', 'impactBell_heavy_001.ogg', { rate: 0.5, mix: [x('c100', 'bell_01.ogg', { gain: -3 }), x('cure', 'Cure6.wav', { gain: -6 })] }),
  ],
  'drop.magic': xs('r80', 'item_gem_0#.ogg', [1, 2, 3], { rate: 0.9 }),
  'drop.rare': [x('clink', 'bing1.wav', { mix: [x('r80', 'item_gem_04.ogg', { gain: -3 })] }), x('c100', 'bell_02.ogg', { rate: 1.2 })],
  'drop.set': [x('c100', 'bell_01.ogg', { rate: 0.9, mix: [x('ki', 'impactGlass_light_000.ogg', { gain: -4 })] }), x('c100', 'bell_02.ogg', { rate: 0.8 })],
  // Unique and above: a bright bell. loot.legendary lays the deep gong under it.
  'drop.unique': [
    x('c100', 'bell_03.ogg', { mix: [x('magic', 'magical_4.ogg', { gain: -5 })] }),
    x('c100', 'bell_01.ogg', { rate: 0.85, mix: [x('cure', 'Cure7.wav', { gain: -6 })] }),
  ],
  'pickup.magic': [x('r80', 'item_gem_02.ogg', { mix: [x('kr', 'handleSmallLeather.ogg', { gain: -5 })] }), x('r80', 'item_gem_03.ogg', { mix: [x('kr', 'cloth3.ogg', { gain: -5 })] })],
  'pickup.rare': [x('magic', 'magical_6.ogg', { t: 0.7, mix: [x('r80', 'item_gem_04.ogg')] }), x('clink', 'bing1.wav', { mix: [x('kr', 'handleSmallLeather2.ogg', { gain: -4 })] })],
  'pickup.kind.weapon': [...xs('kr', 'drawKnife#.ogg', [1, 2, 3]), x('rsp', 'battle/sword-unsheathe.wav'), x('rsp', 'battle/sword-unsheathe3.wav')],
  'pickup.kind.armor': [x('rsp', 'inventory/chainmail1.wav'), x('rsp', 'inventory/chainmail2.wav'), x('rsp', 'inventory/armor-light.wav'), x('rsp', 'inventory/cloth-heavy.wav')],
  'pickup.kind.jewel': [x('rsp', 'inventory/beads.wav'), x('r80', 'item_gem_03.ogg'), x('rsp', 'inventory/metal-small2.wav')],
  'pickup.kind.gem': xs('r80', 'item_gem_0#.ogg', [1, 2, 4]),
  'pickup.kind.potion': [x('rsp', 'inventory/bottle.wav'), ...xs('acc', 'vials-glass-rattle-0#.wav', [4, 5])],
  'pickup.kind.material': [...xs('r80', 'item_stone_0#.ogg', [1, 3]), ...xs('r80', 'item_wood_0#.ogg', [1, 3]), x('rsp', 'inventory/wood-small.wav')],

  // --- footsteps ------------------------------------------------------------
  'footstep.stone': xs('ki', 'footstep_concrete_00#.ogg', [0, 1, 2, 3, 4]),
  'footstep.dirt': xs('kr', 'footstep0#.ogg', [0, 2, 4, 6, 8, 9]),
  'footstep.grass': xs('ki', 'footstep_grass_00#.ogg', [0, 1, 2, 3, 4]),
  'footstep.wood': xs('ki', 'footstep_wood_00#.ogg', [0, 1, 2, 3, 4]),
  'footstep.snow': xs('ki', 'footstep_snow_00#.ogg', [0, 1, 2, 3, 4]),
  'footstep.water': [...xs('c100b', 'sfx100v2_footstep_wet_0#.ogg', [1, 2, 3]), ...xs('water', 'splash_##.ogg', [9, 10], { gain: -4 })],
  'footstep.sand': xs('ki', 'footstep_snow_00#.ogg', [0, 1, 2, 3, 4], { rate: 1.2, hp: 500, lp: 7000 }),
  'footstep.mud': xs('mud', 'mud_##.ogg', [6, 8, 10, 11, 24, 25]),
  'footstep.metal': ['step_metal.ogg', 'step_metal (2).ogg', 'step_metal (3).ogg', 'step_metal (4).ogg'].map((f) => x('steps', f)),

  // --- ambience one-shots ---------------------------------------------------
  'amb.crow': [x('crow', 'crow_caw.wav'), x('crow', 'crow_caw.wav', { rate: 0.85 })],
  'amb.anvil': [...xs('mw', 'hammer_0#.ogg', [1, 2, 4], { lp: 3000 }), x('tiny', 'metal-hammer-hit-01.wav', { lp: 3000 })],
  'amb.bird': [x('birds', 'birds-isaiah658.ogg', { slices: 6 })],
  'amb.gust': [x('wind', 'Wind3.ogg', { fadeIn: 0.3, fadeOut: 0.5 }), x('c100b', 'sfx100v2_air_01.ogg', { fadeIn: 0.3, fadeOut: 0.5 }), x('wwoosh', 'wind woosh loop.ogg', { t: 3, fadeIn: 0.8, fadeOut: 1 })],
  'amb.drip': [...xs('tiny', 'water-drop-0#.wav', [1, 2, 3]), ...xs('c100', 'plop_0#.ogg', [1, 2], { rate: 1.2 })],
  'amb.chain': xs('r80', 'chain_0#.ogg', [1, 2, 3], { rate: 0.8 }),
  'amb.moan': xs('moan', 'qubodup-GhostMoan0#.wav', [1, 2, 3, 4], { lp: 3000 }),
  'amb.rumble': [x('farboom', 'nenadsimic__muffled distant explosion.ogg', { rate: 0.6, lp: 400 }), x('bang', 'cannon_02.ogg', { rate: 0.5, lp: 300, fadeOut: 0.6 })],
  'amb.stones': [...xs('r80', 'stones_0#.ogg', [1, 2, 3]), ...xs('c100b', 'sfx100v2_stones_0#.ogg', [1, 2]), x('bfh', 'bfh1_rock_falling_02.ogg')],
  'amb.hiss': [...xs('tiny', 'compressed-air-spray-0#.wav', [1, 2], { lp: 3000 }), x('c100b', 'sfx100v2_air_03.ogg', { lp: 3000 })],
  'amb.lap': [...xs('water', 'splash_##.ogg', [12, 13, 14], { lp: 2500 }), ...xs('c100', 'splash_0#.ogg', [1, 2], { lp: 2500 })],
  'amb.whisper': [x('gbreath', 'ghostbreath.flac', { t: 3, fadeOut: 0.8 }), ...xs('dark', 'ambience-#.wav', [2, 3, 4])],
  'amb.buzz': [...xs('creat', 'bug_0#.ogg', [1, 2]), ...xs('creat2', 'bug_0#.ogg', [5, 6, 7])],
  'amb.squelch': xs('mud', 'mud_##.ogg', [2, 3, 4, 17]),
  'amb.creak': [...xs('kr', 'creak#.ogg', [1, 2, 3]), ...xs('mw', 'wood_squeak_0#.ogg', [1, 2]), x('tiny', 'floor-creak-01.wav')],
  'amb.shimmer': [x('magic', 'magical_1.ogg', { lp: 2500 }), x('c100', 'bell_03.ogg', { rate: 0.5, lp: 2000 }), x('scifi', 'loop_ambient_weird.ogg', { fadeIn: 0.5, fadeOut: 0.8 })],
  'amb.howl': [x('creat', 'howl.ogg', { rate: 0.7, lp: 2500 }), x('rsp', 'NPC/misc/wolfman.wav', { rate: 0.7, lp: 2000 })],
  'amb.crackle': [x('crackle', 'fire-1.ogg', { slices: 4 }), x('flame', 'flame.ogg')],
};

// ---------------------------------------------------------------------------
// Ambience beds: folder key -> takes (stereo loops, played with crossfades)
// ---------------------------------------------------------------------------

export const BEDS = {
  'wind.soft': [x('wind1', 'wind2.wav', { t: 45, lp: 2000 }), x('wind1', 'wind4.wav', { t: 45, lp: 2000 })],
  fire: [x('hearth', 'fire.wav')],
  dungeon: [x('dungamb', 'dungeon_ambient_1.ogg', { t: 60 })],
  cave: [x('drip', 'atmosbasement.mp3_.flac', { loops: 2 })],
  machine: [x('c100b', 'sfx100v2_loop_machine_02.ogg', { loops: 3, lp: 4000 }), x('loops30', 'machine_11.ogg', { loops: 5, lp: 4000 })],
  water: [x('c100b', 'sfx100v2_loop_water_02.ogg', { loops: 3 }), x('water', 'loop_water_02.ogg', { loops: 4 })],
  hive: [x('crick', 'crickets_1.mp3', { rate: 0.6, loops: 2, lp: 3000 })],
  wind: [x('wind1', 'wind1.wav', { t: 50 }), x('wind1', 'wind3.wav', { t: 50 })],
  'wind.desert': [x('wind1', 'wind5.wav', { t: 50, hp: 250 }), x('wwoosh', 'wind woosh loop.ogg', { loops: 6, hp: 250 })],
  void: [x('rsfx', 'Background/Hollow Wind.wav', { loops: 3, rate: 0.7 }), x('scifi', 'loop_ambient_01.ogg', { loops: 4, rate: 0.6, lp: 3000 })],
  forest: [x('mForestAmb', 'Forest_Ambience.mp3'), x('birds', 'birds-isaiah658.ogg')],
  swamp: [x('swamp', 'swamp.ogg', { ss: 20, t: 60 }), x('swamp', 'swamp.ogg', { ss: 120, t: 60 })],
  rumble: [x('hearth', 'fire.wav', { rate: 0.5, lp: 300 })],
};

// ---------------------------------------------------------------------------
// Music: track key -> takes (stereo; long pieces cut with a fade)
// ---------------------------------------------------------------------------

const cut = (s = 150) => ({ t: s, fadeOut: 5 });

export const MUSIC = {
  menu: [x('mMenu', 'ambientmain_0.ogg')],
  town: [x('mRuins', 'n3535n5n335n35nj.ogg'), x('mInn', 'The_Old_Tower_Inn.mp3')],
  death: [x('mDeath', 'No Hope.mp3')],
  victory: [x('mVictory', 'Victory.mp3')],
  'boss.epic': [x('mEpic', 'Juhani Junkala - Epic Boss Battle [Seamlessly Looping].wav')],
  'boss.dread': [x('mGreat', 'Great Boss.ogg')],
  'boss.war': [x('mWar', 'CleytonRX - Battle RPG Theme Var.ogg')],
  'boss.metal': [x('mMetal', 'boss_battle_#2_metal_pack/boss_battle_#2_metal_loop.wav')],
  crypt: [x('mTomb', 'Forgoten_tombs_1.mp3', cut())],
  caverns: [x('mCave', 'cave themeb4.ogg', cut())],
  foundry: [x('mCircle', 'The 9th Circle V2.mp3', cut())],
  temple: [x('mShrine', 'shrine_0.ogg'), x('mBreves', 'breves_dies_hominis.ogg', cut(120))],
  hive: [x('mCreep', 'CrEEP.ogg')],
  frozen: [x('mIcy', '019_seven_and_eight_7-8_combined.mp3'), x('mWinter', 'wintery loop.mp3')],
  desert: [x('mCaravan', 'caravan.ogg.ogg')],
  tomb: [x('mDungeon', 'dungeon002.ogg', cut())],
  void: [x('mSirens', '012_Sirens_in_Darkness.mp3', cut())],
  forest: [x('mForest', 'forest.ogg', cut()), x('mDarkForest', 'GameMusic_ForestTheme_24.mp3')],
  swamp: [x('mRats', 'ratsrats_0.ogg')],
  hell: [x('mProwler', 'S31-Night Prowler.ogg', cut())],
};

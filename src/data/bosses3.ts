/**
 * SLAY — the six deep bosses, past the Deep's Own Name: one every six tiers
 * from 66 to 96, each harder than the one before.
 *
 * Like the twenty-eight (bosses2.ts) they carry no life or damage numbers of
 * their own: those come from the profile and the tier (`bossNumbers`), and
 * past tier 60 the tier keeps climbing. The profiles are picked so that what
 * each fight can do to you (its life times its damage) rises boss by boss,
 * starting above the Deep's Own Name, and each phase list ends harder than
 * the last one did.
 *
 * They belong to the deep: the Tenant's household, the glass of the Hollow
 * Spire, the delvers who stayed, and the things that hold the bottom down.
 */
import type { BossDef } from '../types';

const KEPT_HALLS: BossDef['biomes'] = ['crypt', 'caverns', 'foundry', 'sunkenTemple', 'desertTomb', 'frostvault', 'voidspire'];
const SPIRE: BossDef['biomes'] = ['voidspire', 'frostvault', 'hell', 'ashwaste', 'hive', 'caverns', 'tundra', 'desert'];
const EVERYWHERE: BossDef['biomes'] = [
  'crypt', 'caverns', 'foundry', 'sunkenTemple', 'hive', 'frostvault', 'ashwaste', 'voidspire',
  'darkForest', 'swamp', 'desert', 'desertTomb', 'tundra', 'hell',
];
const UNDER: BossDef['biomes'] = ['voidspire', 'caverns', 'frostvault', 'hell', 'foundry', 'crypt', 'ashwaste', 'sunkenTemple'];

export const DEEP_BOSSES: BossDef[] = [
  {
    id: 'mother_wickwane',
    name: 'Mother Wickwane',
    title: 'Who Keeps the House',
    family: 'kept',
    minDepth: 66,
    biomes: KEPT_HALLS,
    scale: 2.2,
    profile: 'bruiser',
    shape: 'phased',
    intro: 'A long table set for a hundred. Every candle is lit and every chair is empty. At its head a woman of old wax rises from her seat, and the whole house rises with her.',
    lootTier: 10,
    music: 'boss.crypt',
    adds: ['kept_dustling', 'kept_hallsweeper'],
    visual: { body: 'humanoid', palette: 'flesh.rotted|0xd8c8a4', ornate: 0.8, eyes: 2, glow: 0xffb040, weapon: 'dagger' },
    phases: [
      { atLife: 1.0, name: 'Lamps Lit', abilities: ['double_swipe', 'fire_bolt', 'caltrops'], arena: 'braziers', bark: 'Shoes off at the door. Hands where I can see them.' },
      { atLife: 0.65, name: 'The Household Wakes', abilities: ['double_swipe', 'flame_wave', 'teleport_strike'], arena: 'swarmCall', speed: 1.15, bark: 'Up, all of you. Up! We have a guest, and the guest is making a mess.' },
      { atLife: 0.3, name: 'Lights Out', abilities: ['teleport_strike', 'firestorm', 'cleave', 'terrify'], arena: 'defend', damage: 1.15, speed: 1.15, bark: 'Give me that lamp, dear. Nobody reads in this house after dark.' },
    ],
  },
  {
    id: 'the_glasswright',
    name: 'The Glasswright',
    title: 'Who Glazes the Spire',
    family: 'nailborn',
    minDepth: 72,
    biomes: SPIRE,
    scale: 2.0,
    profile: 'glass',
    shape: 'puzzle',
    intro: 'Panes of glass stand in rows across the room, each one cut to the shape of somebody. A tall figure of leaded glass is cutting another. It holds the blade up to you, and measures.',
    lootTier: 10,
    music: 'boss.void',
    limbs: [
      { name: 'cutting hand', ability: 'teleport_strike' },
      { name: 'lens', ability: 'death_beam' },
      { name: 'left pane', ability: 'shrapnel_nova' },
      { name: 'right pane', ability: 'chain_lightning' },
    ],
    visual: { body: 'humanoid', palette: 'crystal.void|0x9ab8d0', ornate: 0.9, eyes: 1, glow: 0xd8f0ff, weapon: 'sword' },
    phases: [
      { atLife: 1.0, name: 'Cut to Fit', abilities: ['impale', 'shock_bolt', 'piercing_shot'], arena: 'mirror', bark: 'Hold still. You are the wrong shape for the window.' },
      { atLife: 0.6, name: 'Leading the Panes', abilities: ['impale', 'chain_lightning', 'shrapnel_nova'], arena: 'tiles', speed: 1.1, bark: 'Every pane in its place. Step where the light says, or be cut to fit.' },
      { atLife: 0.3, name: 'Shatterline', abilities: ['death_beam', 'shrapnel_nova', 'chain_lightning', 'teleport_strike'], arena: 'weakPoints', damage: 1.2, bark: 'Crack me, then. Every crack is one more edge.' },
    ],
  },
  {
    id: 'marshal_harrow',
    name: 'Marshal Harrow',
    title: 'of the Company That Stayed',
    family: 'stayed',
    minDepth: 78,
    biomes: EVERYWHERE,
    scale: 1.3,
    profile: 'duelist',
    shape: 'phased',
    partner: 'stayed_chaplain',
    intro: 'A company of the dead stands in ranks, still in delver\'s gear, still at attention. At its head a marshal reads the roll by a cold blue light. He reaches the end and looks up. Your name is not on it.',
    lootTier: 10,
    music: 'boss.beast',
    adds: ['stayed_sellsword', 'stayed_archer'],
    visual: { body: 'skeleton', palette: 'stone.crypt|0xb8b0a0', ornate: 0.9, eyes: 2, glow: 0x9cd8ff, weapon: 'sword' },
    phases: [
      { atLife: 1.0, name: 'Fall In', abilities: ['double_swipe', 'charge', 'shield_bash'], arena: 'linked', bark: 'Fall in, delver. Name and company. You are forty years late.' },
      { atLife: 0.75, name: 'Volley', abilities: ['arrow_volley', 'piercing_shot', 'double_swipe'], arena: 'swarmCall', speed: 1.1, bark: 'Bows! Show them how we held the forty-first.' },
      { atLife: 0.5, name: 'Hold the Line', abilities: ['whirlwind', 'shield_bash', 'leap_slam'], arena: 'guardBreak', damage: 1.1, bark: 'Nobody goes up until the roll is called. Nobody.' },
      { atLife: 0.25, name: 'The Last of the Company', abilities: ['execute_low', 'whirlwind', 'charge', 'leap_slam'], arena: 'collapse', damage: 1.2, speed: 1.15, bark: 'I sent them home every night, in my head. Not one of them went.' },
    ],
  },
  {
    id: 'the_holdfast',
    name: 'The Holdfast',
    title: 'Under the Spire\'s Nail',
    family: 'construct',
    minDepth: 84,
    biomes: UNDER,
    scale: 3.4,
    profile: 'bulwark',
    shape: 'puzzle',
    intro: 'The floor is one great iron plate, and something the size of a house is bolted to it. It has been holding the Spire down since before the first stair was cut. Above you, the stone groans upward a finger\'s width.',
    lootTier: 10,
    music: 'boss.foundry',
    adds: ['nail_splinter'],
    visual: { body: 'colossal', palette: 'metal.iron|0x4a4a50', ornate: 1.0, eyes: 1, glow: 0xffa040 },
    phases: [
      { atLife: 1.0, name: 'Holding', abilities: ['heavy_slam', 'stone_hurl', 'grapple_pull'], arena: 'chains', bark: 'HOLD. HOLD. HOLD.' },
      { atLife: 0.66, name: 'Slipping', abilities: ['quake_stomp', 'ballista_bolt', 'shrapnel_nova'], arena: 'heartstones', damage: 1.1, bark: 'THE BOLTS ARE GIVING. STAND ASIDE, SMALL ONE. OR HOLD WITH ME.' },
      { atLife: 0.33, name: 'Letting Go', abilities: ['quake_stomp', 'meteor', 'iron_maiden', 'grapple_pull'], arena: 'bells', damage: 1.25, speed: 1.1, bark: 'IF I LET GO, IT RISES. IF IT RISES, YOU ALL RISE WITH IT.' },
    ],
  },
  {
    id: 'the_usher',
    name: 'The Usher',
    title: 'Who Makes Room',
    family: 'aberration',
    minDepth: 90,
    biomes: EVERYWHERE,
    scale: 2.6,
    profile: 'bruiser',
    shape: 'puzzle',
    intro: 'A door stands in the middle of the room with no wall around it. It opens. Something very tall and very polite unfolds through it, bowing, and the room behind you is no longer the room you came in by.',
    lootTier: 10,
    music: 'boss.arcane',
    adds: ['kept_hallsweeper'],
    visual: { body: 'wraith', palette: 'cloth.linen|0x2a2622', ornate: 1.0, eyes: 2, glow: 0xc8a0ff },
    phases: [
      { atLife: 1.0, name: 'This Way', abilities: ['teleport_strike', 'void_rift', 'double_swipe'], arena: 'stalker', bark: 'This way, please. Mind the step. There are a great many steps.' },
      { atLife: 0.75, name: 'Rooms Rearranged', abilities: ['gravity_well', 'arcane_orb', 'cleave', 'blink_away'], arena: 'lure', bark: 'Forgive me. I am moving the floor. You were standing on it.' },
      { atLife: 0.5, name: 'The Long Hall', abilities: ['vortex_pull', 'arcane_nova', 'teleport_strike'], arena: 'breakingCast', damage: 1.15, bark: 'I have made you a hall with no end. Do walk it. It is the polite thing.' },
      { atLife: 0.25, name: 'Showing You Out', abilities: ['death_beam', 'void_rift', 'arcane_nova', 'teleport_strike'], arena: 'collapse', damage: 1.25, speed: 1.15, bark: 'Then I must show you out. The Tenant is not receiving.' },
    ],
  },
  {
    id: 'sleepers_hand',
    name: "The Sleeper's Hand",
    title: 'Reaching Up in Its Sleep',
    family: 'aberration',
    minDepth: 96,
    biomes: EVERYWHERE,
    scale: 3.9,
    profile: 'bruiser',
    shape: 'puzzle',
    intro: 'The floor here is warm, and it rises and falls, very slowly. Then it opens: a hand as big as a tower comes up through the stone, the way a sleeper reaches for something in a dream. It has found you.',
    lootTier: 10,
    music: 'boss.final',
    adds: ['nail_wrongangle', 'stayed_cutthroat'],
    limbs: [
      { name: 'thumb', ability: 'tentacle_grasp' },
      { name: 'first finger', ability: 'flesh_hooks' },
      { name: 'long finger', ability: 'ground_slam' },
      { name: 'little finger' },
    ],
    visual: { body: 'colossal', palette: 'flesh.rotted|0x6a4a5a', ornate: 1.0, eyes: 5, glow: 0xff80c0 },
    phases: [
      { atLife: 1.0, name: 'Fingers Uncurling', abilities: ['ground_slam', 'tentacle_grasp', 'flesh_hooks'], arena: 'weakPoints', bark: 'Mm. Another little light. Come closer. I am only dreaming you.' },
      { atLife: 0.75, name: 'The Palm Opens', abilities: ['void_rift', 'gravity_well', 'arcane_nova', 'flesh_hooks'], arena: 'wardPortals', damage: 1.1, bark: 'There are doors in my palm. Every one of them is a way down.' },
      { atLife: 0.5, name: 'Grasping', abilities: ['quake_stomp', 'vortex_pull', 'tentacle_grasp', 'meteor'], arena: 'heartstones', damage: 1.2, bark: 'Hold still. I almost have you. I almost always have you.' },
      { atLife: 0.25, name: 'Closing', abilities: ['meteor', 'death_beam', 'quake_stomp', 'vortex_pull'], arena: 'collapse', damage: 1.35, speed: 1.15, bark: 'When I close my hand, I wake. When I wake, there is no more down.' },
    ],
  },
];

/**
 * SLAY — floor wardens: the small bosses of ordinary floors.
 *
 * About one floor in three keeps a warden in a side room with a chest of its
 * own (docs/remake/depth.md, Part 3). A warden is a short, sharp fight: person
 * sized or tall, one or two moves to learn, about a minute to kill. They are
 * bosses in every way the fight cares about (the hit cap, the name card, the
 * bar), but they never close a floor and they are never the run's boss.
 *
 * Their numbers come from their profile at a warden's share (`bossNumbers`).
 */
import type { BossDef } from '../types';

const ALL: BossDef[] = [];

function warden(w: Omit<BossDef, 'warden' | 'shape' | 'lootTier' | 'music'> & { lootTier?: number }): BossDef {
  const def: BossDef = { shape: 'straight', music: 'boss.war', lootTier: 1, ...w, warden: true };
  ALL.push(def);
  return def;
}

// --- tiers 1 to 10 ------------------------------------------------------------

warden({
  id: 'warden_mott',
  name: 'Mott Fennick',
  title: 'the Lamp-Thief',
  family: 'humanoid',
  minDepth: 1,
  biomes: ['crypt', 'caverns', 'darkForest', 'swamp'],
  scale: 1.0,
  profile: 'duelist',
  intro: 'A hooded shape crouches over a sack of stolen lanterns. It blows one out and grins.',
  adds: [],
  visual: { body: 'humanoid', palette: 'cloth.thief|0x3a3428', ornate: 0.3, eyes: 2, weapon: 'dagger' },
  phases: [
    { atLife: 1.0, name: 'Snuff', abilities: ['double_swipe', 'ink_cloud', 'blink_away'], bark: 'Mind the dark. It is mine now.' },
  ],
});

warden({
  id: 'warden_brannoch',
  name: 'Brannoch Tull',
  title: 'the Debt Collector',
  family: 'humanoid',
  minDepth: 2,
  biomes: ['crypt', 'desert', 'desertTomb', 'caverns', 'foundry'],
  scale: 1.15,
  profile: 'bruiser',
  trick: 'debt',
  intro: 'A big man with a ledger chained to his belt. "You owe," he says, and opens the book.',
  adds: [],
  visual: { body: 'humanoid', palette: 'cloth.ledger|0x4a3022', ornate: 0.5, eyes: 2, weapon: 'mace' },
  phases: [
    { atLife: 1.0, name: 'Payment Due', abilities: ['heavy_slam', 'cleave', 'grapple_pull'], bark: 'Every coin. With interest.' },
  ],
});

warden({
  id: 'warden_ysolde',
  name: 'Ysolde Varr',
  title: 'the Duelling Squire',
  family: 'humanoid',
  minDepth: 3,
  biomes: ['crypt', 'sunkenTemple', 'tundra', 'desertTomb'],
  scale: 1.05,
  profile: 'duelist',
  intro: 'A girl in borrowed plate salutes with a notched sword. Her shield is bigger than she is.',
  adds: [],
  visual: { body: 'armored', palette: 'steel.squire|0x8a8a90', ornate: 0.45, eyes: 2, weapon: 'sword' },
  phases: [
    { atLife: 1.0, name: 'En Garde', abilities: ['shield_bash', 'charge', 'rend'], bark: 'Yield, or be knighted the hard way.' },
    { atLife: 0.4, name: 'Second Wind', abilities: ['shield_self', 'charge', 'double_swipe'], speed: 1.15, bark: 'Not done!' },
  ],
});

warden({
  id: 'warden_gorm',
  name: 'Gorm Ashlar',
  title: 'the Mud-Mason',
  family: 'construct',
  minDepth: 4,
  biomes: ['caverns', 'swamp', 'foundry', 'desert'],
  scale: 1.5,
  profile: 'bulwark',
  intro: 'Something made of wet brick lays one more course across the doorway, and turns.',
  adds: [],
  visual: { body: 'golem', palette: 'stone.mud|0x6a5038', ornate: 0.2, eyes: 2 },
  phases: [
    { atLife: 1.0, name: 'Courses', abilities: ['wall_of_bone', 'ground_slam', 'stone_hurl'], bark: 'One more row. Then you.' },
  ],
});

warden({
  id: 'warden_hesper',
  name: 'Hesper Quill',
  title: 'the Ink-Witch',
  family: 'humanoid',
  minDepth: 5,
  biomes: ['crypt', 'voidspire', 'sunkenTemple', 'desertTomb'],
  scale: 1.1,
  profile: 'glass',
  intro: 'Pages turn by themselves on a lectern. The woman behind it writes your name.',
  adds: [],
  visual: { body: 'humanoid', palette: 'cloth.ink|0x1a1a2a', ornate: 0.6, eyes: 2, weapon: 'staff', glow: 0x6040c0 },
  phases: [
    { atLife: 1.0, name: 'Dictation', abilities: ['hex_bolt', 'ink_cloud', 'mind_lash'], bark: 'Hold still. I am spelling it.' },
  ],
});

warden({
  id: 'warden_rook',
  name: 'Old Rook',
  title: 'the Kennel-Keeper',
  family: 'humanoid',
  minDepth: 6,
  biomes: ['darkForest', 'tundra', 'caverns', 'swamp'],
  scale: 1.2,
  profile: 'swarm',
  intro: 'A whistle, and three lean dogs come out of the straw. The old man behind them does not hurry.',
  adds: ['corpse_hound', 'gorge_wolf'],
  visual: { body: 'humanoid', palette: 'leather.kennel|0x5a4630', ornate: 0.3, eyes: 2, weapon: 'spear' },
  phases: [
    { atLife: 1.0, name: 'Let Them Run', abilities: ['summon_adds', 'javelin_toss', 'rally_pack'], bark: 'Go on. Fetch.' },
  ],
});

warden({
  id: 'warden_cassia',
  name: 'Cassia Morrow',
  title: 'the Gravedigger',
  family: 'undead',
  minDepth: 7,
  biomes: ['crypt', 'swamp', 'darkForest', 'desertTomb'],
  scale: 1.25,
  profile: 'bruiser',
  intro: 'She leans on her spade beside a fresh hole. It is about your size.',
  adds: ['skeleton_rattler'],
  visual: { body: 'zombie', palette: 'cloth.grave|0x3c3a34', ornate: 0.3, eyes: 2, weapon: 'axe' },
  phases: [
    { atLife: 1.0, name: 'Dig', abilities: ['heavy_slam', 'raise_dead', 'cleave'], bark: 'Lie down. It is softer than it looks.' },
  ],
});

warden({
  id: 'warden_pike',
  name: 'Sergeant Pike',
  title: 'of the Lost Watch',
  family: 'undead',
  minDepth: 9,
  biomes: ['crypt', 'tundra', 'frostvault', 'foundry'],
  scale: 1.3,
  profile: 'bulwark',
  intro: 'A watchman still walks his round, three hundred years late. He calls the hour, and lowers his halberd.',
  adds: [],
  visual: { body: 'skeleton', palette: 'steel.watch|0x6a6a70', ornate: 0.5, eyes: 2, weapon: 'spear', glow: 0x80c0ff },
  phases: [
    { atLife: 1.0, name: 'The Round', abilities: ['impale', 'shield_bash', 'sunder_armor'], bark: 'Halt. State your business. Too late.' },
  ],
});

// --- tiers 10 and down ------------------------------------------------------

warden({
  id: 'warden_selk',
  name: 'Selk',
  title: 'the Glass Moth',
  family: 'aberration',
  minDepth: 11,
  biomes: ['voidspire', 'sunkenTemple', 'frostvault'],
  scale: 1.6,
  profile: 'glass',
  intro: 'Wings like stained windows open in the dark. Every pane has an eye in it.',
  adds: [],
  visual: { body: 'winged', palette: 'glass.moth|0x9ad8e8', ornate: 0.6, eyes: 6, wings: true, glow: 0x9ad8ff },
  phases: [
    { atLife: 1.0, name: 'Flutter', abilities: ['shock_bolt', 'blink_away', 'gaze_beam'], bark: '' },
  ],
});

warden({
  id: 'warden_tamsin',
  name: 'Tamsin Coil',
  title: 'the Rope-Dancer',
  family: 'humanoid',
  minDepth: 12,
  biomes: ['desert', 'ashwaste', 'hell', 'caverns'],
  scale: 1.0,
  profile: 'duelist',
  intro: 'She drops from the rafters on a rope, already spinning, blades out.',
  adds: [],
  visual: { body: 'humanoid', palette: 'cloth.dancer|0x8a2a2a', ornate: 0.4, eyes: 2, weapon: 'dagger' },
  phases: [
    { atLife: 1.0, name: 'The Swing', abilities: ['whirlwind', 'ambush_leap', 'flesh_hooks'], bark: 'Catch me. Go on.' },
  ],
});

warden({
  id: 'warden_brother_ash',
  name: 'Brother Ash',
  title: 'the Censer-Bearer',
  family: 'humanoid',
  minDepth: 14,
  biomes: ['ashwaste', 'hell', 'foundry', 'desertTomb'],
  scale: 1.2,
  profile: 'glass',
  intro: 'A monk swings a censer the size of a bell. The smoke that pours from it is hot.',
  adds: [],
  visual: { body: 'humanoid', palette: 'cloth.monk|0x6a3a1a', ornate: 0.55, eyes: 2, weapon: 'mace', glow: 0xff7a30 },
  phases: [
    { atLife: 1.0, name: 'Incense', abilities: ['flame_wave', 'fire_bolt', 'lava_pool'], bark: 'Breathe deep, sinner.' },
  ],
});

warden({
  id: 'warden_maudry',
  name: 'Maudry',
  title: 'the Hedge-Crone',
  family: 'plant',
  minDepth: 16,
  biomes: ['darkForest', 'swamp', 'tundra'],
  scale: 1.35,
  profile: 'swarm',
  intro: 'An old woman made of bramble pulls herself out of the hedge, thorns first.',
  adds: ['thorn_creeper', 'strangler_vine'],
  visual: { body: 'humanoid', palette: 'bark.hedge|0x3a4a22', ornate: 0.4, eyes: 2, glow: 0x9aff60 },
  phases: [
    { atLife: 1.0, name: 'Overgrowth', abilities: ['thorn_lash', 'root_snare', 'summon_adds'], bark: 'Stay. Grow roots.' },
  ],
});

warden({
  id: 'warden_orrin_vael',
  name: 'Orrin Vael',
  title: 'the Frost-Fletcher',
  family: 'elemental',
  minDepth: 18,
  biomes: ['frostvault', 'tundra', 'voidspire'],
  scale: 1.15,
  profile: 'glass',
  intro: 'An archer of blue ice nocks an arrow that is also ice. The air between you freezes.',
  adds: [],
  visual: { body: 'humanoid', palette: 'ice.fletcher|0xa8d8f0', ornate: 0.5, eyes: 2, weapon: 'bow', glow: 0x80d0ff },
  phases: [
    { atLife: 1.0, name: 'Volley', abilities: ['arrow_volley', 'piercing_shot', 'ice_nova'], bark: 'Hold still. It stings less.' },
  ],
});

warden({
  id: 'warden_cog',
  name: 'Cog-Abbess Wren',
  title: 'of the Ticking Cloister',
  family: 'construct',
  minDepth: 21,
  biomes: ['foundry', 'voidspire', 'desertTomb'],
  scale: 1.5,
  profile: 'bulwark',
  intro: 'A nun of brass and springs sets down her prayer wheel and winds herself up.',
  adds: ['clockwork_sentry'],
  visual: { body: 'armored', palette: 'brass.abbess|0xb08a40', ornate: 0.7, eyes: 2, glow: 0xffd080 },
  phases: [
    { atLife: 1.0, name: 'Wound Tight', abilities: ['arcane_sentry', 'shrapnel_nova', 'shield_self'], bark: 'Tick. Tock. Kneel.' },
  ],
});

warden({
  id: 'warden_hollis',
  name: 'Hollis Grey',
  title: 'the Drowned Ferryman',
  family: 'undead',
  minDepth: 24,
  biomes: ['sunkenTemple', 'swamp', 'frostvault'],
  scale: 1.6,
  profile: 'sponge',
  intro: 'A tall shape poles a boat across dry stone. Water runs off it that is not there.',
  adds: [],
  visual: { body: 'wraith', palette: 'cloth.ferry|0x2a3a44', ornate: 0.4, eyes: 2, weapon: 'staff', glow: 0x60c0d0 },
  phases: [
    { atLife: 1.0, name: 'The Crossing', abilities: ['vortex_pull', 'frozen_pulse', 'life_drain'], bark: 'Fare, please.' },
  ],
});

warden({
  id: 'warden_vey',
  name: 'Vey of the Many Doors',
  title: 'the Lock-Saint',
  family: 'aberration',
  minDepth: 28,
  biomes: ['voidspire', 'hell', 'desertTomb', 'crypt'],
  scale: 1.4,
  profile: 'duelist',
  intro: 'Keys ring on a figure with a keyhole where its face should be. Something behind it is looking out.',
  adds: [],
  visual: { body: 'humanoid', palette: 'iron.lock|0x4a4a52', ornate: 0.65, eyes: 1, weapon: 'sword', glow: 0xc080ff },
  phases: [
    { atLife: 1.0, name: 'Unlocked', abilities: ['teleport_strike', 'void_rift', 'rend'], bark: 'Every door opens. Even you.' },
    { atLife: 0.35, name: 'Locked In', abilities: ['teleport_strike', 'gravity_well', 'double_swipe'], speed: 1.2, bark: 'Now we are shut in together.' },
  ],
});

export const WARDENS: readonly BossDef[] = ALL;

export function getWarden(id: string): BossDef | undefined {
  return ALL.find((w) => w.id === id);
}

/**
 * The warden for a floor, or null. Wardens of the biome and near their tier
 * first; the hero's memory, as for bosses, makes the least-met likelier.
 */
export function pickWarden(
  depth: number,
  biome: string,
  rng: { next(): number },
  memory?: { met: readonly string[]; seen: Readonly<Record<string, number>> } | null,
): BossDef | null {
  const ok = ALL.filter((w) => w.minDepth <= depth);
  if (!ok.length) return null;
  const local = ok.filter((w) => (w.biomes as string[]).includes(biome));
  const from = local.length ? local : ok;
  const seen = memory?.seen ?? {};
  const met = new Set(memory?.met ?? []);
  const weights = from.map((w) => {
    const gap = depth - w.minDepth;
    const near = 1 / (1 + Math.pow(Math.max(0, gap - 4) / 10, 2));
    return near * (met.has(w.id) ? 0.35 : 1) * Math.max(0.2, Math.pow(0.7, seen[w.id] ?? 0));
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < from.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return from[i]!;
  }
  return from[from.length - 1]!;
}

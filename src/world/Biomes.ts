/**
 * SLAY — biome definitions.
 *
 * Each biome is a complete visual identity: fog, ambient, key light, material
 * palette, accent/emissive colour, ceiling treatment, liquid, prop vocabulary
 * and preferred layouts. The rule of thumb applied here is *a screenshot with
 * no UI must be unambiguous* — crypt cannot be mistaken for frostvault, hive
 * cannot be mistaken for foundry. That means each one commits hard to a hue
 * pair (cool ambient vs warm accent, or the inverse) rather than drifting
 * toward the same grey-brown mush.
 *
 * `BiomeDef` is the contract type consumed by everyone. `BiomeArt` is the
 * extended, world-owned config that the dungeon builder and prop placer read.
 */

import type { BiomeDef, BiomeId, LayoutKind, MonsterFamily, Rng } from '../types';

// ---------------------------------------------------------------------------
// Extended art configuration
// ---------------------------------------------------------------------------

export type CeilingMode =
  /** Solid vaulted ceiling over every floor tile. */
  | 'vault'
  /** Ceiling with gaps — light shafts pour through. */
  | 'broken'
  /** No ceiling; the sky/void dome is visible. */
  | 'open';

export type LiquidKind = 'none' | 'water' | 'lava' | 'sludge' | 'ice' | 'voidwater';

export interface FloorVariant {
  palette: string;
  weight: number;
  /** Texture repeat multiplier. */
  repeat?: number;
  tint?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

export interface BiomeArt {
  id: BiomeId;
  /** World-unit wall height. */
  wallHeight: number;
  ceiling: CeilingMode;
  ceilingHeight: number;
  /** Chance a given ceiling tile is missing, for 'broken'. */
  ceilingHoles: number;
  /** Colour of the void beyond an open ceiling. */
  skyColor: number;
  /** How much the floor undulates, in world units of noise displacement. */
  floorNoise: number;
  floors: FloorVariant[];
  walls: FloorVariant[];
  trim: FloorVariant;
  /** Base course + cornice palette. */
  baseTrim: string;
  liquid: LiquidKind;
  liquidColor: number;
  liquidEmissive: number;
  /** Primary wall-light prop and its spacing in tiles. */
  wallLight: string;
  wallLightSpacing: number;
  /** Colour + reach of a single torch pool. */
  lightColor: number;
  lightIntensity: number;
  lightDistance: number;
  /** Secondary fill light colour used for rim/bounce. */
  bounceColor: number;
  /** Additive light-shaft cones: 0 disables. */
  shaftDensity: number;
  shaftColor: number;
  /** Emissive floor-crack veins (lava, void, ice glow). 0 disables. */
  veinDensity: number;
  veinColor: number;
  /** Weighted prop vocabulary. Keys resolve in Props.ts. */
  props: Array<{ kind: string; weight: number }>;
  /** Props that hug walls rather than sitting in the open. */
  wallProps: Array<{ kind: string; weight: number }>;
  /** Big set-dressing placed at room centres. */
  featureProps: Array<{ kind: string; weight: number }>;
  /** Pillar prop used on room grids, or null for none. */
  pillar: string | null;
  /** How cracked/damaged the floor reads, 0..1. */
  damage: number;
  /** Puddle coverage 0..1 — reflective patches. */
  puddles: number;
  /** Chance a room is a "special" material set. */
  roomMaterialVariance: number;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function def(
  id: BiomeId,
  name: string,
  blurb: string,
  minDepth: number,
  colors: {
    fog: number;
    fogDensity: number;
    ambient: number;
    ambientI: number;
    key: number;
    keyI: number;
    accent: number;
  },
  palettes: { floor: string; wall: string; trim: string },
  layouts: LayoutKind[],
  particles: BiomeDef['particles'],
  families: MonsterFamily[],
  music: string,
): BiomeDef {
  return {
    id,
    name,
    blurb,
    minDepth,
    fogColor: colors.fog,
    fogDensity: colors.fogDensity,
    ambientColor: colors.ambient,
    ambientIntensity: colors.ambientI,
    keyColor: colors.key,
    keyIntensity: colors.keyI,
    floorPalette: palettes.floor,
    wallPalette: palettes.wall,
    trimPalette: palettes.trim,
    accentColor: colors.accent,
    layouts,
    particles,
    families,
    music,
  };
}

// ---------------------------------------------------------------------------
// The eight biomes
// ---------------------------------------------------------------------------

/**
 * CRYPT — the baseline. Near-black cold stone, a single warm torch colour, hard
 * pools of light with a lot of black between them. The contrast between
 * 0xff8a3c fire and 0x2a3a58 ambient is the whole look.
 */
const CRYPT = def(
  'crypt',
  'The Bone Crypt',
  'Grave-cold corridors of stacked stone. Something down here still counts the dead.',
  1,
  {
    fog: 0x090b12,
    fogDensity: 0.036,
    ambient: 0x2e3a56,
    ambientI: 0.5,
    key: 0x8fa4d8,
    keyI: 0.28,
    accent: 0xff8a3c,
  },
  { floor: 'stone.crypt', wall: 'stone.crypt', trim: 'metal.iron' },
  ['rooms', 'catacombs', 'maze'],
  'dust',
  ['undead', 'humanoid', 'aberration'],
  'dirge',
);

/**
 * CAVERNS — wet organic rock. The identity is teal bioluminescence bouncing off
 * damp stone, so the *cool* light is the bright one and the torches are sparse.
 */
const CAVERNS = def(
  'caverns',
  'The Weeping Caverns',
  'Living rock, wet to the touch. The glow comes from things that grow here.',
  3,
  {
    fog: 0x0a1614,
    fogDensity: 0.042,
    ambient: 0x2c5a54,
    ambientI: 0.62,
    key: 0x6fd9c0,
    keyI: 0.34,
    accent: 0x53f0c8,
  },
  { floor: 'stone.cave', wall: 'stone.cave', trim: 'crystal.blue' },
  ['caves', 'ruins', 'caves'],
  'spores',
  ['beast', 'insect', 'ooze', 'plant'],
  'drip',
);

/**
 * FOUNDRY — the hot biome. Black iron and soot, lit almost entirely from below
 * by lava veins and forge glow. Very low ambient; the emissive floor does the
 * work, so bloom carries the whole frame.
 */
const FOUNDRY = def(
  'foundry',
  'The Cinder Foundry',
  'Furnaces that never went out. The floor still runs orange between the plates.',
  8,
  {
    fog: 0x1a0b05,
    fogDensity: 0.05,
    ambient: 0x6a2a10,
    ambientI: 0.45,
    key: 0xffb060,
    keyI: 0.3,
    accent: 0xff5a14,
  },
  { floor: 'metal.iron', wall: 'stone.basalt', trim: 'metal.bronze' },
  ['rooms', 'catacombs', 'ruins'],
  'embers',
  ['construct', 'demon', 'elemental'],
  'forge',
);

/**
 * SUNKEN TEMPLE — flooded gold and jade. Standing water everywhere, so the
 * reflective floor and the caustic-teal fill are the signature. Warm gold trim
 * against cyan water is the colour contract.
 */
const SUNKEN_TEMPLE = def(
  'sunkenTemple',
  'The Sunken Temple',
  'Drowned halls of green stone and tarnished gold. The water remembers the prayers.',
  14,
  {
    fog: 0x04171d,
    fogDensity: 0.046,
    ambient: 0x1d5f6e,
    ambientI: 0.66,
    key: 0x7fe4ff,
    keyI: 0.42,
    accent: 0xffd27a,
  },
  { floor: 'stone.marble', wall: 'stone.sandstone', trim: 'metal.gold' },
  ['rooms', 'spiral', 'catacombs'],
  'bubbles',
  ['aberration', 'humanoid', 'ooze', 'beast'],
  'submerged',
);

/**
 * HIVE — no straight lines. Chitin walls, amber egg-glow from below, sickly
 * violet fog. Reads instantly as *wrong* next to any masonry biome.
 */
const HIVE = def(
  'hive',
  'The Brood Hollow',
  'Walls that flex when you touch them. Everything here is somebody’s larder.',
  20,
  {
    fog: 0x140819,
    fogDensity: 0.055,
    ambient: 0x5a2a6a,
    ambientI: 0.5,
    key: 0xc47dff,
    keyI: 0.3,
    accent: 0xffc23c,
  },
  { floor: 'flesh.chitin', wall: 'flesh.rotted', trim: 'flesh.chitin' },
  ['caves', 'maze', 'caves'],
  'spores',
  ['insect', 'aberration', 'plant', 'ooze'],
  'chitter',
);

/**
 * FROSTVAULT — the bright biome. Pale, high-key, almost white; the danger is
 * that it reads flat, so it leans on strong blue shadows and hard specular ice
 * highlights rather than on darkness.
 */
const FROSTVAULT = def(
  'frostvault',
  'The Frostvault',
  'A tomb sealed in glacier. Your breath freezes before it leaves your teeth.',
  27,
  {
    fog: 0x0f1e2e,
    fogDensity: 0.038,
    ambient: 0x7ea8d8,
    ambientI: 0.85,
    key: 0xd8ecff,
    keyI: 0.6,
    accent: 0x8fd8ff,
  },
  { floor: 'stone.ice', wall: 'crystal.ice', trim: 'metal.steel' },
  ['rooms', 'catacombs', 'spiral'],
  'snow',
  ['elemental', 'beast', 'undead', 'construct'],
  'glacial',
);

/**
 * ASHWASTE — open sky. The only biome with a real horizon: broken ruins under a
 * dull red overcast, long directional shadows, ash falling. It is the "outdoor"
 * beat in the run and exists so the other seven feel enclosed by contrast.
 */
const ASHWASTE = def(
  'ashwaste',
  'The Ashen Waste',
  'Open sky, at last — the colour of a banked fire. Nothing grows in the grey.',
  35,
  {
    fog: 0x2b1a13,
    fogDensity: 0.028,
    ambient: 0x8a5a44,
    ambientI: 0.72,
    key: 0xff8f5a,
    keyI: 0.9,
    accent: 0xff6a2a,
  },
  { floor: 'earth.ash', wall: 'stone.sandstone', trim: 'stone.basalt' },
  ['ruins', 'arena', 'caves'],
  'ash',
  ['demon', 'elemental', 'beast', 'construct'],
  'windswept',
);

/**
 * VOIDSPIRE — the endgame look. Black stone floating in nothing, magenta rim
 * light, no ceiling and no floor beyond the walkway. Almost no ambient: shapes
 * are defined by emissive edges, which is the cheapest way to make a space feel
 * impossible.
 */
const VOIDSPIRE = def(
  'voidspire',
  'The Voidspire',
  'Stone with nothing under it. The dark here is not an absence — it is looking back.',
  45,
  {
    fog: 0x05030d,
    fogDensity: 0.03,
    ambient: 0x3a1c5e,
    ambientI: 0.42,
    key: 0xb060ff,
    keyI: 0.34,
    accent: 0xff3ce0,
  },
  { floor: 'stone.obsidian', wall: 'crystal.void', trim: 'crystal.void' },
  ['spiral', 'arena', 'maze'],
  'void',
  ['aberration', 'demon', 'undead', 'elemental'],
  'null',
);

/** All biomes, ordered by the depth they unlock at. */
export const BIOMES: BiomeDef[] = [
  CRYPT,
  CAVERNS,
  FOUNDRY,
  SUNKEN_TEMPLE,
  HIVE,
  FROSTVAULT,
  ASHWASTE,
  VOIDSPIRE,
];

const BY_ID: Record<BiomeId, BiomeDef> = {
  crypt: CRYPT,
  caverns: CAVERNS,
  foundry: FOUNDRY,
  sunkenTemple: SUNKEN_TEMPLE,
  hive: HIVE,
  frostvault: FROSTVAULT,
  ashwaste: ASHWASTE,
  voidspire: VOIDSPIRE,
};

export function getBiome(id: BiomeId): BiomeDef {
  return BY_ID[id] ?? CRYPT;
}

/**
 * Picks a biome for a depth. Unlocked biomes are weighted toward the ones that
 * came online most recently, so the run keeps drifting into newer territory
 * without ever locking out the earlier looks entirely.
 */
export function biomeForDepth(depth: number, rng: Rng): BiomeId {
  const pool = BIOMES.filter((b) => b.minDepth <= depth);
  if (pool.length === 0) return 'crypt';
  return rng.weighted(pool, (b) => {
    const age = depth - b.minDepth;
    return 1 + Math.max(0, 24 - age) * 0.35;
  }).id;
}

// ---------------------------------------------------------------------------
// Art configuration per biome
// ---------------------------------------------------------------------------

const ART: Record<BiomeId, BiomeArt> = {
  crypt: {
    id: 'crypt',
    wallHeight: 3.6,
    ceiling: 'vault',
    ceilingHeight: 4.1,
    ceilingHoles: 0.03,
    skyColor: 0x05060a,
    floorNoise: 0.015,
    floors: [
      { palette: 'stone.crypt', weight: 6, repeat: 1, roughness: 0.92 },
      { palette: 'stone.granite', weight: 3, repeat: 1.5, tint: 0x9aa0ae },
      { palette: 'stone.marble', weight: 1, repeat: 1, tint: 0x8d8b86 },
    ],
    walls: [
      { palette: 'stone.crypt', weight: 8, repeat: 1 },
      { palette: 'stone.granite', weight: 2, repeat: 1.2, tint: 0x8a8e99 },
    ],
    trim: { palette: 'metal.iron', weight: 1, roughness: 0.6, metalness: 0.7 },
    baseTrim: 'stone.granite',
    liquid: 'water',
    liquidColor: 0x14202a,
    liquidEmissive: 0x000000,
    wallLight: 'torch',
    wallLightSpacing: 7,
    lightColor: 0xff8a3c,
    lightIntensity: 6.5,
    lightDistance: 13,
    bounceColor: 0x3a4a70,
    shaftDensity: 0.1,
    shaftColor: 0xbfd0ff,
    veinDensity: 0,
    veinColor: 0x000000,
    props: [
      { kind: 'sarcophagus', weight: 5 },
      { kind: 'bonepile', weight: 6 },
      { kind: 'barrel', weight: 3 },
      { kind: 'urn', weight: 4 },
      { kind: 'rubblePile', weight: 4 },
      { kind: 'candleCluster', weight: 3 },
      { kind: 'brokenColumn', weight: 3 },
    ],
    wallProps: [
      { kind: 'torch', weight: 10 },
      { kind: 'wallSkull', weight: 3 },
      { kind: 'bookcase', weight: 2 },
      { kind: 'chain', weight: 3 },
      { kind: 'banner', weight: 2 },
    ],
    featureProps: [
      { kind: 'sarcophagus', weight: 5 },
      { kind: 'brazier', weight: 6 },
      { kind: 'altar', weight: 3 },
      { kind: 'statue', weight: 4 },
    ],
    pillar: 'pillarGothic',
    damage: 0.35,
    puddles: 0.1,
    roomMaterialVariance: 0.3,
  },

  caverns: {
    id: 'caverns',
    wallHeight: 4.4,
    ceiling: 'broken',
    ceilingHeight: 5.2,
    ceilingHoles: 0.22,
    skyColor: 0x061010,
    floorNoise: 0.08,
    floors: [
      { palette: 'stone.cave', weight: 8, repeat: 0.8, roughness: 0.96 },
      { palette: 'earth.moss', weight: 3, repeat: 1.2, tint: 0x6f8a5a },
    ],
    walls: [
      { palette: 'stone.cave', weight: 9, repeat: 0.7 },
      { palette: 'crystal.blue', weight: 1, repeat: 1, emissive: 0x1a5a66, emissiveIntensity: 0.6 },
    ],
    trim: { palette: 'crystal.blue', weight: 1, roughness: 0.25 },
    baseTrim: 'stone.cave',
    liquid: 'water',
    liquidColor: 0x0f3a40,
    liquidEmissive: 0x0a2e34,
    wallLight: 'glowShroom',
    wallLightSpacing: 6,
    lightColor: 0x53f0c8,
    lightIntensity: 4.2,
    lightDistance: 11,
    bounceColor: 0x1e5a52,
    shaftDensity: 0.35,
    shaftColor: 0x7fffe0,
    veinDensity: 0.12,
    veinColor: 0x2affc0,
    props: [
      { kind: 'stalagmite', weight: 10 },
      { kind: 'rockCluster', weight: 7 },
      { kind: 'mushroomCluster', weight: 5 },
      { kind: 'bonepile', weight: 2 },
      { kind: 'crystalShard', weight: 4 },
      { kind: 'barrel', weight: 1 },
    ],
    wallProps: [
      { kind: 'glowShroom', weight: 10 },
      { kind: 'rootTangle', weight: 4 },
      { kind: 'crystalShard', weight: 5 },
    ],
    featureProps: [
      { kind: 'crystalCluster', weight: 8 },
      { kind: 'stalagmite', weight: 5 },
      { kind: 'shrine', weight: 2 },
    ],
    pillar: 'stalacColumn',
    damage: 0.15,
    puddles: 0.4,
    roomMaterialVariance: 0.2,
  },

  foundry: {
    id: 'foundry',
    wallHeight: 5.0,
    ceiling: 'broken',
    ceilingHeight: 6.0,
    ceilingHoles: 0.15,
    skyColor: 0x120704,
    floorNoise: 0.01,
    floors: [
      { palette: 'metal.iron', weight: 6, repeat: 1.4, roughness: 0.55, metalness: 0.85 },
      { palette: 'stone.basalt', weight: 4, repeat: 1, tint: 0x4a3830 },
      { palette: 'metal.rust', weight: 3, repeat: 1.2, roughness: 0.8, metalness: 0.5 },
    ],
    walls: [
      { palette: 'stone.basalt', weight: 6, repeat: 1 },
      { palette: 'metal.iron', weight: 4, repeat: 1.2, metalness: 0.8, roughness: 0.5 },
    ],
    trim: { palette: 'metal.bronze', weight: 1, roughness: 0.35, metalness: 0.95 },
    baseTrim: 'metal.rust',
    liquid: 'lava',
    liquidColor: 0xff4a10,
    liquidEmissive: 0xff7a20,
    wallLight: 'forgeSconce',
    wallLightSpacing: 6,
    lightColor: 0xff6a1e,
    lightIntensity: 8.5,
    lightDistance: 15,
    bounceColor: 0x8a2c0a,
    shaftDensity: 0.3,
    shaftColor: 0xff9a50,
    veinDensity: 0.3,
    veinColor: 0xff5a14,
    props: [
      { kind: 'anvil', weight: 6 },
      { kind: 'pipeCluster', weight: 8 },
      { kind: 'crate', weight: 4 },
      { kind: 'barrel', weight: 4 },
      { kind: 'ingotStack', weight: 5 },
      { kind: 'gear', weight: 5 },
      { kind: 'rubblePile', weight: 3 },
    ],
    wallProps: [
      { kind: 'forgeSconce', weight: 10 },
      { kind: 'pipeRun', weight: 8 },
      { kind: 'chain', weight: 5 },
      { kind: 'valveWheel', weight: 4 },
    ],
    featureProps: [
      { kind: 'forge', weight: 8 },
      { kind: 'anvil', weight: 6 },
      { kind: 'brazier', weight: 4 },
      { kind: 'smeltingVat', weight: 5 },
    ],
    pillar: 'pillarIron',
    damage: 0.5,
    puddles: 0.05,
    roomMaterialVariance: 0.4,
  },

  sunkenTemple: {
    id: 'sunkenTemple',
    wallHeight: 5.4,
    ceiling: 'broken',
    ceilingHeight: 6.4,
    ceilingHoles: 0.3,
    skyColor: 0x03181f,
    floorNoise: 0.02,
    floors: [
      { palette: 'stone.marble', weight: 5, repeat: 1, tint: 0x8fae9c, roughness: 0.4 },
      { palette: 'stone.sandstone', weight: 4, repeat: 1.2, tint: 0x9aa88a },
      { palette: 'earth.moss', weight: 3, repeat: 1.4 },
    ],
    walls: [
      { palette: 'stone.sandstone', weight: 6, repeat: 1 },
      { palette: 'stone.marble', weight: 3, repeat: 1, tint: 0x7f9c8c },
    ],
    trim: { palette: 'metal.gold', weight: 1, roughness: 0.28, metalness: 1 },
    baseTrim: 'stone.marble',
    liquid: 'water',
    liquidColor: 0x0d4a56,
    liquidEmissive: 0x0a3a48,
    wallLight: 'templeLantern',
    wallLightSpacing: 8,
    lightColor: 0xffd27a,
    lightIntensity: 5.5,
    lightDistance: 14,
    bounceColor: 0x1a6a78,
    shaftDensity: 0.7,
    shaftColor: 0x9ff0ff,
    veinDensity: 0.05,
    veinColor: 0x50e0ff,
    props: [
      { kind: 'urn', weight: 6 },
      { kind: 'brokenColumn', weight: 7 },
      { kind: 'statue', weight: 5 },
      { kind: 'rubblePile', weight: 4 },
      { kind: 'lilyPad', weight: 4 },
      { kind: 'rootTangle', weight: 3 },
      { kind: 'crate', weight: 2 },
    ],
    wallProps: [
      { kind: 'templeLantern', weight: 10 },
      { kind: 'banner', weight: 4 },
      { kind: 'wallRelief', weight: 6 },
      { kind: 'rootTangle', weight: 4 },
    ],
    featureProps: [
      { kind: 'altar', weight: 7 },
      { kind: 'statue', weight: 7 },
      { kind: 'fountain', weight: 5 },
      { kind: 'shrine', weight: 4 },
    ],
    pillar: 'pillarFluted',
    damage: 0.45,
    puddles: 0.65,
    roomMaterialVariance: 0.35,
  },

  hive: {
    id: 'hive',
    wallHeight: 4.6,
    ceiling: 'vault',
    ceilingHeight: 5.4,
    ceilingHoles: 0.08,
    skyColor: 0x0d0512,
    floorNoise: 0.06,
    floors: [
      { palette: 'flesh.chitin', weight: 6, repeat: 1.1, roughness: 0.45 },
      { palette: 'flesh.rotted', weight: 4, repeat: 0.9 },
    ],
    walls: [
      { palette: 'flesh.rotted', weight: 7, repeat: 0.8 },
      { palette: 'flesh.chitin', weight: 4, repeat: 1, roughness: 0.35 },
    ],
    trim: { palette: 'flesh.chitin', weight: 1, roughness: 0.3 },
    baseTrim: 'flesh.rotted',
    liquid: 'sludge',
    liquidColor: 0x3a5a12,
    liquidEmissive: 0x2a4a08,
    wallLight: 'eggSac',
    wallLightSpacing: 5,
    lightColor: 0xffc23c,
    lightIntensity: 4.8,
    lightDistance: 10,
    bounceColor: 0x6a2a7a,
    shaftDensity: 0.12,
    shaftColor: 0xd08aff,
    veinDensity: 0.35,
    veinColor: 0xffb02a,
    props: [
      { kind: 'eggSac', weight: 9 },
      { kind: 'webClump', weight: 8 },
      { kind: 'chitinSpike', weight: 7 },
      { kind: 'cocoon', weight: 6 },
      { kind: 'bonepile', weight: 4 },
      { kind: 'fleshGrowth', weight: 5 },
    ],
    wallProps: [
      { kind: 'eggSac', weight: 10 },
      { kind: 'webSheet', weight: 9 },
      { kind: 'cocoon', weight: 6 },
      { kind: 'chitinSpike', weight: 5 },
    ],
    featureProps: [
      { kind: 'broodMound', weight: 8 },
      { kind: 'eggSac', weight: 6 },
      { kind: 'shrine', weight: 2 },
    ],
    pillar: 'chitinColumn',
    damage: 0.2,
    puddles: 0.25,
    roomMaterialVariance: 0.15,
  },

  frostvault: {
    id: 'frostvault',
    wallHeight: 4.8,
    ceiling: 'vault',
    ceilingHeight: 5.6,
    ceilingHoles: 0.06,
    skyColor: 0x0a1420,
    floorNoise: 0.03,
    floors: [
      { palette: 'stone.ice', weight: 6, repeat: 1, roughness: 0.12, metalness: 0.1 },
      { palette: 'stone.granite', weight: 4, repeat: 1.2, tint: 0xa8bccc },
      { palette: 'crystal.ice', weight: 2, repeat: 0.9, roughness: 0.05 },
    ],
    walls: [
      { palette: 'crystal.ice', weight: 5, repeat: 0.9, roughness: 0.15 },
      { palette: 'stone.granite', weight: 5, repeat: 1, tint: 0x93aec4 },
    ],
    trim: { palette: 'metal.steel', weight: 1, roughness: 0.3, metalness: 0.9 },
    baseTrim: 'stone.granite',
    liquid: 'ice',
    liquidColor: 0x7fd0f0,
    liquidEmissive: 0x2a6a90,
    wallLight: 'iceLantern',
    wallLightSpacing: 8,
    lightColor: 0x9fdcff,
    lightIntensity: 5.0,
    lightDistance: 14,
    bounceColor: 0x6a9ad0,
    shaftDensity: 0.5,
    shaftColor: 0xd8f0ff,
    veinDensity: 0.18,
    veinColor: 0x6fd8ff,
    props: [
      { kind: 'iceShard', weight: 10 },
      { kind: 'frozenCorpse', weight: 5 },
      { kind: 'crate', weight: 3 },
      { kind: 'sarcophagus', weight: 4 },
      { kind: 'rubblePile', weight: 3 },
      { kind: 'crystalShard', weight: 5 },
    ],
    wallProps: [
      { kind: 'iceLantern', weight: 10 },
      { kind: 'icicleRow', weight: 9 },
      { kind: 'chain', weight: 3 },
      { kind: 'banner', weight: 2 },
    ],
    featureProps: [
      { kind: 'iceMonolith', weight: 8 },
      { kind: 'sarcophagus', weight: 5 },
      { kind: 'shrine', weight: 3 },
      { kind: 'brazier', weight: 3 },
    ],
    pillar: 'pillarIce',
    damage: 0.25,
    puddles: 0.3,
    roomMaterialVariance: 0.3,
  },

  ashwaste: {
    id: 'ashwaste',
    wallHeight: 4.2,
    ceiling: 'open',
    ceilingHeight: 0,
    ceilingHoles: 1,
    skyColor: 0x4a2418,
    floorNoise: 0.09,
    floors: [
      { palette: 'earth.ash', weight: 8, repeat: 1.6, roughness: 0.98 },
      { palette: 'stone.basalt', weight: 4, repeat: 1.1 },
      { palette: 'stone.sandstone', weight: 3, repeat: 1.2, tint: 0x8a7060 },
    ],
    walls: [
      { palette: 'stone.sandstone', weight: 6, repeat: 1, tint: 0x8f7a68 },
      { palette: 'stone.basalt', weight: 4, repeat: 1 },
    ],
    trim: { palette: 'stone.basalt', weight: 1, roughness: 0.8 },
    baseTrim: 'stone.sandstone',
    liquid: 'lava',
    liquidColor: 0xd8400c,
    liquidEmissive: 0xff6a20,
    wallLight: 'brazier',
    wallLightSpacing: 10,
    lightColor: 0xff8f4a,
    lightIntensity: 6.0,
    lightDistance: 13,
    bounceColor: 0x8a5a3a,
    shaftDensity: 0,
    shaftColor: 0xffb070,
    veinDensity: 0.1,
    veinColor: 0xff5a1a,
    props: [
      { kind: 'brokenColumn', weight: 8 },
      { kind: 'rubblePile', weight: 10 },
      { kind: 'deadTree', weight: 6 },
      { kind: 'boneSpire', weight: 5 },
      { kind: 'statue', weight: 3 },
      { kind: 'crate', weight: 2 },
      { kind: 'rockCluster', weight: 6 },
    ],
    wallProps: [
      { kind: 'brazier', weight: 8 },
      { kind: 'banner', weight: 5 },
      { kind: 'wallRelief', weight: 3 },
    ],
    featureProps: [
      { kind: 'obelisk', weight: 8 },
      { kind: 'brazier', weight: 6 },
      { kind: 'altar', weight: 4 },
      { kind: 'deadTree', weight: 5 },
    ],
    pillar: 'pillarBroken',
    damage: 0.75,
    puddles: 0.02,
    roomMaterialVariance: 0.35,
  },

  voidspire: {
    id: 'voidspire',
    wallHeight: 5.2,
    ceiling: 'open',
    ceilingHeight: 0,
    ceilingHoles: 1,
    skyColor: 0x04020a,
    floorNoise: 0.01,
    floors: [
      { palette: 'stone.obsidian', weight: 7, repeat: 1, roughness: 0.22, metalness: 0.35 },
      { palette: 'crystal.void', weight: 3, repeat: 0.9, roughness: 0.15 },
    ],
    walls: [
      { palette: 'stone.obsidian', weight: 6, repeat: 1 },
      { palette: 'crystal.void', weight: 4, repeat: 0.8 },
    ],
    trim: { palette: 'crystal.void', weight: 1, roughness: 0.1 },
    baseTrim: 'stone.obsidian',
    liquid: 'voidwater',
    liquidColor: 0x2a0a4a,
    liquidEmissive: 0x6a10c0,
    wallLight: 'voidFlame',
    wallLightSpacing: 7,
    lightColor: 0xff3ce0,
    lightIntensity: 6.2,
    lightDistance: 13,
    bounceColor: 0x5a1a8a,
    shaftDensity: 0.45,
    shaftColor: 0xc060ff,
    veinDensity: 0.4,
    veinColor: 0xd040ff,
    props: [
      { kind: 'voidShard', weight: 10 },
      { kind: 'floatingStone', weight: 7 },
      { kind: 'obelisk', weight: 5 },
      { kind: 'runeStone', weight: 6 },
      { kind: 'bonepile', weight: 3 },
      { kind: 'crystalShard', weight: 5 },
    ],
    wallProps: [
      { kind: 'voidFlame', weight: 10 },
      { kind: 'runeStone', weight: 6 },
      { kind: 'chain', weight: 3 },
    ],
    featureProps: [
      { kind: 'voidRift', weight: 9 },
      { kind: 'obelisk', weight: 6 },
      { kind: 'altar', weight: 4 },
    ],
    pillar: 'pillarVoid',
    damage: 0.3,
    puddles: 0.08,
    roomMaterialVariance: 0.25,
  },
};

export function biomeArt(id: BiomeId): BiomeArt {
  return ART[id] ?? ART.crypt;
}

/** Weighted layout choice honouring the biome's preferences. */
export function layoutForBiome(biome: BiomeDef, rng: Rng, depth: number): LayoutKind {
  const pool = biome.layouts.length > 0 ? biome.layouts : (['rooms'] as LayoutKind[]);
  // Deeper runs skew toward the harsher shapes in the biome's list.
  const bias = Math.min(0.5, depth / 120);
  return rng.weighted(pool, (k) => {
    const idx = pool.indexOf(k);
    return 1 + idx * bias * 2;
  });
}

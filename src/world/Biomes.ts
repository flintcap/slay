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
import type { GradeProfile } from '../core/Renderer';

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

/** How a biome's walls are built: dressed stone with plinth, cornice and piers, or raw rock. */
export type WallKit = 'masonry' | 'rough';

export interface BiomeArt {
  id: BiomeId;
  /** Wall construction. Defaults by biome (caves, hives and ice are rough). */
  wallKit?: WallKit;
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
  /**
   * The hero piece for a big room (11x11 and up), stood on an inlaid floor
   * seal. Falls back to `featureProps` when absent.
   */
  landmarks?: Array<{ kind: string; weight: number }>;
  /**
   * Ground detail: grit, chips, drifts, growth. Scattered far more densely than
   * clutter because none of it blocks, collides or casts a shadow. This is the
   * layer that stops a floor reading as a plane with objects on it.
   */
  detailProps: Array<{ kind: string; weight: number }>;
  /** Pillar prop used on room grids, or null for none. */
  pillar: string | null;
  /** How cracked/damaged the floor reads, 0..1. */
  damage: number;
  /** Puddle coverage 0..1 — reflective patches. */
  puddles: number;
  /** Chance a room is a "special" material set. */
  roomMaterialVariance: number;
  /**
   * Colour of the dirt that settles in corners and along wall feet, and the
   * hue stains lean toward. Defaults to a neutral soot brown.
   */
  grime?: number;
  /** 0..1 how damp the stone reads: darker, glossier patches. Defaults from `puddles`. */
  wetness?: number;
  /** 0..1 strength of world-scale light/dark patches on floors and walls. */
  surfaceVariation?: number;
  /**
   * The biome's colour grade. Each one commits to a shadow hue and a highlight
   * hue, the same contract the lighting makes, so the grade pushes the mood
   * the lights set up instead of fighting it. Fields left out take the house
   * grade in `Renderer.DEFAULT_GRADE`.
   */
  grade?: Partial<GradeProfile>;
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
  'The Ossuary Tiers',
  'Grave-cold corridors of stacked stone. Something down here still counts the dead.',
  1,
  {
    fog: 0x090b12,
    fogDensity: 0.027,
    ambient: 0x2e3a56,
    ambientI: 0.72,
    key: 0x8fa4d8,
    keyI: 0.28,
    accent: 0xff8a3c,
  },
  { floor: 'stone.crypt', wall: 'stone.crypt', trim: 'metal.iron' },
  ['crypt', 'keep'],
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
  'The Root Deeps',
  'Living rock, wet to the touch. The glow comes from things that grow here.',
  1,
  {
    fog: 0x0a1614,
    fogDensity: 0.031,
    ambient: 0x2c5a54,
    ambientI: 0.86,
    key: 0x6fd9c0,
    keyI: 0.34,
    accent: 0x53f0c8,
  },
  { floor: 'stone.cave', wall: 'stone.cave', trim: 'crystal.gem' },
  ['cave'],
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
  'The Cindergate Works',
  'Furnaces that never went out. The floor still runs orange between the plates.',
  2,
  {
    fog: 0x1a0b05,
    fogDensity: 0.037,
    ambient: 0x6a2a10,
    ambientI: 0.66,
    key: 0xffb060,
    keyI: 0.3,
    accent: 0xff5a14,
  },
  { floor: 'metal.iron', wall: 'stone.foundry', trim: 'metal.bronze' },
  ['keep'],
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
  'The Drowned Sanctum',
  'Drowned halls of green stone and tarnished gold. The water remembers the prayers.',
  3,
  {
    fog: 0x04171d,
    fogDensity: 0.034,
    ambient: 0x1d5f6e,
    ambientI: 0.9,
    key: 0x7fe4ff,
    keyI: 0.42,
    accent: 0xffd27a,
  },
  { floor: 'stone.marble', wall: 'stone.sunken', trim: 'metal.gold' },
  ['keep'],
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
  'The Chitin Warrens',
  "Walls that flex when you touch them. Everything here is somebody's larder.",
  5,
  {
    fog: 0x140819,
    fogDensity: 0.04,
    ambient: 0x5a2a6a,
    ambientI: 0.72,
    key: 0xc47dff,
    keyI: 0.3,
    accent: 0xffc23c,
  },
  { floor: 'flesh.chitin', wall: 'flesh.rotted', trim: 'flesh.chitin' },
  ['cave'],
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
  'The Rime Archive',
  'Galleries sealed in ice, and everything on the shelves kept. Your breath freezes before it leaves your teeth.',
  7,
  {
    fog: 0x0f1e2e,
    fogDensity: 0.029,
    ambient: 0x7ea8d8,
    ambientI: 1.05,
    key: 0xd8ecff,
    keyI: 0.6,
    accent: 0x8fd8ff,
  },
  { floor: 'stone.ice', wall: 'crystal.ice', trim: 'metal.steel' },
  ['cave', 'keep'],
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
  'The Cinderfields',
  'A sky at last, or something wearing one, the colour of a banked fire. Nothing grows in the grey.',
  10,
  {
    fog: 0x2b1a13,
    fogDensity: 0.022,
    // Grey ash under a red sky: the sky does the red, the ground stays grey.
    // A red ambient and an orange key made floor, walls and monsters one hue.
    ambient: 0x6f6460,
    ambientI: 0.95,
    key: 0xffb48a,
    keyI: 0.9,
    accent: 0xff6a2a,
  },
  { floor: 'earth.ash', wall: 'stone.sunken', trim: 'stone.foundry' },
  ['wastes'],
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
  'The Hollow Spire',
  'Stone with nothing under it. The dark here is not an absence. It is looking back.',
  14,
  {
    fog: 0x05030d,
    fogDensity: 0.023,
    ambient: 0x3a1c5e,
    ambientI: 0.62,
    key: 0xb060ff,
    keyI: 0.34,
    accent: 0xff3ce0,
  },
  { floor: 'stone.obsidian', wall: 'crystal.void', trim: 'crystal.void' },
  ['rift'],
  'void',
  ['aberration', 'demon', 'undead', 'elemental'],
  'null',
);

// ---------------------------------------------------------------------------
// The map remake's biomes (docs/remake/maps.md). Gameplay fields are maps'.
// The colour fields are a first pass for ground to replace; until ground
// writes their `ART`, `biomeArt` lends each the look in `LOOK_FALLBACK`.
// ---------------------------------------------------------------------------

/** DARK FOREST — the first ground outside the walls. Moonlight through a canopy, a path the trees did not agree to. */
const DARK_FOREST = def(
  'darkForest',
  'The Blackroot Wood',
  'Old trees with their roots in older graves. The path is the only thing here that was made for you.',
  1,
  { fog: 0x0a110c, fogDensity: 0.03, ambient: 0x2c3e34, ambientI: 0.72, key: 0x9fb4cc, keyI: 0.5, accent: 0xff9a4a },
  { floor: 'stone.cave', wall: 'stone.cave', trim: 'crystal.gem' },
  ['forest'],
  'spores',
  ['beast', 'plant', 'humanoid', 'undead'],
  'darkForest',
);

/** SWAMP — black water, dead trees, boardwalks somebody keeps mending. */
const SWAMP = def(
  'swamp',
  'The Gallows Fen',
  'Black water to the knee, and the knee is the shallow part. They hanged people out here once, to save on rope.',
  2,
  { fog: 0x0c140e, fogDensity: 0.036, ambient: 0x34462e, ambientI: 0.72, key: 0xa8c49a, keyI: 0.36, accent: 0xb8e060 },
  { floor: 'stone.marble', wall: 'stone.sunken', trim: 'metal.gold' },
  ['swamp'],
  'spores',
  ['ooze', 'plant', 'insect', 'undead', 'beast'],
  'swamp',
);

/** DESERT — dunes, wind and the bones of walls. */
const DESERT = def(
  'desert',
  'The Bleached Reach',
  'Sand to the end of sight and walls that used to be a city. The wind has been taking it apart for a thousand years.',
  3,
  { fog: 0x2a2014, fogDensity: 0.02, ambient: 0x6a5a44, ambientI: 0.9, key: 0xffd8a0, keyI: 1.0, accent: 0xff9a3a },
  { floor: 'earth.ash', wall: 'stone.sunken', trim: 'stone.foundry' },
  ['dunes'],
  'dust',
  ['beast', 'insect', 'humanoid', 'elemental'],
  'desert',
);

/** DESERT TOMB — the city went under the sand, and the dead went with it. */
const DESERT_TOMB = def(
  'desertTomb',
  'The Sand-Kings’ Tombs',
  'Corridors cut for kings, and the kings still in them. The sand has got in everywhere except the coffins.',
  3,
  { fog: 0x140e08, fogDensity: 0.03, ambient: 0x4a3a28, ambientI: 0.7, key: 0xd8b880, keyI: 0.3, accent: 0xffa040 },
  { floor: 'stone.crypt', wall: 'stone.crypt', trim: 'metal.gold' },
  ['tomb'],
  'dust',
  ['undead', 'construct', 'insect'],
  'desertTomb',
);

/** TUNDRA — frozen highlands under a white sky, cliffs and dead camps. */
const TUNDRA = def(
  'tundra',
  'The Frostmarch',
  'High ground under a sky the colour of a blade. The snow keeps everything that falls in it, and a great deal has.',
  6,
  { fog: 0x1c2632, fogDensity: 0.026, ambient: 0x6a84a4, ambientI: 0.95, key: 0xdfeaff, keyI: 0.8, accent: 0xffa860 },
  { floor: 'stone.ice', wall: 'crystal.ice', trim: 'metal.steel' },
  ['tundra'],
  'snow',
  ['beast', 'elemental', 'undead', 'humanoid'],
  'tundra',
);

/** HELL — black rock, rivers of fire, a sky lit from underneath. */
const HELL = def(
  'hell',
  'The Burning Steppe',
  'The ground is a crust over fire, and in places it gave up pretending. Everything here was made to hurt, and is proud of it.',
  10,
  { fog: 0x1e0805, fogDensity: 0.03, ambient: 0x5a2010, ambientI: 0.7, key: 0xff8a50, keyI: 0.7, accent: 0xff4a10 },
  { floor: 'stone.obsidian', wall: 'stone.foundry', trim: 'metal.iron' },
  ['wastes'],
  'embers',
  ['demon', 'elemental', 'undead'],
  'hell',
);

/** Biomes with open sky. */
const OUTDOOR = new Set<BiomeId>(['darkForest', 'swamp', 'desert', 'tundra', 'ashwaste', 'hell']);

/** All biomes, ordered by the depth they unlock at. */
export const BIOMES: BiomeDef[] = [
  CRYPT,
  CAVERNS,
  DARK_FOREST,
  FOUNDRY,
  SWAMP,
  SUNKEN_TEMPLE,
  DESERT,
  DESERT_TOMB,
  HIVE,
  TUNDRA,
  FROSTVAULT,
  ASHWASTE,
  HELL,
  VOIDSPIRE,
];
for (const b of BIOMES) b.outdoor = OUTDOOR.has(b.id);

const BY_ID: Record<BiomeId, BiomeDef> = {
  crypt: CRYPT,
  caverns: CAVERNS,
  foundry: FOUNDRY,
  sunkenTemple: SUNKEN_TEMPLE,
  hive: HIVE,
  frostvault: FROSTVAULT,
  ashwaste: ASHWASTE,
  voidspire: VOIDSPIRE,
  darkForest: DARK_FOREST,
  swamp: SWAMP,
  desert: DESERT,
  desertTomb: DESERT_TOMB,
  tundra: TUNDRA,
  hell: HELL,
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

/**
 * The old biome whose art a new biome borrows until ground writes its own
 * (maps -> ground contract). Outdoor borrowers also lose the roof.
 */
const LOOK_FALLBACK: Partial<Record<BiomeId, BiomeId>> = {
  darkForest: 'caverns',
  swamp: 'sunkenTemple',
  desert: 'ashwaste',
  desertTomb: 'crypt',
  tundra: 'frostvault',
  hell: 'foundry',
};

const ART: Partial<Record<BiomeId, BiomeArt>> = {
  crypt: {
    id: 'crypt',
    landmarks: [{ kind: 'ossuary', weight: 5 }, { kind: 'statue', weight: 3 }, { kind: 'altar', weight: 2 }],
    grade: { contrast: 1.1, saturation: 0.96, shadowTint: 0x5a78a8, highlightTint: 0xffc890, splitTone: 0.45, vignette: 0.5, vignetteTint: 0x6a7a9a },
    grime: 0x2b2620,
    wetness: 0.22,
    surfaceVariation: 0.8,
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
    detailProps: [{ kind: 'boneChips', weight: 7 }, { kind: 'pebbles', weight: 6 }, { kind: 'ashDrift', weight: 3 }, { kind: 'mossPatch', weight: 2 }],
    pillar: 'pillarGothic',
    damage: 0.35,
    puddles: 0.1,
    roomMaterialVariance: 0.3,
  },

  caverns: {
    id: 'caverns',
    landmarks: [{ kind: 'crystalCluster', weight: 6 }, { kind: 'shrine', weight: 1 }],
    grade: { contrast: 1.06, saturation: 1.05, shadowTint: 0x3f8f88, highlightTint: 0xd8ffe8, splitTone: 0.42, vignette: 0.48, vignetteTint: 0x4a7a76, bloomStrength: 0.72, bloomThreshold: 0.86 },
    grime: 0x1e2a22,
    wetness: 0.55,
    surfaceVariation: 0.9,
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
      { palette: 'crystal.gem', weight: 1, repeat: 1, emissive: 0x1a5a66, emissiveIntensity: 0.6 },
    ],
    trim: { palette: 'crystal.gem', weight: 1, roughness: 0.25 },
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
    detailProps: [{ kind: 'pebbles', weight: 7 }, { kind: 'mossPatch', weight: 6 }, { kind: 'sporeTuft', weight: 5 }, { kind: 'grassTuft', weight: 3 }],
    pillar: 'stalacColumn',
    damage: 0.15,
    puddles: 0.4,
    roomMaterialVariance: 0.2,
  },

  foundry: {
    id: 'foundry',
    landmarks: [{ kind: 'forge', weight: 5 }, { kind: 'smeltingVat', weight: 4 }],
    // Cool shadows against the furnace light. Warm on warm (the first grade)
    // turned every surface the same red and the frame lost its depth.
    grade: { contrast: 1.12, saturation: 0.98, shadowTint: 0x4a5874, highlightTint: 0xffb060, splitTone: 0.42, vignette: 0.52, vignetteTint: 0x6a4030, lift: [0.008, 0.005, 0.006], bloomStrength: 0.75, bloomRadius: 0.6, bloomThreshold: 0.86 },
    grime: 0x17110d,
    wetness: 0.04,
    surfaceVariation: 1.0,
    wallHeight: 5.0,
    ceiling: 'broken',
    ceilingHeight: 6.0,
    ceilingHoles: 0.15,
    skyColor: 0x120704,
    floorNoise: 0.01,
    // Iron at roughness 0.55 / 0.5 glittered under the furnace lights (w10,
    // w11: sparkle over the floor round the hero and a white hot spot on an
    // iron wall). Matte enough to read as worked metal without the glitter.
    floors: [
      { palette: 'metal.iron', weight: 6, repeat: 1.4, roughness: 0.95, metalness: 0.65 },
      { palette: 'stone.foundry', weight: 4, repeat: 1, tint: 0x4a3830 },
      { palette: 'metal.rust', weight: 3, repeat: 1.2, roughness: 0.85, metalness: 0.12 },
    ],
    walls: [
      { palette: 'stone.foundry', weight: 6, repeat: 1 },
      { palette: 'metal.iron', weight: 4, repeat: 1.2, metalness: 0.6, roughness: 0.95 },
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
    detailProps: [{ kind: 'slagChunk', weight: 8 }, { kind: 'scorchMark', weight: 5 }, { kind: 'pebbles', weight: 4 }, { kind: 'ashDrift', weight: 3 }],
    pillar: 'pillarIron',
    damage: 0.5,
    puddles: 0.05,
    roomMaterialVariance: 0.4,
  },

  sunkenTemple: {
    id: 'sunkenTemple',
    landmarks: [{ kind: 'idolHead', weight: 5 }, { kind: 'fountain', weight: 4 }, { kind: 'statue', weight: 2 }],
    grade: { contrast: 1.06, saturation: 1.06, shadowTint: 0x2f7f8f, highlightTint: 0xffe0a0, splitTone: 0.45, vignette: 0.46, vignetteTint: 0x3a7480, bloomStrength: 0.7, bloomThreshold: 0.88 },
    grime: 0x1f3229,
    wetness: 0.65,
    surfaceVariation: 0.85,
    wallHeight: 5.4,
    ceiling: 'broken',
    ceilingHeight: 6.4,
    ceilingHoles: 0.3,
    skyColor: 0x03181f,
    floorNoise: 0.02,
    floors: [
      { palette: 'stone.marble', weight: 5, repeat: 1, tint: 0x8fae9c, roughness: 0.4 },
      { palette: 'stone.sunken', weight: 4, repeat: 1.2, tint: 0x9aa88a },
      { palette: 'earth.moss', weight: 3, repeat: 1.4 },
    ],
    walls: [
      { palette: 'stone.sunken', weight: 6, repeat: 1 },
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
    detailProps: [{ kind: 'sandDrift', weight: 7 }, { kind: 'mossPatch', weight: 6 }, { kind: 'pebbles', weight: 5 }, { kind: 'shellFragment', weight: 3 }],
    pillar: 'pillarFluted',
    damage: 0.45,
    puddles: 0.65,
    roomMaterialVariance: 0.35,
  },

  hive: {
    id: 'hive',
    landmarks: [{ kind: 'broodMound', weight: 6 }],
    grade: { contrast: 1.1, saturation: 1.1, shadowTint: 0x6a3f8a, highlightTint: 0xffd070, splitTone: 0.5, vignette: 0.55, vignetteTint: 0x6a3a6a, bloomStrength: 0.72 },
    grime: 0x2c1a26,
    wetness: 0.45,
    surfaceVariation: 0.9,
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
    detailProps: [{ kind: 'shellFragment', weight: 8 }, { kind: 'sporeTuft', weight: 5 }, { kind: 'mossPatch', weight: 4 }, { kind: 'boneChips', weight: 3 }],
    pillar: 'chitinColumn',
    damage: 0.2,
    puddles: 0.25,
    roomMaterialVariance: 0.15,
  },

  frostvault: {
    id: 'frostvault',
    landmarks: [{ kind: 'iceMonolith', weight: 5 }, { kind: 'statue', weight: 2 }],
    grade: { exposure: 0.96, contrast: 1.08, saturation: 0.9, shadowTint: 0x5f8fd0, highlightTint: 0xf0f8ff, splitTone: 0.5, vignette: 0.4, vignetteTint: 0x6a8ab0, bloomStrength: 0.55, bloomThreshold: 1.0 },
    grime: 0x34465a,
    wetness: 0.3,
    surfaceVariation: 0.6,
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
    detailProps: [{ kind: 'iceCrust', weight: 8 }, { kind: 'pebbles', weight: 5 }, { kind: 'boneChips', weight: 3 }, { kind: 'sandDrift', weight: 2 }],
    pillar: 'pillarIce',
    damage: 0.25,
    puddles: 0.3,
    roomMaterialVariance: 0.3,
  },

  ashwaste: {
    id: 'ashwaste',
    landmarks: [{ kind: 'obelisk', weight: 4 }, { kind: 'statue', weight: 2 }],
    // Cool, ashen shadows under a hot sky. Warm on warm rendered the whole
    // frame one red, floor, walls and monsters alike.
    grade: { contrast: 1.12, saturation: 0.8, shadowTint: 0x585a66, highlightTint: 0xffa070, splitTone: 0.42, vignette: 0.5, vignetteTint: 0x4a3a34, lift: [0.01, 0.009, 0.009] },
    grime: 0x2a2420,
    wetness: 0.0,
    surfaceVariation: 0.95,
    wallHeight: 4.2,
    ceiling: 'open',
    ceilingHeight: 0,
    ceilingHoles: 1,
    skyColor: 0x4a2418,
    floorNoise: 0.09,
    floors: [
      { palette: 'earth.ash', weight: 8, repeat: 1.6, roughness: 0.98 },
      { palette: 'stone.foundry', weight: 4, repeat: 1.1 },
      { palette: 'stone.sunken', weight: 3, repeat: 1.2, tint: 0x8a7060 },
    ],
    walls: [
      { palette: 'stone.sunken', weight: 6, repeat: 1, tint: 0x8f7a68 },
      { palette: 'stone.foundry', weight: 4, repeat: 1 },
    ],
    trim: { palette: 'stone.foundry', weight: 1, roughness: 0.8 },
    baseTrim: 'stone.sunken',
    liquid: 'lava',
    liquidColor: 0xd8400c,
    liquidEmissive: 0xff6a20,
    wallLight: 'brazier',
    wallLightSpacing: 10,
    lightColor: 0xff8f4a,
    lightIntensity: 6.0,
    lightDistance: 13,
    bounceColor: 0x5e544e,
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
    detailProps: [{ kind: 'ashDrift', weight: 8 }, { kind: 'scorchMark', weight: 6 }, { kind: 'boneChips', weight: 5 }, { kind: 'pebbles', weight: 4 }],
    pillar: 'pillarBroken',
    damage: 0.75,
    puddles: 0.02,
    roomMaterialVariance: 0.35,
  },

  voidspire: {
    id: 'voidspire',
    landmarks: [{ kind: 'voidRift', weight: 4 }, { kind: 'obelisk', weight: 3 }],
    grade: { contrast: 1.14, saturation: 1.12, shadowTint: 0x4a2a8a, highlightTint: 0xff8ae0, splitTone: 0.5, vignette: 0.58, vignetteTint: 0x3a2060, bloomStrength: 0.8, bloomThreshold: 0.82 },
    grime: 0x1a1028,
    wetness: 0.12,
    surfaceVariation: 0.7,
    wallHeight: 5.2,
    ceiling: 'open',
    ceilingHeight: 0,
    ceilingHoles: 1,
    skyColor: 0x04020a,
    floorNoise: 0.01,
    // Glossy crystal floors turned the w14 vault into a loud electric-blue
    // ripple that out-shouted the fight. Duller and a shade darker, so the
    // monsters and the hero sit on it rather than in it.
    floors: [
      // The void palettes glow in every crack (emissive 0.35 and 0.9): over
      // a whole floor that was the w15 electric ripple. A faint glow only.
      { palette: 'stone.obsidian', weight: 7, repeat: 1, roughness: 0.5, metalness: 0.2, emissiveIntensity: 0.08 },
      { palette: 'crystal.void', weight: 3, repeat: 0.9, roughness: 0.6, tint: 0x9a92b0, emissiveIntensity: 0.15 },
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
    detailProps: [{ kind: 'voidMote', weight: 7 }, { kind: 'pebbles', weight: 5 }, { kind: 'ashDrift', weight: 3 }, { kind: 'boneChips', weight: 2 }],
    pillar: 'pillarVoid',
    damage: 0.3,
    puddles: 0.08,
    roomMaterialVariance: 0.25,
  },
};

// ---------------------------------------------------------------------------
// Variants — the same place, in a different state
// ---------------------------------------------------------------------------

/**
 * A dressed sub-version of a biome.
 *
 * Eight biomes is not eight looks when a run only ever sees one of them, and
 * two crypt runs in a row were identical down to the palette. A variant is a
 * patch laid over the biome's own art: different light, different water,
 * different clutter, sometimes a different ceiling. It is chosen once per run,
 * so a descent stays coherent while two descents into the same biome do not
 * look like the same descent.
 *
 * Deliberately not a new biome. The families, the layouts and the monster pool
 * are the biome's identity and stay put; only the dressing moves.
 */
export interface BiomeVariant {
  id: string;
  /** Replaces the biome name on the depth card when present. */
  name: string;
  blurb: string;
  weight: number;
  /** Variants can be held back so shallow floors stay legible. */
  minDepth?: number;
  patch: Partial<BiomeArt>;
}

/** The unmodified biome, so "no variant" is a real weighted option. */
const PLAIN = (name: string, blurb: string, weight = 6): BiomeVariant => ({
  id: 'plain',
  name,
  blurb,
  weight,
  patch: {},
});

const VARIANTS: Partial<Record<BiomeId, BiomeVariant[]>> = {
  crypt: [
    PLAIN('The Ossuary Tiers', 'Grave-cold corridors of stacked stone.'),
    {
      id: 'flooded',
      name: 'The Drowned Crypt',
      blurb: 'The water table rose a century ago and never went back down.',
      weight: 4,
      patch: {
        grade: { contrast: 1.08, saturation: 0.98, shadowTint: 0x3f7f88, highlightTint: 0xc8f0e8, splitTone: 0.45, vignette: 0.5, vignetteTint: 0x3a6a70 },
        liquid: 'water',
        liquidColor: 0x16323c,
        puddles: 0.7,
        wetness: 0.6,
        lightColor: 0x6fd0c4,
        lightIntensity: 5.2,
        bounceColor: 0x2a5a62,
        damage: 0.55,
        veinDensity: 0.05,
        veinColor: 0x3fa89a,
      },
    },
    {
      id: 'candlelit',
      name: 'The Vigil',
      blurb: 'Somebody is still lighting the candles. Nobody has seen them do it.',
      weight: 3,
      minDepth: 2,
      patch: {
        grade: { contrast: 1.08, saturation: 1.02, shadowTint: 0x6a6090, highlightTint: 0xffc070, splitTone: 0.5, vignette: 0.52, vignetteTint: 0x5a4a6a, bloomStrength: 0.75 },
        lightColor: 0xffc46a,
        lightIntensity: 8.4,
        lightDistance: 16,
        wallLightSpacing: 4,
        bounceColor: 0x6a4a2a,
        shaftDensity: 0.3,
        puddles: 0,
        damage: 0.15,
      },
    },
  ],

  caverns: [
    PLAIN('The Root Deeps', 'Living rock, wet to the touch.'),
    {
      id: 'fungal',
      name: 'The Bloom',
      blurb: 'The glow is thicker here, and it moves when you are not looking.',
      weight: 4,
      patch: {
        lightColor: 0x8affc0,
        lightIntensity: 6.0,
        bounceColor: 0x2f7a52,
        veinDensity: 0.5,
        veinColor: 0x9dffb4,
        shaftDensity: 0.05,
        puddles: 0.4,
      },
    },
    {
      id: 'dry',
      name: 'The Dust Hollows',
      blurb: 'Something drank this cave dry. The stone remembers being wet.',
      weight: 3,
      minDepth: 3,
      patch: {
        grade: { contrast: 1.08, saturation: 0.94, shadowTint: 0x6a5a4a, highlightTint: 0xffc890, splitTone: 0.4, vignette: 0.48, vignetteTint: 0x5a4a3a },
        liquid: 'none',
        puddles: 0,
        veinDensity: 0.02,
        lightColor: 0xffb070,
        bounceColor: 0x5a4030,
        shaftDensity: 0.45,
        damage: 0.6,
      },
    },
  ],

  foundry: [
    PLAIN('The Cindergate Works', 'Heat with nowhere to go, and machines that never stopped.'),
    {
      id: 'coldforge',
      name: 'The Cold Forge',
      blurb: 'The fires went out. Whatever they were feeding did not.',
      weight: 4,
      minDepth: 3,
      patch: {
        grade: { contrast: 1.1, saturation: 0.92, shadowTint: 0x4a6a9a, highlightTint: 0xd8e8ff, splitTone: 0.45, vignette: 0.5, vignetteTint: 0x4a5a7a },
        liquid: 'none',
        lightColor: 0x9fc4ff,
        lightIntensity: 4.0,
        bounceColor: 0x2a3550,
        veinDensity: 0,
        shaftDensity: 0.35,
        damage: 0.65,
        puddles: 0.25,
      },
    },
    {
      id: 'overflow',
      name: 'The Overflow',
      blurb: 'A crucible cracked upstairs. It has been draining down here ever since.',
      weight: 4,
      patch: {
        liquid: 'lava',
        liquidEmissive: 0xff6a20,
        lightColor: 0xff7a2c,
        lightIntensity: 8.0,
        bounceColor: 0x7a3010,
        veinDensity: 0.45,
        veinColor: 0xff8a3c,
        shaftDensity: 0.05,
      },
    },
  ],

  sunkenTemple: [
    PLAIN('The Drowned Sanctum', 'Worship that outlasted its worshippers.'),
    {
      id: 'tidal',
      name: 'The Tidal Reach',
      blurb: 'The water goes out and comes back. Nothing here agrees on when.',
      weight: 4,
      patch: {
        liquid: 'water',
        liquidColor: 0x0f3a4a,
        puddles: 0.8,
        lightColor: 0x5fc8ff,
        lightIntensity: 5.0,
        bounceColor: 0x1a5a78,
        damage: 0.5,
      },
    },
    {
      id: 'gilded',
      name: 'The Gilded Sanctum',
      blurb: 'Gold does not tarnish. It has had a long time to prove it.',
      weight: 3,
      minDepth: 5,
      patch: {
        lightColor: 0xffd88a,
        lightIntensity: 7.6,
        lightDistance: 15,
        bounceColor: 0x7a5a20,
        shaftDensity: 0.4,
        damage: 0.1,
        roomMaterialVariance: 0.6,
      },
    },
  ],

  hive: [
    PLAIN('The Chitin Warrens', 'Chambers chewed out of the rock, still warm.'),
    {
      id: 'brood',
      name: 'The Brood Chambers',
      blurb: 'Every surface is a nursery. Try not to stand still.',
      weight: 4,
      patch: {
        lightColor: 0xffc86a,
        lightIntensity: 4.6,
        bounceColor: 0x6a4a1a,
        veinDensity: 0.4,
        veinColor: 0xffd070,
        puddles: 0.5,
        damage: 0.25,
      },
    },
    {
      id: 'abandoned',
      name: 'The Dead Hive',
      blurb: 'The colony moved on. Something moved in behind it.',
      weight: 3,
      minDepth: 8,
      patch: {
        grade: { contrast: 1.08, saturation: 0.9, shadowTint: 0x4a5a8a, highlightTint: 0xc8d0ff, splitTone: 0.42, vignette: 0.52, vignetteTint: 0x3a3a5a },
        lightColor: 0x8f9fd0,
        lightIntensity: 3.4,
        bounceColor: 0x2a3048,
        veinDensity: 0.05,
        shaftDensity: 0.4,
        damage: 0.7,
        puddles: 0.1,
      },
    },
  ],

  frostvault: [
    PLAIN('The Rime Archive', 'Cold enough that the air hurts, and nothing rots.'),
    {
      id: 'blizzard',
      name: 'The Whiteout',
      blurb: 'There is weather down here. Nobody can explain it and nobody stays to try.',
      weight: 4,
      patch: {
        lightColor: 0xdcefff,
        lightIntensity: 5.6,
        lightDistance: 9,
        bounceColor: 0x3a5a80,
        shaftDensity: 0.6,
        veinDensity: 0.1,
        veinColor: 0xaad8ff,
      },
    },
    {
      id: 'thaw',
      name: 'The Slow Thaw',
      blurb: 'Something warm is buried down here, and the ice is losing.',
      weight: 3,
      minDepth: 10,
      patch: {
        liquid: 'water',
        liquidColor: 0x1a4050,
        puddles: 0.85,
        lightColor: 0x9fd8e8,
        lightIntensity: 4.6,
        bounceColor: 0x2a5060,
        damage: 0.6,
      },
    },
  ],

  ashwaste: [
    PLAIN('The Cinderfields', 'Open ground under a sky that is not a sky.'),
    {
      id: 'emberfall',
      name: 'The Emberfall',
      blurb: 'It is raining, and the rain is still burning when it lands.',
      weight: 4,
      patch: {
        lightColor: 0xff8a3c,
        lightIntensity: 7.2,
        bounceColor: 0x7a3512,
        veinDensity: 0.5,
        veinColor: 0xff9a4a,
        shaftDensity: 0.15,
        damage: 0.6,
      },
    },
    {
      id: 'grey',
      name: 'The Grey Waste',
      blurb: 'The fires here went out a very long time ago. It is worse.',
      weight: 3,
      minDepth: 14,
      patch: {
        liquid: 'none',
        lightColor: 0xa8a2a0,
        lightIntensity: 4.2,
        bounceColor: 0x3a3634,
        veinDensity: 0,
        shaftDensity: 0.5,
        damage: 0.75,
      },
    },
  ],

  voidspire: [
    PLAIN('The Hollow Spire', 'Stone with nothing under it.'),
    {
      id: 'unravelled',
      name: 'The Unravelling',
      blurb: 'The geometry stopped agreeing with itself somewhere above you.',
      weight: 4,
      patch: {
        lightColor: 0xc07aff,
        lightIntensity: 6.4,
        bounceColor: 0x4a2a7a,
        veinDensity: 0.55,
        veinColor: 0xc07aff,
        shaftDensity: 0.3,
      },
    },
    {
      id: 'starlit',
      name: 'The Long Dark',
      blurb: 'There are lights out there. They are not stars and they are not far away.',
      weight: 3,
      minDepth: 18,
      patch: {
        lightColor: 0x6fa8ff,
        lightIntensity: 3.6,
        lightDistance: 10,
        bounceColor: 0x1a2a5a,
        veinDensity: 0.2,
        veinColor: 0x8fc0ff,
        shaftDensity: 0.7,
        damage: 0.5,
      },
    },
  ],
};

/** Every variant a biome can wear, for tooling and the bestiary. */
export function biomeVariants(id: BiomeId): BiomeVariant[] {
  return VARIANTS[id] ?? [];
}

/** Rolls the variant a run wears. Held back by depth where the variant says so. */
export function pickVariant(id: BiomeId, depth: number, rng: Rng): string {
  const pool = (VARIANTS[id] ?? []).filter((v) => (v.minDepth ?? 0) <= depth);
  if (pool.length === 0) return 'plain';
  return rng.weighted(pool, (v) => v.weight).id;
}

/** The name and one-liner the depth card shows for this run. */
export function variantLabel(id: BiomeId, variant?: string): { name: string; blurb: string } {
  const v = (VARIANTS[id] ?? []).find((x) => x.id === variant);
  const b = getBiome(id);
  return v ? { name: v.name, blurb: v.blurb } : { name: b.name, blurb: b.blurb };
}

/**
 * The art for a biome, with a variant's patch laid over it.
 *
 * A shallow merge is the right depth here: every field a variant wants to
 * change is a scalar or a whole list it means to replace outright, and a deep
 * merge of the prop tables would silently blend two sets of clutter.
 */
export function biomeArt(id: BiomeId, variant?: string): BiomeArt {
  const base = ownArt(id);
  if (!variant || variant === 'plain') return base;
  const v = (VARIANTS[id] ?? []).find((x) => x.id === variant);
  if (!v) return base;
  return { ...base, ...v.patch };
}

// ---------------------------------------------------------------------------
// The map remake's biomes. Outdoor ground, edges and their dressing come from
// `Terrain.ts`; these entries carry the rest: ruins (walls), lights, props,
// liquid and grade. Each starts from its closest old look.
// ---------------------------------------------------------------------------

const W = (kind: string, weight: number): { kind: string; weight: number } => ({ kind, weight });

ART.darkForest = {
  ...ART.caverns!,
  id: 'darkForest',
  wallKit: 'masonry',
  ceiling: 'open',
  ceilingHeight: 0,
  ceilingHoles: 0,
  skyColor: 0x070b10,
  grime: 0x16140e,
  wetness: 0.3,
  surfaceVariation: 0.9,
  wallHeight: 2.6,
  floors: [{ palette: 'ground.leaves', weight: 1 }],
  walls: [{ palette: 'tex.mossy_wall', weight: 1, tint: 0x8a8a80 }],
  trim: { palette: 'tex.mossy_wall', weight: 1, tint: 0x7a7a70 },
  baseTrim: 'tex.mossy_wall',
  liquid: 'water',
  liquidColor: 0x0a1612,
  liquidEmissive: 0x000000,
  wallLight: 'glowShroom',
  wallLightSpacing: 14,
  lightColor: 0xffa860,
  lightIntensity: 4.5,
  lightDistance: 12,
  bounceColor: 0x1a2418,
  shaftDensity: 0.25,
  shaftColor: 0xa8c0e0,
  veinDensity: 0,
  props: [W('rockCluster', 8), W('mushroomCluster', 7), W('rootTangle', 6), W('deadTree', 4), W('bonepile', 2), W('runeStone', 1)],
  wallProps: [W('rootTangle', 8), W('mushroomCluster', 6), W('rockCluster', 5)],
  featureProps: [W('runeStone', 4), W('rockCluster', 5), W('deadTree', 4), W('shrine', 2)],
  landmarks: [W('runeStone', 5), W('shrine', 2), W('statue', 2)],
  detailProps: [W('mossPatch', 7), W('grassTuft', 7), W('pebbles', 5), W('sporeTuft', 3)],
  pillar: null,
  damage: 0.2,
  puddles: 0.15,
  grade: { contrast: 1.1, saturation: 0.82, shadowTint: 0x2a4a5a, highlightTint: 0xd8e0c8, splitTone: 0.5, vignette: 0.58, vignetteTint: 0x0a1418 },
};

ART.swamp = {
  ...ART.sunkenTemple!,
  id: 'swamp',
  wallKit: 'masonry',
  ceiling: 'open',
  ceilingHeight: 0,
  ceilingHoles: 0,
  skyColor: 0x0a100c,
  grime: 0x12160c,
  wetness: 0.75,
  surfaceVariation: 0.9,
  wallHeight: 2.4,
  floors: [{ palette: 'ground.mud', weight: 1 }],
  walls: [{ palette: 'tex.mossy_wall', weight: 1, tint: 0x7a8070 }],
  trim: { palette: 'tex.mossy_wall', weight: 1, tint: 0x6a7060 },
  baseTrim: 'tex.mossy_wall',
  liquid: 'sludge',
  liquidColor: 0x1a2412,
  liquidEmissive: 0x000000,
  wallLight: 'glowShroom',
  wallLightSpacing: 14,
  lightColor: 0xc8e070,
  lightIntensity: 3.8,
  lightDistance: 11,
  bounceColor: 0x223018,
  shaftDensity: 0,
  veinDensity: 0,
  props: [W('deadTree', 8), W('rootTangle', 7), W('mushroomCluster', 5), W('bonepile', 3), W('lilyPad', 4), W('rockCluster', 3)],
  wallProps: [W('rootTangle', 8), W('deadTree', 4), W('mushroomCluster', 4)],
  featureProps: [W('deadTree', 6), W('runeStone', 2), W('shrine', 2)],
  landmarks: [W('runeStone', 3), W('statue', 2), W('shrine', 2)],
  detailProps: [W('mossPatch', 8), W('grassTuft', 6), W('sporeTuft', 4), W('pebbles', 3)],
  pillar: null,
  damage: 0.2,
  puddles: 0.45,
  grade: { contrast: 1.08, saturation: 0.78, shadowTint: 0x2a3a22, highlightTint: 0xd8e0a0, splitTone: 0.5, vignette: 0.6, vignetteTint: 0x10180c },
};

ART.desert = {
  ...ART.ashwaste!,
  id: 'desert',
  wallKit: 'masonry',
  ceiling: 'open',
  ceilingHeight: 0,
  ceilingHoles: 0,
  skyColor: 0x3a2a1a,
  grime: 0x4a3420,
  wetness: 0,
  surfaceVariation: 0.95,
  wallHeight: 2.8,
  floors: [{ palette: 'ground.sand', weight: 1 }],
  walls: [{ palette: 'stone.temple', weight: 1 }],
  trim: { palette: 'stone.temple', weight: 1, tint: 0xd0c0a8 },
  baseTrim: 'stone.temple',
  liquid: 'none',
  liquidColor: 0x2a3a40,
  liquidEmissive: 0x000000,
  wallLight: 'brazier',
  wallLightSpacing: 16,
  lightColor: 0xffb060,
  lightIntensity: 4.5,
  lightDistance: 12,
  bounceColor: 0x6a4a2a,
  shaftDensity: 0,
  veinDensity: 0,
  props: [W('rockCluster', 9), W('brokenColumn', 6), W('bonepile', 4), W('rubblePile', 5), W('urn', 2), W('obelisk', 1)],
  wallProps: [W('rockCluster', 8), W('brokenColumn', 4), W('rubblePile', 4)],
  featureProps: [W('obelisk', 5), W('brokenColumn', 5), W('statue', 3), W('altar', 2)],
  landmarks: [W('obelisk', 5), W('statue', 3)],
  detailProps: [W('pebbles', 7), W('boneChips', 3), W('scorchMark', 2)],
  pillar: null,
  damage: 0.3,
  puddles: 0,
  grade: { contrast: 1.12, saturation: 0.8, shadowTint: 0x4a4a6a, highlightTint: 0xffdcb0, splitTone: 0.48, vignette: 0.48, vignetteTint: 0x3a2818, haze: 0.8 },
};

ART.tundra = {
  ...ART.frostvault!,
  id: 'tundra',
  wallKit: 'masonry',
  ceiling: 'open',
  ceilingHeight: 0,
  ceilingHoles: 0,
  skyColor: 0x101820,
  grime: 0x2a3440,
  wetness: 0.1,
  surfaceVariation: 0.85,
  wallHeight: 2.8,
  floors: [{ palette: 'ground.snow', weight: 1 }],
  walls: [{ palette: 'stone.frost', weight: 1 }],
  trim: { palette: 'stone.frost', weight: 1 },
  baseTrim: 'stone.frost',
  liquid: 'water',
  liquidColor: 0x1a3040,
  liquidEmissive: 0x000000,
  wallLight: 'iceLantern',
  wallLightSpacing: 16,
  shaftDensity: 0,
  veinDensity: 0,
  props: [W('iceShard', 8), W('rockCluster', 8), W('frozenCorpse', 3), W('deadTree', 4), W('bonepile', 2)],
  wallProps: [W('iceShard', 7), W('rockCluster', 6)],
  featureProps: [W('iceMonolith', 5), W('iceShard', 5), W('runeStone', 2)],
  landmarks: [W('iceMonolith', 5), W('statue', 2)],
  detailProps: [W('pebbles', 6), W('boneChips', 2)],
  pillar: null,
  damage: 0.15,
  puddles: 0,
  grade: { contrast: 1.08, saturation: 0.78, shadowTint: 0x3a5a7a, highlightTint: 0xe0f0ff, splitTone: 0.45, vignette: 0.5, vignetteTint: 0x1a2a3a },
};

ART.hell = {
  ...ART.foundry!,
  id: 'hell',
  wallKit: 'masonry',
  ceiling: 'open',
  ceilingHeight: 0,
  ceilingHoles: 0,
  skyColor: 0x2a0806,
  grime: 0x1a0604,
  wetness: 0,
  surfaceVariation: 0.95,
  wallHeight: 3.2,
  floors: [{ palette: 'ground.ash', weight: 1, tint: 0xa07060 }],
  walls: [{ palette: 'stone.void', weight: 1, tint: 0xa08080 }],
  trim: { palette: 'metal.bloodgold', weight: 1 },
  baseTrim: 'stone.ash',
  liquid: 'lava',
  liquidColor: 0xd03008,
  liquidEmissive: 0xff4a10,
  wallLight: 'brazier',
  wallLightSpacing: 12,
  lightColor: 0xff6a30,
  lightIntensity: 6,
  lightDistance: 13,
  bounceColor: 0x5a1a10,
  shaftDensity: 0,
  veinDensity: 0.14,
  veinColor: 0xff4a10,
  props: [W('boneSpire', 7), W('rockCluster', 7), W('bonepile', 6), W('obelisk', 2), W('fleshGrowth', 3), W('brazier', 2)],
  wallProps: [W('boneSpire', 6), W('rockCluster', 6), W('brazier', 3)],
  featureProps: [W('obelisk', 5), W('boneSpire', 5), W('altar', 3), W('brazier', 4)],
  landmarks: [W('obelisk', 5), W('altar', 3)],
  detailProps: [W('ashDrift', 7), W('scorchMark', 6), W('boneChips', 5)],
  pillar: null,
  damage: 0.35,
  puddles: 0,
  grade: { contrast: 1.16, saturation: 0.92, shadowTint: 0x3a1a2a, highlightTint: 0xffa060, splitTone: 0.5, vignette: 0.56, vignetteTint: 0x2a0604, haze: 0.45 },
};

ART.desertTomb = {
  ...ART.crypt!,
  id: 'desertTomb',
  wallKit: 'masonry',
  grime: 0x3a2818,
  wetness: 0,
  surfaceVariation: 0.85,
  wallHeight: 4.2,
  ceiling: 'vault',
  ceilingHeight: 4.8,
  floors: [
    { palette: 'tex.tiles_worn', weight: 6, tint: 0xc8b090 },
    { palette: 'stone.temple', weight: 3 },
  ],
  walls: [
    { palette: 'stone.temple', weight: 8 },
    { palette: 'tex.plaster', weight: 3, tint: 0xd8c0a0 },
  ],
  trim: { palette: 'stone.temple', weight: 1, tint: 0xb8a080 },
  baseTrim: 'stone.temple',
  liquid: 'none',
  wallLight: 'torch',
  wallLightSpacing: 6,
  lightColor: 0xffa050,
  bounceColor: 0x4a3420,
  props: [W('sarcophagus', 6), W('urn', 8), W('brokenColumn', 5), W('bonepile', 4), W('rubblePile', 4), W('statue', 2), W('chest', 1)],
  wallProps: [W('torch', 8), W('wallRelief', 6), W('urn', 4)],
  featureProps: [W('sarcophagus', 6), W('statue', 4), W('altar', 3), W('obelisk', 2)],
  landmarks: [W('sarcophagus', 4), W('obelisk', 3), W('statue', 3)],
  grade: { contrast: 1.1, saturation: 0.9, shadowTint: 0x4a3a5a, highlightTint: 0xffc080, splitTone: 0.45, vignette: 0.52, vignetteTint: 0x2a1a10 },
};

/** A biome's own art, or the borrowed look of `LOOK_FALLBACK`. */
function ownArt(id: BiomeId): BiomeArt {
  const own = ART[id];
  if (own) return own;
  const from = ART[LOOK_FALLBACK[id] ?? 'crypt'] ?? ART.crypt!;
  return BY_ID[id]?.outdoor ? { ...from, id, ceiling: 'open', ceilingHoles: 0 } : { ...from, id };
}

const ROUGH_DEFAULT = new Set<BiomeId>(['caverns', 'hive', 'frostvault', 'ashwaste', 'darkForest', 'swamp', 'desert', 'tundra', 'hell']);

/** The wall kit a biome's art asks for, or its default. */
export function wallKitOf(art: BiomeArt): WallKit {
  return art.wallKit ?? (ROUGH_DEFAULT.has(art.id) ? 'rough' : 'masonry');
}

/** True for a biome with open sky. */
export function isOutdoorBiome(id: BiomeId): boolean {
  return BY_ID[id]?.outdoor ?? false;
}

/** Weighted layout choice honouring the biome's preferences. */
export function layoutForBiome(biome: BiomeDef, rng: Rng, depth: number): LayoutKind {
  const pool = biome.layouts.length > 0 ? biome.layouts : (['cave'] as LayoutKind[]);
  // The first entry is the biome's signature shape and stays the most common
  // one you meet. Deeper runs shift weight toward the harsher shapes later in
  // the list without ever making the signature rare.
  const bias = Math.min(0.5, depth / 120);
  return rng.weighted(pool, (k) => {
    const idx = pool.indexOf(k);
    return (idx === 0 ? 3 : 1) + idx * bias * 2;
  });
}

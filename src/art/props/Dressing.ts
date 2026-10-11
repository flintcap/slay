/**
 * SLAY — what each biome is dressed with.
 *
 * The placement rules in `world/Props.ts` decide where things go; this file
 * decides what. Every biome (and every biome variant that changes the mood)
 * has one `Dressing`: its lights, its loose clutter, what hangs on its walls,
 * what gathers along an outdoor edge, the hero pieces of its big rooms, the
 * grit on its floor, and which breakables it keeps.
 *
 * Pools are weighted lists of prop kinds from `Defs.ts`. A mixed map asks for
 * the dressing of each tile's own zone, so a crypt zone next to a forest zone
 * keeps its coffins and the forest keeps its stumps.
 */
import type { BiomeId } from '../../types';

/** A weighted list of prop kinds. */
export type Pool = ReadonlyArray<{ kind: string; weight: number }>;

export interface Dressing {
  /** The light mounted along wall runs indoors (and on outdoor ruins). */
  wallLight: string;
  /** Tiles between wall lights along a run. */
  wallLightSpacing: number;
  /** Free-standing lights: the corners of big rooms indoors, the only lights outdoors. */
  standLight: Pool;
  /** Loose floor clutter, clumped on noise and drawn to walls. */
  clutter: Pool;
  /** Mounted on walls (wall placement kinds only). */
  wall: Pool;
  /** Outdoors: what gathers along the edge where the ground rises. */
  edge: Pool;
  /** The centre piece of a mid-sized room. */
  feature: Pool;
  /** The hero piece of a big room, stood on a floor seal. */
  landmark: Pool;
  /** Ground detail: grit, chips, drifts, growth. */
  detail: Pool;
  /** Floats on water. */
  liquid: Pool;
  /** Room-grid pillar indoors, or null for none. */
  pillar: string | null;
  /** The smashable containers this biome keeps, weighted. */
  breakables: Pool;
}

const P = (...pairs: Array<[string, number]>): Pool => pairs.map(([kind, weight]) => ({ kind, weight }));
const NONE: Pool = [];

const CRYPT: Dressing = {
  wallLight: 'torch',
  wallLightSpacing: 7,
  standLight: P(['brazier', 3], ['candelabra', 2]),
  clutter: P(['bonepile', 5], ['coffin', 4], ['sarcophagus', 3], ['rubblePile', 4], ['candleCluster', 3], ['skullPile', 2], ['brokenColumn', 2], ['cage', 1]),
  wall: P(['chain', 4], ['wallSkull', 3], ['banner', 3], ['wallRelief', 2], ['webSheet', 1]),
  edge: P(['rubblePile', 4], ['bonepile', 3], ['brokenColumn', 2]),
  feature: P(['sarcophagus', 5], ['statue', 4], ['brazier', 3], ['altar', 2], ['coffin', 2]),
  landmark: P(['ossuary', 5], ['statue', 3], ['altar', 2], ['fountain', 1]),
  detail: P(['boneChips', 7], ['pebbles', 6], ['ashDrift', 2], ['mossPatch', 2], ['bloodStain', 1]),
  liquid: NONE,
  pillar: 'pillarGothic',
  breakables: P(['urn', 4], ['barrel', 3], ['crate', 2]),
};

const CAVERNS: Dressing = {
  wallLight: 'glowShroom',
  wallLightSpacing: 6,
  standLight: P(['campfire', 2], ['brazier', 1]),
  clutter: P(['rockCluster', 6], ['stalagmite', 5], ['mushroomCluster', 5], ['rubblePile', 3], ['boulder', 3], ['crystalShard', 3], ['bonepile', 2], ['webClump', 1]),
  wall: P(['rootTangle', 5], ['webSheet', 1], ['chain', 1]),
  edge: P(['rockCluster', 5], ['stalagmite', 4], ['boulder', 3]),
  feature: P(['crystalCluster', 4], ['stalagmite', 3], ['boulder', 3], ['mushroomCluster', 3], ['wayShrine', 1]),
  landmark: P(['crystalCluster', 5], ['idolHead', 2], ['runeStone', 2]),
  detail: P(['pebbles', 6], ['mossPatch', 4], ['sporeTuft', 3], ['boneChips', 2]),
  liquid: NONE,
  pillar: 'stalacColumn',
  breakables: P(['crate', 3], ['barrel', 3], ['urn', 1]),
};

const FOUNDRY: Dressing = {
  wallLight: 'forgeSconce',
  wallLightSpacing: 7,
  standLight: P(['brazier', 3]),
  clutter: P(['ingotStack', 4], ['gear', 3], ['pipeCluster', 3], ['rubblePile', 3], ['anvil', 2], ['rockCluster', 1]),
  wall: P(['pipeRun', 5], ['valveWheel', 3], ['chain', 3], ['banner', 1]),
  edge: P(['rubblePile', 3], ['ingotStack', 2], ['gear', 2]),
  feature: P(['forge', 4], ['smeltingVat', 3], ['anvil', 3], ['pipeCluster', 2], ['gear', 2]),
  landmark: P(['forge', 4], ['smeltingVat', 4], ['statue', 1]),
  detail: P(['slagChunk', 5], ['pebbles', 5], ['ashDrift', 4], ['scorchMark', 3]),
  liquid: NONE,
  pillar: 'pillarIron',
  breakables: P(['crate', 4], ['barrel', 3]),
};

const SUNKEN_TEMPLE: Dressing = {
  wallLight: 'templeLantern',
  wallLightSpacing: 7,
  standLight: P(['brazier', 2], ['candelabra', 2]),
  clutter: P(['brokenColumn', 4], ['rubblePile', 4], ['candleCluster', 2], ['rockCluster', 2], ['mushroomCluster', 1], ['bonepile', 1]),
  wall: P(['wallRelief', 5], ['banner', 2], ['chain', 2], ['rootTangle', 2]),
  edge: P(['brokenColumn', 3], ['rubblePile', 3], ['rockCluster', 2]),
  feature: P(['altar', 4], ['statue', 4], ['fountain', 3], ['obelisk', 2], ['idolHead', 2]),
  landmark: P(['idolHead', 4], ['fountain', 3], ['statue', 3], ['altar', 2]),
  detail: P(['mossPatch', 5], ['pebbles', 5], ['shellFragment', 4]),
  liquid: P(['lilyPad', 3]),
  pillar: 'pillarFluted',
  breakables: P(['urn', 5], ['crate', 1]),
};

const HIVE: Dressing = {
  wallLight: 'eggSac',
  wallLightSpacing: 6,
  standLight: NONE,
  clutter: P(['webClump', 5], ['cocoon', 4], ['chitinSpike', 4], ['fleshGrowth', 4], ['bonepile', 3], ['rockCluster', 2]),
  wall: P(['webSheet', 5], ['rootTangle', 2], ['wallSkull', 1]),
  edge: P(['webClump', 4], ['chitinSpike', 3], ['fleshGrowth', 2]),
  feature: P(['broodMound', 4], ['cocoon', 3], ['chitinSpike', 3], ['fleshGrowth', 2]),
  landmark: P(['broodMound', 5], ['chitinSpike', 2]),
  detail: P(['shellFragment', 6], ['sporeTuft', 4], ['boneChips', 3], ['bloodStain', 2]),
  liquid: NONE,
  pillar: 'chitinColumn',
  breakables: P(['crate', 2], ['barrel', 2], ['urn', 1]),
};

const FROSTVAULT: Dressing = {
  wallLight: 'iceLantern',
  wallLightSpacing: 7,
  standLight: P(['brazier', 2]),
  clutter: P(['iceShard', 5], ['frozenCorpse', 3], ['rockCluster', 3], ['crystalShard', 2], ['bonepile', 2], ['rubblePile', 2], ['frozenBanner', 1]),
  wall: P(['icicleRow', 5], ['chain', 2], ['banner', 2], ['wallSkull', 1]),
  edge: P(['iceShard', 4], ['rockCluster', 3], ['boulder', 2]),
  feature: P(['iceMonolith', 4], ['iceShard', 3], ['frozenCorpse', 3], ['statue', 2]),
  landmark: P(['iceMonolith', 5], ['statue', 2], ['crystalCluster', 2]),
  detail: P(['iceCrust', 6], ['pebbles', 4], ['boneChips', 2]),
  liquid: NONE,
  pillar: 'pillarIce',
  breakables: P(['crate', 3], ['barrel', 2], ['urn', 2]),
};

const ASHWASTE: Dressing = {
  wallLight: 'brazier',
  wallLightSpacing: 7,
  standLight: P(['brazier', 4], ['campfire', 2]),
  clutter: P(['rockCluster', 5], ['lavaRock', 4], ['bonepile', 3], ['rubblePile', 3], ['boneSpire', 2], ['spikes', 2], ['brokenColumn', 2], ['impaler', 1]),
  wall: P(['chain', 2], ['wallSkull', 2], ['banner', 1]),
  edge: P(['rockCluster', 5], ['boulder', 4], ['lavaRock', 3], ['boneSpire', 2], ['deadTree', 1]),
  feature: P(['obelisk', 3], ['lavaRock', 3], ['boneSpire', 3], ['impaler', 2], ['altar', 2], ['cage', 1]),
  landmark: P(['obelisk', 4], ['altar', 2], ['idolHead', 1]),
  detail: P(['ashDrift', 7], ['scorchMark', 5], ['slagChunk', 3], ['boneChips', 3]),
  liquid: NONE,
  pillar: 'pillarBroken',
  breakables: P(['urn', 3], ['crate', 2], ['barrel', 1]),
};

const VOIDSPIRE: Dressing = {
  wallLight: 'voidFlame',
  wallLightSpacing: 7,
  standLight: P(['brazier', 1]),
  clutter: P(['voidShard', 4], ['floatingStone', 3], ['rubblePile', 3], ['brokenColumn', 3], ['crystalShard', 2], ['runeStone', 1]),
  wall: P(['banner', 2], ['chain', 2], ['wallRelief', 2]),
  edge: P(['voidShard', 3], ['rubblePile', 3], ['brokenColumn', 2]),
  feature: P(['voidRift', 3], ['obelisk', 3], ['floatingStone', 3], ['runeStone', 2], ['statue', 2]),
  landmark: P(['voidRift', 4], ['obelisk', 3], ['floatingStone', 2]),
  detail: P(['voidMote', 5], ['pebbles', 5], ['ashDrift', 2]),
  liquid: NONE,
  pillar: 'pillarVoid',
  breakables: P(['urn', 3], ['crate', 2]),
};

const DARK_FOREST: Dressing = {
  wallLight: 'torch',
  wallLightSpacing: 8,
  standLight: P(['lanternPost', 3], ['campfire', 3]),
  clutter: P(['fern', 6], ['stump', 4], ['fallenLog', 4], ['thornBush', 4], ['mushroomCluster', 3], ['boulder', 2], ['rockCluster', 2], ['beastSkull', 1], ['bonepile', 1]),
  wall: P(['rootTangle', 3], ['banner', 1]),
  edge: P(['fern', 5], ['thornBush', 4], ['boulder', 3], ['stump', 2], ['deadTree', 2]),
  feature: P(['ruinWall', 3], ['runeStone', 3], ['wayShrine', 3], ['cairn', 2], ['cart', 2], ['tent', 2], ['gibbet', 1]),
  landmark: P(['ruinWall', 3], ['runeStone', 3], ['statue', 2], ['wayShrine', 2], ['cairn', 2]),
  detail: P(['leafLitter', 7], ['grassTuft', 6], ['twigs', 4], ['mossPatch', 3], ['pebbles', 2]),
  liquid: P(['lilyPad', 2]),
  pillar: null,
  breakables: P(['crate', 3], ['barrel', 3]),
};

const SWAMP: Dressing = {
  wallLight: 'torch',
  wallLightSpacing: 8,
  standLight: P(['lanternPost', 4], ['campfire', 1]),
  clutter: P(['reeds', 6], ['mangroveRoots', 4], ['fallenLog', 3], ['stump', 3], ['mushroomCluster', 3], ['fern', 2], ['bonepile', 2], ['beastSkull', 1]),
  wall: P(['rootTangle', 3], ['chain', 1]),
  edge: P(['reeds', 5], ['mangroveRoots', 5], ['deadTree', 3], ['stump', 2]),
  feature: P(['deadTree', 3], ['gibbet', 2], ['cage', 2], ['wayShrine', 2], ['ruinWall', 2], ['cart', 1]),
  landmark: P(['ruinWall', 2], ['runeStone', 2], ['statue', 2], ['wayShrine', 2], ['cairn', 1]),
  detail: P(['mossPatch', 6], ['twigs', 4], ['grassTuft', 4], ['sporeTuft', 3], ['leafLitter', 2]),
  liquid: P(['lilyPad', 5]),
  pillar: null,
  breakables: P(['barrel', 3], ['crate', 2]),
};

const DESERT: Dressing = {
  wallLight: 'torch',
  wallLightSpacing: 8,
  standLight: P(['brazier', 3], ['campfire', 2], ['lanternPost', 1]),
  clutter: P(['rockCluster', 5], ['brokenColumn', 4], ['bonepile', 3], ['beastSkull', 3], ['rubblePile', 3], ['spikes', 1]),
  wall: P(['wallRelief', 3], ['banner', 1]),
  edge: P(['rockCluster', 5], ['boulder', 4], ['brokenColumn', 2], ['beastSkull', 1]),
  feature: P(['obelisk', 3], ['tent', 3], ['ruinWall', 3], ['cart', 2], ['brokenColumn', 2], ['statue', 2], ['cairn', 1]),
  landmark: P(['obelisk', 4], ['statue', 3], ['idolHead', 2], ['ruinWall', 2]),
  detail: P(['sandDrift', 7], ['pebbles', 5], ['boneChips', 3]),
  liquid: NONE,
  pillar: null,
  breakables: P(['urn', 4], ['crate', 1], ['barrel', 1]),
};

const DESERT_TOMB: Dressing = {
  wallLight: 'torch',
  wallLightSpacing: 6,
  standLight: P(['brazier', 3]),
  clutter: P(['sarcophagus', 3], ['brokenColumn', 3], ['bonepile', 3], ['rubblePile', 3], ['coffin', 2], ['candleCluster', 1]),
  wall: P(['wallRelief', 5], ['banner', 2], ['wallSkull', 1]),
  edge: P(['rubblePile', 3], ['brokenColumn', 2]),
  feature: P(['sarcophagus', 5], ['statue', 3], ['altar', 3], ['obelisk', 2], ['idolHead', 1]),
  landmark: P(['sarcophagus', 3], ['obelisk', 3], ['statue', 3], ['idolHead', 2]),
  detail: P(['sandDrift', 6], ['pebbles', 4], ['boneChips', 3]),
  liquid: NONE,
  pillar: 'pillarFluted',
  breakables: P(['urn', 6], ['crate', 1]),
};

const TUNDRA: Dressing = {
  wallLight: 'torch',
  wallLightSpacing: 8,
  standLight: P(['campfire', 3], ['lanternPost', 2], ['brazier', 1]),
  clutter: P(['rockCluster', 5], ['iceShard', 4], ['boulder', 3], ['stump', 2], ['fallenLog', 2], ['frozenCorpse', 2], ['beastSkull', 2], ['frozenBanner', 1]),
  wall: P(['icicleRow', 3], ['banner', 1]),
  edge: P(['boulder', 4], ['rockCluster', 4], ['iceShard', 3], ['deadTree', 2]),
  feature: P(['cairn', 3], ['iceMonolith', 3], ['tent', 2], ['runeStone', 2], ['frozenBanner', 2], ['cart', 1]),
  landmark: P(['iceMonolith', 4], ['cairn', 3], ['statue', 2], ['runeStone', 2]),
  detail: P(['iceCrust', 5], ['pebbles', 5], ['twigs', 2], ['boneChips', 2]),
  liquid: NONE,
  pillar: null,
  breakables: P(['crate', 3], ['barrel', 2]),
};

const HELL: Dressing = {
  wallLight: 'brazier',
  wallLightSpacing: 7,
  standLight: P(['brazier', 4]),
  clutter: P(['bonepile', 4], ['lavaRock', 4], ['boneSpire', 4], ['skullPile', 3], ['spikes', 3], ['impaler', 3], ['fleshGrowth', 2], ['cage', 2]),
  wall: P(['chain', 3], ['wallSkull', 3]),
  edge: P(['lavaRock', 4], ['boneSpire', 4], ['rockCluster', 4], ['impaler', 2]),
  feature: P(['cage', 3], ['impaler', 3], ['gibbet', 2], ['obelisk', 2], ['altar', 2], ['skullPile', 2], ['boneSpire', 2]),
  landmark: P(['obelisk', 4], ['altar', 3], ['idolHead', 2], ['skullPile', 2]),
  detail: P(['ashDrift', 5], ['scorchMark', 5], ['boneChips', 4], ['bloodStain', 3], ['slagChunk', 2]),
  liquid: NONE,
  pillar: null,
  breakables: P(['urn', 3], ['crate', 1]),
};

const BY_BIOME: Record<BiomeId, Dressing> = {
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

/** Variants that change what a biome is dressed with, not only its light. */
const VARIANTS: Partial<Record<BiomeId, Record<string, Partial<Dressing>>>> = {
  crypt: {
    flooded: {
      clutter: P(['coffin', 4], ['bonepile', 4], ['rubblePile', 4], ['mushroomCluster', 2], ['sarcophagus', 2], ['brokenColumn', 2]),
      wall: P(['chain', 5], ['rootTangle', 3], ['wallSkull', 2], ['webSheet', 1]),
      detail: P(['mossPatch', 6], ['pebbles', 5], ['boneChips', 4]),
    },
    candlelit: {
      wallLightSpacing: 4,
      standLight: P(['candelabra', 4], ['brazier', 1]),
      clutter: P(['candleCluster', 6], ['sarcophagus', 3], ['coffin', 3], ['bonepile', 2], ['skullPile', 2]),
      feature: P(['altar', 4], ['sarcophagus', 4], ['statue', 3], ['candelabra', 3]),
    },
  },
  caverns: {
    fungal: {
      clutter: P(['mushroomCluster', 8], ['rockCluster', 4], ['stalagmite', 3], ['fern', 2]),
      feature: P(['mushroomCluster', 4], ['crystalCluster', 3], ['stalagmite', 2]),
      detail: P(['sporeTuft', 6], ['mossPatch', 5], ['pebbles', 3]),
    },
    dry: {
      clutter: P(['rockCluster', 6], ['stalagmite', 5], ['boulder', 4], ['bonepile', 3], ['beastSkull', 2], ['crystalShard', 2]),
      detail: P(['pebbles', 7], ['sandDrift', 3], ['boneChips', 3]),
    },
  },
  foundry: {
    coldforge: {
      standLight: P(['brazier', 1]),
      clutter: P(['ingotStack', 3], ['gear', 4], ['rubblePile', 4], ['anvil', 2], ['pipeCluster', 2], ['webClump', 2]),
      detail: P(['pebbles', 6], ['ashDrift', 4], ['slagChunk', 1]),
    },
    overflow: {
      clutter: P(['lavaRock', 4], ['ingotStack', 3], ['pipeCluster', 3], ['rubblePile', 3], ['gear', 2]),
      detail: P(['slagChunk', 7], ['scorchMark', 5], ['ashDrift', 3]),
    },
  },
  sunkenTemple: {
    tidal: {
      clutter: P(['rubblePile', 4], ['brokenColumn', 3], ['rockCluster', 3], ['reeds', 2], ['mangroveRoots', 1]),
      detail: P(['shellFragment', 6], ['mossPatch', 5], ['pebbles', 3]),
      liquid: P(['lilyPad', 4]),
    },
    gilded: {
      clutter: P(['brokenColumn', 3], ['candleCluster', 3], ['ingotStack', 2], ['rubblePile', 2], ['statue', 1]),
      landmark: P(['idolHead', 4], ['statue', 4], ['fountain', 2]),
    },
  },
  hive: {
    brood: {
      clutter: P(['cocoon', 5], ['fleshGrowth', 5], ['webClump', 4], ['chitinSpike', 3], ['bonepile', 2]),
      feature: P(['broodMound', 6], ['cocoon', 3]),
    },
    abandoned: {
      clutter: P(['webClump', 6], ['chitinSpike', 4], ['bonepile', 4], ['rockCluster', 3], ['cocoon', 2]),
      detail: P(['shellFragment', 7], ['boneChips', 4], ['pebbles', 3]),
    },
  },
  frostvault: {
    blizzard: {
      clutter: P(['iceShard', 6], ['rockCluster', 4], ['frozenCorpse', 3], ['frozenBanner', 2]),
      detail: P(['iceCrust', 8], ['pebbles', 2]),
    },
    thaw: {
      clutter: P(['rockCluster', 5], ['iceShard', 3], ['rubblePile', 3], ['bonepile', 3], ['frozenCorpse', 1]),
      detail: P(['pebbles', 6], ['mossPatch', 3], ['iceCrust', 3]),
    },
  },
  ashwaste: {
    emberfall: {
      detail: P(['scorchMark', 6], ['slagChunk', 5], ['ashDrift', 5]),
    },
    grey: {
      standLight: P(['brazier', 2]),
      clutter: P(['rockCluster', 6], ['bonepile', 4], ['rubblePile', 4], ['brokenColumn', 3], ['boneSpire', 2], ['deadTree', 1]),
      detail: P(['ashDrift', 8], ['pebbles', 4], ['boneChips', 3]),
    },
  },
  voidspire: {
    unravelled: {
      clutter: P(['floatingStone', 5], ['voidShard', 5], ['rubblePile', 3], ['brokenColumn', 2]),
      feature: P(['voidRift', 5], ['floatingStone', 3], ['obelisk', 2]),
    },
    starlit: {
      clutter: P(['brokenColumn', 4], ['runeStone', 3], ['voidShard', 3], ['rubblePile', 3], ['candleCluster', 2]),
    },
  },
};

/** Drops zero-weight entries so a variant can switch a kind off by naming it at 0. */
function live(d: Dressing): Dressing {
  const f = (p: Pool): Pool => p.filter((e) => e.weight > 0);
  return {
    ...d,
    standLight: f(d.standLight),
    clutter: f(d.clutter),
    wall: f(d.wall),
    edge: f(d.edge),
    feature: f(d.feature),
    landmark: f(d.landmark),
    detail: f(d.detail),
    liquid: f(d.liquid),
    breakables: f(d.breakables),
  };
}

const cache = new Map<string, Dressing>();

/** The dressing of a biome, in its variant when the variant changes it. */
export function dressingFor(biome: BiomeId, variant?: string): Dressing {
  const key = `${biome}|${variant ?? ''}`;
  let d = cache.get(key);
  if (!d) {
    const base = BY_BIOME[biome] ?? CRYPT;
    const patch = variant ? VARIANTS[biome]?.[variant] : undefined;
    d = live(patch ? { ...base, ...patch } : base);
    cache.set(key, d);
  }
  return d;
}

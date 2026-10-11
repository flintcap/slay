/**
 * SLAY — what a prop builder is handed: the biome's art, its own seeded
 * stream, the variant index and the biome's prop palette (which stone, wood,
 * iron, cloth and bone a prop of this biome is made of).
 *
 * The palette is how one builder serves fourteen biomes: a sarcophagus in the
 * crypt is grey granite under soot, in the desert tomb it is sun-bleached
 * sandstone, in the swamp it is green-stained and sunk. Builders never name a
 * biome's stone directly; they ask the palette.
 */
import * as THREE from 'three';
import type { BiomeId, Rng } from '../../types';
import type { BiomeArt } from '../../world/Biomes';
import { lathe, merge, shade } from './Kit';
import { propMat, type PropMatOpts } from './PropMats';
import type { PropKit } from './Kit';

export interface PropPalette {
  /** Worked stone: pillars, statues, altars, sarcophagi. */
  stone: string;
  stoneTint?: number;
  /** Raw rock: boulders, rubble, stalagmites. */
  rock: string;
  rockTint?: number;
  /** Timber for posts, frames, furniture. */
  wood: string;
  /** Boards: crates, lids, carts, floors. */
  planks: string;
  /** Living or dead tree bark. */
  bark: string;
  /** Iron for bands, cages, brackets. */
  iron: string;
  /** Fine metal: candlesticks, trims, offerings. */
  fine: string;
  cloth: string;
  clothTint: number;
  bone: string;
  /** Stain the damp, moss, soot or frost lays on everything (mottle tint). */
  stain: number;
  /** How strongly the stain shows, 0..1. */
  stainAmt: number;
  /** Self-lit accent: runes, cracks, crystals. */
  accent: number;
  /** Flame colour for candles and braziers. */
  flame: number;
  /** Plants: leaf/fern/reed colour. */
  leaf: number;
}

const PAL: Record<BiomeId, PropPalette> = {
  crypt: {
    stone: 'stone.crypt', rock: 'stone.crypt', wood: 'prop.timber.dark', planks: 'prop.planks.dark', bark: 'wood.bark',
    iron: 'prop.iron.rust', fine: 'prop.bronze', cloth: 'cloth.tattered', clothTint: 0x5a2622, bone: 'bone.old',
    stain: 0x4a5040, stainAmt: 0.55, accent: 0x9fb8ff, flame: 0xffa040, leaf: 0x4a5236,
  },
  caverns: {
    stone: 'stone.cavern', rock: 'stone.cavern', wood: 'prop.timber', planks: 'prop.planks', bark: 'wood.rotted',
    iron: 'prop.iron.rust', fine: 'prop.bronze', cloth: 'cloth.undyed', clothTint: 0x6a5a48, bone: 'bone.old',
    stain: 0x3e4a32, stainAmt: 0.6, accent: 0x7ad8b0, flame: 0xffa040, leaf: 0x4e5a38,
  },
  foundry: {
    stone: 'stone.foundry', rock: 'stone.foundry', wood: 'prop.timber.charred', planks: 'prop.planks.dark', bark: 'wood.charred',
    iron: 'prop.iron.black', fine: 'prop.bronze', cloth: 'leather.worn', clothTint: 0x4a3a2a, bone: 'bone.old',
    stain: 0x231d18, stainAmt: 0.7, accent: 0xff6a1e, flame: 0xff7a26, leaf: 0x3a3a2a,
  },
  sunkenTemple: {
    stone: 'stone.temple', rock: 'stone.sunken', wood: 'prop.timber.grey', planks: 'prop.planks.grey', bark: 'wood.rotted',
    iron: 'metal.verdigris', fine: 'prop.bronze', cloth: 'cloth.linen', clothTint: 0x3a5a5a, bone: 'bone.pale',
    stain: 0x3c5a48, stainAmt: 0.65, accent: 0x6fd8e8, flame: 0xffc070, leaf: 0x3e5a40,
  },
  hive: {
    stone: 'stone.hive', rock: 'stone.hive', wood: 'prop.timber.dark', planks: 'prop.planks.dark', bark: 'wood.rotted',
    iron: 'prop.iron.rust', fine: 'prop.bronze', cloth: 'flesh.chitin', clothTint: 0x6a5030, bone: 'bone.old',
    stain: 0x5a4826, stainAmt: 0.6, accent: 0xffb02a, flame: 0xffa83a, leaf: 0x5a5030,
  },
  frostvault: {
    stone: 'stone.frost', rock: 'stone.frost', wood: 'prop.timber.grey', planks: 'prop.planks.grey', bark: 'wood.bark',
    iron: 'prop.iron', fine: 'metal.silver', cloth: 'cloth.wool', clothTint: 0x3a4a6a, bone: 'bone.pale',
    stain: 0x8a9aa8, stainAmt: 0.35, accent: 0x8fd4ff, flame: 0xa8d8ff, leaf: 0x5a6a6a,
  },
  ashwaste: {
    stone: 'stone.ash', rock: 'stone.ash', wood: 'prop.timber.charred', planks: 'prop.planks.dark', bark: 'wood.charred',
    iron: 'prop.iron.rust', fine: 'prop.bronze', cloth: 'cloth.tattered', clothTint: 0x4a2a22, bone: 'bone.bleached',
    stain: 0x231d18, stainAmt: 0.65, accent: 0xff5a1a, flame: 0xff8a3c, leaf: 0x3a3228,
  },
  voidspire: {
    stone: 'stone.void', rock: 'stone.void', wood: 'prop.timber.dark', planks: 'prop.planks.dark', bark: 'wood.charred',
    iron: 'prop.iron.black', fine: 'metal.voidgold', cloth: 'cloth.velvet', clothTint: 0x3a2050, bone: 'bone.pale',
    stain: 0x2a2236, stainAmt: 0.5, accent: 0xb050f0, flame: 0xc070ff, leaf: 0x3a3048,
  },
  darkForest: {
    stone: 'stone.granite', stoneTint: 0x8a8a80, rock: 'stone.cavern', wood: 'prop.timber', planks: 'prop.planks', bark: 'wood.bark',
    iron: 'prop.iron.rust', fine: 'prop.bronze', cloth: 'cloth.homespun', clothTint: 0x4a3a2a, bone: 'bone.old',
    stain: 0x45552e, stainAmt: 0.7, accent: 0xffa860, flame: 0xffa050, leaf: 0x46522c,
  },
  swamp: {
    stone: 'stone.sunken', rock: 'stone.cavern', rockTint: 0x7a8070, wood: 'prop.timber.dark', planks: 'prop.planks.dark', bark: 'wood.rotted',
    iron: 'prop.iron.rust', fine: 'prop.bronze', cloth: 'cloth.rags', clothTint: 0x4a4a30, bone: 'bone.rotted',
    stain: 0x3a4a26, stainAmt: 0.8, accent: 0xc8e070, flame: 0xffb050, leaf: 0x48562a,
  },
  desert: {
    stone: 'stone.temple', stoneTint: 0xd8b888, rock: 'stone.temple', rockTint: 0xc8a070, wood: 'prop.timber.pale', planks: 'prop.planks.grey', bark: 'wood.ash',
    iron: 'prop.bronze', fine: 'prop.gold', cloth: 'cloth.linen', clothTint: 0x8a5a38, bone: 'bone.bleached',
    stain: 0x8a6a48, stainAmt: 0.35, accent: 0xffc070, flame: 0xffb060, leaf: 0x6a6a3a,
  },
  desertTomb: {
    stone: 'stone.temple', stoneTint: 0xc8a878, rock: 'stone.temple', rockTint: 0xb89068, wood: 'prop.timber.pale', planks: 'prop.planks.grey', bark: 'wood.ash',
    iron: 'prop.bronze', fine: 'prop.gold', cloth: 'cloth.linen', clothTint: 0x6a3a2a, bone: 'bone.bleached',
    stain: 0x5a4430, stainAmt: 0.45, accent: 0xffc860, flame: 0xffa050, leaf: 0x5a5a32,
  },
  tundra: {
    stone: 'stone.granite', stoneTint: 0x9aa0a8, rock: 'stone.frost', wood: 'prop.timber.grey', planks: 'prop.planks.grey', bark: 'wood.bark',
    iron: 'prop.iron', fine: 'metal.silver', cloth: 'cloth.wool', clothTint: 0x5a2a28, bone: 'bone.pale',
    stain: 0x6a7a88, stainAmt: 0.35, accent: 0x9fdcff, flame: 0xffa860, leaf: 0x4a5448,
  },
  hell: {
    stone: 'stone.obsidian', rock: 'stone.ash', wood: 'prop.timber.charred', planks: 'prop.planks.dark', bark: 'wood.charred',
    iron: 'prop.iron.black', fine: 'metal.bloodgold', cloth: 'flesh.demonic', clothTint: 0x5a2018, bone: 'bone.old',
    stain: 0x2a1410, stainAmt: 0.6, accent: 0xff4a10, flame: 0xff6a30, leaf: 0x3a2018,
  },
};

export function paletteFor(id: BiomeId): PropPalette {
  return PAL[id] ?? PAL.crypt;
}

export interface BuildCtx {
  art: BiomeArt;
  biome: BiomeId;
  rng: Rng;
  variant: number;
  pal: PropPalette;
  /** The biome's own torch colour. */
  glow: number;
  outdoor: boolean;
}

export type Builder = (k: PropKit, c: BuildCtx) => void;

const OUTDOOR = new Set<BiomeId>(['darkForest', 'swamp', 'desert', 'tundra', 'ashwaste', 'hell']);

export function makeCtx(art: BiomeArt, rng: Rng, variant: number): BuildCtx {
  const biome = art.id;
  return { art, biome, rng, variant, pal: paletteFor(biome), glow: art.lightColor, outdoor: OUTDOOR.has(biome) };
}

// ---------------------------------------------------------------------------
// Material shortcuts by palette role
// ---------------------------------------------------------------------------

export const M = {
  stone: (c: BuildCtx, o: PropMatOpts = {}) => propMat(c.pal.stone, { tint: c.pal.stoneTint, ...o }),
  rock: (c: BuildCtx, o: PropMatOpts = {}) => propMat(c.pal.rock, { tint: c.pal.rockTint, ...o }),
  wood: (c: BuildCtx, o: PropMatOpts = {}) => propMat(c.pal.wood, o),
  planks: (c: BuildCtx, o: PropMatOpts = {}) => propMat(c.pal.planks, o),
  bark: (c: BuildCtx, o: PropMatOpts = {}) => propMat(c.pal.bark, o),
  iron: (c: BuildCtx, o: PropMatOpts = {}) => propMat(c.pal.iron, o),
  fine: (c: BuildCtx, o: PropMatOpts = {}) => propMat(c.pal.fine, o),
  cloth: (c: BuildCtx, o: PropMatOpts = {}) => propMat(c.pal.cloth, { tint: c.pal.clothTint, side: THREE.DoubleSide, grime: 0.6, ...o }),
  bone: (c: BuildCtx, o: PropMatOpts = {}) => propMat(c.pal.bone, o),
};

// ---------------------------------------------------------------------------
// Flame bodies (base at y = 0 so the flicker scales them from the wick)
// ---------------------------------------------------------------------------

/** Two crossed teardrops: reads as a flame from any angle. */
export function flameGeo(h: number, r: number, rng: Rng): THREE.BufferGeometry {
  const prof: Array<[number, number]> = [
    [0.0001, 0],
    [r * 0.75, h * 0.12],
    [r, h * 0.3],
    [r * 0.72, h * 0.55],
    [r * 0.3, h * 0.82],
    [0.0001, h],
  ];
  const outer = lathe(prof, 7);
  outer.scale(1, 1, 0.8);
  const inner = lathe(prof.map(([a, b]) => [a * 0.5, b * 0.7] as [number, number]), 6);
  shade(inner, [1.0, 0.95, 0.8]);
  shade(outer, [0.85, 0.7, 0.55]);
  const g = merge([outer, inner]);
  // A slight lean so a row of torches does not burn as one.
  g.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, rng.range(-0.08, 0.08), 0, 0, rng.range(-0.08, 0.08)));
  return g;
}

/** A clump of tongues for braziers and fires. */
export function fireGeo(r: number, h: number, rng: Rng, n = 5): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = i === 0 ? 0 : r * rng.range(0.35, 0.75);
    const f = flameGeo(h * (i === 0 ? 1 : rng.range(0.5, 0.8)), r * rng.range(0.32, 0.45), rng);
    f.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(f);
  }
  return merge(parts);
}

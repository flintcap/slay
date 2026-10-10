/**
 * Light moods: how dark a level is and where its light comes from.
 *
 * The look is Diablo II: the world is mostly black, the hero carries a pool
 * of warm light, torches make their own pools, and the dark between them is
 * tinted (cold in a crypt, red in hell) rather than grey. Outdoors the key
 * light is the sky: moonlight in the forest, a low hard sun in the desert,
 * a pale overcast in the tundra.
 *
 * `applyBiomeLighting` (DungeonBuilder) reads one of these. Indoor levels
 * derive theirs from the biome's own colours; outdoor biomes have a table.
 */
import type { BiomeDef, BiomeId } from '../types';
import type { BiomeArt } from './Biomes';

export interface LightMood {
  /** Hemisphere fill: sky colour, bounce colour and strength. */
  sky: number;
  ground: number;
  fill: number;
  /** The key light (sun or moon outdoors, a dim wash indoors). */
  key: number;
  keyIntensity: number;
  /** Degrees above the horizon, and the compass bearing it shines from. */
  elevation: number;
  azimuth: number;
  /** A second light from below: hell's red glow on every underside. */
  under?: { color: number; intensity: number };
  fog: number;
  fogDensity: number;
  /** Background clear colour. */
  background: number;
  /** The light the hero carries. */
  hero: { color: number; intensity: number; distance: number };
}

/** The indoor hero light: a warm pool about eight metres across. */
const HERO_INDOOR = { color: 0xffd2a0, intensity: 34, distance: 17 };

/** Outdoor moods, by biome. */
const OUTDOOR: Partial<Record<BiomeId, Omit<LightMood, 'background'>>> = {
  // Moonlight through the canopy: blue key, green-black bounce.
  darkForest: {
    sky: 0x34486a, ground: 0x10140c, fill: 0.85,
    key: 0x9cb8ec, keyIntensity: 1.5, elevation: 52, azimuth: 215,
    fog: 0x0a1018, fogDensity: 0.03,
    hero: { color: 0xffc890, intensity: 30, distance: 16 },
  },
  // Overcast and thick: low yellow-green murk.
  swamp: {
    sky: 0x3a4a34, ground: 0x161c0e, fill: 0.95,
    key: 0xb8c89a, keyIntensity: 0.95, elevation: 44, azimuth: 160,
    fog: 0x121a10, fogDensity: 0.04,
    hero: { color: 0xffd09a, intensity: 28, distance: 15 },
  },
  // A low, hard evening sun: long shadows, hot highlights, warm bounce.
  desert: {
    sky: 0x7a8aa8, ground: 0x6a4626, fill: 0.9,
    key: 0xffc890, keyIntensity: 3.4, elevation: 24, azimuth: 290,
    fog: 0x3a2818, fogDensity: 0.016,
    hero: { color: 0xffd8b0, intensity: 14, distance: 12 },
  },
  // Pale overcast: blue everywhere, a weak white sun.
  tundra: {
    sky: 0x6a88b0, ground: 0x3a4a62, fill: 1.0,
    key: 0xdce8ff, keyIntensity: 1.9, elevation: 32, azimuth: 200,
    fog: 0x1a2636, fogDensity: 0.03,
    hero: { color: 0xffd8b0, intensity: 22, distance: 14 },
  },
  // Smoke-dimmed sun over ash.
  ashwaste: {
    sky: 0x5a4a44, ground: 0x4a2414, fill: 0.85,
    key: 0xffb080, keyIntensity: 1.7, elevation: 36, azimuth: 250,
    fog: 0x2a1810, fogDensity: 0.022,
    under: { color: 0xff5a1a, intensity: 0.35 },
    hero: { color: 0xffd0a0, intensity: 24, distance: 15 },
  },
  // No sky to speak of. The light comes up from the lava.
  hell: {
    sky: 0x2a0c0a, ground: 0xc8300c, fill: 0.85,
    key: 0xff7a48, keyIntensity: 0.9, elevation: 48, azimuth: 120,
    fog: 0x260806, fogDensity: 0.03,
    under: { color: 0xff3a10, intensity: 0.9 },
    hero: { color: 0xffc898, intensity: 28, distance: 15 },
  },
};

/** Indoor biomes that want a light from below. */
const INDOOR_UNDER: Partial<Record<BiomeId, { color: number; intensity: number }>> = {
  foundry: { color: 0xff5a1a, intensity: 0.45 },
  hell: { color: 0xff3a10, intensity: 0.6 },
};

/** The light mood for a level of this biome. */
export function lightMood(biome: BiomeDef, art: BiomeArt): LightMood {
  const open = art.ceiling === 'open';
  const out = open ? OUTDOOR[biome.id] : undefined;
  if (out) return { ...out, background: art.skyColor };
  if (open) {
    // An open biome without a table entry: its own colours, a little brighter.
    return {
      sky: biome.ambientColor, ground: art.bounceColor, fill: biome.ambientIntensity * 1.3 + 0.2,
      key: biome.keyColor, keyIntensity: biome.keyIntensity * 1.9 + 0.12, elevation: 45, azimuth: 230,
      fog: biome.fogColor, fogDensity: biome.fogDensity,
      background: art.skyColor,
      hero: { color: 0xffd2a0, intensity: 26, distance: 15 },
    };
  }
  // Indoors: the biome's own tinted dark, kept low so torch pools carry the
  // room. Half the old fill: rooms read in their torchlight and the hero's.
  return {
    sky: biome.ambientColor,
    ground: art.bounceColor,
    fill: biome.ambientIntensity * 1.15 + 0.12,
    key: biome.keyColor,
    keyIntensity: biome.keyIntensity * 1.3 + 0.08,
    elevation: 62,
    azimuth: 238,
    under: INDOOR_UNDER[biome.id],
    fog: biome.fogColor,
    fogDensity: biome.fogDensity,
    background: biome.fogColor,
    hero: HERO_INDOOR,
  };
}

/** Unit offset toward a light at `elevation` degrees, bearing `azimuth`. */
export function lightDirection(elevation: number, azimuth: number): [number, number, number] {
  const e = (elevation * Math.PI) / 180;
  const a = (azimuth * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}

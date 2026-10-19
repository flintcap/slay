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

/**
 * How far the hero's light leans toward the biome's own torch colour
 * indoors. A little: the hero still carries warm light into a cold vault,
 * but it reads as the same air the torches burn in, not a lamp from town.
 */
const HERO_LEAN = 0.22;

/** `a` moved `k` of the way to `b`, per channel (0xRRGGBB). */
function mixHex(a: number, b: number, k: number): number {
  const ch = (s: number): number => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * k) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

/**
 * A flame's colour as it flickers: when it dips it burns redder (less green,
 * much less blue), when it flares a touch whiter. Only for warm lights (more
 * red than blue); a cold crystal or a ghost light keeps its colour. `f` is
 * the flicker multiplier on its intensity (1 = steady). Writes `out`.
 */
export function flameColour<C extends { r: number; g: number; b: number }>(base: C, f: number, out: C): C {
  out.r = base.r;
  out.g = base.g;
  out.b = base.b;
  if (base.r <= base.b) return out;
  const d = Math.max(-0.45, Math.min(0.45, f - 1));
  // Dip: green to 85%, blue to 65% at the lowest. Flare: both up a little.
  out.g = base.g * (d < 0 ? 1 + d * 0.34 : 1 + d * 0.08);
  out.b = base.b * (d < 0 ? 1 + d * 0.78 : 1 + d * 0.16);
  return out;
}

/** Outdoor moods, by biome. */
const OUTDOOR: Partial<Record<BiomeId, Omit<LightMood, 'background'>>> = {
  // Moonlight through the canopy: blue key, green-black bounce.
  darkForest: {
    sky: 0x3a5078, ground: 0x141a10, fill: 1.6,
    key: 0xa8c4f0, keyIntensity: 3.4, elevation: 56, azimuth: 215,
    fog: 0x0a1018, fogDensity: 0.028,
    hero: { color: 0xffc890, intensity: 46, distance: 18 },
  },
  // Overcast and thick: low yellow-green murk.
  swamp: {
    sky: 0x44563c, ground: 0x1c2412, fill: 1.6,
    key: 0xc0d0a4, keyIntensity: 2.7, elevation: 48, azimuth: 160,
    fog: 0x121a10, fogDensity: 0.036,
    hero: { color: 0xffd09a, intensity: 42, distance: 17 },
  },
  // A low, hard evening sun: long shadows, hot highlights, warm bounce.
  desert: {
    // The sun stands 55 degrees off the camera's bearing (45), to its left.
    // At 290 it sat behind the pack as the camera sees it and every monster
    // read as a black cut-out on bright sand.
    sky: 0x8a96b0, ground: 0x6a5642, fill: 1.0,
    key: 0xffe0bc, keyIntensity: 3.0, elevation: 24, azimuth: 350,
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
  // At fill 1.1 and key 1.9 the basalt steppe rendered near black and the
  // pack read only by its name plates.
  hell: {
    sky: 0x4a3432, ground: 0x4a2216, fill: 1.45,
    key: 0xffb890, keyIntensity: 2.6, elevation: 48, azimuth: 120,
    fog: 0x140c0a, fogDensity: 0.024,
    under: { color: 0xff4a18, intensity: 0.4 },
    hero: { color: 0xffd0a0, intensity: 40, distance: 17 },
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
  // A variant's sky (`BiomeArt.mood`) lays over the biome's own.
  if (out) return { ...out, ...art.mood, background: art.skyColor };
  if (open) {
    // An open biome without a table entry: its own colours, a little brighter.
    return {
      sky: biome.ambientColor, ground: art.bounceColor, fill: biome.ambientIntensity * 1.3 + 0.2,
      key: biome.keyColor, keyIntensity: biome.keyIntensity * 1.9 + 0.12, elevation: 45, azimuth: 230,
      fog: biome.fogColor, fogDensity: biome.fogDensity,
      hero: { color: 0xffd2a0, intensity: 26, distance: 15 },
      ...art.mood,
      background: art.skyColor,
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
    hero: { ...HERO_INDOOR, color: mixHex(HERO_INDOOR.color, art.lightColor, HERO_LEAN) },
  };
}

/**
 * A mood under a run theme's light (`Themes.ts`: cold blue-green when
 * flooded, moss green when overgrown, ember when burnt, pale violet when
 * haunted). The fill and the fog lean most, the key light half as much, so
 * the theme reads as the air of the place rather than a coloured lamp.
 * `light` null leaves the mood as it is.
 */
export function themedMood(mood: LightMood, light: { tint: number; strength: number } | null): LightMood {
  if (!light) return mood;
  const k = Math.max(0, Math.min(1, light.strength));
  return {
    ...mood,
    sky: mixHex(mood.sky, light.tint, k),
    ground: mixHex(mood.ground, light.tint, k * 0.5),
    key: mixHex(mood.key, light.tint, k * 0.5),
    fog: mixHex(mood.fog, light.tint, k * 0.6),
  };
}

/** Unit offset toward a light at `elevation` degrees, bearing `azimuth`. */
export function lightDirection(elevation: number, azimuth: number): [number, number, number] {
  const e = (elevation * Math.PI) / 180;
  const a = (azimuth * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}

/**
 * SLAY — run themes: what has happened to this whole map (docs/remake/mapvariety.md).
 *
 * Now and then a map rolls a theme on top of its biomes: the water got in,
 * the roots got in, a fire went through, or the dead will not lie down.
 * A theme changes what lies about (props), what falls (weather), which
 * monsters turn up more often (mix weights), and asks for a light tint.
 * It never makes a map's monsters fewer or weaker: the budget and every
 * monster's numbers are untouched; only which monster fills a slot moves.
 *
 * A zone whose biome does not suit the theme stays as it was (no flood in a
 * lava pit). Rolled on its own stream (`streamFor(seed, 'runTheme:...')`),
 * so a map without a theme generates exactly as before.
 *
 * Read by `world/DungeonGen.ts` (the roll, the monster mix), `world/Props.ts`
 * (the dressing) and `world/Weather.ts` (what falls). `light` is for the
 * looks stream to read if it likes; nothing requires it.
 */
import type { Dressing, Pool } from '../art/props/Dressing';
import type { BiomeId, MonsterFamily, Rng } from '../types';
import type { WeatherFall } from './Weather';
import { tr } from '../core/I18n';

export type RunThemeId = 'flooded' | 'overgrown' | 'burnt' | 'haunted';

type PoolKey = 'clutter' | 'wall' | 'edge' | 'feature' | 'detail' | 'liquid' | 'standLight';

export interface RunTheme {
  id: RunThemeId;
  /** Shown with the map's name: "Gallows Fen, drowned". */
  name: string;
  blurb: string;
  weight: number;
  /** No theme before this depth, so the first maps read plainly. */
  minDepth: number;
  /** Biomes it never touches. */
  not: BiomeId[];
  /** Weighted prop kinds added to a fitting zone's dressing pools. */
  dress: Partial<Record<PoolKey, Pool>>;
  /** Monster families that turn up more often in a fitting zone (weight multiplier). */
  favour: Partial<Record<MonsterFamily, number>>;
  /**
   * A biome whose monsters of the favoured families may join a fitting
   * zone's pool (only ones legal at the depth; the pool only grows).
   */
  guests: BiomeId;
  /** Added weather: under open sky, and under a roof. */
  sky: WeatherFall[];
  roof: WeatherFall[];
  /** Light tint the looks stream may lay over a fitting zone (colour, 0..1 strength). */
  light: { tint: number; strength: number };
}

const P = (...pairs: Array<[string, number]>): Pool => pairs.map(([kind, weight]) => ({ kind, weight }));

export const RUN_THEMES: readonly RunTheme[] = [
  {
    id: 'flooded',
    name: 'drowned',
    blurb: tr('The water came up and never went back down.'),
    weight: 3,
    minDepth: 3,
    not: ['hell', 'ashwaste', 'foundry', 'desert', 'desertTomb', 'voidspire'],
    dress: {
      clutter: P(['reeds', 3], ['urn', 1], ['mangroveRoots', 1]),
      edge: P(['reeds', 4], ['mangroveRoots', 2]),
      detail: P(['shellFragment', 6], ['mossPatch', 4], ['pebbles', 2]),
      liquid: P(['lilyPad', 3]),
    },
    favour: { ooze: 2.5, aberration: 1.8, undead: 1.4 },
    guests: 'sunkenTemple',
    sky: [{ kind: 'rain', rate: 200 }],
    roof: [{ kind: 'drip', rate: 9 }],
    light: { tint: 0x6f98a4, strength: 0.35 },
  },
  {
    id: 'overgrown',
    name: 'root-choked',
    blurb: tr('Nobody has walked here for a long time. Something has grown instead.'),
    weight: 3,
    minDepth: 3,
    not: ['hell', 'ashwaste', 'foundry', 'frostvault', 'tundra', 'voidspire', 'desert'],
    dress: {
      clutter: P(['mushroomCluster', 3], ['fern', 3], ['thornBush', 2], ['stump', 1]),
      wall: P(['rootTangle', 5]),
      edge: P(['thornBush', 3], ['fern', 3], ['stump', 1]),
      detail: P(['mossPatch', 7], ['leafLitter', 4], ['sporeTuft', 4], ['grassTuft', 3]),
    },
    favour: { plant: 3, beast: 1.7, insect: 1.7 },
    guests: 'darkForest',
    sky: [],
    roof: [],
    light: { tint: 0x8aa46a, strength: 0.3 },
  },
  {
    id: 'burnt',
    name: tr('burnt out'),
    blurb: tr('A fire went through. Some of it is still going.'),
    weight: 3,
    minDepth: 3,
    not: ['swamp', 'sunkenTemple', 'frostvault', 'tundra'],
    dress: {
      clutter: P(['rubblePile', 3], ['fallenLog', 2], ['deadTree', 1], ['lavaRock', 1]),
      edge: P(['deadTree', 3], ['rubblePile', 3]),
      detail: P(['ashDrift', 7], ['scorchMark', 6], ['slagChunk', 2]),
    },
    favour: { demon: 2.2, elemental: 2.2, undead: 1.3 },
    guests: 'ashwaste',
    sky: [{ kind: 'ash', rate: 60 }, { kind: 'cinders', rate: 18 }],
    roof: [],
    light: { tint: 0xd07a48, strength: 0.35 },
  },
  {
    id: 'haunted',
    name: 'restless',
    blurb: tr('The dead here were buried badly, and they know it.'),
    weight: 3,
    minDepth: 3,
    not: [],
    dress: {
      clutter: P(['skullPile', 2], ['bonepile', 3], ['coffin', 1], ['cage', 1]),
      wall: P(['chain', 3], ['wallSkull', 3], ['webSheet', 2]),
      edge: P(['bonepile', 3], ['cairn', 1]),
      detail: P(['boneChips', 6], ['bloodStain', 3]),
    },
    favour: { undead: 3, aberration: 1.5 },
    guests: 'crypt',
    sky: [],
    roof: [],
    light: { tint: 0x8a92c4, strength: 0.4 },
  },
];

/** Chance a map from `minDepth` on rolls a theme. */
export const RUN_THEME_CHANCE = 0.35;

export function runTheme(id: string | undefined): RunTheme | null {
  return id ? RUN_THEMES.find((t) => t.id === id) ?? null : null;
}

/** Does the theme touch a zone of this biome? */
export function themeFits(theme: RunTheme | null, biome: BiomeId): theme is RunTheme {
  return !!theme && !theme.not.includes(biome);
}

let forced: RunThemeId | null | undefined;

/** For checkers: every map gets this theme (null: none); undefined rolls as usual. */
export function forceRunTheme(id: RunThemeId | null | undefined): void {
  forced = id;
}

/**
 * Rolls a map's theme from the biomes of its zones, or null. A theme is only
 * picked when it suits at least half of them.
 */
export function rollRunTheme(depth: number, biomes: BiomeId[], rng: Rng): RunThemeId | null {
  if (forced !== undefined) return forced;
  if (!rng.chance(RUN_THEME_CHANCE)) return null;
  const fit = RUN_THEMES.filter((t) => depth >= t.minDepth && biomes.filter((b) => !t.not.includes(b)).length * 2 >= biomes.length);
  if (fit.length === 0) return null;
  return rng.weighted(fit, (t) => t.weight).id;
}

const dressCache = new Map<string, Dressing>();

/** A zone's dressing with the theme's kinds added (the biome's own stay). */
export function themedDressing(base: Dressing, key: string, theme: RunTheme): Dressing {
  const k = `${key}|${theme.id}`;
  let d = dressCache.get(k);
  if (!d) {
    d = { ...base };
    for (const [pool, extra] of Object.entries(theme.dress) as Array<[PoolKey, Pool]>) {
      // Indoors a pool may be empty on purpose (no liquid props): only add
      // floating things where the biome floats things already.
      if (pool === 'liquid' && base.liquid.length === 0) continue;
      d[pool] = [...base[pool], ...extra];
    }
    dressCache.set(k, d);
  }
  return d;
}

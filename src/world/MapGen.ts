/**
 * SLAY — map assembly (map remake, docs/remake/maps.md).
 *
 * A map is a chain of 3 to 5 zones drawn from a theme, so the mix always makes
 * sense: a wood leads into a crypt, a desert into a tomb, ash into fire. The
 * chain is split into areas (one load each): outdoor zones in a row share an
 * area two at a time and meet at a seam; an indoor zone always stands alone.
 * The last zone holds the boss.
 *
 * Pure data and seeded rolls only.
 */

import type { BiomeId, MapInfo, Rng } from '../types';
import { getBiome, isOutdoorBiome, layoutForBiome } from './Biomes';
import type { ZonePlan } from './zones/Area';

/** A slot in a chain: one biome, or a choice of several. */
type Slot = BiomeId | BiomeId[];

export interface ThemeDef {
  id: string;
  /** Map names this theme can carry. */
  names: string[];
  weight: number;
  /** The zones in order. The last is the boss zone. */
  chain: Slot[];
  /** Indexes of slots that may be left out, so one theme makes maps of several lengths. */
  optional?: number[];
}

export const THEMES: ThemeDef[] = [
  {
    id: 'blackroot',
    names: ['The Hollow Road', 'Rootgrave', 'The Lychgate Way'],
    weight: 3,
    chain: ['darkForest', 'darkForest', 'crypt', 'crypt', 'crypt'],
    optional: [1, 3],
  },
  {
    id: 'deepwood',
    names: ['The Root Cellar', 'Underwood', 'The Mouldering Path'],
    weight: 2,
    chain: ['darkForest', ['darkForest', 'swamp'], 'caverns', 'caverns'],
    optional: [1],
  },
  {
    id: 'fen',
    names: ['Gallows Fen', 'The Drowned Parish', 'Hangwater'],
    weight: 3,
    chain: ['swamp', ['swamp', 'darkForest'], 'sunkenTemple', ['sunkenTemple', 'hive']],
    optional: [1],
  },
  {
    id: 'mire',
    names: ['The Sinking Chapel', 'Bogbell', 'The Last Ferry'],
    weight: 2,
    chain: ['darkForest', 'swamp', ['crypt', 'sunkenTemple'], 'crypt'],
  },
  {
    id: 'reach',
    names: ['The Bleached Reach', 'Dry Kings', 'The Glass Road'],
    weight: 3,
    chain: ['desert', 'desert', 'desertTomb', 'desertTomb', 'desertTomb'],
    optional: [1, 3],
  },
  {
    id: 'dunesea',
    names: ['The Long Thirst', 'Saltgrave', 'The Buried Market'],
    weight: 2,
    chain: ['desert', ['desert', 'ashwaste'], 'hive', 'desertTomb'],
    optional: [1],
  },
  {
    id: 'deeps',
    names: ['The Root Deeps', 'Lantern-rot', 'The Wet Dark'],
    weight: 2,
    chain: ['caverns', ['caverns', 'hive'], 'hive'],
  },
  {
    id: 'ossuary',
    names: ['The Ossuary Tiers', 'Bonewright', 'The Counting House'],
    weight: 2,
    chain: ['crypt', ['crypt', 'caverns'], 'crypt'],
  },
  {
    id: 'frostmarch',
    names: ['The Frostmarch', 'Standing Orders', 'The White Retreat'],
    weight: 3,
    chain: ['tundra', 'tundra', 'frostvault', 'tundra', 'frostvault'],
    optional: [1, 3],
  },
  {
    id: 'rime',
    names: ['The Rime Archive', 'Coldkeep', 'The Kept Winter'],
    weight: 2,
    chain: ['tundra', ['frostvault', 'crypt'], 'frostvault'],
  },
  {
    id: 'cinder',
    names: ['The Cinderfields', 'Ashfall', 'The Banked Fire'],
    weight: 3,
    chain: ['ashwaste', ['ashwaste', 'hell'], 'foundry', 'foundry'],
    optional: [1],
  },
  {
    id: 'steppe',
    names: ['The Burning Steppe', 'The Red Furrow', 'Crust and Coal'],
    weight: 3,
    chain: ['ashwaste', 'hell', 'foundry', 'hell', 'hell'],
    optional: [2, 3],
  },
  {
    id: 'pit',
    names: ['The Open Pit', 'The Long Fall', 'Nothing Under'],
    weight: 2,
    chain: ['hell', 'hell', ['voidspire', 'foundry'], 'voidspire'],
    optional: [1],
  },
  {
    id: 'spire',
    names: ['The Hollow Spire', 'The Looking Dark', 'Spireroot'],
    weight: 2,
    chain: [['ashwaste', 'tundra'], 'voidspire', 'voidspire'],
  },
];

/** Zone names per biome. The first is the biome's own place name. */
const ZONE_NAMES: Record<BiomeId, string[]> = {
  crypt: ['The Ossuary Tiers', 'The Charnel Stair', 'The Sexton’s Rows', 'The Low Vaults'],
  caverns: ['The Root Deeps', 'The Dripping Gallery', 'The Lamp-moss Halls', 'The Undercroft'],
  foundry: ['The Cindergate Works', 'The Slag Floors', 'The Bellows Hall', 'The Pouring Pits'],
  sunkenTemple: ['The Drowned Sanctum', 'The Flooded Nave', 'The Tide Choir', 'The Green Cloister'],
  hive: ['The Chitin Warrens', 'The Brood Cells', 'The Larder Tunnels', 'The Waxen Deep'],
  frostvault: ['The Rime Archive', 'The Ice Caves', 'The Sealed Stacks', 'The Frozen Ledger'],
  ashwaste: ['The Cinderfields', 'The Grey Plain', 'The Ash Furrows', 'The Smoke Flats'],
  voidspire: ['The Hollow Spire', 'The Unfloored Halls', 'The Stair to Nowhere', 'The Watching Drop'],
  darkForest: ['The Blackroot Wood', 'Hangman’s Copse', 'The Thornwalk', 'The Mourning Trees'],
  swamp: ['The Gallows Fen', 'The Black Shallows', 'Reedmarrow', 'The Gibbet Causeway'],
  desert: ['The Bleached Reach', 'The Bone Dunes', 'The Sunken Market', 'The Glass Flats'],
  desertTomb: ['The Sand-Kings’ Tombs', 'The Gilded Galleries', 'The Servants’ Rest', 'The Long Procession'],
  tundra: ['The Frostmarch', 'The Picket Line', 'The White Ridges', 'The Drift Fields'],
  hell: ['The Burning Steppe', 'The Glowing Crust', 'The Chained Gods', 'The Furnace Floor'],
};

export interface MapPlan {
  info: MapInfo;
  /** Zones grouped by area, in order. */
  areas: ZonePlan[][];
  /** Biome of the boss zone. */
  bossBiome: BiomeId;
}

/** Most areas a map may have, and most zones one area may hold. */
export const MAX_AREAS = 4;
export const MAX_ZONES_PER_AREA = 2;

const unlocked = (b: BiomeId, tier: number): boolean => getBiome(b).minDepth <= tier;

/** Every biome a slot can be at this tier. */
function slotChoices(s: Slot, tier: number): BiomeId[] {
  return (Array.isArray(s) ? s : [s]).filter((b) => unlocked(b, tier));
}

/** A theme can run if every slot it cannot drop has a biome open at this tier. */
function themeOpen(t: ThemeDef, tier: number): boolean {
  return t.chain.every((s, i) => slotChoices(s, tier).length > 0 || (t.optional ?? []).includes(i));
}

/** Split a zone chain into areas: outdoor runs pair up, indoor zones stand alone. */
export function splitAreas(biomes: BiomeId[]): number[] {
  const area: number[] = [];
  let a = -1;
  let inArea = 0;
  for (let i = 0; i < biomes.length; i++) {
    const out = isOutdoorBiome(biomes[i]!);
    const prevOut = i > 0 && isOutdoorBiome(biomes[i - 1]!);
    if (i === 0 || !out || !prevOut || inArea >= MAX_ZONES_PER_AREA) {
      a++;
      inArea = 0;
    }
    area.push(a);
    inArea++;
  }
  return area;
}

/**
 * Roll a map for a tier. `want` is a biome the story asked for (an open
 * contract): the boss zone and every zone past the first are that biome.
 */
export function planMap(tier: number, rng: Rng, want?: BiomeId, minZones = 3): MapPlan {
  let theme: ThemeDef | null = null;
  let chain: BiomeId[] = [];

  const open = THEMES.filter((t) => themeOpen(t, tier));
  const candidates = want ? open.filter((t) => slotChoices(t.chain[t.chain.length - 1]!, tier).includes(want)) : open;
  if (candidates.length > 0) {
    theme = rng.weighted(candidates, (t) => t.weight);
    for (let i = 0; i < theme.chain.length; i++) {
      const choices = slotChoices(theme.chain[i]!, tier);
      const last = i === theme.chain.length - 1;
      if (choices.length === 0) continue;
      if (!last && (theme.optional ?? []).includes(i) && rng.chance(0.4)) continue;
      chain.push(last && want ? want : rng.pick(choices));
    }
  }
  if (!theme || chain.length < 3) {
    // Nothing fits (a contract biome no theme ends in): three zones of it.
    const b = want ?? 'crypt';
    theme = { id: `solo.${b}`, names: [getBiome(b).name.replace(/^The /, '')], weight: 1, chain: [b, b, b] };
    chain = [b, b, b];
  }
  // Never more than four loads: drop middle zones until it fits.
  while (Math.max(...splitAreas(chain)) + 1 > MAX_AREAS && chain.length > 3) chain.splice(1, 1);
  // Never fewer zones than asked (the old run's floor count), so a map never
  // holds fewer fights: repeat a zone before the boss while the loads allow.
  for (let guard = 0; chain.length < Math.min(5, minZones) && guard < 8; guard++) {
    let grown = false;
    for (let i = chain.length - 2; i >= 0 && !grown; i--) {
      const trial = chain.slice();
      trial.splice(i + 1, 0, chain[i]!);
      if (Math.max(...splitAreas(trial)) + 1 <= MAX_AREAS) {
        chain = trial;
        grown = true;
      }
    }
    if (!grown) break;
  }

  // A contract map is the contract's land: past the way in, every zone is
  // the biome the story sent you to, so its monsters are there to be hunted.
  if (want) {
    for (let i = 1; i < chain.length - 1; i++) chain[i] = want;
    while (Math.max(...splitAreas(chain)) + 1 > MAX_AREAS && chain.length > 3) chain.splice(1, 1);
  }

  const areaOf = splitAreas(chain);
  const used = new Map<BiomeId, number>();
  const zones: ZonePlan[] = chain.map((b, i) => {
    const k = used.get(b) ?? 0;
    used.set(b, k + 1);
    const pool = ZONE_NAMES[b];
    return {
      name: pool[k % pool.length]!,
      biome: b,
      layout: layoutForBiome(getBiome(b), rng, tier),
      outdoor: isOutdoorBiome(b),
      role: i === chain.length - 1 ? 'boss' : i === 0 ? 'start' : 'field',
      order: i,
    };
  });
  const areas: ZonePlan[][] = [];
  zones.forEach((z, i) => {
    (areas[areaOf[i]!] ??= []).push(z);
  });

  return {
    info: {
      name: rng.pick(theme.names),
      tier,
      theme: theme.id,
      zones: zones.map((z, i) => ({ name: z.name, biome: z.biome, outdoor: z.outdoor, area: areaOf[i]! })),
    },
    areas,
    bossBiome: chain[chain.length - 1]!,
  };
}

/** Heat of a zone: 0 for the first, 1 for the boss zone. */
export function zoneHeat(order: number, zones: number): number {
  return zones <= 1 ? 1 : order / (zones - 1);
}

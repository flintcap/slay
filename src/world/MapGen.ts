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
import { tr } from '../core/I18n';

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
    names: [tr('The Hollow Road'), tr('Rootgrave'), tr('The Lychgate Way')],
    weight: 3,
    chain: ['darkForest', 'darkForest', 'crypt', 'crypt', 'crypt'],
    optional: [1, 3],
  },
  {
    id: 'deepwood',
    names: [tr('The Root Cellar'), tr('Underwood'), tr('The Mouldering Path')],
    weight: 2,
    chain: ['darkForest', ['darkForest', 'swamp'], 'caverns', 'caverns'],
    optional: [1],
  },
  {
    id: 'fen',
    names: [tr('Gallows Fen'), tr('The Drowned Parish'), tr('Hangwater')],
    weight: 3,
    chain: ['swamp', ['swamp', 'darkForest'], 'sunkenTemple', ['sunkenTemple', 'hive']],
    optional: [1],
  },
  {
    id: 'mire',
    names: [tr('The Sinking Chapel'), tr('Bogbell'), tr('The Last Ferry')],
    weight: 2,
    chain: ['darkForest', 'swamp', ['crypt', 'sunkenTemple'], 'crypt'],
  },
  {
    id: 'reach',
    names: [tr('The Bleached Reach'), tr('Dry Kings'), tr('The Glass Road')],
    weight: 3,
    chain: ['desert', 'desert', 'desertTomb', 'desertTomb', 'desertTomb'],
    optional: [1, 3],
  },
  {
    id: 'dunesea',
    names: [tr('The Long Thirst'), tr('Saltgrave'), tr('The Buried Market')],
    weight: 2,
    chain: ['desert', ['desert', 'ashwaste'], 'hive', 'desertTomb'],
    optional: [1],
  },
  {
    id: 'deeps',
    names: [tr('The Root Deeps'), tr('Lantern-rot'), tr('The Wet Dark')],
    weight: 2,
    chain: ['caverns', ['caverns', 'hive'], 'hive'],
  },
  {
    id: 'ossuary',
    names: [tr('The Ossuary Tiers'), tr('Bonewright'), tr('The Counting House')],
    weight: 2,
    chain: ['crypt', ['crypt', 'caverns'], 'crypt'],
  },
  {
    id: 'frostmarch',
    names: [tr('The Frostmarch'), tr('Standing Orders'), tr('The White Retreat')],
    weight: 3,
    chain: ['tundra', 'tundra', 'frostvault', 'tundra', 'frostvault'],
    optional: [1, 3],
  },
  {
    id: 'rime',
    names: [tr('The Rime Archive'), tr('Coldkeep'), tr('The Kept Winter')],
    weight: 2,
    chain: ['tundra', ['frostvault', 'crypt'], 'frostvault'],
  },
  {
    id: 'cinder',
    names: [tr('The Cinderfields'), tr('Ashfall'), tr('The Banked Fire')],
    weight: 3,
    chain: ['ashwaste', ['ashwaste', 'hell'], 'foundry', 'foundry'],
    optional: [1],
  },
  {
    id: 'steppe',
    names: [tr('The Burning Steppe'), tr('The Red Furrow'), tr('Crust and Coal')],
    weight: 3,
    chain: ['ashwaste', 'hell', 'foundry', 'hell', 'hell'],
    optional: [2, 3],
  },
  {
    id: 'pit',
    names: [tr('The Open Pit'), tr('The Long Fall'), tr('Nothing Under')],
    weight: 2,
    chain: ['hell', 'hell', ['voidspire', 'foundry'], 'voidspire'],
    optional: [1],
  },
  {
    id: 'spire',
    names: [tr('The Hollow Spire'), tr('The Looking Dark'), tr('Spireroot')],
    weight: 2,
    chain: [['ashwaste', 'tundra'], 'voidspire', 'voidspire'],
  },
];

/** Zone names per biome. The first is the biome's own place name. */
const ZONE_NAMES: Record<BiomeId, string[]> = {
  crypt: [tr('The Ossuary Tiers'), tr('The Charnel Stair'), tr('The Sexton’s Rows'), tr('The Low Vaults')],
  caverns: [tr('The Root Deeps'), tr('The Dripping Gallery'), tr('The Lamp-moss Halls'), tr('The Undercroft')],
  foundry: [tr('The Cindergate Works'), tr('The Slag Floors'), tr('The Bellows Hall'), tr('The Pouring Pits')],
  sunkenTemple: [tr('The Drowned Sanctum'), tr('The Flooded Nave'), tr('The Tide Choir'), tr('The Green Cloister')],
  hive: [tr('The Chitin Warrens'), tr('The Brood Cells'), tr('The Larder Tunnels'), tr('The Waxen Deep')],
  frostvault: [tr('The Rime Archive'), tr('The Ice Caves'), tr('The Sealed Stacks'), tr('The Frozen Ledger')],
  ashwaste: [tr('The Cinderfields'), tr('The Grey Plain'), tr('The Ash Furrows'), tr('The Smoke Flats')],
  voidspire: [tr('The Hollow Spire'), tr('The Unfloored Halls'), tr('The Stair to Nowhere'), tr('The Watching Drop')],
  darkForest: [tr('The Blackroot Wood'), tr('Hangman’s Copse'), tr('The Thornwalk'), tr('The Mourning Trees')],
  swamp: [tr('The Gallows Fen'), tr('The Black Shallows'), tr('Reedmarrow'), tr('The Gibbet Causeway')],
  desert: [tr('The Bleached Reach'), tr('The Bone Dunes'), tr('The Sunken Market'), tr('The Glass Flats')],
  desertTomb: [tr('The Sand-Kings’ Tombs'), tr('The Gilded Galleries'), tr('The Servants’ Rest'), tr('The Long Procession')],
  tundra: [tr('The Frostmarch'), tr('The Picket Line'), tr('The White Ridges'), tr('The Drift Fields')],
  hell: [tr('The Burning Steppe'), tr('The Glowing Crust'), tr('The Chained Gods'), tr('The Furnace Floor')],
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
/**
 * The first tiers are short maps: one area that ends in the boss's arena, or
 * two with the boss at the end of the second (owner). A hero levels on every
 * area cleared, and four of them a map left the monsters of the early tiers
 * behind on the base difficulty.
 */
export const SHORT_MAP_TIERS = 10;

const areaCount = (chain: BiomeId[]): number => Math.max(...splitAreas(chain)) + 1;

/**
 * Drops middle zones until the chain fits in `max` areas, keeping at least
 * `fewest` zones and `least` areas. A short map (`short`) may drop its way in
 * too when nothing else can go, so one area can be the boss's zone alone.
 */
function trimChain(chain: BiomeId[], max: number, fewest: number, least: number, short: boolean): void {
  while (areaCount(chain) > max && chain.length > fewest) {
    const order = [...chain.keys()].slice(1, -1);
    if (short && chain.length > 1) order.push(0);
    let cut = -1;
    for (let k = 0; k < order.length && cut < 0; k++) {
      const trial = chain.slice();
      trial.splice(order[k]!, 1);
      if (areaCount(trial) >= least) cut = order[k]!;
    }
    if (cut < 0) return;
    chain.splice(cut, 1);
  }
}

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
  // Never more loads than the tier allows: drop zones until it fits. A short
  // map is exactly one area (the boss at its end) or two, an even roll; a
  // longer one keeps the boss out of the area you arrive in.
  const short = tier <= SHORT_MAP_TIERS;
  const maxAreas = short ? (rng.chance(0.5) ? 1 : 2) : MAX_AREAS;
  const leastAreas = short ? maxAreas : 2;
  const fewest = short ? 1 : 3;
  trimChain(chain, maxAreas, fewest, leastAreas, short);
  // Never fewer zones than asked (the old run's floor count), so a map never
  // holds fewer fights, and never fewer areas than the roll: repeat a zone
  // before the boss while the loads allow.
  for (let guard = 0; (chain.length < Math.min(5, minZones) || areaCount(chain) < leastAreas) && guard < 8; guard++) {
    let grown = false;
    for (let i = chain.length - 2; i >= 0 && !grown; i--) {
      const trial = chain.slice();
      trial.splice(i + 1, 0, chain[i]!);
      if (areaCount(trial) <= maxAreas) {
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
    trimChain(chain, maxAreas, fewest, leastAreas, short);
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

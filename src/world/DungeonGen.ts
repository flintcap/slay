/**
 * SLAY — dungeon generation.
 *
 * `generateRun` builds a whole map (docs/remake/maps.md): a themed chain of
 * zones from `MapGen.ts`, grouped into areas, ending in a boss arena.
 * `generateLevel` turns one area into a playable load: arrival and exit, room
 * roles, monster packs per zone, treasure, shrines, ambushes and props.
 *
 * Endless scaling is the load-bearing design here. Depth 1 and depth 137 run
 * through the same code; what changes is monster count, elite density, affix
 * count, run-modifier count and modifier *tier*. Everything is expressed as a
 * curve with a soft cap so nothing degenerates into a slideshow at depth 300.
 *
 * The monster catalogue lives in `entities/` and is injected via
 * `setMonsterCatalog` so world generation stays independent of the monster
 * vertical — generation must not break because a monster id was renamed.
 */

import type {
  BiomeDef,
  BiomeId,
  CharClassId,
  DungeonLevel,
  DungeonRoom,
  DungeonRun,
  LayoutKind,
  LevelEvent,
  LevelEventKind,
  MapExit,
  MapZone,
  MonsterRank,
  PropPlacement,
  QuestDef,
  QuestInstance,
  QuestObjective,
  Rng,
  SpawnPoint,
  TileKind,
  Vec2,
} from '../types';
import { Random, streamFor } from '../core/RNG';
import { activeDifficulty } from '../data/difficulties';
import { clamp } from '../art/Noise';
import { BIOMES as BIOME_LIST, getBiome, isOutdoorBiome, layoutForBiome, pickVariant } from './Biomes';
import {
  Grid,
  TILE_VALUES,
  T_CHASM,
  T_DOOR,
  T_FLOOR,
  T_LAVA,
  T_RUBBLE,
  T_EXIT,
  T_ARRIVAL,
  T_WATER,
  auditLayout,
  isWalkableValue,
} from './Layouts';
import { type ZonePlan, buildArea } from './zones/Area';
import { planMap, zoneHeat } from './MapGen';
import { placeProps } from './Props';

// ---------------------------------------------------------------------------
// Contract exports
// ---------------------------------------------------------------------------

/** Numeric tile ids stored in `DungeonLevel.tiles`. */
export const TILE: Record<TileKind, number> = TILE_VALUES;

/** Reverse lookup, index = numeric id. */
const TILE_NAMES: TileKind[] = [
  'void',
  'floor',
  'wall',
  'door',
  'water',
  'lava',
  'chasm',
  'exit',
  'arrival',
  'rubble',
  'ruin',
  'deepWater',
  'bridge',
  'ice',
];

export const BIOMES: BiomeDef[] = BIOME_LIST;

export function tileAt(level: DungeonLevel, x: number, y: number): TileKind {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return 'void';
  return TILE_NAMES[level.tiles[y * level.width + x]] ?? 'void';
}

export function isWalkable(level: DungeonLevel, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  return isWalkableValue(level.tiles[y * level.width + x]);
}

// ---------------------------------------------------------------------------
// Extended level data (world-owned, additive)
// ---------------------------------------------------------------------------

/**
 * Extra per-level fields the world module attaches. Consumers that only know
 * `DungeonLevel` are unaffected; the builder and nav grid read these.
 */
export interface LevelExtras {
  /** Height step index per tile; multiply by `STEP_HEIGHT` for world units. */
  heights: Int8Array;
  /** Room id per tile, -1 where none. */
  roomOf: Int16Array;
  /** Layout diagnostics — surfaced by the debug overlay. */
  audit: { walkable: number; components: number; diagonalPinches: number; unreachableRooms: number };
}

export type GeneratedLevel = DungeonLevel & LevelExtras;

/** World units per height step. Shared with the builder. */
export const STEP_HEIGHT = 0.45;

/** World units per tile. The single source of truth for tile<->world mapping. */
export const TILE_SIZE = 2.0;

/** World position of a tile centre (y excluded — the builder adds height). */
export function tileToWorldXZ(level: DungeonLevel, x: number, y: number): { x: number; z: number } {
  return {
    x: (x - level.width / 2 + 0.5) * TILE_SIZE,
    z: (y - level.height / 2 + 0.5) * TILE_SIZE,
  };
}

/** Tile containing a world position. */
export function worldToTileXZ(level: DungeonLevel, wx: number, wz: number): { x: number; y: number } {
  return {
    x: Math.floor(wx / TILE_SIZE + level.width / 2),
    y: Math.floor(wz / TILE_SIZE + level.height / 2),
  };
}

/**
 * The height a prop standing on this tile should be drawn at.
 *
 * Not the tile's own height: the lowest walkable height it touches. Prop models
 * are routinely wider than the two-metre tile they are placed on, and clutter
 * placement deliberately favours tiles against a wall, which is also where the
 * floor steps. A rock drawn at its own tile's height overhangs the step with
 * nothing under it and reads as floating — which is exactly how playtesters
 * described it. Dropping to the lower side buries the overhang instead.
 */
export function propGroundHeight(level: DungeonLevel, x: number, y: number): number {
  const ex = levelExtras(level);
  if (!ex) return 0;
  const at = (px: number, py: number): number =>
    px < 0 || py < 0 || px >= level.width || py >= level.height ? 0 : ex.heights[py * level.width + px]!;
  let lowest = at(x, y);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as Array<[number, number]>) {
    if (!isWalkable(level, x + dx, y + dy)) continue;
    lowest = Math.min(lowest, at(x + dx, y + dy));
  }
  return lowest;
}

export function levelExtras(level: DungeonLevel): LevelExtras | null {
  const l = level as Partial<GeneratedLevel>;
  return l.heights && l.roomOf && l.audit
    ? { heights: l.heights, roomOf: l.roomOf, audit: l.audit }
    : null;
}

// ---------------------------------------------------------------------------
// Monster catalogue injection
// ---------------------------------------------------------------------------

export interface MonsterCatalog {
  /** Ids of monsters legal at this depth/biome. */
  pick(depth: number, biome: BiomeId, rng: Rng, count: number): string[];
  /** Ids of elite affixes legal at this depth. */
  affixes(depth: number, rng: Rng, count: number): string[];
  /** The boss for this run. */
  bossFor(depth: number, biome: BiomeId, rng: Rng): string;
  /**
   * A named rare that could stand in for this monster, or null for none.
   * Optional so an older catalogue still satisfies the contract.
   */
  nameFor?(monsterId: string, biome: BiomeId, depth: number, rng: Rng): string | null;
}

/**
 * Placeholder catalogue. Deterministic and structurally valid so the world can
 * be generated, previewed and screenshotted before the monster vertical lands;
 * `scenes/` replaces it at boot with the real registry.
 */
const FALLBACK_MONSTERS: Partial<Record<BiomeId, string[]>> = {
  crypt: ['skeleton', 'ghoul', 'wight', 'boneArcher', 'cryptSpawn'],
  caverns: ['caveLurker', 'fungalCrawler', 'rockBeast', 'slime', 'batSwarm'],
  foundry: ['forgeGolem', 'cinderImp', 'slagHound', 'boltConstruct', 'emberWisp'],
  sunkenTemple: ['drowned', 'templeGuardian', 'deepThing', 'tideCaller', 'reefCrawler'],
  hive: ['broodling', 'chitinReaver', 'spinner', 'hiveDrone', 'larvaSwarm'],
  frostvault: ['frostwraith', 'iceGolem', 'rimeHound', 'glacialArcher', 'shiverling'],
  ashwaste: ['ashFiend', 'cinderStalker', 'emberBrute', 'dustWraith', 'scorchling'],
  voidspire: ['voidling', 'riftStalker', 'nullPriest', 'echoHusk', 'starveMaw'],
};

const FALLBACK_AFFIXES = [
  'fireEnchanted',
  'coldEnchanted',
  'lightningEnchanted',
  'poisonous',
  'vampiric',
  'fast',
  'juggernaut',
  'teleporter',
  'reflective',
  'shielded',
  'frenzied',
  'arcaneWard',
  'summoner',
  'explosive',
  'entangling',
];

const FALLBACK_BOSSES: Partial<Record<BiomeId, string[]>> = {
  crypt: ['boneTyrant', 'graveMother'],
  caverns: ['theDevourer', 'stoneWyrm'],
  foundry: ['slagLord', 'theBellows'],
  sunkenTemple: ['drownedKing', 'tideOfMaws'],
  hive: ['broodQueen', 'theWeaver'],
  frostvault: ['rimeSovereign', 'winterHusk'],
  ashwaste: ['ashPatriarch', 'theKilnborn'],
  voidspire: ['theUnmade', 'nullThrone'],
};

let warnedFallback = false;

const fallbackCatalog: MonsterCatalog = {
  pick(depth, biome, rng, count) {
    if (!warnedFallback) {
      warnedFallback = true;
      // eslint-disable-next-line no-console
      console.info('[world] using placeholder monster catalogue — call setMonsterCatalog() at boot');
    }
    const pool = FALLBACK_MONSTERS[biome] ?? FALLBACK_MONSTERS.crypt!;
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(rng.pick(pool));
    return out;
  },
  affixes(depth, rng, count) {
    const pool = FALLBACK_AFFIXES.slice(0, clamp(4 + Math.floor(depth / 8), 4, FALLBACK_AFFIXES.length));
    const shuffled = rng.shuffle(pool.slice());
    return shuffled.slice(0, count);
  },
  bossFor(depth, biome, rng) {
    const pool = FALLBACK_BOSSES[biome] ?? FALLBACK_BOSSES.crypt!;
    return rng.pick(pool);
  },
};

let catalog: MonsterCatalog = fallbackCatalog;

/** Wire the real monster registry. Partial overrides fall back per-method. */
export function setMonsterCatalog(c: Partial<MonsterCatalog>): void {
  catalog = {
    pick: c.pick ?? fallbackCatalog.pick,
    affixes: c.affixes ?? fallbackCatalog.affixes,
    bossFor: c.bossFor ?? fallbackCatalog.bossFor,
    nameFor: c.nameFor,
  };
}

// ---------------------------------------------------------------------------
// Run modifiers
// ---------------------------------------------------------------------------

export interface RunModifierDef {
  id: string;
  name: string;
  desc: string;
  minDepth: number;
  weight: number;
  /** Higher tiers roll deeper and hit harder. */
  maxTier: number;
  excludes?: string[];
}

export const RUN_MODIFIERS: RunModifierDef[] = [
  { id: 'mod.swarm', name: 'Teeming', desc: 'Monster packs are {v}% larger.', minDepth: 1, weight: 10, maxTier: 4 },
  { id: 'mod.elites', name: 'Warband', desc: '{v}% more elite packs roam the floor.', minDepth: 4, weight: 9, maxTier: 4 },
  { id: 'mod.hardened', name: 'Hardened', desc: 'Enemies have {v}% more life.', minDepth: 2, weight: 9, maxTier: 5 },
  { id: 'mod.savage', name: 'Savage', desc: 'Enemies deal {v}% more damage.', minDepth: 5, weight: 8, maxTier: 5 },
  { id: 'mod.swift', name: 'Swift', desc: 'Enemies move {v}% faster.', minDepth: 4, weight: 7, maxTier: 3 },
  { id: 'mod.gloom', name: 'Gloom', desc: 'Light sources are dimmed and sight is short.', minDepth: 3, weight: 6, maxTier: 2, excludes: ['mod.blaze'] },
  { id: 'mod.blaze', name: 'Conflagration', desc: 'Fire pools erupt where enemies die.', minDepth: 8, weight: 6, maxTier: 3, excludes: ['mod.gloom'] },
  { id: 'mod.frostbite', name: 'Frostbite', desc: 'Standing still chills you.', minDepth: 10, weight: 6, maxTier: 3 },
  { id: 'mod.resistant', name: 'Warded', desc: 'Enemies gain {v}% all resistances.', minDepth: 16, weight: 7, maxTier: 4 },
  { id: 'mod.reflect', name: 'Thorned', desc: 'Enemies reflect {v}% of melee damage.', minDepth: 20, weight: 5, maxTier: 3 },
  { id: 'mod.ambush', name: 'Ambush', desc: 'Packs lie in wait and open from cover.', minDepth: 6, weight: 6, maxTier: 2 },
  { id: 'mod.greed', name: 'Hoard', desc: 'Treasure is {v}% richer, guarded by rares.', minDepth: 1, weight: 8, maxTier: 4 },
  { id: 'mod.fragile', name: 'Brittle Bones', desc: 'You deal {v}% more damage, but lose {v}% of every resistance.', minDepth: 25, weight: 5, maxTier: 3 },
  { id: 'mod.hunted', name: 'Hunted', desc: 'A stalker follows you through every floor.', minDepth: 30, weight: 4, maxTier: 2 },
  { id: 'mod.unstable', name: 'Unstable', desc: 'Elites detonate on death.', minDepth: 22, weight: 5, maxTier: 3 },
  { id: 'mod.drain', name: 'Leeching', desc: 'Enemies drain {v}% of damage dealt as life.', minDepth: 28, weight: 5, maxTier: 3 },
  { id: 'mod.void', name: 'Unravelling', desc: 'Reality tears open, spilling voidspawn.', minDepth: 45, weight: 4, maxTier: 3 },
  { id: 'mod.legion', name: 'Legion', desc: 'Every pack is champion rank or better.', minDepth: 60, weight: 3, maxTier: 2 },
];

/** Encoded as `id@tier` so the sim can read magnitude without a second table. */
export function modifierTier(mod: string): number {
  const at = mod.lastIndexOf('@');
  return at === -1 ? 1 : Number(mod.slice(at + 1)) || 1;
}

export function modifierId(mod: string): string {
  const at = mod.lastIndexOf('@');
  return at === -1 ? mod : mod.slice(0, at);
}

function rollModifiers(depth: number, rng: Rng): string[] {
  // Every run gets at least one.
  //
  // This was `floor(depth / 9)`, so depths 1 to 8 rolled none at all — the one
  // system that makes a run feel different from the last was switched off for
  // the whole early game, which is exactly how "every run feels the same"
  // happens. A second arrives at 7, a third at 15, and so on.
  const count = clamp(1 + Math.floor((depth - 1) / 8), 1, 6);
  const pool = RUN_MODIFIERS.filter((m) => m.minDepth <= depth);
  if (pool.length === 0) return [];
  const chosen: RunModifierDef[] = [];
  const excluded = new Set<string>();
  for (let i = 0; i < count * 4 && chosen.length < count; i++) {
    const m = rng.weighted(pool, (d) =>
      chosen.some((c) => c.id === d.id) || excluded.has(d.id) ? 0 : d.weight,
    );
    if (chosen.some((c) => c.id === m.id) || excluded.has(m.id)) continue;
    chosen.push(m);
    for (const e of m.excludes ?? []) excluded.add(e);
  }
  // Tier rises with depth; deep runs stack heavier versions of the same modifier
  // rather than needing an ever-longer modifier list.
  const tierBase = 1 + Math.floor(depth / 35);
  // And the tier is held down by depth as well as by the modifier's own cap.
  // Now that every run carries a modifier, a tier-2 roll on floor one would be
  // the first thing a brand new character meets.
  const depthCap = 1 + Math.floor(depth / 6);
  return chosen.map((m) => {
    const tier = clamp(tierBase + rng.int(0, 1), 1, Math.min(m.maxTier, depthCap));
    return `${m.id}@${tier}`;
  });
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export const QUESTS: QuestDef[] = [
  {
    id: 'quest.cull',
    name: 'Thin the Ranks',
    flavor: 'They breed faster than we can burn them. Reduce the number.',
    minDepth: 1,
    weight: 10,
    objectives: [{ kind: 'slay', base: 24, perDepth: 1.6, desc: 'Slay {n} denizens' }],
    rewardGold: 1,
    rewardXp: 1,
    rewardItems: 1,
  },
  {
    id: 'quest.headsman',
    name: 'The Headsman’s List',
    flavor: 'Four names. Four heads. The order does not matter.',
    minDepth: 4,
    weight: 9,
    objectives: [{ kind: 'slayElite', base: 3, perDepth: 0.09, desc: 'Destroy {n} elite champions' }],
    rewardGold: 1.3,
    rewardXp: 1.25,
    rewardItems: 2,
  },
  {
    id: 'quest.relics',
    name: 'Relics of the Fallen',
    flavor: 'Whatever they were carrying, it belongs above ground now.',
    minDepth: 2,
    weight: 9,
    // Relics come out of chests, the quest altar, and elites (`scenes/QuestTokens.ts`).
    objectives: [{ kind: 'collect', filter: 'item:relic', base: 5, perDepth: 0.12, desc: 'Recover {n} relics' }],
    rewardGold: 1.5,
    rewardXp: 1,
    rewardItems: 2,
  },
  {
    id: 'quest.cleanse',
    name: 'Break the Seals',
    flavor: 'Someone bound this place shut. Unbind it, and see what was kept in.',
    minDepth: 6,
    weight: 8,
    objectives: [
      { kind: 'cleanse', filter: 'prop:shrine', base: 3, perDepth: 0.05, desc: 'Cleanse {n} shrines' },
      { kind: 'boss', base: 1, perDepth: 0, desc: 'Kill what was sealed' },
    ],
    rewardGold: 1.2,
    rewardXp: 1.4,
    rewardItems: 2,
    modifier: 'mod.elites',
  },
  {
    id: 'quest.descent',
    name: 'The Long Descent',
    flavor: 'Down. Keep going down. You will know when to stop.',
    minDepth: 1,
    weight: 8,
    objectives: [
      { kind: 'reach', filter: 'marker:bottom', base: 1, perDepth: 0, desc: 'Reach the lowest floor' },
      { kind: 'boss', base: 1, perDepth: 0, desc: 'Slay the floor’s master' },
    ],
    rewardGold: 1,
    rewardXp: 1.3,
    rewardItems: 1,
  },
  {
    id: 'quest.vigil',
    name: 'The Vigil',
    flavor: 'Hold the chamber. They will come. All of them.',
    minDepth: 10,
    weight: 7,
    objectives: [
      { kind: 'survive', base: 90, perDepth: 1.2, desc: 'Survive the vigil for {n} seconds' },
      { kind: 'boss', base: 1, perDepth: 0, desc: 'Slay what answers the call' },
    ],
    rewardGold: 1.6,
    rewardXp: 1.5,
    rewardItems: 2,
    modifier: 'mod.swarm',
  },
  {
    id: 'quest.purge',
    name: 'Purge the Brood',
    flavor: 'Kill the young, then kill the thing that made them.',
    minDepth: 14,
    weight: 7,
    objectives: [
      { kind: 'slay', filter: 'insect', base: 30, perDepth: 1.4, desc: 'Exterminate {n} of the brood' },
      { kind: 'boss', base: 1, perDepth: 0, desc: 'Kill the brood-mother' },
    ],
    rewardGold: 1.3,
    rewardXp: 1.4,
    rewardItems: 2,
  },
  {
    id: 'quest.reliquary',
    name: 'The Sealed Reliquary',
    flavor: 'The vault opens for a corpse-key. Make several, in case.',
    minDepth: 18,
    weight: 6,
    objectives: [
      // Keys come off champions and better; the reliquary is the quest altar.
      { kind: 'collect', filter: 'item:key', base: 3, perDepth: 0.06, desc: 'Take {n} corpse-keys' },
      { kind: 'reach', filter: 'marker:altar', base: 1, perDepth: 0, desc: 'Open the reliquary' },
    ],
    rewardGold: 2,
    rewardXp: 1.2,
    rewardItems: 3,
    modifier: 'mod.greed',
  },
  {
    id: 'quest.escort',
    name: 'The Last Cartographer',
    flavor: 'He mapped this place once. He will do it again, if he lives.',
    minDepth: 24,
    weight: 5,
    // Escort finishes itself once everything else is done, so it needs a
    // second objective that can actually be done: the lowest floor.
    objectives: [
      { kind: 'escort', base: 1, perDepth: 0, desc: 'Keep the cartographer alive' },
      { kind: 'reach', filter: 'marker:bottom', base: 1, perDepth: 0, desc: 'Bring him to the lowest floor' },
    ],
    rewardGold: 1.8,
    rewardXp: 1.6,
    rewardItems: 2,
    modifier: 'mod.hunted',
  },
  {
    id: 'quest.unmaking',
    name: 'The Unmaking',
    flavor: 'It is not a place any more. It is a wound. Close it.',
    minDepth: 45,
    weight: 6,
    objectives: [
      { kind: 'cleanse', filter: 'prop:shrine', base: 4, perDepth: 0.04, desc: 'Collapse {n} rifts' },
      { kind: 'slayElite', base: 4, perDepth: 0.06, desc: 'Silence {n} rift-heralds' },
      { kind: 'boss', base: 1, perDepth: 0, desc: 'End the thing on the other side' },
    ],
    rewardGold: 2.4,
    rewardXp: 2,
    rewardItems: 4,
    modifier: 'mod.void',
  },
];

function buildQuest(depth: number, rng: Rng, classId: CharClassId): QuestInstance {
  const pool = QUESTS.filter((q) => q.minDepth <= depth);
  const def = rng.weighted(pool.length > 0 ? pool : QUESTS, (q) => q.weight);
  const objectives: QuestObjective[] = def.objectives.map((o) => {
    const target = Math.max(1, Math.round(o.base + o.perDepth * depth));
    return {
      kind: o.kind,
      desc: o.desc.replace('{n}', String(target)),
      target,
      progress: 0,
      filter: o.filter,
      done: false,
    };
  });
  void classId;
  return {
    defId: def.id,
    name: def.name,
    flavor: def.flavor,
    objectives,
    complete: false,
    turnedIn: false,
  };
}

/** Which room kind, if any, a quest wants planted on each floor. */
function questRoomKind(quest: QuestInstance): DungeonRoom['kind'] | null {
  for (const o of quest.objectives) {
    if (o.kind === 'collect') return 'quest';
    if (o.kind === 'cleanse') return 'shrine';
    if (o.kind === 'survive') return 'quest';
    if (o.kind === 'escort') return 'quest';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Depth curves
// ---------------------------------------------------------------------------

/**
 * Fewest zones in a map: what a run used to have in floors, 3 early and 5
 * deep, so a map never holds fewer fights than a descent did.
 */
export function levelsForDepth(depth: number): number {
  if (depth >= 25) return 5;
  if (depth >= 9) return 4;
  return 3;
}

/**
 * Monster budget for a floor. Grows fast early, then sub-linearly, so depth 200
 * is denser than depth 20 without becoming an unrenderable soup.
 */
export function monsterBudget(depth: number, floorTiles: number, levelIndex: number, levelsTotal: number): number {
  return zoneBudget(depth, floorTiles, levelIndex / Math.max(1, levelsTotal - 1));
}

/** Monster budget for one zone. `heat` runs 0 (first zone) to 1 (boss zone). */
export function zoneBudget(depth: number, floorTiles: number, heat: number): number {
  const curve = 16 + depth * 0.75 + Math.pow(Math.max(0, depth), 1.18) * 0.22;
  // Measured at the old numbers: one monster per 43 walkable tiles, which at a
  // two-metre tile is one every 170 square metres. A floor that size with that
  // many things on it is a walk between fights rather than a fight. The soft
  // cap is what was binding — the area guard below never came near it — so the
  // cap is where the change belongs.
  // A crowd from floor one.
  //
  // This was briefly cut back after a level-one pyromancer could not survive
  // it. That was the wrong end to fix: the crowd is the game, and the class was
  // the problem — a caster whose main attribute bought no damage at all. The
  // attribute is fixed, so the crowd comes back.
  const soft = 100 + 260 * (1 - Math.exp(-curve / 120));
  // Density guard: never more than one monster per ~11 walkable tiles. Still a
  // guard rather than the driver, but it now lets a big open floor carry a
  // crowd proportional to its size instead of the same pack a small one gets.
  const byArea = floorTiles / 11;
  // Later zones of a map are hotter than the first.
  const rampe = 0.85 + 0.3 * clamp(heat, 0, 1);
  // Difficulty widens or thins every floor.
  return Math.max(3, Math.round((Math.max(8, Math.round(Math.min(soft, byArea) * rampe))) * activeDifficulty().packSize));
}

export function eliteDensity(depth: number): number {
  const dif = activeDifficulty();
  // Below the tier's elite floor there are no elite packs at all. This is the
  // single most important early-game lever: a level 1 character meeting a
  // 4.5x-life elite pack on floor 1 simply dies.
  if (depth < dif.eliteFloor) return 0;
  // Capped well below half. This is a *per-pack* roll, and with the pack
  // composition below it decides how many packs have a leader worth noticing —
  // a number that stops meaning anything once most packs have one.
  return clamp((0.05 + depth * 0.0038) * dif.eliteDensity, 0, 0.26);
}

export function championDensity(depth: number): number {
  const dif = activeDifficulty();
  // Champions are the gentler step up, so they arrive one floor earlier.
  if (depth < dif.eliteFloor - 1) return 0;
  // Measured at the old numbers: by depth 21-30 nearly a third of every
  // monster on the floor was a champion and under half were plain. The step up
  // has to stay a step, so the slope and the ceiling both come down.
  return clamp((0.07 + depth * 0.0028) * dif.eliteDensity, 0, 0.2);
}

/** One rank below, for the retinue behind a pack leader. */
const STEP_DOWN: Record<MonsterRank, MonsterRank> = {
  boss: 'elite',
  rare: 'champion',
  elite: 'champion',
  champion: 'normal',
  normal: 'normal',
};

export function affixCountFor(rank: MonsterRank, depth: number): number {
  const extra = activeDifficulty().extraAffixes;
  const base = 1 + Math.floor(depth / 16) + extra;
  if (rank === 'champion') return clamp(base - 1, 1, 3);
  if (rank === 'elite') return clamp(base, 1, 4);
  if (rank === 'rare') return clamp(base + 1, 2, 5);
  if (rank === 'boss') return clamp(base, 2, 5);
  return 0;
}

// ---------------------------------------------------------------------------
// Run generation
// ---------------------------------------------------------------------------

/**
 * What the story layer wants from one descent. An open contract sends the
 * stair to its biome, carries its own quest, and may name the floor boss.
 * Every field is optional; anything left out is rolled as usual.
 */
export interface RunPlan {
  biome?: BiomeId;
  quest?: (biome: BiomeId) => QuestInstance;
  bossId?: string;
}

/** Installed by `sim/Chains.ts`. Generation is unchanged without it. */
export type RunDirector = (depth: number, seed: number) => RunPlan | null;

let director: RunDirector | null = null;

export function setRunDirector(d: RunDirector | null): void {
  director = d;
}

export function generateRun(depth: number, seed: number, classId: CharClassId): DungeonRun {
  const runRng = streamFor(seed, `run:${depth}`);
  const plan = director ? director(depth, seed) : null;
  // The map: a themed chain of zones grouped into areas (world/MapGen.ts).
  // A contract's biome becomes the boss zone.
  const minZones = levelsForDepth(depth);
  const map = planMap(depth, runRng.fork('map'), plan?.biome, minZones);
  const biome = map.bossBiome;
  const rolledQuest = buildQuest(depth, runRng, classId);
  const quest = plan?.quest ? plan.quest(biome) : rolledQuest;
  const modifiers = rollModifiers(depth, runRng);

  // A quest may impose its own modifier on top of the depth roll.
  const questDef = QUESTS.find((q) => q.id === quest.defId);
  if (questDef?.modifier && !modifiers.some((m) => modifierId(m) === questDef.modifier)) {
    const md = RUN_MODIFIERS.find((m) => m.id === questDef.modifier);
    if (md) modifiers.push(`${md.id}@${clamp(1 + Math.floor(depth / 35), 1, md.maxTier)}`);
  }

  const rolledBoss = catalog.bossFor(depth, biome, runRng.fork('boss'));
  const bossId = plan?.bossId ?? rolledBoss;

  // Which dressed version of each biome this map wears. Rolled once per biome
  // so two areas of one biome read as one place, and re-rolled next map.
  const variants = new Map<BiomeId, string | undefined>();
  const variantOf = (b: BiomeId): string | undefined => {
    if (!variants.has(b)) variants.set(b, pickVariant(b, depth, runRng.fork(`variant:${b}`)));
    return variants.get(b);
  };
  const variant = variantOf(biome);

  const zonesTotal = map.info.zones.length;
  // A map whose loads cannot hold the old floor count makes up the crowd.
  const budgetScale = Math.max(1, minZones / zonesTotal);
  const levels: DungeonLevel[] = [];
  const n = map.areas.length;
  for (let i = 0; i < n; i++) {
    const level = generateLevel(depth, i, n, map.areas[i]!, seed, quest, modifiers, {
      zonesTotal,
      budgetScale,
      next: map.areas[i + 1]?.[0],
    });
    level.variant = variantOf(level.biome);
    levels.push(level);
  }

  return { seed, depth, biome, variant, levels, quest, modifiers, bossId, map: map.info };
}

// ---------------------------------------------------------------------------
// Level generation
// ---------------------------------------------------------------------------

/** How an area sits in its map. Without it an area is a whole one-zone map step. */
export interface AreaContext {
  /** Zones in the whole map, for heat. */
  zonesTotal: number;
  /** Multiplier on every zone's monster budget (see generateRun). */
  budgetScale: number;
  /** First zone of the next area, which decides how the way on looks. */
  next?: ZonePlan;
}

/**
 * One area of a map: one or two zones in one grid, one load. `zonesOrBiome`
 * may be a bare biome, which makes a one-zone area (the boss zone when
 * `levelIndex` is the last), for checkers and previews.
 */
export function generateLevel(
  depth: number,
  levelIndex: number,
  levelsTotal: number,
  zonesOrBiome: BiomeId | ZonePlan[],
  seed: number,
  quest?: QuestInstance,
  modifiers?: string[],
  actx?: AreaContext,
): DungeonLevel {
  const zonePlans: ZonePlan[] =
    typeof zonesOrBiome === 'string'
      ? [
          {
            name: getBiome(zonesOrBiome).name,
            biome: zonesOrBiome,
            layout: layoutForBiome(getBiome(zonesOrBiome), streamFor(seed, `layout:${depth}:${levelIndex}`), depth),
            outdoor: isOutdoorBiome(zonesOrBiome),
            role: levelIndex === levelsTotal - 1 ? 'boss' : levelIndex === 0 ? 'start' : 'field',
            order: levelIndex,
          },
        ]
      : zonesOrBiome;
  const biome = zonePlans[0]!.biome;
  const rng = streamFor(seed, `lvl:${depth}:${levelIndex}:${biome}`);
  const biomeDef = getBiome(biome);
  const isBossLevel = zonePlans.some((z) => z.role === 'boss');
  const zonesTotal = actx?.zonesTotal ?? levelsTotal;

  const kind = zonePlans[0]!.layout;
  const area = buildArea({ depth, zones: zonePlans }, rng.fork('area'));

  const g = area.grid;
  const rooms = area.rooms;

  // --- Stairs ------------------------------------------------------------
  // The zone generators leave a landing at both ports. On the boss floor the
  // way on opens in the middle of the arena once the boss is down.
  const entry = area.entry;
  const arenaMid = area.arena ? { x: area.arena.x + (area.arena.w >> 1), y: area.arena.y + (area.arena.h >> 1) } : null;
  const exit = arenaMid ? safeSpot(g, arenaMid, entry) : area.exit;
  const entryRoom = nearestRoom(rooms, entry, 10);
  const exitRoom = arenaMid ? null : nearestRoom(rooms, exit, 10);
  if (entryRoom && entryRoom.kind === 'normal') entryRoom.kind = 'entry';
  if (exitRoom && exitRoom.kind === 'normal' && exitRoom !== entryRoom) exitRoom.kind = 'exit';

  g.set(entry.x, entry.y, T_ARRIVAL);
  g.set(exit.x, exit.y, T_EXIT);
  // Clear a small landing so props and packs never bury the way in or out.
  clearRadius(g, entry.x, entry.y, 2);
  clearRadius(g, exit.x, exit.y, 2);
  g.set(entry.x, entry.y, T_ARRIVAL);
  g.set(exit.x, exit.y, T_EXIT);

  // --- Room roles --------------------------------------------------------
  // Heat of each zone in the whole map: 0 where you arrive, 1 at the boss.
  const heats = area.zones.map((z) => zoneHeat(z.order, zonesTotal));
  const heatAt = (x: number, y: number): number => heats[area.zoneOf[y * g.w + x] ?? 0] ?? 0;
  const roomHeat = (r: DungeonRoom): number => heatAt(Math.round(r.center.x), Math.round(r.center.y));
  assignRoomRoles(rooms, rng, depth, isBossLevel, quest, levelIndex);
  heatRooms(rooms, rng.fork('heat'), depth, roomHeat);

  // --- Build the level record -------------------------------------------
  const roomOf = buildRoomIndex(g, rooms);
  const level: GeneratedLevel = {
    seed,
    depth,
    biome,
    layout: kind,
    width: g.w,
    height: g.h,
    tiles: g.t,
    rooms,
    entry,
    exit,
    spawns: [],
    props: [],
    isBossLevel,
    heights: g.heights,
    roomOf,
    audit: auditLayout(g, rooms, entry),
    zones: area.zones,
    zoneOf: area.zoneOf,
    arena: area.arena,
  };

  // --- Ways on, and the way home ----------------------------------------
  const exitZone = area.zoneOf[exit.y * g.w + exit.x] ?? 0;
  level.exits = [
    isBossLevel
      ? { x: exit.x, y: exit.y, kind: 'portal', facing: area.facing, to: 'town', zone: exitZone }
      : { x: exit.x, y: exit.y, kind: exitKind(zonePlans[zonePlans.length - 1]!, actx?.next), facing: area.facing, to: levelIndex + 1, zone: exitZone },
  ];
  if (levelIndex === 0) level.waypoint = besideSpot(g, entry, 3, 5);

  // --- Spawns ------------------------------------------------------------
  level.spawns = placeSpawns(level, g, rng.fork('spawns'), heats, actx?.budgetScale ?? 1, modifiers);

  // --- Props -------------------------------------------------------------
  let props: PropPlacement[] = [];
  try {
    props = placeProps(level, biomeDef, rng.fork('props'));
  } catch (err) {
    // Prop placement must never take the floor down with it.
    // eslint-disable-next-line no-console
    console.warn('[world] prop placement failed', err);
    props = [];
  }
  // The waypoint ring stands on bare ground.
  const wp = level.waypoint;
  if (wp) props = props.filter((p) => Math.hypot(p.x - wp.x, p.y - wp.y) > 1.6);
  level.props = props;

  // --- Guarantees ----------------------------------------------------------
  // Chest and altar objectives must always be finishable. Treasure rooms and
  // quest rooms are taken from a pool of ordinary rooms that a big-hall layout
  // can run out of, and prop placement can fail to fit a chest, so a floor
  // could end up with neither. Plant one in the open when that happens.
  try {
    ensureInteractables(level, rng.fork('ensure'), quest, levelIndex, levelsTotal);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[world] interactable guarantee failed', err);
  }

  // --- Dungeon events ------------------------------------------------------
  // The boss's area may hold a whole zone before the arena: events go
  // there too, never inside the arena.
  if (eventsOn()) {
    try {
      level.events = placeEvents(level, depth, rng.fork('events'), heatAt);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[world] event placement failed', err);
      level.events = [];
    }
  }

  return level;
}

/** Dungeon events (`scenes/RunEvents.ts`): cursed chests, ambushes, shrines, runners. */
export const EVENTS_ENABLED = true;

let eventsForced: boolean | null = null;
/**
 * For checkers: `true` places every event on every eligible floor, `false`
 * turns placement off, `null` goes back to `EVENTS_ENABLED` and the rates.
 */
export function forceEvents(v: boolean | null): void {
  eventsForced = v;
}
function eventsOn(): boolean {
  return eventsForced ?? EVENTS_ENABLED;
}

/** How often each event appears on a non-boss floor, by depth. */
export const EVENT_RATES: Record<LevelEventKind, { minDepth: number; chance: (depth: number) => number }> = {
  cursedChest: { minDepth: 2, chance: (d) => clamp(0.3 + d * 0.004, 0.3, 0.5) },
  fallenAdventurer: { minDepth: 1, chance: () => 0.3 },
  choiceShrine: { minDepth: 1, chance: (d) => clamp(0.32 + d * 0.003, 0.32, 0.45) },
  treasureRunner: { minDepth: 2, chance: (d) => clamp(0.15 + d * 0.003, 0.15, 0.3) },
};

/** The prop each event is drawn as, and the payload the scene dispatches on. */
export const EVENT_PROPS: Partial<Record<LevelEventKind, { kind: string; interact: string }>> = {
  cursedChest: { kind: 'chest', interact: 'chest.cursed' },
  fallenAdventurer: { kind: 'bonepile', interact: 'corpse.ambush' },
  choiceShrine: { kind: 'shrine', interact: 'shrine.choice' },
};

/** Minimum Manhattan distance from either stair for a planted prop. */
export const PLANT_STAIR_CLEARANCE = 6;

/**
 * Finds open tiles for set pieces: fully surrounded by floor, well clear of
 * the stairs, not on a spawn or another prop, one per room, room centres
 * first. Rooms are tried in the order given; `anywhere` falls back to a scan
 * of the whole floor when every room is used up or too cramped.
 */
class Planter {
  private taken = new Set<number>();
  private usedRooms = new Set<number>();
  constructor(
    private level: DungeonLevel,
    private rng: Rng,
  ) {
    for (const p of level.props) this.taken.add(this.key(p.x, p.y));
    for (const s of level.spawns) this.taken.add(this.key(s.x, s.y));
  }
  private key(x: number, y: number): number {
    return y * this.level.width + x;
  }
  open(x: number, y: number): boolean {
    const L = this.level;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= L.width || yy >= L.height) return false;
        const v = L.tiles[this.key(xx, yy)];
        if (v !== T_FLOOR && v !== T_RUBBLE) return false;
        if (this.taken.has(this.key(xx, yy))) return false;
      }
    }
    const far = (p: Vec2) => Math.abs(p.x - x) + Math.abs(p.y - y) >= PLANT_STAIR_CLEARANCE;
    return far(L.entry) && far(L.exit);
  }
  spot(rooms: DungeonRoom[], fallback: 'none' | 'open' | 'deadEnd'): Vec2 | null {
    for (const r of rooms) {
      if (this.usedRooms.has(r.id)) continue;
      const cx = Math.round(r.center.x);
      const cy = Math.round(r.center.y);
      for (let ring = 0; ring <= 2; ring++) {
        for (let dy = -ring; dy <= ring; dy++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            if (!this.open(cx + dx, cy + dy)) continue;
            this.usedRooms.add(r.id);
            return this.claim(cx + dx, cy + dy);
          }
        }
      }
    }
    if (fallback === 'none') return null;
    // Then anywhere open on the floor. Failing that (a maze is all one-wide
    // corridor), the end of a dead end, where a prop blocks nothing, and then
    // any corridor tile on a loop, whose blocking still leaves every tile
    // reachable from the entry.
    const tests = [(x: number, y: number) => this.open(x, y)];
    if (fallback === 'deadEnd') {
      tests.push((x: number, y: number) => this.deadEnd(x, y));
      let floods = 0;
      tests.push((x: number, y: number) => this.corridor(x, y) && floods++ < 200 && this.noCut(x, y));
    }
    for (const test of tests) {
      const L = this.level;
      const n = L.width * L.height;
      const start = this.rng.int(0, n - 1);
      // 7919 is prime and divides no grid size, so this visits every tile.
      for (let k = 0; k < n; k++) {
        const i = (start + k * 7919) % n;
        const x = i % L.width;
        const y = Math.floor(i / L.width);
        if (test(x, y)) return this.claim(x, y);
      }
    }
    return null;
  }
  /** A floor tile with exactly one way in, clear of the stairs and of everything placed. */
  deadEnd(x: number, y: number): boolean {
    const L = this.level;
    if (x < 1 || y < 1 || x >= L.width - 1 || y >= L.height - 1) return false;
    const v = L.tiles[this.key(x, y)];
    if ((v !== T_FLOOR && v !== T_RUBBLE) || this.taken.has(this.key(x, y))) return false;
    let ways = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (isWalkableValue(L.tiles[this.key(x + dx, y + dy)]!)) ways++;
    }
    const far = (p: Vec2) => Math.abs(p.x - x) + Math.abs(p.y - y) >= PLANT_STAIR_CLEARANCE;
    return ways === 1 && far(L.entry) && far(L.exit);
  }
  /** Bare floor in the clear of the stairs: a candidate for `noCut`. */
  private corridor(x: number, y: number): boolean {
    const L = this.level;
    if (x < 1 || y < 1 || x >= L.width - 1 || y >= L.height - 1) return false;
    const v = L.tiles[this.key(x, y)];
    if ((v !== T_FLOOR && v !== T_RUBBLE) || this.taken.has(this.key(x, y))) return false;
    const far = (p: Vec2) => Math.abs(p.x - x) + Math.abs(p.y - y) >= PLANT_STAIR_CLEARANCE;
    return far(L.entry) && far(L.exit);
  }
  /** Tiles this planter has blocked by planting on a corridor. */
  private blocked = new Set<number>();
  private reachBase = -1;
  private reachCount(extra: number): number {
    const L = this.level;
    const seen = new Uint8Array(L.width * L.height);
    const start = this.key(L.entry.x, L.entry.y);
    const stack = [start];
    seen[start] = 1;
    let n = 0;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const x = i % L.width;
      const y = (i / L.width) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= L.width || yy >= L.height) continue;
        const j = this.key(xx, yy);
        if (seen[j] || j === extra || this.blocked.has(j) || !isWalkableValue(L.tiles[j]!)) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    return n;
  }
  /** Blocking this tile leaves everything else as reachable as before. */
  private noCut(x: number, y: number): boolean {
    if (this.reachBase < 0) this.reachBase = this.reachCount(-1);
    const k = this.key(x, y);
    if (this.reachCount(k) !== this.reachBase - 1) return false;
    this.blocked.add(k);
    this.reachBase -= 1;
    return true;
  }
  private claim(x: number, y: number): Vec2 {
    this.taken.add(this.key(x, y));
    return { x, y };
  }
}

/** True for a chest the player can simply open (not barred, not cursed). */
export function isPlainChest(p: PropPlacement): boolean {
  return p.interact === 'chest.normal' || p.interact === 'chest.rare';
}

/** Plants a chest on every floor that has none, and the quest altar where one is owed. */
function ensureInteractables(
  level: DungeonLevel,
  rng: Rng,
  quest: QuestInstance | undefined,
  levelIndex: number,
  levelsTotal: number,
): void {
  const wantsAltar = !!quest && questRoomKind(quest) === 'quest' && levelIndex >= 1 && !level.isBossLevel;
  const hasChest = level.props.some(isPlainChest);
  const hasAltar = level.props.some((p) => p.interact === 'quest.altar');
  // A cleanse quest's shrines, spread evenly over the run with one to spare.
  const cleanse = quest?.objectives.find((o) => o.kind === 'cleanse');
  const shrinesWanted = cleanse ? Math.ceil((cleanse.target + 1) / Math.max(1, levelsTotal)) : 0;
  const shrines = level.props.filter(isQuestShrine).length;
  if (hasChest && (hasAltar || !wantsAltar) && shrines >= shrinesWanted) return;
  const planter = new Planter(level, rng);
  const pref = (kinds: DungeonRoom['kind'][]) => {
    const out = level.rooms.filter((r) => kinds.includes(r.kind));
    rng.shuffle(out);
    return out;
  };
  // Last resort on a floor with no open ground and no dead ends (a braided
  // maze packed with props): turn a barrel or crate into the thing. Both
  // already block their tile, so the floor's connectivity is unchanged.
  const breakables = level.props.filter(
    (p) => (p.kind === 'barrel' || p.kind === 'crate') && farFrom(p, level.entry) && farFrom(p, level.exit),
  );
  rng.shuffle(breakables);
  const plant = (rooms: DungeonRoom[], kind: string, interact: string, rotation: number): boolean => {
    const at = planter.spot(rooms, 'deadEnd');
    if (at) {
      level.props.push({ x: at.x, y: at.y, rotation, kind, interact });
      return true;
    }
    const b = breakables.pop();
    if (!b) return false;
    b.kind = kind;
    b.interact = interact;
    return true;
  };
  if (!hasChest) plant(pref(['treasure', 'normal', 'ambush', 'shrine']), 'chest', 'chest.rare', rng.range(0, Math.PI * 2));
  if (wantsAltar && !hasAltar) plant(pref(['quest', 'normal', 'treasure', 'shrine']), 'altar', 'quest.altar', 0);
  const shrineRooms = pref(['shrine', 'normal', 'ambush', 'treasure']);
  for (let i = shrines; i < shrinesWanted; i++) {
    if (!plant(shrineRooms, 'shrine', `shrine.${rng.pick(QUEST_SHRINE_TYPES)}`, 0)) break;
  }
}

function farFrom(p: Vec2, stair: Vec2): boolean {
  return Math.abs(p.x - stair.x) + Math.abs(p.y - stair.y) >= PLANT_STAIR_CLEARANCE;
}

const QUEST_SHRINE_TYPES = ['power', 'ward', 'haste', 'fortune', 'wrath', 'vitality'];

/** An ordinary blessing shrine, the kind a cleanse quest counts. */
export function isQuestShrine(p: PropPlacement): boolean {
  return !!p.interact && p.interact.startsWith('shrine.') && p.interact !== 'shrine.choice';
}

/**
 * Picks this floor's events and finds each one an open tile in an ordinary
 * room. An event that cannot find a tile is simply skipped.
 */
function placeEvents(
  level: DungeonLevel,
  depth: number,
  rng: Rng,
  heatAt: (x: number, y: number) => number = () => 0,
): LevelEvent[] {
  const out: LevelEvent[] = [];
  const planter = new Planter(level, rng);
  const arena = level.arena;
  const inArena = (x: number, y: number): boolean =>
    !!arena && x >= arena.x - 3 && y >= arena.y - 3 && x < arena.x + arena.w + 3 && y < arena.y + arena.h + 3;
  const rooms = level.rooms.filter((r) => r.kind === 'normal' && r.w >= 5 && r.h >= 5 && !inArena(Math.round(r.center.x), Math.round(r.center.y)));
  rng.shuffle(rooms);
  // Deeper into the map, rooms come first in the hotter zones and every event
  // is likelier (never less likely than on the old floors).
  rooms.sort((a, b) => heatAt(Math.round(b.center.x), Math.round(b.center.y)) - heatAt(Math.round(a.center.x), Math.round(a.center.y)));
  let areaHeat = 0;
  for (const r of rooms) areaHeat = Math.max(areaHeat, heatAt(Math.round(r.center.x), Math.round(r.center.y)));
  for (const kind of Object.keys(EVENT_RATES) as LevelEventKind[]) {
    const rate = EVENT_RATES[kind];
    if (depth < rate.minDepth) continue;
    if (eventsForced !== true && !rng.chance(Math.min(1, rate.chance(depth) * (1 + 0.5 * areaHeat)))) continue;
    // Rooms first; a floor short of ordinary rooms (one great nave) uses any open ground.
    const at = planter.spot(rooms, 'open');
    if (!at || inArena(at.x, at.y)) continue;
    out.push({ kind, x: at.x, y: at.y });
    const prop = EVENT_PROPS[kind];
    if (prop) level.props.push({ x: at.x, y: at.y, rotation: rng.range(0, Math.PI * 2), kind: prop.kind, interact: prop.interact });
  }
  return out;
}

/** How the way from one area into the next looks. */
function exitKind(from: ZonePlan, to: ZonePlan | undefined): MapExit['kind'] {
  if (!to) return 'stairs';
  if (!to.outdoor) {
    if (to.layout === 'cave') return 'caveMouth';
    if (to.layout === 'rift') return 'stairs';
    return 'doorway';
  }
  // Out of a building or a cave into the open: steps up to the daylight.
  return from.outdoor ? 'doorway' : 'stairs';
}

/** An open tile between `dmin` and `dmax` tiles from `p`, with all eight neighbours walkable. */
function besideSpot(g: Grid, p: Vec2, dmin: number, dmax: number): Vec2 {
  let best: Vec2 | null = null;
  let bd = Infinity;
  for (let dy = -dmax; dy <= dmax; dy++) {
    for (let dx = -dmax; dx <= dmax; dx++) {
      const d = Math.hypot(dx, dy);
      if (d < dmin || d > dmax) continue;
      const x = p.x + dx;
      const y = p.y + dy;
      if (g.get(x, y) !== T_FLOOR) continue;
      let open = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (g.walkable(x + ox, y + oy)) open++;
      if (open < 9) continue;
      const score = Math.abs(d - (dmin + dmax) / 2);
      if (score < bd) {
        bd = score;
        best = { x, y };
      }
    }
  }
  return best ?? safeSpot(g, p, p);
}

/** The room whose centre is nearest `p`, if any is within `maxD` tiles. */
function nearestRoom(rooms: DungeonRoom[], p: Vec2, maxD: number): DungeonRoom | null {
  let best: DungeonRoom | null = null;
  let bd = maxD;
  for (const r of rooms) {
    const d = Math.hypot(r.center.x - p.x, r.center.y - p.y);
    if (d <= bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

function firstWalkable(g: Grid): Vec2 {
  for (let i = 0; i < g.t.length; i++) {
    if (isWalkableValue(g.t[i])) return { x: i % g.w, y: (i / g.w) | 0 };
  }
  return { x: 1, y: 1 };
}

function lastWalkable(g: Grid): Vec2 {
  for (let i = g.t.length - 1; i >= 0; i--) {
    if (isWalkableValue(g.t[i])) return { x: i % g.w, y: (i / g.w) | 0 };
  }
  return { x: 1, y: 1 };
}

/** Nudge a point onto open floor with breathing room around it. */
function safeSpot(g: Grid, want: Vec2, avoid?: Vec2): Vec2 {
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  const R = 10;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const x = want.x + dx;
      const y = want.y + dy;
      if (!g.walkable(x, y)) continue;
      let open = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (g.walkable(x + ox, y + oy)) open++;
      if (open < 8) continue;
      let score = open * 4 - Math.sqrt(dx * dx + dy * dy);
      if (avoid) score += Math.min(30, Math.hypot(x - avoid.x, y - avoid.y)) * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  if (best) return best;
  return g.walkable(want.x, want.y) ? want : firstWalkable(g);
}

function clearRadius(g: Grid, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const v = g.get(x, y);
      if (v === T_WATER || v === T_LAVA || v === T_CHASM || v === T_RUBBLE) g.set(x, y, T_FLOOR);
    }
  }
}

/** BFS distance field from a source, used to place the exit far from the entry. */
function distanceField(g: Grid, from: Vec2): Int32Array {
  const n = g.w * g.h;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const s = from.y * g.w + from.x;
  if (!isWalkableValue(g.t[s])) return dist;
  dist[s] = 0;
  queue[tail++] = s;
  while (head < tail) {
    const c = queue[head++];
    const cx = c % g.w;
    const cy = (c / g.w) | 0;
    const d = dist[c] + 1;
    const step = (nb: number): void => {
      if (dist[nb] !== -1 || !isWalkableValue(g.t[nb])) return;
      dist[nb] = d;
      queue[tail++] = nb;
    };
    if (cx > 0) step(c - 1);
    if (cx < g.w - 1) step(c + 1);
    if (cy > 0) step(c - g.w);
    if (cy < g.h - 1) step(c + g.w);
  }
  return dist;
}

/**
 * Rewards rise through a map. On top of the base roles, hotter zones get
 * more treasure, vaults and shrines, and more ambushes. Rolled on its own
 * stream after the base roles, so the base rolls are unchanged.
 */
function heatRooms(rooms: DungeonRoom[], rng: Rng, depth: number, heatOf: (r: DungeonRoom) => number): void {
  const free = rooms.filter((r) => r.kind === 'normal' && heatOf(r) > 0);
  if (free.length === 0) return;
  // Hottest first, with a little noise so it is not always the last room.
  const key = new Map(free.map((r) => [r, heatOf(r) + rng.range(0, 0.35)] as const));
  free.sort((a, b) => key.get(b)! - key.get(a)!);
  let i = 0;
  const take = (): DungeonRoom | null => (i < free.length ? free[i++]! : null);
  const h = heatOf(free[0]!);
  if (rng.chance(0.55 * h)) {
    const r = take();
    if (r) r.kind = 'treasure';
  }
  if (rng.chance(clamp(0.1 + depth * 0.005, 0.1, 0.45) * h)) {
    const r = take();
    if (r) r.kind = 'vault';
  }
  if (rng.chance(0.4 * h)) {
    const r = take();
    if (r) r.kind = 'shrine';
  }
  const ambush = Math.round(h * 1.5);
  for (let a = 0; a < ambush; a++) {
    const r = take();
    if (r) r.kind = 'ambush';
  }
}

function assignRoomRoles(
  rooms: DungeonRoom[],
  rng: Rng,
  depth: number,
  bossLevel: boolean,
  quest: QuestInstance | undefined,
  levelIndex: number,
): void {
  const free = rooms.filter((r) => r.kind === 'normal');
  rng.shuffle(free);

  const area = (r: DungeonRoom): number => r.w * r.h;
  let i = 0;
  const take = (): DungeonRoom | null => (i < free.length ? free[i++] : null);

  // Treasure: one guaranteed, plus a depth-scaled chance at a second and a vault.
  const treasureCount = 1 + (rng.chance(clamp(0.2 + depth * 0.006, 0.2, 0.6)) ? 1 : 0);
  for (let t = 0; t < treasureCount; t++) {
    const r = take();
    if (r) r.kind = 'treasure';
  }
  if (!bossLevel && rng.chance(clamp(0.1 + depth * 0.005, 0.1, 0.45))) {
    const r = take();
    if (r) r.kind = 'vault';
  }

  // Shrines — always at least one per floor, more when a quest wants them.
  const wantsShrines = quest?.objectives.some((o) => o.kind === 'cleanse') ?? false;
  const shrineCount = wantsShrines ? rng.int(2, 3) : rng.chance(0.7) ? 1 : 0;
  for (let s = 0; s < shrineCount; s++) {
    const r = take();
    if (r) r.kind = 'shrine';
  }

  // Ambushes scale hard with depth — the deep floors should feel trapped.
  const ambushCount = clamp(Math.round(1 + depth * 0.035), 1, 5);
  for (let a = 0; a < ambushCount; a++) {
    const r = take();
    if (r) r.kind = 'ambush';
  }

  // Quest room, placed once per run on a deterministic floor.
  const qk = quest ? questRoomKind(quest) : null;
  if (qk && qk !== 'shrine' && levelIndex >= 1) {
    const r = take();
    if (r) r.kind = qk;
  }

  // Biggest remaining normal room on a boss floor becomes the arena if the
  // layout did not already mark one.
  if (bossLevel && !rooms.some((r) => r.kind === 'boss')) {
    let biggest: DungeonRoom | null = null;
    for (const r of rooms) if (!biggest || area(r) > area(biggest)) biggest = r;
    if (biggest) biggest.kind = 'boss';
  }
}

function buildRoomIndex(g: Grid, rooms: DungeonRoom[]): Int16Array {
  const roomOf = new Int16Array(g.w * g.h).fill(-1);
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
        if (!isWalkableValue(g.t[y * g.w + x])) continue;
        roomOf[y * g.w + x] = r.id;
      }
    }
  }
  return roomOf;
}

// ---------------------------------------------------------------------------
// Spawn placement
// ---------------------------------------------------------------------------

function placeSpawns(
  level: GeneratedLevel,
  g: Grid,
  rng: Rng,
  heats: number[],
  budgetScale: number,
  modifiers: string[] | undefined,
): SpawnPoint[] {
  const depth = level.depth;
  const zones = level.zones ?? [];
  const nz = Math.max(1, zones.length);
  const zoneOfTile = (i: number): number => Math.min(nz - 1, level.zoneOf ? level.zoneOf[i] ?? 0 : 0);
  const floorTiles = new Array<number>(nz).fill(0);
  for (let i = 0; i < g.t.length; i++) if (isWalkableValue(g.t[i])) floorTiles[zoneOfTile(i)]!++;

  const mods = modifiers ?? [];
  const has = (id: string): number => {
    const m = mods.find((x) => modifierId(x) === id);
    return m ? modifierTier(m) : 0;
  };

  const swarmTier = has('mod.swarm');
  const eliteTier = has('mod.elites');
  const legion = has('mod.legion') > 0;

  // One budget per zone, each by its own ground and heat.
  const budgets = floorTiles.map((tiles, z) => {
    let b = zoneBudget(depth, tiles, heats[z] ?? 0);
    b = Math.round(b * budgetScale * (1 + swarmTier * 0.14));
    // The boss zone is the boss's. A crowd this size on top of a boss fight is
    // not harder, it is just noise on top of the thing you came for.
    if (zones[z]?.role === 'boss') b = Math.round(b * 0.45);
    return b;
  });
  const placedIn = new Array<number>(nz).fill(0);
  const full = (): boolean => placedIn.every((p, z) => p >= budgets[z]!);

  const eliteChance = eliteDensity(depth) * (1 + eliteTier * 0.25);
  const champChance = championDensity(depth);

  const spawns: SpawnPoint[] = [];
  let packId = 0;

  // Distance from the entry, so we never drop a pack on the player's head.
  const dist = distanceField(g, level.entry);

  // Candidate tiles: walkable, not a stair landing, with elbow room.
  const candidates: number[] = [];
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      const i = y * g.w + x;
      if (!isWalkableValue(g.t[i])) continue;
      if (g.t[i] === T_ARRIVAL || g.t[i] === T_EXIT || g.t[i] === T_DOOR) continue;
      if (dist[i] < 9) continue;
      let open = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (g.walkable(x + ox, y + oy)) open++;
      if (open < 7) continue;
      candidates.push(i);
    }
  }
  if (candidates.length === 0) return spawns;
  rng.shuffle(candidates);

  // Each zone fields its own biome's monsters.
  const idsByZone = Array.from({ length: nz }, (_, z) => {
    const b = zones[z]?.biome ?? level.biome;
    return Array.from(new Set(catalog.pick(depth, b, rng.fork(z === 0 ? 'ids' : `ids${z}`), 24)));
  });
  let zoneNow = 0;
  const pickId = (): string => {
    const ids = idsByZone[zoneNow]!;
    return ids.length > 0 ? rng.pick(ids) : 'skeleton';
  };

  const usedTile = new Set<number>();
  let cursor = 0;

  const roomKindAt = (i: number): DungeonRoom['kind'] => {
    const rid = level.roomOf[i];
    if (rid < 0) return 'normal';
    const room = level.rooms.find((r) => r.id === rid);
    return room ? room.kind : 'normal';
  };

  while (!full() && cursor < candidates.length) {
    const seed = candidates[cursor++];
    if (usedTile.has(seed)) continue;
    zoneNow = zoneOfTile(seed);
    if (placedIn[zoneNow]! >= budgets[zoneNow]!) continue;
    const sx = seed % g.w;
    const sy = (seed / g.w) | 0;

    const kindHere = roomKindAt(seed);
    if (kindHere === 'entry') continue;

    // Pack rank.
    let rank: MonsterRank = 'normal';
    const roll = rng.next();
    if (kindHere === 'treasure' || kindHere === 'vault') {
      rank = roll < 0.55 ? 'rare' : 'elite';
    } else if (kindHere === 'ambush') {
      rank = roll < eliteChance * 1.6 ? 'elite' : 'champion';
    } else if (roll < eliteChance * 0.35) {
      rank = 'rare';
    } else if (roll < eliteChance) {
      rank = 'elite';
    } else if (roll < eliteChance + champChance) {
      rank = 'champion';
    } else if (legion) {
      rank = 'champion';
    }

    // Pack size.
    let packSize: number;
    if (rank === 'rare') packSize = rng.int(3, 5);
    else if (rank === 'elite') packSize = rng.int(3, 6);
    else if (rank === 'champion') packSize = rng.int(2, 4);
    else packSize = rng.int(2, 5);
    packSize = Math.max(1, Math.round(packSize * (1 + swarmTier * 0.12)));
    if (kindHere === 'ambush') packSize = Math.round(packSize * 1.5);

    const affixCount = affixCountFor(rank, depth);
    const packAffixes = affixCount > 0 ? catalog.affixes(depth, rng.fork(`aff${packId}`), affixCount) : [];
    const leaderId = pickId();
    const id = packId++;

    // A rare pack's leader is sometimes somebody in particular.
    //
    // Rare packs are already the rarest thing on a floor, and a generated name
    // like "Frenzied Skeleton" is a thing that happens rather than a thing that
    // happened. Roughly a third of them now carry a name you could tell someone
    // about, which works out at about one per two floors.
    const named =
      rank === 'rare' && rng.chance(0.34)
        ? catalog.nameFor?.(leaderId, zones[zoneNow]?.biome ?? level.biome, depth, rng.fork(`name${id}`)) ?? null
        : null;

    // Spread the pack across nearby open tiles.
    const spots = gatherPackSpots(g, sx, sy, packSize, usedTile);
    for (let k = 0; k < spots.length; k++) {
      const t = spots[k];
      usedTile.add(t);
      // A special pack is a leader with a retinue, not a pack of clones.
      //
      // Rare packs already worked this way; elite and champion packs did not,
      // so a single elite roll put six elites on the floor at once and by depth
      // 25 half of everything you met was above normal rank. Now the front of
      // the pack carries the rank and the rest sit one step down, which keeps
      // the number of *packs* worth noticing while cutting the headcount.
      const leaders = Math.max(1, Math.round(spots.length * 0.34));
      const memberRank: MonsterRank = k < leaders ? rank : STEP_DOWN[rank];
      spawns.push({
        x: t % g.w,
        y: (t / g.w) | 0,
        // The named one is always the leader, and always the pack's own
        // monster — a retinue of something else reads as two packs overlapping.
        monsterId: named && k === 0 ? leaderId : rng.chance(0.72) ? leaderId : pickId(),
        rank: memberRank,
        affixes: memberRank === 'normal' ? [] : packAffixes,
        packId: id,
        named: named && k === 0 ? named : undefined,
      });
      placedIn[zoneNow]!++;
    }
  }

  return spawns;
}

/** Flood outward from a seed collecting `count` free walkable tiles. */
function gatherPackSpots(g: Grid, sx: number, sy: number, count: number, used: Set<number>): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const queue: number[] = [sy * g.w + sx];
  seen.add(queue[0]);
  while (queue.length > 0 && out.length < count) {
    const c = queue.shift() as number;
    if (!used.has(c) && isWalkableValue(g.t[c])) {
      const v = g.t[c];
      if (v !== T_ARRIVAL && v !== T_EXIT) out.push(c);
    }
    const cx = c % g.w;
    const cy = (c / g.w) | 0;
    if (Math.abs(cx - sx) > 4 || Math.abs(cy - sy) > 4) continue;
    const nbs = [c - 1, c + 1, c - g.w, c + g.w];
    for (const nb of nbs) {
      if (nb < 0 || nb >= g.t.length || seen.has(nb)) continue;
      seen.add(nb);
      if (isWalkableValue(g.t[nb])) queue.push(nb);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Utilities used by scenes / debug
// ---------------------------------------------------------------------------

/** All rooms of a given kind. */
export function roomsOfKind(level: DungeonLevel, kind: DungeonRoom['kind']): DungeonRoom[] {
  return level.rooms.filter((r) => r.kind === kind);
}

/** The room containing a tile, or null. */
export function roomAt(level: DungeonLevel, x: number, y: number): DungeonRoom | null {
  const ex = levelExtras(level);
  if (ex) {
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return null;
    const id = ex.roomOf[y * level.width + x];
    if (id < 0) return null;
    return level.rooms.find((r) => r.id === id) ?? null;
  }
  for (const r of level.rooms) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
  }
  return null;
}

/** The zone a tile belongs to, or null on a level without zones. */
export function zoneAt(level: DungeonLevel, x: number, y: number): MapZone | null {
  const zones = level.zones;
  if (!zones || zones.length === 0) return null;
  if (!level.zoneOf || x < 0 || y < 0 || x >= level.width || y >= level.height) return zones[0] ?? null;
  return zones[level.zoneOf[y * level.width + x]!] ?? zones[0] ?? null;
}

/** Height step at a tile, 0 when the level carries no height field. */
export function heightAt(level: DungeonLevel, x: number, y: number): number {
  const ex = levelExtras(level);
  if (!ex) return 0;
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return 0;
  return ex.heights[y * level.width + x];
}

/** A standalone preview level, used by the screenshot harness. */
export function previewLevel(biome: BiomeId, layout: LayoutKind, seed = 1234, depth = 10): DungeonLevel {
  const rng = new Random(seed);
  const out = buildArea(
    { depth, zones: [{ name: getBiome(biome).name, biome, layout, outdoor: isOutdoorBiome(biome), role: 'start', order: 0 }] },
    rng.fork('area'),
  );
  const g = out.grid;
  const entry = out.entry;
  const exit = out.exit;
  g.set(entry.x, entry.y, T_ARRIVAL);
  g.set(exit.x, exit.y, T_EXIT);
  const level: GeneratedLevel = {
    seed,
    depth,
    biome,
    layout,
    width: g.w,
    height: g.h,
    tiles: g.t,
    rooms: out.rooms,
    entry,
    exit,
    spawns: [],
    props: [],
    isBossLevel: false,
    heights: g.heights,
    roomOf: buildRoomIndex(g, out.rooms),
    audit: auditLayout(g, out.rooms, entry),
    zones: out.zones,
    zoneOf: out.zoneOf,
  };
  level.props = placeProps(level, getBiome(biome), rng.fork('props'));
  return level;
}

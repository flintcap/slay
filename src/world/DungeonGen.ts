/**
 * SLAY — dungeon generation.
 *
 * `generateRun` builds a whole descent: several levels sharing a biome and a
 * quest, ending on a boss arena. `generateLevel` turns a layout into a playable
 * floor — stairs, room roles, monster packs, treasure, shrines, ambushes and
 * props.
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
import { BIOMES as BIOME_LIST, biomeForDepth, getBiome, layoutForBiome, pickVariant } from './Biomes';
import {
  Grid,
  TILE_VALUES,
  T_CHASM,
  T_DOOR,
  T_FLOOR,
  T_LAVA,
  T_RUBBLE,
  T_STAIRS_DOWN,
  T_STAIRS_UP,
  T_WATER,
  auditLayout,
  buildLayout,
  isWalkableValue,
  layoutSizeFor,
} from './Layouts';
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
  'stairsDown',
  'stairsUp',
  'rubble',
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
const FALLBACK_MONSTERS: Record<BiomeId, string[]> = {
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

const FALLBACK_BOSSES: Record<BiomeId, string[]> = {
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
    const pool = FALLBACK_MONSTERS[biome] ?? FALLBACK_MONSTERS.crypt;
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
    const pool = FALLBACK_BOSSES[biome] ?? FALLBACK_BOSSES.crypt;
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
  { id: 'mod.fragile', name: 'Brittle Bones', desc: 'You take {v}% more damage but deal {v}% more.', minDepth: 25, weight: 5, maxTier: 3 },
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
    objectives: [{ kind: 'collect', filter: 'relic', base: 5, perDepth: 0.12, desc: 'Recover {n} relics' }],
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
      { kind: 'cleanse', base: 3, perDepth: 0.05, desc: 'Cleanse {n} shrines' },
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
      { kind: 'reach', base: 1, perDepth: 0, desc: 'Reach the lowest floor' },
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
      { kind: 'collect', filter: 'key', base: 3, perDepth: 0.06, desc: 'Take {n} corpse-keys' },
      { kind: 'reach', base: 1, perDepth: 0, desc: 'Open the reliquary' },
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
    objectives: [{ kind: 'escort', base: 1, perDepth: 0, desc: 'Bring the cartographer to the stair' }],
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
      { kind: 'cleanse', base: 4, perDepth: 0.04, desc: 'Collapse {n} rifts' },
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

/** Number of floors in a run. 3 early, 5 once the player is deep. */
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
  const curve = 16 + depth * 0.75 + Math.pow(Math.max(0, depth), 1.18) * 0.22;
  // Measured at the old numbers: one monster per 43 walkable tiles, which at a
  // two-metre tile is one every 170 square metres. A floor that size with that
  // many things on it is a walk between fights rather than a fight. The soft
  // cap is what was binding — the area guard below never came near it — so the
  // cap is where the change belongs.
  // Shaped on depth, not on the combat curve, and starting low.
  //
  // The previous shape had a flat base of a hundred, which applied at depth one
  // as much as at depth fifty: floor one went from about fifty monsters to a
  // hundred and fourteen, against a level-one character with seventy-five life.
  // The ask was for a lot more monsters, and this still delivers roughly double
  // from depth ten on — it just lets the first couple of floors be the first
  // couple of floors.
  const soft = 44 + 220 * (1 - Math.exp(-depth / 18));
  // Density guard: never more than one monster per ~11 walkable tiles. Still a
  // guard rather than the driver, but it now lets a big open floor carry a
  // crowd proportional to its size instead of the same pack a small one gets.
  const byArea = floorTiles / 11;
  // Later floors of a run are hotter than the first.
  const rampe = 0.85 + 0.3 * (levelIndex / Math.max(1, levelsTotal - 1));
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

export function generateRun(depth: number, seed: number, classId: CharClassId): DungeonRun {
  const runRng = streamFor(seed, `run:${depth}`);
  const biome = biomeForDepth(depth, runRng);
  const levelsTotal = levelsForDepth(depth);
  const quest = buildQuest(depth, runRng, classId);
  const modifiers = rollModifiers(depth, runRng);

  // A quest may impose its own modifier on top of the depth roll.
  const questDef = QUESTS.find((q) => q.id === quest.defId);
  if (questDef?.modifier && !modifiers.some((m) => modifierId(m) === questDef.modifier)) {
    const md = RUN_MODIFIERS.find((m) => m.id === questDef.modifier);
    if (md) modifiers.push(`${md.id}@${clamp(1 + Math.floor(depth / 35), 1, md.maxTier)}`);
  }

  const bossId = catalog.bossFor(depth, biome, runRng.fork('boss'));

  // Which dressed version of the biome this descent wears. Rolled once for the
  // whole run so the floors read as one place, and re-rolled next run so two
  // descents into the same biome are not the same descent.
  const variant = pickVariant(biome, depth, runRng.fork('variant'));

  const levels: DungeonLevel[] = [];
  for (let i = 0; i < levelsTotal; i++) {
    const level = generateLevel(depth, i, levelsTotal, biome, seed, quest, modifiers);
    level.variant = variant;
    levels.push(level);
  }

  return { seed, depth, biome, variant, levels, quest, modifiers, bossId };
}

// ---------------------------------------------------------------------------
// Level generation
// ---------------------------------------------------------------------------

export function generateLevel(
  depth: number,
  levelIndex: number,
  levelsTotal: number,
  biome: BiomeId,
  seed: number,
  quest?: QuestInstance,
  modifiers?: string[],
): DungeonLevel {
  const rng = streamFor(seed, `lvl:${depth}:${levelIndex}:${biome}`);
  const biomeDef = getBiome(biome);
  const isBossLevel = levelIndex === levelsTotal - 1;

  const kind = pickLayoutKind(biomeDef, rng, depth, isBossLevel);
  const size = layoutSizeFor(depth, kind, rng);
  const layout = buildLayout(kind, {
    width: size.w,
    height: size.h,
    rng,
    depth,
    seed: (seed ^ (levelIndex * 0x9e37)) >>> 0,
    boss: isBossLevel,
  });

  const g = layout.grid;
  const rooms = layout.rooms;

  // --- Stairs ------------------------------------------------------------
  const { entryRoom, exitRoom } = pickEntryExit(g, rooms, isBossLevel);
  const entry = safeSpot(g, entryRoom ? entryRoom.center : firstWalkable(g));
  const exit = safeSpot(g, exitRoom ? exitRoom.center : lastWalkable(g), entry);
  if (entryRoom) entryRoom.kind = 'entry';
  if (exitRoom && exitRoom.kind !== 'boss') exitRoom.kind = 'exit';

  g.set(entry.x, entry.y, T_STAIRS_UP);
  g.set(exit.x, exit.y, T_STAIRS_DOWN);
  // Clear a small landing so props and packs never bury the stairs.
  clearRadius(g, entry.x, entry.y, 2);
  clearRadius(g, exit.x, exit.y, 2);
  g.set(entry.x, entry.y, T_STAIRS_UP);
  g.set(exit.x, exit.y, T_STAIRS_DOWN);

  // --- Room roles --------------------------------------------------------
  assignRoomRoles(rooms, rng, depth, isBossLevel, quest, levelIndex);

  // --- Liquid / hazard dressing -----------------------------------------
  dressHazards(g, rooms, biomeDef, rng, depth);

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
  };

  // --- Spawns ------------------------------------------------------------
  level.spawns = placeSpawns(level, g, biomeDef, rng.fork('spawns'), levelIndex, levelsTotal, modifiers);

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
  level.props = props;

  return level;
}

function pickLayoutKind(biome: BiomeDef, rng: Rng, depth: number, boss: boolean): LayoutKind {
  if (boss) {
    // Boss floors are arenas, except where the biome's identity is the spiral.
    if (biome.layouts.includes('spiral') && rng.chance(0.35)) return 'spiral';
    return 'arena';
  }
  let kind = layoutForBiome(biome, rng, depth);
  // Never hand the player an arena on a non-boss floor; it reads as a mistake.
  if (kind === 'arena') kind = biome.layouts.find((k) => k !== 'arena') ?? 'rooms';
  return kind;
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

function pickEntryExit(
  g: Grid,
  rooms: DungeonRoom[],
  bossLevel: boolean,
): { entryRoom: DungeonRoom | null; exitRoom: DungeonRoom | null } {
  if (rooms.length === 0) return { entryRoom: null, exitRoom: null };

  const bossRoom = rooms.find((r) => r.kind === 'boss') ?? null;
  // On a boss floor the arena is always the destination.
  const candidates = rooms.filter((r) => r !== bossRoom);
  const start = candidates.length > 0 ? candidates[0] : rooms[0];

  const dist = distanceField(g, start.center);
  // Entry = the most peripheral room; on boss floors, the one furthest from the arena.
  let entryRoom = start;
  if (bossLevel && bossRoom) {
    const bossDist = distanceField(g, bossRoom.center);
    let best = -1;
    for (const r of candidates) {
      const d = bossDist[r.center.y * g.w + r.center.x];
      if (d > best) {
        best = d;
        entryRoom = r;
      }
    }
    return { entryRoom, exitRoom: bossRoom };
  }

  let best = -1;
  for (const r of rooms) {
    const d = dist[r.center.y * g.w + r.center.x];
    if (d > best) {
      best = d;
      entryRoom = r;
    }
  }
  const fromEntry = distanceField(g, entryRoom.center);
  let exitRoom = entryRoom;
  best = -1;
  for (const r of rooms) {
    if (r === entryRoom) continue;
    const d = fromEntry[r.center.y * g.w + r.center.x];
    if (d > best) {
      best = d;
      exitRoom = r;
    }
  }
  return { entryRoom, exitRoom: exitRoom === entryRoom ? null : exitRoom };
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

/**
 * Sprinkles biome-appropriate liquid and hazard tiles. Kept off room centres and
 * off the shortest path so it decorates rather than obstructs.
 */
function dressHazards(g: Grid, rooms: DungeonRoom[], biome: BiomeDef, rng: Rng, depth: number): void {
  const wantsLava = biome.id === 'foundry' || biome.id === 'ashwaste';
  const wantsWater = biome.id === 'sunkenTemple' || biome.id === 'caverns';
  if (!wantsLava && !wantsWater) return;

  const pools = wantsWater ? rng.int(3, 7) : rng.int(2, 5);
  for (let i = 0; i < pools; i++) {
    const cx = rng.int(5, g.w - 6);
    const cy = rng.int(5, g.h - 6);
    const r = rng.range(2, 5.5);
    const value = wantsLava ? T_LAVA : T_WATER;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        if (g.get(x, y) !== T_FLOOR) continue;
        g.set(x, y, value);
        if (value === T_LAVA || value === T_WATER) g.setHeight(x, y, g.height(x, y) - 1);
      }
    }
  }

  // Lava must never sever the level; water is walkable so it cannot.
  if (wantsLava) {
    // Re-open a one-tile causeway anywhere lava cut the only route.
    const opened = repairLavaCuts(g);
    void opened;
  }
  void rooms;
  void depth;
}

/** If lava split the walkable graph, bridge the largest gap back together. */
function repairLavaCuts(g: Grid): number {
  const n = g.w * g.h;
  const label = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const sizes: number[] = [];
  let next = 0;
  for (let i = 0; i < n; i++) {
    if (label[i] !== -1 || !isWalkableValue(g.t[i])) continue;
    const id = next++;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    label[i] = id;
    let count = 0;
    while (head < tail) {
      const c = queue[head++];
      count++;
      const cx = c % g.w;
      const cy = (c / g.w) | 0;
      const step = (nb: number): void => {
        if (label[nb] !== -1 || !isWalkableValue(g.t[nb])) return;
        label[nb] = id;
        queue[tail++] = nb;
      };
      if (cx > 0) step(c - 1);
      if (cx < g.w - 1) step(c + 1);
      if (cy > 0) step(c - g.w);
      if (cy < g.h - 1) step(c + g.w);
    }
    sizes.push(count);
  }
  if (sizes.length <= 1) return 0;
  let main = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[main]) main = i;

  // BFS through lava only, from the main component, carving the shortest bridge.
  const parent = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (label[i] === main) { seen[i] = 1; queue[tail++] = i; }
  const best = new Int32Array(sizes.length).fill(-1);
  while (head < tail) {
    const c = queue[head++];
    const lc = label[c];
    if (lc >= 0 && lc !== main && best[lc] === -1) best[lc] = c;
    const cx = c % g.w;
    const cy = (c / g.w) | 0;
    const step = (nb: number): void => {
      if (seen[nb]) return;
      const v = g.t[nb];
      if (v !== T_LAVA && !isWalkableValue(v)) return;
      seen[nb] = 1;
      parent[nb] = c;
      queue[tail++] = nb;
    };
    if (cx > 1) step(c - 1);
    if (cx < g.w - 2) step(c + 1);
    if (cy > 1) step(c - g.w);
    if (cy < g.h - 2) step(c + g.w);
  }
  let fixed = 0;
  for (let comp = 0; comp < sizes.length; comp++) {
    if (comp === main || best[comp] === -1) continue;
    let cur = best[comp];
    let guard = 0;
    while (cur !== -1 && guard++ < n) {
      if (g.t[cur] === T_LAVA) {
        g.t[cur] = T_FLOOR;
        fixed++;
      }
      cur = parent[cur];
    }
  }
  return fixed;
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
  biome: BiomeDef,
  rng: Rng,
  levelIndex: number,
  levelsTotal: number,
  modifiers: string[] | undefined,
): SpawnPoint[] {
  const depth = level.depth;
  let floorTiles = 0;
  for (let i = 0; i < g.t.length; i++) if (isWalkableValue(g.t[i])) floorTiles++;

  const mods = modifiers ?? [];
  const has = (id: string): number => {
    const m = mods.find((x) => modifierId(x) === id);
    return m ? modifierTier(m) : 0;
  };

  const swarmTier = has('mod.swarm');
  const eliteTier = has('mod.elites');
  const legion = has('mod.legion') > 0;

  let budget = monsterBudget(depth, floorTiles, levelIndex, levelsTotal);
  budget = Math.round(budget * (1 + swarmTier * 0.14));
  // The boss floor is the boss's floor. A crowd this size on top of a boss
  // fight is not harder, it is just noise on top of the thing you came for.
  if (levelIndex === levelsTotal - 1) budget = Math.round(budget * 0.45);

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
      if (g.t[i] === T_STAIRS_UP || g.t[i] === T_STAIRS_DOWN || g.t[i] === T_DOOR) continue;
      if (dist[i] < 9) continue;
      let open = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (g.walkable(x + ox, y + oy)) open++;
      if (open < 7) continue;
      candidates.push(i);
    }
  }
  if (candidates.length === 0) return spawns;
  rng.shuffle(candidates);

  const monsterIds = catalog.pick(depth, biome.id, rng.fork('ids'), 24);
  const uniqueIds = Array.from(new Set(monsterIds));
  const pickId = (): string => (uniqueIds.length > 0 ? rng.pick(uniqueIds) : 'skeleton');

  const usedTile = new Set<number>();
  let placed = 0;
  let cursor = 0;

  const roomKindAt = (i: number): DungeonRoom['kind'] => {
    const rid = level.roomOf[i];
    if (rid < 0) return 'normal';
    const room = level.rooms.find((r) => r.id === rid);
    return room ? room.kind : 'normal';
  };

  while (placed < budget && cursor < candidates.length) {
    const seed = candidates[cursor++];
    if (usedTile.has(seed)) continue;
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
        ? catalog.nameFor?.(leaderId, biome.id, depth, rng.fork(`name${id}`)) ?? null
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
      placed++;
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
      if (v !== T_STAIRS_UP && v !== T_STAIRS_DOWN) out.push(c);
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
  const size = layoutSizeFor(depth, layout, rng);
  const out = buildLayout(layout, { width: size.w, height: size.h, rng, depth, seed });
  const g = out.grid;
  const entry = safeSpot(g, out.rooms.length > 0 ? out.rooms[0].center : firstWalkable(g));
  const exit = safeSpot(g, out.rooms.length > 1 ? out.rooms[out.rooms.length - 1].center : lastWalkable(g), entry);
  g.set(entry.x, entry.y, T_STAIRS_UP);
  g.set(exit.x, exit.y, T_STAIRS_DOWN);
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
    isBossLevel: layout === 'arena',
    heights: g.heights,
    roomOf: buildRoomIndex(g, out.rooms),
    audit: auditLayout(g, out.rooms, entry),
  };
  level.props = placeProps(level, getBiome(biome), rng.fork('props'));
  return level;
}

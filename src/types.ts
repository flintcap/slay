/**
 * SLAY — shared type contracts.
 *
 * This file is the integration spine. Every subsystem (loot, combat, dungeon
 * generation, UI, persistence) codes against these types. Treat it as an API:
 * additive changes are cheap, renames are not.
 */

// ---------------------------------------------------------------------------
// Primitive / utility
// ---------------------------------------------------------------------------

export type Vec2 = { x: number; y: number };

/** Deterministic random source. Every generator takes one; nothing calls Math.random. */
export interface Rng {
  /** [0,1) */
  next(): number;
  /** [min,max) float */
  range(min: number, max: number): number;
  /** [min,max] integer, inclusive */
  int(min: number, max: number): number;
  /** true with probability p */
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  /** Weighted pick. `weight` maps an entry to a non-negative number. */
  weighted<T>(arr: readonly T[], weight: (t: T) => number): T;
  shuffle<T>(arr: T[]): T[];
  /** Derive an independent stream — lets subsystems roll without desyncing each other. */
  fork(salt: string): Rng;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * The full derived stat block. Core attributes (str/dex/vit/enr) are spent by
 * the player; everything else is computed from attributes + gear + skills.
 */
export type StatKey =
  // core attributes
  | 'strength'
  | 'dexterity'
  | 'vitality'
  | 'energy'
  // resources
  | 'life'
  | 'mana'
  | 'lifeRegen'
  | 'manaRegen'
  // offense
  | 'attackRating'
  | 'minDamage'
  | 'maxDamage'
  | 'attackSpeed'
  | 'castSpeed'
  | 'critChance'
  | 'critDamage'
  | 'lifeSteal'
  | 'manaSteal'
  // defense
  | 'defense'
  | 'blockChance'
  | 'damageReduction'
  | 'physicalResist'
  | 'fireResist'
  | 'coldResist'
  | 'lightningResist'
  | 'poisonResist'
  | 'arcaneResist'
  // elemental flat damage
  | 'fireDamage'
  | 'coldDamage'
  | 'lightningDamage'
  | 'poisonDamage'
  | 'arcaneDamage'
  // multipliers (percent, additive within the pool)
  | 'enhancedDamage'
  | 'enhancedDefense'
  | 'elementalDamagePct'
  | 'areaDamagePct'
  // utility
  | 'moveSpeed'
  | 'magicFind'
  | 'goldFind'
  | 'cooldownReduction'
  | 'skillLevels';

export type Stats = Record<StatKey, number>;

export type DamageType = 'physical' | 'fire' | 'cold' | 'lightning' | 'poison' | 'arcane';

export const DAMAGE_TYPES: readonly DamageType[] = [
  'physical',
  'fire',
  'cold',
  'lightning',
  'poison',
  'arcane',
] as const;

/** Maps a damage type to the resist stat that mitigates it. */
export const RESIST_OF: Record<DamageType, StatKey> = {
  physical: 'physicalResist',
  fire: 'fireResist',
  cold: 'coldResist',
  lightning: 'lightningResist',
  poison: 'poisonResist',
  arcane: 'arcaneResist',
};

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type EquipSlot =
  | 'mainHand'
  | 'offHand'
  | 'helm'
  | 'chest'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring1'
  | 'ring2';

export type ItemCategory =
  | 'sword'
  | 'axe'
  | 'mace'
  | 'dagger'
  | 'spear'
  | 'bow'
  | 'crossbow'
  | 'wand'
  | 'staff'
  | 'scepter'
  | 'shield'
  | 'orb'
  | 'quiver'
  | 'helm'
  | 'chest'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring'
  | 'charm'
  | 'gem'
  | 'rune'
  | 'potion'
  | 'material';

export type ItemRarity =
  | 'normal'
  | 'magic'
  | 'rare'
  | 'set'
  | 'unique'
  | 'mythic'
  | 'ancient';

export const RARITY_ORDER: readonly ItemRarity[] = [
  'normal',
  'magic',
  'rare',
  'set',
  'unique',
  'mythic',
  'ancient',
] as const;

/** Hex colors used consistently by the 3D world (drop beams) and the UI. */
export const RARITY_COLOR: Record<ItemRarity, number> = {
  normal: 0xc8c8c8,
  magic: 0x6f8cff,
  rare: 0xf5d76e,
  set: 0x33d64a,
  unique: 0xb8874a,
  mythic: 0xc060ff,
  ancient: 0xff5a33,
};

/** A single rolled modifier on an item. */
export interface ItemMod {
  /** Affix definition id this roll came from. */
  affixId: string;
  stat: StatKey;
  value: number;
  /** Tier of the affix pool this rolled from (higher = better). */
  tier: number;
  /** True for prefixes, false for suffixes. Implicits use `implicit`. */
  kind: 'prefix' | 'suffix' | 'implicit' | 'crafted' | 'corrupted';
}

export interface ItemBase {
  id: string;
  name: string;
  category: ItemCategory;
  slot: EquipSlot | 'twoHand' | 'consumable' | 'none';
  /** Minimum character level for this base to drop / be equipped. */
  levelReq: number;
  /** Attribute requirements. */
  strReq?: number;
  dexReq?: number;
  /** Weapon damage range before affixes. */
  baseMinDamage?: number;
  baseMaxDamage?: number;
  /** Attacks per second baseline for weapons. */
  baseSpeed?: number;
  /** Armor value before affixes. */
  baseDefense?: number;
  /** Block chance for shields (0..1). */
  baseBlock?: number;
  /** Implicit mods every instance of this base rolls. */
  implicits?: Array<{ stat: StatKey; min: number; max: number }>;
  /** Which classes can use it, or undefined for all. */
  classes?: CharClassId[];
  /** Drives procedural mesh + material generation. */
  visual: ItemVisual;
}

/** Parameters the 3D item-model generator reads. Keep purely declarative. */
export interface ItemVisual {
  /** Which procedural model family to build. */
  shape: string;
  /** Base metal / cloth / leather palette key. */
  palette: string;
  /** 0..1 ornamentation density — gems, filigree, spikes. */
  ornate?: number;
  /** Optional emissive tint for magical bases. */
  glow?: number;
}

export interface Item {
  /** Unique instance id. */
  uid: string;
  baseId: string;
  name: string;
  rarity: ItemRarity;
  /** Item level — caps the affix tiers that can roll. */
  ilvl: number;
  mods: ItemMod[];
  /** Upgrade level from the blacksmith (0..N), each step scales base + mods. */
  upgrade: number;
  /** Sockets and what is in them. */
  sockets: Array<{ gemId: string | null }>;
  /** Set membership, for set bonuses. */
  setId?: string;
  /** Unique item definition id, if this is a unique. */
  uniqueId?: string;
  /** True once the player has seen it — drives the "new" pip in the UI. */
  seen?: boolean;
  /** Vendor value in gold, cached at generation time. */
  value: number;
  /** Corruption / mythic implicit rolls, if any. */
  corrupted?: boolean;
}

// ---------------------------------------------------------------------------
// Affixes
// ---------------------------------------------------------------------------

export interface AffixTier {
  tier: number;
  /** Minimum item level for this tier to roll. */
  ilvl: number;
  min: number;
  max: number;
  /** Relative weight within the affix's pool. */
  weight: number;
}

export interface AffixDef {
  id: string;
  /** Display template, `{v}` is replaced by the rolled value. */
  label: string;
  stat: StatKey;
  kind: 'prefix' | 'suffix';
  tiers: AffixTier[];
  /** Restrict to these categories; empty/undefined = any. */
  categories?: ItemCategory[];
  /** Restrict to these slots. */
  slots?: EquipSlot[];
  /** Group id — an item never rolls two affixes from the same group. */
  group: string;
  /** Only rolls on items of at least this rarity. */
  minRarity?: ItemRarity;
}

// ---------------------------------------------------------------------------
// Character / classes / skills
// ---------------------------------------------------------------------------

export type CharClassId =
  | 'warden'      // martial, bleed / bulwark
  | 'pyromancer'  // fire / arcane caster
  | 'shadowblade' // dex crit / poison
  | 'stormcaller' // lightning / mobility
  | 'revenant';   // summoner / life-drain

export interface CharClassDef {
  id: CharClassId;
  name: string;
  title: string;
  blurb: string;
  /** Starting attributes. */
  base: Pick<Stats, 'strength' | 'dexterity' | 'vitality' | 'energy'>;
  /** Per-level automatic gains. */
  perLevel: { life: number; mana: number; attackRating: number };
  /** Life/mana granted per point spent in the matching attribute. */
  lifePerVit: number;
  manaPerEnr: number;
  /** Skill tree ids belonging to this class, in display order. */
  trees: [string, string, string];
  /** Accent color for UI + character lighting. */
  color: number;
  /** Starting gear base ids. */
  startingGear: string[];
}

export type SkillTargeting = 'self' | 'point' | 'direction' | 'enemy' | 'passive';

export interface SkillDef {
  id: string;
  treeId: string;
  name: string;
  desc: string;
  /** Tier within the tree (1..6) — gates on total points spent in the tree. */
  tier: number;
  /** Column for layout, 0..2. */
  column: number;
  maxRank: number;
  targeting: SkillTargeting;
  manaCost?: (rank: number) => number;
  cooldown?: (rank: number) => number;
  /** Skill ids that must have >= 1 rank first. */
  requires?: string[];
  /** Passive stat grants per rank. */
  passive?: Partial<Record<StatKey, (rank: number) => number>>;
  /** Which visual/gameplay effect handler runs this skill. */
  effect?: string;
  /** Tuning knobs read by the effect handler. */
  params?: Record<string, number | number[]>;
  /** Damage scaling per rank, as a multiplier of weapon/spell damage. */
  damageScale?: (rank: number) => number;
  damageType?: DamageType;
  icon: string;
}

export interface SkillTreeDef {
  id: string;
  name: string;
  classId: CharClassId;
  blurb: string;
}

/** A live character — the thing you lose on death. */
export interface Character {
  id: string;
  name: string;
  classId: CharClassId;
  level: number;
  xp: number;
  /** Unspent points. */
  statPoints: number;
  skillPoints: number;
  /** Player-allocated attribute points, on top of class base + level. */
  allocated: Pick<Stats, 'strength' | 'dexterity' | 'vitality' | 'energy'>;
  /** skillId -> rank */
  skills: Record<string, number>;
  /** Skills bound to number keys 1..6. */
  hotbar: (string | null)[];
  /**
   * The skill on right click. `null` means the free basic attack.
   * Optional so saves written before this existed still load.
   */
  primaryAttack?: string | null;
  equipment: Partial<Record<EquipSlot, Item>>;
  inventory: (Item | null)[];
  gold: number;
  /** Deepest dungeon depth cleared with this character. */
  depthRecord: number;
  /** Wall-clock seconds played. */
  playtime: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Account-level persistence (survives death)
// ---------------------------------------------------------------------------

export interface AccountSave {
  version: number;
  /** The shared bank. Grid of item slots across tabs. */
  stash: Array<Item | null>;
  stashTabs: number;
  /** Gold is shared across characters — the bank vault. */
  bankGold: number;
  /** Highest depth ever reached, across all characters. */
  bestDepth: number;
  /** Total characters lost — feeds the memorial wall in town. */
  fallen: Array<{ name: string; classId: CharClassId; level: number; depth: number; killedBy: string; at: number }>;
  /** Persistent unlocks (vendor tiers, town upgrades). */
  unlocks: string[];
  /** Live character, if a run is in progress. */
  current: Character | null;
  /** Crafting materials by id. */
  materials: Record<string, number>;
  settings: GameSettings;
}

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  showDamageNumbers: boolean;
  screenShake: number;
  cameraDistance: number;
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

export type MonsterFamily =
  | 'undead'
  | 'demon'
  | 'beast'
  | 'construct'
  | 'insect'
  | 'aberration'
  | 'elemental'
  | 'humanoid'
  | 'plant'
  | 'ooze';

export type MonsterRole = 'melee' | 'ranged' | 'caster' | 'brute' | 'swarm' | 'support' | 'ambusher';

export interface MonsterDef {
  id: string;
  name: string;
  family: MonsterFamily;
  role: MonsterRole;
  /** Depth at which this monster starts appearing. */
  minDepth: number;
  /** Depth past which it stops appearing (undefined = forever). */
  maxDepth?: number;
  /** Relative spawn weight. */
  weight: number;
  /** Base multipliers applied on top of the depth curve. */
  lifeMul: number;
  damageMul: number;
  defenseMul: number;
  speed: number;
  /** Physical size in world units — drives model scale and hit radius. */
  scale: number;
  /** Preferred engagement distance. */
  attackRange: number;
  attackSpeed: number;
  damageType: DamageType;
  /** XP multiplier. */
  xpMul: number;
  /** Innate abilities, resolved by the ability registry. */
  abilities: string[];
  /** Resistances as flat additions (percent). */
  resists?: Partial<Record<DamageType, number>>;
  /** Which biomes it may appear in; empty = all. */
  biomes?: BiomeId[];
  visual: MonsterVisual;
}

/** Declarative description consumed by the procedural monster model builder. */
export interface MonsterVisual {
  /** Body archetype the mesh generator builds from. */
  body: string;
  palette: string;
  /** Emissive accent color. */
  glow?: number;
  /** 0..1 — spikes, horns, extra limbs. */
  ornate?: number;
  /** Optional per-monster silhouette tweaks. */
  limbs?: number;
  tail?: boolean;
  wings?: boolean;
  eyes?: number;
}

/** Elite/rare modifiers layered onto a monster pack. */
export interface MonsterAffixDef {
  id: string;
  name: string;
  /** Shown in the enemy nameplate. */
  desc: string;
  /** Minimum depth for this affix to appear. */
  minDepth: number;
  weight: number;
  /** Stat multipliers applied to the host. */
  mods?: Partial<Record<'life' | 'damage' | 'defense' | 'speed' | 'attackSpeed', number>>;
  /** Behaviour hook id, resolved by the combat layer. */
  behavior?: string;
  params?: Record<string, number>;
  /** Aura tint. */
  color: number;
  /** Affixes that cannot coexist with this one. */
  excludes?: string[];
}

export type MonsterRank = 'normal' | 'champion' | 'elite' | 'rare' | 'boss';

// ---------------------------------------------------------------------------
// World / dungeon generation
// ---------------------------------------------------------------------------

export type BiomeId =
  | 'crypt'
  | 'caverns'
  | 'foundry'
  | 'sunkenTemple'
  | 'hive'
  | 'frostvault'
  | 'ashwaste'
  | 'voidspire';

export interface BiomeDef {
  id: BiomeId;
  name: string;
  blurb: string;
  minDepth: number;
  /** Palette + lighting parameters consumed by the dungeon builder. */
  fogColor: number;
  fogDensity: number;
  ambientColor: number;
  ambientIntensity: number;
  /** Key light. */
  keyColor: number;
  keyIntensity: number;
  /** Material palette keys for floor / wall / trim. */
  floorPalette: string;
  wallPalette: string;
  trimPalette: string;
  /** Torch / emissive accent color. */
  accentColor: number;
  /** Which layout generator to prefer. */
  layouts: LayoutKind[];
  /** Ambient particle mood. */
  particles?: 'dust' | 'embers' | 'snow' | 'spores' | 'ash' | 'void' | 'bubbles';
  /** Monster families weighted up in this biome. */
  families: MonsterFamily[];
  music: string;
}

export type LayoutKind = 'rooms' | 'caves' | 'maze' | 'catacombs' | 'ruins' | 'arena' | 'spiral';

export type TileKind =
  | 'void'
  | 'floor'
  | 'wall'
  | 'door'
  | 'water'
  | 'lava'
  | 'chasm'
  | 'stairsDown'
  | 'stairsUp'
  | 'rubble';

export interface DungeonRoom {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'normal' | 'entry' | 'exit' | 'treasure' | 'shrine' | 'boss' | 'vault' | 'ambush' | 'quest';
  /** Room ids this connects to. */
  links: number[];
  center: Vec2;
}

export interface DungeonLevel {
  seed: number;
  depth: number;
  biome: BiomeId;
  layout: LayoutKind;
  width: number;
  height: number;
  /** Row-major tile grid, length = width * height. */
  tiles: Uint8Array;
  rooms: DungeonRoom[];
  entry: Vec2;
  exit: Vec2;
  /** Spawn instructions resolved by the entity layer. */
  spawns: SpawnPoint[];
  props: PropPlacement[];
  /** True when this level holds the floor boss. */
  isBossLevel: boolean;
}

export interface SpawnPoint {
  x: number;
  y: number;
  monsterId: string;
  rank: MonsterRank;
  affixes: string[];
  /** Pack id — members share aggro. */
  packId: number;
}

export interface PropPlacement {
  x: number;
  y: number;
  rotation: number;
  /** Prop kind resolved by the prop mesh library. */
  kind: string;
  /** Interactable props carry a payload (chest contents, shrine buff). */
  interact?: string;
}

/** A full dungeon run: N levels ending in a boss. */
export interface DungeonRun {
  seed: number;
  depth: number;
  biome: BiomeId;
  levels: DungeonLevel[];
  quest: QuestInstance;
  /** Global run modifiers from endless scaling. */
  modifiers: string[];
  bossId: string;
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export type QuestObjectiveKind =
  | 'slay'          // kill N of a monster/family
  | 'slayElite'     // kill named elites
  | 'collect'       // pick up N quest items
  | 'reach'         // get to a location
  | 'survive'       // hold out for N seconds
  | 'escort'        // keep an NPC alive
  | 'cleanse'       // interact with N shrines
  | 'boss';         // kill the floor boss

export interface QuestObjective {
  kind: QuestObjectiveKind;
  desc: string;
  target: number;
  progress: number;
  /** Free-form filter, meaning depends on kind. */
  filter?: string;
  done: boolean;
}

export interface QuestDef {
  id: string;
  name: string;
  flavor: string;
  minDepth: number;
  weight: number;
  /** Builds the concrete objective list for a run. */
  objectives: Array<{ kind: QuestObjectiveKind; filter?: string; base: number; perDepth: number; desc: string }>;
  /** Reward multipliers. */
  rewardGold: number;
  rewardXp: number;
  /** Extra item drops on completion. */
  rewardItems: number;
  /** Optional run modifier the quest imposes. */
  modifier?: string;
}

export interface QuestInstance {
  defId: string;
  name: string;
  flavor: string;
  objectives: QuestObjective[];
  complete: boolean;
  turnedIn: boolean;
}

// ---------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------

export interface BossPhase {
  /** Phase begins when boss life fraction drops below this. */
  atLife: number;
  name: string;
  /** Ability ids usable in this phase. */
  abilities: string[];
  /** Multipliers active during the phase. */
  speed?: number;
  damage?: number;
  /** Arena change hook id. */
  arena?: string;
  /** Barked line shown on entering the phase. */
  bark?: string;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  family: MonsterFamily;
  minDepth: number;
  biomes: BiomeId[];
  lifeMul: number;
  damageMul: number;
  scale: number;
  phases: BossPhase[];
  /** Adds summoned during the fight. */
  adds?: string[];
  /** Intro text shown on the boss gate. */
  intro: string;
  visual: MonsterVisual;
  /** Guaranteed loot table hooks. */
  lootTier: number;
  music: string;
}

// ---------------------------------------------------------------------------
// Runtime combat surface (implemented by sim/, consumed by entities/ and ui/)
// ---------------------------------------------------------------------------

export interface DamagePacket {
  amount: number;
  type: DamageType;
  crit: boolean;
  /** Source entity id. */
  source: string;
  /** Skill or ability that produced it. */
  ability?: string;
  /** Knockback impulse in world units. */
  knockback?: number;
  /** Status effects to apply on hit. */
  applies?: StatusApplication[];
}

export interface StatusApplication {
  id: string;
  duration: number;
  magnitude: number;
  stacks?: number;
}

export interface StatusEffectDef {
  id: string;
  name: string;
  /** Positive for buffs, negative for debuffs — drives UI tinting. */
  polarity: 1 | -1;
  maxStacks: number;
  /** Applied while active. */
  mods?: Partial<Record<StatKey, number>>;
  /** Damage over time, per second, scaled by magnitude. */
  dot?: { type: DamageType; perSecond: number };
  color: number;
  icon: string;
}

// ---------------------------------------------------------------------------
// Scene / app plumbing
// ---------------------------------------------------------------------------

export type SceneId = 'boot' | 'title' | 'charSelect' | 'town' | 'dungeon' | 'death';

/** Anything the engine ticks. */
export interface Tickable {
  update(dt: number, elapsed: number): void;
}

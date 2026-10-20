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
  | 'legs'
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
  | 'pants'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring'
  | 'charm'
  | 'trinket'
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
  /** Honed one rung up its ladder at the blacksmith. One line per item. */
  honed?: boolean;
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
  /**
   * Power affixes: behaviours rather than stat lines ("chance on hit to arc",
   * "kills explode"). Resolved by `sim/ItemPowers.ts`. Optional so every save
   * written before powers existed still loads.
   */
  powers?: ItemPowerRoll[];
  /**
   * The Enchanter's mark: the affix id of the one mod that has been reforged.
   * Only that mod may be reforged again. Optional; absent on most items.
   */
  enchantedMod?: string;
  /** How many times this item has been reforged or imbued; prices the next. */
  enchants?: number;
  /**
   * Lines the Enchanter has laid out and the player has not chosen from yet.
   * `line` is the affix id of the line they would replace, or null for a new
   * line in an open slot. Paid for already, so it survives closing the panel.
   */
  offers?: { line: string | null; kind: 'prefix' | 'suffix'; mods: ItemMod[] };
}

/** One rolled power on an item. `mag` scales it; 1 is a unique's strength. */
export interface ItemPowerRoll {
  id: string;
  mag: number;
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
  /** Restrict to these base ids (each charm size has its own ladders). */
  bases?: string[];
}

// ---------------------------------------------------------------------------
// Character / classes / skills
// ---------------------------------------------------------------------------

export type CharClassId =
  | 'warden'      // the Knight: martial, bleed / bulwark
  | 'mage'        // fire, lightning and cold caster
  | 'shadowblade' // the Rogue: dex crit / poison
  | 'revenant'    // summoner / life-drain
  | 'ranger'      // bow / crossbow marksman
  | 'shapeshifter' // big cat, wolf and bear forms
  | 'paladin';    // mace or sword and shield, one aura at a time

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
  /**
   * How the skill takes its time (`sim/Speed.ts`): `'attack'` at the weapon's
   * pace and attack speed, `'spell'` on its cast time and cast speed. Left
   * out, the effect family and what is in hand decide (`skillTiming`).
   */
  timing?: 'attack' | 'spell';
  /**
   * Attack skills: one use takes this many swings (or shots) of the weapon in
   * hand. 1 is one swing; 1.5 a heavy blow; 0.85 a quick cut. Left out, the
   * family's (`ATTACK_FACTOR`, else 1). Never changes damage per hit.
   */
  attackTime?: number;
  /**
   * Spells: seconds one cast takes before cast speed. Left out, the family's
   * (`CAST_BASE`: 0.35 for buffs, 0.8 for channels) else 0.5. Never changes
   * damage per hit.
   */
  castTime?: number;
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
  /** Chosen at creation, fixed for the character's life. */
  difficulty?: string;
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
  /**
   * Skill respecs taken so far; prices the next one (`respecCost` in
   * sim/Progression). Optional so older saves load as zero.
   */
  respecs?: number;
  equipment: Partial<Record<EquipSlot, Item>>;
  inventory: (Item | null)[];
  gold: number;
  /** Deepest dungeon depth cleared with this character. */
  depthRecord: number;
  /** Wall-clock seconds played. */
  playtime: number;
  createdAt: number;
  /**
   * Town services: the bounty board and the counter that seeds the gambler's
   * and enchanter's rolls. Optional; repaired by `sim/TownServices.ts`.
   */
  town?: TownState;
  /** Bosses this character has fought, so a life does not meet one twice too soon. */
  bossesMet?: string[];
  /**
   * This hero's own story: chapters, pages, people met and the contract
   * chains. Every hero starts fresh. Optional: `sim/Story.ts` fills it in.
   */
  story?: StorySave;
  /** What the floor shows this hero. Optional: repaired by `sim/LootFilter.ts`. */
  lootFilter?: LootFilterSettings;
  /**
   * The map in progress, if any: what the hero carried into it
   * (`sim/RunLedger.ts`). Cleared when a map ends well. A map left any other
   * way (the menu, closing the game, a crash) is settled from it: the hero is
   * back in town as they left it, less some experience.
   */
  run?: RunLedger;
  /**
   * A map the hero stepped out of through a Trinket of Town's portal, kept
   * to go back to (`sim/Trinkets.ts`). While it stands, the Descent is shut.
   */
  portal?: OpenPortal;
}

/** What a hero carried into a map, kept until the map ends (`sim/RunLedger.ts`). */
export interface RunLedger {
  v: 1;
  /** When the map began, ms since 1970. */
  at: number;
  depth: number;
  equipment: Partial<Record<EquipSlot, Item>>;
  inventory: (Item | null)[];
  gold: number;
  /** The account's crafting materials then (they are shared, and found in maps). */
  materials: Record<string, number>;
}

/**
 * A map left through a Trinket of Town's portal, and how it was left: enough
 * to build the same map again and put back what was already done in the
 * area the portal stands in (`sim/Trinkets.ts`, `scenes/DungeonScene.ts`).
 */
export interface OpenPortal {
  v: 1;
  /** When the hero stepped through, ms since 1970. */
  at: number;
  /** What builds the map again. */
  depth: number;
  seed: number;
  pacts: string[];
  /** The map's name, for the portal's prompt in town. */
  name: string;
  /** The area the portal stands in, and where in it (world x, z). */
  level: number;
  x: number;
  z: number;
  /** Spawn indices of the area's monsters already dead. */
  killed: number[];
  bossDead: boolean;
  wardenDead: boolean;
  /** Where the way home stood after the boss fell (world x, z), if it had. */
  home: { x: number; z: number } | null;
  /** Tiles of the area's props already opened, used or broken. */
  used: Array<[number, number]>;
  /** What lay on the ground: an item, or a gold pile when `item` is null. */
  loot: Array<{ item: Item | null; gold: number; x: number; z: number }>;
  vaultOpen: boolean;
  /** The map's contract, as far as it had got. */
  quest: QuestInstance;
  /** Seconds spent in the map so far. */
  time: number;
  /** The area's chart as far as it was walked: one bit per tile, base64. */
  chart?: string;
}

/** A character's standing with the camp's services. See `sim/TownServices.ts`. */
export interface TownState {
  v: number;
  /** Bumps with every gamble, reforge, imbue and new bounty; seeds the next roll. */
  rolls: number;
  /** What is pinned to the board: open offers, taken bounties and finished ones. */
  bounties: Bounty[];
  /** Bounties this character has been paid for. */
  claimed: number;
  /** Paid reposts of the board since the last bounty was claimed. Each one costs more. */
  reposts: number;
}

export type BountyKind = 'slay' | 'elites' | 'boss' | 'clear' | 'events';

export interface Bounty {
  id: string;
  kind: BountyKind;
  /** Only descents at least this deep count. */
  minDepth: number;
  target: number;
  progress: number;
  /** `open` on the board, `active` once taken, `done` when ready to claim. */
  state: 'open' | 'active' | 'done';
  /**
   * What the contract pays against a plain slay bounty at its depth. The board
   * keeps the reward sealed: its gold, Renown and item are rolled when it is
   * claimed, from a seed fixed when it was posted.
   */
  worth: number;
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
  /**
   * Every living character on the account. `current` is whichever one is being
   * played; this is the roster you pick from. Permadeath still applies — a dead
   * character leaves this list and joins `fallen`.
   */
  roster?: Character[];
  /** Crafting materials by id. */
  materials: Record<string, number>;
  settings: GameSettings;
  /**
   * Before save v4 the story and the loot filter were shared by every hero.
   * The load copies them onto each hero already on the roster and drops them
   * here (`core/Save.ts`); nothing reads them after that.
   */
  story?: StorySave;
  lootFilter?: LootFilterSettings;
  /** The last thing that happened below, for the camp to react to, whoever plays next. */
  news?: CampNews;
  /** Progression that survives death. Optional: repaired by `sim/Legacy.ts`. */
  legacy?: LegacyState;
}

/** One hero's story state. A new hero starts with none of it. */
export interface StorySave {
  v: number;
  /** Chapter and Deep Ledger ids revealed. */
  chapters: string[];
  /** Lore note ids found. */
  notes: string[];
  /** Biomes entered at least once. */
  biomes: string[];
  /** Bosses fought, and bosses killed. */
  met: string[];
  slain: string[];
  /** One-shot dialogue lines and topics already heard. */
  heard: string[];
  /** Person id -> when they last spoke to you (ms since epoch). */
  talked: Record<string, number>;
  /**
   * Contract chains. `step` is the step the chain is on; `state` is `idle`
   * until accepted, `active` while being worked, `ready` once done and waiting
   * to be handed in. A chain past its last step is finished.
   */
  chains: Record<string, { step: number; state: 'idle' | 'active' | 'ready' }>;
}

/** A map cleared or a hero lost, so the camp can speak of it. */
export interface CampNews {
  kind: 'cleared' | 'died';
  at: number;
  depth: number;
  name: string;
}

/** Account-level progression. See `sim/Legacy.ts`. */
export interface LegacyState {
  /** Total renown ever earned. Rank is derived from it. */
  renown: number;
  /** Perk id -> rank bought with Legacy points. */
  perks: Record<string, number>;
  /** Unique and set-piece ids the account has found. */
  codex: string[];
  stats: {
    runs: number;
    clears: number;
    kills: number;
    bosses: number;
    deaths: number;
    deepest: number;
    contracts: number;
  };
  /** Depth milestones whose first-clear reward has been claimed. */
  milestones: number[];
  /** Boss id -> fights the account has had with it. Seen less, picked more. */
  bossesSeen?: Record<string, number>;
}

/** Gear groups the loot filter sets a rarity bar for. */
export type LootFilterGroup = 'weapons' | 'armour' | 'jewellery' | 'charms';

/** Loot filter rules. See `sim/LootFilter.ts`. */
export interface LootFilterSettings {
  /** Off means every drop shows. */
  enabled: boolean;
  /** Per group: gear below this rarity is hidden unless a keep rule holds it. */
  rarityBy: Record<LootFilterGroup, ItemRarity>;
  /** Always show gear carrying a power affix. */
  keepPowers: boolean;
  /** Always show gear with at least one T1 affix roll. */
  keepTopTier: boolean;
  /** Always show bases with at least this many sockets. 0 = off. */
  keepSockets: number;
  /** Always show gear rolling any of these stat groups (`STAT_CHIPS` ids). */
  keepStats: string[];
  /** How many of those groups an item needs before it is kept (1 to 3). */
  keepStatsMin: number;
  /** Plain and magic gear on a base this many levels behind the drop is hidden. 0 = off. */
  hideOldBases: number;
  /** Hide gear your class cannot use. */
  hideOtherClasses: boolean;
  showGems: boolean;
  /** Gems below this quality (0 chipped to 5 divine) are hidden. */
  minGemQuality: number;
  showRunes: boolean;
  /** Runes below this cut (1 to 6) are hidden. The name is older than cuts. */
  minRuneOrder: number;
  showPotions: boolean;
  /** Healing and mana potions below this size (0 minor to 3 super) are hidden. Rejuvenations always show. */
  minPotionTier: number;
  /** The old single bar, read once by `lootFilterOf` and then dropped. */
  minRarity?: ItemRarity;
}

/** An effect the player can switch off on its own (core/Renderer.ts `withoutEffects`). */
export type VideoEffect = 'bloom' | 'aa' | 'ao' | 'torchShadows' | 'contactShadows' | 'airLight' | 'grain' | 'fringe' | 'ripples';
export const VIDEO_EFFECTS: readonly VideoEffect[] = ['bloom', 'aa', 'ao', 'torchShadows', 'contactShadows', 'airLight', 'grain', 'fringe', 'ripples'];

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  /** The world's sounds: hits, spells, footsteps, monsters. */
  sfxVolume: number;
  /** Room beds and the one-off sounds of a place (wind, drips, birds). Absent: as `sfxVolume`. */
  ambienceVolume?: number;
  /** Menu clicks, pickups, level-up and quest chimes. Absent: as `sfxVolume`. */
  uiVolume?: number;
  /** The hero's cries and lines, the bosses' spoken lines. Absent: as `sfxVolume`. */
  voiceVolume?: number;
  /** Silent while the tab is hidden or another window has focus. Default on. */
  muteInBackground?: boolean;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  /**
   * Auto quality (core/AutoQuality.ts): steps below `quality` when frames run
   * long and back up when there is room. `quality` is the most it will use.
   */
  autoQuality?: boolean;
  showDamageNumbers: boolean;
  screenShake: number;
  cameraDistance: number;
  /** First-run control hints (ui/Onboarding.ts). */
  hints?: boolean;
  /** Floor and town title cards (ui/Banners.ts). */
  titleCards?: boolean;
  /**
   * Reduced motion: calms the menus (no slow intros, letter reveals or
   * sweeping shines), and turns off screen shake, camera punch-ins and CSS
   * animation (core/Access.ts). Also on when the system asks for it.
   */
  reduceMotion?: boolean;
  /** Small frame-rate readout in the corner. */
  showFps?: boolean;
  /**
   * Most frames drawn a second (core/FramePace.ts); 0 draws one per screen
   * refresh. Auto quality aims for it.
   */
  frameCap?: number;
  /** Brightness of the finished picture, 0.7 to 1.4. 1 = as graded. */
  brightness?: number;
  /** Effects switched off on top of the quality preset (Settings, Video, Effects). */
  effectsOff?: VideoEffect[];
  /**
   * Flash reduction: softer red on hits and low life, no white screen
   * flashes, gentler bright bursts from spells.
   */
  flashReduce?: boolean;
  /**
   * Share of each side of the screen the 3D scene is drawn at, 0.5..1, on
   * top of the quality preset's own. 1 = every pixel.
   */
  renderScale?: number;
  /** The quest list under the minimap folded down to its header (ui/HUD.ts). */
  trackerHidden?: boolean;
  /** Multiplier on every UI type size (accessibility). 1 = as designed. */
  textScale?: number;
  /** How big every menu and the HUD are drawn, 0.8 to 2 (core/UiScale.ts). 1 = as designed. */
  uiScale?: number;
  /** The HUD's size on top of `uiScale`, 0.7 to 1.5. */
  hudScale?: number;
  /** The minimap's size, 0.75 to 1.75: a bigger one shows more of the floor. */
  minimapScale?: number;
  /** Swap rarity colours for a palette every colour-vision type can tell apart. */
  colorBlindRarity?: boolean;
  /**
   * Where the player left each panel, by panel id (ui/Widgets.ts `Panel`):
   * its top-left corner, and the screen edge it is docked to, if any, so a
   * docked panel stays on its edge when the window changes size.
   */
  panelPlaces?: Record<string, PanelPlace>;
  /** The see-through map over the game is up (ui/MapOverlay.ts; Tab). */
  mapOverlay?: boolean;
  /** How solid the see-through map is drawn, 0.2 to 1. */
  mapOverlayOpacity?: number;
  /** How large the see-through map is drawn, 0.5 to 2. */
  mapOverlaySize?: number;
  /** Rebound keys: default key code -> the key the player chose. Always a permutation. */
  keybinds?: Record<string, string>;
}

/** A panel's remembered place on screen (`GameSettings.panelPlaces`). */
export interface PanelPlace {
  x: number;
  y: number;
  dock?: 'left' | 'right' | null;
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
  | 'ooze'
  // The deep families (depth 30 on): the Tenant's household, the glass that
  // grows wrong in the Hollow Spire, and the delvers who never came back.
  | 'kept'
  | 'nailborn'
  | 'stayed';

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
  /**
   * A room object, not a monster: a boss room's portal, bell, heartstone,
   * brazier or anchor. It never moves or fights, and breaking it pays nothing.
   */
  object?: boolean;
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
  /**
   * Weapon put in the creature's hand: 'bow', 'staff', 'sword', 'axe', 'spear',
   * 'mace', 'dagger'. Derived from the monster's role at load time, so an
   * archer visibly carries the thing it is shooting you with.
   */
  weapon?: string;
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
  | 'voidspire'
  // Added by the map remake. Outdoor: darkForest, swamp, desert, tundra (and
  // ashwaste, hell). Indoor: desertTomb (and the eight above but ashwaste).
  | 'darkForest'
  | 'swamp'
  | 'desert'
  | 'desertTomb'
  | 'tundra'
  | 'hell';

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
  /** Open sky: a map zone of this biome has no roof (maps remake). */
  outdoor?: boolean;
}

export type LayoutKind =
  // Zone generators of the map remake (world/zones/*). Outdoor: forest,
  // swamp, dunes, tundra, wastes. Indoor: crypt, cave, tomb, keep, rift.
  | 'forest'
  | 'swamp'
  | 'dunes'
  | 'tundra'
  | 'wastes'
  | 'crypt'
  | 'cave'
  | 'tomb'
  | 'keep'
  | 'rift'
  // Map shapes of the variety pass (world/zones/Shapes.ts), indoor or out:
  // a ring round a great pit, a river or chasm splitting the zone, tiers
  // with cliffs and ramps.
  | 'maw'
  | 'cleft'
  | 'terraces';

export type TileKind =
  | 'void'
  | 'floor'
  | 'wall'
  | 'door'
  | 'water'
  | 'lava'
  | 'chasm'
  | 'exit'
  | 'arrival'
  | 'rubble'
  // Added by the map remake (docs/remake/maps.md). Each one says how it is
  // drawn until the builder knows it: see `drawAsKind` in world/Layouts.ts.
  /** Man-made wall standing in the open: broken walls, standing stones. Blocks. Drawn as `wall` until known. */
  | 'ruin'
  /** Water too deep to wade: swamp pools, rivers. Blocks. Drawn as `water` until known. */
  | 'deepWater'
  /** Plank boardwalk or stone bridge over water, lava or a chasm. Walkable. Drawn as `floor` until known. */
  | 'bridge'
  /** Frozen pond or ice sheet. Walkable. Drawn as `floor` until known. */
  | 'ice';

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

/**
 * What a flying spark meets, on a grid of `cell`-metre squares laid over the
 * level: per square, the world height of the top of whatever stands there (a
 * wall, a barrel), or -999 for open air. Row-major, `w * h` long, square
 * (0,0) starting at world (x0, z0). Built by the level mesh, read by the
 * particle field so sparks and debris bounce off walls and props.
 */
export interface SolidMap {
  heights: Float32Array;
  w: number;
  h: number;
  x0: number;
  z0: number;
  cell: number;
}

export interface DungeonLevel {
  seed: number;
  depth: number;
  biome: BiomeId;
  /**
   * Which dressed sub-version of the biome this run wears. Chosen once per run
   * so a descent stays coherent, and 'plain' means the biome's own art.
   */
  variant?: string;
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
  /**
   * Dungeon events on this floor (cursed chest, fallen adventurer, shrine of
   * choices, treasure runner). Event props also carry their own `interact`
   * payload; this list is the index. Optional: older generators wrote none.
   */
  events?: LevelEvent[];
  /**
   * The zones this area holds (maps remake). One area is one load. Several
   * outdoor zones share one area and meet at seamless edges; an indoor zone is
   * always an area of its own. Optional so a hand-built preview level still
   * works: no `zones` means one zone with the level's own biome.
   */
  zones?: MapZone[];
  /**
   * Zone index per tile, row-major, same length as `tiles`. Every tile has one,
   * walls and void included, so a wall is drawn in the look of the zone it
   * stands in. Index into `zones`.
   */
  zoneOf?: Uint8Array;
  /**
   * Ways out of this area. The first one is the way on (it matches `exit`). A
   * level with none uses `exit` as a plain passage.
   */
  exits?: MapExit[];
  /** The town waypoint, on the first area of a map only. Tile coordinates. */
  waypoint?: Vec2;
  /** The boss arena, on the last area only: its rectangle and the threshold tile where the fight begins. */
  arena?: { x: number; y: number; w: number; h: number; gate: Vec2 };
  /**
   * A floor warden (`data/wardens.ts`): which one, the side room it keeps
   * (its rectangle, in tiles) and where it stands. Its chest is a prop with
   * the `chest.warden` payload, shut until it falls.
   */
  warden?: { id: string; room: number; x: number; y: number; rect: { x: number; y: number; w: number; h: number } };
  /**
   * A landmark set piece (`world/Landmarks.ts`), when the area keeps one:
   * which, what it is called, its heart (tile coordinates) and its room.
   */
  landmark?: { id: string; name: string; x: number; y: number; room: number };
  /**
   * The map's run theme (`world/Themes.ts`), or none. It touches only zones
   * whose biome suits it (`themeFits`); `runTheme(id).light` is a tint the
   * looks stream may lay over those zones.
   */
  runTheme?: string;
}

/**
 * One sub-zone of a map: one stretch of ground with one biome, one layout and
 * one name. See docs/remake/maps.md "Design".
 */
export interface MapZone {
  /** Index in `DungeonLevel.zones`, and the value `zoneOf` stores for its tiles. */
  id: number;
  /** Shown on the zone banner and the HUD: "The Blackroot Wood". */
  name: string;
  biome: BiomeId;
  /** Open sky, no roof lid. */
  outdoor: boolean;
  /** The generator that shaped it. */
  layout: LayoutKind;
  /** Tile rectangle the zone was generated in. Zones of one area never overlap. */
  bounds: { x: number; y: number; w: number; h: number };
  /** Position in the whole map: 0 is the zone you arrive in. */
  order: number;
  /** 'start' holds the waypoint, 'boss' holds the arena. */
  role: 'start' | 'field' | 'boss';
}

/** A way out of an area. Drawn by the builder, used by the scene. */
export interface MapExit {
  /** Tile coordinates of the tile you step on to leave. */
  x: number;
  y: number;
  /** How it looks: a cave mouth, a doorway, stairs down, an iron gate, or a portal. */
  kind: 'caveMouth' | 'doorway' | 'stairs' | 'gate' | 'portal';
  /** Radians, the direction you face walking through it (0 = +x, PI/2 = +y). */
  facing: number;
  /** Area index in `DungeonRun.levels` it leads to, or 'town'. */
  to: number | 'town';
  /** Zone of this area the exit stands in. */
  zone: number;
}

/** What a whole map is, for the HUD, the minimap and the story layer. */
export interface MapInfo {
  /** "Gallows Fen" — the map's own name. */
  name: string;
  /** Scaling tier. Equal to `DungeonRun.depth`, which every curve still reads. */
  tier: number;
  /** Theme id the zone chain was drawn from (world/MapGen.ts). */
  theme: string;
  /** Every zone in the map, in order, and which area (level index) holds it. */
  zones: Array<{ name: string; biome: BiomeId; outdoor: boolean; area: number }>;
}

export type LevelEventKind = 'cursedChest' | 'fallenAdventurer' | 'choiceShrine' | 'treasureRunner';

export interface LevelEvent {
  kind: LevelEventKind;
  /** Tile coordinates. */
  x: number;
  y: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
  monsterId: string;
  rank: MonsterRank;
  affixes: string[];
  /** Pack id — members share aggro. */
  packId: number;
  /**
   * A named rare's id, when this spawn is one. The entity layer resolves it to
   * a name, a title, fixed affixes and a stat bump.
   */
  named?: string;
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
  /** The biome variant every level of this run wears. */
  variant?: string;
  /**
   * The run theme the map rolled (`world/Themes.ts`: flooded, overgrown,
   * burnt, haunted), or none. Each level carries it too.
   */
  runTheme?: string;
  levels: DungeonLevel[];
  quest: QuestInstance;
  /** Global run modifiers from endless scaling. */
  modifiers: string[];
  bossId: string;
  /** The boss's mood, rolled from tier 15 down and shown on its gate. */
  bossMood?: BossMood;
  /** The map this run is (maps remake). Optional for old callers and tools. */
  map?: MapInfo;
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
  /** Hero blows of this element barely land this phase (gold plates, a ward). */
  immune?: DamageType;
  /** Its body's size this phase, against its full size (a hag melting down). */
  body?: number;
  /** It flees to the next room as the phase begins (Boss.fleeTo). */
  flee?: boolean;
}

/** How big a boss stands (docs/remake/depth.md, Part 3). */
export type BossSize = 'person' | 'tall' | 'large' | 'giant';
/**
 * How a boss fights, and so where its numbers come from: a duelist hits hard
 * and dies fast, a sponge barely hurts and takes forever. See `BOSS_PROFILES`.
 */
export type BossProfile = 'duelist' | 'bulwark' | 'sponge' | 'glass' | 'swarm' | 'bruiser';
/** Straight (one or two phases, no gimmick), phased (three or more), or puzzle (a room rule to solve). */
export type BossShape = 'straight' | 'phased' | 'puzzle';
/** A twist rolled on a boss from tier 15 down, shown on its gate. See `data/bosses.ts`. */
export type BossMood = 'wounded' | 'crowned' | 'hungry' | 'ancient' | 'haunted';

export interface BossDef {
  id: string;
  name: string;
  title: string;
  family: MonsterFamily;
  minDepth: number;
  biomes: BiomeId[];
  /**
   * Life and damage multipliers. Left out, they come from the profile and the
   * tier (`bossNumbers`); the first 24 bosses keep the numbers they were tuned with.
   */
  lifeMul?: number;
  damageMul?: number;
  scale: number;
  /** Left out, it follows from `scale` (`bossSize`). */
  size?: BossSize;
  profile: BossProfile;
  shape: BossShape;
  /**
   * How far its moves reach, as a body scale. Left out, it is `scale`. A boss
   * made smaller than it was tuned keeps its old reach, so its fight is the same.
   */
  reach?: number;
  /** Uniques it drops more often than anything else does. */
  signature?: string[];
  /** A small boss of an ordinary floor, in a side room with its own chest. */
  warden?: boolean;
  /**
   * A warden's one rule, beyond its moves. `debt`: each blow that lands takes
   * a little of the hero's gold, and it all comes back, with interest, when
   * the warden dies.
   */
  trick?: 'debt';
  phases: BossPhase[];
  /** Adds summoned during the fight. */
  adds?: string[];
  /** Intro text shown on the boss gate. */
  intro: string;
  visual: MonsterVisual;
  /** Guaranteed loot table hooks. */
  lootTier: number;
  music: string;
  /** Linked-pair rule: the monster that fights beside it. */
  partner?: string;
  /** Weak-points rule: its limbs, and the attack each one takes with it. */
  limbs?: Array<{ name: string; ability?: string }>;
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
  /** Knockback impulse in world units. Below zero pulls toward `from`. */
  knockback?: number;
  /** Where the blow came from, so a knockback pushes away from it. */
  from?: { x: number; z: number };
  /** Status effects to apply on hit. */
  applies?: StatusApplication[];
  /**
   * Shares of `amount` (0..1) that are another element's flat damage riding
   * on this hit: a poison coat or a fire-damage ring on a physical swing. The
   * hit is mitigated as one packet; the share only decides how the damage
   * number is drawn, so each element shows in its own colour.
   */
  parts?: Partial<Record<DamageType, number>>;
  /**
   * Set on blows from a boss, its arena and its traps: the most of the
   * hero's full life this blow may take (sim/FairFight.ts). Also caps how
   * long anything it carries can hold the hero.
   */
  fair?: number;
}

export interface StatusApplication {
  id: string;
  duration: number;
  magnitude: number;
  stacks?: number;
  /** Raises the stack ceiling for this application. Smolder and Cultivate. */
  maxStacks?: number;
  /** Multiplies how fast the effect ticks. Pyre Mastery. */
  tickScale?: number;
  /**
   * Damage per second per stack taken from the blow that applied it, before
   * magnitude and tick rate. Set by the monster for the hero's poison, so a
   * venom scales with the hand that delivered it. Absent: the depth curve.
   */
  power?: number;
  /**
   * Stat changes for this application in place of the def's own. A skill
   * buff builds them from its rank, so ten points in it are worth more than
   * one.
   */
  mods?: Partial<Stats>;
  /** Damage this application soaks, in place of `def.absorb * magnitude`. */
  absorb?: number;
  /** Gash: when it runs out, it bursts for this percent of the damage it dealt over its time. */
  burstPct?: number;
  /** Unrelenting: on a target below this percent of life, the effect stops running out. */
  holdBelow?: number;
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

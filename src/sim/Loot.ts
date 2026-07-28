/**
 * SLAY — loot generation, item statistics and the tooltip.
 *
 * This is the module the whole game orbits. Three jobs:
 *
 * 1. **Rolling.** `rollItem` picks a base weighted by item level and class,
 *    rolls a rarity through a magic-find curve with real diminishing returns,
 *    then rolls affixes respecting groups, ilvl tiers and slot restrictions.
 *    `rollDrops` wraps that in a monster drop table with gold and materials.
 *
 * 2. **Resolving.** `itemStats` turns a rolled item into the stat block the
 *    character sheet adds up. It resolves base values, upgrade scaling,
 *    implicits, affixes, socketed gems/runes and runewords.
 *
 *    One convention worth knowing: `enhancedDamage` / `enhancedDefense` are
 *    *absorbed locally* on items that have base damage / base defence, exactly
 *    like Diablo 2. A sword's "+150% Enhanced Damage" multiplies that sword's
 *    base damage and does not appear in the returned stat block. On an item
 *    with no base value to multiply (a ring), the same stat passes through
 *    untouched so the character layer can apply it globally.
 *
 * 3. **Presenting.** `itemTooltipLines` is the most-read UI in the game.
 *    Ordering, colour and the comparison deltas all live here.
 */

import type {
  CharClassId,
  Item,
  ItemBase,
  ItemCategory,
  ItemMod,
  ItemRarity,
  MonsterRank,
  Rng,
  StatKey,
  Stats,
} from '../types';
import { RARITY_COLOR } from '../types';
import {
  ITEM_BASES as ALL_BASES,
  baseDropWeight,
  baseValue,
  classAffinity,
  findBase,
  isEquippable,
  isStackableCategory,
  maxSockets,
} from '../data/itemBases';
import { AFFIXES as ALL_AFFIXES, affixNameWord } from '../data/affixes';
import { UNIQUES, uniqueDropWeight, uniquePool, getUnique } from '../data/uniques';
import type { UniqueDef } from '../data/uniques';
import {
  SETS,
  getSet,
  getSetPiece,
  setPieceDropWeight,
  setPool,
} from '../data/sets';
import type { SetPieceDef } from '../data/sets';
import {
  getSocketable,
  matchRuneword,
  socketBonuses,
  socketableDropPool,
  socketableWeight,
} from '../data/gems';
import { MATERIALS, materialDropPool, materialName } from '../data/materials';

// ---------------------------------------------------------------------------
// Contract exports
// ---------------------------------------------------------------------------

export const ITEM_BASES = ALL_BASES;
export const AFFIXES = ALL_AFFIXES;

/** Fallback so a corrupt save or a bad id can never hard-crash a scene. */
const UNKNOWN_BASE: ItemBase = {
  id: 'unknown',
  name: 'Unknown Object',
  category: 'material',
  slot: 'none',
  levelReq: 1,
  visual: { shape: 'material.dust', palette: 'stone.crypt', ornate: 0 },
};

const BASE_BY_ID = new Map<string, ItemBase>(ALL_BASES.map((b) => [b.id, b]));

export function getBase(baseId: string): ItemBase {
  return BASE_BY_ID.get(baseId) ?? findBase(baseId) ?? UNKNOWN_BASE;
}

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Each blacksmith upgrade adds this fraction of the base damage / defence. */
export const UPGRADE_BASE_STEP = 0.1;
/** ...and this fraction to every rolled modifier. */
export const UPGRADE_MOD_STEP = 0.04;

const RARITY_VALUE_MUL: Record<ItemRarity, number> = {
  normal: 1,
  magic: 2.2,
  rare: 4.6,
  set: 8,
  unique: 12,
  mythic: 32,
  ancient: 85,
};

/** Base drop chance per rolled item, before magic find. */
const RARITY_CHANCE: Array<{ rarity: ItemRarity; chance: number; mfCap: number; minIlvl: number }> = [
  { rarity: 'ancient', chance: 0.00012, mfCap: 140, minIlvl: 78 },
  { rarity: 'mythic', chance: 0.0011, mfCap: 190, minIlvl: 58 },
  { rarity: 'unique', chance: 0.0105, mfCap: 250, minIlvl: 1 },
  { rarity: 'set', chance: 0.0145, mfCap: 420, minIlvl: 1 },
  { rarity: 'rare', chance: 0.056, mfCap: 500, minIlvl: 1 },
  { rarity: 'magic', chance: 0.27, mfCap: 600, minIlvl: 1 },
];

/**
 * Diminishing magic find, the D2 curve: `effective = mf * cap / (mf + cap)`.
 * A low cap bites early, which is why 300% magic find roughly doubles your
 * rare rate but barely moves ancients at all.
 */
export function magicFindFactor(magicFind: number, cap: number): number {
  if (magicFind <= 0) return 1;
  const effective = (magicFind * cap) / (magicFind + cap);
  return 1 + effective / 100;
}

// ---------------------------------------------------------------------------
// uid
// ---------------------------------------------------------------------------

let uidCounter = 0;

function makeUid(rng: Rng): string {
  uidCounter = (uidCounter + 1) % 0xffffff;
  const r = Math.floor(rng.next() * 0xffffffff).toString(36);
  return `i${r}${uidCounter.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Affix rolling
// ---------------------------------------------------------------------------

const RARITY_RANK: Record<ItemRarity, number> = {
  normal: 0,
  magic: 1,
  rare: 2,
  set: 3,
  unique: 4,
  mythic: 5,
  ancient: 6,
};

function affixAllowed(affix: (typeof ALL_AFFIXES)[number], base: ItemBase, rarity: ItemRarity): boolean {
  if (affix.categories && affix.categories.length > 0 && !affix.categories.includes(base.category)) return false;
  if (affix.slots && affix.slots.length > 0) {
    if (base.slot === 'twoHand' || base.slot === 'consumable' || base.slot === 'none') return false;
    if (!affix.slots.includes(base.slot)) return false;
  }
  if (affix.minRarity && RARITY_RANK[rarity] < RARITY_RANK[affix.minRarity]) return false;
  return true;
}

/**
 * Which tiers of a ladder may roll at this item level.
 *
 * Two rules working together: a tier must be *unlocked* (`tier.ilvl <= ilvl`),
 * and it must not be more than four rungs below the best unlocked tier. The
 * second rule is what makes deep drops feel different — at ilvl 90 the bottom
 * of every ladder has fallen out of the pool entirely.
 */
export function eligibleTiers(affix: (typeof ALL_AFFIXES)[number], ilvl: number) {
  const unlocked = affix.tiers.filter((t) => t.ilvl <= ilvl);
  if (unlocked.length === 0) return [];
  const best = unlocked[unlocked.length - 1].tier;
  return unlocked.filter((t) => t.tier > best - 5);
}

function affixPoolWeight(affix: (typeof ALL_AFFIXES)[number], ilvl: number): number {
  const tiers = eligibleTiers(affix, ilvl);
  if (tiers.length === 0) return 0;
  let w = 0;
  for (const t of tiers) w += t.weight;
  // Normalise so ladders with more live rungs are not over-selected.
  return w / Math.sqrt(tiers.length);
}

function rollOneAffix(
  base: ItemBase,
  ilvl: number,
  rarity: ItemRarity,
  kind: 'prefix' | 'suffix',
  usedGroups: Set<string>,
  rng: Rng,
): ItemMod | null {
  const pool = ALL_AFFIXES.filter(
    (a) => a.kind === kind && !usedGroups.has(a.group) && affixAllowed(a, base, rarity) && affixPoolWeight(a, ilvl) > 0,
  );
  if (pool.length === 0) return null;
  const affix = rng.weighted(pool, (a) => affixPoolWeight(a, ilvl));
  const tiers = eligibleTiers(affix, ilvl);
  if (tiers.length === 0) return null;
  const tier = rng.weighted(tiers, (t) => t.weight);
  usedGroups.add(affix.group);
  const value = tier.min === tier.max ? tier.min : rng.int(tier.min, tier.max);
  return { affixId: affix.id, stat: affix.stat, value, tier: tier.tier, kind };
}

/** How many prefixes and suffixes a rarity gets. */
function affixBudget(rarity: ItemRarity, rng: Rng): { prefixes: number; suffixes: number } {
  switch (rarity) {
    case 'magic': {
      const two = rng.chance(0.62);
      if (!two) return rng.chance(0.5) ? { prefixes: 1, suffixes: 0 } : { prefixes: 0, suffixes: 1 };
      return { prefixes: 1, suffixes: 1 };
    }
    case 'rare': {
      const total = rng.weighted([3, 4, 5, 6], (n) => (n === 3 ? 30 : n === 4 ? 38 : n === 5 ? 22 : 10));
      const prefixes = Math.min(3, Math.max(1, Math.round(total / 2 + (rng.chance(0.5) ? 0.5 : -0.5))));
      return { prefixes, suffixes: Math.min(3, total - prefixes) };
    }
    default:
      return { prefixes: 0, suffixes: 0 };
  }
}

function rollAffixes(base: ItemBase, ilvl: number, rarity: ItemRarity, rng: Rng): ItemMod[] {
  const budget = affixBudget(rarity, rng);
  const used = new Set<string>();
  const mods: ItemMod[] = [];
  for (let i = 0; i < budget.prefixes; i++) {
    const mod = rollOneAffix(base, ilvl, rarity, 'prefix', used, rng);
    if (mod) mods.push(mod);
  }
  for (let i = 0; i < budget.suffixes; i++) {
    const mod = rollOneAffix(base, ilvl, rarity, 'suffix', used, rng);
    if (mod) mods.push(mod);
  }
  return mods;
}

function rollImplicits(base: ItemBase, rng: Rng): ItemMod[] {
  if (!base.implicits) return [];
  return base.implicits.map((imp, i) => ({
    affixId: `implicit.${base.id}.${i}`,
    stat: imp.stat,
    value: imp.min === imp.max ? imp.min : rng.int(imp.min, imp.max),
    tier: 0,
    kind: 'implicit' as const,
  }));
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

type NameTheme =
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'poison'
  | 'arcane'
  | 'physical'
  | 'life'
  | 'defense'
  | 'speed'
  | 'fortune'
  | 'skill';

const THEME_OF_STAT: Partial<Record<StatKey, NameTheme>> = {
  fireDamage: 'fire',
  fireResist: 'fire',
  coldDamage: 'cold',
  coldResist: 'cold',
  lightningDamage: 'lightning',
  lightningResist: 'lightning',
  poisonDamage: 'poison',
  poisonResist: 'poison',
  arcaneDamage: 'arcane',
  arcaneResist: 'arcane',
  enhancedDamage: 'physical',
  minDamage: 'physical',
  maxDamage: 'physical',
  critChance: 'physical',
  critDamage: 'physical',
  attackRating: 'physical',
  lifeSteal: 'life',
  life: 'life',
  lifeRegen: 'life',
  vitality: 'life',
  defense: 'defense',
  enhancedDefense: 'defense',
  damageReduction: 'defense',
  physicalResist: 'defense',
  blockChance: 'defense',
  moveSpeed: 'speed',
  attackSpeed: 'speed',
  castSpeed: 'speed',
  cooldownReduction: 'speed',
  magicFind: 'fortune',
  goldFind: 'fortune',
  skillLevels: 'skill',
  mana: 'skill',
  manaRegen: 'skill',
  energy: 'skill',
};

const THEME_WORDS: Record<NameTheme, string[]> = {
  fire: ['Ember', 'Cinder', 'Pyre', 'Blaze', 'Scorch', 'Sunfall', 'Kiln', 'Wildfire', 'Char', 'Hearth'],
  cold: ['Frost', 'Rime', 'Glacier', 'Hoar', 'Winter', 'Blizzard', 'Icefall', 'Chill', 'Whiteout', 'Snowbind'],
  lightning: ['Storm', 'Thunder', 'Spark', 'Arc', 'Tempest', 'Skyfire', 'Galebreak', 'Bolt', 'Flashpoint', 'Static'],
  poison: ['Blight', 'Venom', 'Rot', 'Plague', 'Spore', 'Bile', 'Wither', 'Mire', 'Canker', 'Fenrot'],
  arcane: ['Void', 'Null', 'Ether', 'Rift', 'Dream', 'Umbra', 'Aether', 'Cipher', 'Hollow', 'Starless'],
  physical: ['Havoc', 'Gore', 'Brute', 'Carnage', 'Warbrand', 'Butcher', 'Grim', 'Ironhewn', 'Bloodrust', 'Skullsplit'],
  life: ['Bloodroot', 'Heartwood', 'Vital', 'Quickblood', 'Redoak', 'Marrow', 'Lifespring', 'Thrum', 'Pulse', 'Sanguine'],
  defense: ['Ironhold', 'Stonefast', 'Bulwark', 'Aegis', 'Anvil', 'Granite', 'Rampart', 'Deepstone', 'Shieldwall', 'Bastion'],
  speed: ['Swiftmark', 'Windcut', 'Fleet', 'Quicksilver', 'Blur', 'Featherfall', 'Racing', 'Slipstream', 'Hasten', 'Darting'],
  fortune: ['Goldvein', 'Magpie', 'Raven', 'Treasure', 'Kingsluck', 'Coinfall', 'Hoard', 'Fortune', 'Gilded', 'Windfall'],
  skill: ['Mystic', 'Sagebound', 'Prophet', 'Oracle', 'Runeward', 'Elder', 'Adept', 'Whispering', 'Arcanum', 'Farseer'],
};

const NOUN_GROUPS: Record<string, string[]> = {
  blade: ['Edge', 'Brand', 'Fang', 'Song', 'Sliver', 'Whisper', 'Bite', 'Tooth', 'Razor', 'Reaver'],
  heavy: ['Cleaver', 'Splitter', 'Crusher', 'Weight', 'Ruin', 'Breaker', 'Maw', 'Spike', 'Sunder', 'Hew'],
  ranged: ['Arc', 'Reach', 'Hunt', 'Sight', 'Wing', 'Strand', 'Cry', 'Flight', 'Talon', 'Loft'],
  caster: ['Call', 'Chant', 'Sigh', 'Rune', 'Wish', 'Grasp', 'Star', 'Echo', 'Spell', 'Verse'],
  helm: ['Crown', 'Visage', 'Gaze', 'Brow', 'Mask', 'Vigil', 'Halo', 'Skull', 'Cowl', 'Helm'],
  chest: ['Guard', 'Shell', 'Hide', 'Coat', 'Ward', 'Carapace', 'Bulwark', 'Weave', 'Mantle', 'Shroud'],
  gloves: ['Grasp', 'Grip', 'Touch', 'Clutch', 'Hand', 'Talon', 'Fist', 'Knuckle', 'Palm', 'Snare'],
  boots: ['Stride', 'Tread', 'Trail', 'Step', 'Walk', 'Pace', 'Trek', 'March', 'Gait', 'Course'],
  belt: ['Cord', 'Girth', 'Clasp', 'Wrap', 'Bind', 'Loop', 'Cinch', 'Knot', 'Girdle', 'Sash'],
  shield: ['Wall', 'Ward', 'Bastion', 'Guard', 'Face', 'Rampart', 'Barrier', 'Aegis', 'Refuge', 'Stand'],
  jewel: ['Eye', 'Heart', 'Knot', 'Token', 'Seal', 'Tear', 'Vow', 'Oath', 'Star', 'Coil'],
  quiver: ['Sheaf', 'Bundle', 'Score', 'Volley', 'Cache', 'Flight'],
  misc: ['Relic', 'Shard', 'Fragment', 'Remnant', 'Sign', 'Mark'],
};

function nounGroupFor(category: ItemCategory): string {
  switch (category) {
    case 'sword':
    case 'dagger':
      return 'blade';
    case 'axe':
    case 'mace':
    case 'spear':
      return 'heavy';
    case 'bow':
    case 'crossbow':
      return 'ranged';
    case 'wand':
    case 'staff':
    case 'scepter':
    case 'orb':
      return 'caster';
    case 'helm':
      return 'helm';
    case 'chest':
      return 'chest';
    case 'gloves':
      return 'gloves';
    case 'boots':
      return 'boots';
    case 'belt':
      return 'belt';
    case 'shield':
      return 'shield';
    case 'amulet':
    case 'ring':
    case 'charm':
      return 'jewel';
    case 'quiver':
      return 'quiver';
    default:
      return 'misc';
  }
}

/** Picks the theme from the item's strongest-tier modifier. */
function dominantTheme(mods: ItemMod[]): NameTheme {
  let best: NameTheme = 'physical';
  let bestTier = -1;
  for (const mod of mods) {
    const theme = THEME_OF_STAT[mod.stat];
    if (!theme) continue;
    if (mod.tier > bestTier) {
      bestTier = mod.tier;
      best = theme;
    }
  }
  return best;
}

function rareName(base: ItemBase, mods: ItemMod[], rng: Rng): string {
  const theme = dominantTheme(mods);
  const first = rng.pick(THEME_WORDS[theme]);
  const nouns = NOUN_GROUPS[nounGroupFor(base.category)] ?? NOUN_GROUPS.misc;
  const second = rng.pick(nouns);
  // "Emberbrand Edge" reads better than "Ember Edge" about half the time.
  if (rng.chance(0.32) && first.length + second.length <= 15) return `${first}${second.toLowerCase()}`;
  return `${first} ${second}`;
}

function magicName(base: ItemBase, mods: ItemMod[]): string {
  const prefix = mods.find((m) => m.kind === 'prefix');
  const suffix = mods.find((m) => m.kind === 'suffix');
  const preWord = prefix ? affixNameWord(prefix.affixId) : undefined;
  const sufWord = suffix ? affixNameWord(suffix.affixId) : undefined;
  let name = base.name;
  if (preWord) name = `${preWord} ${name}`;
  if (sufWord) name = `${name} ${sufWord}`;
  return name;
}

export function itemDisplayName(item: Item): string {
  return item.name;
}

// ---------------------------------------------------------------------------
// Item construction
// ---------------------------------------------------------------------------

function newItem(base: ItemBase, ilvl: number, rarity: ItemRarity, rng: Rng): Item {
  return {
    uid: makeUid(rng),
    baseId: base.id,
    name: base.name,
    rarity,
    ilvl,
    mods: [],
    upgrade: 0,
    sockets: [],
    value: 0,
    seen: false,
  };
}

function rollSockets(base: ItemBase, ilvl: number, rarity: ItemRarity, rng: Rng): Array<{ gemId: string | null }> {
  const cap = maxSockets(base);
  if (cap <= 0) return [];
  // Most items have none. Rarer items skew higher, and ilvl caps the count.
  const ilvlCap = Math.max(1, Math.min(cap, Math.floor(ilvl / 14) + 1));
  const chance = rarity === 'normal' ? 0.3 : rarity === 'magic' ? 0.22 : rarity === 'rare' ? 0.2 : 0.16;
  if (!rng.chance(chance)) return [];
  const n = rng.weighted([1, 2, 3, 4, 5, 6], (k) => (k > ilvlCap ? 0 : 100 / Math.pow(1.9, k - 1)));
  return new Array(n).fill(null).map(() => ({ gemId: null as string | null }));
}

function buildUniqueItem(def: UniqueDef, ilvl: number, rng: Rng): Item {
  const base = getBase(def.baseId);
  const item = newItem(base, Math.max(ilvl, def.ilvl), def.rarity, rng);
  item.name = def.name;
  item.uniqueId = def.id;
  item.mods = rollImplicits(base, rng);
  def.mods.forEach((mod, i) => {
    item.mods.push({
      affixId: `unique.${def.id}.${i}`,
      stat: mod.stat,
      value: mod.min === mod.max ? mod.min : rng.int(mod.min, mod.max),
      tier: 0,
      kind: mod.kind ?? 'prefix',
    });
  });
  if (def.sockets) item.sockets = new Array(def.sockets).fill(null).map(() => ({ gemId: null as string | null }));
  item.value = vendorPrice(item, false) * 4;
  return item;
}

function buildSetItem(piece: SetPieceDef, ilvl: number, rng: Rng): Item {
  const base = getBase(piece.baseId);
  const item = newItem(base, Math.max(ilvl, piece.ilvl), 'set', rng);
  item.name = piece.name;
  item.setId = piece.setId;
  item.uniqueId = piece.id;
  item.mods = rollImplicits(base, rng);
  piece.mods.forEach((mod: { stat: StatKey; min: number; max: number }, i: number) => {
    item.mods.push({
      affixId: `set.${piece.id}.${i}`,
      stat: mod.stat,
      value: mod.min === mod.max ? mod.min : rng.int(mod.min, mod.max),
      tier: 0,
      kind: 'prefix',
    });
  });
  if (piece.sockets) item.sockets = new Array(piece.sockets).fill(null).map(() => ({ gemId: null as string | null }));
  item.value = vendorPrice(item, false) * 4;
  return item;
}

/** Builds a plain instance of a base — used for starting gear and vendors. */
export function createItem(baseId: string, ilvl: number, rng: Rng, rarity: ItemRarity = 'normal'): Item {
  const base = getBase(baseId);
  const item = newItem(base, ilvl, rarity, rng);
  item.mods = rollImplicits(base, rng);
  if (rarity === 'magic' || rarity === 'rare') {
    item.mods.push(...rollAffixes(base, ilvl, rarity, rng));
    item.name = rarity === 'magic' ? magicName(base, item.mods) : rareName(base, item.mods, rng);
  }
  item.sockets = rollSockets(base, ilvl, rarity, rng);
  item.value = vendorPrice(item, false) * 4;
  return item;
}

// ---------------------------------------------------------------------------
// rollItem
// ---------------------------------------------------------------------------

function rollRarity(ilvl: number, magicFind: number, rng: Rng): ItemRarity {
  const roll = rng.next();
  let acc = 0;
  for (const tier of RARITY_CHANCE) {
    if (ilvl < tier.minIlvl) continue;
    acc += tier.chance * magicFindFactor(magicFind, tier.mfCap);
    if (roll < acc) return tier.rarity;
  }
  return 'normal';
}

function pickBase(ilvl: number, rng: Rng, category?: ItemCategory, classId?: CharClassId): ItemBase {
  const pool = ALL_BASES.filter(
    (b) =>
      isEquippable(b) &&
      b.category !== 'charm' &&
      (category === undefined || b.category === category) &&
      baseDropWeight(b, ilvl) > 0,
  );
  if (pool.length === 0) return getBase('sword.short');
  return rng.weighted(pool, (b) => baseDropWeight(b, ilvl) * classAffinity(b, classId));
}

/**
 * The core drop roll.
 *
 * `magicFind` is a percentage and is applied through `magicFindFactor`, so it
 * has strong early returns and heavily diminished late ones — 100% roughly
 * doubles your rare rate, 500% does not roughly sextuple it.
 */
export function rollItem(
  ilvl: number,
  rng: Rng,
  opts: { magicFind?: number; forceRarity?: ItemRarity; category?: ItemCategory; classId?: CharClassId } = {},
): Item {
  const lvl = Math.max(1, Math.round(ilvl));
  const magicFind = opts.magicFind ?? 0;
  let rarity = opts.forceRarity ?? rollRarity(lvl, magicFind, rng);

  // Unique / set tiers resolve against their own definition pools. If nothing
  // is available at this level the roll degrades gracefully rather than
  // producing an empty item.
  if (rarity === 'ancient' || rarity === 'mythic' || rarity === 'unique') {
    const pool = uniquePool(rarity, lvl).filter((d) => {
      if (opts.category && getBase(d.baseId).category !== opts.category) return false;
      return uniqueDropWeight(d, lvl) > 0;
    });
    if (pool.length > 0) {
      const def = rng.weighted(pool, (d) => uniqueDropWeight(d, lvl));
      return buildUniqueItem(def, lvl, rng);
    }
    rarity = 'rare';
  }

  if (rarity === 'set') {
    const pool = setPool(lvl).filter((p: SetPieceDef) => {
      if (opts.category && getBase(p.baseId).category !== opts.category) return false;
      return setPieceDropWeight(p, lvl) > 0;
    });
    if (pool.length > 0) {
      const piece = rng.weighted(pool, (p) => setPieceDropWeight(p, lvl));
      return buildSetItem(piece, lvl, rng);
    }
    rarity = 'rare';
  }

  const base = pickBase(lvl, rng, opts.category, opts.classId);
  const item = newItem(base, lvl, rarity, rng);
  item.mods = rollImplicits(base, rng);

  if (rarity === 'magic' || rarity === 'rare') {
    const affixes = rollAffixes(base, lvl, rarity, rng);
    item.mods.push(...affixes);
    item.name = rarity === 'magic' ? magicName(base, affixes) : rareName(base, affixes, rng);
  }

  item.sockets = rollSockets(base, lvl, rarity, rng);
  item.value = vendorPrice(item, false) * 4;
  return item;
}

/** Rolls a gem, rune or material as a droppable item instance. */
export function rollSocketable(ilvl: number, rng: Rng): Item | null {
  const pool = socketableDropPool(ilvl).filter((s) => socketableWeight(s, ilvl) > 0);
  if (pool.length === 0) return null;
  const def = rng.weighted(pool, (s) => socketableWeight(s, ilvl));
  const base = getBase(def.id);
  const item = newItem(base, ilvl, 'normal', rng);
  item.value = def.value;
  return item;
}

// ---------------------------------------------------------------------------
// rollDrops
// ---------------------------------------------------------------------------

interface RankProfile {
  /** Expected number of equipment rolls. */
  items: number;
  /** Additional flat chance of one more. */
  bonusChance: number;
  goldMul: number;
  /** Chance of a gem/rune drop. */
  socketableChance: number;
  /** Number of material rolls. */
  materialRolls: number;
  /** Flat magic-find bonus the rank itself contributes. */
  mfBonus: number;
}

const RANK_PROFILE: Record<MonsterRank, RankProfile> = {
  // Normals dropped once every six kills, which reads as "loot is broken"
  // long before it reads as "loot is rare".
  normal: { items: 0, bonusChance: 0.38, goldMul: 1, socketableChance: 0.06, materialRolls: 0, mfBonus: 0 },
  champion: { items: 1, bonusChance: 0.45, goldMul: 2.4, socketableChance: 0.12, materialRolls: 1, mfBonus: 15 },
  elite: { items: 1, bonusChance: 0.5, goldMul: 4.2, socketableChance: 0.17, materialRolls: 1, mfBonus: 35 },
  rare: { items: 2, bonusChance: 0.55, goldMul: 7, socketableChance: 0.26, materialRolls: 2, mfBonus: 60 },
  boss: { items: 4, bonusChance: 0.9, goldMul: 22, socketableChance: 0.85, materialRolls: 4, mfBonus: 120 },
};

/** Everything a killed monster drops. */
export function rollDrops(
  ilvl: number,
  rank: MonsterRank,
  rng: Rng,
  magicFind: number,
  goldFind: number,
): { items: Item[]; gold: number; materials: Record<string, number> } {
  const lvl = Math.max(1, Math.round(ilvl));
  const profile = RANK_PROFILE[rank] ?? RANK_PROFILE.normal;
  const mf = Math.max(0, magicFind) + profile.mfBonus;

  const items: Item[] = [];
  let count = profile.items;
  if (rng.chance(profile.bonusChance)) count++;
  for (let i = 0; i < count; i++) {
    items.push(rollItem(lvl, rng, { magicFind: mf }));
  }

  // A boss is guaranteed one roll that cannot come out worse than rare.
  if (rank === 'boss') {
    const forced = rollItem(lvl, rng, { magicFind: mf + 200 });
    items.push(RARITY_RANK[forced.rarity] >= RARITY_RANK.rare ? forced : rollItem(lvl, rng, { forceRarity: 'rare' }));
  }

  if (rng.chance(profile.socketableChance)) {
    const socketable = rollSocketable(lvl, rng);
    if (socketable) items.push(socketable);
  }

  // Gold. Scales with depth and rank, then gold find, then a wide variance so
  // the numbers on screen never look metronomic.
  const goldBase = (10 + lvl * 3.4 + lvl * lvl * 0.045) * profile.goldMul;
  const gold = Math.max(1, Math.round(goldBase * rng.range(0.65, 1.45) * (1 + Math.max(0, goldFind) / 100)));

  const materials: Record<string, number> = {};
  const pool = materialDropPool(lvl, rank);
  if (pool.length > 0) {
    let rolls = profile.materialRolls;
    if (rank === 'normal' && rng.chance(0.16)) rolls = 1;
    for (let i = 0; i < rolls; i++) {
      const mat = rng.weighted(pool, (mmat) => mmat.weight / Math.pow(1.9, mmat.tier - 1));
      const amount = mat.tier >= 4 ? 1 : mat.tier === 3 ? rng.int(1, 2) : rng.int(1, 3);
      materials[mat.id] = (materials[mat.id] ?? 0) + amount;
    }
  }

  return { items, gold, materials };
}

// ---------------------------------------------------------------------------
// itemStats
// ---------------------------------------------------------------------------

function addStat(out: Partial<Stats>, key: StatKey, value: number): void {
  out[key] = (out[key] ?? 0) + value;
}

/** Gem/rune bonuses currently socketed into an item. */
export function socketStats(item: Item): Partial<Stats> {
  const out: Partial<Stats> = {};
  const base = getBase(item.baseId);
  for (const socket of item.sockets) {
    if (!socket.gemId) continue;
    for (const bonus of socketBonuses(socket.gemId, base.category)) addStat(out, bonus.stat, bonus.value);
  }
  const word = matchRuneword(
    item.sockets.map((s) => s.gemId),
    base.category,
  );
  if (word) for (const bonus of word.mods) addStat(out, bonus.stat, bonus.value);
  return out;
}

/** The runeword an item's socket layout currently spells, if any. */
export function itemRuneword(item: Item) {
  const base = getBase(item.baseId);
  return matchRuneword(
    item.sockets.map((s) => s.gemId),
    base.category,
  );
}

/**
 * Everything one item contributes to the character's stat block.
 *
 * `enhancedDamage` / `enhancedDefense` are absorbed into this item's own base
 * values when it has them, and passed through as global stats when it does not
 * (see the module header).
 */
export function itemStats(item: Item): Partial<Stats> {
  const base = getBase(item.baseId);
  const out: Partial<Stats> = {};
  const upBase = 1 + item.upgrade * UPGRADE_BASE_STEP;
  const upMod = 1 + item.upgrade * UPGRADE_MOD_STEP;

  let enhancedDamage = 0;
  let enhancedDefense = 0;
  let flatMin = 0;
  let flatMax = 0;
  let flatDefense = 0;

  const consume = (stat: StatKey, value: number) => {
    switch (stat) {
      case 'enhancedDamage':
        enhancedDamage += value;
        return;
      case 'enhancedDefense':
        enhancedDefense += value;
        return;
      case 'minDamage':
        flatMin += value;
        return;
      case 'maxDamage':
        flatMax += value;
        return;
      case 'defense':
        flatDefense += value;
        return;
      default:
        addStat(out, stat, value);
    }
  };

  for (const mod of item.mods) {
    consume(mod.stat, mod.kind === 'implicit' ? mod.value : Math.round(mod.value * upMod));
  }
  const sockets = socketStats(item);
  for (const key of Object.keys(sockets) as StatKey[]) consume(key, sockets[key] ?? 0);

  const hasWeaponDamage = base.baseMinDamage !== undefined && base.baseMaxDamage !== undefined;
  if (hasWeaponDamage) {
    const edMul = 1 + enhancedDamage / 100;
    const min = Math.round((base.baseMinDamage ?? 0) * upBase * edMul) + flatMin;
    const max = Math.round((base.baseMaxDamage ?? 0) * upBase * edMul) + flatMax;
    if (min) addStat(out, 'minDamage', min);
    if (max) addStat(out, 'maxDamage', Math.max(max, min));
  } else {
    if (flatMin) addStat(out, 'minDamage', flatMin);
    if (flatMax) addStat(out, 'maxDamage', flatMax);
    if (enhancedDamage) addStat(out, 'enhancedDamage', enhancedDamage);
  }

  const hasDefense = (base.baseDefense ?? 0) > 0;
  if (hasDefense) {
    const edefMul = 1 + enhancedDefense / 100;
    const def = Math.round((base.baseDefense ?? 0) * upBase * edefMul) + flatDefense;
    if (def) addStat(out, 'defense', def);
  } else {
    if (flatDefense) addStat(out, 'defense', flatDefense);
    if (enhancedDefense) addStat(out, 'enhancedDefense', enhancedDefense);
  }

  if (base.baseBlock) addStat(out, 'blockChance', Math.round(base.baseBlock * 100));

  return out;
}

/** Displayed weapon damage band for an item, after upgrade and enhanced damage. */
export function itemDamageRange(item: Item): { min: number; max: number } | null {
  const base = getBase(item.baseId);
  if (base.baseMinDamage === undefined || base.baseMaxDamage === undefined) return null;
  const stats = itemStats(item);
  return { min: stats.minDamage ?? 0, max: stats.maxDamage ?? 0 };
}

/** Displayed defence for an item, after upgrade and enhanced defence. */
export function itemDefense(item: Item): number {
  const base = getBase(item.baseId);
  if (!base.baseDefense) return 0;
  return itemStats(item).defense ?? 0;
}

// ---------------------------------------------------------------------------
// Set bonuses
// ---------------------------------------------------------------------------

export interface SetBonusResult {
  stats: Partial<Stats>;
  /** One line per active bonus tier, for the character sheet. */
  lines: Array<{ setId: string; setName: string; pieces: number; required: number; desc: string; active: boolean }>;
}

/**
 * Resolves partial-set bonuses for a collection of equipped items. Called by
 * the character layer with everything currently worn.
 */
export function setBonusesFor(items: Array<Item | null | undefined>): SetBonusResult {
  const counts = new Map<string, Set<string>>();
  for (const item of items) {
    if (!item || !item.setId) continue;
    const seen = counts.get(item.setId) ?? new Set<string>();
    seen.add(item.uniqueId ?? item.baseId);
    counts.set(item.setId, seen);
  }
  const stats: Partial<Stats> = {};
  const lines: SetBonusResult['lines'] = [];
  for (const [setId, seen] of counts) {
    const def = getSet(setId);
    if (!def) continue;
    const worn = seen.size;
    for (const bonus of def.bonuses) {
      const active = worn >= bonus.pieces;
      lines.push({
        setId,
        setName: def.name,
        pieces: worn,
        required: bonus.pieces,
        desc: bonus.desc,
        active,
      });
      if (!active) continue;
      for (const mod of bonus.mods) addStat(stats, mod.stat, mod.value);
    }
  }
  return { stats, lines };
}

// ---------------------------------------------------------------------------
// Value
// ---------------------------------------------------------------------------

/** Rough gold worth of one point of a stat. Only used for pricing. */
const STAT_VALUE: Partial<Record<StatKey, number>> = {
  strength: 9,
  dexterity: 9,
  vitality: 9,
  energy: 8,
  life: 1.6,
  mana: 1.2,
  lifeRegen: 5,
  manaRegen: 2.5,
  attackRating: 0.5,
  minDamage: 7,
  maxDamage: 5,
  attackSpeed: 16,
  castSpeed: 16,
  critChance: 30,
  critDamage: 3,
  lifeSteal: 60,
  manaSteal: 45,
  defense: 1.1,
  blockChance: 18,
  damageReduction: 40,
  physicalResist: 30,
  fireResist: 5,
  coldResist: 5,
  lightningResist: 5,
  poisonResist: 5,
  arcaneResist: 5,
  fireDamage: 2,
  coldDamage: 2,
  lightningDamage: 1.4,
  poisonDamage: 1.8,
  arcaneDamage: 2.2,
  enhancedDamage: 3.2,
  enhancedDefense: 1.6,
  elementalDamagePct: 12,
  areaDamagePct: 9,
  moveSpeed: 20,
  magicFind: 9,
  goldFind: 2,
  cooldownReduction: 22,
  skillLevels: 900,
};

export function vendorPrice(item: Item, buying: boolean): number {
  const base = getBase(item.baseId);

  let value: number;
  if (base.category === 'gem' || base.category === 'rune') {
    value = getSocketable(base.id)?.value ?? 20;
  } else if (base.category === 'material') {
    value = MATERIALS.find((m) => m.id === base.id)?.value ?? 5;
  } else if (base.category === 'potion') {
    value = 20 + base.levelReq * 12;
  } else {
    value = baseValue(base) * (1 + item.upgrade * UPGRADE_BASE_STEP);
    for (const mod of item.mods) {
      if (mod.kind === 'implicit') continue;
      value += Math.abs(mod.value) * (STAT_VALUE[mod.stat] ?? 4);
    }
    value *= RARITY_VALUE_MUL[item.rarity] ?? 1;
    value *= 1 + item.sockets.length * 0.12;
    value *= 1 + item.upgrade * 0.14;
    if (item.corrupted) value *= 1.35;
  }

  if (buying) return Math.max(1, Math.round(value * 3.2));
  return Math.max(1, Math.round(value * 0.28));
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

const COLOR = {
  base: '#c8c8c8',
  dim: '#8b8378',
  body: '#ddd6c8',
  mod: '#6f8cff',
  implicit: '#a9b6d8',
  good: '#4fd964',
  bad: '#ff5a4a',
  gold: '#f5d76e',
  set: '#33d64a',
  socket: '#b8a978',
  rune: '#d8a860',
  flavor: '#7d7566',
} as const;

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function rarityColor(rarity: ItemRarity): string {
  return hexColor(RARITY_COLOR[rarity] ?? 0xc8c8c8);
}

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  sword: 'Sword',
  axe: 'Axe',
  mace: 'Mace',
  dagger: 'Dagger',
  spear: 'Polearm',
  bow: 'Bow',
  crossbow: 'Crossbow',
  wand: 'Wand',
  staff: 'Staff',
  scepter: 'Scepter',
  shield: 'Shield',
  orb: 'Orb',
  quiver: 'Quiver',
  helm: 'Helm',
  chest: 'Body Armor',
  gloves: 'Gloves',
  boots: 'Boots',
  belt: 'Belt',
  amulet: 'Amulet',
  ring: 'Ring',
  charm: 'Charm',
  gem: 'Gem',
  rune: 'Rune',
  potion: 'Potion',
  material: 'Crafting Material',
};

function typeLine(base: ItemBase): string {
  const label = CATEGORY_LABEL[base.category] ?? base.category;
  if (base.slot === 'twoHand') return `Two-Handed ${label}`;
  if (base.slot === 'mainHand' && base.baseMinDamage !== undefined) return `One-Handed ${label}`;
  return label;
}

function formatValue(stat: StatKey, value: number): string {
  if (stat === 'lightningDamage') return `${Math.max(1, Math.round(value * 0.25))}-${value}`;
  return `${value}`;
}

/** Renders one mod as its display line. */
export function modLine(mod: ItemMod): string {
  const affix = ALL_AFFIXES.find((a) => a.id === mod.affixId);
  if (affix) return affix.label.replace('{v}', formatValue(mod.stat, mod.value));
  return `${mod.value >= 0 ? '+' : ''}${formatValue(mod.stat, mod.value)} ${STAT_LABEL[mod.stat] ?? mod.stat}`;
}

const STAT_LABEL: Partial<Record<StatKey, string>> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  vitality: 'Vitality',
  energy: 'Energy',
  life: 'Life',
  mana: 'Mana',
  lifeRegen: 'Life Regeneration',
  manaRegen: '% Mana Regeneration',
  attackRating: 'Attack Rating',
  minDamage: 'Minimum Damage',
  maxDamage: 'Maximum Damage',
  attackSpeed: '% Attack Speed',
  castSpeed: '% Cast Speed',
  critChance: '% Critical Strike Chance',
  critDamage: '% Critical Strike Damage',
  lifeSteal: '% Life Stolen per Hit',
  manaSteal: '% Mana Stolen per Hit',
  defense: 'Defense',
  blockChance: '% Block Chance',
  damageReduction: '% Damage Reduction',
  physicalResist: '% Physical Resistance',
  fireResist: '% Fire Resistance',
  coldResist: '% Cold Resistance',
  lightningResist: '% Lightning Resistance',
  poisonResist: '% Poison Resistance',
  arcaneResist: '% Arcane Resistance',
  fireDamage: 'Fire Damage',
  coldDamage: 'Cold Damage',
  lightningDamage: 'Lightning Damage',
  poisonDamage: 'Poison Damage',
  arcaneDamage: 'Arcane Damage',
  enhancedDamage: '% Enhanced Damage',
  enhancedDefense: '% Enhanced Defense',
  elementalDamagePct: '% Elemental Damage',
  areaDamagePct: '% Area Damage',
  moveSpeed: '% Movement Speed',
  magicFind: '% Magic Find',
  goldFind: '% Gold Find',
  cooldownReduction: '% Cooldown Reduction',
  skillLevels: 'to All Skills',
};

/** Sort order inside the affix block — offence, then defence, then utility. */
const STAT_ORDER: StatKey[] = [
  'skillLevels',
  'enhancedDamage',
  'minDamage',
  'maxDamage',
  'attackRating',
  'attackSpeed',
  'castSpeed',
  'critChance',
  'critDamage',
  'fireDamage',
  'coldDamage',
  'lightningDamage',
  'poisonDamage',
  'arcaneDamage',
  'elementalDamagePct',
  'areaDamagePct',
  'lifeSteal',
  'manaSteal',
  'enhancedDefense',
  'defense',
  'blockChance',
  'damageReduction',
  'physicalResist',
  'fireResist',
  'coldResist',
  'lightningResist',
  'poisonResist',
  'arcaneResist',
  'life',
  'mana',
  'lifeRegen',
  'manaRegen',
  'strength',
  'dexterity',
  'vitality',
  'energy',
  'moveSpeed',
  'cooldownReduction',
  'magicFind',
  'goldFind',
];

function statOrder(stat: StatKey): number {
  const i = STAT_ORDER.indexOf(stat);
  return i < 0 ? STAT_ORDER.length : i;
}

/** Requirement context. Optional — omit it and requirements render neutral. */
export interface TooltipContext {
  level?: number;
  strength?: number;
  dexterity?: number;
  classId?: CharClassId;
}

type Line = { text: string; color: string; bold?: boolean };

/**
 * Full D2-style tooltip.
 *
 * Pass `compareTo` (usually the currently equipped item in the same slot) to
 * get a comparison block with green/red deltas. The optional third argument
 * supplies the character's level and attributes so unmet requirements render
 * red; without it they render neutral.
 */
export function itemTooltipLines(item: Item, compareTo?: Item, ctx?: TooltipContext): Line[] {
  const base = getBase(item.baseId);
  const lines: Line[] = [];
  const rc = rarityColor(item.rarity);

  const push = (text: string, color: string, bold?: boolean) => {
    if (bold) lines.push({ text, color, bold: true });
    else lines.push({ text, color });
  };
  const blank = () => {
    if (lines.length && lines[lines.length - 1].text !== '') push('', COLOR.dim);
  };

  // --- header -------------------------------------------------------------
  const title = item.upgrade > 0 ? `${item.name} +${item.upgrade}` : item.name;
  push(title, rc, true);
  if (item.name !== base.name) push(base.name, COLOR.dim);
  push(typeLine(base), COLOR.dim);
  if (item.corrupted) push('Corrupted', COLOR.bad);

  // --- base values --------------------------------------------------------
  blank();
  const damage = itemDamageRange(item);
  const cmpDamage = compareTo ? itemDamageRange(compareTo) : null;
  if (damage) {
    const improved = item.upgrade > 0 || (damage.max > (base.baseMaxDamage ?? 0));
    push(`Damage: ${damage.min}-${damage.max}`, improved ? COLOR.good : COLOR.body);
    if (cmpDamage) {
      const d = (damage.min + damage.max) / 2 - (cmpDamage.min + cmpDamage.max) / 2;
      if (Math.abs(d) >= 0.5) push(`  ${d > 0 ? '+' : ''}${d.toFixed(0)} average damage`, d > 0 ? COLOR.good : COLOR.bad);
    }
  }
  if (base.baseSpeed) push(`Attacks per Second: ${base.baseSpeed.toFixed(2)}`, COLOR.body);
  const def = itemDefense(item);
  if (def > 0) {
    const improved = item.upgrade > 0 || def > (base.baseDefense ?? 0);
    push(`Defense: ${def}`, improved ? COLOR.good : COLOR.body);
    if (compareTo) {
      const d = def - itemDefense(compareTo);
      if (d !== 0) push(`  ${d > 0 ? '+' : ''}${d} defense`, d > 0 ? COLOR.good : COLOR.bad);
    }
  }
  if (base.baseBlock) push(`Chance to Block: ${Math.round(base.baseBlock * 100)}%`, COLOR.body);

  // --- requirements -------------------------------------------------------
  const reqs: Line[] = [];
  if (base.levelReq > 1) {
    const unmet = ctx?.level !== undefined && ctx.level < requiredLevel(item);
    reqs.push({ text: `Required Level: ${requiredLevel(item)}`, color: unmet ? COLOR.bad : COLOR.dim });
  }
  if (base.strReq) {
    const unmet = ctx?.strength !== undefined && ctx.strength < base.strReq;
    reqs.push({ text: `Required Strength: ${base.strReq}`, color: unmet ? COLOR.bad : COLOR.dim });
  }
  if (base.dexReq) {
    const unmet = ctx?.dexterity !== undefined && ctx.dexterity < base.dexReq;
    reqs.push({ text: `Required Dexterity: ${base.dexReq}`, color: unmet ? COLOR.bad : COLOR.dim });
  }
  if (base.classes && base.classes.length > 0) {
    const unmet = ctx?.classId !== undefined && !base.classes.includes(ctx.classId);
    reqs.push({ text: `Class: ${base.classes.join(', ')}`, color: unmet ? COLOR.bad : COLOR.dim });
  }
  if (reqs.length) {
    blank();
    for (const r of reqs) lines.push(r);
  }

  // --- implicits ----------------------------------------------------------
  const implicits = item.mods.filter((m) => m.kind === 'implicit');
  if (implicits.length) {
    blank();
    for (const mod of implicits) push(modLine(mod), COLOR.implicit);
  }

  // --- rolled mods --------------------------------------------------------
  const rolled = item.mods
    .filter((m) => m.kind !== 'implicit')
    .slice()
    .sort((x, y) => statOrder(x.stat) - statOrder(y.stat));
  if (rolled.length) {
    blank();
    for (const mod of rolled) {
      const negative = mod.value < 0;
      push(modLine(mod), negative ? COLOR.bad : item.rarity === 'set' ? COLOR.set : COLOR.mod);
    }
  }

  // --- sockets ------------------------------------------------------------
  if (item.sockets.length) {
    blank();
    const filled = item.sockets.filter((s) => s.gemId).length;
    push(`Sockets: ${filled} / ${item.sockets.length}`, COLOR.socket);
    for (const socket of item.sockets) {
      if (!socket.gemId) {
        push('  (empty)', COLOR.dim);
        continue;
      }
      const gem = getSocketable(socket.gemId);
      if (!gem) {
        push('  (unknown)', COLOR.dim);
        continue;
      }
      const bonuses = socketBonuses(socket.gemId, base.category)
        .map((b) => `${b.value >= 0 ? '+' : ''}${b.value} ${STAT_LABEL[b.stat] ?? b.stat}`)
        .join(', ');
      push(`  ${gem.name}: ${bonuses}`, gem.isRune ? COLOR.rune : COLOR.socket);
    }
    const word = itemRuneword(item);
    if (word) {
      push(`Runeword: ${word.name}`, COLOR.gold, true);
      for (const bonus of word.mods) {
        push(
          `  ${bonus.value >= 0 ? '+' : ''}${bonus.value} ${STAT_LABEL[bonus.stat] ?? bonus.stat}`,
          bonus.value >= 0 ? COLOR.mod : COLOR.bad,
        );
      }
      push(`  "${word.flavor}"`, COLOR.flavor);
    }
  }

  // --- set block ----------------------------------------------------------
  if (item.setId) {
    const set = getSet(item.setId);
    if (set) {
      blank();
      push(set.name, COLOR.set, true);
      for (const piece of set.pieces) {
        const mine = piece.id === item.uniqueId;
        push(`  ${piece.name}`, mine ? COLOR.set : COLOR.dim);
      }
      for (const bonus of set.bonuses) {
        push(`  (${bonus.pieces} pieces) ${bonus.desc}`, COLOR.set);
      }
    }
  }

  // --- unique hook and flavour -------------------------------------------
  if (item.uniqueId) {
    const def = getUnique(item.uniqueId);
    if (def) {
      if (def.hook) {
        blank();
        push(def.hook, COLOR.gold);
      }
      blank();
      push(`"${def.flavor}"`, COLOR.flavor);
    }
  }

  // --- comparison block ---------------------------------------------------
  if (compareTo && compareTo.uid !== item.uid) {
    blank();
    push(`Compared to ${compareTo.name}`, COLOR.dim, true);
    const mine = itemStats(item);
    const theirs = itemStats(compareTo);
    const keys = new Set<StatKey>([...(Object.keys(mine) as StatKey[]), ...(Object.keys(theirs) as StatKey[])]);
    const deltas = Array.from(keys)
      .map((k) => ({ stat: k, delta: (mine[k] ?? 0) - (theirs[k] ?? 0) }))
      .filter((d) => d.delta !== 0)
      .sort((x, y) => statOrder(x.stat) - statOrder(y.stat));
    if (deltas.length === 0) push('  No difference', COLOR.dim);
    for (const d of deltas) {
      push(
        `  ${d.delta > 0 ? '+' : ''}${d.delta} ${STAT_LABEL[d.stat] ?? d.stat}`,
        d.delta > 0 ? COLOR.good : COLOR.bad,
      );
    }
  }

  // --- footer -------------------------------------------------------------
  blank();
  push(`Item Level ${item.ilvl}   Value ${vendorPrice(item, false)}g`, COLOR.dim);

  return lines;
}

/** Level required to equip, including any bump a unique or set piece adds. */
export function requiredLevel(item: Item): number {
  const base = getBase(item.baseId);
  let req = base.levelReq;
  if (item.uniqueId) {
    const uq = getUnique(item.uniqueId);
    if (uq) req = Math.max(req, uq.levelReq);
    const piece = getSetPiece(item.uniqueId);
    if (piece) req = Math.max(req, piece.levelReq);
  }
  return req;
}

/** True when the item may be equipped by a character with these attributes. */
export function canEquip(
  item: Item,
  ctx: { level: number; strength: number; dexterity: number; classId?: CharClassId },
): { ok: boolean; reason?: string } {
  const base = getBase(item.baseId);
  if (!isEquippable(base)) return { ok: false, reason: 'This item cannot be equipped.' };
  if (ctx.level < requiredLevel(item)) return { ok: false, reason: `Requires level ${requiredLevel(item)}.` };
  if (base.strReq && ctx.strength < base.strReq) return { ok: false, reason: `Requires ${base.strReq} strength.` };
  if (base.dexReq && ctx.dexterity < base.dexReq) return { ok: false, reason: `Requires ${base.dexReq} dexterity.` };
  if (base.classes && ctx.classId && !base.classes.includes(ctx.classId)) {
    return { ok: false, reason: 'Your class cannot use this.' };
  }
  return { ok: true };
}

/** Convenience for the UI: is this a stackable consumable/material/gem? */
export function isStackable(item: Item): boolean {
  return isStackableCategory(getBase(item.baseId).category);
}

/** Human label for a material id — re-exported so UI needs one import. */
export { materialName };

/** Rarity sort key, for inventory auto-sort and vendor lists. */
export function rarityRank(rarity: ItemRarity): number {
  return RARITY_RANK[rarity] ?? 0;
}

export { SETS, UNIQUES };

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
  AccountSave,
  CharClassId,
  EquipSlot,
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
import { Random, hashString } from '../core/RNG';
import {
  ITEM_BASES as ALL_BASES,
  baseDropWeight,
  baseValue,
  classAffinity,
  findBase,
  isEquippable,
  isStackableCategory,
  maxSockets,
  JEWELRY_CATEGORIES,
} from '../data/itemBases';
import { AFFIXES as ALL_AFFIXES, affixNameWord, getAffix } from '../data/affixes';
import { EXTRA_LINES } from '../data/extraLines';
import { UNIQUES, uniqueDropWeight, uniquePool, getUnique } from '../data/uniques';
import type { UniqueDef } from '../data/uniques';
import { SIGNATURES } from '../data/uniqueBatches/index';
import { statCurve } from '../data/uniqueBatches/kit';
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
  runewordBonuses,
  socketBonuses,
  socketableDropPool,
  socketableWeight,
} from '../data/gems';
import type { GemBonus } from '../data/gems';
import { rollPowerAffix, powerWord, powerLines, powerValue } from './ItemPowers';
import { legacyPriceMultiplier } from './Legacy';
import { MATERIALS, materialDropPool, materialName } from '../data/materials';
import { getTrinket } from '../data/trinkets';
import { NO_FIND, payoutGold, type Find } from './Payout';
import { activeDifficulty } from '../data/difficulties';
import { tr, trc, trk, numText, translating } from '../core/I18n';

// ---------------------------------------------------------------------------
// Contract exports
// ---------------------------------------------------------------------------

export const ITEM_BASES = ALL_BASES;
export const AFFIXES = ALL_AFFIXES;

/** Fallback so a corrupt save or a bad id can never hard-crash a scene. */
const UNKNOWN_BASE: ItemBase = {
  id: 'unknown',
  name: tr('Unknown Object'),
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

/**
 * Item quality, close to how Diablo II does it but with our own numbers.
 *
 * The base is picked first. Then each tier is tried in turn, best first, and
 * the first one that hits wins; if none hit, the item is plain. A tier's odds
 * are one in `n`, where
 *
 *   n = base - (item level - base level) / div     the deeper the find, the better
 *   n = n * 100 / (100 + effective magic find)     capped per tier, see below
 *   n = max(n, floor)                              magic find alone cannot pass this
 *   n = n * (1 - source factor / 1024)             tougher monsters roll far better
 *
 * So a plain monster mostly drops plain and blue things, a champion never
 * drops anything plain, and a boss is where the uniques live.
 */
const QUALITY: Array<{ rarity: ItemRarity; base: number; div: number; floor: number; mfCap: number; minIlvl: number }> = [
  // The first mythic is item level 74 and the first ancient 90, and a pool
  // reaches 4 levels up (`uniquePool`): below these a hit had nothing to give.
  { rarity: 'ancient', base: 12000, div: 1, floor: 1500, mfCap: 140, minIlvl: 86 },
  { rarity: 'mythic', base: 2400, div: 1, floor: 300, mfCap: 190, minIlvl: 70 },
  // Sets and uniques are half as common as they were: a full map at tier 20
  // threw ten set pieces and four uniques before its boss.
  { rarity: 'unique', base: 720, div: 1, floor: 96, mfCap: 250, minIlvl: 1 },
  { rarity: 'set', base: 360, div: 2, floor: 80, mfCap: 500, minIlvl: 1 },
  { rarity: 'rare', base: 84, div: 2, floor: 20, mfCap: 600, minIlvl: 1 },
  { rarity: 'magic', base: 24, div: 3, floor: 1.5, mfCap: Infinity, minIlvl: 1 },
];

/** Where a roll comes from. Monster ranks, plus the few places that are not monsters. */
export type DropSource = MonsterRank | 'vendor';

/**
 * How much each source lifts quality, out of 1024: [unique tiers, set, rare, magic].
 * Anything ranked always drops at least magic.
 */
const SOURCE_FACTOR: Record<DropSource, readonly [number, number, number, number]> = {
  normal: [0, 0, 0, 0],
  // Champions come by the hundred on a deep map, so they lift sets and
  // uniques far less than they lift rares.
  champion: [400, 400, 720, 1024],
  elite: [520, 520, 800, 1024],
  rare: [640, 640, 860, 1024],
  boss: [978, 978, 978, 1024],
  vendor: [0, 0, 700, 900],
};

function sourceFactor(source: DropSource, rarity: ItemRarity): number {
  const f = SOURCE_FACTOR[source] ?? SOURCE_FACTOR.normal;
  return rarity === 'magic' ? f[3] : rarity === 'rare' ? f[2] : rarity === 'set' ? f[1] : f[0];
}

/** The lowest magic find a roll honours. Only an easy tier goes below zero. */
const MIN_MAGIC_FIND = -60;

/** Chance this one tier hits, given that every better tier missed. */
function tierChance(tier: (typeof QUALITY)[number], ilvl: number, qlvl: number, magicFind: number, source: DropSource): number {
  if (ilvl < tier.minIlvl) return 0;
  let n = tier.base - Math.max(0, ilvl - qlvl) / tier.div;
  // Below zero is the easy tiers' penalty (DungeonScene.findRates): -40 makes
  // every tier 1.67 times rarer. It is never allowed near -100.
  const mf = Math.max(MIN_MAGIC_FIND, magicFind);
  const effective = mf <= 0 || tier.mfCap === Infinity ? mf : (mf * tier.mfCap) / (mf + tier.mfCap);
  n = (n * 100) / (100 + effective);
  n /= earlyRamp(tier.rarity, ilvl);
  n = Math.max(n, tier.floor);
  n *= 1 - sourceFactor(source, tier.rarity) / 1024;
  return n <= 1 ? 1 : 1 / n;
}

function rollRarity(ilvl: number, qlvl: number, magicFind: number, source: DropSource, rng: Rng): ItemRarity {
  for (const tier of QUALITY) {
    if (rng.next() < tierChance(tier, ilvl, qlvl, magicFind, source)) return tier.rarity;
  }
  return 'normal';
}

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

/**
 * How well the drop being rolled rolls: the tier's loot quality
 * (`DifficultyDef.lootQuality`). `rollItem` and `rollCharm` set it for the
 * length of one roll; everything else (the blacksmith's reforge, a shop's
 * stock) rolls at 1, as written.
 */
let quality = 1;

/** Runs one drop roll at the active tier's loot quality. A shop's roll stays at 1. */
function atQuality<T>(source: DropSource | undefined, roll: () => T): T {
  const was = quality;
  quality = source === 'vendor' ? 1 : activeDifficulty().lootQuality;
  try {
    return roll();
  } finally {
    quality = was;
  }
}

/**
 * A whole number in [min, max]. At quality 1 an even roll; above it the roll
 * leans to `max` (quality 2 lands on average two thirds of the way up), below
 * it to `min`. Every line's better end is its `max`: downsides are written
 * as negative ranges.
 */
function rollValue(min: number, max: number, rng: Rng): number {
  if (min === max) return min;
  if (quality === 1) return rng.int(min, max);
  return Math.min(max, min + Math.floor(Math.pow(rng.next(), 1 / quality) * (max - min + 1)));
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
  if (affix.bases && !affix.bases.includes(base.id)) return false;
  // A charm rolls its own size's ladders and nothing that can land anywhere.
  if (base.category === 'charm' && !affix.bases) return false;
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
  // Loot quality makes each better rung that many times as likely.
  const tier = rng.weighted(tiers, (t) => t.weight * quality ** tiers.indexOf(t));
  usedGroups.add(affix.group);
  const value = rollValue(tier.min, tier.max, rng);
  return { affixId: affix.id, stat: affix.stat, value, tier: tier.tier, kind };
}

/**
 * Up to `count` candidate lines of one kind, for the Enchanter to lay out side
 * by side. `replace` is the index of the line they would take the place of
 * (its group is free to come back at a new value), or null for a new line in
 * an open slot. No two offers share a group, and none clashes with another
 * line on the item.
 */
export function rollLineOffers(item: Item, kind: 'prefix' | 'suffix', replace: number | null, count: number, rng: Rng): ItemMod[] {
  const base = getBase(item.baseId);
  const used = new Set<string>();
  item.mods.forEach((m, i) => {
    if (i === replace) return;
    const g = ALL_AFFIXES.find((a) => a.id === m.affixId)?.group;
    if (g) used.add(g);
  });
  const out: ItemMod[] = [];
  for (let i = 0; i < count; i++) {
    const mod = rollOneAffix(base, item.ilvl, item.rarity, kind, used, rng);
    if (!mod) break;
    out.push(mod);
  }
  return out;
}

/**
 * Fresh prefixes and suffixes around the lines in `keep`, for the blacksmith's
 * reroll with bound lines. The line count is rolled as a drop rolls it; kept
 * lines fill their side first and never leave, even past the rolled count.
 */
export function rollAffixesKeeping(item: Item, keep: ItemMod[], rng: Rng): ItemMod[] {
  const base = getBase(item.baseId);
  const budget = affixBudget(base, item.rarity, rng);
  const used = new Set<string>();
  for (const m of keep) {
    const g = ALL_AFFIXES.find((a) => a.id === m.affixId)?.group;
    if (g) used.add(g);
  }
  const out = keep.map((m) => ({ ...m }));
  const side = (kind: 'prefix' | 'suffix', want: number) => {
    const have = keep.filter((m) => m.kind === kind).length;
    for (let i = have; i < want; i++) {
      const mod = rollOneAffix(base, item.ilvl, item.rarity, kind, used, rng);
      if (mod) out.push(mod);
    }
  };
  side('prefix', budget.prefixes);
  side('suffix', budget.suffixes);
  const rank = (m: ItemMod) => (m.kind === 'prefix' ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

/**
 * How many more prefixes and suffixes this item could hold: what the richest
 * drop of its rarity and base could carry, less what it has. Only magic and
 * rare items have room; every other rarity is full by definition.
 */
export function openAffixSlots(item: Item): { prefix: number; suffix: number } {
  if (item.rarity !== 'magic' && item.rarity !== 'rare') return { prefix: 0, suffix: 0 };
  const base = getBase(item.baseId);
  let side = item.rarity === 'rare' ? RARE_SIDE : 1;
  let total = item.rarity === 'rare' ? RARE_LINES[RARE_LINES.length - 1]! : 2;
  if (base.category === 'charm' && item.rarity === 'rare') {
    total = CHARM_RARE_LINES[base.id] ?? 3;
    side = total;
  }
  const p = item.mods.filter((m) => m.kind === 'prefix').length;
  const s = item.mods.filter((m) => m.kind === 'suffix').length;
  const free = Math.max(0, total - p - s);
  return { prefix: Math.max(0, Math.min(side - p, free)), suffix: Math.max(0, Math.min(side - s, free)) };
}

/** Lines on a rare charm, by size. */
const CHARM_RARE_LINES: Record<string, number> = {
  'charm.small': 2,
  'charm.medium': 3,
  'charm.large': 3,
  'charm.grand': 4,
};

/** How many lines a rare rolls, and how often each count comes up. */
const RARE_LINES = [4, 5, 6, 7, 8];
const RARE_LINE_WEIGHT: Record<number, number> = { 4: 22, 5: 30, 6: 25, 7: 15, 8: 8 };
/** Most prefixes, and most suffixes, one rare can hold. */
const RARE_SIDE = 4;

/** How many prefixes and suffixes a rarity gets. */
function affixBudget(base: ItemBase, rarity: ItemRarity, rng: Rng): { prefixes: number; suffixes: number } {
  // A rare charm holds more lines the more room it takes.
  if (base.category === 'charm' && rarity === 'rare') {
    const total = CHARM_RARE_LINES[base.id] ?? 3;
    const prefixes = Math.ceil(total / 2) - (rng.chance(0.5) && total % 2 === 1 ? 1 : 0);
    return { prefixes, suffixes: total - prefixes };
  }
  switch (rarity) {
    case 'magic': {
      const two = rng.chance(0.62);
      if (!two) return rng.chance(0.5) ? { prefixes: 1, suffixes: 0 } : { prefixes: 0, suffixes: 1 };
      return { prefixes: 1, suffixes: 1 };
    }
    case 'rare': {
      const total = rng.weighted(RARE_LINES, (n) => RARE_LINE_WEIGHT[n] ?? 0);
      const prefixes = Math.min(RARE_SIDE, Math.max(1, Math.round(total / 2 + (rng.chance(0.5) ? 0.5 : -0.5))));
      return { prefixes, suffixes: Math.min(RARE_SIDE, total - prefixes) };
    }
    default: {
      // A normal weapon still has damage and a normal chestplate still has
      // armour, so an unaffixed one is a real, if boring, item. Jewellery has
      // no base stats at all — every point a ring, amulet or charm gives you
      // comes from its affixes, so a normal one was a completely blank object
      // that did nothing when equipped. Those always get one.
      if (!JEWELRY_CATEGORIES.includes(base.category)) return { prefixes: 0, suffixes: 0 };
      return rng.chance(0.5) ? { prefixes: 1, suffixes: 0 } : { prefixes: 0, suffixes: 1 };
    }
  }
}

/**
 * Fresh prefixes and suffixes for an existing item, by the same rules a drop
 * uses: its size of charm, its rarity's line budget, its base's allowed
 * ladders. The blacksmith's reforge calls this, so a small charm can never
 * come out of the forge with grand-charm lines.
 */
export function rollFreshAffixes(item: Item, rng: Rng): ItemMod[] {
  return rollAffixes(getBase(item.baseId), item.ilvl, item.rarity, rng);
}

function rollAffixes(base: ItemBase, ilvl: number, rarity: ItemRarity, rng: Rng): ItemMod[] {
  const budget = affixBudget(base, rarity, rng);
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
  // A charm's lines are few and lopsided (most are suffixes), so a line that
  // found nothing on its side takes one from the other rather than leaving
  // the charm a blank stone.
  if (base.category === 'charm') {
    const want = budget.prefixes + budget.suffixes;
    for (let tries = 0; mods.length < want && tries < 4; tries++) {
      const kind = tries % 2 === 0 ? 'suffix' : 'prefix';
      const mod = rollOneAffix(base, ilvl, rarity, kind, used, rng);
      if (mod) mods.push(mod);
    }
  }
  return mods;
}

function rollImplicits(base: ItemBase, rng: Rng): ItemMod[] {
  if (!base.implicits) return [];
  return base.implicits.map((imp, i) => ({
    affixId: `implicit.${base.id}.${i}`,
    stat: imp.stat,
    value: rollValue(imp.min, imp.max, rng),
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

// A rare's two words are saved in English and shown with tr() (rareShown).
const THEME_WORDS: Record<NameTheme, string[]> = {
  fire: [trk('Ember'), trk('Cinder'), trk('Pyre'), trk('Blaze'), trk('Scorch'), trk('Sunfall'), trk('Kiln'), trk('Wildfire'), trk('Char'), trk('Hearth')],
  cold: [trk('Frost'), trk('Rime'), trk('Glacier'), trk('Hoar'), trk('Winter'), trk('Blizzard'), trk('Icefall'), trk('Chill'), trk('Whiteout'), trk('Snowbind')],
  lightning: [trk('Storm'), trk('Thunder'), trk('Spark'), trk('Arc'), trk('Tempest'), trk('Skyfire'), trk('Galebreak'), trk('Bolt'), trk('Flashpoint'), trk('Static')],
  poison: [trk('Blight'), trk('Venom'), trk('Rot'), trk('Plague'), trk('Spore'), trk('Bile'), trk('Wither'), trk('Mire'), trk('Canker'), trk('Fenrot')],
  arcane: [trk('Void'), trk('Null'), trk('Ether'), trk('Rift'), trk('Dream'), trk('Umbra'), trk('Aether'), trk('Cipher'), trk('Hollow'), trk('Starless')],
  physical: [trk('Havoc'), trk('Gore'), trk('Brute'), trk('Carnage'), trk('Warbrand'), trk('Butcher'), trk('Grim'), trk('Ironhewn'), trk('Bloodrust'), trk('Skullsplit')],
  life: [trk('Bloodroot'), trk('Heartwood'), trk('Vital'), trk('Quickblood'), trk('Redoak'), trk('Marrow'), trk('Lifespring'), trk('Thrum'), trk('Pulse'), trk('Sanguine')],
  defense: [trk('Ironhold'), trk('Stonefast'), trk('Bulwark'), trk('Aegis'), trk('Anvil'), trk('Granite'), trk('Rampart'), trk('Deepstone'), trk('Shieldwall'), trk('Bastion')],
  speed: [trk('Swiftmark'), trk('Windcut'), trk('Fleet'), trk('Quicksilver'), trk('Blur'), trk('Featherfall'), trk('Racing'), trk('Slipstream'), trk('Hasten'), trk('Darting')],
  fortune: [trk('Goldvein'), trk('Magpie'), trk('Raven'), trk('Treasure'), trk('Kingsluck'), trk('Coinfall'), trk('Hoard'), trk('Fortune'), trk('Gilded'), trk('Windfall')],
  skill: [trk('Mystic'), trk('Sagebound'), trk('Prophet'), trk('Oracle'), trk('Runeward'), trk('Elder'), trk('Adept'), trk('Whispering'), trk('Arcanum'), trk('Farseer')],
};

const NOUN_GROUPS: Record<string, string[]> = {
  blade: [trk('Edge'), trk('Brand'), trk('Fang'), trk('Song'), trk('Sliver'), trk('Whisper'), trk('Bite'), trk('Tooth'), trk('Razor'), trk('Reaver')],
  heavy: [trk('Cleaver'), trk('Splitter'), trk('Crusher'), trk('Weight'), trk('Ruin'), trk('Breaker'), trk('Maw'), trk('Spike'), trk('Sunder'), trk('Hew')],
  ranged: [trk('Arc'), trk('Reach'), trk('Hunt'), trk('Sight'), trk('Wing'), trk('Strand'), trk('Cry'), trk('Flight'), trk('Talon'), trk('Loft')],
  caster: [trk('Call'), trk('Chant'), trk('Sigh'), trk('Rune'), trk('Wish'), trk('Grasp'), trk('Star'), trk('Echo'), trk('Spell'), trk('Verse')],
  helm: [trk('Crown'), trk('Visage'), trk('Gaze'), trk('Brow'), trk('Mask'), trk('Vigil'), trk('Halo'), trk('Skull'), trk('Cowl'), trk('Helm')],
  chest: [trk('Guard'), trk('Shell'), trk('Hide'), trk('Coat'), trk('Ward'), trk('Carapace'), trk('Bulwark'), trk('Weave'), trk('Mantle'), trk('Shroud')],
  gloves: [trk('Grasp'), trk('Grip'), trk('Touch'), trk('Clutch'), trk('Hand'), trk('Talon'), trk('Fist'), trk('Knuckle'), trk('Palm'), trk('Snare')],
  pants: [trk('Stance'), trk('Hold'), trk('Root'), trk('Ground'), trk('Haunch'), trk('Kneel'), trk('Brace'), trk('Footing'), trk('Greave'), trk('Legs')],
  boots: [trk('Stride'), trk('Tread'), trk('Trail'), trk('Step'), trk('Walk'), trk('Pace'), trk('Trek'), trk('March'), trk('Gait'), trk('Course')],
  belt: [trk('Cord'), trk('Girth'), trk('Clasp'), trk('Wrap'), trk('Bind'), trk('Loop'), trk('Cinch'), trk('Knot'), trk('Girdle'), trk('Sash')],
  shield: [trk('Wall'), trk('Ward'), trk('Bastion'), trk('Guard'), trk('Face'), trk('Rampart'), trk('Barrier'), trk('Aegis'), trk('Refuge'), trk('Stand')],
  jewel: [trk('Eye'), trk('Heart'), trk('Knot'), trk('Token'), trk('Seal'), trk('Tear'), trk('Vow'), trk('Oath'), trk('Star'), trk('Coil')],
  quiver: [trk('Sheaf'), trk('Bundle'), trk('Score'), trk('Volley'), trk('Cache'), trk('Flight')],
  misc: [trk('Relic'), trk('Shard'), trk('Fragment'), trk('Remnant'), trk('Sign'), trk('Mark')],
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
    case 'pants':
      return 'pants';
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

/**
 * A magic item's name: its first prefix's word, the base, its first suffix's
 * word; with no suffix, its power's word ("Hand Axe of Cleaving").
 */
function magicName(base: ItemBase, mods: readonly ItemMod[], powers?: Item['powers']): string {
  const prefix = mods.find((m) => m.kind === 'prefix');
  const suffix = mods.find((m) => m.kind === 'suffix');
  const preWord = prefix ? affixNameWord(prefix.affixId) : undefined;
  const sufWord = suffix ? affixNameWord(suffix.affixId) : powers?.[0] ? powerWord(powers[0].id) : undefined;
  if (preWord && sufWord) return trc('magic item name: prefix, base, suffix', '{0} {1} {2}', preWord, base.name, sufWord);
  if (preWord) return trc('magic item name: prefix, base', '{0} {1}', preWord, base.name);
  if (sufWord) return trc('magic item name: base, suffix', '{0} {1}', base.name, sufWord);
  return base.name;
}

const RARE_FIRST = new Set(Object.values(THEME_WORDS).flat());
const RARE_SECOND = new Set(Object.values(NOUN_GROUPS).flat());

/** A rare's name, saved in English ("Ember Edge", "Emberbrand"), in the current language. */
function rareShown(name: string): string {
  const space = name.indexOf(' ');
  if (space > 0) {
    const first = name.slice(0, space);
    const second = name.slice(space + 1);
    if (RARE_FIRST.has(first) && RARE_SECOND.has(second)) return trc('rare item name: theme word, then noun', '{0} {1}', tr(first), tr(second));
    return name;
  }
  for (const first of RARE_FIRST) {
    if (!name.startsWith(first)) continue;
    const rest = name.slice(first.length);
    const second = rest.charAt(0).toUpperCase() + rest.slice(1);
    if (RARE_SECOND.has(second)) return `${tr(first)}${tr(second).toLowerCase()}`;
  }
  return name;
}

/**
 * Gives a magic or rare item its chance at a power affix: a behaviour rather
 * than a number. A magic item with no suffix of its own takes the power's name
 * word, so "Hand Axe of Cleaving" says what it does.
 */
function maybeAddPower(item: Item, base: ItemBase, rarity: ItemRarity, ilvl: number, rng: Rng): void {
  if (rarity !== 'magic' && rarity !== 'rare') return;
  const roll = rollPowerAffix(base.category, rarity, ilvl, rng);
  if (!roll) return;
  item.powers = [roll];
  if (rarity === 'magic') item.name = magicName(base, item.mods, item.powers);
}

/**
 * The name to show. The saved name is in the language the item was found in,
 * so the name is put back together from what the item is: a unique's or set
 * piece's own name, a magic item's base and words, a plain item's base. A
 * rare keeps the two words it rolled, saved in English.
 */
export function itemDisplayName(item: Item): string {
  if (item.uniqueId) {
    const own = item.setId ? getSetPiece(item.uniqueId) : getUnique(item.uniqueId);
    return own?.name ?? item.name;
  }
  const base = findBase(item.baseId);
  if (!base) return item.name;
  if (item.rarity === 'rare') return translating() ? rareShown(item.name) : item.name;
  if (item.rarity === 'magic') return magicName(base, item.mods, item.powers);
  return base.name;
}

/** Single unmistakable colour for every rune, whatever its tier. */
export const RUNE_LABEL_COLOR = 0xff8a1f;

/**
 * The colour an item's name is written in.
 *
 * Rarity for gear, because that is the decision you make about gear. Gems get
 * their own stone colour — a ruby should read red on the floor, not the same
 * grey as every other unsocketed drop — and every rune gets one shared orange
 * so a rune is never mistaken for anything else in a pile of loot.
 */
export function itemLabelColor(item: Item): number {
  const base = findBase(item.baseId);
  if (base?.category === 'rune') return RUNE_LABEL_COLOR;
  if (base?.category === 'gem') {
    const gem = getSocketable(item.baseId);
    if (gem) return gem.color;
  }
  return RARITY_COLOR[item.rarity] ?? 0xc8c8c8;
}

/** Short tag naming what an item *is*, for the floor label. */
export function itemTypeTag(item: Item): string {
  const base = findBase(item.baseId);
  return base ? (CATEGORY_LABEL[base.category] ?? base.category) : '';
}


// ---------------------------------------------------------------------------
// Item construction
// ---------------------------------------------------------------------------

export function newItem(base: ItemBase, ilvl: number, rarity: ItemRarity, rng: Rng): Item {
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

/** One fixed line, rolled inside its own range. */
function fixedLine(affixId: string, stat: StatKey, min: number, max: number, rng: Rng, kind: ItemMod['kind'] = 'prefix'): ItemMod {
  return { affixId, stat, value: rollValue(min, max, rng), tier: 0, kind };
}

/**
 * A unique. It stays at its own item level wherever it drops, and carries the
 * same lines every time: the ones written with it, then its fixed extra lines
 * (`data/extraLines.ts`). Only the values roll, inside each line's range.
 */
function buildUniqueItem(def: UniqueDef, rng: Rng): Item {
  const base = getBase(def.baseId);
  const item = newItem(base, def.ilvl, def.rarity, rng);
  item.name = def.name;
  item.uniqueId = def.id;
  item.mods = rollImplicits(base, rng);
  def.mods.forEach((mod, i) => item.mods.push(fixedLine(`unique.${def.id}.${i}`, mod.stat, mod.min, mod.max, rng, mod.kind ?? 'prefix')));
  (EXTRA_LINES[def.id] ?? []).forEach(([stat, min, max], i) => item.mods.push(fixedLine(`unique.${def.id}.x${i}`, stat, min, max, rng)));
  if (def.sockets) item.sockets = new Array(def.sockets).fill(null).map(() => ({ gemId: null as string | null }));
  item.value = vendorPrice(item, false) * 4;
  return item;
}

/**
 * What a rare usually rolls for `stat` at item level `L`: the middle of each
 * ladder for it, weighted the way `rollOneAffix` picks them. Set pieces are
 * measured against this, so they keep pace with rares however the affix
 * tables grow.
 */
const RARE_ROLL = new Map<string, number>();
export function rareRoll(stat: StatKey, L: number): number {
  const key = `${stat}:${L}`;
  let v = RARE_ROLL.get(key);
  if (v !== undefined) return v;
  let pick = 0;
  let sum = 0;
  for (const a of ALL_AFFIXES) {
    if (a.stat !== stat || a.bases) continue;
    if (a.minRarity && RARITY_RANK[a.minRarity] > RARITY_RANK.rare) continue;
    const pw = affixPoolWeight(a, L);
    if (pw <= 0) continue;
    let w = 0;
    let mid = 0;
    for (const t of eligibleTiers(a, L)) {
      w += t.weight;
      mid += (t.weight * (Math.abs(t.min) + Math.abs(t.max))) / 2;
    }
    pick += pw;
    sum += (pw * mid) / w;
  }
  // Some ladders (defense, added damage) roll far under a unique's line, so
  // the usual line is never less than half of one.
  v = Math.max(pick > 0 ? sum / pick : 0, statCurve(stat, L) * 0.5);
  RARE_ROLL.set(key, v);
  return v;
}

/** A set piece, before its bonuses, is worth this many usual rare lines. */
export const SET_PIECE_LINES = 7;

/**
 * How much an item's good written lines are lifted so they are worth `target`
 * usual rare lines at their own item level. Never below 1: a strong item keeps
 * its numbers.
 */
const LINE_FILL = new Map<string, number>();
function lineFill(id: string, mods: ReadonlyArray<{ stat: StatKey; min: number; max: number }>, ilvl: number, target: number): number {
  let f = LINE_FILL.get(id);
  if (f !== undefined) return f;
  let fixed = 0;
  let grow = 0;
  for (const m of mods) {
    const mid = (m.min + m.max) / 2;
    if (mid <= 0) continue;
    const lines = mid / rareRoll(m.stat, ilvl);
    if (m.stat === 'skillLevels') fixed += lines;
    else grow += lines;
  }
  f = grow > 0 ? Math.max(1, (target - fixed) / grow) : 1;
  LINE_FILL.set(id, f);
  return f;
}

/**
 * A set piece. It stays at the set's own item level wherever it drops. A
 * piece with few or small written lines has them lifted until it is worth
 * `SET_PIECE_LINES` usual rare lines at that level (skill levels and costs
 * stay as written), then it carries its fixed extra lines
 * (`data/extraLines.ts`). The same lines every drop; only values roll.
 */
export function buildSetPiece(piece: SetPieceDef, rng: Rng): Item {
  const base = getBase(piece.baseId);
  const item = newItem(base, piece.ilvl, 'set', rng);
  item.name = piece.name;
  item.setId = piece.setId;
  item.uniqueId = piece.id;
  item.mods = rollImplicits(base, rng);
  const fill = lineFill(`set:${piece.id}`, piece.mods, piece.ilvl, SET_PIECE_LINES);
  piece.mods.forEach((mod: { stat: StatKey; min: number; max: number }, i: number) => {
    let value = rollValue(mod.min, mod.max, rng);
    if (mod.stat !== 'skillLevels' && value > 0) value = Math.max(1, Math.round(value * fill));
    item.mods.push({ affixId: `set.${piece.id}.${i}`, stat: mod.stat, value, tier: 0, kind: 'prefix' });
  });
  (EXTRA_LINES[piece.id] ?? []).forEach(([stat, min, max], i) => item.mods.push(fixedLine(`set.${piece.id}.x${i}`, stat, min, max, rng)));
  if (piece.sockets) item.sockets = new Array(piece.sockets).fill(null).map(() => ({ gemId: null as string | null }));
  item.value = vendorPrice(item, false) * 4;
  return item;
}

/** One line an item of a name should carry: its id, stat, kind and range. */
interface FixedSpec {
  affixId: string;
  stat: StatKey;
  kind: ItemMod['kind'];
  lo: number;
  hi: number;
}

/** Every written and extra line a unique or set piece carries today, with the range each rolls in. */
function fixedSpecs(item: Item): { specs: FixedSpec[]; ilvl: number; rarity: ItemRarity; sockets: number } | null {
  if (!item.uniqueId) return null;
  if (item.setId) {
    const piece = getSetPiece(item.uniqueId);
    if (!piece) return null;
    const fill = lineFill(`set:${piece.id}`, piece.mods, piece.ilvl, SET_PIECE_LINES);
    const lift = (stat: StatKey, v: number): number => (stat !== 'skillLevels' && v > 0 ? Math.max(1, Math.round(v * fill)) : v);
    const specs: FixedSpec[] = piece.mods.map((m: { stat: StatKey; min: number; max: number }, i: number) => ({
      affixId: `set.${piece.id}.${i}`,
      stat: m.stat,
      kind: 'prefix' as const,
      lo: lift(m.stat, m.min),
      hi: lift(m.stat, m.max),
    }));
    (EXTRA_LINES[piece.id] ?? []).forEach(([stat, lo, hi], i) => specs.push({ affixId: `set.${piece.id}.x${i}`, stat, kind: 'prefix', lo, hi }));
    return { specs, ilvl: piece.ilvl, rarity: 'set', sockets: piece.sockets ?? 0 };
  }
  const def = getUnique(item.uniqueId);
  if (!def) return null;
  const specs: FixedSpec[] = def.mods.map((m, i) => ({ affixId: `unique.${def.id}.${i}`, stat: m.stat, kind: m.kind ?? 'prefix', lo: m.min, hi: m.max }));
  (EXTRA_LINES[def.id] ?? []).forEach(([stat, lo, hi], i) => specs.push({ affixId: `unique.${def.id}.x${i}`, stat, kind: 'prefix', lo, hi }));
  return { specs, ilvl: def.ilvl, rarity: def.rarity, sockets: def.sockets ?? 0 };
}

/**
 * Brings a unique or set piece found in an older build up to its name's
 * lines today: its written lines and fixed extra lines (`data/extraLines.ts`),
 * nothing else, at its own item level. A line it already had keeps its roll,
 * held inside the line's range (an anvil bonus may sit up to 12% over); a line
 * it lacked rolls fresh, seeded by the item so a reload rolls the same; random
 * lines from before the fixed lists go. Base lines, sockets and their gems,
 * upgrades and powers stay. Returns true when anything changed.
 */
export function refreshFixedLines(item: Item): boolean {
  const want = fixedSpecs(item);
  if (!want) return false;
  const rng = new Random(hashString(`refresh:${item.uid}`));
  const had = new Map<string, ItemMod>();
  for (const m of item.mods) if (m.kind !== 'implicit') had.set(m.affixId, m);
  const mods: ItemMod[] = item.mods.filter((m) => m.kind === 'implicit');
  for (const sp of want.specs) {
    const old = had.get(sp.affixId);
    let value: number;
    if (old && old.stat === sp.stat) {
      const top = item.upgrade > 0 && sp.hi > 0 ? Math.round(sp.hi * 1.12) : sp.hi;
      value = Math.min(top, Math.max(sp.lo, old.value));
    } else {
      value = sp.lo === sp.hi ? sp.lo : rng.int(sp.lo, sp.hi);
    }
    mods.push({ affixId: sp.affixId, stat: sp.stat, value, tier: 0, kind: sp.kind });
  }
  const same =
    mods.length === item.mods.length &&
    mods.every((m, i) => {
      const o = item.mods[i]!;
      return o.affixId === m.affixId && o.stat === m.stat && o.value === m.value && o.kind === m.kind;
    });
  const changed = !same || item.ilvl !== want.ilvl || item.rarity !== want.rarity || item.sockets.length < want.sockets;
  if (!changed) return false;
  item.mods = mods;
  item.ilvl = want.ilvl;
  item.rarity = want.rarity;
  while (item.sockets.length < want.sockets) item.sockets.push({ gemId: null });
  item.value = vendorPrice(item, false) * 4;
  return true;
}

/**
 * One attack or cast speed line from before the Wave 5 retune, on today's
 * scale. It is the curve the item data was retuned by (40v / (v + 40), so 6
 * stays about 5, 20 becomes 13, 40 becomes 20), halved on a charm, whose
 * speed lines are half size now (`CHARM_SPEED_SHARE`). The curve only rises,
 * so a roll keeps its place in its range: the top of the old range lands at
 * the top of the new one. Costs (negative lines) map the same way.
 */
export function speedOnNewScale(v: number, charm: boolean): number {
  const a = Math.abs(v);
  if (a === 0) return 0;
  const g = (40 * a) / (a + 40);
  return Math.sign(v) * (charm ? Math.max(1, Math.round(g / 2)) : Math.round(g));
}

/**
 * Moves an item found before the speed retune (saves before version 3) onto
 * today's speed scale: every attack and cast speed line it carries (base,
 * rolled, written, and the Enchanter's waiting offers) goes through
 * `speedOnNewScale`, and a rolled line is then held inside its tier's range
 * today (an anvil bonus may sit up to 12% over, as `refreshFixedLines` allows).
 * Unique and set lines are held in their ranges by `refreshFixedLines`, which
 * runs after. Returns true when anything changed.
 */
export function rescaleOldSpeed(item: Item): boolean {
  const charm = item.baseId.startsWith('charm.');
  let changed = false;
  const fix = (m: ItemMod): void => {
    if (m.stat !== 'attackSpeed' && m.stat !== 'castSpeed') return;
    let v = speedOnNewScale(m.value, charm);
    const tier = m.kind === 'implicit' ? undefined : getAffix(m.affixId)?.tiers.find((t) => t.tier === m.tier);
    if (tier) {
      const top = item.upgrade > 0 && tier.max > 0 ? Math.round(tier.max * 1.12) : tier.max;
      v = Math.min(top, Math.max(tier.min, v));
    }
    if (v !== m.value) {
      m.value = v;
      changed = true;
    }
  };
  item.mods.forEach(fix);
  item.offers?.mods.forEach(fix);
  return changed;
}

/** Builds a plain instance of a base — used for starting gear and vendors. */
export function createItem(baseId: string, ilvl: number, rng: Rng, rarity: ItemRarity = 'normal'): Item {
  const base = getBase(baseId);
  const item = newItem(base, ilvl, rarity, rng);
  item.mods = rollImplicits(base, rng);
  // Normal rarity is included: `affixBudget` gives it nothing except on
  // jewellery, which has no base stats to fall back on.
  if (rarity === 'normal' || rarity === 'magic' || rarity === 'rare') {
    const affixes = rollAffixes(base, ilvl, rarity, rng);
    item.mods.push(...affixes);
    if (rarity === 'magic') item.name = magicName(base, affixes);
    else if (rarity === 'rare') item.name = rareName(base, affixes, rng);
  }
  maybeAddPower(item, base, rarity, ilvl, rng);
  item.sockets = rollSockets(base, ilvl, rarity, rng);
  item.value = vendorPrice(item, false) * 4;
  return item;
}

// ---------------------------------------------------------------------------
// rollItem
// ---------------------------------------------------------------------------

/**
 * Uniques and sets come in slowly: a quarter of the full rate at the first
 * portal, the full rate from item level 30. Three uniques in the first hour
 * made every later one feel cheap.
 */
function earlyRamp(rarity: ItemRarity, ilvl: number): number {
  if (rarity !== 'unique' && rarity !== 'set') return 1;
  return Math.min(1, 0.25 + 0.75 * Math.max(0, ilvl - 1) / 29);
}

/**
 * The chance one ordinary roll comes out at each rarity, averaged over the
 * bases that can drop at this level. Worked out, not sampled; the drop
 * checker reads it.
 */
export function rarityOdds(ilvl: number, magicFind: number, source: DropSource): Record<ItemRarity, number> {
  const lvl = Math.max(1, Math.round(ilvl));
  const out = { normal: 0, magic: 0, rare: 0, set: 0, unique: 0, mythic: 0, ancient: 0 } as Record<ItemRarity, number>;
  const bases = ALL_BASES.filter((b) => isEquippable(b) && b.category !== 'charm' && baseDropWeight(b, lvl) > 0);
  const total = bases.reduce((s, b) => s + baseDropWeight(b, lvl), 0);
  for (const b of bases) {
    const share = baseDropWeight(b, lvl) / total;
    let left = 1;
    for (const tier of QUALITY) {
      const p = tierChance(tier, lvl, b.levelReq, magicFind, source);
      out[tier.rarity] += share * left * p;
      left *= 1 - p;
    }
    out.normal += share * left;
  }
  return out;
}

/**
 * Who the loot is for, set by the scene that drops it: the hero's class (for
 * the class-only uniques) and the chase items the account already holds.
 */
const NONE_OWNED: ReadonlySet<string> = new Set();
const lootHero: { classId?: CharClassId; owned: () => ReadonlySet<string> } = { owned: () => NONE_OWNED };

export function setLootHero(classId: CharClassId | undefined, owned: () => ReadonlySet<string> = () => NONE_OWNED): void {
  lootHero.classId = classId;
  lootHero.owned = owned;
}

/** The chase uniques held anywhere on an account: stash, every hero's bag and gear. */
export function chaseHeld(account: Pick<AccountSave, 'stash' | 'current' | 'roster'>): Set<string> {
  const out = new Set<string>();
  const see = (it: Item | null | undefined): void => {
    if (it?.uniqueId && getUnique(it.uniqueId)?.chase) out.add(it.uniqueId);
  };
  for (const it of account.stash ?? []) see(it);
  const heroes = [...(account.roster ?? [])];
  if (account.current && !heroes.includes(account.current)) heroes.push(account.current);
  for (const c of heroes) {
    for (const it of c.inventory ?? []) see(it);
    for (const it of Object.values(c.equipment ?? {})) see(it as Item | undefined);
  }
  return out;
}

/** Chance a boss drops one of its own uniques, on top of its ordinary loot. */
export const SIGNATURE_CHANCE = { boss: 0.3, warden: 0.12 };

/**
 * One of a boss's signature uniques, or nothing. Only the ones its depth has
 * reached can drop (a little early is allowed), and the class and chase rules
 * of the ordinary table still hold.
 */
export function rollSignature(bossId: string, ilvl: number, rng: Rng, chance: number, extra: readonly string[] = []): Item | null {
  if (!rng.chance(chance)) return null;
  const lvl = Math.max(1, Math.round(ilvl));
  const pool = [...(SIGNATURES[bossId] ?? []), ...extra]
    .map((id) => getUnique(id))
    .filter((d): d is UniqueDef => !!d)
    .filter((d) => d.ilvl <= lvl + 6)
    .filter((d) => (!d.classId || d.classId === lootHero.classId) && !(d.chase && lootHero.owned().has(d.id)));
  if (pool.length === 0) return null;
  const def = rng.weighted(pool, (d) => Math.max(1, uniqueDropWeight(d, lvl + 6)));
  return buildUniqueItem(def, rng);
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
 * The base comes first, then its quality (see `QUALITY`). `magicFind` is a
 * percentage with diminishing returns per tier: it lifts blues a lot, rares
 * well, and the unique tiers only a little. `source` is who dropped it.
 */
export function rollItem(ilvl: number, rng: Rng, opts: ItemRoll = {}): Item {
  return atQuality(opts.source, () => rollItemAt(ilvl, rng, opts));
}

export interface ItemRoll {
  magicFind?: number;
  forceRarity?: ItemRarity;
  category?: ItemCategory;
  classId?: CharClassId;
  /** Who dropped it. A shop (`'vendor'`) rolls at loot quality 1. */
  source?: DropSource;
}

function rollItemAt(ilvl: number, rng: Rng, opts: ItemRoll): Item {
  const hero = opts.classId ?? lootHero.classId;
  const lvl = Math.max(1, Math.round(ilvl));
  const magicFind = opts.magicFind ?? 0;
  const base = pickBase(lvl, rng, opts.category, opts.classId);
  let rarity = opts.forceRarity ?? rollRarity(lvl, base.levelReq, magicFind, opts.source ?? 'normal', rng);

  // Unique / set tiers resolve against their own definition pools. If nothing
  // is available at this level the roll steps down one tier at a time (an
  // ancient with an empty pool is still a mythic, then a unique) and only
  // then becomes a rare, rather than producing an empty item.
  while (rarity === 'ancient' || rarity === 'mythic' || rarity === 'unique') {
    const pool = uniquePool(rarity, lvl).filter((d) => {
      const cat = getBase(d.baseId).category;
      // Charms drop through `rollCharm` only, at their own rate.
      if (cat === 'charm' && opts.category !== 'charm') return false;
      if (opts.category && cat !== opts.category) return false;
      // A skill bender rolls only for its own class; a chase item only while
      // nobody on the account holds one.
      if (d.classId && d.classId !== hero) return false;
      if (d.chase && lootHero.owned().has(d.id)) return false;
      return uniqueDropWeight(d, lvl) > 0;
    });
    if (pool.length > 0) {
      const def = rng.weighted(pool, (d) => uniqueDropWeight(d, lvl));
      return buildUniqueItem(def, rng);
    }
    rarity = rarity === 'ancient' ? 'mythic' : rarity === 'mythic' ? 'unique' : 'rare';
  }

  if (rarity === 'set') {
    const pool = setPool(lvl).filter((p: SetPieceDef) => {
      if (opts.category && getBase(p.baseId).category !== opts.category) return false;
      return setPieceDropWeight(p, lvl) > 0;
    });
    if (pool.length > 0) {
      const piece = rng.weighted(pool, (p) => setPieceDropWeight(p, lvl));
      return buildSetPiece(piece, rng);
    }
    rarity = 'rare';
  }

  const item = newItem(base, lvl, rarity, rng);
  item.mods = rollImplicits(base, rng);

  if (rarity === 'normal' || rarity === 'magic' || rarity === 'rare') {
    const affixes = rollAffixes(base, lvl, rarity, rng);
    item.mods.push(...affixes);
    if (rarity === 'magic') item.name = magicName(base, affixes);
    else if (rarity === 'rare') item.name = rareName(base, affixes, rng);
  }
  maybeAddPower(item, base, rarity, lvl, rng);

  item.sockets = rollSockets(base, lvl, rarity, rng);
  item.value = vendorPrice(item, false) * 4;
  return item;
}

// ---------------------------------------------------------------------------
// Charms
// ---------------------------------------------------------------------------

/**
 * Chance a kill of this rank drops a charm. A run's floors hold hundreds of
 * kills, so the old rates (0.6% a normal, 3% a champion) paid about 11
 * charms a run at depth 22 and 24 at depth 40. These pay about one a run at
 * depth 22, two at depth 40.
 */
const CHARM_DROP_CHANCE: Record<MonsterRank, number> = {
  normal: 0.0005,
  champion: 0.003,
  elite: 0.006,
  rare: 0.012,
  boss: 0.1,
};

/** How often each size turns up once its level is reached. */
const CHARM_SIZE_WEIGHT: Record<string, number> = {
  'charm.small': 44,
  'charm.medium': 28,
  'charm.large': 18,
  'charm.grand': 10,
};

/**
 * A charm: never plain (a charm with nothing on it would be a stone), most
 * often magic, sometimes rare, and very rarely one of the named ones. Magic
 * find lifts the odds of the better two.
 */
/** Chance a charm comes out as one of the named ones, before magic find. */
export const CHARM_UNIQUE_CHANCE = 0.05;

export function rollCharm(ilvl: number, rng: Rng, magicFind = 0, baseId?: string): Item {
  return atQuality(undefined, () => rollCharmAt(ilvl, rng, magicFind, baseId));
}

function rollCharmAt(ilvl: number, rng: Rng, magicFind: number, baseId: string | undefined): Item {
  const lvl = Math.max(1, Math.round(ilvl));
  const sizes = ALL_BASES.filter((b) => b.category === 'charm' && b.levelReq <= lvl && (!baseId || b.id === baseId));
  const base = sizes.length
    ? rng.weighted(sizes, (b) => CHARM_SIZE_WEIGHT[b.id] ?? 10)
    : getBase(baseId ?? 'charm.small');
  const mf = magicFindFactor(Math.max(0, magicFind), 600);
  if (rng.chance(CHARM_UNIQUE_CHANCE * mf * earlyRamp('unique', lvl))) {
    const pool = uniquePool('unique', lvl).filter((d) => d.baseId === base.id && (!d.classId || d.classId === lootHero.classId) && uniqueDropWeight(d, lvl) > 0);
    if (pool.length) return buildUniqueItem(rng.weighted(pool, (d) => uniqueDropWeight(d, lvl)), rng);
  }
  const rarity: ItemRarity = rng.chance(Math.min(0.5, 0.16 * mf)) ? 'rare' : 'magic';
  return createItem(base.id, lvl, rng, rarity);
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

/**
 * Potion drops.
 *
 * Tuned so a normal monster is a rare treat and a pack clear reliably tops you
 * up: at roughly one in nine per kill you refill about as fast as a careful
 * player spends, without the floor ever becoming a pharmacy. Champions and up
 * are much more generous, because that is when you actually spend.
 *
 * Which size drops is gated by depth, so a level-1 character is not handed a
 * super potion and a level-50 one is not handed a minor.
 */
const POTION_DROP_CHANCE: Record<MonsterRank, number> = {
  normal: 0.11,
  champion: 0.3,
  elite: 0.42,
  rare: 0.55,
  boss: 1,
};

/** Size tiers, with the depth at which each starts and stops appearing. */
const POTION_TIERS: Array<{ life: string; mana: string; from: number; to: number }> = [
  { life: 'potion.heal.minor', mana: 'potion.mana.minor', from: 1, to: 16 },
  { life: 'potion.heal.light', mana: 'potion.mana.light', from: 8, to: 34 },
  { life: 'potion.heal.greater', mana: 'potion.mana.greater', from: 22, to: 999 },
  { life: 'potion.heal.super', mana: 'potion.mana.super', from: 44, to: 999 },
];

export function rollPotion(ilvl: number, rank: MonsterRank, rng: Rng): Item | null {
  const chance = POTION_DROP_CHANCE[rank] ?? 0.11;
  if (!rng.chance(chance)) return null;

  const usable = POTION_TIERS.filter((t) => ilvl >= t.from && ilvl <= t.to);
  const tiers = usable.length ? usable : [POTION_TIERS[0]!];
  // Weighted toward the largest size you have unlocked, but not exclusively —
  // finding the odd small flask is what makes the big ones feel like a find.
  const tier = rng.weighted(tiers, (t) => 1 + tiers.indexOf(t) * 1.6);

  // Bosses hand out a rejuvenation instead, which is the one worth saving.
  if (rank === 'boss') {
    const id = ilvl >= 40 ? 'potion.rejuv.full' : 'potion.rejuv.lesser';
    const base = getBase(id);
    if (base) return newItem(base, ilvl, 'normal', rng);
  }

  const id = rng.chance(0.55) ? tier.life : tier.mana;
  const base = getBase(id);
  return base ? newItem(base, ilvl, 'normal', rng) : null;
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
}

const RANK_PROFILE: Record<MonsterRank, RankProfile> = {
  normal: { items: 0, bonusChance: 0.17, goldMul: 1, socketableChance: 0.035, materialRolls: 0 },
  champion: { items: 0, bonusChance: 0.62, goldMul: 2.4, socketableChance: 0.1, materialRolls: 1 },
  elite: { items: 1, bonusChance: 0.5, goldMul: 4.2, socketableChance: 0.17, materialRolls: 1 },
  rare: { items: 2, bonusChance: 0.55, goldMul: 7, socketableChance: 0.26, materialRolls: 2 },
  boss: { items: 4, bonusChance: 0.9, goldMul: 22, socketableChance: 0.85, materialRolls: 4 },
};

/**
 * Everything a killed monster drops, and what a source that pays like one
 * (a chest, a cursed chest) holds. `find` is the hero's (`Payout.findRates`);
 * `goldWeight` sizes the gold over the rank's own. The gold is final: gold
 * find and the tier are already in it.
 */
export function rollDrops(
  ilvl: number,
  rank: MonsterRank,
  rng: Rng,
  find: Find = NO_FIND,
  goldWeight = 1,
): { items: Item[]; gold: number; materials: Record<string, number> } {
  const lvl = Math.max(1, Math.round(ilvl));
  const profile = RANK_PROFILE[rank] ?? RANK_PROFILE.normal;
  const mf = Math.max(MIN_MAGIC_FIND, find.magicFind);

  const items: Item[] = [];
  let count = profile.items;
  if (rng.chance(profile.bonusChance)) count++;
  for (let i = 0; i < count; i++) {
    items.push(rollItem(lvl, rng, { magicFind: mf, source: rank }));
  }

  // A boss is guaranteed one roll that cannot come out worse than rare.
  if (rank === 'boss') {
    const forced = rollItem(lvl, rng, { magicFind: mf + 200, source: rank });
    items.push(RARITY_RANK[forced.rarity] >= RARITY_RANK.rare ? forced : rollItem(lvl, rng, { forceRarity: 'rare' }));
  }

  if (rng.chance(profile.socketableChance)) {
    const socketable = rollSocketable(lvl, rng);
    if (socketable) items.push(socketable);
  }

  const potion = rollPotion(lvl, rank, rng);
  if (potion) items.push(potion);

  if (rng.chance(CHARM_DROP_CHANCE[rank] ?? 0)) items.push(rollCharm(lvl, rng, mf));

  // Gold: the one curve every source pays on, sized by rank.
  const gold = payoutGold(lvl, profile.goldMul * goldWeight, rng, find);

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
  if (word) for (const bonus of runewordBonuses(word, item.sockets.map((s) => s.gemId))) addStat(out, bonus.stat, bonus.value);
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
  attackSpeed: 26,
  castSpeed: 26,
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
  } else if (base.category === 'trinket') {
    value = getTrinket(base.id)?.value ?? 200;
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
    value += powerValue(item) * (1 + item.ilvl / 30);
  }

  if (buying) return Math.max(1, Math.round(value * 3.2 * legacyPriceMultiplier()));
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
  power: '#ff9f43',
} as const;

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function rarityColor(rarity: ItemRarity): string {
  return hexColor(RARITY_COLOR[rarity] ?? 0xc8c8c8);
}

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  sword: tr('Sword'),
  axe: tr('Axe'),
  mace: tr('Mace'),
  dagger: tr('Dagger'),
  spear: tr('Polearm'),
  bow: tr('Bow'),
  crossbow: tr('Crossbow'),
  wand: tr('Wand'),
  staff: tr('Staff'),
  scepter: tr('Scepter'),
  shield: tr('Shield'),
  orb: tr('Orb'),
  quiver: tr('Quiver'),
  helm: tr('Helm'),
  chest: tr('Body Armor'),
  gloves: tr('Gloves'),
  pants: tr('Pants'),
  boots: tr('Boots'),
  belt: tr('Belt'),
  amulet: tr('Amulet'),
  ring: tr('Ring'),
  charm: tr('Charm'),
  trinket: tr('Trinket'),
  gem: tr('Gem'),
  rune: tr('Rune'),
  potion: tr('Potion'),
  material: 'Crafting Material',
};

function typeLine(base: ItemBase): string {
  const label = CATEGORY_LABEL[base.category] ?? base.category;
  if (base.slot === 'twoHand') return tr('Two-Handed {0}', label);
  if (base.slot === 'mainHand' && base.baseMinDamage !== undefined) return tr('One-Handed {0}', label);
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
  strength: tr('Strength'),
  dexterity: tr('Dexterity'),
  vitality: tr('Vitality'),
  energy: tr('Energy'),
  life: tr('Life'),
  mana: tr('Mana'),
  lifeRegen: tr('Life Regeneration'),
  manaRegen: tr('% Mana Regeneration'),
  attackRating: tr('Attack Rating'),
  minDamage: tr('Minimum Damage'),
  maxDamage: tr('Maximum Damage'),
  attackSpeed: tr('% Attack Speed'),
  castSpeed: tr('% Cast Speed'),
  critChance: tr('% Critical Strike Chance'),
  critDamage: tr('% Critical Strike Damage'),
  lifeSteal: tr('% Life Stolen per Hit'),
  manaSteal: tr('% Mana Stolen per Hit'),
  defense: tr('Defense'),
  blockChance: tr('% Block Chance'),
  damageReduction: tr('% Damage Reduction'),
  physicalResist: tr('% Physical Resistance'),
  fireResist: tr('% Fire Resistance'),
  coldResist: tr('% Cold Resistance'),
  lightningResist: tr('% Lightning Resistance'),
  poisonResist: tr('% Poison Resistance'),
  arcaneResist: tr('% Arcane Resistance'),
  fireDamage: tr('Fire Damage'),
  coldDamage: tr('Cold Damage'),
  lightningDamage: tr('Lightning Damage'),
  poisonDamage: tr('Poison Damage'),
  arcaneDamage: tr('Arcane Damage'),
  enhancedDamage: tr('% Enhanced Damage'),
  enhancedDefense: tr('% Enhanced Defense'),
  elementalDamagePct: tr('% Elemental Damage'),
  areaDamagePct: tr('% Area Damage'),
  moveSpeed: tr('% Movement Speed'),
  magicFind: tr('% Magic Find'),
  goldFind: tr('% Gold Find'),
  cooldownReduction: tr('% Cooldown Reduction'),
  skillLevels: tr('to All Skills'),
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

/**
 * Where the tooltip learns what the player is wearing, for set progress. Set
 * once at boot by `main.ts`; the sim layer never imports the save itself.
 */
let tooltipWearer: (() => Partial<Record<EquipSlot, Item>> | null) | null = null;
export function setTooltipWearer(fn: (() => Partial<Record<EquipSlot, Item>> | null) | null): void {
  tooltipWearer = fn;
}

/**
 * The roll's tier, PoE style: T1 is the best rung of that affix's ladder.
 * Seeing "T1" on a drop is what makes a good rare legible at a glance.
 */
export function affixTierRank(mod: ItemMod): { rank: number; of: number } | null {
  if (mod.kind !== 'prefix' && mod.kind !== 'suffix') return null;
  if (!mod.tier || mod.tier <= 0) return null;
  const affix = ALL_AFFIXES.find((a) => a.id === mod.affixId);
  if (!affix) return null;
  const of = affix.tiers.length;
  return { rank: Math.max(1, of - mod.tier + 1), of };
}

function tierTag(mod: ItemMod): string {
  const t = affixTierRank(mod);
  return t ? `  [T${t.rank}]` : '';
}

/** Requirement context. Optional — omit it and requirements render neutral. */
export interface TooltipContext {
  level?: number;
  strength?: number;
  dexterity?: number;
  classId?: CharClassId;
}

/** `block` marks the first line of a part the tooltip draws in its own box. */
type Line = { text: string; color: string; bold?: boolean; block?: 'gem' | 'sockets' | 'runeword' };

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

  const push = (text: string, color: string, bold?: boolean, block?: Line['block']) => {
    const line: Line = { text, color };
    if (bold) line.bold = true;
    if (block) line.block = block;
    lines.push(line);
  };
  const blank = () => {
    if (lines.length && lines[lines.length - 1].text !== '') push('', COLOR.dim);
  };

  // --- header -------------------------------------------------------------
  const shown = itemDisplayName(item);
  const title = item.upgrade > 0 ? `${shown} +${item.upgrade}` : shown;
  push(title, rc, true);
  if (shown !== base.name) push(base.name, COLOR.dim);
  push(typeLine(base), COLOR.dim);
  if (item.corrupted) push(tr('Corrupted'), COLOR.bad);
  if (base.category === 'charm') {
    push(tr('Works from your pack'), COLOR.implicit);
    if (item.uniqueId) push(tr('Only one of these counts at a time'), COLOR.dim);
  }
  const trinket = base.category === 'trinket' ? getTrinket(base.id) : undefined;
  if (trinket) {
    blank();
    for (const t of trinket.text) push(t, COLOR.implicit);
    blank();
    push(trinket.flavor, COLOR.flavor);
  }

  // --- base values --------------------------------------------------------
  blank();
  const damage = itemDamageRange(item);
  const cmpDamage = compareTo ? itemDamageRange(compareTo) : null;
  if (damage) {
    const improved = item.upgrade > 0 || (damage.max > (base.baseMaxDamage ?? 0));
    push(tr('Damage: {0}-{1}', damage.min, damage.max), improved ? COLOR.good : COLOR.body);
    if (cmpDamage) {
      const d = (damage.min + damage.max) / 2 - (cmpDamage.min + cmpDamage.max) / 2;
      if (Math.abs(d) >= 0.5) push(tr('  {0}{1} average damage', d > 0 ? '+' : '', numText(d, 0)), d > 0 ? COLOR.good : COLOR.bad);
    }
  }
  if (base.baseSpeed) push(tr('Attacks per Second: {0}', numText(base.baseSpeed, 2)), COLOR.body);
  const def = itemDefense(item);
  if (def > 0) {
    const improved = item.upgrade > 0 || def > (base.baseDefense ?? 0);
    push(tr('Defense: {0}', def), improved ? COLOR.good : COLOR.body);
    if (compareTo) {
      const d = def - itemDefense(compareTo);
      if (d !== 0) push(tr('  {0}{1} defense', d > 0 ? '+' : '', d), d > 0 ? COLOR.good : COLOR.bad);
    }
  }
  if (base.baseBlock) push(tr('Chance to Block: {0}%', Math.round(base.baseBlock * 100)), COLOR.body);

  // --- requirements -------------------------------------------------------
  const reqs: Line[] = [];
  if (base.levelReq > 1) {
    const unmet = ctx?.level !== undefined && ctx.level < requiredLevel(item);
    reqs.push({ text: tr('Required Level: {0}', requiredLevel(item)), color: unmet ? COLOR.bad : COLOR.dim });
  }
  if (base.strReq) {
    const unmet = ctx?.strength !== undefined && ctx.strength < base.strReq;
    reqs.push({ text: tr('Required Strength: {0}', base.strReq), color: unmet ? COLOR.bad : COLOR.dim });
  }
  if (base.dexReq) {
    const unmet = ctx?.dexterity !== undefined && ctx.dexterity < base.dexReq;
    reqs.push({ text: tr('Required Dexterity: {0}', base.dexReq), color: unmet ? COLOR.bad : COLOR.dim });
  }
  if (base.classes && base.classes.length > 0) {
    const unmet = ctx?.classId !== undefined && !base.classes.includes(ctx.classId);
    reqs.push({ text: tr('Class: {0}', base.classes.join(', ')), color: unmet ? COLOR.bad : COLOR.dim });
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
      push(modLine(mod) + tierTag(mod), negative ? COLOR.bad : item.rarity === 'set' ? COLOR.set : COLOR.mod);
    }
  }

  // --- powers: behaviours, not numbers -------------------------------------
  const powers = powerLines(item);
  if (powers.length) {
    blank();
    for (const p of powers) {
      push(p.name, COLOR.power, true);
      push(p.text, p.source === 'unique' ? COLOR.gold : COLOR.power);
    }
  }

  // --- the gem's own tooltip ----------------------------------------------
  // A gem carries no mods of its own, so without this block it showed nothing
  // but its name: no way to tell a Chipped Ruby from a Flawless Topaz, and no
  // reason to pick either up.
  if (base.category === 'gem' || base.category === 'rune') {
    const gem = getSocketable(base.id);
    if (gem) {
      blank();
      push(tr('When socketed into:'), COLOR.dim, false, 'gem');
      const tables: Array<[string, GemBonus[]]> = [
        [tr('Weapons'), gem.weapon],
        [tr('Armour'), gem.armor],
        [tr('Helms & Shields'), gem.armor],
        [tr('Rings & Amulets'), gem.jewelry],
      ];
      // Armour and helms share a table; list it once.
      const seen = new Set<string>();
      for (const [label, bonuses] of tables) {
        if (bonuses.length === 0) continue;
        const text = bonuses
          .map((b) => `${b.value >= 0 ? '+' : ''}${b.value} ${STAT_LABEL[b.stat] ?? b.stat}`)
          .join(', ');
        if (seen.has(text)) continue;
        seen.add(text);
        push(`  ${label}: ${text}`, gem.isRune ? COLOR.rune : COLOR.socket);
      }
      // The level rule is invisible until you try, and "too potent for this
      // base" is a baffling thing to be told after the fact.
      if (gem.levelReq > 26) {
        push(tr('Needs a base of level {0} or higher.', gem.levelReq - 25), COLOR.dim);
      }
      push(tr('Drag onto a socketed item to set it.'), COLOR.flavor);
    }
  }

  // --- sockets ------------------------------------------------------------
  if (item.sockets.length) {
    blank();
    const filled = item.sockets.filter((s) => s.gemId).length;
    push(tr('Sockets: {0} / {1}', filled, item.sockets.length), COLOR.socket, false, 'sockets');
    for (const socket of item.sockets) {
      if (!socket.gemId) {
        push(`  ${tr('(empty)')}`, COLOR.dim);
        continue;
      }
      const gem = getSocketable(socket.gemId);
      if (!gem) {
        push(`  ${tr('(unknown)')}`, COLOR.dim);
        continue;
      }
      const bonuses = socketBonuses(socket.gemId, base.category)
        .map((b) => `${b.value >= 0 ? '+' : ''}${b.value} ${STAT_LABEL[b.stat] ?? b.stat}`)
        .join(', ');
      push(`  ${gem.name}: ${bonuses}`, gem.isRune ? COLOR.rune : COLOR.socket);
    }
    const word = itemRuneword(item);
    if (word) {
      push(tr('Runeword: {0}', word.name), COLOR.gold, true, 'runeword');
      for (const bonus of runewordBonuses(word, item.sockets.map((s) => s.gemId))) {
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
      // What the wearer has on right now, so the block reads as progress.
      const worn = new Set<string>();
      const eq = tooltipWearer?.() ?? null;
      if (eq) {
        for (const w of Object.values(eq)) {
          if (w && w.setId === set.id) worn.add(w.uniqueId ?? w.baseId);
        }
      }
      const count = worn.size;
      push(eq ? `${set.name} (${count}/${set.pieces.length})` : set.name, COLOR.set, true);
      for (const piece of set.pieces) {
        const mine = piece.id === item.uniqueId;
        const have = worn.has(piece.id);
        push(`  ${have ? '+ ' : ''}${piece.name}`, have || mine ? COLOR.set : COLOR.dim);
      }
      for (const bonus of set.bonuses) {
        const active = eq ? count >= bonus.pieces : true;
        push(tr('  ({0} pieces) {1}', bonus.pieces, bonus.desc), active ? COLOR.set : COLOR.dim);
      }
    }
  }

  // --- unique hook and flavour -------------------------------------------
  if (item.uniqueId) {
    const def = getUnique(item.uniqueId);
    if (def) {
      // A unique with a power already printed its exact effect above.
      if (def.hook && powers.length === 0) {
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
    push(tr('Compared to {0}', compareTo.name), COLOR.dim, true);
    const mine = itemStats(item);
    const theirs = itemStats(compareTo);
    const keys = new Set<StatKey>([...(Object.keys(mine) as StatKey[]), ...(Object.keys(theirs) as StatKey[])]);
    const deltas = Array.from(keys)
      .map((k) => ({ stat: k, delta: (mine[k] ?? 0) - (theirs[k] ?? 0) }))
      .filter((d) => d.delta !== 0)
      .sort((x, y) => statOrder(x.stat) - statOrder(y.stat));
    if (deltas.length === 0) push(tr('  No difference'), COLOR.dim);
    for (const d of deltas) {
      push(
        `  ${d.delta > 0 ? '+' : ''}${d.delta} ${STAT_LABEL[d.stat] ?? d.stat}`,
        d.delta > 0 ? COLOR.good : COLOR.bad,
      );
    }
  }

  // --- footer -------------------------------------------------------------
  blank();
  push(tr('Item Level {0}   Value {1}g', item.ilvl, vendorPrice(item, false)), COLOR.dim);

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
  if (!isEquippable(base)) return { ok: false, reason: tr('This item cannot be equipped.') };
  if (ctx.level < requiredLevel(item)) return { ok: false, reason: tr('Requires level {0}.', requiredLevel(item)) };
  if (base.strReq && ctx.strength < base.strReq) return { ok: false, reason: tr('Requires {0} strength.', base.strReq) };
  if (base.dexReq && ctx.dexterity < base.dexReq) return { ok: false, reason: tr('Requires {0} dexterity.', base.dexReq) };
  if (base.classes && ctx.classId && !base.classes.includes(ctx.classId)) {
    return { ok: false, reason: tr('Your class cannot use this.') };
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

/**
 * SLAY — the camp's services, earned through Legacy.
 *
 *   - **The Gambler** (unlock `gambler`). Pay gold for a sealed item of the
 *     type you name. Better odds at set, unique and mythic than a drop, worse
 *     value on average than the gold: it is a lottery with a fair house edge.
 *   - **The Enchanter** (unlock `enchanter`). Reforge one prefix or suffix of a
 *     magic or rare item. Once a mod has been reforged it is the only one that
 *     may be reforged again (`Item.enchantedMod`). Or imbue a rare that has no
 *     power with one.
 *   - **The Bounty Board** (unlock `bounties`). Three contracts at a time, each
 *     asking for something at a depth you have not yet passed. Take up to two,
 *     finish them below, claim gold, Renown and an item here. What a contract
 *     pays stays sealed until it is claimed. Being paid posts a fresh board;
 *     posting one before that costs gold, more each time.
 *
 * State lives on the character (`Character.town`), so it dies with them like
 * the gold does. `townOf` builds or repairs it; `repairCharacter` calls
 * `repairTownState` on load.
 *
 * Every roll is seeded from the character id and a counter that persists, so
 * nothing here calls Math.random and reloading cannot re-roll a gamble.
 */

import type { Bounty, BountyKind, Character, Item, ItemCategory, ItemRarity, MonsterRank, TownState } from '../types';
import { Random, hashString } from '../core/RNG';
import { ITEM_BASES, createItem, getBase, openAffixSlots, rollItem, rollLineOffers, vendorPrice } from './Loot';
import { rollPowerAffix } from './ItemPowers';
import { addItemToInventory, countInInventory, consumeFromInventory, inventoryIsFull, setStackCount, stackCount } from './Inventory';
import { gemUpgradeRecipe, getSocketable, runeUpgradeRecipe } from '../data/gems';
import { legacyPriceMultiplier } from './Legacy';
import type { CraftCost } from './Crafting';
import { tr } from '../core/I18n';

export const TOWN_STATE_VERSION = 1;
/** How many bounties the board shows at once, and how many you may hold. */
export const BOARD_SIZE = 3;
export const MAX_ACTIVE_BOUNTIES = 2;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function freshTown(): TownState {
  return { v: TOWN_STATE_VERSION, rolls: 0, bounties: [], claimed: 0, reposts: 0 };
}

const KINDS: readonly BountyKind[] = ['slay', 'elites', 'boss', 'clear', 'events'];
const STATES = ['open', 'active', 'done'] as const;

const num = (v: unknown, d: number, min = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : d;

/**
 * Makes `c.town` valid: creates it on a character from before town services,
 * and drops anything on the board that no longer reads. Returns true when
 * something changed.
 */
export function repairTownState(c: Character): boolean {
  const raw = c.town as unknown;
  if (!raw || typeof raw !== 'object') {
    c.town = freshTown();
    return true;
  }
  const t = raw as Partial<TownState> & Record<string, unknown>;
  let changed = false;
  const fixed: TownState = {
    v: TOWN_STATE_VERSION,
    rolls: Math.floor(num(t.rolls, 0)),
    claimed: Math.floor(num(t.claimed, 0)),
    bounties: [],
    reposts: Math.floor(num(t.reposts, 0)),
  };
  if (fixed.rolls !== t.rolls || fixed.claimed !== t.claimed || fixed.reposts !== t.reposts || t.v !== TOWN_STATE_VERSION) changed = true;
  const list = Array.isArray(t.bounties) ? t.bounties : [];
  if (!Array.isArray(t.bounties)) changed = true;
  for (const b of list as Array<Partial<Bounty>>) {
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !KINDS.includes(b.kind as BountyKind)) {
      changed = true;
      continue;
    }
    const minDepth = Math.max(1, Math.floor(num(b.minDepth, 1, 1)));
    // Saves from before sealed rewards kept the gold instead: it was the
    // worth times the slay rate at that depth.
    const old = (b as { reward?: { gold?: unknown } }).reward;
    const worth = num(b.worth, old ? num(old.gold, 0) / bountyGold(minDepth) || 1 : 1, 0.5);
    const fb: Bounty = {
      id: b.id,
      kind: b.kind as BountyKind,
      minDepth,
      target: Math.max(1, Math.floor(num(b.target, 1, 1))),
      progress: Math.floor(num(b.progress, 0)),
      state: STATES.includes(b.state as Bounty['state']) ? (b.state as Bounty['state']) : 'open',
      worth: Math.round(Math.max(0.5, Math.min(3, worth)) * 100) / 100,
    };
    if (fb.state === 'active' && fb.progress >= fb.target) fb.state = 'done';
    if (JSON.stringify(fb) !== JSON.stringify(b)) changed = true;
    if (fixed.bounties.length < BOARD_SIZE + MAX_ACTIVE_BOUNTIES) fixed.bounties.push(fb);
    else changed = true;
  }
  c.town = fixed;
  return changed;
}

/** The character's town state, created or repaired on first use. */
export function townOf(c: Character): TownState {
  if (!c.town || typeof c.town !== 'object' || !Array.isArray(c.town.bounties)) repairTownState(c);
  return c.town!;
}

/** A fresh, seeded stream for one roll. Bumps the persisted counter. */
function rollRng(c: Character, label: string): Random {
  const t = townOf(c);
  t.rolls++;
  return new Random(hashString(`${c.id}:${label}:${t.rolls}`));
}

// ---------------------------------------------------------------------------
// The Gambler
// ---------------------------------------------------------------------------

export interface GambleOffer {
  id: string;
  name: string;
  /** Categories this offer may roll; empty means the class's weapons. */
  categories: ItemCategory[];
  priceMul: number;
}

const WEAPON_CATEGORIES: ItemCategory[] = ['sword', 'axe', 'mace', 'dagger', 'spear', 'bow', 'crossbow', 'wand', 'staff', 'scepter'];
const OFFHAND_CATEGORIES: ItemCategory[] = ['shield', 'orb', 'quiver'];

export const GAMBLE_OFFERS: GambleOffer[] = [
  { id: 'weapon', name: tr('Weapon'), categories: [], priceMul: 1.3 },
  { id: 'offhand', name: tr('Off-hand'), categories: OFFHAND_CATEGORIES, priceMul: 1.1 },
  { id: 'helm', name: tr('Helm'), categories: ['helm'], priceMul: 1.0 },
  { id: 'chest', name: tr('Body Armour'), categories: ['chest'], priceMul: 1.15 },
  { id: 'gloves', name: tr('Gloves'), categories: ['gloves'], priceMul: 0.9 },
  { id: 'pants', name: tr('Pants'), categories: ['pants'], priceMul: 1.0 },
  { id: 'boots', name: tr('Boots'), categories: ['boots'], priceMul: 0.9 },
  { id: 'belt', name: tr('Belt'), categories: ['belt'], priceMul: 0.85 },
  { id: 'ring', name: tr('Ring'), categories: ['ring'], priceMul: 1.4 },
  { id: 'amulet', name: tr('Amulet'), categories: ['amulet'], priceMul: 1.6 },
];

/** What a sealed item turns out to be. Out of 1000. */
export const GAMBLE_ODDS: ReadonlyArray<{ rarity: ItemRarity; weight: number }> = [
  { rarity: 'magic', weight: 560 },
  { rarity: 'rare', weight: 320 },
  { rarity: 'set', weight: 55 },
  { rarity: 'unique', weight: 55 },
  { rarity: 'mythic', weight: 10 },
];

export function gamblePrice(c: Pick<Character, 'level'>, offerId: string): number {
  const offer = GAMBLE_OFFERS.find((o) => o.id === offerId);
  if (!offer) return 0;
  // Gold income climbs steeply with depth; the price keeps a gamble a real
  // choice (tools/check-economy.mjs: ten to twenty a descent).
  const base = 100 + Math.pow(Math.max(1, c.level), 1.75) * 25;
  return Math.max(1, Math.round(base * offer.priceMul * legacyPriceMultiplier()));
}

/** Categories the character's class can wield, from the weapon list. */
function classWeapons(c: Character): ItemCategory[] {
  const out = new Set<ItemCategory>();
  for (const b of ITEM_BASES) {
    if (!WEAPON_CATEGORIES.includes(b.category)) continue;
    if (b.classes && !b.classes.includes(c.classId)) continue;
    out.add(b.category);
  }
  return out.size ? [...out] : WEAPON_CATEGORIES;
}

export interface ServiceResult {
  ok: boolean;
  reason?: string;
  item?: Item;
}

/** Pays and rolls a sealed item into the pack. */
export function gamble(c: Character, offerId: string): ServiceResult {
  const offer = GAMBLE_OFFERS.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: tr('Nothing like that for sale.') };
  const price = gamblePrice(c, offerId);
  if (c.gold < price) return { ok: false, reason: tr('Not enough gold (need {0}).', price) };
  if (inventoryIsFull(c)) return { ok: false, reason: tr('Your pack is full.') };
  const rng = rollRng(c, 'gamble');
  const item = rollGambleItem(c, offer, rng);
  if (!addItemToInventory(c, item)) return { ok: false, reason: tr('Your pack is full.') };
  c.gold -= price;
  return { ok: true, item };
}

/** The roll itself, without payment. Exported for the checker. */
export function rollGambleItem(c: Character, offer: GambleOffer, rng: Random): Item {
  const rarity = rng.weighted(GAMBLE_ODDS, (o) => o.weight).rarity;
  const ilvl = Math.max(1, c.level + rng.int(-2, 4));
  const cats = offer.categories.length ? offer.categories : classWeapons(c);
  const category = rng.pick(cats);
  return rollItem(ilvl, rng, { forceRarity: rarity, category, classId: c.classId });
}

// ---------------------------------------------------------------------------
// The Enchanter
// ---------------------------------------------------------------------------

/** The essence an item of this level wants. */
function essenceFor(ilvl: number): string {
  if (ilvl >= 60) return 'essence.pure';
  if (ilvl >= 35) return 'essence.greater';
  if (ilvl >= 15) return 'essence.lesser';
  return 'dust.grave';
}

/** Magic and rare items can be enchanted; authored items keep their rolls. */
export function canEnchantItem(item: Item): { ok: boolean; reason?: string } {
  if (item.rarity !== 'magic' && item.rarity !== 'rare') return { ok: false, reason: tr('Only magic and rare items take an enchantment.') };
  const base = getBase(item.baseId);
  if (base.slot === 'consumable' || base.slot === 'none') return { ok: false, reason: tr('That cannot be enchanted.') };
  return { ok: true };
}

/** How many lines the Enchanter lays out to choose from. */
export const OFFER_COUNT = 3;

/** Indexes of the mods the Enchanter will reforge on this item right now. */
export function reforgeableMods(item: Item): number[] {
  if (!canEnchantItem(item).ok || item.offers) return [];
  const out: number[] = [];
  item.mods.forEach((m, i) => {
    if (m.kind !== 'prefix' && m.kind !== 'suffix') return;
    if (item.enchantedMod && m.affixId !== item.enchantedMod) return;
    out.push(i);
  });
  return out;
}

export function reforgeCost(item: Item): CraftCost {
  const n = item.enchants ?? 0;
  const gold = Math.round((120 + Math.pow(item.ilvl, 1.4) * 22) * (item.rarity === 'rare' ? 1.5 : 1) * Math.pow(1.35, n));
  return { gold, materials: { [essenceFor(item.ilvl)]: 1 + Math.floor(n / 2) } };
}

/**
 * Reforges one mod: pays, then lays out `OFFER_COUNT` new lines of the same
 * kind on `item.offers` for the player to choose from (`takeOffer`). `pay`
 * takes the cost (the panel passes the crafting bench's `spendCost`); it is
 * called only once every rule has passed and the offers exist.
 */
export function reforgeMod(c: Character, item: Item, index: number, pay: (cost: CraftCost) => { ok: boolean; reason?: string }): ServiceResult {
  const can = canEnchantItem(item);
  if (!can.ok) return can;
  if (item.offers) return { ok: false, reason: tr('Choose from the lines on the table first.') };
  const mod = item.mods[index];
  if (!mod || (mod.kind !== 'prefix' && mod.kind !== 'suffix')) return { ok: false, reason: tr('Only a prefix or suffix can be reforged.') };
  if (item.enchantedMod && item.enchantedMod !== mod.affixId) {
    return { ok: false, reason: tr('Another property has already been reforged. Only that one may change.') };
  }
  const offers = rollLineOffers(item, mod.kind, index, OFFER_COUNT, rollRng(c, 'reforge'));
  if (offers.length === 0) return { ok: false, reason: tr('The enchantment would not take.') };
  const paid = pay(reforgeCost(item));
  if (!paid.ok) return paid;
  item.offers = { line: mod.affixId, kind: mod.kind, mods: offers };
  // The line is the Enchanter's from the moment it is paid for, kept or not.
  item.enchantedMod = mod.affixId;
  item.enchants = (item.enchants ?? 0) + 1;
  return { ok: true, item };
}

/**
 * Takes one of the lines on the table (`pick` is its index in
 * `item.offers.mods`), or walks away with what the item had (`pick` null).
 * Free: the choice was paid for when the lines were laid out.
 */
export function takeOffer(item: Item, pick: number | null): ServiceResult {
  const o = item.offers;
  if (!o) return { ok: false, reason: tr('Nothing is on the table.') };
  const chosen = pick === null ? null : o.mods[pick];
  if (pick !== null && !chosen) return { ok: false, reason: tr('No such line.') };
  if (chosen && o.line !== null) {
    const index = item.mods.findIndex((m) => m.affixId === o.line && m.kind === o.kind);
    if (index < 0) {
      item.offers = undefined;
      return { ok: false, reason: tr('That line is no longer on the item.') };
    }
    item.mods[index] = { ...chosen };
    item.enchantedMod = chosen.affixId;
  } else if (chosen) {
    // A new line goes after the last of its kind, so prefixes stay together.
    let at = -1;
    item.mods.forEach((m, i) => {
      if (m.kind === 'implicit' || m.kind === 'prefix' || (o.kind === 'suffix' && m.kind === 'suffix')) at = i;
    });
    item.mods.splice(at + 1, 0, { ...chosen });
    item.enchantedMod = chosen.affixId;
  }
  item.offers = undefined;
  item.value = vendorPrice(item, false) * 4;
  return { ok: true, item };
}

/**
 * Whether the Enchanter will add a line of this kind. Only into an open slot
 * (`openAffixSlots`), and only while the item has no reforged line: the
 * Enchanter touches one line per item, old or new.
 */
export function canFillSlot(item: Item, kind: 'prefix' | 'suffix'): { ok: boolean; reason?: string } {
  const can = canEnchantItem(item);
  if (!can.ok) return can;
  if (item.offers) return { ok: false, reason: tr('Choose from the lines on the table first.') };
  if (item.enchantedMod) return { ok: false, reason: tr('A property has already been reforged. Only that one may change.') };
  if (openAffixSlots(item)[kind] <= 0) return { ok: false, reason: tr('There is no room for another {0}.', kind) };
  return { ok: true };
}

export function fillCost(item: Item): CraftCost {
  const n = item.enchants ?? 0;
  const gold = Math.round((250 + Math.pow(item.ilvl, 1.4) * 40) * (item.rarity === 'rare' ? 1.5 : 1) * Math.pow(1.35, n));
  const materials: Record<string, number> = { [essenceFor(item.ilvl)]: 2 };
  // What ties a new line into the item, by how deep it was found.
  const tie: [string, number] =
    item.ilvl >= 80 ? ['essence.mythic', 1] : item.ilvl >= 34 ? ['dust.void', 2] : item.ilvl >= 12 ? ['reagent.sinew', 2] : ['dust.grave', 6];
  materials[tie[0]] = (materials[tie[0]] ?? 0) + tie[1];
  return { gold, materials };
}

/** Pays, then lays out new lines for an open slot of this kind (`takeOffer`). */
export function fillSlot(c: Character, item: Item, kind: 'prefix' | 'suffix', pay: (cost: CraftCost) => { ok: boolean; reason?: string }): ServiceResult {
  const can = canFillSlot(item, kind);
  if (!can.ok) return can;
  const offers = rollLineOffers(item, kind, null, OFFER_COUNT, rollRng(c, 'fill'));
  if (offers.length === 0) return { ok: false, reason: tr('No {0} will take hold in this item.', kind) };
  const paid = pay(fillCost(item));
  if (!paid.ok) return paid;
  item.offers = { line: null, kind, mods: offers };
  item.enchants = (item.enchants ?? 0) + 1;
  return { ok: true, item };
}

/** A rare with no power of its own may be given one. */
export function canImbue(item: Item): { ok: boolean; reason?: string } {
  if (item.rarity !== 'rare') return { ok: false, reason: tr('Only a rare item can be imbued.') };
  if (item.powers && item.powers.length > 0) return { ok: false, reason: tr('It already carries a power.') };
  const base = getBase(item.baseId);
  if (base.slot === 'consumable' || base.slot === 'none') return { ok: false, reason: tr('That cannot be imbued.') };
  return { ok: true };
}

export function imbueCost(item: Item): CraftCost {
  const n = item.enchants ?? 0;
  const gold = Math.round((400 + Math.pow(item.ilvl, 1.4) * 60) * Math.pow(1.35, n));
  return { gold, materials: { [essenceFor(item.ilvl)]: 3 } };
}

export function imbuePower(c: Character, item: Item, pay: (cost: CraftCost) => { ok: boolean; reason?: string }): ServiceResult {
  const can = canImbue(item);
  if (!can.ok) return can;
  const base = getBase(item.baseId);
  // Roll before paying: a base with no power pool must not cost anything.
  const rng = rollRng(c, 'imbue');
  const roll = rollPowerAffix(base.category, item.rarity, item.ilvl, rng, true);
  if (!roll) return { ok: false, reason: tr('Nothing will take hold in this kind of item.') };
  const paid = pay(imbueCost(item));
  if (!paid.ok) return paid;
  item.powers = [roll];
  item.enchants = (item.enchants ?? 0) + 1;
  item.value = vendorPrice(item, false) * 4;
  return { ok: true, item };
}

// ---------------------------------------------------------------------------
// The Bounty Board
// ---------------------------------------------------------------------------

interface BountyKindDef {
  kind: BountyKind;
  weight: number;
  target: (depth: number, rng: Random) => number;
  /** Reward scale relative to a slay bounty. */
  worth: number;
  text: (b: Bounty) => string;
}

export const BOUNTY_KINDS: BountyKindDef[] = [
  {
    kind: 'slay',
    weight: 10,
    target: (d, rng) => Math.round((60 + d * 3) * rng.range(0.9, 1.25) / 5) * 5,
    worth: 1,
    text: (b) => tr('Slay {0} monsters at tier {1} or higher', b.target, b.minDepth),
  },
  {
    kind: 'elites',
    weight: 8,
    target: (d, rng) => Math.round((6 + d * 0.25) * rng.range(0.9, 1.2)),
    worth: 1.2,
    text: (b) => tr('Slay {0} champions or elites at tier {1} or higher', b.target, b.minDepth),
  },
  {
    kind: 'boss',
    weight: 6,
    target: () => 1,
    worth: 1.3,
    text: (b) => tr('Slay the master of a map at tier {0} or higher', b.minDepth),
  },
  {
    kind: 'clear',
    weight: 5,
    target: () => 1,
    worth: 1.4,
    text: (b) => tr('Clear a map at tier {0} or higher', b.minDepth),
  },
  {
    kind: 'events',
    weight: 6,
    target: (d) => (d >= 20 ? 3 : 2),
    worth: 1.1,
    text: (b) =>
      tr('Survive {0} dungeon events (cursed chests, ambushes, bargains, runners) at tier {1} or higher', b.target, b.minDepth),
  },
];

export function bountyText(b: Bounty): string {
  return BOUNTY_KINDS.find((k) => k.kind === b.kind)?.text(b) ?? tr('A bounty');
}

/** A plain slay bounty's gold at this depth, before its roll. */
function bountyGold(minDepth: number): number {
  return 250 + minDepth * 110;
}

/** One new bounty for the board, aimed a little past where the character has been. */
export function makeBounty(c: Character, rng: Random): Bounty {
  const next = Math.max(1, c.depthRecord + 1);
  const stretch = rng.int(0, 2);
  const minDepth = next + stretch;
  const def = rng.weighted(BOUNTY_KINDS, (k) => k.weight);
  const t = townOf(c);
  return {
    id: `b${t.rolls}-${def.kind}`,
    kind: def.kind,
    minDepth,
    target: Math.max(1, def.target(minDepth, rng)),
    progress: 0,
    state: 'open',
    worth: Math.round(def.worth * (1 + stretch * 0.2) * 100) / 100,
  };
}

const openOnBoard = (t: TownState): number => t.bounties.filter((b) => b.state === 'open').length;

/** Fills the board's open slots. Taken and finished bounties keep their place. */
function fillBoard(c: Character): TownState {
  const t = townOf(c);
  let guard = 0;
  while (openOnBoard(t) < BOARD_SIZE && guard++ < 10) {
    const rng = rollRng(c, 'bounty');
    t.bounties.push(makeBounty(c, rng));
  }
  return t;
}

/**
 * The board as the character finds it. The first visit posts it for free;
 * after that it only changes when a bounty is paid or a new board is bought.
 */
export function refreshBoard(c: Character): TownState {
  const t = townOf(c);
  return openOnBoard(t) === 0 ? fillBoard(c) : t;
}

/** What posting a new board costs right now. Climbs with each one bought. */
export function repostCost(c: Character): number {
  const t = townOf(c);
  const depth = Math.max(1, c.depthRecord + 1);
  const base = (60 + depth * 25) * 1.5 ** Math.min(t.reposts, 30);
  return Math.max(1, Math.round((base * legacyPriceMultiplier()) / 5) * 5);
}

/** Pays to take every open contract down and post new ones. */
export function repostBoard(c: Character): { ok: boolean; reason?: string; price: number } {
  const t = townOf(c);
  const price = repostCost(c);
  if (c.gold < price) return { ok: false, reason: tr('Not enough gold (need {0}).', price), price };
  c.gold -= price;
  t.reposts++;
  t.bounties = t.bounties.filter((b) => b.state !== 'open');
  fillBoard(c);
  return { ok: true, price };
}

export function acceptBounty(c: Character, id: string): { ok: boolean; reason?: string } {
  const t = townOf(c);
  const b = t.bounties.find((x) => x.id === id);
  if (!b || b.state !== 'open') return { ok: false, reason: tr('That bounty is not on the board.') };
  if (t.bounties.filter((x) => x.state === 'active' || x.state === 'done').length >= MAX_ACTIVE_BOUNTIES) {
    return { ok: false, reason: tr('You can hold {0} bounties at once.', MAX_ACTIVE_BOUNTIES) };
  }
  b.state = 'active';
  return { ok: true };
}

/** Gives a taken bounty up. It goes back on the board as new, if there is room. */
export function abandonBounty(c: Character, id: string): boolean {
  const t = townOf(c);
  const i = t.bounties.findIndex((x) => x.id === id && x.state === 'active');
  if (i < 0) return false;
  const b = t.bounties[i]!;
  if (openOnBoard(t) < BOARD_SIZE) {
    b.state = 'open';
    b.progress = 0;
  } else t.bounties.splice(i, 1);
  return true;
}

/** Bounties taken and not yet paid. */
export function heldBounties(c: Character): Bounty[] {
  return townOf(c).bounties.filter((b) => b.state === 'active' || b.state === 'done');
}

/**
 * Something happened below. `depth` is the descent's depth. Returns the
 * bounties this finished, for the caller to announce.
 */
export function bountyProgress(c: Character, kind: BountyKind, depth: number, amount = 1): Bounty[] {
  const done: Bounty[] = [];
  for (const b of townOf(c).bounties) {
    if (b.state !== 'active' || b.kind !== kind || depth < b.minDepth) continue;
    b.progress = Math.min(b.target, b.progress + amount);
    if (b.progress >= b.target) {
      b.state = 'done';
      done.push(b);
    }
  }
  return done;
}

/** Which bounty kinds a kill of this rank advances. */
export function bountyKindsForKill(rank: MonsterRank): BountyKind[] {
  if (rank === 'boss') return ['slay', 'elites', 'boss'];
  if (rank === 'normal') return ['slay'];
  return ['slay', 'elites'];
}

export interface BountyPayout {
  gold: number;
  renown: number;
  item: Item | null;
}

/**
 * What a bounty pays. Seeded by the character and the bounty, so a reload or
 * a claim refused for a full pack rolls the same reward again.
 */
function bountyPayout(c: Character, b: Bounty): BountyPayout {
  const rng = new Random(hashString(`${c.id}:claim:${b.id}`));
  const gold = Math.round(bountyGold(b.minDepth) * b.worth * rng.range(0.6, 1.5));
  const renown = Math.round((5 + b.minDepth * 1.2) * b.worth * rng.range(0.7, 1.3) * 10) / 10;
  const rarity: ItemRarity = rng.chance(0.08) ? 'unique' : rng.chance(0.14) ? 'set' : 'rare';
  const item = rollItem(b.minDepth + 6, rng, { forceRarity: rarity, classId: c.classId });
  return { gold, renown, item };
}

/**
 * Pays a finished bounty: gold now, the item into the pack (or the payout
 * fails if the pack is full), and the Renown for the caller to grant. Being
 * paid posts a fresh board and brings the price of the next one back down.
 */
export function claimBounty(c: Character, id: string): { ok: boolean; reason?: string; payout?: BountyPayout } {
  const t = townOf(c);
  const i = t.bounties.findIndex((x) => x.id === id);
  const b = t.bounties[i];
  if (!b || b.state !== 'done') return { ok: false, reason: tr('That bounty is not finished.') };
  const payout = bountyPayout(c, b);
  if (payout.item && !addItemToInventory(c, payout.item)) return { ok: false, reason: tr('Make room in your pack first.') };
  c.gold += payout.gold;
  t.bounties.splice(i, 1);
  t.claimed++;
  t.reposts = 0;
  t.bounties = t.bounties.filter((x) => x.state !== 'open');
  fillBoard(c);
  return { ok: true, payout };
}

// ---------------------------------------------------------------------------
// Fusing: three of a stone make one of the next
// ---------------------------------------------------------------------------

export interface FuseRecipe {
  /** The base id given up, three at a time. */
  from: string;
  /** The base id made. */
  to: string;
  count: number;
  /** Gold per fusion. */
  gold: number;
  kind: 'gem' | 'rune';
}

/**
 * What three of a gem or rune become: a gem of the next quality in its
 * family, or the next rune on the ladder. Null for anything else and for the
 * top of either ladder.
 */
export function fuseRecipe(baseId: string): FuseRecipe | null {
  const gem = gemUpgradeRecipe(baseId);
  const rune = gem ? null : runeUpgradeRecipe(baseId);
  const r = gem ?? rune;
  if (!r) return null;
  const value = getSocketable(baseId)?.value ?? 50;
  return { from: r.from, to: r.to, count: r.count, gold: Math.max(1, Math.round(value * (gem ? 0.4 : 0.3))), kind: gem ? 'gem' : 'rune' };
}

/** Every stone in the pack that has a next step, with how many are carried. */
export function fusableInPack(c: Character): Array<{ recipe: FuseRecipe; have: number }> {
  const seen = new Set<string>();
  const out: Array<{ recipe: FuseRecipe; have: number }> = [];
  for (const it of c.inventory) {
    if (!it || seen.has(it.baseId)) continue;
    seen.add(it.baseId);
    const recipe = fuseRecipe(it.baseId);
    if (recipe) out.push({ recipe, have: countInInventory(c, it.baseId) });
  }
  return out;
}

/**
 * Fuses up to `times` sets of three. Each set costs its gold; the run stops
 * at the first set that cannot be paid for or has nowhere to go. The pack is
 * put back exactly as it was if the result will not fit, so a full pack
 * never eats three stones.
 */
export function fuseStones(
  c: Character,
  baseId: string,
  times: number,
  pay: (cost: CraftCost) => { ok: boolean; reason?: string },
): { ok: boolean; reason?: string; made: number; to?: string } {
  const recipe = fuseRecipe(baseId);
  if (!recipe) return { ok: false, reason: tr('That cannot be fused any higher.'), made: 0 };
  let made = 0;
  let reason: string | undefined;
  for (let n = 0; n < Math.max(1, times); n++) {
    if (countInInventory(c, baseId) < recipe.count) {
      reason = made ? undefined : tr('You need {0} of them.', recipe.count);
      break;
    }
    const slots = c.inventory;
    const before = slots.slice();
    const counts = before.map((s) => (s ? stackCount(s) : 0));
    consumeFromInventory(c, baseId, recipe.count);
    const rng = rollRng(c, 'fuse');
    const out = createItem(recipe.to, 1, rng, 'normal');
    out.value = getSocketable(recipe.to)?.value ?? out.value;
    setStackCount(out, 1);
    if (!addItemToInventory(c, out)) {
      for (let i = 0; i < before.length; i++) {
        slots[i] = before[i] ?? null;
        const it = before[i];
        if (it) setStackCount(it, counts[i]!);
      }
      reason = tr('Make room in your pack first.');
      break;
    }
    const paid = pay({ gold: recipe.gold, materials: {} });
    if (!paid.ok) {
      // Unpaid: undo the fusion as well.
      for (let i = 0; i < before.length; i++) {
        slots[i] = before[i] ?? null;
        const it = before[i];
        if (it) setStackCount(it, counts[i]!);
      }
      reason = paid.reason ?? tr('Not enough gold.');
      break;
    }
    made++;
  }
  return { ok: made > 0, reason, made, to: recipe.to };
}

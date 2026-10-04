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
 *     finish them below, claim gold, Renown and an item here.
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
import { ITEM_BASES, getBase, rerollOneMod, rollItem, vendorPrice } from './Loot';
import { rollPowerAffix } from './ItemPowers';
import { addItemToInventory, inventoryIsFull } from './Inventory';
import { legacyPriceMultiplier } from './Legacy';
import type { CraftCost } from './Crafting';

export const TOWN_STATE_VERSION = 1;
/** How many bounties the board shows at once, and how many you may hold. */
export const BOARD_SIZE = 3;
export const MAX_ACTIVE_BOUNTIES = 2;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function freshTown(): TownState {
  return { v: TOWN_STATE_VERSION, rolls: 0, bounties: [], claimed: 0 };
}

const KINDS: readonly BountyKind[] = ['slay', 'elites', 'boss', 'clear', 'events'];
const STATES = ['open', 'active', 'done'] as const;
const RARITIES: readonly ItemRarity[] = ['normal', 'magic', 'rare', 'set', 'unique', 'mythic', 'ancient'];

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
  };
  if (fixed.rolls !== t.rolls || fixed.claimed !== t.claimed || t.v !== TOWN_STATE_VERSION) changed = true;
  const list = Array.isArray(t.bounties) ? t.bounties : [];
  if (!Array.isArray(t.bounties)) changed = true;
  for (const b of list as Array<Partial<Bounty>>) {
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !KINDS.includes(b.kind as BountyKind)) {
      changed = true;
      continue;
    }
    const r = (b.reward ?? {}) as Partial<Bounty['reward']>;
    const fb: Bounty = {
      id: b.id,
      kind: b.kind as BountyKind,
      minDepth: Math.max(1, Math.floor(num(b.minDepth, 1, 1))),
      target: Math.max(1, Math.floor(num(b.target, 1, 1))),
      progress: Math.floor(num(b.progress, 0)),
      state: STATES.includes(b.state as Bounty['state']) ? (b.state as Bounty['state']) : 'open',
      reward: {
        gold: Math.floor(num(r.gold, 0)),
        renown: num(r.renown, 0),
        rarity: RARITIES.includes(r.rarity as ItemRarity) ? (r.rarity as ItemRarity) : 'rare',
      },
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
  { id: 'weapon', name: 'Weapon', categories: [], priceMul: 1.3 },
  { id: 'offhand', name: 'Off-hand', categories: OFFHAND_CATEGORIES, priceMul: 1.1 },
  { id: 'helm', name: 'Helm', categories: ['helm'], priceMul: 1.0 },
  { id: 'chest', name: 'Body Armour', categories: ['chest'], priceMul: 1.15 },
  { id: 'gloves', name: 'Gloves', categories: ['gloves'], priceMul: 0.9 },
  { id: 'boots', name: 'Boots', categories: ['boots'], priceMul: 0.9 },
  { id: 'belt', name: 'Belt', categories: ['belt'], priceMul: 0.85 },
  { id: 'ring', name: 'Ring', categories: ['ring'], priceMul: 1.4 },
  { id: 'amulet', name: 'Amulet', categories: ['amulet'], priceMul: 1.6 },
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
  if (!offer) return { ok: false, reason: 'Nothing like that for sale.' };
  const price = gamblePrice(c, offerId);
  if (c.gold < price) return { ok: false, reason: `Not enough gold (need ${price}).` };
  if (inventoryIsFull(c)) return { ok: false, reason: 'Your pack is full.' };
  const rng = rollRng(c, 'gamble');
  const item = rollGambleItem(c, offer, rng);
  if (!addItemToInventory(c, item)) return { ok: false, reason: 'Your pack is full.' };
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
  if (item.rarity !== 'magic' && item.rarity !== 'rare') return { ok: false, reason: 'Only magic and rare items take an enchantment.' };
  const base = getBase(item.baseId);
  if (base.slot === 'consumable' || base.slot === 'none') return { ok: false, reason: 'That cannot be enchanted.' };
  return { ok: true };
}

/** Indexes of the mods the Enchanter will reforge on this item right now. */
export function reforgeableMods(item: Item): number[] {
  if (!canEnchantItem(item).ok) return [];
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
 * Reforges one mod. `pay` takes the cost (the panel passes the crafting
 * bench's `spendCost`); it is called only once every rule has passed.
 */
export function reforgeMod(c: Character, item: Item, index: number, pay: (cost: CraftCost) => { ok: boolean; reason?: string }): ServiceResult {
  const can = canEnchantItem(item);
  if (!can.ok) return can;
  const mod = item.mods[index];
  if (!mod || (mod.kind !== 'prefix' && mod.kind !== 'suffix')) return { ok: false, reason: 'Only a prefix or suffix can be reforged.' };
  if (item.enchantedMod && item.enchantedMod !== mod.affixId) {
    return { ok: false, reason: 'Another property has already been reforged. Only that one may change.' };
  }
  const paid = pay(reforgeCost(item));
  if (!paid.ok) return paid;
  const rng = rollRng(c, 'reforge');
  const next = rerollOneMod(item, index, rng);
  if (!next) return { ok: false, reason: 'The enchantment would not take.' };
  item.enchantedMod = next.affixId;
  item.enchants = (item.enchants ?? 0) + 1;
  return { ok: true, item };
}

/** A rare with no power of its own may be given one. */
export function canImbue(item: Item): { ok: boolean; reason?: string } {
  if (item.rarity !== 'rare') return { ok: false, reason: 'Only a rare item can be imbued.' };
  if (item.powers && item.powers.length > 0) return { ok: false, reason: 'It already carries a power.' };
  const base = getBase(item.baseId);
  if (base.slot === 'consumable' || base.slot === 'none') return { ok: false, reason: 'That cannot be imbued.' };
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
  if (!roll) return { ok: false, reason: 'Nothing will take hold in this kind of item.' };
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
    text: (b) => `Slay ${b.target} monsters at depth ${b.minDepth} or deeper`,
  },
  {
    kind: 'elites',
    weight: 8,
    target: (d, rng) => Math.round((6 + d * 0.25) * rng.range(0.9, 1.2)),
    worth: 1.2,
    text: (b) => `Slay ${b.target} champions or elites at depth ${b.minDepth} or deeper`,
  },
  {
    kind: 'boss',
    weight: 6,
    target: () => 1,
    worth: 1.3,
    text: (b) => `Slay the master of a descent at depth ${b.minDepth} or deeper`,
  },
  {
    kind: 'clear',
    weight: 5,
    target: () => 1,
    worth: 1.4,
    text: (b) => `Clear a descent at depth ${b.minDepth} or deeper`,
  },
  {
    kind: 'events',
    weight: 6,
    target: (d) => (d >= 20 ? 3 : 2),
    worth: 1.1,
    text: (b) =>
      `Survive ${b.target} dungeon events (cursed chests, ambushes, bargains, runners) at depth ${b.minDepth} or deeper`,
  },
];

export function bountyText(b: Bounty): string {
  return BOUNTY_KINDS.find((k) => k.kind === b.kind)?.text(b) ?? 'A bounty';
}

/** One new bounty for the board, aimed a little past where the character has been. */
export function makeBounty(c: Character, rng: Random): Bounty {
  const next = Math.max(1, c.depthRecord + 1);
  const stretch = rng.int(0, 2);
  const minDepth = next + stretch;
  const def = rng.weighted(BOUNTY_KINDS, (k) => k.weight);
  const t = townOf(c);
  const mul = def.worth * (1 + stretch * 0.2);
  const rarity: ItemRarity = rng.chance(0.08) ? 'unique' : rng.chance(0.14) ? 'set' : 'rare';
  return {
    id: `b${t.rolls}-${def.kind}`,
    kind: def.kind,
    minDepth,
    target: Math.max(1, def.target(minDepth, rng)),
    progress: 0,
    state: 'open',
    reward: {
      gold: Math.round((250 + minDepth * 110) * mul),
      renown: Math.round((5 + minDepth * 1.2) * mul * 10) / 10,
      rarity,
    },
  };
}

/** Fills the board's open slots. Taken and finished bounties keep their place. */
export function refreshBoard(c: Character): TownState {
  const t = townOf(c);
  const open = () => t.bounties.filter((b) => b.state === 'open').length;
  let guard = 0;
  while (open() < BOARD_SIZE && guard++ < 10) {
    const rng = rollRng(c, 'bounty');
    t.bounties.push(makeBounty(c, rng));
  }
  return t;
}

export function acceptBounty(c: Character, id: string): { ok: boolean; reason?: string } {
  const t = townOf(c);
  const b = t.bounties.find((x) => x.id === id);
  if (!b || b.state !== 'open') return { ok: false, reason: 'That bounty is not on the board.' };
  if (t.bounties.filter((x) => x.state === 'active' || x.state === 'done').length >= MAX_ACTIVE_BOUNTIES) {
    return { ok: false, reason: `You can hold ${MAX_ACTIVE_BOUNTIES} bounties at once.` };
  }
  b.state = 'active';
  refreshBoard(c);
  return { ok: true };
}

export function abandonBounty(c: Character, id: string): boolean {
  const t = townOf(c);
  const i = t.bounties.findIndex((x) => x.id === id && x.state === 'active');
  if (i < 0) return false;
  t.bounties.splice(i, 1);
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
 * Pays a finished bounty: gold now, the item into the pack (or the payout
 * fails if the pack is full), and the Renown for the caller to grant.
 */
export function claimBounty(c: Character, id: string): { ok: boolean; reason?: string; payout?: BountyPayout } {
  const t = townOf(c);
  const i = t.bounties.findIndex((x) => x.id === id);
  const b = t.bounties[i];
  if (!b || b.state !== 'done') return { ok: false, reason: 'That bounty is not finished.' };
  const rng = rollRng(c, 'claim');
  const item = rollItem(b.minDepth + 6, rng, { forceRarity: b.reward.rarity, classId: c.classId });
  if (!addItemToInventory(c, item)) return { ok: false, reason: 'Make room in your pack first.' };
  c.gold += b.reward.gold;
  t.bounties.splice(i, 1);
  t.claimed++;
  refreshBoard(c);
  return { ok: true, payout: { gold: b.reward.gold, renown: b.reward.renown, item } };
}

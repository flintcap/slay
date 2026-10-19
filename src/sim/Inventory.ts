/**
 * SLAY — inventory, stash and gold.
 *
 * Two containers with different lifetimes:
 *
 * - The **inventory** belongs to a character. When that character dies it is
 *   gone, along with everything worn.
 * - The **stash** belongs to the account. It survives death, it is shared
 *   between characters, and it is the only reason starting a new character at
 *   level 1 is not starting from nothing. Same for bank gold.
 *
 * That asymmetry is the whole risk/reward loop of the game: everything you are
 * carrying is at risk until you walk it back to town and bank it.
 *
 * Stacking: `Item` has no count field in the shared types, so stackable
 * categories (potions, materials, gems, runes) carry an additive `count`
 * property attached here. It serialises through JSON with the rest of the item
 * and `stackCount` treats a missing value as 1, so older saves keep working.
 */

import type { Character, Item, ItemCategory } from '../types';
import { INVENTORY_SIZE, STASH_TAB_SIZE, save } from '../core/Save';
import { getBase, itemDisplayName, rarityRank, vendorPrice } from './Loot';
import { isStackableCategory } from '../data/itemBases';
import { getMaterial } from '../data/materials';
import { GEMS, RUNES, getGem } from '../data/gems';
import {
  areaAt,
  areasOf,
  findFit,
  firstFreeCell,
  freeCells,
  itemSize,
  occupancy,
  overlaps,
  packInto,
  tabArea,
  type Area,
} from './Grid';

export { INVENTORY_SIZE, STASH_TAB_SIZE };

/** An `Item` carrying a stack count. Non-stackables simply never set it. */
export interface StackedItem extends Item {
  count?: number;
}

// ---------------------------------------------------------------------------
// Stacking
// ---------------------------------------------------------------------------

export function stackCount(item: Item): number {
  const n = (item as StackedItem).count;
  return n === undefined || n < 1 ? 1 : Math.floor(n);
}

export function setStackCount(item: Item, n: number): void {
  (item as StackedItem).count = Math.max(1, Math.floor(n));
}

/** Maximum stack size for an item, by category. */
export function maxStack(item: Item): number {
  const base = getBase(item.baseId);
  switch (base.category) {
    case 'potion':
      return 20;
    case 'material': {
      const mat = getMaterial(base.id);
      return mat ? mat.stackMax : 999;
    }
    case 'gem':
    case 'rune':
      return 50;
    default:
      return 1;
  }
}

export function isStackableItem(item: Item): boolean {
  return isStackableCategory(getBase(item.baseId).category);
}

/** Two items merge only if they are the same base and neither is modified. */
export function canStack(a: Item, b: Item): boolean {
  if (a.uid === b.uid) return false;
  if (a.baseId !== b.baseId) return false;
  if (!isStackableItem(a)) return false;
  if (a.rarity !== b.rarity) return false;
  if (a.mods.length > 0 || b.mods.length > 0) return false;
  if (a.sockets.length > 0 || b.sockets.length > 0) return false;
  return true;
}

/**
 * Pours `from` into `to` up to the stack cap. Returns how many units moved and
 * how many are left behind in `from`.
 */
function pour(to: Item, from: Item): { moved: number; remaining: number } {
  const cap = maxStack(to);
  const space = cap - stackCount(to);
  if (space <= 0) return { moved: 0, remaining: stackCount(from) };
  const moved = Math.min(space, stackCount(from));
  setStackCount(to, stackCount(to) + moved);
  const remaining = stackCount(from) - moved;
  setStackCount(from, Math.max(1, remaining));
  return { moved, remaining };
}

// ---------------------------------------------------------------------------
// Generic container helpers — used by both inventory and stash.
// ---------------------------------------------------------------------------

export type Slots = Array<Item | null>;

/**
 * Where an item would go: the first place its whole block fits. Without an
 * item, the first cell nothing covers.
 */
export function firstFreeSlot(slots: Slots, item?: Item): number {
  return item ? findFit(slots, item) : firstFreeCell(slots);
}

/** Cells nothing covers. */
export function freeSlotCount(slots: Slots): number {
  return freeCells(slots);
}

export function findSlotOf(slots: Slots, uid: string): number {
  for (let i = 0; i < slots.length; i++) if (slots[i]?.uid === uid) return i;
  return -1;
}

/** True if there is room for the item, counting partial stacks as room. */
export function hasRoomFor(slots: Slots, item: Item): boolean {
  if (findFit(slots, item) >= 0) return true;
  if (!isStackableItem(item)) return false;
  const cap = maxStack(item);
  for (const s of slots) {
    if (s && canStack(s, item) && stackCount(s) < cap) return true;
  }
  return false;
}

/**
 * Adds an item to a container, merging into existing stacks first. Returns
 * false only when nothing at all could be placed.
 */
export function addToSlots(slots: Slots, item: Item): boolean {
  if (isStackableItem(item)) {
    let left = stackCount(item);
    for (let i = 0; i < slots.length && left > 0; i++) {
      const s = slots[i];
      if (!s || !canStack(s, item)) continue;
      const result = pour(s, item);
      left = result.remaining;
      if (result.moved > 0 && left <= 0) return true;
    }
    if (left <= 0) return true;
    setStackCount(item, left);
  }
  const free = findFit(slots, item);
  if (free < 0) return false;
  slots[free] = item;
  return true;
}

export function removeFromSlots(slots: Slots, uid: string): Item | null {
  const i = findSlotOf(slots, uid);
  if (i < 0) return null;
  const item = slots[i];
  slots[i] = null;
  return item;
}

/**
 * Puts the item anchored at `fromIndex` down with its top-left corner on
 * `toIndex`, in the same container or another one.
 *
 * Onto empty cells it just moves. Onto exactly one item it pours a matching
 * stack, or trades places: the item it lands on goes back where the moved one
 * came from, or failing that to the first place it fits. Across two or more
 * items, or off the edge of the grid, nothing happens and it returns false.
 */
export function moveBetween(from: Slots, fromIndex: number, to: Slots, toIndex: number): boolean {
  if (fromIndex < 0 || fromIndex >= from.length) return false;
  if (toIndex < 0 || toIndex >= to.length) return false;
  const moving = from[fromIndex];
  if (!moving) return false;
  if (from === to && fromIndex === toIndex) return true;

  const area = areaAt(to, toIndex);
  const hit = overlaps(area, occupancy(to, area, from === to ? fromIndex : -1), toIndex, itemSize(moving));
  if (!hit || hit.length > 1) return false;

  if (hit.length === 0) {
    from[fromIndex] = null;
    to[toIndex] = moving;
    return true;
  }

  const otherAt = hit[0]!;
  const other = to[otherAt]!;
  if (canStack(other, moving)) {
    const result = pour(other, moving);
    if (result.moved > 0) {
      if (result.remaining <= 0) from[fromIndex] = null;
      return true;
    }
  }

  // Trade places. Lift both, set the moved one down, then find the other a home.
  from[fromIndex] = null;
  to[otherAt] = null;
  to[toIndex] = moving;
  const homeArea = areaAt(from, fromIndex);
  let home = -1;
  const back = overlaps(homeArea, occupancy(from, homeArea), fromIndex, itemSize(other));
  if (back && back.length === 0) home = fromIndex;
  if (home < 0) home = findFit(from, other, homeArea);
  if (home >= 0) {
    from[home] = other;
    return true;
  }
  if (from !== to) {
    const there = findFit(to, other, area);
    if (there >= 0) {
      to[there] = other;
      return true;
    }
  }
  // No room for it anywhere: put everything back as it was.
  to[toIndex] = null;
  to[otherAt] = other;
  from[fromIndex] = moving;
  return false;
}

/**
 * Takes `n` units off the stack at `index` into a new stack in the first
 * free slot of [start, end) (the whole container by default). The new stack
 * is a copy of the old one with its own uid. False if there is no room or
 * `n` would empty the stack.
 */
export function splitStack(slots: Slots, index: number, n: number, start = 0, end = slots.length): boolean {
  const item = slots[index];
  if (!item || !isStackableItem(item)) return false;
  const held = stackCount(item);
  n = Math.floor(n);
  if (n < 1 || n >= held) return false;
  // Stacks take one cell, so any cell nothing covers will do.
  const free = firstFreeCell(slots, Math.max(0, start), Math.min(end, slots.length));
  if (free < 0) return false;
  const part = JSON.parse(JSON.stringify(item)) as StackedItem;
  part.uid = freshUid(item.uid);
  setStackCount(part, n);
  setStackCount(item, held - n);
  slots[free] = part;
  return true;
}

/** A uid not used by anything carried or stashed, derived from `from`. */
function freshUid(from: string): string {
  const used = new Set<string>();
  for (const s of save.account.stash) if (s) used.add(s.uid);
  for (const s of save.account.current?.inventory ?? []) if (s) used.add(s.uid);
  let k = 1;
  while (used.has(`${from}~${k}`)) k++;
  return `${from}~${k}`;
}

export function swapSlots(slots: Slots, a: number, b: number): boolean {
  return moveBetween(slots, a, slots, b);
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: ItemCategory[] = [
  'sword',
  'axe',
  'mace',
  'dagger',
  'spear',
  'bow',
  'crossbow',
  'wand',
  'staff',
  'scepter',
  'shield',
  'orb',
  'quiver',
  'helm',
  'chest',
  'gloves',
  'pants',
  'boots',
  'belt',
  'amulet',
  'ring',
  'charm',
  'trinket',
  'gem',
  'rune',
  'potion',
  'material',
];

/** Gem families in the order the gem list gives them, so rubies sit by rubies. */
const GEM_FAMILY_ORDER = [...new Set(GEMS.map((g) => g.family))];
const RUNE_ORDER = new Map(RUNES.map((r, i) => [r.id, i]));
/** Set pieces sort as one block after the rest of the gear, set by set. */
const SET_BLOCK = CATEGORY_ORDER.indexOf('charm') - 0.5;

/**
 * Where an item goes in a sorted grid: like with like. Gear by kind, then
 * rarity, then base, so the same base of the same rarity sits together; set
 * pieces in one block, a set at a time; gems by family and then quality;
 * runes in rune order; potions and materials by kind.
 */
function sortKey(item: Item): Array<number | string> {
  const base = getBase(item.baseId);
  const c = CATEGORY_ORDER.indexOf(base.category);
  const cat = c < 0 ? 99 : c;
  if (item.rarity === 'set' && item.setId) return [SET_BLOCK, item.setId, cat, itemDisplayName(item)];
  if (base.category === 'gem') {
    const g = getGem(item.baseId);
    return g ? [cat, GEM_FAMILY_ORDER.indexOf(g.family), -g.qualityIndex, itemDisplayName(item)] : [cat, 99, 0, itemDisplayName(item)];
  }
  if (base.category === 'rune') return [cat, RUNE_ORDER.get(item.baseId) ?? 999, 0, itemDisplayName(item)];
  if (base.category === 'potion' || base.category === 'material') return [cat, item.baseId, -base.levelReq, itemDisplayName(item)];
  return [cat, -rarityRank(item.rarity), -base.levelReq, item.baseId, item.uniqueId ?? '', -(item.ilvl ?? 0), itemDisplayName(item)];
}

function compareItems(a: Item, b: Item): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const x = ka[i] ?? '';
    const y = kb[i] ?? '';
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

/**
 * Merges every stack it can, then packs each grid again in order of
 * category, rarity and level. Mutates in place and returns the same array.
 */
export function sortSlots(slots: Slots): Slots {
  for (const area of areasOf(slots)) sortArea(slots, area);
  return slots;
}

/** Biggest first: what a tidy pack needs when the plain order leaves gaps. */
function byBulk(a: Item, b: Item): number {
  const sa = itemSize(a);
  const sb = itemSize(b);
  return sb.w * sb.h - sa.w * sa.h || sb.h - sa.h || compareItems(a, b);
}

/** Sorts one grid. If the sorted order will not pack, nothing moves. */
export function sortArea(slots: Slots, area: Area): void {
  const end = Math.min(slots.length, area.start + area.cols * area.rows);
  const before = slots.slice(area.start, end);
  const items: Item[] = [];
  for (const s of before) if (s) items.push(s);

  // Merge stacks first so sorting does not leave five half-stacks of dust.
  const merged: Item[] = [];
  for (const item of items) {
    if (isStackableItem(item)) {
      const target = merged.find((m) => canStack(m, item) && stackCount(m) < maxStack(m));
      if (target) {
        const result = pour(target, item);
        if (result.remaining <= 0 && result.moved > 0) continue;
      }
    }
    merged.push(item);
  }

  // In order first; if that leaves something out, biggest first; if even that
  // fails, the grid goes back exactly as it was.
  merged.sort(compareItems);
  if (packInto(slots, area, merged).length === 0) return;
  merged.sort(byBulk);
  if (packInto(slots, area, merged).length === 0) return;
  for (let i = 0; i < before.length; i++) slots[area.start + i] = before[i] ?? null;
}

/** Merges partial stacks without reordering anything. */
export function mergeStacks(slots: Slots): number {
  let mergedCount = 0;
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    if (!a || !isStackableItem(a)) continue;
    for (let j = i + 1; j < slots.length; j++) {
      const b = slots[j];
      if (!b || !canStack(a, b)) continue;
      const result = pour(a, b);
      if (result.moved > 0) mergedCount += result.moved;
      if (result.remaining <= 0) slots[j] = null;
      if (stackCount(a) >= maxStack(a)) break;
    }
  }
  return mergedCount;
}

// ---------------------------------------------------------------------------
// Character inventory
// ---------------------------------------------------------------------------

function ensureInventory(c: Character): Slots {
  if (!Array.isArray(c.inventory)) c.inventory = new Array<Item | null>(INVENTORY_SIZE).fill(null);
  if (c.inventory.length < INVENTORY_SIZE) {
    while (c.inventory.length < INVENTORY_SIZE) c.inventory.push(null);
  }
  return c.inventory;
}

/**
 * Picks an item up. This is the name the dungeon scene and the debug helpers
 * import, so it stays stable.
 */
export function addItemToInventory(character: Character, item: Item): boolean {
  const slots = ensureInventory(character);
  const ok = addToSlots(slots, item);
  if (ok) item.seen = false;
  return ok;
}

export function removeItemFromInventory(character: Character, uid: string): Item | null {
  return removeFromSlots(ensureInventory(character), uid);
}

export function inventoryFreeSlots(character: Character): number {
  return freeSlotCount(ensureInventory(character));
}

export function inventoryIsFull(character: Character): boolean {
  return freeCells(ensureInventory(character)) === 0;
}

export function findInInventory(character: Character, uid: string): Item | null {
  const i = findSlotOf(ensureInventory(character), uid);
  return i < 0 ? null : character.inventory[i] ?? null;
}

export function moveInventoryItem(character: Character, from: number, to: number): boolean {
  return moveBetween(ensureInventory(character), from, character.inventory, to);
}

export function sortInventory(character: Character): void {
  sortSlots(ensureInventory(character));
}

/** Everything the character is carrying, compacted. */
export function inventoryItems(character: Character): Item[] {
  const out: Item[] = [];
  for (const s of ensureInventory(character)) if (s) out.push(s);
  return out;
}

/** Counts units of a base id across the inventory, respecting stacks. */
export function countInInventory(character: Character, baseId: string): number {
  let n = 0;
  for (const s of ensureInventory(character)) if (s && s.baseId === baseId) n += stackCount(s);
  return n;
}

/** Consumes `n` units of a base id (potions, gems). Returns false if short. */
export function consumeFromInventory(character: Character, baseId: string, n = 1): boolean {
  if (countInInventory(character, baseId) < n) return false;
  const slots = ensureInventory(character);
  let left = n;
  for (let i = 0; i < slots.length && left > 0; i++) {
    const s = slots[i];
    if (!s || s.baseId !== baseId) continue;
    const have = stackCount(s);
    if (have <= left) {
      left -= have;
      slots[i] = null;
    } else {
      setStackCount(s, have - left);
      left = 0;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Stash
// ---------------------------------------------------------------------------

export function stashSlots(): Slots {
  return save.account.stash;
}

export function stashTabCount(): number {
  return save.account.stashTabs;
}

/** The slice of the stash belonging to one tab, as [start, end). */
export function stashTabRange(tab: number): { start: number; end: number } {
  const start = Math.max(0, tab) * STASH_TAB_SIZE;
  return { start, end: start + STASH_TAB_SIZE };
}

export function stashFreeSlots(): number {
  return freeSlotCount(stashSlots());
}

export function addToStash(item: Item): boolean {
  const ok = addToSlots(stashSlots(), item);
  if (ok) save.touch();
  return ok;
}

export function removeFromStash(uid: string): Item | null {
  const item = removeFromSlots(stashSlots(), uid);
  if (item) save.touch();
  return item;
}

/** Inventory -> stash. Fails (and changes nothing) when the stash is full. */
export function depositItem(character: Character, uid: string): boolean {
  const slots = ensureInventory(character);
  const index = findSlotOf(slots, uid);
  if (index < 0) return false;
  const item = slots[index];
  if (!item) return false;
  if (!hasRoomFor(stashSlots(), item)) return false;
  slots[index] = null;
  if (!addToStash(item)) {
    slots[index] = item;
    return false;
  }
  return true;
}

/** Stash -> inventory. */
export function withdrawItem(character: Character, uid: string): boolean {
  const stash = stashSlots();
  const index = findSlotOf(stash, uid);
  if (index < 0) return false;
  const item = stash[index];
  if (!item) return false;
  const slots = ensureInventory(character);
  if (!hasRoomFor(slots, item)) return false;
  stash[index] = null;
  if (!addToSlots(slots, item)) {
    stash[index] = item;
    return false;
  }
  save.touch();
  return true;
}

/** Drag-and-drop across the two containers by index. */
export function moveInventoryToStash(character: Character, invIndex: number, stashIndex: number): boolean {
  const ok = moveBetween(ensureInventory(character), invIndex, stashSlots(), stashIndex);
  if (ok) save.touch();
  return ok;
}

export function moveStashToInventory(character: Character, stashIndex: number, invIndex: number): boolean {
  const ok = moveBetween(stashSlots(), stashIndex, ensureInventory(character), invIndex);
  if (ok) save.touch();
  return ok;
}

export function sortStash(): void {
  // Sort each tab independently so nothing jumps between tabs unexpectedly.
  for (let tab = 0; tab < stashTabCount(); tab++) sortArea(stashSlots(), tabArea(tab));
  save.touch();
}

/** Sorts one vault tab. */
export function sortStashTab(tab: number): void {
  sortArea(stashSlots(), tabArea(tab));
  save.touch();
}

/** Moves everything carryable from the inventory into the stash. */
export function depositAll(character: Character): number {
  const slots = ensureInventory(character);
  let moved = 0;
  for (let i = 0; i < slots.length; i++) {
    const item = slots[i];
    if (!item) continue;
    if (!hasRoomFor(stashSlots(), item)) break;
    slots[i] = null;
    if (addToStash(item)) moved++;
    else slots[i] = item;
  }
  return moved;
}

// ---------------------------------------------------------------------------
// Gold
// ---------------------------------------------------------------------------

export const GOLD_CAP = 999_999_999;

export function addGold(character: Character, amount: number): number {
  const next = Math.min(GOLD_CAP, Math.max(0, Math.round(character.gold + amount)));
  const gained = next - character.gold;
  character.gold = next;
  return gained;
}

export function spendGold(character: Character, amount: number): boolean {
  const cost = Math.max(0, Math.round(amount));
  if (character.gold < cost) return false;
  character.gold -= cost;
  return true;
}

export function bankGold(): number {
  return save.account.bankGold;
}

/** Character -> account vault. Bank gold survives death. */
export function depositGold(character: Character, amount: number): number {
  const moved = Math.min(character.gold, Math.max(0, Math.round(amount)));
  if (moved <= 0) return 0;
  character.gold -= moved;
  save.account.bankGold = Math.min(GOLD_CAP, save.account.bankGold + moved);
  save.touch();
  return moved;
}

export function withdrawGold(character: Character, amount: number): number {
  const moved = Math.min(save.account.bankGold, Math.max(0, Math.round(amount)));
  if (moved <= 0) return 0;
  save.account.bankGold -= moved;
  addGold(character, moved);
  save.touch();
  return moved;
}

// ---------------------------------------------------------------------------
// Materials (account-level, same lifetime as the stash)
// ---------------------------------------------------------------------------

export function materialCount(id: string): number {
  return save.materialCount(id);
}

export function addMaterials(materials: Record<string, number>): void {
  for (const id of Object.keys(materials)) {
    const n = materials[id];
    if (n) save.addMaterial(id, n);
  }
}

export function hasMaterials(cost: Record<string, number>): boolean {
  for (const id of Object.keys(cost)) {
    if (save.materialCount(id) < (cost[id] ?? 0)) return false;
  }
  return true;
}

export function spendMaterials(cost: Record<string, number>): boolean {
  if (!hasMaterials(cost)) return false;
  for (const id of Object.keys(cost)) {
    const n = cost[id];
    if (n) save.addMaterial(id, -n);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Selling
// ---------------------------------------------------------------------------

/** Sells one item out of the inventory and credits the gold. */
export function sellItem(character: Character, uid: string): number {
  const item = removeItemFromInventory(character, uid);
  if (!item) return 0;
  const price = vendorPrice(item, false) * stackCount(item);
  addGold(character, price);
  return price;
}

/** Total sale value of the whole inventory — used by the "sell junk" button. */
export function inventoryValue(character: Character): number {
  let total = 0;
  for (const item of inventoryItems(character)) total += vendorPrice(item, false) * stackCount(item);
  return total;
}

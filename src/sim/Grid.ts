/**
 * SLAY — the item grid.
 *
 * The pack and every vault tab are grids of cells, and an item covers a
 * block of them: a ring one cell, a dagger one by two, a breastplate two by
 * three, a greatsword two by four. Fitting a big find in means moving other
 * things out of its way, which is the whole point.
 *
 * The containers stay flat arrays of cells. An item is stored once, at its
 * top-left cell (its anchor), and every other cell it covers stays `null`, so
 * anything that just walks the array and skips the gaps still sees each item
 * exactly once. Which cells are taken is worked out from the item sizes.
 *
 * The pack is one grid. The vault is one grid per tab, side by side in the
 * same array, and an item never straddles two tabs.
 */
import type { Item, ItemBase } from '../types';
import { findBase } from '../data/itemBases';

export const INV_COLS = 10;
export const INV_ROWS = 6;
export const STASH_COLS = 12;
export const STASH_ROWS = 10;
const TAB_CELLS = STASH_COLS * STASH_ROWS;

export type Slots = Array<Item | null>;

/** A width and height in cells. */
export interface Size {
  w: number;
  h: number;
}

/** One rectangular grid inside a slots array, starting at `start`. */
export interface Area {
  start: number;
  cols: number;
  rows: number;
}

// ---------------------------------------------------------------------------
// Item sizes
// ---------------------------------------------------------------------------

const ONE: Size = { w: 1, h: 1 };

/** How many cells an item of this base covers. */
export function sizeOfBase(base: ItemBase | undefined): Size {
  if (!base) return ONE;
  const two = base.slot === 'twoHand';
  const shape = base.visual?.shape ?? '';
  switch (base.category) {
    case 'ring':
    case 'amulet':
    case 'gem':
    case 'rune':
    case 'potion':
    case 'material':
      return ONE;
    case 'charm':
      if (base.id === 'charm.small') return ONE;
      if (base.id === 'charm.large') return { w: 1, h: 2 };
      return { w: 1, h: 3 };
    case 'dagger':
    case 'wand':
      return { w: 1, h: 2 };
    case 'scepter':
      return { w: 1, h: 3 };
    case 'sword':
      return two ? { w: 2, h: 4 } : { w: 1, h: 3 };
    case 'axe':
    case 'mace':
      return two ? { w: 2, h: 4 } : { w: 2, h: 3 };
    case 'spear':
      return { w: 2, h: 4 };
    case 'staff':
      return { w: 1, h: 4 };
    case 'bow':
    case 'crossbow':
    case 'quiver':
      return { w: 2, h: 3 };
    case 'shield':
      return shape.includes('kite') || shape.includes('tower') ? { w: 2, h: 3 } : { w: 2, h: 2 };
    case 'orb':
    case 'helm':
    case 'gloves':
    case 'boots':
      return { w: 2, h: 2 };
    case 'belt':
      return { w: 2, h: 1 };
    case 'chest':
      return { w: 2, h: 3 };
    default:
      return ONE;
  }
}

const sizeCache = new Map<string, Size>();

/** How many cells an item covers. Unknown bases take one cell. */
export function itemSize(item: Item): Size {
  let s = sizeCache.get(item.baseId);
  if (!s) {
    s = sizeOfBase(findBase(item.baseId));
    sizeCache.set(item.baseId, s);
  }
  return s;
}

/** The icon shape for an item in the grid, or undefined when it is square. */
export function iconShape(item: Item): Size | undefined {
  const s = itemSize(item);
  return s.w === s.h ? undefined : s;
}

// ---------------------------------------------------------------------------
// Areas
// ---------------------------------------------------------------------------

/** True for the vault: whole tabs of cells. The pack is never a tab multiple. */
export function isTabbed(slots: Slots): boolean {
  return slots.length >= TAB_CELLS && slots.length % TAB_CELLS === 0 && slots.length !== INV_COLS * INV_ROWS;
}

/** Every grid in a slots array, in fill order. */
export function areasOf(slots: Slots): Area[] {
  if (isTabbed(slots)) {
    const out: Area[] = [];
    for (let s = 0; s < slots.length; s += TAB_CELLS) out.push({ start: s, cols: STASH_COLS, rows: STASH_ROWS });
    return out;
  }
  return [{ start: 0, cols: INV_COLS, rows: Math.max(1, Math.ceil(slots.length / INV_COLS)) }];
}

/** The grid that holds cell `index`. */
export function areaAt(slots: Slots, index: number): Area {
  if (isTabbed(slots)) {
    const start = Math.floor(Math.max(0, index) / TAB_CELLS) * TAB_CELLS;
    return { start, cols: STASH_COLS, rows: STASH_ROWS };
  }
  return areasOf(slots)[0]!;
}

/** The vault tab grid for tab `tab`. */
export function tabArea(tab: number): Area {
  return { start: Math.max(0, tab) * TAB_CELLS, cols: STASH_COLS, rows: STASH_ROWS };
}

function cells(a: Area): number {
  return a.cols * a.rows;
}

// ---------------------------------------------------------------------------
// Occupancy
// ---------------------------------------------------------------------------

/**
 * For each cell of an area, the index of the item covering it, or -1.
 * `skip` leaves one item out, for "would it fit if this one moved".
 * A damaged layout where two items overlap keeps the first.
 */
export function occupancy(slots: Slots, area: Area, skip = -1): Int32Array {
  const n = cells(area);
  const occ = new Int32Array(n).fill(-1);
  const end = Math.min(slots.length, area.start + n);
  for (let i = area.start; i < end; i++) {
    const it = slots[i];
    if (!it || i === skip) continue;
    const { w, h } = itemSize(it);
    const local = i - area.start;
    const c0 = local % area.cols;
    const r0 = Math.floor(local / area.cols);
    for (let dy = 0; dy < h && r0 + dy < area.rows; dy++) {
      for (let dx = 0; dx < w && c0 + dx < area.cols; dx++) {
        const k = (r0 + dy) * area.cols + c0 + dx;
        if (occ[k] < 0) occ[k] = i;
      }
    }
  }
  return occ;
}

/**
 * The items a `w` x `h` block at `index` would sit on, as slot indices.
 * Null when the block runs off the edge of its grid.
 */
export function overlaps(area: Area, occ: Int32Array, index: number, size: Size): number[] | null {
  const local = index - area.start;
  if (local < 0 || local >= cells(area)) return null;
  const c0 = local % area.cols;
  const r0 = Math.floor(local / area.cols);
  if (c0 + size.w > area.cols || r0 + size.h > area.rows) return null;
  const hit: number[] = [];
  for (let dy = 0; dy < size.h; dy++) {
    for (let dx = 0; dx < size.w; dx++) {
      const o = occ[(r0 + dy) * area.cols + c0 + dx]!;
      if (o >= 0 && !hit.includes(o)) hit.push(o);
    }
  }
  return hit;
}

/** True when `item` fits at `index` without touching anything but `skip`. */
export function fitsAt(slots: Slots, item: Item, index: number, skip = -1): boolean {
  const area = areaAt(slots, index);
  const hit = overlaps(area, occupancy(slots, area, skip), index, itemSize(item));
  return !!hit && hit.length === 0;
}

/** The slot index of the item covering cell `index` (itself if it is an anchor), or -1. */
export function coveringAt(slots: Slots, index: number): number {
  if (index < 0 || index >= slots.length) return -1;
  if (slots[index]) return index;
  const area = areaAt(slots, index);
  return occupancy(slots, area)[index - area.start] ?? -1;
}

/** First place an item fits, scanning down each column then across, or -1. */
export function findFitIn(area: Area, occ: Int32Array, size: Size): number {
  for (let c = 0; c + size.w <= area.cols; c++) {
    for (let r = 0; r + size.h <= area.rows; r++) {
      let free = true;
      for (let dy = 0; dy < size.h && free; dy++) {
        for (let dx = 0; dx < size.w; dx++) {
          if (occ[(r + dy) * area.cols + c + dx]! >= 0) {
            free = false;
            break;
          }
        }
      }
      if (free) return area.start + r * area.cols + c;
    }
  }
  return -1;
}

/** First place `item` fits in the container (or in one area of it), or -1. */
export function findFit(slots: Slots, item: Item, only?: Area): number {
  const size = itemSize(item);
  for (const area of only ? [only] : areasOf(slots)) {
    const at = findFitIn(area, occupancy(slots, area), size);
    if (at >= 0) return at;
  }
  return -1;
}

/** Cells not covered by anything. */
export function freeCells(slots: Slots, only?: Area): number {
  let n = 0;
  for (const area of only ? [only] : areasOf(slots)) {
    for (const o of occupancy(slots, area)) if (o < 0) n++;
  }
  return n;
}

/** First uncovered cell in [start, end), or -1. */
export function firstFreeCell(slots: Slots, start = 0, end = slots.length): number {
  for (const area of areasOf(slots)) {
    const occ = occupancy(slots, area);
    for (let k = 0; k < occ.length; k++) {
      const i = area.start + k;
      if (i >= start && i < end && i < slots.length && occ[k]! < 0) return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Packing and repair
// ---------------------------------------------------------------------------

/**
 * Lays `items` into an empty area in order, each at the first place it fits.
 * Returns the ones that did not fit; the area is left holding the rest.
 */
export function packInto(slots: Slots, area: Area, items: Item[]): Item[] {
  const end = Math.min(slots.length, area.start + cells(area));
  for (let i = area.start; i < end; i++) slots[i] = null;
  const occ = new Int32Array(cells(area)).fill(-1);
  const left: Item[] = [];
  for (const it of items) {
    const size = itemSize(it);
    const at = findFitIn(area, occ, size);
    if (at < 0) {
      left.push(it);
      continue;
    }
    slots[at] = it;
    const local = at - area.start;
    const c0 = local % area.cols;
    const r0 = Math.floor(local / area.cols);
    for (let dy = 0; dy < size.h; dy++) for (let dx = 0; dx < size.w; dx++) occ[(r0 + dy) * area.cols + c0 + dx] = at;
  }
  return left;
}

/**
 * Makes a container's layout legal: nothing overlapping, nothing hanging off
 * an edge. Items already in a legal spot stay put; the rest move to the first
 * place they fit. Returns whatever could not be fitted anywhere, already
 * removed from the container.
 */
export function repairLayout(slots: Slots): Item[] {
  const homeless: Item[] = [];
  for (const area of areasOf(slots)) {
    const occ = new Int32Array(cells(area)).fill(-1);
    const end = Math.min(slots.length, area.start + cells(area));
    const moved: Item[] = [];
    for (let i = area.start; i < end; i++) {
      const it = slots[i];
      if (!it) continue;
      const size = itemSize(it);
      const hit = overlaps(area, occ, i, size);
      if (!hit || hit.length > 0) {
        slots[i] = null;
        moved.push(it);
        continue;
      }
      const local = i - area.start;
      const c0 = local % area.cols;
      const r0 = Math.floor(local / area.cols);
      for (let dy = 0; dy < size.h; dy++) for (let dx = 0; dx < size.w; dx++) occ[(r0 + dy) * area.cols + c0 + dx] = i;
    }
    for (const it of moved) {
      const at = findFit(slots, it, area);
      if (at >= 0) slots[at] = it;
      else homeless.push(it);
    }
  }
  // A second pass across every area, for what its own area had no room for.
  const still: Item[] = [];
  for (const it of homeless) {
    const at = findFit(slots, it);
    if (at >= 0) slots[at] = it;
    else still.push(it);
  }
  return still;
}

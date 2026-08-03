/**
 * SLAY — the buy-back shelf.
 *
 * Selling is irreversible in this genre, and the one thing that stops it being
 * cruel is a shelf behind the counter holding what you just handed over. You
 * can have it back for exactly what you were paid, no markup, until you go
 * back down.
 *
 * Deliberately not persisted. It lives for one visit to camp: entering the
 * dungeon clears it, which keeps it a safety net for a misclick rather than a
 * second stash you never have to pay for.
 *
 * Shared by every merchant. Which counter you sold at does not matter — a
 * regretted sale is a regretted sale.
 */

import type { Item } from '../types';

interface Entry {
  item: Item;
  /** What the merchant paid, and therefore what it costs to undo. */
  price: number;
}

/** Oldest entries fall off first once the shelf is full. */
const CAPACITY = 24;

const shelf: Entry[] = [];

/** Puts a sold item on the shelf. */
export function recordSale(item: Item, price: number): void {
  shelf.push({ item, price });
  while (shelf.length > CAPACITY) shelf.shift();
}

/** Everything currently buyable back, newest first. */
export function buyBackList(): ReadonlyArray<Entry> {
  return [...shelf].reverse();
}

/** What a specific item costs to take back, or null if it is not on the shelf. */
export function buyBackPrice(uid: string): number | null {
  return shelf.find((e) => e.item.uid === uid)?.price ?? null;
}

/** Takes an item off the shelf. Returns it, or null if it was already gone. */
export function takeBack(uid: string): Item | null {
  const i = shelf.findIndex((e) => e.item.uid === uid);
  if (i < 0) return null;
  const [entry] = shelf.splice(i, 1);
  return entry?.item ?? null;
}

/** Wipes the shelf. Called on the way into the dungeon. */
export function clearBuyBack(): void {
  shelf.length = 0;
}

export function buyBackCount(): number {
  return shelf.length;
}

/**
 * SLAY — the pack, lent to the counter beside it.
 *
 * The vault, the shops and the forge stand on the left and the Equipment
 * panel on the right, so none of them carries a second copy of the pack any
 * more. While one is open it lends the Equipment bag a verb: a right-click
 * stores, sells or brings the item to the anvil, and the bag shows the
 * price or the pick on each item.
 */

import type { Item } from '../types';
import { events } from '../core/Events';
import { isSideOpen } from './Widgets';

export interface BagVerb {
  /** The line under the bag, e.g. "Right-click to sell". */
  hint: string;
  /** A right-click on a pack item. False hands it back to the bag's own use. */
  use(item: Item): boolean;
  /** A short tag stamped on each pack item, e.g. its sale price. */
  badge?(item: Item): string | null;
  /** Ringed in the bag, e.g. the item on the anvil. */
  marked?(item: Item): boolean;
}

let lent: { owner: string; verb: BagVerb } | null = null;

/** The verb the bag has on loan, if any. */
export function bagVerb(): BagVerb | null {
  return lent?.verb ?? null;
}

/** A counter panel opened: it lends its verb and brings the bag up beside it. */
export function lendBag(owner: string, verb: BagVerb): void {
  lent = { owner, verb };
  if (!isSideOpen('right', 'inventory')) events.emit('ui:open', { panel: 'inventory' });
  events.emit('ui:refresh', {});
}

/**
 * A counter panel closed, and the bag goes with it, even when it was open
 * before: unless the player went straight on to another counter.
 */
export function returnBag(owner: string): void {
  if (lent?.owner === owner) lent = null;
  // A panel opening on the left closes the one there before it lends its own
  // verb, so wait for the swap to finish before deciding.
  queueMicrotask(() => {
    if (!lent) events.emit('ui:close', { panel: 'inventory' });
    events.emit('ui:refresh', {});
  });
}

/** The counter changed what the bag shows (a new price, a new pick). */
export function bagChanged(): void {
  events.emit('ui:refresh', {});
}

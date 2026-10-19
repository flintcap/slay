/**
 * SLAY — trinkets: what each one does, and the portal one leaves.
 *
 * A trinket (`data/trinkets.ts`) does its one job once and breaks. The
 * Trinket of Town is clicked: it opens a portal in the map, and stepping
 * through it takes the hero home with everything, the map kept to go back to
 * (`OpenPortal` on the character). The Trinket of Death is never clicked: it
 * waits in the pack for the hero to die in a map, then takes the death.
 *
 * The scenes do the showing; this file holds the rules they share, so the
 * town and the dungeon cannot disagree about them.
 */
import type { Character, Item, OpenPortal, Rng } from '../types';
import { TRINKETS, TRINKET_CHANCE, getTrinket, type TrinketDef, type TrinketUse } from '../data/trinkets';
import { findBase } from '../data/itemBases';
import { newItem, vendorPrice } from './Loot';
import { removeItemFromInventory } from './Inventory';

/** The trinket an item is, if it is one. */
export function trinketOf(item: Item | null | undefined): TrinketDef | undefined {
  return item ? getTrinket(item.baseId) : undefined;
}

/** A fresh trinket of kind `id`. */
export function makeTrinket(id: string, rng: Rng): Item | null {
  const base = findBase(id);
  if (!base || base.category !== 'trinket') return null;
  const item = newItem(base, 1, 'unique', rng);
  item.value = vendorPrice(item, false) * 4;
  return item;
}

/** What a fallen boss leaves of trinkets: usually nothing, now and then one. */
export function rollTrinket(rng: Rng, source: keyof typeof TRINKET_CHANCE): Item | null {
  if (!rng.chance(TRINKET_CHANCE[source])) return null;
  const def = rng.weighted(TRINKETS, (t) => t.weight);
  return makeTrinket(def.id, rng);
}

/** The first trinket in the pack that does `use`, if any. */
export function carriedTrinket(c: Character, use: TrinketUse): Item | null {
  for (const it of c.inventory) if (it && trinketOf(it)?.use === use) return it;
  return null;
}

/** Takes the first trinket that does `use` out of the pack: it breaks. */
export function spendTrinket(c: Character, use: TrinketUse): Item | null {
  const it = carriedTrinket(c, use);
  return it ? removeItemFromInventory(c, it.uid) : null;
}

// ---------------------------------------------------------------------------
// The area's chart, kept with an open portal
// ---------------------------------------------------------------------------

/** One bit per tile, as base64. */
export function packChart(seen: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(seen.length / 8));
  for (let i = 0; i < seen.length; i++) if (seen[i]) bytes[i >> 3]! |= 1 << (i & 7);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** The chart back, `tiles` long; all unseen if it does not read. */
export function unpackChart(packed: string | undefined, tiles: number): Uint8Array {
  const out = new Uint8Array(tiles);
  if (!packed) return out;
  let s: string;
  try {
    s = atob(packed);
  } catch {
    return out;
  }
  for (let i = 0; i < tiles; i++) {
    const b = s.charCodeAt(i >> 3);
    if (b & (1 << (i & 7))) out[i] = 1;
  }
  return out;
}

/** The prompt by the portal in town. */
export function portalPrompt(p: OpenPortal): string {
  return `Portal: back to ${p.name || `the tier ${p.depth} map`}`;
}

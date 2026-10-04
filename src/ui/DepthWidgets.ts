/**
 * SLAY — small pieces the depth panels share: an item name that shows the
 * full tooltip on hover, and the gold-and-materials line under a service.
 */

import type { Item } from '../types';
import { hoverHooks, rarityHex, span } from './Widgets';
import { formatCost, type CraftCost } from '../sim/Crafting';

/** The item's name in its rarity colour; hover shows the real tooltip. */
export function itemName(item: Item, cls = 'depth-card-title'): HTMLSpanElement {
  const s = span(cls, item.name);
  s.style.color = rarityHex(item.rarity);
  s.style.cursor = 'help';
  s.addEventListener('pointerenter', () => hoverHooks.item?.(item, s));
  s.addEventListener('pointerleave', () => hoverHooks.hide?.());
  return s;
}

/** "320g, 1 Lesser Essence", coloured by whether it can be paid. */
export function costText(cost: CraftCost, affordable: boolean): HTMLSpanElement {
  return span(affordable ? 'depth-gold' : 'depth-bad', formatCost(cost));
}

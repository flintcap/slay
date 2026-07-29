/**
 * SLAY — drinking potions.
 *
 * The data has been here from the start: potion bases in five sizes, an effect
 * table, and stack handling in the inventory. What was missing was anything
 * that actually drank one — the Q and F keys were bound to actions no scene
 * listened for, and the inventory offered no way to use a consumable at all.
 */

import type { Character } from '../types';
import { getBase } from './Loot';
import { POTION_EFFECTS } from '../data/itemBases';
import { countInInventory, consumeFromInventory } from './Inventory';
import { events } from '../core/Events';

export type PotionKind = 'life' | 'mana' | 'rejuv' | 'other';

/** What a potion is for, from its id. Ids are stable; names are not. */
export function potionKind(baseId: string): PotionKind {
  if (baseId.startsWith('potion.rejuv')) return 'rejuv';
  if (baseId.startsWith('potion.heal')) return 'life';
  if (baseId.startsWith('potion.mana')) return 'mana';
  return 'other';
}

export function isPotion(baseId: string): boolean {
  return getBase(baseId)?.category === 'potion';
}

/** Every potion of a kind the character is carrying, weakest first. */
function carried(character: Character, kind: PotionKind): string[] {
  const out: string[] = [];
  for (const id of Object.keys(POTION_EFFECTS)) {
    const k = potionKind(id);
    if (k !== kind && !(kind !== 'rejuv' && k === 'rejuv')) continue;
    if (countInInventory(character, id) > 0) out.push(id);
  }
  // Weakest first, so a quick drink never burns the good stuff.
  return out.sort((a, b) => (getBase(a)?.levelReq ?? 0) - (getBase(b)?.levelReq ?? 0));
}

/**
 * The potion a quick-drink should reach for.
 *
 * Weakest sufficient first: if a minor flask covers the gap, drink that and
 * keep the super one. Rejuvenation is a last resort for either bar, because it
 * is the only thing that fixes both and is worth hoarding.
 */
export function pickPotion(
  character: Character,
  kind: 'life' | 'mana',
  missing: number,
): string | null {
  const pool = carried(character, kind);
  if (pool.length === 0) return null;
  const plain = pool.filter((id) => potionKind(id) !== 'rejuv');
  const rejuv = pool.filter((id) => potionKind(id) === 'rejuv');
  for (const id of plain) {
    const e = POTION_EFFECTS[id];
    const amount = kind === 'life' ? (e?.life ?? 0) : (e?.mana ?? 0);
    if (amount >= missing) return id;
  }
  // Nothing covers it: take the strongest plain one, then rejuvenation.
  if (plain.length) return plain[plain.length - 1]!;
  return rejuv[0] ?? null;
}

export interface PotionResult {
  ok: boolean;
  baseId?: string;
  /** Instant life and mana granted, before any over-time portion. */
  life: number;
  mana: number;
  /** Seconds the remainder is spread over; 0 means all of it was instant. */
  over: number;
  cleanse: string[];
  buff?: { stats: Record<string, number>; duration: number };
  reason?: string;
}

const EMPTY: PotionResult = { ok: false, life: 0, mana: 0, over: 0, cleanse: [] };

/**
 * Consumes a specific potion and reports what it should do. The caller owns
 * applying it, because only the scene knows about the live player entity.
 */
export function drinkPotion(
  character: Character,
  baseId: string,
  maxLife: number,
  maxMana: number,
): PotionResult {
  const effect = POTION_EFFECTS[baseId];
  if (!effect) return { ...EMPTY, reason: 'That is not a potion.' };
  if (!consumeFromInventory(character, baseId, 1)) {
    return { ...EMPTY, reason: 'You have none left.' };
  }

  const life = (effect.life ?? 0) + (effect.lifePct ?? 0) * maxLife;
  const mana = (effect.mana ?? 0) + (effect.manaPct ?? 0) * maxMana;
  events.emit('ui:refresh', {});
  return {
    ok: true,
    baseId,
    life,
    mana,
    over: effect.over ?? 0,
    cleanse: effect.cleanse ?? [],
    buff: effect.buff
      ? { stats: effect.buff as Record<string, number>, duration: effect.buffDuration ?? 20 }
      : undefined,
  };
}

/** Quick-drink: pick the right size and drink it in one call. */
export function quickDrink(
  character: Character,
  kind: 'life' | 'mana',
  current: number,
  max: number,
  maxLife: number,
  maxMana: number,
): PotionResult {
  const id = pickPotion(character, kind, Math.max(0, max - current));
  if (!id) {
    return { ...EMPTY, reason: kind === 'life' ? 'No healing potions.' : 'No mana potions.' };
  }
  return drinkPotion(character, id, maxLife, maxMana);
}

/**
 * SLAY — one answer to "what does this item look like", shared by every place
 * an item is drawn.
 *
 * Worn armour (`WornGear`), held weapons and ground drops (`ItemModels`) and
 * icons all have to agree: a mythic Archon Plate should be the same gold and
 * the same violet glow on the floor, in the bag and on your back. This module
 * turns an item and its base visual into that look — palette, trim metal,
 * accent and glow, how far up the ornament ladder it sits — so no two drawers
 * invent their own rules.
 *
 * Two ladders, both visible:
 *  - **rarity** (normal .. ancient) adds trim, then fittings, then gems, then
 *    glowing runes — the same steps `ItemModels.decoFor` uses;
 *  - **base tier** (from the base's level requirement) upgrades the shape
 *    itself: a Plate Mail, a Gothic Plate and an Archon Plate are three
 *    different suits, not one suit in three colours.
 * Uniques and set pieces get a signature: a stable hash of their id picks
 * features no ordinary item has, and every piece of one set shares a colour.
 */

import { RARITY_COLOR, type Item, type ItemRarity, type ItemVisual } from '../types';
import { ITEM_BASES } from '../data/itemBases';

export const RARITY_TIER: Record<ItemRarity, number> = {
  normal: 0,
  magic: 1,
  rare: 2,
  set: 3,
  unique: 3,
  mythic: 4,
  ancient: 4,
};

export type GearFamily = 'metal' | 'leather' | 'cloth' | 'bone' | 'other';

export interface GearLook {
  /** The item's own surface palette, e.g. 'metal.steel'. */
  palette: string;
  family: GearFamily;
  /** The sub-type after the dot of `visual.shape`: 'plate', 'robe', 'horned'... */
  kind: string;
  /** 0 normal, 1 magic, 2 rare, 3 set/unique, 4 mythic/ancient. */
  rarityTier: number;
  /** 0 entry, 1 mid, 2 elite base, from the base's level requirement. */
  baseTier: number;
  /** One number for "how grand": rarity plus base tier, 0..6. */
  rank: number;
  /** Palette for trim, rivets and edging. */
  trimKey: string;
  /** Multiplicative tint for the trim (set pieces carry their set colour). */
  trimTint?: number;
  /** Accent / glow colour. */
  accent: number;
  /** Emissive strength, 0 for none. */
  glow: number;
  /** 0..1 ornament density from the base. */
  ornate: number;
  hasTrim: boolean;
  hasFittings: boolean;
  hasGems: boolean;
  hasRunes: boolean;
  unique: boolean;
  set: boolean;
  /** Stable per-unique / per-set / per-base hash for picking signature features. */
  signature: number;
}

const levelByBase = new Map<string, number>();
for (const b of ITEM_BASES) levelByBase.set(b.id, b.levelReq);

/** FNV-1a, so a unique's signature never changes between sessions. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A set's colour: rich, never grey, the same for every piece of the set. */
export function setColor(setId: string): number {
  const hues = [0x33d64a, 0x3ac8c0, 0x4a8cff, 0xb05cff, 0xff6a9a, 0xffb43a, 0xd8e05a];
  return hues[hashString(setId) % hues.length]!;
}

function familyOf(palette: string): GearFamily {
  const p = palette.toLowerCase();
  if (p.startsWith('metal')) return 'metal';
  if (p.startsWith('leather')) return 'leather';
  if (p.startsWith('cloth')) return 'cloth';
  if (p.startsWith('bone')) return 'bone';
  return 'other';
}

/** Everything a drawer needs to make this item look like itself. */
export function gearLook(item: Pick<Item, 'baseId' | 'rarity' | 'uniqueId' | 'setId'>, visual: ItemVisual): GearLook {
  const rarityTier = RARITY_TIER[item.rarity] ?? 0;
  const level = levelByBase.get(item.baseId) ?? 1;
  const baseTier = level >= 50 ? 2 : level >= 20 ? 1 : 0;
  const palette = visual.palette || 'metal.steel';
  const set = !!item.setId || item.rarity === 'set';
  const unique = !!item.uniqueId || item.rarity === 'unique' || item.rarity === 'mythic' || item.rarity === 'ancient';
  const sc = set ? setColor(item.setId ?? item.baseId) : undefined;
  const accent = sc ?? visual.glow ?? RARITY_COLOR[item.rarity] ?? 0xc8c8c8;
  const ornate = visual.ornate ?? 0.12;
  const trimKey = set
    ? 'metal.silver'
    : rarityTier >= 4
      ? 'metal.gold'
      : rarityTier >= 3
        ? 'metal.gold'
        : rarityTier >= 2
          ? 'metal.bronze'
          : baseTier >= 2
            ? 'metal.steel'
            : 'metal.dark';
  return {
    palette,
    family: familyOf(palette),
    kind: (visual.shape.split('.')[1] ?? visual.shape).toLowerCase(),
    rarityTier,
    baseTier,
    rank: rarityTier + baseTier,
    trimKey,
    trimTint: sc,
    accent,
    glow: rarityTier >= 4 ? 2.4 : rarityTier >= 3 ? 1.3 : visual.glow !== undefined && rarityTier >= 1 ? 0.6 : 0,
    ornate,
    hasTrim: rarityTier >= 1 || baseTier >= 1,
    hasFittings: rarityTier >= 2 || baseTier >= 2,
    hasGems: rarityTier >= 3,
    hasRunes: rarityTier >= 4 || (rarityTier >= 3 && ornate > 0.5),
    unique,
    set,
    signature: hashString(item.uniqueId ?? item.setId ?? item.baseId),
  };
}

/**
 * SLAY — the one rarity ladder every drawer of an item follows.
 *
 * `GearLook` (models stream) answers "how grand is this piece": palette, base
 * tier, which ornament steps it has, a per-unique signature. This module puts
 * the art stream's colour rules on top of it, so the icon in the bag, the drop
 * on the floor, the weapon in the hand and the armour on the body all wear the
 * same trim metal, the same stone and the same glow:
 *
 *   rarity    trim metal (world palette, tint)   stone / glow
 *   normal    the base's own metal, or dark iron  the base's glow, if any
 *   magic     silver                              cold blue
 *   rare      gold                                a stone picked per base
 *   set       silver washed in the set's colour   the set's colour
 *   unique    gold                                a stone of its own
 *   mythic    void-gold (gold, violet cast)       violet
 *   ancient   blood-gold (gold, red cast)         ember red
 *
 * The icon painters keep their own canvas materials (`IconKit.MATS`); `iconTrim`
 * and `iconTrimTint` name the matching one.
 */
import type { Item, ItemRarity, ItemVisual } from '../types';
import { hashString } from '../core/RNG';
import { gearLook, setColor, type GearLook } from './GearLook';
import { glowFor, stoneFor } from './IconKit';

export interface ItemLook extends GearLook {
  /** Gem colour, matching the stone painted on the icon. */
  stone: number;
  /** Emissive colour for runes, inlays and auras, matching the icon's glow. */
  glowColor: number;
  /** The `IconKit.MATS` key the icon paints trim in. */
  iconTrim: string;
  /** Wash over `iconTrim`, for set colours. */
  iconTrimTint?: number;
  /** 0 normal .. 6 ancient, the icon ladder (finer than `rarityTier`). */
  iconRank: number;
}

const ICON_RANK: Record<ItemRarity, number> = { normal: 0, magic: 1, rare: 2, set: 3, unique: 4, mythic: 5, ancient: 6 };

/** World trim for each rarity above normal: palette key and multiplicative tint. */
const WORLD_TRIM: Partial<Record<ItemRarity, { key: string; tint?: number }>> = {
  magic: { key: 'metal.silver' },
  rare: { key: 'metal.gold' },
  unique: { key: 'metal.gold' },
  mythic: { key: 'metal.gold', tint: 0xd2a8ff },
  ancient: { key: 'metal.gold', tint: 0xffa48c },
};

const ICON_TRIM: Record<ItemRarity, string> = {
  normal: '',
  magic: 'metal.silver',
  rare: 'metal.gold',
  set: 'metal.silver',
  unique: 'metal.gold',
  mythic: 'metal.voidgold',
  ancient: 'metal.bloodgold',
};

type Ident = Pick<Item, 'baseId' | 'rarity' | 'uniqueId' | 'setId'>;

/** The shared look of one item. Cheap: a few lookups and one hash. */
export function itemLook(item: Ident, visual: ItemVisual): ItemLook {
  const base = gearLook(item, visual);
  const rarity = item.rarity;
  const identity = item.uniqueId ?? item.setId;
  const h = hashString(`${item.baseId}|${identity ?? ''}`);
  const pal = (visual.palette || 'metal.steel').split('|')[0]!;
  const set = rarity === 'set' || (!!item.setId && !item.uniqueId);
  const sc = set ? setColor(item.setId ?? item.baseId) : undefined;
  const stone = sc ?? stoneFor(rarity, h, identity, visual.glow);
  const glowColor = sc ?? glowFor(rarity, visual.glow);
  const wt = WORLD_TRIM[rarity];
  return {
    ...base,
    trimKey: set ? 'metal.silver' : wt?.key ?? base.trimKey,
    trimTint: sc ?? wt?.tint,
    accent: ICON_RANK[rarity] >= 1 ? glowColor : base.accent,
    stone,
    glowColor,
    iconTrim: ICON_TRIM[rarity] || (pal.startsWith('metal') ? pal : 'metal.iron'),
    iconTrimTint: sc,
    iconRank: ICON_RANK[rarity] ?? 0,
  };
}

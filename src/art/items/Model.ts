/**
 * SLAY — building an item model: look, family, cut, features, merge.
 *
 * `buildItem` is the one entry point every caller goes through (via the
 * facade in `src/art/ItemModels.ts`). It works out the item's look, picks the
 * family builder from the base's category (or, for free-form shapes from
 * monsters and NPCs, from the shape name), lets the builder add its parts,
 * adds the unique's or set's features, and merges everything into one mesh
 * per material. A builder that throws falls back to a plain short sword: an
 * item never takes a run down.
 */
import * as THREE from 'three';
import type { ItemRarity, ItemVisual } from '../../types';
import { itemLook, type ItemLook } from '../ItemLook';
import { Parts } from './Parts';
import { BLADE_BY_SHAPE, BLADE_CUTS, buildBlade, withOverride } from './Blades';
import { addFeatures } from './Features';
import { FAMILY_BUILDERS } from './Families';

export type ItemFamily =
  | 'sword'
  | 'dagger'
  | 'axe'
  | 'mace'
  | 'spear'
  | 'bow'
  | 'crossbow'
  | 'wand'
  | 'staff'
  | 'scepter'
  | 'shield'
  | 'orb'
  | 'quiver'
  | 'helm'
  | 'chest'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring'
  | 'charm'
  | 'gem'
  | 'rune'
  | 'potion'
  | 'material';

const CATEGORY_FAMILY: Record<string, ItemFamily> = {
  sword: 'sword',
  axe: 'axe',
  mace: 'mace',
  dagger: 'dagger',
  spear: 'spear',
  bow: 'bow',
  crossbow: 'crossbow',
  wand: 'wand',
  staff: 'staff',
  scepter: 'scepter',
  shield: 'shield',
  orb: 'orb',
  quiver: 'quiver',
  helm: 'helm',
  chest: 'chest',
  gloves: 'gloves',
  boots: 'boots',
  belt: 'belt',
  amulet: 'amulet',
  ring: 'ring',
  charm: 'charm',
  gem: 'gem',
  rune: 'rune',
  potion: 'potion',
  material: 'material',
};

/** Keyword search for free-form shapes: 'greatsword', 'hammer.war', 'polearm'... */
const HINTS: Array<[string, ItemFamily]> = [
  ['dagger', 'dagger'],
  ['knife', 'dagger'],
  ['kris', 'dagger'],
  ['crossbow', 'crossbow'],
  ['xbow', 'crossbow'],
  ['bow', 'bow'],
  ['sword', 'sword'],
  ['blade', 'sword'],
  ['axe', 'axe'],
  ['cleaver', 'axe'],
  ['hammer', 'mace'],
  ['maul', 'mace'],
  ['club', 'mace'],
  ['mace', 'mace'],
  ['flail', 'mace'],
  ['halberd', 'spear'],
  ['pike', 'spear'],
  ['trident', 'spear'],
  ['glaive', 'spear'],
  ['scythe', 'spear'],
  ['polearm', 'spear'],
  ['spear', 'spear'],
  ['lance', 'spear'],
  ['staff', 'staff'],
  ['stave', 'staff'],
  ['wand', 'wand'],
  ['rod', 'scepter'],
  ['scepter', 'scepter'],
  ['sceptre', 'scepter'],
  ['shield', 'shield'],
  ['buckler', 'shield'],
  ['orb', 'orb'],
  ['focus', 'orb'],
  ['quiver', 'quiver'],
  ['helm', 'helm'],
  ['hood', 'helm'],
  ['crown', 'helm'],
  ['chest', 'chest'],
  ['armor', 'chest'],
  ['armour', 'chest'],
  ['robe', 'chest'],
  ['glove', 'gloves'],
  ['gauntlet', 'gloves'],
  ['boot', 'boots'],
  ['greave', 'boots'],
  ['belt', 'belt'],
  ['sash', 'belt'],
  ['amulet', 'amulet'],
  ['ring', 'ring'],
  ['charm', 'charm'],
  ['gem', 'gem'],
  ['rune', 'rune'],
  ['potion', 'potion'],
  ['flask', 'potion'],
  ['torch', 'mace'],
  ['pick', 'axe'],
  ['tool', 'mace'],
  ['shovel', 'spear'],
];

export function familyOf(look: Pick<ItemLook, 'category' | 'silhouette'>): ItemFamily {
  const byCat = CATEGORY_FAMILY[look.category];
  if (byCat) return byCat;
  const s = look.silhouette.toLowerCase();
  const head = s.split('.')[0]!;
  if (CATEGORY_FAMILY[head]) return CATEGORY_FAMILY[head]!;
  for (const [k, f] of HINTS) if (s.includes(k)) return f;
  return 'sword';
}

export interface BuiltItem {
  group: THREE.Group;
  look: ItemLook;
  family: ItemFamily;
}

export interface ItemIdentity {
  baseId?: string;
  uniqueId?: string;
  setId?: string;
}

function fallbackSword(P: Parts): void {
  buildBlade(P, BLADE_CUTS['sword.short']!);
}

/** Builds an item model. Grip (or wear point) at the origin, +Y the business end. */
export function buildItem(visual: ItemVisual, rarity: ItemRarity, ident?: ItemIdentity): BuiltItem {
  const look = itemLook({ baseId: ident?.baseId ?? visual.shape, rarity, uniqueId: ident?.uniqueId, setId: ident?.setId }, visual);
  const family = familyOf(look);
  let P = new Parts(look);
  try {
    if (family === 'sword' || family === 'dagger') {
      const base = BLADE_CUTS[look.cut] ?? BLADE_CUTS[BLADE_BY_SHAPE[look.silhouette] ?? (family === 'dagger' ? 'dagger.dagger' : 'sword.short')]!;
      buildBlade(P, withOverride(base, look.cutOverride));
    } else {
      const fn = FAMILY_BUILDERS[family];
      if (fn) fn(P);
      else fallbackSword(P);
    }
    addFeatures(P);
  } catch (err) {
    if (typeof console !== 'undefined') console.warn(`item model ${look.cut} failed, using a plain blade`, err);
    P = new Parts(look);
    fallbackSword(P);
  }
  const group = P.build(`item:${look.cut}:${rarity}`);
  group.userData.shape = family;
  group.userData.rarity = rarity;
  group.userData.accent = look.glowColor;
  group.userData.anchors = P.anchors;
  return { group, look, family };
}

/**
 * Only the features of an item (halos, wings, chains, horns, its emblem),
 * built on the anchors its base leaves, in the item's own space. Worn armour
 * grows its base on the body so it bends with it, then wears these as they
 * are on the icon. Null when the piece has none.
 */
export function buildItemFeatures(visual: ItemVisual, rarity: ItemRarity, ident?: ItemIdentity): THREE.Group | null {
  const look = itemLook({ baseId: ident?.baseId ?? visual.shape, rarity, uniqueId: ident?.uniqueId, setId: ident?.setId }, visual);
  if (!look.features.length && !look.emblem) return null;
  const family = familyOf(look);
  const base = new Parts(look);
  const F = new Parts(look);
  try {
    FAMILY_BUILDERS[family]?.(base);
    Object.assign(F.anchors, base.anchors);
    addFeatures(F);
  } catch {
    return null;
  }
  const group = F.build(`features:${look.cut}`);
  return group.children.length ? group : null;
}


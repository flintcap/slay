/**
 * SLAY — what an item looks like, one answer for every drawer.
 *
 * The held weapon, the drop on the floor, the icon in the bag and the armour
 * on the body (heroes' `hero/Armour.ts`) all read this. It is `GearLook`
 * (rarity ladder, base tier, ornament steps) plus the items stream's design
 * layer:
 *
 *  - every base has its own cut (`cut`, the base id) inside its silhouette
 *    family (`silhouette`, from `visual.shape`), drawn by the family builders
 *    in `src/art/items/`;
 *  - every unique has its own design (`src/art/items/Designs.ts`): its own
 *    materials and colours (so `palette` changes too, and armour on the body
 *    follows), a cut override and features no plain item has;
 *  - every set has a motif all its pieces share: colour, trim metal, cloth,
 *    emblem and features;
 *  - rarity walks the trim ladder below:
 *
 *   rarity    trim metal                stone / glow
 *   normal    the base tier's trim      the base's glow, if any
 *   magic     silver                    cold blue
 *   rare      gold                      a stone picked per base
 *   set       the set's trim            the set's colour
 *   unique    gold, or its design's     its design's
 *   mythic    gold, violet cast         violet, or its design's
 *   ancient   gold, red cast            ember, or its design's
 *
 * Pure data: cheap, no three.js objects. Shape and fields are in CONTRACTS.md.
 */
import type { Item, ItemCategory, ItemRarity, ItemVisual } from '../types';
import { RARITY_COLOR } from '../types';
import { hashString } from '../core/RNG';
import { gearLook, type GearLook } from './GearLook';
import { resolveSurface } from './SurfaceLibrary';
import { TEXTURE_SETS } from './TextureSets';
import { ITEM_BASES } from '../data/itemBases';
import { fallbackMotif, FINISHES, GLOWING_SETS, GLOWING_UNIQUES, glowStyleOf, SET_MOTIFS, UNIQUE_DESIGNS, type Aura, type GlowStyle, type Emblem, type Feature, type Finish, type SetMotif, type UniqueDesign } from './items/Designs';

export type { Aura, Emblem, Feature, Finish } from './items/Designs';

/** What the main body of a piece is made of. */
export type ItemMaterialKind = 'metal' | 'wood' | 'leather' | 'cloth' | 'bone' | 'crystal' | 'stone' | 'flesh';

/** Surface keys ('metal.steel', 'cloth.silk|0x5a2a1a'...) for each part of a piece. */
export interface ItemLookKeys {
  /** Blade, head, plates, body. */
  main: string;
  /** Grip wraps, straps, linings, bindings. */
  second: string;
  /** Hafts, shafts, stocks. */
  wood: string;
  /** Trim, fittings, rivets, settings. */
  trim: string;
  /** Tabards, ribbons, robes, sashes. */
  cloth: string;
}

/** The same parts as sRGB colours, for flat drawers. */
export interface ItemLookColors {
  main: number;
  second: number;
  wood: number;
  trim: number;
  cloth: number;
  glow: number;
  stone: number;
}

export interface ItemLook extends GearLook {
  /** Gem colour. */
  stone: number;
  /** Emissive colour for runes, inlays and auras. */
  glowColor: number;
  /** Legacy icon trim key (a surface key). */
  iconTrim: string;
  /** Wash over `iconTrim`, for set colours. */
  iconTrimTint?: number;
  /** 0 normal .. 6 ancient, finer than `rarityTier`. */
  iconRank: number;

  /** The base id, or the shape when the base is unknown. */
  baseId: string;
  category: ItemCategory | 'unknown';
  /** Silhouette family: `visual.shape` lower-cased ('sword.broad', 'helm.horned', 'dagger'). */
  silhouette: string;
  /** The base's own cut inside its family: every base has one (its id). */
  cut: string;
  material: ItemMaterialKind;
  keys: ItemLookKeys;
  colors: ItemLookColors;
  /** Gem settings to show, 0..6. */
  gemCount: number;
  /** 0 pristine .. 1 battered: nicks, grime, dulled metal. */
  wear: number;
  /** Decorations on top of the cut (uniques and sets). */
  features: Feature[];
  /** A set piece's badge. */
  emblem?: Emblem;
  /** The set's motif, on set pieces. */
  motif?: SetMotif;
  /** The unique's design, on uniques. */
  design?: UniqueDesign;
  /** Design cut overrides, merged by the family builder. */
  cutOverride?: Record<string, number | string | boolean>;
  /** The living effect round a set piece or unique ('none' on plain items). */
  aura: Aura;
  /** How the glow moves over it, when it has one. */
  glowStyle: GlowStyle;
  /** Surface finish of a set piece or unique: shine and roughness of its main and trim. */
  finish?: Finish;
  /** Faint inner light of the main surface, in the glow colour (from the finish). */
  sheen: number;
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

const RARE_STONES = [0xe0323c, 0x3a6ce0, 0x35c05a, 0xf0e05a, 0xc060ff, 0xff8a1e, 0x9fe8ff];
const UNIQUE_STONES = [0xff8a1e, 0xe0323c, 0xffd24a, 0x35c05a, 0x6fa8ff];

function stoneFor(rarity: ItemRarity, h: number, identity: string | undefined, baseGlow: number | undefined): number {
  if (baseGlow !== undefined && ICON_RANK[rarity] < 4) return baseGlow;
  switch (rarity) {
    case 'normal':
    case 'magic':
      return baseGlow ?? 0x5a8cff;
    case 'rare':
      return RARE_STONES[h % RARE_STONES.length]!;
    case 'set':
      return 0x2fd25a;
    case 'unique':
      return identity ? UNIQUE_STONES[(h >>> 3) % UNIQUE_STONES.length]! : 0xff8a1e;
    case 'mythic':
      return 0xc060ff;
    case 'ancient':
      return 0xff4a24;
  }
}

function glowFor(rarity: ItemRarity, baseGlow: number | undefined): number {
  if (ICON_RANK[rarity] >= 5) return RARITY_COLOR[rarity];
  if (rarity === 'unique') return baseGlow ?? 0xffa040;
  if (rarity === 'set') return 0x5aff7a;
  return baseGlow ?? (rarity === 'magic' ? 0x7a9cff : rarity === 'rare' ? 0xffd870 : 0xb8c8ff);
}

const baseById = new Map<string, { category: ItemCategory; level: number }>();
for (const b of ITEM_BASES) baseById.set(b.id, { category: b.category, level: b.levelReq });

function materialOf(key: string): ItemMaterialKind {
  const fam = key.split(/[.|]/)[0]!.toLowerCase();
  switch (fam) {
    case 'metal':
    case 'wood':
    case 'leather':
    case 'cloth':
    case 'bone':
    case 'crystal':
    case 'stone':
    case 'flesh':
      return fam;
    default:
      return 'metal';
  }
}

/** The sRGB colour a surface key (with an optional `|0xRRGGBB` tint) wears. */
export function keyColor(key: string): number {
  const [pal, tint] = key.split('|');
  const def = resolveSurface(pal!);
  const base = def.base ?? TEXTURE_SETS[def.set].avg;
  if (!tint) return base;
  const t = Number(tint);
  if (!Number.isFinite(t)) return base;
  // An inline tint names the colour outright on colourless scans (cloth,
  // leather, metal); on coloured ones it multiplies.
  if (def.base !== undefined) return t;
  const mul = (s: number) => Math.round((((base >> s) & 255) * ((t >> s) & 255)) / 255) << s;
  return mul(16) | mul(8) | mul(0);
}

/** A surface key washed toward a set's colour: named outright on colourless scans, multiplied on coloured ones. */
function motifPalette(key: string, color: number): string {
  const [pal, tint] = key.split('|');
  const def = resolveSurface(pal!);
  const hex = (n: number) => `0x${n.toString(16).padStart(6, '0')}`;
  if (def.base !== undefined) return `${pal}|${hex(mixColor(keyColor(key), color, 0.38))}`;
  const t = tint !== undefined && Number.isFinite(Number(tint)) ? Number(tint) : 0xffffff;
  return `${pal}|${hex(mulColor(t, washed(color, 0.6)))}`;
}

function mixColor(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}

function washed(color: number, amount: number): number {
  const ch = (s: number) => Math.round(255 + (((color >> s) & 255) - 255) * amount) << s;
  return ch(16) | ch(8) | ch(0);
}

type Ident = Pick<Item, 'baseId' | 'rarity' | 'uniqueId' | 'setId'>;

/**
 * Bases whose own palette is too plain to read from the game camera get a
 * tint here, so the icon, the drop and the worn piece all agree.
 */
const BASE_TINT: Record<string, string> = {
  // A deep sea-green shell, not one more dark plate.
  'chest.kraken': 'metal.dark|0x2c5a5e',
};

const cache = new Map<string, ItemLook>();

/** The shared look of one item. Cheap and cached: a few lookups and one hash. */
export function itemLook(item: Ident, visual: ItemVisual): ItemLook {
  const ck = `${item.baseId}|${item.rarity}|${item.uniqueId ?? ''}|${item.setId ?? ''}|${visual.shape}|${visual.palette}|${visual.glow ?? ''}|${visual.ornate ?? ''}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const look = computeLook(item, visual);
  if (cache.size > 4000) cache.clear();
  cache.set(ck, look);
  return look;
}

function computeLook(item: Ident, visual: ItemVisual): ItemLook {
  const gear = gearLook(item, visual);
  const rarity = item.rarity;
  const identity = item.uniqueId ?? item.setId;
  const h = hashString(`${item.baseId}|${identity ?? ''}`);
  const info = baseById.get(item.baseId);
  const category = info?.category ?? 'unknown';
  const isSet = rarity === 'set' || (!!item.setId && !item.uniqueId);
  const design = item.uniqueId ? UNIQUE_DESIGNS[item.uniqueId] : undefined;
  const motif = isSet ? SET_MOTIFS[item.setId ?? ''] ?? fallbackMotif(item.setId ?? item.baseId, h) : undefined;

  // Set pieces wear their set's palette on the main surface: its metal on
  // plate, its leather on hide, its cloth on robes. Bone, wood and crystal
  // bases keep their stuff, washed toward the set's colour.
  const basePal = BASE_TINT[item.baseId] ?? (visual.palette || 'metal.steel');
  const palette = design?.main ?? (motif ? setPalette(basePal, motif) : basePal);
  const pal0 = palette.split('|')[0]!;
  const material = materialOf(palette);
  const tier = gear.baseTier;
  const rank = ICON_RANK[rarity] ?? 0;

  // Trim: the design's, the set's, the rarity's, or the base tier's.
  const wt = WORLD_TRIM[rarity];
  const trimKey = design?.trim ?? motif?.trim ?? wt?.key ?? gear.trimKey;
  const trimTint = motif ? washed(motif.color, 0.3) : design?.trim ? undefined : wt?.tint ?? gear.trimTint;

  const stone = design?.stone ?? motif?.color ?? stoneFor(rarity, h, identity, visual.glow);
  const glowColor = design?.glow ?? motif?.glow ?? glowFor(rarity, visual.glow);

  // Grips go from rawhide to fine leather as the base climbs.
  const second = design?.second ?? motif?.second ?? (material === 'leather' ? pal0 : tier >= 2 || rank >= 2 ? 'leather.fine' : 'leather.worn');
  const wood0 = material === 'wood' ? palette : design?.second?.startsWith('wood') ? design.second : tier >= 2 ? 'wood.polished' : tier >= 1 ? 'wood.oak|0x7a5a3a' : 'wood.oak';
  // A set's hafts and staves take its colour as well.
  const wood = motif && material !== 'wood' ? motifPalette(wood0, motif.color) : wood0;
  const cloth = motif ? (motif.second.startsWith('cloth') ? motif.second : motif.cloth) : design?.second?.startsWith('cloth') ? design.second : material === 'cloth' ? palette : rank >= 2 ? 'cloth.banner' : 'cloth.undyed';

  const glow =
    design?.glowStrength !== undefined
      ? design.glowStrength
      : design
        ? Math.max(gear.glow, 1.2)
        : gear.glow;

  const gemCount = Math.min(
    6,
    typeof design?.cut?.gems === 'number'
      ? (design.cut.gems as number)
      : rarity === 'normal' || rarity === 'magic'
        ? 0
        : rarity === 'rare' || rarity === 'set'
          ? 1
          : rarity === 'unique'
            ? 2
            : 3,
  );
  const wear =
    design?.wear ??
    motif?.wear ??
    Math.max(0, (rarity === 'normal' ? 0.65 : rarity === 'magic' ? 0.5 : rarity === 'rare' ? 0.35 : 0.2) - tier * 0.12);

  const keys: ItemLookKeys = { main: palette, second, wood, trim: trimKey, cloth };
  const finish: Finish | undefined = design?.finish ?? motif?.finish;
  const look: ItemLook = {
    ...gear,
    palette,
    family: material === 'metal' || material === 'leather' || material === 'cloth' || material === 'bone' ? material : 'other',
    trimKey,
    trimTint,
    accent: rank >= 1 ? glowColor : gear.accent,
    glow,
    hasGems: gear.hasGems || gemCount > 0,
    stone,
    glowColor,
    iconTrim: trimKey.split('|')[0]!,
    iconTrimTint: motif ? trimTint : undefined,
    iconRank: rank,
    baseId: item.baseId,
    category,
    silhouette: (visual.shape || 'unknown').toLowerCase(),
    cut: info ? item.baseId : (visual.shape || 'unknown').toLowerCase(),
    material,
    keys,
    colors: {
      main: keyColor(palette),
      second: keyColor(second),
      wood: keyColor(wood),
      trim: trimTint !== undefined ? mulColor(keyColor(trimKey), trimTint) : keyColor(trimKey),
      cloth: keyColor(cloth),
      glow: glowColor,
      stone,
    },
    gemCount,
    wear,
    // A set's sculpt comes first, so every piece carries it.
    features: design ? [...design.features] : motif ? [motif.sculpt, ...motif.features.filter((f) => f !== motif.sculpt)] : [],
    emblem: motif?.emblem,
    motif,
    design,
    cutOverride: design?.cut,
    // Only the chosen few glow (`GLOWING_SETS`, `GLOWING_UNIQUES`).
    aura: design
      ? (GLOWING_UNIQUES.has(item.uniqueId ?? '') ? design.aura : 'none')
      : motif && GLOWING_SETS.has(item.setId ?? '') ? motif.aura : 'none',
    glowStyle: design ? glowStyleOf(design.aura, design.glowStyle) : motif ? glowStyleOf(motif.aura, motif.glowStyle) : 'rim',
    finish,
    sheen: finish ? FINISHES[finish].sheen : 0,
  };
  return look;
}

/**
 * Metalness and roughness of a set piece's or unique's main surface, from its
 * finish. Leather and cloth keep their own metalness and only take the
 * gloss of a lacquered or polished finish.
 */
export function surfaceFinish(look: Pick<ItemLook, 'finish' | 'material'>): { metalness?: number; roughness?: number } {
  if (!look.finish) return {};
  const f = FINISHES[look.finish];
  if (look.material === 'metal') return { metalness: f.metalness, roughness: f.roughness };
  if (look.material === 'leather' || look.material === 'cloth') return { roughness: Math.max(0.38, f.roughness) };
  return { roughness: f.roughness };
}

/** A set piece's main surface: the set's own metal, leather or cloth for that stuff. */
function setPalette(key: string, motif: SetMotif): string {
  switch (materialOf(key)) {
    case 'metal':
      return motif.metal;
    case 'leather':
      return motif.leather;
    case 'cloth':
      return motif.cloth;
    default:
      return motifPalette(key, motif.color);
  }
}

function mulColor(a: number, b: number): number {
  const m = (s: number) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255) << s;
  return m(16) | m(8) | m(0);
}

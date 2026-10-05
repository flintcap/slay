/**
 * SLAY — procedural item models.
 *
 * Every weapon, every piece of armour, every ring is built from code at the
 * moment it drops. The rules that keep that from looking generated:
 *
 *  - **Silhouette first.** A dagger is not a small sword: it has a different
 *    blade profile, a different guard, a different grip ratio. Two weapons that
 *    differ only in scale read as one weapon.
 *  - **Rarity escalates in geometry, not just colour.** A normal blade is bare
 *    steel. Magic adds trim. Rare adds fittings and a stone. Unique and above
 *    add glowing runes, gems and emissive accents keyed to `RARITY_COLOR`, so a
 *    mythic drop is legible from across the room before the tooltip opens.
 *  - **Nothing is a raw primitive.** Grips are wrapped and ribbed, pommels are
 *    lathed, blades are lenticular with a fuller, shields are curved shells with
 *    a rim and a boss.
 *
 * Orientation contract: weapons are authored with the grip at the origin and
 * the business end running along **+Y**. `CharacterModels.attachToSocket`
 * rotates that into the fist. Armour pieces are authored around the origin in
 * the orientation they are worn.
 */

import * as THREE from 'three';
import {
  RARITY_COLOR,
  type Item,
  type ItemRarity,
  type ItemVisual,
  type Rng,
} from '../types';
import { surface, surfaceVariant, emissiveMaterial, gemMaterial, additiveMaterial, beamMaterial } from './Materials';
import { radialGlowTexture, runeRingTexture } from './Textures';
import { itemLook, type ItemLook } from './ItemLook';
import { Random } from '../core/RNG';
import {
  beveledBox,
  blade,
  clothPanel,
  dome,
  gem,
  lathe,
  latheModulated,
  mergeGeometries,
  normalizeGeometry,
  ring,
  shell,
  spike,
  taperedBox,
  transformed,
  displace,
  twist,
} from './Meshes';

// ---------------------------------------------------------------------------
// Rarity
// ---------------------------------------------------------------------------

const RARITY_TIER: Record<ItemRarity, number> = {
  normal: 0,
  magic: 1,
  rare: 2,
  set: 3,
  unique: 3,
  mythic: 4,
  ancient: 4,
};

interface Deco {
  tier: number;
  accent: number;
  /** Has metal trim bands. */
  trim: boolean;
  /** Has extra sculpted fittings. */
  fittings: boolean;
  /** Has set gemstones. */
  gems: boolean;
  /** Has emissive runes and glow. */
  runes: boolean;
  /** Emissive strength multiplier. */
  glow: number;
}

/**
 * The ornament steps, read off the shared `ItemLook` so a model climbs the same
 * ladder as its icon: rare already carries a stone (the icon paints one), set
 * and unique add more gems, mythic and ancient glowing runes.
 */
function decoFrom(look: ItemLook): Deco {
  const tier = look.rarityTier;
  return {
    tier,
    accent: look.glowColor,
    trim: look.hasTrim,
    fittings: look.hasFittings,
    gems: tier >= 2,
    runes: look.hasRunes,
    glow: tier >= 4 ? 2.4 : tier >= 3 ? 1.3 : tier >= 2 ? 0.35 : 0,
  };
}

// ---------------------------------------------------------------------------
// Shape resolution
// ---------------------------------------------------------------------------

export type ItemShape =
  | 'sword'
  | 'axe'
  | 'mace'
  | 'dagger'
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
  | 'potion'
  | 'gem'
  | 'rune'
  | 'material';

const SHAPE_SET = new Set<string>([
  'sword', 'axe', 'mace', 'dagger', 'spear', 'bow', 'crossbow', 'wand', 'staff',
  'scepter', 'shield', 'orb', 'quiver', 'helm', 'chest', 'gloves', 'boots',
  'belt', 'amulet', 'ring', 'charm', 'potion', 'gem', 'rune', 'material',
]);

/** Keyword search, so 'greatSword', 'sword.long' and 'long_sword' all land. */
const SHAPE_HINTS: Array<[string, ItemShape]> = [
  ['crossbow', 'crossbow'],
  ['bow', 'bow'],
  ['sword', 'sword'],
  ['blade', 'sword'],
  ['falchion', 'sword'],
  ['sabre', 'sword'],
  ['saber', 'sword'],
  ['axe', 'axe'],
  ['cleaver', 'axe'],
  ['hatchet', 'axe'],
  ['mace', 'mace'],
  ['hammer', 'mace'],
  ['maul', 'mace'],
  ['club', 'mace'],
  ['flail', 'mace'],
  ['dagger', 'dagger'],
  ['knife', 'dagger'],
  ['dirk', 'dagger'],
  ['kris', 'dagger'],
  ['spear', 'spear'],
  ['trident', 'spear'],
  ['lance', 'spear'],
  ['pike', 'spear'],
  ['halberd', 'spear'],
  ['glaive', 'spear'],
  ['wand', 'wand'],
  ['rod', 'wand'],
  ['staff', 'staff'],
  ['stave', 'staff'],
  ['scepter', 'scepter'],
  ['sceptre', 'scepter'],
  ['shield', 'shield'],
  ['buckler', 'shield'],
  ['aegis', 'shield'],
  ['targe', 'shield'],
  ['orb', 'orb'],
  ['sphere', 'orb'],
  ['focus', 'orb'],
  ['quiver', 'quiver'],
  ['helm', 'helm'],
  ['crown', 'helm'],
  ['hood', 'helm'],
  ['cap', 'helm'],
  ['mask', 'helm'],
  ['chest', 'chest'],
  ['armor', 'chest'],
  ['armour', 'chest'],
  ['mail', 'chest'],
  ['robe', 'chest'],
  ['plate', 'chest'],
  ['glove', 'gloves'],
  ['gaunt', 'gloves'],
  ['grip', 'gloves'],
  ['boot', 'boots'],
  ['greave', 'boots'],
  ['sabaton', 'boots'],
  ['belt', 'belt'],
  ['sash', 'belt'],
  ['girdle', 'belt'],
  ['amulet', 'amulet'],
  ['necklace', 'amulet'],
  ['pendant', 'amulet'],
  ['talisman', 'amulet'],
  ['ring', 'ring'],
  ['band', 'ring'],
  ['loop', 'ring'],
  ['charm', 'charm'],
  ['potion', 'potion'],
  ['flask', 'potion'],
  ['elixir', 'potion'],
  ['gem', 'gem'],
  ['jewel', 'gem'],
  ['rune', 'rune'],
];

/** Families the icon painters treat as sub-types of another (`hammer.war` is a mace). */
const FAMILY_ALIAS: Record<string, [ItemShape, string]> = {
  hammer: ['mace', 'war'],
  maul: ['mace', 'great'],
  pike: ['spear', 'pike'],
  halberd: ['spear', 'halberd'],
  glaive: ['spear', 'halberd'],
  polearm: ['spear', 'halberd'],
  trident: ['spear', 'trident'],
  buckler: ['shield', 'buckler'],
  xbow: ['crossbow', ''],
};

/**
 * Family and sub-type, read the way the icon painters read them, so the model
 * on the floor has the silhouette of the picture in the bag: 'sword.thin' is a
 * rapier, 'maul.great' a two-handed hammer, 'dagger.wavy' a kris.
 */
export function resolveModelShape(raw: string | undefined, palette?: string, ornate?: number): { shape: ItemShape; sub: string } {
  const s = (raw ?? '').toLowerCase();
  const [head = '', sub = ''] = s.split('.');
  const alias = FAMILY_ALIAS[head];
  if (alias) return { shape: alias[0], sub: sub || alias[1] };
  return { shape: resolveShape(raw, palette, ornate), sub: SHAPE_SET.has(head) ? sub : '' };
}

/** Resolves any shape or base id string onto a model family. */
export function resolveShape(raw: string | undefined, palette?: string, ornate?: number): ItemShape {
  const s = (raw ?? '').toLowerCase();
  if (SHAPE_SET.has(s)) return s as ItemShape;
  const head = s.split(/[.\-_/ ]/)[0];
  if (SHAPE_SET.has(head)) return head as ItemShape;
  for (const [key, shape] of SHAPE_HINTS) {
    if (s.includes(key)) return shape;
  }
  // 'auto' and anything unrecognised: infer from the material story. A cloth or
  // leather palette is armour, a crystal palette is a focus, metal is a blade.
  const p = (palette ?? '').toLowerCase();
  if (p.startsWith('cloth')) return 'chest';
  if (p.startsWith('leather')) return (ornate ?? 0) > 0.5 ? 'gloves' : 'boots';
  if (p.startsWith('crystal')) return 'orb';
  if (p.startsWith('wood')) return 'staff';
  if (p.startsWith('bone')) return 'wand';
  return 'sword';
}

// ---------------------------------------------------------------------------
// Material helpers
// ---------------------------------------------------------------------------

interface Kit {
  /** The item's own palette: the blade of a sword, the leather of a boot. */
  metal: THREE.Material;
  /** Heads and edges on hafted weapons: the palette if it is metal, bone or crystal, else steel. */
  edge: THREE.Material;
  dark: THREE.Material;
  trim: THREE.Material;
  /** Hafts, limbs and staves: the palette if it is wood or bone, else a wood that suits it. */
  wood: THREE.Material;
  leather: THREE.Material;
  cloth: THREE.Material;
  crystal: THREE.Material;
  glow: THREE.Material;
  /** The item's stone, the colour its icon paints. */
  stone: THREE.Material;
  accent: number;
  deco: Deco;
  rng: Rng;
  ornate: number;
  /** The item's own palette, so builders can ask what it is made of. */
  paletteKey: string;
  /** Sub-type after the dot of the shape ('thin', 'great', 'wavy'...). */
  sub: string;
  look: ItemLook;
  /**
   * Where the business end is (height on +Y and rough radius), set by each
   * weapon builder so a unique's signature feature knows where to grow.
   */
  head?: { y: number; r: number };
}

/** Who an item is, beyond its base visual: enough to find its set colour or unique signature. */
export type ItemIdent = Pick<Item, 'baseId'> & Partial<Pick<Item, 'uniqueId' | 'setId'>>;

/** World woods for the icon palettes (the world has no pale ash or black wood of its own). */
const WOOD_FOR: Record<string, string> = {
  'wood.oak': 'wood.oak',
  'wood.ash': 'wood.oak',
  'wood.dark': 'wood.charred',
  'wood.polished': 'wood.polished',
  'wood.rotted': 'wood.rotted',
  'wood.charred': 'wood.charred',
};

function kitFor(visual: ItemVisual, rarity: ItemRarity, rng: Rng, ident?: ItemIdent, sub = ''): Kit {
  const look = itemLook({ baseId: ident?.baseId ?? visual.shape, rarity, uniqueId: ident?.uniqueId, setId: ident?.setId }, visual);
  const deco = decoFrom(look);
  const base = visual.palette || 'metal.steel';
  const fam = base.split('.')[0];
  // Seed 0, always — and this is the whole reason a kill could freeze the game.
  //
  // Item kits used to pick `1 + floor(rng.next() * 6)`, a fresh random texture
  // seed per item. A seed is part of the texture cache key, so every drop had a
  // one-in-six chance per material of missing the cache and baking a complete
  // PBR set — albedo, normal, ORM, all procedural, all on the main thread. Boot
  // warms seed 0 and nothing else, so the warmed textures were never once used
  // by an item, and the cost landed on the frame a monster died. Measured at
  // ~900ms per drop under software rendering before the first few seeds filled
  // in, against ~1.5ms once they had.
  //
  // Two blades of the same steel now share a weave, which is what you would
  // want anyway: a Leather Armor should look like a Leather Armor. Variety
  // between items comes from shape, palette and rarity, none of which are free
  // to vary per instance.
  const seed = 0;
  const primary = surface(base, { repeat: 8, seed });
  const crystalKey = base.startsWith('crystal.void') ? 'crystal.void' : base.startsWith('crystal.ice') ? 'crystal.ice' : 'crystal.arcane';
  // An authored glow on a crystal base (a ruby wand, a sapphire bow) is the colour of the crystal.
  const crystal = fam === 'crystal' && visual.glow !== undefined ? gemMaterial(visual.glow, { glow: 0.4 }) : surface(crystalKey, { repeat: 3, seed });
  const woodKey = WOOD_FOR[base] ?? (base === 'metal.dark' || base === 'crystal.void' ? 'wood.charred' : base === 'metal.gold' ? 'wood.polished' : 'wood.oak');
  return {
    metal: primary,
    edge: fam === 'metal' || fam === 'bone' ? primary : fam === 'crystal' ? crystal : surface('metal.steel', { repeat: 8, seed }),
    dark: surface('metal.dark', { repeat: 5, seed }),
    trim: surface(look.trimKey, { repeat: 6, seed, tint: look.trimTint }),
    wood: fam === 'bone' ? primary : surface(woodKey, { repeat: 5, seed }),
    leather: surface('leather.worn', { repeat: 6, seed }),
    cloth: look.set ? surface('cloth.silk', { repeat: 4, seed, tint: look.trimTint }) : surface('cloth.linen', { repeat: 4, seed }),
    crystal,
    glow: emissiveMaterial(look.glowColor, Math.max(0.6, deco.glow)),
    stone: gemMaterial(look.stone, { glow: Math.max(0.35, deco.glow * 0.5) }),
    accent: look.glowColor,
    deco,
    rng,
    ornate: Math.min(1, (visual.ornate ?? 0.35) + look.baseTier * 0.2),
    paletteKey: base,
    sub,
    look,
  };
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  normalizeGeometry(geo);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A wrapped grip: a ribbed lathe that reads as cord binding, not a dowel. */
function gripGeo(length: number, radius: number, ribs: number): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [];
  const rows = 12;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    // Waisted in the middle so the hand has somewhere to sit.
    const waist = 1 - Math.sin(t * Math.PI) * 0.12;
    profile.push([radius * waist, t * length]);
  }
  return latheModulated(profile, 12, (t, a) => 1 + Math.sin(t * ribs * Math.PI * 2 + a * 0.8) * 0.055);
}

/** A lathed pommel or counterweight. */
function pommelGeo(radius: number): THREE.BufferGeometry {
  return lathe(
    [
      [0.0001, -radius * 1.05],
      [radius * 0.5, -radius * 0.9],
      [radius * 0.95, -radius * 0.4],
      [radius, 0],
      [radius * 0.82, radius * 0.35],
      [radius * 0.45, radius * 0.55],
      [radius * 0.5, radius * 0.7],
      [0.0001, radius * 0.75],
    ],
    14,
  );
}

/** Adds gems, runes and glow appropriate to the rarity tier. */
function addRarityDressing(
  group: THREE.Group,
  kit: Kit,
  anchors: Array<{ pos: [number, number, number]; size: number; rot?: [number, number, number] }>,
  runeAt?: { pos: [number, number, number]; size: number; rot?: [number, number, number] },
): void {
  const { deco } = kit;
  if (deco.gems) {
    for (const a of anchors) {
      const g = mesh(gem(a.size, 8, 0.5), kit.stone);
      g.position.set(...a.pos);
      if (a.rot) g.rotation.set(...a.rot);
      g.castShadow = false;
      group.add(g);
    }
  }
  if (deco.runes && runeAt) {
    const plane = new THREE.PlaneGeometry(runeAt.size, runeAt.size);
    const r = new THREE.Mesh(plane, additiveMaterial(deco.accent, { map: runeRingTexture(256, 11), opacity: 0.85 }));
    r.position.set(...runeAt.pos);
    if (runeAt.rot) r.rotation.set(...runeAt.rot);
    r.renderOrder = 2;
    group.add(r);

    // Orbiting shards: motion the scene can drive off `userData.orbit`.
    for (let i = 0; i < 3; i++) {
      const shard = mesh(gem(runeAt.size * 0.11, 6, 0.4), kit.glow);
      const a = (i / 3) * Math.PI * 2;
      shard.position.set(
        Math.cos(a) * runeAt.size * 0.55,
        runeAt.pos[1] + (i - 1) * runeAt.size * 0.2,
        Math.sin(a) * runeAt.size * 0.55,
      );
      shard.castShadow = false;
      shard.userData.orbit = { radius: runeAt.size * 0.55, phase: a, y: shard.position.y };
      group.add(shard);
    }
  }
}

// ---------------------------------------------------------------------------
// Weapon builders — grip at origin, business end along +Y
// ---------------------------------------------------------------------------

/**
 * A flat plate cut from a 2D outline in the XY plane — axe bits, halberd
 * blades — extruded thin on Z and centred on it. `thin` scales the thickness
 * by position, so a bit can run from a thick socket to a keen edge.
 */
function plateGeo(outline: THREE.Shape, depth: number, thin?: (x: number, y: number) => number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(outline, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.3,
    bevelSize: depth * 0.3,
    bevelSegments: 1,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  if (thin) {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * thin(pos.getX(i), pos.getY(i)));
    pos.needsUpdate = true;
  }
  geo.clearGroups();
  geo.computeVertexNormals();
  return geo;
}

function smooth01(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A crescent axe bit growing out along +X from a haft at x = 0. `k` scales it. */
function axeBitGeo(k: number, beard = 1): THREE.BufferGeometry {
  const h0 = 0.075 * k;
  const w = 0.24 * k;
  const he = 0.16 * k;
  const s = new THREE.Shape();
  s.moveTo(0, h0);
  s.quadraticCurveTo(w * 0.42, h0 * 0.8, w * 0.86, he);
  s.quadraticCurveTo(w * 1.1, 0, w * 0.86, -he * beard);
  s.quadraticCurveTo(w * 0.42, -h0 * 0.7, 0, -h0);
  s.closePath();
  return plateGeo(s, 0.04 * Math.sqrt(k), (x) => 1 - 0.78 * smooth01(w * 0.45, w * 0.95, Math.abs(x)));
}

/** Bends a +Y geometry into a wave across X: a kris blade. */
function waveX(geo: THREE.BufferGeometry, amp: number, waves: number, length: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i) / length));
    pos.setX(i, pos.getX(i) + Math.sin(t * Math.PI * 2 * waves) * amp * (1 - t * 0.8));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

type GuardStyle = 'cross' | 'wing' | 'ring' | 'disc';

/**
 * Grip centred on the origin (where the hand closes), guard above it, pommel
 * below. Returns the height where the blade starts.
 */
function buildHilt(
  group: THREE.Group,
  kit: Kit,
  opts: { gripLen: number; gripR: number; guardW: number; guardH: number; guardD: number; pommel: number; style?: GuardStyle },
): number {
  const style = opts.style ?? 'cross';
  const half = opts.gripLen * 0.5;
  const grip = mesh(gripGeo(opts.gripLen, opts.gripR, 7), kit.leather);
  grip.position.y = -half;
  group.add(grip);

  const gy = half + opts.guardH * 0.5;
  const guardMat = kit.deco.trim ? kit.trim : kit.metal;
  if (style === 'disc') {
    const disc = mesh(
      lathe(
        [
          [opts.gripR * 1.2, -opts.guardH * 0.5],
          [opts.guardW * 0.5, -opts.guardH * 0.2],
          [opts.guardW * 0.5, opts.guardH * 0.2],
          [opts.gripR * 1.2, opts.guardH * 0.5],
        ],
        16,
      ),
      guardMat,
    );
    disc.position.y = gy;
    group.add(disc);
  } else {
    const bar = mesh(beveledBox(opts.guardW * 0.92, opts.guardH, opts.guardD, opts.guardH * 0.25), guardMat);
    bar.position.y = gy;
    group.add(bar);
    for (const s of [-1, 1]) {
      // Quillon tips: straight out for a cross, swept up toward the blade for wings.
      const wing = style === 'wing';
      const tip = mesh(spike(opts.guardW * (wing ? 0.34 : 0.2), opts.guardH * 0.55, 6, wing ? 0.6 : 0.15), guardMat);
      tip.position.set(s * opts.guardW * 0.44, gy, 0);
      tip.rotation.z = -s * (Math.PI * 0.5 - (wing ? 0.55 : 0));
      if (s < 0) tip.scale.x = -1;
      group.add(tip);
      if (kit.deco.fittings) {
        const lug = mesh(beveledBox(opts.guardH * 0.9, opts.guardH * 1.2, opts.guardD * 1.4, opts.guardH * 0.2), kit.trim);
        lug.position.set(s * opts.guardW * 0.22, gy, 0);
        group.add(lug);
      }
    }
  }
  if (style === 'ring') {
    // A knuckle bow sweeping from the guard to the pommel: the rapier read.
    const bow = mesh(new THREE.TorusGeometry(half + opts.pommel * 0.4, opts.gripR * 0.45, 6, 18, Math.PI), guardMat);
    bow.rotation.z = -Math.PI * 0.5;
    bow.position.set(0, -opts.pommel * 0.2, 0);
    bow.scale.set(0.55, 1, 1);
    group.add(bow);
    const cup = mesh(dome(opts.guardW * 0.34, 0.45, 14, 5), guardMat);
    cup.position.y = gy + opts.guardH * 0.3;
    cup.rotation.x = Math.PI;
    group.add(cup);
  }

  const pommel = mesh(pommelGeo(opts.pommel), kit.deco.trim ? kit.trim : kit.metal);
  pommel.position.y = -half - opts.pommel * 0.55;
  group.add(pommel);

  // A collar where the blade meets the guard, so the join reads as forged.
  const collar = mesh(
    lathe(
      [
        [opts.gripR * 1.5, 0],
        [opts.gripR * 1.9, opts.guardH * 0.35],
        [opts.gripR * 1.3, opts.guardH * 0.9],
      ],
      12,
    ),
    kit.trim,
  );
  collar.position.y = gy + opts.guardH * 0.3;
  group.add(collar);
  return gy + opts.guardH * 0.5;
}

interface SwordProfile {
  len: number;
  width: number;
  thick: number;
  taper: number;
  tip: number;
  fuller: number;
  gripLen: number;
  guardW: number;
  guardH: number;
  pommel: number;
  style: GuardStyle;
}

function swordProfile(sub: string, rng: Rng): SwordProfile {
  // Heroic proportions; each sub-type has its own blade and hilt, matching its icon.
  if (sub === 'thin') {
    return { len: rng.range(0.86, 0.98), width: 0.052, thick: 0.022, taper: 0.8, tip: 0.9, fuller: 0.25, gripLen: 0.17, guardW: 0.17, guardH: 0.026, pommel: 0.034, style: 'ring' };
  }
  if (sub === 'great') {
    return { len: rng.range(1.04, 1.18), width: rng.range(0.15, 0.17), thick: 0.042, taper: 0.78, tip: 0.8, fuller: 0.55, gripLen: 0.34, guardW: 0.5, guardH: 0.06, pommel: 0.06, style: 'wing' };
  }
  if (sub === 'broad') {
    return { len: rng.range(0.72, 0.8), width: rng.range(0.19, 0.21), thick: 0.04, taper: 0.9, tip: 0.8, fuller: 0.45, gripLen: 0.19, guardW: 0.42, guardH: 0.055, pommel: 0.05, style: 'cross' };
  }
  return { len: rng.range(0.7, 0.84), width: rng.range(0.115, 0.145), thick: 0.036, taper: 0.72, tip: 0.74, fuller: 0.55, gripLen: 0.19, guardW: 0.36, guardH: 0.05, pommel: 0.045, style: 'cross' };
}

function buildSword(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  const P = swordProfile(sub, kit.rng);
  const base = buildHilt(g, kit, {
    gripLen: P.gripLen,
    gripR: sub === 'great' ? 0.026 : 0.023,
    guardW: P.guardW,
    guardH: P.guardH,
    guardD: 0.036,
    pommel: P.pommel,
    style: P.style,
  });

  const bm = mesh(blade(P.len, P.width, P.thick, { taper: P.taper, fuller: P.fuller, tip: P.tip, edges: 10 }), kit.metal);
  bm.position.y = base;
  g.add(bm);
  kit.head = { y: base + P.len * 0.55, r: P.width };

  if (sub === 'great') {
    // A leather-wrapped ricasso with parrying lugs: what makes a zweihander.
    const ric = mesh(gripGeo(0.12, P.width * 0.22, 5), kit.leather);
    ric.position.y = base + 0.01;
    g.add(ric);
    for (const s of [-1, 1]) {
      const lug = mesh(spike(0.07, 0.014, 5, 0.3), kit.metal);
      lug.position.set(s * P.width * 0.32, base + 0.14, 0);
      lug.rotation.z = -s * 1.2;
      if (s < 0) lug.scale.x = -1;
      g.add(lug);
    }
  }
  if (kit.deco.trim) {
    const band = mesh(beveledBox(P.width * 0.9, 0.03, P.thick * 0.75, 0.006), kit.trim);
    band.position.y = base + (sub === 'great' ? 0.15 : 0.025);
    g.add(band);
  }
  if (kit.deco.runes) {
    // Glowing inlay running the length of the fuller.
    const inlay = mesh(beveledBox(Math.max(0.008, P.width * 0.16), P.len * 0.6, 0.006, 0.002), kit.glow);
    inlay.position.set(0, base + P.len * 0.38, P.thick * 0.32);
    inlay.castShadow = false;
    g.add(inlay);
    const back = inlay.clone();
    back.position.z = -P.thick * 0.32;
    g.add(back);
  }

  addRarityDressing(
    g,
    kit,
    [
      { pos: [0, -P.gripLen * 0.5 - P.pommel * 0.6, 0], size: P.pommel * 0.45 },
      { pos: [0, base - P.guardH * 0.5, 0.022], size: 0.016, rot: [Math.PI * 0.5, 0, 0] },
    ],
    { pos: [0, base + P.len * 0.5, 0], size: P.len * 0.42 },
  );
}

function buildDagger(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const sub = kit.sub;
  const len = sub === 'needle' ? rng.range(0.36, 0.42) : rng.range(0.32, 0.4);
  const width = sub === 'needle' ? 0.03 : sub === 'wavy' ? 0.07 : 0.08;
  const gripLen = 0.1;

  const base = buildHilt(g, kit, {
    gripLen,
    gripR: 0.014,
    guardW: sub === 'needle' ? 0.1 : width * 1.9,
    guardH: 0.022,
    guardD: 0.018,
    pommel: 0.02,
    style: sub === 'needle' ? 'disc' : 'cross',
  });

  let bl: THREE.BufferGeometry;
  if (sub === 'needle') {
    // A square-section spike: a stiletto is all point.
    bl = blade(len, width, 0.026, { taper: 0.55, fuller: 0, tip: 0.35, edges: 4 });
  } else if (sub === 'wavy') {
    bl = waveX(blade(len, width, 0.016, { taper: 0.5, fuller: 0.25, tip: 0.8, edges: 8 }), width * 0.22, 2.5, len);
  } else {
    bl = blade(len, width, 0.016, { taper: 0.42, fuller: 0.3, tip: 0.62, curve: 0.9, edges: 8 });
  }
  const bm = mesh(bl, kit.metal);
  bm.position.y = base;
  g.add(bm);
  kit.head = { y: base + len * 0.5, r: width };

  if (kit.deco.fittings && sub !== 'needle') {
    const barb = mesh(spike(0.05, 0.012, 5, 0.5), kit.metal);
    barb.position.set(width * 0.42, base + 0.025, 0);
    barb.rotation.z = -0.9;
    g.add(barb);
  }
  if (kit.deco.runes) {
    const inlay = mesh(beveledBox(0.008, len * 0.5, 0.005, 0.002), kit.glow);
    inlay.position.set(0, base + len * 0.34, 0.009);
    inlay.castShadow = false;
    g.add(inlay);
  }
  addRarityDressing(g, kit, [{ pos: [0, -gripLen * 0.5 - 0.012, 0], size: 0.015 }], {
    pos: [0, base + len * 0.5, 0],
    size: len * 0.4,
  });
}

/** A haft along +Y from just below the hand to `len`, in wood with a cord wrap. */
function haft(kit: Kit, g: THREE.Group, len: number, r: number, wrapLen = 0.16): void {
  g.add(
    mesh(
      latheModulated(
        [
          [r * 0.95, -0.08],
          [r * 1.1, 0.02],
          [r, len * 0.5],
          [r * 1.05, len * 0.9],
          [r * 1.1, len],
          [0.0001, len + 0.01],
        ],
        10,
        (t, a) => 1 + Math.sin(t * 26 + a) * 0.03,
      ),
      kit.wood,
    ),
  );
  const wrap = mesh(gripGeo(wrapLen, r * 1.15, 6), kit.leather);
  wrap.position.y = -wrapLen * 0.5;
  g.add(wrap);
}

function buildAxe(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const sub = kit.sub;
  const double = sub === 'broad';
  const big = sub === 'great' || sub === 'broad';
  const k = sub === 'hand' ? 0.78 : sub === 'great' ? 1.3 : double ? 1.12 : 1.0;
  const len = sub === 'hand' ? rng.range(0.44, 0.52) : big ? rng.range(0.96, 1.06) : rng.range(0.66, 0.78);
  const headY = len - 0.07 * k;
  haft(kit, g, len, big ? 0.024 : 0.02, big ? 0.3 : 0.16);

  // The bit: a crescent plate, wide on X and keen at the edge.
  const bitGeo = axeBitGeo(k, sub === 'hand' ? 1.25 : 1);
  const bit = mesh(bitGeo, kit.edge);
  bit.position.set(0.02, headY, 0);
  g.add(bit);
  if (double) {
    const bit2 = mesh(bitGeo.clone(), kit.edge);
    bit2.position.set(-0.02, headY, 0);
    bit2.rotation.y = Math.PI;
    g.add(bit2);
  }
  // A bright bevel along the cutting arc.
  const edge = mesh(beveledBox(0.012, 0.25 * k, 0.012, 0.003), kit.deco.trim ? kit.trim : kit.metal);
  edge.position.set(0.235 * k, headY, 0);
  g.add(edge);
  if (double) {
    const e2 = edge.clone();
    e2.position.x = -0.235 * k;
    g.add(e2);
  }

  const socket = mesh(
    lathe(
      [
        [0.028, headY - 0.1 * k],
        [0.042, headY - 0.06 * k],
        [0.042, headY + 0.06 * k],
        [0.028, headY + 0.1 * k],
      ],
      12,
    ),
    kit.dark,
  );
  g.add(socket);
  kit.head = { y: headY, r: 0.2 * k };

  if (!double && (sub === 'war' || sub === 'great' || kit.deco.fittings)) {
    // A back spike balances the head.
    const back = mesh(spike(0.12 * k, 0.026 * k, 5, -0.25), kit.edge);
    back.position.set(-0.03, headY, 0);
    back.rotation.z = Math.PI * 0.5;
    g.add(back);
  }
  if (sub === 'great') {
    const top = mesh(spike(0.14, 0.024, 6, 0), kit.edge);
    top.position.y = headY + 0.08;
    g.add(top);
  }
  if (kit.deco.fittings) {
    for (const s of [-1, 1]) {
      const langet = mesh(taperedBox(0.018, 0.012, 0.01, 0.008, 0.16, 0.003), kit.trim);
      langet.position.set(0, headY - 0.14 * k, s * 0.021);
      g.add(langet);
    }
  }
  if (kit.deco.runes) {
    for (const s of double ? [1, -1] : [1]) {
      const inlay = mesh(new THREE.PlaneGeometry(0.14 * k, 0.14 * k), additiveMaterial(kit.accent, { map: runeRingTexture(256, 5), opacity: 0.9 }));
      inlay.position.set(s * 0.13 * k, headY, 0.022);
      g.add(inlay);
    }
  }
  addRarityDressing(g, kit, [{ pos: [0, headY, 0.04], size: 0.022, rot: [Math.PI * 0.5, 0, 0] }]);
}

function buildClub(kit: Kit, g: THREE.Group): void {
  // A swelling cudgel of knotted wood, iron-studded: no head, the whole thing is the weapon.
  const rng = kit.rng;
  const len = rng.range(0.6, 0.7);
  const geo = latheModulated(
    [
      [0.0001, -0.09],
      [0.024, -0.08],
      [0.022, 0.05],
      [0.03, len * 0.45],
      [0.05, len * 0.8],
      [0.056, len * 0.95],
      [0.0001, len + 0.02],
    ],
    12,
    (t, a) => 1 + Math.sin(t * 9 + a * 3) * 0.08 * t,
  );
  displace(geo, rng, 0.006, 12);
  g.add(mesh(geo, kit.wood));
  const wrap = mesh(gripGeo(0.16, 0.026, 6), kit.leather);
  wrap.position.y = -0.07;
  g.add(wrap);
  const studs = 6 + Math.round(kit.ornate * 6);
  for (let i = 0; i < studs; i++) {
    const a = i * 2.4;
    const y = len * (0.55 + (i / studs) * 0.38);
    const r = 0.03 + (y / len) * 0.022;
    const st = mesh(spike(0.03, 0.01, 5, 0), kit.paletteKey.startsWith('metal') ? kit.metal : kit.dark);
    const dir = new THREE.Vector3(Math.cos(a), 0.15, Math.sin(a)).normalize();
    st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    st.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    g.add(st);
  }
  if (kit.deco.trim) {
    const band = mesh(ring(0.034, 0.007, 16, 5), kit.trim);
    band.rotation.x = Math.PI * 0.5;
    band.position.y = len * 0.5;
    g.add(band);
  }
  kit.head = { y: len * 0.8, r: 0.07 };
  addRarityDressing(g, kit, [{ pos: [0, -0.085, 0], size: 0.018 }], { pos: [0, len * 0.8, 0], size: 0.3 });
}

function buildMace(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const sub = kit.sub;
  if (sub === 'club') {
    buildClub(kit, g);
    return;
  }
  const hammer = sub === 'war' || sub === 'great';
  const great = sub === 'great';
  const len = great ? rng.range(0.86, 0.96) : hammer ? rng.range(0.56, 0.64) : rng.range(0.5, 0.68);
  const headY = len + (hammer ? 0.02 : 0.06);
  g.add(
    mesh(
      lathe(
        [
          [0.0001, -0.08],
          [0.026, -0.07],
          [0.021, 0.0],
          [0.019, len * 0.6],
          [0.024, len],
        ],
        10,
      ),
      great ? kit.wood : kit.dark,
    ),
  );
  const gripWrap = mesh(gripGeo(great ? 0.3 : 0.16, 0.024, 6), kit.leather);
  gripWrap.position.y = great ? -0.12 : -0.06;
  g.add(gripWrap);

  if (hammer) {
    // A block head, faced on +X and spiked behind: a warhammer, or a maul's slab.
    const hw = great ? 0.3 : 0.2;
    const hh = great ? 0.16 : 0.09;
    const head = mesh(beveledBox(great ? hw : hw * 0.55, hh, hh, hh * 0.12), kit.metal);
    head.position.set(great ? 0 : hw * 0.12, headY, 0);
    g.add(head);
    const faceGeo = lathe(
      [
        [0.0001, 0],
        [hh * 0.62, 0],
        [hh * 0.6, hh * 0.25],
        [hh * 0.48, hh * 0.32],
        [0.0001, hh * 0.34],
      ],
      10,
    );
    const face = mesh(faceGeo, kit.metal);
    face.rotation.z = -Math.PI * 0.5;
    face.position.set(great ? hw * 0.5 : hw * 0.4, headY, 0);
    g.add(face);
    if (great) {
      const face2 = mesh(faceGeo.clone(), kit.metal);
      face2.rotation.z = Math.PI * 0.5;
      face2.position.set(-hw * 0.5, headY, 0);
      g.add(face2);
      for (const s of [-1, 1]) {
        const band = mesh(beveledBox(0.022, hh * 1.08, hh * 1.08, 0.005), kit.deco.trim ? kit.trim : kit.dark);
        band.position.set(s * hw * 0.3, headY, 0);
        g.add(band);
      }
    } else {
      const back = mesh(spike(0.13, 0.03, 4, -0.35), kit.metal);
      back.position.set(-hw * 0.12, headY, 0);
      back.rotation.z = Math.PI * 0.5;
      g.add(back);
      const top = mesh(spike(0.08, 0.02, 4, 0), kit.metal);
      top.position.y = headY + hh * 0.5;
      g.add(top);
    }
    kit.head = { y: headY, r: hw * 0.6 };
    addRarityDressing(g, kit, [{ pos: [0, headY, hh * 0.56], size: 0.02, rot: [Math.PI * 0.5, 0, 0] }], { pos: [0, headY, 0], size: hw * 1.4 });
    return;
  }

  // Flanged: a lathed core with blade flanges so the silhouette is spiky, not round.
  const head = lathe(
    [
      [0.0001, headY - 0.09],
      [0.05, headY - 0.07],
      [0.068, headY - 0.02],
      [0.068, headY + 0.02],
      [0.048, headY + 0.07],
      [0.0001, headY + 0.085],
    ],
    14,
  );
  g.add(mesh(head, kit.metal));
  const flanges = Math.round(4 + kit.ornate * 4);
  for (let i = 0; i < flanges; i++) {
    const a = (i / flanges) * Math.PI * 2;
    const fl = mesh(taperedBox(0.02, 0.055, 0.008, 0.03, 0.1, 0.005), kit.metal);
    fl.position.set(Math.cos(a) * 0.06, headY, Math.sin(a) * 0.06);
    fl.rotation.order = 'YXZ';
    fl.rotation.set(0, -a, Math.PI * 0.5);
    g.add(fl);
  }
  const cap = mesh(spike(0.06, 0.022, 6, 0), kit.deco.trim ? kit.trim : kit.metal);
  cap.position.y = headY + 0.08;
  g.add(cap);
  if (kit.deco.runes) {
    const core = mesh(dome(0.03, 1, 10, 5), kit.glow);
    core.position.y = headY;
    core.castShadow = false;
    g.add(core);
  }
  kit.head = { y: headY, r: 0.1 };
  addRarityDressing(g, kit, [{ pos: [0, -0.075, 0], size: 0.018 }], { pos: [0, headY, 0], size: 0.28 });
}

function buildSpear(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const sub = kit.sub;
  const len = sub === 'pike' ? rng.range(1.75, 1.95) : sub === 'halberd' ? rng.range(1.55, 1.7) : rng.range(1.35, 1.6);
  g.add(
    mesh(
      latheModulated(
        [
          [0.0001, -0.16],
          [0.02, -0.14],
          [0.018, 0],
          [0.017, len * 0.7],
          [0.019, len],
        ],
        10,
        (t, a) => 1 + Math.sin(t * 40 + a) * 0.02,
      ),
      kit.wood,
    ),
  );
  const socket = mesh(
    lathe(
      [
        [0.024, len - 0.09],
        [0.032, len - 0.04],
        [0.03, len + 0.03],
        [0.022, len + 0.06],
      ],
      12,
    ),
    kit.dark,
  );
  g.add(socket);

  if (sub === 'trident') {
    const bar = mesh(beveledBox(0.2, 0.03, 0.026, 0.008), kit.edge);
    bar.position.y = len + 0.05;
    g.add(bar);
    const mid = mesh(blade(0.26, 0.045, 0.018, { taper: 0.8, tip: 0.6, edges: 6 }), kit.edge);
    mid.position.y = len + 0.06;
    g.add(mid);
    for (const s of [-1, 1]) {
      const prong = mesh(blade(0.2, 0.034, 0.016, { taper: 0.8, tip: 0.6, edges: 6 }), kit.edge);
      prong.position.set(s * 0.09, len + 0.06, 0);
      prong.rotation.z = -s * 0.08;
      g.add(prong);
      const barb = mesh(spike(0.04, 0.008, 4, 0), kit.edge);
      barb.position.set(s * 0.104, len + 0.2, 0);
      barb.rotation.z = s * 2.4;
      g.add(barb);
    }
    kit.head = { y: len + 0.16, r: 0.12 };
  } else {
    const headLen = sub === 'pike' ? 0.26 : sub === 'halberd' ? 0.24 : 0.3;
    const headW = sub === 'pike' ? 0.045 : sub === 'halberd' ? 0.055 : 0.075;
    const hm = mesh(blade(headLen, headW, 0.02, { taper: 0.85, fuller: 0.4, tip: 0.6, edges: 8 }), kit.edge);
    hm.position.y = len + 0.02;
    g.add(hm);
    kit.head = { y: len + headLen * 0.4, r: headW };
    if (sub === 'halberd') {
      // An axe blade on one side, a hook on the other: what makes it a halberd.
      const bit = mesh(axeBitGeo(0.95, 1.2), kit.edge);
      bit.position.set(0.02, len - 0.04, 0);
      g.add(bit);
      const hook = mesh(spike(0.13, 0.022, 5, 0.6), kit.edge);
      hook.position.set(-0.03, len - 0.04, 0);
      hook.rotation.z = Math.PI * 0.5;
      g.add(hook);
      kit.head = { y: len, r: 0.2 };
    } else if (sub !== 'pike' && kit.deco.fittings) {
      for (const s of [-1, 1]) {
        const wing = mesh(taperedBox(0.05, 0.012, 0.012, 0.008, 0.1, 0.004), kit.edge);
        wing.position.set(s * 0.035, len + 0.03, 0);
        wing.rotation.z = -s * 0.9;
        g.add(wing);
      }
    }
  }
  if (sub === 'pike' && kit.deco.trim) {
    const tassel = mesh(clothPanel(0.06, 0.16, kit.rng, { segsX: 3, segsY: 4, ripple: 0.08, flare: 0.6 }), kit.cloth);
    tassel.position.set(0, len - 0.06, 0);
    g.add(tassel);
  }
  const butt = mesh(spike(0.1, 0.02, 6, 0), kit.dark);
  butt.rotation.x = Math.PI;
  butt.position.y = -0.14;
  g.add(butt);
  const wrap = mesh(gripGeo(0.24, 0.022, 9), kit.leather);
  wrap.position.y = -0.12;
  g.add(wrap);

  if (kit.deco.runes) {
    const inlay = mesh(beveledBox(0.008, 0.18, 0.005, 0.002), kit.glow);
    inlay.position.set(0, len + 0.12, 0.011);
    inlay.castShadow = false;
    g.add(inlay);
  }
  addRarityDressing(g, kit, [{ pos: [0, len - 0.06, 0.03], size: 0.018, rot: [Math.PI * 0.5, 0, 0] }]);
}

function buildStaff(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const sub = kit.sub;
  const len = rng.range(1.5, 1.75);
  const battle = sub === 'battle';
  const shaftGeo = latheModulated(
    [
      [0.0001, -0.2],
      [0.022, -0.18],
      [0.024, 0],
      [0.02, len * 0.6],
      [0.026, len * 0.9],
      [0.022, len],
    ],
    12,
    (t, a) => 1 + Math.sin(t * 18 + a * 2) * (battle ? 0.01 : 0.045),
  );
  if (!battle) {
    // A gnarled, twisted stave rather than a broom handle.
    twist(shaftGeo, 0.6);
    displace(shaftGeo, kit.rng, 0.008, 6);
  }
  const fam = kit.paletteKey.split('.')[0];
  g.add(mesh(shaftGeo, fam === 'metal' ? kit.metal : fam === 'crystal' ? kit.dark : kit.wood));

  const wrap = mesh(gripGeo(0.3, 0.028, 10), kit.leather);
  wrap.position.y = -0.15;
  g.add(wrap);

  if (battle) {
    // A quarterstaff shod in iron: banded ends and a spiked ferrule up top.
    for (const y of [len - 0.06, len * 0.62, 0.22, -0.16]) {
      const band = mesh(ring(0.027, 0.008, 14, 5), kit.deco.trim ? kit.trim : kit.dark);
      band.rotation.x = Math.PI * 0.5;
      band.position.y = y;
      g.add(band);
    }
    const cap = mesh(
      lathe(
        [
          [0.024, 0],
          [0.034, 0.04],
          [0.026, 0.09],
          [0.0001, 0.1],
        ],
        10,
      ),
      kit.edge,
    );
    cap.position.y = len - 0.02;
    g.add(cap);
    const tip = mesh(spike(0.16, 0.02, 6, 0), kit.edge);
    tip.position.y = len + 0.08;
    g.add(tip);
    kit.head = { y: len + 0.06, r: 0.08 };
    addRarityDressing(g, kit, [{ pos: [0, len * 0.5, 0.024], size: 0.02, rot: [Math.PI * 0.5, 0, 0] }]);
    return;
  }

  // Crown: claws holding a focus stone.
  const claws = Math.round(3 + kit.ornate * 2) + (sub === 'rune' ? 1 : 0);
  for (let i = 0; i < claws; i++) {
    const a = (i / claws) * Math.PI * 2;
    const claw = mesh(spike(0.16, 0.016, 5, 0.55), kit.deco.trim ? kit.trim : kit.dark);
    claw.position.set(Math.cos(a) * 0.03, len - 0.02, Math.sin(a) * 0.03);
    claw.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5);
    g.add(claw);
  }
  const focus = mesh(gem(sub === 'rune' ? 0.075 : 0.055, 8, 0.55), kit.deco.tier >= 2 ? kit.stone : kit.crystal);
  focus.position.y = len + 0.06;
  focus.castShadow = false;
  g.add(focus);
  if (sub === 'rune') {
    // Glowing rune bands climbing the shaft.
    const bandMat = emissiveMaterial(kit.look.stone, 1.4);
    for (const y of [len * 0.35, len * 0.55, len * 0.75]) {
      const band = mesh(ring(0.029, 0.006, 14, 4), bandMat);
      band.rotation.x = Math.PI * 0.5;
      band.position.y = y;
      band.castShadow = false;
      g.add(band);
    }
  }
  kit.head = { y: len + 0.06, r: 0.1 };

  if (kit.deco.runes) {
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), additiveMaterial(kit.accent, { map: runeRingTexture(256, 7), opacity: 0.8 }));
    halo.position.y = len + 0.06;
    halo.rotation.x = -Math.PI * 0.5;
    halo.userData.spin = 0.8;
    g.add(halo);
  }
  addRarityDressing(g, kit, [{ pos: [0, len * 0.5, 0.026], size: 0.02, rot: [Math.PI * 0.5, 0, 0] }]);
}

function buildWand(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  const len = kit.rng.range(0.32, 0.42);
  if (sub === 'bone') {
    // A femur: knuckled at both ends, the shaft pale and pitted.
    const geo = latheModulated(
      [
        [0.0001, -0.06],
        [0.024, -0.05],
        [0.03, -0.02],
        [0.016, 0.04],
        [0.013, len * 0.5],
        [0.017, len * 0.85],
        [0.032, len * 0.95],
        [0.026, len * 1.02],
        [0.0001, len * 1.05],
      ],
      10,
      (t, a) => 1 + (t > 0.85 ? Math.sin(a * 2) * 0.22 : 0),
    );
    displace(geo, kit.rng, 0.002, 30);
    g.add(mesh(geo, kit.paletteKey.startsWith('bone') ? kit.metal : surface('bone.pale', { repeat: 4, seed: 0 })));
  } else {
    const core = latheModulated(
      [
        [0.0001, -0.05],
        [0.02, -0.04],
        [0.016, 0.02],
        [0.012, len * 0.7],
        [0.016, len * 0.9],
        [0.0001, len],
      ],
      10,
      (t, a) => 1 + Math.sin(t * 22 + a) * 0.06,
    );
    if (sub !== 'crystal') twist(core, 0.9);
    g.add(mesh(core, sub === 'crystal' ? kit.dark : kit.wood));
  }

  const grip = mesh(gripGeo(0.11, 0.018, 6), kit.leather);
  grip.position.y = -0.055;
  g.add(grip);

  if (sub === 'crystal') {
    // A long crystal shard set in a claw: the wand is mostly focus.
    const shard = mesh(gem(0.034, 6, 0.4), kit.crystal);
    shard.scale.set(1, -2.4, 1);
    shard.position.y = len + 0.02;
    shard.castShadow = false;
    g.add(shard);
    const core = mesh(gem(0.018, 6, 0.4), kit.stone);
    core.scale.set(1, -2, 1);
    core.position.y = len + 0.03;
    g.add(core);
    for (const s of [-1, 1]) {
      const prong = mesh(spike(0.08, 0.008, 4, 0.5), kit.deco.trim ? kit.trim : kit.dark);
      prong.position.set(s * 0.016, len - 0.03, 0);
      prong.rotation.z = -s * 0.35;
      if (s < 0) prong.scale.x = -1;
      g.add(prong);
    }
    kit.head = { y: len + 0.08, r: 0.06 };
  } else {
    const tip = mesh(gem(sub === 'bone' ? 0.026 : 0.032, 6, 0.5), kit.deco.tier >= 1 ? kit.stone : gemMaterial(kit.accent, { glow: 0.7 }));
    tip.position.y = len + (sub === 'bone' ? 0.05 : 0.02);
    tip.castShadow = false;
    g.add(tip);
    if (kit.deco.fittings) {
      for (const s of [-1, 1]) {
        const prong = mesh(spike(0.07, 0.008, 4, 0.5), kit.trim);
        prong.position.set(s * 0.014, len - 0.03, 0);
        prong.rotation.z = -s * 0.5;
        g.add(prong);
      }
    }
    kit.head = { y: len + 0.03, r: 0.05 };
  }
  addRarityDressing(g, kit, [{ pos: [0, len * 0.45, 0.016], size: 0.012, rot: [Math.PI * 0.5, 0, 0] }], {
    pos: [0, len + 0.02, 0],
    size: 0.18,
  });
}

function buildScepter(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  const len = kit.rng.range(0.55, 0.68);
  g.add(
    mesh(
      lathe(
        [
          [0.0001, -0.09],
          [0.03, -0.075],
          [0.022, -0.02],
          [0.018, len * 0.55],
          [0.03, len * 0.78],
          [0.026, len * 0.84],
        ],
        14,
      ),
      kit.metal,
    ),
  );
  const grip = mesh(gripGeo(0.15, 0.022, 7), kit.leather);
  grip.position.y = -0.075;
  g.add(grip);
  const headMat = kit.deco.trim ? kit.trim : kit.metal;
  const hy = len * 0.84;

  if (sub === 'orbed') {
    // An orb held in a ring of bands: holy, round, glowing.
    const orb = mesh(new THREE.IcosahedronGeometry(0.058, 2), kit.stone);
    orb.position.y = hy + 0.07;
    orb.castShadow = false;
    g.add(orb);
    const cup = mesh(
      lathe(
        [
          [0.024, 0],
          [0.05, 0.02],
          [0.062, 0.05],
          [0.058, 0.06],
        ],
        14,
      ),
      headMat,
    );
    cup.position.y = hy;
    g.add(cup);
    for (let i = 0; i < 2; i++) {
      const band = mesh(new THREE.TorusGeometry(0.064, 0.006, 5, 14, Math.PI), headMat);
      band.position.y = hy + 0.07;
      band.rotation.set(0, (i * Math.PI) / 2, 0);
      g.add(band);
    }
    const finial = mesh(spike(0.05, 0.012, 6, 0), headMat);
    finial.position.y = hy + 0.13;
    g.add(finial);
    kit.head = { y: hy + 0.07, r: 0.08 };
    addRarityDressing(g, kit, [{ pos: [0, -0.1, 0], size: 0.018 }], { pos: [0, hy + 0.07, 0], size: 0.26 });
    return;
  }
  if (sub === 'spiked') {
    // A gilded morning-star head: rays standing out all round, like a sun.
    const core = mesh(new THREE.IcosahedronGeometry(0.05, 1), headMat);
    core.position.y = hy + 0.06;
    g.add(core);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const el = i % 2 ? 0.35 : -0.25;
      const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      const ray = mesh(spike(0.07, 0.014, 5, 0), headMat);
      ray.quaternion.setFromUnitVectors(up, dir);
      ray.position.set(0, hy + 0.06, 0).addScaledVector(dir, 0.035);
      g.add(ray);
    }
    const top = mesh(spike(0.09, 0.016, 6, 0), headMat);
    top.position.y = hy + 0.1;
    g.add(top);
    kit.head = { y: hy + 0.06, r: 0.1 };
    addRarityDressing(g, kit, [{ pos: [0, hy + 0.06, 0.05], size: 0.018, rot: [Math.PI * 0.5, 0, 0] }], { pos: [0, hy + 0.06, 0], size: 0.28 });
    return;
  }

  // A crowned cage around a stone.
  const cage = mesh(
    lathe(
      [
        [0.026, len * 0.84],
        [0.06, len * 0.9],
        [0.062, len * 1.0],
        [0.036, len * 1.08],
        [0.042, len * 1.12],
        [0.0001, len * 1.16],
      ],
      14,
    ),
    headMat,
  );
  g.add(cage);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const bar = mesh(taperedBox(0.01, 0.01, 0.008, 0.008, 0.13, 0.002), kit.trim);
    bar.position.set(Math.cos(a) * 0.05, len * 0.96, Math.sin(a) * 0.05);
    bar.rotation.set(Math.cos(a) * -0.2, -a, Math.sin(a) * 0.2);
    g.add(bar);
  }
  const stone = mesh(gem(0.038, 8, 0.5), kit.deco.tier >= 1 ? kit.stone : gemMaterial(kit.accent, { glow: 0.5 }));
  stone.position.y = len * 0.96;
  stone.castShadow = false;
  g.add(stone);
  kit.head = { y: len * 0.98, r: 0.08 };
  addRarityDressing(g, kit, [{ pos: [0, -0.1, 0], size: 0.018 }], { pos: [0, len * 0.96, 0], size: 0.24 });
}

function buildBow(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const sub = kit.sub;
  const span = sub === 'short' ? rng.range(0.9, 1.0) : sub === 'great' ? rng.range(1.42, 1.55) : sub === 'war' ? rng.range(1.25, 1.35) : rng.range(1.3, 1.42);
  const depth = sub === 'short' ? 0.13 : sub === 'war' || sub === 'great' ? 0.2 : 0.16;
  // War and great bows recurve hard at the tips; a longbow is one smooth arc.
  const recurve = sub === 'war' || sub === 'great' ? 2.2 : sub === 'long' ? 0.4 : 1.5;
  const fam = kit.paletteKey.split('.')[0];
  const limbMat = fam === 'metal' ? kit.metal : fam === 'crystal' ? kit.crystal : kit.wood;
  const thick = sub === 'great' ? 1.2 : sub === 'short' ? 0.85 : 1;
  const zt = -depth + depth * recurve;

  for (const s of [-1, 1]) {
    const segs = 8;
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const y0 = s * span * 0.5 * t0;
      const y1 = s * span * 0.5 * t1;
      const z0 = -Math.pow(t0, 1.6) * depth + Math.pow(t0, 5) * depth * recurve;
      const z1 = -Math.pow(t1, 1.6) * depth + Math.pow(t1, 5) * depth * recurve;
      const w = 0.026 * thick * (1 - t0 * 0.62);
      const seg = beveledBox(w, Math.hypot(y1 - y0, z1 - z0) * 1.08, w * 1.7, w * 0.25, 1);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, y1 - y0, z1 - z0).normalize());
      m.compose(new THREE.Vector3(0, (y0 + y1) * 0.5, (z0 + z1) * 0.5), q, new THREE.Vector3(1, 1, 1));
      parts.push(seg.clone().applyMatrix4(m));
      seg.dispose();
    }
    const limbGeo = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    g.add(mesh(limbGeo, limbMat));
    const nock = mesh(beveledBox(0.02, 0.03, 0.026, 0.005), kit.deco.trim ? kit.trim : kit.dark);
    nock.position.set(0, s * span * 0.5, zt);
    g.add(nock);
    if (sub === 'war' || kit.deco.fittings) {
      // Horn tips: the war bow's silhouette, and a rare's fitting.
      const horn = mesh(spike(0.07, 0.012, 5, 0.5), kit.deco.trim ? kit.trim : kit.dark);
      horn.position.set(0, s * span * 0.5, zt);
      horn.rotation.x = s > 0 ? 0.6 : Math.PI - 0.6;
      g.add(horn);
    }
  }

  const riser = mesh(taperedBox(0.045, 0.05, 0.03, 0.038, 0.26, 0.01), kit.deco.trim ? kit.trim : kit.dark);
  g.add(riser);
  const grip = mesh(gripGeo(0.14, 0.022, 6), kit.leather);
  grip.position.y = -0.07;
  g.add(grip);

  // String: straight between the nocks.
  const string = mesh(beveledBox(0.005, span, 0.005, 0.001), kit.dark);
  string.position.z = zt;
  string.castShadow = false;
  g.add(string);
  kit.head = { y: 0, r: 0.12 };

  if (kit.deco.runes) {
    const inlay = mesh(new THREE.PlaneGeometry(0.16, 0.16), additiveMaterial(kit.accent, { map: runeRingTexture(256, 3), opacity: 0.85 }));
    inlay.position.set(0, 0, 0.03);
    g.add(inlay);
  }
  addRarityDressing(g, kit, [
    { pos: [0, 0.1, 0.022], size: 0.016, rot: [Math.PI * 0.5, 0, 0] },
    { pos: [0, -0.1, 0.022], size: 0.016, rot: [Math.PI * 0.5, 0, 0] },
  ]);
}

function buildCrossbow(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  const heavy = sub === 'heavy';
  const prodW = heavy ? 0.74 : sub === 'repeat' ? 0.5 : 0.56;
  const fam = kit.paletteKey.split('.')[0];
  const stockMat = fam === 'wood' ? kit.metal : kit.wood;
  const prodMat = fam === 'metal' ? kit.metal : kit.edge;
  const stock = mesh(taperedBox(heavy ? 0.065 : 0.05, heavy ? 0.085 : 0.07, 0.035, 0.05, heavy ? 0.58 : 0.52, 0.008), stockMat);
  stock.position.y = 0.12;
  g.add(stock);

  // The prod: two limbs tapering out along X from the stock, swept slightly forward.
  for (const s of [-1, 1]) {
    const limb = mesh(taperedBox(heavy ? 0.05 : 0.04, heavy ? 0.034 : 0.026, 0.016, 0.014, prodW * 0.5, 0.006), prodMat);
    limb.rotation.set(0, s * 0.12, -s * Math.PI * 0.5);
    limb.position.set(s * prodW * 0.25, 0.34, 0.012);
    g.add(limb);
    const tip = mesh(taperedBox(0.018, 0.016, 0.01, 0.01, 0.06, 0.003), prodMat);
    tip.position.set(s * prodW * 0.5, 0.33, -0.005);
    tip.rotation.set(0, 0, -s * 2.4);
    g.add(tip);
  }
  const string = mesh(beveledBox(prodW, 0.005, 0.005, 0.001), kit.dark);
  string.position.set(0, 0.3, -0.03);
  string.castShadow = false;
  g.add(string);
  const lath = mesh(beveledBox(0.09, 0.06, 0.06, 0.012), kit.dark);
  lath.position.y = 0.3;
  g.add(lath);

  if (heavy) {
    // A windlass at the butt: a siege crossbow is cranked, not drawn.
    const drum = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), kit.dark);
    drum.rotation.z = Math.PI * 0.5;
    drum.position.set(0, -0.12, 0);
    g.add(drum);
    for (const s of [-1, 1]) {
      const crank = mesh(beveledBox(0.012, 0.07, 0.012, 0.003), kit.dark);
      crank.position.set(s * 0.07, -0.14, 0);
      g.add(crank);
    }
    const stirrup = mesh(new THREE.TorusGeometry(0.05, 0.007, 5, 14, Math.PI), prodMat);
    stirrup.position.set(0, 0.36, 0.02);
    g.add(stirrup);
  } else if (sub === 'repeat') {
    // A magazine box over the track and the lever that cycles it.
    const mag = mesh(beveledBox(0.06, 0.2, 0.07, 0.01), stockMat);
    mag.position.set(0, 0.2, 0.06);
    g.add(mag);
    const lever = mesh(beveledBox(0.014, 0.32, 0.014, 0.004), kit.dark);
    lever.position.set(0.04, 0.12, 0.08);
    lever.rotation.z = -0.2;
    g.add(lever);
    for (let i = 0; i < 3; i++) {
      const bolt = mesh(beveledBox(0.006, 0.06, 0.006, 0.002), kit.edge);
      bolt.position.set(-0.016 + i * 0.016, 0.33, 0.06);
      g.add(bolt);
    }
  }

  const grip = mesh(gripGeo(0.13, 0.022, 6), kit.leather);
  grip.position.y = -0.065;
  g.add(grip);
  const trigger = mesh(taperedBox(0.012, 0.03, 0.008, 0.02, 0.06, 0.003), kit.trim);
  trigger.position.set(0, 0.03, -0.03);
  trigger.rotation.x = 0.5;
  g.add(trigger);
  if (kit.deco.fittings) {
    const sight = mesh(beveledBox(0.02, 0.03, 0.02, 0.004), kit.trim);
    sight.position.set(0, 0.24, 0.05);
    g.add(sight);
  }
  kit.head = { y: 0.32, r: prodW * 0.4 };
  addRarityDressing(g, kit, [{ pos: [0, 0.14, 0.04], size: 0.018, rot: [Math.PI * 0.5, 0, 0] }], { pos: [0, 0.3, 0.06], size: 0.2 });
}

// ---------------------------------------------------------------------------
// Off-hand
// ---------------------------------------------------------------------------

function buildShield(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const sub = kit.sub;
  const round = sub === 'buckler' || sub === 'round' || sub === 'bone';
  const rimMat = kit.deco.trim ? kit.trim : kit.dark;
  let w: number;
  let h: number;
  let bossY = 0;
  let faceZ: number;

  if (round) {
    // A round shield: a lathed dish facing +Z.
    const r = sub === 'buckler' ? rng.range(0.19, 0.22) : rng.range(0.28, 0.32);
    w = h = r * 2;
    faceZ = r * 0.18;
    const dish = mesh(
      lathe(
        [
          [0.0001, r * 0.18],
          [r * 0.4, r * 0.15],
          [r * 0.8, r * 0.07],
          [r, 0],
          [r, -0.018],
          [0.0001, -0.01],
        ],
        24,
      ),
      kit.metal,
    );
    dish.rotation.x = Math.PI * 0.5;
    g.add(dish);
    const rim = mesh(ring(r, 0.014, 28, 6), rimMat);
    rim.position.z = 0.004;
    g.add(rim);
    if (kit.paletteKey.startsWith('wood')) {
      // Planks: dark seams across the face.
      for (let i = -2; i <= 2; i++) {
        const x = i * r * 0.36;
        const seam = mesh(beveledBox(0.006, Math.sqrt(Math.max(0.001, r * r - x * x)) * 1.85, 0.004, 0.001), kit.dark);
        seam.position.set(x, 0, r * 0.13);
        g.add(seam);
      }
    }
    if (sub === 'bone') {
      // Ribs fanning out from the boss, and a crown of teeth around the rim.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rib = mesh(taperedBox(0.03, 0.012, 0.012, 0.008, r * 0.7, 0.004), kit.metal);
        rib.position.set(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.1);
        rib.rotation.z = a - Math.PI * 0.5;
        g.add(rib);
        const tooth = mesh(spike(0.06, 0.012, 5, 0), kit.metal);
        tooth.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        tooth.rotation.z = a - Math.PI * 0.5;
        g.add(tooth);
      }
      const skull = mesh(new THREE.SphereGeometry(r * 0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), kit.metal);
      skull.rotation.x = Math.PI * 0.5;
      skull.position.z = r * 0.16;
      g.add(skull);
      for (const s of [-1, 1]) {
        const eye = mesh(new THREE.SphereGeometry(r * 0.05, 8, 6), kit.deco.tier >= 2 ? kit.glow : kit.dark);
        eye.position.set(s * r * 0.09, r * 0.04, r * 0.36);
        g.add(eye);
      }
    } else {
      const boss = mesh(dome(r * (sub === 'buckler' ? 0.36 : 0.24), 0.6, 14, 6), rimMat);
      boss.rotation.x = Math.PI * 0.5;
      boss.position.z = r * 0.16;
      g.add(boss);
    }
  } else {
    const tower = sub === 'tower';
    w = tower ? rng.range(0.48, 0.54) : rng.range(0.42, 0.5);
    h = tower ? w * 1.75 : w * rng.range(1.35, 1.5);
    faceZ = w * (tower ? 0.22 : 0.16);
    // Kite tapers to a long point; tower is a tall slab.
    const prof = (_u: number, v: number): number => {
      const t = 1 - v;
      if (tower) return t > 0.96 ? 0.94 : 1;
      return t < 0.55 ? 1 - Math.pow((0.55 - t) / 0.55, 1.5) * 0.95 : 1;
    };
    g.add(mesh(shell(w, h, faceZ, 10, 14, 0.026, prof), kit.metal));
    const rim = mesh(shell(w * 1.05, h * 1.03, faceZ, 10, 14, 0.014, prof), rimMat);
    rim.position.z = -0.004;
    g.add(rim);
    bossY = h * 0.1;
    if (tower) {
      // A raised spine and cross-bands: a wall you carry.
      const spine = mesh(beveledBox(0.03, h * 0.92, 0.03, 0.008), rimMat);
      spine.position.set(0, 0, faceZ + 0.01);
      g.add(spine);
      for (const y of [h * 0.3, -h * 0.3]) {
        const band = mesh(beveledBox(w * 0.9, 0.03, 0.02, 0.006), rimMat);
        band.position.set(0, y, faceZ * 0.85);
        g.add(band);
      }
    }
    const boss = mesh(
      lathe(
        [
          [0.0001, 0],
          [0.06, 0.012],
          [0.055, 0.04],
          [0.03, 0.06],
          [0.0001, 0.072],
        ],
        14,
      ),
      rimMat,
    );
    boss.rotation.x = Math.PI * 0.5;
    boss.position.set(0, bossY, faceZ + 0.005);
    g.add(boss);
  }

  if (kit.deco.fittings) {
    // Rivets around the rim.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rv = mesh(dome(0.011, 0.7, 6, 3), kit.trim);
      rv.rotation.x = Math.PI * 0.5;
      rv.position.set(Math.cos(a) * w * 0.42, bossY + Math.sin(a) * h * 0.38, faceZ * 0.5);
      g.add(rv);
    }
  }
  if (kit.deco.runes) {
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.8), additiveMaterial(kit.accent, { map: runeRingTexture(256, 9), opacity: 0.85 }));
    sigil.position.set(0, bossY, faceZ + 0.03);
    g.add(sigil);
  }
  for (const s of [-1, 1]) {
    const strap = mesh(beveledBox(w * 0.4, 0.03, 0.02, 0.005), kit.leather);
    strap.position.set(0, bossY + s * h * 0.14, -0.03);
    g.add(strap);
  }
  kit.head = { y: 0, r: w * 0.5 };
  addRarityDressing(g, kit, [{ pos: [0, bossY, faceZ + 0.06], size: 0.024, rot: [Math.PI * 0.5, 0, 0] }]);
  // Built facing +Z, then turned to face -Z: the off-hand socket carries a
  // shield with its authored front toward the hero's back (measured: face
  // (0.04, -0.39, -0.92) against forward +Z), so without the turn the world
  // saw straps and the boss faced the wall. Top (+Y) stays the top; the
  // socket hangs it point-down.
  const face = new THREE.Group();
  face.rotation.y = Math.PI;
  for (const c of [...g.children]) face.add(c);
  g.add(face);
}

// ---------------------------------------------------------------------------
// Signatures: what makes a unique or a set piece one of a kind
// ---------------------------------------------------------------------------

const SIGNED = new Set<ItemShape>(['sword', 'axe', 'mace', 'dagger', 'spear', 'staff', 'wand', 'scepter', 'bow', 'crossbow']);

/**
 * A feature no ordinary item has, picked by the unique's own hash so the same
 * unique always grows the same one and two uniques on one base differ: swept
 * wings, a floating halo, a crown of thorns, trailing pennants. Set pieces
 * always fly pennants in their set's colour.
 */
function addSignature(g: THREE.Group, kit: Kit, shape: ItemShape): void {
  const look = kit.look;
  if (!(look.unique || look.set) || !SIGNED.has(shape) || !kit.head) return;
  const { y, r } = kit.head;
  const sig = look.signature;
  const pick = look.set ? 3 : sig % 4;
  const s2 = Math.max(0.05, r);
  if (pick === 0) {
    // Swept wings at the head.
    for (const s of [-1, 1]) {
      const wing = mesh(spike(s2 * 1.6, s2 * 0.18, 5, 0.9), kit.trim);
      wing.position.set(s * s2 * 0.45, y - s2 * 0.3, 0);
      wing.rotation.z = -s * 0.75;
      if (s < 0) wing.scale.x = -1;
      g.add(wing);
      const feather = mesh(spike(s2 * 1.1, s2 * 0.12, 5, 0.7), kit.trim);
      feather.position.set(s * s2 * 0.4, y - s2 * 0.6, 0);
      feather.rotation.z = -s * 1.15;
      if (s < 0) feather.scale.x = -1;
      g.add(feather);
    }
  } else if (pick === 1) {
    // A halo ring floating around the head, turning on its own.
    const halo = mesh(ring(s2 * 1.1, s2 * 0.06, 28, 6), kit.glow);
    halo.position.y = y;
    halo.rotation.x = Math.PI * 0.5 - 0.35;
    halo.castShadow = false;
    halo.userData.spin = 1.2;
    g.add(halo);
  } else if (pick === 2) {
    // A crown of thorns around the head.
    const n = 5 + ((sig >>> 4) % 3);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const th = mesh(spike(s2 * 0.95, s2 * 0.13, 5, 0.4), kit.trim);
      th.quaternion.setFromUnitVectors(up, new THREE.Vector3(Math.cos(a), 0.55, Math.sin(a)).normalize());
      th.position.set(Math.cos(a) * s2 * 0.35, y - s2 * 0.5, Math.sin(a) * s2 * 0.35);
      g.add(th);
    }
    const core = mesh(new THREE.IcosahedronGeometry(s2 * 0.18, 0), kit.stone);
    core.position.set(0, y - s2 * 0.5, s2 * 0.22);
    g.add(core);
  } else {
    // Pennants in the set's (or the unique's) colour, hanging below the head.
    const mat = look.set ? kit.cloth : surface('cloth.silk', { repeat: 4, seed: 0, tint: look.glowColor });
    const pw = Math.min(s2, 0.08);
    const py = shape === 'bow' || shape === 'crossbow' ? y + 0.05 : y - Math.min(s2, 0.1) * 1.4;
    for (const s of [-1, 1]) {
      const p = mesh(clothPanel(pw * 0.5, pw * 2.4, kit.rng, { segsX: 3, segsY: 6, ripple: 0.07, flare: 0.5, tatter: 0.3 }), mat);
      p.position.set(s * pw * 0.25, py, s * 0.004);
      p.rotation.z = s * 0.25;
      g.add(p);
    }
    const knot = mesh(new THREE.IcosahedronGeometry(pw * 0.2, 0), kit.stone);
    knot.position.set(0, py, 0);
    g.add(knot);
  }
}

function buildOrb(kit: Kit, g: THREE.Group): void {
  const r = kit.rng.range(0.09, 0.12);
  const core = new THREE.IcosahedronGeometry(r, 2);
  displace(core, kit.rng, r * 0.06, 5 / r);
  const coreMesh = mesh(core, kit.crystal);
  coreMesh.position.y = r * 0.6;
  g.add(coreMesh);

  // A caged mount so it is an object, not a floating ball.
  const bands = 3;
  for (let i = 0; i < bands; i++) {
    const band = mesh(ring(r * 1.08, r * 0.05, 20, 6), kit.deco.trim ? kit.trim : kit.dark);
    band.position.y = r * 0.6;
    band.rotation.set(Math.PI * 0.5, (i / bands) * Math.PI, 0);
    g.add(band);
  }
  const foot = mesh(
    lathe(
      [
        [0.0001, -r * 0.9],
        [r * 0.55, -r * 0.8],
        [r * 0.32, -r * 0.4],
        [r * 0.5, -r * 0.05],
        [r * 0.3, r * 0.1],
      ],
      12,
    ),
    kit.dark,
  );
  g.add(foot);

  const inner = mesh(gem(r * 0.5, 8, 0.5), gemMaterial(kit.accent, { glow: Math.max(0.9, kit.deco.glow) }));
  inner.position.y = r * 0.6;
  inner.castShadow = false;
  g.add(inner);

  addRarityDressing(g, kit, [], { pos: [0, r * 0.6, 0], size: r * 3.4 });
}

function buildQuiver(kit: Kit, g: THREE.Group): void {
  const h = 0.36;
  g.add(
    mesh(
      lathe(
        [
          [0.0001, 0],
          [0.055, 0.005],
          [0.06, h * 0.5],
          [0.07, h],
          [0.062, h + 0.01],
        ],
        14,
      ),
      kit.leather,
    ),
  );
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arrow = mesh(beveledBox(0.008, 0.16, 0.008, 0.002), kit.wood);
    arrow.position.set(Math.cos(a) * 0.03, h + 0.08, Math.sin(a) * 0.03);
    arrow.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    g.add(arrow);
    const fletch = mesh(beveledBox(0.002, 0.05, 0.02, 0.001), kit.cloth);
    fletch.position.set(Math.cos(a) * 0.03, h + 0.14, Math.sin(a) * 0.03);
    g.add(fletch);
  }
  for (const y of [h * 0.25, h * 0.75]) {
    const strapBand = mesh(ring(0.062, 0.008, 16, 5), kit.deco.trim ? kit.trim : kit.dark);
    strapBand.rotation.x = Math.PI * 0.5;
    strapBand.position.y = y;
    g.add(strapBand);
  }
  addRarityDressing(g, kit, [{ pos: [0, h * 0.5, 0.062], size: 0.016 }]);
}

// ---------------------------------------------------------------------------
// Armour
// ---------------------------------------------------------------------------

// Armour drops are authored upright, facing +Z, centred near the origin: the
// way they stand on the floor and the way their icons show them. (Worn armour
// is built separately, fitted to each body, by `WornGear`.)

/** A lathe flattened front to back: torsos, helms, cuffs. */
function oval(profile: Array<[number, number]>, depth = 0.7, segments = 18): THREE.BufferGeometry {
  const geo = lathe(profile, segments);
  geo.scale(1, 1, depth);
  geo.computeVertexNormals();
  return geo;
}

/** A band around an oval body at height `y`. */
function ovalBand(kit: Kit, g: THREE.Group, y: number, r: number, depth: number, mat: THREE.Material, tube = 0.008): void {
  const b = mesh(ring(r, tube, 22, 5), mat);
  b.rotation.x = Math.PI * 0.5;
  b.scale.set(1, depth, 1);
  b.position.y = y;
  g.add(b);
  void kit;
}

function buildHelm(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  const r = 0.12;
  const trimMat = kit.deco.trim ? kit.trim : kit.dark;
  if (sub === 'circlet') {
    // A thin crown band with a jewel at the brow and small points rising.
    const band = mesh(ring(r * 0.9, 0.009, 28, 6), kit.trim);
    band.rotation.x = Math.PI * 0.5;
    band.scale.set(1, 0.85, 1);
    g.add(band);
    const points = 5 + Math.round(kit.ornate * 4);
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2 + Math.PI * 0.5;
      const p = mesh(spike(i % 2 ? 0.03 : 0.05, 0.008, 5, 0), kit.trim);
      p.position.set(Math.cos(a) * r * 0.9, 0.004, Math.sin(a) * r * 0.9 * 0.85);
      g.add(p);
    }
    const setting = mesh(dome(0.02, 0.6, 10, 4), kit.trim);
    setting.rotation.x = Math.PI * 0.5;
    setting.position.set(0, 0.012, r * 0.9 * 0.85);
    g.add(setting);
    const jewel = mesh(gem(0.017, 8, 0.55), kit.stone);
    jewel.rotation.x = Math.PI * 0.5;
    jewel.position.set(0, 0.012, r * 0.9 * 0.85 + 0.012);
    jewel.castShadow = false;
    g.add(jewel);
    kit.head = { y: 0.03, r: 0.1 };
    addRarityDressing(g, kit, [{ pos: [r * 0.6, 0.01, r * 0.62], size: 0.01 }, { pos: [-r * 0.6, 0.01, r * 0.62], size: 0.01 }]);
    return;
  }

  if (sub === 'full') {
    // A great helm: flat crown, straight sides, a dark eye slit and a ridge.
    const shellGeo = oval(
      [
        [r * 0.9, -r * 0.6],
        [r * 0.94, -r * 0.62],
        [r * 1.0, -r * 0.4],
        [r, r * 0.6],
        [r * 0.92, r * 1.05],
        [r * 0.6, r * 1.22],
        [0.0001, r * 1.25],
      ],
      0.92,
    );
    g.add(mesh(shellGeo, kit.metal));
    const slit = mesh(beveledBox(r * 1.3, r * 0.12, r * 0.3, r * 0.03), kit.dark);
    slit.position.set(0, r * 0.35, r * 0.82);
    g.add(slit);
    const ridge = mesh(beveledBox(r * 0.12, r * 1.5, r * 0.14, r * 0.04), trimMat);
    ridge.position.set(0, r * 0.3, r * 0.88);
    g.add(ridge);
    for (let i = 0; i < 6; i++) {
      const hole = mesh(new THREE.SphereGeometry(r * 0.035, 6, 4), kit.dark);
      hole.position.set((i % 3 - 1) * r * 0.22 + r * 0.38 * (i < 3 ? 1 : -1), -r * 0.15 - Math.floor(i % 3) * 0, r * 0.88);
      g.add(hole);
    }
    if (kit.deco.trim) ovalBand(kit, g, -r * 0.55, r * 0.95, 0.92, kit.trim, 0.009);
    if (kit.deco.fittings) {
      const crest = mesh(shell(r * 0.2, r * 1.6, r * 0.5, 3, 8, r * 0.08), kit.trim);
      crest.rotation.y = Math.PI * 0.5;
      crest.position.y = r * 1.4;
      g.add(crest);
    }
    kit.head = { y: r * 1.3, r: r };
    addRarityDressing(g, kit, [{ pos: [0, r * 0.75, r * 0.92], size: r * 0.14, rot: [Math.PI * 0.5, 0, 0] }]);
    return;
  }

  // Cap and horned share a rounded skull; horned adds a face and horns.
  const skull = dome(r, sub === 'cap' ? 0.85 : 1.1, 16, 8);
  displace(skull, kit.rng, r * 0.01, 8 / r);
  g.add(mesh(skull, kit.metal));
  ovalBand(kit, g, 0.004, r * 1.01, 1, sub === 'cap' ? kit.leather : trimMat, sub === 'cap' ? 0.012 : 0.01);

  if (sub === 'cap') {
    // A leather cap: brim and a stitched seam over the crown.
    const brim = mesh(lathe([[r * 0.98, 0], [r * 1.18, -0.012], [r * 1.16, -0.02], [r * 0.98, -0.01]], 20), kit.metal);
    g.add(brim);
    const seam = mesh(new THREE.TorusGeometry(r * 0.86, 0.004, 4, 16, Math.PI), kit.dark);
    seam.rotation.y = Math.PI * 0.5;
    g.add(seam);
    kit.head = { y: r * 0.8, r: r };
    addRarityDressing(g, kit, [{ pos: [0, r * 0.35, r * 0.95], size: r * 0.14, rot: [Math.PI * 0.5, 0, 0] }]);
    return;
  }

  // Horned: a brow, dark sockets where the eyes go, and horns sweeping up.
  const brow = mesh(beveledBox(r * 1.8, r * 0.22, r * 0.4, r * 0.06), kit.metal);
  brow.position.set(0, r * 0.28, r * 0.78);
  g.add(brow);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(r * 0.16, 8, 6), kit.deco.tier >= 2 ? kit.glow : kit.dark);
    eye.position.set(s * r * 0.36, r * 0.1, r * 0.86);
    eye.scale.set(1, 0.8, 0.5);
    g.add(eye);
    const horn = mesh(spike(r * 1.5, r * 0.22, 7, 0.8), kit.paletteKey.startsWith('bone') ? kit.metal : surface('bone.pale', { repeat: 4, seed: 0 }));
    horn.position.set(s * r * 0.8, r * 0.55, 0);
    horn.rotation.set(0, 0, -s * 0.9);
    if (s < 0) horn.scale.x = -1;
    g.add(horn);
  }
  const jaw = mesh(shell(r * 1.4, r * 0.5, r * 0.25, 6, 3, r * 0.1), kit.metal);
  jaw.position.set(0, -r * 0.2, r * 0.72);
  g.add(jaw);
  kit.head = { y: r * 0.9, r: r };
  addRarityDressing(g, kit, [{ pos: [0, r * 0.55, r * 0.9], size: r * 0.14, rot: [Math.PI * 0.5, 0, 0] }]);
}

function buildChest(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  const robe = sub === 'robe';
  const trimMat = kit.deco.trim ? kit.trim : kit.dark;
  // A torso: waist, chest, broad shoulders and an open neck.
  const torso = oval(
    robe
      ? [
          [0.2, -0.5],
          [0.15, -0.25],
          [0.12, -0.05],
          [0.15, 0.12],
          [0.17, 0.2],
          [0.09, 0.27],
          [0.07, 0.28],
        ]
      : [
          [0.13, -0.22],
          [0.12, -0.1],
          [0.15, 0.1],
          [0.175, 0.2],
          [0.09, 0.27],
          [0.07, 0.28],
        ],
    0.62,
    20,
  );
  g.add(mesh(torso, kit.metal));

  // Sleeves for everything but plate, which has pauldrons instead.
  if (sub !== 'plate') {
    for (const s of [-1, 1]) {
      const len = robe ? 0.3 : sub === 'mail' || sub === 'scale' ? 0.17 : 0.2;
      const sleeve = mesh(lathe([[robe ? 0.09 : 0.055, 0], [robe ? 0.06 : 0.05, len * 0.5], [0.05, len]], 12), kit.metal);
      sleeve.position.set(s * 0.16, 0.2, 0);
      sleeve.rotation.z = s * (Math.PI - 0.45);
      g.add(sleeve);
    }
  }
  if (sub === 'plate' || sub === 'scale') {
    for (const s of [-1, 1]) {
      const pl = mesh(dome(0.085, 0.75, 12, 6), sub === 'plate' ? kit.metal : trimMat);
      pl.position.set(s * 0.17, 0.2, 0);
      pl.rotation.z = -s * 0.55;
      g.add(pl);
      if (kit.deco.fittings) {
        const stud = mesh(spike(0.06, 0.016, 5, 0.3), kit.trim);
        stud.position.set(s * 0.2, 0.25, 0);
        stud.rotation.z = -s * 0.7;
        g.add(stud);
      }
    }
  }
  if (sub === 'plate') {
    // Sternum ridge and a skirt of faulds.
    const ridge = mesh(taperedBox(0.03, 0.03, 0.012, 0.02, 0.32, 0.006), trimMat);
    ridge.position.set(0, 0.03, 0.105);
    ridge.rotation.x = -0.08;
    g.add(ridge);
    for (let i = 0; i < 3; i++) ovalBand(kit, g, -0.16 - i * 0.04, 0.135 + i * 0.008, 0.62, i === 0 ? trimMat : kit.metal, 0.014);
  } else if (sub === 'leather') {
    // Laced front and a belt.
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        const lace = mesh(beveledBox(0.05, 0.006, 0.006, 0.002), kit.dark);
        lace.position.set(0, 0.1 - i * 0.05, 0.1);
        lace.rotation.z = s * 0.5;
        g.add(lace);
      }
    }
    ovalBand(kit, g, -0.16, 0.126, 0.62, kit.leather, 0.016);
  } else if (sub === 'mail' || sub === 'scale') {
    ovalBand(kit, g, -0.16, 0.126, 0.62, kit.leather, 0.016);
    const collar = mesh(lathe([[0.1, 0], [0.085, 0.03], [0.07, 0.04]], 14), trimMat);
    collar.scale.z = 0.7;
    collar.position.y = 0.24;
    g.add(collar);
  } else if (robe) {
    // A sash in the item's colour and a hood fallen at the back.
    const sash = surface('cloth.silk', { repeat: 4, seed: 0, tint: kit.look.rarityTier >= 1 ? kit.accent : 0xb0a080 });
    ovalBand(kit, g, -0.1, 0.13, 0.62, sash, 0.02);
    const tail = mesh(clothPanel(0.05, 0.22, kit.rng, { segsX: 2, segsY: 5, ripple: 0.05, flare: 0.3 }), sash);
    tail.position.set(0.06, -0.11, 0.085);
    g.add(tail);
    const hood = mesh(dome(0.1, 0.8, 12, 5), kit.metal);
    hood.position.set(0, 0.24, -0.06);
    hood.rotation.x = -1.9;
    g.add(hood);
    if (kit.deco.trim) {
      const hem = mesh(ring(0.2, 0.008, 24, 4), kit.trim);
      hem.rotation.x = Math.PI * 0.5;
      hem.scale.set(1, 0.62, 1);
      hem.position.y = -0.49;
      g.add(hem);
    }
  }
  // Heraldry over metal: a tabard in the item's colour.
  const metallic = /^(metal|bone)/.test(kit.paletteKey);
  if (kit.deco.tier >= 1 && metallic && sub !== 'robe') {
    const tabard = mesh(
      clothPanel(0.12, 0.26, kit.rng, { segsX: 4, segsY: 6, ripple: 0.04, flare: 0.15, tatter: kit.deco.tier >= 4 ? 0.2 : 0 }),
      surfaceVariant('cloth.banner', { tint: kit.accent, repeat: 5 }),
    );
    tabard.position.set(0, -0.12, 0.09);
    g.add(tabard);
  }
  if (kit.deco.runes) {
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), additiveMaterial(kit.accent, { map: runeRingTexture(256, 13), opacity: 0.8 }));
    sigil.position.set(0, 0.08, 0.12);
    g.add(sigil);
  }
  kit.head = { y: 0.1, r: 0.15 };
  addRarityDressing(g, kit, [{ pos: [0, 0.18, 0.1], size: 0.022, rot: [Math.PI * 0.5, 0, 0] }]);
}

function buildGloves(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  const plate = sub === 'plate';
  const silk = sub === 'silk';
  const handMat = kit.metal;
  // Palm and back of the hand, fingers together, thumb out: an open glove, palm toward us.
  const palm = mesh(beveledBox(0.085, 0.09, 0.035, 0.014), handMat);
  palm.position.y = 0.04;
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const len = [0.06, 0.07, 0.066, 0.052][i]!;
    const f = mesh(lathe([[0.0001, -0.002], [0.01, 0.004], [0.0095, len * 0.8], [0.0001, len]], 8), plate ? kit.metal : handMat);
    f.position.set(-0.03 + i * 0.02, 0.083, 0);
    f.rotation.z = (i - 1.5) * -0.06;
    g.add(f);
    if (plate) {
      for (let k = 0; k < 2; k++) {
        const seg = mesh(ring(0.011, 0.003, 8, 4), trimOr(kit));
        seg.rotation.x = Math.PI * 0.5;
        seg.position.set(-0.03 + i * 0.02, 0.095 + k * 0.022, 0);
        g.add(seg);
      }
    }
  }
  const thumb = mesh(lathe([[0.0001, -0.002], [0.012, 0.004], [0.011, 0.04], [0.0001, 0.05]], 8), handMat);
  thumb.position.set(0.05, 0.03, 0.006);
  thumb.rotation.z = -0.8;
  g.add(thumb);
  // Cuff: flared steel for gauntlets, a long slim cuff for silk, a turned-down leather one otherwise.
  const cuffLen = silk ? 0.12 : plate ? 0.08 : 0.06;
  const cuff = mesh(
    oval(
      [
        [0.05, -cuffLen],
        [plate ? 0.058 : 0.05, -cuffLen * 0.5],
        [0.046, -0.005],
      ],
      0.6,
      14,
    ),
    plate ? kit.metal : silk ? kit.metal : kit.leather,
  );
  g.add(cuff);
  if (kit.deco.trim || plate) ovalBand(kit, g, -cuffLen, 0.05, 0.6, trimOr(kit), 0.007);
  if (plate) {
    for (let k = 0; k < 2; k++) {
      const knuck = mesh(beveledBox(0.088, 0.016, 0.044, 0.005), kit.metal);
      knuck.position.set(0, 0.07 - k * 0.025, 0.004);
      g.add(knuck);
    }
  }
  if (kit.deco.fittings) {
    for (let i = 0; i < 3; i++) {
      const stud = mesh(spike(0.025, 0.007, 4, 0), kit.trim);
      stud.position.set(-0.024 + i * 0.024, 0.075, 0.018);
      stud.rotation.x = 1.2;
      g.add(stud);
    }
  }
  kit.head = { y: 0.06, r: 0.06 };
  addRarityDressing(g, kit, [{ pos: [0, 0.04, 0.02], size: 0.012, rot: [Math.PI * 0.5, 0, 0] }]);
}

function trimOr(kit: Kit): THREE.Material {
  return kit.deco.trim ? kit.trim : kit.dark;
}

function buildBoots(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  const plate = sub === 'plate';
  const silk = sub === 'silk';
  const shaftH = silk ? 0.17 : plate ? 0.24 : 0.2;
  // Shaft: a slightly flared tube.
  const shaft = mesh(
    oval(
      [
        [0.045, 0.03],
        [0.048, shaftH * 0.6],
        [silk ? 0.05 : 0.055, shaftH],
        [silk ? 0.046 : 0.05, shaftH + 0.006],
      ],
      0.85,
      14,
    ),
    kit.metal,
  );
  g.add(shaft);
  // Foot: heel to toe along +Z, rounded at the toe; silk slippers curl up at the tip.
  const foot = mesh(beveledBox(0.085, 0.06, 0.16, 0.025, 2), kit.metal);
  foot.position.set(0, 0.03, 0.045);
  g.add(foot);
  const toe = mesh(dome(0.043, 0.9, 12, 5), kit.metal);
  toe.rotation.x = Math.PI * 0.5;
  toe.scale.set(1, 1, 0.7);
  toe.position.set(0, 0.025, 0.125);
  g.add(toe);
  const sole = mesh(beveledBox(0.09, 0.014, 0.2, 0.005), kit.dark);
  sole.position.set(0, 0.002, 0.055);
  g.add(sole);
  if (silk) {
    const curl = mesh(spike(0.05, 0.016, 6, 0.8), kit.metal);
    curl.position.set(0, 0.03, 0.16);
    curl.rotation.set(Math.PI * 0.5, 0, 0);
    g.add(curl);
  }
  if (plate) {
    // Greave down the front, a knee cop and a banded sabaton.
    const greave = mesh(shell(0.08, shaftH * 0.85, 0.03, 5, 6, 0.012), kit.metal);
    greave.position.set(0, shaftH * 0.55, 0.045);
    g.add(greave);
    const knee = mesh(dome(0.04, 0.6, 10, 4), trimOr(kit));
    knee.rotation.x = Math.PI * 0.5;
    knee.position.set(0, shaftH + 0.01, 0.045);
    g.add(knee);
    for (let i = 0; i < 3; i++) {
      const band = mesh(beveledBox(0.09, 0.012, 0.05, 0.004), trimOr(kit));
      band.position.set(0, 0.05, 0.08 + i * 0.03);
      band.rotation.x = -0.4;
      g.add(band);
    }
  } else if (!silk) {
    // A turned-down cuff and straps.
    ovalBand(kit, g, shaftH, 0.056, 0.85, kit.leather, 0.012);
    for (let i = 0; i < 2; i++) ovalBand(kit, g, 0.08 + i * 0.06, 0.05, 0.85, trimOr(kit), 0.006);
  }
  if (silk) {
    // Soft cloth wound with bands up the shin.
    for (let i = 0; i < 3; i++) ovalBand(kit, g, 0.07 + i * 0.04, 0.049, 0.85, trimOr(kit), 0.005);
  }
  if (kit.deco.fittings && !silk) {
    const spur = mesh(spike(0.05, 0.01, 5, 0.3), kit.trim);
    spur.position.set(0, 0.04, -0.045);
    spur.rotation.x = -Math.PI * 0.5;
    g.add(spur);
  }
  kit.head = { y: shaftH * 0.5, r: 0.06 };
  addRarityDressing(g, kit, [{ pos: [0, shaftH * 0.7, 0.048], size: 0.012, rot: [Math.PI * 0.5, 0, 0] }]);
}

function buildBelt(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  const sash = sub === 'sash';
  const chain = sub === 'chain';
  const bandMat = sash ? surface('cloth.silk', { repeat: 4, seed: 0, tint: kit.look.rarityTier >= 1 ? kit.accent : 0x9a8a6a }) : kit.leather;
  const band = mesh(ring(0.15, sash ? 0.018 : 0.02, 28, 6), bandMat);
  band.rotation.x = Math.PI * 0.5;
  band.scale.set(1, 0.75, sash ? 1 : 1.4);
  g.add(band);
  if (sash) {
    // A knot at the front and two tails hanging.
    const knot = mesh(new THREE.IcosahedronGeometry(0.03, 1), bandMat);
    knot.position.set(0, 0, 0.115);
    knot.scale.set(1.2, 0.9, 0.7);
    g.add(knot);
    for (const s of [-1, 1]) {
      const tail = mesh(clothPanel(0.035, 0.13, kit.rng, { segsX: 2, segsY: 4, ripple: 0.06, flare: 0.4 }), bandMat);
      tail.position.set(s * 0.02, -0.01, 0.118);
      tail.rotation.z = s * 0.2;
      g.add(tail);
    }
  } else {
    const buckle = mesh(beveledBox(0.07, 0.06, 0.016, 0.008), trimOr(kit));
    buckle.position.z = 0.115;
    g.add(buckle);
    const frame = mesh(ring(0.022, 0.005, 12, 4), kit.deco.trim ? kit.trim : kit.metal);
    frame.position.z = 0.125;
    frame.scale.set(1.2, 1, 1);
    g.add(frame);
    const plaques = chain ? 8 : 4;
    for (let i = 1; i < plaques; i++) {
      const a = Math.PI * 0.5 + (i / plaques) * Math.PI * 2;
      const pl = mesh(chain ? ring(0.014, 0.004, 10, 4) : beveledBox(0.03, 0.034, 0.008, 0.004), chain ? kit.metal : trimOr(kit));
      pl.position.set(Math.cos(a) * 0.152, 0, Math.sin(a) * 0.115);
      pl.rotation.y = -a + Math.PI * 0.5;
      g.add(pl);
    }
    if (sub === 'plate' || !sub) {
      for (const s of [-1, 1]) {
        const pouch = mesh(beveledBox(0.05, 0.06, 0.03, 0.012), kit.leather);
        pouch.position.set(s * 0.11, -0.03, 0.07);
        pouch.rotation.y = s * 0.7;
        g.add(pouch);
      }
    }
  }
  kit.head = { y: 0, r: 0.1 };
  addRarityDressing(g, kit, [{ pos: [0, 0, 0.13], size: 0.016, rot: [Math.PI * 0.5, 0, 0] }]);
}

function buildAmulet(kit: Kit, g: THREE.Group): void {
  // Chain: individual links, hanging in a U to the pendant.
  const links = 22;
  const chainMat = kit.deco.trim ? kit.trim : kit.metal;
  for (let i = 0; i < links; i++) {
    const t = i / (links - 1);
    const a = Math.PI * 0.18 + t * Math.PI * 0.64;
    const link = mesh(ring(0.008, 0.0026, 8, 4), chainMat);
    link.position.set(Math.cos(a) * 0.075, 0.07 - Math.sin(a) * 0.15 + 0.06, 0);
    link.rotation.set(i % 2 === 0 ? Math.PI * 0.5 : 0, 0, a);
    g.add(link);
  }
  const py = -0.03;
  const bezel = mesh(
    lathe(
      [
        [0.0001, -0.012],
        [0.026, -0.008],
        [0.03, 0.006],
        [0.022, 0.014],
      ],
      14,
    ),
    chainMat,
  );
  bezel.rotation.x = Math.PI * 0.5;
  bezel.position.y = py;
  g.add(bezel);
  const stone = mesh(gem(0.024, 8, 0.55), kit.stone);
  stone.rotation.x = Math.PI * 0.5;
  stone.position.set(0, py, 0.014);
  stone.castShadow = false;
  g.add(stone);
  if (kit.deco.fittings) {
    for (const s of [-1, 1]) {
      const wing = mesh(taperedBox(0.03, 0.006, 0.008, 0.004, 0.03, 0.002), kit.trim);
      wing.position.set(s * 0.03, py, 0);
      wing.rotation.z = s * 0.9;
      g.add(wing);
    }
  }
  kit.head = { y: py, r: 0.04 };
  addRarityDressing(g, kit, [], { pos: [0, py, 0.012], size: 0.11 });
}

function buildRing(kit: Kit, g: THREE.Group): void {
  // The band stands upright (in the XY plane) with the stone set on top.
  const band = mesh(
    latheModulated(
      [
        [0.026, -0.006],
        [0.03, -0.004],
        [0.03, 0.004],
        [0.026, 0.006],
      ],
      22,
      (_t, a) => 1 + Math.cos(a * 6) * 0.02,
    ),
    kit.deco.trim ? kit.trim : kit.metal,
  );
  band.rotation.x = Math.PI * 0.5;
  g.add(band);
  const bezel = mesh(
    lathe(
      [
        [0.0001, 0.026],
        [0.014, 0.03],
        [0.016, 0.04],
        [0.011, 0.046],
      ],
      12,
    ),
    kit.deco.trim ? kit.trim : kit.metal,
  );
  g.add(bezel);
  const stone = mesh(gem(0.014, 6, 0.55), kit.stone);
  stone.position.y = 0.05;
  stone.castShadow = false;
  g.add(stone);
  if (kit.deco.gems) {
    for (const s of [-1, 1]) {
      const chip = mesh(gem(0.006, 6, 0.5), kit.stone);
      chip.position.set(s * 0.02, 0.022, 0.006);
      chip.rotation.z = -s * 0.7;
      chip.castShadow = false;
      g.add(chip);
    }
  }
  kit.head = { y: 0.03, r: 0.03 };
  addRarityDressing(g, kit, [], kit.deco.runes ? { pos: [0, 0.02, 0], size: 0.09 } : undefined);
}

// ---------------------------------------------------------------------------
// Consumables / misc
// ---------------------------------------------------------------------------

function buildPotion(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  // Flask: a squat bulb. Round: a sphere on a short neck. Vial: a slim tube.
  const prof: Array<[number, number]> =
    sub === 'round'
      ? [
          [0.0001, 0],
          [0.035, 0.006],
          [0.058, 0.05],
          [0.05, 0.095],
          [0.02, 0.115],
          [0.017, 0.14],
          [0.021, 0.15],
          [0.0001, 0.152],
        ]
      : sub === 'vial'
        ? [
            [0.0001, 0],
            [0.022, 0.004],
            [0.024, 0.02],
            [0.024, 0.13],
            [0.02, 0.14],
            [0.023, 0.15],
            [0.0001, 0.152],
          ]
        : [
            [0.0001, 0],
            [0.042, 0.004],
            [0.05, 0.03],
            [0.048, 0.07],
            [0.024, 0.1],
            [0.018, 0.13],
            [0.022, 0.145],
            [0.0001, 0.15],
          ];
  g.add(mesh(lathe(prof, 16), kit.crystal));
  // The fluid, a little inside the glass, up to about two thirds.
  const cut = 0.1;
  const fluidProf: Array<[number, number]> = [];
  for (let i = 0; i < prof.length; i++) {
    const [r, y] = prof[i]!;
    if (y < cut) {
      fluidProf.push([r * 0.86, y + 0.004]);
      continue;
    }
    const [r0, y0] = prof[i - 1]!;
    const rc = r0 + ((r - r0) * (cut - y0)) / Math.max(1e-5, y - y0);
    fluidProf.push([rc * 0.86, cut], [0.0001, cut]);
    break;
  }
  const fluid = mesh(lathe(fluidProf, 14), emissiveMaterial(kit.accent, 1.4));
  fluid.castShadow = false;
  g.add(fluid);
  const cork = mesh(beveledBox(0.024, 0.022, 0.024, 0.006), kit.wood);
  cork.position.y = 0.16;
  g.add(cork);
  const seal = mesh(ring(0.021, 0.005, 12, 5), kit.dark);
  seal.rotation.x = Math.PI * 0.5;
  seal.position.y = 0.142;
  g.add(seal);
}

function buildGemItem(kit: Kit, g: THREE.Group): void {
  const stone = mesh(gem(0.06, 8, 0.5), gemMaterial(kit.accent, { glow: Math.max(0.8, kit.deco.glow) }));
  stone.position.y = 0.06;
  stone.castShadow = false;
  g.add(stone);
}

function buildRuneItem(kit: Kit, g: THREE.Group): void {
  const slab = beveledBox(0.1, 0.14, 0.03, 0.012, 2);
  displace(slab, kit.rng, 0.004, 30);
  g.add(mesh(slab, surface('stone.void', { repeat: 4 })));
  const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.085), additiveMaterial(kit.accent, { map: runeRingTexture(256, 21), opacity: 0.95 }));
  glyph.position.z = 0.017;
  g.add(glyph);
  const back = glyph.clone();
  back.position.z = -0.017;
  back.rotation.y = Math.PI;
  g.add(back);
}

function buildCharm(kit: Kit, g: THREE.Group): void {
  const sub = kit.sub;
  // Small: a round token. Large: a tablet. Grand: a tall tablet with a tassel.
  const body =
    sub === 'small'
      ? (() => {
          const geo = new THREE.CylinderGeometry(0.04, 0.04, 0.016, 18);
          geo.rotateX(Math.PI * 0.5);
          return geo;
        })()
      : beveledBox(sub === 'grand' ? 0.06 : 0.07, sub === 'grand' ? 0.13 : 0.09, 0.018, 0.008, 2);
  g.add(mesh(body, kit.metal));
  const rim = mesh(ring(sub === 'small' ? 0.04 : 0.03, 0.004, 18, 4), kit.deco.trim ? kit.trim : kit.dark);
  if (sub === 'small') g.add(rim);
  const inlay = mesh(gem(0.016, 6, 0.5), kit.stone);
  inlay.position.z = 0.012;
  inlay.rotation.x = Math.PI * 0.5;
  inlay.castShadow = false;
  g.add(inlay);
  const top = sub === 'small' ? 0.04 : sub === 'grand' ? 0.065 : 0.045;
  const loop = mesh(ring(0.01, 0.003, 10, 4), kit.deco.trim ? kit.trim : kit.dark);
  loop.position.y = top + 0.008;
  g.add(loop);
  if (sub === 'grand') {
    const tassel = mesh(clothPanel(0.03, 0.08, kit.rng, { segsX: 2, segsY: 3, ripple: 0.05, flare: 0.5 }), surface('cloth.silk', { repeat: 4, seed: 0, tint: kit.accent }));
    tassel.position.set(0, -0.065, 0.004);
    g.add(tassel);
  }
}

function buildMaterialItem(kit: Kit, g: THREE.Group): void {
  for (let i = 0; i < 3; i++) {
    const chunk = new THREE.IcosahedronGeometry(0.035 + i * 0.008, 1);
    displace(chunk, kit.rng, 0.012, 40);
    const m = mesh(chunk, kit.metal);
    const a = (i / 3) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.035, 0.03 + i * 0.008, Math.sin(a) * 0.035);
    m.rotation.set(kit.rng.range(0, 3), kit.rng.range(0, 3), kit.rng.range(0, 3));
    g.add(m);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const BUILDERS: Record<ItemShape, (kit: Kit, g: THREE.Group) => void> = {
  sword: buildSword,
  dagger: buildDagger,
  axe: buildAxe,
  mace: buildMace,
  spear: buildSpear,
  bow: buildBow,
  crossbow: buildCrossbow,
  wand: buildWand,
  staff: buildStaff,
  scepter: buildScepter,
  shield: buildShield,
  orb: buildOrb,
  quiver: buildQuiver,
  helm: buildHelm,
  chest: buildChest,
  gloves: buildGloves,
  boots: buildBoots,
  belt: buildBelt,
  amulet: buildAmulet,
  ring: buildRing,
  charm: buildCharm,
  potion: buildPotion,
  gem: buildGemItem,
  rune: buildRuneItem,
  material: buildMaterialItem,
};

/**
 * Builds a 3D model for an item from its base's `visual` block. The result is
 * authored with the grip (weapons) or the wear point (armour) at the origin, so
 * `CharacterModels.attachToSocket` can drop it straight into a bone.
 */
export function buildItemModel(visual: ItemVisual, rng: Rng, rarity: ItemRarity, ident?: ItemIdent): THREE.Object3D {
  const { shape, sub } = resolveModelShape(visual.shape, visual.palette, visual.ornate);
  const kit = kitFor(visual, rarity, rng, ident, sub);
  // A unique or set piece always has the same proportions: its own seed, not the drop's.
  if (kit.look.unique || kit.look.set) kit.rng = new Random(kit.look.signature || 1);
  const group = new THREE.Group();
  group.name = `item:${shape}:${rarity}`;

  const builder = BUILDERS[shape] ?? buildSword;
  try {
    builder(kit, group);
    addSignature(group, kit, shape);
  } catch {
    // A broken model must never take the run down: fall back to a plain blade.
    group.clear();
    buildSword(kit, group);
  }

  group.userData.shape = shape;
  group.userData.rarity = rarity;
  group.userData.accent = kit.accent;
  return group;
}

// ---------------------------------------------------------------------------
// Ground drops
// ---------------------------------------------------------------------------

let visualResolver: ((item: Item) => ItemVisual | undefined) | null = null;

const UPRIGHT_DROPS = new Set<ItemShape>(['helm', 'chest', 'gloves', 'boots', 'amulet', 'ring', 'charm', 'potion', 'gem', 'rune', 'orb', 'quiver']);

/**
 * How an item lies on the floor. Weapons are tipped diagonally so their length
 * reads from above; shields lie face up with the point toward the camera; belts
 * lie nearly flat; armour, jewellery and potions stand upright, leaning back.
 */
export function poseForDrop(model: THREE.Object3D): void {
  const shape = model.userData.shape as ItemShape;
  if (shape === 'shield') model.rotation.set(Math.PI - 0.6, 0, 0);
  else if (shape === 'belt') model.rotation.set(-0.9, 0, 0);
  else if (UPRIGHT_DROPS.has(shape)) model.rotation.set(-0.4, 0, 0);
  else model.rotation.set(0.35, 0, Math.PI * 0.28);
}
/**
 * What colour a dropped item's beam burns.
 *
 * Injected rather than imported so the art layer keeps knowing nothing about
 * the loot tables. `main.ts` wires it to `itemLabelColor`.
 */
let dropColorHook: ((item: Item) => number | undefined) | null = null;

export function setDropColorResolver(fn: (item: Item) => number | undefined): void {
  dropColorHook = fn;
}

/**
 * Lets the integration layer wire real `ItemBase.visual` data in without this
 * module taking a compile-time dependency on the loot tables. Until it is set,
 * drops fall back to inferring a shape from the base id, which is good enough
 * that a missing wire-up is a cosmetic bug and not a crash.
 */
export function setItemVisualResolver(fn: ((item: Item) => ItemVisual | undefined) | null): void {
  visualResolver = fn;
}

const PALETTE_HINTS: Array<[string, string]> = [
  ['gold', 'metal.gold'],
  ['gilded', 'metal.gold'],
  ['silver', 'metal.silver'],
  ['mithril', 'metal.silver'],
  ['bronze', 'metal.bronze'],
  ['brass', 'metal.bronze'],
  ['copper', 'metal.copper'],
  ['rust', 'metal.rusted'],
  ['iron', 'metal.iron'],
  ['steel', 'metal.steel'],
  ['obsidian', 'metal.dark'],
  ['shadow', 'metal.dark'],
  ['void', 'crystal.void'],
  ['crystal', 'crystal.arcane'],
  ['ice', 'crystal.ice'],
  ['frost', 'crystal.ice'],
  ['bone', 'bone.pale'],
  ['oak', 'wood.oak'],
  ['wood', 'wood.oak'],
  ['ash', 'wood.charred'],
  ['leather', 'leather.worn'],
  ['hide', 'leather.worn'],
  ['studded', 'leather.studded'],
  ['silk', 'cloth.silk'],
  ['robe', 'cloth.silk'],
  ['linen', 'cloth.linen'],
  ['cloth', 'cloth.linen'],
];

/** Infers a plausible visual from an item's base id, when nothing better exists. */
function inferVisual(item: Item): ItemVisual {
  const id = (item.baseId || '').toLowerCase();
  let palette = 'metal.steel';
  for (const [key, pal] of PALETTE_HINTS) {
    if (id.includes(key)) {
      palette = pal;
      break;
    }
  }
  const shape = resolveShape(id, palette, 0.4);
  return { shape, palette, ornate: 0.35 + (RARITY_TIER[item.rarity] ?? 0) * 0.15 };
}

/**
 * The ground drop: the item itself, hovering and slowly turning, standing in a
 * rarity-tinted light shaft with a glow pooled on the floor beneath it. The
 * shaft is the read — at ARPG camera distance you identify a drop by its beam
 * colour long before you can see what the item is.
 */
export function buildDropModel(item: Item, rng: Rng): THREE.Object3D {
  const visual = (visualResolver ? visualResolver(item) : undefined) ?? inferVisual(item);
  const rarity = item.rarity;
  // The beam is what you read from across a room. Gems glow their own stone
  // colour and runes a single shared orange, so you can tell a ruby from an
  // emerald from a rune without walking over to read three labels.
  const color = (dropColorHook ? dropColorHook(item) : undefined) ?? RARITY_COLOR[rarity] ?? 0xc8c8c8;
  const tier = RARITY_TIER[rarity] ?? 0;

  const root = new THREE.Group();
  root.name = `drop:${item.baseId}`;

  // The item, shrunk and tipped so its silhouette is legible from above.
  const model = buildItemModel(visual, rng, rarity, item);
  const pivot = new THREE.Group();
  pivot.add(model);
  poseForDrop(model);
  const box = new THREE.Box3().setFromObject(model);
  const size = Math.max(1e-3, box.getSize(new THREE.Vector3()).length());
  // Centre the item on the spin axis, so it turns inside its beam rather than
  // swinging round its grip.
  model.position.sub(box.getCenter(new THREE.Vector3()));
  // Normalise wildly different item sizes to a consistent pickup silhouette.
  pivot.scale.setScalar(Math.min(1, 0.62 / size));
  pivot.position.y = 0.34;
  pivot.name = 'spin';
  pivot.userData.spin = 1.1;
  pivot.userData.bobAmplitude = 0.05;
  pivot.userData.bobSpeed = 1.6;
  root.add(pivot);

  // Light shaft.
  const beamH = 1.5 + tier * 0.35;
  const beamGeo = new THREE.CylinderGeometry(0.055 + tier * 0.012, 0.2 + tier * 0.035, beamH, 14, 1, true);
  const beam = new THREE.Mesh(beamGeo, beamMaterial(color));
  beam.position.y = beamH * 0.5;
  beam.renderOrder = 3;
  beam.name = 'beam';
  root.add(beam);

  // Floor pool.
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85 + tier * 0.16, 0.85 + tier * 0.16),
    additiveMaterial(color, { map: radialGlowTexture(128, 2.6), opacity: 0.55 + tier * 0.08 }),
  );
  pool.rotation.x = -Math.PI * 0.5;
  pool.position.y = 0.012;
  pool.renderOrder = 2;
  pool.name = 'pool';
  root.add(pool);

  // Rare and above get a rune ring on the ground; mythic/ancient get a real
  // light so the drop actually illuminates the floor around it.
  if (tier >= 2) {
    const sigil = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      additiveMaterial(color, { map: runeRingTexture(256, 17), opacity: 0.5 }),
    );
    sigil.rotation.x = -Math.PI * 0.5;
    sigil.position.y = 0.018;
    sigil.userData.spin = -0.35;
    sigil.name = 'sigil';
    root.add(sigil);
  }
  if (tier >= 4) {
    // A brighter second floor pool rather than a real PointLight.
    //
    // Adding a light to the scene changes the light count, and three.js keys its
    // shader program cache on that count — so a mythic hitting the floor made
    // every material in the dungeon recompile, and picking it up did it again.
    // A drop is not worth a stall.
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      additiveMaterial(color, { map: radialGlowTexture(128, 1.7), opacity: 0.4 }),
    );
    halo.rotation.x = -Math.PI * 0.5;
    halo.position.y = 0.008;
    halo.renderOrder = 1;
    halo.name = 'dropLight';
    root.add(halo);
  }

  root.userData.rarity = rarity;
  root.userData.color = color;
  root.userData.uid = item.uid;
  return root;
}

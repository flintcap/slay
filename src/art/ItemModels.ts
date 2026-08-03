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

function decoFor(rarity: ItemRarity, visual: ItemVisual): Deco {
  const tier = RARITY_TIER[rarity] ?? 0;
  const accent = visual.glow ?? RARITY_COLOR[rarity] ?? 0xc8c8c8;
  return {
    tier,
    accent,
    trim: tier >= 1,
    fittings: tier >= 2,
    gems: tier >= 3,
    runes: tier >= 4 || (tier >= 3 && (visual.ornate ?? 0) > 0.5),
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
  metal: THREE.Material;
  dark: THREE.Material;
  trim: THREE.Material;
  wood: THREE.Material;
  leather: THREE.Material;
  cloth: THREE.Material;
  crystal: THREE.Material;
  glow: THREE.Material;
  accent: number;
  deco: Deco;
  rng: Rng;
  ornate: number;
  /** The item's own palette, so builders can ask what it is made of. */
  paletteKey: string;
}

function kitFor(visual: ItemVisual, rarity: ItemRarity, rng: Rng): Kit {
  const deco = decoFor(rarity, visual);
  const base = visual.palette || 'metal.steel';
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
  // Higher rarities get richer base metals — the material itself upgrades.
  const trimKey = deco.tier >= 4 ? 'metal.gold' : deco.tier >= 2 ? 'metal.bronze' : 'metal.dark';
  return {
    metal: surface(base, { repeat: 4, seed }),
    dark: surface('metal.dark', { repeat: 5, seed }),
    trim: surface(trimKey, { repeat: 6, seed }),
    wood: surface('wood.oak', { repeat: 5, seed }),
    leather: surface('leather.worn', { repeat: 6, seed }),
    cloth: surface('cloth.linen', { repeat: 4, seed }),
    crystal: surface('crystal.arcane', { repeat: 3, seed }),
    glow: emissiveMaterial(deco.accent, Math.max(0.6, deco.glow)),
    accent: deco.accent,
    deco,
    rng,
    ornate: visual.ornate ?? 0.35,
    paletteKey: base,
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
      const g = mesh(gem(a.size, 8, 0.5), gemMaterial(deco.accent, { glow: deco.glow * 0.5 }));
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

function buildHilt(
  group: THREE.Group,
  kit: Kit,
  opts: { gripLen: number; gripR: number; guardW: number; guardH: number; guardD: number; pommel: number },
): void {
  const grip = mesh(gripGeo(opts.gripLen, opts.gripR, 7), kit.leather);
  grip.position.y = -opts.gripLen * 0.5;
  group.add(grip);

  // Cross guard: a tapered bar with swept, thickened tips.
  const guard = mesh(
    taperedBox(opts.guardW, opts.guardD * 1.1, opts.guardW * 0.34, opts.guardD, opts.guardH, opts.guardH * 0.3),
    kit.metal,
  );
  guard.rotation.z = Math.PI * 0.5;
  guard.position.y = opts.gripLen * 0.5 - opts.gripLen * 0.5;
  group.add(guard);
  guard.position.y = 0;

  for (const s of [-1, 1]) {
    const tip = mesh(spike(opts.guardW * 0.22, opts.guardD * 0.62, 5, 0.3), kit.metal);
    tip.position.set((s * opts.guardW) / 2, 0, 0);
    tip.rotation.z = -s * Math.PI * 0.5;
    group.add(tip);
    if (kit.deco.fittings) {
      const lug = mesh(beveledBox(opts.guardH * 0.9, opts.guardH * 0.9, opts.guardD * 1.4, opts.guardH * 0.2), kit.trim);
      lug.position.set(s * opts.guardW * 0.3, 0, 0);
      group.add(lug);
    }
  }

  const pommel = mesh(pommelGeo(opts.pommel), kit.deco.trim ? kit.trim : kit.metal);
  pommel.position.y = -opts.gripLen - opts.pommel * 0.5;
  group.add(pommel);

  // A collar where the blade meets the guard — a tiny part that makes the
  // join read as forged rather than glued.
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
  collar.position.y = opts.guardH * 0.4;
  group.add(collar);
}

function buildSword(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  // Blades were long and narrow enough to read as spikes rather than swords,
  // especially seen edge-on. Shorter, wider, thicker, with a guard and pommel
  // big enough to register — heroic-fantasy proportions, not historical ones.
  const len = rng.range(0.70, 0.86);
  const width = rng.range(0.115, 0.155);
  const gripLen = 0.19;

  buildHilt(g, kit, {
    gripLen,
    gripR: 0.023,
    guardW: width * 2.9,
    guardH: 0.05,
    guardD: 0.036,
    pommel: 0.045,
  });

  const bl = blade(len, width, 0.036, { taper: 0.72, fuller: 0.55, tip: 0.74, edges: 10 });
  const bm = mesh(bl, kit.metal);
  bm.position.y = 0.05;
  g.add(bm);

  if (kit.deco.trim) {
    // An etched ricasso band just above the guard.
    const band = mesh(beveledBox(width * 0.9, 0.03, 0.026, 0.006), kit.trim);
    band.position.y = 0.075;
    g.add(band);
  }
  if (kit.deco.runes) {
    // Glowing inlay running the length of the fuller.
    const inlay = mesh(beveledBox(width * 0.16, len * 0.62, 0.006, 0.002), kit.glow);
    inlay.position.set(0, 0.05 + len * 0.4, 0.012);
    inlay.castShadow = false;
    g.add(inlay);
    const back = inlay.clone();
    back.position.z = -0.012;
    g.add(back);
  }

  addRarityDressing(
    g,
    kit,
    [
      { pos: [0, -gripLen - 0.032, 0], size: 0.02 },
      { pos: [0, 0.012, 0.02], size: 0.016, rot: [Math.PI * 0.5, 0, 0] },
    ],
    { pos: [0, 0.05 + len * 0.5, 0], size: len * 0.42, rot: [0, 0, 0] },
  );
}

function buildDagger(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const len = rng.range(0.32, 0.42);
  const width = 0.082;
  const gripLen = 0.1;

  buildHilt(g, kit, {
    gripLen,
    gripR: 0.014,
    guardW: width * 1.9,
    guardH: 0.022,
    guardD: 0.018,
    pommel: 0.02,
  });

  // Wavy, aggressive profile — a dagger must not be a shrunken sword.
  const bl = blade(len, width, 0.016, { taper: 0.42, fuller: 0.3, tip: 0.62, curve: 0.9, edges: 8 });
  const bm = mesh(bl, kit.metal);
  bm.position.y = 0.03;
  g.add(bm);

  if (kit.deco.fittings) {
    const barb = mesh(spike(0.05, 0.012, 5, 0.5), kit.metal);
    barb.position.set(width * 0.42, 0.055, 0);
    barb.rotation.z = -0.9;
    g.add(barb);
  }
  if (kit.deco.runes) {
    const inlay = mesh(beveledBox(0.008, len * 0.5, 0.005, 0.002), kit.glow);
    inlay.position.set(0, 0.03 + len * 0.36, 0.009);
    inlay.castShadow = false;
    g.add(inlay);
  }
  addRarityDressing(g, kit, [{ pos: [0, -gripLen - 0.02, 0], size: 0.015 }], {
    pos: [0, 0.03 + len * 0.5, 0],
    size: len * 0.4,
  });
}

function buildAxe(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const haft = rng.range(0.62, 0.86);
  const headY = haft * 0.86;

  const shaftGeo = latheModulated(
    [
      [0.02, -0.06],
      [0.022, 0.02],
      [0.02, haft * 0.5],
      [0.021, haft * 0.9],
      [0.024, haft],
      [0.0001, haft + 0.01],
    ],
    10,
    (t, a) => 1 + Math.sin(t * 26 + a) * 0.03,
  );
  g.add(mesh(shaftGeo, kit.wood));

  // Bit: a crescent shell rather than a wedge box — the concave cutting edge is
  // the whole read of an axe.
  const bit = shell(0.26, 0.3, 0.035, 8, 9, 0.024, (u, v) => {
    const t = v;
    const back = 0.34 + 0.66 * Math.sin(Math.PI * (0.12 + t * 0.76));
    return u < 0.5 ? back : back * (1 - Math.pow(Math.abs(u - 0.5) * 2, 2) * 0.55);
  });
  const bitMesh = mesh(bit, kit.metal);
  bitMesh.rotation.y = Math.PI * 0.5;
  bitMesh.position.set(0.12, headY, 0);
  g.add(bitMesh);

  // Cutting edge highlight strip.
  const edge = mesh(taperedBox(0.012, 0.03, 0.004, 0.02, 0.28, 0.004), kit.trim);
  edge.position.set(0.235, headY, 0);
  g.add(edge);

  // Socket wrapping the haft.
  const socket = mesh(
    lathe(
      [
        [0.03, headY - 0.09],
        [0.042, headY - 0.05],
        [0.042, headY + 0.05],
        [0.03, headY + 0.09],
      ],
      12,
    ),
    kit.dark,
  );
  g.add(socket);

  if (kit.deco.fittings) {
    // A back spike balances the head — asymmetry that still reads as a tool.
    const back = mesh(spike(0.11, 0.026, 5, -0.25), kit.metal);
    back.position.set(-0.05, headY, 0);
    back.rotation.z = Math.PI * 0.5;
    g.add(back);
    for (const s of [-1, 1]) {
      const langet = mesh(taperedBox(0.018, 0.012, 0.01, 0.008, 0.16, 0.003), kit.trim);
      langet.position.set(0, headY - 0.12, s * 0.021);
      g.add(langet);
    }
  }
  if (kit.deco.runes) {
    const inlay = mesh(new THREE.PlaneGeometry(0.16, 0.16), additiveMaterial(kit.accent, { map: runeRingTexture(256, 5), opacity: 0.9 }));
    inlay.position.set(0.13, headY, 0.02);
    inlay.rotation.y = 0;
    g.add(inlay);
  }
  addRarityDressing(g, kit, [{ pos: [0, headY + 0.12, 0], size: 0.022 }]);
}

function buildMace(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const haft = rng.range(0.5, 0.7);
  const headY = haft + 0.06;

  g.add(
    mesh(
      lathe(
        [
          [0.0001, -0.07],
          [0.026, -0.06],
          [0.021, 0.0],
          [0.019, haft * 0.6],
          [0.024, haft],
        ],
        10,
      ),
      kit.dark,
    ),
  );
  const gripWrap = mesh(gripGeo(0.16, 0.024, 6), kit.leather);
  gripWrap.position.y = -0.05;
  g.add(gripWrap);

  // Head: a flanged lathe, then flanges as separate blades so the silhouette
  // is spiky rather than round.
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
    fl.rotation.set(Math.PI * 0.5, 0, -a);
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
  addRarityDressing(g, kit, [{ pos: [0, -0.075, 0], size: 0.018 }], {
    pos: [0, headY, 0],
    size: 0.28,
  });
}

function buildSpear(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const haft = rng.range(1.35, 1.7);
  g.add(
    mesh(
      latheModulated(
        [
          [0.0001, -0.16],
          [0.02, -0.14],
          [0.018, 0],
          [0.017, haft * 0.7],
          [0.019, haft],
        ],
        10,
        (t, a) => 1 + Math.sin(t * 40 + a) * 0.02,
      ),
      kit.wood,
    ),
  );

  const head = blade(0.3, 0.075, 0.02, { taper: 0.85, fuller: 0.4, tip: 0.6, edges: 8 });
  const hm = mesh(head, kit.metal);
  hm.position.y = haft + 0.02;
  g.add(hm);

  // Socket and langets tying the head to the haft.
  const socket = mesh(
    lathe(
      [
        [0.024, haft - 0.09],
        [0.032, haft - 0.04],
        [0.03, haft + 0.03],
        [0.022, haft + 0.06],
      ],
      12,
    ),
    kit.dark,
  );
  g.add(socket);

  if (kit.deco.fittings) {
    for (const s of [-1, 1]) {
      const wing = mesh(taperedBox(0.05, 0.012, 0.012, 0.008, 0.1, 0.004), kit.metal);
      wing.position.set(s * 0.035, haft + 0.03, 0);
      wing.rotation.z = -s * 0.9;
      g.add(wing);
    }
  }
  // Butt spike, so the weapon does not just stop.
  const butt = mesh(spike(0.1, 0.02, 6, 0), kit.dark);
  butt.rotation.x = Math.PI;
  butt.position.y = -0.14;
  g.add(butt);

  const wrap = mesh(gripGeo(0.24, 0.022, 9), kit.leather);
  wrap.position.y = -0.06;
  g.add(wrap);

  if (kit.deco.runes) {
    const inlay = mesh(beveledBox(0.008, 0.2, 0.005, 0.002), kit.glow);
    inlay.position.set(0, haft + 0.12, 0.01);
    inlay.castShadow = false;
    g.add(inlay);
  }
  addRarityDressing(g, kit, [{ pos: [0, haft - 0.06, 0], size: 0.018 }]);
}

function buildStaff(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const len = rng.range(1.5, 1.8);
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
    (t, a) => 1 + Math.sin(t * 18 + a * 2) * 0.045,
  );
  // A gnarled, twisted stave rather than a broom handle.
  twist(shaftGeo, 0.6);
  displace(shaftGeo, kit.rng, 0.008, 6);
  g.add(mesh(shaftGeo, kit.wood));

  const wrap = mesh(gripGeo(0.3, 0.028, 10), kit.leather);
  wrap.position.y = -0.08;
  g.add(wrap);

  // Crown: claws holding a focus stone.
  const claws = Math.round(3 + kit.ornate * 2);
  for (let i = 0; i < claws; i++) {
    const a = (i / claws) * Math.PI * 2;
    const claw = mesh(spike(0.16, 0.016, 5, 0.55), kit.deco.trim ? kit.trim : kit.dark);
    claw.position.set(Math.cos(a) * 0.03, len - 0.02, Math.sin(a) * 0.03);
    claw.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5);
    g.add(claw);
  }
  const focus = mesh(
    gem(0.055, 8, 0.55),
    kit.deco.tier >= 2 ? gemMaterial(kit.accent, { glow: Math.max(0.5, kit.deco.glow) }) : kit.crystal,
  );
  focus.position.y = len + 0.06;
  focus.castShadow = false;
  g.add(focus);

  if (kit.deco.runes) {
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      additiveMaterial(kit.accent, { map: runeRingTexture(256, 7), opacity: 0.8 }),
    );
    halo.position.y = len + 0.06;
    halo.rotation.x = -Math.PI * 0.5;
    halo.userData.spin = 0.8;
    g.add(halo);
  }
  addRarityDressing(g, kit, [{ pos: [0, len * 0.5, 0], size: 0.02 }]);
}

function buildWand(kit: Kit, g: THREE.Group): void {
  const len = kit.rng.range(0.3, 0.42);
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
  twist(core, 0.9);
  g.add(mesh(core, kit.wood));

  const grip = mesh(gripGeo(0.11, 0.018, 6), kit.leather);
  grip.position.y = -0.04;
  g.add(grip);

  const tip = mesh(gem(0.032, 6, 0.5), gemMaterial(kit.accent, { glow: Math.max(0.7, kit.deco.glow) }));
  tip.position.y = len + 0.02;
  tip.castShadow = false;
  g.add(tip);

  for (const [i, s] of [-1, 1].entries()) {
    if (!kit.deco.fittings) break;
    const prong = mesh(spike(0.07, 0.008, 4, 0.5), kit.trim);
    prong.position.set(s * 0.014, len - 0.03, 0);
    prong.rotation.z = -s * 0.5;
    void i;
    g.add(prong);
  }
  addRarityDressing(g, kit, [{ pos: [0, len * 0.45, 0.016], size: 0.012 }], {
    pos: [0, len + 0.02, 0],
    size: 0.18,
  });
}

function buildScepter(kit: Kit, g: THREE.Group): void {
  const len = kit.rng.range(0.55, 0.7);
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
  grip.position.y = -0.05;
  g.add(grip);

  // Head: a crowned cage.
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
    kit.deco.trim ? kit.trim : kit.metal,
  );
  g.add(cage);

  const bars = 4;
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2;
    const bar = mesh(taperedBox(0.01, 0.01, 0.008, 0.008, 0.13, 0.002), kit.trim);
    bar.position.set(Math.cos(a) * 0.05, len * 0.96, Math.sin(a) * 0.05);
    bar.rotation.set(Math.cos(a) * -0.2, -a, Math.sin(a) * 0.2);
    g.add(bar);
  }
  const stone = mesh(gem(0.038, 8, 0.5), gemMaterial(kit.accent, { glow: Math.max(0.5, kit.deco.glow) }));
  stone.position.y = len * 0.96;
  stone.castShadow = false;
  g.add(stone);

  addRarityDressing(g, kit, [{ pos: [0, -0.085, 0], size: 0.018 }], { pos: [0, len * 0.96, 0], size: 0.24 });
}

function buildBow(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const span = rng.range(1.1, 1.35);
  const depth = 0.16;

  // Limbs: recurved, built as a chain of tapering segments so the profile is a
  // real curve and not a bent stick.
  for (const s of [-1, 1]) {
    const segs = 7;
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const y0 = s * span * 0.5 * t0;
      const y1 = s * span * 0.5 * t1;
      const z0 = -Math.pow(t0, 1.6) * depth + Math.pow(t0, 5) * depth * 1.5;
      const z1 = -Math.pow(t1, 1.6) * depth + Math.pow(t1, 5) * depth * 1.5;
      const w = 0.026 * (1 - t0 * 0.62);
      const seg = beveledBox(w, Math.hypot(y1 - y0, z1 - z0) * 1.08, w * 1.7, w * 0.25, 1);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, y1 - y0, z1 - z0).normalize(),
      );
      m.compose(new THREE.Vector3(0, (y0 + y1) * 0.5, (z0 + z1) * 0.5), q, new THREE.Vector3(1, 1, 1));
      parts.push(seg.clone().applyMatrix4(m));
      seg.dispose();
    }
    const limbGeo = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    g.add(mesh(limbGeo, kit.wood));

    // Nock
    const nock = mesh(beveledBox(0.02, 0.03, 0.026, 0.005), kit.dark);
    nock.position.set(0, s * span * 0.5, -depth * 0.5);
    g.add(nock);
  }

  // Riser and grip.
  const riser = mesh(taperedBox(0.045, 0.05, 0.03, 0.038, 0.26, 0.01), kit.deco.trim ? kit.trim : kit.dark);
  g.add(riser);
  const grip = mesh(gripGeo(0.14, 0.022, 6), kit.leather);
  grip.position.y = -0.07;
  g.add(grip);

  // String: a thin, taut line between the nocks.
  const string = mesh(beveledBox(0.005, span, 0.005, 0.001), kit.dark);
  string.position.z = -depth * 0.5;
  string.castShadow = false;
  g.add(string);

  if (kit.deco.runes) {
    const inlay = mesh(new THREE.PlaneGeometry(0.16, 0.16), additiveMaterial(kit.accent, { map: runeRingTexture(256, 3), opacity: 0.85 }));
    inlay.position.set(0, 0, 0.03);
    g.add(inlay);
  }
  addRarityDressing(g, kit, [
    { pos: [0, 0.1, 0.02], size: 0.016 },
    { pos: [0, -0.1, 0.02], size: 0.016 },
  ]);
}

function buildCrossbow(kit: Kit, g: THREE.Group): void {
  const stock = mesh(taperedBox(0.05, 0.07, 0.035, 0.05, 0.52, 0.008), kit.wood);
  stock.position.y = 0.12;
  g.add(stock);

  // Prod across the front.
  const prod = mesh(taperedBox(0.6, 0.026, 0.12, 0.014, 0.03, 0.006), kit.metal);
  prod.rotation.z = Math.PI * 0.5;
  prod.position.set(0, 0.34, 0.02);
  g.add(prod);
  for (const s of [-1, 1]) {
    const curve = mesh(taperedBox(0.02, 0.02, 0.012, 0.012, 0.12, 0.004), kit.metal);
    curve.position.set(s * 0.3, 0.33, 0.0);
    curve.rotation.set(0.4, 0, -s * 1.35);
    g.add(curve);
  }

  const string = mesh(beveledBox(0.6, 0.005, 0.005, 0.001), kit.dark);
  string.position.set(0, 0.3, -0.03);
  string.castShadow = false;
  g.add(string);

  const lath = mesh(beveledBox(0.09, 0.06, 0.06, 0.012), kit.dark);
  lath.position.y = 0.3;
  g.add(lath);

  const grip = mesh(gripGeo(0.13, 0.022, 6), kit.leather);
  grip.position.y = -0.05;
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
  addRarityDressing(g, kit, [{ pos: [0, 0.14, 0.04], size: 0.018 }], { pos: [0, 0.3, 0.06], size: 0.2 });
}

// ---------------------------------------------------------------------------
// Off-hand
// ---------------------------------------------------------------------------

function buildShield(kit: Kit, g: THREE.Group): void {
  const rng = kit.rng;
  const w = rng.range(0.42, 0.55);
  const h = w * rng.range(1.05, 1.35);

  // Heater profile: wide at the top, tapering to a point.
  const face = shell(w, h, w * 0.16, 10, 12, 0.026, (u, v) => {
    const t = 1 - v;
    const narrow = t < 0.45 ? 1 - Math.pow((0.45 - t) / 0.45, 1.7) * 0.94 : 1;
    void u;
    return narrow;
  });
  g.add(mesh(face, kit.metal));

  // Rim: a slightly larger, thinner shell behind the face reads as a bound edge.
  const rim = shell(w * 1.06, h * 1.04, w * 0.16, 10, 12, 0.014, (u, v) => {
    const t = 1 - v;
    const narrow = t < 0.45 ? 1 - Math.pow((0.45 - t) / 0.45, 1.7) * 0.94 : 1;
    void u;
    return narrow;
  });
  const rimMesh = mesh(rim, kit.deco.trim ? kit.trim : kit.dark);
  rimMesh.position.z = -0.004;
  g.add(rimMesh);

  // Boss.
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
    kit.deco.trim ? kit.trim : kit.metal,
  );
  boss.rotation.x = -Math.PI * 0.5;
  boss.position.set(0, h * 0.08, w * 0.14);
  g.add(boss);

  if (kit.deco.fittings) {
    // Reinforcing straps radiating from the boss.
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI * 0.5 + (i - 1) * 0.85;
      const strap = mesh(taperedBox(0.03, 0.01, 0.018, 0.008, h * 0.42, 0.003), kit.dark);
      strap.position.set(Math.cos(a) * w * 0.16, h * 0.08 + Math.sin(a) * h * 0.2, w * 0.13);
      strap.rotation.z = a + Math.PI * 0.5;
      g.add(strap);
    }
    // Rivets around the rim.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rv = mesh(dome(0.011, 0.7, 6, 3), kit.trim);
      rv.rotation.x = -Math.PI * 0.5;
      rv.position.set(Math.cos(a) * w * 0.42, h * 0.06 + Math.sin(a) * h * 0.36, w * 0.1);
      g.add(rv);
    }
  }
  if (kit.deco.runes) {
    const sigil = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.8, w * 0.8),
      additiveMaterial(kit.accent, { map: runeRingTexture(256, 9), opacity: 0.85 }),
    );
    sigil.position.set(0, h * 0.06, w * 0.18);
    g.add(sigil);
  }

  // Arm straps on the back.
  for (const s of [-1, 1]) {
    const strap = mesh(beveledBox(w * 0.4, 0.03, 0.02, 0.005), kit.leather);
    strap.position.set(0, h * 0.06 + s * h * 0.14, -w * 0.06);
    g.add(strap);
  }

  addRarityDressing(g, kit, [{ pos: [0, h * 0.08, w * 0.2], size: 0.024 }]);
  // Shields hang from the fist rather than pointing out of it.
  g.rotation.set(-Math.PI * 0.5, 0, 0);
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

function buildHelm(kit: Kit, g: THREE.Group): void {
  const r = 0.115;
  const skull = dome(r, 1.22, 16, 8);
  displace(skull, kit.rng, r * 0.012, 8 / r);
  g.add(mesh(skull, kit.metal));

  // Brow ridge and nasal — the two features that make a helm a face.
  const brow = mesh(taperedBox(r * 1.9, r * 0.5, r * 1.7, r * 0.4, r * 0.28, r * 0.06), kit.deco.trim ? kit.trim : kit.metal);
  brow.position.y = r * 0.28;
  g.add(brow);
  const nasal = mesh(taperedBox(r * 0.3, r * 0.16, r * 0.18, r * 0.1, r * 0.7, r * 0.04), kit.metal);
  nasal.position.set(0, r * 0.02, r * 0.86);
  g.add(nasal);

  for (const s of [-1, 1]) {
    const cheek = mesh(shell(r * 0.7, r * 0.85, r * 0.2, 5, 5, r * 0.09), kit.metal);
    cheek.position.set(s * r * 0.72, -r * 0.12, r * 0.3);
    cheek.rotation.y = -s * 0.7;
    g.add(cheek);
  }
  // Neck guard.
  const nape = mesh(shell(r * 1.5, r * 0.6, r * 0.22, 6, 4, r * 0.1), kit.metal);
  nape.position.set(0, -r * 0.3, -r * 0.6);
  nape.rotation.set(0.5, Math.PI, 0);
  g.add(nape);

  if (kit.deco.fittings) {
    // Crest.
    const crest = mesh(shell(r * 0.16, r * 1.9, r * 0.4, 3, 8, r * 0.06), kit.trim);
    crest.rotation.y = Math.PI * 0.5;
    crest.position.y = r * 0.95;
    g.add(crest);
  }
  if (kit.deco.gems) {
    for (const s of [-1, 1]) {
      const horn = mesh(spike(r * 1.1, r * 0.16, 6, 0.5), kit.deco.runes ? kit.glow : kit.trim);
      horn.position.set(s * r * 0.78, r * 0.5, -r * 0.1);
      horn.rotation.set(-0.35, 0, s * 0.75);
      g.add(horn);
    }
  }
  addRarityDressing(g, kit, [{ pos: [0, r * 0.5, r * 0.92], size: r * 0.18 }]);
}

function buildChest(kit: Kit, g: THREE.Group): void {
  const w = 0.42;
  const h = 0.5;
  const front = shell(w, h, 0.13, 9, 10, 0.03, (u, v) =>
    0.72 + 0.28 * Math.sin(Math.PI * (0.18 + v * 0.72)) * (1 - 0.22 * Math.abs(u - 0.5)),
  );
  front.translate(0, 0, 0.02);
  g.add(mesh(front, kit.metal));

  const back = shell(w * 0.96, h * 0.98, 0.1, 8, 9, 0.026);
  back.rotateY(Math.PI);
  back.translate(0, 0, -0.06);
  g.add(mesh(back, kit.metal));

  // Sternum ridge and belt line.
  const ridge = mesh(taperedBox(0.05, 0.05, 0.02, 0.03, h * 0.72, 0.008), kit.deco.trim ? kit.trim : kit.dark);
  ridge.position.set(0, 0.02, 0.14);
  g.add(ridge);
  const beltLine = mesh(beveledBox(w * 0.94, 0.05, 0.2, 0.01), kit.leather);
  beltLine.position.y = -h * 0.46;
  g.add(beltLine);

  // Pauldrons.
  for (const s of [-1, 1]) {
    const pl = mesh(shell(0.2, 0.16, 0.07, 6, 6, 0.024), kit.metal);
    pl.position.set(s * w * 0.52, h * 0.36, 0.01);
    pl.rotation.set(-0.2, 0, s * 0.55);
    g.add(pl);
    if (kit.deco.fittings) {
      const stud = mesh(spike(0.07, 0.018, 5, 0.3), kit.trim);
      stud.position.set(s * w * 0.6, h * 0.44, 0);
      stud.rotation.z = s * 1.0;
      g.add(stud);
    }
  }
  // A surcoat, and only where one belongs.
  //
  // This used to hang undyed linen down the front of every magic-or-better
  // chest piece, which on brown leather is a pale beige slab stuck to your
  // stomach. A surcoat is worn over *metal* — it is what stops a cuirass
  // cooking you — and it is heraldry, so it takes the item's own colour rather
  // than the colour of a bedsheet.
  const metallic = /^(metal|bone)/.test(kit.paletteKey);
  if (kit.deco.tier >= 1 && metallic) {
    const tabard = mesh(
      clothPanel(0.17, 0.34, kit.rng, { segsX: 5, segsY: 7, ripple: 0.05, flare: 0.15, tatter: kit.deco.tier >= 4 ? 0.2 : 0 }),
      // Seed 0 for the same reason `kitFor` uses it: a fresh seed bakes a whole
      // PBR set on the frame the item lands.
      surfaceVariant('cloth.banner', { tint: kit.accent, repeat: 5 }),
    );
    tabard.position.set(0, -h * 0.18, 0.16);
    g.add(tabard);
  }
  if (kit.deco.runes) {
    const sigil = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.26),
      additiveMaterial(kit.accent, { map: runeRingTexture(256, 13), opacity: 0.8 }),
    );
    sigil.position.set(0, 0.05, 0.19);
    g.add(sigil);
  }
  addRarityDressing(g, kit, [{ pos: [0, h * 0.28, 0.17], size: 0.026 }]);
}

function buildGloves(kit: Kit, g: THREE.Group): void {
  const back = mesh(taperedBox(0.085, 0.05, 0.075, 0.045, 0.1, 0.012), kit.leather);
  g.add(back);
  // Segmented plates over the knuckles.
  for (let i = 0; i < 3; i++) {
    const plate = mesh(shell(0.08 - i * 0.006, 0.028, 0.014, 4, 3, 0.01), kit.metal);
    plate.position.set(0, 0.03 - i * 0.028, 0.028);
    plate.rotation.x = -0.25;
    g.add(plate);
  }
  const cuff = mesh(
    lathe(
      [
        [0.048, -0.09],
        [0.058, -0.06],
        [0.05, -0.02],
      ],
      12,
    ),
    kit.deco.trim ? kit.trim : kit.dark,
  );
  g.add(cuff);
  if (kit.deco.fittings) {
    for (const s of [-1, 1]) {
      const stud = mesh(spike(0.035, 0.01, 4, 0.2), kit.trim);
      stud.position.set(s * 0.032, 0.05, 0.026);
      stud.rotation.x = -0.6;
      g.add(stud);
    }
  }
  addRarityDressing(g, kit, [{ pos: [0, 0.0, 0.034], size: 0.014 }]);
}

function buildBoots(kit: Kit, g: THREE.Group): void {
  const foot = mesh(taperedBox(0.09, 0.2, 0.075, 0.16, 0.075, 0.014), kit.leather);
  foot.position.set(0, 0.04, 0.03);
  g.add(foot);
  const shin = mesh(taperedBox(0.085, 0.075, 0.07, 0.06, 0.2, 0.014), kit.leather);
  shin.position.y = 0.17;
  g.add(shin);
  // Toe cap and shin plate.
  const toe = mesh(shell(0.085, 0.07, 0.03, 4, 4, 0.012), kit.metal);
  toe.position.set(0, 0.045, 0.11);
  toe.rotation.x = 0.6;
  g.add(toe);
  const greave = mesh(shell(0.08, 0.2, 0.035, 5, 6, 0.014), kit.metal);
  greave.position.set(0, 0.18, 0.04);
  g.add(greave);
  for (let i = 0; i < 2; i++) {
    const strap = mesh(beveledBox(0.09, 0.018, 0.09, 0.004), kit.dark);
    strap.position.y = 0.12 + i * 0.09;
    g.add(strap);
  }
  if (kit.deco.fittings) {
    const spur = mesh(spike(0.06, 0.012, 5, 0.3), kit.trim);
    spur.position.set(0, 0.06, -0.06);
    spur.rotation.x = Math.PI * 0.5;
    g.add(spur);
  }
  addRarityDressing(g, kit, [{ pos: [0, 0.2, 0.06], size: 0.014 }]);
}

function buildBelt(kit: Kit, g: THREE.Group): void {
  const band = mesh(ring(0.16, 0.022, 24, 6), kit.leather);
  band.rotation.x = Math.PI * 0.5;
  band.scale.set(1, 1, 0.78);
  g.add(band);
  const buckle = mesh(beveledBox(0.075, 0.06, 0.022, 0.008), kit.deco.trim ? kit.trim : kit.metal);
  buckle.position.z = 0.128;
  g.add(buckle);
  const tongue = mesh(beveledBox(0.014, 0.05, 0.03, 0.004), kit.dark);
  tongue.position.z = 0.14;
  g.add(tongue);
  // Hanging pouches — a belt with nothing on it reads as a hoop.
  for (const s of [-1, 1]) {
    const pouch = mesh(taperedBox(0.06, 0.04, 0.05, 0.032, 0.07, 0.012), kit.leather);
    pouch.position.set(s * 0.11, -0.05, 0.06);
    g.add(pouch);
  }
  if (kit.deco.fittings) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const stud = mesh(dome(0.011, 0.7, 6, 3), kit.trim);
      stud.position.set(Math.cos(a) * 0.158, 0, Math.sin(a) * 0.123);
      stud.rotation.x = Math.PI * 0.5;
      stud.rotation.z = -a;
      g.add(stud);
    }
  }
  addRarityDressing(g, kit, [{ pos: [0, 0, 0.15], size: 0.018 }]);
}

function buildAmulet(kit: Kit, g: THREE.Group): void {
  // Chain: individual links, because a torus reads as a hula hoop.
  const links = 22;
  for (let i = 0; i < links; i++) {
    const t = i / links;
    const a = Math.PI * 0.25 + t * Math.PI * 1.5;
    const link = mesh(ring(0.009, 0.0028, 8, 5), kit.deco.trim ? kit.trim : kit.metal);
    link.position.set(Math.cos(a) * 0.075, Math.sin(a) * 0.075 * 1.25, 0);
    link.rotation.set(i % 2 === 0 ? Math.PI * 0.5 : 0, 0, a);
    g.add(link);
  }
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
    kit.deco.trim ? kit.trim : kit.metal,
  );
  bezel.rotation.x = Math.PI * 0.5;
  bezel.position.y = -0.085;
  g.add(bezel);
  const stone = mesh(gem(0.026, 8, 0.55), gemMaterial(kit.accent, { glow: Math.max(0.5, kit.deco.glow) }));
  stone.rotation.x = Math.PI * 0.5;
  stone.position.set(0, -0.085, 0.008);
  stone.castShadow = false;
  g.add(stone);
  if (kit.deco.fittings) {
    for (const s of [-1, 1]) {
      const wing = mesh(taperedBox(0.03, 0.006, 0.008, 0.004, 0.03, 0.002), kit.trim);
      wing.position.set(s * 0.03, -0.085, 0);
      wing.rotation.z = s * 0.9;
      g.add(wing);
    }
  }
  addRarityDressing(g, kit, [], { pos: [0, -0.085, 0.012], size: 0.11 });
}

function buildRing(kit: Kit, g: THREE.Group): void {
  const band = mesh(latheModulated(
    [
      [0.026, -0.006],
      [0.03, -0.004],
      [0.03, 0.004],
      [0.026, 0.006],
    ],
    22,
    (t, a) => 1 + Math.cos(a * 6) * 0.02,
  ), kit.deco.trim ? kit.trim : kit.metal);
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
    kit.metal,
  );
  g.add(bezel);
  const stone = mesh(gem(0.014, 6, 0.55), gemMaterial(kit.accent, { glow: Math.max(0.4, kit.deco.glow) }));
  stone.position.y = 0.048;
  stone.castShadow = false;
  g.add(stone);
  if (kit.deco.gems) {
    for (const s of [-1, 1]) {
      const chip = mesh(gem(0.006, 6, 0.5), gemMaterial(kit.accent, { glow: kit.deco.glow * 0.4 }));
      chip.position.set(s * 0.018, 0.036, 0);
      chip.castShadow = false;
      g.add(chip);
    }
  }
  addRarityDressing(g, kit, [], kit.deco.runes ? { pos: [0, 0.04, 0], size: 0.09 } : undefined);
}

// ---------------------------------------------------------------------------
// Consumables / misc
// ---------------------------------------------------------------------------

function buildPotion(kit: Kit, g: THREE.Group): void {
  const glass = mesh(
    lathe(
      [
        [0.0001, 0],
        [0.042, 0.004],
        [0.05, 0.03],
        [0.048, 0.07],
        [0.024, 0.1],
        [0.018, 0.13],
        [0.022, 0.145],
        [0.0001, 0.15],
      ],
      16,
    ),
    kit.crystal,
  );
  g.add(glass);
  const fluid = mesh(
    lathe(
      [
        [0.0001, 0.006],
        [0.04, 0.008],
        [0.044, 0.03],
        [0.042, 0.062],
        [0.02, 0.085],
        [0.0001, 0.088],
      ],
      14,
    ),
    emissiveMaterial(kit.accent, 1.4),
  );
  fluid.castShadow = false;
  g.add(fluid);
  const cork = mesh(beveledBox(0.024, 0.02, 0.024, 0.005), kit.wood);
  cork.position.y = 0.157;
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
  for (let i = 0; i < 3; i++) {
    const chip = mesh(gem(0.018, 6, 0.5), gemMaterial(kit.accent, { glow: 0.6 }));
    const a = (i / 3) * Math.PI * 2;
    chip.position.set(Math.cos(a) * 0.05, 0.018, Math.sin(a) * 0.05);
    chip.rotation.y = a;
    chip.castShadow = false;
    g.add(chip);
  }
}

function buildRuneItem(kit: Kit, g: THREE.Group): void {
  const slab = beveledBox(0.1, 0.14, 0.03, 0.012, 2);
  displace(slab, kit.rng, 0.004, 30);
  g.add(mesh(slab, surface('stone.void', { repeat: 4 })));
  const glyph = new THREE.Mesh(
    new THREE.PlaneGeometry(0.085, 0.085),
    additiveMaterial(kit.accent, { map: runeRingTexture(256, 21), opacity: 0.95 }),
  );
  glyph.position.z = 0.017;
  g.add(glyph);
  const back = glyph.clone();
  back.position.z = -0.017;
  back.rotation.y = Math.PI;
  g.add(back);
}

function buildCharm(kit: Kit, g: THREE.Group): void {
  const body = beveledBox(0.06, 0.11, 0.018, 0.008, 2);
  g.add(mesh(body, kit.deco.trim ? kit.trim : kit.metal));
  const inlay = mesh(gem(0.018, 6, 0.5), gemMaterial(kit.accent, { glow: Math.max(0.5, kit.deco.glow) }));
  inlay.position.z = 0.014;
  inlay.rotation.x = Math.PI * 0.5;
  inlay.castShadow = false;
  g.add(inlay);
  const loop = mesh(ring(0.012, 0.004, 12, 5), kit.metal);
  loop.position.y = 0.064;
  g.add(loop);
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
export function buildItemModel(visual: ItemVisual, rng: Rng, rarity: ItemRarity): THREE.Object3D {
  const shape = resolveShape(visual.shape, visual.palette, visual.ornate);
  const kit = kitFor(visual, rarity, rng);
  const group = new THREE.Group();
  group.name = `item:${shape}:${rarity}`;

  const builder = BUILDERS[shape] ?? buildSword;
  try {
    builder(kit, group);
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
  const model = buildItemModel(visual, rng, rarity);
  const pivot = new THREE.Group();
  pivot.add(model);
  model.rotation.set(0.35, 0, Math.PI * 0.28);
  const box = new THREE.Box3().setFromObject(model);
  const size = Math.max(1e-3, box.getSize(new THREE.Vector3()).length());
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

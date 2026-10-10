/**
 * SLAY — armour grown on the hero who wears it.
 *
 * Every piece is a shell of the hero's own body field (see `Garment.ts`):
 * pushed out by the thickness of its material, cut by planes and fields to
 * its outline, and given extra shapes where armour stands off the body
 * (pauldrons, a breastplate's keel, a gauntlet's cuff, horns). It skins from
 * the body's field, so it fits a broad warden and a slight pyromancer alike
 * and bends where they bend.
 *
 * What the item is decides the cut, read from its `ItemLook` (items owns it):
 *  - the sub-type in `visual.shape` (`chest.plate`, `helm.horned`...) picks it;
 *  - the base tier grows it: entry, mid and elite bases are different suits;
 *  - rarity adds trim, then fittings, then gems, then glowing runes;
 *  - every piece of a set wears the set's colour in its trim.
 */
import * as THREE from 'three';
import type { EquipSlot, Item, ItemVisual } from '../../types';
import { itemLook, type ItemLook } from '../ItemLook';
import { G } from './Anatomy';
import type { BodyMesh } from './Body';
import { garment, type GarmentSpec } from './Garment';
import type { HeroModel } from './Hero';
import { fabricMaterial, gearMaterial, glowMaterial } from './HeroMaterials';
import { buildCape } from './Cape';
import type { Clip, Inflate } from './Mesher';
import { FieldBuilder, alongY, rot, type Prim } from './Sdf';
import type { HeroBone } from './Rig';

type F3 = (x: number, y: number, z: number) => number;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function sdBox(x: number, y: number, z: number, c: THREE.Vector3, b: THREE.Vector3, r: number): number {
  const qx = Math.abs(x - c.x) - b.x + r;
  const qy = Math.abs(y - c.y) - b.y + r;
  const qz = Math.abs(z - c.z) - b.z + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/** What wearing a piece does. */
export interface WornArmour {
  /** Holds the piece's skinned meshes; already parented under the hero. */
  object: THREE.Group;
  /** Hero parts it hides: 'hair', 'beard', 'brows', 'hood', 'mask', 'belt', 'shorts', 'wrap'. */
  hides: string[];
}

interface Part {
  name: string;
  spec: GarmentSpec;
  mat: THREE.Material;
}

/** The materials a piece can use. */
interface Mats {
  main: THREE.Material;
  trim: THREE.Material;
  dark: THREE.Material;
  glow: THREE.Material;
  gem: THREE.Material;
}

function mats(look: ItemLook): Mats {
  return {
    main: gearMaterial(look.palette),
    trim: gearMaterial(look.trimKey, { tint: look.trimTint, metalness: 0.8 }),
    dark: gearMaterial('leather.studded'),
    glow: glowMaterial(look.glowColor, Math.max(1.1, look.glow)),
    gem: glowMaterial(look.stone, 0.8 + look.glow * 0.25),
  };
}

/** Context for building one piece on one body. */
class Cut {
  readonly h: number;
  readonly j: BodyMesh['joints'];
  constructor(readonly body: BodyMesh) {
    this.h = body.anatomy.h;
    this.j = body.joints;
  }
  H(x: number, y: number, z: number): THREE.Vector3 {
    return V(x * this.h, y * this.h, z * this.h);
  }
  /** Keep everything at or below height y (heads). */
  below(y: number): Clip {
    return { n: V(0, 1, 0), d: y * this.h };
  }
  above(y: number): Clip {
    return { n: V(0, -1, 0), d: -y * this.h };
  }
  /**
   * A cut square to a bone, `t` of the way from joint `a` to joint `b`,
   * keeping the `keep` side. Only the limb past the cut is taken away: the
   * removed region is a capsule `r` heads wide running on from the cut, so
   * the torso and the other limbs are never touched.
   */
  limb(a: HeroBone, b: HeroBone, t: number, keep: 'a' | 'b', r = 0.4): Clip {
    const A = this.j[a];
    const B = this.j[b];
    const at = A.clone().lerp(B, t);
    const dir = B.clone().sub(A).normalize();
    const away = keep === 'a' ? dir : dir.clone().negate();
    const end = at.clone().addScaledVector(away, 2.6 * this.h);
    const R = r * this.h;
    const d = away.dot(at);
    const sx = end.x - at.x;
    const sy = end.y - at.y;
    const sz = end.z - at.z;
    const ll = sx * sx + sy * sy + sz * sz;
    return {
      cut: (x, y, z) => {
        const px = x - at.x;
        const py = y - at.y;
        const pz = z - at.z;
        const u = Math.min(1, Math.max(0, (px * sx + py * sy + pz * sz) / ll));
        const cap = Math.hypot(px - sx * u, py - sy * u, pz - sz * u) - R;
        return Math.max(cap, d - (away.x * x + away.y * y + away.z * z));
      },
    };
  }
  /** The neckline: lower in front than behind. */
  neck(front: number, back: number): Clip {
    const n = V(0, 1, (front - back) / 0.6).normalize();
    // Passes through (0, back, -0.3) and (0, front, 0.3).
    return { n, d: n.dot(this.H(0, back, -0.3)) };
  }
  /** Distance inside a plane clip (positive in the kept region), for tapering. */
  inside(c: Clip): F3 {
    if ('cut' in c) return c.cut;
    return (x, y, z) => c.d - (c.n.x * x + c.n.y * y + c.n.z * z);
  }
}

/** Thickness that thins toward the given edges, so a hem reads as a rolled edge. */
function hem(t: number, edges: F3[], band: number, under = 0.4): Inflate {
  return (x, y, z) => {
    let k = 1;
    for (const e of edges) k = Math.min(k, smooth(0, band, e(x, y, z)));
    return t * (under + (1 - under) * k);
  };
}

/** A band along an edge: kept where it is within `w` of any of the edges. */
function bandAlong(edges: F3[], w: number): Clip {
  return {
    cut: (x, y, z) => {
      let d = Infinity;
      for (const e of edges) d = Math.min(d, e(x, y, z));
      return w - d;
    },
  };
}

// ---------------------------------------------------------------------------
// Chest
// ---------------------------------------------------------------------------

function chest(c: Cut, look: ItemLook, m: Mats, parts: Part[], hides: string[]): void {
  const h = c.h;
  const kind = chestKind(look);
  const tier = look.baseTier;
  const both = [G.torso, G.armL, G.armR];
  hides.push('wrap');
  if (kind !== 'leather') hides.push('shorts');
  if (kind === 'robe') {
    const F = new FieldBuilder();
    F.group = G.torso;
    // A skirt to the shins, flaring.
    F.cone(c.H(0, 4.3, -0.02), c.H(0, 1.3 - 0.3 * tier, -0.02), 0.62 * h, (0.95 + 0.1 * tier) * h, 0.2 * h);
    const neck = c.neck(5.95, 6.2);
    const sleeveL = c.limb('foreArmL', 'handL', 0.55 - 0.15 * tier, 'a');
    const sleeveR = c.limb('foreArmR', 'handR', 0.55 - 0.15 * tier, 'a');
    const bottom = c.above(1.3 - 0.3 * tier);
    const clips = [neck, sleeveL, sleeveR, bottom];
    const edges = clips.map((k) => c.inside(k));
    const robeHem = hem(0.008, edges, 0.04 * h, 0.6);
    const base: GarmentSpec = {
      groups: [...both, G.legL, G.legR],
      thickness: (x, y, z) => {
        // Folds that deepen down the skirt.
        const fold = Math.sin(Math.atan2(x, z) * 9 + Math.sin(y * 9) * 0.6) * 0.012 * smooth(4.2 * h, 1.6 * h, y);
        return (robeHem as F3)(x, y, z) + Math.max(-0.004, fold);
      },
      clips,
      extra: F.prims,
      skinGroups: [G.torso, G.armL, G.armR, G.legL, G.legR],
      cell: 0.011,
      tris: 4200,
      yRange: [0.6 * h, 6.5 * h],
    };
    parts.push({ name: 'robe', spec: base, mat: m.main });
    if (look.hasTrim) parts.push({ name: 'robe-trim', spec: { ...base, thickness: 0.011, clips: [...clips, bandAlong(edges, 0.07 * h)], tris: 2200 }, mat: m.trim });
    // A sash at the waist.
    parts.push({
      name: 'robe-sash',
      spec: { groups: [G.torso], thickness: 0.016, clips: [c.below(4.4), c.above(4.15)], extra: F.prims, skinGroups: [G.torso], cell: 0.008, tris: 900, yRange: [4.05 * h, 4.5 * h] },
      mat: m.trim,
    });
    return;
  }

  // Everything but robes: a body piece from neck to hips.
  const neck = c.neck(kind === 'plate' ? 6.02 : 5.98, 6.22);
  const hip = kind === 'leather' ? 3.9 : kind === 'plate' ? 4.02 : 3.55 - 0.15 * tier;
  if (kind === 'mail' || kind === 'scale' || kind === 'plate') {
    // Mail shirt with sleeves to the elbow and a skirt over the thighs; plate wears it underneath.
    const sl = (L: boolean) => c.limb(L ? 'upperArmL' : 'upperArmR', L ? 'foreArmL' : 'foreArmR', kind === 'plate' ? 0.7 : 0.95 + 0.1 * tier, 'a');
    const thigh = (L: boolean) => c.limb(L ? 'thighL' : 'thighR', L ? 'shinL' : 'shinR', 0.4 + 0.1 * tier, 'a', 0.5);
    const clips = [c.neck(6.05, 6.25), sl(true), sl(false), thigh(true), thigh(false)];
    parts.push({
      name: 'hauberk',
      spec: {
        groups: [G.torso, G.armL, G.armR, G.legL, G.legR],
        thickness: hem(0.0075, clips.map((k) => c.inside(k)), 0.03 * h, 0.7),
        clips,
        skinGroups: [G.torso, G.armL, G.armR, G.legL, G.legR],
        cell: 0.011,
        tris: 3600,
        yRange: [2.6 * h, 6.5 * h],
      },
      mat: kind === 'plate' ? gearMaterial('metal.chain') : kind === 'scale' ? m.main : gearMaterial(look.palette.startsWith('metal') ? 'metal.chain' : look.palette),
    });
  }
  if (kind === 'leather' || kind === 'plate') {
    const F = new FieldBuilder();
    F.group = G.torso;
    const plate = kind === 'plate';
    if (plate) {
      // The keel down the breastbone, and a gorget round the neck.
      F.ellipsoid(c.H(0, 5.45, 0.32), V(0.36 * h, 0.62 * h, 0.16 * h), 0.18 * h);
      F.cone(c.H(0, 5.95, -0.05), c.H(0, 6.3, -0.06), 0.36 * h, 0.3 * h, 0.08 * h);
    }
    const clips: Clip[] = [neck, c.above(hip)];
    // Arm holes: the torso alone is grown, so the arm joins stay free.
    const edges = clips.map((k) => c.inside(k));
    const t = plate ? 0.014 + 0.003 * tier : 0.008;
    const base: GarmentSpec = {
      groups: [G.torso],
      thickness: hem(t, edges, 0.05 * h, 0.7),
      clips,
      extra: F.prims.length ? F.prims : undefined,
      skinGroups: [G.torso],
      cell: 0.01,
      tris: 3000,
      yRange: [(hip - 0.1) * h, 6.5 * h],
    };
    parts.push({ name: plate ? 'cuirass' : 'jerkin', spec: base, mat: m.main });
    if (look.hasTrim) parts.push({ name: 'cuirass-trim', spec: { ...base, thickness: t + 0.003, clips: [...clips, bandAlong(edges, 0.06 * h)], tris: 1600 }, mat: m.trim });
  }
  // Pauldrons for plate and scale, layered lames; heavier with the base tier.
  if (kind === 'plate' || kind === 'scale' || (kind === 'leather' && tier >= 1)) {
    const F = new FieldBuilder();
    for (const L of [true, false]) {
      const s = L ? 1 : -1;
      F.group = L ? G.armL : G.armR;
      const S = c.j[L ? 'upperArmL' : 'upperArmR'];
      const big = (kind === 'plate' ? 1 : 0.8) * (1 + 0.15 * tier);
      for (let i = 0; i < 2 + tier; i++) {
        const cc = S.clone().add(V(s * (0.06 + 0.05 * i) * h, (0.16 - 0.17 * i) * h, -0.01 * h));
        F.ellipsoid(cc, V(0.3 * big * (1 - 0.1 * i) * h, 0.12 * h, 0.3 * big * (1 - 0.1 * i) * h), 0.02 * h, rot(0, 0, s * -(0.5 + 0.12 * i)));
      }
      if (tier >= 2) F.cone(S.clone().add(V(s * 0.1 * h, 0.22 * h, 0)), S.clone().add(V(s * 0.22 * h, 0.5 * h, -0.04 * h)), 0.08 * h, 0.01 * h, 0.02 * h);
    }
    parts.push({
      name: 'pauldrons',
      spec: { groups: [], thickness: 0.002, clips: [], extra: F.prims, skinGroups: [G.armL, G.armR, G.torso], cell: 0.009, tris: 2000, yRange: [5.2 * h, 7.0 * h] },
      mat: look.hasTrim && kind === 'plate' && tier >= 2 ? m.trim : m.main,
    });
  }
  // Tassets: plates hanging over the hips.
  if (kind === 'plate' || (kind === 'leather' && tier >= 1)) {
    const F = new FieldBuilder();
    for (const L of [true, false]) {
      const s = L ? 1 : -1;
      F.group = L ? G.legL : G.legR;
      const hp = c.j[L ? 'thighL' : 'thighR'];
      F.box(hp.clone().add(V(s * 0.08 * h, -0.2 * h, 0.2 * h)), V(0.26 * h, (0.3 + 0.08 * tier) * h, 0.03 * h), 0.02 * h, 0.01 * h, rot(-0.12, s * 0.35, s * 0.08));
    }
    parts.push({
      name: 'tassets',
      spec: { groups: [], thickness: 0.002, clips: [], extra: F.prims, skinGroups: [G.legL, G.legR, G.torso], cell: 0.008, tris: 900, yRange: [3.0 * h, 4.4 * h] },
      mat: m.main,
    });
  }
  // A gem at the breast, and runes that glow on the grandest.
  if (look.hasGems) {
    const F = new FieldBuilder();
    F.group = G.torso;
    F.ellipsoid(c.H(0, 5.62, kind === 'plate' ? 0.5 : 0.42), V(0.06 * h, 0.08 * h, 0.04 * h), 0.01 * h);
    parts.push({ name: 'gem', spec: { groups: [], thickness: 0, clips: [], extra: F.prims, skinGroups: [G.torso], cell: 0.004, tris: 200, yRange: [5.4 * h, 5.85 * h] }, mat: m.gem });
  }
}

function chestKind(look: ItemLook): 'robe' | 'leather' | 'mail' | 'scale' | 'plate' {
  const k = look.kind;
  if (k === 'robe' || k === 'leather' || k === 'mail' || k === 'scale' || k === 'plate') return k;
  if (k === 'gothic' || k === 'sacred') return 'plate';
  if (k === 'kraken' || k === 'wyrmhide') return 'scale';
  if (k === 'dusk') return 'leather';
  return look.family === 'cloth' ? 'robe' : look.family === 'leather' ? 'leather' : look.family === 'metal' ? 'plate' : 'leather';
}

// ---------------------------------------------------------------------------
// Helm
// ---------------------------------------------------------------------------

function helm(c: Cut, look: ItemLook, m: Mats, parts: Part[], hides: string[]): void {
  const h = c.h;
  const k = look.kind;
  const tier = look.baseTier;
  const crown = k === 'circlet' || k === 'diadem' || k === 'corona';
  if (crown) {
    // A band round the brow, with points on the grander ones.
    const n = V(0, 1, -0.25).normalize();
    const mid = c.H(0, 7.2, 0);
    const F = new FieldBuilder();
    F.group = G.head;
    const pts = k === 'diadem' ? 5 : k === 'corona' ? 9 : tier;
    for (let i = 0; i < pts; i++) {
      const a = ((i - (pts - 1) / 2) / Math.max(1, pts)) * (k === 'corona' ? 5.2 : 2.2);
      const base = c.H(Math.sin(a) * 0.4, 7.24 + 0.1 * Math.cos(a) * 0.0, Math.cos(a) * 0.42 - 0.06);
      const tall = (i === (pts - 1) / 2 ? 0.2 : 0.11) * h;
      F.cone(base, base.clone().add(V(0, tall, 0)), 0.035 * h, 0.004 * h, 0.01 * h);
    }
    parts.push({
      name: 'circlet',
      spec: {
        groups: [G.head],
        thickness: 0.006,
        clips: [{ cut: (x, y, z) => 0.05 * h - Math.abs(n.x * x + n.y * y + n.z * z - n.dot(mid)) }],
        extra: F.prims.length ? F.prims : undefined,
        skinGroups: [G.head],
        cell: 0.0045,
        tris: 1200,
        yRange: [6.9 * h, 7.7 * h],
      },
      mat: m.main,
    });
    const G2 = new FieldBuilder();
    G2.group = G.head;
    G2.ellipsoid(c.H(0, 7.2, 0.46), V(0.04 * h, 0.05 * h, 0.03 * h), 0.01 * h);
    parts.push({ name: 'circlet-gem', spec: { groups: [], thickness: 0, clips: [], extra: G2.prims, skinGroups: [G.head], cell: 0.003, tris: 160, yRange: [7.1 * h, 7.3 * h] }, mat: m.gem });
    return;
  }
  const full = k === 'full' || k === 'grim' || k === 'spired';
  const leather = look.family === 'leather' || look.family === 'cloth';
  hides.push('hair', 'hood');
  const F = new FieldBuilder();
  F.group = G.head;
  // Room for the hair under it: a dome a little larger than the skull.
  F.ellipsoid(c.H(0, 7.12, -0.07), V(0.41 * h, 0.44 * h, 0.5 * h), 0.08 * h);
  const clips: Clip[] = [];
  if (full) {
    hides.push('beard');
    // Cheek guards and a chin to the neck.
    F.ellipsoid(c.H(0, 6.75, 0.12), V(0.36 * h, 0.36 * h, 0.4 * h), 0.12 * h);
    clips.push(c.above(6.35));
    // The face: an eye slit and, on the better helms, a breathing slot.
    clips.push({ cut: (x, y, z) => sdBox(x, y, z, c.H(0, 7.0, 0.55), c.H(0.27, 0.04, 0.3), 0.02 * h) });
    if (tier >= 1) clips.push({ cut: (x, y, z) => sdBox(x, y, z, c.H(0, 6.72, 0.55), c.H(0.045, 0.2, 0.3), 0.02 * h) });
    else clips.push({ cut: (x, y, z) => sdBox(x, y, z, c.H(0, 6.75, 0.55), c.H(0.22, 0.24, 0.3), 0.08 * h) });
  } else {
    // A cap: down to the brow in front, the nape behind, the face and ears clear.
    const n = V(0, -1, 0.55).normalize();
    clips.push({ n, d: n.dot(c.H(0, 6.86, -0.42)) });
    clips.push({ cut: (x, y, z) => sdBox(x, y, z, c.H(0, 6.6, 0.6), c.H(0.36, 0.52, 0.48), 0.12 * h) });
    // A nasal bar on metal caps of any worth.
    if (!leather && tier >= 1) F.box(c.H(0, 7.0, 0.47), V(0.025 * h, 0.14 * h, 0.03 * h), 0.01 * h, 0.03 * h);
  }
  const edges = clips.map((cl) => c.inside(cl));
  const t = leather ? 0.009 : 0.008 + 0.002 * tier;
  const base: GarmentSpec = {
    groups: [G.head],
    thickness: hem(t, edges, 0.04 * h, 0.7),
    clips,
    extra: F.prims,
    skinGroups: [G.head],
    cell: 0.006,
    tris: 2600,
    yRange: [6.2 * h, 7.8 * h],
  };
  parts.push({ name: 'helm', spec: base, mat: m.main });
  if (look.hasTrim) parts.push({ name: 'helm-trim', spec: { ...base, thickness: t + 0.003, clips: [...clips, bandAlong(edges, 0.05 * h)], tris: 1400 }, mat: m.trim });
  // Crest, horns or spire.
  const top = new FieldBuilder();
  top.group = G.head;
  if (k === 'horned' || k === 'grim' || k === 'bone') {
    for (const s of [1, -1]) {
      const a = c.H(s * 0.3, 7.3, 0.02);
      const b = c.H(s * 0.58, 7.5, 0.06);
      const e = c.H(s * 0.66, 7.95 + 0.1 * tier, -0.06);
      top.cone(a, b, 0.09 * h, 0.06 * h, 0.03 * h);
      top.cone(b, e, 0.06 * h, 0.008 * h, 0.02 * h);
    }
  } else if (k === 'spired') {
    top.cone(c.H(0, 7.5, -0.05), c.H(0, 8.3, -0.12), 0.12 * h, 0.01 * h, 0.06 * h);
  } else if (full && look.rarityTier >= 2) {
    // A comb along the crown.
    top.box(c.H(0, 7.55, -0.06), V(0.02 * h, 0.06 * h, 0.4 * h), 0.015 * h, 0.04 * h);
  }
  if (top.prims.length) {
    const horn = k === 'horned' || k === 'grim' || k === 'bone';
    parts.push({
      name: 'helm-top',
      spec: { groups: [], thickness: 0, clips: [], extra: top.prims, skinGroups: [G.head], cell: 0.006, tris: 1200, yRange: [7.0 * h, 8.6 * h] },
      mat: horn ? gearMaterial('bone.old') : look.hasTrim ? m.trim : m.main,
    });
  }
  if (look.hasGems) {
    const gm = new FieldBuilder();
    gm.group = G.head;
    gm.ellipsoid(c.H(0, 7.25, 0.48), V(0.04 * h, 0.05 * h, 0.03 * h), 0.01 * h);
    parts.push({ name: 'helm-gem', spec: { groups: [], thickness: 0, clips: [], extra: gm.prims, skinGroups: [G.head], cell: 0.003, tris: 160, yRange: [7.1 * h, 7.4 * h] }, mat: m.gem });
  }
}

// ---------------------------------------------------------------------------
// Gloves and boots
// ---------------------------------------------------------------------------

function gloves(c: Cut, look: ItemLook, m: Mats, parts: Part[]): void {
  const h = c.h;
  const k = look.kind;
  const heavy = k === 'plate' || k === 'gauntlets' || k === 'heavy' || k === 'ogre' || look.family === 'metal';
  const silk = k === 'silk' || look.family === 'cloth';
  const tier = look.baseTier;
  const cutAt = heavy ? 0.45 : 0.6;
  const cuffs = [true, false].map((L) => c.limb(L ? 'foreArmL' : 'foreArmR', L ? 'handL' : 'handR', cutAt - 0.1 * tier, 'b'));
  const edges = cuffs.map((cl) => c.inside(cl));
  const F = new FieldBuilder();
  if (heavy) {
    for (const L of [true, false]) {
      F.group = L ? G.armL : G.armR;
      const E = c.j[L ? 'foreArmL' : 'foreArmR'];
      const W = c.j[L ? 'handL' : 'handR'];
      const dir = W.clone().sub(E).normalize();
      // A bell cuff over the wrist.
      F.cone(W.clone().addScaledVector(dir, -0.05 * h), E.clone().lerp(W, cutAt - 0.1 * tier + 0.04), (0.15 + 0.02 * tier) * h, (0.17 + 0.04 * tier) * h, 0.04 * h);
      void alongY;
    }
  }
  const groups = [G.armL, G.armR, G.handL, G.handR, G.fingersL, G.fingersR, G.thumbL, G.thumbR];
  const t = heavy ? 0.0045 : silk ? 0.0016 : 0.0026;
  parts.push({
    name: 'gloves',
    spec: {
      groups,
      thickness: hem(t, edges, 0.03 * h, 0.8),
      clips: cuffs,
      extra: F.prims.length ? F.prims : undefined,
      skinGroups: groups,
      cell: 0.0045,
      tris: 3400,
      yRange: [2.4 * h, 5.0 * h],
    },
    mat: m.main,
  });
  if (look.hasTrim) {
    parts.push({
      name: 'gloves-trim',
      spec: { groups: [G.armL, G.armR], thickness: t + 0.004, clips: [...cuffs, bandAlong(edges, 0.05 * h)], skinGroups: [G.armL, G.armR], cell: 0.004, tris: 800, yRange: [2.4 * h, 5.0 * h] },
      mat: m.trim,
    });
  }
}

function boots(c: Cut, look: ItemLook, m: Mats, parts: Part[]): void {
  const h = c.h;
  const k = look.kind;
  const tier = look.baseTier;
  const heavy = k === 'plate' || look.family === 'metal';
  const silk = k === 'silk' || look.family === 'cloth';
  const top = heavy ? -0.06 : 0.25 - 0.08 * tier;
  const cuffs = [true, false].map((L) => c.limb(L ? 'shinL' : 'shinR', L ? 'footL' : 'footR', top, 'b', 0.55));
  const edges = cuffs.map((cl) => c.inside(cl));
  const t = heavy ? 0.007 : silk ? 0.0028 : 0.0042;
  const F = new FieldBuilder();
  for (const L of [true, false]) {
    const Kn = c.j[L ? 'shinL' : 'shinR'];
    const To = c.j[L ? 'toeL' : 'toeR'];
    F.group = L ? G.legL : G.legR;
    if (heavy) F.ellipsoid(Kn.clone().add(V(0, 0.02 * h, 0.13 * h)), V(0.16 * h, 0.17 * h, 0.1 * h), 0.03 * h);
    F.group = L ? G.footL : G.footR;
    if (heavy || tier >= 1) F.ellipsoid(V(To.x, 0.1 * h, To.z + 0.12 * h), V(0.16 * h, 0.09 * h, 0.2 * h), 0.04 * h);
  }
  const groups = [G.legL, G.legR, G.footL, G.footR];
  const rim = hem(t, edges, 0.03 * h, 0.8);
  parts.push({
    name: 'boots',
    spec: {
      groups,
      // Soles stay on the ground: no thickness under the foot.
      thickness: (x, y, z) => (rim as F3)(x, y, z) * smooth(0, 0.05 * h, y),
      clips: [...cuffs, { n: V(0, -1, 0), d: 0 }],
      extra: F.prims.length ? F.prims : undefined,
      skinGroups: groups,
      cell: 0.0065,
      tris: 3200,
      yRange: [-0.02, 2.6 * h],
    },
    mat: m.main,
  });
  if (look.hasTrim || !heavy) {
    // A folded cuff (or a trim band on the grand ones).
    parts.push({
      name: 'boots-cuff',
      spec: { groups: [G.legL, G.legR], thickness: t + 0.005, clips: [...cuffs, bandAlong(edges, 0.07 * h)], skinGroups: [G.legL, G.legR], cell: 0.005, tris: 800, yRange: [0.4 * h, 2.6 * h] },
      mat: look.hasTrim ? m.trim : m.dark,
    });
  }
}

function belt(c: Cut, look: ItemLook, m: Mats, parts: Part[], hides: string[]): void {
  const h = c.h;
  const k = look.kind;
  hides.push('belt');
  const t = k === 'plate' ? 0.02 : k === 'sash' ? 0.016 : 0.012;
  const F = new FieldBuilder();
  F.group = G.torso;
  if (k === 'sash') F.box(c.H(0.28, 3.7, 0.3), V(0.07 * h, 0.4 * h, 0.02 * h), 0.02 * h, 0.04 * h, rot(0.2, 0.3, 0.1));
  parts.push({
    name: 'belt',
    spec: {
      groups: [G.torso],
      thickness: t,
      clips: [c.below(k === 'plate' ? 4.42 : 4.34), c.above(k === 'plate' ? 4.08 : 4.14)],
      extra: F.prims.length ? F.prims : undefined,
      skinGroups: [G.torso],
      cell: 0.007,
      tris: 1200,
      yRange: [3.1 * h, 4.55 * h],
    },
    mat: k === 'chain' ? gearMaterial('metal.chain') : m.main,
  });
  // The buckle, and plates round a plated belt.
  const B = new FieldBuilder();
  B.group = G.torso;
  B.box(c.H(0, 4.24, 0.5), V(0.1 * h, 0.09 * h, 0.03 * h), 0.015 * h, 0.01 * h);
  if (k === 'plate') {
    for (const a of [-1.2, -0.6, 0.6, 1.2]) B.box(c.H(Math.sin(a) * 0.6, 4.25, Math.cos(a) * 0.45), V(0.08 * h, 0.12 * h, 0.03 * h), 0.015 * h, 0.01 * h, rot(0, a, 0));
  }
  parts.push({
    name: 'belt-buckle',
    spec: { groups: [], thickness: 0, clips: [], extra: B.prims, skinGroups: [G.torso], cell: 0.004, tris: 500, yRange: [3.9 * h, 4.6 * h] },
    mat: m.trim,
  });
}

/** Slots this module dresses. Weapons and shields stay socketed models. */
export function wearsOnBody(slot: EquipSlot): boolean {
  return slot === 'chest' || slot === 'helm' || slot === 'gloves' || slot === 'boots' || slot === 'belt';
}

/**
 * Grows the piece for `item` on `hero` and parents it under the rig. Returns
 * null for slots worn as models (weapons, shields, jewellery).
 */
export function wearArmour(hero: HeroModel, slot: EquipSlot, item: Pick<Item, 'baseId' | 'rarity' | 'uniqueId' | 'setId'>, visual: ItemVisual): WornArmour | null {
  if (!wearsOnBody(slot)) return null;
  const look = itemLook(item, visual);
  const c = new Cut(hero.body);
  const m = mats(look);
  const parts: Part[] = [];
  const hides: string[] = [];
  if (slot === 'chest') chest(c, look, m, parts, hides);
  else if (slot === 'helm') helm(c, look, m, parts, hides);
  else if (slot === 'gloves') gloves(c, look, m, parts);
  else if (slot === 'boots') boots(c, look, m, parts);
  else belt(c, look, m, parts, hides);
  const group = new THREE.Group();
  group.name = `worn:${slot}`;
  hero.rig.root.add(group);
  for (const p of parts) {
    const geo = garment(hero.body, `${slot}:${look.kind}:${look.baseTier}:${p.name}`, p.spec);
    if (!geo.getIndex() || geo.getIndex()!.count === 0) continue;
    const mesh = new THREE.SkinnedMesh(geo, p.mat);
    mesh.name = `${slot}:${p.name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.sharedGeometry = true;
    group.add(mesh);
    mesh.bind(hero.rig.skeleton, new THREE.Matrix4());
  }
  // A cape on the grand suits of mail and plate, in the piece's own colour.
  if (slot === 'chest' && look.rarityTier >= 3 && ['plate', 'scale', 'mail'].includes(chestKind(look))) {
    const col = new THREE.Color(look.trimTint ?? look.accent).multiplyScalar(0.45);
    const cape = buildCape(hero, fabricMaterial('wool', col.getHex(), 0.95, true), group, 4.2 + look.baseTier * 0.3);
    group.userData.capeBones = cape.bones;
  }
  if (look.glow > 0 && look.hasRunes) group.userData.glow = look.glowColor;
  return { object: group, hides };
}

/** Unused-import guard for primitives some cuts may add later. */
export type { Prim };

/** Takes a worn piece off: its meshes, and any bones it hung on the rig. */
export function removeArmour(worn: WornArmour): void {
  const bones = worn.object.userData.capeBones as THREE.Bone[] | undefined;
  if (bones?.[0]) bones[0].removeFromParent();
  worn.object.removeFromParent();
}

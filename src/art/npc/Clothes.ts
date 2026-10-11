/**
 * SLAY — what townsfolk wear.
 *
 * Gear makes the look, for the camp as much as for heroes: a smith is his
 * apron and his bare burned arms, the sister her habit and wimple, the
 * captain her mail and tabard. Two kinds of piece:
 *
 * - **Coats and gowns** are chest cuts in the armour table
 *   (`CHEST_CUTS` in `hero/ArmourChest.ts`), registered here under `npc.*`
 *   shapes and worn through `wearArmour` like any chest piece, so they fit,
 *   bend and trim exactly as hero armour does.
 * - **Trade pieces** no hero wears (an apron, a gravedigger's hood, a wimple
 *   and veil, a brimmed hat, a blindfold, a shawl, burn scars) are cut here
 *   with the armour toolkit (`hero/ArmourKit.ts`): shells of the body's own
 *   field and solid fittings, meshed and cached the same way.
 */
import * as THREE from 'three';
import type { EquipSlot, ItemRarity, ItemVisual } from '../../types';
import { itemLook } from '../ItemLook';
import { G } from '../hero/Anatomy';
import { CHEST_CUTS } from '../hero/ArmourChest';
import { Kit, V, hem, sdEll, smooth, type F3 } from '../hero/ArmourKit';
import { wearArmour } from '../hero/Armour';
import { buildCape } from '../hero/Cape';
import { garment } from '../hero/Garment';
import type { HeroModel } from '../hero/Hero';
import { gearMaterial } from '../hero/HeroMaterials';
import type { Clip } from '../hero/Mesher';
import { FieldBuilder, rot } from '../hero/Sdf';

/** Bump when a trade piece's cut changes (cut functions are not in the mesh cache key). */
const CLOTHES_REV = 1;

// ---------------------------------------------------------------------------
// Coats and gowns: chest cuts
// ---------------------------------------------------------------------------

const NPC_CUTS: Record<string, (typeof CHEST_CUTS)[string]> = {
  // Hesk: a buttoned slate coat to the knee, high collar.
  'npc.coat': { layer: 'gambeson', sleeve: 1.9, hem: 2.45, pattern: 'plain', t: 0.0105, collar: 'stand', flare: 0.6 },
  // Corvane: a long black coat almost to the ankle, high collar.
  'npc.blackcoat': { layer: 'gambeson', sleeve: 1.95, hem: 1.25, pattern: 'plain', t: 0.0105, collar: 'high', flare: 0.5 },
  // Vell: the grey habit of a dissolved order, bell sleeves.
  'npc.habit': { layer: 'robe', sleeve: 1.9, hem: 0.45, pattern: 'folds', t: 0.0085, bell: 0.28, flare: 1.0 },
  // Marrow: a long drab work coat, quilted against the cold.
  'npc.gravecoat': { layer: 'gambeson', sleeve: 1.85, hem: 2.2, pattern: 'quilt', t: 0.011, collar: 'stand', flare: 0.8 },
  // Renn: a mail hauberk under the watch's tabard.
  'npc.watch': { layer: 'hauberk', sleeve: 1.85, hem: 2.6, pattern: 'chain', t: 0.0085, collar: 'coif', tabard: 2.55, pauldron: 'leather', lames: 1 },
  // The Listener: pale gown to the floor, wide sleeves, a deep cowl.
  'npc.oracle': { layer: 'robe', sleeve: 1.95, hem: 0.3, pattern: 'folds', t: 0.008, bell: 0.44, collar: 'cowl', flare: 1.4 },
  // Gilder: a once-fine quilted doublet, padded shoulders.
  'npc.doublet': { layer: 'gambeson', sleeve: 1.92, hem: 3.35, pattern: 'quilt', t: 0.0115, collar: 'stand', pauldron: 'pad', lames: 1, flare: 0.7 },
  // Wenna: a long riding coat in oiled leather.
  'npc.duster': { layer: 'gambeson', sleeve: 1.9, hem: 1.75, pattern: 'plain', t: 0.0115, collar: 'stand', flare: 0.9 },
};
for (const [k, v] of Object.entries(NPC_CUTS)) if (!(k in CHEST_CUTS)) CHEST_CUTS[k] = v;

// ---------------------------------------------------------------------------
// Trade pieces
// ---------------------------------------------------------------------------

export type TradePiece = 'apron' | 'hood' | 'wimple' | 'brimhat' | 'cap' | 'blindfold' | 'shawl' | 'scars' | 'kerchief';

type Cutter = (k: Kit) => void;

/** Positive inside: a soft noise in [-1, 1], cheap and deterministic. */
function blotch(x: number, y: number, z: number, f: number): number {
  return (
    Math.sin(x * f * 1.7 + Math.sin(y * f * 0.9) * 2.1) * 0.5 +
    Math.sin(y * f * 1.3 + Math.sin(z * f * 1.1 + x * f * 0.4) * 1.7) * 0.35 +
    Math.sin(z * f * 2.3 + y * f * 0.7) * 0.15
  );
}

const CUTTERS: Record<TradePiece, Cutter> = {
  /** A heavy apron: a bib from the breastbone, a panel hanging to the shin, a strap round the neck. */
  apron(k) {
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.torso;
    // The panel stands off the thighs so it hangs flat instead of wrapping each leg.
    const front = k.around(3.5, 0).p.z;
    F.box(V(0, 2.75 * h, front + 0.03 * h), V(0.56 * h, 1.05 * h, 0.06 * h), 0.04 * h, 0.22 * h);
    F.box(V(0, 3.75 * h, front - 0.06 * h), V(0.56 * h, 0.35 * h, 0.12 * h), 0.04 * h, 0.25 * h);
    const half = (y: number) => (y > 4.55 * h ? 0.4 * h : y > 4.2 * h ? 0.4 * h + (4.55 * h - y) * 0.5 : 0.58 * h);
    const clips: Clip[] = [
      { cut: (x, _y, z) => z - 0.02 * h },
      { cut: (x, y) => half(y) - Math.abs(x) },
      k.below(5.62),
      k.above(1.65),
    ];
    const edges = clips.map((c) => k.inside(c));
    k.shell('apron', 'main', {
      groups: [G.torso, G.legL, G.legR],
      thickness: hem(0.011, edges, 0.03 * h, 0.55),
      clips,
      extra: F.prims,
      skinGroups: [G.torso, G.legL, G.legR],
      cell: 0.011,
      tris: 2600,
      yRange: [1.55 * h, 5.75 * h],
    });
    // Neck strap and waist ties.
    const S = k.fit('strap', G.torso, 0.006);
    const top = k.around(5.55, 0);
    for (const s of [1, -1]) {
      const a = top.p.clone().add(k.H(s * 0.36, 0, -0.02));
      const n = k.around(6.15, s * 1.2);
      S.cone(a, n.p.clone().addScaledVector(n.n, 0.012), 0.04 * h, 0.035 * h, 0.01 * h);
    }
    for (const s of [1, -1]) {
      const w = k.around(4.25, s * 1.35);
      const b = k.around(4.25, s * 2.4);
      S.cone(w.p.clone().addScaledVector(w.n, 0.012), b.p.clone().addScaledVector(b.n, 0.012), 0.035 * h, 0.035 * h, 0.01 * h);
    }
    k.hides.push('wrap');
  },

  /** A deep peaked hood over a shoulder cape: the gravedigger. */
  hood(k) {
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    F.ellipsoid(k.H(0, 7.08, -0.14), V(0.5 * h, 0.58 * h, 0.62 * h), 0.14 * h);
    F.cone(k.H(0, 7.4, -0.38), k.H(0, 7.0, -0.95), 0.2 * h, 0.03 * h, 0.14 * h);
    const face: Clip = { cut: (x, y, z) => sdEll(x, y, z, k.H(0, 6.88, 0.62), k.H(0.3, 0.46, 0.5)) };
    const clips: Clip[] = [face, k.above(5.7)];
    k.shell('hood', 'main', {
      groups: [G.head, G.torso],
      thickness: (x, y, z) => 0.016 + 0.004 * Math.sin(x * 40 + z * 25) * Math.sin(y * 30),
      clips,
      extra: F.prims,
      skinGroups: [G.head, G.torso],
      cell: 0.007,
      tris: 2600,
      yRange: [5.6 * h, 8.1 * h],
    });
    // The shoulder cape the hood is sewn to.
    const cape: Clip[] = [k.neck(5.95, 6.15), k.above(4.95), k.sleeve(true, 0.5), k.sleeve(false, 0.5)];
    k.shell('hood-cape', 'main', {
      groups: [G.torso, G.armL, G.armR],
      thickness: hem((x, y, z) => 0.03 + 0.006 * Math.sin(Math.atan2(x, z) * 9), cape.map((c) => k.inside(c)), 0.04 * h, 0.4),
      clips: cape,
      skinGroups: [G.torso, G.armL, G.armR],
      cell: 0.01,
      tris: 2000,
      yRange: [4.85 * h, 6.5 * h],
    });
    // The dark inside the hood, so the face sits in shadow.
    k.fit('void', G.head, 0.006).ellipsoid(k.H(0, 7.1, -0.05), V(0.38 * h, 0.4 * h, 0.4 * h), 0.04 * h);
    k.hides.push('hair', 'brows');
  },

  /** A white coif framing the face, a dark veil down the back. */
  wimple(k) {
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    F.ellipsoid(k.H(0, 7.1, -0.08), V(0.46 * h, 0.52 * h, 0.55 * h), 0.1 * h);
    const face: Clip = { cut: (x, y, z) => sdEll(x, y, z, k.H(0, 6.86, 0.55), k.H(0.27, 0.38, 0.45)) };
    const coif: Clip[] = [face, k.above(5.85)];
    k.shell('coif', 'cloth', {
      groups: [G.head, G.torso],
      thickness: 0.011,
      clips: coif,
      extra: F.prims,
      skinGroups: [G.head, G.torso],
      cell: 0.007,
      tris: 2200,
      yRange: [5.75 * h, 7.9 * h],
    });
    // The veil: over the crown and down the back to the shoulder blades.
    const V2 = new FieldBuilder();
    V2.group = G.head;
    V2.ellipsoid(k.H(0, 7.16, -0.14), V(0.5 * h, 0.56 * h, 0.58 * h), 0.12 * h);
    V2.group = G.torso;
    V2.box(k.H(0, 5.95, -0.42), V(0.5 * h, 0.75 * h, 0.12 * h), 0.08 * h, 0.3 * h);
    const veil: Clip[] = [{ cut: (_x, _y, z) => -(z - 0.25 * h) }, k.above(5.1), { cut: (x, y, z) => sdEll(x, y, z, k.H(0, 6.86, 0.6), k.H(0.4, 0.5, 0.55)) }];
    k.shell('veil', 'main', {
      groups: [G.head, G.torso],
      thickness: hem(0.02, veil.map((c) => k.inside(c)), 0.03 * h, 0.5),
      clips: veil,
      extra: V2.prims,
      skinGroups: [G.head, G.torso],
      cell: 0.009,
      tris: 2200,
      yRange: [5.0 * h, 8.0 * h],
    });
    k.hides.push('hair', 'brows');
  },

  /** A wide-brimmed hat, the crown sitting over the hair. */
  brimhat(k) {
    const h = k.h;
    const M = k.fit('main', G.head, 0.006);
    M.ellipsoid(k.H(0, 7.45, -0.06), V(0.47 * h, 0.36 * h, 0.54 * h), 0.08 * h);
    M.ellipsoid(k.H(0, 7.22, -0.04), V(1.05 * h, 0.035 * h, 1.12 * h), 0.03 * h, rot(-0.06, 0, 0));
    k.fit('strap', G.head, 0.005).ellipsoid(k.H(0, 7.3, -0.06), V(0.49 * h, 0.07 * h, 0.56 * h), 0.02 * h);
  },

  /** A soft cap worn rakishly, with a long feather. */
  cap(k) {
    const h = k.h;
    const M = k.fit('main', G.head, 0.006);
    M.ellipsoid(k.H(0.08, 7.5, -0.02), V(0.6 * h, 0.2 * h, 0.62 * h), 0.12 * h, rot(0, 0, -0.18));
    k.fit('strap', G.head, 0.005).ellipsoid(k.H(0, 7.34, -0.04), V(0.48 * h, 0.07 * h, 0.55 * h), 0.02 * h);
    const T = k.fit('trim', G.head, 0.005);
    T.cone(k.H(-0.4, 7.45, 0.0), k.H(-0.7, 8.4, -0.7), 0.07 * h, 0.012 * h, 0.03 * h);
    k.fit('gem', G.head, 0.004).ellipsoid(k.H(-0.42, 7.42, 0.08), V(0.05 * h, 0.05 * h, 0.03 * h), 0.01 * h);
  },

  /** A band of dark silk tied over the eyes, the tails down the back. */
  blindfold(k) {
    const h = k.h;
    const eye = k.body.anatomy.eyes;
    const y = (eye.L.y + eye.R.y) / 2;
    const n = V(0, 1, -0.22).normalize();
    const mid = V(0, y + 0.01 * h, 0);
    k.shell('blindfold', 'main', {
      groups: [G.head],
      thickness: 0.0085,
      clips: [{ cut: (x, yy, z) => 0.14 * h - Math.abs(n.x * x + n.y * yy + n.z * z - n.dot(mid)) }],
      skinGroups: [G.head],
      cell: 0.0045,
      tris: 1300,
      yRange: [y - 0.5 * h, y + 0.5 * h],
    });
    const T = k.fit('main', G.head, 0.005);
    const knot = V(0, y + 0.08 * h, -0.5 * h);
    T.ellipsoid(knot, V(0.08 * h, 0.07 * h, 0.06 * h), 0.02 * h);
    T.cone(knot, knot.clone().add(k.H(0.12, -0.9, -0.12)), 0.06 * h, 0.04 * h, 0.01 * h);
    T.cone(knot, knot.clone().add(k.H(-0.08, -1.05, -0.1)), 0.06 * h, 0.04 * h, 0.01 * h);
  },

  /** A knitted shawl over the shoulders, crossed at the breast. */
  shawl(k) {
    const h = k.h;
    const clips: Clip[] = [k.neck(5.85, 6.25), { cut: (x, y, z) => y - (5.0 * h + 0.35 * h * smooth(0.5 * h, 0, Math.abs(x)) * (z > 0 ? 1 : 0.2)) }, k.sleeve(true, 0.42), k.sleeve(false, 0.42)];
    k.shell('shawl', 'main', {
      groups: [G.torso, G.armL, G.armR],
      thickness: hem((x, y, z) => 0.022 + 0.004 * Math.sin(x * 60) * Math.sin(y * 60 + z * 30), clips.map((c) => k.inside(c)), 0.03 * h, 0.5),
      clips,
      skinGroups: [G.torso, G.armL, G.armR],
      cell: 0.01,
      tris: 1800,
      yRange: [4.75 * h, 6.5 * h],
    });
  },

  /** A kerchief knotted at the throat. */
  kerchief(k) {
    const h = k.h;
    const clips: Clip[] = [k.neck(5.95, 6.32), k.above(5.6)];
    k.shell('kerchief', 'main', {
      groups: [G.torso, G.head],
      thickness: 0.016,
      clips,
      skinGroups: [G.torso, G.head],
      cell: 0.008,
      tris: 900,
      yRange: [5.5 * h, 6.6 * h],
    });
    const p = k.around(5.75, 0);
    k.fit('main', G.torso, 0.005).ellipsoid(p.p.clone().addScaledVector(p.n, 0.02), V(0.09 * h, 0.07 * h, 0.05 * h), 0.02 * h);
  },

  /** Forearms burned white from wrist to elbow: shiny, puckered, blotched at the edges. */
  scars(k) {
    const h = k.h;
    for (const L of [true, false]) {
      const S = L ? 'L' : 'R';
      const e = k.j[`foreArm${S}`];
      const w = k.j[`hand${S}`];
      const axis = w.clone().sub(e);
      const len = axis.length();
      axis.normalize();
      const f: F3 = (x, y, z) => {
        const u = ((x - e.x) * axis.x + (y - e.y) * axis.y + (z - e.z) * axis.z) / len;
        // Thick near the wrist, ragged toward the elbow.
        const reach = 0.25 + 0.75 * smooth(0.05, 0.95, u);
        return blotch(x, y, z, 55) * 0.6 + reach - 0.6;
      };
      k.shell(`scar${S}`, scarMaterial(), {
        groups: [L ? G.armL : G.armR],
        thickness: (x, y, z) => 0.0011 + 0.0007 * Math.max(0, blotch(x, y, z, 140)),
        clips: [k.limb(`foreArm${S}`, `hand${S}`, 0.04, 'b', 0.6), k.limb(`foreArm${S}`, `hand${S}`, 0.96, 'a', 0.6), { cut: f }],
        skinGroups: [L ? G.armL : G.armR],
        cell: 0.005,
        tris: 1100,
        yRange: [Math.min(e.y, w.y) - 0.1, Math.max(e.y, w.y) + 0.1],
      });
    }
  },
};

let scarMat: THREE.Material | null = null;
/** Healed burns: paler and shinier than the skin round them. */
function scarMaterial(): THREE.Material {
  if (!scarMat) scarMat = gearMaterial('flesh.pale|0xfff0ea', { roughness: 0.3 });
  return scarMat;
}

// ---------------------------------------------------------------------------
// Wearing
// ---------------------------------------------------------------------------

/** One thing a resident wears. */
export type Wear =
  | { slot: EquipSlot; visual: ItemVisual; baseId?: string; rarity?: ItemRarity }
  | { trade: TradePiece; palette: string; second?: string; cloth?: string; rarity?: ItemRarity }
  | { cape: string; length: number };

/**
 * Dresses `hero` in one piece. Returns the hero parts it hides
 * ('hair', 'wrap', 'shorts'...). Never throws: a missing piece beats a
 * missing resident.
 */
export function wearPiece(hero: HeroModel, w: Wear, id: string): string[] {
  try {
    if ('slot' in w) {
      const item = { baseId: w.baseId ?? `npc:${id}:${w.slot}`, rarity: w.rarity ?? 'normal' };
      return wearArmour(hero, w.slot, item, w.visual)?.hides ?? [];
    }
    if ('cape' in w) {
      buildCape(hero, gearMaterial(w.cape), hero.rig.root, w.length);
      return [];
    }
    return wearTrade(hero, w, id);
  } catch {
    return [];
  }
}

function wearTrade(hero: HeroModel, w: Extract<Wear, { trade: TradePiece }>, id: string): string[] {
  const visual: ItemVisual = { shape: `npc.${w.trade}`, palette: w.palette };
  const look = itemLook({ baseId: `npc:${id}:${w.trade}`, rarity: w.rarity ?? 'normal' }, visual);
  const k = new Kit(hero.body, look, w.trade);
  if (w.second) k.setMat('strap', w.second);
  if (w.cloth) k.setMat('cloth', w.cloth);
  CUTTERS[w.trade](k);
  const parts = k.finish();
  const group = new THREE.Group();
  group.name = `npc:${w.trade}`;
  hero.rig.root.add(group);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) {
    const mat = p.mat;
    const geo = garment(hero.body, `npc${CLOTHES_REV}:${w.trade}:${p.name}`, p.spec);
    if (!geo.getIndex() || geo.getIndex()!.count === 0) continue;
    const list = byMat.get(mat) ?? [];
    list.push(geo);
    byMat.set(mat, list);
  }
  for (const [mat, geos] of byMat) {
    for (const geo of geos) {
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.name = `npc-${w.trade}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.sharedGeometry = true;
      group.add(mesh);
      mesh.bind(hero.rig.skeleton, new THREE.Matrix4());
    }
  }
  return k.hides;
}

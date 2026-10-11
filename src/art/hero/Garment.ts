/**
 * SLAY — garments grown from the body.
 *
 * A garment is the body's own field pushed out by the cloth's thickness and
 * cut to a band by planes. Its hem is the cut, a thin lip where the cloth
 * stands off the skin. It skins from the same field as the body under it, so
 * it bends exactly as the body does and never needs fitting.
 */
import * as THREE from 'three';
import { meshPart, type BodyMesh } from './Body';
import { G } from './Anatomy';
import type { Clip, Inflate } from './Mesher';
import { meshCached } from './MeshCache';
import { Field, type Prim } from './Sdf';

export interface GarmentSpec {
  /** Body groups the cloth wraps; the rest are left out of its field. */
  groups: number[];
  /** Metres off the skin, or a function of position. */
  thickness: Inflate;
  /** Planes the garment is cut by (kept where `n·p <= d`). */
  clips: Clip[];
  cell?: number;
  tris?: number;
  /** Heights the garment lies between, to keep the meshing box small. */
  yRange: [number, number];
  /** Shapes added to the body's before growing: hanging hair, a hood's peak. */
  extra?: Prim[];
  /** Groups it may skin to (defaults to `groups`). */
  skinGroups?: number[];
}

/**
 * Bump when a garment's cut changes. Thickness and cut functions do not show
 * in the cache key, so a changed function under the same name would read a
 * stale mesh from a player's stored cache.
 */
const GARMENT_REV = 3;

/** The garment's skinned geometry for a body; cached per body and spec name. */
export function garment(
  body: BodyMesh,
  name: string,
  spec: GarmentSpec,
): THREE.BufferGeometry {
  return meshCached(
    `garment|${GARMENT_REV}|${body.hash}|${body.garmentScale}|${name}|${JSON.stringify(spec)}`,
    () => {
      const keep = new Set(spec.groups);
      const base = body.anatomy.field.select((p) => keep.has(p.group));
      const field = spec.extra?.length ? new Field([...base.prims, ...spec.extra]) : base;
      const box = field.bounds().clone();
      box.min.y = Math.max(box.min.y, spec.yRange[0]);
      box.max.y = Math.min(box.max.y, spec.yRange[1]);
      const g = meshPart(
        field,
        body.anatomy,
        box,
        (spec.cell ?? 0.01) * body.garmentScale,
        spec.clips,
        spec.thickness,
        // A coarser body (townspeople) gets fewer triangles to match.
        Math.round((spec.tris ?? 1800) / (body.garmentScale * body.garmentScale)),
        spec.skinGroups ?? spec.groups,
        true,
      );
      g.computeBoundingSphere();
      return g;
    },
  );
}

const up = (y: number): Clip => ({ n: new THREE.Vector3(0, 1, 0), d: y });
const down = (y: number): Clip => ({ n: new THREE.Vector3(0, -1, 0), d: -y });

/**
 * A cut across a limb, square to the bone `t` of the way from joint `a` to
 * `b`, taking away only the limb past it (a capsule running on from the cut),
 * so the torso is never touched.
 */
function limbCut(body: BodyMesh, a: keyof BodyMesh['joints'], b: keyof BodyMesh['joints'], t: number, r = 0.4): Clip {
  const h = body.anatomy.h;
  const A = body.joints[a];
  const B = body.joints[b];
  const at = A.clone().lerp(B, t);
  const away = B.clone().sub(A).normalize();
  const end = at.clone().addScaledVector(away, 2.6 * h);
  const R = r * h;
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

/**
 * Plain linen trousers from the waist to the calf: what every bare hero
 * wears. (Named for the shorts they replaced; `Hero.ts` calls it.)
 */
export function shortsSpec(body: BodyMesh, _female: boolean): GarmentSpec {
  const h = body.anatomy.h;
  return {
    groups: [G.torso, G.legL, G.legR],
    // Loose, with soft folds down the leg.
    thickness: (x, y, z) => 0.008 + 0.003 * Math.sin(Math.atan2(x, z) * 7 + y * 14) * Math.min(1, Math.max(0, (3.6 * h - y) / h)),
    clips: [up(4.36 * h), shinCut(body, true, 0.6), shinCut(body, false, 0.6)],
    cell: 0.01,
    tris: 2400,
    yRange: [0.9 * h, 4.5 * h],
  };
}

/**
 * A plain linen shirt with short sleeves, over the hips: the bare hero's top.
 * (Named for the chest wrap it replaced.)
 */
export function chestWrapSpec(body: BodyMesh): GarmentSpec {
  const h = body.anatomy.h;
  const n = new THREE.Vector3(0, 1, (5.98 - 6.18) / 0.6).normalize();
  const neck: Clip = { n, d: n.dot(new THREE.Vector3(0, 6.18 * h, -0.3 * h)) };
  return {
    groups: [G.torso, G.armL, G.armR],
    thickness: (x, y, z) => 0.0065 + 0.0025 * Math.sin(Math.atan2(x, z) * 5 + y * 10) * Math.min(1, Math.max(0, (5.0 * h - y) / h)),
    clips: [neck, down(3.95 * h), limbCut(body, 'upperArmL', 'foreArmL', 0.5), limbCut(body, 'upperArmR', 'foreArmR', 0.5)],
    cell: 0.01,
    tris: 2600,
    skinGroups: [G.torso, G.armL, G.armR],
    yRange: [3.85 * h, 6.45 * h],
  };
}

/** A plain cord tied at the waist. */
export function beltSpec(body: BodyMesh): GarmentSpec {
  const h = body.anatomy.h;
  return {
    groups: [G.torso],
    thickness: 0.011,
    clips: [up(4.31 * h), down(4.23 * h)],
    cell: 0.007,
    tris: 700,
    yRange: [4.15 * h, 4.4 * h],
  };
}

/** A cut across a shin, square to it, `t` of the way from knee to ankle. */
function shinCut(body: BodyMesh, L: boolean, t: number): Clip {
  const knee = body.joints[L ? 'shinL' : 'shinR'];
  const ankle = body.joints[L ? 'footL' : 'footR'];
  const n = ankle.clone().sub(knee).normalize();
  const at = knee.clone().lerp(ankle, t);
  return { n, d: n.dot(at) };
}

/** Cloth trousers from the waist to the top of the boot. */
export function trousersSpec(body: BodyMesh): GarmentSpec {
  const h = body.anatomy.h;
  return {
    groups: [G.torso, G.legL, G.legR],
    thickness: 0.008,
    clips: [up(4.36 * h), shinCut(body, true, 0.82), shinCut(body, false, 0.82)],
    cell: 0.01,
    tris: 2400,
    yRange: [0.5 * h, 4.5 * h],
  };
}

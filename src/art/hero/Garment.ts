/**
 * SLAY — garments grown from the body.
 *
 * A garment is the body's own field pushed out by the cloth's thickness and
 * cut to a band by planes. Its hem is the cut, a thin lip where the cloth
 * stands off the skin. It skins from the same field as the body under it, so
 * it bends exactly as the body does and never needs fitting.
 */
import * as THREE from "three";
import { meshPart, type BodyMesh } from "./Body";
import { G } from "./Anatomy";
import type { Clip, Inflate } from "./Mesher";
import { meshCached } from "./MeshCache";

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
}

/** The garment's skinned geometry for a body; cached per body and spec name. */
export function garment(
  body: BodyMesh,
  name: string,
  spec: GarmentSpec,
): THREE.BufferGeometry {
  return meshCached(
    `garment|${body.hash}|${name}|${JSON.stringify(spec)}`,
    () => {
      const keep = new Set(spec.groups);
      const field = body.anatomy.field.select((p) => keep.has(p.group));
      const box = field.bounds().clone();
      box.min.y = Math.max(box.min.y, spec.yRange[0]);
      box.max.y = Math.min(box.max.y, spec.yRange[1]);
      const g = meshPart(
        field,
        body.anatomy,
        box,
        spec.cell ?? 0.01,
        spec.clips,
        spec.thickness,
        spec.tris ?? 1800,
        spec.groups,
      );
      g.computeBoundingSphere();
      return g;
    },
  );
}

const up = (y: number): Clip => ({ n: new THREE.Vector3(0, 1, 0), d: y });
const down = (y: number): Clip => ({ n: new THREE.Vector3(0, -1, 0), d: -y });

/** A cut across a leg, square to the thigh, `t` of the way from hip to knee. */
function legCut(body: BodyMesh, L: boolean, t: number): Clip {
  const hip = body.joints[L ? "thighL" : "thighR"];
  const knee = body.joints[L ? "shinL" : "shinR"];
  const n = knee.clone().sub(hip).normalize();
  const at = hip.clone().lerp(knee, t);
  return { n, d: n.dot(at) };
}

/** Linen shorts from the navel to high on the thigh. */
export function shortsSpec(body: BodyMesh, female: boolean): GarmentSpec {
  const h = body.anatomy.h;
  return {
    groups: [G.torso, G.legL, G.legR],
    thickness: 0.006,
    clips: [
      up((female ? 4.22 : 4.3) * h),
      legCut(body, true, female ? 0.18 : 0.3),
      legCut(body, false, female ? 0.18 : 0.3),
    ],
    tris: 1800,
    yRange: [3.0 * h, 4.45 * h],
  };
}

/** A linen wrap over the chest. */
export function chestWrapSpec(body: BodyMesh): GarmentSpec {
  const h = body.anatomy.h;
  return {
    groups: [G.torso],
    thickness: 0.005,
    clips: [up(5.86 * h), down(5.2 * h)],
    tris: 1400,
    yRange: [5.1 * h, 5.95 * h],
  };
}

/** A leather belt at the hips. */
export function beltSpec(body: BodyMesh): GarmentSpec {
  const h = body.anatomy.h;
  return {
    groups: [G.torso],
    thickness: 0.014,
    clips: [up(4.34 * h), down(4.16 * h)],
    cell: 0.008,
    tris: 900,
    yRange: [4.08 * h, 4.42 * h],
  };
}

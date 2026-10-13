/**
 * SLAY — a worn piece's parts meshed on a body.
 *
 * One place turns a cut (`Kit.finish()`) into geometry, so the hero who wears
 * a piece and the icon that shows it (pants are drawn on a stand-in body, see
 * `PantsModel.ts`) mesh it the same way and share the cache.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BodyMesh } from './Body';
import { garment } from './Garment';
import type { Part } from './ArmourKit';

/**
 * Every part's triangle target is scaled by this: a fully dressed hero must
 * stay inside the 60k budget the hero checks hold it to.
 */
const TRI_SCALE = 0.8;

/** Bump when a cut's functions change (thickness and cut functions are not in the mesh cache key). */
const ARMOUR_REV = 5;

const merged = new Map<string, THREE.BufferGeometry>();

/** One geometry for several parts of one material; cached by the parts it joins. */
function mergeParts(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 1) return geos[0]!;
  const key = geos.map((g) => g.uuid).join('|');
  const hit = merged.get(key);
  if (hit) return hit;
  const g = mergeGeometries(geos, false);
  if (!g) return geos[0]!;
  g.computeBoundingSphere();
  g.userData.cached = true;
  if (merged.size > 400) merged.clear();
  merged.set(key, g);
  return g;
}

export interface PieceMesh {
  mat: THREE.Material;
  geo: THREE.BufferGeometry;
  /** The parts merged into it, first first. */
  names: string[];
}

/** A piece's parts on `body`, merged into one geometry per material. */
export function meshPiece(body: BodyMesh, slot: string, cut: string, parts: Part[]): PieceMesh[] {
  // Fittings differ between uniques and sets of one base: their prims are in the cache key.
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; names: string[] }>();
  for (const p of parts) {
    p.spec.tris = Math.round((p.spec.tris ?? 1800) * TRI_SCALE);
    const geo = garment(body, `a${ARMOUR_REV}:${slot}:${cut}:${p.name}`, p.spec);
    if (!geo.getIndex() || geo.getIndex()!.count === 0) continue;
    let e = byMat.get(p.mat);
    if (!e) byMat.set(p.mat, (e = { geos: [], names: [] }));
    e.geos.push(geo);
    e.names.push(p.name);
  }
  return [...byMat].map(([mat, e]) => ({ mat, geo: mergeParts(e.geos), names: e.names }));
}

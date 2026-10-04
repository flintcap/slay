/**
 * SLAY — keeping held items cheap to draw.
 *
 * An item model is authored as many small meshes (a blade, a fuller, a guard,
 * a grip, a pommel, rivets, a stone) because that is the natural way to build
 * one. Drawn that way, a rare sword in a hand costs ten draw calls and a
 * shield another eight, which is most of what a geared character costs. Once
 * an item is attached it never changes shape, so its meshes can be merged into
 * one per material.
 *
 * Anything that moves on its own (`userData.orbit`, `userData.spin`) is left as
 * it is, as are skinned, instanced and vertex-coloured meshes.
 */

import * as THREE from 'three';
import { mergeGeometries } from './Meshes';

function movesOnItsOwn(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) {
    if (p.userData && (p.userData.orbit || p.userData.spin)) return true;
  }
  return false;
}

/**
 * Merges a static model's meshes into one mesh per material, in place, and
 * returns the same root. The root's transform and `userData` are untouched,
 * so it can be socketed exactly as before.
 */
export function compactModel<T extends THREE.Object3D>(root: T): T {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; order: number; cast: boolean }>();
  const merged: THREE.Mesh[] = [];
  const rel = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(m.material) || !m.material || (m.material as THREE.MeshStandardMaterial).vertexColors) return;
    if (movesOnItsOwn(m, root)) return;
    const key = `${m.material.uuid}|${m.renderOrder}`;
    let g = groups.get(key);
    if (!g) {
      g = { mat: m.material, geos: [], order: m.renderOrder, cast: false };
      groups.set(key, g);
    }
    rel.multiplyMatrices(inv, m.matrixWorld);
    const geo = m.geometry.clone();
    geo.applyMatrix4(rel);
    g.geos.push(geo);
    g.cast = g.cast || m.castShadow;
    merged.push(m);
  });
  // Nothing to gain unless at least two meshes share a material.
  if (![...groups.values()].some((g) => g.geos.length > 1)) {
    for (const g of groups.values()) for (const geo of g.geos) geo.dispose();
    return root;
  }
  for (const m of merged) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  for (const g of groups.values()) {
    const geo = g.geos.length === 1 ? g.geos[0]! : mergeGeometries(g.geos);
    if (g.geos.length > 1) for (const x of g.geos) x.dispose();
    const mesh = new THREE.Mesh(geo, g.mat);
    mesh.renderOrder = g.order;
    mesh.castShadow = g.cast;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

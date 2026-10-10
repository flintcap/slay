/**
 * SLAY — a cape that hangs from the shoulders and swings.
 *
 * A curved cloth sheet with its own short chain of bones under the chest
 * bone (`cape0` at the shoulders .. `cape3` at the hem). The hero animator
 * swings the chain from the body's motion (`Secondary.ts`); left alone it
 * hangs straight. Two-sided, so the lining shows when it flies.
 */
import * as THREE from 'three';
import type { HeroModel } from './Hero';

export const CAPE_BONES = 4;

export interface Cape {
  mesh: THREE.SkinnedMesh;
  /** cape0 (shoulders) .. cape3 (toward the hem); rotate on X to swing back, Z to swing aside. */
  bones: THREE.Bone[];
}

const geoCache = new Map<string, THREE.BufferGeometry>();

/** The cape sheet in bind space, weighted to its own bone chain (indices 0..3). */
function capeGeometry(hero: HeroModel, length: number): THREE.BufferGeometry {
  const h = hero.body.anatomy.h;
  const key = `${h}|${hero.body.hash}|${length}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const NU = 14;
  const NV = 18;
  const top = 6.08 * h;
  const bottom = top - length * h;
  const pos: number[] = [];
  const nor: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const idx: number[] = [];
  const j = hero.body.joints;
  const shoulder = Math.abs(j.upperArmL.x) * 0.92;
  for (let v = 0; v <= NV; v++) {
    const t = v / NV;
    const y = top + (bottom - top) * t;
    // Wider and further back toward the hem, so it clears the calves.
    const half = shoulder * (0.86 + 0.32 * t);
    const back = -0.36 * h - 0.3 * h * t * t;
    for (let u = 0; u <= NU; u++) {
      const s = (u / NU) * 2 - 1;
      const x = s * half;
      // Wraps round the back: the edges come forward over the shoulders.
      const wrap = (1 - s * s) * (0.14 - 0.08 * t) * h;
      const z = back - wrap + (1 - t) * Math.abs(s) ** 3 * 0.18 * h;
      // Gathered folds at the top that open out lower down.
      const fold = Math.sin(s * Math.PI * (3 + 2 * t)) * 0.025 * h * (0.3 + t);
      pos.push(x, y, z - fold);
      nor.push(0, 0, -1);
      // Each bone owns a stretch of the length; neighbours blend.
      const f = t * (CAPE_BONES - 1);
      const b0 = Math.min(CAPE_BONES - 2, Math.floor(f));
      const w1 = f - b0;
      si.push(b0, b0 + 1, 0, 0);
      sw.push(1 - w1, w1, 0, 0);
    }
  }
  for (let v = 0; v < NV; v++) {
    for (let u = 0; u < NU; u++) {
      const a = v * (NU + 1) + u;
      const b = a + 1;
      const c = a + NU + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

/** Hangs a cape of `length` heads on the hero's shoulders, bones under the chest. */
export function buildCape(hero: HeroModel, mat: THREE.Material, parent: THREE.Object3D, length = 4.4): Cape {
  const h = hero.body.anatomy.h;
  const chest = hero.rig.bones.chest;
  const chestAt = hero.body.joints.chest;
  const bones: THREE.Bone[] = [];
  const top = 6.08 * h;
  for (let i = 0; i < CAPE_BONES; i++) {
    const b = new THREE.Bone();
    b.name = `cape${i}`;
    const y = top - (length * h * i) / (CAPE_BONES - 1);
    const z = -0.36 * h - 0.3 * h * (i / (CAPE_BONES - 1)) ** 2;
    if (i === 0) {
      b.position.set(0, y - chestAt.y, z - chestAt.z);
      chest.add(b);
    } else {
      const prev = bones[i - 1]!;
      const py = top - (length * h * (i - 1)) / (CAPE_BONES - 1);
      const pz = -0.36 * h - 0.3 * h * ((i - 1) / (CAPE_BONES - 1)) ** 2;
      b.position.set(0, y - py, z - pz);
      prev.add(b);
    }
    bones.push(b);
  }
  hero.rig.root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(capeGeometry(hero, length), mat);
  mesh.name = 'cape';
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.sharedGeometry = true;
  parent.add(mesh);
  // Bind in the rig's own space: the cape's bind pose is where the bones are now.
  const inv = new THREE.Matrix4().copy(hero.rig.root.matrixWorld).invert();
  skeleton.boneInverses = bones.map((b) => new THREE.Matrix4().multiplyMatrices(inv, b.matrixWorld).invert());
  mesh.bind(skeleton, new THREE.Matrix4());
  return { mesh, bones };
}

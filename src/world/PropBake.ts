/**
 * SLAY — small batches of still props baked into one mesh per material.
 *
 * Props are instanced per kind and variant: every brazier of one shape is
 * one draw, every broken column of another shape another. A floor holds a
 * few hundred such batches, most of them one to five copies, and a frame
 * drew sixty-odd of them. Each draw costs the same few dozen microseconds of
 * JavaScript whatever it holds, so that was most of a frame's scenery cost
 * for a handful of triangles each.
 *
 * Batches made of the same material (and casting and taking shadow alike)
 * are baked here into a single mesh: every copy's vertices moved to where it
 * stands. A batch of many copies stays instanced (a field of pebbles would
 * cost more memory baked than it saves), and so does anything that can be
 * opened, smashed or looted, which must be able to vanish on its own.
 *
 * A baked copy looks exactly like its instanced self: it carries the
 * model-space position and normal its texture projection and grime read,
 * and its old instance slot, from which it takes the same per-copy shift.
 */
import * as THREE from 'three/webgpu';
import { canBake } from '../art/props/PropMats';

/** A batch above this many vertices (all its copies) stays instanced. */
const BATCH_VERTS = 72000;
/** Vertices baked on one floor at most. */
const FLOOR_VERTS = 640000;

/**
 * Bakes what it can of `batches` (instanced props under `root`, already
 * placed) and takes the baked batches out of the scene. Returns how many
 * batches were baked.
 */
export function bakeProps(root: THREE.Object3D, batches: readonly THREE.InstancedMesh[]): number {
  const buckets = new Map<string, THREE.InstancedMesh[]>();
  let budget = FLOOR_VERTS;
  // Smallest first, so the budget goes to the most draws saved.
  const fits = batches
    .filter((b) => {
      const m = b.material;
      const g = b.geometry;
      return !Array.isArray(m) && canBake(m) && b.parent === root && g.attributes.position && g.attributes.normal && b.count > 0;
    })
    .map((b) => [b, b.geometry.attributes.position!.count * b.count] as const)
    .filter(([, n]) => n <= BATCH_VERTS)
    .sort((a, b) => a[1] - b[1]);
  for (const [b, n] of fits) {
    if (n > budget) break;
    budget -= n;
    const key = `${(b.material as THREE.Material).uuid}|${b.castShadow}|${b.receiveShadow}|${b.renderOrder}|${b.geometry.attributes.color ? b.geometry.attributes.color.itemSize : 0}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(b);
  }
  let baked = 0;
  for (const list of buckets.values()) {
    // One batch alone gains nothing from baking.
    if (list.length < 2) continue;
    root.add(bake(list));
    for (const b of list) {
      b.removeFromParent();
      b.dispose();
    }
    baked += list.length;
  }
  return baked;
}

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _box = new THREE.Box3();

function bake(list: readonly THREE.InstancedMesh[]): THREE.Mesh {
  let verts = 0;
  let indices = 0;
  for (const b of list) {
    const g = b.geometry;
    verts += g.attributes.position!.count * b.count;
    indices += (g.index ? g.index.count : g.attributes.position!.count) * b.count;
  }
  const first = list[0]!;
  const colorSize = first.geometry.attributes.color?.itemSize ?? 0;
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const lpos = new Float32Array(verts * 3);
  const lnor = new Float32Array(verts * 3);
  const slot = new Float32Array(verts);
  const col = colorSize ? new Float32Array(verts * colorSize) : null;
  const index = new Uint32Array(indices);
  let copies = 0;
  for (const b of list) copies += b.count;
  // Each copy's box where it stands, for checkers that look per copy.
  const boxes = new Float32Array(copies * 6);

  let v = 0;
  let k = 0;
  let c = 0;
  for (const b of list) {
    const g = b.geometry;
    const P = g.attributes.position!;
    const N = g.attributes.normal!;
    const C = g.attributes.color;
    const I = g.index;
    const n = P.count;
    if (!g.boundingBox) g.computeBoundingBox();
    b.updateMatrix();
    for (let i = 0; i < b.count; i++) {
      b.getMatrixAt(i, _m);
      _m.premultiply(b.matrix);
      _n.getNormalMatrix(_m);
      const base = v;
      for (let j = 0; j < n; j++, v++) {
        _v.fromBufferAttribute(P, j);
        lpos[v * 3] = _v.x;
        lpos[v * 3 + 1] = _v.y;
        lpos[v * 3 + 2] = _v.z;
        _v.applyMatrix4(_m);
        pos[v * 3] = _v.x;
        pos[v * 3 + 1] = _v.y;
        pos[v * 3 + 2] = _v.z;
        _v.fromBufferAttribute(N, j);
        lnor[v * 3] = _v.x;
        lnor[v * 3 + 1] = _v.y;
        lnor[v * 3 + 2] = _v.z;
        _v.applyMatrix3(_n).normalize();
        nor[v * 3] = _v.x;
        nor[v * 3 + 1] = _v.y;
        nor[v * 3 + 2] = _v.z;
        slot[v] = i;
        if (col && C) for (let q = 0; q < colorSize; q++) col[v * colorSize + q] = C.getComponent(j, q);
      }
      if (I) for (let j = 0; j < I.count; j++) index[k++] = base + I.getX(j);
      else for (let j = 0; j < n; j++) index[k++] = base + j;
      _box.copy(g.boundingBox!).applyMatrix4(_m);
      _box.min.toArray(boxes, c * 6);
      _box.max.toArray(boxes, c * 6 + 3);
      c++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, colorSize));
  geo.setAttribute('slLocal', new THREE.BufferAttribute(lpos, 3));
  geo.setAttribute('slLocalNormal', new THREE.BufferAttribute(lnor, 3));
  geo.setAttribute('slCopy', new THREE.BufferAttribute(slot, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const mesh = new THREE.Mesh(geo, first.material);
  mesh.name = `prop:baked:${(first.material as THREE.Material).name}`;
  mesh.castShadow = first.castShadow;
  mesh.receiveShadow = first.receiveShadow;
  mesh.renderOrder = first.renderOrder;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.userData.copyBoxes = boxes;
  return mesh;
}

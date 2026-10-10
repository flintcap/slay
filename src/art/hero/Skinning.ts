/**
 * SLAY — skin weights for meshed bodies, and skinned-geometry helpers.
 *
 * A vertex first asks which part of the body it is on (the field's groups,
 * blended softly where two parts flow into each other, so an armpit belongs
 * to both arm and chest), then where along that part's bone chain it sits.
 * Along a chain each bone owns its own length and hands over to the next
 * across a smooth window at the joint. An arm never claims the ribs, and a
 * knee bends with a soft crease rather than a hinge.
 */
import * as THREE from 'three';
import type { Field } from './Sdf';
import type { Chain } from './Anatomy';
import { HERO_BONES, type HeroBone } from './Rig';

const BONE_INDEX = new Map<string, number>(HERO_BONES.map((b, i) => [b, i]));

export function heroBoneIndex(name: HeroBone): number {
  return BONE_INDEX.get(name) ?? 0;
}

function sstep(a: number, b: number, x: number): number {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
}

/** Bone weights along one chain at a point. Writes into `acc` scaled by `m`. */
function chainWeights(chain: Chain, x: number, y: number, z: number, m: number, acc: Float32Array): void {
  // Arc-length coordinate of the nearest point on the polyline.
  const pts = chain.points;
  let best = Infinity;
  let bestL = 0;
  let run = 0;
  const lens: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const l2 = dx * dx + dy * dy + dz * dz;
    const len = Math.sqrt(l2);
    let t = ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / (l2 || 1);
    // The ends extend past their points: below the pelvis is still pelvis.
    const lo = i === 0 ? -4 : 0;
    const hi = i === pts.length - 2 ? 4 : 1;
    t = Math.max(lo, Math.min(hi, t));
    const px = a.x + dx * t - x;
    const py = a.y + dy * t - y;
    const pz = a.z + dz * t - z;
    const d = px * px + py * py + pz * pz;
    if (d < best) {
      best = d;
      bestL = run + t * len;
    }
    lens.push(run);
    run += len;
  }
  // Partition of unity along the chain.
  const n = chain.bones.length;
  let prev = 1;
  for (let i = 0; i < n; i++) {
    let next = 0;
    if (i < n - 1) {
      const at = lens[i + 1];
      const r = chain.blend[i] ?? 0.02;
      next = sstep(at - r, at + r, bestL);
    }
    const w = (i === 0 ? 1 : prev) - next;
    prev = next;
    if (w > 1e-4) acc[heroBoneIndex(chain.bones[i])] += w * m;
  }
}

export interface SkinOpts {
  /** Softness of the hand-over between body parts, metres. */
  soft?: number;
  /** Only these groups may claim vertices (detail meshes). */
  groups?: number[];
}

/** Skin weights for every vertex: 4 bones each. */
export function skinWeights(
  field: Field,
  chains: Chain[],
  pos: Float32Array,
  groupCount: number,
  opts: SkinOpts = {},
): { index: Uint16Array; weight: Float32Array } {
  const n = pos.length / 3;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const gd = new Float32Array(groupCount);
  const acc = new Float32Array(HERO_BONES.length);
  const soft = opts.soft ?? 0.012;
  const allow = opts.groups ? new Set(opts.groups) : null;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    field.groups(x, y, z, gd);
    let dmin = Infinity;
    for (let g = 0; g < groupCount; g++) if ((!allow || allow.has(g)) && gd[g] < dmin) dmin = gd[g];
    acc.fill(0);
    let msum = 0;
    for (let g = 0; g < groupCount; g++) {
      if (allow && !allow.has(g)) continue;
      const e = (gd[g] - dmin) / soft;
      if (e > 4 || !chains[g]) continue;
      const m = Math.exp(-e * e);
      msum += m;
      chainWeights(chains[g], x, y, z, m, acc);
    }
    // Top four.
    for (let k = 0; k < 4; k++) {
      let bi = 0;
      let bw = -1;
      for (let i = 0; i < acc.length; i++) if (acc[i] > bw) {
        bw = acc[i];
        bi = i;
      }
      index[v * 4 + k] = bi;
      weight[v * 4 + k] = Math.max(0, bw);
      acc[bi] = -1;
    }
    let s = weight[v * 4] + weight[v * 4 + 1] + weight[v * 4 + 2] + weight[v * 4 + 3];
    if (s <= 0 || msum <= 0) {
      weight[v * 4] = 1;
      s = 1;
    }
    for (let k = 0; k < 4; k++) weight[v * 4 + k] /= s;
  }
  return { index, weight };
}

/** Binds every vertex rigidly to one bone. */
export function skinRigid(geo: THREE.BufferGeometry, boneIndex: number): void {
  const n = geo.getAttribute('position').count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = boneIndex;
    sw[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
}

/**
 * Merges geometries keeping their skin attributes (three's own merge keeps
 * only what every input has). Missing normals are computed, missing uvs are
 * zero, missing skin binds to bone 0.
 */
export function mergeSkinned(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const usable = list.filter((g) => g.getAttribute('position'));
  if (usable.length === 0) return new THREE.BufferGeometry();
  let vTotal = 0;
  let iTotal = 0;
  for (const g of usable) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    vTotal += g.getAttribute('position').count;
    const idx = g.getIndex();
    iTotal += idx ? idx.count : g.getAttribute('position').count;
  }
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const si = new Uint16Array(vTotal * 4);
  const sw = new Float32Array(vTotal * 4);
  const idxArr = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);
  let vo = 0;
  let io = 0;
  for (const g of usable) {
    const p = g.getAttribute('position');
    const nn = g.getAttribute('normal');
    const t = g.getAttribute('uv');
    const gi = g.getAttribute('skinIndex');
    const gw = g.getAttribute('skinWeight');
    for (let i = 0; i < p.count; i++) {
      const o3 = (vo + i) * 3;
      const o4 = (vo + i) * 4;
      pos[o3] = p.getX(i);
      pos[o3 + 1] = p.getY(i);
      pos[o3 + 2] = p.getZ(i);
      nor[o3] = nn.getX(i);
      nor[o3 + 1] = nn.getY(i);
      nor[o3 + 2] = nn.getZ(i);
      if (t) {
        uv[(vo + i) * 2] = t.getX(i);
        uv[(vo + i) * 2 + 1] = t.getY(i);
      }
      if (gi && gw) {
        for (let k = 0; k < 4; k++) {
          si[o4 + k] = gi.getComponent(i, k);
          sw[o4 + k] = gw.getComponent(i, k);
        }
      } else {
        sw[o4] = 1;
      }
    }
    const index = g.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) idxArr[io + i] = vo + index.getX(i);
      io += index.count;
    } else {
      for (let i = 0; i < p.count; i++) idxArr[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  out.setIndex(new THREE.BufferAttribute(idxArr, 1));
  out.computeBoundingSphere();
  return out;
}

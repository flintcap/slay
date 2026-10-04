/**
 * SLAY — shared kit for skinned bodies and the gear fitted to them.
 *
 * `CharacterModels` builds the person, `WornGear` builds what they wear, and
 * both need the same rig, the same skinning rules and the same idea of where
 * the surface of the body is. Keeping all of that here is what lets a
 * breastplate be cut from the very rings the ribcage was built from, instead
 * of being a one-size shell that floats on a broad warden and swallows a thin
 * pyromancer.
 *
 * Bones carry no bind-pose rotation, so everything here is authored in
 * character space: **+X is the character's left, +Y up, +Z forward**.
 */

import * as THREE from 'three';
import { limb, normalizeGeometry, taperedBox, transformed } from './Meshes';

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

export const BONE_NAMES = [
  'root',
  'hips',
  'spine',
  'chest',
  'head',
  'shoulderL',
  'shoulderR',
  'elbowL',
  'elbowR',
  'handL',
  'handR',
  'hipL',
  'hipR',
  'kneeL',
  'kneeR',
  'footL',
  'footR',
] as const;

export type BoneName = (typeof BONE_NAMES)[number];

/** Parent of each bone. `root` has none. */
export const BONE_PARENT: Record<string, string | null> = {
  root: null,
  hips: 'root',
  spine: 'hips',
  chest: 'spine',
  head: 'chest',
  shoulderL: 'chest',
  shoulderR: 'chest',
  elbowL: 'shoulderL',
  elbowR: 'shoulderR',
  handL: 'elbowL',
  handR: 'elbowR',
  hipL: 'hips',
  hipR: 'hips',
  kneeL: 'hipL',
  kneeR: 'hipR',
  footL: 'kneeL',
  footR: 'kneeR',
};

export interface JointMap {
  [name: string]: THREE.Vector3;
}

export const ARM_L = ['chest', 'shoulderL', 'elbowL', 'handL'];
export const ARM_R = ['chest', 'shoulderR', 'elbowR', 'handR'];
export const LEG_L = ['hips', 'hipL', 'kneeL', 'footL'];
export const LEG_R = ['hips', 'hipR', 'kneeR', 'footR'];
export const TORSO = ['hips', 'spine', 'chest'];
export const SKIRT = ['hips', 'spine'];

// ---------------------------------------------------------------------------
// Body fit: everything gear needs to know about the body it goes on
// ---------------------------------------------------------------------------

/**
 * The measurements of one built body. Stored on the model root as
 * `userData.bodyFit` so equipment can be cut to the body it is going on.
 */
export interface BodyFit {
  /** Standing height. */
  H: number;
  /** Half the distance between the shoulder joints. */
  shW: number;
  /** Half the distance between the hip joints. */
  hipW: number;
  /** Torso depth multiplier. */
  dep: number;
  /** Raw limb thickness multiplier from the class profile. */
  t: number;
  /** Damped limb multiplier actually applied to arm and leg radii. */
  limbT: number;
  /** Head radius. */
  headR: number;
  joints: JointMap;
  segs: Segment[];
  skeleton: THREE.Skeleton;
}

/** One ring of a torso-like stack: width, front depth, back depth. */
export interface TorsoRing {
  y: number;
  w: number;
  /** Depth toward +Z (the chest and belly). */
  df: number;
  /** Depth toward -Z (the back and buttocks). */
  db: number;
  z?: number;
}

/**
 * The torso surface, pelvis to collar. A human is wider than deep, deeper in
 * front at the chest and behind at the seat, pinched at the waist, and the
 * ribcage is *narrower* than the span of the shoulder joints: the arms hang
 * outside it. When the chest was as wide as the shoulders the arm sockets sat
 * inside the ribs, and the only way to make a shoulder read was a deltoid the
 * size of a melon.
 *
 * `inflate` grows every ring outward by a fixed distance, which is how cloth
 * and armour follow the body without ballooning where it is wide.
 */
export function torsoRings(
  fit: Pick<BodyFit, 'H' | 'shW' | 'hipW' | 'dep'> & { limbT?: number },
  inflate = 0,
  from = 0,
  to = 99,
): TorsoRing[] {
  const { H, shW, hipW, dep } = fit;
  // The ribcage stops where the upper arm begins: the joint span less most of
  // an arm's radius.
  const chW = shW - 0.026 * H * (fit.limbT ?? 1);
  const g = inflate;
  const rings: TorsoRing[] = [
    { y: H * 0.44, w: hipW * 0.9, df: hipW * 0.6 * dep, db: hipW * 0.66 * dep },
    { y: H * 0.47, w: hipW * 1.2, df: hipW * 0.84 * dep, db: hipW * 0.98 * dep },
    { y: H * 0.505, w: hipW * 1.28, df: hipW * 0.9 * dep, db: hipW * 1.06 * dep },
    { y: H * 0.54, w: hipW * 1.22, df: hipW * 0.86 * dep, db: hipW * 0.92 * dep },
    // The waist. The single most important ring in the model.
    { y: H * 0.578, w: hipW * 1.04, df: hipW * 0.8 * dep, db: hipW * 0.74 * dep },
    { y: H * 0.625, w: Math.max(hipW * 1.1, chW * 0.8), df: hipW * 0.88 * dep, db: hipW * 0.8 * dep },
    // Ribcage, widening and deepening toward the chest.
    { y: H * 0.68, w: chW * 0.92, df: hipW * 1.06 * dep, db: hipW * 0.98 * dep },
    { y: H * 0.728, w: chW, df: hipW * 1.16 * dep, db: hipW * 1.06 * dep },
    { y: H * 0.765, w: chW * 1.02, df: hipW * 1.08 * dep, db: hipW * 1.06 * dep },
    // Shoulders slope from the neck down to the joints: a flat shelf here is
    // what made every shirt look like a box with corners.
    { y: H * 0.786, w: chW * 0.94, df: hipW * 0.94 * dep, db: hipW * 1.0 * dep },
    { y: H * 0.804, w: chW * 0.76, df: hipW * 0.76 * dep, db: hipW * 0.84 * dep },
    { y: H * 0.819, w: chW * 0.52, df: hipW * 0.58 * dep, db: hipW * 0.66 * dep },
    { y: H * 0.83, w: chW * 0.32, df: hipW * 0.44 * dep, db: hipW * 0.5 * dep },
  ];
  return rings
    .filter((r) => r.y >= H * from - 1e-6 && r.y <= H * to + 1e-6)
    .map((r) => ({ y: r.y, w: r.w + g, df: r.df + g, db: r.db + g, z: r.z }));
}

/** Samples the torso rings at a height, by linear interpolation. */
export function torsoAt(rings: TorsoRing[], y: number): TorsoRing {
  if (y <= rings[0].y) return { ...rings[0], y };
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1];
    const b = rings[i];
    if (y <= b.y) {
      const t = (y - a.y) / Math.max(1e-6, b.y - a.y);
      return {
        y,
        w: a.w + (b.w - a.w) * t,
        df: a.df + (b.df - a.df) * t,
        db: a.db + (b.db - a.db) * t,
        z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t,
      };
    }
  }
  return { ...rings[rings.length - 1], y };
}

// ---------------------------------------------------------------------------
// Bones and segments
// ---------------------------------------------------------------------------

/** Builds the bone hierarchy from character-space joint positions. */
export function buildBones(joints: JointMap): {
  bones: Record<string, THREE.Bone>;
  order: THREE.Bone[];
  rootBone: THREE.Bone;
} {
  const bones: Record<string, THREE.Bone> = {};
  const order: THREE.Bone[] = [];
  for (const name of BONE_NAMES) {
    const b = new THREE.Bone();
    b.name = name;
    bones[name] = b;
    order.push(b);
  }
  for (const name of BONE_NAMES) {
    const parent = BONE_PARENT[name];
    const world = joints[name];
    if (parent) {
      bones[parent].add(bones[name]);
      bones[name].position.copy(world).sub(joints[parent]);
    } else {
      bones[name].position.copy(world);
    }
  }
  const rootBone = bones.root;
  rootBone.updateMatrixWorld(true);
  return { bones, order, rootBone };
}

export interface Segment {
  index: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  name: string;
}

/**
 * A bone's influence volume runs from its own joint to its child's, which is
 * what makes weights follow limbs instead of pooling at joint origins. Leaf
 * bones (hands, feet, head) get a short stub in their own direction.
 */
export function buildSegments(joints: JointMap, order: THREE.Bone[]): Segment[] {
  const childOf: Record<string, string[]> = {};
  for (const name of BONE_NAMES) {
    const p = BONE_PARENT[name];
    if (p) (childOf[p] ??= []).push(name);
  }
  const segs: Segment[] = [];
  order.forEach((bone, index) => {
    const name = bone.name;
    const a = joints[name];
    const kids = childOf[name];
    let b: THREE.Vector3;
    if (kids && kids.length === 1) {
      b = joints[kids[0]];
    } else if (name === 'head') {
      b = a.clone().add(new THREE.Vector3(0, 0.16, 0));
    } else if (name.startsWith('hand')) {
      b = a.clone().add(new THREE.Vector3(0, -0.09, 0));
    } else if (name.startsWith('foot')) {
      b = a.clone().add(new THREE.Vector3(0, 0, 0.13));
    } else if (kids && kids.length > 1) {
      // Torso bones with several children: aim at the average.
      b = new THREE.Vector3();
      for (const k of kids) b.add(joints[k]);
      b.multiplyScalar(1 / kids.length);
    } else {
      b = a.clone().add(new THREE.Vector3(0, 0.1, 0));
    }
    segs.push({ index, a, b, name });
  });
  return segs;
}

const _p = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();

function distToSegment(p: THREE.Vector3, s: Segment): number {
  _ab.subVectors(s.b, s.a);
  _ap.subVectors(p, s.a);
  const len2 = _ab.lengthSq();
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, _ap.dot(_ab) / len2)) : 0;
  _p.copy(s.a).addScaledVector(_ab, t);
  return _p.distanceTo(p);
}

/**
 * Attaches skinIndex/skinWeight to a geometry authored in bind pose.
 * `restrict` limits which bones may claim the part — the single most useful
 * knob here, because it is what stops a robe from tearing between the knees.
 * A lower `falloff` blends more softly across a joint.
 */
export function skinGeometry(geo: THREE.BufferGeometry, segs: Segment[], restrict?: string[], falloff = 3): void {
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const pool = restrict ? segs.filter((s) => restrict.includes(s.name)) : segs;
  const v = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    let bi0 = pool[0].index;
    let bi1 = pool[0].index;
    let d0 = Infinity;
    let d1 = Infinity;
    for (const s of pool) {
      const d = distToSegment(v, s);
      if (d < d0) {
        d1 = d0;
        bi1 = bi0;
        d0 = d;
        bi0 = s.index;
      } else if (d < d1) {
        d1 = d;
        bi1 = s.index;
      }
    }
    const w0 = 1 / Math.pow(d0 + 0.02, falloff);
    const w1 = pool.length > 1 ? 1 / Math.pow(d1 + 0.02, falloff) : 0;
    const sum = w0 + w1;
    si[i * 4] = bi0;
    si[i * 4 + 1] = bi1;
    sw[i * 4] = w0 / sum;
    sw[i * 4 + 1] = w1 / sum;
  }

  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
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

/** Merge preserving skin attributes — the shared merge only carries pos/nor/uv. */
export function mergeSkinned(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const usable = list.filter((g) => g.getAttribute('position'));
  if (usable.length === 0) return new THREE.BufferGeometry();
  let vTotal = 0;
  let iTotal = 0;
  for (const g of usable) {
    normalizeGeometry(g);
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
      const o2 = (vo + i) * 2;
      const o4 = (vo + i) * 4;
      pos[o3] = p.getX(i);
      pos[o3 + 1] = p.getY(i);
      pos[o3 + 2] = p.getZ(i);
      nor[o3] = nn.getX(i);
      nor[o3 + 1] = nn.getY(i);
      nor[o3 + 2] = nn.getZ(i);
      uv[o2] = t.getX(i);
      uv[o2 + 1] = t.getY(i);
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

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

/** Orients a +Y-aligned geometry so it spans from `a` to `b`. */
export function spanTo(geo: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry {
  _dir.subVectors(b, a);
  const len = _dir.length() || 1e-5;
  _dir.divideScalar(len);
  _q.setFromUnitVectors(_up, _dir);
  _m.compose(a, _q, new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(_m);
}

/**
 * Averages the normals of the duplicated seam column of a ring grid, so a
 * limb or torso does not show a lit crease running down its back.
 */
function weldSeam(geo: THREE.BufferGeometry, rows: number, cols: number): void {
  const n = geo.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let r = 0; r < rows; r++) {
    const a = r * (cols + 1);
    const b = a + cols;
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

/**
 * A closed surface from a stack of rings running up +Y, each an ellipse that
 * may be deeper in front than behind. Torsos, skirts, sleeves cut on the body.
 * `arc` limits the ring to part of the circle (in turns, centred on the front)
 * for open shapes such as a breastplate or a face; open shapes get no caps.
 */
export function ringStack(
  rings: Array<{ y: number; w: number; d?: number; df?: number; db?: number; z?: number; x?: number }>,
  cols = 16,
  opts: { arc?: number; caps?: boolean } = {},
): THREE.BufferGeometry {
  const rows = rings.length;
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const arc = opts.arc ?? 1;
  const open = arc < 0.999;
  // Open shapes centre on the front (+Z, angle pi/2).
  const a0 = open ? Math.PI * 0.5 - arc * Math.PI : 0;

  for (let r = 0; r < rows; r++) {
    const ring = rings[r];
    const df = ring.df ?? ring.d ?? ring.w;
    const db = ring.db ?? ring.d ?? ring.w;
    for (let c = 0; c <= cols; c++) {
      const t = c / cols;
      const ang = a0 + t * Math.PI * 2 * arc;
      const s = Math.sin(ang);
      verts.push(Math.cos(ang) * ring.w + (ring.x ?? 0), ring.y, s * (s > 0 ? df : db) + (ring.z ?? 0));
      uvs.push(t, r / (rows - 1));
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const i0 = r * (cols + 1) + c;
      const i1 = i0 + 1;
      const i2 = i0 + cols + 1;
      const i3 = i2 + 1;
      idx.push(i0, i2, i3, i0, i3, i1);
    }
  }
  const caps = opts.caps ?? !open;
  if (caps) {
    const top = rings[rows - 1];
    const capTop = verts.length / 3;
    verts.push(top.x ?? 0, top.y, top.z ?? 0);
    uvs.push(0.5, 1);
    for (let c = 0; c < cols; c++) idx.push(capTop, (rows - 1) * (cols + 1) + c + 1, (rows - 1) * (cols + 1) + c);
    const bot = rings[0];
    const capBot = verts.length / 3;
    verts.push(bot.x ?? 0, bot.y, bot.z ?? 0);
    uvs.push(0.5, 0);
    for (let c = 0; c < cols; c++) idx.push(capBot, c, c + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (!open) weldSeam(geo, rows, cols);
  return geo;
}

/** One station along a swept limb. */
export interface SweepNode {
  p: THREE.Vector3;
  /** Radius across the body (character X, roughly). */
  rx: number;
  /** Radius front-to-back. */
  rz: number;
}

/**
 * A tube swept through a chain of points with an elliptical cross-section at
 * each — an arm from shoulder to wrist, a leg from hip to ankle, a sleeve.
 *
 * One continuous surface is the whole difference between a limb and a string
 * of sausages: the old arms were three separate capsules with a ball at each
 * joint, and every ball read as a doll's hinge.
 */
export function sweep(nodes: SweepNode[], cols = 12, caps = true): THREE.BufferGeometry {
  const rows = nodes.length;
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const T = new THREE.Vector3();
  const X = new THREE.Vector3();
  const Z = new THREE.Vector3();
  const worldX = new THREE.Vector3(1, 0, 0);
  const worldZ = new THREE.Vector3(0, 0, 1);

  let len = 0;
  const along: number[] = [0];
  for (let i = 1; i < rows; i++) {
    len += nodes[i].p.distanceTo(nodes[i - 1].p);
    along.push(len);
  }

  for (let r = 0; r < rows; r++) {
    const prev = nodes[Math.max(0, r - 1)].p;
    const next = nodes[Math.min(rows - 1, r + 1)].p;
    T.subVectors(next, prev).normalize();
    X.copy(worldX).addScaledVector(T, -worldX.dot(T));
    if (X.lengthSq() < 1e-4) X.copy(worldZ).addScaledVector(T, -worldZ.dot(T));
    X.normalize();
    // X x T keeps the same winding as `ringStack` for a chain running downward.
    Z.crossVectors(X, T).normalize();
    const n = nodes[r];
    for (let c = 0; c <= cols; c++) {
      const t = c / cols;
      const ang = t * Math.PI * 2;
      const ca = Math.cos(ang) * n.rx;
      const sa = Math.sin(ang) * n.rz;
      verts.push(n.p.x + X.x * ca + Z.x * sa, n.p.y + X.y * ca + Z.y * sa, n.p.z + X.z * ca + Z.z * sa);
      uvs.push(t, len > 0 ? along[r] / len : 0);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const i0 = r * (cols + 1) + c;
      const i1 = i0 + 1;
      const i2 = i0 + cols + 1;
      const i3 = i2 + 1;
      idx.push(i0, i2, i3, i0, i3, i1);
    }
  }
  if (caps) {
    const a = nodes[0].p;
    const b = nodes[rows - 1].p;
    const c0 = verts.length / 3;
    verts.push(a.x, a.y, a.z);
    uvs.push(0.5, 0);
    for (let c = 0; c < cols; c++) idx.push(c0, c, c + 1);
    const c1 = verts.length / 3;
    verts.push(b.x, b.y, b.z);
    uvs.push(0.5, 1);
    for (let c = 0; c < cols; c++) idx.push(c1, (rows - 1) * (cols + 1) + c + 1, (rows - 1) * (cols + 1) + c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  weldSeam(geo, rows, cols);
  return geo;
}

/** An ellipsoid — skulls, kneecaps, buns, pouches. */
export function blob(w: number, h: number, d: number, seg = 12): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4));
  g.scale(w, h, d);
  return g;
}

/**
 * A sphere whose surface is pushed in or out per direction. `radius(n)` gets
 * the unit direction and returns a radius multiplier; anything below 1 sinks
 * under whatever it covers. Hair, hoods and helm skulls are all this shape
 * with a different rule for where the surface stops.
 */
export function shapedSphere(
  rx: number,
  ry: number,
  rz: number,
  radius: (n: THREE.Vector3) => number,
  seg = 16,
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.75)));
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const k = radius(n);
    pos.setXYZ(i, n.x * rx * k, n.y * ry * k, n.z * rz * k);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export function smooth01(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** A point part-way between two joints, as a new vector. */
export function lerpV(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  return a.clone().lerp(b, t);
}

// ---------------------------------------------------------------------------
// Anatomy shared by the body and the gear cut to it
// ---------------------------------------------------------------------------

/**
 * Arm stations from the shoulder to the heel of the hand. `inflate` grows the
 * section by a fixed distance, which is how a sleeve or a vambrace is cut.
 * `side` is +1 for the left arm (+X) and -1 for the right.
 */
export function armNodes(fit: BodyFit, side: 1 | -1, inflate = 0, from = 0, to = 1): SweepNode[] {
  const { H, joints: j } = fit;
  const u = H * fit.limbT;
  const S = j[side > 0 ? 'shoulderL' : 'shoulderR'];
  const E = j[side > 0 ? 'elbowL' : 'elbowR'];
  const D = j[side > 0 ? 'handL' : 'handR'];
  const W = lerpV(E, D, 0.82);
  const g = inflate;
  const all: Array<SweepNode & { at: number }> = [
    { at: 0, p: S.clone().add(new THREE.Vector3(-side * H * 0.012, H * 0.02, 0)), rx: 0.022 * u + g, rz: 0.022 * u + g },
    { at: 0.06, p: S.clone().add(new THREE.Vector3(0, -H * 0.012, 0)), rx: 0.03 * u + g, rz: 0.031 * u + g },
    { at: 0.2, p: lerpV(S, E, 0.36), rx: 0.0285 * u + g, rz: 0.031 * u + g },
    { at: 0.38, p: lerpV(S, E, 0.76), rx: 0.023 * u + g, rz: 0.025 * u + g },
    { at: 0.5, p: E.clone(), rx: 0.0195 * u + g, rz: 0.022 * u + g },
    { at: 0.6, p: lerpV(E, W, 0.22), rx: 0.0235 * u + g, rz: 0.021 * u + g },
    { at: 0.8, p: lerpV(E, W, 0.6), rx: 0.019 * u + g, rz: 0.0155 * u + g },
    { at: 0.95, p: W.clone(), rx: 0.0135 * u + g, rz: 0.0105 * u + g },
    { at: 1, p: lerpV(W, D, 0.4), rx: 0.012 * u + g, rz: 0.009 * u + g },
  ];
  return all.filter((n) => n.at >= from - 1e-6 && n.at <= to + 1e-6);
}

/** Leg stations from inside the pelvis to the heel. */
export function legNodes(fit: BodyFit, side: 1 | -1, inflate = 0, from = 0, to = 1): SweepNode[] {
  const { H, joints: j } = fit;
  const u = H * fit.limbT;
  const P = j[side > 0 ? 'hipL' : 'hipR'];
  const K = j[side > 0 ? 'kneeL' : 'kneeR'];
  const F = j[side > 0 ? 'footL' : 'footR'];
  const A = lerpV(K, F, 0.86);
  const g = inflate;
  const all: Array<SweepNode & { at: number }> = [
    { at: 0, p: P.clone().add(new THREE.Vector3(-side * H * 0.006, H * 0.035, -H * 0.004)), rx: 0.03 * u + g, rz: 0.03 * u + g },
    { at: 0.05, p: P.clone(), rx: 0.045 * u + g, rz: 0.047 * u + g },
    { at: 0.2, p: lerpV(P, K, 0.3), rx: 0.042 * u + g, rz: 0.045 * u + g },
    { at: 0.38, p: lerpV(P, K, 0.72), rx: 0.031 * u + g, rz: 0.034 * u + g },
    { at: 0.5, p: K.clone().add(new THREE.Vector3(0, 0, H * 0.004)), rx: 0.027 * u + g, rz: 0.029 * u + g },
    { at: 0.62, p: lerpV(K, A, 0.25).add(new THREE.Vector3(0, 0, -H * 0.01)), rx: 0.029 * u + g, rz: 0.033 * u + g },
    { at: 0.8, p: lerpV(K, A, 0.62), rx: 0.021 * u + g, rz: 0.021 * u + g },
    { at: 0.95, p: A.clone(), rx: 0.0135 * u + g, rz: 0.016 * u + g },
    { at: 1, p: A.clone().add(new THREE.Vector3(0, -H * 0.02, -H * 0.004)), rx: 0.0135 * u + g, rz: 0.016 * u + g },
  ];
  return all.filter((n) => n.at >= from - 1e-6 && n.at <= to + 1e-6);
}

/**
 * A hand: palm, four curled fingers and a thumb across the palm. A mitten with
 * no fingers is the thing that most makes a hand look like a lump of clay.
 * Gloves are the same hand grown by `inflate`.
 */
export function handGeos(fit: BodyFit, side: 1 | -1, inflate = 0): THREE.BufferGeometry[] {
  const { H, joints: j } = fit;
  const t = fit.limbT;
  const D = j[side > 0 ? 'handL' : 'handR'];
  const g = inflate;
  const palmW = H * 0.034 * t;
  const px = D.x;
  const py = D.y + H * 0.012;
  const pz = D.z;
  const out: THREE.BufferGeometry[] = [];
  out.push(
    transformed(
      taperedBox(palmW * 0.78 + g * 2, palmW * 0.5 + g * 2, palmW * 1.04 + g * 2, palmW * 0.56 + g * 2, H * 0.042 * t + g, H * 0.006),
      { pos: [px, py - H * 0.021 * t, pz] },
    ),
  );
  for (let f = 0; f < 4; f++) {
    const off = (f / 3 - 0.5) * palmW * 0.78;
    const len = H * (0.026 - Math.abs(f - 1.4) * 0.0022) * t;
    out.push(
      transformed(limb(len + g, palmW * 0.12 + g, palmW * 0.14 + g, 5), {
        pos: [px + off, py - H * 0.044 * t, pz + palmW * 0.1],
        rot: [-0.55, 0, 0],
      }),
    );
  }
  out.push(
    transformed(limb(H * 0.024 * t, palmW * 0.15 + g, palmW * 0.19 + g, 5), {
      pos: [px + side * palmW * 0.5, py - H * 0.03 * t, pz + palmW * 0.24],
      rot: [-0.7, 0, side * 0.85],
    }),
  );
  return out;
}

/** A foot: heel mass and a forward wedge for the toes. */
export function footGeos(fit: BodyFit, side: 1 | -1, inflate = 0, toeLen = 1): THREE.BufferGeometry[] {
  const { H, joints: j } = fit;
  const t = Math.sqrt(fit.limbT);
  const F = j[side > 0 ? 'footL' : 'footR'];
  const g = inflate;
  return [
    transformed(blob(H * 0.022 * t + g, H * 0.022 + g, H * 0.026 + g, 9), {
      pos: [F.x, F.y + H * 0.019, F.z - H * 0.012],
    }),
    transformed(
      taperedBox(H * 0.05 * t + g * 2, H * 0.038 + g * 2, H * 0.044 * t + g * 2, H * 0.02 + g * 1.6, H * 0.1 * toeLen + g, H * 0.008),
      { pos: [F.x, F.y + H * 0.018 + g * 0.3, F.z + H * 0.03 + (toeLen - 1) * H * 0.05 + g * 0.5], rot: [Math.PI * 0.5, 0, 0] },
    ),
  ];
}

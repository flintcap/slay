/**
 * SLAY — rigged player models.
 *
 * Five classes, five silhouettes. Silhouette is the whole game at ARPG camera
 * distance: you read a character from a 30-degree top-down view at 12 metres,
 * where surface detail is two pixels wide and the outline is everything. So the
 * classes differ first in *shape* — the warden is a wall, the pyromancer is a
 * bell, the shadowblade is a blade, the stormcaller trails a cape, the revenant
 * is a spindle of bone — and only second in colour.
 *
 * The rig is fixed and shared, so `Animation.ts` can drive any class:
 *   root, hips, spine, chest, head,
 *   shoulderL/R, elbowL/R, handL/R,
 *   hipL/R, kneeL/R, footL/R
 *
 * Skinning is computed here from the bind pose: every vertex takes its two
 * nearest bone *segments* (not bone origins — origins put elbow weights on the
 * chest) with an inverse-cube falloff, optionally restricted to a subset so a
 * robe skirt binds to the hips instead of splitting between the knees.
 */

import * as THREE from 'three';
import type { CharClassId, EquipSlot, Rng } from '../types';
import { surface } from './Materials';
import {
  beveledBox,
  clothPanel,
  dome,
  gem,
  limb,
  mergeGeometries,
  normalizeGeometry,
  shell,
  spike,
  taperedBox,
  transformed,
  displace,
} from './Meshes';

// ---------------------------------------------------------------------------
// Rig definition
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
const BONE_PARENT: Record<string, string | null> = {
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

/**
 * Body proportions, in fractions of total height. Changing these is how a
 * class silhouette is really made — armour on top of the wrong proportions
 * still reads as the same character.
 */
interface BodyProfile {
  height: number;
  /** Half-distance between shoulder joints. */
  shoulder: number;
  /** Half-distance between hip joints. */
  hip: number;
  /** Limb radius multiplier. */
  thick: number;
  /** Torso depth multiplier. */
  depth: number;
  head: number;
  /** Forward lean of the whole spine, radians. */
  lean: number;
}

interface JointMap {
  [name: string]: THREE.Vector3;
}

function jointsFor(p: BodyProfile): JointMap {
  const H = p.height;
  const j: JointMap = {};
  j.root = new THREE.Vector3(0, 0, 0);
  j.hips = new THREE.Vector3(0, H * 0.525, 0);
  j.spine = new THREE.Vector3(0, H * 0.615, 0);
  j.chest = new THREE.Vector3(0, H * 0.745, 0);
  j.head = new THREE.Vector3(0, H * 0.885, 0);
  j.shoulderL = new THREE.Vector3(p.shoulder * H, H * 0.8, 0);
  j.shoulderR = new THREE.Vector3(-p.shoulder * H, H * 0.8, 0);
  j.elbowL = new THREE.Vector3(p.shoulder * H * 1.06, H * 0.645, 0);
  j.elbowR = new THREE.Vector3(-p.shoulder * H * 1.06, H * 0.645, 0);
  j.handL = new THREE.Vector3(p.shoulder * H * 1.1, H * 0.5, 0);
  j.handR = new THREE.Vector3(-p.shoulder * H * 1.1, H * 0.5, 0);
  j.hipL = new THREE.Vector3(p.hip * H, H * 0.5, 0);
  j.hipR = new THREE.Vector3(-p.hip * H, H * 0.5, 0);
  j.kneeL = new THREE.Vector3(p.hip * H * 1.02, H * 0.268, 0);
  j.kneeR = new THREE.Vector3(-p.hip * H * 1.02, H * 0.268, 0);
  j.footL = new THREE.Vector3(p.hip * H * 1.02, H * 0.035, 0);
  j.footR = new THREE.Vector3(-p.hip * H * 1.02, H * 0.035, 0);
  return j;
}

/** Builds the bone hierarchy from world-space joint positions. */
function buildBones(joints: JointMap): {
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

// ---------------------------------------------------------------------------
// Skinning
// ---------------------------------------------------------------------------

interface Segment {
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
function buildSegments(joints: JointMap, order: THREE.Bone[]): Segment[] {
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
 */
function skinGeometry(
  geo: THREE.BufferGeometry,
  segs: Segment[],
  restrict?: string[],
  falloff = 3,
): void {
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

/** Merge preserving skin attributes — the shared merge only carries pos/nor/uv. */
function mergeSkinned(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
        si[o4] = gi.getX(i);
        si[o4 + 1] = gi.getY(i);
        sw[o4] = gw.getX(i);
        sw[o4 + 1] = gw.getY(i);
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
// Part assembly helpers
// ---------------------------------------------------------------------------

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

/** Orients a +Y-aligned geometry so it spans from `a` to `b`. */
function spanTo(geo: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry {
  _dir.subVectors(b, a);
  const len = _dir.length() || 1e-5;
  _dir.divideScalar(len);
  _q.setFromUnitVectors(_up, _dir);
  _m.compose(a, _q, new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(_m);
}

/** A limb segment between two joints, with a muscle belly. */
function limbBetween(a: THREE.Vector3, b: THREE.Vector3, rA: number, rB: number, seg = 7): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  return spanTo(limb(len, rB, rA, seg), a, b);
}

interface Part {
  geo: THREE.BufferGeometry;
  /** Material bucket key. */
  mat: string;
  /** Restrict which bones may claim this part. */
  bind?: string[];
}

const ARM_L = ['chest', 'shoulderL', 'elbowL', 'handL'];
const ARM_R = ['chest', 'shoulderR', 'elbowR', 'handR'];
const LEG_L = ['hips', 'hipL', 'kneeL', 'footL'];
const LEG_R = ['hips', 'hipR', 'kneeR', 'footR'];
const TORSO = ['hips', 'spine', 'chest'];
const SKIRT = ['hips', 'spine'];

// ---------------------------------------------------------------------------
// Class definitions
// ---------------------------------------------------------------------------

interface ClassBuild {
  profile: BodyProfile;
  /** Material bucket -> palette key. */
  palettes: Record<string, string>;
  accent: number;
  build(ctx: BuildCtx): void;
}

interface BuildCtx {
  j: JointMap;
  p: BodyProfile;
  rng: Rng;
  parts: Part[];
  /** Non-skinned decorations parented to a bone. */
  props: Array<{ bone: string; obj: THREE.Object3D }>;
  accent: number;
}

/** Shared underlying body: torso block, limbs, hands, feet, neck. */
function baseBody(ctx: BuildCtx, opts: { skin: string; armour: string; boots?: string; gloves?: string }): void {
  const { j, p, parts } = ctx;
  const H = p.height;
  const t = p.thick;
  const armourMat = opts.armour;

  // Pelvis + torso: two chamfered, tapered slabs rather than one box, so the
  // waist actually narrows and the chest reads as a separate mass.
  const pelvisW = p.hip * H * 2.5;
  parts.push({
    geo: transformed(
      taperedBox(pelvisW, H * 0.115 * p.depth, pelvisW * 0.86, H * 0.1 * p.depth, H * 0.1, H * 0.012),
      { pos: [0, H * 0.535, 0] },
    ),
    mat: armourMat,
    bind: ['hips', 'spine'],
  });
  parts.push({
    geo: transformed(
      taperedBox(pelvisW * 0.86, H * 0.1 * p.depth, p.shoulder * H * 1.9, H * 0.125 * p.depth, H * 0.19, H * 0.014),
      { pos: [0, H * 0.685, 0] },
    ),
    mat: armourMat,
    bind: TORSO,
  });

  // Neck
  parts.push({
    geo: limbBetween(
      new THREE.Vector3(0, H * 0.83, 0),
      new THREE.Vector3(0, H * 0.885, 0),
      H * 0.035 * t,
      H * 0.03 * t,
      6,
    ),
    mat: opts.skin,
    bind: ['chest', 'head'],
  });

  // Arms
  for (const [s, sh, el, hd, bindArm] of [
    ['L', 'shoulderL', 'elbowL', 'handL', ARM_L],
    ['R', 'shoulderR', 'elbowR', 'handR', ARM_R],
  ] as Array<[string, string, string, string, string[]]>) {
    void s;
    parts.push({
      geo: limbBetween(j[sh], j[el], H * 0.042 * t, H * 0.034 * t),
      mat: armourMat,
      bind: bindArm,
    });
    parts.push({
      geo: limbBetween(j[el], j[hd], H * 0.033 * t, H * 0.026 * t),
      mat: opts.skin,
      bind: bindArm,
    });
    // Hand. A single box reads as a mitten, so the fist is built as a palm
    // mass with a knuckle ridge and a thumb — the two shapes that make a hand
    // legible at gameplay distance.
    const handMat = opts.gloves ?? opts.skin;
    const hx = j[hd].x;
    const hy = j[hd].y - H * 0.02;
    const hz = j[hd].z;
    const side = hx < 0 ? -1 : 1;
    const hw = H * 0.05 * t;

    // Palm: narrower at the wrist, wider across the knuckles.
    parts.push({
      geo: transformed(taperedBox(hw * 0.78, hw * 0.72, hw * 1.02, hw * 0.86, H * 0.055 * t, H * 0.008), {
        pos: [hx, hy, hz],
      }),
      mat: handMat,
      bind: bindArm,
    });
    // Knuckle ridge across the top of the fist.
    parts.push({
      geo: transformed(beveledBox(hw * 1.04, hw * 0.34, hw * 0.8, hw * 0.14), {
        pos: [hx, hy - H * 0.026 * t, hz + hw * 0.1],
      }),
      mat: handMat,
      bind: bindArm,
    });
    // Thumb, angled across the grip.
    parts.push({
      geo: transformed(limb(H * 0.036 * t, hw * 0.2, hw * 0.16, 6), {
        pos: [hx + side * hw * 0.46, hy - H * 0.008 * t, hz + hw * 0.24],
        rot: [0.5, 0, side * 0.7],
      }),
      mat: handMat,
      bind: bindArm,
    });
  }

  // Legs
  for (const [hp, kn, ft, bindLeg] of [
    ['hipL', 'kneeL', 'footL', LEG_L],
    ['hipR', 'kneeR', 'footR', LEG_R],
  ] as Array<[string, string, string, string[]]>) {
    parts.push({
      geo: limbBetween(j[hp], j[kn], H * 0.055 * t, H * 0.042 * t),
      mat: armourMat,
      bind: bindLeg,
    });
    parts.push({
      geo: limbBetween(j[kn], j[ft], H * 0.04 * t, H * 0.03 * t),
      mat: armourMat,
      bind: bindLeg,
    });
    // Boot: forward-projecting so the foot silhouette reads from above.
    parts.push({
      geo: transformed(beveledBox(H * 0.062 * t, H * 0.045, H * 0.13, H * 0.012), {
        pos: [j[ft].x, j[ft].y + H * 0.012, j[ft].z + H * 0.026],
      }),
      mat: opts.boots ?? armourMat,
      bind: bindLeg,
    });
  }
}

/**
 * A head with actual structure.
 *
 * A dome plus a jaw box reads as a potato at any distance — and the head is
 * where the eye goes first, so it is the worst place to be vague. This builds
 * the landmarks that make a head read as a head even at 40 pixels: a brow that
 * casts a shadow over recessed sockets, a nose bridge catching the key light,
 * cheekbones, a tapered chin, and a neck joining it to the chest.
 */
function baseHead(ctx: BuildCtx, mat: string, scale = 1): void {
  const { j, p, parts } = ctx;
  const H = p.height;
  const r = H * 0.055 * p.head * scale;
  const c = j.head;

  // Cranium: taller than wide, flattened at the back.
  const skull = dome(r, 1.2, 18, 9);
  skull.scale(0.94, 1.06, 1.02);
  skull.translate(c.x, c.y + r * 0.08, c.z - r * 0.04);
  parts.push({ geo: skull, mat, bind: ['head', 'chest'] });

  // Brow ridge. The single most valuable feature: it throws the sockets into
  // shadow, which is what reads as "a face" from across a room.
  const brow = transformed(beveledBox(r * 1.32, r * 0.3, r * 0.5, r * 0.1), {
    pos: [c.x, c.y + r * 0.28, c.z + r * 0.72],
    rot: [-0.16, 0, 0],
  });
  parts.push({ geo: brow, mat, bind: ['head'] });

  // Recessed eye sockets, cut as small dark boxes set back under the brow.
  for (const side of [-1, 1]) {
    const socket = transformed(beveledBox(r * 0.42, r * 0.26, r * 0.2, r * 0.05), {
      pos: [c.x + side * r * 0.36, c.y + r * 0.1, c.z + r * 0.62],
    });
    parts.push({ geo: socket, mat: 'shadow', bind: ['head'] });
  }

  // Nose bridge: a narrow wedge that catches the key light and gives the face
  // a centre line.
  const nose = transformed(taperedBox(r * 0.3, r * 0.34, r * 0.16, r * 0.2, r * 0.5, r * 0.04), {
    pos: [c.x, c.y - r * 0.05, c.z + r * 0.78],
    rot: [0.22, 0, 0],
  });
  parts.push({ geo: nose, mat, bind: ['head'] });

  // Cheekbones, angled outward.
  for (const side of [-1, 1]) {
    const cheek = transformed(beveledBox(r * 0.42, r * 0.3, r * 0.42, r * 0.12), {
      pos: [c.x + side * r * 0.52, c.y - r * 0.16, c.z + r * 0.5],
      rot: [0, side * 0.3, side * 0.14],
    });
    parts.push({ geo: cheek, mat, bind: ['head'] });
  }

  // Jaw, narrowing to a chin rather than a slab.
  const jaw = transformed(taperedBox(r * 1.18, r * 1.24, r * 0.72, r * 0.9, r * 0.72, r * 0.1), {
    pos: [c.x, c.y - r * 0.46, c.z + r * 0.16],
  });
  parts.push({ geo: jaw, mat, bind: ['head'] });

  // Neck — without it the head floats.
  const neck = transformed(limb(r * 0.7, r * 0.44, r * 0.5, 10), {
    pos: [c.x, c.y - r * 0.95, c.z - r * 0.06],
  });
  parts.push({ geo: neck, mat, bind: ['head', 'chest'] });
}

function pauldron(size: number, curve: number, rng: Rng): THREE.BufferGeometry {
  const g = shell(size, size * 0.92, curve, 7, 7, size * 0.09, (u, v) =>
    // Fan wider at the top, tuck under at the bottom: a real spaulding shape.
    0.55 + 0.45 * Math.sin(Math.PI * (0.25 + v * 0.6)) * (0.8 + 0.2 * Math.cos((u - 0.5) * Math.PI)),
  );
  displace(g, rng, size * 0.012, 5 / size);
  return g;
}

const CLASSES: Record<CharClassId, ClassBuild> = {
  // ---------------------------------------------------------------- WARDEN --
  warden: {
    profile: { height: 1.86, shoulder: 0.135, hip: 0.062, thick: 1.28, depth: 1.25, head: 1.0, lean: 0.03 },
    palettes: {
      skin: 'flesh.pale',
      shadow: 'metal.dark',
      armour: 'metal.steel',
      trim: 'metal.gold',
      cloth: 'cloth.banner',
      leather: 'leather.worn',
    },
    accent: 0xd8b45a,
    build(ctx) {
      const { j, p, rng, parts, props } = ctx;
      const H = p.height;
      baseBody(ctx, { skin: 'skin', armour: 'armour', boots: 'armour', gloves: 'armour' });

      // Breastplate: a second, larger shell over the torso. The overlap is what
      // makes plate armour read as plate and not as a painted body.
      const bp = shell(p.shoulder * H * 2.05, H * 0.26, H * 0.075, 9, 9, H * 0.02, (u, v) =>
        0.7 + 0.3 * Math.sin(Math.PI * (0.2 + v * 0.7)) * (1 - 0.25 * Math.abs(u - 0.5)),
      );
      bp.translate(0, H * 0.7, H * 0.028 * p.depth);
      parts.push({ geo: bp, mat: 'armour', bind: TORSO });

      // Gorget
      const gorget = shell(p.shoulder * H * 1.2, H * 0.05, H * 0.05, 8, 4, H * 0.016);
      gorget.translate(0, H * 0.815, H * 0.02);
      parts.push({ geo: gorget, mat: 'trim', bind: ['chest'] });

      // Faulds — overlapping skirt plates that swing with the hips.
      for (let i = 0; i < 3; i++) {
        const w = p.hip * H * (2.6 - i * 0.18);
        const plate = shell(w, H * 0.055, H * 0.03, 6, 3, H * 0.014);
        plate.translate(0, H * 0.5 - i * H * 0.042, H * 0.012);
        parts.push({ geo: plate, mat: 'armour', bind: SKIRT });
        const back = plate.clone();
        back.rotateY(Math.PI);
        parts.push({ geo: back, mat: 'armour', bind: SKIRT });
      }

      // Tabard
      const tab = clothPanel(p.hip * H * 1.7, H * 0.34, rng, { segsX: 5, segsY: 8, ripple: 0.03, flare: 0.15 });
      tab.translate(0, H * 0.71, H * 0.075 * p.depth);
      parts.push({ geo: tab, mat: 'cloth', bind: SKIRT });

      // Great helm with a raised brow and a vision slit.
      const helm = dome(H * 0.062, 1.3, 14, 7);
      helm.translate(j.head.x, j.head.y - H * 0.012, j.head.z);
      parts.push({ geo: helm, mat: 'armour', bind: ['head'] });
      const brow = transformed(beveledBox(H * 0.115, H * 0.02, H * 0.115, H * 0.006), {
        pos: [0, j.head.y + H * 0.026, 0],
      });
      parts.push({ geo: brow, mat: 'trim', bind: ['head'] });
      const cheek = transformed(beveledBox(H * 0.095, H * 0.06, H * 0.1, H * 0.012), {
        pos: [0, j.head.y - H * 0.032, H * 0.006],
      });
      parts.push({ geo: cheek, mat: 'armour', bind: ['head'] });

      // Pauldrons: bolted to the shoulder bones, not skinned — they should
      // stay rigid as the arm swings, which is exactly what plate does.
      for (const [side, s] of [
        ['shoulderL', 1],
        ['shoulderR', -1],
      ] as Array<[string, number]>) {
        const g = pauldron(H * 0.17, H * 0.06, rng);
        const mesh = new THREE.Mesh(g, surface('metal.steel', { repeat: 3, seed: 5 }));
        mesh.rotation.set(-0.25, 0, s * 0.5);
        mesh.position.set(s * H * 0.018, H * 0.022, 0);
        mesh.castShadow = true;
        props.push({ bone: side, obj: mesh });
        // A spike ridge on the crown of each pauldron.
        const sp = new THREE.Mesh(spike(H * 0.075, H * 0.016, 5, 0.35), surface('metal.gold', { repeat: 4 }));
        sp.position.set(s * H * 0.06, H * 0.04, -H * 0.01);
        sp.rotation.z = s * 0.9;
        props.push({ bone: side, obj: sp });
      }
    },
  },

  // ----------------------------------------------------------- PYROMANCER --
  pyromancer: {
    profile: { height: 1.76, shoulder: 0.098, hip: 0.05, thick: 0.94, depth: 0.92, head: 1.0, lean: 0.06 },
    palettes: {
      skin: 'flesh.pale',
      shadow: 'metal.dark',
      armour: 'cloth.silk',
      cloth: 'cloth.linen',
      trim: 'metal.gold',
      leather: 'leather.fine',
    },
    accent: 0xff7a2a,
    build(ctx) {
      const { j, p, rng, parts, props } = ctx;
      const H = p.height;
      baseBody(ctx, { skin: 'skin', armour: 'armour', boots: 'leather', gloves: 'skin' });
      baseHead(ctx, 'skin', 0.95);

      // The robe: a bell that swallows the legs. This is the whole silhouette —
      // no legs visible from the play camera, just a widening cone.
      const rows = 10;
      const cols = 16;
      const pts: THREE.Vector3[][] = [];
      for (let i = 0; i <= rows; i++) {
        const t = i / rows;
        const y = H * 0.7 - t * H * 0.68;
        const r = H * (0.075 + Math.pow(t, 1.35) * 0.185);
        const ring: THREE.Vector3[] = [];
        for (let k = 0; k < cols; k++) {
          const a = (k / cols) * Math.PI * 2;
          // Vertical folds, deepening toward the hem.
          const fold = 1 + Math.cos(a * 7) * 0.055 * t + Math.cos(a * 3 + t * 2) * 0.03;
          ring.push(new THREE.Vector3(Math.cos(a) * r * fold, y, Math.sin(a) * r * fold));
        }
        pts.push(ring);
      }
      const robeGeos: THREE.BufferGeometry[] = [];
      for (let i = 0; i < rows; i++) {
        for (let k = 0; k < cols; k++) {
          const k2 = (k + 1) % cols;
          const quad = new THREE.BufferGeometry();
          const a = pts[i][k];
          const b = pts[i][k2];
          const c = pts[i + 1][k2];
          const d = pts[i + 1][k];
          quad.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(
              [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z],
              3,
            ),
          );
          quad.setIndex([0, 1, 2, 0, 2, 3]);
          quad.setAttribute(
            'uv',
            new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
          );
          quad.computeVertexNormals();
          robeGeos.push(quad);
        }
      }
      const robe = mergeGeometries(robeGeos);
      for (const g of robeGeos) g.dispose();
      parts.push({ geo: robe, mat: 'armour', bind: SKIRT });

      // Wide sleeves hanging from the elbows.
      for (const [el, hd, bindArm] of [
        ['elbowL', 'handL', ARM_L],
        ['elbowR', 'handR', ARM_R],
      ] as Array<[string, string, string[]]>) {
        const len = j[el].distanceTo(j[hd]) * 1.15;
        const sleeve = limb(len, H * 0.055, H * 0.03, 9);
        spanTo(sleeve, j[el], j[hd].clone().sub(j[el]).multiplyScalar(1.15).add(j[el]));
        parts.push({ geo: sleeve, mat: 'armour', bind: bindArm });
      }

      // Hood: a cowl that reads as a pointed hood in outline, plus a shadowed
      // opening so the face is suggested rather than modelled.
      const hood = dome(H * 0.078, 1.5, 14, 8);
      hood.translate(j.head.x, j.head.y - H * 0.03, j.head.z - H * 0.012);
      parts.push({ geo: hood, mat: 'cloth', bind: ['head'] });
      const cowl = shell(H * 0.2, H * 0.16, H * 0.05, 8, 6, H * 0.014);
      cowl.rotateX(-0.35);
      cowl.translate(0, j.head.y - H * 0.045, -H * 0.01);
      parts.push({ geo: cowl, mat: 'cloth', bind: ['head', 'chest'] });

      // Shoulder mantle
      const mantle = shell(p.shoulder * H * 2.6, H * 0.13, H * 0.06, 10, 5, H * 0.014);
      mantle.rotateX(0.5);
      mantle.translate(0, H * 0.79, 0);
      parts.push({ geo: mantle, mat: 'cloth', bind: ['chest'] });

      // A floating ember mote at the sternum — instantly says "caster".
      const core = new THREE.Mesh(gem(H * 0.022, 8, 0.5), surface('crystal.arcane', { emissive: ctx.accent, emissiveIntensity: 2.2 }));
      core.position.set(0, H * 0.05, H * 0.07);
      props.push({ bone: 'chest', obj: core });
      void rng;
    },
  },

  // ---------------------------------------------------------- SHADOWBLADE --
  shadowblade: {
    profile: { height: 1.78, shoulder: 0.105, hip: 0.052, thick: 0.88, depth: 0.86, head: 0.96, lean: 0.11 },
    palettes: {
      skin: 'flesh.pale',
      shadow: 'metal.dark',
      armour: 'leather.fine',
      cloth: 'cloth.tattered',
      trim: 'metal.dark',
      leather: 'leather.studded',
    },
    accent: 0x4ad69a,
    build(ctx) {
      const { j, p, rng, parts, props } = ctx;
      const H = p.height;
      baseBody(ctx, { skin: 'skin', armour: 'armour', boots: 'leather', gloves: 'leather' });
      baseHead(ctx, 'skin', 0.94);

      // Harness straps across the chest: thin, crossing, catching a highlight.
      for (const s of [-1, 1]) {
        const strap = taperedBox(H * 0.032, H * 0.012, H * 0.026, H * 0.012, H * 0.3, H * 0.004);
        strap.rotateZ(s * 0.42);
        strap.rotateX(-0.12);
        strap.translate(0, H * 0.7, H * 0.05 * p.depth);
        parts.push({ geo: strap, mat: 'leather', bind: TORSO });
      }
      const belt = transformed(beveledBox(p.hip * H * 2.6, H * 0.035, H * 0.16, H * 0.008), {
        pos: [0, H * 0.555, 0],
      });
      parts.push({ geo: belt, mat: 'leather', bind: ['hips'] });

      // Hood, pulled low and forward — the classic assassin read.
      const hood = dome(H * 0.07, 1.42, 14, 8);
      hood.scale(1, 1, 1.18);
      hood.translate(j.head.x, j.head.y - H * 0.026, j.head.z - H * 0.016);
      parts.push({ geo: hood, mat: 'cloth', bind: ['head'] });
      const peak = spike(H * 0.1, H * 0.03, 5, -0.55);
      peak.rotateX(1.35);
      peak.translate(0, j.head.y + H * 0.03, -H * 0.03);
      parts.push({ geo: peak, mat: 'cloth', bind: ['head'] });

      // Short shoulder cape, torn at the hem.
      const cape = clothPanel(H * 0.3, H * 0.34, rng, {
        segsX: 7,
        segsY: 8,
        ripple: 0.07,
        flare: 0.4,
        tatter: 0.4,
      });
      const capeMesh = new THREE.Mesh(cape, surface('cloth.tattered', { repeat: 2, seed: 9 }));
      capeMesh.position.set(0, H * 0.055, -H * 0.05);
      capeMesh.rotation.x = -0.18;
      capeMesh.castShadow = true;
      props.push({ bone: 'chest', obj: capeMesh });

      // Empty scabbards on the hip — gear the player has not equipped still
      // needs somewhere to have come from.
      for (const s of [-1, 1]) {
        const sc = new THREE.Mesh(
          taperedBox(H * 0.03, H * 0.014, H * 0.018, H * 0.01, H * 0.4, H * 0.005),
          surface('leather.worn', { repeat: 3, seed: 4 }),
        );
        sc.position.set(s * p.hip * H * 1.5, -H * 0.14, -H * 0.03);
        sc.rotation.set(0.35, 0, s * 0.28);
        props.push({ bone: 'hips', obj: sc });
      }
      void rng;
    },
  },

  // ----------------------------------------------------------- STORMCALLER --
  stormcaller: {
    profile: { height: 1.8, shoulder: 0.115, hip: 0.055, thick: 1.0, depth: 1.0, head: 1.0, lean: 0.05 },
    palettes: {
      skin: 'flesh.pale',
      shadow: 'metal.dark',
      armour: 'metal.silver',
      cloth: 'cloth.silk',
      trim: 'metal.gold',
      leather: 'leather.studded',
    },
    accent: 0x6fc8ff,
    build(ctx) {
      const { j, p, rng, parts, props } = ctx;
      const H = p.height;
      baseBody(ctx, { skin: 'skin', armour: 'armour', boots: 'leather', gloves: 'leather' });
      baseHead(ctx, 'skin', 0.98);

      // Light cuirass with a raised sternum ridge.
      const cui = shell(p.shoulder * H * 1.75, H * 0.2, H * 0.06, 8, 8, H * 0.016, (u, v) =>
        0.75 + 0.25 * Math.sin(Math.PI * (0.25 + v * 0.65)) * (1 - 0.2 * Math.abs(u - 0.5)),
      );
      cui.translate(0, H * 0.715, H * 0.026 * p.depth);
      parts.push({ geo: cui, mat: 'armour', bind: TORSO });
      const ridge = taperedBox(H * 0.03, H * 0.03, H * 0.012, H * 0.02, H * 0.2, H * 0.005);
      ridge.translate(0, H * 0.715, H * 0.07 * p.depth);
      parts.push({ geo: ridge, mat: 'trim', bind: TORSO });

      // A long cape: the single most legible silhouette cue at distance.
      const cape = clothPanel(H * 0.36, H * 0.86, rng, {
        segsX: 9,
        segsY: 14,
        ripple: 0.055,
        flare: 0.55,
      });
      const capeMesh = new THREE.Mesh(cape, surface('cloth.silk', { repeat: 1.5, seed: 12 }));
      capeMesh.position.set(0, H * 0.06, -H * 0.055);
      capeMesh.rotation.x = -0.12;
      capeMesh.castShadow = true;
      capeMesh.name = 'cape';
      props.push({ bone: 'chest', obj: capeMesh });

      // Winged circlet.
      const circlet = new THREE.Mesh(
        new THREE.TorusGeometry(H * 0.058, H * 0.007, 6, 18),
        surface('metal.gold', { repeat: 6 }),
      );
      circlet.rotation.x = Math.PI * 0.5;
      circlet.position.set(0, H * 0.012, 0);
      props.push({ bone: 'head', obj: circlet });
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(
          shell(H * 0.09, H * 0.05, H * 0.014, 5, 3, H * 0.006, (u) => 1 - u * 0.7),
          surface('metal.silver', { repeat: 5 }),
        );
        wing.position.set(s * H * 0.055, H * 0.035, -H * 0.01);
        wing.rotation.set(0.2, s * 1.2, s * 0.55);
        props.push({ bone: 'head', obj: wing });
      }

      // Asymmetric pauldron — asymmetry alone separates a silhouette.
      const pl = pauldron(H * 0.14, H * 0.05, rng);
      const plMesh = new THREE.Mesh(pl, surface('metal.silver', { repeat: 3, seed: 6 }));
      plMesh.rotation.set(-0.2, 0, 0.45);
      plMesh.position.set(H * 0.014, H * 0.018, 0);
      plMesh.castShadow = true;
      props.push({ bone: 'shoulderL', obj: plMesh });

      // Arcing conductor rods on the back.
      for (const s of [-1, 1]) {
        const rod = new THREE.Mesh(
          spike(H * 0.22, H * 0.011, 5, 0.5),
          surface('metal.silver', { repeat: 6, emissive: ctx.accent, emissiveIntensity: 0.5 }),
        );
        rod.position.set(s * H * 0.05, H * 0.03, -H * 0.055);
        rod.rotation.set(-0.5, 0, s * 0.35);
        props.push({ bone: 'chest', obj: rod });
      }
    },
  },

  // -------------------------------------------------------------- REVENANT --
  revenant: {
    profile: { height: 1.84, shoulder: 0.12, hip: 0.05, thick: 0.72, depth: 0.78, head: 1.02, lean: 0.14 },
    palettes: {
      skin: 'bone.pale',
      shadow: 'metal.dark',
      armour: 'bone.old',
      cloth: 'cloth.tattered',
      trim: 'metal.dark',
      leather: 'leather.worn',
    },
    accent: 0x7ce0a0,
    build(ctx) {
      const { j, p, rng, parts, props } = ctx;
      const H = p.height;
      baseBody(ctx, { skin: 'skin', armour: 'armour', boots: 'leather', gloves: 'skin' });

      // Ribcage: individual ribs, not a torso block. Gaps in a silhouette read
      // as "undead" faster than any texture can.
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const y = H * 0.665 + t * H * 0.115;
        const w = p.shoulder * H * (1.55 - t * 0.22);
        const rib = new THREE.TorusGeometry(w * 0.5, H * 0.008, 5, 14, Math.PI * 1.15);
        rib.rotateY(Math.PI * 0.5);
        rib.rotateZ(Math.PI * 0.5);
        rib.scale(1, 0.62, 1);
        rib.translate(0, y, 0);
        normalizeGeometry(rib);
        parts.push({ geo: rib, mat: 'skin', bind: TORSO });
      }
      // Spine column
      for (let i = 0; i < 6; i++) {
        const y = H * 0.56 + (i / 5) * H * 0.25;
        parts.push({
          geo: transformed(beveledBox(H * 0.026, H * 0.026, H * 0.03, H * 0.006), {
            pos: [0, y, -H * 0.032],
          }),
          mat: 'skin',
          bind: TORSO,
        });
      }
      // Sternum plate so the chest is not fully hollow from the front.
      const stern = shell(p.shoulder * H * 0.8, H * 0.15, H * 0.02, 4, 5, H * 0.01);
      stern.translate(0, H * 0.715, H * 0.035);
      parts.push({ geo: stern, mat: 'skin', bind: TORSO });

      // Skull with sunken sockets.
      baseHead(ctx, 'skin', 1.0);
      for (const s of [-1, 1]) {
        const socket = new THREE.Mesh(
          dome(H * 0.017, 0.6, 8, 4),
          surface('crystal.arcane', { emissive: ctx.accent, emissiveIntensity: 2.6, tint: ctx.accent }),
        );
        socket.rotation.x = Math.PI * 0.5;
        socket.position.set(s * H * 0.021, H * 0.004, H * 0.048);
        props.push({ bone: 'head', obj: socket });
      }

      // Tattered shroud hanging from the shoulders.
      const shroud = clothPanel(H * 0.34, H * 0.78, rng, {
        segsX: 8,
        segsY: 13,
        ripple: 0.08,
        flare: 0.35,
        tatter: 0.55,
      });
      const shroudMesh = new THREE.Mesh(shroud, surface('cloth.tattered', { repeat: 2, seed: 3 }));
      shroudMesh.position.set(0, H * 0.06, -H * 0.04);
      shroudMesh.castShadow = true;
      props.push({ bone: 'chest', obj: shroudMesh });

      const frontRag = clothPanel(H * 0.2, H * 0.44, rng, {
        segsX: 5,
        segsY: 8,
        ripple: 0.06,
        flare: 0.3,
        tatter: 0.6,
      });
      frontRag.translate(0, H * 0.7, H * 0.055 * p.depth);
      parts.push({ geo: frontRag, mat: 'cloth', bind: SKIRT });

      // Bone shards orbiting the shoulders — floating geometry reads as magic
      // and costs nothing to animate.
      for (const [bone, s] of [
        ['shoulderL', 1],
        ['shoulderR', -1],
      ] as Array<[string, number]>) {
        for (let i = 0; i < 3; i++) {
          const sh = new THREE.Mesh(
            spike(H * (0.05 + i * 0.014), H * 0.011, 4, 0.2),
            surface('bone.pale', { repeat: 5, seed: 2 }),
          );
          const a = (i / 3) * Math.PI * 2 + (s > 0 ? 0 : 0.7);
          sh.position.set(Math.cos(a) * H * 0.05, H * 0.03 + i * H * 0.012, Math.sin(a) * H * 0.05);
          sh.rotation.set(rng.range(-0.6, 0.6), a, rng.range(-0.6, 0.6));
          sh.name = 'shard';
          props.push({ bone, obj: sh });
        }
      }
    },
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PlayerModel {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  bones: Record<string, THREE.Bone>;
}

/**
 * Builds a rigged player model. Bone names are fixed so the animation layer can
 * drive any class: 'root','hips','spine','chest','head','shoulderL/R',
 * 'elbowL/R','handL/R','hipL/R','kneeL/R','footL/R'.
 */
export function buildPlayerModel(classId: CharClassId, rng: Rng): PlayerModel {
  const def = CLASSES[classId] ?? CLASSES.warden;
  const p = def.profile;
  const joints = jointsFor(p);
  const { bones, order, rootBone } = buildBones(joints);
  const segs = buildSegments(joints, order);

  const ctx: BuildCtx = { j: joints, p, rng, parts: [], props: [], accent: def.accent };
  def.build(ctx);

  const root = new THREE.Group();
  root.name = `player:${classId}`;
  root.add(rootBone);

  const skeleton = new THREE.Skeleton(order);

  // Bucket parts by material so the whole character is 3-5 draw calls.
  const buckets = new Map<string, THREE.BufferGeometry[]>();
  for (const part of ctx.parts) {
    normalizeGeometry(part.geo);
    skinGeometry(part.geo, segs, part.bind);
    let list = buckets.get(part.mat);
    if (!list) {
      list = [];
      buckets.set(part.mat, list);
    }
    list.push(part.geo);
  }

  let seedTick = 1;
  for (const [matKey, list] of buckets) {
    const geo = mergeSkinned(list);
    for (const g of list) g.dispose();
    const paletteKey = def.palettes[matKey] ?? 'metal.iron';
    const mat = surface(paletteKey, { repeat: 2.5, seed: seedTick++ });
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = `${classId}:${matKey}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Skinned bounds are computed from the bind pose and go stale the moment a
    // limb swings; culling on them pops characters out at the screen edge.
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
  }

  // Rigid decorations ride their bone directly.
  for (const { bone, obj } of ctx.props) {
    obj.castShadow = true;
    bones[bone]?.add(obj);
  }

  root.userData.classId = classId;
  root.userData.accent = def.accent;
  root.userData.height = p.height;

  return { root, skeleton, bones };
}

/** The class accent colour, for rim lights and UI tinting. */
export function classAccent(classId: CharClassId): number {
  return (CLASSES[classId] ?? CLASSES.warden).accent;
}

// ---------------------------------------------------------------------------
// Equipment sockets
// ---------------------------------------------------------------------------

interface Socket {
  bone: string;
  pos: [number, number, number];
  rot: [number, number, number];
  scale?: number;
  /** A second bone that gets a mirrored clone (gloves, boots). */
  mirror?: string;
}

/**
 * Socket transforms are expressed in bone space. Item models are authored with
 * the grip at the origin and the business end along +Y, so a weapon socket is
 * mostly a rotation that turns +Y down the line of the fist.
 */
const SOCKETS: Record<string, Socket> = {
  mainHand: { bone: 'handR', pos: [0, -0.04, 0.02], rot: [Math.PI * 0.92, 0, 0] },
  offHand: { bone: 'handL', pos: [0, -0.04, 0.02], rot: [Math.PI * 0.92, 0, 0] },
  helm: { bone: 'head', pos: [0, 0.012, 0], rot: [0, 0, 0] },
  chest: { bone: 'chest', pos: [0, 0.02, 0.01], rot: [0, 0, 0] },
  gloves: { bone: 'handR', pos: [0, -0.02, 0], rot: [0, 0, 0], mirror: 'handL' },
  boots: { bone: 'footR', pos: [0, 0.01, 0.02], rot: [0, 0, 0], mirror: 'footL' },
  belt: { bone: 'hips', pos: [0, 0.03, 0], rot: [0, 0, 0] },
  amulet: { bone: 'chest', pos: [0, 0.02, 0.08], rot: [0, 0, 0] },
  ring1: { bone: 'handR', pos: [0.015, -0.05, 0.01], rot: [Math.PI * 0.5, 0, 0] },
  ring2: { bone: 'handL', pos: [-0.015, -0.05, 0.01], rot: [Math.PI * 0.5, 0, 0] },
};

/** Removes anything previously socketed into `slot`, across every bone. */
function clearSocket(bones: Record<string, THREE.Bone>, slot: EquipSlot): void {
  for (const name of Object.keys(bones)) {
    const bone = bones[name];
    for (let i = bone.children.length - 1; i >= 0; i--) {
      const child = bone.children[i];
      if (child.userData && child.userData.socketSlot === slot) child.removeFromParent();
    }
  }
}

/**
 * Attaches an equipped item's model to the correct hand/body socket. Any
 * previous occupant of that slot — including the mirrored copy paired slots
 * create — is removed first, so repeated calls never stack geometry.
 */
export function attachToSocket(
  model: THREE.Object3D,
  bones: Record<string, THREE.Bone>,
  slot: EquipSlot,
  mesh: THREE.Object3D,
): void {
  void model;
  const socket = SOCKETS[slot];
  if (!socket) return;
  const bone = bones[socket.bone];
  if (!bone) return;

  clearSocket(bones, slot);

  mesh.userData.socketSlot = slot;
  mesh.position.set(...socket.pos);
  mesh.rotation.set(...socket.rot);
  if (socket.scale) mesh.scale.setScalar(socket.scale);
  mesh.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  bone.add(mesh);

  // Paired slots put a mirrored copy on the opposite limb.
  if (socket.mirror && bones[socket.mirror]) {
    const twin = mesh.clone(true);
    twin.userData.socketSlot = slot;
    twin.userData.socketMirror = true;
    twin.position.set(-socket.pos[0], socket.pos[1], socket.pos[2]);
    twin.rotation.set(socket.rot[0], -socket.rot[1], -socket.rot[2]);
    twin.scale.set(-mesh.scale.x, mesh.scale.y, mesh.scale.z);
    bones[socket.mirror].add(twin);
  }
}

/** Where a socket lives, for FX that need a muzzle/hand position. */
export function socketBone(slot: EquipSlot): string | null {
  return SOCKETS[slot]?.bone ?? null;
}

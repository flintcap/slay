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
  ring,
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

/**
 * Builds a closed surface from a stack of elliptical rings.
 *
 * A human torso is not a box and it is not a cylinder: it is wide and deep at
 * the ribcage, pinched at the waist, and wide again at the pelvis, and the
 * cross-section is an ellipse rather than a circle. Two tapered boxes cannot
 * express that, which is why the old bodies read as slabs with tubes stuck on.
 */
function ringStack(
  rings: Array<{ y: number; w: number; d: number; z?: number }>,
  cols = 16,
): THREE.BufferGeometry {
  const rows = rings.length;
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];

  for (let r = 0; r < rows; r++) {
    const ring = rings[r];
    for (let c = 0; c <= cols; c++) {
      const t = c / cols;
      const ang = t * Math.PI * 2;
      verts.push(Math.cos(ang) * ring.w, ring.y, Math.sin(ang) * ring.d + (ring.z ?? 0));
      uvs.push(t, r / (rows - 1));
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const a0 = r * (cols + 1) + c;
      const b0 = a0 + 1;
      const c0 = a0 + cols + 1;
      const d0 = c0 + 1;
      idx.push(a0, c0, d0, a0, d0, b0);
    }
  }
  // Caps, so the shape is solid from any angle.
  const capTop = verts.length / 3;
  const top = rings[rows - 1];
  verts.push(0, top.y, top.z ?? 0);
  uvs.push(0.5, 1);
  for (let c = 0; c < cols; c++) {
    idx.push(capTop, (rows - 1) * (cols + 1) + c + 1, (rows - 1) * (cols + 1) + c);
  }
  const capBot = verts.length / 3;
  const bot = rings[0];
  verts.push(0, bot.y, bot.z ?? 0);
  uvs.push(0.5, 0);
  for (let c = 0; c < cols; c++) idx.push(capBot, c, c + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** An ellipsoid — skulls, deltoids, knees, calves. Cheap and always readable. */
function blob(w: number, h: number, d: number, seg = 12): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4));
  g.scale(w, h, d);
  return g;
}

interface Part {
  geo: THREE.BufferGeometry;
  /** Material bucket key. */
  mat: string;
  /** Restrict which bones may claim this part. */
  bind?: string[];
  /**
   * The equipment slot whose item replaces this piece. A part tagged `chest`
   * is the class's own default chest covering; the moment real chest armour is
   * equipped the item model takes over and this is hidden. Untagged parts are
   * the character themself — body, undergarments, hair, capes — and are always
   * visible.
   */
  cover?: EquipSlot;
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
  props: Array<{ bone: string; obj: THREE.Object3D; cover?: EquipSlot }>;
  accent: number;
}

/**
 * Shared underlying body: torso, limbs, hands, feet, neck.
 *
 * This is the person, not the outfit. Everything here is skin (or bone, for the
 * revenant) so that a character with an empty equipment sheet reads as someone
 * standing in their underclothes rather than as a suit of armour with no one
 * inside it. Armour arrives from the equipment sockets and from the class's own
 * cover pieces, which step aside when real gear replaces them.
 */
function baseBody(ctx: BuildCtx, opts: { skin: string; armour: string; boots?: string; gloves?: string }): void {
  const { j, p, parts } = ctx;
  const H = p.height;
  const t = p.thick;
  void opts.armour;
  const bodyMat = opts.skin;

  // Pelvis + torso: two chamfered, tapered slabs rather than one box, so the
  // waist actually narrows and the chest reads as a separate mass.
  const pelvisW = p.hip * H * 2.5;
  parts.push({
    geo: transformed(
      taperedBox(pelvisW, H * 0.115 * p.depth, pelvisW * 0.86, H * 0.1 * p.depth, H * 0.1, H * 0.012),
      { pos: [0, H * 0.535, 0] },
    ),
    mat: bodyMat,
    bind: ['hips', 'spine'],
  });
  parts.push({
    geo: transformed(
      taperedBox(pelvisW * 0.86, H * 0.1 * p.depth, p.shoulder * H * 1.9, H * 0.125 * p.depth, H * 0.19, H * 0.014),
      { pos: [0, H * 0.685, 0] },
    ),
    mat: bodyMat,
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
      mat: bodyMat,
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
    // Bare hands by default; the class's own gloves are a cover piece.
    const gloved = opts.gloves && opts.gloves !== opts.skin;
    const handMat = gloved ? opts.gloves! : opts.skin;
    const handCover: EquipSlot | undefined = gloved ? 'gloves' : undefined;
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
      cover: handCover,
      bind: bindArm,
    });
    // Knuckle ridge across the top of the fist.
    parts.push({
      geo: transformed(beveledBox(hw * 1.04, hw * 0.34, hw * 0.8, hw * 0.14), {
        pos: [hx, hy - H * 0.026 * t, hz + hw * 0.1],
      }),
      mat: handMat,
      cover: handCover,
      bind: bindArm,
    });
    // Thumb, angled across the grip.
    parts.push({
      geo: transformed(limb(H * 0.036 * t, hw * 0.2, hw * 0.16, 6), {
        pos: [hx + side * hw * 0.46, hy - H * 0.008 * t, hz + hw * 0.24],
        rot: [0.5, 0, side * 0.7],
      }),
      mat: handMat,
      cover: handCover,
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
      mat: bodyMat,
      bind: bindLeg,
    });
    parts.push({
      geo: limbBetween(j[kn], j[ft], H * 0.04 * t, H * 0.03 * t),
      mat: bodyMat,
      bind: bindLeg,
    });
    // Bare foot: forward-projecting so the silhouette reads from above.
    parts.push({
      geo: transformed(beveledBox(H * 0.056 * t, H * 0.038, H * 0.12, H * 0.012), {
        pos: [j[ft].x, j[ft].y + H * 0.01, j[ft].z + H * 0.024],
      }),
      mat: opts.skin,
      bind: bindLeg,
    });
    // The class's own boot, slightly larger so it wraps the foot instead of
    // fighting it for the same surface. Hidden once real boots are equipped.
    if (opts.boots && opts.boots !== opts.skin) {
      parts.push({
        geo: transformed(beveledBox(H * 0.066 * t, H * 0.05, H * 0.135, H * 0.012), {
          pos: [j[ft].x, j[ft].y + H * 0.014, j[ft].z + H * 0.028],
        }),
        mat: opts.boots,
        cover: 'boots',
        bind: bindLeg,
      });
    }
  }
}

/**
 * Linen undershirt and braies — what every character has on before they own
 * anything. Deliberately plain: this is the layer armour goes over, and it has
 * to survive being seen under a half-equipped character without competing.
 */
function underGarments(ctx: BuildCtx, mat = 'linen'): void {
  const { j, p, parts } = ctx;
  const H = p.height;
  const t = p.thick;
  const pelvisW = p.hip * H * 2.5;
  const chestW = p.shoulder * H * 1.9;

  // Sleeveless shirt. Built as a slightly inflated copy of the torso itself
  // rather than as a curved panel in front of it: a panel reads as a sandwich
  // board, and cloth on a body is just the body one layer out.
  const grow = 1.06;
  parts.push({
    geo: transformed(
      taperedBox(
        pelvisW * 0.9 * grow,
        H * 0.1 * p.depth * grow,
        chestW * grow,
        H * 0.128 * p.depth * grow,
        H * 0.205,
        H * 0.016,
      ),
      { pos: [0, H * 0.688, 0] },
    ),
    mat,
    bind: TORSO,
  });
  // Hem flaring below the waist, so the shirt ends in cloth rather than a cut.
  parts.push({
    geo: transformed(
      taperedBox(pelvisW * 1.08, H * 0.108 * p.depth, pelvisW * 0.92 * grow, H * 0.102 * p.depth, H * 0.075, H * 0.012),
      { pos: [0, H * 0.565, 0] },
    ),
    mat,
    bind: SKIRT,
  });

  // Braies: a waistband plus two short legs, cut mid-thigh.
  parts.push({
    geo: transformed(
      taperedBox(pelvisW * 1.05, H * 0.112 * p.depth, pelvisW * 1.02, H * 0.104 * p.depth, H * 0.085, H * 0.012),
      { pos: [0, H * 0.5, 0] },
    ),
    mat,
    bind: SKIRT,
  });
  for (const [hp, kn, bindLeg] of [
    ['hipL', 'kneeL', LEG_L],
    ['hipR', 'kneeR', LEG_R],
  ] as Array<[string, string, string[]]>) {
    const cuff = j[hp].clone().lerp(j[kn], 0.34);
    parts.push({
      geo: limbBetween(j[hp], cuff, H * 0.058 * t, H * 0.05 * t),
      mat,
      bind: bindLeg,
    });
  }

  // Waist cord. A torus, because a box here reads as a second belt buckle.
  const cord = ring(pelvisW * 0.56, H * 0.009, 16, 6);
  cord.rotateX(Math.PI * 0.5);
  cord.scale(1, 1, (H * 0.112 * p.depth) / (pelvisW * 1.12));
  cord.translate(0, H * 0.545, 0);
  parts.push({ geo: cord, mat: 'leather', bind: ['hips'] });
  parts.push({
    geo: transformed(limb(H * 0.05, H * 0.007, H * 0.005, 5), {
      pos: [H * 0.014, H * 0.515, H * 0.058 * p.depth],
      rot: [0.2, 0, 0.3],
    }),
    mat: 'leather',
    bind: ['hips'],
  });

  // Foot wraps: strips crossing the instep, so bare feet read as bound rather
  // than as naked feet in a dungeon.
  for (const [ft, bindLeg] of [
    ['footL', LEG_L],
    ['footR', LEG_R],
  ] as Array<[string, string[]]>) {
    const f = j[ft];
    for (let i = 0; i < 2; i++) {
      parts.push({
        geo: transformed(beveledBox(H * 0.062 * t, H * 0.014, H * 0.03, H * 0.005), {
          pos: [f.x, f.y + H * 0.03 - i * H * 0.016, f.z + H * 0.006 + i * H * 0.028],
          rot: [i * 0.35, 0, 0],
        }),
        mat,
        bind: bindLeg,
      });
    }
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

/**
 * Texture density per material bucket, in tiles across the body.
 *
 * A single figure-wide repeat gave a linen weave with threads the width of a
 * hand. Cloth and leather need many more tiles than plate does, and skin needs
 * barely any — its texture is pores, and pores should be invisible.
 */
const MAT_REPEAT: Record<string, number> = {
  skin: 1.4,
  shadow: 1,
  linen: 13,
  cloth: 9,
  leather: 8,
  armour: 3,
  trim: 4,
};

const CLASSES: Record<CharClassId, ClassBuild> = {
  // ---------------------------------------------------------------- WARDEN --
  warden: {
    profile: { height: 1.86, shoulder: 0.135, hip: 0.062, thick: 1.28, depth: 1.25, head: 1.0, lean: 0.03 },
    palettes: {
      skin: 'skin.tan',
      shadow: 'metal.dark',
      armour: 'metal.steel',
      trim: 'metal.gold',
      cloth: 'cloth.banner',
      linen: 'cloth.undyed',
      leather: 'leather.worn',
    },
    accent: 0xd8b45a,
    build(ctx) {
      const { j, p, rng, parts, props } = ctx;
      const H = p.height;
      baseBody(ctx, { skin: 'skin', armour: 'armour', boots: 'armour', gloves: 'armour' });
      baseHead(ctx, 'skin', 1.0);
      underGarments(ctx);

      // Surcoat: a heavy wool tabard over the shirt, the order's colours. Cloth,
      // not plate — plate is something you find, and the point of the paperdoll
      // is that you can see the difference.
      const tab = clothPanel(p.hip * H * 1.72, H * 0.36, rng, { segsX: 5, segsY: 8, ripple: 0.03, flare: 0.15 });
      tab.translate(0, H * 0.715, H * 0.055 * p.depth);
      parts.push({ geo: tab, mat: 'cloth', cover: 'chest', bind: SKIRT });
      const tabBack = clothPanel(p.hip * H * 1.6, H * 0.32, rng, { segsX: 5, segsY: 7, ripple: 0.03, flare: 0.12 });
      tabBack.rotateY(Math.PI);
      tabBack.translate(0, H * 0.715, -H * 0.05 * p.depth);
      parts.push({ geo: tabBack, mat: 'cloth', cover: 'chest', bind: SKIRT });

      // Wide campaign belt that carries the surcoat's weight.
      parts.push({
        geo: transformed(beveledBox(p.hip * H * 2.72, H * 0.05, p.hip * H * 2.5, H * 0.01), {
          pos: [0, H * 0.552, 0],
        }),
        mat: 'leather',
        cover: 'belt',
        bind: ['hips'],
      });

      // Padded arming cap: what goes under a helm, and what you see without one.
      const cap = dome(H * 0.058, 1.1, 12, 6);
      cap.translate(j.head.x, j.head.y - H * 0.004, j.head.z - H * 0.002);
      parts.push({ geo: cap, mat: 'linen', cover: 'helm', bind: ['head'] });

      // Leather shoulder rolls — the strapping a pauldron would buckle onto.
      for (const [side, s] of [
        ['shoulderL', 1],
        ['shoulderR', -1],
      ] as Array<[string, number]>) {
        const roll = new THREE.Mesh(
          limb(H * 0.1, H * 0.028, H * 0.024, 8),
          surface('leather.worn', { repeat: 4, seed: 5 }),
        );
        roll.rotation.set(0, 0, Math.PI * 0.5 + s * 0.25);
        roll.position.set(s * H * 0.012, H * 0.014, 0);
        roll.castShadow = true;
        props.push({ bone: side, obj: roll, cover: 'chest' });
      }
      void spike;
      void pauldron;
    },
  },

  // ----------------------------------------------------------- PYROMANCER --
  pyromancer: {
    profile: { height: 1.76, shoulder: 0.098, hip: 0.05, thick: 0.94, depth: 0.92, head: 1.0, lean: 0.06 },
    palettes: {
      skin: 'skin.fair',
      shadow: 'metal.dark',
      armour: 'cloth.silk',
      cloth: 'cloth.linen',
      linen: 'cloth.undyed',
      trim: 'metal.gold',
      leather: 'leather.fine',
    },
    accent: 0xff7a2a,
    build(ctx) {
      const { j, p, rng, parts, props } = ctx;
      const H = p.height;
      baseBody(ctx, { skin: 'skin', armour: 'armour', boots: 'leather', gloves: 'skin' });
      baseHead(ctx, 'skin', 0.95);
      underGarments(ctx);

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
      parts.push({ geo: robe, mat: 'armour', cover: 'chest', bind: SKIRT });

      // Wide sleeves hanging from the elbows.
      for (const [el, hd, bindArm] of [
        ['elbowL', 'handL', ARM_L],
        ['elbowR', 'handR', ARM_R],
      ] as Array<[string, string, string[]]>) {
        const len = j[el].distanceTo(j[hd]) * 1.15;
        const sleeve = limb(len, H * 0.055, H * 0.03, 9);
        spanTo(sleeve, j[el], j[hd].clone().sub(j[el]).multiplyScalar(1.15).add(j[el]));
        parts.push({ geo: sleeve, mat: 'armour', cover: 'chest', bind: bindArm });
      }

      // Hood: a cowl that reads as a pointed hood in outline, plus a shadowed
      // opening so the face is suggested rather than modelled.
      const hood = dome(H * 0.078, 1.5, 14, 8);
      hood.translate(j.head.x, j.head.y - H * 0.03, j.head.z - H * 0.012);
      parts.push({ geo: hood, mat: 'cloth', cover: 'helm', bind: ['head'] });
      const cowl = shell(H * 0.2, H * 0.16, H * 0.05, 8, 6, H * 0.014);
      cowl.rotateX(-0.35);
      cowl.translate(0, j.head.y - H * 0.045, -H * 0.01);
      parts.push({ geo: cowl, mat: 'cloth', cover: 'helm', bind: ['head', 'chest'] });

      // Shoulder mantle
      const mantle = shell(p.shoulder * H * 2.6, H * 0.13, H * 0.06, 10, 5, H * 0.014);
      mantle.rotateX(0.5);
      mantle.translate(0, H * 0.79, 0);
      parts.push({ geo: mantle, mat: 'cloth', cover: 'chest', bind: ['chest'] });

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
      skin: 'skin.deep',
      shadow: 'metal.dark',
      armour: 'leather.fine',
      cloth: 'cloth.tattered',
      linen: 'cloth.undyed',
      trim: 'metal.dark',
      leather: 'leather.studded',
    },
    accent: 0x4ad69a,
    build(ctx) {
      const { j, p, rng, parts, props } = ctx;
      const H = p.height;
      baseBody(ctx, { skin: 'skin', armour: 'armour', boots: 'leather', gloves: 'leather' });
      baseHead(ctx, 'skin', 0.94);
      underGarments(ctx);

      // Harness straps across the shirt: thin, crossing, catching a highlight.
      for (const s of [-1, 1]) {
        const strap = taperedBox(H * 0.032, H * 0.012, H * 0.026, H * 0.012, H * 0.3, H * 0.004);
        strap.rotateZ(s * 0.42);
        strap.rotateX(-0.12);
        strap.translate(0, H * 0.7, H * 0.055 * p.depth);
        parts.push({ geo: strap, mat: 'leather', cover: 'chest', bind: TORSO });
      }
      const belt = transformed(beveledBox(p.hip * H * 2.66, H * 0.038, H * 0.165, H * 0.008), {
        pos: [0, H * 0.556, 0],
      });
      parts.push({ geo: belt, mat: 'leather', cover: 'belt', bind: ['hips'] });

      // Hood, pulled low and forward — the classic assassin read.
      const hood = dome(H * 0.07, 1.42, 14, 8);
      hood.scale(1, 1, 1.18);
      hood.translate(j.head.x, j.head.y - H * 0.026, j.head.z - H * 0.016);
      parts.push({ geo: hood, mat: 'cloth', cover: 'helm', bind: ['head'] });
      const peak = spike(H * 0.1, H * 0.03, 5, -0.55);
      peak.rotateX(1.35);
      peak.translate(0, j.head.y + H * 0.03, -H * 0.03);
      parts.push({ geo: peak, mat: 'cloth', cover: 'helm', bind: ['head'] });

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
      skin: 'skin.fair',
      shadow: 'metal.dark',
      armour: 'metal.silver',
      cloth: 'cloth.silk',
      linen: 'cloth.undyed',
      trim: 'metal.gold',
      leather: 'leather.studded',
    },
    accent: 0x6fc8ff,
    build(ctx) {
      const { j, p, rng, parts, props } = ctx;
      const H = p.height;
      baseBody(ctx, { skin: 'skin', armour: 'armour', boots: 'leather', gloves: 'leather' });
      baseHead(ctx, 'skin', 0.98);
      underGarments(ctx);

      // Silk over-tunic with a woven sash. Light, layered, unarmoured.
      const tunic = shell(p.shoulder * H * 1.96, H * 0.25, H * 0.066 * p.depth, 9, 8, H * 0.015, (u, v) =>
        0.74 + 0.26 * Math.sin(Math.PI * (0.18 + v * 0.72)) * (1 - 0.2 * Math.abs(u - 0.5)),
      );
      tunic.translate(0, H * 0.7, H * 0.014 * p.depth);
      parts.push({ geo: tunic, mat: 'cloth', cover: 'chest', bind: TORSO });
      const sash = transformed(beveledBox(p.hip * H * 2.6, H * 0.055, p.hip * H * 2.4, H * 0.012), {
        pos: [0, H * 0.566, 0],
      });
      parts.push({ geo: sash, mat: 'trim', cover: 'belt', bind: ['hips'] });

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
      props.push({ bone: 'head', obj: circlet, cover: 'helm' });
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(
          shell(H * 0.09, H * 0.05, H * 0.014, 5, 3, H * 0.006, (u) => 1 - u * 0.7),
          surface('metal.silver', { repeat: 5 }),
        );
        wing.position.set(s * H * 0.055, H * 0.035, -H * 0.01);
        wing.rotation.set(0.2, s * 1.2, s * 0.55);
        props.push({ bone: 'head', obj: wing, cover: 'helm' });
      }

      // Asymmetric pauldron — asymmetry alone separates a silhouette.
      const pl = pauldron(H * 0.12, H * 0.045, rng);
      const plMesh = new THREE.Mesh(pl, surface('leather.studded', { repeat: 3, seed: 6 }));
      plMesh.rotation.set(-0.2, 0, 0.45);
      plMesh.position.set(H * 0.014, H * 0.018, 0);
      plMesh.castShadow = true;
      props.push({ bone: 'shoulderL', obj: plMesh, cover: 'chest' });

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
      linen: 'cloth.tattered',
      trim: 'metal.dark',
      leather: 'leather.worn',
    },
    accent: 0x7ce0a0,
    build(ctx) {
      const { j, p, rng, parts, props } = ctx;
      const H = p.height;
      baseBody(ctx, { skin: 'skin', armour: 'armour', boots: 'leather', gloves: 'skin' });
      underGarments(ctx, 'cloth');

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
      frontRag.translate(0, H * 0.7, H * 0.058 * p.depth);
      parts.push({ geo: frontRag, mat: 'cloth', cover: 'chest', bind: SKIRT });

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
export function buildPlayerModel(classId: CharClassId, rng: Rng, worn?: Iterable<EquipSlot>): PlayerModel {
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

  // Bucket parts by material so the whole character is a handful of draw calls.
  // The cover slot joins the key: pieces that gear replaces have to live in
  // their own mesh to be hideable independently of the body they sit on.
  const buckets = new Map<string, THREE.BufferGeometry[]>();
  for (const part of ctx.parts) {
    normalizeGeometry(part.geo);
    skinGeometry(part.geo, segs, part.bind);
    const key = `${part.mat}#${part.cover ?? ''}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(part.geo);
  }

  let seedTick = 1;
  for (const [key, list] of buckets) {
    const [matKey, coverKey] = key.split('#');
    const geo = mergeSkinned(list);
    for (const g of list) g.dispose();
    const paletteKey = def.palettes[matKey] ?? 'metal.iron';
    const mat = surface(paletteKey, { repeat: MAT_REPEAT[matKey] ?? 2.5, seed: seedTick++ });
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = `${classId}:${matKey}`;
    if (coverKey) mesh.userData.coverSlot = coverKey;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Skinned bounds are computed from the bind pose and go stale the moment a
    // limb swings; culling on them pops characters out at the screen edge.
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
  }

  // Rigid decorations ride their bone directly.
  for (const { bone, obj, cover } of ctx.props) {
    obj.castShadow = true;
    if (cover) obj.userData.coverSlot = cover;
    bones[bone]?.add(obj);
  }

  root.userData.classId = classId;
  root.userData.accent = def.accent;
  root.userData.height = p.height;

  applyWornSlots(root, worn ?? []);

  return { root, skeleton, bones };
}

/**
 * Hides the class's own covering for every slot that has real gear in it.
 *
 * This is what makes equipment change how you look. A fresh character wears
 * nothing but linen, so every default piece is on show; equip a breastplate and
 * the class's own chest covering steps aside for it rather than clipping
 * through it. Cheap enough to call on every equip — it only flips `visible`.
 */
export function applyWornSlots(root: THREE.Object3D, worn: Iterable<EquipSlot>): void {
  const set = worn instanceof Set ? (worn as Set<string>) : new Set<string>(worn as Iterable<string>);
  root.traverse((o) => {
    const slot = o.userData?.coverSlot as string | undefined;
    if (slot) o.visible = !set.has(slot);
  });
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

/**
 * Removes anything previously socketed into `slot`, across every bone.
 *
 * Sweeping every bone rather than just the socket's own bone is what clears the
 * mirrored twin that paired slots (gloves, boots) put on the opposite limb.
 */
export function clearSocket(bones: Record<string, THREE.Bone>, slot: EquipSlot): void {
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

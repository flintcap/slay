/**
 * SLAY — a hero pose as plain numbers, and how those numbers become bones.
 *
 * A pose is a flat array of channels: three angles per bone and a few extras
 * (pelvis offset, how much the legs follow IK, how much the off hand reaches
 * for the main hand's grip). Channels blend linearly, so layering a swing over
 * a stride, or easing between two key poses, is arithmetic. Angles are read
 * through a per-bone convention, written once here, so a pose means the same
 * thing on every body:
 *
 * - Trunk and head (`pelvis spine chest neck head`): x bends forward, y turns
 *   to the character's left, z tips the top toward the right.
 * - Collar bones: x lifts the shoulder, y brings it forward.
 * - Upper arms start hanging at the side, palms in, thumbs forward (not the
 *   A-pose of the bind): x raises the arm forward, y is internal rotation
 *   (the thumb turns in toward the belly), z raises it out to the side.
 * - Forearms: x is elbow flex (0 straight), y turns the forearm (pronation).
 * - Hands: x flexes the wrist toward the palm, y tips the thumb side up
 *   (radial deviation). Fingers and thumb: x curls them.
 * - Legs (only shown where IK is off): thigh x swings the leg back, y and z
 *   mirror per side; shin x bends the knee back; foot x points the toes down.
 *
 * Every left/right angle is mirrored, so the same numbers on L and R give a
 * mirror-image pose.
 */
import * as THREE from 'three';
import { HERO_BONES, HERO_PARENT, type HeroBone } from './Rig';

export const BONE_COUNT = HERO_BONES.length;
export const BONE_INDEX = Object.fromEntries(HERO_BONES.map((b, i) => [b, i])) as Record<HeroBone, number>;
const PARENT_INDEX = HERO_BONES.map((b) => (HERO_PARENT[b] ? BONE_INDEX[HERO_PARENT[b]!] : -1));

/** Extra channels after the bone angles. */
export const CH = {
  /** Pelvis offset from its bind position, metres, character space. */
  pelvisX: BONE_COUNT * 3,
  pelvisY: BONE_COUNT * 3 + 1,
  pelvisZ: BONE_COUNT * 3 + 2,
  /** 1 legs follow the planted feet, 0 legs take the authored angles. */
  legIk: BONE_COUNT * 3 + 3,
  /** 1 the left hand grips the main hand's weapon below the right hand. */
  offGrip: BONE_COUNT * 3 + 4,
  /** How far below the main hand the off hand grips, metres. */
  gripGap: BONE_COUNT * 3 + 5,
} as const;
export const CHANNELS = BONE_COUNT * 3 + 6;

export type Side = 'L' | 'R';

export class Pose {
  readonly c = new Float32Array(CHANNELS);

  /** The neutral pose: arms hanging, legs on IK. */
  rest(): this {
    this.c.fill(0);
    this.c[CH.legIk] = 1;
    return this;
  }
  copy(p: Pose): this {
    this.c.set(p.c);
    return this;
  }
  get(bone: HeroBone, axis: 0 | 1 | 2): number {
    return this.c[BONE_INDEX[bone] * 3 + axis]!;
  }
  set(bone: HeroBone, x: number, y = 0, z = 0): this {
    const i = BONE_INDEX[bone] * 3;
    this.c[i] = x;
    this.c[i + 1] = y;
    this.c[i + 2] = z;
    return this;
  }
  add(bone: HeroBone, x: number, y = 0, z = 0): this {
    const i = BONE_INDEX[bone] * 3;
    this.c[i]! += x;
    this.c[i + 1]! += y;
    this.c[i + 2]! += z;
    return this;
  }
  /** Moves the pelvis by metres, character space. */
  shift(x: number, y: number, z: number): this {
    this.c[CH.pelvisX]! += x;
    this.c[CH.pelvisY]! += y;
    this.c[CH.pelvisZ]! += z;
    return this;
  }
  /** this = this + (p - base) * w: lays the difference p makes over base on top. */
  addDelta(p: Pose, base: Pose, w: number): this {
    const a = this.c;
    for (let i = 0; i < CHANNELS; i++) a[i]! += (p.c[i]! - base.c[i]!) * w;
    return this;
  }
  /** this = lerp(this, p, w), per channel weight `mask[i] * w` when a mask is given. */
  mix(p: Pose, w: number, mask?: Float32Array): this {
    const a = this.c;
    const b = p.c;
    if (!mask) {
      for (let i = 0; i < CHANNELS; i++) a[i]! += (b[i]! - a[i]!) * w;
    } else {
      for (let i = 0; i < CHANNELS; i++) a[i]! += (b[i]! - a[i]!) * w * mask[i]!;
    }
    return this;
  }
  /** One arm, in the arm convention above. */
  arm(side: Side, fwd: number, out: number, twist: number, elbow: number, pron = 0, wrist = 0, dev = 0): this {
    this.set(side === 'L' ? 'upperArmL' : 'upperArmR', fwd, twist, out);
    this.set(side === 'L' ? 'foreArmL' : 'foreArmR', elbow, pron, 0);
    this.set(side === 'L' ? 'handL' : 'handR', wrist, dev, 0);
    return this;
  }
  /** Curls a hand's fingers and thumb: 1 a fist, 0 flat. */
  fist(side: Side, k: number): this {
    this.set(side === 'L' ? 'fingersL' : 'fingersR', 1.35 * k);
    this.set(side === 'L' ? 'fingerTipsL' : 'fingerTipsR', 1.25 * k);
    this.set(side === 'L' ? 'thumbL' : 'thumbR', 0.7 * k);
    return this;
  }
}

/** Channel weights that pick out a body region, for masked mixing. */
export function mask(bones: HeroBone[], extras: number[] = [], w = 1): Float32Array {
  const m = new Float32Array(CHANNELS);
  for (const b of bones) m.fill(w, BONE_INDEX[b] * 3, BONE_INDEX[b] * 3 + 3);
  for (const e of extras) m[e] = w;
  return m;
}

export const ARM_L: HeroBone[] = ['clavL', 'upperArmL', 'foreArmL', 'handL', 'fingersL', 'fingerTipsL', 'thumbL'];
export const ARM_R: HeroBone[] = ['clavR', 'upperArmR', 'foreArmR', 'handR', 'fingersR', 'fingerTipsR', 'thumbR'];
export const TRUNK: HeroBone[] = ['spine', 'chest', 'neck', 'head'];
export const LEGS: HeroBone[] = ['thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'];

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/** Per-body axes the conventions need, from the bind joints. */
interface SideAxes {
  /** Turns the bind A-pose arm to hang at the side. */
  hang: THREE.Quaternion;
  /** Elbow hinge, in the upper arm's frame; positive angle flexes. */
  hinge: THREE.Vector3;
  /** Bind elbow bend already in the mesh, radians. */
  bindBend: number;
  /** Forearm direction, bind. */
  fore: THREE.Vector3;
  /** Wrist flex axis (fingers toward the palm) and the palm normal, bind. */
  flex: THREE.Vector3;
  palm: THREE.Vector3;
  /** Thumb curl axis, bind. */
  thumb: THREE.Vector3;
}

/**
 * Turns channels into bone rotations for one body, and runs forward
 * kinematics in rig space (the rig root's local frame).
 */
export class PoseSolver {
  readonly local: THREE.Quaternion[] = HERO_BONES.map(() => new THREE.Quaternion());
  readonly world: THREE.Quaternion[] = HERO_BONES.map(() => new THREE.Quaternion());
  readonly pos: THREE.Vector3[] = HERO_BONES.map(() => new THREE.Vector3());
  /** Bind offset of each bone from its parent. */
  readonly offset: THREE.Vector3[];
  readonly joints: THREE.Vector3[];
  private sides: Record<Side, SideAxes>;

  constructor(joints: Record<HeroBone, THREE.Vector3>) {
    this.joints = HERO_BONES.map((b) => joints[b].clone());
    this.offset = HERO_BONES.map((b) => {
      const p = HERO_PARENT[b];
      return p ? joints[b].clone().sub(joints[p]) : joints[b].clone();
    });
    const axes = (side: Side): SideAxes => {
      const s = side === 'L' ? 1 : -1;
      const sh = joints[side === 'L' ? 'upperArmL' : 'upperArmR'];
      const el = joints[side === 'L' ? 'foreArmL' : 'foreArmR'];
      const wr = joints[side === 'L' ? 'handL' : 'handR'];
      const kn = joints[side === 'L' ? 'fingersL' : 'fingersR'];
      const u = el.clone().sub(sh).normalize();
      const f = wr.clone().sub(el).normalize();
      // Hang: the bind arm swung down onto -Y about the forward axis.
      const hang = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(u.x, u.y, 0).normalize(),
        new THREE.Vector3(0, -1, 0),
      );
      const hinge = new THREE.Vector3().crossVectors(u, f).normalize();
      const along = kn.clone().sub(wr).normalize();
      const palm = new THREE.Vector3(0, -1, 0).addScaledVector(along, along.y).normalize();
      // Fingers curl toward the palm: about along x palm, signed per side.
      const flex = new THREE.Vector3().crossVectors(along, palm).normalize().multiplyScalar(-s);
      // The flex axis must turn the knuckle direction toward the palm.
      const test = along.clone().applyAxisAngle(flex, 0.1);
      if (test.dot(palm) < 0) flex.negate();
      const thumb = along.clone().multiplyScalar(-1).add(flex).normalize();
      return { hang, hinge, bindBend: u.angleTo(f), fore: f, flex, palm, thumb };
    };
    this.sides = { L: axes('L'), R: axes('R') };
  }

  /** Channels to local rotations. Legs come out FK; IK overwrites them later. */
  rotations(p: Pose): void {
    const c = p.c;
    const L = this.local;
    for (let i = 0; i < BONE_COUNT; i++) {
      const name = HERO_BONES[i]!;
      const x = c[i * 3]!;
      const y = c[i * 3 + 1]!;
      const z = c[i * 3 + 2]!;
      const q = L[i]!;
      const side: Side = name.endsWith('L') ? 'L' : 'R';
      const s = side === 'L' ? 1 : -1;
      const ax = this.sides[side];
      switch (name) {
        case 'root':
        case 'pelvis':
        case 'spine':
        case 'chest':
        case 'neck':
        case 'head':
          q.setFromEuler(_e.set(x, y, z, 'YXZ'));
          break;
        case 'clavL':
        case 'clavR':
          q.setFromEuler(_e.set(0, -s * y, s * x, 'YXZ'));
          break;
        case 'upperArmL':
        case 'upperArmR':
          q.setFromEuler(_e.set(-x, -s * y, s * z, 'XZY')).multiply(ax.hang);
          break;
        case 'foreArmL':
        case 'foreArmR':
          q.setFromAxisAngle(ax.hinge, x - ax.bindBend).multiply(_q.setFromAxisAngle(ax.fore, s * y));
          break;
        case 'handL':
        case 'handR':
          q.setFromAxisAngle(ax.flex, x).multiply(_q.setFromAxisAngle(ax.palm, -s * y));
          break;
        case 'fingersL':
        case 'fingersR':
        case 'fingerTipsL':
        case 'fingerTipsR':
          q.setFromAxisAngle(ax.flex, x);
          break;
        case 'thumbL':
        case 'thumbR':
          q.setFromAxisAngle(ax.thumb, x);
          break;
        default:
          // Legs: plain angles, mirrored.
          q.setFromEuler(_e.set(x, s * y, s * z, 'YXZ'));
      }
    }
  }

  /** Forward kinematics from `local`, pelvis moved by the pose's offset. */
  fk(p: Pose, from = 0): void {
    const c = p.c;
    for (let i = from; i < BONE_COUNT; i++) {
      const pi = PARENT_INDEX[i]!;
      if (pi < 0) {
        this.world[i]!.copy(this.local[i]!);
        this.pos[i]!.copy(this.offset[i]!);
        continue;
      }
      this.pos[i]!.copy(this.offset[i]!);
      if (i === BONE_INDEX.pelvis) this.pos[i]!.add(_v.set(c[CH.pelvisX]!, c[CH.pelvisY]!, c[CH.pelvisZ]!));
      this.pos[i]!.applyQuaternion(this.world[pi]!).add(this.pos[pi]!);
      this.world[i]!.multiplyQuaternions(this.world[pi]!, this.local[i]!);
    }
  }

  /** Sets one bone's world rotation by changing its local one (parent must be current). */
  setWorld(i: number, q: THREE.Quaternion): void {
    const pi = PARENT_INDEX[i]!;
    this.local[i]!.copy(_q2.copy(this.world[pi]!).invert().multiply(q));
    this.world[i]!.copy(q);
  }

  /** Recomputes one bone's world transform from its parent (after a local change). */
  refresh(i: number): void {
    const pi = PARENT_INDEX[i]!;
    this.pos[i]!.copy(this.offset[i]!).applyQuaternion(this.world[pi]!).add(this.pos[pi]!);
    this.world[i]!.multiplyQuaternions(this.world[pi]!, this.local[i]!);
  }

  /** Recomputes every descendant of bone `i` (bones are stored parents first). */
  refreshBelow(i: number): void {
    const inSub = new Uint8Array(BONE_COUNT);
    inSub[i] = 1;
    for (let k = i + 1; k < BONE_COUNT; k++) {
      const pk = PARENT_INDEX[k]!;
      if (pk >= 0 && inSub[pk]) {
        inSub[k] = 1;
        this.refresh(k);
      }
    }
  }

  /** Writes local rotations (and the pelvis position) to the real bones. */
  apply(bones: THREE.Bone[], p: Pose): void {
    for (let i = 0; i < BONE_COUNT; i++) bones[i]!.quaternion.copy(this.local[i]!);
    const pel = bones[BONE_INDEX.pelvis]!;
    pel.position.copy(this.offset[BONE_INDEX.pelvis]!);
    pel.position.x += p.c[CH.pelvisX]!;
    pel.position.y += p.c[CH.pelvisY]!;
    pel.position.z += p.c[CH.pelvisZ]!;
  }

  parentOf(i: number): number {
    return PARENT_INDEX[i]!;
  }
}

const _v = new THREE.Vector3();

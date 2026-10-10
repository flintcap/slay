/**
 * SLAY — the hero skeleton. Every player class and every townsperson stands on
 * this rig, and the hero animator drives it. Bone and socket names are a
 * contract with items, npcs and vfx (see CONTRACTS.md, "Hero rig"): they never
 * change once published.
 *
 * Space: character space is +X the character's left, +Y up, +Z forward, feet
 * on y = 0. Every bone has an identity rotation in the bind pose, so a bone's
 * local axes at rest are character axes and a rotation authored on a bone
 * reads the same way on every body.
 *
 * Bind pose: an A-pose. Arms 45 degrees below horizontal with a slight bend at
 * the elbow, palms down, thumbs forward. Legs straight with the feet under the
 * hips. The A-pose is what the body is meshed and skinned in; nobody is ever
 * shown in it.
 *
 * Proportions are measured in heads (`h = height / 7.5`), the classical
 * heroic figure: crown 7.5, chin 6.5, shoulders 6.1, elbow 4.6, crotch 3.75,
 * knee 2.0, ankle 0.38.
 */
import * as THREE from 'three';

/** Every bone, parents before children. */
export const HERO_BONES = [
  'root',
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'clavL',
  'upperArmL',
  'foreArmL',
  'handL',
  'fingersL',
  'fingerTipsL',
  'thumbL',
  'clavR',
  'upperArmR',
  'foreArmR',
  'handR',
  'fingersR',
  'fingerTipsR',
  'thumbR',
  'thighL',
  'shinL',
  'footL',
  'toeL',
  'thighR',
  'shinR',
  'footR',
  'toeR',
] as const;

export type HeroBone = (typeof HERO_BONES)[number];

export const HERO_PARENT: Record<HeroBone, HeroBone | null> = {
  root: null,
  pelvis: 'root',
  spine: 'pelvis',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  clavL: 'chest',
  upperArmL: 'clavL',
  foreArmL: 'upperArmL',
  handL: 'foreArmL',
  fingersL: 'handL',
  fingerTipsL: 'fingersL',
  thumbL: 'handL',
  clavR: 'chest',
  upperArmR: 'clavR',
  foreArmR: 'upperArmR',
  handR: 'foreArmR',
  fingersR: 'handR',
  fingerTipsR: 'fingersR',
  thumbR: 'handR',
  thighL: 'pelvis',
  shinL: 'thighL',
  footL: 'shinL',
  toeL: 'footL',
  thighR: 'pelvis',
  shinR: 'thighR',
  footR: 'shinR',
  toeR: 'footR',
};

/**
 * Named attach points, each an Object3D child of one bone with its own
 * rotation. Items attach their model to a socket at identity.
 */
export const HERO_SOCKETS = [
  'mainHand',
  'offHand',
  'back',
  'quiver',
  'belt',
  'beltL',
  'beltR',
  'head',
  'chest',
  'castL',
  'castR',
] as const;

export type HeroSocket = (typeof HERO_SOCKETS)[number];

export const SOCKET_BONE: Record<HeroSocket, HeroBone> = {
  mainHand: 'handR',
  offHand: 'handL',
  back: 'chest',
  quiver: 'chest',
  belt: 'pelvis',
  beltL: 'pelvis',
  beltR: 'pelvis',
  head: 'head',
  chest: 'chest',
  castL: 'handL',
  castR: 'handR',
};

/** What a body is: the numbers that make a warden and a pyromancer differ. */
export interface BodyShape {
  sex: 'male' | 'female';
  /** Floor to crown, metres. */
  height: number;
  /** 0 lean and wiry .. 1 heavy and muscled. */
  build: number;
  /** Multiplies shoulder width. */
  shoulders?: number;
  /** Multiplies hip width. */
  hips?: number;
  /** 0 living .. 1 bone and sinew (the revenant). */
  wasted?: number;
}

export type JointMap = Record<HeroBone, THREE.Vector3>;

/** Head unit for a shape, metres. */
export function headUnit(s: BodyShape): number {
  return s.height / 7.5;
}

/** Shoulder joint half-width, metres. */
export function shoulderHalf(s: BodyShape): number {
  const h = headUnit(s);
  const base = s.sex === 'male' ? 0.74 : 0.62;
  return h * (base + 0.08 * s.build) * (s.shoulders ?? 1);
}

/** Hip joint half-width, metres. */
export function hipHalf(s: BodyShape): number {
  const h = headUnit(s);
  const base = s.sex === 'male' ? 0.36 : 0.42;
  return h * (base + 0.02 * s.build) * (s.hips ?? 1);
}

/** Bone lengths in heads. */
export const LIMB = {
  upperArm: 1.42,
  foreArm: 1.16,
  palm: 0.4,
  fingers: 0.2,
  fingerTips: 0.17,
  thigh: 1.86,
  shin: 1.64,
} as const;

/** The A-pose arm: 45 degrees below horizontal, a few degrees forward. */
const ARM_DROP = Math.PI * 0.25;
const ARM_FWD = 0.06;
/** Bend at the elbow in the bind pose, radians, forward. */
const ELBOW_BEND = 0.16;

/**
 * Rest positions of every joint, in character space. This is the bind pose.
 */
export function heroJoints(s: BodyShape): JointMap {
  const h = headUnit(s);
  const sw = shoulderHalf(s);
  const hw = hipHalf(s);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x * h, y * h, z * h);
  const j = {} as JointMap;
  j.root = new THREE.Vector3();
  j.pelvis = v(0, 4.02, 0);
  j.spine = v(0, 4.55, -0.06);
  j.chest = v(0, 5.3, -0.06);
  j.neck = v(0, 6.24, -0.1);
  j.head = v(0, 6.62, -0.02);
  j.thighL = new THREE.Vector3(hw, 3.86 * h, 0);
  j.thighR = new THREE.Vector3(-hw, 3.86 * h, 0);

  for (const side of [1, -1] as const) {
    const L = side > 0;
    const clav = v(side * 0.12, 6.12, 0.06);
    const shoulder = new THREE.Vector3(side * sw, 6.05 * h, -0.04 * h);
    const up = new THREE.Vector3(side * Math.cos(ARM_DROP), -Math.sin(ARM_DROP), ARM_FWD).normalize();
    const elbow = shoulder.clone().addScaledVector(up, LIMB.upperArm * h);
    // The forearm bends forward from the upper arm by ELBOW_BEND.
    const fore = up.clone();
    fore.z += Math.sin(ELBOW_BEND);
    fore.normalize();
    const wrist = elbow.clone().addScaledVector(fore, LIMB.foreArm * h);
    const knuckle = wrist.clone().addScaledVector(fore, LIMB.palm * h);
    const mid = knuckle.clone().addScaledVector(fore, LIMB.fingers * h);
    // Thumb root: at the wrist, toward the front (palms down, thumbs forward).
    const thumb = wrist.clone().addScaledVector(fore, 0.12 * h).add(new THREE.Vector3(0, -0.04 * h, 0.12 * h));
    j[L ? 'clavL' : 'clavR'] = clav;
    j[L ? 'upperArmL' : 'upperArmR'] = shoulder;
    j[L ? 'foreArmL' : 'foreArmR'] = elbow;
    j[L ? 'handL' : 'handR'] = wrist;
    j[L ? 'fingersL' : 'fingersR'] = knuckle;
    j[L ? 'fingerTipsL' : 'fingerTipsR'] = mid;
    j[L ? 'thumbL' : 'thumbR'] = thumb;

    const hip = L ? j.thighL : j.thighR;
    const knee = new THREE.Vector3(hip.x * 0.9, hip.y - LIMB.thigh * h, 0.04 * h);
    const ankle = new THREE.Vector3(hip.x * 0.84, knee.y - LIMB.shin * h, -0.04 * h);
    const toe = new THREE.Vector3(ankle.x * 1.06, 0.1 * h, ankle.z + 0.62 * h);
    j[L ? 'shinL' : 'shinR'] = knee;
    j[L ? 'footL' : 'footR'] = ankle;
    j[L ? 'toeL' : 'toeR'] = toe;
  }
  return j;
}

/** Direction from one joint to the next in the bind pose. */
export function boneDir(j: JointMap, from: HeroBone, to: HeroBone): THREE.Vector3 {
  return j[to].clone().sub(j[from]).normalize();
}

/**
 * A socket's frame in character space at rest, as position plus basis.
 *
 * Hands: the fist's grip. +Y runs along the grip and leaves the fist on the
 * thumb side (a held sword's blade points this way); +X runs from the wrist
 * toward the knuckles (a blade's edge faces this way); +Z = X cross Y, out of
 * the back of the right hand and out of the palm of the left.
 *
 * Body sockets: +Y up the body, +Z out of the body surface (forward for chest
 * and belt, backward for back and quiver), +X completing a right-handed frame.
 */
export function socketFrames(s: BodyShape, j: JointMap): Record<HeroSocket, { pos: THREE.Vector3; basis: THREE.Matrix4 }> {
  const h = headUnit(s);
  const out = {} as Record<HeroSocket, { pos: THREE.Vector3; basis: THREE.Matrix4 }>;
  const frame = (x: THREE.Vector3, y: THREE.Vector3) => {
    const X = x.clone().normalize();
    const Y = y.clone().sub(X.clone().multiplyScalar(y.dot(X))).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    return new THREE.Matrix4().makeBasis(X, Y, Z);
  };
  for (const side of [1, -1] as const) {
    const L = side > 0;
    const wrist = j[L ? 'handL' : 'handR'];
    const knuckle = j[L ? 'fingersL' : 'fingersR'];
    const along = knuckle.clone().sub(wrist).normalize();
    // Palms down in the bind pose: the palm faces -Y turned with the arm.
    const palm = new THREE.Vector3(0, -1, 0).sub(along.clone().multiplyScalar(-along.y)).normalize();
    const thumbDir = new THREE.Vector3().crossVectors(along, palm).multiplyScalar(-side).normalize();
    // Grip centre: inside the curled fingers, just under the palm.
    const grip = wrist.clone().addScaledVector(along, 0.3 * h).addScaledVector(palm, 0.13 * h);
    out[L ? 'offHand' : 'mainHand'] = { pos: grip, basis: frame(along, thumbDir) };
    const cast = wrist.clone().addScaledVector(along, 0.24 * h).addScaledVector(palm, 0.1 * h);
    out[L ? 'castL' : 'castR'] = { pos: cast, basis: frame(along, palm) };
  }
  const up = new THREE.Vector3(0, 1, 0);
  const id = (z: number) => frame(new THREE.Vector3(z, 0, 0), up);
  const chestDepth = h * (s.sex === 'male' ? 0.52 : 0.48) * (1 + 0.15 * s.build);
  out.chest = { pos: new THREE.Vector3(0, 5.55 * h, chestDepth * 0.6), basis: id(1) };
  out.back = { pos: new THREE.Vector3(0, 5.6 * h, -chestDepth * 0.62), basis: id(-1) };
  // Across the back, mouth up over the right shoulder.
  const q = frame(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-0.42, 1, 0));
  out.quiver = { pos: new THREE.Vector3(0.04 * h, 5.4 * h, -chestDepth * 0.78), basis: q };
  const waist = hipHalf(s) * 1.25;
  out.belt = { pos: new THREE.Vector3(0, 4.15 * h, waist * 0.78), basis: id(1) };
  out.beltL = { pos: new THREE.Vector3(waist, 4.1 * h, 0), basis: frame(new THREE.Vector3(0, 0, -1), up) };
  out.beltR = { pos: new THREE.Vector3(-waist, 4.1 * h, 0), basis: frame(new THREE.Vector3(0, 0, 1), up) };
  out.head = { pos: new THREE.Vector3(0, 7.05 * h, 0.04 * h), basis: id(1) };
  return out;
}

export interface HeroRig {
  /** Holds the root bone; place and turn this, never the bones. */
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  bones: Record<HeroBone, THREE.Bone>;
  sockets: Record<HeroSocket, THREE.Object3D>;
  shape: BodyShape;
  joints: JointMap;
}

/** Builds the bones and sockets for a body. No meshes. */
export function buildRig(shape: BodyShape, name = 'hero'): HeroRig {
  const joints = heroJoints(shape);
  const bones = {} as Record<HeroBone, THREE.Bone>;
  const order: THREE.Bone[] = [];
  for (const n of HERO_BONES) {
    const b = new THREE.Bone();
    b.name = n;
    const parent = HERO_PARENT[n];
    if (parent) {
      b.position.copy(joints[n]).sub(joints[parent]);
      bones[parent].add(b);
    } else {
      b.position.copy(joints[n]);
    }
    bones[n] = b;
    order.push(b);
  }
  const root = new THREE.Group();
  root.name = name;
  root.add(bones.root);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(order);

  const frames = socketFrames(shape, joints);
  const sockets = {} as Record<HeroSocket, THREE.Object3D>;
  for (const sname of HERO_SOCKETS) {
    const f = frames[sname];
    const bone = bones[SOCKET_BONE[sname]];
    const o = new THREE.Object3D();
    o.name = `socket:${sname}`;
    o.position.copy(f.pos).sub(joints[SOCKET_BONE[sname]]);
    o.quaternion.setFromRotationMatrix(f.basis);
    o.userData.heroSocket = sname;
    bone.add(o);
    sockets[sname] = o;
  }
  return { root, skeleton, bones, sockets, shape, joints };
}

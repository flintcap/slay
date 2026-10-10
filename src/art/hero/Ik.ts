/**
 * SLAY — inverse kinematics for the hero rig.
 *
 * Two pieces: where a two-bone limb's middle joint goes (knee, elbow), and the
 * rotation that turns a bone from its bind direction onto a new one without
 * twisting it. Every hero bone has an identity bind rotation, so a bone's
 * bind direction is simply the line from its joint to its child's joint.
 */
import * as THREE from 'three';

const _u = new THREE.Vector3();
const _p = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m0 = new THREE.Matrix4();
const _m1 = new THREE.Matrix4();

/**
 * Places the middle joint of a two-bone limb rooted at `a` reaching for `t`,
 * bending toward `pole` (a direction). Writes it to `out` and returns how far
 * the limb is stretched, 0 folded .. 1 straight. A target out of reach leaves
 * the limb straight and pointing at it, short of it.
 */
export function twoBoneIk(
  a: THREE.Vector3,
  t: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  out: THREE.Vector3,
): number {
  _u.subVectors(t, a);
  let d = _u.length();
  if (d < 1e-6) {
    _u.set(0, -1, 0);
    d = 1e-6;
  } else _u.divideScalar(d);
  const reach = l1 + l2;
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), reach * 0.99995);
  // Law of cosines: distance along the root-target line to the joint's foot.
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const r = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _p.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_p.lengthSq() < 1e-10) {
    // The pole lies along the limb: any perpendicular will do.
    _p.set(0, 0, 1).addScaledVector(_u, -_u.z);
    if (_p.lengthSq() < 1e-10) _p.set(1, 0, 0);
  }
  _p.normalize();
  out.copy(a).addScaledVector(_u, x).addScaledVector(_p, r);
  return d / reach;
}

/**
 * The rotation taking the frame (`bindDir`, `bindUp`) onto (`dir`, `up`).
 * `up` only steers the twist about `dir`; neither up needs to be exactly
 * perpendicular to its dir.
 */
export function aimQuat(
  bindDir: THREE.Vector3,
  bindUp: THREE.Vector3,
  dir: THREE.Vector3,
  up: THREE.Vector3,
  out: THREE.Quaternion,
): THREE.Quaternion {
  frame(bindDir, bindUp, _m0);
  frame(dir, up, _m1);
  _m1.multiply(_m0.transpose());
  return out.setFromRotationMatrix(_m1);
}

function frame(dir: THREE.Vector3, up: THREE.Vector3, m: THREE.Matrix4): void {
  _y.copy(dir).normalize();
  _z.copy(up).addScaledVector(_y, -up.dot(_y));
  if (_z.lengthSq() < 1e-10) {
    _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
    if (_z.lengthSq() < 1e-10) _z.set(1, 0, 0);
  }
  _z.normalize();
  _x.crossVectors(_y, _z);
  m.makeBasis(_x, _y, _z);
}

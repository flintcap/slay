/**
 * SLAY — secondary motion: the parts of a body that follow it rather than
 * lead it.
 *
 * Long hair (a person's `hairLong` cover meshes: falls, braids, tails) hangs
 * from the head and swings when the head moves, streams back when running,
 * keeps hanging down when the head tilts, and settles. It is done with one
 * extra bone under the head, added when the animator is built: the hair's
 * own vertices below the head joint are re-weighted toward it, progressively
 * down the length, and that mesh alone is bound to a copy of the skeleton
 * with the bone appended. Every other mesh keeps the shared skeleton, and the
 * bone names the rest of the game relies on are untouched.
 *
 * The bone is driven as a damped pendulum from the head's real motion in the
 * world, sub-stepped, so a long frame cannot make it ring or explode.
 */

import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _g = new THREE.Vector3();
const _e = new THREE.Euler();
const _vl = new THREE.Vector3();
const _dn = new THREE.Vector3();
const CHAIN = ['root', 'hips', 'spine', 'chest', 'head'];

/** One swinging attachment: a bone, its pendulum state and its tuning. */
interface Swing {
  bone: THREE.Bone;
  /** Swing angles about the head's X (back is +) and Z (left is +), and their rates. */
  ax: number;
  az: number;
  vx: number;
  vz: number;
  /** Spring stiffness and damping ratio; how far it may swing. */
  k: number;
  damp: number;
  limit: number;
}

export class SecondaryMotion {
  private readonly swings: Swing[] = [];
  private readonly head: THREE.Bone;
  private readonly model: THREE.Object3D;
  private lastPos = new THREE.Vector3();
  private lastVel = new THREE.Vector3();
  private has = 0;

  private constructor(
    private readonly bones: Record<string, THREE.Bone>,
    model: THREE.Object3D,
  ) {
    this.head = bones.head;
    this.model = model;
  }

  /**
   * Finds what can swing on a person built by `buildPerson` and rigs it.
   * Returns null when there is nothing (short hair, a monster, a partial rig).
   * Must run while the skeleton is still in its bind pose.
   */
  static attach(bones: Record<string, THREE.Bone>): SecondaryMotion | null {
    const head = bones.head;
    const model = bones.root?.parent;
    if (!head || !model) return null;
    const hair: THREE.SkinnedMesh[] = [];
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh && m.userData.coverSlot === 'hairLong') hair.push(m);
    });
    if (!hair.length) return null;
    const sm = new SecondaryMotion(bones, model);
    const bone = new THREE.Bone();
    bone.name = 'hairSway';
    head.add(bone);
    let rigged = false;
    for (const mesh of hair) rigged = sm.rigHair(mesh, bone) || rigged;
    if (!rigged) {
      head.remove(bone);
      return null;
    }
    sm.swings.push({ bone, ax: 0, az: 0, vx: 0, vz: 0, k: 70, damp: 0.35, limit: 0.9 });
    return sm;
  }

  /**
   * Moves part of each hair vertex's weight onto the sway bone, more the
   * further down the fall it is, and binds the mesh to a skeleton that has
   * the bone. The roots of the hair stay on the head.
   */
  private rigHair(mesh: THREE.SkinnedMesh, bone: THREE.Bone): boolean {
    const skel = mesh.skeleton;
    const geo = mesh.geometry;
    const headIdx = skel.bones.indexOf(this.head);
    const chestIdx = skel.bones.indexOf(this.bones.chest);
    const si = geo.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
    const sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (headIdx < 0 || !si || !sw || !pos) return false;
    // The head joint where the skeleton was bound, in the mesh's bind space.
    const headBind = skel.boneInverses[headIdx].clone().invert();
    const jy = _p.setFromMatrixPosition(headBind).y;
    const jz = _p.z;
    const reach = Math.max(0.05, (this.model.userData.height ?? 1.8) * 0.16);
    const index = skel.bones.length;
    let moved = 0;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      const z = pos.getZ(v);
      // Below the joint and not in front of the face: the fall of the hair.
      const below = (jy + reach * 0.15 - y) / reach;
      if (below <= 0 || z > jz + reach * 0.35) continue;
      const share = Math.min(0.95, below * below * (3 - 2 * Math.min(1, below)));
      let take = 0;
      let freeSlot = -1;
      let minSlot = 0;
      for (let c = 0; c < 4; c++) {
        const b = si.getComponent(v, c);
        const w = sw.getComponent(v, c);
        if ((b === headIdx || b === chestIdx) && w > 0) {
          const t = w * share;
          sw.setComponent(v, c, w - t);
          take += t;
        }
        if (w === 0 && freeSlot < 0) freeSlot = c;
        if (sw.getComponent(v, c) < sw.getComponent(v, minSlot)) minSlot = c;
      }
      if (take <= 0) continue;
      const slot = freeSlot >= 0 ? freeSlot : minSlot;
      const prior = freeSlot >= 0 ? 0 : sw.getComponent(v, slot);
      si.setComponent(v, slot, index);
      sw.setComponent(v, slot, take);
      // Whatever a full slot held is folded back onto the head.
      if (prior > 0) {
        for (let c = 0; c < 4; c++) {
          if (c !== slot && si.getComponent(v, c) === headIdx) {
            sw.setComponent(v, c, sw.getComponent(v, c) + prior);
            break;
          }
        }
      }
      moved++;
    }
    if (!moved) return false;
    si.needsUpdate = true;
    sw.needsUpdate = true;
    // The new bone sits on the head joint with no turn, so it binds exactly
    // where the head did.
    const bonesNew = skel.bones.concat([bone]);
    const inverses = skel.boneInverses.map((m) => m.clone()).concat([skel.boneInverses[headIdx].clone()]);
    mesh.bind(new THREE.Skeleton(bonesNew, inverses), mesh.bindMatrix);
    return true;
  }

  /** The head's world transform, from the bones' current local poses. */
  private headWorld(out: THREE.Matrix4): THREE.Matrix4 {
    this.model.updateWorldMatrix(true, false);
    out.copy(this.model.matrixWorld);
    for (const n of CHAIN) {
      const b = this.bones[n];
      if (!b) continue;
      _m2.compose(b.position, b.quaternion, b.scale);
      out.multiply(_m2);
    }
    return out;
  }

  /** Call after the pose has been written to the bones. */
  update(dt: number): void {
    if (dt <= 1e-5) return;
    this.headWorld(_m);
    _m.decompose(_p, _q, _s);
    const scale = Math.max(1e-3, _s.x);
    // Head velocity and acceleration in the world, then in the head's frame.
    const vel = _a.copy(_p).sub(this.lastPos).divideScalar(dt);
    if (this.has < 2 || vel.length() > 20) {
      this.lastPos.copy(_p);
      this.lastVel.set(0, 0, 0);
      this.has++;
      return;
    }
    const acc = _g.copy(vel).sub(this.lastVel).divideScalar(dt);
    this.lastPos.copy(_p);
    this.lastVel.copy(vel);
    const inv = _q.invert();
    const accL = acc.applyQuaternion(inv).divideScalar(scale);
    const velL = _vl.copy(vel).applyQuaternion(inv).divideScalar(scale);
    // Which way is down, seen from the head: hair keeps hanging when it tilts.
    const down = _dn.set(0, -1, 0).applyQuaternion(inv);

    for (const s of this.swings) {
      // Rest: hang straight down whatever the head does; running streams it back.
      const tx = Math.atan2(-down.z, -down.y) + Math.max(-0.5, Math.min(0.5, velL.z * 0.06));
      const tz = Math.atan2(down.x, -down.y) - Math.max(-0.3, Math.min(0.3, velL.x * 0.05));
      const n = Math.max(1, Math.ceil(dt * 120));
      const h = dt / n;
      const c = 2 * Math.sqrt(s.k) * s.damp;
      for (let i = 0; i < n; i++) {
        // The head accelerating forward leaves the hair behind (+x is back).
        s.vx += ((tx - s.ax) * s.k - s.vx * c + accL.z * 0.9) * h;
        s.vz += ((tz - s.az) * s.k - s.vz * c - accL.x * 0.9) * h;
        s.ax += s.vx * h;
        s.az += s.vz * h;
      }
      if (Math.abs(s.ax) > s.limit) {
        s.ax = Math.sign(s.ax) * s.limit;
        s.vx *= -0.2;
      }
      if (Math.abs(s.az) > s.limit) {
        s.az = Math.sign(s.az) * s.limit;
        s.vz *= -0.2;
      }
      s.bone.quaternion.setFromEuler(_e.set(s.ax, 0, s.az, 'XYZ'));
    }
  }
}

/**
 * Loose gear worn on the body: a quiver on the back swings from its strap
 * when the body accelerates, turns or stops, and settles. Equipment comes and
 * goes, so the quiver is looked up every frame (it is the off-hand item
 * socketed on the chest) and its socket pose is taken as the rest it swings
 * about.
 */
export class GearSway {
  private mesh: THREE.Object3D | null = null;
  private readonly baseQ = new THREE.Quaternion();
  private readonly baseP = new THREE.Vector3();
  private ax = 0;
  private az = 0;
  private vx = 0;
  private vz = 0;
  private lastPos = new THREE.Vector3();
  private lastVel = new THREE.Vector3();
  private has = 0;

  private constructor(
    private readonly bones: Record<string, THREE.Bone>,
    private readonly model: THREE.Object3D,
  ) {}

  static attach(bones: Record<string, THREE.Bone>): GearSway | null {
    const model = bones.root?.parent;
    if (!bones.chest || !model) return null;
    return new GearSway(bones, model);
  }

  private find(): THREE.Object3D | null {
    for (const c of this.bones.chest.children) if (c.userData?.socketSlot === 'offHand') return c;
    return null;
  }

  update(dt: number): void {
    if (dt <= 1e-5) return;
    const mesh = this.find();
    if (mesh !== this.mesh) {
      this.mesh = mesh;
      if (mesh) {
        this.baseQ.copy(mesh.quaternion);
        this.baseP.copy(mesh.position);
      }
      this.ax = this.az = this.vx = this.vz = 0;
      this.has = 0;
    }
    if (!mesh) return;
    // The chest's world transform from the current pose.
    this.model.updateWorldMatrix(true, false);
    _m.copy(this.model.matrixWorld);
    for (const n of ['root', 'hips', 'spine', 'chest']) {
      const b = this.bones[n];
      if (!b) continue;
      _m2.compose(b.position, b.quaternion, b.scale);
      _m.multiply(_m2);
    }
    _m.decompose(_p, _q, _s);
    const vel = _a.copy(_p).sub(this.lastPos).divideScalar(dt);
    if (this.has < 2 || vel.length() > 20) {
      this.lastPos.copy(_p);
      this.lastVel.set(0, 0, 0);
      this.has++;
      return;
    }
    const acc = _g.copy(vel).sub(this.lastVel).divideScalar(dt);
    this.lastPos.copy(_p);
    this.lastVel.copy(vel);
    const accL = acc.applyQuaternion(_q.invert()).divideScalar(Math.max(1e-3, _s.x));
    const k = 120;
    const c = 2 * Math.sqrt(k) * 0.3;
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vx += (-this.ax * k - this.vx * c + accL.z * 0.6) * h;
      this.vz += (-this.az * k - this.vz * c - accL.x * 0.6) * h;
      this.ax += this.vx * h;
      this.az += this.vz * h;
    }
    this.ax = Math.max(-0.35, Math.min(0.35, this.ax));
    this.az = Math.max(-0.35, Math.min(0.35, this.az));
    // Swing about the strap near the top, in the chest's frame.
    _sq.setFromEuler(_e.set(this.ax, 0, this.az, 'XYZ'));
    mesh.quaternion.copy(_sq).multiply(this.baseQ);
    _top.copy(STRAP).applyQuaternion(this.baseQ);
    _top2.copy(STRAP).applyQuaternion(mesh.quaternion);
    mesh.position.copy(this.baseP).add(_top).sub(_top2);
  }
}

const STRAP = new THREE.Vector3(0, 0.34, 0);
const _sq = new THREE.Quaternion();
const _top = new THREE.Vector3();
const _top2 = new THREE.Vector3();

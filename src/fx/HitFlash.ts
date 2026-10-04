/**
 * SLAY — the white-hot frame on a struck body.
 *
 * Every action game that feels good does this: for two or three frames after a
 * blow lands, the thing that was hit renders as a flat, bright silhouette, then
 * snaps back. It is the cheapest possible way to say "that connected", and it
 * reads even when the target is half a screen away under forty particles.
 *
 * Monster materials are shared prototypes (one material for every skeleton in
 * the level), so tinting them would flash the whole room. Instead the struck
 * meshes have their material *swapped* for a pooled flat material for the
 * length of the flash, then handed back. Swapping is a pointer write; the
 * flash materials are all one type with one program, so no shader ever
 * compiles mid-fight.
 *
 * Restoration is defensive: a mesh whose material was changed by someone else
 * while it was flashing keeps the new material. Nothing here can leave a
 * monster permanently white.
 */

import * as THREE from 'three';

interface FlashSlot {
  root: THREE.Object3D;
  meshes: THREE.Mesh[];
  originals: Array<THREE.Material | THREE.Material[]>;
  mat: THREE.MeshBasicMaterial;
  left: number;
  total: number;
  /** Peak colour, linear, may exceed 1 so bloom catches it. */
  peak: THREE.Color;
  tint: THREE.Color;
  strength: number;
}

/** Flashing more bodies than this at once costs more than it shows. */
const MAX_ACTIVE = 24;

const _c = new THREE.Color();

/** True for a material the flash should leave alone: glows, auras, decals. */
function skipMaterial(m: THREE.Material): boolean {
  if (m.transparent && m.opacity < 0.95) return true;
  if (m.blending === THREE.AdditiveBlending) return true;
  if (m.depthWrite === false) return true;
  return false;
}

export class HitFlash {
  private active = new Map<THREE.Object3D, FlashSlot>();
  private meshCache = new WeakMap<THREE.Object3D, THREE.Mesh[]>();
  private pool: THREE.MeshBasicMaterial[] = [];

  /** Bodies flashing right now, for budget checks and debug readouts. */
  get count(): number {
    return this.active.size;
  }

  /**
   * Flashes everything solid under `root`.
   *
   * `strength` 0..1 scales how far the colour is pushed past white; a crit is
   * 1, a light hit about 0.55. `color` tints the flash toward the element so a
   * frost hit flashes ice-white and a fire hit flashes amber.
   */
  flash(root: THREE.Object3D, color: number, strength = 0.6, duration = 0.08): void {
    const existing = this.active.get(root);
    if (existing) {
      // Re-hit while flashing: restart and keep the brighter of the two.
      existing.left = Math.max(existing.left, duration);
      existing.total = Math.max(existing.total, duration);
      if (strength >= existing.strength) this.setPeak(existing, color, strength);
      return;
    }
    if (this.active.size >= MAX_ACTIVE) return;

    const meshes = this.meshesOf(root);
    if (meshes.length === 0) return;

    const mat = this.pool.pop() ?? new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    const slot: FlashSlot = {
      root,
      meshes,
      originals: new Array(meshes.length),
      mat,
      left: duration,
      total: duration,
      peak: new THREE.Color(),
      tint: new THREE.Color(),
      strength,
    };
    this.setPeak(slot, color, strength);

    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i]!;
      const orig = m.material;
      slot.originals[i] = orig;
      m.material = Array.isArray(orig) ? orig.map(() => mat) : mat;
    }
    mat.color.copy(slot.peak);
    this.active.set(root, slot);
  }

  private setPeak(slot: FlashSlot, color: number, strength: number): void {
    // Mostly white with a breath of the element, pushed over 1.0 so the bloom
    // pass catches the brightest frame.
    _c.setHex(color);
    slot.tint.copy(_c);
    slot.strength = strength;
    const push = 1.2 + strength * 1.6;
    slot.peak.setRGB(1, 1, 1).lerp(_c, 0.28).multiplyScalar(push);
  }

  /** Solid meshes under a root, cached per root for the life of the body. */
  private meshesOf(root: THREE.Object3D): THREE.Mesh[] {
    const hit = this.meshCache.get(root);
    if (hit) return hit;
    const out: THREE.Mesh[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material;
      if (!mat) return;
      const list = Array.isArray(mat) ? mat : [mat];
      if (list.length === 0 || list.some(skipMaterial)) return;
      out.push(mesh);
    });
    this.meshCache.set(root, out);
    return out;
  }

  update(dt: number): void {
    if (this.active.size === 0) return;
    for (const slot of this.active.values()) {
      slot.left -= dt;
      if (slot.left <= 0) {
        this.restore(slot);
        continue;
      }
      // Hold the peak for the first third, then cool toward the element's own
      // colour at half brightness: a snap and a short afterglow.
      const t = 1 - slot.left / Math.max(1e-4, slot.total);
      if (t < 0.34) slot.mat.color.copy(slot.peak);
      else {
        const k = (t - 0.34) / 0.66;
        _c.copy(slot.tint).multiplyScalar(0.55);
        slot.mat.color.copy(slot.peak).lerp(_c, k);
      }
    }
  }

  /** Ends any flash on this root immediately. Safe to call on anything. */
  release(root: THREE.Object3D): void {
    const slot = this.active.get(root);
    if (slot) this.restore(slot);
  }

  private restore(slot: FlashSlot): void {
    for (let i = 0; i < slot.meshes.length; i++) {
      const m = slot.meshes[i]!;
      const cur = m.material;
      const ours = Array.isArray(cur) ? cur.every((x) => x === slot.mat) : cur === slot.mat;
      // Something else replaced the material mid-flash: theirs wins.
      if (ours) m.material = slot.originals[i]!;
    }
    this.active.delete(slot.root);
    if (this.pool.length < MAX_ACTIVE) this.pool.push(slot.mat);
    else slot.mat.dispose();
  }

  /** Restores every flashing body. Call before a scene tears its meshes down. */
  clear(): void {
    for (const slot of Array.from(this.active.values())) this.restore(slot);
  }

  dispose(): void {
    this.clear();
    for (const m of this.pool) m.dispose();
    this.pool.length = 0;
  }
}

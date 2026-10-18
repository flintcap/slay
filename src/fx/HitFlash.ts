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
 * meshes have their material *swapped* for one flat material for the length
 * of the flash, then handed back. Swapping is a pointer write, and no shader
 * ever compiles mid-fight.
 *
 * There is one flash material, not one per flash: each body's colour rides on
 * the mesh (`userData.slFlash`) and the material reads it per draw. The
 * renderer keeps a draw record (buffers and bind groups on the GPU) for every
 * pairing of mesh and material it has drawn, so a pool of materials handed out
 * in turn made new pairings, and new GPU objects, hit after hit.
 *
 * Restoration is defensive: a mesh whose material was changed by someone else
 * while it was flashing keeps the new material. Nothing here can leave a
 * monster permanently white.
 */

import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

interface FlashSlot {
  root: THREE.Object3D;
  meshes: THREE.Mesh[];
  originals: Array<THREE.Material | THREE.Material[]>;
  /** The colour drawn this frame, read off every mesh of the body. */
  color: THREE.Color;
  left: number;
  total: number;
  /** Peak colour, linear, may exceed 1 so bloom catches it. */
  peak: THREE.Color;
  tint: THREE.Color;
  strength: number;
  /** A death look: cool to `end` and hold it instead of handing back. */
  hold: boolean;
  end: THREE.Color;
  /** Seconds into a death look when the body is hidden (Infinity: never). */
  vanishAt: number;
  hidden: boolean;
}

/** Flashing more bodies than this at once costs more than it shows. */
const MAX_ACTIVE = 24;
/** Death looks held at once: they last a second, so they leave room for hits. */
const MAX_HOLDS = 12;

const _c = new THREE.Color();

/** What each mesh wore before the flash took it, while the flash has it. */
const underFlash = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();

/**
 * A mesh's own material, even mid-flash. Anything that copies a body (the
 * corpse left on the floor) reads this: copying the flash material instead
 * left elemental kills glowing white, or invisible, for good.
 */
export function ownMaterial(mesh: THREE.Mesh): THREE.Material | THREE.Material[] {
  return underFlash.get(mesh) ?? mesh.material;
}

/** Bodies whose death look ends with them gone (shattered, unmade). */
const vanishing = new WeakSet<THREE.Object3D>();

/** True when this body's death look takes it away: it leaves no corpse. */
export function bodyVanishes(root: THREE.Object3D): boolean {
  return vanishing.has(root);
}
const NO_MESHES: THREE.Mesh[] = [];
const WHITE = new THREE.Color(1, 1, 1);

/** The flat flash material: each mesh's own `userData.slFlash` colour. */
function flashMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ fog: true });
  m.name = 'hitFlash';
  m.colorNode = uniform(new THREE.Color(1, 1, 1)).onObjectUpdate(({ object }) => (object?.userData.slFlash as THREE.Color | undefined) ?? WHITE);
  return m;
}

/** True for a material the flash should leave alone: glows, auras, decals. */
function skipMaterial(m: THREE.Material): boolean {
  if (m.transparent && m.opacity < 0.95) return true;
  if (m.blending === THREE.AdditiveBlending) return true;
  if (m.depthWrite === false) return true;
  return false;
}

/** What a vanished body wears: three.js draws nothing with an invisible material, shadows included. */
function goneMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.name = 'hitFlashGone';
  m.visible = false;
  return m;
}

export class HitFlash {
  private active = new Map<THREE.Object3D, FlashSlot>();
  private meshCache = new WeakMap<THREE.Object3D, THREE.Mesh[]>();
  private readonly mat = flashMaterial();
  private readonly gone = goneMaterial();
  /** Finished slots, reused so a hit allocates nothing. */
  private spare: FlashSlot[] = [];
  private holds = 0;

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
      // A body already wearing its death look keeps it.
      if (existing.hold) return;
      // Re-hit while flashing: restart and keep the brighter of the two.
      existing.left = Math.max(existing.left, duration);
      existing.total = Math.max(existing.total, duration);
      if (strength >= existing.strength) this.setPeak(existing, color, strength);
      return;
    }
    if (this.active.size >= MAX_ACTIVE) return;

    const meshes = this.meshesOf(root);
    if (meshes.length === 0) return;

    const mat = this.mat;
    const slot: FlashSlot = this.spare.pop() ?? {
      root,
      meshes,
      originals: [],
      color: new THREE.Color(),
      left: 0,
      total: 0,
      peak: new THREE.Color(),
      tint: new THREE.Color(),
      strength: 0,
      hold: false,
      end: new THREE.Color(),
      vanishAt: Infinity,
      hidden: false,
    };
    slot.root = root;
    slot.meshes = meshes;
    slot.originals.length = meshes.length;
    slot.left = duration;
    slot.total = duration;
    slot.hold = false;
    slot.vanishAt = Infinity;
    slot.hidden = false;
    this.setPeak(slot, color, strength);

    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i]!;
      const orig = m.material;
      slot.originals[i] = orig;
      underFlash.set(m, orig);
      m.material = Array.isArray(orig) ? orig.map(() => mat) : mat;
      m.userData.slFlash = slot.color;
    }
    slot.color.copy(slot.peak);
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

  /**
   * A body's death look: a flash of `peak` that cools to `end` and holds it
   * for `duration` seconds (charred black, frosted, rotted green, shadow), and
   * from `vanishAt` seconds on the body is not drawn at all (shattered,
   * unmade). The body is handed back untouched at the end, or by `release`
   * and `clear`. Returns false when the budget is full and nothing changed.
   */
  deathLook(root: THREE.Object3D, peak: number, end: number, duration: number, vanishAt = Infinity): boolean {
    let slot = this.active.get(root);
    if (slot?.hold) return true;
    if (this.holds >= MAX_HOLDS) return false;
    if (!slot) {
      this.flash(root, peak, 1, duration);
      slot = this.active.get(root);
      if (!slot) return false;
    }
    this.setPeak(slot, peak, 1);
    slot.hold = true;
    slot.end.setHex(end);
    slot.left = duration;
    slot.total = duration;
    slot.vanishAt = vanishAt;
    if (Number.isFinite(vanishAt)) vanishing.add(root);
    this.holds++;
    return true;
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

  /**
   * Stand-ins wearing the flash material, one per kind of mesh under `roots`
   * (plain, skinned, instanced, morphed), for a scene's warm-up.
   *
   * The flash is one material, but three.js builds a program per kind of mesh
   * it lands on: a skinned body and a rigid shield each need their own. Each
   * was linked on the first hit that touched it, a stall mid-swing on a real
   * GPU. The stand-ins share the meshes' geometry and skeletons and own
   * nothing; dropping them is enough.
   */
  standIns(roots: Iterable<THREE.Object3D>): THREE.Object3D[] {
    const mat = this.mat;
    const kinds = new Map<string, THREE.Object3D>();
    for (const root of roots) {
      for (const m of this.meshesOf(root)) {
        const g = m.geometry;
        const skinned = (m as THREE.SkinnedMesh).isSkinnedMesh === true;
        const inst = (m as THREE.InstancedMesh).isInstancedMesh === true;
        const tinted = inst && (m as THREE.InstancedMesh).instanceColor !== null;
        // Everything about the body three.js keys the flash's shader on
        // (RenderObject.getMaterialCacheKey): every attribute and its size,
        // the morph targets themselves, an index, the bone count and whether
        // it takes shadows. A stand-in that differs in any of these warmed a
        // shader the real body never used, and the first blow built its own.
        const attrs = Object.keys(g.attributes).sort().map((n) => `${n}${g.attributes[n]!.itemSize}`).join(',');
        const morph = Object.entries(g.morphAttributes as Record<string, THREE.BufferAttribute[]>)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([n, list]) => `${n}:${list.map((a) => a.id).join('.')}`)
          .join(',');
        const bones = (m as THREE.SkinnedMesh).skeleton?.bones.length ?? 0;
        const key = `${skinned}|${inst}|${tinted}|${attrs}|${morph}|${g.index ? 1 : 0}|${bones}|${m.receiveShadow}`;
        if (kinds.has(key)) continue;
        let s: THREE.Mesh;
        if (skinned) {
          const sm = m as THREE.SkinnedMesh;
          const k = new THREE.SkinnedMesh(g, mat);
          // With a bind matrix given, bind() leaves the shared skeleton alone.
          k.bind(sm.skeleton, sm.bindMatrix);
          s = k;
        } else if (inst) {
          const im = m as THREE.InstancedMesh;
          const k = new THREE.InstancedMesh(g, mat, 1);
          // The real mesh's buffers: the stand-in draws its first instance.
          k.instanceMatrix = im.instanceMatrix;
          k.instanceColor = im.instanceColor;
          s = k;
        } else {
          s = new THREE.Mesh(g, mat);
        }
        s.frustumCulled = false;
        s.castShadow = false;
        s.receiveShadow = m.receiveShadow;
        kinds.set(key, s);
      }
    }
    return [...kinds.values()];
  }

  update(dt: number): void {
    if (this.active.size === 0) return;
    for (const slot of this.active.values()) {
      slot.left -= dt;
      if (slot.left <= 0) {
        this.restore(slot);
        continue;
      }
      if (slot.hold) {
        // A death look: the flash for a beat, a quick cool to the end colour,
        // then held while the body falls.
        const age = slot.total - slot.left;
        if (age < 0.08) slot.color.copy(slot.peak);
        else if (age < 0.38) slot.color.copy(slot.peak).lerp(slot.end, (age - 0.08) / 0.3);
        else slot.color.copy(slot.end);
        if (!slot.hidden && age >= slot.vanishAt) this.hide(slot);
        continue;
      }
      // Hold the peak for the first third, then cool toward the element's own
      // colour at half brightness: a snap and a short afterglow.
      const t = 1 - slot.left / Math.max(1e-4, slot.total);
      if (t < 0.34) slot.color.copy(slot.peak);
      else {
        const k = (t - 0.34) / 0.66;
        _c.copy(slot.tint).multiplyScalar(0.55);
        slot.color.copy(slot.peak).lerp(_c, k);
      }
    }
  }

  /** Ends any flash on this root immediately. Safe to call on anything. */
  release(root: THREE.Object3D): void {
    const slot = this.active.get(root);
    if (slot) this.restore(slot);
  }

  /** Stops drawing a body: its meshes still wearing the flash now wear nothing. */
  private hide(slot: FlashSlot): void {
    slot.hidden = true;
    const gone = this.gone;
    for (const m of slot.meshes) {
      const cur = m.material;
      if (Array.isArray(cur)) {
        if (cur.every((x) => x === this.mat)) m.material = cur.map(() => gone);
      } else if (cur === this.mat) m.material = gone;
    }
  }

  private isOurs(m: THREE.Material): boolean {
    return m === this.mat || m === this.gone;
  }

  private restore(slot: FlashSlot): void {
    for (let i = 0; i < slot.meshes.length; i++) {
      const m = slot.meshes[i]!;
      const cur = m.material;
      const ours = Array.isArray(cur) ? cur.every((x) => this.isOurs(x)) : this.isOurs(cur);
      // Something else replaced the material mid-flash: theirs wins.
      if (ours) m.material = slot.originals[i]!;
      underFlash.delete(m);
    }
    this.active.delete(slot.root);
    vanishing.delete(slot.root);
    if (slot.hold) this.holds = Math.max(0, this.holds - 1);
    slot.hold = false;
    slot.originals.fill(null as unknown as THREE.Material);
    slot.meshes = NO_MESHES;
    if (this.spare.length < MAX_ACTIVE) this.spare.push(slot);
  }

  /** Restores every flashing body. Call before a scene tears its meshes down. */
  clear(): void {
    for (const slot of Array.from(this.active.values())) this.restore(slot);
  }

  dispose(): void {
    this.clear();
    this.mat.dispose();
    this.gone.dispose();
  }
}

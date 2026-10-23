/**
 * SLAY — one draw per pack.
 *
 * A pack is several spawns of one look: the same part geometry under the
 * same material, each part on its own monster's skeleton. Drawn one by one
 * that is a draw per part per monster, in the frame and in every shadow
 * map. A pack draw is one skinned mesh holding a copy of the part per slot,
 * skinned onto one skeleton made of every member's bones (slot s reads bones
 * s*B..s*B+B-1), so the whole pack is one draw. The bending stays on the GPU
 * as it was; the members' own parts are hidden while they ride in it.
 *
 * Members keep their slots while they stay, so what a slot read last frame
 * is its own pose (the image's motion vectors read it). An empty slot reads
 * a bone squashed to nothing, which draws nothing.
 *
 * A part leaves the moment it would look different: a hit flash, a heated
 * or see-through material (it wears another material), the other level of
 * detail (another geometry), the cursor's outline, out of view, dying,
 * hidden. It only joins again
 * once it has stayed plain a moment, so a fight's blows do not move a body in
 * and out of its pack draw on every hit.
 */
import * as THREE from 'three';
import { keepLastPose } from '../../core/SkinMotion';
import { hookSeen } from '../../core/ThreeHooks';

/**
 * Bone slots in every pack skeleton. One size for all, so every pack draw
 * of a material shares one shader (three.js keys a skinned program on its
 * bone count); 768 matrices is 48 KB, inside one uniform buffer.
 */
export const PACK_BONES = 768;
/** Most members in one pack draw. */
const MAX_SLOTS = 16;
/** Seconds a part must stay plain before it joins (or joins again). */
const SETTLE = 0.4;

/** What an empty slot reads: squashed to a point, so its copy draws nothing. */
const EMPTY = new THREE.Bone();
EMPTY.matrixAutoUpdate = false;
EMPTY.matrixWorldAutoUpdate = false;
EMPTY.matrixWorld.makeScale(0, 0, 0);
const IDENTITY = new THREE.Matrix4();
const OFFSET = new THREE.Matrix4();
/** Floats in one pack skeleton's bone buffer. */
const PACK_FLOATS = PACK_BONES * 16;

/**
 * A pack's skeleton. Most of its slots sit empty, so it works out only the
 * bones up to the last slot seated (`reach`); the rest are never drawn.
 */
class PackSkeleton extends THREE.Skeleton {
  reach = 0;
  /** The pose before the last update, for the motion target (`SkinMotion.ts`). */
  declare previousBoneMatrices?: Float32Array;

  override update(): void {
    const m = this.boneMatrices!;
    keepLastPose(this, this.reach * 16);
    for (let i = 0; i < this.reach; i++) OFFSET.multiplyMatrices(this.bones[i]!.matrixWorld, this.boneInverses[i]!).toArray(m, i * 16);
  }
}

/** Each pack skeleton by its bone buffer, and the widest reach of any. */
const reachOf = new WeakMap<ArrayLike<number>, PackSkeleton>();
let widest = 0;

/*
 * three.js sends a bone buffer whole for every draw in every pass: 48 KB a
 * pack, twice over with last frame's copy. Its update ranges let a buffer
 * send part of itself, so a pack's buffers send only the bones in reach.
 * Last frame's copy is the pack's own too (`SkinMotion.ts`); any other
 * buffer of a pack's size sends as far as the widest pack.
 */
{
  type Ranged = { value: unknown; _ranges: { start: number; count: number }[]; _packRange?: { start: number; count: number }[] };
  Object.defineProperty(THREE.BufferNode.prototype, 'updateRanges', {
    configurable: true,
    get(this: Ranged) {
      const v = this.value as ArrayLike<number> | null;
      if (v?.length !== PACK_FLOATS || this._ranges.length > 0) return this._ranges;
      const count = (reachOf.get(v)?.reach ?? widest) * 16;
      // Refilled on every read: three.js empties the list after each send.
      const r = (this._packRange ??= []);
      r.length = 0;
      r.push({ start: 0, count: Math.max(16, count) });
      return r;
    },
    set(this: Ranged, list: { start: number; count: number }[]) {
      this._ranges = list;
    },
  });
  // A buffer node made now must have set its list through the setter above.
  const probe = new THREE.BufferNode(new Float32Array(16), 'mat4', 1) as unknown as Ranged;
  const ranged = hookSeen('BufferNode.updateRanges', Array.isArray(probe._ranges));
  // The binding side is not exported; the checker reads it in three's source.
  hookSeen('NodeUniformBuffer.updateRanges', ranged);
}

interface Pack {
  key: string;
  source: THREE.BufferGeometry;
  /** Bones per member. */
  bones: number;
  capacity: number;
  /** Slots the merged geometry holds (grows to `capacity`). */
  copies: number;
  slots: Array<THREE.SkinnedMesh | null>;
  members: number;
  mesh: THREE.SkinnedMesh;
  skeleton: PackSkeleton;
}

/** `src` repeated `copies` times, each copy's skin indices moved to its slot's bones. */
function packGeometry(src: THREE.BufferGeometry, copies: number, bones: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const n = src.getAttribute('position').count;
  for (const [name, a] of Object.entries(src.attributes)) {
    const ba = a as THREE.BufferAttribute;
    const size = ba.itemSize;
    const from = ba.array;
    const arr = new (from.constructor as new (n: number) => THREE.TypedArray)(n * size * copies);
    for (let c = 0; c < copies; c++) arr.set(from, c * n * size);
    if (name === 'skinIndex') for (let c = 1; c < copies; c++) for (let i = c * n * size; i < (c + 1) * n * size; i++) arr[i]! += c * bones;
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, ba.normalized));
  }
  const ix = src.index!.array;
  const index = n * copies > 65535 ? new Uint32Array(ix.length * copies) : new Uint16Array(ix.length * copies);
  for (let c = 0; c < copies; c++) for (let i = 0; i < ix.length; i++) index[c * ix.length + i] = ix[i]! + c * n;
  out.setIndex(new THREE.BufferAttribute(index, 1));
  // Drawn uncut (the members are in view); the sphere is only for sorting.
  out.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return out;
}

function slotsFor(bones: number): number {
  return Math.min(MAX_SLOTS, Math.floor(PACK_BONES / bones));
}

/**
 * The key a part packs under: geometry, material, shadow flags and bone
 * count. Null when it cannot ride in a pack draw.
 */
/** A part's last key and what it was worked out from (`keyOf`). */
interface KeyMemo {
  mat: unknown;
  geo: unknown;
  sk: unknown;
  flags: number;
  key: string | null;
}
const keyMemo = new WeakMap<THREE.SkinnedMesh, KeyMemo>();

/**
 * Which pack draw a part can share, or null. Asked of every part in view
 * every frame, so the answer is kept until the part's material, shape,
 * skeleton or flags change: building it afresh was a string a part a frame.
 */
function keyOf(sm: THREE.SkinnedMesh): string | null {
  const mat = sm.material as THREE.Material | THREE.Material[];
  const flags =
    (sm.castShadow ? 1 : 0) |
    (sm.receiveShadow ? 2 : 0) |
    (sm.userData.slOutline ? 4 : 0) |
    (sm.userData.shadowOnly ? 8 : 0) |
    (sm.children.length > 0 ? 16 : 0) |
    (sm.bindMode === 'attached' ? 32 : 0) |
    (!Array.isArray(mat) && mat.transparent ? 64 : 0) |
    (!Array.isArray(mat) && mat.userData.shared ? 128 : 0);
  const memo = keyMemo.get(sm);
  if (memo && memo.mat === mat && memo.geo === sm.geometry && memo.sk === sm.skeleton && memo.flags === flags) return memo.key;
  const key = workKey(sm);
  keyMemo.set(sm, { mat, geo: sm.geometry, sk: sm.skeleton, flags, key });
  return key;
}

function workKey(sm: THREE.SkinnedMesh): string | null {
  const mat = sm.material as THREE.Material | THREE.Material[];
  if (Array.isArray(mat) || !mat.userData.shared || mat.transparent) return null;
  if (sm.userData.shadowOnly && !sm.castShadow) return null;
  // The outline under the cursor is read off the body's own meshes (`Renderer.setOutline`).
  if (sm.userData.slOutline) return null;
  const sk = sm.skeleton;
  if (!sk || sm.bindMode !== 'attached' || slotsFor(sk.bones.length) < 2 || !sm.geometry.index) return null;
  // Hiding the part would hide anything hung under it too.
  if (sm.children.length > 0 || Object.keys(sm.geometry.morphAttributes).length > 0) return null;
  return `${sm.geometry.id}|${mat.uuid}|${sm.castShadow ? 1 : 0}${sm.receiveShadow ? 1 : 0}|${sk.bones.length}`;
}

/** A root that is shown all the way up to its scene. */
function shown(root: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = root;
  for (; p; p = p.parent) {
    if (!p.visible) return false;
    if ((p as THREE.Scene).isScene) return true;
  }
  return false;
}

const emptyWant = (w: { n: number }): void => {
  w.n = 0;
};

export class PackDraws {
  private packs = new Map<string, Pack>();
  /** Each part's pack, while it rides in one (its own mesh hidden). */
  private riding = new Map<THREE.SkinnedMesh, Pack>();
  /**
   * How long each part has looked the way it does now, under which key, and
   * the key it is listed under in `want` this frame (null when not listed).
   */
  private plain = new Map<THREE.SkinnedMesh, { key: string; t: number; stamp: number; want: string | null }>();
  private parts = new WeakMap<THREE.Object3D, THREE.SkinnedMesh[]>();
  /**
   * Parts wanting each pack this frame: the first `n` of `items`. Emptied by
   * zeroing `n`; `length = 0` threw the storage away to be grown again.
   */
  private want = new Map<string, { items: THREE.SkinnedMesh[]; n: number }>();
  private stamp = 0;

  constructor(private readonly parent: THREE.Object3D) {}

  /**
   * Once a frame, before drawing: `roots` are the spawned bodies that may
   * ride in a pack draw (alive, in view, not a boss).
   */
  update(roots: readonly THREE.Object3D[], dt: number): void {
    const stamp = ++this.stamp;
    const want = this.want;
    want.forEach(emptyWant);
    // Index loops: a for-of made a small throwaway object a pass until the
    // browser fully optimized this, every part of every body every frame.
    for (let ri = 0; ri < roots.length; ri++) {
      const root = roots[ri]!;
      if (!shown(root)) continue;
      const parts = this.partsOf(root);
      for (let pi = 0; pi < parts.length; pi++) {
        const sm = parts[pi]!;
        const pack = this.riding.get(sm);
        // Hidden by something else (not by riding): leave it be.
        if (!pack && !sm.visible) continue;
        const key = keyOf(sm);
        if (!key) continue;
        let p = this.plain.get(sm);
        if (!p) this.plain.set(sm, (p = { key, t: 0, stamp, want: null }));
        else if (p.key !== key || p.stamp !== stamp - 1) {
          p.key = key;
          p.t = 0;
        } else p.t += dt;
        p.stamp = stamp;
        p.want = null;
        if (pack?.key === key || p.t >= SETTLE) {
          let list = want.get(key);
          if (!list) want.set(key, (list = { items: [], n: 0 }));
          list.items[list.n++] = sm;
          p.want = key;
        }
      }
    }
    // Leavers first, so their slots are free for joiners.
    for (const pack of this.packs.values()) {
      for (let s = 0; s < pack.slots.length; s++) {
        const sm = pack.slots[s];
        if (sm && (this.plain.get(sm)?.want ?? null) !== pack.key) this.leave(pack, s);
      }
    }
    // forEach, not for-of over entries: no [key, value] pair made per entry.
    want.forEach((list, key) => {
      // Too few to share a draw: one already riding leaves below.
      if (list.n < 2) return;
      const pack = this.packs.get(key) ?? this.make(key, list.items[0]!);
      let changed = false;
      for (let li = 0; li < list.n; li++) {
        const sm = list.items[li]!;
        if (this.riding.get(sm) === pack) continue;
        const s = pack.slots.indexOf(null);
        if (s < 0) break;
        pack.slots[s] = sm;
        pack.members++;
        this.riding.set(sm, pack);
        sm.visible = false;
        changed = true;
      }
      if (pack.members < 2) {
        for (let s = 0; s < pack.slots.length; s++) if (pack.slots[s]) this.leave(pack, s);
        return;
      }
      if (changed) this.seat(pack);
    });
    for (const pack of this.packs.values()) {
      if (pack.members < 2) for (let s = 0; s < pack.slots.length; s++) if (pack.slots[s]) this.leave(pack, s);
      pack.mesh.visible = pack.members >= 2;
    }
    // Forget parts not seen this frame.
    this.plain.forEach((p, sm, plain) => {
      if (p.stamp !== stamp) plain.delete(sm);
    });
  }

  /** Gives every part back its own draw and frees the pack draws (between floors). */
  dispose(): void {
    for (const pack of this.packs.values()) {
      for (let s = 0; s < pack.slots.length; s++) if (pack.slots[s]) this.leave(pack, s);
      pack.mesh.removeFromParent();
      pack.mesh.geometry.dispose();
      pack.skeleton.dispose();
    }
    this.packs.clear();
    this.widen();
    this.riding.clear();
    this.plain.clear();
    this.want.clear();
  }

  /** Pack draws on screen and the parts riding in them, for debug readouts. */
  get stats(): { draws: number; parts: number } {
    let draws = 0;
    for (const p of this.packs.values()) if (p.mesh.visible) draws++;
    return { draws, parts: this.riding.size };
  }

  private partsOf(root: THREE.Object3D): THREE.SkinnedMesh[] {
    let list = this.parts.get(root);
    if (!list) {
      const own = root.userData.monsterSkeleton as THREE.Skeleton | undefined;
      list = root.children.filter((o): o is THREE.SkinnedMesh => (o as THREE.SkinnedMesh).isSkinnedMesh === true && !!own && (o as THREE.SkinnedMesh).skeleton === own);
      this.parts.set(root, list);
    }
    return list;
  }

  private make(key: string, first: THREE.SkinnedMesh): Pack {
    const bones = first.skeleton.bones.length;
    const capacity = slotsFor(bones);
    const copies = Math.min(capacity, 4);
    const skeleton = new PackSkeleton(
      Array.from({ length: PACK_BONES }, () => EMPTY),
      Array.from({ length: PACK_BONES }, () => IDENTITY),
    );
    reachOf.set(skeleton.boneMatrices!, skeleton);
    // Its last pose (`SkinMotion.ts`) sends only the bones in reach too.
    skeleton.previousBoneMatrices = new Float32Array(skeleton.boneMatrices!);
    reachOf.set(skeleton.previousBoneMatrices, skeleton);
    const mesh = new THREE.SkinnedMesh(packGeometry(first.geometry, copies, bones), first.material);
    mesh.name = `pack:${first.name}`;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    if (first.userData.shadowOnly) mesh.userData.shadowOnly = true;
    mesh.frustumCulled = false;
    // Set, so three.js never works one out by skinning every copy on the CPU.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-1e4, -1e4, -1e4), new THREE.Vector3(1e4, 1e4, 1e4));
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    this.parent.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    const pack: Pack = { key, source: first.geometry, bones, capacity, copies, slots: Array.from({ length: capacity }, () => null), members: 0, mesh, skeleton };
    this.packs.set(key, pack);
    return pack;
  }

  private leave(pack: Pack, s: number): void {
    const sm = pack.slots[s]!;
    pack.slots[s] = null;
    pack.members--;
    this.riding.delete(sm);
    sm.visible = true;
    // Its own part draws again: start its settling over.
    this.plain.delete(sm);
    this.seat(pack);
  }

  /** Points each slot at its member's bones (or the empty bone), and draws up to the last one seated. */
  private seat(pack: Pack): void {
    const B = pack.bones;
    const bones = pack.skeleton.bones;
    const inv = pack.skeleton.boneInverses;
    let top = -1;
    for (let s = 0; s < pack.slots.length; s++) {
      const sm = pack.slots[s];
      if (sm) top = s;
      for (let b = 0; b < B; b++) {
        bones[s * B + b] = sm ? sm.skeleton.bones[b]! : EMPTY;
        inv[s * B + b] = sm ? sm.skeleton.boneInverses[b]! : IDENTITY;
      }
    }
    const need = top + 1;
    if (need > pack.copies) {
      pack.copies = Math.min(pack.capacity, Math.max(need, pack.copies * 2));
      pack.mesh.geometry.dispose();
      pack.mesh.geometry = packGeometry(pack.source, pack.copies, B);
    }
    pack.mesh.geometry.setDrawRange(0, Math.max(0, need) * pack.source.index!.count);
    pack.skeleton.reach = Math.max(0, need) * B;
    this.widen();
  }

  private widen(): void {
    widest = 0;
    for (const p of this.packs.values()) widest = Math.max(widest, p.skeleton.reach);
  }
}

let warmSkeleton: PackSkeleton | null = null;

/**
 * Stand-ins for a scene's warm-up: one pack-sized skinned mesh per kind of
 * part under `roots` (material, layout, shadow flags), so the pack shaders
 * are built with the floor, not when the first pack walks in. They share the
 * parts' geometry and one empty skeleton, and draw nothing.
 */
export function packStandIns(roots: Iterable<THREE.Object3D>): THREE.Object3D[] {
  if (!warmSkeleton) {
    warmSkeleton = new PackSkeleton(
      Array.from({ length: PACK_BONES }, () => EMPTY),
      Array.from({ length: PACK_BONES }, () => IDENTITY),
    );
    reachOf.set(warmSkeleton.boneMatrices!, warmSkeleton);
  }
  const kinds = new Map<string, THREE.Object3D>();
  for (const root of roots) {
    const own = root.userData.monsterSkeleton as THREE.Skeleton | undefined;
    for (const o of root.children) {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || !own || sm.skeleton !== own || !keyOf(sm)) continue;
      const mat = sm.material as THREE.Material;
      const g = sm.geometry;
      const attrs = Object.keys(g.attributes).sort().map((n) => `${n}${g.attributes[n]!.itemSize}`).join(',');
      const k = `${mat.uuid}|${attrs}|${sm.castShadow ? 1 : 0}${sm.receiveShadow ? 1 : 0}`;
      if (kinds.has(k)) continue;
      const m = new THREE.SkinnedMesh(g, mat);
      m.castShadow = sm.castShadow;
      m.receiveShadow = sm.receiveShadow;
      if (sm.userData.shadowOnly) m.userData.shadowOnly = true;
      m.frustumCulled = false;
      m.bind(warmSkeleton, new THREE.Matrix4());
      kinds.set(k, m);
    }
  }
  return [...kinds.values()];
}

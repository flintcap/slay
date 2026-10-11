/**
 * SLAY — building a creature from its look.
 *
 * A look (`Looks.ts`) names a rig, a sculpt, materials and a motion style.
 * The first time a look is asked for, its sculpt is baked (or read back from
 * the bake store) into at most three skinned meshes, one per material, over
 * one skeleton: the prototype. Every spawn after that clones the prototype's
 * bone tree and binds its own skeleton; geometry and materials are shared.
 *
 * Rank shows on the materials (a coloured rim light and a hotter glow), never
 * by hiding the body. Size per rank is the caller's scale.
 */
import * as THREE from 'three';
import { CREATURE_SOCKETS, type CreatureRig, type CreatureSocket } from './Rig';
import { CMATS, Sculpt, type CMat, type SculptQuality } from './Sculpt';
import { bakeSculpt, sculptKey } from './Bake';
import { bakedCached, releaseBakes } from './Store';
import { creatureMaterial, disposeCreatureMaterials, scaleBucket, type CreatureMatDef } from './Materials';
import type { CreatureInfo } from './Animator';
import { STYLE_DEFAULT, type MotionStyle } from './Motion';

/** How much detail a creature gets: triangles per material and field resolution. */
export type CreatureTier = 'small' | 'normal' | 'big' | 'boss';

export interface CreatureLook {
  /** Stable name for the prototype cache. */
  key: string;
  rig: () => CreatureRig;
  sculpt: (s: Sculpt) => void;
  mats: Partial<Record<CMat, CreatureMatDef>>;
  style: Partial<MotionStyle>;
  tier?: CreatureTier;
  /**
   * Whole-body size on top of the monster's own scale. Looks are sculpted at
   * a comfortable working size; this lands them at their real size once the
   * data's scale is applied (a dire rat is scale 0.5, so its look sets 2.2).
   */
  size?: number;
}

export interface CreatureModel {
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  skeleton: THREE.Skeleton | null;
}

/** 0 rank and file, 1 champion, 2 elite or rare, 3 boss. */
export function rankTier(rank: string | undefined): number {
  switch (rank) {
    case 'champion':
      return 1;
    case 'elite':
    case 'rare':
      return 2;
    case 'boss':
      return 3;
    default:
      return 0;
  }
}

/**
 * Rank rims: champions burn blue, elites violet, rares gold, bosses a deep
 * ember. A rim lights the silhouette's edge, so the rank reads at a glance
 * and the body underneath stays the body.
 */
const RANK_RIM: Array<{ rim: number; strength: number; glow: number }> = [
  { rim: 0x000000, strength: 0, glow: 1 },
  { rim: 0x3f7bff, strength: 0.55, glow: 1.25 },
  { rim: 0xb15cff, strength: 0.6, glow: 1.4 },
  // A boss's rim stays low: its silhouette and colours are its own, the ember only edges it.
  { rim: 0xff7a30, strength: 0.28, glow: 1.5 },
];

const TIERS: Record<CreatureTier, { cells: number; tris: Record<CMat, number> }> = {
  small: { cells: 52, tris: { skin: 1400, alt: 700, metal: 400 } },
  normal: { cells: 64, tris: { skin: 2400, alt: 1200, metal: 600 } },
  big: { cells: 80, tris: { skin: 3600, alt: 1700, metal: 900 } },
  boss: { cells: 110, tris: { skin: 7000, alt: 3200, metal: 1600 } },
};

function quality(rig: CreatureRig, tier: CreatureTier): SculptQuality {
  const t = TIERS[tier];
  const size = Math.max(rig.height, rig.length * 0.8);
  return { cell: Math.max(0.006, size / t.cells), tris: t.tris };
}

interface Prototype {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  info: CreatureInfo;
  meshes: Array<{ mat: CMat; geo: THREE.BufferGeometry }>;
  look: CreatureLook;
}

const prototypes = new Map<string, Prototype>();

/** Builds (or reads back) a look's prototype. */
function prototype(look: CreatureLook): Prototype {
  const hit = prototypes.get(look.key);
  if (hit) return hit;
  const rig = look.rig();
  const s = new Sculpt(rig);
  look.sculpt(s);
  const q = quality(rig, look.tier ?? 'normal');
  const mats = CMATS.filter((m) => s.fields[m].prims.length > 0 || s.parts.some((p) => p.mat === m));
  const key = sculptKey(s, q);
  let baked: Array<{ mat: CMat; geo: THREE.BufferGeometry }> = [];
  let geos = bakedCached(key, () => {
    baked = bakeSculpt(s, q);
    return baked.map((b) => b.geo);
  });
  let meshes: Array<{ mat: CMat; geo: THREE.BufferGeometry }>;
  if (baked.length) meshes = baked;
  else if (geos.length === mats.length) meshes = geos.map((geo, i) => ({ mat: mats[i]!, geo }));
  else {
    // A stored bake that does not line up with the sculpt: bake it fresh.
    const fresh = bakeSculpt(s, q);
    meshes = fresh;
    geos = fresh.map((b) => b.geo);
  }
  // Hard part geometry is only needed when baking.
  for (const p of s.parts) p.geo.dispose();

  const root = rig.root;
  root.updateMatrixWorld(true);
  const boneList = rig.order.map((n) => rig.bones[n]!);
  const skeleton = new THREE.Skeleton(boneList);
  const style: MotionStyle = { ...STYLE_DEFAULT, ...look.style };
  const info: CreatureInfo = {
    kind: rig.kind,
    joints: rig.joints,
    ends: rig.ends,
    legs: rig.legs,
    height: rig.height,
    length: rig.length,
    hipY: rig.hipY,
    style,
  };
  for (const m of meshes) {
    const def = look.mats[m.mat] ?? look.mats.skin!;
    const mesh = new THREE.SkinnedMesh(m.geo, creatureMaterial(def));
    mesh.name = `creature:${m.mat}`;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    // Poses reach past the bind box (lunges, rears, falls): cull on a generous sphere.
    if (!m.geo.boundingSphere) m.geo.computeBoundingSphere();
    const bs = m.geo.boundingSphere!;
    bs.radius = Math.max(bs.radius * 1.5, rig.height * 0.9, rig.length * 0.8);
    mesh.userData.mat = m.mat;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
  }
  const proto: Prototype = { root, skeleton, info, meshes, look };
  prototypes.set(look.key, proto);
  return proto;
}

export interface BuildOpts {
  rank?: string;
}

/**
 * A creature instance: its own bones and skeleton over the shared meshes.
 * `rng` is drawn exactly as the old builder drew it (two `next`, two
 * `range`), so seeded runs keep their rolls; the caller does the variant
 * bookkeeping draws.
 */
export function instanceCreature(look: CreatureLook, scale: number, opts: BuildOpts = {}): CreatureModel & { proto: Prototype } {
  const proto = prototype(look);
  const root = proto.root.clone(true) as THREE.Group;
  const bones: Record<string, THREE.Bone> = {};
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
  });
  const own = new THREE.Skeleton(
    proto.skeleton.bones.map((b) => bones[b.name]!),
    proto.skeleton.boneInverses,
  );
  const tier = rankTier(opts.rank);
  const rr = RANK_RIM[tier]!;
  const sz = scale * (look.size ?? 1);
  const bucket = scaleBucket(sz);
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    sm.bind(own, sm.bindMatrix);
    const matName = sm.userData.mat as CMat;
    const def = proto.look.mats[matName] ?? proto.look.mats.skin!;
    // Texel density follows the world size; rank adds its rim and a hotter glow.
    sm.material = creatureMaterial({
      ...def,
      scale: bucket,
      rim: tier ? rr.rim : def.rim,
      rimStrength: tier ? rr.strength : def.rimStrength,
      glowIntensity: (def.glowIntensity ?? 2.4) * rr.glow,
    });
  });
  root.userData.monsterSkeleton = own;
  root.userData.creature = proto.info;
  root.userData.creatureKey = proto.look.key;
  root.scale.setScalar(sz);
  return { root, bones, skeleton: own, proto };
}

/** A socket's object on a built creature (world position at hit and release frames). */
export function creatureSocket(root: THREE.Object3D, name: CreatureSocket): THREE.Object3D | null {
  return root.getObjectByName(`socket:${name}`) ?? null;
}

export { CREATURE_SOCKETS };

/** Frees one spawn: its skeleton's bone texture. Geometry and materials are shared. */
export function releaseCreature(root: THREE.Object3D): void {
  const skel = root.userData?.monsterSkeleton as THREE.Skeleton | undefined;
  if (skel) {
    skel.dispose();
    root.userData.monsterSkeleton = undefined;
  }
}

/** Frees every prototype, its GPU copies and the shared materials (between floors). */
export function disposeCreatures(): void {
  for (const p of prototypes.values()) p.skeleton.dispose();
  prototypes.clear();
  releaseBakes();
  disposeCreatureMaterials();
}

/** How many prototypes are alive (for tests and the perf overlay). */
export function creaturePrototypeCount(): number {
  return prototypes.size;
}

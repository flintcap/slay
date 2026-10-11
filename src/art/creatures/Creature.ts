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
import { cloneCreatureMaterial, creatureMaterial, disposeCreatureMaterials, scaleBucket, type CreatureMatDef } from './Materials';
import type { CreatureInfo } from './Animator';
import { STYLE_DEFAULT, type MotionStyle } from './Motion';
import { mergeGeometries } from '../Meshes';

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
 * Rank rims, in the nameplate colours (Enemy's RANK_COLOR): champions burn
 * blue, elites gold, rares orange, bosses a low ember. A rim lights the
 * silhouette's edge, so the rank reads at a glance and the body underneath
 * stays the body.
 */
/** The faint edge on unranked monsters (dimmer and greyer than any rank's). */
const NORMAL_RIM = { rim: 0x56607a, strength: 0.32 };

const RANK_RIM: Record<string, { rim: number; strength: number; glow: number }> = {
  normal: { rim: 0x000000, strength: 0, glow: 1 },
  champion: { rim: 0x6f8cff, strength: 0.55, glow: 1.25 },
  elite: { rim: 0xf5d76e, strength: 0.55, glow: 1.4 },
  rare: { rim: 0xff9a3c, strength: 0.6, glow: 1.5 },
  // A boss's rim stays low: its silhouette and colours are its own, the ember only edges it.
  boss: { rim: 0xff7a30, strength: 0.28, glow: 1.5 },
};

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
  const rr = RANK_RIM[opts.rank ?? 'normal'] ?? RANK_RIM.normal!;
  const sz = scale * (look.size ?? 1);
  const bucket = scaleBucket(sz);
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    sm.bind(own, sm.bindMatrix);
    // Culled on the shared mesh's generous sphere (set in \`prototype\`). Left
    // empty, three.js works one out on the first frame by posing every
    // vertex through the bones: per part, per monster, all at once on the
    // first frame of a floor (most of a second), and it then kept that one
    // pose's tight sphere for good, so a lunge could be culled half drawn.
    if (sm.geometry.boundingSphere) sm.boundingSphere = sm.geometry.boundingSphere.clone();
    const matName = sm.userData.mat as CMat;
    const def = proto.look.mats[matName] ?? proto.look.mats.skin!;
    // Texel density follows the world size; rank adds its rim and a hotter glow.
    sm.material = creatureMaterial({
      ...def,
      scale: bucket,
      // Plain monsters get a faint cold edge so they still read as shapes
      // out past the torchlight; ranked ones keep their coloured rims.
      rim: tier ? rr.rim : def.rim ?? NORMAL_RIM.rim,
      rimStrength: tier ? rr.strength : def.rim !== undefined ? def.rimStrength : NORMAL_RIM.strength,
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

const flairs = new Map<number, { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }>();

/**
 * Mini-boss flair: a burning crown of spikes over the head in the rank's
 * colour, so the promoted monster stands out of its pack before its plate is
 * read. Shared geometry and material per colour; a child of the head socket,
 * so it rides every move.
 */
export function miniBossFlair(root: THREE.Object3D, rank: string): void {
  const info = root.userData?.creature as CreatureInfo | undefined;
  const head = creatureSocket(root, 'head');
  if (!info || !head || head.getObjectByName('flair:miniboss')) return;
  const col = (RANK_RIM[rank] ?? RANK_RIM.elite!).rim || 0xf5d76e;
  let f = flairs.get(col);
  if (!f) {
    const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(1, 0.1, 5, 18).rotateX(Math.PI / 2)];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const tall = i % 2 ? 0.9 : 1.5;
      parts.push(new THREE.ConeGeometry(0.16, tall, 5).translate(Math.sin(a), tall / 2, Math.cos(a)));
    }
    const geo = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.75, roughness: 0.45, metalness: 0.5 });
    f = { geo, mat };
    flairs.set(col, f);
  }
  const H = info.height;
  const m = new THREE.Mesh(f.geo, f.mat);
  m.name = 'flair:miniboss';
  m.position.y = 0.05 * H;
  m.scale.setScalar(0.065 * H * Math.min(1.6, Math.max(0.8, 1.8 / H)));
  head.add(m);
}

/** Each heated mesh's shared material, so heat never compounds. */
const baseMats = new WeakMap<THREE.Object3D, THREE.Material>();

/**
 * A boss's later phases burn hotter: its glow and its ember rim rise with each
 * phase. The instance swaps to private copies of its materials (same shader
 * program and textures), so other spawns of the look are untouched.
 */
export function heatCreature(root: THREE.Object3D, phase: number): void {
  const k = Math.min(3, Math.max(0, phase));
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    const cur = sm.material as THREE.Material;
    const info = cur.userData.creature as { def: CreatureMatDef } | undefined;
    if (!info) return;
    // The shared material it started from, so heat does not compound.
    const base = baseMats.get(sm) ?? cur;
    baseMats.set(sm, base);
    const def = (base.userData.creature as { def: CreatureMatDef }).def;
    const next = k === 0 ? base : cloneCreatureMaterial(base, {
      glowIntensity: (def.glowIntensity ?? 2.4) * (1 + 0.45 * k),
      rim: 0xff5a24,
      rimStrength: (def.rimStrength ?? 0) + 0.14 * k,
    });
    if (cur !== base && cur.userData.private) cur.dispose();
    sm.material = next;
  });
}

/** Bodies left on the floor, oldest first. */
const corpses: THREE.Object3D[] = [];
/** How many bodies stay before the oldest is cleared away. */
const CORPSE_CAP = 36;

function dropCorpse(c: THREE.Object3D): void {
  c.removeFromParent();
  (c.userData.monsterSkeleton as THREE.Skeleton | undefined)?.dispose();
  c.userData.monsterSkeleton = undefined;
}

/**
 * Leaves the fallen body behind: a frozen copy of the creature in its last
 * death pose, placed in the world where it fell, with its rank rim gone and
 * its glow gone cold. The living spawn is hidden, so whatever its owner does
 * next (sink, shrink, remove) is never seen. The copy shares geometry, keeps
 * its own skeleton (no new shaders) and casts no shadow. At most
 * `CORPSE_CAP` stay; the oldest goes first.
 */
export function leaveCorpse(root: THREE.Object3D): void {
  let world: THREE.Object3D = root;
  while (world.parent) world = world.parent;
  const src = root.userData.monsterSkeleton as THREE.Skeleton | undefined;
  if (world === root || !src) return;
  root.updateWorldMatrix(true, true);
  // The live spawn's userData holds its skeleton; clone() would deep-copy it.
  const ud = root.userData;
  root.userData = {};
  const corpse = root.clone(true);
  root.userData = ud;
  corpse.getObjectByName('flair:miniboss')?.removeFromParent();
  const bones: Record<string, THREE.Bone> = {};
  corpse.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
  });
  const own = new THREE.Skeleton(src.bones.map((b) => bones[b.name]!), src.boneInverses);
  const liveMeshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) liveMeshes.push(o as THREE.SkinnedMesh);
  });
  let i = 0;
  corpse.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    const live = liveMeshes[i++];
    sm.bind(own, sm.bindMatrix);
    sm.castShadow = false;
    const base = (live && baseMats.get(live)) ?? (sm.material as THREE.Material);
    const def = (base.userData.creature as { def: CreatureMatDef } | undefined)?.def;
    if (def) sm.material = creatureMaterial({ ...def, rimStrength: 0, glowIntensity: (def.glowIntensity ?? 2.4) * 0.25 });
  });
  root.matrixWorld.decompose(corpse.position, corpse.quaternion, corpse.scale);
  corpse.userData = { monsterSkeleton: own, corpse: true };
  corpse.name = 'corpse';
  corpse.visible = true;
  world.add(corpse);
  corpse.updateMatrixWorld(true);
  corpses.push(corpse);
  while (corpses.length > CORPSE_CAP) dropCorpse(corpses.shift()!);
  root.visible = false;
}

/** Clears every body left on the floor (between floors). */
export function clearCorpses(): void {
  for (const c of corpses) dropCorpse(c);
  corpses.length = 0;
}

/** Frees one spawn: its skeleton's bone texture and any private (heated) materials. Geometry is shared. */
export function releaseCreature(root: THREE.Object3D): void {
  const skel = root.userData?.monsterSkeleton as THREE.Skeleton | undefined;
  if (skel) {
    skel.dispose();
    root.userData.monsterSkeleton = undefined;
  }
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m && !Array.isArray(m) && m.userData?.private) m.dispose();
  });
}

/** Frees every prototype, its GPU copies and the shared materials (between floors). */
export function disposeCreatures(): void {
  clearCorpses();
  for (const f of flairs.values()) {
    f.geo.dispose();
    f.mat.dispose();
  }
  flairs.clear();
  for (const p of prototypes.values()) p.skeleton.dispose();
  prototypes.clear();
  releaseBakes();
  disposeCreatureMaterials();
}

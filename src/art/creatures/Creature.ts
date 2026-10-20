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
import { CMATS, Sculpt, type ClothSpec, type CMat, type SculptQuality } from './Sculpt';
import { bakeSculpt, paintSheet, sculptKey } from './Bake';
import { freeCloths, handClothsOn, wearCloths } from './CreatureCloth';
import { bakedCached, releaseBakes } from './Store';
import { cloneCreatureMaterial, creatureMaterial, disposeCreatureMaterials, scaleBucket, type CreatureMatDef } from './Materials';
import type { CreatureInfo } from './Animator';
import { STYLE_DEFAULT, type MotionStyle } from './Motion';
import { mergeGeometries } from '../Meshes';
import { shadowBodyMaterial } from '../../core/ShadowBodies';
import { lodGeometry } from '../hero/Decimate';
import { bodyVanishes, ownMaterial } from '../../fx/HitFlash';

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
  /** Every part's lower-detail copy in one geometry (position and skin only), for the shadow pass. */
  shadowGeo: THREE.BufferGeometry | null;
  info: CreatureInfo;
  meshes: Array<{ mat: CMat; geo: THREE.BufferGeometry }>;
  /** Capes and banners each spawn wears as cloth, painted. */
  cloths: ClothSpec[];
  look: CreatureLook;
}

/** A sculpt as a look makes it: a boss wears its capes and banners as cloth. */
function sculptOf(look: CreatureLook, rig: CreatureRig): Sculpt {
  const s = new Sculpt(rig);
  s.clothOn = look.tier === 'boss';
  look.sculpt(s);
  return s;
}

const prototypes = new Map<string, Prototype>();

/**
 * A look's bake without the prototype: the store key `prototype` reads it
 * under and the baker that makes it (speed stream, for the bake worker:
 * `world/BakePool.ts`). Pure data, no materials or textures, so it runs in a
 * worker; what it bakes is what `prototype` would bake on the main thread.
 */
export function lookBake(look: CreatureLook): { key: string; bake: () => THREE.BufferGeometry[] } {
  const rig = look.rig();
  const s = sculptOf(look, rig);
  const q = quality(rig, look.tier ?? 'normal');
  return {
    key: sculptKey(s, q),
    bake: () => {
      const out = bakeSculpt(s, q).map((b) => b.geo);
      for (const p of s.parts) p.geo.dispose();
      return out;
    },
  };
}

/** Builds (or reads back) a look's prototype. */
function prototype(look: CreatureLook): Prototype {
  const hit = prototypes.get(look.key);
  if (hit) return hit;
  const rig = look.rig();
  const s = sculptOf(look, rig);
  const q = quality(rig, look.tier ?? 'normal');
  for (const c of s.cloths) paintSheet(s, c.mat, c.geo, c.col);
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
  // Lower-detail copies, stored with the bake: the shadow is cast from them,
  // and a body small on screen is drawn from them (`creatureDetail`).
  let lows = bakedCached(`lod${LOD_KEEP}|${key}`, () => meshes.map((m) => lodGeometry(m.geo, LOD_KEEP)));
  if (lows.length !== meshes.length || lows.some((g, i) => !sameLayout(g, meshes[i]!.geo))) lows = meshes.map((m) => m.geo);

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
    grip: s.grip,
  };
  const shadowGeo = mergeForShadow(lows);
  meshes.forEach((m, i) => {
    const low = lows[i]!;
    if (low === m.geo) return;
    lowOf.set(m.geo, low);
    fullOf.set(low, m.geo);
  });
  for (const [i, m] of meshes.entries()) {
    const def = look.mats[m.mat] ?? look.mats.skin!;
    const mesh = new THREE.SkinnedMesh(m.geo, creatureMaterial(def));
    mesh.name = `creature:${m.mat}`;
    // With a shadow body the parts cast none of their own (`core/ShadowBodies.ts`).
    mesh.castShadow = !shadowGeo;
    // Darkened under a wall's shadow, a tree's, the hero's: a monster walking
    // out of the torchlight into the shade goes dark with the floor.
    mesh.receiveShadow = true;
    // Poses reach past the bind box (lunges, rears, falls): cull on a generous sphere.
    if (!m.geo.boundingSphere) m.geo.computeBoundingSphere();
    const bs = m.geo.boundingSphere!;
    bs.radius = Math.max(bs.radius * 1.5, rig.height * 0.9, rig.length * 0.8);
    lows[i]!.boundingSphere = bs.clone();
    mesh.userData.mat = m.mat;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
  }
  if (shadowGeo) {
    const body = new THREE.SkinnedMesh(shadowGeo, shadowBodyMaterial());
    body.name = 'creature:shadow';
    body.userData.shadowOnly = true;
    body.castShadow = true;
    body.receiveShadow = false;
    const bs = (shadowGeo.boundingSphere ?? (shadowGeo.computeBoundingSphere(), shadowGeo.boundingSphere))!;
    bs.radius = Math.max(bs.radius * 1.5, rig.height * 0.9, rig.length * 0.8);
    root.add(body);
    body.bind(skeleton, new THREE.Matrix4());
  }
  const proto: Prototype = { root, skeleton, shadowGeo, info, meshes, cloths: s.cloths, look };
  prototypes.set(look.key, proto);
  return proto;
}


/** Share of a part's triangles its lower-detail copy keeps. */
const LOD_KEEP = 0.4;
/** A part's full bake and its lower-detail copy, each way. */
const lowOf = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
const fullOf = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** Whether `b` can stand in for `a` under the same material: the same attributes, sizes and types. */
function sameLayout(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
  const names = Object.keys(a.attributes);
  if (names.length !== Object.keys(b.attributes).length || !a.index !== !b.index) return false;
  return names.every((n) => {
    const x = a.attributes[n] as THREE.BufferAttribute;
    const y = b.attributes[n] as THREE.BufferAttribute | undefined;
    return !!y && x.itemSize === y.itemSize && x.normalized === y.normalized && x.array.constructor === y.array.constructor;
  });
}

/**
 * Draws a creature's parts from their lower-detail copies (`low`) or from
 * the full bake. For bodies too small on screen for the difference to show;
 * the copies share the parts' materials, so swapping builds nothing.
 */
export function creatureDetail(root: THREE.Object3D, low: boolean): void {
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || sm.userData.shadowOnly) return;
    const g = (low ? lowOf : fullOf).get(sm.geometry);
    if (g) sm.geometry = g;
  });
}

/** The parts' positions and skin weights in one indexed geometry, for the shadow body. */
function mergeForShadow(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  const names = ['position', 'skinIndex', 'skinWeight'] as const;
  for (const g of geos) for (const n of names) if (!g.getAttribute(n)) return null;
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const first = geos[0]!.getAttribute(n) as THREE.BufferAttribute;
    const size = first.itemSize;
    let total = 0;
    for (const g of geos) total += g.getAttribute(n).count;
    const Ctor = first.array.constructor as new (n: number) => THREE.TypedArray;
    const arr = new Ctor(total * size);
    let at = 0;
    for (const g of geos) {
      const a = g.getAttribute(n) as THREE.BufferAttribute;
      if (a.itemSize !== size || a.array.constructor !== first.array.constructor) return null;
      for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) arr[at++] = a.getComponent(i, k);
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size, first.normalized));
  }
  let indexTotal = 0;
  let vTotal = 0;
  for (const g of geos) {
    indexTotal += g.index ? g.index.count : g.getAttribute('position').count;
    vTotal += g.getAttribute('position').count;
  }
  const index = vTotal > 65535 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);
  let at = 0;
  let base = 0;
  for (const g of geos) {
    const n = g.getAttribute('position').count;
    if (g.index) for (let i = 0; i < g.index.count; i++) index[at++] = g.index.getX(i) + base;
    else for (let i = 0; i < n; i++) index[at++] = i + base;
    base += n;
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.userData.cached = true;
  return out;
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
  const dress = (matName: CMat): THREE.Material => {
    const def = proto.look.mats[matName] ?? proto.look.mats.skin!;
    // Texel density follows the world size; rank adds its rim and a hotter glow.
    return creatureMaterial({
      ...def,
      scale: bucket,
      // Plain monsters get a faint cold edge so they still read as shapes
      // out past the torchlight; ranked ones keep their coloured rims.
      rim: tier ? rr.rim : def.rim ?? NORMAL_RIM.rim,
      rimStrength: tier ? rr.strength : def.rim !== undefined ? def.rimStrength : NORMAL_RIM.strength,
      glowIntensity: (def.glowIntensity ?? 2.4) * rr.glow,
    });
  };
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
    if (sm.userData.shadowOnly) return;
    sm.material = dress(sm.userData.mat as CMat);
  });
  if (proto.cloths.length) root.userData.cloths = wearCloths(root, own, proto.cloths, dress);
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
  freeCloths(c);
  for (const g of (c.userData.baked as THREE.BufferGeometry[] | undefined) ?? []) g.dispose();
  c.userData.baked = undefined;
}

const _m = new THREE.Matrix4();
const _bind = new THREE.Matrix4();
const _unbind = new THREE.Matrix4();

/** A skinned part's geometry as its bones hold it now (world matrices current), in its own space: positions and normals moved, the rest shared. */
function bakePose(sm: THREE.SkinnedMesh): THREE.BufferGeometry {
  const g = sm.geometry;
  const skel = sm.skeleton;
  // Per bone: rig space -> bone -> rig space, as the skinning shader does it.
  _bind.copy(sm.bindMatrix);
  // Attached: the mesh's own space now (its stored inverse is only refreshed by a full matrix walk).
  if (sm.bindMode === 'attached') _unbind.copy(sm.matrixWorld).invert();
  else _unbind.copy(sm.bindMatrixInverse);
  const mats = skel.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(_unbind, _m.multiplyMatrices(b.matrixWorld, skel.boneInverses[i]!)).multiply(_bind).elements);
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const n = pos.count;
  const p = new Float32Array(n * 3);
  const q = nor ? new Float32Array(n * 3) : null;
  const e = new Float32Array(16);
  for (let v = 0; v < n; v++) {
    e.fill(0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(v, k);
      if (w === 0) continue;
      const me = mats[si.getComponent(v, k)];
      if (!me) continue;
      for (let c = 0; c < 16; c++) e[c] += me[c]! * w;
    }
    const x = pos.getX(v);
    const y = pos.getY(v);
    const z = pos.getZ(v);
    p[v * 3] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
    p[v * 3 + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
    p[v * 3 + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
    if (q && nor) {
      const a = nor.getX(v);
      const b = nor.getY(v);
      const c = nor.getZ(v);
      const nx = e[0]! * a + e[4]! * b + e[8]! * c;
      const ny = e[1]! * a + e[5]! * b + e[9]! * c;
      const nz = e[2]! * a + e[6]! * b + e[10]! * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      q[v * 3] = nx / l;
      q[v * 3 + 1] = ny / l;
      q[v * 3 + 2] = nz / l;
    }
  }
  const out = stillGeometry(g);
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  if (q) out.setAttribute('normal', new THREE.BufferAttribute(q, 3));
  out.computeBoundingSphere();
  return out;
}

/** A geometry sharing a skinned one's index, groups and every attribute but the skin weights. */
function stillGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    if (name !== 'skinIndex' && name !== 'skinWeight') out.setAttribute(name, a);
  }
  out.setIndex(g.index);
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  return out;
}

/** What a body wears once it falls: its own look without rim light, its glow banked low. */
function corpseMaterial(live: THREE.SkinnedMesh): THREE.Material | null {
  const base = baseMats.get(live) ?? (ownMaterial(live) as THREE.Material);
  const def = (base.userData.creature as { def: CreatureMatDef } | undefined)?.def;
  return def ? creatureMaterial({ ...def, rimStrength: 0, glowIntensity: (def.glowIntensity ?? 2.4) * 0.25 }) : null;
}

/**
 * One stand-in for each body part's fallen look, for the curtain's warm-up
 * (DungeonScene.warmup). A corpse wears other material values than the
 * living body (no rim, low glow) on a still mesh, which three.js builds as a
 * shader of its own: the first kill of each kind of monster built it
 * mid-fight.
 */
export function corpseStandIns(roots: Iterable<THREE.Object3D>): THREE.Object3D[] {
  const kinds = new Map<string, THREE.Object3D>();
  for (const root of roots) {
    root.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || sm.userData.shadowOnly) return;
      const mat = corpseMaterial(sm);
      if (!mat) return;
      const g = sm.geometry;
      const attrs = Object.keys(g.attributes).sort().join(',');
      const key = `${mat.uuid}|${attrs}|${g.index ? 1 : 0}|${sm.receiveShadow}`;
      if (kinds.has(key)) return;
      const k = new THREE.Mesh(stillGeometry(g), mat);
      k.castShadow = false;
      k.receiveShadow = sm.receiveShadow;
      k.frustumCulled = false;
      kinds.set(key, k);
    });
  }
  return [...kinds.values()];
}

/**
 * Leaves the fallen body behind: a still copy of the creature in its last
 * death pose, placed in the world where it fell, with its rank rim gone and
 * its glow gone cold. The living spawn is hidden, so whatever its owner does
 * next (sink, shrink, remove) is never seen. Each part is baked to a plain
 * mesh in that pose (`bakePose`): no skeleton, no skinning, and nothing in it
 * is touched again until it is cleared. It casts no shadow. At most
 * `CORPSE_CAP` stay; the oldest goes first.
 */
export function leaveCorpse(root: THREE.Object3D): void {
  let world: THREE.Object3D = root;
  while (world.parent) world = world.parent;
  if (world === root || !root.userData.monsterSkeleton) return;
  // Shattered or unmade: nothing is left to lie there.
  if (bodyVanishes(root)) return;
  root.updateWorldMatrix(true, true);
  // The live spawn's userData holds its skeleton; clone() would deep-copy it.
  const ud = root.userData;
  root.userData = {};
  const corpse = root.clone(true);
  root.userData = ud;
  corpse.getObjectByName('flair:miniboss')?.removeFromParent();
  // The copy walks in step with the live body: same parts, same order.
  const live: THREE.Mesh[] = [];
  const copy: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) live.push(o as THREE.Mesh);
  });
  corpse.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) copy.push(o as THREE.Mesh);
  });
  const baked: THREE.BufferGeometry[] = [];
  copy.forEach((o, n) => {
    const from = live[n];
    if (o.userData.shadowOnly) {
      o.removeFromParent();
      return;
    }
    // A body killed mid-flash (every elemental kill wears a death look) was
    // copied wearing the flash material: hand each copy its own back first.
    if (from) o.material = ownMaterial(from);
    const sm = from as THREE.SkinnedMesh | undefined;
    if (!(o as THREE.SkinnedMesh).isSkinnedMesh || !sm?.isSkinnedMesh) return;
    const geo = bakePose(sm);
    baked.push(geo);
    const still = new THREE.Mesh(geo, corpseMaterial(sm) ?? o.material);
    still.name = o.name;
    still.position.copy(o.position);
    still.quaternion.copy(o.quaternion);
    still.scale.copy(o.scale);
    still.visible = o.visible;
    still.renderOrder = o.renderOrder;
    still.castShadow = false;
    still.receiveShadow = o.receiveShadow;
    if (o.children.length) still.add(...o.children);
    o.parent?.add(still);
    o.removeFromParent();
  });
  root.matrixWorld.decompose(corpse.position, corpse.quaternion, corpse.scale);
  corpse.userData = { baked, corpse: true };
  // Its cloth lies where it fell, still: the body's own, not the copies.
  handClothsOn(root, corpse);
  corpse.name = 'corpse';
  corpse.visible = true;
  world.add(corpse);
  corpse.updateMatrixWorld(true);
  // Still from here on: the scene's per-frame matrix walk skips it.
  corpse.traverse((o) => {
    o.matrixAutoUpdate = false;
  });
  corpse.matrixWorldAutoUpdate = false;
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
  freeCloths(root);
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
  for (const p of prototypes.values()) {
    p.skeleton.dispose();
    p.shadowGeo?.dispose();
  }
  prototypes.clear();
  releaseBakes();
  disposeCreatureMaterials();
}

/**
 * SLAY — procedural monster meshes.
 *
 * Every monster in the game is generated here from its `MonsterVisual` block.
 * There are no model files; each archetype is assembled from primitives that
 * are noise-displaced, bevelled and merged per limb, then bound to a small
 * hand-built bone rig.
 *
 * Two performance rules drive the design:
 *
 * 1. **Prototypes are cached.** A given visual signature builds a handful of
 *    variants once; every spawn after that is a `clone()` of a prototype, which
 *    shares geometry and material with its siblings. Sixty gargoyles cost sixty
 *    clones, not sixty geometry builds.
 * 2. **One mesh per animated bone.** Static sub-parts (plates, horns, spikes,
 *    scales) are merged into their parent bone's geometry, so a humanoid is
 *    ~11 draw calls rather than ~60.
 *
 * The rig is *rigid-bound*: meshes are parented directly to `THREE.Bone`
 * objects rather than skinned. For chunky, plated, undead-and-chitin silhouettes
 * this reads better than soft skinning and costs nothing per frame — no skinning
 * matrices, no SkinnedMesh, no bone texture. `skeleton` is therefore returned as
 * `null`; the contract permits it, and `bones` is the useful half.
 */

import * as THREE from 'three';
import type { MonsterVisual, Rng } from '../types';
import { surface, surfaceVariant, emissiveMaterial } from '../art/Materials';
import { beveledBox, clothPanel, displace, lathe, limb, mergeGeometries, spike } from '../art/Meshes';
import { mergeSkinned, skinRigid } from '../art/BodyKit';
import { resolvePalette } from '../art/Palettes';
import { Noise } from '../art/Noise';
import { buildItemModel } from '../art/ItemModels';

// ---------------------------------------------------------------------------
// Archetypes
// ---------------------------------------------------------------------------

export type Archetype =
  | 'humanoid'
  | 'quadruped'
  | 'serpent'
  | 'arachnid'
  | 'insectoid'
  | 'floating'
  | 'ooze'
  | 'winged'
  | 'colossal'
  | 'swarm';

const ARCHETYPE_ALIASES: Record<string, Archetype> = {
  humanoid: 'humanoid',
  skeleton: 'humanoid',
  zombie: 'humanoid',
  armored: 'humanoid',
  brute: 'humanoid',
  golem: 'colossal',
  colossus: 'colossal',
  colossal: 'colossal',
  giant: 'colossal',
  quadruped: 'quadruped',
  beast: 'quadruped',
  hound: 'quadruped',
  serpent: 'serpent',
  worm: 'serpent',
  snake: 'serpent',
  arachnid: 'arachnid',
  spider: 'arachnid',
  insectoid: 'insectoid',
  insect: 'insectoid',
  beetle: 'insectoid',
  floating: 'floating',
  orb: 'floating',
  eye: 'floating',
  wisp: 'floating',
  ooze: 'ooze',
  slime: 'ooze',
  amorphous: 'ooze',
  winged: 'winged',
  bat: 'winged',
  wraith: 'winged',
  swarm: 'swarm',
  cluster: 'swarm',
};

export function monsterArchetype(body: string): Archetype {
  return ARCHETYPE_ALIASES[body] ?? 'humanoid';
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const glowCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * `MonsterVisual.palette` accepts `"key"` or `"key|0xRRGGBB"`. The tint lets a
 * hundred monsters share six texture sets while still reading as distinct
 * creatures.
 */
function parsePalette(p: string): { key: string; tint?: number } {
  const bar = p.indexOf('|');
  if (bar < 0) return { key: p };
  const key = p.slice(0, bar);
  const tint = Number(p.slice(bar + 1));
  return Number.isFinite(tint) ? { key, tint } : { key };
}

/**
 * The multiplier that makes a palette's texture come out at the authored
 * colour. A tint used to multiply the palette's own albedo, so a bone-white
 * `0xd6cfb4` on crypt stone came out the grey of wet slate, and most of the
 * bestiary rendered as near-black lumps whatever colour it was written as.
 * Dividing by the palette's base turns the tint into the creature's colour.
 */
function albedoTint(key: string, tint: number): THREE.Color {
  const base = new THREE.Color(0x808080);
  try {
    base.setHex(resolvePalette(key).base);
  } catch {
    /* keep grey */
  }
  const want = new THREE.Color(tint);
  // Linear ratios; a ceiling keeps a near-black palette from blowing out.
  return new THREE.Color(
    Math.min(2.6, want.r / Math.max(0.02, base.r)),
    Math.min(2.6, want.g / Math.max(0.02, base.g)),
    Math.min(2.6, want.b / Math.max(0.02, base.b)),
  );
}

function bodyMaterial(palette: string, rough: number, metal: number): THREE.MeshStandardMaterial {
  const cacheKey = `${palette}:${rough.toFixed(2)}:${metal.toFixed(2)}`;
  const hit = materialCache.get(cacheKey);
  if (hit) return hit;
  const { key, tint } = parsePalette(palette);
  let mat: THREE.MeshStandardMaterial;
  try {
    mat =
      tint === undefined
        ? surface(key, { roughness: rough, metalness: metal })
        : surfaceVariant(key, { roughness: rough, metalness: metal });
    if (tint !== undefined) mat.color.copy(albedoTint(key, tint));
  } catch {
    mat = new THREE.MeshStandardMaterial({
      color: tint ?? 0x8a8a8a,
      roughness: rough,
      metalness: metal,
    });
  }
  mat.userData.shared = true;
  materialCache.set(cacheKey, mat);
  return mat;
}

function glowMaterial(color: number, intensity: number): THREE.MeshStandardMaterial {
  const cacheKey = `${color}:${intensity.toFixed(2)}`;
  const hit = glowCache.get(cacheKey);
  if (hit) return hit;
  let mat: THREE.MeshStandardMaterial;
  try {
    mat = emissiveMaterial(color, intensity);
  } catch {
    mat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
    });
  }
  mat.userData.shared = true;
  glowCache.set(cacheKey, mat);
  return mat;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const noise = new Noise(0xb0d1e5);

/**
 * Which material a part takes: the creature's own `body`, its `glow`, `trim`
 * (rank armour: steel for champions, gold for elites), `alt` (the family's
 * second material: an undead's rags, a plant's leaves, a construct's plates)
 * or `rank` (the glowing colour of its rank).
 */
type PartMat = 'body' | 'glow' | 'trim' | 'alt' | 'rank';

/** A geometry queued onto a bone. */
interface Part {
  bone: string;
  geo: THREE.BufferGeometry;
  mat: PartMat;
}

class Builder {
  readonly parts: Part[] = [];
  constructor(readonly rng: Rng, readonly v: MonsterVisual) {}

  add(bone: string, geo: THREE.BufferGeometry): THREE.BufferGeometry {
    this.parts.push({ bone, geo, mat: 'body' });
    return geo;
  }

  addGlow(bone: string, geo: THREE.BufferGeometry): THREE.BufferGeometry {
    this.parts.push({ bone, geo, mat: 'glow' });
    return geo;
  }

  addAs(bone: string, geo: THREE.BufferGeometry, mat: PartMat): THREE.BufferGeometry {
    this.parts.push({ bone, geo, mat });
    return geo;
  }
}

function safeDisplace(geo: THREE.BufferGeometry, rng: Rng, amount: number, scale: number): THREE.BufferGeometry {
  if (amount <= 0) return geo;
  try {
    return displace(geo, rng, amount, scale);
  } catch {
    // Local fallback so a monster still reads as organic if the art lib changes.
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return geo;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n = noise.fbm3(x * scale, y * scale, z * scale, 3);
      const len = Math.hypot(x, y, z) || 1;
      pos.setXYZ(i, x + (x / len) * n * amount, y + (y / len) * n * amount, z + (z / len) * n * amount);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }
}

function safeBevelBox(w: number, h: number, d: number, bevel: number): THREE.BufferGeometry {
  try {
    return beveledBox(w, h, d, bevel);
  } catch {
    return new THREE.BoxGeometry(w, h, d);
  }
}

function safeLathe(profile: Array<[number, number]>, segments: number): THREE.BufferGeometry {
  try {
    return lathe(profile, segments);
  } catch {
    const pts = profile.map(([x, y]) => new THREE.Vector2(Math.max(0.001, x), y));
    return new THREE.LatheGeometry(pts, segments);
  }
}

function safeMerge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (list.length === 1) return list[0]!;
  try {
    return mergeGeometries(list);
  } catch {
    return list[0]!;
  }
}

/**
 * Tapered limb hanging down from its joint (origin at the top). A lathe with
 * a muscle belly and rounded ends, not a raw cylinder: open-ended tubes were
 * what made every monster limb read as a stick of pipe.
 */
function limbGeo(length: number, rTop: number, rBottom: number, seg = 6): THREE.BufferGeometry {
  try {
    const g = limb(length, rTop, rBottom, Math.max(5, seg));
    g.translate(0, -length, 0);
    return g;
  } catch {
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, seg, 1, false);
    g.translate(0, -length * 0.5, 0);
    return g;
  }
}

/** A blade / claw / horn cone pointing along +Y. */
function spikeGeo(length: number, radius: number, seg = 5): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(radius, length, seg);
  g.translate(0, length * 0.5, 0);
  return g;
}

function sphereGeo(r: number, detail = 1): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(r, detail);
}

function place(
  g: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.BufferGeometry {
  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

// ---------------------------------------------------------------------------
// Bone rig scaffolding
// ---------------------------------------------------------------------------

interface BoneSpec {
  name: string;
  parent: string | null;
  x: number;
  y: number;
  z: number;
}

function buildBones(specs: BoneSpec[]): { root: THREE.Group; bones: Record<string, THREE.Bone> } {
  const root = new THREE.Group();
  root.name = 'monster';
  const bones: Record<string, THREE.Bone> = {};
  for (const s of specs) {
    const b = new THREE.Bone();
    b.name = s.name;
    b.position.set(s.x, s.y, s.z);
    bones[s.name] = b;
  }
  for (const s of specs) {
    const b = bones[s.name]!;
    if (s.parent && bones[s.parent]) bones[s.parent]!.add(b);
    else root.add(b);
  }
  return { root, bones };
}

// ---------------------------------------------------------------------------
// Shared decoration passes
// ---------------------------------------------------------------------------

function addHorns(b: Builder, bone: string, count: number, size: number, spread: number, rng: Rng): void {
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const tier = Math.floor(i / 2);
    const len = size * (1 - tier * 0.22) * rng.range(0.85, 1.15);
    const g = spikeGeo(len, size * 0.19, 5);
    place(
      g,
      side * spread * (0.6 + tier * 0.25),
      size * 0.32 - tier * size * 0.16,
      -size * 0.05 - tier * size * 0.12,
      -0.45 - tier * 0.18,
      0,
      side * (0.42 + tier * 0.1),
    );
    b.add(bone, g);
  }
}

function addSpineSpikes(b: Builder, bone: string, count: number, size: number, startY: number, step: number): void {
  for (let i = 0; i < count; i++) {
    const s = size * (1 - Math.abs(i / count - 0.35) * 0.9);
    const g = spikeGeo(Math.max(0.03, s), Math.max(0.012, s * 0.24), 4);
    place(g, 0, startY + i * step, -size * 0.55, -0.9, 0, 0);
    b.add(bone, g);
  }
}

function addEyes(b: Builder, bone: string, count: number, radius: number, headR: number, _glow: boolean): void {
  if (count <= 0) return;
  // Eyes always glow. Unlit eyes are the body's own material, which is to say
  // invisible, and the eyes are where a player looks to see which way a
  // monster is facing.
  const glow = true;
  if (count === 1) {
    const g = sphereGeo(radius, 1);
    place(g, 0, headR * 0.12, headR * 0.82);
    if (glow) b.addGlow(bone, g);
    else b.add(bone, g);
    return;
  }
  for (let i = 0; i < count; i++) {
    const pair = Math.floor(i / 2);
    const side = i % 2 === 0 ? 1 : -1;
    const g = sphereGeo(radius * (1 - pair * 0.16), 1);
    place(
      g,
      side * headR * (0.32 + pair * 0.13),
      headR * (0.14 - pair * 0.22),
      headR * (0.8 - pair * 0.1),
    );
    if (glow) b.addGlow(bone, g);
    else b.add(bone, g);
  }
}

function addWings(b: Builder, boneL: string, boneR: string, span: number, membrane: boolean, rng: Rng): void {
  for (const [bone, side] of [
    [boneL, 1],
    [boneR, -1],
  ] as Array<[string, number]>) {
    // Two-bone wing: humerus, then a fanned membrane of tapered struts.
    const arm = limbGeo(span * 0.42, span * 0.075, span * 0.05, 5);
    place(arm, 0, 0, 0, 0, 0, side * -1.35);
    b.add(bone, arm);

    const fingers = membrane ? 4 : 3;
    for (let f = 0; f < fingers; f++) {
      const t = f / (fingers - 1 || 1);
      const len = span * (0.62 - t * 0.2) * rng.range(0.92, 1.08);
      const strut = limbGeo(len, span * 0.035, span * 0.012, 4);
      place(
        strut,
        side * span * 0.4,
        span * 0.02,
        0,
        0,
        0,
        side * (-1.9 + t * 0.75),
      );
      strut.translate(0, 0, -span * 0.1 + t * span * 0.28);
      b.add(bone, strut);
    }
    if (membrane) {
      const web = new THREE.PlaneGeometry(span * 0.9, span * 0.62, 2, 2);
      place(web, side * span * 0.55, -span * 0.14, span * 0.06, 0, side * 0.12, side * 0.22);
      b.add(bone, web);
    }
  }
}

function addPlates(b: Builder, bone: string, count: number, w: number, h: number, d: number, rng: Rng): void {
  for (let i = 0; i < count; i++) {
    const g = safeBevelBox(w * rng.range(0.8, 1.15), h * rng.range(0.7, 1.1), d, Math.min(w, h) * 0.18);
    const a = (i / count) * Math.PI * 2;
    place(g, Math.sin(a) * w * 0.5, (i / count - 0.5) * h * 1.5, Math.cos(a) * w * 0.5, 0, a, 0);
    b.add(bone, g);
  }
}

// ---------------------------------------------------------------------------
// Archetype builders
// ---------------------------------------------------------------------------

interface BuildResult {
  specs: BoneSpec[];
  build: (b: Builder) => void;
}

function buildHumanoid(v: MonsterVisual, rng: Rng, colossal: boolean): BuildResult {
  const bulk = colossal ? 1.55 : 1;
  // Skeletons are humanoid in rig but not in mass: what makes one read as
  // undead is the gaps. A solid torso with a round head is a person, and every
  // skeleton in the game was getting exactly that.
  const bony = v.body === 'skeleton';
  const ornate = v.ornate ?? 0.3;
  const hipY = 0.92 * (colossal ? 1.18 : 1);
  const chestY = 0.52 * bulk;
  const headY = 0.34 * bulk;
  const armY = 0.24 * bulk;
  const shoulderX = 0.26 * bulk;
  const upperArm = 0.36 * bulk;
  const foreArm = 0.34 * bulk;
  const thigh = 0.44;
  const shin = 0.42;

  const specs: BoneSpec[] = [
    { name: 'root', parent: null, x: 0, y: 0, z: 0 },
    { name: 'hips', parent: 'root', x: 0, y: hipY, z: 0 },
    { name: 'spine', parent: 'hips', x: 0, y: 0.22 * bulk, z: 0 },
    { name: 'chest', parent: 'spine', x: 0, y: chestY * 0.55, z: 0 },
    { name: 'head', parent: 'chest', x: 0, y: headY, z: 0 },
    { name: 'shoulderL', parent: 'chest', x: shoulderX, y: armY, z: 0 },
    { name: 'elbowL', parent: 'shoulderL', x: 0, y: -upperArm, z: 0 },
    { name: 'handL', parent: 'elbowL', x: 0, y: -foreArm, z: 0 },
    { name: 'shoulderR', parent: 'chest', x: -shoulderX, y: armY, z: 0 },
    { name: 'elbowR', parent: 'shoulderR', x: 0, y: -upperArm, z: 0 },
    { name: 'handR', parent: 'elbowR', x: 0, y: -foreArm, z: 0 },
    { name: 'hipL', parent: 'hips', x: 0.15 * bulk, y: -0.06, z: 0 },
    { name: 'kneeL', parent: 'hipL', x: 0, y: -thigh, z: 0 },
    { name: 'footL', parent: 'kneeL', x: 0, y: -shin, z: 0 },
    { name: 'hipR', parent: 'hips', x: -0.15 * bulk, y: -0.06, z: 0 },
    { name: 'kneeR', parent: 'hipR', x: 0, y: -thigh, z: 0 },
    { name: 'footR', parent: 'kneeR', x: 0, y: -shin, z: 0 },
  ];
  if (v.tail) {
    specs.push({ name: 'tail', parent: 'hips', x: 0, y: -0.02, z: -0.18 * bulk });
    specs.push({ name: 'tailTip', parent: 'tail', x: 0, y: -0.1, z: -0.42 * bulk });
  }
  if (v.wings) {
    specs.push({ name: 'wingL', parent: 'chest', x: 0.16 * bulk, y: 0.2 * bulk, z: -0.12 });
    specs.push({ name: 'wingR', parent: 'chest', x: -0.16 * bulk, y: 0.2 * bulk, z: -0.12 });
  }

  return {
    specs,
    build: (b) => {
      // --- torso: pelvis + ribcage taper, displaced for organic bulk ---------
      const pelvis = safeDisplace(sphereGeo(0.2 * bulk, 1), rng, 0.03 * bulk, 4);
      place(pelvis, 0, 0, 0, 0, 0, 0, 1.1, 0.8, 0.85);
      b.add('hips', pelvis);

      const torso = safeDisplace(
        safeLathe(
          [
            [0.02, -0.28 * bulk],
            [0.17 * bulk, -0.24 * bulk],
            [0.23 * bulk, -0.05 * bulk],
            [0.27 * bulk, 0.12 * bulk],
            [0.22 * bulk, 0.26 * bulk],
            [0.1 * bulk, 0.32 * bulk],
            [0.02, 0.34 * bulk],
          ],
          10,
        ),
        rng,
        0.025 * bulk,
        4.5,
      );
      if (bony) {
        // A ribcage instead of a torso: individual ribs with daylight between
        // them, a visible spine, and a sternum so it is not hollow from the
        // front. Gaps in the silhouette say "undead" faster than any texture.
        torso.dispose();
        for (let i = 0; i < 5; i++) {
          const t = i / 4;
          const rw = 0.22 * bulk * (1 - t * 0.28);
          const rib = new THREE.TorusGeometry(rw, 0.016 * bulk, 4, 12, Math.PI * 1.2);
          rib.rotateY(Math.PI * 0.5);
          rib.rotateZ(Math.PI * 0.5);
          rib.scale(1, 0.6, 1);
          place(rib, 0, -0.1 * bulk + t * 0.3 * bulk, 0, 0.12, 0, 0);
          b.add('chest', rib);
        }
        for (let i = 0; i < 6; i++) {
          const vert = safeBevelBox(0.05 * bulk, 0.045 * bulk, 0.05 * bulk, 0.01);
          place(vert, 0, -0.14 * bulk + i * 0.076 * bulk, -0.09 * bulk);
          b.add('chest', vert);
        }
        const stern = safeBevelBox(0.07 * bulk, 0.26 * bulk, 0.03 * bulk, 0.012);
        place(stern, 0, 0.03 * bulk, 0.12 * bulk);
        b.add('chest', stern);
        // Collarbones.
        for (const side of [-1, 1]) {
          const cl = limbGeo(0.17 * bulk, 0.018 * bulk, 0.022 * bulk, 4);
          place(cl, side * 0.02 * bulk, 0.24 * bulk, 0.06 * bulk, 0, 0, side * 1.35);
          b.add('chest', cl);
        }
      } else {
        place(torso, 0, 0.04 * bulk, 0, 0, 0, 0, 1, 1, 0.78);
        b.add('chest', torso);
      }

      // Shoulder pauldrons scale with ornate — armoured lines read heavier.
      if (ornate > 0.25) {
        for (const [bone, side] of [
          ['shoulderL', 1],
          ['shoulderR', -1],
        ] as Array<[string, number]>) {
          const pad = safeDisplace(sphereGeo(0.13 * bulk * (0.7 + ornate * 0.6), 1), rng, 0.02, 5);
          place(pad, side * 0.02, 0.03 * bulk, 0, 0, 0, 0, 1, 0.8, 1);
          b.add(bone, pad);
          if (ornate > 0.6) {
            const sp = spikeGeo(0.2 * bulk * ornate, 0.045 * bulk, 4);
            place(sp, side * 0.09 * bulk, 0.04, 0, -0.2, 0, side * 0.8);
            b.add(bone, sp);
          }
        }
      }

      // --- head -------------------------------------------------------------
      if (bony) {
        // Cranium: wide at the back, narrowing to the brow.
        const cran = safeDisplace(sphereGeo(0.155 * bulk, 1), rng, 0.01 * bulk, 7);
        place(cran, 0, 0.09 * bulk, -0.01, 0, 0, 0, 0.9, 1.0, 1.05);
        b.add('head', cran);
        // Cheekbones and a hanging mandible, with the gap between them showing.
        const zyg = safeBevelBox(0.17 * bulk, 0.045 * bulk, 0.1 * bulk, 0.015);
        place(zyg, 0, 0.03 * bulk, 0.05 * bulk);
        b.add('head', zyg);
        const mand = safeBevelBox(0.12 * bulk, 0.055 * bulk, 0.1 * bulk, 0.02);
        place(mand, 0, -0.05 * bulk, 0.045 * bulk, 0.22, 0, 0);
        b.add('head', mand);
        // Brow, so the sockets sit in shadow.
        const brow = safeBevelBox(0.16 * bulk, 0.03 * bulk, 0.05 * bulk, 0.01);
        place(brow, 0, 0.08 * bulk, 0.1 * bulk, -0.2, 0, 0);
        b.add('head', brow);
      } else {
        const skull = safeDisplace(sphereGeo(0.17 * bulk, 1), rng, 0.022 * bulk, 6);
        place(skull, 0, 0.08 * bulk, 0.01, 0, 0, 0, 0.92, 1.05, 1);
        b.add('head', skull);
        const jaw = safeBevelBox(0.15 * bulk, 0.07 * bulk, 0.15 * bulk, 0.02);
        place(jaw, 0, -0.02 * bulk, 0.06 * bulk);
        b.add('head', jaw);
      }

      if (ornate > 0.35) addHorns(b, 'head', ornate > 0.7 ? 4 : 2, 0.3 * bulk * ornate, 0.11 * bulk, rng);
      addEyes(b, 'head', v.eyes ?? 2, 0.032 * bulk, 0.18 * bulk, v.glow !== undefined);
      if (ornate > 0.5) addSpineSpikes(b, 'chest', 5, 0.1 * bulk * ornate, -0.16 * bulk, 0.1 * bulk);

      // --- limbs ------------------------------------------------------------
      const limbCount = v.limbs ?? 2;
      for (const [up, lo, hand, side] of [
        ['shoulderL', 'elbowL', 'handL', 1],
        ['shoulderR', 'elbowR', 'handR', -1],
      ] as Array<[string, string, string, number]>) {
        const thin = bony ? 0.5 : 1;
        const a1 = limbGeo(upperArm, 0.075 * bulk * thin, 0.06 * bulk * thin, 6);
        b.add(up, a1);
        const a2 = limbGeo(foreArm, 0.062 * bulk * thin, 0.05 * bulk * thin, 6);
        b.add(lo, a2);
        const fist = safeDisplace(sphereGeo(0.075 * bulk * (bony ? 0.7 : 1), 0), rng, 0.012, 8);
        b.add(hand, fist);
        if (bony) {
          // Knobbed joints: the shoulder ball and the elbow, which is what makes
          // a thin limb read as bone rather than as a stick.
          b.add(up, place(sphereGeo(0.055 * bulk, 0), 0, 0, 0));
          b.add(lo, place(sphereGeo(0.045 * bulk, 0), 0, 0, 0));
        }
        if (ornate > 0.45) {
          for (let c = 0; c < 3; c++) {
            const claw = spikeGeo(0.13 * bulk * ornate, 0.02 * bulk, 4);
            place(claw, (c - 1) * 0.04 * bulk, -0.05 * bulk, 0.02, -1.9, 0, side * 0.1);
            b.add(hand, claw);
          }
        }
      }
      // Extra arm pairs for aberrations — stubs off the chest, no IK needed.
      if (limbCount > 2) {
        for (let i = 2; i < Math.min(limbCount, 6); i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const tier = Math.floor(i / 2);
          const arm = limbGeo(upperArm * 0.85, 0.05 * bulk, 0.03 * bulk, 5);
          place(arm, side * shoulderX * 0.92, armY - tier * 0.14 * bulk, -0.04, 0.3, 0, side * -0.9);
          b.add('chest', arm);
        }
      }

      for (const [hip, knee, foot] of [
        ['hipL', 'kneeL', 'footL'],
        ['hipR', 'kneeR', 'footR'],
      ] as Array<[string, string, string]>) {
        const thin = bony ? 0.52 : 1;
        b.add(hip, limbGeo(thigh, 0.09 * bulk * thin, 0.07 * bulk * thin, 6));
        b.add(knee, limbGeo(shin, 0.07 * bulk * thin, 0.055 * bulk * thin, 6));
        if (bony) {
          b.add(hip, place(sphereGeo(0.06 * bulk, 0), 0, 0, 0));
          b.add(knee, place(sphereGeo(0.05 * bulk, 0), 0, 0, 0));
        }
        const boot = safeBevelBox(0.11 * bulk * (bony ? 0.75 : 1), 0.07, 0.2 * bulk * (bony ? 0.8 : 1), 0.02);
        place(boot, 0, -0.02, 0.05 * bulk);
        b.add(foot, boot);
      }

      if (v.tail) {
        b.add('tail', place(limbGeo(0.42 * bulk, 0.07 * bulk, 0.045 * bulk, 5), 0, 0, 0, Math.PI * 0.5));
        b.add('tailTip', place(spikeGeo(0.22 * bulk, 0.05 * bulk, 5), 0, 0, 0, -Math.PI * 0.5));
      }
      if (v.wings) addWings(b, 'wingL', 'wingR', 1.15 * bulk, true, rng);
    },
  };
}

function buildQuadruped(v: MonsterVisual, rng: Rng): BuildResult {
  const ornate = v.ornate ?? 0.3;
  const bodyLen = 0.95;
  const legLen = 0.34;
  const specs: BoneSpec[] = [
    { name: 'root', parent: null, x: 0, y: 0, z: 0 },
    { name: 'hips', parent: 'root', x: 0, y: 0.72, z: -bodyLen * 0.34 },
    { name: 'spine', parent: 'hips', x: 0, y: 0.02, z: bodyLen * 0.3 },
    { name: 'chest', parent: 'spine', x: 0, y: 0.04, z: bodyLen * 0.3 },
    { name: 'neck', parent: 'chest', x: 0, y: 0.1, z: 0.22 },
    { name: 'head', parent: 'neck', x: 0, y: 0.08, z: 0.2 },
    { name: 'shoulderL', parent: 'chest', x: 0.19, y: -0.06, z: 0.04 },
    { name: 'elbowL', parent: 'shoulderL', x: 0, y: -legLen, z: 0 },
    { name: 'handL', parent: 'elbowL', x: 0, y: -legLen * 0.9, z: 0 },
    { name: 'shoulderR', parent: 'chest', x: -0.19, y: -0.06, z: 0.04 },
    { name: 'elbowR', parent: 'shoulderR', x: 0, y: -legLen, z: 0 },
    { name: 'handR', parent: 'elbowR', x: 0, y: -legLen * 0.9, z: 0 },
    { name: 'hipL', parent: 'hips', x: 0.2, y: -0.05, z: -0.02 },
    { name: 'kneeL', parent: 'hipL', x: 0, y: -legLen, z: 0 },
    { name: 'footL', parent: 'kneeL', x: 0, y: -legLen * 0.9, z: 0 },
    { name: 'hipR', parent: 'hips', x: -0.2, y: -0.05, z: -0.02 },
    { name: 'kneeR', parent: 'hipR', x: 0, y: -legLen, z: 0 },
    { name: 'footR', parent: 'kneeR', x: 0, y: -legLen * 0.9, z: 0 },
    { name: 'tail', parent: 'hips', x: 0, y: 0.06, z: -0.2 },
    { name: 'tailTip', parent: 'tail', x: 0, y: 0.02, z: -0.34 },
  ];

  return {
    specs,
    build: (b) => {
      const barrel = safeDisplace(sphereGeo(0.3, 2), rng, 0.045, 4);
      place(barrel, 0, 0.02, 0.06, 0, 0, 0, 0.86, 0.88, 1.5);
      b.add('chest', barrel);
      const rump = safeDisplace(sphereGeo(0.26, 1), rng, 0.04, 5);
      place(rump, 0, 0.02, -0.04, 0, 0, 0, 0.9, 0.95, 1.15);
      b.add('hips', rump);

      const neck = limbGeo(0.24, 0.13, 0.1, 6);
      place(neck, 0, 0.1, 0.06, 1.1);
      b.add('neck', neck);

      const skull = safeDisplace(sphereGeo(0.16, 1), rng, 0.025, 6);
      place(skull, 0, 0.02, 0.06, 0, 0, 0, 0.85, 0.85, 1.25);
      b.add('head', skull);
      const snout = limbGeo(0.2, 0.085, 0.055, 5);
      place(snout, 0, -0.01, 0.16, Math.PI * 0.5);
      b.add('head', snout);
      // Teeth read at gameplay camera distance; four is enough.
      for (let i = 0; i < 4; i++) {
        const t = spikeGeo(0.055, 0.016, 3);
        place(t, (i % 2 === 0 ? 1 : -1) * 0.04, -0.045 + (i > 1 ? 0.055 : 0), 0.23, i > 1 ? 0.4 : Math.PI - 0.4);
        b.add('head', t);
      }
      addEyes(b, 'head', v.eyes ?? 2, 0.028, 0.15, v.glow !== undefined);
      if (ornate > 0.35) addHorns(b, 'head', ornate > 0.7 ? 4 : 2, 0.26 * ornate, 0.09, rng);
      if (ornate > 0.4) addSpineSpikes(b, 'chest', 6, 0.12 * ornate, -0.18, 0.11);

      for (const [up, lo, foot] of [
        ['shoulderL', 'elbowL', 'handL'],
        ['shoulderR', 'elbowR', 'handR'],
        ['hipL', 'kneeL', 'footL'],
        ['hipR', 'kneeR', 'footR'],
      ] as Array<[string, string, string]>) {
        b.add(up, limbGeo(legLen, 0.075, 0.055, 5));
        b.add(lo, limbGeo(legLen * 0.9, 0.055, 0.04, 5));
        const paw = safeDisplace(sphereGeo(0.07, 0), rng, 0.012, 9);
        place(paw, 0, -0.01, 0.03, 0, 0, 0, 1, 0.7, 1.3);
        b.add(foot, paw);
        for (let c = 0; c < 3; c++) {
          const claw = spikeGeo(0.08, 0.015, 3);
          place(claw, (c - 1) * 0.032, -0.03, 0.09, -1.7);
          b.add(foot, claw);
        }
      }

      b.add('tail', place(limbGeo(0.34, 0.06, 0.04, 5), 0, 0, 0, Math.PI * 0.5));
      b.add('tailTip', place(limbGeo(0.26, 0.04, 0.015, 5), 0, 0, 0, Math.PI * 0.5));
      if (v.wings) addWings(b, 'shoulderL', 'shoulderR', 1.0, true, rng);
    },
  };
}

function buildSerpent(v: MonsterVisual, rng: Rng): BuildResult {
  const segCount = Math.max(6, Math.min(12, Math.round(6 + (v.limbs ?? 0) + (v.ornate ?? 0.4) * 6)));
  const specs: BoneSpec[] = [
    { name: 'root', parent: null, x: 0, y: 0, z: 0 },
    { name: 'hips', parent: 'root', x: 0, y: 0.42, z: 0 },
  ];
  let parent = 'hips';
  for (let i = 0; i < segCount; i++) {
    const name = `seg${i}`;
    specs.push({ name, parent, x: 0, y: i === 0 ? 0 : 0.0, z: i === 0 ? 0.1 : -0.28 });
    parent = name;
  }
  specs.push({ name: 'chest', parent: 'hips', x: 0, y: 0.12, z: 0.3 });
  specs.push({ name: 'head', parent: 'chest', x: 0, y: 0.1, z: 0.26 });
  specs.push({ name: 'tail', parent: `seg${segCount - 1}`, x: 0, y: 0, z: -0.2 });

  return {
    specs,
    build: (b) => {
      const ornate = v.ornate ?? 0.4;
      for (let i = 0; i < segCount; i++) {
        const t = i / segCount;
        const r = 0.26 * (1 - t * 0.72);
        const seg = safeDisplace(sphereGeo(r, 1), rng, r * 0.16, 6);
        place(seg, 0, 0, -0.06, 0, 0, 0, 1, 0.86, 1.35);
        b.add(`seg${i}`, seg);
        if (ornate > 0.4 && i % 2 === 0) {
          const fin = spikeGeo(0.2 * ornate * (1 - t * 0.6), 0.03, 3);
          place(fin, 0, r * 0.8, -0.05, -0.25);
          b.add(`seg${i}`, fin);
        }
      }
      const hood = safeDisplace(sphereGeo(0.3, 1), rng, 0.04, 5);
      place(hood, 0, 0.02, 0, 0, 0, 0, 1.35, 1.1, 0.6);
      b.add('chest', hood);

      const skull = safeDisplace(sphereGeo(0.19, 1), rng, 0.025, 6);
      place(skull, 0, 0, 0.06, 0, 0, 0, 0.9, 0.72, 1.5);
      b.add('head', skull);
      for (let i = 0; i < 6; i++) {
        const fang = spikeGeo(0.09, 0.018, 3);
        place(fang, (i % 2 === 0 ? 1 : -1) * (0.03 + Math.floor(i / 2) * 0.03), -0.05, 0.2 - Math.floor(i / 2) * 0.04, 2.6);
        b.add('head', fang);
      }
      addEyes(b, 'head', v.eyes ?? 2, 0.03, 0.17, v.glow !== undefined);
      if (ornate > 0.5) addHorns(b, 'head', 2, 0.28 * ornate, 0.1, rng);
      b.add('tail', place(spikeGeo(0.4, 0.06, 5), 0, 0, 0, Math.PI * 0.5));
    },
  };
}

function buildArachnid(v: MonsterVisual, rng: Rng): BuildResult {
  const legs = Math.max(6, Math.min(10, v.limbs ?? 8));
  const pairs = Math.floor(legs / 2);
  const specs: BoneSpec[] = [
    { name: 'root', parent: null, x: 0, y: 0, z: 0 },
    { name: 'hips', parent: 'root', x: 0, y: 0.52, z: -0.24 },
    { name: 'chest', parent: 'hips', x: 0, y: 0.02, z: 0.34 },
    { name: 'spine', parent: 'hips', x: 0, y: 0, z: 0.16 },
    { name: 'head', parent: 'chest', x: 0, y: 0.03, z: 0.2 },
  ];
  for (let i = 0; i < pairs; i++) {
    for (const side of [1, -1]) {
      const s = side > 0 ? 'L' : 'R';
      specs.push({ name: `legHip${i}${s}`, parent: 'chest', x: side * 0.16, y: 0.0, z: 0.1 - i * 0.14 });
      specs.push({ name: `legKnee${i}${s}`, parent: `legHip${i}${s}`, x: side * 0.34, y: 0.16, z: 0 });
      specs.push({ name: `legFoot${i}${s}`, parent: `legKnee${i}${s}`, x: side * 0.2, y: -0.42, z: 0 });
    }
  }
  return {
    specs,
    build: (b) => {
      const ornate = v.ornate ?? 0.4;
      const abdomen = safeDisplace(sphereGeo(0.34, 2), rng, 0.05, 4);
      place(abdomen, 0, 0.02, -0.12, 0, 0, 0, 1, 0.92, 1.25);
      b.add('hips', abdomen);
      if (ornate > 0.3) {
        for (let i = 0; i < 5; i++) {
          const sp = spikeGeo(0.16 * ornate, 0.03, 4);
          place(sp, (i - 2) * 0.08, 0.24, -0.1 - Math.abs(i - 2) * 0.05, -0.5, 0, (i - 2) * 0.2);
          b.add('hips', sp);
        }
      }
      const cephal = safeDisplace(sphereGeo(0.22, 1), rng, 0.03, 6);
      place(cephal, 0, 0, 0.02, 0, 0, 0, 1.15, 0.8, 1);
      b.add('chest', cephal);

      const face = safeDisplace(sphereGeo(0.14, 1), rng, 0.02, 7);
      place(face, 0, -0.02, 0.04, 0, 0, 0, 1.1, 0.8, 0.9);
      b.add('head', face);
      addEyes(b, 'head', v.eyes ?? 8, 0.028, 0.16, v.glow !== undefined);
      for (const side of [1, -1]) {
        const fang = spikeGeo(0.16, 0.032, 4);
        place(fang, side * 0.05, -0.08, 0.1, 2.4, 0, side * 0.2);
        b.add('head', fang);
      }

      for (let i = 0; i < pairs; i++) {
        for (const side of [1, -1]) {
          const s = side > 0 ? 'L' : 'R';
          const femur = limbGeo(0.38, 0.038, 0.028, 4);
          place(femur, side * 0.17, 0.08, 0, 0, 0, side * -1.45);
          b.add(`legHip${i}${s}`, femur);
          const tibia = limbGeo(0.44, 0.028, 0.012, 4);
          place(tibia, side * 0.1, -0.2, 0, 0, 0, side * -0.45);
          b.add(`legKnee${i}${s}`, tibia);
        }
      }
    },
  };
}

function buildInsectoid(v: MonsterVisual, rng: Rng): BuildResult {
  const pairs = Math.max(2, Math.min(3, Math.floor((v.limbs ?? 6) / 2)));
  const specs: BoneSpec[] = [
    { name: 'root', parent: null, x: 0, y: 0, z: 0 },
    { name: 'hips', parent: 'root', x: 0, y: 0.6, z: -0.3 },
    { name: 'spine', parent: 'hips', x: 0, y: 0.02, z: 0.2 },
    { name: 'chest', parent: 'spine', x: 0, y: 0.04, z: 0.24 },
    { name: 'head', parent: 'chest', x: 0, y: 0.06, z: 0.2 },
    { name: 'jaw', parent: 'head', x: 0, y: -0.06, z: 0.1 },
  ];
  for (let i = 0; i < pairs; i++) {
    for (const side of [1, -1]) {
      const s = side > 0 ? 'L' : 'R';
      specs.push({ name: `legHip${i}${s}`, parent: 'chest', x: side * 0.14, y: -0.04, z: 0.08 - i * 0.16 });
      specs.push({ name: `legKnee${i}${s}`, parent: `legHip${i}${s}`, x: side * 0.24, y: 0.1, z: 0 });
      specs.push({ name: `legFoot${i}${s}`, parent: `legKnee${i}${s}`, x: side * 0.14, y: -0.34, z: 0 });
    }
  }
  if (v.wings) {
    specs.push({ name: 'wingL', parent: 'chest', x: 0.1, y: 0.16, z: -0.06 });
    specs.push({ name: 'wingR', parent: 'chest', x: -0.1, y: 0.16, z: -0.06 });
  }
  if (v.tail) specs.push({ name: 'tail', parent: 'hips', x: 0, y: 0.04, z: -0.28 });

  return {
    specs,
    build: (b) => {
      const ornate = v.ornate ?? 0.5;
      // Segmented chitin: three overlapping plates read as an insect abdomen.
      for (let i = 0; i < 3; i++) {
        const r = 0.26 - i * 0.05;
        const seg = safeDisplace(sphereGeo(r, 1), rng, 0.02, 7);
        place(seg, 0, 0.02 - i * 0.01, -0.02 - i * 0.2, 0, 0, 0, 1.05, 0.85, 1.1);
        b.add('hips', seg);
      }
      const thorax = safeDisplace(sphereGeo(0.22, 1), rng, 0.025, 6);
      place(thorax, 0, 0, 0, 0, 0, 0, 1.0, 0.9, 1.25);
      b.add('chest', thorax);
      if (ornate > 0.35) addPlates(b, 'chest', 4, 0.3, 0.14, 0.04, rng);

      const skull = safeDisplace(sphereGeo(0.15, 1), rng, 0.02, 7);
      place(skull, 0, 0, 0.03, 0, 0, 0, 1.1, 0.85, 1);
      b.add('head', skull);
      addEyes(b, 'head', v.eyes ?? 4, 0.032, 0.15, v.glow !== undefined);
      for (const side of [1, -1]) {
        const mand = spikeGeo(0.2, 0.028, 4);
        place(mand, side * 0.06, 0, 0.08, 1.5, 0, side * -0.3);
        b.add('jaw', mand);
      }
      if (ornate > 0.55) addHorns(b, 'head', 2, 0.3 * ornate, 0.08, rng);

      for (let i = 0; i < pairs; i++) {
        for (const side of [1, -1]) {
          const s = side > 0 ? 'L' : 'R';
          const femur = limbGeo(0.28, 0.034, 0.024, 4);
          place(femur, side * 0.12, 0.05, 0, 0, 0, side * -1.5);
          b.add(`legHip${i}${s}`, femur);
          const tibia = limbGeo(0.34, 0.024, 0.012, 4);
          place(tibia, side * 0.06, -0.15, 0, 0, 0, side * -0.35);
          b.add(`legKnee${i}${s}`, tibia);
        }
      }
      if (v.wings) {
        for (const [bone, side] of [
          ['wingL', 1],
          ['wingR', -1],
        ] as Array<[string, number]>) {
          for (let w = 0; w < 2; w++) {
            const wing = new THREE.PlaneGeometry(0.62, 0.2, 2, 1);
            place(wing, side * 0.32, 0.02 - w * 0.02, -0.1 - w * 0.14, -0.2, side * 0.25, side * 0.1);
            b.add(bone, wing);
          }
        }
      }
      if (v.tail) {
        b.add('tail', place(limbGeo(0.3, 0.06, 0.02, 5), 0, 0, 0, Math.PI * 0.42));
        b.add('tail', place(spikeGeo(0.2, 0.04, 4), 0, 0.16, -0.24, -0.9));
      }
    },
  };
}

function buildFloating(v: MonsterVisual, rng: Rng): BuildResult {
  const shards = Math.max(3, Math.min(9, Math.round(3 + (v.ornate ?? 0.4) * 7)));
  const specs: BoneSpec[] = [
    { name: 'root', parent: null, x: 0, y: 0, z: 0 },
    { name: 'hips', parent: 'root', x: 0, y: 1.0, z: 0 },
    { name: 'chest', parent: 'hips', x: 0, y: 0, z: 0 },
    { name: 'head', parent: 'chest', x: 0, y: 0.05, z: 0 },
    { name: 'halo', parent: 'chest', x: 0, y: 0, z: 0 },
    { name: 'tail', parent: 'hips', x: 0, y: -0.22, z: 0 },
  ];
  return {
    specs,
    build: (b) => {
      const core = safeDisplace(sphereGeo(0.3, 2), rng, 0.05, 3.5);
      b.add('chest', core);
      const iris = sphereGeo(0.15, 1);
      place(iris, 0, 0.02, 0.22);
      b.addGlow('head', iris);
      addEyes(b, 'head', Math.max(1, v.eyes ?? 1), 0.05, 0.3, true);

      // Orbiting shards, baked into the halo bone so one spin animates them all.
      for (let i = 0; i < shards; i++) {
        const a = (i / shards) * Math.PI * 2;
        const r = 0.5 + rng.range(-0.06, 0.1);
        const sh = new THREE.OctahedronGeometry(0.09 + rng.range(0, 0.06), 0);
        place(sh, Math.sin(a) * r, rng.range(-0.16, 0.16), Math.cos(a) * r, rng.range(0, 1), a, rng.range(0, 1));
        b.add('halo', sh);
      }
      // Trailing tendrils below.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const t = limbGeo(0.42 + rng.range(0, 0.2), 0.035, 0.006, 4);
        place(t, Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12, 0.18 * Math.cos(a), 0, -0.18 * Math.sin(a));
        b.add('tail', t);
      }
    },
  };
}

function buildOoze(v: MonsterVisual, rng: Rng): BuildResult {
  const specs: BoneSpec[] = [
    { name: 'root', parent: null, x: 0, y: 0, z: 0 },
    { name: 'hips', parent: 'root', x: 0, y: 0.4, z: 0 },
    { name: 'chest', parent: 'hips', x: 0, y: 0.06, z: 0 },
    { name: 'head', parent: 'chest', x: 0, y: 0.16, z: 0 },
    { name: 'shoulderL', parent: 'chest', x: 0.28, y: 0.0, z: 0 },
    { name: 'shoulderR', parent: 'chest', x: -0.28, y: 0.0, z: 0 },
  ];
  return {
    specs,
    build: (b) => {
      const blob = safeDisplace(sphereGeo(0.46, 3), rng, 0.1, 2.6);
      place(blob, 0, -0.04, 0, 0, 0, 0, 1.12, 0.78, 1.06);
      b.add('hips', blob);
      const upper = safeDisplace(sphereGeo(0.3, 2), rng, 0.07, 3.4);
      place(upper, 0, 0.1, 0, 0, 0, 0, 1, 0.9, 1);
      b.add('chest', upper);
      // Suspended debris: bones and coins the ooze has eaten.
      const bits = Math.round(3 + (v.ornate ?? 0.3) * 6);
      for (let i = 0; i < bits; i++) {
        const g = i % 2 === 0 ? new THREE.TetrahedronGeometry(0.07) : safeBevelBox(0.1, 0.05, 0.05, 0.01);
        place(
          g,
          rng.range(-0.24, 0.24),
          rng.range(-0.16, 0.2),
          rng.range(-0.22, 0.22),
          rng.range(0, 3),
          rng.range(0, 3),
          rng.range(0, 3),
        );
        b.add('hips', g);
      }
      const nucleus = sphereGeo(0.16, 1);
      place(nucleus, 0, 0.0, 0);
      b.addGlow('chest', nucleus);
      addEyes(b, 'head', v.eyes ?? 2, 0.045, 0.2, true);
      // Pseudopods.
      for (const [bone, side] of [
        ['shoulderL', 1],
        ['shoulderR', -1],
      ] as Array<[string, number]>) {
        const arm = safeDisplace(limbGeo(0.34, 0.1, 0.05, 5), rng, 0.03, 6);
        place(arm, 0, 0.04, 0, 0, 0, side * -0.5);
        b.add(bone, arm);
      }
    },
  };
}

function buildWinged(v: MonsterVisual, rng: Rng): BuildResult {
  const base = buildHumanoid({ ...v, wings: true }, rng, false);
  return {
    specs: base.specs,
    build: (b) => {
      base.build(b);
      // Winged silhouettes hover: shorten the legs into trailing tatters.
      const shroud = safeDisplace(
        safeLathe(
          [
            [0.02, -0.9],
            [0.22, -0.5],
            [0.3, -0.1],
            [0.24, 0.2],
            [0.04, 0.3],
          ],
          10,
        ),
        rng,
        0.06,
        3,
      );
      place(shroud, 0, -0.1, 0);
      b.add('hips', shroud);
    },
  };
}

function buildSwarm(v: MonsterVisual, rng: Rng): BuildResult {
  const n = Math.max(4, Math.min(10, Math.round(4 + (v.ornate ?? 0.4) * 6)));
  const specs: BoneSpec[] = [
    { name: 'root', parent: null, x: 0, y: 0, z: 0 },
    { name: 'hips', parent: 'root', x: 0, y: 0.5, z: 0 },
    { name: 'chest', parent: 'hips', x: 0, y: 0, z: 0 },
    { name: 'head', parent: 'chest', x: 0, y: 0.1, z: 0.16 },
  ];
  for (let i = 0; i < n; i++) specs.push({ name: `mote${i}`, parent: 'chest', x: 0, y: 0, z: 0 });
  return {
    specs,
    build: (b) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = 0.28 + rng.range(0, 0.24);
        const body = safeDisplace(sphereGeo(0.1 + rng.range(0, 0.05), 1), rng, 0.02, 8);
        place(body, Math.sin(a) * r, rng.range(-0.26, 0.26), Math.cos(a) * r, 0, 0, 0, 1, 0.8, 1.4);
        b.add(`mote${i}`, body);
        // Each mote gets a pair of stub wings so the cloud shimmers when it moves.
        for (const side of [1, -1]) {
          const w = new THREE.PlaneGeometry(0.16, 0.07, 1, 1);
          place(w, Math.sin(a) * r + side * 0.1, rng.range(-0.26, 0.26), Math.cos(a) * r, 0, 0, side * 0.4);
          b.add(`mote${i}`, w);
        }
      }
      addEyes(b, 'head', 2, 0.03, 0.16, true);
    },
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface MonsterModel {
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  skeleton: THREE.Skeleton | null;
}

/** What a monster is, beyond its visual: its family, and how important it is. */
export interface MonsterLookOpts {
  family?: string;
  /** 'normal' | 'champion' | 'elite' | 'rare' | 'boss'. */
  rank?: string;
}

interface Prototype {
  root: THREE.Group;
  boneNames: string[];
  archetype: Archetype;
  skeleton: THREE.Skeleton;
}

const prototypeCache = new Map<string, Prototype[]>();
const VARIANTS_PER_KEY = 3;

/** 0 rank and file, 1 champion, 2 elite or named rare, 3 boss. */
function rankTier(rank: string | undefined): number {
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

/** The glowing colour each rank wears, matching its nameplate. */
const RANK_GLOW: Record<string, number> = {
  champion: 0x6f8cff,
  elite: 0xf5d76e,
  rare: 0xffa040,
};

function cacheKey(v: MonsterVisual, opts: MonsterLookOpts): string {
  return [
    v.body,
    v.palette,
    v.glow ?? -1,
    (v.ornate ?? 0.3).toFixed(2),
    v.limbs ?? -1,
    v.tail ? 1 : 0,
    v.wings ? 1 : 0,
    v.eyes ?? -1,
    v.weapon ?? '-',
    opts.family ?? '-',
    opts.rank ?? 'normal',
  ].join('/');
}

// ---------------------------------------------------------------------------
// Family and rank dressing
// ---------------------------------------------------------------------------

/**
 * Bounds of everything already built on a bone, in that bone's space. The
 * dressing passes place horns, crowns, rags and plates against these, so one
 * rule fits a goblin's head and a colossus's alike.
 */
function boxOf(b: Builder, bone: string): THREE.Box3 | null {
  const box = new THREE.Box3();
  let any = false;
  for (const p of b.parts) {
    if (p.bone !== bone || p.mat !== 'body') continue;
    p.geo.computeBoundingBox();
    if (p.geo.boundingBox) {
      box.union(p.geo.boundingBox);
      any = true;
    }
  }
  return any ? box : null;
}

/** A horn: a curved spike swept back and out from a point on the head. */
function horn(len: number, r: number, curve = 0.6): THREE.BufferGeometry {
  try {
    return spike(len, r, 6, curve);
  } catch {
    return spikeGeo(len, r, 6);
  }
}

/** The second material each family wears, and its eye colour when it has none. */
const FAMILY_ALT: Record<string, string> = {
  undead: 'cloth.tattered|0x4e4a42',
  demon: 'metal.dark|0x3a2a28',
  beast: 'leather.worn|0x3a2c22',
  construct: 'metal.dark|0x4a4a50',
  insect: 'flesh.chitin|0x2e2a20',
  aberration: 'flesh.rotted|0x5a3a6a',
  elemental: 'stone.ash|0x3a3430',
  humanoid: 'cloth.tattered|0x5a4636',
  plant: 'cloth.linen|0x4f7a32',
  ooze: 'flesh.rotted|0x3a4a2a',
};

const FAMILY_EYE: Record<string, number> = {
  undead: 0x7cffb0,
  demon: 0xff5020,
  beast: 0xffc040,
  construct: 0x60c0ff,
  insect: 0xd0ff40,
  aberration: 0xe060ff,
  elemental: 0xffa030,
  humanoid: 0xffd890,
  plant: 0xc8ff60,
  ooze: 0xb0ff60,
};

/**
 * What makes a family read as itself before its name does: an undead's rags,
 * a demon's horns and burning seams, a beast's ears and hackles, a
 * construct's rivets and core, an insect's feelers, an aberration's eye
 * stalks, an elemental's orbiting shards, a humanoid's hood, a plant's leaves.
 */
function dressFamily(b: Builder, family: string | undefined, arch: Archetype): void {
  if (!family) return;
  const rng = b.rng;
  const head = boxOf(b, 'head');
  const chest = boxOf(b, 'chest');
  const hips = boxOf(b, 'hips');
  const upright = arch === 'humanoid' || arch === 'colossal' || arch === 'winged';
  const ornate = b.v.ornate ?? 0.3;
  const hs = head ? head.getSize(new THREE.Vector3()) : new THREE.Vector3(0.3, 0.3, 0.3);
  const hc = head ? head.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const cs = chest ? chest.getSize(new THREE.Vector3()) : new THREE.Vector3(0.4, 0.4, 0.4);
  const cc = chest ? chest.getCenter(new THREE.Vector3()) : new THREE.Vector3();

  switch (family) {
    case 'undead': {
      // A shroud rotted to rags, hanging from the hips.
      if (hips && upright && arch !== 'winged') {
        const hz = hips.getSize(new THREE.Vector3());
        const hcn = hips.getCenter(new THREE.Vector3());
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
          const len = hz.y * rng.range(1.2, 2.2);
          const rag = safeBevelBox(hz.x * 0.32, len, 0.012, 0.004);
          rag.translate(0, -len * 0.5, 0);
          place(rag, hcn.x + Math.sin(a) * hz.x * 0.5, hcn.y - hz.y * 0.1, hcn.z + Math.cos(a) * hz.z * 0.5, rng.range(-0.15, 0.15), a, rng.range(-0.1, 0.1));
          b.addAs('hips', rag, 'alt');
        }
      }
      if (chest && upright && arch !== 'winged') {
        // A torn mantle over the shoulders.
        const m = safeDisplace(sphereGeo(Math.max(cs.x, cs.z) * 0.52, 1), rng, 0.02, 6);
        place(m, cc.x, chest.max.y - cs.y * 0.18, cc.z - cs.z * 0.05, 0, 0, 0, 1.05, 0.32, 0.9);
        b.addAs('chest', m, 'alt');
      }
      break;
    }
    case 'demon': {
      if (head && ornate <= 0.35) {
        for (const s of [-1, 1]) {
          const h = horn(hs.y * 0.9, hs.x * 0.12, 0.8);
          place(h, hc.x + s * hs.x * 0.32, head.max.y - hs.y * 0.2, hc.z - hs.z * 0.05, -0.5, 0, s * 0.55);
          b.add('head', h);
        }
      }
      if (chest) {
        // Burning seams across the hide.
        for (let i = 0; i < 4; i++) {
          const seam = safeBevelBox(cs.x * rng.range(0.18, 0.32), cs.y * 0.025, 0.012, 0.003);
          place(seam, cc.x + rng.range(-0.3, 0.3) * cs.x, cc.y + rng.range(-0.3, 0.3) * cs.y, chest.max.z - cs.z * 0.06, 0, 0, rng.range(-0.8, 0.8));
          b.addGlow('chest', seam);
        }
      }
      break;
    }
    case 'beast': {
      if (head) {
        for (const s of [-1, 1]) {
          const ear = horn(hs.y * 0.45, hs.x * 0.14, 0.2);
          place(ear, hc.x + s * hs.x * 0.3, head.max.y - hs.y * 0.18, hc.z - hs.z * 0.18, -0.4, 0, s * 0.35);
          b.add('head', ear);
        }
      }
      // Hackles: a ridge of coarse fur down the back.
      for (const [bone, box] of [
        ['chest', chest],
        ['hips', hips],
      ] as Array<[string, THREE.Box3 | null]>) {
        if (!box) continue;
        const sz = box.getSize(new THREE.Vector3());
        const c = box.getCenter(new THREE.Vector3());
        for (let i = 0; i < 5; i++) {
          const t = i / 4 - 0.5;
          const tuft = horn(Math.max(sz.y, 0.2) * 0.32, Math.max(sz.x, 0.2) * 0.07, 0.4);
          if (upright) place(tuft, c.x, c.y + t * sz.y * 0.8, box.min.z + sz.z * 0.05, -2.2, 0, 0);
          else place(tuft, c.x, box.max.y - sz.y * 0.08, c.z + t * sz.z * 0.8, -0.9, 0, 0);
          b.addAs(bone, tuft, 'alt');
        }
      }
      break;
    }
    case 'construct': {
      if (chest) {
        // A furnace core behind a grille, and rivets round the plates.
        const core = sphereGeo(Math.min(cs.x, cs.y) * 0.16, 1);
        place(core, cc.x, cc.y + cs.y * 0.05, chest.max.z - cs.z * 0.08);
        b.addGlow('chest', core);
        const grille = new THREE.TorusGeometry(Math.min(cs.x, cs.y) * 0.2, Math.min(cs.x, cs.y) * 0.03, 5, 14);
        place(grille, cc.x, cc.y + cs.y * 0.05, chest.max.z - cs.z * 0.04);
        b.addAs('chest', grille, 'alt');
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rv = sphereGeo(Math.min(cs.x, cs.y) * 0.035, 0);
          place(rv, cc.x + Math.cos(a) * cs.x * 0.38, cc.y + Math.sin(a) * cs.y * 0.36, chest.max.z - cs.z * 0.12);
          b.addAs('chest', rv, 'alt');
        }
      }
      if (upright) {
        for (const [bone, s] of [
          ['shoulderL', 1],
          ['shoulderR', -1],
        ] as Array<[string, number]>) {
          const box = boxOf(b, bone);
          if (!box) continue;
          const sz = box.getSize(new THREE.Vector3());
          const plate = safeBevelBox(sz.x * 1.5, sz.x * 0.35, sz.x * 1.4, sz.x * 0.08);
          place(plate, s * sz.x * 0.2, box.max.y + sz.x * 0.05, 0, 0, 0, s * -0.35);
          b.addAs(bone, plate, 'alt');
        }
      }
      break;
    }
    case 'insect': {
      if (head) {
        for (const s of [-1, 1]) {
          const ant = limbGeo(hs.y * 1.6, hs.x * 0.035, hs.x * 0.015, 4);
          // limbGeo hangs down; turn it to sweep up and forward.
          ant.rotateX(Math.PI * 0.78);
          ant.rotateZ(s * 0.35);
          ant.translate(hc.x + s * hs.x * 0.18, head.max.y - hs.y * 0.1, hc.z + hs.z * 0.25);
          b.add('head', ant);
        }
      }
      if (hips) {
        const hz = hips.getSize(new THREE.Vector3());
        const c = hips.getCenter(new THREE.Vector3());
        for (let i = 0; i < 3; i++) {
          const ridge = safeDisplace(sphereGeo(Math.max(hz.x, hz.z) * 0.32, 1), rng, 0.01, 8);
          place(ridge, c.x, hips.max.y - hz.y * 0.12, c.z + (i - 1) * hz.z * 0.28, 0, 0, 0, 1.1, 0.22, 0.5);
          b.addAs('hips', ridge, 'alt');
        }
      }
      break;
    }
    case 'aberration': {
      const host = head ? 'head' : chest ? 'chest' : null;
      const box = head ?? chest;
      if (host && box) {
        const sz = box.getSize(new THREE.Vector3());
        const c = box.getCenter(new THREE.Vector3());
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 0.4;
          const len = sz.y * rng.range(0.7, 1.1);
          const stalk = limbGeo(len, sz.x * 0.05, sz.x * 0.03, 4);
          stalk.rotateX(Math.PI);
          place(stalk, c.x + Math.cos(a) * sz.x * 0.25, box.max.y - sz.y * 0.1, c.z + Math.sin(a) * sz.z * 0.2, rng.range(-0.4, 0.4), 0, rng.range(-0.5, 0.5));
          b.add(host, stalk);
          const eye = sphereGeo(sz.x * 0.08, 1);
          place(eye, c.x + Math.cos(a) * sz.x * 0.25, box.max.y - sz.y * 0.1 + len * 0.95, c.z + Math.sin(a) * sz.z * 0.2);
          b.addGlow(host, eye);
        }
      }
      if (hips && arch !== 'floating') {
        const hz = hips.getSize(new THREE.Vector3());
        const c = hips.getCenter(new THREE.Vector3());
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.3;
          const t = limbGeo(hz.y * 1.8, hz.x * 0.09, hz.x * 0.02, 5);
          place(t, c.x + Math.sin(a) * hz.x * 0.4, hips.min.y + hz.y * 0.2, c.z + Math.cos(a) * hz.z * 0.4, Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
          b.addAs('hips', t, 'alt');
        }
      }
      break;
    }
    case 'elemental': {
      if (chest) {
        // Shards of the element drifting about the shoulders.
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + rng.range(-0.2, 0.2);
          const sh = new THREE.OctahedronGeometry(Math.max(cs.x, cs.z) * rng.range(0.08, 0.14), 0);
          place(sh, cc.x + Math.cos(a) * cs.x * 0.85, chest.max.y + rng.range(-0.1, 0.25) * cs.y, cc.z + Math.sin(a) * cs.z * 0.85, rng.range(0, 2), rng.range(0, 2), 0, 1, 1.6, 1);
          b.addAs('chest', sh, i % 2 ? 'alt' : 'glow');
        }
        const core = sphereGeo(Math.min(cs.x, cs.y) * 0.15, 1);
        place(core, cc.x, cc.y, chest.max.z - cs.z * 0.1);
        b.addGlow('chest', core);
      }
      break;
    }
    case 'humanoid': {
      if (head && upright) {
        // A hood thrown up over the head.
        const hood = safeDisplace(sphereGeo(Math.max(hs.x, hs.z) * 0.62, 1), rng, 0.01, 8);
        place(hood, hc.x, hc.y + hs.y * 0.08, hc.z - hs.z * 0.12, 0, 0, 0, 1.0, 1.05, 1.08);
        b.addAs('head', hood, 'alt');
      }
      if (hips && upright) {
        const hz = hips.getSize(new THREE.Vector3());
        const c = hips.getCenter(new THREE.Vector3());
        const belt = new THREE.TorusGeometry(Math.max(hz.x, hz.z) * 0.5, hz.y * 0.07, 5, 18);
        place(belt, c.x, hips.max.y - hz.y * 0.2, c.z, Math.PI * 0.5, 0, 0, 1, 1, 0.8);
        b.addAs('hips', belt, 'alt');
        const pouch = safeBevelBox(hz.x * 0.2, hz.y * 0.3, hz.z * 0.15, 0.01);
        place(pouch, c.x + hz.x * 0.35, hips.max.y - hz.y * 0.45, c.z + hz.z * 0.3);
        b.addAs('hips', pouch, 'alt');
      }
      break;
    }
    case 'plant': {
      const leafy = (bone: string, box: THREE.Box3 | null, n: number) => {
        if (!box) return;
        const sz = box.getSize(new THREE.Vector3());
        const c = box.getCenter(new THREE.Vector3());
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
          const leaf = sphereGeo(Math.max(sz.x, sz.z) * 0.34, 1);
          leaf.scale(1, 0.14, 0.45);
          leaf.translate(Math.max(sz.x, sz.z) * 0.3, 0, 0);
          leaf.rotateZ(rng.range(0.2, 0.7));
          leaf.rotateY(-a);
          leaf.translate(c.x, box.max.y - sz.y * 0.15, c.z);
          b.addAs(bone, leaf, 'alt');
        }
      };
      leafy('head', head, 5);
      leafy('chest', chest, 4);
      if (head) {
        const bulb = sphereGeo(Math.max(hs.x, hs.z) * 0.16, 1);
        place(bulb, hc.x, head.max.y + hs.y * 0.08, hc.z);
        b.addGlow('head', bulb);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Rank you can see. A champion wears steel on its shoulders and a band of
 * blue light; an elite a gold crown of spikes, a spined back and a gold band;
 * a boss all of that grander, with a cape and a burning core. Read from across
 * the room, before the nameplate.
 */
function dressRank(b: Builder, tier: number, arch: Archetype): void {
  if (tier <= 0) return;
  const rng = b.rng;
  const head = boxOf(b, 'head');
  const chest = boxOf(b, 'chest');
  const upright = arch === 'humanoid' || arch === 'colossal' || arch === 'winged';
  const cs = chest ? chest.getSize(new THREE.Vector3()) : null;
  const cc = chest ? chest.getCenter(new THREE.Vector3()) : null;

  // Shoulder armour.
  let shouldered = false;
  for (const [bone, s] of [
    ['shoulderL', 1],
    ['shoulderR', -1],
  ] as Array<[string, number]>) {
    const box = upright ? boxOf(b, bone) : null;
    if (!box) continue;
    shouldered = true;
    const sz = box.getSize(new THREE.Vector3());
    // Sized off the arm, not off whatever already sits on the shoulder:
    // measuring an existing pauldron and its spikes made a boss's pads the
    // size of a mushroom cap.
    const arm = Math.min(sz.x, sz.z, sz.y * 0.4);
    const r = arm * (0.75 + tier * 0.12);
    const pad = safeDisplace(sphereGeo(r, 1), rng, r * 0.04, 6);
    place(pad, s * r * 0.25, box.max.y - r * 0.35, 0, 0, 0, s * -0.3, 1.05, 0.62, 1.1);
    b.addAs(bone, pad, 'trim');
    if (tier >= 2) {
      for (let k = 0; k < tier; k++) {
        const sp = horn(r * (1.1 - k * 0.2), r * 0.18, 0.2);
        place(sp, s * r * (0.45 + k * 0.1), box.max.y - r * 0.1, (k - (tier - 1) / 2) * r * 0.5, 0, 0, s * -(0.5 + k * 0.25));
        b.addAs(bone, sp, 'trim');
      }
    }
  }
  if (!shouldered && chest && cs && cc) {
    // Beasts and crawlers: armour plates over the back instead.
    for (let k = 0; k < 1 + tier; k++) {
      const plate = safeDisplace(sphereGeo(Math.max(cs.x, cs.z) * 0.32, 1), rng, 0.01, 6);
      place(plate, cc.x, chest.max.y - cs.y * 0.05, cc.z + (k - tier / 2) * cs.z * 0.28, 0, 0, 0, 1.1, 0.25, 0.6);
      b.addAs('chest', plate, 'trim');
    }
  }

  // A band of the rank's light around the chest.
  if (chest && cs && cc) {
    const band = new THREE.TorusGeometry(1, 0.06, 5, 20);
    band.rotateX(Math.PI * 0.5);
    const rx = cs.x * 0.53;
    const rz = cs.z * 0.53;
    band.scale(rx, Math.max(cs.y * 0.25, 0.05), rz);
    band.translate(cc.x, cc.y - cs.y * 0.05, cc.z);
    b.addAs('chest', band, tier >= 3 ? 'trim' : 'rank');
  }

  // A crown of spikes: elites and bosses.
  if (tier >= 2 && head) {
    const hs = head.getSize(new THREE.Vector3());
    const hc = head.getCenter(new THREE.Vector3());
    const n = tier >= 3 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const len = hs.y * (tier >= 3 ? 0.75 : 0.5) * (i % 2 ? 0.7 : 1);
      const sp = horn(len, hs.x * 0.07, 0);
      place(sp, hc.x + Math.cos(a) * hs.x * 0.36, head.max.y - hs.y * 0.18, hc.z + Math.sin(a) * hs.z * 0.36, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      b.addAs('head', sp, 'trim');
    }
    const circlet = new THREE.TorusGeometry(1, 0.08, 5, 18);
    circlet.rotateX(Math.PI * 0.5);
    circlet.scale(hs.x * 0.4, hs.y * 0.3, hs.z * 0.4);
    circlet.translate(hc.x, head.max.y - hs.y * 0.2, hc.z);
    b.addAs('head', circlet, 'trim');
  }

  // A spined back: elites and bosses.
  if (tier >= 2 && chest && cs && cc) {
    const n = tier >= 3 ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      const sp = horn(Math.max(cs.y, cs.z) * (tier >= 3 ? 0.45 : 0.3) * (1 - Math.abs(t)), Math.max(cs.x, 0.1) * 0.06, 0.3);
      if (upright) place(sp, cc.x, cc.y + t * cs.y * 0.8, chest.min.z + cs.z * 0.1, -2.0, 0, 0);
      else place(sp, cc.x, chest.max.y - cs.y * 0.05, cc.z + t * cs.z * 0.8, -0.6, 0, 0);
      b.addAs('chest', sp, 'trim');
    }
  }

  // Bosses: a burning core and a cape.
  if (tier >= 3 && chest && cs && cc) {
    const core = sphereGeo(Math.min(cs.x, cs.y) * 0.13, 1);
    place(core, cc.x, cc.y + cs.y * 0.08, chest.max.z - cs.z * 0.04);
    b.addGlow('chest', core);
    if (upright) {
      try {
        const cape = clothPanel(cs.x * 1.1, cs.y * 2.6, rng, { segsX: 6, segsY: 10, ripple: 0.04, flare: 0.5, tatter: 0.25 });
        cape.rotateY(Math.PI);
        cape.translate(cc.x, chest.max.y - cs.y * 0.08, chest.min.z - cs.z * 0.04);
        const pos = cape.getAttribute('position') as THREE.BufferAttribute;
        const top = chest.max.y - cs.y * 0.08;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - Math.max(0, top - pos.getY(i)) * 0.22);
        cape.computeVertexNormals();
        b.addAs('chest', cape, 'alt');
      } catch {
        /* a cape is a nicety */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function buildPrototype(v: MonsterVisual, rng: Rng, opts: MonsterLookOpts): Prototype {
  const archetype = monsterArchetype(v.body);
  let plan: BuildResult;
  switch (archetype) {
    case 'quadruped':
      plan = buildQuadruped(v, rng);
      break;
    case 'serpent':
      plan = buildSerpent(v, rng);
      break;
    case 'arachnid':
      plan = buildArachnid(v, rng);
      break;
    case 'insectoid':
      plan = buildInsectoid(v, rng);
      break;
    case 'floating':
      plan = buildFloating(v, rng);
      break;
    case 'ooze':
      plan = buildOoze(v, rng);
      break;
    case 'winged':
      plan = buildWinged(v, rng);
      break;
    case 'swarm':
      plan = buildSwarm(v, rng);
      break;
    case 'colossal':
      plan = buildHumanoid(v, rng, true);
      break;
    case 'humanoid':
    default:
      plan = buildHumanoid(v, rng, false);
      break;
  }

  const { root, bones } = buildBones(plan.specs);
  const builder = new Builder(rng, v);
  plan.build(builder);
  const tier = rankTier(opts.rank);
  dressFamily(builder, opts.family, archetype);
  dressRank(builder, tier, archetype);

  const isOoze = archetype === 'ooze';
  // Only actual metal is metal. Treating 'stone' as a construct put every
  // skeleton, bone and rock creature at 0.65 metalness — and a metal surface
  // with nothing to reflect renders black, which is why the whole bestiary came
  // out as identical dark lumps regardless of its palette tint.
  const isMetal = v.palette.startsWith('metal');
  const isStone = v.palette.startsWith('stone');
  const rough = isOoze ? 0.28 : isMetal ? 0.5 : isStone ? 0.78 : 0.85;
  const eye = v.glow ?? FAMILY_EYE[opts.family ?? ''] ?? 0xff6030;
  const altKey = FAMILY_ALT[opts.family ?? ''] ?? 'cloth.tattered|0x4a443c';
  const mats: Record<PartMat, THREE.Material> = {
    body: bodyMaterial(v.palette, rough, isMetal ? 0.7 : 0.02),
    glow: glowMaterial(eye, v.glow === undefined ? 1.4 : 2.2 + tier * 0.4),
    trim: bodyMaterial(tier >= 3 ? 'metal.gold|0xc8a050' : tier >= 2 ? 'metal.gold' : 'metal.steel', 0.45, 0.85),
    alt: bodyMaterial(altKey, altKey.startsWith('metal') ? 0.5 : 0.9, altKey.startsWith('metal') ? 0.7 : 0.02),
    rank: glowMaterial(RANK_GLOW[opts.rank ?? ''] ?? eye, 1.8),
  };

  // One skinned mesh per material for the whole creature, every vertex bound
  // rigidly to its bone. The old build was one mesh per bone, ~20 draw calls a
  // monster; this is three to five, which is what lets a floor hold a crowd.
  // Bones carry no bind-pose rotation, so bone space to model space is a pure
  // translation and the rigid binding is exact.
  root.updateMatrixWorld(true);
  const order = plan.specs.map((sp) => bones[sp.name]!).filter(Boolean);
  const index = new Map(order.map((bn, i) => [bn.name, i]));
  const buckets = new Map<PartMat, THREE.BufferGeometry[]>();
  for (const part of builder.parts) {
    const bone = bones[part.bone];
    if (!bone) {
      part.geo.dispose();
      continue;
    }
    const g = part.geo;
    g.applyMatrix4(bone.matrixWorld);
    skinRigid(g, index.get(bone.name) ?? 0);
    const list = buckets.get(part.mat) ?? [];
    list.push(g);
    buckets.set(part.mat, list);
  }
  const skeleton = new THREE.Skeleton(order);
  for (const [key, list] of buckets) {
    let geo: THREE.BufferGeometry;
    try {
      geo = mergeSkinned(list);
    } catch {
      continue;
    }
    for (const g of list) g.dispose();
    const mesh = new THREE.SkinnedMesh(geo, mats[key]);
    mesh.name = `monster.${key}`;
    mesh.castShadow = key !== 'glow' && key !== 'rank';
    mesh.receiveShadow = false;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    // Culling bounds: the bind-pose bounds, grown to cover a limb's swing.
    geo.computeBoundingSphere();
    mesh.boundingSphere = geo.boundingSphere!.clone();
    mesh.boundingSphere.radius *= 1.5;
  }

  // --- weapon -------------------------------------------------------------
  //
  // Built into the prototype rather than attached per instance, so a pack of
  // twelve archers still costs one bow's worth of geometry.
  if (v.weapon) {
    const hand = bones.handR ?? bones.handL;
    if (hand) {
      try {
        const model = buildItemModel(
          { shape: v.weapon, palette: WEAPON_PALETTE[v.weapon] ?? 'metal.iron' },
          rng.fork('weapon'),
          'normal',
        );
        // Item models are authored with the grip at the origin and the business
        // end along +Y, the same convention the player's hand sockets use.
        model.rotation.set(Math.PI * 0.92, 0, 0);
        model.position.set(0, -0.04, 0.03);
        model.scale.setScalar(v.weapon === 'bow' ? 1.5 : 1.25);
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        hand.add(model);
      } catch {
        // An unbuildable weapon must never cost us the monster.
      }
    }
  }

  root.updateMatrixWorld(true);
  return { root, boneNames: plan.specs.map((sp) => sp.name), archetype, skeleton };
}

/** What each monster weapon is made of. Cheap gear: iron, wood, bone. */
const WEAPON_PALETTE: Record<string, string> = {
  bow: 'wood.oak',
  staff: 'wood.rotted',
  sword: 'metal.rusted',
  axe: 'metal.rusted',
  mace: 'metal.dark',
  dagger: 'metal.rusted',
  spear: 'wood.oak',
};

/**
 * Builds a monster model. Repeat calls for the same visual reuse one of a small
 * pool of cached prototypes, so a pack of twelve ghouls shares three geometries.
 * `opts` says what family the creature belongs to and how important it is, so
 * the family reads in its silhouette and a champion, an elite and a boss look
 * tougher than the rank and file.
 */
export function buildMonsterModel(visual: MonsterVisual, rng: Rng, scale: number, opts: MonsterLookOpts = {}): MonsterModel {
  const key = cacheKey(visual, opts);
  let variants = prototypeCache.get(key);
  if (!variants) {
    variants = [];
    prototypeCache.set(key, variants);
  }
  const wanted = Math.min(VARIANTS_PER_KEY, 1 + Math.floor(rng.next() * VARIANTS_PER_KEY));
  while (variants.length < wanted) {
    variants.push(buildPrototype(visual, rng.fork(`proto:${key}:${variants.length}`), opts));
  }
  const proto = variants[Math.floor(rng.next() * variants.length)] ?? variants[0]!;

  const root = proto.root.clone(true) as THREE.Group;
  const bones: Record<string, THREE.Bone> = {};
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
  });
  // A clone shares its prototype's skeleton, which would make every ghoul in a
  // pack dance to the first one's bones. Each instance gets its own skeleton
  // over its own bones; the inverse bind matrices are shared, read-only.
  const own = new THREE.Skeleton(
    proto.skeleton.bones.map((bn) => bones[bn.name]!),
    proto.skeleton.boneInverses,
  );
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) sm.bind(own, sm.bindMatrix);
  });
  root.userData.monsterSkeleton = own;
  root.scale.setScalar(scale);
  // A touch of per-instance asymmetry so a pack does not look stamped.
  root.scale.x *= rng.range(0.96, 1.04);
  root.scale.z *= rng.range(0.96, 1.04);
  root.updateMatrixWorld(true);

  return { root, bones, skeleton: own };
}

/**
 * Frees what one spawned monster owns: its skeleton's bone texture. Geometry
 * and materials belong to the shared prototype cache and are left alone.
 */
export function releaseMonsterModel(root: THREE.Object3D): void {
  const skel = root.userData?.monsterSkeleton as THREE.Skeleton | undefined;
  if (skel) {
    skel.dispose();
    root.userData.monsterSkeleton = undefined;
  }
}

/** Releases every cached prototype, geometry and material. Call between runs. */
export function disposeMonsterModels(): void {
  for (const variants of prototypeCache.values()) {
    for (const p of variants) {
      p.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      p.skeleton.dispose();
    }
  }
  prototypeCache.clear();
  for (const m of materialCache.values()) m.dispose();
  materialCache.clear();
  for (const m of glowCache.values()) m.dispose();
  glowCache.clear();
}

// ---------------------------------------------------------------------------
// Rig animation
// ---------------------------------------------------------------------------

export type RigAction = 'idle' | 'walk' | 'attack' | 'cast' | 'hit' | 'death' | 'spawn';

export interface RigDriveOpts {
  /** 0 = standing, 1 = running flat out. */
  locomotion: number;
  /** Overriding one-shot pose. */
  action: RigAction;
  /** 0..1 progress through the action. */
  actionT: number;
  /** World time, for idle breathing and hover bob. */
  time: number;
  /** 0..1 death collapse progress. */
  deathT: number;
}

interface RestPose {
  bone: THREE.Bone;
  rx: number;
  ry: number;
  rz: number;
  py: number;
}

/**
 * Drives a monster rig. Poses are procedural (sin waves + action curves) rather
 * than keyframed: one function covers every monster in the game, costs a few
 * dozen float ops per enemy, and never needs an animation asset.
 */
export class RigAnimator {
  private rest: Record<string, RestPose> = {};
  private phase = 0;
  readonly archetype: Archetype;
  private readonly offset: number;

  constructor(
    private readonly root: THREE.Group,
    private readonly bones: Record<string, THREE.Bone>,
    archetype: Archetype,
    rng: Rng,
  ) {
    this.archetype = archetype;
    this.offset = rng.next() * Math.PI * 2;
    for (const [name, bone] of Object.entries(bones)) {
      this.rest[name] = { bone, rx: bone.rotation.x, ry: bone.rotation.y, rz: bone.rotation.z, py: bone.position.y };
    }
  }

  private set(name: string, rx: number, ry = 0, rz = 0): void {
    const r = this.rest[name];
    if (!r) return;
    r.bone.rotation.set(r.rx + rx, r.ry + ry, r.rz + rz);
  }

  private lift(name: string, dy: number): void {
    const r = this.rest[name];
    if (!r) return;
    r.bone.position.y = r.py + dy;
  }

  reset(): void {
    for (const r of Object.values(this.rest)) {
      r.bone.rotation.set(r.rx, r.ry, r.rz);
      r.bone.position.y = r.py;
    }
  }

  update(dt: number, o: RigDriveOpts): void {
    this.phase += dt * (1.4 + o.locomotion * 7.5);
    const t = this.phase + this.offset;
    this.reset();

    if (o.deathT > 0) {
      this.poseDeath(o.deathT);
      return;
    }

    switch (this.archetype) {
      case 'quadruped':
        this.poseQuadruped(t, o);
        break;
      case 'serpent':
        this.poseSerpent(t, o);
        break;
      case 'arachnid':
      case 'insectoid':
        this.poseManyLegged(t, o);
        break;
      case 'floating':
        this.poseFloating(t, o);
        break;
      case 'ooze':
        this.poseOoze(t, o);
        break;
      case 'swarm':
        this.poseSwarm(t, o);
        break;
      case 'winged':
        this.poseHumanoid(t, o, true);
        break;
      default:
        this.poseHumanoid(t, o, false);
        break;
    }

    this.applyAction(o);
  }

  // --- per-archetype locomotion -------------------------------------------

  private poseHumanoid(t: number, o: RigDriveOpts, hover: boolean): void {
    const g = o.locomotion;
    const swing = Math.sin(t) * (0.15 + g * 0.75);
    const swing2 = Math.sin(t + Math.PI) * (0.15 + g * 0.75);
    const bob = Math.abs(Math.sin(t)) * g * 0.09;
    const breathe = Math.sin(o.time * 1.6 + this.offset) * 0.03;

    if (hover) {
      this.lift('hips', Math.sin(o.time * 1.9 + this.offset) * 0.13 + 0.15);
      this.set('hipL', 0.35 + Math.sin(t * 0.6) * 0.1);
      this.set('hipR', 0.25 - Math.sin(t * 0.6) * 0.1);
      this.set('kneeL', -0.5);
      this.set('kneeR', -0.4);
    } else {
      this.lift('hips', bob);
      this.set('hipL', swing);
      this.set('hipR', swing2);
      this.set('kneeL', -Math.max(0, -swing) * 1.4 - g * 0.1);
      this.set('kneeR', -Math.max(0, -swing2) * 1.4 - g * 0.1);
      this.set('footL', Math.max(0, swing) * 0.4);
      this.set('footR', Math.max(0, swing2) * 0.4);
    }

    this.set('spine', breathe + g * 0.14, Math.sin(t) * g * 0.08);
    this.set('chest', breathe * 0.5, Math.sin(t + Math.PI) * g * 0.1);
    this.set('head', -g * 0.1 + Math.sin(o.time * 0.9 + this.offset) * 0.05, Math.sin(o.time * 0.6) * 0.09);
    this.set('shoulderL', swing2 * 0.85, 0, 0.15);
    this.set('shoulderR', swing * 0.85, 0, -0.15);
    this.set('elbowL', -0.35 - Math.max(0, swing2) * 0.5);
    this.set('elbowR', -0.35 - Math.max(0, swing) * 0.5);
    if (this.bones.tail) {
      this.set('tail', Math.sin(t * 0.8) * 0.12 - 0.1, Math.sin(t * 0.5) * 0.25);
      this.set('tailTip', Math.sin(t * 0.8 + 1) * 0.2, Math.sin(t * 0.5 + 1) * 0.3);
    }
    if (this.bones.wingL) {
      const flap = Math.sin(o.time * (hover ? 5.5 : 2.2) + this.offset);
      this.set('wingL', flap * 0.2, 0, -0.45 - flap * 0.6);
      this.set('wingR', flap * 0.2, 0, 0.45 + flap * 0.6);
    }
  }

  private poseQuadruped(t: number, o: RigDriveOpts): void {
    const g = o.locomotion;
    const a = Math.sin(t) * (0.12 + g * 0.85);
    const b = Math.sin(t + Math.PI) * (0.12 + g * 0.85);
    this.lift('hips', Math.abs(Math.sin(t * 2)) * g * 0.07);
    this.set('shoulderL', a);
    this.set('shoulderR', b);
    this.set('hipL', b);
    this.set('hipR', a);
    this.set('elbowL', -Math.max(0, -a) * 1.2 - 0.15);
    this.set('elbowR', -Math.max(0, -b) * 1.2 - 0.15);
    this.set('kneeL', -Math.max(0, -b) * 1.2 - 0.15);
    this.set('kneeR', -Math.max(0, -a) * 1.2 - 0.15);
    this.set('spine', Math.sin(t * 2) * g * 0.08 - g * 0.1);
    this.set('neck', -g * 0.22 + Math.sin(o.time * 1.2 + this.offset) * 0.05);
    this.set('head', g * 0.15, Math.sin(o.time * 0.8) * 0.1);
    this.set('tail', Math.sin(t * 0.9) * 0.18 + 0.2, Math.sin(t * 0.6) * 0.35);
    this.set('tailTip', Math.sin(t * 0.9 + 1.2) * 0.25, Math.sin(t * 0.6 + 1) * 0.4);
  }

  private poseSerpent(t: number, o: RigDriveOpts): void {
    const amp = 0.16 + o.locomotion * 0.3;
    let i = 0;
    for (;;) {
      const name = `seg${i}`;
      if (!this.bones[name]) break;
      this.set(name, Math.sin(t * 0.8 + i * 0.35) * amp * 0.25, Math.sin(t + i * 0.55) * amp);
      i++;
    }
    this.lift('hips', Math.sin(o.time * 1.8 + this.offset) * 0.05);
    this.set('chest', -0.12 + Math.sin(o.time * 1.4) * 0.06, Math.sin(t + 0.4) * amp * 0.6);
    this.set('head', Math.sin(o.time * 2.1 + this.offset) * 0.08, Math.sin(t + 0.8) * amp * 0.5);
    this.set('tail', Math.sin(t + i * 0.55) * amp * 1.5);
  }

  private poseManyLegged(t: number, o: RigDriveOpts): void {
    const g = o.locomotion;
    const amp = 0.14 + g * 0.6;
    for (let i = 0; i < 5; i++) {
      for (const s of ['L', 'R']) {
        const hip = `legHip${i}${s}`;
        if (!this.bones[hip]) continue;
        // Alternating tripod gait: adjacent legs are a half-cycle apart.
        const ph = t * 1.6 + i * 1.1 + (s === 'L' ? 0 : Math.PI);
        this.set(hip, Math.sin(ph) * amp * 0.5, Math.sin(ph) * amp);
        this.set(`legKnee${i}${s}`, -Math.max(0, Math.sin(ph)) * amp * 1.3);
        this.set(`legFoot${i}${s}`, Math.max(0, -Math.sin(ph)) * amp);
      }
    }
    this.lift('hips', Math.abs(Math.sin(t * 1.6)) * g * 0.05);
    this.set('chest', Math.sin(t * 1.6) * g * 0.05);
    this.set('head', Math.sin(o.time * 2.4 + this.offset) * 0.06, Math.sin(o.time * 1.1) * 0.12);
    this.set('jaw', Math.sin(o.time * 6 + this.offset) * 0.14 + 0.1);
    if (this.bones.wingL) {
      const flap = Math.sin(o.time * 26 + this.offset);
      this.set('wingL', 0, 0, flap * 0.35);
      this.set('wingR', 0, 0, -flap * 0.35);
    }
    if (this.bones.tail) this.set('tail', -0.5 + Math.sin(o.time * 1.6) * 0.15, Math.sin(o.time) * 0.2);
  }

  private poseFloating(t: number, o: RigDriveOpts): void {
    this.lift('hips', Math.sin(o.time * 1.35 + this.offset) * 0.16);
    const halo = this.rest.halo;
    if (halo) halo.bone.rotation.y = halo.ry + o.time * (0.55 + o.locomotion * 1.4);
    this.set('chest', Math.sin(o.time * 0.9) * 0.08, Math.sin(o.time * 0.6) * 0.12);
    this.set('head', Math.sin(o.time * 1.7) * 0.05, Math.sin(o.time * 1.1) * 0.14);
    this.set('tail', Math.sin(t * 0.9) * 0.16, 0, Math.sin(t * 0.7) * 0.16);
  }

  private poseOoze(t: number, o: RigDriveOpts): void {
    const squash = 1 + Math.sin(t * 1.6) * (0.06 + o.locomotion * 0.14);
    const hips = this.rest.hips;
    if (hips) {
      hips.bone.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      hips.bone.position.y = hips.py + (squash - 1) * 0.12;
    }
    this.set('chest', Math.sin(t * 1.2) * 0.1, Math.sin(t * 0.8) * 0.14);
    this.set('head', Math.sin(t * 1.4) * 0.12);
    this.set('shoulderL', 0, 0, Math.sin(t * 1.3) * 0.4);
    this.set('shoulderR', 0, 0, -Math.sin(t * 1.3 + 0.6) * 0.4);
  }

  private poseSwarm(t: number, o: RigDriveOpts): void {
    let i = 0;
    for (;;) {
      const name = `mote${i}`;
      const r = this.rest[name];
      if (!r) break;
      const ph = t * 1.3 + i * 2.4;
      r.bone.position.set(
        Math.sin(ph) * 0.12,
        r.py + Math.sin(ph * 1.7 + i) * 0.18,
        Math.cos(ph * 0.8) * 0.12,
      );
      r.bone.rotation.set(r.rx, r.ry + Math.sin(ph) * 0.5, r.rz);
      i++;
    }
    const chest = this.rest.chest;
    if (chest) chest.bone.rotation.y = chest.ry + o.time * 0.7;
    this.lift('hips', Math.sin(o.time * 2.1 + this.offset) * 0.1);
  }

  // --- action overlays -----------------------------------------------------

  private applyAction(o: RigDriveOpts): void {
    const k = o.actionT;
    if (o.action === 'idle' || o.action === 'walk' || k <= 0) return;
    switch (o.action) {
      case 'attack': {
        // Wind back on the first 45%, snap through on the rest.
        const wind = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55;
        const strike = k < 0.45 ? -wind * 1.4 : -1.4 + ((k - 0.45) / 0.55) * 3.2;
        this.set('shoulderR', strike, 0, -0.2 - wind * 0.5);
        this.set('elbowR', -0.5 + wind * 0.9);
        this.set('shoulderL', strike * 0.4, 0, 0.2);
        this.set('chest', 0, -strike * 0.22);
        this.set('spine', wind * 0.18);
        this.set('head', -wind * 0.15);
        if (this.bones.jaw) this.set('jaw', 0.6 * wind);
        break;
      }
      case 'cast': {
        const rise = Math.min(1, k * 2.2);
        const shake = Math.sin(k * 40) * 0.05 * rise;
        this.set('shoulderL', -1.9 * rise + shake, 0, 0.7 * rise);
        this.set('shoulderR', -1.9 * rise - shake, 0, -0.7 * rise);
        this.set('elbowL', -0.6 * rise);
        this.set('elbowR', -0.6 * rise);
        this.set('head', -0.35 * rise);
        this.set('chest', -0.2 * rise);
        this.lift('hips', rise * 0.06);
        break;
      }
      case 'hit': {
        const f = 1 - k;
        this.set('chest', f * 0.4);
        this.set('head', f * 0.5);
        this.set('spine', f * 0.25);
        this.set('shoulderL', f * 0.5, 0, f * 0.4);
        this.set('shoulderR', f * 0.5, 0, -f * 0.4);
        break;
      }
      case 'spawn': {
        const f = 1 - k;
        this.root.scale.multiplyScalar(1);
        this.set('spine', f * 0.9);
        this.set('chest', f * 0.6);
        this.set('head', f * 0.8);
        this.lift('hips', -f * 0.5);
        break;
      }
      default:
        break;
    }
  }

  private poseDeath(k: number): void {
    const e = Math.min(1, k);
    const ease = e * e;
    this.lift('hips', -0.55 * ease);
    this.set('hips', 1.15 * ease);
    this.set('spine', 0.5 * ease);
    this.set('chest', 0.4 * ease);
    this.set('head', 0.9 * ease);
    this.set('shoulderL', -0.8 * ease, 0, 1.1 * ease);
    this.set('shoulderR', -0.8 * ease, 0, -1.1 * ease);
    this.set('elbowL', -0.9 * ease);
    this.set('elbowR', -0.9 * ease);
    this.set('hipL', -1.3 * ease);
    this.set('hipR', -1.1 * ease);
    this.set('kneeL', 1.5 * ease);
    this.set('kneeR', 1.3 * ease);
    if (this.bones.tail) this.set('tail', 0.7 * ease);
    let i = 0;
    for (;;) {
      const name = `seg${i}`;
      if (!this.bones[name]) break;
      this.set(name, 0.3 * ease, Math.sin(i) * 0.5 * ease);
      i++;
    }
    for (let l = 0; l < 5; l++) {
      for (const s of ['L', 'R']) {
        if (!this.bones[`legHip${l}${s}`]) continue;
        this.set(`legHip${l}${s}`, 0, (s === 'L' ? 1 : -1) * 1.2 * ease);
        this.set(`legKnee${l}${s}`, 1.6 * ease);
      }
    }
  }
}

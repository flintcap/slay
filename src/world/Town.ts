/**
 * SLAY — the hub camp.
 *
 * Not a town: a camp. Everyone here arrived recently, nobody is staying, and
 * the only reason the place exists is that it is the last defensible ground
 * before the descent. That reading drives every choice below — a timber
 * palisade thrown up in a forest clearing rather than a stone plaza, canvas and
 * lean-tos rather than buildings, a fire people actually stand around rather
 * than a monument, and clutter everywhere: crates half unpacked, firewood
 * stacked against a wall, washing on a line, a cart with its wheel off.
 *
 * The composition is a ring. The fire is the centre and the only thing lighting
 * the middle of the camp; the four services sit around it at the cardinal
 * points with their own smaller warm lights; the palisade closes the ring; and
 * the gate breaks it to the north, where the ground drops away into the dark.
 * Cold moonlight and cold fog outside, warm firelight inside, so leaving reads
 * as leaving somewhere safe.
 *
 * Everything here is generated: no meshes, no textures, no props are loaded.
 */

import * as THREE from 'three';
import type { CharClassId, Rng } from '../types';
import { Noise, clamp } from '../art/Noise';
import { surface } from '../art/Materials';
import { displace, mergeGeometries, rock, stoneBlock, taperedBox, clothPanel, limb } from '../art/Meshes';
import { buildPlayerModel } from '../art/CharacterModels';
import { Animator } from '../art/Animation';
import { Random } from '../core/RNG';

export interface TownBuild {
  root: THREE.Group;
  colliders: Array<{ x: number; z: number; w: number; d: number }>;
  npcSpots: Record<string, THREE.Vector3>;
  portalSpot: THREE.Vector3;
  /** Emitter positions the scene feeds to its particle system. */
  smokeSpots: THREE.Vector3[];
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------

function safeSurface(key: string, opts?: Record<string, unknown>): THREE.Material {
  try {
    const m = surface(key, opts as never);
    if (m) return m;
  } catch {
    /* fall through */
  }
  return new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.9 });
}

interface Ctx {
  root: THREE.Group;
  colliders: TownBuild['colliders'];
  geo: THREE.BufferGeometry[];
  mat: THREE.Material[];
  lights: THREE.Light[];
  /** Animated emissive/flicker records. */
  flames: Array<{ light: THREE.PointLight; base: number; phase: number; flicker: number; mesh?: THREE.Mesh }>;
  spin: Array<{ obj: THREE.Object3D; speed: number; axis: 'y' | 'x' }>;
  /** Things that sway: banners, washing, hanging pelts. */
  sway: Array<{ obj: THREE.Object3D; phase: number; amp: number; axis: 'x' | 'z' }>;
  npcs: Animator[];
  /** Static geometry accumulating per material, merged before hand-off. */
  batches: Map<string, THREE.BufferGeometry[]>;
  smoke: THREE.Vector3[];
  rng: Rng;
  noise: Noise;
}

type Mats = Record<string, THREE.Material>;

function keep<T extends THREE.BufferGeometry>(ctx: Ctx, g: T): T {
  ctx.geo.push(g);
  return g;
}

/**
 * Bakes a piece into a shared, pre-transformed buffer instead of giving it its
 * own mesh.
 *
 * The camp is made of a few hundred palisade stakes, fifty-odd trees and a
 * carpet of loose stones. As individual meshes that is well over a thousand
 * draw calls before a single character is drawn, and this is the screen the
 * player sees between every run. Anything static and repeated goes through
 * here and comes out the far side as one mesh per material.
 */
const _mtx = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3(1, 1, 1);

function bake(
  ctx: Ctx,
  geo: THREE.BufferGeometry,
  matKey: string,
  x: number, y: number, z: number,
  rot: [number, number, number] = [0, 0, 0],
  scale = 1,
): void {
  _euler.set(rot[0], rot[1], rot[2]);
  _quat.setFromEuler(_euler);
  _pos.set(x, y, z);
  _scl.setScalar(scale);
  _mtx.compose(_pos, _quat, _scl);
  geo.applyMatrix4(_mtx);
  let list = ctx.batches.get(matKey);
  if (!list) {
    list = [];
    ctx.batches.set(matKey, list);
  }
  list.push(geo);
}

/** Merges every baked bucket into one mesh each and drops the sources. */
function flushBatches(ctx: Ctx, mats: Mats): void {
  for (const [key, list] of ctx.batches) {
    const geo = mergeGeometries(list);
    for (const g of list) g.dispose();
    ctx.geo.push(geo);
    const mesh = new THREE.Mesh(geo, mats[key] ?? mats.stone);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Merged bounds span the whole camp, so per-mesh culling would only ever
    // be all-or-nothing anyway.
    mesh.frustumCulled = false;
    ctx.root.add(mesh);
  }
  ctx.batches.clear();
}

function add(ctx: Ctx, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  keep(ctx, geo);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  ctx.root.add(m);
  return m;
}

function addBox(
  ctx: Ctx, w: number, h: number, d: number,
  x: number, y: number, z: number,
  mat: THREE.Material, ry = 0, collide = false,
): THREE.Mesh {
  const m = add(ctx, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, ry);
  if (collide) ctx.colliders.push({ x, z, w: Math.max(w, d), d: Math.max(w, d) });
  return m;
}

function addCyl(
  ctx: Ctx, rt: number, rb: number, h: number, seg: number,
  x: number, y: number, z: number,
  mat: THREE.Material, collide = false,
): THREE.Mesh {
  const m = add(ctx, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y + h / 2, z);
  if (collide) ctx.colliders.push({ x, z, w: rb * 2, d: rb * 2 });
  return m;
}

/** A warm point light plus its emissive bulb, registered for flicker. */
/**
 * `lit` decides whether this lantern is a real light or only a glowing bulb.
 *
 * The camp wants dozens of visible flames, but every real point light lands in
 * every lit surface's shader — fifty of them is a per-pixel loop fifty long, on
 * the screen the player sees between every single run. So most lanterns are
 * emissive geometry only: bloom makes them read as light sources, and a handful
 * of real lights do the actual work.
 */
function addLantern(
  ctx: Ctx, x: number, y: number, z: number,
  color: number, intensity: number, distance: number,
  flicker = 0.6, radius = 0.13, lit = true,
): void {
  const bulbMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  ctx.mat.push(bulbMat);
  const bulb = new THREE.Mesh(keep(ctx, new THREE.SphereGeometry(radius, 8, 6)), bulbMat);
  bulb.position.set(x, y, z);
  ctx.root.add(bulb);

  if (!lit) {
    // Still flickers — the bulb is what the eye reads at this distance.
    ctx.flames.push({
      light: { intensity: 0 } as THREE.PointLight,
      base: 0, phase: ctx.rng.range(0, 100), flicker, mesh: bulb,
    });
    return;
  }

  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.position.set(x, y, z);
  light.castShadow = false;
  ctx.root.add(light);
  ctx.lights.push(light);
  ctx.flames.push({ light, base: intensity, phase: ctx.rng.range(0, 100), flicker, mesh: bulb });
}

// --- reusable camp furniture ------------------------------------------------

/** A barrel: staves that bulge at the belly plus two iron hoops. */
function barrel(ctx: Ctx, m: Mats, x: number, z: number, s = 1, tipped = false): void {
  const body = addCyl(ctx, 0.3 * s, 0.26 * s, 0.86 * s, 12, x, 0, z, m.wood, !tipped);
  const belly = add(ctx, new THREE.CylinderGeometry(0.34 * s, 0.34 * s, 0.42 * s, 12), m.wood, x, 0.43 * s, z);
  for (const t of [0.2, 0.68]) {
    add(ctx, new THREE.TorusGeometry(0.325 * s, 0.022 * s, 5, 14), m.iron, x, t * 0.86 * s, z).rotation.x = Math.PI / 2;
  }
  if (tipped) {
    for (const o of [body, belly]) {
      o.rotation.z = Math.PI * 0.5;
      o.position.y = 0.3 * s;
    }
  }
}

/** A crate: boards with a visible frame, because a plain cube reads as a bug. */
function crate(ctx: Ctx, m: Mats, x: number, y: number, z: number, s = 1, ry = 0): void {
  addBox(ctx, 0.72 * s, 0.66 * s, 0.72 * s, x, y, z, m.wood, ry, y < 0.1);
  for (const sx of [-1, 1]) {
    addBox(ctx, 0.06 * s, 0.7 * s, 0.78 * s, x + sx * 0.35 * s, y - 0.02 * s, z, m.woodDark, ry);
  }
  addBox(ctx, 0.78 * s, 0.07 * s, 0.78 * s, x, y + 0.3 * s, z, m.woodDark, ry);
}

/** A grain sack: a slumped, lumpy form. */
function sack(ctx: Ctx, m: Mats, x: number, y: number, z: number, s = 1, rng: Rng): void {
  const g = keep(ctx, taperedBox(0.44 * s, 0.4 * s, 0.3 * s, 0.26 * s, 0.5 * s, 0.09 * s));
  displace(g, rng, 0.03 * s, 7);
  const mesh = new THREE.Mesh(g, m.canvas);
  mesh.position.set(x, y + 0.25 * s, z);
  mesh.rotation.set(rng.range(-0.1, 0.1), rng.range(0, 6.2), rng.range(-0.1, 0.1));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ctx.root.add(mesh);
}

/** A stack of split firewood. */
function woodpile(ctx: Ctx, m: Mats, x: number, z: number, ry: number, rows: number, rng: Rng): void {
  for (let r = 0; r < rows; r++) {
    const n = 5 - Math.floor(r / 2);
    for (let i = 0; i < n; i++) {
      const g = keep(ctx, new THREE.CylinderGeometry(0.075, 0.085, 1.5, 6));
      const log = new THREE.Mesh(g, m.wood);
      log.rotation.set(0, ry, Math.PI * 0.5);
      log.position.set(
        x + Math.cos(ry) * 0,
        0.09 + r * 0.16,
        z + (i - (n - 1) / 2) * 0.185 + rng.range(-0.02, 0.02),
      );
      log.position.x += Math.sin(ry) * ((i - (n - 1) / 2) * 0.0);
      log.castShadow = true;
      log.receiveShadow = true;
      ctx.root.add(log);
    }
  }
  ctx.colliders.push({ x, z, w: 1.7, d: 1.3 });
}

/** A line of washing or drying pelts, hung between two posts. */
function washLine(ctx: Ctx, m: Mats, x1: number, z1: number, x2: number, z2: number, count: number, rng: Rng): void {
  addCyl(ctx, 0.05, 0.07, 2.4, 6, x1, 0, z1, m.wood, true);
  addCyl(ctx, 0.05, 0.07, 2.4, 6, x2, 0, z2, m.wood, true);
  const rope = keep(ctx, new THREE.CylinderGeometry(0.012, 0.012, Math.hypot(x2 - x1, z2 - z1), 4));
  const line = new THREE.Mesh(rope, m.rope);
  line.position.set((x1 + x2) / 2, 2.3, (z1 + z2) / 2);
  line.rotation.set(0, Math.atan2(x2 - x1, z2 - z1), Math.PI * 0.5);
  ctx.root.add(line);

  for (let i = 0; i < count; i++) {
    const t = (i + 0.7) / (count + 0.4);
    const w = rng.range(0.4, 0.7);
    const h = rng.range(0.5, 1.0);
    const g = keep(ctx, clothPanel(w, h, rng, { segsX: 4, segsY: 6, ripple: 0.06, flare: 0.15, tatter: rng.next() < 0.3 ? 0.25 : 0 }));
    const cloth = new THREE.Mesh(g, rng.next() < 0.5 ? m.canvas : m.linen);
    cloth.position.set(x1 + (x2 - x1) * t, 2.28 - h * 0.5, z1 + (z2 - z1) * t);
    cloth.rotation.y = Math.atan2(x2 - x1, z2 - z1) + Math.PI * 0.5;
    cloth.castShadow = true;
    ctx.root.add(cloth);
    ctx.sway.push({ obj: cloth, phase: rng.range(0, 100), amp: 0.055, axis: 'x' });
  }
}

/** A rack of spare weapons — the camp is armed even when nobody is holding one. */
function weaponRack(ctx: Ctx, m: Mats, x: number, z: number, ry: number, rng: Rng): void {
  addCyl(ctx, 0.06, 0.08, 1.5, 6, x - Math.cos(ry) * 0.7, 0, z + Math.sin(ry) * 0.7, m.wood, true);
  addCyl(ctx, 0.06, 0.08, 1.5, 6, x + Math.cos(ry) * 0.7, 0, z - Math.sin(ry) * 0.7, m.wood, true);
  addBox(ctx, 1.6, 0.08, 0.12, x, 1.4, z, m.wood, ry);
  for (let i = 0; i < 5; i++) {
    const t = (i / 4 - 0.5) * 1.3;
    const px = x + Math.cos(ry) * t;
    const pz = z - Math.sin(ry) * t;
    const len = rng.range(1.1, 1.7);
    const haft = new THREE.Mesh(keep(ctx, new THREE.CylinderGeometry(0.028, 0.032, len, 5)), m.wood);
    haft.position.set(px, len * 0.5, pz);
    haft.rotation.z = rng.range(-0.12, 0.12);
    haft.castShadow = true;
    ctx.root.add(haft);
    const head = new THREE.Mesh(
      keep(ctx, taperedBox(0.09, 0.03, 0.02, 0.012, 0.3, 0.008)),
      m.iron,
    );
    head.position.set(px, len + 0.13, pz);
    head.rotation.z = haft.rotation.z;
    head.castShadow = true;
    ctx.root.add(head);
  }
}

/** A conifer: stacked skirts of needles on a bare trunk. */
function pine(ctx: Ctx, m: Mats, x: number, z: number, h: number, rng: Rng): void {
  void m;
  bake(ctx, limb(h * 0.9, h * 0.02, h * 0.045, 6), 'bark', x, 0, z);
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    bake(
      ctx, new THREE.ConeGeometry(h * (0.26 - t * 0.17), h * 0.24, 8, 1), 'needle',
      x, h * (0.3 + t * 0.62), z, [0, rng.range(0, 6.2), 0],
    );
  }
  ctx.colliders.push({ x, z, w: 1.1, d: 1.1 });
}

/** A camp resident. Idle-animated, so the place is never a still life. */
function npc(ctx: Ctx, classId: CharClassId, x: number, z: number, facing: number, seed: number): void {
  try {
    const built = buildPlayerModel(classId, new Random(seed));
    built.root.position.set(x, 0, z);
    built.root.rotation.y = facing;
    built.root.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) {
        mm.castShadow = true;
        mm.receiveShadow = true;
      }
    });
    ctx.root.add(built.root);
    const anim = new Animator(built.bones);
    anim.play('idle', { fade: 0 });
    anim.timeScale = 0.7 + (seed % 7) * 0.06;
    ctx.npcs.push(anim);
    ctx.colliders.push({ x, z, w: 0.8, d: 0.8 });
  } catch {
    // A camp with one fewer resident beats a camp that fails to load.
  }
}

// ---------------------------------------------------------------------------

export function buildTown(rng: Rng): TownBuild {
  const root = new THREE.Group();
  root.name = 'camp';

  const ctx: Ctx = {
    root, colliders: [], geo: [], mat: [], lights: [], flames: [], spin: [], sway: [],
    npcs: [], batches: new Map(), smoke: [], rng, noise: new Noise(0x70ad),
  };

  const mats: Mats = {
    dirt: safeSurface('ground.dirt', { repeat: 16, tint: 0x8d8478, roughness: 0.98 }),
    path: safeSurface('ground.dirt', { repeat: 7, tint: 0xa2968a, roughness: 0.99 }),
    grass: safeSurface('ground.grass', { repeat: 20, roughness: 0.98 }),
    stone: safeSurface('stone.town', { repeat: 2.2 }),
    darkStone: safeSurface('stone.crypt', { repeat: 1.6, tint: 0x6a6a72 }),
    wood: safeSurface('wood.oak', { repeat: 2.4 }),
    woodDark: safeSurface('wood.oak', { repeat: 3.2, tint: 0x6d4c2e }),
    bark: safeSurface('wood.bark', { repeat: 3 }),
    needle: safeSurface('foliage.pine', { repeat: 4 }),
    iron: safeSurface('metal.iron', { roughness: 0.6, metalness: 0.85, repeat: 2 }),
    bronze: safeSurface('metal.bronze', { roughness: 0.34, metalness: 1, repeat: 2 }),
    canvas: safeSurface('cloth.undyed', { repeat: 4, side: THREE.DoubleSide }),
    linen: safeSurface('cloth.linen', { repeat: 4, side: THREE.DoubleSide }),
    banner: safeSurface('cloth.banner', { repeat: 2, side: THREE.DoubleSide }),
    rope: safeSurface('leather.worn', { repeat: 6 }),
    hide: safeSurface('leather.worn', { repeat: 3, side: THREE.DoubleSide }),
  };

  buildGround(ctx, mats);
  buildCampfire(ctx, mats);

  const npcSpots: Record<string, THREE.Vector3> = {};

  const forgeAt = new THREE.Vector3(-13, 0, 5);
  buildForge(ctx, mats, forgeAt);
  npcSpots.blacksmith = new THREE.Vector3(forgeAt.x + 3.0, 0, forgeAt.z + 1.6);

  const wagonAt = new THREE.Vector3(13, 0, 5);
  buildWagon(ctx, mats, wagonAt);
  npcSpots.vendor = new THREE.Vector3(wagonAt.x - 2.8, 0, wagonAt.z + 1.4);
  npcSpots.merchant = npcSpots.vendor.clone();

  const stashAt = new THREE.Vector3(-12.5, 0, -8);
  buildSupplyTent(ctx, mats, stashAt);
  npcSpots.stash = new THREE.Vector3(stashAt.x + 2.6, 0, stashAt.z + 1.2);

  const cairnAt = new THREE.Vector3(12.5, 0, -8.5);
  buildCairn(ctx, mats, cairnAt);
  npcSpots.memorial = new THREE.Vector3(cairnAt.x - 2.4, 0, cairnAt.z + 1.4);

  const portalSpot = new THREE.Vector3(0, 0, -20.5);
  buildGate(ctx, mats, portalSpot);
  npcSpots.portal = new THREE.Vector3(portalSpot.x, 0, portalSpot.z + 3.2);
  npcSpots.gate = npcSpots.portal.clone();

  // Lantern posts along the ring road between the stations. Each one is a warm
  // pool the player walks through, which is what stops the middle distance
  // reading as one flat brown field.
  const posts: Array<[number, number]> = [
    [-7.5, 9.5], [7.5, 9.5], [-17.5, -1.5], [17.5, -1.5], [-7.0, -13.5], [7.0, -13.5],
    [-5.0, 16.5], [5.0, 16.5], [-14.0, 15.0], [14.0, 15.0], [0, 19.0],
    [-19.0, 6.0], [19.0, 6.0], [-16.0, -12.5], [16.0, -12.5],
  ];
  for (let pi = 0; pi < posts.length; pi++) {
    const [lx, lz] = posts[pi];
    addCyl(ctx, 0.07, 0.1, 3.0, 7, lx, 0, lz, mats.wood, true);
    const arm = add(ctx, new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5), mats.iron, lx, 3.0, lz);
    arm.rotation.z = Math.PI * 0.5;
    add(ctx, new THREE.CylinderGeometry(0.14, 0.2, 0.34, 7, 1, true), mats.iron, lx + 0.24, 2.86, lz);
    addLantern(ctx, lx + 0.24, 2.86, lz, 0xffb964, 20, 24, 0.55, 0.1, pi % 2 === 0);
  }

  buildPalisade(ctx, mats);
  buildLivingQuarters(ctx, mats);
  buildForest(ctx, mats);
  flushBatches(ctx, mats);

  // --- residents ---------------------------------------------------------
  npc(ctx, 'warden', forgeAt.x + 1.4, forgeAt.z + 0.4, 2.3, 101);
  npc(ctx, 'pyromancer', wagonAt.x - 1.5, wagonAt.z + 0.5, -2.3, 202);
  npc(ctx, 'shadowblade', stashAt.x + 1.6, stashAt.z + 0.4, 1.2, 303);
  npc(ctx, 'stormcaller', cairnAt.x - 1.3, cairnAt.z + 0.6, -1.1, 404);
  npc(ctx, 'shadowblade', -3.6, 4.4, 0.6, 505);
  npc(ctx, 'warden', 3.4, 4.8, -0.7, 606);
  npc(ctx, 'stormcaller', -1.2, -14.6, 0.15, 707);
  npc(ctx, 'warden', 2.0, -14.4, -0.15, 808);

  // --- ambience ----------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x627cb0, 0x453626, 2.9);
  root.add(hemi);
  ctx.lights.push(hemi);

  // Moonlight through the trees: cold, low, and the only shadow caster that
  // covers the whole camp.
  const moon = new THREE.DirectionalLight(0x9db2e2, 1.35);
  moon.position.set(-26, 32, -16);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 110;
  moon.shadow.camera.left = -32;
  moon.shadow.camera.right = 32;
  moon.shadow.camera.top = 32;
  moon.shadow.camera.bottom = -32;
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.035;
  root.add(moon);
  root.add(moon.target);
  ctx.lights.push(moon);

  // A dim cool bounce from the opposite side. Without it every surface facing
  // away from both the moon and the fire falls to pure black, and the camp
  // reads as a handful of lit objects rather than as a place.
  const bounce = new THREE.DirectionalLight(0x7c8cb4, 0.8);
  bounce.position.set(20, 14, 22);
  root.add(bounce);
  ctx.lights.push(bounce);

  return {
    root,
    colliders: ctx.colliders,
    npcSpots,
    portalSpot,
    smokeSpots: ctx.smoke,
    update(dt: number, elapsed: number): void {
      for (const f of ctx.flames) {
        const slow = ctx.noise.simplex2(elapsed * 1.5 + f.phase, f.phase * 0.31);
        const fast = ctx.noise.simplex2(elapsed * 6.8 + f.phase * 1.7, 3.3);
        const v = clamp(1 + (slow * 0.15 + fast * 0.07) * f.flicker * 2.0, 0.62, 1.4);
        f.light.intensity = f.base * v;
        if (f.mesh) {
          const s = 0.88 + v * 0.2;
          f.mesh.scale.set(s, s * 1.12, s);
        }
      }
      for (const s of ctx.spin) {
        if (s.axis === 'y') s.obj.rotation.y += s.speed * dt;
        else s.obj.rotation.x += s.speed * dt;
      }
      // Wind. One shared gust envelope so the whole camp breathes together
      // rather than every cloth waving on its own clock.
      const gust = 0.55 + 0.45 * Math.sin(elapsed * 0.31);
      for (const w of ctx.sway) {
        const a = Math.sin(elapsed * 1.7 + w.phase) * w.amp * gust;
        if (w.axis === 'x') w.obj.rotation.x = a;
        else w.obj.rotation.z = a;
      }
      for (const a of ctx.npcs) a.update(dt);
    },
    dispose(): void {
      for (const g of ctx.geo) g.dispose();
      for (const m of ctx.mat) m.dispose();
      for (const l of ctx.lights) {
        const d = l as THREE.Light & { dispose?: () => void };
        d.dispose?.();
      }
      ctx.geo.length = 0;
      ctx.mat.length = 0;
      ctx.lights.length = 0;
      ctx.flames.length = 0;
      ctx.spin.length = 0;
      ctx.sway.length = 0;
      ctx.npcs.length = 0;
      root.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function buildGround(ctx: Ctx, m: Mats): void {
  // Turf, lumpy, running out past the palisade into the trees.
  const turf = keep(ctx, new THREE.PlaneGeometry(96, 96, 64, 64));
  displace(turf, ctx.rng.fork('turf'), 0.35, 0.055);
  turf.rotateX(-Math.PI / 2);
  const turfMesh = new THREE.Mesh(turf, m.grass);
  turfMesh.position.y = -0.3;
  turfMesh.receiveShadow = true;
  ctx.root.add(turfMesh);

  // The camp floor: everything inside the palisade is trodden to bare earth.
  const floor = keep(ctx, new THREE.CircleGeometry(23, 40));
  const fpos = floor.getAttribute('position') as THREE.BufferAttribute;
  const n = new Noise(0x3122);
  for (let i = 0; i < fpos.count; i++) {
    const x = fpos.getX(i);
    const y = fpos.getY(i);
    // Nibble the rim so the camp does not end on a drawn circle.
    const d = Math.hypot(x, y);
    if (d > 21) {
      const a = Math.atan2(y, x);
      const s = 1 + n.simplex2(Math.cos(a) * 2.4, Math.sin(a) * 2.4) * 0.06;
      fpos.setXY(i, x * s, y * s);
    }
    // Kept shallow and entirely above the turf plane. Dipping below it let hard
    // green triangles punch through the dirt wherever the two surfaces crossed.
    fpos.setZ(i, n.simplex2(x * 0.13, y * 0.13) * 0.07 + n.simplex2(x * 0.5, y * 0.5) * 0.025);
  }
  floor.computeVertexNormals();
  floor.rotateX(-Math.PI / 2);
  const floorMesh = new THREE.Mesh(floor, m.dirt);
  floorMesh.position.y = 0.06;
  floorMesh.receiveShadow = true;
  ctx.root.add(floorMesh);

  // Paths worn between the fire and each station: paler, flatter, slightly
  // proud of the dirt so they catch the firelight.
  const spokes: Array<[number, number, number]> = [
    [-13, 5, 2.6], [13, 5, 2.6], [-12.5, -8, 2.4], [12.5, -8.5, 2.4], [0, -19, 3.4],
  ];
  for (const [tx, tz, w] of spokes) {
    const len = Math.hypot(tx, tz);
    const strip = keep(ctx, new THREE.PlaneGeometry(w, len, 4, 12));
    const spos = strip.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < spos.count; i++) {
      spos.setX(i, spos.getX(i) + n.simplex2(spos.getY(i) * 0.2, 4) * 0.5);
    }
    strip.computeVertexNormals();
    strip.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(strip, m.path);
    mesh.position.set(tx * 0.5, 0.05, tz * 0.5);
    mesh.rotation.y = Math.atan2(tx, tz) + Math.PI / 2;
    mesh.receiveShadow = true;
    ctx.root.add(mesh);
  }

  // Loose stones and tussocks, so the ground is never empty.
  for (let i = 0; i < 60; i++) {
    const a = ctx.rng.range(0, Math.PI * 2);
    const d = ctx.rng.range(6, 30);
    const s = ctx.rng.range(0.1, 0.34);
    bake(
      ctx, rock(s, ctx.rng.fork(`r${i}`), 0), d < 22 ? 'stone' : 'grass',
      Math.cos(a) * d, s * 0.25, Math.sin(a) * d,
      [ctx.rng.range(0, 3), ctx.rng.range(0, 3), ctx.rng.range(0, 3)],
    );
  }
}

function buildCampfire(ctx: Ctx, m: Mats): void {
  const rng = ctx.rng;

  // Fire ring: a circle of hauled stones, each one different.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng.range(-0.08, 0.08);
    const s = rng.range(0.28, 0.46);
    const r = new THREE.Mesh(keep(ctx, rock(s, rng.fork(`fr${i}`), 1)), m.stone);
    r.position.set(Math.cos(a) * 1.85, s * 0.4, Math.sin(a) * 1.85);
    r.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
    // No shadows from anything sitting inside the fire ring. The light source
    // is directly above them, so each one painted a hard black wedge halfway
    // across the camp — the single ugliest thing in the frame.
    r.castShadow = false;
    r.receiveShadow = true;
    ctx.root.add(r);
  }

  // Ash bed and criss-crossed logs.
  add(ctx, new THREE.CircleGeometry(1.7, 20).rotateX(-Math.PI / 2), m.darkStone, 0, 0.06, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI + rng.range(-0.2, 0.2);
    const log = new THREE.Mesh(keep(ctx, limb(1.9, 0.11, 0.14, 6)), m.bark);
    log.position.set(Math.cos(a) * -0.5, 0.32 + i * 0.06, Math.sin(a) * -0.5);
    log.rotation.set(Math.PI * 0.5 - 0.24, a, 0);
    log.castShadow = false;
    ctx.root.add(log);
  }

  // The flame body. Emissive cones rather than a sphere: a fire has licks.
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false, transparent: true, opacity: 0.92 });
  ctx.mat.push(flameMat);
  const flameGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const h = rng.range(0.7, 1.35);
    const lick = new THREE.Mesh(keep(ctx, new THREE.ConeGeometry(rng.range(0.16, 0.3), h, 7)), flameMat);
    lick.position.set(Math.cos(a) * 0.28, 0.5 + h * 0.4, Math.sin(a) * 0.28);
    lick.rotation.set(Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2);
    flameGroup.add(lick);
  }
  flameGroup.position.y = 0.1;
  ctx.root.add(flameGroup);

  // The camp's key light. The only shadow-casting point light here, because a
  // point light shadow costs six renders of the scene and this one earns it:
  // it is what throws everybody's shadow out across the dirt.
  const fire = new THREE.PointLight(0xff9440, 40, 28, 2);
  // Raised well above the logs. At flame height every log around the ring threw
  // a shadow the length of the camp, and those hard black wedges read as broken
  // geometry rather than as firelight.
  fire.position.set(0, 2.6, 0);
  fire.castShadow = true;
  fire.shadow.mapSize.set(1024, 1024);
  fire.shadow.camera.near = 0.6;
  fire.shadow.camera.far = 24;
  fire.shadow.bias = -0.004;
  fire.shadow.normalBias = 0.06;
  fire.shadow.radius = 3;
  ctx.root.add(fire);
  ctx.lights.push(fire);
  ctx.flames.push({ light: fire, base: 46, phase: 3.1, flicker: 0.85, mesh: flameGroup as unknown as THREE.Mesh });
  ctx.smoke.push(new THREE.Vector3(0, 1.6, 0));

  // Cooking tripod and cauldron over the fire.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = new THREE.Mesh(keep(ctx, limb(3.0, 0.03, 0.05, 5)), m.wood);
    leg.position.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5);
    leg.rotation.set(Math.cos(a) * 0.48, 0, -Math.sin(a) * 0.48);
    leg.castShadow = false;
    ctx.root.add(leg);
  }
  const pot = add(ctx, new THREE.SphereGeometry(0.42, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), m.iron, 0, 2.0, 0);
  pot.rotation.x = Math.PI;
  pot.castShadow = false;
  add(ctx, new THREE.TorusGeometry(0.4, 0.03, 5, 16), m.iron, 0, 2.0, 0).rotation.x = Math.PI / 2;

  // Sitting logs and bedrolls around the fire — the reason to believe people
  // gather here rather than walk past.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    const x = Math.cos(a) * 3.4;
    const z = Math.sin(a) * 3.4;
    const log = new THREE.Mesh(keep(ctx, limb(2.4, 0.24, 0.28, 8)), m.bark);
    log.position.set(x, 0.26, z);
    log.rotation.set(Math.PI * 0.5, -a + Math.PI * 0.5, 0);
    log.castShadow = true;
    log.receiveShadow = true;
    ctx.root.add(log);
    ctx.colliders.push({ x, z, w: 2.2, d: 0.8 });

    if (i % 2 === 0) {
      const roll = new THREE.Mesh(keep(ctx, limb(1.5, 0.17, 0.19, 7)), m.canvas);
      roll.position.set(Math.cos(a + 0.5) * 4.6, 0.18, Math.sin(a + 0.5) * 4.6);
      roll.rotation.set(Math.PI * 0.5, -a, 0);
      roll.castShadow = true;
      ctx.root.add(roll);
    }
  }

  // Standards flanking the fire, catching the updraught.
  for (const s of [-1, 1]) {
    const px = s * 5.6;
    const pz = -2.4;
    addCyl(ctx, 0.06, 0.09, 4.4, 7, px, 0, pz, m.wood, true);
    const g = keep(ctx, clothPanel(0.9, 2.2, ctx.rng, { segsX: 5, segsY: 9, ripple: 0.06, flare: 0.2, tatter: 0.15 }));
    const banner = new THREE.Mesh(g, m.banner);
    banner.position.set(px, 3.0, pz);
    banner.rotation.y = s * 0.4;
    banner.castShadow = true;
    ctx.root.add(banner);
    ctx.sway.push({ obj: banner, phase: s * 3, amp: 0.09, axis: 'x' });
  }
}

function buildForge(ctx: Ctx, m: Mats, at: THREE.Vector3): void {
  const { x, z } = at;
  const rng = ctx.rng;

  // Open lean-to: four posts, a beam, and a shingled slope. No walls — you
  // should be able to see the smith working from across the camp.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addCyl(ctx, 0.13, 0.17, sz < 0 ? 3.9 : 2.9, 7, x + sx * 3.0, 0, z + sz * 2.4, m.wood, true);
    }
  }
  addBox(ctx, 6.6, 0.22, 0.26, x, 3.85, z - 2.4, m.woodDark);
  addBox(ctx, 6.6, 0.22, 0.26, x, 2.85, z + 2.4, m.woodDark);
  for (let i = 0; i < 9; i++) {
    const board = addBox(ctx, 0.74, 0.1, 5.4, x - 3.0 + i * 0.75, 3.3, z, m.wood);
    board.rotation.x = -0.185;
    board.position.y = 3.35 - 0.02 * i;
  }

  // Forge hearth: stone box, iron hood, chimney, and a bed of live coals.
  addBox(ctx, 2.4, 1.05, 1.5, x - 1.5, 0, z - 1.7, m.stone, 0, true);
  const hood = keep(ctx, new THREE.CylinderGeometry(0.45, 1.6, 1.7, 4, 1, true));
  hood.rotateY(Math.PI / 4);
  const hoodMesh = new THREE.Mesh(hood, m.iron);
  hoodMesh.position.set(x - 1.5, 2.2, z - 1.7);
  hoodMesh.castShadow = true;
  ctx.root.add(hoodMesh);
  addCyl(ctx, 0.36, 0.4, 2.6, 8, x - 1.5, 3.0, z - 1.7, m.stone);
  ctx.smoke.push(new THREE.Vector3(x - 1.5, 5.8, z - 1.7));

  const coalMat = new THREE.MeshBasicMaterial({ color: 0xff5a14, toneMapped: false });
  ctx.mat.push(coalMat);
  const coals = new THREE.Mesh(keep(ctx, new THREE.BoxGeometry(1.9, 0.16, 0.95)), coalMat);
  coals.position.set(x - 1.5, 1.1, z - 1.7);
  ctx.root.add(coals);

  const forge = new THREE.PointLight(0xff5a18, 30, 17, 2);
  forge.position.set(x - 1.5, 1.5, z - 1.35);
  ctx.root.add(forge);
  ctx.lights.push(forge);
  ctx.flames.push({ light: forge, base: 30, phase: 11.4, flicker: 1.0, mesh: coals });

  // Anvil on a stump, hammer resting on it.
  addCyl(ctx, 0.4, 0.48, 0.66, 9, x + 1.3, 0, z + 0.1, m.wood, true);
  addBox(ctx, 0.66, 0.18, 0.38, x + 1.3, 0.66, z + 0.1, m.iron);
  addBox(ctx, 0.3, 0.26, 0.26, x + 1.3, 0.84, z + 0.1, m.iron);
  const horn = add(ctx, taperedBox(0.24, 0.3, 0.06, 0.1, 0.5, 0.02), m.iron, x + 1.86, 1.18, z + 0.1);
  horn.rotation.z = Math.PI * 0.5;
  addBox(ctx, 0.94, 0.2, 0.4, x + 1.32, 1.1, z + 0.1, m.iron);
  const hammer = add(ctx, new THREE.CylinderGeometry(0.03, 0.035, 0.62, 5), m.wood, x + 1.1, 1.32, z + 0.34);
  hammer.rotation.set(0, 0.4, Math.PI * 0.5);
  addBox(ctx, 0.11, 0.11, 0.24, x + 1.38, 1.26, z + 0.42, m.iron, 0.4);

  // Quench trough, grindstone, tool wall.
  addBox(ctx, 1.4, 0.58, 0.76, x + 2.5, 0, z - 1.4, m.wood, 0, true);
  addBox(ctx, 1.26, 0.05, 0.64, x + 2.5, 0.56, z - 1.4, m.iron);
  const wheel = add(ctx, new THREE.CylinderGeometry(0.46, 0.46, 0.14, 16), m.stone, x - 2.9, 0.9, z + 1.6);
  wheel.rotation.z = Math.PI * 0.5;
  ctx.spin.push({ obj: wheel, speed: 0.9, axis: 'x' });
  addCyl(ctx, 0.07, 0.09, 0.9, 6, x - 2.9, 0, z + 1.6, m.wood, true);

  // Ingots, barrel, offcuts.
  for (let i = 0; i < 5; i++) {
    addBox(ctx, 0.44, 0.12, 0.2, x - 2.6, 0.02 + i * 0.13, z - 0.4 + (i % 2) * 0.05, m.bronze, rng.range(-0.1, 0.1));
  }
  barrel(ctx, m, x + 2.9, z + 1.7, 0.95);
  woodpile(ctx, m, x - 0.4, z + 2.9, 0, 4, rng);
  weaponRack(ctx, m, x + 3.4, z + 0.2, Math.PI * 0.5, rng);
  addLantern(ctx, x + 2.4, 3.0, z + 2.0, 0xffb35c, 8, 12, 0.7, 0.11);
}

function buildWagon(ctx: Ctx, m: Mats, at: THREE.Vector3): void {
  const { x, z } = at;
  const rng = ctx.rng;

  // Bed and sides.
  addBox(ctx, 4.6, 0.32, 2.3, x, 1.0, z, m.wood);
  for (const sz of [-1, 1]) addBox(ctx, 4.6, 0.62, 0.14, x, 1.32, z + sz * 1.15, m.woodDark);
  addBox(ctx, 0.14, 0.62, 2.3, x - 2.3, 1.32, z, m.woodDark);

  // Hooped canvas tilt — the shape that says "caravan" from any angle.
  for (let i = 0; i < 5; i++) {
    const hx = x - 1.9 + i * 0.95;
    const hoop = add(ctx, new THREE.TorusGeometry(1.15, 0.045, 5, 14, Math.PI), m.wood, hx, 1.32, z);
    hoop.rotation.y = Math.PI * 0.5;
  }
  const tilt = keep(ctx, new THREE.CylinderGeometry(1.2, 1.2, 4.3, 16, 3, true, 0, Math.PI));
  const tiltMesh = new THREE.Mesh(tilt, m.canvas);
  tiltMesh.position.set(x, 1.32, z);
  tiltMesh.rotation.set(0, 0, Math.PI * 0.5);
  tiltMesh.castShadow = true;
  tiltMesh.receiveShadow = true;
  ctx.root.add(tiltMesh);

  // Wheels: rim, hub and spokes.
  for (const sx of [-1.5, 1.6]) {
    for (const sz of [-1, 1]) {
      const wx = x + sx;
      const wz = z + sz * 1.24;
      const r = sx < 0 ? 0.72 : 0.92;
      const rim = add(ctx, new THREE.TorusGeometry(r, 0.075, 6, 18), m.woodDark, wx, r, wz);
      rim.rotation.y = Math.PI * 0.5;
      add(ctx, new THREE.CylinderGeometry(0.11, 0.11, 0.24, 8), m.wood, wx, r, wz).rotation.z = Math.PI * 0.5;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const spoke = add(ctx, new THREE.CylinderGeometry(0.03, 0.035, r * 2, 4), m.wood, wx, r, wz);
        spoke.rotation.set(a, Math.PI * 0.5, 0);
      }
    }
  }
  ctx.colliders.push({ x, z, w: 5.0, d: 2.8 });

  // Tailgate counter with the goods laid out on it.
  addBox(ctx, 2.4, 0.1, 1.0, x + 2.9, 1.15, z, m.wood, 0, true);
  for (const sz of [-1, 1]) addCyl(ctx, 0.07, 0.09, 1.15, 5, x + 3.8, 0, z + sz * 0.4, m.wood);
  for (let i = 0; i < 6; i++) {
    const gx = x + 2.2 + (i % 3) * 0.6;
    const gz = z - 0.3 + Math.floor(i / 3) * 0.55;
    if (i % 3 === 0) add(ctx, new THREE.SphereGeometry(0.11, 8, 6), m.bronze, gx, 1.32, gz);
    else if (i % 3 === 1) addCyl(ctx, 0.07, 0.09, 0.26, 7, gx, 1.2, gz, m.iron);
    else add(ctx, taperedBox(0.16, 0.12, 0.1, 0.08, 0.24, 0.02), m.canvas, gx, 1.32, gz);
  }
  // Hanging wares under the tilt lip.
  for (let i = 0; i < 5; i++) {
    const gx = x - 1.7 + i * 0.85;
    addCyl(ctx, 0.014, 0.014, 0.4, 4, gx, 2.1, z + 1.1, m.iron);
    add(ctx, taperedBox(0.2, 0.1, 0.14, 0.07, 0.3, 0.02), m.linen, gx, 1.95, z + 1.1);
  }

  crate(ctx, m, x - 3.0, 0, z + 1.3, 1.0, 0.3);
  crate(ctx, m, x - 2.9, 0.68, z + 1.35, 0.85, -0.2);
  sack(ctx, m, x - 3.4, 0, z - 0.6, 1.1, rng);
  sack(ctx, m, x - 2.7, 0, z - 1.1, 0.95, rng);
  barrel(ctx, m, x + 3.6, z + 1.6, 1.0);
  barrel(ctx, m, x + 3.4, z - 1.8, 0.9, true);

  addLantern(ctx, x + 3.8, 2.0, z + 0.4, 0xffc06a, 8, 12, 0.5, 0.11);
  addLantern(ctx, x - 2.0, 2.3, z + 1.2, 0xffc06a, 6, 10, 0.5, 0.09);
}

function buildSupplyTent(ctx: Ctx, m: Mats, at: THREE.Vector3): void {
  const { x, z } = at;
  const rng = ctx.rng;

  // A ridge tent: two uprights, a ridge pole, canvas draped over, guy ropes
  // pegged out. The guy ropes are what sell it as canvas rather than a wedge.
  addCyl(ctx, 0.07, 0.09, 3.4, 6, x, 0, z - 2.6, m.wood, true);
  addCyl(ctx, 0.07, 0.09, 3.4, 6, x, 0, z + 2.6, m.wood, true);
  const ridge = add(ctx, new THREE.CylinderGeometry(0.06, 0.06, 5.4, 6), m.wood, x, 3.4, z);
  ridge.rotation.x = Math.PI * 0.5;

  for (const sx of [-1, 1]) {
    const panel = keep(ctx, new THREE.PlaneGeometry(5.4, 3.9, 8, 5));
    displace(panel, rng.fork(`t${sx}`), 0.05, 1.4);
    const mesh = new THREE.Mesh(panel, m.canvas);
    mesh.position.set(x + sx * 1.28, 1.75, z);
    mesh.rotation.set(0, Math.PI * 0.5, sx * 0.34 + (sx > 0 ? 0 : Math.PI));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ctx.root.add(mesh);
  }
  // Back wall, front left open.
  const back = keep(ctx, new THREE.PlaneGeometry(2.9, 3.4, 4, 4));
  const bmesh = new THREE.Mesh(back, m.canvas);
  bmesh.position.set(x, 1.6, z - 2.65);
  bmesh.castShadow = true;
  ctx.root.add(bmesh);

  // Guy ropes and pegs.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ax = x + sx * 1.4;
      const az = z + sz * 2.5;
      const bx = x + sx * 3.1;
      const bz = z + sz * 3.3;
      const len = Math.hypot(bx - ax, bz - az, 3.0);
      const rope = add(ctx, new THREE.CylinderGeometry(0.015, 0.015, len, 4), m.rope, (ax + bx) / 2, 1.6, (az + bz) / 2);
      rope.lookAt(bx, 0.08, bz);
      rope.rotateX(Math.PI * 0.5);
      addCyl(ctx, 0.02, 0.03, 0.3, 4, bx, 0, bz, m.wood);
    }
  }
  ctx.colliders.push({ x, z, w: 3.4, d: 5.6 });

  // The vault itself: a banded chest set back under the canvas.
  addBox(ctx, 1.9, 0.9, 1.1, x, 0, z + 0.4, m.woodDark, 0, true);
  const lid = add(ctx, new THREE.CylinderGeometry(0.56, 0.56, 1.9, 12, 1, false, 0, Math.PI), m.woodDark, x, 0.9, z + 0.4);
  lid.rotation.z = Math.PI * 0.5;
  for (const sx of [-0.6, 0, 0.6]) {
    addBox(ctx, 0.12, 1.0, 1.16, x + sx, 0, z + 0.4, m.iron);
    const band = add(ctx, new THREE.CylinderGeometry(0.58, 0.58, 0.12, 12, 1, false, 0, Math.PI), m.iron, x + sx, 0.9, z + 0.4);
    band.rotation.z = Math.PI * 0.5;
  }
  addBox(ctx, 0.3, 0.34, 0.12, x, 0.62, z + 0.98, m.bronze);
  addLantern(ctx, x, 2.9, z + 1.0, 0x8fd0ff, 7, 11, 0.25, 0.1);

  // Camp stores stacked outside.
  crate(ctx, m, x + 2.2, 0, z - 1.4, 1.0, 0.25);
  crate(ctx, m, x + 2.3, 0.68, z - 1.5, 0.8, -0.4);
  crate(ctx, m, x - 2.3, 0, z + 1.9, 0.9, 0.6);
  barrel(ctx, m, x - 2.2, z - 1.2, 1.0);
  sack(ctx, m, x + 2.4, 0, z + 1.6, 1.0, rng);
  sack(ctx, m, x + 1.9, 0, z + 2.2, 0.9, rng);
}

function buildCairn(ctx: Ctx, m: Mats, at: THREE.Vector3): void {
  const { x, z } = at;
  const rng = ctx.rng;

  // A stacked cairn rather than a wall of plaques: something the survivors
  // could have built in an afternoon out of what was lying around.
  let y = 0;
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const s = 1.5 - t * 1.0;
    const g = keep(ctx, stoneBlock(s, s * 0.4, s * 0.86, rng.fork(`c${i}`), 0.7));
    const st = new THREE.Mesh(g, m.stone);
    st.position.set(x + rng.range(-0.09, 0.09), y + s * 0.2, z + rng.range(-0.09, 0.09));
    st.rotation.y = rng.range(0, 6.2);
    st.castShadow = true;
    st.receiveShadow = true;
    ctx.root.add(st);
    y += s * 0.4;
  }
  ctx.colliders.push({ x, z, w: 1.8, d: 1.8 });

  // A sword driven into the top, blade down.
  const blade = add(ctx, taperedBox(0.16, 0.045, 0.03, 0.02, 1.5, 0.01), m.iron, x, y + 0.7, z);
  blade.rotation.z = Math.PI;
  addBox(ctx, 0.5, 0.07, 0.09, x, y + 1.4, z, m.bronze);
  addCyl(ctx, 0.035, 0.04, 0.34, 6, x, y + 1.44, z, m.rope);
  add(ctx, new THREE.SphereGeometry(0.06, 8, 6), m.bronze, x, y + 1.82, z);

  // Ribbons tied to a stake beside it, and a ring of candles.
  addCyl(ctx, 0.05, 0.07, 2.3, 6, x - 1.7, 0, z + 0.5, m.wood, true);
  for (let i = 0; i < 6; i++) {
    const g = keep(ctx, clothPanel(0.11, rng.range(0.5, 0.95), rng, { segsX: 2, segsY: 5, ripple: 0.1, flare: 0.1, tatter: 0.3 }));
    const rib = new THREE.Mesh(g, i % 2 ? m.banner : m.linen);
    rib.position.set(x - 1.7 + rng.range(-0.09, 0.09), 2.0 - i * 0.07, z + 0.5 + rng.range(-0.09, 0.09));
    ctx.root.add(rib);
    ctx.sway.push({ obj: rib, phase: i * 1.7, amp: 0.16, axis: 'x' });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const cx = x + Math.cos(a) * 2.1;
    const cz = z + Math.sin(a) * 2.1;
    addCyl(ctx, 0.05, 0.06, rng.range(0.2, 0.36), 6, cx, 0.02, cz, m.linen);
    addLantern(ctx, cx, 0.42, cz, 0xffca80, 6, 6, 1.0, 0.04, i === 0);
  }

  // One cold uplight so the cairn reads as a monument, not a pile.
  const up = new THREE.SpotLight(0xa8c8ff, 20, 14, 0.75, 0.6, 1.6);
  up.position.set(x, 0.5, z + 2.6);
  up.target.position.set(x, 3.2, z);
  ctx.root.add(up);
  ctx.root.add(up.target);
  ctx.lights.push(up);
}

function buildGate(ctx: Ctx, m: Mats, at: THREE.Vector3): void {
  const { x, z } = at;

  // The gate is the one piece of old stonework here — it was already standing
  // when the camp arrived, which is exactly why the camp is here.
  for (const s of [-1, 1]) {
    addBox(ctx, 1.5, 6.2, 1.5, x + s * 3.3, 0, z, m.darkStone, 0, true);
    addBox(ctx, 1.9, 0.4, 1.9, x + s * 3.3, 0, z, m.stone);
    addBox(ctx, 1.9, 0.5, 1.9, x + s * 3.3, 6.2, z, m.stone);
    addLantern(ctx, x + s * 3.3, 7.2, z, 0xb46cff, 11, 15, 0.5, 0.15);
  }
  const arch = add(ctx, new THREE.TorusGeometry(3.3, 0.52, 8, 22, Math.PI), m.darkStone, x, 6.0, z);
  void arch;
  addBox(ctx, 8.2, 0.55, 1.7, x, 6.4, z, m.stone);

  // Timber ramp down to the threshold, worn in the middle.
  addBox(ctx, 7.0, 0.3, 3.4, x, 0, z + 2.4, m.wood);
  for (let i = 0; i < 7; i++) addBox(ctx, 0.8, 0.14, 3.6, x - 2.6 + i * 0.9, 0.3, z + 2.4, m.woodDark);

  // The portal: two counter-rotating discs and a core, so it reads as unstable.
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x8a3cff, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  ctx.mat.push(discMat);
  for (let i = 0; i < 2; i++) {
    const g = keep(ctx, new THREE.RingGeometry(0.9 + i * 0.5, 2.9 - i * 0.4, 32, 1));
    const mesh = new THREE.Mesh(g, discMat);
    mesh.position.set(x, 3.4, z + 0.05);
    mesh.renderOrder = 4;
    ctx.root.add(mesh);
    ctx.spin.push({ obj: mesh, speed: i === 0 ? 0.55 : -0.34, axis: 'y' });
  }
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xc36bff, toneMapped: false });
  ctx.mat.push(coreMat);
  const core = new THREE.Mesh(keep(ctx, new THREE.SphereGeometry(1.1, 20, 14)), coreMat);
  core.position.set(x, 3.4, z);
  core.scale.set(1, 1, 0.35);
  ctx.root.add(core);

  const portalLight = new THREE.PointLight(0xa84cff, 28, 24, 2);
  portalLight.position.set(x, 3.4, z + 1.4);
  ctx.root.add(portalLight);
  ctx.lights.push(portalLight);
  ctx.flames.push({ light: portalLight, base: 28, phase: 41.7, flicker: 0.45, mesh: core });

  // Sandbags and a brazier: someone stands watch here.
  for (let i = 0; i < 7; i++) {
    const sx = x - 4.6 - (i % 2) * 0.4;
    sack(ctx, m, sx, Math.floor(i / 2) * 0.34, z + 2.2 + (i % 2) * 0.5, 1.1, ctx.rng);
    sack(ctx, m, -sx, Math.floor(i / 2) * 0.34, z + 2.2 + (i % 2) * 0.5, 1.1, ctx.rng);
  }
  weaponRack(ctx, m, x - 5.6, z + 4.4, 0, ctx.rng);
}

function buildPalisade(ctx: Ctx, m: Mats): void {
  const R = 22;
  const rng = ctx.rng;
  const step = 0.62;
  const total = Math.floor((Math.PI * 2 * R) / step);

  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    // Leave the gate mouth open.
    if (z < -15 && Math.abs(x) < 6.5) continue;

    const h = rng.range(3.4, 4.2);
    bake(ctx, limb(h, 0.17, 0.22, 6), 'bark', x, 0, z,
      [rng.range(-0.03, 0.03), rng.range(0, 6.2), rng.range(-0.03, 0.03)]);
    // Sharpened tip.
    bake(ctx, new THREE.ConeGeometry(0.19, 0.55, 6), 'bark', x, h + 0.24, z);

    if (i % 4 === 0) {
      ctx.colliders.push({ x, z, w: 2.6, d: 2.6 });
    }
    // Lashing rails, and a torch every so often.
    if (i % 3 === 0) {
      bake(
        ctx, new THREE.CylinderGeometry(0.06, 0.06, step * 3.2, 5), 'wood',
        Math.cos(a + 0.05) * (R - 0.2), 2.4, Math.sin(a + 0.05) * (R - 0.2),
        [0, 0, Math.PI * 0.5],
      );
    }
    if (i % 7 === 0) {
      const bx = Math.cos(a) * (R - 0.9);
      const bz = Math.sin(a) * (R - 0.9);
      addCyl(ctx, 0.07, 0.09, 2.6, 6, bx, 0, bz, m.wood);
      const basket = add(ctx, new THREE.CylinderGeometry(0.28, 0.16, 0.36, 8, 1, true), m.iron, bx, 2.75, bz);
      void basket;
      addLantern(ctx, bx, 2.85, bz, 0xffa044, 13, 17, 0.85, 0.13, i % 28 === 0);
    }
  }

  // Two watch platforms flanking the gate.
  for (const s of [-1, 1]) {
    const tx = s * 9.5;
    const tz = -18.5;
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        addCyl(ctx, 0.14, 0.18, 4.4, 6, tx + dx * 0.9, 0, tz + dz * 0.9, m.bark, true);
      }
    }
    addBox(ctx, 2.6, 0.2, 2.6, tx, 4.4, tz, m.wood);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      addBox(ctx, 2.6, 0.7, 0.14, tx + Math.cos(a) * 1.25, 4.6, tz + Math.sin(a) * 1.25, m.woodDark, a);
    }
    // A ladder, because a platform you cannot reach reads as scenery.
    for (let i = 0; i < 8; i++) {
      addBox(ctx, 0.7, 0.07, 0.07, tx + s * 1.5, 0.4 + i * 0.52, tz + 1.1, m.wood, Math.PI * 0.5);
    }
    addLantern(ctx, tx, 5.0, tz, 0xffa044, 9, 15, 0.8, 0.13);
  }
}

/** The lived-in half of the camp: tents, washing, a broken cart. */
function buildLivingQuarters(ctx: Ctx, m: Mats): void {
  const rng = ctx.rng;

  // A cluster of small bell tents along the south arc.
  const tents: Array<[number, number, number]> = [
    [-11.0, 12.0, 1.6], [-15.5, 7.5, 1.5], [11.5, 12.0, 1.65], [16.0, 8.0, 1.5], [-17.0, -2.5, 1.55],
  ];
  for (const [x, z, r] of tents) {
    const cone = keep(ctx, new THREE.ConeGeometry(r, r * 1.75, 12, 3));
    displace(cone, rng.fork(`bt${x}`), 0.06, 1.2);
    const mesh = new THREE.Mesh(cone, m.canvas);
    mesh.position.set(x, r * 0.875, z);
    mesh.rotation.y = rng.range(0, 6.2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ctx.root.add(mesh);
    // Centre pole poking through the apex, and a doorway flap.
    addCyl(ctx, 0.04, 0.05, r * 2.0, 5, x, 0, z, m.wood);
    const flap = new THREE.Mesh(
      keep(ctx, clothPanel(r * 0.6, r * 1.1, rng, { segsX: 3, segsY: 5, ripple: 0.05, flare: 0.15 })),
      m.canvas,
    );
    flap.position.set(x, r * 0.62, z + r * 0.94);
    flap.rotation.set(0.12, 0, 0.2);
    ctx.root.add(flap);
    ctx.sway.push({ obj: flap, phase: rng.range(0, 100), amp: 0.05, axis: 'z' });
    ctx.colliders.push({ x, z, w: r * 1.9, d: r * 1.9 });
    if (rng.next() < 0.6) barrel(ctx, m, x + r * 1.3, z - r * 0.5, 0.85);
  }

  washLine(ctx, m, -8.5, 8.0, -12.5, 10.6, 4, rng);
  washLine(ctx, m, 9.0, 9.6, 14.0, 7.4, 3, rng);

  // Drying rack of pelts.
  addCyl(ctx, 0.06, 0.08, 2.2, 6, 14.0, 0, -1.5, m.wood, true);
  addCyl(ctx, 0.06, 0.08, 2.2, 6, 17.2, 0, -1.5, m.wood, true);
  addBox(ctx, 3.4, 0.09, 0.12, 15.6, 2.1, -1.5, m.wood, Math.PI * 0.5);
  for (let i = 0; i < 3; i++) {
    const pelt = new THREE.Mesh(
      keep(ctx, clothPanel(0.8, 1.2, rng, { segsX: 4, segsY: 6, ripple: 0.07, flare: 0.3, tatter: 0.2 })),
      m.hide,
    );
    pelt.position.set(14.6 + i * 1.1, 1.5, -1.5);
    pelt.rotation.y = Math.PI * 0.5;
    pelt.castShadow = true;
    ctx.root.add(pelt);
    ctx.sway.push({ obj: pelt, phase: i * 2.3, amp: 0.05, axis: 'z' });
  }

  // The practice ground on the southern approach — the first thing you walk
  // through on the way in, and previously forty metres of empty dirt.
  for (const [dx, dz, lean] of [[-4.4, 12.0, 0.12], [-1.0, 13.6, -0.08], [2.6, 12.4, 0.16]] as Array<[number, number, number]>) {
    addCyl(ctx, 0.09, 0.13, 1.6, 6, dx, 0, dz, m.wood, true);
    const post = add(ctx, limb(0.9, 0.19, 0.22, 7), m.hide, dx, 1.5, dz);
    post.rotation.z = lean;
    const arms = add(ctx, new THREE.CylinderGeometry(0.07, 0.07, 1.5, 5), m.wood, dx, 2.05, dz);
    arms.rotation.set(0, rng.range(-0.4, 0.4), Math.PI * 0.5);
    const head = add(ctx, new THREE.SphereGeometry(0.22, 9, 7), m.hide, dx, 2.52, dz);
    head.scale.set(1, 1.15, 1);
    // Straw bleeding out of the seams, and arrows still in it.
    for (let i = 0; i < 3; i++) {
      const shaft = add(ctx, new THREE.CylinderGeometry(0.014, 0.016, 0.5, 4), m.wood,
        dx + rng.range(-0.14, 0.14), 1.7 + rng.range(-0.2, 0.3), dz + 0.2);
      shaft.rotation.set(Math.PI * 0.5 + rng.range(-0.2, 0.2), rng.range(-0.2, 0.2), 0);
      shaft.castShadow = false;
    }
  }
  // Straw bales to shoot into, and the arrow butts behind them.
  for (const [bx, bz] of [[6.2, 14.5], [7.4, 13.2]] as Array<[number, number]>) {
    const bale = add(ctx, new THREE.CylinderGeometry(0.6, 0.6, 1.1, 12), m.canvas, bx, 0.6, bz);
    bale.rotation.z = Math.PI * 0.5;
    ctx.colliders.push({ x: bx, z: bz, w: 1.3, d: 1.3 });
  }
  woodpile(ctx, m, -8.0, 14.0, 1.3, 3, rng);
  crate(ctx, m, 9.6, 0, 15.4, 1.0, 0.4);
  crate(ctx, m, 9.5, 0.68, 15.5, 0.8, -0.3);
  barrel(ctx, m, -10.5, 16.0, 1.0);
  barrel(ctx, m, 11.8, 16.4, 0.9);
  sack(ctx, m, -6.5, 0, 17.2, 1.1, rng);
  weaponRack(ctx, m, 3.0, 17.0, 0.15, rng);
  weaponRack(ctx, m, -3.0, 17.4, -0.15, rng);

  // A cart with a wheel off, propped on a log. Nothing says "camp" like
  // something half-repaired.
  addBox(ctx, 2.6, 0.24, 1.6, -17.0, 0.85, 1.5, m.wood, 0.5, true);
  for (const sz of [-1, 1]) addBox(ctx, 2.6, 0.4, 0.12, -17.0, 1.09, 1.5 + sz * 0.8, m.woodDark, 0.5);
  const goodWheel = add(ctx, new THREE.TorusGeometry(0.75, 0.08, 6, 16), m.woodDark, -16.2, 0.78, 2.2);
  goodWheel.rotation.y = Math.PI * 0.5 + 0.5;
  const looseWheel = add(ctx, new THREE.TorusGeometry(0.75, 0.08, 6, 16), m.woodDark, -18.4, 0.1, 0.4);
  looseWheel.rotation.x = Math.PI * 0.5;
  const prop = add(ctx, limb(1.2, 0.11, 0.13, 6), m.bark, -17.8, 0.55, 0.9);
  prop.rotation.z = 0.5;
  woodpile(ctx, m, -15.0, 5.5, 0.4, 5, rng);
  woodpile(ctx, m, 16.5, 3.0, 1.2, 3, rng);
  for (let i = 0; i < 5; i++) {
    crate(ctx, m, rng.range(-19, -15), 0, rng.range(-4, -1), rng.range(0.8, 1.1), rng.range(0, 3));
  }
  for (let i = 0; i < 4; i++) {
    sack(ctx, m, rng.range(15, 19), 0, rng.range(6, 10), rng.range(0.9, 1.2), rng);
  }
}

/** The forest the clearing was cut out of. */
function buildForest(ctx: Ctx, m: Mats): void {
  const rng = ctx.rng;
  for (let i = 0; i < 54; i++) {
    const a = (i / 54) * Math.PI * 2 + rng.range(-0.05, 0.05);
    const d = rng.range(26, 44);
    pine(ctx, m, Math.cos(a) * d, Math.sin(a) * d, rng.range(7, 13), rng);
  }
  // A few stumps inside the line, where the clearing was made.
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(17, 21);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (z < -14 && Math.abs(x) < 8) continue;
    addCyl(ctx, 0.44, 0.52, rng.range(0.4, 0.8), 9, x, 0, z, m.bark, true);
  }
}

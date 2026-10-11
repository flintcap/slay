/**
 * SLAY — the hub town.
 *
 * A palisaded hamlet in a forest clearing, the last defensible ground before
 * the descent: timber-framed houses under deep thatch, a smithy, a merchant's
 * shop, a stone strongroom, an apothecary's stall, the memorial cairn, and an
 * old stone gatehouse with the portal standing in its arch. The buildings,
 * stations, palisade, trees and dressing are the props stream's
 * (`src/art/props/town/`); this file owns the ground, the lights and the
 * residents, and wires the two together.
 *
 * The composition is a ring. The fire is the centre and the only thing lighting
 * the middle of the town; the services sit around it with their own smaller
 * warm lights; the palisade closes the ring; and the gate breaks it to the
 * north, where the ground drops away into the dark. Cold moonlight and cold fog
 * outside, warm firelight inside, so leaving reads as leaving somewhere safe.
 */

import * as THREE from 'three';
import type { Rng } from '../types';
import { Noise, clamp } from '../art/Noise';
import { surface } from '../art/Materials';
import { worldMaterial, WORLD_ENV_ATTRIBUTE, WORLD_SPLAT_ATTRIBUTE } from '../art/WorldMaterial';
import { CampLife } from './TownLife';
import { mergeGeometries, rock } from '../art/Meshes';
import { buildTownProps } from '../art/props/town/Layout';
import { Residents, townPlaces } from '../art/npc/Residents';
import { disposeObject } from '../core/Engine';

export interface TownBuild {
  root: THREE.Group;
  colliders: Array<{ x: number; z: number; w: number; d: number }>;
  npcSpots: Record<string, THREE.Vector3>;
  /** The townsfolk: where they are, and who they attend to (`Residents.attend`). */
  residents: Residents;
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
  flames: Array<{ light: THREE.PointLight; base: number; phase: number; flicker: number; mesh?: THREE.Mesh; bulb?: number }>;
  /** Lantern bulbs, drawn as one instanced mesh (see `buildBulbs`). */
  bulbs: Array<{ x: number; y: number; z: number; r: number; color: number }>;
  bulbMesh: THREE.InstancedMesh | null;
  spin: Array<{ obj: THREE.Object3D; speed: number; axis: 'y' | 'x' }>;
  /** Things that sway: banners, washing, hanging pelts. */
  sway: Array<{ obj: THREE.Object3D; phase: number; amp: number; axis: 'x' | 'z' }>;
  /** Static geometry accumulating per material, merged before hand-off. */
  batches: Map<string, THREE.BufferGeometry[]>;
  smoke: THREE.Vector3[];
  /** Warm pools painted on the ground under real lights. See `buildGlows`. */
  glows: Array<{ x: number; z: number; r: number; color: number; k: number }>;
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

/**
 * Merges every static, single-material mesh left directly under the camp root
 * into one mesh per material.
 *
 * `bake` only catches what was written to use it; the stations, tents and
 * clutter are hundreds of `add()` meshes, each drawn in the main pass, the
 * AO pass and the moon's shadow pass. The first night render measured 5,868
 * draw calls against a budget of 900. Anything that moves (spin, sway,
 * flicker) or carries attributes beyond position, normal and uv is left alone.
 */
function mergeStatic(ctx: Ctx): void {
  const moving = new Set<THREE.Object3D>();
  const mark = (o: THREE.Object3D | undefined): void => o?.traverse((q) => moving.add(q));
  for (const f of ctx.flames) mark(f.mesh);
  for (const sp of ctx.spin) mark(sp.obj);
  for (const sw of ctx.sway) mark(sw.obj);
  const plain = new Set(['position', 'normal', 'uv']);
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; list: THREE.Mesh[] }>();
  for (const o of ctx.root.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) continue;
    if (moving.has(m) || m.children.length > 0 || Array.isArray(m.material)) continue;
    const mat = m.material as THREE.Material;
    if (mat.transparent || !m.visible) continue;
    if (Object.keys(m.geometry.attributes).some((k) => !plain.has(k)) || !m.geometry.getAttribute('normal')) continue;
    const key = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { mat, cast: m.castShadow, recv: m.receiveShadow, list: [] }));
    g.list.push(m);
  }
  for (const g of groups.values()) {
    if (g.list.length < 2) continue;
    const geos = g.list.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    const merged = mergeGeometries(geos);
    for (const q of geos) q.dispose();
    ctx.geo.push(merged);
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.recv;
    mesh.frustumCulled = false;
    for (const m of g.list) ctx.root.remove(m);
    ctx.root.add(mesh);
  }
}

/**
 * Every lantern bulb in the camp as one instanced mesh. They were fifty meshes
 * with fifty materials, a draw call each in the main and AO passes; the
 * flicker now writes instance matrices instead of mesh scales.
 */
function buildBulbs(ctx: Ctx): void {
  if (ctx.bulbs.length === 0) return;
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  ctx.mat.push(mat);
  const inst = new THREE.InstancedMesh(keep(ctx, new THREE.SphereGeometry(1, 8, 6)), mat, ctx.bulbs.length);
  inst.name = 'lanternBulbs';
  const c = new THREE.Color();
  ctx.bulbs.forEach((b, i) => {
    _mtx.makeScale(b.r, b.r, b.r).setPosition(b.x, b.y, b.z);
    inst.setMatrixAt(i, _mtx);
    inst.setColorAt(i, c.set(b.color));
  });
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.frustumCulled = false;
  ctx.root.add(inst);
  ctx.bulbMesh = inst;
}

/**
 * `lit` decides whether this lantern is a real light or only a glowing bulb.
 *
 * The camp wants dozens of visible flames, but every real point light lands in
 * every lit surface's shader — fifty of them is a per-pixel loop fifty long, on
 * the screen the player sees between every single run. So most lanterns are
 * emissive geometry only: bloom makes them read as light sources, and a handful
 * of real lights do the actual work.
 *
 * Budget: `tools/check-perf.mjs` allows 24 lights with intensity (hemisphere
 * excluded). The camp holds 21 (15 lit lanterns, fire, forge, portal, the
 * cairn spot, moon, bounce) plus the hero's light in TownScene: 22. Count
 * before adding one.
 */
function addLantern(
  ctx: Ctx, x: number, y: number, z: number,
  color: number, intensity: number, distance: number,
  flicker = 0.6, radius = 0.13, lit = true,
): void {
  const bulb = ctx.bulbs.length;
  ctx.bulbs.push({ x, y, z, r: radius, color });

  if (!lit) {
    // A faint pool still sits under a high one: the instanced decal is free,
    // a real light is a step in every lit pixel's loop.
    if (y > 1.5) ctx.glows.push({ x, z, r: Math.min(3.5, distance * 0.16), color, k: 0.16 });
    // Still flickers — the bulb is what the eye reads at this distance.
    ctx.flames.push({
      light: { intensity: 0 } as THREE.PointLight,
      base: 0, phase: ctx.rng.range(0, 100), flicker, bulb,
    });
    return;
  }

  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.position.set(x, y, z);
  light.castShadow = false;
  if (y > 1.5) ctx.glows.push({ x, z, r: Math.min(5, distance * 0.22), color, k: 0.28 });
  ctx.root.add(light);
  ctx.lights.push(light);
  ctx.flames.push({ light, base: intensity, phase: ctx.rng.range(0, 100), flicker, bulb });
}

// ---------------------------------------------------------------------------

export function buildTown(rng: Rng): TownBuild {
  const root = new THREE.Group();
  root.name = 'camp';

  const ctx: Ctx = {
    root, colliders: [], geo: [], mat: [], lights: [], flames: [], bulbs: [], bulbMesh: null, spin: [], sway: [],
    batches: new Map(), smoke: [], glows: [], rng, noise: new Noise(0x70ad),
  };

  const mats: Mats = {
    // The camp ground itself is one splatted sheet (`buildGround`); this is
    // for the tussocks baked out in the grass.
    grass: safeSurface('ground.grass', { repeat: 20, roughness: 0.98 }),
    // Warm and a shade darker than the palette: neutral grey stone under the
    // blue moon read pale blue-white round the fire ring and across the camp.
    stone: safeSurface('stone.town', { repeat: 2.2, tint: 0xb09c80 }),
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
  buildFire(ctx);

  const npcSpots: Record<string, THREE.Vector3> = {};

  const forgeAt = new THREE.Vector3(-13, 0, 5);
  npcSpots.blacksmith = new THREE.Vector3(forgeAt.x + 3.0, 0, forgeAt.z + 1.6);

  const wagonAt = new THREE.Vector3(13, 0, 5);
  npcSpots.vendor = new THREE.Vector3(wagonAt.x - 2.8, 0, wagonAt.z + 1.4);
  npcSpots.merchant = npcSpots.vendor.clone();

  const stashAt = new THREE.Vector3(-12.5, 0, -8);
  npcSpots.stash = new THREE.Vector3(stashAt.x + 2.6, 0, stashAt.z + 1.2);

  // The apothecary. Opposite the vault so the two supply stops bracket the
  // town rather than crowding the same corner.
  const alchemyAt = new THREE.Vector3(-6.5, 0, -13.5);
  npcSpots.alchemist = new THREE.Vector3(alchemyAt.x + 2.4, 0, alchemyAt.z + 1.6);

  const cairnAt = new THREE.Vector3(12.5, 0, -8.5);
  npcSpots.memorial = new THREE.Vector3(cairnAt.x - 2.4, 0, cairnAt.z + 1.4);

  const portalSpot = new THREE.Vector3(0, 0, -20.5);
  npcSpots.portal = new THREE.Vector3(portalSpot.x, 0, portalSpot.z + 3.2);
  npcSpots.gate = npcSpots.portal.clone();

  // Lantern posts along the ring road between the stations. Each one is a warm
  // pool the player walks through, which is what stops the middle distance
  // reading as one flat brown field. Every other one is a real light.
  const posts: Array<[number, number]> = [
    [-7.5, 9.5], [7.5, 9.5], [-17.5, -1.5], [17.5, -1.5], [-3.0, -10.6], [7.0, -13.5],
    [-5.0, 16.5], [5.0, 16.5], [-14.0, 15.0], [14.0, 15.0], [0, 19.0],
    [-19.0, 6.0], [19.0, 6.0], [-16.0, -12.5], [16.0, -12.5],
  ];

  // The buildings, stations, palisade, trees and dressing (props stream).
  const PALISADE_R = 22;
  const town = buildTownProps(rng.fork('town'), {
    forge: forgeAt,
    vendor: wagonAt,
    stash: stashAt,
    alchemy: alchemyAt,
    cairn: cairnAt,
    gate: portalSpot,
    posts: posts.map(([x, z], i) => [x, z, i % 2 === 0]),
    R: PALISADE_R,
    gap: (x, z) => z < -15 && Math.abs(x) < 6.5,
  });
  root.add(town.root);
  ctx.colliders.push(...town.colliders);
  ctx.smoke.push(...town.smoke);
  ctx.sway.push(...town.sway);
  for (const l of [...town.lanterns, ...town.postLanterns]) {
    addLantern(ctx, l.x, l.y, l.z, l.color, l.intensity, l.distance, l.flicker, l.radius, l.lit);
  }
  // The portal's own light is a real one; it counts against the budget.
  ctx.glows.push({ x: portalSpot.x, z: portalSpot.z + 1.4, r: 4.5, color: 0xa84cff, k: 0.3 });

  // The forge: coals under the hood and the lantern on the smithy's corner post.
  {
    const forge = new THREE.PointLight(0xff5a18, 30, 17, 2);
    forge.position.copy(town.forgeLight);
    ctx.root.add(forge);
    ctx.lights.push(forge);
    ctx.flames.push({ light: forge, base: 30, phase: 11.4, flicker: 1.0 });
    const fl = town.forgeLantern;
    addLantern(ctx, fl.x, fl.y, fl.z, 0xffb35c, 8, 12, 0.7, 0.11);
  }

  // One cold uplight so the cairn reads as a monument, not a pile.
  {
    const up = new THREE.SpotLight(0xa8c8ff, 20, 14, 0.75, 0.6, 1.6);
    up.position.set(cairnAt.x, 0.5, cairnAt.z + 2.6);
    up.target.position.set(cairnAt.x, 3.2, cairnAt.z);
    ctx.root.add(up);
    ctx.root.add(up.target);
    ctx.lights.push(up);
  }

  // Fireflies out at the tree line, moths round the lantern bulbs.
  const life = new CampLife(
    town.postLanterns.map((l) => new THREE.Vector3(l.x, l.y, l.z)),
    22,
    34,
  );
  root.add(life.root);

  flushBatches(ctx, mats);
  buildGlows(ctx);

  // --- residents ---------------------------------------------------------
  // The townsfolk and their routines live in `art/npc/Residents.ts`.
  const residents = new Residents(ctx.root, ctx.colliders, townPlaces({
    forge: forgeAt, wagon: wagonAt, stash: stashAt, alchemy: alchemyAt, cairn: cairnAt, alchemist: npcSpots.alchemist,
  }));
  mergeStatic(ctx);
  buildBulbs(ctx);

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
    residents,
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
        if (f.bulb !== undefined && ctx.bulbMesh) {
          const b = ctx.bulbs[f.bulb]!;
          const s = (0.88 + v * 0.2) * b.r;
          _mtx.makeScale(s, s * 1.12, s).setPosition(b.x, b.y, b.z);
          ctx.bulbMesh.setMatrixAt(f.bulb, _mtx);
        }
      }
      if (ctx.bulbMesh) ctx.bulbMesh.instanceMatrix.needsUpdate = true;
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
      residents.update(dt);
      town.update(dt);
      life.update(elapsed);
    },
    dispose(): void {
      life.dispose();
      town.dispose();
      // Everything under the camp root, residents and stations included, not
      // just what was registered in ctx.geo: `root.clear()` below detaches it
      // before the engine's own sweep of the scene can reach it, so every visit
      // to town left ~130 geometries and the residents' bone textures behind.
      disposeObject(root);
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
      root.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * Warm light pools on the ground under the fire and the lit lanterns.
 *
 * The first night render had the fire reading as a flame sitting on an evenly
 * lit grey-brown field: real point lights fall off too smoothly from a camera
 * twenty metres up to make a pool. The dungeon solved the same thing with an
 * additive radial decal under each torch; the camp gets the same, one
 * instanced mesh for all of them.
 */
function buildGlows(ctx: Ctx): void {
  if (ctx.glows.length === 0) return;
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(1, Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2));
      const a = Math.pow(1 - d, 2.2);
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(a * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const dispose = mat.dispose.bind(mat);
  mat.dispose = () => {
    tex.dispose();
    dispose();
  };
  ctx.mat.push(mat);
  const geo = keep(ctx, new THREE.PlaneGeometry(2, 2));
  geo.rotateX(-Math.PI / 2);
  const inst = new THREE.InstancedMesh(geo, mat, ctx.glows.length);
  inst.name = 'campGlows';
  inst.renderOrder = 2;
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color();
  ctx.glows.forEach((g, i) => {
    m4.makeScale(g.r, 1, g.r).setPosition(g.x, 0.2, g.z);
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.set(g.color).multiplyScalar(g.k));
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  ctx.root.add(inst);
}

/**
 * Camp ground: one world-space material over four photo layers. Grass is
 * the base; trodden earth (layer 1), stony paths (2) and mud (3) are painted
 * in per vertex. Owned by the camp (pushed to `ctx.mat`).
 */
function groundSurface(ctx: Ctx): THREE.Material {
  try {
    const m = worldMaterial({
      layers: [
        { key: 'ground.grass', tint: 0x8a9478, rough: 0.98 },
        { key: 'ground.dirt', tint: 0x8d8478, rough: 0.98 },
        { key: 'ground.stony', tint: 0xb8aa98, rough: 0.97 },
        { key: 'ground.mud', tint: 0x8a8070, rough: 0.9 },
      ],
      kind: 'floor',
      grime: 0x2a2018,
      grimeAmount: 0.55,
      wet: 0.25,
      variation: 0.85,
      contact: 0.6,
    });
    ctx.mat.push(m);
    return m;
  } catch {
    return safeSurface('ground.dirt', { repeat: 16, tint: 0x8d8478, roughness: 0.98 });
  }
}

/** Distance from (x, z) to the segment a..b. */
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / Math.max(1e-6, dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function smooth(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function buildGround(ctx: Ctx, m: Mats): void {
  // One sheet from the fire out past the palisade into the trees: no planes
  // stacked a few centimetres apart, so no seams and no green showing
  // through the dirt where two surfaces crossed.
  const SIZE = 110;
  const SEG = 132;
  const geo = keep(ctx, new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = new Noise(0x3122);
  const turfN = new Noise(ctx.rng.int(1, 1 << 30));
  const env = new Float32Array(pos.count);
  const splat = new Float32Array(pos.count * 3);
  // Paths worn between the fire and each station, plus the south road you
  // arrive by and the way out through the gate.
  const spokes: Array<[number, number, number]> = [
    [-13, 5, 2.6], [13, 5, 2.6], [-12.5, -8, 2.4], [12.5, -8.5, 2.4], [0, -19, 3.4], [0, 46, 3.2],
  ];
  const at = (x: number, z: number): { y: number; out: number; track: number; mud: number; r: number } => {
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    // The camp's edge, nibbled so it never ends on a drawn circle.
    const rim = 21.5 + n.simplex2(Math.cos(a) * 2.4, Math.sin(a) * 2.4) * 1.4;
    const out = smooth(rim - 1.5, rim + 2.5, r);
    // Inside: shallow and nearly flat. Outside: lumpy turf falling a little.
    const inner = n.simplex2(x * 0.13, z * 0.13) * 0.07 + n.simplex2(x * 0.5, z * 0.5) * 0.025;
    const turf = -0.3 + turfN.fbm(x * 0.055, z * 0.055, 3) * 0.35 + turfN.simplex2(x * 0.4, z * 0.4) * 0.04;
    let y = 0.06 + inner + (turf - 0.06 - inner) * out;
    // Tracks: paler, flatter, worn a touch below the dirt either side.
    let track = 0;
    for (const [tx, tz, w] of spokes) {
      const wob = n.simplex2(x * 0.2 + tx, z * 0.2 + tz) * 0.5;
      const d = segDist(x, z, 0, 0, tx, tz) + wob;
      track = Math.max(track, 1 - smooth(w * 0.28, w * 0.62, d));
    }
    // The south road fades out into the grass as it leaves the camp.
    if (z > rim) track *= 1 - smooth(rim + 10, rim + 24, z);
    y -= track * 0.025;
    // Mud: damp hollows in the trodden ground, worst along the stakes and
    // at the edges of the tracks where carts churn it up.
    const damp = smooth(0.25, 0.6, n.simplex2(x * 0.09 + 7, z * 0.09 - 3) * 0.5 + 0.5 + n.simplex2(x * 0.35, z * 0.35) * 0.15);
    const edge = smooth(rim - 4, rim - 1, r) * (1 - out);
    const verge = track * (1 - track) * 2.4;
    const mud = clamp(Math.max(damp * 0.85 * (1 - out * 0.7), edge * 0.6, verge * 0.5), 0, 1);
    return { y, out, track, mud, r };
  };
  for (let i = 0; i < pos.count; i++) {
    const { y, out, track, mud, r } = at(pos.getX(i), pos.getZ(i));
    pos.setY(i, y);
    splat[i * 3] = 1 - out;
    splat[i * 3 + 1] = track;
    splat[i * 3 + 2] = mud * (1 - track * 0.7);
    // Grime and shadow bank up against the palisade at the rim.
    env[i] = clamp((r - 18.5) / 3.5, 0, 1) * (1 - out);
  }
  geo.computeVertexNormals();
  geo.setAttribute(WORLD_ENV_ATTRIBUTE, new THREE.BufferAttribute(env, 1));
  geo.setAttribute(WORLD_SPLAT_ATTRIBUTE, new THREE.BufferAttribute(splat, 3));
  const ground = new THREE.Mesh(geo, groundSurface(ctx));
  ground.receiveShadow = true;
  ground.name = 'town:ground';
  ctx.root.add(ground);

  // Loose stones and tussocks, so the ground is never empty.
  for (let i = 0; i < 60; i++) {
    const a = ctx.rng.range(0, Math.PI * 2);
    const d = ctx.rng.range(6, 30);
    const s = ctx.rng.range(0.1, 0.34);
    bake(
      ctx, rock(s, ctx.rng.fork(`r${i}`), 0), d < 22 ? 'stone' : 'grass',
      Math.cos(a) * d, at(Math.cos(a) * d, Math.sin(a) * d).y + s * 0.2, Math.sin(a) * d,
      [ctx.rng.range(0, 3), ctx.rng.range(0, 3), ctx.rng.range(0, 3)],
    );
  }
}

/**
 * The fire at the centre: the flame body and the town's key light. The ring
 * of stones, the logs, the tripod and the seats round it are the props
 * stream's (`fireRing`).
 */
function buildFire(ctx: Ctx): void {
  const rng = ctx.rng;
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

  // The town's key light.
  const fire = new THREE.PointLight(0xff9440, 40, 28, 2);
  // Raised well above the logs, so the light falls in a pool rather than
  // raking the ground.
  fire.position.set(0, 2.6, 0);
  ctx.glows.push({ x: 0, z: 0, r: 9.5, color: 0xff9440, k: 0.42 });
  // No shadow. A point shadow draws every caster in range six more times; the
  // camp measured 2,300 draw calls with it against a budget of 900. The moon
  // is the town's shadow caster.
  fire.castShadow = false;
  ctx.root.add(fire);
  ctx.lights.push(fire);
  ctx.flames.push({ light: fire, base: 46, phase: 3.1, flicker: 0.85, mesh: flameGroup as unknown as THREE.Mesh });
  ctx.smoke.push(new THREE.Vector3(0, 1.6, 0));
}

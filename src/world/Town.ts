/**
 * SLAY — the hub town.
 *
 * Code-built but hand-composed: a raised octagonal plaza with a beacon at its
 * centre, four service buildings placed on the cardinal spokes (blacksmith,
 * merchant, stash vault, memorial), a dungeon gate at the north end, and a
 * perimeter of lantern posts and low walls that closes the space off so it
 * reads as somewhere rather than as a floating platform.
 *
 * This is the first thing a player sees every single run, so it commits to warm
 * lantern light against a cold night sky — the exact inverse of the dungeon's
 * palette, which makes going down feel like leaving somewhere safe.
 */

import * as THREE from 'three';
import type { Rng } from '../types';
import { Noise, clamp } from '../art/Noise';
import { surface } from '../art/Materials';

export interface TownBuild {
  root: THREE.Group;
  colliders: Array<{ x: number; z: number; w: number; d: number }>;
  npcSpots: Record<string, THREE.Vector3>;
  portalSpot: THREE.Vector3;
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
  flames: Array<{ light: THREE.PointLight; base: number; phase: number; flicker: number; mesh?: THREE.Mesh; meshBase?: number }>;
  spin: Array<{ obj: THREE.Object3D; speed: number; axis: 'y' | 'x' }>;
  rng: Rng;
  noise: Noise;
}

function addBox(
  ctx: Ctx,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  ry = 0,
  collide = false,
): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  ctx.geo.push(g);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  ctx.root.add(m);
  if (collide) ctx.colliders.push({ x, z, w: Math.max(w, d), d: Math.max(w, d) });
  return m;
}

function addCyl(
  ctx: Ctx,
  rt: number,
  rb: number,
  h: number,
  seg: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  collide = false,
): THREE.Mesh {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  ctx.geo.push(g);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  ctx.root.add(m);
  if (collide) ctx.colliders.push({ x, z, w: rb * 2, d: rb * 2 });
  return m;
}

/** A warm point light plus its emissive bulb, registered for flicker. */
function addLantern(
  ctx: Ctx,
  x: number,
  y: number,
  z: number,
  color: number,
  intensity: number,
  distance: number,
  flicker = 0.6,
  radius = 0.13,
  shadows = false,
): void {
  const bulbMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  ctx.mat.push(bulbMat);
  const g = new THREE.SphereGeometry(radius, 8, 6);
  ctx.geo.push(g);
  const bulb = new THREE.Mesh(g, bulbMat);
  bulb.position.set(x, y, z);
  ctx.root.add(bulb);

  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.position.set(x, y, z);
  light.castShadow = shadows;
  if (shadows) {
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.4;
    light.shadow.camera.far = distance;
    light.shadow.bias = -0.004;
    light.shadow.normalBias = 0.05;
  }
  ctx.root.add(light);
  ctx.lights.push(light);
  ctx.flames.push({ light, base: intensity, phase: ctx.rng.range(0, 100), flicker, mesh: bulb, meshBase: 1 });
}

/** Lantern on a wrought post — the town's repeating vertical rhythm. */
function addLanternPost(ctx: Ctx, x: number, z: number, mats: Record<string, THREE.Material>): void {
  addCyl(ctx, 0.09, 0.15, 3.0, 8, x, 0, z, mats.iron, true);
  addBox(ctx, 0.42, 0.08, 0.42, x, 3.0, z, mats.iron);
  // Glass cage.
  const cageMat = mats.iron;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    addBox(ctx, 0.05, 0.5, 0.05, x + Math.cos(a) * 0.16, 3.08, z + Math.sin(a) * 0.16, cageMat);
  }
  addCyl(ctx, 0.03, 0.24, 0.22, 6, x, 3.58, z, mats.iron);
  addLantern(ctx, x, 3.32, z, 0xffb35c, 9, 13, 0.75, 0.12, false);
}

// ---------------------------------------------------------------------------

export function buildTown(rng: Rng): TownBuild {
  const root = new THREE.Group();
  root.name = 'town';

  const ctx: Ctx = {
    root,
    colliders: [],
    geo: [],
    mat: [],
    lights: [],
    flames: [],
    spin: [],
    rng,
    noise: new Noise(0x70ad),
  };

  const mats: Record<string, THREE.Material> = {
    cobble: safeSurface('stone.granite', { repeat: 3, tint: 0x8d8f96, roughness: 0.95 }),
    plazaInner: safeSurface('stone.marble', { repeat: 2.4, tint: 0x9d9a90, roughness: 0.7 }),
    stone: safeSurface('stone.granite', { repeat: 1.4 }),
    darkStone: safeSurface('stone.basalt', { repeat: 1.2, tint: 0x6a6a72 }),
    wood: safeSurface('wood.oak', { repeat: 1.6 }),
    woodDark: safeSurface('wood.oak', { repeat: 2.2, tint: 0x7a5836 }),
    iron: safeSurface('metal.iron', { roughness: 0.55, metalness: 0.85 }),
    bronze: safeSurface('metal.bronze', { roughness: 0.32, metalness: 1 }),
    cloth: safeSurface('cloth.banner', { repeat: 1, side: THREE.DoubleSide }),
    linen: safeSurface('cloth.linen', { repeat: 1.6, side: THREE.DoubleSide }),
  };

  // --- ground ------------------------------------------------------------
  buildGround(ctx, mats);

  // --- centrepiece -------------------------------------------------------
  buildBeacon(ctx, mats);

  // --- buildings ---------------------------------------------------------
  const npcSpots: Record<string, THREE.Vector3> = {};

  const blacksmithAt = new THREE.Vector3(-13, 0, 6);
  buildBlacksmith(ctx, mats, blacksmithAt);
  npcSpots.blacksmith = new THREE.Vector3(blacksmithAt.x + 3.4, 0, blacksmithAt.z + 1.2);

  const merchantAt = new THREE.Vector3(13, 0, 6);
  buildMerchant(ctx, mats, merchantAt);
  npcSpots.vendor = new THREE.Vector3(merchantAt.x - 3.2, 0, merchantAt.z + 1.0);
  npcSpots.merchant = npcSpots.vendor.clone();

  const stashAt = new THREE.Vector3(-13, 0, -7);
  buildStashVault(ctx, mats, stashAt);
  npcSpots.stash = new THREE.Vector3(stashAt.x + 3.4, 0, stashAt.z - 0.6);

  const memorialAt = new THREE.Vector3(13, 0, -7);
  buildMemorial(ctx, mats, memorialAt);
  npcSpots.memorial = new THREE.Vector3(memorialAt.x - 3.2, 0, memorialAt.z - 0.4);

  // --- gate --------------------------------------------------------------
  const portalSpot = new THREE.Vector3(0, 0, -20.5);
  buildPortal(ctx, mats, portalSpot);
  npcSpots.portal = new THREE.Vector3(portalSpot.x, 0, portalSpot.z + 3.2);
  npcSpots.gate = npcSpots.portal.clone();

  // --- perimeter ---------------------------------------------------------
  buildPerimeter(ctx, mats);

  // --- ambience ----------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x3a4a6e, 0x2a1c14, 0.75);
  root.add(hemi);
  ctx.lights.push(hemi);

  // Moonlight: cold, low intensity, long shadows. The warmth all comes from
  // lanterns, which is what makes the plaza feel inhabited.
  const moon = new THREE.DirectionalLight(0x8fa8d8, 0.55);
  moon.position.set(-24, 34, -18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 120;
  moon.shadow.camera.left = -34;
  moon.shadow.camera.right = 34;
  moon.shadow.camera.top = 34;
  moon.shadow.camera.bottom = -34;
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.03;
  root.add(moon);
  root.add(moon.target);
  ctx.lights.push(moon);

  const npcKeys = ['blacksmith', 'vendor', 'stash', 'memorial'];
  for (const k of npcKeys) {
    // Warm practical over every vendor stand, so NPCs are never silhouettes.
    const p = npcSpots[k];
    addLantern(ctx, p.x, 3.4, p.z, 0xffc98a, 5.5, 9, 0.35, 0.09, false);
  }

  return {
    root,
    colliders: ctx.colliders,
    npcSpots,
    portalSpot,
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
      root.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function buildGround(ctx: Ctx, mats: Record<string, THREE.Material>): void {
  // Outer apron.
  const apron = new THREE.CylinderGeometry(34, 34, 0.6, 8);
  ctx.geo.push(apron);
  const apronMesh = new THREE.Mesh(apron, mats.cobble);
  apronMesh.position.y = -0.3;
  apronMesh.receiveShadow = true;
  ctx.root.add(apronMesh);

  // Raised octagonal plaza — one step up, which is the cheapest way to make a
  // flat space read as designed.
  const plaza = new THREE.CylinderGeometry(19, 19.4, 0.5, 8);
  ctx.geo.push(plaza);
  const plazaMesh = new THREE.Mesh(plaza, mats.plazaInner);
  plazaMesh.position.y = 0.25;
  plazaMesh.rotation.y = Math.PI / 8;
  plazaMesh.receiveShadow = true;
  ctx.root.add(plazaMesh);

  // Step ring, so the edge is not a single hard cliff.
  const step = new THREE.CylinderGeometry(20.6, 21, 0.26, 8);
  ctx.geo.push(step);
  const stepMesh = new THREE.Mesh(step, mats.stone);
  stepMesh.position.y = 0.13;
  stepMesh.rotation.y = Math.PI / 8;
  stepMesh.receiveShadow = true;
  ctx.root.add(stepMesh);

  // Inlaid ring in the paving.
  const ring = new THREE.TorusGeometry(9.5, 0.14, 6, 48);
  ctx.geo.push(ring);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x2a2418,
    emissive: new THREE.Color(0xffa040),
    emissiveIntensity: 0.35,
    roughness: 0.4,
    metalness: 0.8,
  });
  ctx.mat.push(ringMat);
  const ringMesh = new THREE.Mesh(ring, ringMat);
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.position.y = 0.52;
  ctx.root.add(ringMesh);
}

function buildBeacon(ctx: Ctx, mats: Record<string, THREE.Material>): void {
  // Three-tier dais.
  addCyl(ctx, 4.4, 4.8, 0.34, 12, 0, 0.5, 0, mats.stone);
  addCyl(ctx, 3.3, 3.7, 0.34, 12, 0, 0.84, 0, mats.stone);
  addCyl(ctx, 2.4, 2.8, 0.34, 12, 0, 1.18, 0, mats.plazaInner);

  // Brazier column.
  addCyl(ctx, 0.55, 0.75, 2.0, 10, 0, 1.52, 0, mats.darkStone, true);
  addCyl(ctx, 1.1, 0.6, 0.7, 12, 0, 3.52, 0, mats.bronze);

  const coalMat = new THREE.MeshBasicMaterial({ color: 0xff7a28, toneMapped: false });
  ctx.mat.push(coalMat);
  const coalGeo = new THREE.SphereGeometry(0.85, 12, 8);
  coalGeo.scale(1, 0.42, 1);
  ctx.geo.push(coalGeo);
  const coals = new THREE.Mesh(coalGeo, coalMat);
  coals.position.set(0, 4.0, 0);
  ctx.root.add(coals);

  const beacon = new THREE.PointLight(0xff9a44, 42, 40, 2);
  beacon.position.set(0, 4.6, 0);
  beacon.castShadow = true;
  beacon.shadow.mapSize.set(1024, 1024);
  beacon.shadow.camera.near = 0.5;
  beacon.shadow.camera.far = 40;
  beacon.shadow.bias = -0.004;
  beacon.shadow.normalBias = 0.05;
  ctx.root.add(beacon);
  ctx.lights.push(beacon);
  ctx.flames.push({ light: beacon, base: 42, phase: 3.1, flicker: 0.8, mesh: coals, meshBase: 1 });

  // Four standards around the dais.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 6.2;
    const z = Math.sin(a) * 6.2;
    addCyl(ctx, 0.11, 0.15, 4.6, 8, x, 0.5, z, mats.iron, true);
    const bannerGeo = new THREE.PlaneGeometry(1.1, 2.4, 3, 5);
    ctx.geo.push(bannerGeo);
    const banner = new THREE.Mesh(bannerGeo, mats.cloth);
    banner.position.set(x, 3.5, z);
    banner.rotation.y = -a;
    banner.castShadow = true;
    ctx.root.add(banner);
    addLantern(ctx, x, 5.2, z, 0xffb35c, 7, 12, 0.7, 0.11, false);
  }
}

function buildBlacksmith(ctx: Ctx, mats: Record<string, THREE.Material>, at: THREE.Vector3): void {
  const { x, z } = at;
  // Stone shell with an open front.
  addBox(ctx, 8.2, 0.4, 7.2, x, 0.5, z, mats.stone);
  addBox(ctx, 8.2, 4.2, 0.6, x, 0.9, z - 3.3, mats.darkStone, 0, true);
  addBox(ctx, 0.6, 4.2, 7.2, x - 3.8, 0.9, z, mats.darkStone, 0, true);
  addBox(ctx, 0.6, 4.2, 3.0, x + 3.8, 0.9, z - 2.0, mats.darkStone, 0, true);
  // Roof, pitched with two slabs.
  for (const s of [-1, 1]) {
    const roof = addBox(ctx, 8.6, 0.3, 4.4, x, 5.1, z + s * 1.6, mats.woodDark);
    roof.rotation.x = s * 0.42;
  }
  addBox(ctx, 8.9, 0.35, 0.5, x, 5.0, z + 3.6, mats.wood);

  // Forge: hearth, hood, chimney, coals.
  addBox(ctx, 2.6, 1.1, 1.6, x - 1.6, 0.9, z - 2.2, mats.darkStone, 0, true);
  const hood = new THREE.CylinderGeometry(0.5, 1.7, 1.8, 4, 1, true);
  hood.rotateY(Math.PI / 4);
  ctx.geo.push(hood);
  const hoodMesh = new THREE.Mesh(hood, mats.iron);
  hoodMesh.position.set(x - 1.6, 3.1, z - 2.2);
  hoodMesh.castShadow = true;
  ctx.root.add(hoodMesh);
  addCyl(ctx, 0.42, 0.42, 2.4, 8, x - 1.6, 3.9, z - 2.2, mats.darkStone);

  const coalMat = new THREE.MeshBasicMaterial({ color: 0xff5a14, toneMapped: false });
  ctx.mat.push(coalMat);
  const coalGeo = new THREE.BoxGeometry(2.0, 0.16, 1.0);
  ctx.geo.push(coalGeo);
  const coals = new THREE.Mesh(coalGeo, coalMat);
  coals.position.set(x - 1.6, 2.06, z - 2.2);
  ctx.root.add(coals);

  const forgeLight = new THREE.PointLight(0xff5a18, 26, 18, 2);
  forgeLight.position.set(x - 1.6, 2.3, z - 1.9);
  forgeLight.castShadow = true;
  forgeLight.shadow.mapSize.set(1024, 1024);
  forgeLight.shadow.camera.near = 0.4;
  forgeLight.shadow.camera.far = 18;
  forgeLight.shadow.bias = -0.004;
  forgeLight.shadow.normalBias = 0.05;
  ctx.root.add(forgeLight);
  ctx.lights.push(forgeLight);
  ctx.flames.push({ light: forgeLight, base: 26, phase: 11.4, flicker: 1.0, mesh: coals, meshBase: 1 });

  // Anvil on a stump.
  addCyl(ctx, 0.42, 0.5, 0.7, 8, x + 1.4, 0.9, z + 0.2, mats.wood, true);
  addBox(ctx, 0.7, 0.2, 0.4, x + 1.4, 1.6, z + 0.2, mats.iron);
  addBox(ctx, 0.34, 0.28, 0.28, x + 1.4, 1.8, z + 0.2, mats.iron);
  addBox(ctx, 1.0, 0.22, 0.42, x + 1.45, 2.08, z + 0.2, mats.iron);

  // Quench trough, tool rack, ingot stacks.
  addBox(ctx, 1.5, 0.6, 0.8, x + 2.4, 0.9, z - 2.0, mats.wood, 0, true);
  addBox(ctx, 1.4, 0.06, 0.7, x + 2.4, 1.42, z - 2.0, mats.iron);
  for (let i = 0; i < 4; i++) {
    addBox(ctx, 0.5, 0.13, 0.24, x - 3.1, 0.9 + i * 0.14, z + 2.4 + (i % 2) * 0.06, mats.bronze);
  }
  addLantern(ctx, x + 3.2, 3.6, z + 2.6, 0xffb35c, 8, 12, 0.7, 0.12, false);
}

function buildMerchant(ctx: Ctx, mats: Record<string, THREE.Material>, at: THREE.Vector3): void {
  const { x, z } = at;
  addBox(ctx, 7.4, 0.4, 6.4, x, 0.5, z, mats.stone);

  // Four posts and a striped awning.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addCyl(ctx, 0.13, 0.16, 3.3, 7, x + sx * 3.2, 0.9, z + sz * 2.7, mats.wood, true);
    }
  }
  const awning = new THREE.PlaneGeometry(7.2, 6.2, 6, 4);
  ctx.geo.push(awning);
  const awningMat = new THREE.MeshStandardMaterial({
    color: 0x9c3f2e,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  ctx.mat.push(awningMat);
  const awningMesh = new THREE.Mesh(awning, awningMat);
  awningMesh.rotation.x = -Math.PI / 2 + 0.16;
  awningMesh.position.set(x, 4.3, z);
  awningMesh.castShadow = true;
  ctx.root.add(awningMesh);

  // Counter, shelves, wares.
  addBox(ctx, 5.4, 1.0, 0.9, x, 0.9, z + 2.0, mats.wood, 0, true);
  addBox(ctx, 5.6, 0.12, 1.1, x, 1.9, z + 2.0, mats.woodDark);
  addBox(ctx, 5.0, 2.4, 0.5, x, 0.9, z - 2.4, mats.woodDark, 0, true);
  for (let i = 0; i < 3; i++) addBox(ctx, 4.8, 0.08, 0.6, x, 1.3 + i * 0.6, z - 2.3, mats.wood);

  // Crates, barrels and hanging goods.
  addBox(ctx, 0.8, 0.8, 0.8, x - 2.6, 0.9, z - 0.6, mats.wood, 0.3, true);
  addBox(ctx, 0.7, 0.7, 0.7, x - 2.5, 1.7, z - 0.5, mats.wood, -0.2);
  addCyl(ctx, 0.4, 0.34, 0.9, 10, x + 2.7, 0.9, z - 0.7, mats.wood, true);
  addCyl(ctx, 0.4, 0.34, 0.9, 10, x + 2.6, 1.8, z - 0.7, mats.wood);
  for (let i = 0; i < 5; i++) {
    const gx = x - 2.0 + i * 1.0;
    addCyl(ctx, 0.035, 0.035, 0.7, 5, gx, 3.4, z + 1.9, mats.iron);
    addBox(ctx, 0.3, 0.34, 0.16, gx, 3.06, z + 1.9, mats.linen);
  }

  addLantern(ctx, x - 3.0, 3.5, z + 2.4, 0xffc06a, 8, 12, 0.55, 0.12, false);
  addLantern(ctx, x + 3.0, 3.5, z + 2.4, 0xffc06a, 8, 12, 0.55, 0.12, false);
}

function buildStashVault(ctx: Ctx, mats: Record<string, THREE.Material>, at: THREE.Vector3): void {
  const { x, z } = at;
  addBox(ctx, 7.6, 0.4, 6.6, x, 0.5, z, mats.stone);
  // Heavy blockhouse with a recessed vault door facing the plaza.
  addBox(ctx, 7.6, 4.6, 0.7, x, 0.9, z - 3.0, mats.darkStone, 0, true);
  addBox(ctx, 0.7, 4.6, 6.6, x - 3.5, 0.9, z, mats.darkStone, 0, true);
  addBox(ctx, 0.7, 4.6, 6.6, x + 3.5, 0.9, z, mats.darkStone, 0, true);
  addBox(ctx, 2.2, 4.6, 0.7, x - 2.7, 0.9, z + 3.0, mats.darkStone, 0, true);
  addBox(ctx, 2.2, 4.6, 0.7, x + 2.7, 0.9, z + 3.0, mats.darkStone, 0, true);
  addBox(ctx, 8.0, 0.5, 7.0, x, 5.5, z, mats.stone);
  // Crenellations.
  for (let i = -3; i <= 3; i++) {
    addBox(ctx, 0.7, 0.6, 0.7, x + i * 1.1, 6.0, z - 3.0, mats.stone);
  }

  // The door: a big bronze disc with radial bars and a lock wheel.
  const doorGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.32, 24);
  doorGeo.rotateX(Math.PI / 2);
  ctx.geo.push(doorGeo);
  const door = new THREE.Mesh(doorGeo, mats.bronze);
  door.position.set(x, 2.6, z + 2.9);
  door.castShadow = true;
  ctx.root.add(door);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    const bar = addBox(ctx, 3.0, 0.16, 0.14, x, 2.6, z + 3.08, mats.iron);
    bar.position.y = 2.6;
    bar.rotation.z = a;
  }
  const wheelGeo = new THREE.TorusGeometry(0.5, 0.08, 6, 18);
  ctx.geo.push(wheelGeo);
  const wheel = new THREE.Mesh(wheelGeo, mats.iron);
  wheel.position.set(x, 2.6, z + 3.2);
  wheel.castShadow = true;
  ctx.root.add(wheel);
  ctx.spin.push({ obj: wheel, speed: 0.22, axis: 'y' });
  ctx.colliders.push({ x, z: z + 3.0, w: 3.2, d: 1.0 });

  addLantern(ctx, x - 2.2, 3.9, z + 3.2, 0x8fd0ff, 7, 11, 0.25, 0.11, false);
  addLantern(ctx, x + 2.2, 3.9, z + 3.2, 0x8fd0ff, 7, 11, 0.25, 0.11, false);
}

function buildMemorial(ctx: Ctx, mats: Record<string, THREE.Material>, at: THREE.Vector3): void {
  const { x, z } = at;
  addBox(ctx, 7.4, 0.4, 6.4, x, 0.5, z, mats.stone);

  // A shallow arc of wall carrying plaques for the fallen.
  const segs = 7;
  const radius = 5.6;
  for (let i = 0; i < segs; i++) {
    const a = -Math.PI / 2 + (i - (segs - 1) / 2) * 0.22;
    const px = x + Math.cos(a) * radius;
    const pz = z + Math.sin(a) * radius + radius;
    const seg = addBox(ctx, 1.5, 3.4, 0.6, px, 0.9, pz, mats.darkStone, -a - Math.PI / 2, true);
    void seg;
    // Plaque.
    const plaqueGeo = new THREE.PlaneGeometry(1.0, 1.4);
    ctx.geo.push(plaqueGeo);
    const plaqueMat = new THREE.MeshStandardMaterial({
      color: 0x3a3226,
      emissive: new THREE.Color(0x604a2a),
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.85,
    });
    ctx.mat.push(plaqueMat);
    const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaque.position.set(px - Math.cos(a) * 0.34, 2.3, pz - Math.sin(a) * 0.34);
    plaque.rotation.y = -a - Math.PI / 2;
    ctx.root.add(plaque);
  }
  // Coping course along the top.
  addBox(ctx, 0.9, 0.3, 0.9, x, 4.3, z + 1.2, mats.stone);

  // Candle row on the ground in front.
  for (let i = 0; i < 9; i++) {
    const t = (i / 8 - 0.5) * 5.4;
    const cx = x + t;
    const cz = z + 2.4 + Math.abs(t) * 0.1;
    addCyl(ctx, 0.06, 0.07, 0.3 + (i % 3) * 0.06, 6, cx, 0.9, cz, mats.linen);
    if (i % 2 === 0) addLantern(ctx, cx, 1.34, cz, 0xffca80, 2.4, 4.5, 1.0, 0.05, false);
  }

  // A single cold uplight makes the wall read as a monument, not a fence.
  const up = new THREE.SpotLight(0xa8c8ff, 22, 16, 0.7, 0.6, 1.6);
  up.position.set(x, 0.9, z + 3.2);
  up.target.position.set(x, 4.0, z + 5.4);
  up.castShadow = false;
  ctx.root.add(up);
  ctx.root.add(up.target);
  ctx.lights.push(up);
}

function buildPortal(ctx: Ctx, mats: Record<string, THREE.Material>, at: THREE.Vector3): void {
  const { x, z } = at;
  // Stepped approach.
  addBox(ctx, 12, 0.3, 3.0, x, 0.5, z + 4.2, mats.stone);
  addBox(ctx, 10, 0.3, 2.4, x, 0.8, z + 2.6, mats.stone);
  addBox(ctx, 9, 0.4, 5.0, x, 1.1, z - 0.4, mats.darkStone);

  // Gate piers with an arch.
  for (const s of [-1, 1]) {
    addBox(ctx, 1.6, 6.4, 1.6, x + s * 3.4, 1.5, z, mats.darkStone, 0, true);
    addBox(ctx, 2.0, 0.4, 2.0, x + s * 3.4, 1.2, z, mats.stone);
    addBox(ctx, 2.0, 0.5, 2.0, x + s * 3.4, 7.9, z, mats.stone);
    addLantern(ctx, x + s * 3.4, 8.9, z, 0xb46cff, 12, 16, 0.5, 0.16, false);
  }
  const archGeo = new THREE.TorusGeometry(3.4, 0.55, 8, 24, Math.PI);
  ctx.geo.push(archGeo);
  const arch = new THREE.Mesh(archGeo, mats.darkStone);
  arch.position.set(x, 7.6, z);
  arch.castShadow = true;
  ctx.root.add(arch);
  addBox(ctx, 8.4, 0.6, 1.8, x, 8.0, z, mats.stone);

  // The portal itself: two counter-rotating discs plus a glowing core, so it
  // reads as unstable rather than as a decal.
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x8a3cff,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  ctx.mat.push(discMat);
  for (let i = 0; i < 2; i++) {
    const g = new THREE.RingGeometry(0.9 + i * 0.5, 3.0 - i * 0.4, 32, 1);
    ctx.geo.push(g);
    const m = new THREE.Mesh(g, discMat);
    m.position.set(x, 4.0, z + 0.05);
    m.renderOrder = 4;
    ctx.root.add(m);
    ctx.spin.push({ obj: m, speed: i === 0 ? 0.55 : -0.34, axis: 'y' });
  }
  const coreGeo = new THREE.SphereGeometry(1.15, 20, 14);
  ctx.geo.push(coreGeo);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xc36bff, toneMapped: false });
  ctx.mat.push(coreMat);
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.set(x, 4.0, z);
  core.scale.set(1, 1, 0.35);
  ctx.root.add(core);

  const portalLight = new THREE.PointLight(0xa84cff, 30, 26, 2);
  portalLight.position.set(x, 4.0, z + 1.4);
  ctx.root.add(portalLight);
  ctx.lights.push(portalLight);
  ctx.flames.push({ light: portalLight, base: 30, phase: 41.7, flicker: 0.45, mesh: core, meshBase: 1 });
}

function buildPerimeter(ctx: Ctx, mats: Record<string, THREE.Material>): void {
  const R = 21.5;
  const posts = 16;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2 + Math.PI / posts;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    // Leave the gate mouth open.
    if (z < -16 && Math.abs(x) < 7) continue;
    addLanternPost(ctx, x, z, mats);

    // Low wall segments between posts.
    const a2 = ((i + 1) / posts) * Math.PI * 2 + Math.PI / posts;
    const mx = Math.cos((a + a2) / 2) * R;
    const mz = Math.sin((a + a2) / 2) * R;
    if (mz < -16 && Math.abs(mx) < 8) continue;
    const seg = addBox(ctx, 8.0, 1.1, 0.6, mx, 0.2, mz, mats.stone, -(a + a2) / 2, false);
    seg.castShadow = true;
    ctx.colliders.push({ x: mx, z: mz, w: 7.0, d: 1.6 });
  }
}

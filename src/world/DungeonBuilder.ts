/**
 * SLAY — dungeon builder.
 *
 * Turns a `DungeonLevel` into geometry, lights and colliders.
 *
 * Performance shape:
 *  - Static surfaces (floor, wall, trim, ceiling, liquid, veins, puddles) are
 *    written straight into flat vertex arrays and merged **per chunk per
 *    material**, so a 128×128 level is a few dozen draw calls, frustum-culled
 *    by chunk and distance-culled in `update`.
 *  - Every prop kind/variant/layer becomes one `InstancedMesh`.
 *  - Lighting is a **pool**: at most `MAX_TORCH_LIGHTS` real point lights follow
 *    the camera, of which only the first two cast shadows. Every other torch
 *    still reads, because the flame is emissive (bloom catches it) and a cheap
 *    additive floor pool fakes its falloff. That is the trick that lets a level
 *    have 200 torches and 8 lights.
 *  - Flicker is noise-driven, never a sine. A sine reads as a machine; layered
 *    fbm at two rates reads as fire.
 */

import * as THREE from 'three';
import type { BiomeDef, DungeonLevel, DungeonRoom, PropPlacement, Rng } from '../types';
import { Noise, clamp, lerp } from '../art/Noise';
import { biomeArt, type BiomeArt, type FloorVariant } from './Biomes';
import {
  T_CHASM,
  T_DOOR,
  T_LAVA,
  T_VOID,
  T_WALL,
  T_WATER,
  isWalkableValue,
} from './Layouts';
import { STEP_HEIGHT, TILE_SIZE, levelExtras } from './DungeonGen';
import { propDef, propTemplate, scaleFor, variantFor, type PropTemplate } from './Props';
import { surface } from '../art/Materials';

const CHUNK = 32;
const MAX_TORCH_LIGHTS = 8;
const SHADOW_LIGHTS = 2;
const HALF = TILE_SIZE * 0.5;

// ---------------------------------------------------------------------------
// Vertex accumulation
// ---------------------------------------------------------------------------

class Surf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  get empty(): boolean {
    return this.idx.length === 0;
  }

  private quadIndices(): void {
    const b = this.pos.length / 3 - 4;
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  /** Horizontal quad (normal ±Y) covering a tile-sized square at `y`. */
  flat(cx: number, y: number, cz: number, half: number, up: boolean, u0: number, v0: number, us: number): void {
    const n = up ? 1 : -1;
    const order: Array<[number, number]> = up
      ? [
          [-1, 1],
          [1, 1],
          [1, -1],
          [-1, -1],
        ]
      : [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ];
    for (const [dx, dz] of order) {
      this.pos.push(cx + dx * half, y, cz + dz * half);
      this.nor.push(0, n, 0);
      this.uv.push(u0 + (dx * 0.5 + 0.5) * us, v0 + (dz * 0.5 + 0.5) * us);
    }
    this.quadIndices();
  }

  /**
   * Vertical quad. `nx,nz` is the outward normal; the quad is centred on
   * (cx, cz) at the given base height, `w` wide and `h` tall.
   */
  wall(cx: number, yBase: number, cz: number, nx: number, nz: number, w: number, h: number, us: number, vs: number): void {
    // right = n × up
    const rx = nz;
    const rz = -nx;
    const hw = w * 0.5;
    const pts: Array<[number, number, number]> = [
      [cx - rx * hw, yBase, cz - rz * hw],
      [cx + rx * hw, yBase, cz + rz * hw],
      [cx + rx * hw, yBase + h, cz + rz * hw],
      [cx - rx * hw, yBase + h, cz - rz * hw],
    ];
    const uvs: Array<[number, number]> = [
      [0, 0],
      [us, 0],
      [us, vs],
      [0, vs],
    ];
    for (let i = 0; i < 4; i++) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      this.nor.push(nx, 0, nz);
      this.uv.push(uvs[i][0], uvs[i][1]);
    }
    this.quadIndices();
  }

  /** Horizontal strip of depth `d` hanging off a wall face (base/cornice tops). */
  ledge(cx: number, y: number, cz: number, nx: number, nz: number, w: number, d: number, up: boolean): void {
    const rx = nz;
    const rz = -nx;
    const hw = w * 0.5;
    const ox = nx * d;
    const oz = nz * d;
    const a: [number, number, number] = [cx - rx * hw, y, cz - rz * hw];
    const b: [number, number, number] = [cx + rx * hw, y, cz + rz * hw];
    const c: [number, number, number] = [cx + rx * hw + ox, y, cz + rz * hw + oz];
    const dpt: [number, number, number] = [cx - rx * hw + ox, y, cz - rz * hw + oz];
    const order = up ? [a, b, c, dpt] : [dpt, c, b, a];
    const ny = up ? 1 : -1;
    const uvs: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (let i = 0; i < 4; i++) {
      this.pos.push(order[i][0], order[i][1], order[i][2]);
      this.nor.push(0, ny, 0);
      this.uv.push(uvs[i][0], uvs[i][1]);
    }
    this.quadIndices();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

function safeSurface(key: string, opts?: Record<string, unknown>): THREE.Material {
  try {
    const m = surface(key, opts as never);
    if (m) return m;
  } catch {
    /* fall through */
  }
  return new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 0.92 });
}

function variantMaterial(v: FloorVariant): THREE.Material {
  return safeSurface(v.palette, {
    repeat: v.repeat ?? 1,
    tint: v.tint,
    roughness: v.roughness,
    metalness: v.metalness,
    emissive: v.emissive,
    emissiveIntensity: v.emissiveIntensity,
  });
}

/** Soft radial falloff used for the fake light pools. Generated, never loaded. */
function radialTexture(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Biome lighting
// ---------------------------------------------------------------------------

export function applyBiomeLighting(
  scene: THREE.Scene,
  biome: BiomeDef,
): { key: THREE.DirectionalLight; ambient: THREE.Light; dispose(): void } {
  const art = biomeArt(biome.id);

  const fog = new THREE.FogExp2(biome.fogColor, biome.fogDensity);
  scene.fog = fog;
  scene.background = new THREE.Color(art.ceiling === 'open' ? art.skyColor : biome.fogColor);

  // Hemisphere fill: a cool sky term over a warmer bounce term is what stops
  // shadowed geometry from going flat black without washing the scene out.
  // Authored biome values were tuned darker than plays well: enclosed floors
  // ended up readable only inside a torch pool. Lift the floor here rather than
  // editing 8 biome definitions, so their relative moods are preserved.
  const ambient = new THREE.HemisphereLight(
    biome.ambientColor,
    art.bounceColor,
    biome.ambientIntensity * 2.2 + 0.35
  );
  ambient.position.set(0, 40, 0);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(biome.keyColor, biome.keyIntensity * 1.9 + 0.12);
  key.position.set(28, 52, 18);
  key.target.position.set(0, 0, 0);
  scene.add(key.target);
  // Open-sky biomes get a real sun with real shadows; enclosed ones use the key
  // purely as a directional wash, because their shadows come from torches.
  key.castShadow = art.ceiling === 'open';
  if (key.castShadow) {
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 160;
    key.shadow.camera.left = -70;
    key.shadow.camera.right = 70;
    key.shadow.camera.top = 70;
    key.shadow.camera.bottom = -70;
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.03;
  }
  scene.add(key);

  return {
    key,
    ambient,
    dispose(): void {
      scene.remove(ambient);
      scene.remove(key);
      scene.remove(key.target);
      key.dispose();
      ambient.dispose();
      if (scene.fog === fog) scene.fog = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Internal records
// ---------------------------------------------------------------------------

interface TorchRecord {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  distance: number;
  flicker: number;
  /** Index into the flame instanced mesh, or -1. */
  flameMesh: number;
  flameIndex: number;
  phase: number;
}

interface FlameMesh {
  mesh: THREE.InstancedMesh;
  base: Float32Array;
  positions: Float32Array;
}

interface Chunk {
  group: THREE.Group;
  center: THREE.Vector3;
  radius: number;
}

// ---------------------------------------------------------------------------
// DungeonMesh
// ---------------------------------------------------------------------------

export class DungeonMesh {
  readonly root = new THREE.Group();
  readonly colliders: Array<{ x: number; z: number; w: number; d: number }> = [];

  private readonly level: DungeonLevel;
  private readonly art: BiomeArt;
  private readonly biome: BiomeDef;
  private readonly noise: Noise;
  private readonly heights: Int8Array;
  private readonly roomOf: Int16Array;

  private readonly chunks: Chunk[] = [];
  private readonly torches: TorchRecord[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly flames: FlameMesh[] = [];

  private poolMesh: THREE.InstancedMesh | null = null;
  private shafts: THREE.Mesh | null = null;
  private shaftMat: THREE.MeshBasicMaterial | null = null;

  private readonly ownedGeo: THREE.BufferGeometry[] = [];
  private readonly ownedMat: THREE.Material[] = [];
  private readonly ownedTex: THREE.Texture[] = [];

  private readonly halfW: number;
  private readonly halfH: number;

  /** Refresh cadence for the light pool assignment, in seconds. */
  private lightTimer = 0;
  private cullTimer = 0;
  private cullRadius = 68;

  constructor(level: DungeonLevel, biome: BiomeDef, rng: Rng) {
    this.level = level;
    this.biome = biome;
    this.art = biomeArt(biome.id);
    this.noise = new Noise((level.seed ^ 0x7a1c) >>> 0);
    this.halfW = level.width / 2;
    this.halfH = level.height / 2;

    const ex = levelExtras(level);
    this.heights = ex?.heights ?? new Int8Array(level.width * level.height);
    this.roomOf = ex?.roomOf ?? new Int16Array(level.width * level.height).fill(-1);

    this.root.name = `dungeon:${biome.id}:${level.layout}`;

    this.buildStatic(rng);
    this.buildProps(rng);
    this.buildLightPool();
    this.buildShafts(rng);
    this.buildColliders();
  }

  // --- coordinates --------------------------------------------------------

  tileToWorld(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(
      (x - this.halfW + 0.5) * TILE_SIZE,
      this.floorHeight(x, y),
      (y - this.halfH + 0.5) * TILE_SIZE,
    );
  }

  worldToTile(x: number, z: number): { x: number; y: number } {
    return {
      x: Math.floor(x / TILE_SIZE + this.halfW),
      y: Math.floor(z / TILE_SIZE + this.halfH),
    };
  }

  /** Floor surface height at a tile, in world units. */
  floorHeight(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return 0;
    return this.heights[y * this.level.width + x] * STEP_HEIGHT;
  }

  /** Floor surface height at a world position — for entity grounding. */
  floorY(wx: number, wz: number): number {
    const t = this.worldToTile(wx, wz);
    return this.floorHeight(t.x, t.y);
  }

  private tileX(x: number): number {
    return (x - this.halfW + 0.5) * TILE_SIZE;
  }

  private tileZ(y: number): number {
    return (y - this.halfH + 0.5) * TILE_SIZE;
  }

  private tile(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return T_VOID;
    return this.level.tiles[y * this.level.width + x];
  }

  private open(x: number, y: number): boolean {
    const v = this.tile(x, y);
    return isWalkableValue(v) || v === T_CHASM || v === T_LAVA;
  }

  // --- static geometry ----------------------------------------------------

  private buildStatic(rng: Rng): void {
    const level = this.level;
    const art = this.art;
    const W = level.width;
    const H = level.height;

    // Material table. Index order matters only internally.
    const mats: THREE.Material[] = [];
    const floorMats = art.floors.map(variantMaterial);
    const wallMats = art.walls.map(variantMaterial);
    const trimMat = variantMaterial(art.trim);
    const baseMat = safeSurface(art.baseTrim, { repeat: 1.2 });
    const ceilMat = safeSurface(art.walls[0].palette, { repeat: 1.6, tint: 0x6a6a72, roughness: 1 });

    const liquidMat = this.makeLiquidMaterial();
    const veinMat = new THREE.MeshBasicMaterial({
      color: art.veinColor,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ownedMat.push(veinMat);
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e12,
      roughness: 0.045,
      metalness: 0.35,
      transparent: true,
      opacity: 0.72,
    });
    this.ownedMat.push(puddleMat);

    const FLOOR0 = 0;
    const WALL0 = FLOOR0 + floorMats.length;
    const TRIM = WALL0 + wallMats.length;
    const BASE = TRIM + 1;
    const CEIL = BASE + 1;
    const LIQ = CEIL + 1;
    const VEIN = LIQ + 1;
    const PUDDLE = VEIN + 1;
    const BUCKETS = PUDDLE + 1;
    mats.push(...floorMats, ...wallMats, trimMat, baseMat, ceilMat, liquidMat, veinMat, puddleMat);

    // Deterministic per-room floor variant.
    const roomVariant = new Map<number, number>();
    for (const room of level.rooms) {
      const pick = rng.chance(art.roomMaterialVariance)
        ? rng.weighted(art.floors, (f) => f.weight)
        : art.floors[0];
      roomVariant.set(room.id, Math.max(0, art.floors.indexOf(pick)));
    }

    const chunksX = Math.ceil(W / CHUNK);
    const chunksY = Math.ceil(H / CHUNK);
    const wallH = art.wallHeight;
    const ceilY = art.ceilingHeight;

    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const surfs: Surf[] = [];
        for (let i = 0; i < BUCKETS; i++) surfs.push(new Surf());

        const x0 = cx * CHUNK;
        const y0 = cy * CHUNK;
        const x1 = Math.min(W, x0 + CHUNK);
        const y1 = Math.min(H, y0 + CHUNK);

        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const v = this.tile(x, y);
            if (v === T_VOID) continue;
            const wx = this.tileX(x);
            const wz = this.tileZ(y);
            const hy = this.heights[y * W + x] * STEP_HEIGHT;

            if (v === T_WALL) {
              this.emitWall(surfs, x, y, wx, wz, hy, wallH, wallMats.length, WALL0, TRIM, BASE);
              continue;
            }

            if (v === T_CHASM) {
              // A chasm is a hole: drop the walls of the pit and no floor at all.
              this.emitPitWalls(surfs, x, y, wx, wz, hy, WALL0);
              continue;
            }

            // Walkable (or lava, which is a floor you should not stand on).
            const rid = this.roomOf[y * W + x];
            let fv = rid >= 0 ? roomVariant.get(rid) ?? 0 : 0;
            // Damage: bias a fraction of tiles to the last (most broken) variant.
            if (art.floors.length > 1) {
              const dmg = this.noise.fbm(x * 0.14, y * 0.14, 3) * 0.5 + 0.5;
              if (dmg > 1 - art.damage * 0.55) fv = art.floors.length - 1;
            }
            const s = surfs[FLOOR0 + clamp(fv, 0, floorMats.length - 1)];
            const us = art.floors[clamp(fv, 0, art.floors.length - 1)].repeat ?? 1;
            s.flat(wx, hy, wz, HALF, true, (x * us) % 8, (y * us) % 8, us);

            // Height skirts wherever the neighbour sits lower.
            for (let d = 0; d < 4; d++) {
              const nx = x + DX4[d];
              const ny = y + DY4[d];
              const nOpen = this.open(nx, ny);
              const nh = nOpen ? this.heights[ny * W + nx] * STEP_HEIGHT : hy;
              if (!nOpen || nh >= hy - 0.001) continue;
              s.wall(
                wx + DX4[d] * HALF,
                nh,
                wz + DY4[d] * HALF,
                DX4[d],
                DY4[d],
                TILE_SIZE,
                hy - nh,
                1,
                (hy - nh) / TILE_SIZE,
              );
            }

            // Liquid surface.
            if (v === T_WATER || v === T_LAVA) {
              surfs[LIQ].flat(wx, hy + 0.13, wz, HALF, true, x % 4, y % 4, 1);
            }

            // Emissive veins in the cracks.
            if (art.veinDensity > 0 && v !== T_WATER) {
              const n = this.noise.ridged(x * 0.09 + 11, y * 0.09, 3);
              if (n > 1 - art.veinDensity * 0.5) {
                surfs[VEIN].flat(wx, hy + 0.02, wz, HALF * 0.92, true, 0, 0, 1);
              }
            }

            // Reflective puddles.
            if (art.puddles > 0 && v !== T_WATER && v !== T_LAVA) {
              const n = this.noise.fbm(x * 0.2 + 33, y * 0.2, 2) * 0.5 + 0.5;
              if (n > 1 - art.puddles * 0.42) {
                surfs[PUDDLE].flat(wx, hy + 0.015, wz, HALF * 0.86, true, 0, 0, 1);
              }
            }

            // Ceiling.
            if (art.ceiling !== 'open') {
              const hole =
                art.ceilingHoles > 0 &&
                this.noise.fbm(x * 0.08 + 77, y * 0.08, 3) * 0.5 + 0.5 > 1 - art.ceilingHoles;
              if (!hole) surfs[CEIL].flat(wx, hy + ceilY, wz, HALF, false, x % 6, y % 6, 1.4);
            }
          }
        }

        // Emit the chunk.
        const group = new THREE.Group();
        group.name = `chunk_${cx}_${cy}`;
        let any = false;
        for (let i = 0; i < BUCKETS; i++) {
          const s = surfs[i];
          if (s.empty) continue;
          const geo = s.build();
          this.ownedGeo.push(geo);
          const mesh = new THREE.Mesh(geo, mats[i]);
          mesh.castShadow = i >= WALL0 && i < CEIL;
          mesh.receiveShadow = i !== VEIN && i !== LIQ;
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          if (i === VEIN) mesh.renderOrder = 2;
          if (i === LIQ) mesh.renderOrder = 1;
          group.add(mesh);
          any = true;
        }
        if (!any) continue;

        const centre = new THREE.Vector3(
          this.tileX((x0 + x1) / 2 - 0.5),
          wallH * 0.4,
          this.tileZ((y0 + y1) / 2 - 0.5),
        );
        this.chunks.push({ group, center: centre, radius: CHUNK * TILE_SIZE * 0.75 });
        this.root.add(group);
      }
    }
  }

  private makeLiquidMaterial(): THREE.Material {
    const art = this.art;
    if (art.liquid === 'lava' || art.liquid === 'voidwater') {
      const m = new THREE.MeshStandardMaterial({
        color: art.liquidColor,
        emissive: new THREE.Color(art.liquidEmissive),
        emissiveIntensity: 2.4,
        roughness: 0.55,
        metalness: 0,
      });
      this.ownedMat.push(m);
      return m;
    }
    if (art.liquid === 'ice') {
      const m = new THREE.MeshStandardMaterial({
        color: art.liquidColor,
        roughness: 0.06,
        metalness: 0.1,
        transparent: true,
        opacity: 0.72,
      });
      this.ownedMat.push(m);
      return m;
    }
    const m = new THREE.MeshStandardMaterial({
      color: art.liquidColor,
      emissive: new THREE.Color(art.liquidEmissive),
      emissiveIntensity: 0.45,
      roughness: 0.03,
      metalness: 0.55,
      transparent: true,
      opacity: art.liquid === 'sludge' ? 0.94 : 0.78,
    });
    this.ownedMat.push(m);
    return m;
  }

  /**
   * A wall tile. Only faces that touch open space are emitted, plus a top cap,
   * a protruding base course and a cornice — that trio is what gives a wall
   * mass instead of reading as a cardboard plane.
   */
  private emitWall(
    surfs: Surf[],
    x: number,
    y: number,
    wx: number,
    wz: number,
    hy: number,
    wallH: number,
    wallCount: number,
    WALL0: number,
    TRIM: number,
    BASE: number,
  ): void {
    const topY = hy + wallH;
    // Deterministic wall variant, clumped so it reads as masonry courses rather
    // than per-tile noise.
    const nv = this.noise.fbm(x * 0.07, y * 0.07, 2) * 0.5 + 0.5;
    const wi = WALL0 + Math.min(wallCount - 1, Math.floor(nv * wallCount));
    const s = surfs[wi];
    const trim = surfs[TRIM];
    const base = surfs[BASE];

    let exposed = false;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX4[d];
      const ny = y + DY4[d];
      if (!this.open(nx, ny)) continue;
      exposed = true;
      const nh = this.heights[ny * this.level.width + nx] * STEP_HEIGHT;
      const yBottom = Math.min(nh, hy) - 0.15;
      const fx = wx + DX4[d] * HALF;
      const fz = wz + DY4[d] * HALF;
      const h = topY - yBottom;
      s.wall(fx, yBottom, fz, DX4[d], DY4[d], TILE_SIZE, h, 1, h / TILE_SIZE);

      // Base course: a plinth that steps out from the wall.
      const bh = 0.42;
      const bd = 0.13;
      base.wall(fx + DX4[d] * bd, nh - 0.1, fz + DY4[d] * bd, DX4[d], DY4[d], TILE_SIZE, bh + 0.1, 1, 0.3);
      base.ledge(fx, nh + bh, fz, DX4[d], DY4[d], TILE_SIZE, bd, true);

      // Cornice: overhang at the top, plus its underside so it catches shadow.
      const ch = 0.3;
      const cd = 0.19;
      trim.wall(fx + DX4[d] * cd, topY - ch, fz + DY4[d] * cd, DX4[d], DY4[d], TILE_SIZE, ch, 1, 0.22);
      trim.ledge(fx, topY - ch, fz, DX4[d], DY4[d], TILE_SIZE, cd, false);
      trim.ledge(fx, topY, fz, DX4[d], DY4[d], TILE_SIZE, cd, true);

      // A slim string course two thirds up breaks the vertical run.
      if (this.art.ceiling !== 'open' && wallH > 3.4) {
        const my = hy + wallH * 0.66;
        trim.wall(fx + DX4[d] * 0.07, my, fz + DY4[d] * 0.07, DX4[d], DY4[d], TILE_SIZE, 0.16, 1, 0.12);
        trim.ledge(fx, my + 0.16, fz, DX4[d], DY4[d], TILE_SIZE, 0.07, true);
      }
    }
    if (exposed) s.flat(wx, topY, wz, HALF, true, x % 4, y % 4, 1);
  }

  /** Walls of a pit, dropped below the surrounding floor. */
  private emitPitWalls(surfs: Surf[], x: number, y: number, wx: number, wz: number, hy: number, WALL0: number): void {
    const depth = 6;
    const s = surfs[WALL0];
    for (let d = 0; d < 4; d++) {
      const nx = x + DX4[d];
      const ny = y + DY4[d];
      const v = this.tile(nx, ny);
      if (v === T_CHASM || v === T_VOID) continue;
      const nh = this.heights[ny * this.level.width + nx] * STEP_HEIGHT;
      // Inward-facing: normal points back toward this tile.
      s.wall(wx + DX4[d] * HALF, nh - depth, wz + DY4[d] * HALF, -DX4[d], -DY4[d], TILE_SIZE, depth + 0.2, 1, 2);
    }
    void hy;
  }

  // --- props --------------------------------------------------------------

  private buildProps(rng: Rng): void {
    const level = this.level;
    const art = this.art;

    // Group placements by kind+variant so each becomes one InstancedMesh set.
    const groups = new Map<string, { kind: string; variant: number; list: PropPlacement[] }>();
    for (const p of level.props) {
      const variant = variantFor(p.kind, p.x, p.y);
      const key = `${p.kind}|${variant}`;
      let g = groups.get(key);
      if (!g) {
        g = { kind: p.kind, variant, list: [] };
        groups.set(key, g);
      }
      g.list.push(p);
    }

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (const g of groups.values()) {
      const def = propDef(g.kind);
      let tmpl: PropTemplate;
      try {
        tmpl = propTemplate(g.kind, art, level.seed, g.variant);
      } catch {
        continue;
      }
      const n = g.list.length;
      if (n === 0) continue;

      // Precompute transforms once; every layer and the flame share them.
      const xs = new Float32Array(n);
      const ys = new Float32Array(n);
      const zs = new Float32Array(n);
      const rot = new Float32Array(n);
      const sc = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const p = g.list[i];
        const yaw = def.freeRotate ? p.rotation : p.rotation;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const off = def.placement === 'wall' ? (def.wallOffset ?? 0.7) : 0;
        xs[i] = this.tileX(p.x) - fx * off;
        zs[i] = this.tileZ(p.y) - fz * off;
        ys[i] = this.floorHeight(p.x, p.y);
        rot[i] = yaw;
        sc[i] = scaleFor(g.kind, p.x, p.y);
      }

      for (const layer of tmpl.layers) {
        const inst = new THREE.InstancedMesh(layer.geometry, layer.material, n);
        inst.name = `prop:${g.kind}:${g.variant}`;
        inst.castShadow = tmpl.castShadow && !layer.ghost;
        inst.receiveShadow = tmpl.receiveShadow && !layer.ghost;
        if (layer.ghost) inst.renderOrder = 3;
        for (let i = 0; i < n; i++) {
          q.setFromAxisAngle(up, rot[i]);
          pos.set(xs[i], ys[i], zs[i]);
          scl.set(sc[i], sc[i], sc[i]);
          m4.compose(pos, q, scl);
          inst.setMatrixAt(i, m4);
        }
        inst.instanceMatrix.needsUpdate = true;
        inst.frustumCulled = true;
        inst.computeBoundingSphere();
        this.root.add(inst);
      }

      // Emissive flame + light record.
      if (tmpl.flame) {
        const flameMesh = new THREE.InstancedMesh(tmpl.flame.geometry, tmpl.flame.material, n);
        flameMesh.name = `flame:${g.kind}`;
        flameMesh.castShadow = false;
        flameMesh.receiveShadow = false;
        flameMesh.renderOrder = 4;
        const base = new Float32Array(n);
        const positions = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const fx = Math.sin(rot[i]);
          const fz = Math.cos(rot[i]);
          const px = xs[i] + fx * tmpl.flame.forward;
          const pz = zs[i] + fz * tmpl.flame.forward;
          const py = ys[i] + tmpl.flame.y * sc[i];
          positions[i * 3] = px;
          positions[i * 3 + 1] = py;
          positions[i * 3 + 2] = pz;
          base[i] = sc[i];
          q.setFromAxisAngle(up, rot[i]);
          pos.set(px, py, pz);
          scl.set(sc[i], sc[i], sc[i]);
          m4.compose(pos, q, scl);
          flameMesh.setMatrixAt(i, m4);
        }
        flameMesh.instanceMatrix.needsUpdate = true;
        flameMesh.computeBoundingSphere();
        this.root.add(flameMesh);
        const meshIndex = this.flames.length;
        this.flames.push({ mesh: flameMesh, base, positions });

        if (tmpl.light) {
          for (let i = 0; i < n; i++) {
            const fx = Math.sin(rot[i]);
            const fz = Math.cos(rot[i]);
            this.torches.push({
              pos: new THREE.Vector3(
                xs[i] + fx * tmpl.light.forward,
                ys[i] + tmpl.light.height * sc[i],
                zs[i] + fz * tmpl.light.forward,
              ),
              color: new THREE.Color(tmpl.light.color),
              intensity: tmpl.light.intensity,
              distance: tmpl.light.distance,
              flicker: tmpl.light.flicker,
              flameMesh: meshIndex,
              flameIndex: i,
              phase: rng.range(0, 100),
            });
          }
        }
      } else if (tmpl.light) {
        for (let i = 0; i < n; i++) {
          const fx = Math.sin(rot[i]);
          const fz = Math.cos(rot[i]);
          this.torches.push({
            pos: new THREE.Vector3(
              xs[i] + fx * tmpl.light.forward,
              ys[i] + tmpl.light.height * sc[i],
              zs[i] + fz * tmpl.light.forward,
            ),
            color: new THREE.Color(tmpl.light.color),
            intensity: tmpl.light.intensity,
            distance: tmpl.light.distance,
            flicker: tmpl.light.flicker,
            flameMesh: -1,
            flameIndex: -1,
            phase: rng.range(0, 100),
          });
        }
      }
    }

    this.buildLightPools();
  }

  /**
   * Additive floor decals under every torch. This is the cheat that lets the
   * scene keep 200 light sources: the eight real lights handle the ones near
   * you, and these carry the rest of the room at zero shading cost.
   */
  private buildLightPools(): void {
    if (this.torches.length === 0) return;
    const tex = radialTexture(128);
    this.ownedTex.push(tex);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
      toneMapped: false,
    });
    this.ownedMat.push(mat);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.ownedGeo.push(geo);

    const inst = new THREE.InstancedMesh(geo, mat, this.torches.length);
    inst.name = 'lightPools';
    inst.renderOrder = 2;
    inst.castShadow = false;
    inst.receiveShadow = false;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const colour = new THREE.Color();
    for (let i = 0; i < this.torches.length; i++) {
      const t = this.torches[i];
      const groundY = this.floorY(t.pos.x, t.pos.z);
      const r = t.distance * 0.72;
      pos.set(t.pos.x, groundY + 0.03, t.pos.z);
      scl.set(r, 1, r);
      m4.compose(pos, q, scl);
      inst.setMatrixAt(i, m4);
      colour.copy(t.color).multiplyScalar(0.55);
      inst.setColorAt(i, colour);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    this.root.add(inst);
    this.poolMesh = inst;
  }

  // --- light pool ---------------------------------------------------------

  private buildLightPool(): void {
    for (let i = 0; i < MAX_TORCH_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = i < SHADOW_LIGHTS;
      if (l.castShadow) {
        l.shadow.mapSize.set(512, 512);
        l.shadow.camera.near = 0.4;
        l.shadow.camera.far = 22;
        l.shadow.bias = -0.004;
        l.shadow.normalBias = 0.05;
      }
      l.visible = false;
      this.lights.push(l);
      this.root.add(l);
    }
  }

  // --- volumetric-ish shafts ---------------------------------------------

  /**
   * Cheap god rays: additive cones with a vertex-colour gradient that fades to
   * black (= invisible under additive blending) at the floor. No depth write, no
   * sorting problems, one draw call for the whole level.
   */
  private buildShafts(rng: Rng): void {
    const art = this.art;
    if (art.shaftDensity <= 0) return;

    const candidates: Array<{ x: number; y: number }> = [];
    for (const room of this.level.rooms) {
      if (room.w < 6 || room.h < 6) continue;
      const tries = Math.max(1, Math.round(room.w * room.h * 0.004 * art.shaftDensity * 6));
      for (let i = 0; i < tries; i++) {
        const x = room.x + rng.int(1, Math.max(1, room.w - 2));
        const y = room.y + rng.int(1, Math.max(1, room.h - 2));
        if (!isWalkableValue(this.tile(x, y))) continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return;

    const top = art.ceiling === 'open' ? 16 : art.ceilingHeight;
    const parts: THREE.BufferGeometry[] = [];
    const colour = new THREE.Color(art.shaftColor);
    for (const c of candidates) {
      const h = top;
      const rTop = rng.range(0.5, 1.1);
      const rBot = rTop + rng.range(1.4, 3.0);
      const geo = new THREE.CylinderGeometry(rTop, rBot, h, 9, 1, true);
      const posAttr = geo.getAttribute('position');
      const colours = new Float32Array(posAttr.count * 3);
      for (let i = 0; i < posAttr.count; i++) {
        const yy = posAttr.getY(i);
        // +h/2 at the top of the cylinder, -h/2 at the floor.
        const t = clamp((yy + h / 2) / h, 0, 1);
        const a = Math.pow(t, 2.1) * 0.5;
        colours[i * 3] = colour.r * a;
        colours[i * 3 + 1] = colour.g * a;
        colours[i * 3 + 2] = colour.b * a;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      geo.deleteAttribute('normal');
      geo.deleteAttribute('uv');
      const base = this.floorHeight(c.x, c.y);
      geo.translate(this.tileX(c.x), base + h / 2, this.tileZ(c.y));
      parts.push(geo);
    }

    const merged = mergeSimple(parts);
    if (!merged) return;
    this.ownedGeo.push(merged);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.ownedMat.push(mat);
    this.shaftMat = mat;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'lightShafts';
    mesh.renderOrder = 5;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.shafts = mesh;
    this.root.add(mesh);
  }

  // --- colliders ----------------------------------------------------------

  /**
   * Greedy rectangle merge over blocking tiles. A 128×128 level has ~6000 wall
   * tiles; naive per-tile AABBs would make movement collision the frame budget.
   * Merged runs bring it down to a few hundred boxes.
   */
  private buildColliders(): void {
    const W = this.level.width;
    const H = this.level.height;
    const solid = new Uint8Array(W * H);
    for (let i = 0; i < solid.length; i++) {
      const v = this.level.tiles[i];
      solid[i] = isWalkableValue(v) ? 0 : 1;
    }
    // Void tiles outside the shell do not need colliders; the wall ring covers them.
    for (let i = 0; i < solid.length; i++) if (this.level.tiles[i] === T_VOID) solid[i] = 0;
    // Chasms and lava block movement.
    for (let i = 0; i < solid.length; i++) {
      const v = this.level.tiles[i];
      if (v === T_CHASM || v === T_LAVA || v === T_WALL) solid[i] = 1;
    }

    const used = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!solid[i] || used[i]) continue;
        // Extend right.
        let w = 1;
        while (x + w < W && solid[i + w] && !used[i + w]) w++;
        // Extend down while the whole run matches.
        let h = 1;
        outer: while (y + h < H) {
          const row = (y + h) * W + x;
          for (let k = 0; k < w; k++) {
            if (!solid[row + k] || used[row + k]) break outer;
          }
          h++;
        }
        for (let yy = 0; yy < h; yy++) {
          const row = (y + yy) * W + x;
          for (let k = 0; k < w; k++) used[row + k] = 1;
        }
        this.colliders.push({
          x: this.tileX(x) + ((w - 1) * TILE_SIZE) / 2,
          z: this.tileZ(y) + ((h - 1) * TILE_SIZE) / 2,
          w: w * TILE_SIZE,
          d: h * TILE_SIZE,
        });
      }
    }

    // Prop colliders.
    for (const p of this.level.props) {
      const def = propDef(p.kind);
      if (!def.blocks || def.radius <= 0) continue;
      const s = scaleFor(p.kind, p.x, p.y);
      const r = def.radius * s * 2;
      this.colliders.push({ x: this.tileX(p.x), z: this.tileZ(p.y), w: r, d: r });
    }
  }

  /** Tiles that a blocking prop occupies — feed this to `NavGrid.blockTiles`. */
  blockedPropTiles(): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (const p of this.level.props) {
      if (propDef(p.kind).blocks) out.push({ x: p.x, y: p.y });
    }
    return out;
  }

  // --- per-frame ----------------------------------------------------------

  update(dt: number, elapsed: number, focus: THREE.Vector3): void {
    this.updateLights(dt, elapsed, focus);
    this.updateFlames(elapsed, focus);

    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.25;
      const r2 = this.cullRadius * this.cullRadius;
      for (const c of this.chunks) {
        const dx = c.center.x - focus.x;
        const dz = c.center.z - focus.z;
        const d2 = dx * dx + dz * dz;
        const lim = this.cullRadius + c.radius;
        c.group.visible = d2 < lim * lim;
        void r2;
      }
    }

    if (this.shaftMat) {
      // Very slow breathing so the shafts feel like drifting dust, not a pulse.
      const n = this.noise.fbm(elapsed * 0.13, 4.2, 2);
      this.shaftMat.opacity = 0.7 + n * 0.22;
    }
  }

  private updateLights(dt: number, elapsed: number, focus: THREE.Vector3): void {
    if (this.torches.length === 0) return;

    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.2;
      // Nearest-N selection. Partial select rather than a full sort: torch counts
      // run into the hundreds and this happens five times a second.
      const picks: number[] = [];
      const dists: number[] = [];
      for (let i = 0; i < this.torches.length; i++) {
        const t = this.torches[i];
        const dx = t.pos.x - focus.x;
        const dz = t.pos.z - focus.z;
        const dy = t.pos.y - focus.y;
        const d = dx * dx + dz * dz + dy * dy * 0.25;
        if (picks.length < MAX_TORCH_LIGHTS) {
          picks.push(i);
          dists.push(d);
          continue;
        }
        let worst = 0;
        for (let k = 1; k < picks.length; k++) if (dists[k] > dists[worst]) worst = k;
        if (d < dists[worst]) {
          picks[worst] = i;
          dists[worst] = d;
        }
      }
      // Stable ordering keeps the two shadow-casting lights on the two closest.
      const order = picks
        .map((idx, k) => ({ idx, d: dists[k] }))
        .sort((a, b) => a.d - b.d);
      for (let i = 0; i < this.lights.length; i++) {
        const l = this.lights[i];
        const pick = order[i];
        if (!pick) {
          l.visible = false;
          l.userData.torch = -1;
          continue;
        }
        const t = this.torches[pick.idx];
        l.visible = true;
        l.position.copy(t.pos);
        l.color.copy(t.color);
        l.distance = t.distance;
        l.decay = 2;
        l.userData.torch = pick.idx;
      }
    }

    // Flicker every frame on whichever torches currently own a light.
    for (const l of this.lights) {
      if (!l.visible) continue;
      const ti = (l.userData.torch as number) ?? -1;
      if (ti < 0) continue;
      const t = this.torches[ti];
      l.intensity = t.intensity * this.flickerAt(t, elapsed);
    }
  }

  /**
   * Two octaves of noise at different rates: a slow wander for the body of the
   * flame and a fast jitter for the tongue. Clamped so a torch never fully dies.
   */
  private flickerAt(t: TorchRecord, elapsed: number): number {
    if (t.flicker <= 0) return 1;
    const slow = this.noise.simplex2(elapsed * 1.6 + t.phase, t.phase * 0.37);
    const fast = this.noise.simplex2(elapsed * 7.3 + t.phase * 2.1, 11.7);
    const v = 1 + (slow * 0.16 + fast * 0.075) * t.flicker * 2.1;
    return clamp(v, 0.55, 1.45);
  }

  private updateFlames(elapsed: number, focus: THREE.Vector3): void {
    if (this.flames.length === 0) return;
    // Only animate flames near the camera; the rest keep their rest pose and
    // still bloom correctly.
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const RANGE = 34 * 34;

    const touched = new Set<number>();
    for (const t of this.torches) {
      if (t.flameMesh < 0) continue;
      const dx = t.pos.x - focus.x;
      const dz = t.pos.z - focus.z;
      if (dx * dx + dz * dz > RANGE) continue;
      const fm = this.flames[t.flameMesh];
      const i = t.flameIndex;
      const f = this.flickerAt(t, elapsed);
      const base = fm.base[i];
      const sx = base * lerp(0.86, 1.1, f - 0.4);
      const sy = base * lerp(0.7, 1.35, f - 0.35);
      pos.set(fm.positions[i * 3], fm.positions[i * 3 + 1] + (f - 1) * 0.045, fm.positions[i * 3 + 2]);
      q.setFromAxisAngle(UP_AXIS, t.phase + elapsed * 0.7);
      scl.set(sx, sy, sx);
      m4.compose(pos, q, scl);
      fm.mesh.setMatrixAt(i, m4);
      touched.add(t.flameMesh);
    }
    for (const idx of touched) this.flames[idx].mesh.instanceMatrix.needsUpdate = true;
  }

  // --- teardown -----------------------------------------------------------

  dispose(): void {
    this.root.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        im.dispose();
      }
    });
    for (const l of this.lights) {
      l.dispose();
      this.root.remove(l);
    }
    this.lights.length = 0;
    for (const g of this.ownedGeo) g.dispose();
    for (const m of this.ownedMat) m.dispose();
    for (const t of this.ownedTex) t.dispose();
    this.ownedGeo.length = 0;
    this.ownedMat.length = 0;
    this.ownedTex.length = 0;
    this.root.clear();
    this.chunks.length = 0;
    this.torches.length = 0;
    this.flames.length = 0;
    this.poolMesh = null;
    this.shafts = null;
    this.shaftMat = null;
  }
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const DX4 = [1, -1, 0, 0];
const DY4 = [0, 0, 1, -1];

/**
 * Position+colour-only merge for the light shafts. Local rather than shared
 * because these geometries deliberately carry no normals or uvs.
 */
function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (list.length === 0) return null;
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.getAttribute('position').count;
    iCount += g.index ? g.index.count : g.getAttribute('position').count;
  }
  const pos = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const c = g.getAttribute('color');
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i);
      pos[(vo + i) * 3 + 1] = p.getY(i);
      pos[(vo + i) * 3 + 2] = p.getZ(i);
      if (c) {
        col[(vo + i) * 3] = c.getX(i);
        col[(vo + i) * 3 + 1] = c.getY(i);
        col[(vo + i) * 3 + 2] = c.getZ(i);
      }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = vo + g.index.getX(i);
      io += g.index.count;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Unused-tile guard kept for readability of the switch above. */
void T_DOOR;

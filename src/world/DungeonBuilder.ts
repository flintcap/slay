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
import { biomeArt, wallKitOf, type BiomeArt, type FloorVariant, type WallKit } from './Biomes';
import {
  T_CHASM,
  T_DOOR,
  T_LAVA,
  T_VOID,
  T_WALL,
  T_WATER,
  T_RUIN,
  T_BRIDGE,
  drawAsKind,
  isWalkableValue,
} from './Layouts';
import { buildTerrain, isOutdoorLevel, type TerrainBuild } from './Terrain';
import { lightDirection, lightMood } from './Lighting';
import { STEP_HEIGHT, TILE_SIZE, levelExtras, propGroundHeight } from './DungeonGen';
import { propDef, propTemplate, scaleFor, variantFor, type PropTemplate } from './Props';

import { surface, surfaceVariant } from '../art/Materials';
import { setFogShape, fogShape } from '../core/Renderer';
import { worldMaterial, setWorldCutaway, setWorldRoof, addWorldCutaway, WORLD_ENV_ATTRIBUTE, WORLD_CAP_ENV, type WorldMaterialOpts } from '../art/WorldMaterial';
import { liquidSurface, type LiquidSurface, type LiquidStyle } from '../art/Liquids';
import { crackTexture } from '../fx/UtilityTextures';
import { Drips, type DripSite } from './Ambience';

/** One usable thing in the world, and the instance slot that draws it. */
export interface Interactable {
  /** The payload from the prop definition: 'chest', 'shrine', 'barrel', ... */
  kind: string;
  propKind: string;
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  z: number;
  /** Which instance of the batch this is. */
  index: number;
  /** Every instanced mesh drawing this prop kind, so it can be hidden. */
  meshes: THREE.InstancedMesh[];
  used: boolean;
}


const CHUNK = 32;
const MAX_TORCH_LIGHTS = 8;
const SHADOW_LIGHTS = 2;
const HALF = TILE_SIZE * 0.5;
/**
 * How much of the lid is cut away around the player, in world units.
 *
 * Sized against the camera, not by taste. The rig sits 15.5m back at 0.92
 * radians, so the readable floor runs about 26m ahead of the player, and an
 * opening smaller than that leaves a dark cap sitting in the middle of the
 * frame — which is exactly what the first render after the ceiling fix showed.
 * At 30m the biome fog is already carrying half the distant frame, so the point
 * where the rock closes over is hidden rather than seen.
 */
const ROOF_OPEN = 30;

// ---------------------------------------------------------------------------
// Vertex accumulation
// ---------------------------------------------------------------------------

class Surf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  /**
   * Per-vertex world context for `worldMaterial` materials: contact occlusion
   * on floors, height above the floor on walls. See `WorldMaterial.ts`.
   */
  env: number[] = [];
  idx: number[] = [];

  /** `env` written for vertices whose caller does not say. */
  constructor(readonly defEnv = 0) {}

  get empty(): boolean {
    return this.idx.length === 0;
  }

  private quadIndices(): void {
    const b = this.pos.length / 3 - 4;
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  /**
   * Horizontal quad (normal ±Y) covering a tile-sized square at `y`.
   *
   * `env` is per corner in emission order (for `up`: -x+z, +x+z, +x-z, -x-z).
   * `mirror` bit 0 flips U and bit 1 flips V across the tile. Mirroring is
   * seamless only when the tile spans a whole number of texture repeats, which
   * the caller checks: the shared edge then samples the same texel column on
   * both sides whichever way each tile faces.
   */
  flat(
    cx: number,
    y: number,
    cz: number,
    half: number,
    up: boolean,
    u0: number,
    v0: number,
    us: number,
    env?: readonly number[],
    mirror = 0,
  ): void {
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
    const mu = mirror & 1 ? -1 : 1;
    const mv = mirror & 2 ? -1 : 1;
    for (let k = 0; k < 4; k++) {
      const [dx, dz] = order[k]!;
      this.pos.push(cx + dx * half, y, cz + dz * half);
      this.nor.push(0, n, 0);
      this.uv.push(u0 + (mu * dx * 0.5 + 0.5) * us, v0 + (mv * dz * 0.5 + 0.5) * us);
      this.env.push(env ? env[k]! : this.defEnv);
    }
    this.quadIndices();
  }

  /**
   * Vertical quad. `nx,nz` is the outward normal; the quad is centred on
   * (cx, cz) at the given base height, `w` wide and `h` tall.
   *
   * `u0`/`v0` offset the texture so neighbouring faces can continue one
   * another instead of each restarting at zero; `flipU` mirrors across the
   * face. `envLo`/`envHi` are written at the bottom and top edges.
   */
  wall(
    cx: number,
    yBase: number,
    cz: number,
    nx: number,
    nz: number,
    w: number,
    h: number,
    us: number,
    vs: number,
    u0 = 0,
    v0 = 0,
    flipU = false,
    envLo?: number,
    envHi?: number,
  ): void {
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
    const ua = flipU ? us : 0;
    const ub = flipU ? 0 : us;
    const uvs: Array<[number, number]> = [
      [u0 + ua, v0],
      [u0 + ub, v0],
      [u0 + ub, v0 + vs],
      [u0 + ua, v0 + vs],
    ];
    const lo = envLo ?? this.defEnv;
    const hi = envHi ?? this.defEnv;
    for (let i = 0; i < 4; i++) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      this.nor.push(nx, 0, nz);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.env.push(i < 2 ? lo : hi);
    }
    this.quadIndices();
  }

  /**
   * A displaced grid: `pts[row][col]`, rows bottom to top, columns along the
   * face to its right (the same handedness as `wall`). Normals come from the
   * grid itself, so a lumpy rock face shades as one surface.
   */
  grid(pts: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>, env: ReadonlyArray<number>): void {
    const rows = pts.length;
    const cols = pts[0]!.length;
    const base = this.pos.length / 3;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const p = pts[j]![i]!;
        const l = pts[j]![Math.max(0, i - 1)]!;
        const r = pts[j]![Math.min(cols - 1, i + 1)]!;
        const dn = pts[Math.max(0, j - 1)]![i]!;
        const up = pts[Math.min(rows - 1, j + 1)]![i]!;
        const ux = r[0] - l[0], uy = r[1] - l[1], uz = r[2] - l[2];
        const vx = up[0] - dn[0], vy = up[1] - dn[1], vz = up[2] - dn[2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(nx, ny, nz);
        this.uv.push(i / (cols - 1), j / (rows - 1));
        this.env.push(env[j] ?? this.defEnv);
      }
    }
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = base + j * cols + i;
        this.idx.push(a, a + 1, a + cols + 1, a, a + cols + 1, a + cols);
      }
    }
  }

  /**
   * Any planar quad, corners counter-clockwise seen from the side `n` faces
   * (the winding is fixed up if not). One normal for all four corners.
   */
  quad(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    d: readonly [number, number, number],
    n: readonly [number, number, number],
    env: readonly [number, number, number, number],
  ): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy;
    const gy = uz * vx - ux * vz;
    const gz = ux * vy - uy * vx;
    const flip = gx * n[0] + gy * n[1] + gz * n[2] < 0;
    const pts = flip ? [a, d, c, b] : [a, b, c, d];
    const ev = flip ? [env[0], env[3], env[2], env[1]] : env;
    for (let k = 0; k < 4; k++) {
      const p = pts[k]!;
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0);
      this.env.push(ev[k]!);
    }
    this.quadIndices();
  }

  /** An upright box face set (front and both sides) standing out of a wall: pilasters, piers. */
  pier(cx: number, yBase: number, cz: number, nx: number, nz: number, w: number, depth: number, h: number, envLo: number, envHi: number): void {
    const rx = nz;
    const rz = -nx;
    // Front.
    this.wall(cx + nx * depth, yBase, cz + nz * depth, nx, nz, w, h, 1, 1, 0, 0, false, envLo, envHi);
    // Sides, facing along the wall.
    const hw = w * 0.5;
    this.wall(cx + rx * hw + nx * depth * 0.5, yBase, cz + rz * hw + nz * depth * 0.5, rx, rz, depth, h, 1, 1, 0, 0, false, envLo, envHi);
    this.wall(cx - rx * hw + nx * depth * 0.5, yBase, cz - rz * hw + nz * depth * 0.5, -rx, -rz, depth, h, 1, 1, 0, 0, false, envLo, envHi);
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
      this.env.push(this.defEnv);
    }
    this.quadIndices();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute(WORLD_ENV_ATTRIBUTE, new THREE.Float32BufferAttribute(this.env, 1));
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

/** World context for a level surface, beyond what its texture knows. */
type WorldEnv = Omit<WorldMaterialOpts, 'layers'>;

/** A level-private world-space material for a floor or wall variant. */
function worldVariantMaterial(v: FloorVariant, w: WorldEnv): THREE.Material {
  try {
    return worldMaterial({
      ...w,
      layers: [
        {
          key: v.palette,
          tint: v.tint,
          // `repeat` used to mean texture repeats per tile: more repeats is a
          // smaller texture, so it divides the scan's real size.
          metres: undefined,
          rough: v.roughness,
          emissive: v.emissive,
          emissiveIntensity: v.emissiveIntensity,
        },
      ],
    });
  } catch {
    return variantMaterial(v);
  }
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

/** Half-width of the sun's shadow square, metres. */
const SUN_REACH = 30;
/** The open-sky key light, while one is live; its shadow tracks the hero. */
let sun: THREE.DirectionalLight | null = null;
/** Where the sun sits relative to the hero, metres. */
const sunOffset = new THREE.Vector3(28, 52, 18);

export interface BiomeLighting {
  key: THREE.DirectionalLight;
  ambient: THREE.Light;
  /** The light the hero should carry here (`Lighting.ts`). */
  hero: { color: number; intensity: number; distance: number };
  dispose(): void;
}

/**
 * Lights a level from its biome's light mood (`Lighting.ts`): a low tinted
 * fill, a key light (the sun or moon outdoors, a dim wash indoors), an
 * optional red light from below, fog and the clear colour. Owns `scene.fog`
 * and `scene.background` until disposed.
 */
export function applyBiomeLighting(
  scene: THREE.Scene,
  biome: BiomeDef,
  /** The run's biome variant, which is mostly a lighting change. */
  variant?: string,
): BiomeLighting {
  const art = biomeArt(biome.id, variant);
  const mood = lightMood(biome, art);
  const open = art.ceiling === 'open';

  const fog = new THREE.FogExp2(mood.fog, mood.fogDensity);
  scene.fog = fog;
  // Keep the fight clear and let the distance go. Fog starts a little short
  // of the player (the camera sits ~20m back), and below the floor a height
  // term swallows pits and chasms so they read as bottomless. The height is
  // set by `DungeonMesh.update`, which knows where the lowest floor is.
  setFogShape(14, -1000, 4.5, 0.92);
  scene.background = new THREE.Color(mood.background);

  // Hemisphere fill: the colour of the dark. Kept low so the torch pools and
  // the hero's light carry the room, but tinted so shadow is never grey.
  const ambient = new THREE.HemisphereLight(mood.sky, mood.ground, mood.fill);
  ambient.position.set(0, 40, 0);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(mood.key, mood.keyIntensity);
  const [dx, dy, dz] = lightDirection(mood.elevation, mood.azimuth);
  sunOffset.set(dx * 60, dy * 60, dz * 60);
  key.position.copy(sunOffset);
  key.target.position.set(0, 0, 0);
  scene.add(key.target);
  // Open-sky biomes get a real sun with real shadows; enclosed ones use the key
  // purely as a directional wash, because their shadows come from torches.
  key.castShadow = open;
  if (key.castShadow) {
    // The sun's shadow follows the player (`DungeonMesh.update` moves it).
    // A fixed 140 m square drew every caster on the floor into the shadow
    // pass, 3.3M triangles a frame in the ashwaste, at a quarter the texel
    // density this one gets.
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 140;
    key.shadow.camera.left = -SUN_REACH;
    key.shadow.camera.right = SUN_REACH;
    key.shadow.camera.top = SUN_REACH;
    key.shadow.camera.bottom = -SUN_REACH;
    sun = key;
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.03;
  }
  scene.add(key);

  // Light from below. Floors face up and never catch it; walls, bodies and
  // the undersides of things glow with it.
  let under: THREE.DirectionalLight | null = null;
  if (mood.under) {
    under = new THREE.DirectionalLight(mood.under.color, mood.under.intensity);
    under.position.set(-dx * 20, -30, -dz * 20);
    under.target.position.set(0, 0, 0);
    scene.add(under.target);
    scene.add(under);
  }

  return {
    key,
    ambient,
    hero: mood.hero,
    dispose(): void {
      scene.remove(ambient);
      scene.remove(key);
      scene.remove(key.target);
      key.dispose();
      ambient.dispose();
      if (under) {
        scene.remove(under);
        scene.remove(under.target);
        under.dispose();
      }
      if (scene.fog === fog) scene.fog = null;
      setFogShape();
      if (sun === key) sun = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Exit pieces
// ---------------------------------------------------------------------------

/** Unlit black for the inside of a way on: it reads as depth, not as a surface. */
function voidMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: 0x030304, toneMapped: false, side: THREE.DoubleSide });
}

/** A small light just inside a way on: the cue that reads as "go here". */
function exitGlow(color: number, y: number, z: number, intensity = 9): THREE.PointLight {
  const l = new THREE.PointLight(color, intensity, 9, 2);
  l.position.set(0, y, z);
  l.castShadow = false;
  return l;
}

/** A doorway outline in the XY plane: straight sides to `h`, a round head of radius `r`. */
function archShape(r: number, h: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h);
  s.absarc(0, h, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return new THREE.ShapeGeometry(s, 12);
}

/** A rough boulder about `size` metres across, flattened underneath. */
function roughRock(rng: Rng, size: number): THREE.BufferGeometry {
  const r = size * 0.55;
  const geo = new THREE.IcosahedronGeometry(r, 1);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const a = rng.range(0, 50);
  const b = rng.range(0, 50);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // A function of position, so the copies of a shared corner move together.
    const n =
      Math.sin(x * 3.1 / r + a) * Math.sin(y * 2.7 / r + b) * Math.sin(z * 3.3 / r + a * 0.7) * 0.5 +
      Math.sin(x * 7.3 / r + b) * Math.sin(z * 6.1 / r + a) * 0.15;
    const k = 1 + n * 0.32;
    p.setXYZ(i, x * k, (y < -r * 0.35 ? -r * 0.35 + (y + r * 0.35) * 0.3 : y) * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
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

  /**
   * Everything in the level the player can walk up to and use.
   *
   * Chests, shrines, barrels, crates and urns were all authored in `Props.ts`
   * with an `interact` payload, placed by the generator and drawn by the
   * builder — and nothing anywhere read the payload, so the entire
   * interactable layer was scenery. This is the index that makes it reachable.
   */
  readonly interactables: Interactable[] = [];
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
  /** The level's animated liquid, if it has any liquid tiles. */
  private liquid: LiquidSurface | null = null;
  private drips: Drips | null = null;
  private shafts: THREE.Mesh | null = null;
  private shaftMat: THREE.MeshBasicMaterial | null = null;

  private readonly ownedGeo: THREE.BufferGeometry[] = [];
  private readonly ownedMat: THREE.Material[] = [];
  private readonly ownedTex: THREE.Texture[] = [];

  private readonly halfW: number;
  private readonly halfH: number;
  /** Height of the lowest floor in the level, for the height fog. */
  private lowestFloor = 0;
  /** Per wall variant: does one tile span whole texture repeats? */
  private wallWhole: boolean[] = [];

  /** Refresh cadence for the light pool assignment, in seconds. */
  private lightTimer = 0;
  private cullTimer = 0;
  private cullRadius = 68;
  /** How walls are built: dressed stone with piers, or raw rock. */
  private kit: WallKit;
  /** Open sky: one continuous ground instead of rooms cut from rock. */
  private readonly outdoor: boolean;
  private terrain: TerrainBuild | null = null;
  /** Where the hole in the roof is centred. Written every frame. */
  private readonly heroXZ = new THREE.Vector2();

  constructor(level: DungeonLevel, biome: BiomeDef, rng: Rng) {
    this.level = level;
    this.biome = biome;
    this.art = biomeArt(biome.id, level.variant);
    this.kit = wallKitOf(this.art);
    this.outdoor = isOutdoorLevel(level);
    this.noise = new Noise((level.seed ^ 0x7a1c) >>> 0);
    this.halfW = level.width / 2;
    this.halfH = level.height / 2;

    const ex = levelExtras(level);
    this.heights = ex?.heights ?? new Int8Array(level.width * level.height);
    this.roomOf = ex?.roomOf ?? new Int16Array(level.width * level.height).fill(-1);

    this.root.name = `dungeon:${biome.id}:${level.layout}`;
    let low = 0;
    for (let i = 0; i < level.tiles.length; i++) {
      if (isWalkableValue(level.tiles[i]!)) low = Math.min(low, this.heights[i]! * STEP_HEIGHT);
    }
    this.lowestFloor = low;

    this.buildStatic(rng);
    this.buildProps(rng);
    this.buildLightPool();
    this.buildShafts(rng);
    this.buildStairs(rng);
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
    // Outdoors the ground is a smooth heightfield, not tile steps: stand on it.
    if (this.terrain) return this.terrain.heightAt(wx, wz);
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
    // Tile kinds this builder does not draw yet come back as the closest old
    // kind (maps -> ground contract); unknown values draw as blocking wall.
    return drawAsKind(this.level.tiles[y * this.level.width + x]);
  }

  /** The stored tile value, before `drawAsKind`. */
  private rawTile(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return T_VOID;
    return this.level.tiles[y * this.level.width + x]!;
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
    // Floors and walls wear world-space materials: the palette's own PBR set
    // plus the breakup, damp and contact-grime layer from `WorldMaterial`.
    // Private to this level, so they are owned and disposed here.
    const world = (kind: 'floor' | 'wall'): WorldEnv => ({
      kind,
      cutaway: kind === 'wall',
      grime: art.grime ?? 0x2a2622,
      grimeAmount: kind === 'floor' ? 0.75 : 0.6,
      wet: (art.wetness ?? clamp(art.puddles * 0.8, 0, 0.8)) * (kind === 'floor' ? 1 : 0.7),
      variation: art.surfaceVariation ?? 0.8,
      contact: 0.85,
    });
    const floorMats = art.floors.map((v) => worldVariantMaterial(v, world('floor')));
    const wallMats = art.walls.map((v) => worldVariantMaterial(v, world('wall')));
    for (const m of [...floorMats, ...wallMats]) if (!m.userData.shared) this.ownedMat.push(m);
    this.wallWhole = art.walls.map((v) => wholeRepeat(v.repeat ?? 1, 1));
    // Private copies (not the cached surfaces) so they can carry the wall
    // cutaway: otherwise the cornice and plinth float in the hole.
    const trimMat = addWorldCutaway(
      surfaceVariant(art.trim.palette, {
        repeat: art.trim.repeat ?? 1,
        tint: art.trim.tint,
        roughness: art.trim.roughness,
        metalness: art.trim.metalness,
        emissive: art.trim.emissive,
        emissiveIntensity: art.trim.emissiveIntensity,
      }),
    );
    const baseMat = addWorldCutaway(surfaceVariant(art.baseTrim, { repeat: 1.2 }));
    this.ownedMat.push(trimMat, baseMat);
    // A private clone, not the shared cached surface: the dissolve below is
    // attached with `onBeforeCompile`, and hanging that on a cached material
    // gives every other user of the same palette a hole in it.
    const deckMat = worldMaterial({ kind: 'wall', layers: [{ key: 'wood.planks', tint: 0x8a7a68 }], grimeAmount: 0.3, contact: 0.4, variation: 0.6 });
    this.ownedMat.push(deckMat);
    const ceilMat = worldMaterial({
      kind: 'floor',
      layers: [{ key: art.walls[0].palette, tint: 0x6a6a72 }],
      roof: true,
      grimeAmount: 0,
      contact: 0,
      variation: 0.6,
    });
    this.ownedMat.push(ceilMat);

    const liquidMat = this.makeLiquidMaterial();
    // Where drops fall and where lava throws light, gathered while emitting.
    const dripSites: DripSite[] = [];
    const hotTiles: Array<{ x: number; y: number; h: number }> = [];
    // The glow lives in a crack texture: a bare additive tile read as a lit
    // square on the floor (w10 hive and foundry).
    const veinMat = new THREE.MeshBasicMaterial({
      color: art.veinColor,
      map: crackTexture(),
      transparent: true,
      opacity: 1,
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
    // The rock the level is carved out of. Dark, matte, and lit only by the
    // ambient term: it is the mass around the dungeon, not a surface anyone is
    // meant to look at. Taking no shadows either way keeps a plane that covers
    // most of the screen out of the shadow pass entirely.
    // Emissive on purpose. Torches sit below the rock and nothing else lights
    // it, so a lit-only material went fully black — which looks exactly like
    // the hole it was added to fill. A self-lit floor guarantees it always
    // reads as a surface. Scene fog still fades it with distance.
    //
    // Textured, too. A flat untextured slab the size of half the screen reads as
    // a hole whether or not there is one behind it, which is why "still holes in
    // the walls" kept coming back after the geometry was closed. Borrowing the
    // biome's own wall texture makes the same plane read as the rock it is.
    // The lid is darkness, not a surface.
    //
    // Two renders bracketed this. Bright and textured, it filled well over half
    // the screen and out-competed the floor the game is played on. Dark and
    // textured, it still read as a noisy mottled *thing* covering everything —
    // in a cave layout the wall tops genuinely are most of the frame, so
    // whatever the lid looks like is what the frame looks like.
    //
    // So it does not look like anything. A flat matte tone a shade off the
    // biome's own fog, with no texture to catch the eye and a trace of emissive
    // so it never goes absolutely black: at distance it dissolves into the fog
    // and reads as unlit rock, which is what it is. The playable floor is then
    // the only lit thing on screen, which is the whole point.
    const rockTone = new THREE.Color(this.biome.fogColor).lerp(new THREE.Color(0x2a2f3a), 0.5);
    const bedrockMat = new THREE.MeshStandardMaterial({
      color: rockTone,
      emissive: rockTone.clone().multiplyScalar(0.5),
      roughness: 1,
      metalness: 0,
    });
    this.ownedMat.push(bedrockMat);

    // The same rock, but it never opens.
    //
    // Reported three times — "still see through walls", "still holes in the
    // walls and top of walls", "the walls are invisible and see through" — and
    // this is why. Wall tops were emitted into the bedrock bucket so the lid
    // could open as one piece, and the lid opens by *discarding* every fragment
    // within 13 metres of the player. That discards the wall tops too. A wall
    // tile in the middle of a thick run emits no side faces, because it has no
    // open neighbour to face, so with its cap discarded it is a hole straight
    // down into the void — and every wall around you is inside 13 metres.
    //
    // Wall tops belong to the level, not to the lid. They are the cut edge of
    // the rooms, the thing every game in this genre leaves standing when it
    // takes the ceiling away. They cap at the same height as the lid, so where
    // the lid dissolves the caps carry straight on and the seam closes itself.
    //
    // They wear the wall's own stone, not the lid's tone. The lid is painted a
    // flat matte colour with a trace of emissive so it sinks into the fog and
    // reads as nothing; a wall top is a real surface with a wall under it, and
    // in the lid's paint the first render came back with pale slabs glowing in
    // mid-air over a dark level, because the emissive lit them while their own
    // walls stayed black.
    const capMat = wallMats[0]!;

    // The lid opens around the player.
    //
    // Closing the roof fixed the holes and created a worse problem: from a
    // camera pitched at 0.92 radians the lid *is* the frame. A rendered floor
    // showed the player in a small visible pocket with roof over most of the
    // screen, which is not a level you can read or fight on.
    //
    // Every game in this genre solves it the same way — the roof simply is not
    // there near you. A radial dissolve rather than a hard circle, because a
    // hard edge sweeping across a stone ceiling is more distracting than the
    // roof was. Dithered rather than blended: the lid is opaque geometry that
    // walls draw against, and making it transparent would put it in the sorting
    // pass for no gain.
    const openAroundHero = (mat: THREE.Material, open: number): void => {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uHero = { value: this.heroXZ };
        shader.uniforms.uOpen = { value: open };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vRoofPos;')
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvRoofPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vRoofPos;\nuniform vec2 uHero;\nuniform float uOpen;',
          )
          .replace(
            '#include <clipping_planes_fragment>',
            [
              'float roofD = distance(vRoofPos.xz, uHero);',
              'float roofA = smoothstep(uOpen * 0.62, uOpen, roofD);',
              // Screen-space hash: the band dissolves instead of banding.
              'float roofN = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);',
              'if (roofA < roofN) discard;',
              '#include <clipping_planes_fragment>',
            ].join('\n'),
          );
      };
    };
    openAroundHero(bedrockMat, ROOF_OPEN);

    // The vault ceiling is the same problem one storey lower.
    //
    // The lid over the level opens around the player, but the ceiling drawn
    // inside vaulted biomes never did, and the camera sits about twelve metres
    // above the player looking down — well above a five metre ceiling. So in
    // every vaulted biome a solid slab was drawn between the camera and the
    // room being played in. Rendering the frame with this layer hidden is what
    // finally named it: the large dark shape over the level simply vanished.
    //
    // It opens a little tighter than the lid, so the ceiling reads as present
    // just past the edge of play rather than peeling back to the horizon.
    // The same radius as the lid. A tighter one was tried first and the render
    // came back with a dark cap still sitting beside the player: the ceiling is
    // lower than the lid, so it occludes *more* of the floor per metre, not
    // less.
    // (The ceiling's world material carries the same dissolve; see `roof`.)

    const FLOOR0 = 0;
    const WALL0 = FLOOR0 + floorMats.length;
    const TRIM = WALL0 + wallMats.length;
    const BASE = TRIM + 1;
    const CEIL = BASE + 1;
    const LIQ = CEIL + 1;
    const VEIN = LIQ + 1;
    const PUDDLE = VEIN + 1;
    const BEDROCK = PUDDLE + 1;
    /** Wall tops. Same rock as the lid, but this bucket never dissolves. */
    const CAPS = BEDROCK + 1;
    /** Bridge decks (outdoors). */
    const DECK = CAPS + 1;
    const BUCKETS = DECK + 1;
    mats.push(
      ...floorMats, ...wallMats, trimMat, baseMat, ceilMat, liquidMat, veinMat, puddleMat, bedrockMat, capMat, deckMat,
    );
    const outdoor = this.outdoor;
    if (outdoor) {
      this.terrain = buildTerrain(level, this.heights, rng.fork('terrain'));
      this.ownedGeo.push(...this.terrain.geometries);
      this.ownedMat.push(...this.terrain.materials);
      for (const c of this.terrain.chunks) {
        const group = new THREE.Group();
        group.name = 'terrain';
        group.add(c.mesh);
        this.root.add(group);
        this.chunks.push({ group, center: c.center, radius: c.radius });
      }
      for (const d of this.terrain.dressing) this.root.add(d);
    }

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

    // Only damp places drip, and only where there is a ceiling to drip from.
    const wetDrips =
      art.ceiling !== 'open' &&
      (art.liquid === 'water' || art.liquid === 'sludge') &&
      (art.wetness ?? art.puddles) >= 0.2;

    // One flat plane of rock over the whole level.
    //
    // Every solid tile used to cap at *its own* terrain height plus the wall
    // height, and terrain height is per-tile noise. Two neighbouring caps a step
    // apart left a vertical slot between their quads with nothing emitting a
    // face to close it — a gash up to 1.8m tall you could see the void through,
    // in every biome. Reported as "holes in the walls and top of walls".
    //
    // A single height removes the whole class of bug rather than patching each
    // step: the rock above a carved dungeon is one surface, and rooms whose
    // floor sits lower simply have taller walls, which is what carving means.
    let maxStep = 0;
    for (let i = 0; i < this.heights.length; i++) maxStep = Math.max(maxStep, this.heights[i]);
    const roofY = maxStep * STEP_HEIGHT + wallH;

    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const surfs: Surf[] = [];
        // Wall-kind buckets default to "far above the floor", so faces that do
        // not say otherwise (caps, ledges) carry no contact shadow.
        // Caps say so with their own marker (see WORLD_CAP_ENV) so the wall
        // shader can sink them back without a second material.
        for (let i = 0; i < BUCKETS; i++) {
          const wallKind = i >= WALL0 && i < TRIM;
          surfs.push(new Surf(i === CAPS ? WORLD_CAP_ENV : wallKind ? 99 : 0));
        }

        const x0 = cx * CHUNK;
        const y0 = cy * CHUNK;
        const x1 = Math.min(W, x0 + CHUNK);
        const y1 = Math.min(H, y0 + CHUNK);

        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const v = this.tile(x, y);
            const wx = this.tileX(x);
            const wz = this.tileZ(y);
            const hy = this.heights[y * W + x] * STEP_HEIGHT;

            if (v === T_VOID && outdoor) continue;
            if (v === T_VOID) {
              // Bedrock.
              //
              // `wallify` turns exactly one ring of void into wall, and the void
              // beyond it used to emit no geometry at all. From a camera pitched
              // at 0.92 radians you look over a one-tile wall straight into that
              // hole — black nothing, or the floor of a room two corridors away.
              // Reported, correctly, as "the walls are see-through".
              //
              // Capping the void at wall-top height makes the level read as
              // rooms carved out of solid rock, which is what it is. One quad per
              // void tile, merged into the chunk's wall geometry, so it costs a
              // bucket that takes no part in the shadow pass.
              surfs[BEDROCK].flat(wx, roofY, wz, HALF, true, x % 4, y % 4, 1);
              continue;
            }

            if (v === T_WALL && outdoor) {
              // Outdoors a wall tile is the ground rising into the biome's
              // edge (Terrain.ts); only ruins are built, as broken masonry.
              if (this.rawTile(x, y) === T_RUIN) {
                const keep = this.kit;
                this.kit = 'masonry';
                const top = hy + 1.6 + (hashTile(x, y, level.seed ^ 0x2c1) % 9) * 0.12;
                this.emitWall(surfs, x, y, wx, wz, hy, top, wallMats.length, WALL0, TRIM, BASE, surfs[CAPS]);
                this.kit = keep;
              }
              continue;
            }
            if (v === T_WALL) {
              this.emitWall(surfs, x, y, wx, wz, hy, roofY, wallMats.length, WALL0, TRIM, BASE, surfs[CAPS]);
              continue;
            }

            if (v === T_CHASM) {
              // A chasm is a hole: drop the walls of the pit and no floor at all.
              this.emitPitWalls(surfs, x, y, wx, wz, hy, WALL0);
              // Molten biomes: the level's own lava, four metres down. The
              // height fog swallows most of it, so what is left is an ember
              // glow at the bottom rather than a flat black cut-out.
              if (art.liquid === 'lava' || art.liquid === 'voidwater') {
                surfs[LIQ].flat(wx, hy - 4.2, wz, HALF, true, x % 4, y % 4, 1, [0, 0, 0, 0]);
              }
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
            // Mirror whole-repeat tiles at random. Seamless (see `Surf.flat`),
            // free, and it quarters how often the eye meets the same stone.
            const mirror = wholeRepeat(us, us) ? (hashTile(x, y, level.seed) & 3) : 0;
            if (!outdoor) s.flat(wx, hy, wz, HALF, true, (x * us) % 8, (y * us) % 8, us, this.floorContact(x, y, hy), mirror);

            // A bridge: a plank deck at walking height, water under it.
            if (outdoor && this.rawTile(x, y) === T_BRIDGE) {
              this.emitDeck(surfs[DECK]!, x, y, wx, wz, hy);
              surfs[LIQ].flat(wx, hy - 0.22, wz, HALF, true, x % 4, y % 4, 1, [0, 0, 0, 0]);
            }

            // Height skirts wherever the neighbour sits lower.
            for (let d = 0; d < 4 && !outdoor; d++) {
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
                0,
                nh / TILE_SIZE,
                false,
                0.85,
                0,
              );
            }

            // Arches over doorways (dressed stone only).
            if (v === T_DOOR && this.kit === 'masonry') {
              this.emitArch(surfs[WALL0]!, surfs[CAPS]!, surfs[TRIM]!, x, y, wx, wz, hy, roofY);
            }

            // Liquid surface.
            if (v === T_WATER || v === T_LAVA) {
              surfs[LIQ].flat(wx, hy + 0.13, wz, HALF, true, x % 4, y % 4, 1, this.shoreContact(x, y, v));
              if (v === T_LAVA || art.liquid === 'voidwater') hotTiles.push({ x, y, h: hy });
            }

            // Drips: off the ceiling into the water and the puddles below it.
            if (wetDrips && (v === T_WATER || (art.puddles > 0 && hashTile(x, y, level.seed ^ 0x51) % 11 === 0))) {
              if (hashTile(x, y, level.seed ^ 0xd1) % 3 === 0) {
                const top = art.ceiling === 'vault' || art.ceiling === 'broken' ? hy + ceilY : hy + wallH;
                dripSites.push({
                  x: wx + ((hashTile(x, y, 7) % 100) / 100 - 0.5) * 1.4,
                  z: wz + ((hashTile(x, y, 9) % 100) / 100 - 0.5) * 1.4,
                  floor: v === T_WATER ? hy + 0.13 : hy,
                  top,
                });
              }
            }

            // Emissive veins in the cracks.
            if (art.veinDensity > 0 && v !== T_WATER) {
              const n = this.noise.ridged(x * 0.09 + 11, y * 0.09, 3);
              if (n > 1 - art.veinDensity * 0.5) {
                // Whole tile, UVs continuous across tiles (one repeat per 4
                // tiles) so the cracks run on from one tile into the next.
                surfs[VEIN].flat(wx, hy + 0.02, wz, HALF, true, x * 0.25, y * 0.25, 0.25);
              }
            }

            // No puddle quads: a whole tile of flat black glass read as a hole.
            // The floor material's own damp patches (`wet`) do the job, with
            // soft edges that follow the stone.

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
          // Named so probes can find the rock lid without guessing which
          // unnamed slab is filling the frame.
          mesh.name =
            i === BEDROCK ? 'roof' : i === CAPS ? 'wallTops' : i === CEIL ? 'ceiling' : `surface${i}`;
          mesh.castShadow = i >= WALL0 && i < CEIL;
          mesh.receiveShadow = i !== VEIN && i !== LIQ && i !== BEDROCK;
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

    if (dripSites.length > 0) {
      this.drips = new Drips(dripSites, art.liquidColor === 0 ? 0x9fc0d0 : art.liquidColor);
      this.root.add(this.drips.root);
    }
    this.addHeatLights(hotTiles);
  }

  /**
   * Lava and void pools light the room around them.
   *
   * The pool is emissive and blooms, but on its own it lit nothing: the walls
   * beside a lava river stayed as dark as the walls beside a puddle. Each
   * cluster of hot tiles becomes a record in the torch pool, so the nearest
   * ones get real lights as the player walks past and the rest still throw a
   * soft additive glow on the floor. No flame mesh, a slow heavy flicker.
   */
  private addHeatLights(hot: Array<{ x: number; y: number; h: number }>): void {
    if (hot.length === 0) return;
    const CELL = 5;
    const cells = new Map<string, { sx: number; sy: number; sh: number; n: number }>();
    for (const t of hot) {
      const k = `${Math.floor(t.x / CELL)},${Math.floor(t.y / CELL)}`;
      let c = cells.get(k);
      if (!c) {
        c = { sx: 0, sy: 0, sh: 0, n: 0 };
        cells.set(k, c);
      }
      c.sx += t.x;
      c.sy += t.y;
      c.sh += t.h;
      c.n++;
    }
    const colour = new THREE.Color(this.art.liquidEmissive || this.art.liquidColor);
    let i = 0;
    for (const c of cells.values()) {
      if (c.n < 3) continue;
      const x = c.sx / c.n;
      const y = c.sy / c.n;
      this.torches.push({
        // Higher and softer than a torch: at 1.1 m and up to 8 these burned
        // white hot spots into the walls beside the pool and washed the floor
        // the same orange as the lava, so the hero sank into it (w10).
        pos: new THREE.Vector3(this.tileX(x), c.sh / c.n + 1.7, this.tileZ(y)),
        color: colour.clone(),
        intensity: 2.2 + Math.min(2.3, c.n * 0.14),
        distance: 8 + Math.min(4, c.n * 0.25),
        flicker: 0.45,
        flameMesh: -1,
        flameIndex: -1,
        phase: (i++ * 7.31) % 100,
      });
    }
  }

  /**
   * Shore contact for a liquid tile's four corners, in `Surf.flat` order: how
   * much of the bank each corner touches. Drives froth on water and the cooled
   * crust at the edge of lava.
   */
  private shoreContact(x: number, y: number, self: number): number[] {
    const bank = (tx: number, ty: number): number => (this.tile(tx, ty) === self ? 0 : 1);
    const out: number[] = [];
    for (const [dx, dz] of FLAT_CORNERS) {
      const a = bank(x + dx, y);
      const b = bank(x, y + dz);
      const c = bank(x + dx, y + dz);
      out.push(a > 0 && b > 0 ? 1 : Math.min(1, (a + b + c) * 0.5));
    }
    return out;
  }

  private makeLiquidMaterial(): THREE.Material {
    const art = this.art;
    // A biome whose liquid is 'none' can still have the odd water tile.
    const style: LiquidStyle = art.liquid === 'none' ? 'water' : art.liquid;
    this.liquid = liquidSurface(style, art.liquidColor, art.liquidEmissive);
    return this.liquid.material;
  }

  /**
   * Contact occlusion at the four corners of a floor tile, in `Surf.flat`
   * order. A corner darkens with each solid neighbour it touches — the classic
   * per-vertex AO rule — and a floor that steps up beside it counts as most
   * of a wall. Interpolated across the tile it gives a soft shadow along every
   * wall foot without a screen-space pass.
   */
  private floorContact(x: number, y: number, hy: number): number[] {
    const W = this.level.width;
    const solid = (tx: number, ty: number): number => {
      if (!this.open(tx, ty)) return 1;
      const v = this.tile(tx, ty);
      if (v === T_CHASM) return 0;
      const nh = this.heights[ty * W + tx] * STEP_HEIGHT;
      return nh > hy + 0.2 ? 0.7 : 0;
    };
    const out: number[] = [];
    for (const [dx, dz] of FLAT_CORNERS) {
      const a = solid(x + dx, y);
      const b = solid(x, y + dz);
      const c = solid(x + dx, y + dz);
      out.push(a > 0 && b > 0 ? 1 : Math.min(1, (a + b + c) * 0.5));
    }
    return out;
  }

  /**
   * A wall tile. Only faces that touch open space are emitted, plus a top cap,
   * a protruding base course and a cornice — that trio is what gives a wall
   * mass instead of reading as a cardboard plane.
   *
   * The top cap is unconditional. It used to be emitted only for walls touching
   * open space, on the reasoning that a buried wall tile is never seen. It is:
   * a tile with no cap is a two-metre hole straight down into the level, and
   * thick runs of wall left roughly two hundred of them per floor.
   */
  private emitWall(
    surfs: Surf[],
    x: number,
    y: number,
    wx: number,
    wz: number,
    hy: number,
    /** The level's single rock height. Walls run all the way up to it. */
    topY: number,
    wallCount: number,
    WALL0: number,
    TRIM: number,
    BASE: number,
    /**
     * Where wall tops go. Deliberately *not* the lid's bucket: the lid opens
     * around the player by discarding fragments, and a discarded wall top is a
     * hole you see the void through.
     */
    caps: Surf,
  ): void {
    const wallH = topY - hy;
    // Deterministic wall variant, clumped so it reads as masonry courses rather
    // than per-tile noise.
    // Weighted: a 9:1 split means one wall in ten, not half (the cyan crystal
    // walls in the caverns). fBm bunches round the middle, so stretch it first.
    const nv = clamp((this.noise.fbm(x * 0.07, y * 0.07, 2) * 0.5) * 2.2 + 0.5, 0, 0.9999);
    let wi = WALL0;
    {
      const ws = this.art.walls;
      const total = ws.reduce((t, w) => t + Math.max(0, w.weight), 0) || 1;
      let acc = 0;
      for (let i = 0; i < wallCount; i++) {
        acc += Math.max(0, ws[i]?.weight ?? 0) / total;
        if (nv < acc) {
          wi = WALL0 + i;
          break;
        }
        wi = WALL0 + i;
      }
    }
    const s = surfs[wi];
    const trim = surfs[TRIM];
    const base = surfs[BASE];

    for (let d = 0; d < 4; d++) {
      const nx = x + DX4[d];
      const ny = y + DY4[d];
      if (!this.open(nx, ny)) continue;
      const nh = this.heights[ny * this.level.width + nx] * STEP_HEIGHT;
      const yBottom = Math.min(nh, hy) - 0.15;
      const fx = wx + DX4[d] * HALF;
      const fz = wz + DY4[d] * HALF;
      const h = topY - yBottom;
      // Texture runs on in world space: V from world height, so courses line
      // up across tiles whose floors sit at different heights, and U along the
      // face. Whole-repeat stone is mirrored per tile instead, which is
      // seamless and breaks the run of identical blocks.
      if (this.kit === 'rough') {
        this.roughFace(s, x, y, d, fx, yBottom, fz, topY, nh);
        continue;
      }
      const whole = this.wallWhole[wi - WALL0] ?? false;
      const u0 = whole ? 0 : (fx * DY4[d] - fz * DX4[d]) / TILE_SIZE - 0.5;
      const flip = whole && (hashTile(x * 4 + d, y, this.level.seed) & 1) === 1;
      s.wall(
        fx, yBottom, fz, DX4[d], DY4[d], TILE_SIZE, h, 1, h / TILE_SIZE,
        u0, yBottom / TILE_SIZE, flip, yBottom - nh, topY - nh,
      );

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

      // Pilasters: a pier every few metres along a straight run, standing
      // on the plinth and running up under the cornice. Each sits on the
      // left edge of a face, so a shared edge is decided exactly once.
      const rx = DY4[d];
      const rz = -DX4[d];
      if (this.faceContinues(x, y, d, -1)) {
        const ex = fx - rx * HALF;
        const ez = fz - rz * HALF;
        if (hashTile(Math.round(ex * 2), Math.round(ez * 2), this.level.seed ^ 0x9e1) % 3 === 0) {
          const pw = 0.72;
          const pd = 0.24;
          const top = topY - 0.3;
          s.pier(ex, nh - 0.1, ez, DX4[d], DY4[d], pw, pd, top - nh + 0.1, -0.1, top - nh);
          // Its own foot and head, a shade wider.
          base.pier(ex, nh - 0.1, ez, DX4[d], DY4[d], pw + 0.16, pd + 0.08, 0.62, 0, 0);
          base.ledge(ex + DX4[d] * pd, nh + 0.52, ez + DY4[d] * pd, DX4[d], DY4[d], pw + 0.16, 0.08, true);
          trim.pier(ex, top - 0.26, ez, DX4[d], DY4[d], pw + 0.12, pd + 0.06, 0.26, 0, 0);
          trim.ledge(ex + DX4[d] * pd, top - 0.26, ez + DY4[d] * pd, DX4[d], DY4[d], pw + 0.12, 0.06, false);
        }
      }
    }
    // Every wall tile is capped, at the one flat rock height, so neighbouring
    // caps never leave a step between them. It goes in the solid bucket: a wall
    // top is the cut edge of the room and has to stay standing when the lid
    // opens.
    caps.flat(wx, topY, wz, HALF, true, x % 4, y % 4, 1);
  }

  /**
   * True when the wall face of tile (x, y) toward `d` carries straight on into
   * the next wall tile on one side (`side` -1 left, +1 right): that tile is
   * wall too, and open on the same side.
   */
  private faceContinues(x: number, y: number, d: number, side: -1 | 1): boolean {
    const tx = x + DY4[d] * side;
    const ty = y - DX4[d] * side;
    return this.tile(tx, ty) === T_WALL && this.open(tx + DX4[d], ty + DY4[d]);
  }

  /**
   * A natural rock face: the wall quad as a grid pushed out into the room by
   * world-space noise. A shared edge in a straight run gets the same push from
   * both sides, so the rock runs on unbroken; at corners and at the top
   * (where the flat wall cap meets it) the push fades to nothing so no gap
   * opens.
   */
  private roughFace(s: Surf, x: number, y: number, d: number, fx: number, yBottom: number, fz: number, topY: number, nh: number): void {
    const nx = DX4[d];
    const nz = DY4[d];
    const rx = nz;
    const rz = -nx;
    const cl = this.faceContinues(x, y, d, -1);
    const cr = this.faceContinues(x, y, d, 1);
    const h = topY - yBottom;
    const COLS = 4;
    const ROWS = Math.max(3, Math.round(h / 0.65));
    const amp = 0.42;
    const pts: Array<Array<[number, number, number]>> = [];
    const env: number[] = [];
    for (let j = 0; j <= ROWS; j++) {
      const py = yBottom + (j / ROWS) * h;
      const fadeTop = 1 - smooth01((py - (topY - 1.1)) / 1.05);
      const row: Array<[number, number, number]> = [];
      for (let i = 0; i <= COLS; i++) {
        const t = i / COLS - 0.5;
        const px = fx + rx * t * TILE_SIZE;
        const pz = fz + rz * t * TILE_SIZE;
        let k = fadeTop;
        if (i === 0 && !cl) k = 0;
        if (i === COLS && !cr) k = 0;
        // Big slow lumps plus a little crag.
        const n = this.noise.fbm3(px * 0.32, py * 0.42, pz * 0.32, 3) * 0.5 + 0.5;
        const c = this.noise.simplex3(px * 1.3 + 17, py * 1.1, pz * 1.3) * 0.5 + 0.5;
        const push = amp * k * (0.35 + 0.65 * n) + 0.08 * k * c;
        const lift = 0.12 * k * (c - 0.5);
        row.push([px + nx * push, py + lift, pz + nz * push]);
      }
      pts.push(row);
      env.push(py - nh);
    }
    s.grid(pts, env);
  }

  /**
   * A round arch over a doorway: a block of the wall's stone filling the top
   * of the door tile, cut by a half-round opening. Only where the door sits
   * between two walls on one axis and opens both ways on the other.
   */
  private emitArch(s: Surf, caps: Surf, trim: Surf, x: number, y: number, wx: number, wz: number, hy: number, topY: number): void {
    let ax: number;
    let az: number;
    if (this.tile(x - 1, y) === T_WALL && this.tile(x + 1, y) === T_WALL && this.open(x, y - 1) && this.open(x, y + 1)) {
      ax = 1;
      az = 0;
    } else if (this.tile(x, y - 1) === T_WALL && this.tile(x, y + 1) === T_WALL && this.open(x - 1, y) && this.open(x + 1, y)) {
      ax = 0;
      az = 1;
    } else return;
    // Across the opening is (ax, az); along the passage is (px, pz).
    const px = az;
    const pz = ax;
    const R = HALF;
    const spring = hy + Math.min(2.25, topY - hy - R - 0.35);
    if (spring < hy + 1.6) return;
    const T = 0.45;
    const at = (u: number, v: number, w: number): [number, number, number] => [wx + ax * u + px * w, v, wz + az * u + pz * w];
    const SEG = 8;
    const env = (v: number): number => v - hy;
    for (let i = 0; i < SEG; i++) {
      const a0 = Math.PI * (1 - i / SEG);
      const a1 = Math.PI * (1 - (i + 1) / SEG);
      const u0 = Math.cos(a0) * R;
      const u1 = Math.cos(a1) * R;
      const v0 = spring + Math.sin(a0) * R;
      const v1 = spring + Math.sin(a1) * R;
      for (const side of [-1, 1] as const) {
        const w = side * T;
        // Spandrel strip from the arc up to the top of the wall.
        s.quad(at(u0, v0, w), at(u1, v1, w), at(u1, topY, w), at(u0, topY, w), [px * side, 0, pz * side], [env(v0), env(v1), env(topY), env(topY)]);
      }
      // The underside of the arch, facing the middle of the opening.
      const am = (a0 + a1) * 0.5;
      const nx = -Math.cos(am);
      const ny = -Math.sin(am);
      s.quad(at(u0, v0, -T), at(u1, v1, -T), at(u1, v1, T), at(u0, v0, T), [ax * nx, ny, az * nx], [env(v0), env(v1), env(v1), env(v0)]);
    }
    // The flat of the block on top, level with the wall caps.
    caps.quad(at(-R, topY, -T), at(R, topY, -T), at(R, topY, T), at(-R, topY, T), [0, 1, 0], [WORLD_CAP_ENV, WORLD_CAP_ENV, WORLD_CAP_ENV, WORLD_CAP_ENV]);
    // A keystone proud of both faces.
    for (const side of [-1, 1] as const) {
      trim.pier(wx + px * side * T, spring + R - 0.12, wz + pz * side * T, px * side, pz * side, 0.34, 0.06, 0.5, 0, 0);
    }
  }

  /** A plank deck over water: the top at walking height and an edge where it meets water. */
  private emitDeck(s: Surf, x: number, y: number, wx: number, wz: number, hy: number): void {
    const top = hy + 0.03;
    s.flat(wx, top, wz, HALF, true, 0, 0, 1, [0, 0, 0, 0]);
    for (let d = 0; d < 4; d++) {
      const nv = this.rawTile(x + DX4[d], y + DY4[d]);
      if (nv === T_BRIDGE || (isWalkableValue(nv) && nv !== T_WATER)) continue;
      s.wall(wx + DX4[d] * HALF, hy - 0.24, wz + DY4[d] * HALF, DX4[d], DY4[d], TILE_SIZE, 0.27, 1, 0.14, 0, 0, false, 0, 0.3);
    }
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
      s.wall(
        wx + DX4[d] * HALF, nh - depth, wz + DY4[d] * HALF, -DX4[d], -DY4[d], TILE_SIZE, depth + 0.2, 1,
        (depth + 0.2) / TILE_SIZE, 0, (nh - depth) / TILE_SIZE, false, -depth, 0.2,
      );
    }
    void hy;
  }

  // --- props --------------------------------------------------------------

  /**
   * The way down, and the way you came in.
   *
   * Generation has always written a stairs tile at the exit, and the scene has
   * always watched for the player standing on it — but nothing ever built any
   * geometry there, so every floor had an invisible exit you had to walk over
   * by accident, and no marker at all for where you entered.
   */
  private buildStairs(rng: Rng): void {
    const level = this.level;
    // The walls' own stone with the walls' own tint, a shade darker: the arch
    // stands a metre from the hero's light, and untinted pale stone there
    // bloomed into a white blob over the hero on every ashwaste start.
    const wall0 = this.art.walls?.[0];
    const archTint = new THREE.Color(wall0?.tint ?? 0xffffff).multiplyScalar(0.72).getHex();
    const stone = safeSurface(wall0?.palette ?? 'stone.crypt', { repeat: 1.6, tint: archTint });
    const dark = safeSurface('stone.crypt', { repeat: 1.2, tint: 0x5a5a62 });

    // --- the way on -------------------------------------------------------
    const exit = this.tileToWorld(level.exit.x, level.exit.y);
    const ex = level.exits?.[0];
    const kind = ex?.kind ?? 'stairs';
    const way = new THREE.Group();
    way.position.copy(exit);
    // Built facing local +z, the way you walk through it; turned to `facing`
    // (0 = +x, PI/2 = +z).
    const turn = ex ? Math.PI / 2 - ex.facing : 0;
    way.rotation.y = turn;
    const local: Array<{ x: number; z: number; w: number; d: number }> = [];
    if (kind === 'caveMouth') this.buildCaveMouth(way, local, rng);
    else if (kind === 'doorway') this.buildDoorway(way, local, stone, dark);
    else if (kind === 'gate') this.buildGate(way, local, stone);
    else if (kind === 'portal') this.buildDormantRing(way, local, stone, rng);
    else this.buildDescent(way, local, stone, dark);
    this.root.add(way);
    // Colliders are axis-aligned: turn each centre, and swap its sides when
    // the turn is closer to a quarter than to a half.
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const side = Math.abs(s) > Math.SQRT1_2;
    for (const b of local) {
      this.colliders.push({
        x: exit.x + b.x * c + b.z * s,
        z: exit.z - b.x * s + b.z * c,
        w: side ? b.d : b.w,
        d: side ? b.w : b.d,
      });
    }

    // --- the way in -------------------------------------------------------
    const entry = this.tileToWorld(level.entry.x, level.entry.y);
    const arch = new THREE.Group();
    arch.position.copy(entry);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), stone);
      post.position.set(sx * 1.4, 1.3, -1.1);
      post.castShadow = true;
      post.receiveShadow = true;
      arch.add(post);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 0.6), stone);
    cap.position.set(0, 2.75, -1.1);
    cap.castShadow = true;
    arch.add(cap);
    // Collapsed behind you: rubble filling the opening. You do not go back up.
    for (let i = 0; i < 7; i++) {
      const sz = rng.range(0.35, 0.7);
      // The wall's own stone: in the dark tint the fall read as black holes
      // punched in the floor beside the player on every first frame.
      const rock = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.8, sz), stone);
      // Pushed back into the opening: the hero spawns on the entry tile, and
      // blocks reaching forward to -0.4 m stood in his legs. Each block's
      // nearest corner stays behind z -1.0 however it is turned (a tumbled
      // cube reaches 0.87 of its size from its centre), so the landing is clear.
      const jz = rng.range(-0.15, 0.1);
      rock.position.set(rng.range(-1.1, 1.1), sz * 0.4, Math.min(-1.3 + jz, -1.0 - sz * 0.87));
      rock.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      rock.castShadow = true;
      rock.receiveShadow = true;
      arch.add(rock);
    }
    this.root.add(arch);
    this.colliders.push({ x: entry.x, z: entry.z - 1.1, w: 3.0, d: 0.9 });
  }

  /** Stairs down: a well sunk into the floor with a flight running into it. */
  private buildDescent(
    g: THREE.Group,
    col: Array<{ x: number; z: number; w: number; d: number }>,
    stone: THREE.Material,
    dark: THREE.Material,
  ): void {
    // Steps get narrower and darker as they go, which is what sells depth
    // without cutting a hole in the floor mesh.
    const STEPS = 7;
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      const w = 2.6 - t * 0.5;
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, 0.42), i > STEPS - 3 ? dark : stone);
      step.position.set(0, -0.11 - i * 0.2, -0.6 + i * 0.42);
      step.receiveShadow = true;
      step.castShadow = true;
      g.add(step);
    }
    // Side walls of the stairwell, so it does not read as steps on open floor.
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.9, 3.6), stone);
      wall.position.set(sx * 1.5, -0.9, 0.55);
      wall.castShadow = true;
      wall.receiveShadow = true;
      g.add(wall);
      col.push({ x: sx * 1.5, z: 0.55, w: 0.5, d: 3.6 });
    }
    // The dark at the bottom. Unlit black, so the shaft reads as bottomless.
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), voidMaterial());
    shaft.rotation.x = -Math.PI / 2;
    shaft.position.set(0, -1.42, 1.5);
    g.add(shaft);
    // A lintel and two posts framing the mouth, so it is visible from above.
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.2, 0.34), stone);
      post.position.set(sx * 1.5, 1.1, -0.85);
      post.castShadow = true;
      g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 0.5), stone);
    lintel.position.set(0, 2.3, -0.85);
    lintel.castShadow = true;
    g.add(lintel);
    g.add(exitGlow(0x8fd0ff, 0.4, 1.2));
  }

  /**
   * A doorway: a stone frame with a round head, set in a short run of wall,
   * opening on black. You walk into the dark to go on.
   */
  private buildDoorway(
    g: THREE.Group,
    col: Array<{ x: number; z: number; w: number; d: number }>,
    stone: THREE.Material,
    dark: THREE.Material,
  ): void {
    const W = 2.2; // opening width
    const H = 2.5; // to the spring of the arch
    const R = W / 2;
    const D = 0.9; // wall depth
    const z0 = 0.9; // front face, ahead of the tile centre
    // Wall slabs either side of the opening.
    for (const sx of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.5, H + R + 0.9, D), stone);
      slab.position.set(sx * (R + 0.75), (H + R + 0.9) / 2, z0 + D / 2);
      slab.castShadow = true;
      slab.receiveShadow = true;
      g.add(slab);
      col.push({ x: sx * (R + 0.75), z: z0 + D / 2, w: 1.5, d: D });
    }
    // Over the opening: the arch ring and the wall above it.
    const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.9 + R * 0.2, D), stone);
    top.position.set(0, H + R + 0.9 - (0.9 + R * 0.2) / 2, z0 + D / 2);
    top.castShadow = true;
    g.add(top);
    const SEG = 9;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI;
      const a1 = ((i + 1) / SEG) * Math.PI;
      const am = (a0 + a1) / 2;
      // Voussoirs: wedge blocks round the head, standing proud of the wall.
      const len = R * (a1 - a0) * 1.08;
      const v = new THREE.Mesh(new THREE.BoxGeometry(len, 0.42, D + 0.16), stone);
      v.position.set(Math.cos(am) * (R + 0.21), H + Math.sin(am) * (R + 0.21), z0 + D / 2);
      v.rotation.z = am + Math.PI / 2;
      v.castShadow = true;
      g.add(v);
      // Fill between the ring and the square wall above.
      const fill = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, D - 0.02), stone);
      fill.position.set(Math.cos(am) * (R + 0.62), H + Math.sin(am) * (R + 0.62), z0 + D / 2);
      fill.rotation.z = am + Math.PI / 2;
      g.add(fill);
    }
    // Jambs: posts proud of the wall face.
    for (const sx of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.36, H, D + 0.16), stone);
      jamb.position.set(sx * (R + 0.18), H / 2, z0 + D / 2);
      jamb.castShadow = true;
      g.add(jamb);
    }
    // A worn step at the threshold.
    const step = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.14, 0.8), dark);
    step.position.set(0, 0.07, z0 + 0.1);
    step.receiveShadow = true;
    g.add(step);
    // The dark inside, a little behind the front face so the jambs frame it.
    const inside = new THREE.Mesh(archShape(R, H), voidMaterial());
    inside.position.set(0, 0, z0 + 0.35);
    inside.rotation.y = Math.PI;
    g.add(inside);
    g.add(exitGlow(0xffb070, 1.2, z0 - 0.4, 6));
  }

  /** An iron gate between stone posts, raised far enough to walk under. */
  private buildGate(
    g: THREE.Group,
    col: Array<{ x: number; z: number; w: number; d: number }>,
    stone: THREE.Material,
  ): void {
    const iron = safeSurface('metal.dark', { repeat: 1, tint: 0x8a8a90 });
    const z0 = 0.9;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.4, 0.9), stone);
      post.position.set(sx * 1.45, 1.7, z0 + 0.45);
      post.castShadow = true;
      g.add(post);
      col.push({ x: sx * 1.45, z: z0 + 0.45, w: 0.8, d: 0.9 });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 1.1), stone);
      cap.position.set(sx * 1.45, 3.55, z0 + 0.45);
      g.add(cap);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.45, 0.7), stone);
    beam.position.set(0, 3.1, z0 + 0.45);
    beam.castShadow = true;
    g.add(beam);
    // The portcullis, hauled up: bars hang from the beam to head height.
    const bars = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), iron);
      bar.position.set(-1.0 + i * (2.0 / 6), 2.5, z0 + 0.45);
      bar.castShadow = true;
      bars.add(bar);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), iron);
      spike.rotation.x = Math.PI;
      spike.position.set(bar.position.x, 1.96, z0 + 0.45);
      bars.add(spike);
    }
    for (const y of [2.15, 2.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.08), iron);
      rail.position.set(0, y, z0 + 0.45);
      bars.add(rail);
    }
    g.add(bars);
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.0), voidMaterial());
    inside.position.set(0, 1.5, z0 + 0.8);
    inside.rotation.y = Math.PI;
    g.add(inside);
    g.add(exitGlow(0xffb070, 1.2, z0 - 0.4, 6));
  }

  /**
   * A cave mouth: a hump of rough rock with a black hole in its face. The
   * stones are the biome's cave rock, so it reads as the ground rising.
   */
  private buildCaveMouth(g: THREE.Group, col: Array<{ x: number; z: number; w: number; d: number }>, rng: Rng): void {
    const rock = safeSurface('stone.cavern', { repeat: 0.8, tint: 0x9a948c });
    const z0 = 1.0;
    const R = 1.35;
    const H = 1.2;
    // Boulders round the opening, largest at the sides.
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a = (i / (N - 1)) * Math.PI;
      const sz = 0.75 + Math.sin(a) * -0.15 + rng.range(0, 0.35);
      const m = new THREE.Mesh(roughRock(rng, sz), rock);
      m.position.set(Math.cos(a) * (R + sz * 0.55), H + Math.sin(a) * (R * 0.85 + sz * 0.4) - sz * 0.2, z0 + rng.range(0, 0.3));
      m.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    // Footing boulders on the ground either side.
    for (const sx of [-1, 1]) {
      const sz = rng.range(1.0, 1.3);
      const m = new THREE.Mesh(roughRock(rng, sz), rock);
      m.position.set(sx * (R + sz * 0.7), sz * 0.45, z0 + 0.3);
      m.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      col.push({ x: sx * (R + sz * 0.7), z: z0 + 0.3, w: sz * 1.4, d: sz * 1.4 });
    }
    // The hump the mouth is cut into.
    const hump = new THREE.Mesh(roughRock(rng, 2.6), rock);
    hump.scale.set(1.5, 0.9, 0.8);
    hump.position.set(0, 1.2, z0 + 2.2);
    hump.castShadow = true;
    hump.receiveShadow = true;
    g.add(hump);
    col.push({ x: 0, z: z0 + 2.0, w: 6.0, d: 2.4 });
    const inside = new THREE.Mesh(archShape(R * 0.95, H), voidMaterial());
    inside.position.set(0, 0, z0 + 0.45);
    inside.rotation.y = Math.PI;
    g.add(inside);
    g.add(exitGlow(0x8fd0ff, 0.6, z0 - 0.3, 7));
  }

  /** Where the way home will open: a ring of short standing stones, unlit. */
  private buildDormantRing(
    g: THREE.Group,
    col: Array<{ x: number; z: number; w: number; d: number }>,
    stone: THREE.Material,
    rng: Rng,
  ): void {
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.3;
      const h = rng.range(0.9, 1.6);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, h, 0.32), stone);
      m.position.set(Math.cos(a) * 2.6, h / 2 - 0.05, Math.sin(a) * 2.6);
      m.rotation.set(rng.range(-0.08, 0.08), -a, rng.range(-0.1, 0.1));
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    void col;
  }

  /**
   * The nearest unused interactable within `range` metres, or null.
   *
   * Linear over the level's interactables, which is a few dozen. Called only
   * when the player presses the use key, never per frame.
   */
  nearestInteractable(x: number, z: number, range: number): Interactable | null {
    let best: Interactable | null = null;
    let bestD = range * range;
    for (const it of this.interactables) {
      if (it.used) continue;
      const dx = it.x - x;
      const dz = it.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  /**
   * Takes a prop out of the world.
   *
   * Props are drawn as instanced batches, so one cannot simply be removed —
   * its transform is collapsed to nothing instead, which costs a single matrix
   * write rather than rebuilding the batch.
   */
  removeInteractable(it: Interactable): void {
    it.used = true;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const mesh of it.meshes) {
      if (it.index >= mesh.count) continue;
      mesh.setMatrixAt(it.index, m);
      mesh.instanceMatrix.needsUpdate = true;
    }
    // Stop it blocking movement now that it is gone. A smashed barrel that you
    // still cannot walk through reads as a bug even though the model is hidden.
    // Match on where the prop is *drawn*, not its tile centre: a wall prop's
    // collider carries the same `wallOffset` its mesh does.
    const cx = it.x;
    const cz = it.z;
    for (let i = this.colliders.length - 1; i >= 0; i--) {
      const c = this.colliders[i]!;
      if (Math.abs(c.x - cx) < 0.01 && Math.abs(c.z - cz) < 0.01) this.colliders.splice(i, 1);
    }
  }

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
        // Ground to the lowest floor this tile touches, not the tile's own
        // height. See `propGroundHeight`.
        ys[i] = def.placement === 'wall' || def.placement === 'liquid'
          ? this.floorHeight(p.x, p.y)
          : propGroundHeight(level, p.x, p.y) * STEP_HEIGHT;
        rot[i] = yaw;
        sc[i] = scaleFor(g.kind, p.x, p.y);
      }

      // A placement may carry its own payload even when the prop kind has no
      // default one — the quest altar is emitted with `quest.altar` while its
      // definition declares nothing. Gate on either.
      const groupInteracts = def.interact !== undefined || g.list.some((p) => p.interact !== undefined);
      const meshesForGroup: THREE.InstancedMesh[] = [];
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
        // Remember every mesh a placement is drawn by, so one chest can be
        // opened or one barrel smashed without disturbing the rest of the
        // batch. Props are instanced for speed; this is the price of that.
        if (groupInteracts) meshesForGroup.push(inst);
      }

      // Index the interactables. A prop with an `interact` payload is something
      // the player can walk up to and use — chests, shrines, barrels, urns. The
      // whole layer was authored, placed and drawn, and nothing ever read the
      // payload, so none of it could be touched.
      if (groupInteracts) {
        for (let i = 0; i < n; i++) {
          const p = g.list[i]!;
          const payload = p.interact ?? def.interact;
          if (!payload) continue;
          this.interactables.push({
            kind: payload,
            propKind: g.kind,
            tileX: p.x,
            tileY: p.y,
            x: xs[i]!,
            y: ys[i]!,
            z: zs[i]!,
            index: i,
            meshes: meshesForGroup,
            used: false,
          });
        }
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
      // No shadows from the torch pool.
      //
      // A shadow-casting point light renders the scene six times, once per cube
      // face. These lights re-target the nearest torches several times a second
      // as the player walks, so every re-target re-rendered the dungeon six
      // times over. Profiling caught multi-second frames from this alone, with
      // no enemies on screen at all — it is the walking stutter.
      //
      // The atmosphere survives: flames are emissive and bloom, the biome key
      // light still casts, and the player carries their own aura.
      l.castShadow = false;
      void SHADOW_LIGHTS;
      // Stays visible for the renderer's whole life. Toggling a light's
      // `visible` flag changes the scene's light count, and three.js keys the
      // shader program cache on that count, so every material in the scene
      // recompiles. The pool re-targets several times a second as the player
      // walks, which turned into a constant micro-stutter. Unused lights are
      // parked at zero intensity instead.
      l.visible = true;
      l.intensity = 0;
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
      // At most three a room: the whiteout vault drew seven over one fight
      // and the frame went white (w13, w14).
      const tries = Math.min(3, Math.max(1, Math.round(room.w * room.h * 0.004 * art.shaftDensity * 6)));
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
        // The camera looks down on the top of the cone, so the top is what
        // fills the screen: ease it off where the shaft leaves the ceiling.
        const a = Math.pow(t, 2.1) * 0.5 * (1 - 0.6 * clamp((t - 0.7) / 0.3, 0, 1));
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
    // Front faces only. A double-sided cone shows its own far wall through its
    // near one, and where the two overlap the shape reads as a solid object
    // sitting in the room rather than as light falling through it — which is
    // exactly how it looked in a render: a faceted tent with a bright lid.
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
      toneMapped: false,
    });
    // Shafts thin out around the hero so a beam never sits over the fight.
    // A private material, so the patch leaks nowhere.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHero = { value: this.heroXZ };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vShaftPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShaftPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vShaftPos;\nuniform vec2 uHero;')
        .replace(
          '#include <opaque_fragment>',
          'diffuseColor.a *= 0.2 + 0.8 * smoothstep(2.5, 6.5, distance(vShaftPos.xz, uHero));\n#include <opaque_fragment>',
        );
    };
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

    // Prop colliders. A wall prop is *drawn* pushed back into the wall by
    // `wallOffset` (see `buildProps`), so a collider left on the tile centre
    // sits half a metre out in the open — a bookcase you bump into a pace
    // before you reach it, and bare floor where the shelf actually is. Use the
    // same offset the mesh uses.
    for (const p of this.level.props) {
      const def = propDef(p.kind);
      if (!def.blocks || def.radius <= 0) continue;
      const s = scaleFor(p.kind, p.x, p.y);
      const r = def.radius * s * 2;
      const off = def.placement === 'wall' ? (def.wallOffset ?? 0.7) : 0;
      this.colliders.push({
        x: this.tileX(p.x) - Math.sin(p.rotation) * off,
        z: this.tileZ(p.y) - Math.cos(p.rotation) * off,
        w: r,
        d: r,
      });
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
    // The roof follows the camera focus, which is the player.
    this.heroXZ.set(focus.x, focus.z);
    setWorldRoof(focus.x, focus.z, ROOF_OPEN);
    // Walls between the camera and the hero open a small hole on the sightline.
    setWorldCutaway(focus.x, focus.y + 1.1, focus.z, 2.0);
    // Height fog sits just under the lowest walkable floor: pits sink into it,
    // nobody stands in it.
    if (fogShape.w > 0) fogShape.y = this.lowestFloor - 0.9;
    if (sun) {
      // Whole-metre steps: a shadow map sliding by fractions of a texel
      // every frame shimmers along every edge.
      const fx = Math.round(focus.x);
      const fz = Math.round(focus.z);
      sun.position.set(fx + sunOffset.x, sunOffset.y, fz + sunOffset.z);
      sun.target.position.set(fx, 0, fz);
      sun.target.updateMatrixWorld();
    }
    this.updateLights(dt, elapsed, focus);
    this.updateFlames(elapsed, focus);
    this.liquid?.update(elapsed);
    this.drips?.update(dt, focus);

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
      this.shaftMat.opacity = 0.45 + n * 0.16;
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
          // Park it rather than hide it: see the note where the pool is built.
          l.intensity = 0;
          l.userData.torch = -1;
          continue;
        }
        const t = this.torches[pick.idx];
        l.position.copy(t.pos);
        l.color.copy(t.color);
        l.distance = t.distance;
        l.decay = 2;
        l.userData.torch = pick.idx;
      }
    }

    // Flicker every frame on whichever torches currently own a light.
    for (const l of this.lights) {
      const ti = (l.userData.torch as number) ?? -1;
      if (ti < 0) {
        l.intensity = 0;
        continue;
      }
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
    this.liquid?.dispose();
    this.liquid = null;
    this.drips?.dispose();
    this.drips = null;
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
/** Corner order of an upward `Surf.flat` quad, as (dx, dz). */
const FLAT_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

/** Cheap deterministic per-tile hash. Not randomness: a stable property of the tile. */
function smooth01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function hashTile(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * True when a surface with this UV span per tile lands on whole texture
 * repeats at the tile edge — the condition for per-tile mirroring to be
 * seamless. Mirrors the quantisation the texture library applies.
 */
function wholeRepeat(repeat: number, uvSpan: number): boolean {
  const q = Math.round(Math.max(0.125, Math.min(64, repeat)) * 4) / 4;
  const span = uvSpan * q;
  return Math.abs(span - Math.round(span)) < 1e-6;
}
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

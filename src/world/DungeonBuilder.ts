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
import { STEP_HEIGHT, TILE_SIZE, levelExtras, propGroundHeight } from './DungeonGen';
import { propDef, propTemplate, scaleFor, variantFor, type PropTemplate } from './Props';

import { surface, surfaceVariant } from '../art/Materials';

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
/** How much of the lid is cut away around the player, in world units. */
const ROOF_OPEN = 21;

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
  /** The run's biome variant, which is mostly a lighting change. */
  variant?: string,
): { key: THREE.DirectionalLight; ambient: THREE.Light; dispose(): void } {
  const art = biomeArt(biome.id, variant);

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
  /** Where the hole in the roof is centred. Written every frame. */
  private readonly heroXZ = new THREE.Vector2();

  constructor(level: DungeonLevel, biome: BiomeDef, rng: Rng) {
    this.level = level;
    this.biome = biome;
    this.art = biomeArt(biome.id, level.variant);
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
    bedrockMat.onBeforeCompile = (shader) => {
      shader.uniforms.uHero = { value: this.heroXZ };
      shader.uniforms.uOpen = { value: ROOF_OPEN };
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

    const FLOOR0 = 0;
    const WALL0 = FLOOR0 + floorMats.length;
    const TRIM = WALL0 + wallMats.length;
    const BASE = TRIM + 1;
    const CEIL = BASE + 1;
    const LIQ = CEIL + 1;
    const VEIN = LIQ + 1;
    const PUDDLE = VEIN + 1;
    const BEDROCK = PUDDLE + 1;
    const BUCKETS = BEDROCK + 1;
    mats.push(...floorMats, ...wallMats, trimMat, baseMat, ceilMat, liquidMat, veinMat, puddleMat, bedrockMat);

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
        for (let i = 0; i < BUCKETS; i++) surfs.push(new Surf());

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

            if (v === T_WALL) {
              this.emitWall(surfs, x, y, wx, wz, hy, roofY, wallMats.length, WALL0, TRIM, BASE, surfs[BEDROCK]);
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
          // Named so probes can find the rock lid without guessing which
          // unnamed slab is filling the frame.
          mesh.name = i === BEDROCK ? 'roof' : i === CEIL ? 'ceiling' : `surface${i}`;
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
    /** The bucket the level's lid is accumulated into. */
    roof: Surf,
  ): void {
    const wallH = topY - hy;
    // Deterministic wall variant, clumped so it reads as masonry courses rather
    // than per-tile noise.
    const nv = this.noise.fbm(x * 0.07, y * 0.07, 2) * 0.5 + 0.5;
    const wi = WALL0 + Math.min(wallCount - 1, Math.floor(nv * wallCount));
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
    // The cap goes in the roof bucket, not the wall bucket. A wall top and the
    // rock beyond it are the same surface — the lid over the level — and the
    // lid has to be able to open around the player as one piece.
    roof.flat(wx, topY, wz, HALF, true, x % 4, y % 4, 1);
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
    const stone = safeSurface(this.art.walls?.[0]?.palette ?? 'stone.crypt', { repeat: 1.6 });
    const dark = safeSurface('stone.crypt', { repeat: 1.2, tint: 0x5a5a62 });

    // --- the descent ------------------------------------------------------
    const exit = this.tileToWorld(level.exit.x, level.exit.y);
    const stairs = new THREE.Group();
    stairs.position.copy(exit);

    // A well sunk into the floor with a flight running down into it. Steps get
    // narrower and darker as they go, which is what sells depth without
    // actually cutting a hole in the floor mesh.
    const STEPS = 7;
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      const w = 2.6 - t * 0.5;
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.22, 0.42),
        i > STEPS - 3 ? dark : stone,
      );
      step.position.set(0, -0.11 - i * 0.2, -0.6 + i * 0.42);
      step.receiveShadow = true;
      step.castShadow = true;
      stairs.add(step);
    }
    // Side walls of the stairwell, so it does not read as steps on open floor.
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.9, 3.6), stone);
      wall.position.set(sx * 1.5, -0.9, 0.55);
      wall.castShadow = true;
      wall.receiveShadow = true;
      stairs.add(wall);
    }
    // The dark at the bottom. Unlit black, so the shaft reads as bottomless.
    const shaft = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.4),
      new THREE.MeshBasicMaterial({ color: 0x05050a, toneMapped: false }),
    );
    shaft.rotation.x = -Math.PI / 2;
    shaft.position.set(0, -1.42, 1.5);
    stairs.add(shaft);

    // A lintel and two posts framing the mouth, so it is visible from above.
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.2, 0.34), stone);
      post.position.set(sx * 1.5, 1.1, -0.85);
      post.castShadow = true;
      stairs.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 0.5), stone);
    lintel.position.set(0, 2.3, -0.85);
    lintel.castShadow = true;
    stairs.add(lintel);

    // A cold glow out of the shaft: the one cue that reads at a glance as
    // "this is the way on".
    const glow = new THREE.PointLight(0x8fd0ff, 9, 9, 2);
    glow.position.set(0, 0.4, 1.2);
    glow.castShadow = false;
    stairs.add(glow);

    this.root.add(stairs);
    this.colliders.push(
      { x: exit.x - 1.5, z: exit.z + 0.55, w: 0.5, d: 3.6 },
      { x: exit.x + 1.5, z: exit.z + 0.55, w: 0.5, d: 3.6 },
    );

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
      const sz = rng.range(0.35, 0.8);
      const rock = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.8, sz), dark);
      rock.position.set(rng.range(-1.1, 1.1), sz * 0.4, -1.1 + rng.range(-0.3, 0.3));
      rock.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      rock.castShadow = true;
      rock.receiveShadow = true;
      arch.add(rock);
    }
    this.root.add(arch);
    this.colliders.push({ x: entry.x, z: entry.z - 1.1, w: 3.0, d: 0.9 });
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
    // Front faces only. A double-sided cone shows its own far wall through its
    // near one, and where the two overlap the shape reads as a solid object
    // sitting in the room rather than as light falling through it — which is
    // exactly how it looked in a render: a faceted tent with a bright lid.
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
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

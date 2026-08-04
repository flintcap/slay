/**
 * SLAY — prop library and placement rules.
 *
 * Two halves:
 *
 *  - **Placement** (`placeProps`) decides *where* things go, and it is written
 *    to feel authored rather than sprinkled. Torches land at regular intervals
 *    along contiguous wall runs, centred within each run. Pillars sit on a room
 *    grid. Rooms get a single hero feature at their centre. Clutter clumps via
 *    noise instead of scattering uniformly, and hugs walls the way real objects
 *    do. Nothing that blocks movement is ever allowed to sever the level — the
 *    placer runs a connectivity check with the props treated as walls and
 *    retracts anything that broke it.
 *
 *  - **Geometry** (`propTemplate`) builds the meshes. Everything is code —
 *    boxes, lathes, cones, displaced spheres — grouped into a small number of
 *    archetypes that are then parameterised per kind. Templates are cached and
 *    shared, and returned as flat layer lists so the builder can turn each one
 *    into an `InstancedMesh`.
 */

import * as THREE from 'three';
import type { BiomeDef, DungeonLevel, DungeonRoom, PropPlacement, Rng } from '../types';
import { Noise, clamp, hash2 } from '../art/Noise';
import { biomeArt, type BiomeArt } from './Biomes';
import {
  T_DOOR,
  T_FLOOR,
  T_LAVA,
  T_RUBBLE,
  T_STAIRS_DOWN,
  T_STAIRS_UP,
  T_WATER,
  isWalkableValue,
} from './Layouts';
import { emissiveMaterial, surface } from '../art/Materials';
import { displace, lathe, mergeGeometries, stoneBlock } from '../art/Meshes';

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export type PropPlacementKind = 'floor' | 'wall' | 'feature' | 'liquid' | 'ceiling' | 'detail';

export interface PropLightSpec {
  color: number;
  intensity: number;
  distance: number;
  /** Height above the prop's base, in world units. */
  height: number;
  /** 0 = steady, 1 = wild. Drives the noise flicker in the builder. */
  flicker: number;
  /** Forward offset from the prop origin along its facing. */
  forward: number;
}

export interface PropDef {
  kind: string;
  placement: PropPlacementKind;
  /** Collision radius in world units. 0 = walk-through. */
  radius: number;
  blocks: boolean;
  variants: number;
  /** ±jitter applied to instance scale. */
  scaleJitter: number;
  /** Random yaw allowed (floor props) vs snapped to the wall normal. */
  freeRotate: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  light?: PropLightSpec;
  /** Distance from tile centre toward the wall, for wall-mounted props. */
  wallOffset?: number;
  /** Default interact payload when placed as an interactable. */
  interact?: string;
  /** Renders with additive/transparent blending (webs, void rifts, flames). */
  ghost?: boolean;
}

function P(kind: string, o: Partial<PropDef>): PropDef {
  return {
    kind,
    placement: 'floor',
    radius: 0.35,
    blocks: false,
    variants: 3,
    scaleJitter: 0.16,
    freeRotate: true,
    castShadow: true,
    receiveShadow: true,
    ...o,
  };
}

/**
 * Ground detail: too small to matter, too many to leave out.
 *
 * No collision, no shadow, no blocking. The placement pass is allowed to be
 * far more generous with these than with clutter precisely because none of
 * that is true of them.
 */
function DETAIL(kind: string): PropDef {
  return P(kind, {
    placement: 'detail',
    radius: 0,
    blocks: false,
    variants: 4,
    scaleJitter: 0.3,
    castShadow: false,
    receiveShadow: true,
  });
}

const TORCH_LIGHT = (color: number, i = 6.5, d = 13, flicker = 1): PropLightSpec => ({
  color,
  intensity: i,
  distance: d,
  height: 2.05,
  flicker,
  forward: 0.28,
});

export const PROP_DEFS: Record<string, PropDef> = {
  // --- wall lights -------------------------------------------------------
  torch: P('torch', {
    placement: 'wall',
    radius: 0,
    variants: 2,
    freeRotate: false,
    wallOffset: 0.72,
    light: TORCH_LIGHT(0xff8a3c, 6.5, 13, 1),
  }),
  forgeSconce: P('forgeSconce', {
    placement: 'wall',
    radius: 0,
    variants: 2,
    freeRotate: false,
    wallOffset: 0.7,
    light: TORCH_LIGHT(0xff6a1e, 8.5, 15, 0.85),
  }),
  templeLantern: P('templeLantern', {
    placement: 'wall',
    radius: 0,
    variants: 2,
    freeRotate: false,
    wallOffset: 0.68,
    light: TORCH_LIGHT(0xffd27a, 5.5, 14, 0.45),
  }),
  iceLantern: P('iceLantern', {
    placement: 'wall',
    radius: 0,
    variants: 2,
    freeRotate: false,
    wallOffset: 0.68,
    light: TORCH_LIGHT(0x9fdcff, 5.0, 14, 0.3),
  }),
  glowShroom: P('glowShroom', {
    placement: 'wall',
    radius: 0,
    variants: 3,
    freeRotate: false,
    wallOffset: 0.66,
    castShadow: false,
    light: TORCH_LIGHT(0x53f0c8, 4.2, 11, 0.25),
  }),
  eggSac: P('eggSac', {
    placement: 'wall',
    radius: 0.3,
    variants: 3,
    freeRotate: false,
    wallOffset: 0.62,
    light: TORCH_LIGHT(0xffc23c, 4.8, 10, 0.35),
  }),
  voidFlame: P('voidFlame', {
    placement: 'wall',
    radius: 0,
    variants: 2,
    freeRotate: false,
    wallOffset: 0.7,
    light: TORCH_LIGHT(0xff3ce0, 6.2, 13, 0.7),
  }),
  brazier: P('brazier', {
    placement: 'feature',
    // A brazier is a narrow bowl on a tripod. At 0.55 its collider was a metre
    // and a bit across, so you bounced off thin air a half-tile away from it.
    radius: 0.3,
    blocks: true,
    variants: 2,
    light: { color: 0xff8a3c, intensity: 9, distance: 17, height: 1.5, flicker: 1, forward: 0 },
  }),

  // --- pillars -----------------------------------------------------------
  pillarGothic: P('pillarGothic', { radius: 0.62, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.05 }),
  pillarIron: P('pillarIron', { radius: 0.6, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.05 }),
  pillarFluted: P('pillarFluted', { radius: 0.62, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.05 }),
  pillarIce: P('pillarIce', { radius: 0.62, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.08 }),
  pillarBroken: P('pillarBroken', { radius: 0.55, blocks: true, variants: 3, scaleJitter: 0.14 }),
  pillarVoid: P('pillarVoid', { radius: 0.6, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.06 }),
  stalacColumn: P('stalacColumn', { radius: 0.68, blocks: true, variants: 3, scaleJitter: 0.18 }),
  chitinColumn: P('chitinColumn', { radius: 0.6, blocks: true, variants: 3, scaleJitter: 0.16 }),

  // --- crypt -------------------------------------------------------------
  sarcophagus: P('sarcophagus', { radius: 0.85, blocks: true, variants: 3, freeRotate: false, scaleJitter: 0.06 }),
  bonepile: P('bonepile', { radius: 0.4, variants: 4, castShadow: true }),
  candleCluster: P('candleCluster', {
    radius: 0.2,
    variants: 3,
    light: { color: 0xffb060, intensity: 2.2, distance: 6, height: 0.7, flicker: 1, forward: 0 },
  }),
  brokenColumn: P('brokenColumn', { radius: 0.5, blocks: true, variants: 4, scaleJitter: 0.2 }),
  wallSkull: P('wallSkull', { placement: 'wall', radius: 0, variants: 3, freeRotate: false, wallOffset: 0.7, castShadow: false }),
  chain: P('chain', { placement: 'wall', radius: 0, variants: 3, freeRotate: false, wallOffset: 0.62, castShadow: false }),
  banner: P('banner', { placement: 'wall', radius: 0, variants: 3, freeRotate: false, wallOffset: 0.7, castShadow: false }),
  statue: P('statue', { placement: 'feature', radius: 0.6, blocks: true, variants: 3, scaleJitter: 0.08 }),
  altar: P('altar', { placement: 'feature', radius: 0.8, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.05 }),
  rubblePile: P('rubblePile', { radius: 0.45, variants: 4, scaleJitter: 0.22 }),

  // --- caverns -----------------------------------------------------------
  stalagmite: P('stalagmite', { radius: 0.35, variants: 4, scaleJitter: 0.3 }),
  rockCluster: P('rockCluster', { radius: 0.5, variants: 4, scaleJitter: 0.25 }),
  mushroomCluster: P('mushroomCluster', { radius: 0.3, variants: 3, castShadow: false }),
  crystalShard: P('crystalShard', { radius: 0.28, variants: 4, scaleJitter: 0.3 }),
  crystalCluster: P('crystalCluster', { placement: 'feature', radius: 0.7, blocks: true, variants: 3, scaleJitter: 0.2 }),
  rootTangle: P('rootTangle', { placement: 'wall', radius: 0, variants: 3, freeRotate: false, wallOffset: 0.66, castShadow: false }),

  // --- foundry -----------------------------------------------------------
  anvil: P('anvil', { radius: 0.45, blocks: true, variants: 2, scaleJitter: 0.06 }),
  pipeCluster: P('pipeCluster', { radius: 0.45, blocks: true, variants: 3, freeRotate: false }),
  pipeRun: P('pipeRun', { placement: 'wall', radius: 0, variants: 3, freeRotate: false, wallOffset: 0.6 }),
  valveWheel: P('valveWheel', { placement: 'wall', radius: 0, variants: 2, freeRotate: false, wallOffset: 0.66, castShadow: false }),
  gear: P('gear', { radius: 0.55, blocks: true, variants: 3, scaleJitter: 0.2 }),
  ingotStack: P('ingotStack', { radius: 0.4, variants: 3 }),
  forge: P('forge', {
    placement: 'feature',
    radius: 0.9,
    blocks: true,
    variants: 2,
    freeRotate: false,
    light: { color: 0xff5a14, intensity: 11, distance: 16, height: 1.1, flicker: 0.8, forward: 0 },
  }),
  smeltingVat: P('smeltingVat', {
    placement: 'feature',
    radius: 0.85,
    blocks: true,
    variants: 2,
    light: { color: 0xff7a20, intensity: 7, distance: 12, height: 1.4, flicker: 0.5, forward: 0 },
  }),

  // --- temple ------------------------------------------------------------
  wallRelief: P('wallRelief', { placement: 'wall', radius: 0, variants: 3, freeRotate: false, wallOffset: 0.74, castShadow: false }),
  fountain: P('fountain', { placement: 'feature', radius: 1.0, blocks: true, variants: 2, scaleJitter: 0.04 }),
  lilyPad: P('lilyPad', { placement: 'liquid', radius: 0, variants: 3, castShadow: false }),

  // --- hive --------------------------------------------------------------
  webClump: P('webClump', { radius: 0.3, variants: 3, castShadow: false, ghost: true }),
  webSheet: P('webSheet', { placement: 'wall', radius: 0, variants: 3, freeRotate: false, wallOffset: 0.68, castShadow: false, ghost: true }),
  chitinSpike: P('chitinSpike', { radius: 0.3, variants: 4, scaleJitter: 0.3 }),
  cocoon: P('cocoon', { radius: 0.35, variants: 3, freeRotate: false }),
  fleshGrowth: P('fleshGrowth', { radius: 0.4, variants: 4, castShadow: false }),
  broodMound: P('broodMound', { placement: 'feature', radius: 1.0, blocks: true, variants: 2 }),

  // --- frostvault --------------------------------------------------------
  iceShard: P('iceShard', { radius: 0.3, variants: 4, scaleJitter: 0.3 }),
  icicleRow: P('icicleRow', { placement: 'wall', radius: 0, variants: 3, freeRotate: false, wallOffset: 0.66, castShadow: false }),
  frozenCorpse: P('frozenCorpse', { radius: 0.4, blocks: true, variants: 3 }),
  iceMonolith: P('iceMonolith', { placement: 'feature', radius: 0.8, blocks: true, variants: 2, scaleJitter: 0.1 }),

  // --- ashwaste ----------------------------------------------------------
  deadTree: P('deadTree', { radius: 0.4, blocks: true, variants: 3, scaleJitter: 0.25 }),
  boneSpire: P('boneSpire', { radius: 0.45, blocks: true, variants: 3, scaleJitter: 0.25 }),
  obelisk: P('obelisk', { placement: 'feature', radius: 0.7, blocks: true, variants: 2, scaleJitter: 0.1 }),

  // --- voidspire ---------------------------------------------------------
  voidShard: P('voidShard', { radius: 0.3, variants: 4, scaleJitter: 0.3 }),
  floatingStone: P('floatingStone', { radius: 0, variants: 4, scaleJitter: 0.3, castShadow: false }),
  runeStone: P('runeStone', { radius: 0.4, blocks: true, variants: 3 }),
  voidRift: P('voidRift', {
    placement: 'feature',
    radius: 0,
    variants: 2,
    ghost: true,
    castShadow: false,
    light: { color: 0xd040ff, intensity: 7, distance: 15, height: 1.6, flicker: 0.6, forward: 0 },
  }),

  // --- interactables -----------------------------------------------------
  chest: P('chest', { radius: 0.5, blocks: true, variants: 3, freeRotate: false, interact: 'chest', scaleJitter: 0.04 }),
  barrel: P('barrel', { radius: 0.38, blocks: true, variants: 3, interact: 'barrel', scaleJitter: 0.08 }),
  crate: P('crate', { radius: 0.42, blocks: true, variants: 3, interact: 'crate', scaleJitter: 0.1 }),
  urn: P('urn', { radius: 0.3, blocks: false, variants: 4, interact: 'urn', scaleJitter: 0.14 }),
  bookcase: P('bookcase', { placement: 'wall', radius: 0.4, blocks: true, variants: 3, freeRotate: false, wallOffset: 0.62, interact: 'bookcase' }),
  shrine: P('shrine', {
    placement: 'feature',
    radius: 0.6,
    blocks: true,
    variants: 3,
    freeRotate: false,
    interact: 'shrine',
    light: { color: 0x9fd8ff, intensity: 6, distance: 12, height: 1.5, flicker: 0.35, forward: 0 },
  }),
  lever: P('lever', { placement: 'wall', radius: 0, variants: 2, freeRotate: false, wallOffset: 0.68, interact: 'lever', castShadow: false }),

  // --- ground detail -----------------------------------------------------
  //
  // The layer that makes a floor read as a place rather than a plane.
  //
  // A floor covered in barrels and columns is not detailed, it is an obstacle
  // course; what a finished level actually has is a great deal of small stuff
  // nobody looks at directly — grit, chips, drifts, growth. Everything here is
  // tiny, blocks nothing, casts no shadow and has zero collision radius, so it
  // can be scattered an order of magnitude more densely than the clutter layer
  // without changing how the floor plays or costing a shadow pass.
  pebbles: DETAIL('pebbles'),
  boneChips: DETAIL('boneChips'),
  ashDrift: DETAIL('ashDrift'),
  mossPatch: DETAIL('mossPatch'),
  sporeTuft: DETAIL('sporeTuft'),
  iceCrust: DETAIL('iceCrust'),
  slagChunk: DETAIL('slagChunk'),
  shellFragment: DETAIL('shellFragment'),
  sandDrift: DETAIL('sandDrift'),
  voidMote: DETAIL('voidMote'),
  scorchMark: DETAIL('scorchMark'),
  grassTuft: DETAIL('grassTuft'),
};

export function propDef(kind: string): PropDef {
  return PROP_DEFS[kind] ?? PROP_DEFS.rubblePile;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

const SHRINE_TYPES = ['power', 'ward', 'haste', 'fortune', 'wrath', 'vitality'];

interface PlaceCtx {
  level: DungeonLevel;
  art: BiomeArt;
  rng: Rng;
  noise: Noise;
  w: number;
  h: number;
  tiles: Uint8Array;
  roomOf: Int16Array;
  occupied: Uint8Array;
  blocked: Uint8Array;
  out: PropPlacement[];
}

/** Builds the full prop list for a level. */
export function placeProps(level: DungeonLevel, biome: BiomeDef, rng: Rng): PropPlacement[] {
  // The run's dressed version of the biome, so a flooded crypt gets the
  // flooded crypt's clutter rather than the plain one's.
  const art = biomeArt(biome.id, level.variant);
  const w = level.width;
  const h = level.height;
  const roomOf = (level as DungeonLevel & { roomOf?: Int16Array }).roomOf ?? buildRoomIndex(level);

  const ctx: PlaceCtx = {
    level,
    art,
    rng,
    noise: new Noise((level.seed ^ 0x91d3) >>> 0),
    w,
    h,
    tiles: level.tiles,
    roomOf,
    occupied: new Uint8Array(w * h),
    blocked: new Uint8Array(w * h),
    out: [],
  };

  // Reserve stairs and their landings, plus every spawn tile.
  reserve(ctx, level.entry.x, level.entry.y, 2);
  reserve(ctx, level.exit.x, level.exit.y, 2);
  for (const s of level.spawns) markOccupied(ctx, s.x, s.y);

  placeWallLights(ctx);
  placeRoomFeatures(ctx);
  placePillars(ctx);
  placeInteractables(ctx);
  placeWallDressing(ctx);
  placeScatter(ctx);
  placeGroundDetail(ctx);
  placeLiquidProps(ctx);

  enforceConnectivity(ctx);
  return ctx.out;
}

function buildRoomIndex(level: DungeonLevel): Int16Array {
  const idx = new Int16Array(level.width * level.height).fill(-1);
  for (const r of level.rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        if (!isWalkableValue(level.tiles[y * level.width + x])) continue;
        idx[y * level.width + x] = r.id;
      }
    }
  }
  return idx;
}

function tile(ctx: PlaceCtx, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= ctx.w || y >= ctx.h) return 0;
  return ctx.tiles[y * ctx.w + x];
}

function walkable(ctx: PlaceCtx, x: number, y: number): boolean {
  return isWalkableValue(tile(ctx, x, y));
}

function markOccupied(ctx: PlaceCtx, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= ctx.w || y >= ctx.h) return;
  ctx.occupied[y * ctx.w + x] = 1;
}

function isOccupied(ctx: PlaceCtx, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= ctx.w || y >= ctx.h) return true;
  return ctx.occupied[y * ctx.w + x] === 1;
}

function reserve(ctx: PlaceCtx, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) markOccupied(ctx, x, y);
}

function roomAtTile(ctx: PlaceCtx, x: number, y: number): DungeonRoom | null {
  if (x < 0 || y < 0 || x >= ctx.w || y >= ctx.h) return null;
  const id = ctx.roomOf[y * ctx.w + x];
  if (id < 0) return null;
  return ctx.level.rooms.find((r) => r.id === id) ?? null;
}

/**
 * A tile may carry a blocking prop only if losing it cannot pinch the level.
 * Requires three open orthogonal neighbours — which excludes every corridor
 * tile, every corner and every doorway by construction.
 */
function canBlock(ctx: PlaceCtx, x: number, y: number): boolean {
  const v = tile(ctx, x, y);
  if (v !== T_FLOOR && v !== T_RUBBLE) return false;
  let orth = 0;
  if (walkable(ctx, x - 1, y)) orth++;
  if (walkable(ctx, x + 1, y)) orth++;
  if (walkable(ctx, x, y - 1)) orth++;
  if (walkable(ctx, x, y + 1)) orth++;
  if (orth < 3) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (tile(ctx, x + dx, y + dy) === T_DOOR) return false;
    }
  }
  return true;
}

function emit(
  ctx: PlaceCtx,
  x: number,
  y: number,
  kind: string,
  rotation: number,
  interact?: string,
): boolean {
  const def = propDef(kind);
  if (isOccupied(ctx, x, y)) return false;
  if (def.blocks && !canBlock(ctx, x, y)) return false;
  markOccupied(ctx, x, y);
  if (def.blocks) ctx.blocked[y * ctx.w + x] = 1;
  ctx.out.push({ x, y, rotation, kind, interact });
  return true;
}

// --- wall lights -----------------------------------------------------------

interface WallFace {
  x: number;
  y: number;
  /** Yaw so the prop's local +Z points away from the wall. */
  rotation: number;
  dir: number;
}

/** Every floor tile that has a wall on exactly one side, grouped into runs. */
function wallRuns(ctx: PlaceCtx): WallFace[][] {
  const runs: WallFace[][] = [];
  const dirs = [
    { dx: 0, dy: -1, rot: 0, axis: 'x' as const },
    { dx: 0, dy: 1, rot: Math.PI, axis: 'x' as const },
    { dx: -1, dy: 0, rot: Math.PI / 2, axis: 'y' as const },
    { dx: 1, dy: 0, rot: -Math.PI / 2, axis: 'y' as const },
  ];
  for (let d = 0; d < dirs.length; d++) {
    const dir = dirs[d];
    const lines = new Map<number, WallFace[]>();
    for (let y = 1; y < ctx.h - 1; y++) {
      for (let x = 1; x < ctx.w - 1; x++) {
        const v = tile(ctx, x, y);
        if (v !== T_FLOOR && v !== T_RUBBLE && v !== T_STAIRS_DOWN && v !== T_STAIRS_UP) continue;
        if (walkable(ctx, x + dir.dx, y + dir.dy)) continue;
        if (tile(ctx, x + dir.dx, y + dir.dy) === 0) continue; // outside the shell
        const key = dir.axis === 'x' ? y : x;
        let list = lines.get(key);
        if (!list) {
          list = [];
          lines.set(key, list);
        }
        list.push({ x, y, rotation: dir.rot, dir: d });
      }
    }
    for (const list of lines.values()) {
      list.sort((a, b) => (dir.axis === 'x' ? a.x - b.x : a.y - b.y));
      let run: WallFace[] = [];
      let prev = -99;
      for (const f of list) {
        const v = dir.axis === 'x' ? f.x : f.y;
        if (v !== prev + 1 && run.length > 0) {
          runs.push(run);
          run = [];
        }
        run.push(f);
        prev = v;
      }
      if (run.length > 0) runs.push(run);
    }
  }
  return runs;
}

function placeWallLights(ctx: PlaceCtx): void {
  const runs = wallRuns(ctx);
  const kind = ctx.art.wallLight;
  const spacing = Math.max(3, ctx.art.wallLightSpacing);

  for (const run of runs) {
    if (run.length < 3) continue;
    // Centre the pattern in the run so both ends read as deliberate.
    const n = run.length;
    const count = Math.max(1, Math.floor((n - 1) / spacing) + 1);
    const span = (count - 1) * spacing;
    const start = Math.floor((n - 1 - span) / 2);
    for (let i = 0; i < count; i++) {
      const idx = start + i * spacing;
      if (idx < 0 || idx >= n) continue;
      const f = run[idx];
      // A light every single run would be too many; longer runs matter more.
      if (n < 5 && ctx.rng.chance(0.45)) continue;
      emit(ctx, f.x, f.y, kind, f.rotation);
    }
  }

  // Braziers punctuate the big rooms, where wall sconces alone leave the middle
  // dark and flat.
  for (const room of ctx.level.rooms) {
    if (room.w < 9 || room.h < 9) continue;
    if (!ctx.rng.chance(0.55)) continue;
    const corners = [
      { x: room.x + 2, y: room.y + 2 },
      { x: room.x + room.w - 3, y: room.y + 2 },
      { x: room.x + 2, y: room.y + room.h - 3 },
      { x: room.x + room.w - 3, y: room.y + room.h - 3 },
    ];
    const use = ctx.rng.chance(0.5) ? corners : ctx.rng.shuffle(corners.slice()).slice(0, 2);
    for (const c of use) {
      if (!walkable(ctx, c.x, c.y)) continue;
      emit(ctx, c.x, c.y, 'brazier', ctx.rng.range(0, Math.PI * 2));
    }
  }
}

// --- room features ---------------------------------------------------------

function placeRoomFeatures(ctx: PlaceCtx): void {
  for (const room of ctx.level.rooms) {
    const cx = room.center.x;
    const cy = room.center.y;

    if (room.kind === 'shrine') {
      const type = ctx.rng.pick(SHRINE_TYPES);
      if (!placeNear(ctx, cx, cy, 3, 'shrine', `shrine.${type}`)) continue;
      // Ring of candles reads as a consecrated space.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const px = Math.round(cx + Math.cos(a) * 2.2);
        const py = Math.round(cy + Math.sin(a) * 2.2);
        if (walkable(ctx, px, py)) emit(ctx, px, py, 'candleCluster', ctx.rng.range(0, 6.28));
      }
      continue;
    }

    if (room.kind === 'boss') {
      // Keep the arena floor clear; ring the edge with features instead.
      const ringR = Math.min(room.w, room.h) * 0.42;
      const spokes = 8;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const px = Math.round(cx + Math.cos(a) * ringR);
        const py = Math.round(cy + Math.sin(a) * ringR);
        if (!walkable(ctx, px, py)) continue;
        const kind = i % 2 === 0 ? 'brazier' : pickWeighted(ctx, ctx.art.featureProps);
        emit(ctx, px, py, kind, -a + Math.PI / 2);
      }
      continue;
    }

    if (room.kind === 'entry' || room.kind === 'exit') continue;
    if (room.w < 7 || room.h < 7) continue;
    if (!ctx.rng.chance(0.62)) continue;

    const kind = pickWeighted(ctx, ctx.art.featureProps);
    placeNear(ctx, cx, cy, 2, kind);
  }
}

function placeNear(
  ctx: PlaceCtx,
  cx: number,
  cy: number,
  r: number,
  kind: string,
  interact?: string,
): boolean {
  const order: Array<[number, number]> = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) order.push([dx, dy]);
  order.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
  for (const [dx, dy] of order) {
    const x = cx + dx;
    const y = cy + dy;
    if (!walkable(ctx, x, y)) continue;
    if (emit(ctx, x, y, kind, ctx.rng.range(0, Math.PI * 2), interact)) return true;
  }
  return false;
}

// --- pillars ---------------------------------------------------------------

function placePillars(ctx: PlaceCtx): void {
  const kind = ctx.art.pillar;
  if (!kind) return;
  for (const room of ctx.level.rooms) {
    if (room.w < 9 || room.h < 9) continue;
    if (room.kind === 'entry' || room.kind === 'boss') continue;
    if (!ctx.rng.chance(0.7)) continue;

    const inset = 2;
    const stepX = room.w >= 15 ? 4 : 3;
    const stepY = room.h >= 15 ? 4 : 3;
    const usableW = room.w - inset * 2 - 1;
    const usableH = room.h - inset * 2 - 1;
    const nx = Math.max(2, Math.floor(usableW / stepX) + 1);
    const ny = Math.max(2, Math.floor(usableH / stepY) + 1);
    const spanX = (nx - 1) * stepX;
    const spanY = (ny - 1) * stepY;
    const ox = room.x + inset + Math.floor((usableW - spanX) / 2);
    const oy = room.y + inset + Math.floor((usableH - spanY) / 2);

    // Perimeter-only colonnade in wide rooms; a full grid in small ones would
    // turn the middle into a forest you cannot fight in.
    const perimeterOnly = nx > 2 && ny > 2;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (perimeterOnly && i > 0 && i < nx - 1 && j > 0 && j < ny - 1) continue;
        const x = ox + i * stepX;
        const y = oy + j * stepY;
        if (!walkable(ctx, x, y)) continue;
        emit(ctx, x, y, kind, 0);
      }
    }
  }
}

// --- interactables ---------------------------------------------------------

function placeInteractables(ctx: PlaceCtx): void {
  const rng = ctx.rng;
  for (const room of ctx.level.rooms) {
    const cx = room.center.x;
    const cy = room.center.y;

    if (room.kind === 'treasure') {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.range(0, 1);
        const px = Math.round(cx + Math.cos(a) * rng.range(1, 2.6));
        const py = Math.round(cy + Math.sin(a) * rng.range(1, 2.6));
        placeNear(ctx, px, py, 2, 'chest', i === 0 ? 'chest.rare' : 'chest.normal');
      }
      scatterAround(ctx, room, ['urn', 'barrel', 'crate'], 4);
    } else if (room.kind === 'vault') {
      placeNear(ctx, cx, cy, 2, 'chest', 'chest.vault');
      // A lever on the wall opens it — the builder wires the interaction.
      const face = nearestWallFace(ctx, cx, cy, 5);
      if (face) emit(ctx, face.x, face.y, 'lever', face.rotation, 'lever.vault');
      scatterAround(ctx, room, ['urn', 'crate'], 5);
    } else if (room.kind === 'ambush') {
      // Cover that looks lootable is the bait.
      scatterAround(ctx, room, ['barrel', 'crate', 'urn'], 6);
      if (rng.chance(0.5)) placeNear(ctx, cx, cy, 2, 'chest', 'chest.normal');
    } else if (room.kind === 'quest') {
      placeNear(ctx, cx, cy, 2, 'altar', 'quest.altar');
      scatterAround(ctx, room, ['urn', 'candleCluster'], 4);
    } else if (room.kind === 'normal' && rng.chance(0.75)) {
      // Scale with the room. A flat one-to-three put the same two barrels in a
      // six-tile chamber and in a seventeen-tile hall room.
      scatterAround(ctx, room, ['barrel', 'crate', 'urn'], clamp(Math.round((room.w * room.h) / 45), 1, 7));
    }

    // Bookcases go flat against a wall, never free-standing.
    if ((room.kind === 'normal' || room.kind === 'quest') && room.w >= 8 && room.h >= 8 && rng.chance(0.28)) {
      const face = nearestWallFace(ctx, cx, cy, 8);
      if (face) emit(ctx, face.x, face.y, 'bookcase', face.rotation, 'bookcase');
    }
  }
}

function scatterAround(ctx: PlaceCtx, room: DungeonRoom, kinds: string[], count: number): void {
  for (let i = 0; i < count * 4 && count > 0; i++) {
    const x = room.x + ctx.rng.int(0, Math.max(0, room.w - 1));
    const y = room.y + ctx.rng.int(0, Math.max(0, room.h - 1));
    if (!walkable(ctx, x, y)) continue;
    // Prefer tiles adjacent to a wall — loose objects end up at the edges.
    const nextToWall =
      !walkable(ctx, x - 1, y) || !walkable(ctx, x + 1, y) || !walkable(ctx, x, y - 1) || !walkable(ctx, x, y + 1);
    if (!nextToWall && ctx.rng.chance(0.6)) continue;
    const kind = ctx.rng.pick(kinds);
    if (emit(ctx, x, y, kind, ctx.rng.range(0, Math.PI * 2), propDef(kind).interact)) count--;
  }
}

function nearestWallFace(ctx: PlaceCtx, cx: number, cy: number, r: number): WallFace | null {
  const dirs = [
    { dx: 0, dy: -1, rot: 0 },
    { dx: 0, dy: 1, rot: Math.PI },
    { dx: -1, dy: 0, rot: Math.PI / 2 },
    { dx: 1, dy: 0, rot: -Math.PI / 2 },
  ];
  let best: WallFace | null = null;
  let bestD = Infinity;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!walkable(ctx, x, y) || isOccupied(ctx, x, y)) continue;
      for (let d = 0; d < 4; d++) {
        const dir = dirs[d];
        if (walkable(ctx, x + dir.dx, y + dir.dy)) continue;
        if (tile(ctx, x + dir.dx, y + dir.dy) === 0) continue;
        const dd = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (dd < bestD) {
          bestD = dd;
          best = { x, y, rotation: dir.rot, dir: d };
        }
      }
    }
  }
  return best;
}

// --- wall dressing ---------------------------------------------------------

function placeWallDressing(ctx: PlaceCtx): void {
  const pool = ctx.art.wallProps.filter((p) => p.kind !== ctx.art.wallLight);
  if (pool.length === 0) return;
  const runs = wallRuns(ctx);
  for (const run of runs) {
    if (run.length < 2) continue;
    const attempts = Math.max(1, Math.floor(run.length / 4));
    for (let i = 0; i < attempts; i++) {
      if (!ctx.rng.chance(0.5)) continue;
      const f = run[ctx.rng.int(0, run.length - 1)];
      const kind = pickWeighted(ctx, pool);
      emit(ctx, f.x, f.y, kind, f.rotation);
    }
  }
}

// --- clutter scatter -------------------------------------------------------

function placeScatter(ctx: PlaceCtx): void {
  const pool = ctx.art.props;
  if (pool.length === 0) return;
  const n = ctx.noise;
  // Two noise fields: one selects where clutter clumps, one decorrelates the
  // density so clumps have soft edges rather than hard blobs.
  const ox = ctx.rng.range(0, 200);
  const oy = ctx.rng.range(0, 200);

  const baseDensity = 0.2;
  for (let y = 1; y < ctx.h - 1; y++) {
    for (let x = 1; x < ctx.w - 1; x++) {
      const v = tile(ctx, x, y);
      if (v !== T_FLOOR && v !== T_RUBBLE) continue;
      if (isOccupied(ctx, x, y)) continue;

      const room = roomAtTile(ctx, x, y);
      if (room && room.kind === 'entry') continue;
      // A boss arena needs floor to fight on, not a bare plate. It keeps the
      // middle clear and takes clutter only around the rim, and only clutter
      // that does not block — measured, the arena floor was half bare, which is
      // most of the screen during the fight you came for.
      const bossRoom = room?.kind === 'boss';
      if (bossRoom) {
        const rimX = Math.min(x - room.x, room.x + room.w - 1 - x);
        const rimY = Math.min(y - room.y, room.y + room.h - 1 - y);
        if (Math.min(rimX, rimY) > 3) continue;
      }

      // How open the ground is here, out of the eight neighbours.
      //
      // This used to ask "is this tile inside a room rectangle", and thin
      // anything that was not by 86%. That works for a dungeon made of boxes
      // and corridors and fails completely for one that is not: the terraces,
      // arena and ruins shapes are mostly open ground that no room rectangle
      // covers, so almost nothing was placed on them. Measured, those three
      // were 45-55% bare while a maze was under 1%. Openness is the thing the
      // rule was reaching for — a corridor you must be able to run down is a
      // narrow tile, whatever the room list says.
      let open = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (walkable(ctx, x + dx, y + dy)) open++;
        }
      }
      const corridor = open <= 4;
      if (corridor && ctx.rng.chance(0.72)) continue;

      const clump = n.fbm((x + ox) * 0.11, (y + oy) * 0.11, 3) * 0.5 + 0.5;
      const touchesWall =
        !walkable(ctx, x - 1, y) || !walkable(ctx, x + 1, y) || !walkable(ctx, x, y - 1) || !walkable(ctx, x, y + 1);
      // Clutter still gathers against walls, because that is where it gathers.
      // Open ground no longer gets nothing, though — it gets the base rate, and
      // a second noise field so the middle of a big room is not a uniform
      // sprinkle.
      const wallHug = touchesWall ? 2.0 : 1;
      const drift = n.fbm((x + ox) * 0.045 + 30, (y + oy) * 0.045, 2) * 0.5 + 0.5;
      const density = baseDensity * Math.pow(clump, 2.0) * 3.2 * wallHug * (0.55 + drift * 0.9);
      if (!ctx.rng.chance(clamp(density, 0, 0.6))) continue;

      const kind = bossRoom
        ? pickWeighted(ctx, pool.filter((p) => !propDef(p.kind).blocks))
        : pickWeighted(ctx, pool);
      emit(ctx, x, y, kind, ctx.rng.range(0, Math.PI * 2), propDef(kind).interact);
    }
  }
}

/**
 * The detail layer.
 *
 * Runs after the clutter and takes what is left, which is most of the floor.
 * Reported as "nothing to them but empty rooms and halls", and the measurement
 * agreed: a floor carried about fourteen props per hundred walkable tiles, so
 * six tiles in seven had nothing on them at all.
 *
 * None of this blocks, collides or casts a shadow, so it can be laid down at a
 * rate that would be unplayable for clutter. It clumps on noise rather than
 * spreading evenly — an even sprinkle reads as wallpaper, and what a real floor
 * has is drifts and bare patches between them.
 */
function placeGroundDetail(ctx: PlaceCtx): void {
  const pool = ctx.art.detailProps;
  if (!pool || pool.length === 0) return;
  const n = ctx.noise;
  const ox = ctx.rng.range(0, 200);
  const oy = ctx.rng.range(0, 200);

  for (let y = 1; y < ctx.h - 1; y++) {
    for (let x = 1; x < ctx.w - 1; x++) {
      const v = tile(ctx, x, y);
      if (v !== T_FLOOR && v !== T_RUBBLE) continue;
      if (isOccupied(ctx, x, y)) continue;
      const room = roomAtTile(ctx, x, y);
      // The landing you arrive on stays clean, so the way out is never lost in
      // grit on the first frame of a floor.
      if (room && room.kind === 'entry') continue;

      // Drifts: a broad field decides where detail gathers, a finer one breaks
      // its edges. Both are needed — one alone gives either uniform fuzz or
      // hard-edged blobs.
      const drift = n.fbm((x + ox) * 0.052, (y + oy) * 0.052, 3) * 0.5 + 0.5;
      const grain = n.fbm((x + ox) * 0.21 + 90, (y + oy) * 0.21, 2) * 0.5 + 0.5;
      const touchesWall =
        !walkable(ctx, x - 1, y) || !walkable(ctx, x + 1, y) || !walkable(ctx, x, y - 1) || !walkable(ctx, x, y + 1);
      // Grit piles up against walls and in corners exactly like real grit.
      const edge = touchesWall ? 1.7 : 1;
      const density = 0.5 * Math.pow(drift, 1.5) * (0.45 + grain * 1.1) * edge;
      if (!ctx.rng.chance(clamp(density, 0, 0.78))) continue;

      const kind = pickWeighted(ctx, pool);
      emit(ctx, x, y, kind, ctx.rng.range(0, Math.PI * 2));
    }
  }
}

function placeLiquidProps(ctx: PlaceCtx): void {
  const pool = ctx.art.props.filter((p) => propDef(p.kind).placement === 'liquid');
  if (pool.length === 0) return;
  for (let y = 1; y < ctx.h - 1; y++) {
    for (let x = 1; x < ctx.w - 1; x++) {
      if (tile(ctx, x, y) !== T_WATER) continue;
      if (isOccupied(ctx, x, y)) continue;
      if (!ctx.rng.chance(0.12)) continue;
      const kind = pickWeighted(ctx, pool);
      emit(ctx, x, y, kind, ctx.rng.range(0, Math.PI * 2));
    }
  }
}

function pickWeighted(ctx: PlaceCtx, pool: Array<{ kind: string; weight: number }>): string {
  if (pool.length === 0) return 'rubblePile';
  return ctx.rng.weighted(pool, (p) => p.weight).kind;
}

// --- connectivity guard ----------------------------------------------------

/**
 * Treats blocking props as walls and verifies the level is still one piece.
 * Anything that cut it off gets retracted. This is the backstop that lets the
 * placement rules above be aggressive without risking a soft-lock.
 */
function enforceConnectivity(ctx: PlaceCtx): void {
  const total = ctx.w * ctx.h;
  for (let pass = 0; pass < 4; pass++) {
    const seen = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    const start = ctx.level.entry.y * ctx.w + ctx.level.entry.x;
    if (!isWalkableValue(ctx.tiles[start])) return;
    seen[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % ctx.w;
      const cy = (c / ctx.w) | 0;
      const step = (nb: number): void => {
        if (seen[nb] || ctx.blocked[nb] || !isWalkableValue(ctx.tiles[nb])) return;
        seen[nb] = 1;
        queue[tail++] = nb;
      };
      if (cx > 0) step(c - 1);
      if (cx < ctx.w - 1) step(c + 1);
      if (cy > 0) step(c - ctx.w);
      if (cy < ctx.h - 1) step(c + ctx.w);
    }

    // Any walkable, unblocked tile we did not reach is stranded.
    const stranded: number[] = [];
    for (let i = 0; i < total; i++) {
      if (seen[i] || ctx.blocked[i]) continue;
      if (isWalkableValue(ctx.tiles[i])) stranded.push(i);
    }
    if (stranded.length === 0) return;

    // Remove blocking props that touch the stranded region.
    const strandedSet = new Set(stranded);
    let removed = 0;
    for (let i = ctx.out.length - 1; i >= 0; i--) {
      const p = ctx.out[i];
      const idx = p.y * ctx.w + p.x;
      if (!ctx.blocked[idx]) continue;
      const touches =
        strandedSet.has(idx - 1) ||
        strandedSet.has(idx + 1) ||
        strandedSet.has(idx - ctx.w) ||
        strandedSet.has(idx + ctx.w);
      if (!touches) continue;
      ctx.blocked[idx] = 0;
      ctx.out.splice(i, 1);
      removed++;
    }
    if (removed === 0) {
      // Nothing left to retract: the stranded region was already unreachable in
      // the raw layout, which the layout auditor reports separately.
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface PropLayer {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Additive/transparent layers are drawn without shadows and after opaques. */
  ghost?: boolean;
}

export interface PropTemplate {
  kind: string;
  variant: number;
  layers: PropLayer[];
  light: PropLightSpec | null;
  /** Emissive core geometry, instanced separately so bloom catches it. */
  flame: { geometry: THREE.BufferGeometry; material: THREE.Material; y: number; forward: number } | null;
  radius: number;
  blocks: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
}

const templateCache = new Map<string, PropTemplate>();
const materialCache = new Map<string, THREE.Material>();
const ownedGeometries: THREE.BufferGeometry[] = [];
const ownedMaterials: THREE.Material[] = [];

/** Cached, shared material lookup that survives a bad palette key. */
function mat(key: string, opts?: Record<string, unknown>): THREE.Material {
  const ck = `${key}|${JSON.stringify(opts ?? {})}`;
  const hit = materialCache.get(ck);
  if (hit) return hit;
  let m: THREE.Material;
  try {
    m = surface(key, opts as never);
  } catch {
    m = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.9 });
    ownedMaterials.push(m);
  }
  materialCache.set(ck, m);
  return m;
}

function emiss(color: number, intensity = 2): THREE.Material {
  const ck = `emis|${color}|${intensity}`;
  const hit = materialCache.get(ck);
  if (hit) return hit;
  let m: THREE.Material;
  try {
    m = emissiveMaterial(color, intensity);
  } catch {
    m = new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: new THREE.Color(color),
      emissiveIntensity: intensity,
      roughness: 1,
    });
    ownedMaterials.push(m);
  }
  materialCache.set(ck, m);
  return m;
}

function ghostMat(color: number, opacity: number, additive: boolean): THREE.Material {
  const ck = `ghost|${color}|${opacity}|${additive}`;
  const hit = materialCache.get(ck);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  materialCache.set(ck, m);
  ownedMaterials.push(m);
  return m;
}

// --- geometry helpers ------------------------------------------------------

/**
 * Normalises a geometry to exactly position/normal/uv + index so merging can
 * never fail on a mismatched attribute set.
 */
function sanitize(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  if (!pos) return geo;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (!geo.getAttribute('uv')) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
  }
  if (!geo.index) {
    const n = pos.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  geo.clearGroups();
  return geo;
}

function own<T extends THREE.BufferGeometry>(g: T): T {
  ownedGeometries.push(g);
  return g;
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = list.map(sanitize);
  if (clean.length === 1) return own(clean[0]);
  try {
    const m = mergeGeometries(clean);
    if (m) {
      for (const g of clean) g.dispose();
      return own(sanitize(m));
    }
  } catch {
    /* fall through */
  }
  // Merging failed — keep the first and drop the rest rather than leak.
  for (let i = 1; i < clean.length; i++) clean[i].dispose();
  return own(clean[0]);
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
}

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function cyl(rt: number, rb: number, h: number, seg = 10, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  g.translate(x, y + h / 2, z);
  return g;
}

function cone(r: number, h: number, seg = 8, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(x, y + h / 2, z);
  return g;
}

function sphere(r: number, x = 0, y = 0, z = 0, seg = 10): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1));
  g.translate(x, y, z);
  return g;
}

function octa(r: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(r, 0);
  g.translate(x, y, z);
  return g;
}

function plane(w: number, h: number, x = 0, y = 0, z = 0, ry = 0, rx = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 1, 1);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function safeLathe(profile: Array<[number, number]>, segments = 12): THREE.BufferGeometry {
  try {
    const g = lathe(profile, segments);
    if (g && g.getAttribute('position')) return g;
  } catch {
    /* fall through */
  }
  // Fallback: stack cylinders through the profile.
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    const h = Math.abs(y1 - y0);
    if (h < 1e-4) continue;
    const g = new THREE.CylinderGeometry(Math.max(0.01, r1), Math.max(0.01, r0), h, segments, 1, true);
    g.translate(0, Math.min(y0, y1) + h / 2, 0);
    parts.push(g);
  }
  if (parts.length === 0) return new THREE.CylinderGeometry(0.2, 0.2, 0.4, segments);
  const clean = parts.map(sanitize);
  try {
    const m = mergeGeometries(clean);
    if (m) return m;
  } catch {
    /* ignore */
  }
  return clean[0];
}

function safeRock(w: number, h: number, d: number, rng: Rng, rough = 0.5): THREE.BufferGeometry {
  try {
    const g = stoneBlock(w, h, d, rng, rough);
    if (g && g.getAttribute('position')) return g;
  } catch {
    /* fall through */
  }
  return new THREE.BoxGeometry(w, h, d);
}

function safeDisplace(g: THREE.BufferGeometry, rng: Rng, amount: number, scale: number): THREE.BufferGeometry {
  try {
    const out = displace(g, rng, amount, scale);
    if (out && out.getAttribute('position')) return out;
  } catch {
    /* fall through */
  }
  return g;
}

// --- archetypes ------------------------------------------------------------

interface BuildCtx {
  art: BiomeArt;
  rng: Rng;
  variant: number;
}

type Builder = (b: BuildCtx) => { layers: PropLayer[]; flame?: PropTemplate['flame'] };

/** A wall torch: bracket, haft, cup, and a separately-instanced emissive flame. */
function buildTorch(b: BuildCtx, opts: { metal: string; flameColor: number; style: 'torch' | 'sconce' | 'lantern' | 'shroom' | 'void' | 'egg' }): ReturnType<Builder> {
  const { rng } = b;
  const parts: THREE.BufferGeometry[] = [];
  const metalKey = opts.metal;

  if (opts.style === 'shroom') {
    // Bioluminescent shelf fungus — no metal at all.
    const caps: THREE.BufferGeometry[] = [];
    const n = 3 + b.variant;
    for (let i = 0; i < n; i++) {
      const r = rng.range(0.1, 0.22);
      const s = sphere(r, rng.range(-0.22, 0.22), 0.9 + rng.range(-0.35, 0.45), rng.range(-0.06, 0.06), 8);
      s.scale(1, 0.55, 1);
      caps.push(s);
    }
    return {
      layers: [{ geometry: merge(caps), material: emiss(0x2affc0, 2.4) }],
      flame: {
        geometry: own(sanitize(sphere(0.16, 0, 0, 0, 8))),
        material: emiss(0x53f0c8, 3.2),
        y: 1.05,
        forward: 0.05,
      },
    };
  }

  if (opts.style === 'egg') {
    const sacs: THREE.BufferGeometry[] = [];
    const n = 2 + b.variant;
    for (let i = 0; i < n; i++) {
      const r = rng.range(0.16, 0.3);
      const s = sphere(r, rng.range(-0.25, 0.25), 0.7 + i * 0.35 + rng.range(-0.1, 0.1), rng.range(-0.05, 0.1), 8);
      s.scale(1, 1.25, 1);
      sacs.push(s);
    }
    return {
      layers: [{ geometry: merge(sacs), material: mat('flesh.chitin', { roughness: 0.35 }) }],
      flame: {
        geometry: own(sanitize(sphere(0.2, 0, 0, 0, 8))),
        material: emiss(0xffc23c, 2.6),
        y: 1.15,
        forward: 0.02,
      },
    };
  }

  // Mount plate against the wall.
  parts.push(boxAt(0.34, 0.5, 0.09, 0, 1.62, -0.06));
  // Bracket arm angling out and up.
  const arm = new THREE.BoxGeometry(0.075, 0.5, 0.075);
  arm.rotateX(-0.55);
  arm.translate(0, 1.78, 0.14);
  parts.push(arm);

  if (opts.style === 'lantern') {
    // Cage: four uprights and a cap.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      parts.push(boxAt(0.035, 0.42, 0.035, Math.cos(a) * 0.14, 2.06, 0.26 + Math.sin(a) * 0.14));
    }
    parts.push(cyl(0.02, 0.2, 0.14, 8, 0, 2.28, 0.26));
    parts.push(boxAt(0.34, 0.04, 0.34, 0, 1.84, 0.26));
  } else if (opts.style === 'sconce') {
    parts.push(cyl(0.19, 0.1, 0.24, 10, 0, 1.94, 0.24));
    parts.push(cyl(0.21, 0.21, 0.03, 10, 0, 2.18, 0.24));
    // Rivet detail.
    for (let i = 0; i < 3; i++) parts.push(sphere(0.032, 0, 1.5 + i * 0.14, -0.09, 6));
  } else if (opts.style === 'void') {
    parts.push(octa(0.16, 0, 2.02, 0.24));
    parts.push(cyl(0.05, 0.09, 0.3, 6, 0, 1.72, 0.2));
  } else {
    // Classic haft + cup.
    const haft = new THREE.CylinderGeometry(0.05, 0.06, 0.62, 7);
    haft.rotateX(-0.35);
    haft.translate(0, 2.0, 0.2);
    parts.push(haft);
    parts.push(safeLathe(
      [
        [0.02, 0],
        [0.14, 0.03],
        [0.17, 0.14],
        [0.13, 0.2],
      ],
      10,
    ).translate(0, 2.16, 0.28));
  }

  const flameGeo = opts.style === 'void' ? octa(0.17) : sphere(0.16, 0, 0, 0, 8);
  flameGeo.scale(1, 1.6, 1);

  return {
    layers: [{ geometry: merge(parts), material: mat(metalKey, { roughness: 0.55, metalness: 0.8 }) }],
    flame: {
      geometry: own(sanitize(flameGeo)),
      material: emiss(opts.flameColor, 3.4),
      y: opts.style === 'lantern' ? 2.06 : 2.28,
      forward: 0.26,
    },
  };
}

function buildBrazier(b: BuildCtx): ReturnType<Builder> {
  const parts: THREE.BufferGeometry[] = [];
  // Tripod legs.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.BoxGeometry(0.075, 1.0, 0.075);
    leg.rotateZ(Math.cos(a) * 0.2);
    leg.rotateX(Math.sin(a) * 0.2);
    leg.translate(Math.cos(a) * 0.22, 0.5, Math.sin(a) * 0.22);
    parts.push(leg);
  }
  parts.push(
    safeLathe(
      [
        [0.06, 0.95],
        [0.3, 1.02],
        [0.42, 1.24],
        [0.44, 1.42],
        [0.38, 1.44],
        [0.36, 1.26],
        [0.24, 1.06],
      ],
      14,
    ),
  );
  const coals = sphere(0.3, 0, 1.3, 0, 10);
  coals.scale(1, 0.42, 1);

  return {
    layers: [
      { geometry: merge(parts), material: mat(b.art.trim.palette, { roughness: 0.5, metalness: 0.85 }) },
      { geometry: own(sanitize(coals)), material: emiss(b.art.lightColor, 2.0) },
    ],
    flame: {
      geometry: own(sanitize((() => {
        const g = sphere(0.28, 0, 0, 0, 9);
        g.scale(1, 1.5, 1);
        return g;
      })())),
      material: emiss(b.art.lightColor, 3.6),
      y: 1.52,
      forward: 0,
    },
  };
}

function buildPillar(b: BuildCtx, style: string): ReturnType<Builder> {
  const { art, rng } = b;
  const h = art.wallHeight;
  const parts: THREE.BufferGeometry[] = [];
  const trimParts: THREE.BufferGeometry[] = [];

  if (style === 'pillarBroken') {
    const th = rng.range(h * 0.3, h * 0.75);
    parts.push(safeRock(0.8, th, 0.8, rng, 0.55));
    (parts[0] as THREE.BufferGeometry).translate(0, th / 2, 0);
    trimParts.push(boxAt(1.0, 0.16, 1.0, 0, 0.08, 0));
    return {
      layers: [
        { geometry: merge(parts), material: mat(art.walls[0].palette, { repeat: 1 }) },
        { geometry: merge(trimParts), material: mat(art.baseTrim, {}) },
      ],
    };
  }

  if (style === 'stalacColumn' || style === 'chitinColumn') {
    const bot = cone(0.55, h * 0.55, 9, 0, 0);
    const top = cone(0.5, h * 0.5, 9, 0, 0);
    top.rotateZ(Math.PI);
    top.translate(0, h, 0);
    const g = merge([bot, top]);
    const key = style === 'chitinColumn' ? 'flesh.chitin' : art.walls[0].palette;
    return { layers: [{ geometry: safeDisplace(g, rng, 0.09, 2.4), material: mat(key, { repeat: 0.8 }) }] };
  }

  // Masonry pillar: base, shaft, capital.
  trimParts.push(boxAt(1.05, 0.22, 1.05, 0, 0.11, 0));
  trimParts.push(boxAt(0.92, 0.14, 0.92, 0, 0.29, 0));
  trimParts.push(boxAt(1.02, 0.2, 1.02, 0, h - 0.1, 0));
  trimParts.push(boxAt(0.9, 0.14, 0.9, 0, h - 0.27, 0));

  const shaftH = h - 0.72;
  if (style === 'pillarFluted') {
    parts.push(cyl(0.34, 0.38, shaftH, 16, 0, 0.36));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const f = new THREE.CylinderGeometry(0.055, 0.055, shaftH, 5);
      f.translate(Math.cos(a) * 0.36, 0.36 + shaftH / 2, Math.sin(a) * 0.36);
      parts.push(f);
    }
  } else if (style === 'pillarIce') {
    const g = cyl(0.3, 0.4, shaftH, 7, 0, 0.36);
    parts.push(safeDisplace(g, rng, 0.06, 3));
  } else if (style === 'pillarVoid') {
    parts.push(cyl(0.26, 0.4, shaftH, 6, 0, 0.36));
    for (let i = 0; i < 3; i++) {
      const s = octa(0.13, 0, 0.9 + i * (shaftH / 3.2), 0.34);
      parts.push(s);
    }
  } else if (style === 'pillarIron') {
    parts.push(box(0.62, shaftH, 0.62, 0, 0.36));
    for (let i = 0; i < 4; i++) parts.push(boxAt(0.72, 0.1, 0.72, 0, 0.7 + i * (shaftH / 4.4), 0));
  } else {
    // Gothic: clustered shafts.
    parts.push(box(0.5, shaftH, 0.5, 0, 0.36, 0, Math.PI / 4));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      parts.push(cyl(0.13, 0.15, shaftH, 6, Math.cos(a) * 0.28, 0.36, Math.sin(a) * 0.28));
    }
  }

  return {
    layers: [
      { geometry: merge(parts), material: mat(art.walls[0].palette, { repeat: 1.1 }) },
      { geometry: merge(trimParts), material: mat(art.baseTrim, { repeat: 1 }) },
    ],
  };
}

function buildSarcophagus(b: BuildCtx): ReturnType<Builder> {
  const { rng, variant } = b;
  const body: THREE.BufferGeometry[] = [];
  const lid: THREE.BufferGeometry[] = [];
  body.push(box(1.5, 0.62, 0.82, 0, 0));
  body.push(boxAt(1.62, 0.12, 0.94, 0, 0.06, 0));
  // Lid, sometimes shoved aside — the crypt has been opened before.
  const slide = variant === 2 ? rng.range(0.22, 0.42) : 0;
  const tilt = variant === 2 ? rng.range(-0.12, 0.12) : 0;
  const l = new THREE.BoxGeometry(1.54, 0.16, 0.86);
  l.rotateY(tilt);
  l.translate(slide, 0.7, 0);
  lid.push(l);
  if (variant !== 2) {
    // Carved effigy.
    lid.push(boxAt(0.22, 0.16, 0.18, 0.42, 0.86, 0));
    lid.push(boxAt(0.5, 0.12, 0.34, 0.02, 0.84, 0));
  }
  return {
    layers: [
      { geometry: merge(body), material: mat(b.art.walls[0].palette, { repeat: 1.4 }) },
      { geometry: merge(lid), material: mat(b.art.floors[0].palette, { repeat: 1.4, tint: 0xb8b4ac }) },
    ],
  };
}

function buildCluster(
  b: BuildCtx,
  opts: {
    count: [number, number];
    size: [number, number];
    palette: string;
    shape: 'rock' | 'sphere' | 'cone' | 'octa' | 'bone';
    spread: number;
    emissive?: number;
    displaceAmt?: number;
  },
): ReturnType<Builder> {
  const { rng } = b;
  const n = rng.int(opts.count[0], opts.count[1]);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const s = rng.range(opts.size[0], opts.size[1]);
    const px = rng.range(-opts.spread, opts.spread);
    const pz = rng.range(-opts.spread, opts.spread);
    let g: THREE.BufferGeometry;
    switch (opts.shape) {
      case 'rock': {
        g = safeRock(s, s * rng.range(0.6, 1.1), s, rng, 0.6);
        g.rotateY(rng.range(0, 6.28));
        g.translate(px, s * 0.4, pz);
        break;
      }
      case 'sphere': {
        g = sphere(s * 0.5, px, s * 0.4, pz, 8);
        g.scale(1, rng.range(0.6, 1.2), 1);
        break;
      }
      case 'cone': {
        g = cone(s * 0.4, s * rng.range(1.2, 2.6), 7, px, 0, pz);
        g.rotateZ(rng.range(-0.16, 0.16));
        break;
      }
      case 'octa': {
        g = octa(s * 0.5, px, s * 0.5, pz);
        g.scale(rng.range(0.5, 0.9), rng.range(1.2, 2.4), rng.range(0.5, 0.9));
        g.rotateY(rng.range(0, 6.28));
        g.rotateZ(rng.range(-0.3, 0.3));
        break;
      }
      default: {
        // Bone: a shaft with knuckles at each end.
        const shaft = new THREE.CylinderGeometry(s * 0.09, s * 0.09, s, 6);
        shaft.rotateZ(Math.PI / 2 + rng.range(-0.4, 0.4));
        shaft.rotateY(rng.range(0, 6.28));
        shaft.translate(px, s * 0.14 + rng.range(0, 0.12), pz);
        g = shaft;
        break;
      }
    }
    parts.push(g);
  }
  let geo = merge(parts);
  if (opts.displaceAmt) geo = safeDisplace(geo, rng, opts.displaceAmt, 3);
  return {
    layers: [
      {
        geometry: geo,
        material: opts.emissive !== undefined ? emiss(opts.emissive, 1.8) : mat(opts.palette, { repeat: 1.4 }),
      },
    ],
  };
}

function buildContainer(b: BuildCtx, kind: 'barrel' | 'crate' | 'chest' | 'urn'): ReturnType<Builder> {
  const { rng, art } = b;
  if (kind === 'barrel') {
    const wood = safeLathe(
      [
        [0.3, 0],
        [0.38, 0.18],
        [0.4, 0.42],
        [0.38, 0.66],
        [0.3, 0.84],
      ],
      12,
    );
    const bands = merge([cyl(0.395, 0.395, 0.06, 12, 0, 0.16), cyl(0.395, 0.395, 0.06, 12, 0, 0.62)]);
    return {
      layers: [
        { geometry: own(sanitize(wood)), material: mat('wood.oak', { repeat: 1.6 }) },
        { geometry: bands, material: mat('metal.iron', { roughness: 0.6, metalness: 0.8 }) },
      ],
    };
  }
  if (kind === 'crate') {
    const parts = [box(0.74, 0.7, 0.74, 0, 0)];
    const frame: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      frame.push(boxAt(0.8, 0.09, 0.09, 0, 0.09, s * 0.37));
      frame.push(boxAt(0.8, 0.09, 0.09, 0, 0.61, s * 0.37));
      frame.push(boxAt(0.09, 0.09, 0.8, s * 0.37, 0.09, 0));
      frame.push(boxAt(0.09, 0.09, 0.8, s * 0.37, 0.61, 0));
    }
    return {
      layers: [
        { geometry: merge(parts), material: mat('wood.oak', { repeat: 1.4 }) },
        { geometry: merge(frame), material: mat('wood.oak', { repeat: 2, tint: 0x8a6a48 }) },
      ],
    };
  }
  if (kind === 'chest') {
    const wood: THREE.BufferGeometry[] = [box(0.94, 0.54, 0.62, 0, 0)];
    const dome = new THREE.CylinderGeometry(0.31, 0.31, 0.94, 12, 1, false, 0, Math.PI);
    dome.rotateZ(Math.PI / 2);
    dome.rotateY(Math.PI / 2);
    dome.translate(0, 0.54, 0);
    wood.push(dome);
    const metal: THREE.BufferGeometry[] = [];
    for (const s of [-0.3, 0.3]) metal.push(boxAt(0.07, 0.6, 0.66, s, 0.3, 0));
    metal.push(boxAt(0.16, 0.2, 0.1, 0, 0.5, 0.33));
    metal.push(boxAt(1.0, 0.07, 0.07, 0, 0.03, 0.3));
    return {
      layers: [
        { geometry: merge(wood), material: mat('wood.oak', { repeat: 1.2 }) },
        { geometry: merge(metal), material: mat('metal.bronze', { roughness: 0.35, metalness: 1 }) },
      ],
    };
  }
  // Urn.
  const profile: Array<[number, number]> = [
    [0.11, 0],
    [0.17, 0.06],
    [0.26, 0.24],
    [0.22, 0.44],
    [0.12, 0.52],
    [0.16, 0.58],
  ];
  const g = safeLathe(profile, 12);
  return {
    layers: [
      {
        geometry: own(sanitize(safeDisplace(g, rng, 0.012, 6))),
        material: mat(art.floors[0].palette, { repeat: 2.2, tint: 0xbfae94 }),
      },
    ],
  };
}

function buildStatue(b: BuildCtx): ReturnType<Builder> {
  const { rng, art } = b;
  const plinth: THREE.BufferGeometry[] = [
    boxAt(1.0, 0.2, 1.0, 0, 0.1, 0),
    boxAt(0.86, 0.5, 0.86, 0, 0.45, 0),
    boxAt(1.0, 0.12, 1.0, 0, 0.76, 0),
  ];
  const figure: THREE.BufferGeometry[] = [];
  const broken = b.variant === 2;
  const hipY = 0.82;
  figure.push(cyl(0.2, 0.26, 0.72, 8, 0, hipY));
  figure.push(cyl(0.24, 0.2, 0.62, 8, 0, hipY + 0.72));
  if (!broken) {
    figure.push(sphere(0.17, 0, hipY + 1.5, 0, 8));
    // Arms, one raised.
    const armA = new THREE.CylinderGeometry(0.07, 0.07, 0.62, 6);
    armA.rotateZ(0.8);
    armA.translate(0.3, hipY + 1.1, 0);
    figure.push(armA);
    const armB = new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6);
    armB.rotateZ(-0.25);
    armB.translate(-0.26, hipY + 1.0, 0);
    figure.push(armB);
  } else {
    figure.push(boxAt(0.3, 0.1, 0.3, rng.range(-0.05, 0.05), hipY + 1.36, 0));
  }
  // Cloak, a simple swept plane pair — cheap silhouette.
  const cloak = plane(0.62, 1.3, 0, hipY + 0.75, -0.16);
  cloak.scale(1, 1, 1);

  return {
    layers: [
      { geometry: merge(plinth), material: mat(art.baseTrim, { repeat: 1.2 }) },
      { geometry: merge([...figure, cloak]), material: mat(art.floors[0].palette, { repeat: 1.6, tint: 0xa8a49a }) },
    ],
  };
}

function buildAltar(b: BuildCtx): ReturnType<Builder> {
  const { art } = b;
  const stone: THREE.BufferGeometry[] = [
    boxAt(1.7, 0.18, 1.1, 0, 0.09, 0),
    boxAt(1.3, 0.72, 0.78, 0, 0.54, 0),
    boxAt(1.8, 0.16, 1.2, 0, 0.98, 0),
  ];
  const trim: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) trim.push(boxAt(0.12, 0.7, 0.12, s * 0.72, 0.55, 0.48));
  const glyph = plane(1.1, 0.6, 0, 1.07, 0, 0, -Math.PI / 2);
  return {
    layers: [
      { geometry: merge(stone), material: mat(art.walls[0].palette, { repeat: 1.1 }) },
      { geometry: merge(trim), material: mat(art.trim.palette, { roughness: 0.4, metalness: 0.9 }) },
      { geometry: own(sanitize(glyph)), material: emiss(art.veinColor || art.lightColor, 1.4) },
    ],
  };
}

function buildShrine(b: BuildCtx): ReturnType<Builder> {
  const { art } = b;
  const stone: THREE.BufferGeometry[] = [
    boxAt(1.2, 0.22, 1.2, 0, 0.11, 0),
    cyl(0.34, 0.44, 1.0, 8, 0, 0.22),
  ];
  const bowl = safeLathe(
    [
      [0.1, 1.22],
      [0.4, 1.3],
      [0.46, 1.52],
      [0.4, 1.54],
      [0.36, 1.34],
    ],
    14,
  );
  const core = octa(0.22, 0, 1.78, 0);
  const ring = new THREE.TorusGeometry(0.4, 0.035, 6, 18);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 1.78, 0);
  return {
    layers: [
      { geometry: merge(stone), material: mat(art.walls[0].palette, { repeat: 1.2 }) },
      { geometry: own(sanitize(bowl)), material: mat(art.trim.palette, { roughness: 0.35, metalness: 0.9 }) },
      { geometry: merge([core, ring]), material: emiss(0x9fd8ff, 3.0) },
    ],
    flame: {
      geometry: own(sanitize(sphere(0.24, 0, 0, 0, 9))),
      material: emiss(0x9fd8ff, 2.6),
      y: 1.5,
      forward: 0,
    },
  };
}

function buildFlatWall(
  b: BuildCtx,
  kind: 'banner' | 'webSheet' | 'wallRelief' | 'chain' | 'icicleRow' | 'rootTangle' | 'wallSkull' | 'lever' | 'valveWheel' | 'pipeRun' | 'bookcase',
): ReturnType<Builder> {
  const { rng, art } = b;
  switch (kind) {
    case 'banner': {
      const cloth = plane(0.85, 2.1, 0, 1.55, 0.02);
      const rod = cyl(0.045, 0.045, 1.0, 6, 0, 0, 0.02);
      rod.rotateZ(Math.PI / 2);
      rod.translate(0, 2.62, 0.02);
      return {
        layers: [
          { geometry: own(sanitize(cloth)), material: mat('cloth.banner', { repeat: 1, side: THREE.DoubleSide }) },
          { geometry: own(sanitize(rod)), material: mat('wood.oak', {}) },
        ],
      };
    }
    case 'webSheet': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i++) {
        const p = plane(rng.range(0.9, 1.6), rng.range(0.9, 1.8), rng.range(-0.2, 0.2), rng.range(1.2, 2.4), rng.range(0, 0.3));
        p.rotateZ(rng.range(-0.4, 0.4));
        parts.push(p);
      }
      return { layers: [{ geometry: merge(parts), material: ghostMat(0xd8d4e8, 0.3, false), ghost: true }] };
    }
    case 'wallRelief': {
      const parts: THREE.BufferGeometry[] = [boxAt(1.3, 1.7, 0.1, 0, 1.5, 0)];
      for (let i = 0; i < 5; i++) {
        parts.push(boxAt(rng.range(0.15, 0.5), rng.range(0.15, 0.6), 0.07, rng.range(-0.42, 0.42), 1.0 + rng.range(0, 1.1), 0.06));
      }
      return { layers: [{ geometry: merge(parts), material: mat(art.walls[0].palette, { repeat: 1.6 }) }] };
    }
    case 'chain': {
      const parts: THREE.BufferGeometry[] = [];
      const len = rng.int(6, 12);
      for (let i = 0; i < len; i++) {
        const t = new THREE.TorusGeometry(0.055, 0.018, 4, 8);
        if (i % 2 === 1) t.rotateY(Math.PI / 2);
        t.rotateX(Math.PI / 2);
        t.translate(rng.range(-0.02, 0.02), 2.7 - i * 0.095, 0.06);
        parts.push(t);
      }
      return { layers: [{ geometry: merge(parts), material: mat('metal.iron', { roughness: 0.7, metalness: 0.9 }) }] };
    }
    case 'icicleRow': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < rng.int(4, 8); i++) {
        const h = rng.range(0.3, 1.1);
        const c = cone(rng.range(0.05, 0.11), h, 5, rng.range(-0.45, 0.45), 0, rng.range(-0.05, 0.1));
        c.rotateZ(Math.PI);
        c.translate(0, 2.9, 0);
        parts.push(c);
      }
      return { layers: [{ geometry: merge(parts), material: mat('crystal.ice', { roughness: 0.08 }) }] };
    }
    case 'rootTangle': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < rng.int(5, 9); i++) {
        const g = new THREE.CylinderGeometry(0.035, 0.055, rng.range(0.7, 1.8), 5);
        g.rotateZ(rng.range(-0.9, 0.9));
        g.rotateX(rng.range(-0.3, 0.3));
        g.translate(rng.range(-0.45, 0.45), rng.range(0.6, 2.4), rng.range(0, 0.14));
        parts.push(g);
      }
      return { layers: [{ geometry: merge(parts), material: mat('wood.rotted', { repeat: 2 }) }] };
    }
    case 'wallSkull': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < rng.int(1, 3); i++) {
        const s = sphere(0.14, rng.range(-0.3, 0.3), rng.range(1.2, 2.0), 0.08, 7);
        s.scale(1, 1.1, 0.9);
        parts.push(s);
        parts.push(boxAt(0.17, 0.09, 0.11, s.boundingBox ? 0 : 0, 1.1, 0.06));
      }
      return { layers: [{ geometry: merge(parts), material: mat(art.floors[0].palette, { tint: 0xc8bfa6 }) }] };
    }
    case 'lever': {
      const parts: THREE.BufferGeometry[] = [boxAt(0.3, 0.44, 0.12, 0, 1.3, 0)];
      const arm = new THREE.CylinderGeometry(0.035, 0.045, 0.5, 6);
      arm.rotateX(-0.7);
      arm.translate(0, 1.5, 0.14);
      parts.push(arm);
      parts.push(sphere(0.075, 0, 1.7, 0.28, 7));
      return { layers: [{ geometry: merge(parts), material: mat('metal.iron', { roughness: 0.5, metalness: 0.9 }) }] };
    }
    case 'valveWheel': {
      const ring = new THREE.TorusGeometry(0.28, 0.045, 6, 14);
      ring.translate(0, 1.5, 0.1);
      const spokes: THREE.BufferGeometry[] = [ring];
      for (let i = 0; i < 4; i++) {
        const s = new THREE.BoxGeometry(0.5, 0.045, 0.045);
        s.rotateZ((i / 4) * Math.PI);
        s.translate(0, 1.5, 0.1);
        spokes.push(s);
      }
      return { layers: [{ geometry: merge(spokes), material: mat('metal.rust', { roughness: 0.75, metalness: 0.7 }) }] };
    }
    case 'pipeRun': {
      const parts: THREE.BufferGeometry[] = [];
      const yLevels = [0.7, 1.5, 2.3];
      for (let i = 0; i < rng.int(1, 3); i++) {
        const y = yLevels[i];
        const p = new THREE.CylinderGeometry(0.1, 0.1, 1.02, 8);
        p.rotateZ(Math.PI / 2);
        p.translate(0, y, 0.14);
        parts.push(p);
        parts.push(cyl(0.13, 0.13, 0.1, 8, 0.3, y - 0.05, 0.14));
      }
      return { layers: [{ geometry: merge(parts), material: mat('metal.rust', { roughness: 0.8, metalness: 0.7 }) }] };
    }
    default: {
      // Bookcase.
      const frame: THREE.BufferGeometry[] = [
        boxAt(1.1, 2.0, 0.1, 0, 1.0, -0.14),
        boxAt(0.1, 2.0, 0.36, -0.5, 1.0, 0.02),
        boxAt(0.1, 2.0, 0.36, 0.5, 1.0, 0.02),
      ];
      const books: THREE.BufferGeometry[] = [];
      for (let s = 0; s < 4; s++) {
        const y = 0.28 + s * 0.48;
        frame.push(boxAt(1.02, 0.06, 0.34, 0, y, 0.02));
        let x = -0.44;
        while (x < 0.42) {
          const bw = rng.range(0.04, 0.09);
          const bh = rng.range(0.2, 0.34);
          if (rng.chance(0.18)) {
            x += bw + 0.02;
            continue;
          }
          books.push(boxAt(bw, bh, 0.24, x, y + 0.03 + bh / 2, 0.03));
          x += bw + 0.012;
        }
      }
      return {
        layers: [
          { geometry: merge(frame), material: mat('wood.oak', { repeat: 1.2 }) },
          { geometry: merge(books), material: mat('cloth.linen', { repeat: 3, tint: 0x8a6a52 }) },
        ],
      };
    }
  }
}

function buildFoundry(b: BuildCtx, kind: 'anvil' | 'gear' | 'pipeCluster' | 'ingotStack' | 'forge' | 'smeltingVat'): ReturnType<Builder> {
  const { rng, art } = b;
  if (kind === 'anvil') {
    const stump = cyl(0.3, 0.36, 0.5, 8, 0, 0);
    const body: THREE.BufferGeometry[] = [
      boxAt(0.5, 0.14, 0.28, 0, 0.57, 0),
      boxAt(0.24, 0.2, 0.2, 0, 0.74, 0),
      boxAt(0.72, 0.16, 0.3, 0.04, 0.92, 0),
    ];
    const horn = cone(0.13, 0.34, 7, 0.46, 0.92, 0);
    horn.rotateZ(-Math.PI / 2);
    horn.translate(0.1, 0, 0);
    body.push(horn);
    return {
      layers: [
        { geometry: own(sanitize(stump)), material: mat('wood.oak', { repeat: 1.4 }) },
        { geometry: merge(body), material: mat('metal.iron', { roughness: 0.42, metalness: 0.95 }) },
      ],
    };
  }
  if (kind === 'gear') {
    const teeth = rng.int(10, 16);
    const r = rng.range(0.5, 0.85);
    const parts: THREE.BufferGeometry[] = [cyl(r, r, 0.13, 20, 0, 0.05)];
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const t = new THREE.BoxGeometry(0.16, 0.13, 0.2);
      t.rotateY(-a);
      t.translate(Math.cos(a) * (r + 0.08), 0.115, Math.sin(a) * (r + 0.08));
      parts.push(t);
    }
    const g = merge(parts);
    g.rotateX(rng.chance(0.5) ? Math.PI / 2.3 : 0);
    return { layers: [{ geometry: g, material: mat('metal.rust', { roughness: 0.7, metalness: 0.85 }) }] };
  }
  if (kind === 'pipeCluster') {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < rng.int(3, 5); i++) {
      const h = rng.range(1.2, 2.8);
      const rr = rng.range(0.09, 0.17);
      parts.push(cyl(rr, rr, h, 8, rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3)));
    }
    parts.push(cyl(0.42, 0.42, 0.14, 10, 0, 0));
    return { layers: [{ geometry: merge(parts), material: mat('metal.rust', { roughness: 0.75, metalness: 0.8 }) }] };
  }
  if (kind === 'ingotStack') {
    const parts: THREE.BufferGeometry[] = [];
    const rows = rng.int(2, 4);
    for (let r2 = 0; r2 < rows; r2++) {
      const n = rows - r2;
      for (let i = 0; i < n; i++) {
        parts.push(boxAt(0.42, 0.11, 0.18, (i - (n - 1) / 2) * 0.2, 0.06 + r2 * 0.115, 0));
      }
    }
    return { layers: [{ geometry: merge(parts), material: mat('metal.bronze', { roughness: 0.32, metalness: 1 }) }] };
  }
  if (kind === 'smeltingVat') {
    const shell = safeLathe(
      [
        [0.3, 0],
        [0.62, 0.12],
        [0.68, 0.9],
        [0.72, 1.06],
        [0.64, 1.08],
        [0.6, 0.92],
      ],
      16,
    );
    const molten = cyl(0.6, 0.6, 0.04, 16, 0, 0.98);
    return {
      layers: [
        { geometry: own(sanitize(shell)), material: mat('metal.iron', { roughness: 0.5, metalness: 0.95 }) },
        { geometry: own(sanitize(molten)), material: emiss(art.veinColor, 3.2) },
      ],
      flame: {
        geometry: own(sanitize((() => {
          const g = cyl(0.5, 0.5, 0.06, 14, 0, 0);
          return g;
        })())),
        material: emiss(art.veinColor, 2.4),
        y: 1.04,
        forward: 0,
      },
    };
  }
  // Forge: hearth with a chimney hood and a glowing coal bed.
  const stone: THREE.BufferGeometry[] = [
    boxAt(1.9, 0.9, 1.2, 0, 0.45, 0),
    boxAt(2.05, 0.14, 1.35, 0, 0.95, 0),
  ];
  const hood = new THREE.CylinderGeometry(0.28, 1.0, 1.1, 4, 1, true);
  hood.rotateY(Math.PI / 4);
  hood.translate(0, 1.8, -0.1);
  stone.push(hood);
  stone.push(cyl(0.3, 0.3, 1.1, 6, 0, 2.3, -0.1));
  const coals = boxAt(1.2, 0.1, 0.72, 0, 1.02, 0.05);
  return {
    layers: [
      { geometry: merge(stone), material: mat(art.walls[0].palette, { repeat: 1.2 }) },
      { geometry: own(sanitize(coals)), material: emiss(art.veinColor, 3.4) },
    ],
    flame: {
      geometry: own(sanitize((() => {
        const g = sphere(0.34, 0, 0, 0, 9);
        g.scale(1.6, 1, 1);
        return g;
      })())),
      material: emiss(art.lightColor, 3.0),
      y: 1.18,
      forward: 0.05,
    },
  };
}

function buildMisc(b: BuildCtx, kind: string): ReturnType<Builder> {
  const { rng, art } = b;
  switch (kind) {
    case 'fountain': {
      const basin = safeLathe(
        [
          [0.4, 0],
          [1.1, 0.1],
          [1.15, 0.5],
          [1.05, 0.54],
          [1.0, 0.16],
          [0.4, 0.12],
        ],
        18,
      );
      const column = merge([cyl(0.16, 0.24, 0.9, 10, 0, 0.12), safeLathe([[0.1, 1.0], [0.44, 1.1], [0.4, 1.24], [0.34, 1.14]], 14)]);
      const water = cyl(1.0, 1.0, 0.03, 18, 0, 0.4);
      return {
        layers: [
          { geometry: own(sanitize(basin)), material: mat(art.floors[0].palette, { repeat: 1.4 }) },
          { geometry: column, material: mat(art.trim.palette, { roughness: 0.35, metalness: 0.9 }) },
          { geometry: own(sanitize(water)), material: mat('stone.marble', { roughness: 0.05, metalness: 0.4, tint: 0x2a6a80 }) },
        ],
      };
    }
    case 'obelisk':
    case 'iceMonolith': {
      const h = rng.range(2.6, 3.8);
      const g = new THREE.CylinderGeometry(0.16, 0.4, h, 4);
      g.rotateY(Math.PI / 4);
      g.translate(0, h / 2, 0);
      const base = boxAt(0.95, 0.24, 0.95, 0, 0.12, 0);
      const key = kind === 'iceMonolith' ? 'crystal.ice' : art.walls[0].palette;
      const runes: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const p = plane(0.22, h * 0.5, Math.cos(a) * 0.3, h * 0.5, Math.sin(a) * 0.3, -a + Math.PI / 2);
        runes.push(p);
      }
      return {
        layers: [
          { geometry: merge([g, base]), material: mat(key, { repeat: 1, roughness: kind === 'iceMonolith' ? 0.1 : 0.8 }) },
          { geometry: merge(runes), material: emiss(art.veinColor || art.lightColor, 1.6) },
        ],
      };
    }
    case 'voidRift': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i++) {
        const p = plane(rng.range(0.8, 2.0), rng.range(1.6, 3.2), 0, 1.6, 0, (i / 3) * Math.PI);
        parts.push(p);
      }
      return {
        layers: [{ geometry: merge(parts), material: ghostMat(0xd040ff, 0.5, true), ghost: true }],
        flame: {
          geometry: own(sanitize(octa(0.3))),
          material: emiss(0xff3ce0, 3.6),
          y: 1.6,
          forward: 0,
        },
      };
    }
    case 'floatingStone': {
      const g = safeRock(rng.range(0.3, 0.7), rng.range(0.25, 0.5), rng.range(0.3, 0.7), rng, 0.7);
      g.translate(0, rng.range(1.2, 2.6), 0);
      return { layers: [{ geometry: own(sanitize(g)), material: mat('stone.obsidian', { repeat: 1.4 }) }] };
    }
    case 'runeStone': {
      const g = safeRock(0.6, rng.range(1.0, 1.6), 0.42, rng, 0.5);
      const h = rng.range(1.0, 1.6);
      g.translate(0, h / 2, 0);
      const glyphs = plane(0.4, h * 0.6, 0, h * 0.55, 0.23);
      return {
        layers: [
          { geometry: own(sanitize(g)), material: mat(art.walls[0].palette, { repeat: 1.4 }) },
          { geometry: own(sanitize(glyphs)), material: emiss(art.veinColor, 2.2) },
        ],
      };
    }
    case 'deadTree': {
      const parts: THREE.BufferGeometry[] = [];
      const trunkH = rng.range(2.0, 3.4);
      parts.push(cyl(0.1, 0.26, trunkH, 6, 0, 0));
      const branches = rng.int(3, 6);
      for (let i = 0; i < branches; i++) {
        const t = rng.range(0.45, 0.95);
        const a = rng.range(0, 6.28);
        const len = rng.range(0.6, 1.5);
        const br = new THREE.CylinderGeometry(0.03, 0.08, len, 5);
        br.rotateZ(rng.range(0.5, 1.2));
        br.rotateY(a);
        br.translate(Math.cos(a) * len * 0.3, trunkH * t + len * 0.3, Math.sin(a) * len * 0.3);
        parts.push(br);
      }
      return { layers: [{ geometry: merge(parts), material: mat('wood.rotted', { repeat: 1.6 }) }] };
    }
    case 'boneSpire': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < rng.int(3, 6); i++) {
        const h = rng.range(0.9, 2.2);
        const c = new THREE.CylinderGeometry(0.04, 0.11, h, 6);
        c.rotateZ(rng.range(-0.35, 0.35));
        c.translate(rng.range(-0.3, 0.3), h / 2, rng.range(-0.3, 0.3));
        parts.push(c);
      }
      return { layers: [{ geometry: merge(parts), material: mat(art.floors[0].palette, { tint: 0xd8cdb4 }) }] };
    }
    case 'frozenCorpse': {
      const body: THREE.BufferGeometry[] = [
        sphere(0.2, 0, 0.9, 0, 7),
        cyl(0.2, 0.24, 0.7, 7, 0, 0.2),
      ];
      const ice = sphere(0.5, 0, 0.6, 0, 9);
      ice.scale(0.9, 1.5, 0.9);
      return {
        layers: [
          { geometry: merge(body), material: mat('flesh.rotted', { repeat: 1.6 }) },
          { geometry: own(sanitize(ice)), material: mat('crystal.ice', { roughness: 0.06, transparent: true, opacity: 0.55 }) },
        ],
      };
    }
    case 'cocoon': {
      const g = sphere(0.34, 0, 0.95, 0, 9);
      g.scale(0.75, 1.7, 0.75);
      return { layers: [{ geometry: own(sanitize(safeDisplace(g, rng, 0.04, 5))), material: mat('cloth.linen', { repeat: 2, tint: 0xa89c8a }) }] };
    }
    case 'broodMound': {
      const parts: THREE.BufferGeometry[] = [];
      const base = sphere(1.0, 0, 0.1, 0, 12);
      base.scale(1, 0.6, 1);
      parts.push(base);
      const sacs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < rng.int(5, 9); i++) {
        const a = rng.range(0, 6.28);
        const d = rng.range(0.1, 0.7);
        const s = sphere(rng.range(0.14, 0.26), Math.cos(a) * d, rng.range(0.4, 0.8), Math.sin(a) * d, 8);
        sacs.push(s);
      }
      return {
        layers: [
          { geometry: merge(parts), material: mat('flesh.rotted', { repeat: 1.2 }) },
          { geometry: merge(sacs), material: emiss(0xffb02a, 1.6) },
        ],
      };
    }
    case 'fleshGrowth': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < rng.int(3, 6); i++) {
        const s = sphere(rng.range(0.12, 0.3), rng.range(-0.35, 0.35), rng.range(0.05, 0.35), rng.range(-0.35, 0.35), 7);
        parts.push(s);
      }
      return { layers: [{ geometry: safeDisplace(merge(parts), rng, 0.05, 6), material: mat('flesh.rotted', { repeat: 2 }) }] };
    }
    case 'webClump': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i++) {
        const p = plane(rng.range(0.7, 1.3), rng.range(0.7, 1.3), 0, rng.range(0.2, 0.9), 0, rng.range(0, 3.14), -Math.PI / 2.4);
        parts.push(p);
      }
      return { layers: [{ geometry: merge(parts), material: ghostMat(0xd8d4e8, 0.26, false), ghost: true }] };
    }
    case 'lilyPad': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < rng.int(2, 4); i++) {
        const c = new THREE.CircleGeometry(rng.range(0.2, 0.38), 9);
        c.rotateX(-Math.PI / 2);
        c.translate(rng.range(-0.35, 0.35), 0.04, rng.range(-0.35, 0.35));
        parts.push(c);
      }
      return { layers: [{ geometry: merge(parts), material: mat('earth.moss', { repeat: 2, side: THREE.DoubleSide }) }] };
    }
    case 'mushroomCluster': {
      const stalks: THREE.BufferGeometry[] = [];
      const caps: THREE.BufferGeometry[] = [];
      for (let i = 0; i < rng.int(3, 7); i++) {
        const h = rng.range(0.15, 0.5);
        const px = rng.range(-0.35, 0.35);
        const pz = rng.range(-0.35, 0.35);
        stalks.push(cyl(0.035, 0.05, h, 6, px, 0, pz));
        const c = sphere(rng.range(0.09, 0.18), px, h, pz, 8);
        c.scale(1, 0.6, 1);
        caps.push(c);
      }
      return {
        layers: [
          { geometry: merge(stalks), material: mat('flesh.rotted', { tint: 0xc8bfa8 }) },
          { geometry: merge(caps), material: emiss(0x53f0c8, 1.6) },
        ],
      };
    }
    case 'candleCluster': {
      const wax: THREE.BufferGeometry[] = [];
      let topY = 0;
      for (let i = 0; i < rng.int(3, 6); i++) {
        const h = rng.range(0.14, 0.34);
        topY = Math.max(topY, h);
        wax.push(cyl(0.035, 0.04, h, 6, rng.range(-0.18, 0.18), 0, rng.range(-0.18, 0.18)));
      }
      return {
        layers: [{ geometry: merge(wax), material: mat('cloth.linen', { tint: 0xe8dcc0 }) }],
        flame: {
          geometry: own(sanitize((() => {
            const g = sphere(0.055, 0, 0, 0, 6);
            g.scale(1, 1.8, 1);
            return g;
          })())),
          material: emiss(0xffb060, 3.2),
          y: topY + 0.06,
          forward: 0,
        },
      };
    }
    default: {
      const g = safeRock(0.5, 0.4, 0.5, rng, 0.6);
      g.translate(0, 0.2, 0);
      return { layers: [{ geometry: own(sanitize(g)), material: mat(art.floors[0].palette, { repeat: 1.5 }) }] };
    }
  }
}

// --- template dispatch -----------------------------------------------------

function build(kind: string, ctx: BuildCtx): ReturnType<Builder> {
  const art = ctx.art;
  switch (kind) {
    case 'torch':
      return buildTorch(ctx, { metal: 'metal.iron', flameColor: art.lightColor, style: 'torch' });
    case 'forgeSconce':
      return buildTorch(ctx, { metal: 'metal.bronze', flameColor: art.lightColor, style: 'sconce' });
    case 'templeLantern':
      return buildTorch(ctx, { metal: 'metal.gold', flameColor: art.lightColor, style: 'lantern' });
    case 'iceLantern':
      return buildTorch(ctx, { metal: 'metal.steel', flameColor: art.lightColor, style: 'lantern' });
    case 'voidFlame':
      return buildTorch(ctx, { metal: 'crystal.void', flameColor: art.lightColor, style: 'void' });
    case 'glowShroom':
      return buildTorch(ctx, { metal: 'flesh.rotted', flameColor: art.lightColor, style: 'shroom' });
    case 'eggSac':
      return buildTorch(ctx, { metal: 'flesh.chitin', flameColor: art.lightColor, style: 'egg' });
    case 'brazier':
      return buildBrazier(ctx);

    case 'pillarGothic':
    case 'pillarIron':
    case 'pillarFluted':
    case 'pillarIce':
    case 'pillarVoid':
    case 'pillarBroken':
    case 'stalacColumn':
    case 'chitinColumn':
      return buildPillar(ctx, kind);

    case 'sarcophagus':
      return buildSarcophagus(ctx);
    case 'statue':
      return buildStatue(ctx);
    case 'altar':
      return buildAltar(ctx);
    case 'shrine':
      return buildShrine(ctx);

    case 'barrel':
    case 'crate':
    case 'chest':
    case 'urn':
      return buildContainer(ctx, kind);

    case 'banner':
    case 'webSheet':
    case 'wallRelief':
    case 'chain':
    case 'icicleRow':
    case 'rootTangle':
    case 'wallSkull':
    case 'lever':
    case 'valveWheel':
    case 'pipeRun':
    case 'bookcase':
      return buildFlatWall(ctx, kind);

    case 'anvil':
    case 'gear':
    case 'pipeCluster':
    case 'ingotStack':
    case 'forge':
    case 'smeltingVat':
      return buildFoundry(ctx, kind);

    case 'bonepile':
      return buildCluster(ctx, { count: [5, 11], size: [0.24, 0.5], palette: art.floors[0].palette, shape: 'bone', spread: 0.4 });
    case 'rubblePile':
      return buildCluster(ctx, { count: [4, 9], size: [0.14, 0.4], palette: art.walls[0].palette, shape: 'rock', spread: 0.42 });
    case 'rockCluster':
      return buildCluster(ctx, { count: [3, 6], size: [0.3, 0.75], palette: art.walls[0].palette, shape: 'rock', spread: 0.35 });
    case 'stalagmite':
      return buildCluster(ctx, { count: [2, 5], size: [0.2, 0.45], palette: art.walls[0].palette, shape: 'cone', spread: 0.3, displaceAmt: 0.05 });
    case 'chitinSpike':
      return buildCluster(ctx, { count: [2, 5], size: [0.16, 0.4], palette: 'flesh.insect', shape: 'cone', spread: 0.3 });
    case 'crystalShard':
      return buildCluster(ctx, { count: [2, 5], size: [0.2, 0.5], palette: 'crystal.gem', shape: 'octa', spread: 0.3, emissive: art.veinColor || 0x53f0c8 });
    case 'crystalCluster':
      return buildCluster(ctx, { count: [4, 8], size: [0.3, 0.8], palette: 'crystal.gem', shape: 'octa', spread: 0.5, emissive: art.veinColor || 0x53f0c8 });
    case 'iceShard':
      return buildCluster(ctx, { count: [2, 5], size: [0.24, 0.6], palette: 'crystal.frost', shape: 'octa', spread: 0.32 });
    case 'voidShard':
      return buildCluster(ctx, { count: [2, 5], size: [0.24, 0.6], palette: 'crystal.void', shape: 'octa', spread: 0.32, emissive: 0xd040ff });
    case 'brokenColumn':
      return buildPillar(ctx, 'pillarBroken');

    // --- ground detail ---------------------------------------------------
    // All the same builder with different grammar. Small counts and small
    // sizes: at this scale the silhouette is two or three pixels, so the read
    // comes from how much of it there is and what colour it is, not shape.
    case 'pebbles':
      return buildCluster(ctx, { count: [4, 9], size: [0.05, 0.13], palette: art.walls[0].palette, shape: 'rock', spread: 0.46 });
    case 'boneChips':
      return buildCluster(ctx, { count: [3, 7], size: [0.05, 0.14], palette: 'bone.pale', shape: 'bone', spread: 0.44 });
    case 'ashDrift':
      return buildCluster(ctx, { count: [3, 6], size: [0.14, 0.34], palette: art.floors[0].palette, shape: 'sphere', spread: 0.42, displaceAmt: 0.09 });
    case 'mossPatch':
      return buildCluster(ctx, { count: [4, 8], size: [0.08, 0.2], palette: 'ground.grass', shape: 'sphere', spread: 0.46 });
    case 'sporeTuft':
      return buildCluster(ctx, { count: [2, 5], size: [0.06, 0.16], palette: 'ground.grass', shape: 'cone', spread: 0.34, emissive: art.veinColor || 0x6fe0a0 });
    case 'iceCrust':
      return buildCluster(ctx, { count: [3, 7], size: [0.07, 0.19], palette: 'crystal.frost', shape: 'octa', spread: 0.45 });
    case 'slagChunk':
      return buildCluster(ctx, { count: [3, 6], size: [0.07, 0.18], palette: 'metal.dark', shape: 'rock', spread: 0.42 });
    case 'shellFragment':
      return buildCluster(ctx, { count: [3, 7], size: [0.06, 0.17], palette: 'flesh.insect', shape: 'octa', spread: 0.44 });
    case 'sandDrift':
      return buildCluster(ctx, { count: [3, 6], size: [0.13, 0.3], palette: art.floors[0].palette, shape: 'sphere', spread: 0.44, displaceAmt: 0.08 });
    case 'voidMote':
      return buildCluster(ctx, { count: [2, 5], size: [0.05, 0.12], palette: 'crystal.void', shape: 'octa', spread: 0.4, emissive: 0xb060ff });
    case 'scorchMark':
      return buildCluster(ctx, { count: [2, 4], size: [0.16, 0.36], palette: 'metal.dark', shape: 'sphere', spread: 0.4, displaceAmt: 0.12 });
    case 'grassTuft':
      return buildCluster(ctx, { count: [3, 6], size: [0.07, 0.18], palette: 'ground.grass', shape: 'cone', spread: 0.4 });

    default:
      return buildMisc(ctx, kind);
  }
}

/** Cached template for a prop kind. Variants are deterministic per index. */
export function propTemplate(kind: string, art: BiomeArt, seed: number, variant: number): PropTemplate {
  const key = `${kind}|${art.id}|${variant}`;
  const hit = templateCache.get(key);
  if (hit) return hit;

  const def = propDef(kind);
  // A dedicated stream: template geometry must not depend on placement order.
  const rng = makeStream((hashStr(key) ^ seed) >>> 0);
  const built = build(kind, { art, rng, variant });

  const tmpl: PropTemplate = {
    kind,
    variant,
    layers: built.layers.map((l) => ({ ...l, geometry: sanitize(l.geometry) })),
    light: def.light ?? null,
    flame: built.flame ?? null,
    radius: def.radius,
    blocks: def.blocks,
    castShadow: def.castShadow,
    receiveShadow: def.receiveShadow,
  };
  for (const l of tmpl.layers) if (!ownedGeometries.includes(l.geometry)) ownedGeometries.push(l.geometry);
  templateCache.set(key, tmpl);
  return tmpl;
}

/** Deterministic variant index for a placement, so no extra data is stored. */
export function variantFor(kind: string, x: number, y: number): number {
  const n = Math.max(1, propDef(kind).variants);
  return Math.floor(hash2(x * 31 + 7, y * 17 + 3) * n) % n;
}

/** Deterministic scale jitter for a placement. */
export function scaleFor(kind: string, x: number, y: number): number {
  const j = propDef(kind).scaleJitter;
  if (j <= 0) return 1;
  return 1 + (hash2(x * 13 + 91, y * 57 + 5) * 2 - 1) * j;
}

/** Frees every geometry and material the prop library allocated. */
export function disposePropLibrary(): void {
  for (const g of ownedGeometries) g.dispose();
  for (const m of ownedMaterials) m.dispose();
  ownedGeometries.length = 0;
  ownedMaterials.length = 0;
  templateCache.clear();
  materialCache.clear();
}

// --- tiny local rng (templates must not consume the caller's stream) --------

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function makeStream(seed: number): Rng {
  let s = seed >>> 0 || 1;
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const self: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => (max < min ? min : min + Math.floor(next() * (max - min + 1))),
    chance: (p) => next() < p,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    weighted: <T,>(arr: readonly T[], weight: (t: T) => number): T => {
      let total = 0;
      for (const t of arr) total += Math.max(0, weight(t));
      if (total <= 0) return arr[0];
      let roll = next() * total;
      for (const t of arr) {
        const wv = Math.max(0, weight(t));
        roll -= wv;
        if (roll <= 0) return t;
      }
      return arr[arr.length - 1];
    },
    shuffle: <T,>(arr: T[]): T[] => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
    fork: (salt: string) => makeStream((hashStr(salt) ^ s) >>> 0),
  };
  return self;
}

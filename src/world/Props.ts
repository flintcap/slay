/**
 * SLAY — prop placement rules, and the door to the prop library.
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
 *  - **Templates** (`propTemplate`) hand each kind to the prop library in
 *    `art/props/` (definitions in `Defs.ts`, builders by family, templates in
 *    `Library.ts`). Templates are cached and shared, and returned as flat
 *    layer lists so the builder can turn each one into an `InstancedMesh`.
 */

import type { BiomeDef, DungeonLevel, DungeonRoom, PropPlacement, Rng } from '../types';
import { Noise, clamp } from '../art/Noise';
import { biomeArt, isOutdoorBiome, wallKitOf, type BiomeArt } from './Biomes';
import { dressingFor, type Dressing, type Pool } from '../art/props/Dressing';
import {
  T_DOOR,
  T_FLOOR,
  T_RUIN,
  T_LAVA,
  T_RUBBLE,
  T_EXIT,
  T_ARRIVAL,
  T_WATER,
  isWalkableValue,
} from './Layouts';

// Definitions live in `art/props/Defs.ts`; templates in `art/props/Library.ts`.
import { propDef, type PropDef } from '../art/props/Defs';
import { hasBuilder, libraryTemplate, disposeLibrary } from '../art/props/Library';
export { propDef, PROP_DEFS, type PropDef, type PropLightSpec, type PropPlacementKind } from '../art/props/Defs';
export { variantFor, scaleFor, type PropTemplate, type PropLayer } from '../art/props/Library';
import type { PropTemplate } from '../art/props/Library';

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

const SHRINE_TYPES = ['power', 'ward', 'haste', 'fortune', 'wrath', 'vitality'];

interface PlaceCtx {
  level: DungeonLevel;
  /** Dressing of each zone (index = zone id); one entry when the level has no zones. */
  dress: Dressing[];
  /** Open sky per zone. */
  outdoor: boolean[];
  /** Dressed-stone walls (not raw rock) per zone. */
  masonry: boolean[];
  rng: Rng;
  noise: Noise;
  w: number;
  h: number;
  tiles: Uint8Array;
  roomOf: Int16Array;
  occupied: Uint8Array;
  blocked: Uint8Array;
  /**
   * Tiles big pieces must keep their distance from: the entry landing (where
   * the hero arrives) and every spawn tile. Small clutter may sit next to
   * them; a landmark or feature may not.
   */
  keepClear: Uint8Array;
  out: PropPlacement[];
  /** Where the last `placeNearAt` landed. */
  lastX: number;
  lastY: number;
}

/** Builds the full prop list for a level. */
export function placeProps(level: DungeonLevel, biome: BiomeDef, rng: Rng): PropPlacement[] {
  // Each zone is dressed as its own biome, in the run's variant where that
  // biome has it, so a flooded crypt gets the flooded crypt's clutter and a
  // forest zone beside it keeps its stumps.
  const zones = level.zones && level.zones.length > 0 ? level.zones : null;
  const dress = zones ? zones.map((z) => dressingFor(z.biome, level.variant)) : [dressingFor(biome.id, level.variant)];
  const outdoor = zones ? zones.map((z) => z.outdoor) : [isOutdoorBiome(biome.id)];
  const masonry = (zones ? zones.map((z) => z.biome) : [biome.id]).map((b) => wallKitOf(biomeArt(b, level.variant)) === 'masonry');
  const w = level.width;
  const h = level.height;
  const roomOf = (level as DungeonLevel & { roomOf?: Int16Array }).roomOf ?? buildRoomIndex(level);

  const ctx: PlaceCtx = {
    level,
    dress,
    outdoor,
    masonry,
    rng,
    noise: new Noise((level.seed ^ 0x91d3) >>> 0),
    w,
    h,
    tiles: level.tiles,
    roomOf,
    occupied: new Uint8Array(w * h),
    blocked: new Uint8Array(w * h),
    keepClear: new Uint8Array(w * h),
    out: [],
    lastX: 0,
    lastY: 0,
  };

  // Reserve stairs and their landings, plus every spawn tile.
  reserve(ctx, level.entry.x, level.entry.y, 2);
  reserve(ctx, level.exit.x, level.exit.y, 2);
  for (const s of level.spawns) markOccupied(ctx, s.x, s.y);
  // The landing the hero arrives on, and every spawn tile, stay out of reach
  // of anything big. A landmark two tiles off the stairs put the hero's legs
  // inside its rubble on the first frame of a foundry floor.
  for (let y = level.entry.y - 2; y <= level.entry.y + 2; y++) {
    for (let x = level.entry.x - 2; x <= level.entry.x + 2; x++) markKeepClear(ctx, x, y);
  }
  for (const s of level.spawns) markKeepClear(ctx, s.x, s.y);

  placeWallLights(ctx);
  placeOpenLights(ctx);
  placeRoomFeatures(ctx);
  placePillars(ctx);
  placeInteractables(ctx);
  placeDoorLeaves(ctx);
  placeWallDressing(ctx);
  placeEdgeDressing(ctx);
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

/** Zone index of a tile (0 when the level has no zones). */
function zoneAt(ctx: PlaceCtx, x: number, y: number): number {
  const z = ctx.level.zoneOf;
  if (!z || ctx.dress.length < 2) return 0;
  const cx = Math.min(ctx.w - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(ctx.h - 1, Math.max(0, Math.round(y)));
  return Math.min(ctx.dress.length - 1, z[cy * ctx.w + cx] ?? 0);
}

/** What the tile's zone is dressed with. */
function dressAt(ctx: PlaceCtx, x: number, y: number): Dressing {
  return ctx.dress[zoneAt(ctx, x, y)]!;
}

/** True when the tile's zone has open sky. */
function outdoorAt(ctx: PlaceCtx, x: number, y: number): boolean {
  return ctx.outdoor[zoneAt(ctx, x, y)] ?? false;
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

function markKeepClear(ctx: PlaceCtx, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= ctx.w || y >= ctx.h) return;
  ctx.keepClear[y * ctx.w + x] = 1;
}

/**
 * How many tiles of breathing room a prop needs from the keep-clear tiles.
 * Features and anything wider than half a tile keep one tile clear; pieces
 * that spill past their own tile (ossuaries, idols, forges) keep it from
 * spawn tiles too, and every big piece keeps two tiles clear of the landing.
 */
function crowdsKeepClear(ctx: PlaceCtx, x: number, y: number, def: PropDef): boolean {
  if (def.placement === 'detail' || def.placement === 'wall' || def.placement === 'liquid') return false;
  const big = def.placement === 'feature' || def.radius >= 0.6;
  if (!big) return false;
  const e = ctx.level.entry;
  if (Math.max(Math.abs(x - e.x), Math.abs(y - e.y)) <= 4) return true;
  if (def.radius < 0.85) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= ctx.w || ny >= ctx.h) continue;
      if (ctx.keepClear[ny * ctx.w + nx]) return true;
    }
  }
  return false;
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
  // Gameplay pieces (chests, altars, shrines) are never dropped for this.
  if (!interact && crowdsKeepClear(ctx, x, y, def)) return false;
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

/**
 * Can something hang on the wall at (wx, wy), seen from floor tile (x, y)?
 * Indoors every wall is masonry. Outdoors a blocked tile is the ground rising
 * into a tree line, dune or cliff, and only a ruin is a wall you can mount a
 * torch or a banner on.
 */
function mountable(ctx: PlaceCtx, x: number, y: number, wx: number, wy: number): boolean {
  return !outdoorAt(ctx, x, y) || tile(ctx, wx, wy) === T_RUIN;
}

/** Every floor tile that has a mountable wall on one side, grouped into runs. */
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
        if (v !== T_FLOOR && v !== T_RUBBLE && v !== T_EXIT && v !== T_ARRIVAL) continue;
        if (walkable(ctx, x + dir.dx, y + dir.dy)) continue;
        if (tile(ctx, x + dir.dx, y + dir.dy) === 0) continue; // outside the shell
        if (!mountable(ctx, x, y, x + dir.dx, y + dir.dy)) continue;
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
  for (const run of runs) {
    if (run.length < 3) continue;
    const mid = run[run.length >> 1]!;
    const d = dressAt(ctx, mid.x, mid.y);
    const spacing = Math.max(3, d.wallLightSpacing);
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
      emit(ctx, f.x, f.y, d.wallLight, f.rotation);
    }
  }

  // Standing lights punctuate the big indoor rooms, where wall lights alone
  // leave the middle dark and flat.
  for (const room of ctx.level.rooms) {
    if (room.w < 9 || room.h < 9) continue;
    const cx = Math.round(room.center.x);
    const cy = Math.round(room.center.y);
    if (outdoorAt(ctx, cx, cy)) continue;
    const pool = dressAt(ctx, cx, cy).standLight;
    if (pool.length === 0 || !ctx.rng.chance(0.55)) continue;
    const kind = pickWeighted(ctx, pool);
    const corners = [
      { x: room.x + 2, y: room.y + 2 },
      { x: room.x + room.w - 3, y: room.y + 2 },
      { x: room.x + 2, y: room.y + room.h - 3 },
      { x: room.x + room.w - 3, y: room.y + room.h - 3 },
    ];
    const use = ctx.rng.chance(0.5) ? corners : ctx.rng.shuffle(corners.slice()).slice(0, 2);
    for (const c of use) {
      if (!walkable(ctx, c.x, c.y)) continue;
      emit(ctx, c.x, c.y, kind, ctx.rng.range(0, Math.PI * 2));
    }
  }
}

/**
 * Outdoors there are no walls to hang lights on, so the light stands in the
 * open: a lantern post, a brazier, a camp. One per patch of open ground about
 * ten tiles across, on a tile with room around it, so the dark between pools
 * stays dark.
 */
function placeOpenLights(ctx: PlaceCtx): void {
  const CELL = 10;
  for (let gy = 0; gy < ctx.h; gy += CELL) {
    for (let gx = 0; gx < ctx.w; gx += CELL) {
      if (!ctx.rng.chance(0.8)) continue;
      for (let t = 0; t < 14; t++) {
        const x = gx + ctx.rng.int(1, CELL - 2);
        const y = gy + ctx.rng.int(1, CELL - 2);
        if (x < 2 || y < 2 || x >= ctx.w - 2 || y >= ctx.h - 2) continue;
        if (tile(ctx, x, y) !== T_FLOOR || isOccupied(ctx, x, y)) continue;
        if (!outdoorAt(ctx, x, y)) continue;
        if (openness(ctx, x, y) < 8) continue;
        const pool = dressAt(ctx, x, y).standLight;
        if (pool.length === 0) break;
        if (emit(ctx, x, y, pickWeighted(ctx, pool), ctx.rng.range(0, Math.PI * 2))) break;
      }
    }
  }
}

/** Walkable tiles among the eight around (x, y). */
function openness(ctx: PlaceCtx, x: number, y: number): number {
  let open = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && walkable(ctx, x + dx, y + dy)) open++;
    }
  }
  return open;
}

// --- room features ---------------------------------------------------------

function placeRoomFeatures(ctx: PlaceCtx): void {
  for (const room of ctx.level.rooms) {
    const cx = room.center.x;
    const cy = room.center.y;
    const d = dressAt(ctx, cx, cy);

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
      // The arena floor is marked, not cluttered: a great seal at its heart.
      sealAt(ctx, Math.round(cx), Math.round(cy), 'arenaSeal');
      // Keep the arena floor clear; ring the edge with features instead.
      const ringR = Math.min(room.w, room.h) * 0.42;
      const spokes = 8;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const px = Math.round(cx + Math.cos(a) * ringR);
        const py = Math.round(cy + Math.sin(a) * ringR);
        if (!walkable(ctx, px, py)) continue;
        const kind = i % 2 === 0 ? (d.standLight.length > 0 ? pickWeighted(ctx, d.standLight) : 'brazier') : pickWeighted(ctx, d.feature);
        emit(ctx, px, py, kind, -a + Math.PI / 2);
      }
      continue;
    }

    if (room.kind === 'entry' || room.kind === 'exit') continue;

    // Room-kind landmarks. Each kind gets a piece that says what the room is
    // before anything in it moves.
    if (room.kind === 'treasure') {
      if (placeNearAt(ctx, cx, cy, 1, 'goldHoard')) sealAt(ctx, ctx.lastX, ctx.lastY, 'floorSeal');
      continue;
    }
    if (room.kind === 'ambush') {
      const n = room.w * room.h >= 80 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = ctx.rng.range(0, Math.PI * 2);
        placeNear(ctx, Math.round(cx + Math.cos(a) * 2), Math.round(cy + Math.sin(a) * 2), 2, 'gibbet');
      }
      continue;
    }
    if (room.kind === 'vault' || room.kind === 'quest') {
      // The chest or altar lands on the centre later; the seal frames it.
      sealAt(ctx, cx, cy, 'floorSeal');
      continue;
    }

    if (room.w < 6 || room.h < 6) continue;
    const big = room.w >= 11 && room.h >= 11;
    const pool = big && d.landmark.length > 0 ? d.landmark : d.feature;
    // Big rooms always get their hero; mid rooms nearly always do. A room
    // with nothing in it is a corridor that got lost.
    if (!big && !ctx.rng.chance(0.85)) continue;
    const kind = pickWeighted(ctx, pool);
    if (!placeNearAt(ctx, cx, cy, 2, kind)) continue;
    if (big || ctx.rng.chance(0.45)) sealAt(ctx, ctx.lastX, ctx.lastY, 'floorSeal');
  }
}

/** `placeNear`, remembering where it landed in `ctx.lastX/lastY`. */
function placeNearAt(ctx: PlaceCtx, cx: number, cy: number, r: number, kind: string, interact?: string): boolean {
  const before = ctx.out.length;
  const ok = placeNear(ctx, cx, cy, r, kind, interact);
  if (ok) {
    const p = ctx.out[before]!;
    ctx.lastX = p.x;
    ctx.lastY = p.y;
  }
  return ok;
}

/**
 * Lays a floor seal centred on a tile — only where the floor under the whole
 * disc is walkable and level, because a flat inlay on a stepped floor is
 * half-buried. Does not occupy the tile: the seal is the ground the room's
 * hero piece stands on.
 */
function sealAt(ctx: PlaceCtx, cxIn: number, cyIn: number, kind: 'floorSeal' | 'arenaSeal'): boolean {
  const cx = Math.round(cxIn);
  const cy = Math.round(cyIn);
  const r = kind === 'arenaSeal' ? 2 : 1;
  const heights = (ctx.level as DungeonLevel & { heights?: Int8Array }).heights;
  const h0 = heights ? heights[cy * ctx.w + cx] : 0;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!walkable(ctx, x, y)) return false;
      const v = tile(ctx, x, y);
      if (v === T_WATER || v === T_LAVA) return false;
      if (heights && heights[y * ctx.w + x] !== h0) return false;
    }
  }
  ctx.out.push({ x: cx, y: cy, rotation: ctx.rng.range(0, Math.PI * 2), kind });
  return true;
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
  for (const room of ctx.level.rooms) {
    if (room.w < 9 || room.h < 9) continue;
    if (room.kind === 'entry' || room.kind === 'boss') continue;
    // Open sky has no roof to hold up.
    if (outdoorAt(ctx, room.center.x, room.center.y)) continue;
    const kind = dressAt(ctx, room.center.x, room.center.y).pillar;
    if (!kind) continue;
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
    const box = dressAt(ctx, cx, cy).breakables;

    if (room.kind === 'treasure') {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.range(0, 1);
        const px = Math.round(cx + Math.cos(a) * rng.range(1, 2.6));
        const py = Math.round(cy + Math.sin(a) * rng.range(1, 2.6));
        placeChest(ctx, px, py, i === 0 ? 'chest.rare' : 'chest.normal');
      }
      scatterAround(ctx, room, box, 4);
    } else if (room.kind === 'vault') {
      // A lever on the wall opens it. With no wall to hang one on, the vault
      // would stay barred for ever, so it is a rare chest instead.
      const before = ctx.out.length;
      if (placeChest(ctx, cx, cy, 'chest.vault')) {
        const chest = ctx.out[before]!;
        const face = nearestWallFace(ctx, cx, cy, 5);
        if (!face || !emit(ctx, face.x, face.y, 'lever', face.rotation, 'lever.vault')) {
          chest.kind = chestKindFor('chest.rare');
          chest.interact = 'chest.rare';
        }
      }
      scatterAround(ctx, room, box, 5);
    } else if (room.kind === 'ambush') {
      // Cover that looks lootable is the bait.
      scatterAround(ctx, room, box, 6);
      if (rng.chance(0.5)) placeChest(ctx, cx, cy, 'chest.normal');
    } else if (room.kind === 'quest') {
      placeNear(ctx, cx, cy, 2, 'altar', 'quest.altar');
      scatterAround(ctx, room, [...box, { kind: 'candleCluster', weight: 3 }], 4);
    } else if (room.kind === 'normal' && rng.chance(0.75)) {
      // Scale with the room. A flat one-to-three put the same two barrels in a
      // six-tile chamber and in a seventeen-tile hall room.
      scatterAround(ctx, room, box, clamp(Math.round((room.w * room.h) / 45), 1, 7));
    }

    // Bookcases go flat against an indoor wall, never free-standing.
    if ((room.kind === 'normal' || room.kind === 'quest') && room.w >= 8 && room.h >= 8 && !outdoorAt(ctx, cx, cy) && rng.chance(0.28)) {
      const face = nearestWallFace(ctx, cx, cy, 8);
      if (face) emit(ctx, face.x, face.y, 'bookcase', face.rotation, 'bookcase');
    }
  }
}

/** The chest model for a payload's tier: plain, rare (dark wood, black iron) or the vault's. */
export function chestKindFor(interact: string): string {
  if (interact === 'chest.vault') return 'chestVault';
  if (interact === 'chest.rare') return 'chestRare';
  return 'chest';
}

function placeChest(ctx: PlaceCtx, x: number, y: number, interact: string): boolean {
  return placeNear(ctx, Math.round(x), Math.round(y), 2, chestKindFor(interact), interact);
}

function scatterAround(ctx: PlaceCtx, room: DungeonRoom, kinds: Pool, count: number): void {
  if (kinds.length === 0) return;
  for (let i = 0; i < count * 4 && count > 0; i++) {
    const x = room.x + ctx.rng.int(0, Math.max(0, room.w - 1));
    const y = room.y + ctx.rng.int(0, Math.max(0, room.h - 1));
    if (!walkable(ctx, x, y)) continue;
    // Prefer tiles adjacent to a wall — loose objects end up at the edges.
    const nextToWall =
      !walkable(ctx, x - 1, y) || !walkable(ctx, x + 1, y) || !walkable(ctx, x, y - 1) || !walkable(ctx, x, y + 1);
    if (!nextToWall && ctx.rng.chance(0.6)) continue;
    const kind = pickWeighted(ctx, kinds);
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
        if (!mountable(ctx, x, y, x + dir.dx, y + dir.dy)) continue;
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
  const runs = wallRuns(ctx);
  for (const run of runs) {
    if (run.length < 2) continue;
    const attempts = Math.max(1, Math.floor(run.length / 4));
    for (let i = 0; i < attempts; i++) {
      if (!ctx.rng.chance(0.5)) continue;
      const f = run[ctx.rng.int(0, run.length - 1)];
      const pool = dressAt(ctx, f.x, f.y).wall;
      if (pool.length === 0) continue;
      emit(ctx, f.x, f.y, pickWeighted(ctx, pool), f.rotation);
    }
  }
}

/**
 * Doors. A doorway in a dressed wall gets its door swung right back against
 * the wall on the room side, flat to it, so it is something you see on the
 * way through and never something you walk into.
 */
function placeDoorLeaves(ctx: PlaceCtx): void {
  const dirs: Array<[number, number, number]> = [
    [0, -1, 0],
    [0, 1, Math.PI],
    [-1, 0, Math.PI / 2],
    [1, 0, -Math.PI / 2],
  ];
  for (let y = 1; y < ctx.h - 1; y++) {
    for (let x = 1; x < ctx.w - 1; x++) {
      if (tile(ctx, x, y) !== T_DOOR || outdoorAt(ctx, x, y) || !ctx.masonry[zoneAt(ctx, x, y)]) continue;
      if (!ctx.rng.chance(0.65)) continue;
      // The passage runs along the axis with floor on both ends.
      const alongX = walkable(ctx, x - 1, y) && walkable(ctx, x + 1, y);
      const ends: Array<[number, number]> = alongX ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
      // The room side, if one end is in a room; otherwise either.
      ends.sort((a, b) => Number(!!roomAtTile(ctx, x + b[0], y + b[1])) - Number(!!roomAtTile(ctx, x + a[0], y + a[1])));
      let done = false;
      for (const [ex, ey] of ends) {
        if (done) break;
        const rx = x + ex;
        const ry = y + ey;
        // Beside that end tile, against the wall the doorway is cut through.
        const sides: Array<[number, number]> = alongX ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
        if (ctx.rng.chance(0.5)) sides.reverse();
        for (const [sx, sy] of sides) {
          const fx = rx + sx;
          const fy = ry + sy;
          const wx = fx - ex;
          const wy = fy - ey;
          if (!walkable(ctx, fx, fy) || walkable(ctx, wx, wy) || tile(ctx, wx, wy) === 0) continue;
          const face = dirs.find((d) => d[0] === -ex && d[1] === -ey)!;
          if (emit(ctx, fx, fy, 'door', face[2])) {
            done = true;
            break;
          }
        }
      }
    }
  }
}

/**
 * Outdoors the tree line, reed bed or dune is drawn by the ground; what sits
 * at its foot is ours. Boulders, ferns, thorn and roots gather in clumps along
 * the walkable fringe, so the edge reads as a place things pile up, not as a
 * line where the floor stops.
 */
function placeEdgeDressing(ctx: PlaceCtx): void {
  const n = ctx.noise;
  const ox = ctx.rng.range(0, 200);
  for (let y = 1; y < ctx.h - 1; y++) {
    for (let x = 1; x < ctx.w - 1; x++) {
      if (tile(ctx, x, y) !== T_FLOOR || isOccupied(ctx, x, y)) continue;
      if (!outdoorAt(ctx, x, y)) continue;
      // Only at the foot of risen ground: water and ruins have their own edges.
      let rise = false;
      for (let d = 0; d < 4 && !rise; d++) {
        const v = tile(ctx, x + (d === 0 ? -1 : d === 1 ? 1 : 0), y + (d === 2 ? -1 : d === 3 ? 1 : 0));
        if (!isWalkableValue(v) && v !== T_WATER && v !== T_RUIN && v !== T_LAVA) rise = true;
      }
      if (!rise || nearEntry(ctx, x, y, 3)) continue;
      const clump = n.fbm((x + ox) * 0.13, y * 0.13 + 40, 2) * 0.5 + 0.5;
      if (!ctx.rng.chance(clamp((clump - 0.35) * 0.55, 0, 0.3))) continue;
      const pool = dressAt(ctx, x, y).edge;
      if (pool.length === 0) continue;
      emit(ctx, x, y, pickWeighted(ctx, pool), ctx.rng.range(0, Math.PI * 2));
    }
  }
}

/** True within `r` tiles of the up-stairs, where the floor must stay readable. */
function nearEntry(ctx: PlaceCtx, x: number, y: number, r: number): boolean {
  const e = ctx.level.entry;
  return Math.abs(x - e.x) <= r && Math.abs(y - e.y) <= r;
}

// --- clutter scatter -------------------------------------------------------

function placeScatter(ctx: PlaceCtx): void {
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
      // The landing you arrive on stays clear so the way on is never lost in
      // clutter — but only the landing. Skipping the whole entry room meant the
      // first room of every floor, the one the player looks at longest, was the
      // one room with nothing in it.
      if (room && room.kind === 'entry' && nearEntry(ctx, x, y, 4)) continue;
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

      const pool = dressAt(ctx, x, y).clutter;
      if (pool.length === 0) continue;
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
  const n = ctx.noise;
  const ox = ctx.rng.range(0, 200);
  const oy = ctx.rng.range(0, 200);

  for (let y = 1; y < ctx.h - 1; y++) {
    for (let x = 1; x < ctx.w - 1; x++) {
      const v = tile(ctx, x, y);
      if (v !== T_FLOOR && v !== T_RUBBLE) continue;
      if (isOccupied(ctx, x, y)) continue;
      const room = roomAtTile(ctx, x, y);
      // Only the landing itself, not the whole room it sits in.
      if (room && room.kind === 'entry' && nearEntry(ctx, x, y, 3)) continue;

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

      const pool = dressAt(ctx, x, y).detail;
      if (pool.length === 0) continue;
      const kind = pickWeighted(ctx, pool);
      emit(ctx, x, y, kind, ctx.rng.range(0, Math.PI * 2));
    }
  }
}

function placeLiquidProps(ctx: PlaceCtx): void {
  for (let y = 1; y < ctx.h - 1; y++) {
    for (let x = 1; x < ctx.w - 1; x++) {
      if (tile(ctx, x, y) !== T_WATER) continue;
      if (isOccupied(ctx, x, y)) continue;
      const pool = dressAt(ctx, x, y).liquid;
      if (pool.length === 0 || !ctx.rng.chance(0.12)) continue;
      const kind = pickWeighted(ctx, pool);
      emit(ctx, x, y, kind, ctx.rng.range(0, Math.PI * 2));
    }
  }
}

function pickWeighted(ctx: PlaceCtx, pool: Pool): string {
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
// Templates
// ---------------------------------------------------------------------------

/**
 * Cached template for a prop kind, built by the prop library
 * (`art/props/Library.ts`). A kind with no builder draws as a rubble pile,
 * the same fallback its definition takes.
 */
export function propTemplate(kind: string, art: BiomeArt, seed: number, variant: number): PropTemplate {
  return libraryTemplate(hasBuilder(kind) ? kind : 'rubblePile', art, seed, variant);
}

/** Frees every geometry and material the prop library allocated. */
export function disposePropLibrary(): void {
  disposeLibrary();
}

/**
 * SLAY — layout algorithm library.
 *
 * One generator per `LayoutKind`. Every generator produces a `Grid` of tile
 * values plus a room list, and every generator is run through the same
 * post-process pipeline:
 *
 *   1. `ensureConnected` — flood fill, then *repair* by tunnelling the shortest
 *      path from every orphaned component back to the main body. We never
 *      retry-until-lucky; a generator that can fail is a generator that will
 *      hang on some seed at 3am.
 *   2. `removeDiagonalPinch` — kills diagonal-only links, which read as walls
 *      to a capsule-shaped player and are the classic "I'm stuck" bug.
 *   3. `placeDoors` — chokepoint detection, so the builder has somewhere
 *      meaningful to put an archway.
 *   4. `wallify` — every void tile touching walkable space becomes a real wall
 *      tile, so the mesh builder never has to guess where the shell is.
 *
 * Nothing in here touches THREE. Layouts are pure data.
 */

import type { DungeonRoom, LayoutKind, Rng, Vec2 } from '../types';
import { Noise, clamp } from '../art/Noise';

// ---------------------------------------------------------------------------
// Tile values
// ---------------------------------------------------------------------------

/** Numeric tile ids stored in `DungeonLevel.tiles`. Re-exported by DungeonGen. */
export const TILE_VALUES = {
  void: 0,
  floor: 1,
  wall: 2,
  door: 3,
  water: 4,
  lava: 5,
  chasm: 6,
  stairsDown: 7,
  stairsUp: 8,
  rubble: 9,
} as const;

export const T_VOID = 0;
export const T_FLOOR = 1;
export const T_WALL = 2;
export const T_DOOR = 3;
export const T_WATER = 4;
export const T_LAVA = 5;
export const T_CHASM = 6;
export const T_STAIRS_DOWN = 7;
export const T_STAIRS_UP = 8;
export const T_RUBBLE = 9;

/** Tiles an entity may stand on. Water and rubble are passable but slow. */
export function isWalkableValue(v: number): boolean {
  return (
    v === T_FLOOR ||
    v === T_DOOR ||
    v === T_WATER ||
    v === T_RUBBLE ||
    v === T_STAIRS_DOWN ||
    v === T_STAIRS_UP
  );
}

/** Movement cost multiplier used by the navigation grid. */
export function tileCost(v: number): number {
  switch (v) {
    case T_WATER:
      return 1.8;
    case T_RUBBLE:
      return 1.45;
    case T_DOOR:
      return 1.05;
    default:
      return 1;
  }
}

/** Tiles that are open space but not standable — the builder renders depth here. */
export function isPitValue(v: number): boolean {
  return v === T_CHASM || v === T_LAVA;
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

/**
 * The working surface for every generator. Carries a parallel height field so
 * layouts can express steps, sunken pits and descending rings without needing a
 * second data structure threaded through the pipeline.
 */
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly t: Uint8Array;
  /** Height step index per tile. 1 unit ≈ 0.45 world units in the builder. */
  readonly heights: Int8Array;

  constructor(w: number, h: number, fill = T_VOID) {
    this.w = w;
    this.h = h;
    this.t = new Uint8Array(w * h);
    this.heights = new Int8Array(w * h);
    if (fill !== 0) this.t.fill(fill);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return T_VOID;
    return this.t[y * this.w + x];
  }

  set(x: number, y: number, v: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.t[y * this.w + x] = v;
  }

  height(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.heights[y * this.w + x];
  }

  setHeight(x: number, y: number, v: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.heights[y * this.w + x] = clamp(Math.round(v), -12, 12);
  }

  walkable(x: number, y: number): boolean {
    return isWalkableValue(this.get(x, y));
  }

  /** Carve an axis-aligned rectangle of floor. */
  rect(x: number, y: number, w: number, h: number, v = T_FLOOR): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w);
    const y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.w;
      for (let xx = x0; xx < x1; xx++) this.t[row + xx] = v;
    }
  }

  rectHeight(x: number, y: number, w: number, h: number, level: number): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w);
    const y1 = Math.min(this.h, y + h);
    const lv = clamp(Math.round(level), -12, 12);
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.w;
      for (let xx = x0; xx < x1; xx++) this.heights[row + xx] = lv;
    }
  }

  /** Carve a filled disc. `ry` lets it become an ellipse for non-square grids. */
  disc(cx: number, cy: number, rx: number, ry: number, v = T_FLOOR): void {
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const dx = (xx - cx) / rx;
        const dy = (yy - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.t[yy * this.w + xx] = v;
      }
    }
  }

  countFloorIn(x: number, y: number, w: number, h: number): number {
    let n = 0;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) if (this.walkable(xx, yy)) n++;
    }
    return n;
  }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface LayoutOpts {
  width: number;
  height: number;
  rng: Rng;
  /** Dungeon depth — scales room count / density. */
  depth: number;
  seed: number;
  /** Force a boss-shaped level regardless of kind. */
  boss?: boolean;
}

export interface LayoutOut {
  grid: Grid;
  rooms: DungeonRoom[];
  kind: LayoutKind;
}

/**
 * Recommended grid size for a depth. Grows slowly so depth 100 is bigger than
 * depth 1 but never so big that generation or the mesh budget falls over.
 */
export function layoutSizeFor(depth: number, kind: LayoutKind, rng: Rng): { w: number; h: number } {
  const growth = Math.min(30, Math.floor(Math.log2(depth + 1) * 7));
  let base = 62 + growth;
  if (kind === 'arena') base = 54 + Math.floor(growth * 0.6);
  if (kind === 'caves' || kind === 'ruins') base = 70 + growth;
  if (kind === 'maze') base = 55 + Math.floor(growth * 0.8);
  if (kind === 'spiral') base = 66 + Math.floor(growth * 0.5);
  const w = base + rng.int(-4, 6);
  const h = base + rng.int(-4, 6);
  return { w: clamp(w, 40, 128) | 0, h: clamp(h, 40, 128) | 0 };
}

/** Build a layout of `kind`, fully post-processed and guaranteed connected. */
export function buildLayout(kind: LayoutKind, o: LayoutOpts): LayoutOut {
  const rng = o.rng;
  let out: LayoutOut;
  switch (kind) {
    case 'rooms':
      out = layoutRooms(o);
      break;
    case 'caves':
      out = layoutCaves(o);
      break;
    case 'maze':
      out = layoutMaze(o);
      break;
    case 'catacombs':
      out = layoutCatacombs(o);
      break;
    case 'ruins':
      out = layoutRuins(o);
      break;
    case 'arena':
      out = layoutArena(o);
      break;
    case 'spiral':
      out = layoutSpiral(o);
      break;
    default:
      out = layoutRooms(o);
      break;
  }

  finalize(out, rng);
  return out;
}

/** The shared post-process. Public so a caller can re-run it after edits. */
export function finalize(out: LayoutOut, rng: Rng): void {
  const g = out.grid;
  sealBorder(g);
  ensureConnected(g, out.rooms);
  removeDiagonalPinch(g);
  pruneStrayFloor(g);
  rebuildRoomLinks(g, out.rooms);
  placeDoors(g, out.rooms, rng);
  smoothHeights(g);
  wallify(g);
}

// ---------------------------------------------------------------------------
// Post-process passes
// ---------------------------------------------------------------------------

/** Nothing walkable may touch the grid border — the shell needs room for walls. */
function sealBorder(g: Grid): void {
  for (let x = 0; x < g.w; x++) {
    for (let m = 0; m < 2; m++) {
      g.set(x, m, T_VOID);
      g.set(x, g.h - 1 - m, T_VOID);
    }
  }
  for (let y = 0; y < g.h; y++) {
    for (let m = 0; m < 2; m++) {
      g.set(m, y, T_VOID);
      g.set(g.w - 1 - m, y, T_VOID);
    }
  }
}

/** Label walkable connected components (4-way). Returns labels + sizes. */
export function labelComponents(g: Grid): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(g.w * g.h).fill(-1);
  const sizes: number[] = [];
  const queue = new Int32Array(g.w * g.h);
  let next = 0;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (labels[i] !== -1 || !isWalkableValue(g.t[i])) continue;
      const id = next++;
      let head = 0;
      let tail = 0;
      queue[tail++] = i;
      labels[i] = id;
      let count = 0;
      while (head < tail) {
        const c = queue[head++];
        count++;
        const cx = c % g.w;
        const cy = (c / g.w) | 0;
        if (cx > 0) {
          const n = c - 1;
          if (labels[n] === -1 && isWalkableValue(g.t[n])) {
            labels[n] = id;
            queue[tail++] = n;
          }
        }
        if (cx < g.w - 1) {
          const n = c + 1;
          if (labels[n] === -1 && isWalkableValue(g.t[n])) {
            labels[n] = id;
            queue[tail++] = n;
          }
        }
        if (cy > 0) {
          const n = c - g.w;
          if (labels[n] === -1 && isWalkableValue(g.t[n])) {
            labels[n] = id;
            queue[tail++] = n;
          }
        }
        if (cy < g.h - 1) {
          const n = c + g.w;
          if (labels[n] === -1 && isWalkableValue(g.t[n])) {
            labels[n] = id;
            queue[tail++] = n;
          }
        }
      }
      sizes.push(count);
    }
  }
  return { labels, sizes };
}

/**
 * Guarantee a single walkable component. One BFS out of the main body over the
 * *entire* grid gives us, for every orphan, the shortest tunnel home; we carve
 * back along the parent chain. Deterministic, O(n), and it cannot fail.
 */
export function ensureConnected(g: Grid, rooms: DungeonRoom[]): void {
  const { labels, sizes } = labelComponents(g);
  if (sizes.length <= 1) return;

  let main = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[main]) main = i;

  const n = g.w * g.h;
  const parent = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < n; i++) {
    if (labels[i] === main) {
      seen[i] = 1;
      queue[tail++] = i;
    }
  }

  // Best (shortest) reach point per orphan component.
  const best = new Int32Array(sizes.length).fill(-1);
  while (head < tail) {
    const c = queue[head++];
    const lc = labels[c];
    if (lc >= 0 && lc !== main && best[lc] === -1) best[lc] = c;
    const cx = c % g.w;
    const cy = (c / g.w) | 0;
    // Stay one tile off the border so tunnels never breach the shell.
    if (cx > 1) pushNeighbor(c - 1, c);
    if (cx < g.w - 2) pushNeighbor(c + 1, c);
    if (cy > 1) pushNeighbor(c - g.w, c);
    if (cy < g.h - 2) pushNeighbor(c + g.w, c);
  }

  function pushNeighbor(nb: number, from: number): void {
    if (seen[nb]) return;
    seen[nb] = 1;
    parent[nb] = from;
    queue[tail++] = nb;
  }

  for (let comp = 0; comp < sizes.length; comp++) {
    if (comp === main || best[comp] === -1) continue;
    let cur = best[comp];
    let guard = 0;
    while (cur !== -1 && guard++ < n) {
      if (!isWalkableValue(g.t[cur])) g.t[cur] = T_FLOOR;
      const p = parent[cur];
      if (p === -1) break;
      cur = p;
    }
  }

  // Room links may have changed; caller rebuilds them.
  void rooms;
}

/**
 * Diagonal-only connections read as solid to anything with a body radius.
 * Widen them by opening one of the two blocking orthogonals.
 */
export function removeDiagonalPinch(g: Grid): void {
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (!g.walkable(x, y)) continue;
      // down-right
      if (g.walkable(x + 1, y + 1) && !g.walkable(x + 1, y) && !g.walkable(x, y + 1)) {
        if (((x * 73856093) ^ (y * 19349663)) & 1) g.set(x + 1, y, T_FLOOR);
        else g.set(x, y + 1, T_FLOOR);
      }
      // up-right
      if (g.walkable(x + 1, y - 1) && !g.walkable(x + 1, y) && !g.walkable(x, y - 1)) {
        if (((x * 83492791) ^ (y * 29857931)) & 1) g.set(x + 1, y, T_FLOOR);
        else g.set(x, y - 1, T_FLOOR);
      }
    }
  }
}

/** Remove single orphan floor tiles left by erosion — they read as artefacts. */
function pruneStrayFloor(g: Grid): void {
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (!g.walkable(x, y)) continue;
      let n = 0;
      if (g.walkable(x - 1, y)) n++;
      if (g.walkable(x + 1, y)) n++;
      if (g.walkable(x, y - 1)) n++;
      if (g.walkable(x, y + 1)) n++;
      if (n === 0) g.set(x, y, T_VOID);
    }
  }
}

/**
 * A chokepoint is a walkable tile pinched between two walls on one axis and
 * open on the other. Those are exactly the spots that want an archway.
 */
export function placeDoors(g: Grid, rooms: DungeonRoom[], rng: Rng): void {
  const candidates: number[] = [];
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      const v = g.get(x, y);
      if (v !== T_FLOOR) continue;
      const l = g.walkable(x - 1, y);
      const r = g.walkable(x + 1, y);
      const u = g.walkable(x, y - 1);
      const d = g.walkable(x, y + 1);
      const horizontal = l && r && !u && !d;
      const vertical = u && d && !l && !r;
      if (!horizontal && !vertical) continue;
      // Only near a room edge — mid-corridor doors look arbitrary.
      let near = false;
      for (const room of rooms) {
        if (
          x >= room.x - 2 &&
          x <= room.x + room.w + 1 &&
          y >= room.y - 2 &&
          y <= room.y + room.h + 1
        ) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      candidates.push(y * g.w + x);
    }
  }
  rng.shuffle(candidates);
  const take = Math.min(candidates.length, Math.ceil(candidates.length * 0.75));
  for (let i = 0; i < take; i++) {
    const c = candidates[i];
    g.t[c] = T_DOOR;
  }
}

/** Every void tile touching walkable space (8-way) becomes a wall tile. */
export function wallify(g: Grid): void {
  const src = g.t.slice();
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (src[i] !== T_VOID) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
          const nv = src[ny * g.w + nx];
          if (isWalkableValue(nv) || isPitValue(nv)) {
            touch = true;
            break;
          }
        }
      }
      if (touch) g.t[i] = T_WALL;
    }
  }
}

/** Height field must not jump more than one step between adjacent walkables. */
function smoothHeights(g: Grid): void {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let y = 1; y < g.h - 1; y++) {
      for (let x = 1; x < g.w - 1; x++) {
        if (!g.walkable(x, y)) continue;
        const hv = g.height(x, y);
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (!g.walkable(nx, ny)) continue;
          const nh = g.height(nx, ny);
          if (nh - hv > 1) {
            g.setHeight(nx, ny, hv + 1);
            changed = true;
          } else if (hv - nh > 1) {
            g.setHeight(x, y, nh + 1);
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
  // Walls inherit the max height of adjacent floor so bases never float.
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.walkable(x, y)) continue;
      let best = -99;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!g.walkable(nx, ny)) continue;
          best = Math.max(best, g.height(nx, ny));
        }
      }
      if (best > -99) g.setHeight(x, y, best);
    }
  }
}

/** Recompute room adjacency by walking the walkable graph between room bboxes. */
export function rebuildRoomLinks(g: Grid, rooms: DungeonRoom[]): void {
  if (rooms.length === 0) return;
  const owner = new Int32Array(g.w * g.h).fill(-1);
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (g.walkable(x, y)) owner[y * g.w + x] = r.id;
      }
    }
  }
  // Multi-source BFS: every walkable tile is claimed by its nearest room.
  const n = g.w * g.h;
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (owner[i] !== -1) queue[tail++] = i;
  const links = new Map<number, Set<number>>();
  for (const r of rooms) links.set(r.id, new Set<number>());
  while (head < tail) {
    const c = queue[head++];
    const oc = owner[c];
    const cx = c % g.w;
    const cy = (c / g.w) | 0;
    const step = (nb: number): void => {
      if (!isWalkableValue(g.t[nb])) return;
      if (owner[nb] === -1) {
        owner[nb] = oc;
        queue[tail++] = nb;
      } else if (owner[nb] !== oc) {
        links.get(oc)?.add(owner[nb]);
        links.get(owner[nb])?.add(oc);
      }
    };
    if (cx > 0) step(c - 1);
    if (cx < g.w - 1) step(c + 1);
    if (cy > 0) step(c - g.w);
    if (cy < g.h - 1) step(c + g.w);
  }
  for (const r of rooms) {
    const s = links.get(r.id);
    r.links = s ? Array.from(s).sort((a, b) => a - b) : [];
  }
}

// ---------------------------------------------------------------------------
// Shared carving helpers
// ---------------------------------------------------------------------------

let roomIdCounter = 0;

function makeRoom(x: number, y: number, w: number, h: number, kind: DungeonRoom['kind'] = 'normal'): DungeonRoom {
  return {
    id: roomIdCounter++,
    x,
    y,
    w,
    h,
    kind,
    links: [],
    center: { x: Math.floor(x + w / 2), y: Math.floor(y + h / 2) },
  };
}

function resetRoomIds(): void {
  roomIdCounter = 0;
}

/**
 * Carve a room that is not a plain rectangle. The inner core (inset by 1) is
 * always solid so the shape can never self-disconnect; only the border ring is
 * eroded, and 0-2 alcoves are added to break the silhouette.
 */
function carveOrganicRoom(
  g: Grid,
  x: number,
  y: number,
  w: number,
  h: number,
  rng: Rng,
  noise: Noise,
  organic: number,
): void {
  g.rect(x, y, w, h, T_FLOOR);
  if (organic <= 0 || w < 5 || h < 5) return;

  const ox = rng.range(0, 100);
  const oy = rng.range(0, 100);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const border = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1;
      const corner =
        (xx <= x + 1 || xx >= x + w - 2) && (yy <= y + 1 || yy >= y + h - 2);
      if (!border && !corner) continue;
      const nv = noise.fbm((xx + ox) * 0.19, (yy + oy) * 0.19, 3);
      const bias = corner ? 0.28 : 0.0;
      if (nv * 0.5 + 0.5 < organic * 0.55 + bias) g.set(xx, yy, T_VOID);
    }
  }

  // Alcoves — small bumps poking out of an edge, always attached to the core.
  const alcoves = rng.int(0, organic > 0.5 ? 2 : 1);
  for (let i = 0; i < alcoves; i++) {
    const side = rng.int(0, 3);
    const aw = rng.int(2, Math.max(2, Math.min(4, w - 3)));
    const ah = rng.int(2, Math.max(2, Math.min(4, h - 3)));
    if (side === 0) g.rect(x + rng.int(1, Math.max(1, w - aw - 1)), y - ah + 1, aw, ah, T_FLOOR);
    else if (side === 1) g.rect(x + rng.int(1, Math.max(1, w - aw - 1)), y + h - 1, aw, ah, T_FLOOR);
    else if (side === 2) g.rect(x - aw + 1, y + rng.int(1, Math.max(1, h - ah - 1)), aw, ah, T_FLOOR);
    else g.rect(x + w - 1, y + rng.int(1, Math.max(1, h - ah - 1)), aw, ah, T_FLOOR);
  }
}

/** L-shaped corridor with a random elbow and a chosen width. */
function carveCorridor(
  g: Grid,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  rng: Rng,
  value = T_FLOOR,
): void {
  const half = Math.max(0, Math.floor((width - 1) / 2));
  const extra = width - 1 - half;
  const hFirst = rng.chance(0.5);
  const paint = (x: number, y: number, horizontal: boolean): void => {
    if (horizontal) {
      for (let d = -half; d <= extra; d++) if (g.get(x, y + d) !== T_FLOOR || value !== T_FLOOR) g.set(x, y + d, value);
    } else {
      for (let d = -half; d <= extra; d++) if (g.get(x + d, y) !== T_FLOOR || value !== T_FLOOR) g.set(x + d, y, value);
    }
  };
  if (hFirst) {
    const step = ax < bx ? 1 : -1;
    for (let x = ax; x !== bx + step; x += step) paint(x, ay, true);
    const stepY = ay < by ? 1 : -1;
    for (let y = ay; y !== by + stepY; y += stepY) paint(bx, y, false);
  } else {
    const stepY = ay < by ? 1 : -1;
    for (let y = ay; y !== by + stepY; y += stepY) paint(ax, y, false);
    const step = ax < bx ? 1 : -1;
    for (let x = ax; x !== bx + step; x += step) paint(x, by, true);
  }
}

/** Distance between room centres, squared. */
function roomDist2(a: DungeonRoom, b: DungeonRoom): number {
  const dx = a.center.x - b.center.x;
  const dy = a.center.y - b.center.y;
  return dx * dx + dy * dy;
}

/**
 * Adds loop edges on top of a spanning structure. A pure tree dungeon forces
 * backtracking through the same corridor; loops are the single biggest lever on
 * how good exploration feels.
 */
function addLoops(
  g: Grid,
  rooms: DungeonRoom[],
  linked: Set<string>,
  rng: Rng,
  ratio: number,
  width: number,
): void {
  const pairs: Array<[DungeonRoom, DungeonRoom, number]> = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const key = `${rooms[i].id}:${rooms[j].id}`;
      if (linked.has(key)) continue;
      const d2 = roomDist2(rooms[i], rooms[j]);
      pairs.push([rooms[i], rooms[j], d2]);
    }
  }
  pairs.sort((a, b) => a[2] - b[2]);
  const want = Math.max(1, Math.round(rooms.length * ratio));
  let made = 0;
  for (const [a, b] of pairs) {
    if (made >= want) break;
    // Skip absurdly long shortcuts; they cut the level in half.
    if (roomDist2(a, b) > 46 * 46) continue;
    if (rng.chance(0.28)) continue;
    carveCorridor(g, a.center.x, a.center.y, b.center.x, b.center.y, width, rng);
    linked.add(`${a.id}:${b.id}`);
    made++;
  }
}

/** Multi-source BFS partition: assign every floor tile to its nearest anchor. */
function partitionByAnchors(g: Grid, anchors: Vec2[]): { owner: Int32Array } {
  const n = g.w * g.h;
  const owner = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  anchors.forEach((a, i) => {
    const idx = a.y * g.w + a.x;
    if (isWalkableValue(g.t[idx])) {
      owner[idx] = i;
      queue[tail++] = idx;
    }
  });
  while (head < tail) {
    const c = queue[head++];
    const oc = owner[c];
    const cx = c % g.w;
    const cy = (c / g.w) | 0;
    const step = (nb: number): void => {
      if (owner[nb] !== -1 || !isWalkableValue(g.t[nb])) return;
      owner[nb] = oc;
      queue[tail++] = nb;
    };
    if (cx > 0) step(c - 1);
    if (cx < g.w - 1) step(c + 1);
    if (cy > 0) step(c - g.w);
    if (cy < g.h - 1) step(c + g.w);
  }
  return { owner };
}

/** Pick well-spread anchor tiles from the walkable set. */
function spreadAnchors(g: Grid, rng: Rng, count: number, minDist: number): Vec2[] {
  const floors: number[] = [];
  for (let i = 0; i < g.t.length; i++) if (isWalkableValue(g.t[i])) floors.push(i);
  if (floors.length === 0) return [];
  rng.shuffle(floors);
  const picked: Vec2[] = [];
  const md2 = minDist * minDist;
  for (const idx of floors) {
    if (picked.length >= count) break;
    const x = idx % g.w;
    const y = (idx / g.w) | 0;
    let ok = true;
    for (const p of picked) {
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy < md2) {
        ok = false;
        break;
      }
    }
    if (ok) picked.push({ x, y });
  }
  // Guarantee at least one.
  if (picked.length === 0) {
    const idx = floors[0];
    picked.push({ x: idx % g.w, y: (idx / g.w) | 0 });
  }
  return picked;
}

/** Turn an anchor partition into rooms with real bounding boxes. */
function roomsFromPartition(g: Grid, anchors: Vec2[], minTiles: number): DungeonRoom[] {
  const { owner } = partitionByAnchors(g, anchors);
  const minX = new Int32Array(anchors.length).fill(1e9);
  const minY = new Int32Array(anchors.length).fill(1e9);
  const maxX = new Int32Array(anchors.length).fill(-1);
  const maxY = new Int32Array(anchors.length).fill(-1);
  const counts = new Int32Array(anchors.length);
  for (let i = 0; i < owner.length; i++) {
    const o = owner[i];
    if (o < 0) continue;
    const x = i % g.w;
    const y = (i / g.w) | 0;
    counts[o]++;
    if (x < minX[o]) minX[o] = x;
    if (y < minY[o]) minY[o] = y;
    if (x > maxX[o]) maxX[o] = x;
    if (y > maxY[o]) maxY[o] = y;
  }
  const rooms: DungeonRoom[] = [];
  for (let i = 0; i < anchors.length; i++) {
    if (counts[i] < minTiles) continue;
    // Shrink to a core box around the anchor: the raw partition bbox can be a
    // sprawling L that would make "in this room" meaningless.
    const cx = anchors[i].x;
    const cy = anchors[i].y;
    const rx = Math.min(cx - minX[i], maxX[i] - cx);
    const ry = Math.min(cy - minY[i], maxY[i] - cy);
    const hw = clamp(Math.round(rx * 0.85), 1, 14);
    const hh = clamp(Math.round(ry * 0.85), 1, 14);
    const r = makeRoom(cx - hw, cy - hh, hw * 2 + 1, hh * 2 + 1);
    r.center = { x: cx, y: cy };
    rooms.push(r);
  }
  return rooms;
}

// ---------------------------------------------------------------------------
// 1. rooms — BSP with organic shapes and looping corridors
// ---------------------------------------------------------------------------

interface BspNode {
  x: number;
  y: number;
  w: number;
  h: number;
  left?: BspNode;
  right?: BspNode;
  room?: DungeonRoom;
}

function layoutRooms(o: LayoutOpts): LayoutOut {
  resetRoomIds();
  const { width, height, rng } = o;
  const g = new Grid(width, height);
  const noise = new Noise(o.seed ^ 0x51ed);

  const minLeaf = 11;
  const root: BspNode = { x: 2, y: 2, w: width - 4, h: height - 4 };
  const leaves: BspNode[] = [];

  const split = (node: BspNode, depth: number): void => {
    const canSplitW = node.w >= minLeaf * 2 + 1;
    const canSplitH = node.h >= minLeaf * 2 + 1;
    if (depth > 6 || (!canSplitW && !canSplitH) || (depth > 2 && rng.chance(0.12))) {
      leaves.push(node);
      return;
    }
    let horizontal: boolean;
    if (canSplitW && canSplitH) horizontal = node.w / node.h > 1.25 ? false : node.h / node.w > 1.25 ? true : rng.chance(0.5);
    else horizontal = !canSplitW;

    if (horizontal) {
      const cut = rng.int(minLeaf, node.h - minLeaf);
      node.left = { x: node.x, y: node.y, w: node.w, h: cut };
      node.right = { x: node.x, y: node.y + cut, w: node.w, h: node.h - cut };
    } else {
      const cut = rng.int(minLeaf, node.w - minLeaf);
      node.left = { x: node.x, y: node.y, w: cut, h: node.h };
      node.right = { x: node.x + cut, y: node.y, w: node.w - cut, h: node.h };
    }
    split(node.left, depth + 1);
    split(node.right, depth + 1);
  };
  split(root, 0);

  const rooms: DungeonRoom[] = [];
  for (const leaf of leaves) {
    const pad = 2;
    const maxW = leaf.w - pad * 2;
    const maxH = leaf.h - pad * 2;
    if (maxW < 5 || maxH < 5) continue;
    const rw = rng.int(Math.max(5, Math.floor(maxW * 0.55)), maxW);
    const rh = rng.int(Math.max(5, Math.floor(maxH * 0.55)), maxH);
    const rx = leaf.x + pad + rng.int(0, maxW - rw);
    const ry = leaf.y + pad + rng.int(0, maxH - rh);
    carveOrganicRoom(g, rx, ry, rw, rh, rng, noise, rng.range(0.25, 0.75));
    const room = makeRoom(rx, ry, rw, rh);
    leaf.room = room;
    rooms.push(room);

    // Height character: a minority of rooms get a raised dais or sunken floor.
    const roll = rng.next();
    if (roll < 0.16 && rw >= 9 && rh >= 9) {
      const dw = Math.floor(rw * 0.5);
      const dh = Math.floor(rh * 0.5);
      g.rectHeight(rx + ((rw - dw) >> 1), ry + ((rh - dh) >> 1), dw, dh, 1);
    } else if (roll < 0.26 && rw >= 9 && rh >= 9) {
      g.rectHeight(rx + 2, ry + 2, rw - 4, rh - 4, -1);
    }
  }

  // Connect the BSP tree — guarantees a spanning structure.
  const linked = new Set<string>();
  const collect = (node: BspNode): DungeonRoom | undefined => {
    if (node.room) return node.room;
    const a = node.left ? collect(node.left) : undefined;
    const b = node.right ? collect(node.right) : undefined;
    if (a && b) {
      const width2 = rng.chance(0.3) ? 2 : 1;
      carveCorridor(g, a.center.x, a.center.y, b.center.x, b.center.y, width2, rng);
      linked.add(`${a.id}:${b.id}`);
      linked.add(`${b.id}:${a.id}`);
    }
    return a ?? b;
  };
  collect(root);

  addLoops(g, rooms, linked, rng, 0.42, 1);

  return { grid: g, rooms, kind: 'rooms' };
}

// ---------------------------------------------------------------------------
// 2. caves — cellular automata + guaranteed connectivity
// ---------------------------------------------------------------------------

function layoutCaves(o: LayoutOpts): LayoutOut {
  resetRoomIds();
  const { width, height, rng } = o;
  const g = new Grid(width, height);
  const noise = new Noise(o.seed ^ 0x0cave);

  const fill = 0.455;
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      // Bias toward open in the middle so the cave doesn't hug one corner.
      const nx = (x / width) * 2 - 1;
      const ny = (y / height) * 2 - 1;
      const edge = Math.max(Math.abs(nx), Math.abs(ny));
      const bias = edge > 0.82 ? 0.34 : 0;
      g.set(x, y, rng.next() > fill + bias ? T_FLOOR : T_VOID);
    }
  }

  const count8 = (src: Uint8Array, x: number, y: number, r: number): number => {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (src[ny * width + nx] === T_FLOOR) n++;
      }
    }
    return n;
  };

  for (let iter = 0; iter < 5; iter++) {
    const src = g.t.slice();
    for (let y = 3; y < height - 3; y++) {
      for (let x = 3; x < width - 3; x++) {
        const n1 = count8(src, x, y, 1);
        if (iter < 2) {
          const n2 = count8(src, x, y, 2);
          g.set(x, y, n1 >= 5 || n2 <= 3 ? T_FLOOR : T_VOID);
        } else {
          g.set(x, y, n1 >= 5 ? T_FLOOR : T_VOID);
        }
      }
    }
  }

  // Blow out a few large chambers so the cave has landmarks, not just worms.
  const chambers = rng.int(3, 5);
  for (let i = 0; i < chambers; i++) {
    const cx = rng.int(10, width - 11);
    const cy = rng.int(10, height - 11);
    const r = rng.range(4.5, 8.5);
    g.disc(cx, cy, r, r * rng.range(0.7, 1.15), T_FLOOR);
    // Cave floors undulate.
    for (let y = cy - 9; y <= cy + 9; y++) {
      for (let x = cx - 9; x <= cx + 9; x++) {
        if (!g.walkable(x, y)) continue;
        const nv = noise.fbm(x * 0.07, y * 0.07, 3);
        g.setHeight(x, y, Math.round(nv * 1.4));
      }
    }
  }

  // Underground pools in the deepest basins.
  const pools = rng.int(1, 3);
  for (let i = 0; i < pools; i++) {
    const cx = rng.int(8, width - 9);
    const cy = rng.int(8, height - 9);
    const r = rng.range(3, 6.5);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        if (g.get(x, y) === T_FLOOR) {
          g.set(x, y, T_WATER);
          g.setHeight(x, y, g.height(x, y) - 1);
        }
      }
    }
  }

  ensureConnected(g, []);
  removeDiagonalPinch(g);

  const anchors = spreadAnchors(g, rng, 12 + Math.min(6, Math.floor(o.depth / 8)), 11);
  const rooms = roomsFromPartition(g, anchors, 28);

  return { grid: g, rooms, kind: 'caves' };
}

// ---------------------------------------------------------------------------
// 3. maze — growing tree with braiding
// ---------------------------------------------------------------------------

function layoutMaze(o: LayoutOpts): LayoutOut {
  resetRoomIds();
  const { rng } = o;
  // Maze cells sit on odd coordinates.
  const width = o.width | 1;
  const height = o.height | 1;
  const g = new Grid(width, height);

  const cw = Math.floor((width - 3) / 2);
  const ch = Math.floor((height - 3) / 2);
  const visited = new Uint8Array(cw * ch);
  const cellX = (c: number): number => 2 + (c % cw) * 2;
  const cellY = (c: number): number => 2 + Math.floor(c / cw) * 2;

  const start = rng.int(0, cw * ch - 1);
  const active: number[] = [start];
  visited[start] = 1;
  g.set(cellX(start), cellY(start), T_FLOOR);

  // Newest-first with an occasional random pick: long snaking corridors punctuated
  // by branch points. Pure-random reads as noise, pure-newest as a single snake.
  while (active.length > 0) {
    const useNewest = rng.chance(0.72);
    const pick = useNewest ? active.length - 1 : rng.int(0, active.length - 1);
    const cur = active[pick];
    const cx = cur % cw;
    const cy = Math.floor(cur / cw);
    const dirs = rng.shuffle([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]);
    let advanced = false;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
      const nc = ny * cw + nx;
      if (visited[nc]) continue;
      visited[nc] = 1;
      g.set(cellX(nc), cellY(nc), T_FLOOR);
      g.set(cellX(cur) + dx, cellY(cur) + dy, T_FLOOR);
      active.push(nc);
      advanced = true;
      break;
    }
    if (!advanced) active.splice(pick, 1);
  }

  // Braid: remove most dead ends. A perfect maze is a chore; a braided one is a
  // place. Keep a few dead ends for treasure niches.
  const deadEnds: number[] = [];
  for (let c = 0; c < cw * ch; c++) {
    const x = cellX(c);
    const y = cellY(c);
    let n = 0;
    if (g.walkable(x + 1, y)) n++;
    if (g.walkable(x - 1, y)) n++;
    if (g.walkable(x, y + 1)) n++;
    if (g.walkable(x, y - 1)) n++;
    if (n === 1) deadEnds.push(c);
  }
  rng.shuffle(deadEnds);
  const keep = Math.max(2, Math.floor(deadEnds.length * 0.18));
  const niches: number[] = deadEnds.slice(0, keep);
  for (let i = keep; i < deadEnds.length; i++) {
    const c = deadEnds[i];
    const x = cellX(c);
    const y = cellY(c);
    const cx = c % cw;
    const cy = Math.floor(c / cw);
    const dirs = rng.shuffle([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]);
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
      if (g.walkable(x + dx, y + dy)) continue;
      g.set(x + dx, y + dy, T_FLOOR);
      break;
    }
  }

  // Chambers: clear blocks so the maze has rooms worth fighting in.
  const rooms: DungeonRoom[] = [];
  const chamberCount = rng.int(6, 10);
  const attempts = chamberCount * 8;
  for (let i = 0, made = 0; i < attempts && made < chamberCount; i++) {
    const rw = rng.int(5, 9) | 1;
    const rh = rng.int(5, 9) | 1;
    const rx = (2 + rng.int(0, Math.max(0, cw - Math.ceil(rw / 2))) * 2) | 0;
    const ry = (2 + rng.int(0, Math.max(0, ch - Math.ceil(rh / 2))) * 2) | 0;
    if (rx + rw >= width - 2 || ry + rh >= height - 2) continue;
    let overlaps = false;
    for (const r of rooms) {
      if (rx < r.x + r.w + 2 && rx + rw + 2 > r.x && ry < r.y + r.h + 2 && ry + rh + 2 > r.y) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    g.rect(rx, ry, rw, rh, T_FLOOR);
    if (rng.chance(0.3)) g.rectHeight(rx + 1, ry + 1, rw - 2, rh - 2, rng.chance(0.5) ? 1 : -1);
    rooms.push(makeRoom(rx, ry, rw, rh));
    made++;
  }

  // Turn kept dead ends into 1-tile treasure niches with a room record so the
  // spawner can find them.
  for (const c of niches.slice(0, 5)) {
    const x = cellX(c);
    const y = cellY(c);
    let overlaps = false;
    for (const r of rooms) {
      if (x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 1 && y <= r.y + r.h) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    rooms.push(makeRoom(x - 1, y - 1, 3, 3, 'treasure'));
  }

  return { grid: g, rooms, kind: 'maze' };
}

// ---------------------------------------------------------------------------
// 4. catacombs — dense chamber grid, crypt niches, long sightline halls
// ---------------------------------------------------------------------------

function layoutCatacombs(o: LayoutOpts): LayoutOut {
  resetRoomIds();
  const { width, height, rng } = o;
  const g = new Grid(width, height);

  const cell = 7; // 5-wide chamber + 2 wall
  const cols = Math.floor((width - 4) / cell);
  const rowsN = Math.floor((height - 4) / cell);
  const ox = Math.floor((width - cols * cell) / 2);
  const oy = Math.floor((height - rowsN * cell) / 2);

  // Long sightline halls: full-width / full-height corridors carved through
  // whole cell rows and columns. These are what make catacombs feel oppressive
  // — you can see a long way and everything on that line can see you.
  const hallRows = new Set<number>();
  const hallCols = new Set<number>();
  const hallRowCount = clamp(Math.floor(rowsN / 4), 1, 3);
  const hallColCount = clamp(Math.floor(cols / 4), 1, 3);
  for (let i = 0; i < hallRowCount; i++) hallRows.add(rng.int(1, Math.max(1, rowsN - 2)));
  for (let i = 0; i < hallColCount; i++) hallCols.add(rng.int(1, Math.max(1, cols - 2)));

  const rooms: DungeonRoom[] = [];
  const cellRoom: (DungeonRoom | null)[] = new Array(cols * rowsN).fill(null);

  for (let cy = 0; cy < rowsN; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const bx = ox + cx * cell + 1;
      const by = oy + cy * cell + 1;
      if (hallRows.has(cy) || hallCols.has(cx)) continue;
      // A few cells stay solid — the necropolis is not a perfect grid.
      if (rng.chance(0.08) && cx > 0 && cy > 0 && cx < cols - 1 && cy < rowsN - 1) continue;
      const rw = rng.chance(0.25) ? 5 : 4;
      const rh = rng.chance(0.25) ? 5 : 4;
      g.rect(bx, by, rw, rh, T_FLOOR);
      const room = makeRoom(bx, by, rw, rh);
      rooms.push(room);
      cellRoom[cy * cols + cx] = room;

      // Crypt niches — 1-tile recesses in the chamber walls for sarcophagi.
      const nicheSides = rng.int(1, 3);
      for (let s = 0; s < nicheSides; s++) {
        const side = rng.int(0, 3);
        if (side === 0) g.set(bx + rng.int(1, rw - 2), by - 1, T_FLOOR);
        else if (side === 1) g.set(bx + rng.int(1, rw - 2), by + rh, T_FLOOR);
        else if (side === 2) g.set(bx - 1, by + rng.int(1, rh - 2), T_FLOOR);
        else g.set(bx + rw, by + rng.int(1, rh - 2), T_FLOOR);
      }
      if (rng.chance(0.18)) g.rectHeight(bx, by, rw, rh, 1);
    }
  }

  // Carve the halls, 3 tiles wide, spanning the whole grid.
  for (const cy of hallRows) {
    const y = oy + cy * cell + 2;
    g.rect(3, y - 1, width - 6, 3, T_FLOOR);
    rooms.push(makeRoom(3, y - 1, width - 6, 3));
  }
  for (const cx of hallCols) {
    const x = ox + cx * cell + 2;
    g.rect(x - 1, 3, 3, height - 6, T_FLOOR);
    rooms.push(makeRoom(x - 1, 3, 3, height - 6));
  }

  // Spanning connectivity over the chamber grid (randomised Prim), then extra
  // doors for loops.
  const inTree = new Uint8Array(cols * rowsN);
  const frontier: Array<[number, number]> = [];
  let seedCell = -1;
  for (let i = 0; i < cellRoom.length; i++) if (cellRoom[i]) { seedCell = i; break; }
  const openBetween = (a: number, b: number): void => {
    const ax = a % cols;
    const ay = Math.floor(a / cols);
    const bx2 = b % cols;
    const by2 = Math.floor(b / cols);
    const ra = cellRoom[a];
    const rb = cellRoom[b];
    if (!ra || !rb) return;
    const mx = Math.floor((ra.center.x + rb.center.x) / 2);
    const my = Math.floor((ra.center.y + rb.center.y) / 2);
    if (ax === bx2) {
      g.set(mx, my, T_FLOOR);
      g.set(mx, my + (by2 > ay ? -1 : 1), T_FLOOR);
      g.set(mx, my + (by2 > ay ? 1 : -1), T_FLOOR);
    } else {
      g.set(mx, my, T_FLOOR);
      g.set(mx + (bx2 > ax ? -1 : 1), my, T_FLOOR);
      g.set(mx + (bx2 > ax ? 1 : -1), my, T_FLOOR);
    }
    carveCorridor(g, ra.center.x, ra.center.y, rb.center.x, rb.center.y, 1, rng);
  };
  if (seedCell >= 0) {
    inTree[seedCell] = 1;
    const pushEdges = (c: number): void => {
      const cx = c % cols;
      const cy = Math.floor(c / cols);
      const nbs = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];
      for (const [nx, ny] of nbs) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rowsN) continue;
        const nc = ny * cols + nx;
        if (!cellRoom[nc] || inTree[nc]) continue;
        frontier.push([c, nc]);
      }
    };
    pushEdges(seedCell);
    while (frontier.length > 0) {
      const i = rng.int(0, frontier.length - 1);
      const [a, b] = frontier[i];
      frontier.splice(i, 1);
      if (inTree[b]) continue;
      inTree[b] = 1;
      openBetween(a, b);
      pushEdges(b);
    }
  }

  // Loop doors.
  for (let cy = 0; cy < rowsN; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cy * cols + cx;
      if (!cellRoom[c]) continue;
      if (cx + 1 < cols && cellRoom[c + 1] && rng.chance(0.45)) openBetween(c, c + 1);
      if (cy + 1 < rowsN && cellRoom[c + cols] && rng.chance(0.45)) openBetween(c, c + cols);
    }
  }

  // Stitch chambers into the halls.
  for (const r of rooms) {
    if (r.w > 12 || r.h > 12) continue;
    let nearestHall: DungeonRoom | null = null;
    let best = Infinity;
    for (const h of rooms) {
      if (h.w <= 12 && h.h <= 12) continue;
      const d = roomDist2(r, h);
      if (d < best) {
        best = d;
        nearestHall = h;
      }
    }
    if (nearestHall && best < 30 * 30 && rng.chance(0.72)) {
      carveCorridor(g, r.center.x, r.center.y, nearestHall.center.x, nearestHall.center.y, 1, rng);
    }
  }

  return { grid: g, rooms, kind: 'catacombs' };
}

// ---------------------------------------------------------------------------
// 5. ruins — big open ground, collapsed structures, rubble, chasms
// ---------------------------------------------------------------------------

function layoutRuins(o: LayoutOpts): LayoutOut {
  resetRoomIds();
  const { width, height, rng } = o;
  const g = new Grid(width, height);
  const noise = new Noise(o.seed ^ 0x8121);

  // The open ground: a large noise-bounded blob covering most of the grid.
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.42;
  const ry = height * 0.42;
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      const edge = noise.fbm(x * 0.055, y * 0.055, 4) * 0.32;
      if (d + edge < 1) {
        g.set(x, y, T_FLOOR);
        g.setHeight(x, y, Math.round(noise.fbm(x * 0.04 + 40, y * 0.04, 3) * 1.2));
      }
    }
  }

  // Collapsed structures: rectangular footprints whose walls are mostly gone.
  const rooms: DungeonRoom[] = [];
  const buildings = rng.int(6, 10);
  for (let i = 0; i < buildings; i++) {
    const bw = rng.int(9, 17);
    const bh = rng.int(9, 17);
    const bx = rng.int(5, Math.max(6, width - bw - 5));
    const by = rng.int(5, Math.max(6, height - bh - 5));
    if (g.countFloorIn(bx, by, bw, bh) < bw * bh * 0.55) continue;
    let overlaps = false;
    for (const r of rooms) {
      if (bx < r.x + r.w + 3 && bx + bw + 3 > r.x && by < r.y + r.h + 3 && by + bh + 3 > r.y) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    // Interior floor, raised like a foundation slab.
    g.rect(bx, by, bw, bh, T_FLOOR);
    g.rectHeight(bx, by, bw, bh, 1);

    // Broken perimeter: wall segments with gaps.
    const wallRing = (x: number, y: number): void => {
      if (rng.chance(0.42)) return; // collapsed
      g.set(x, y, T_VOID);
    };
    for (let x = bx - 1; x <= bx + bw; x++) {
      wallRing(x, by - 1);
      wallRing(x, by + bh);
    }
    for (let y = by - 1; y <= by + bh; y++) {
      wallRing(bx - 1, y);
      wallRing(bx + bw, y);
    }
    // Interior partitions, also broken.
    if (bw > 12 && rng.chance(0.6)) {
      const px = bx + Math.floor(bw / 2);
      for (let y = by; y < by + bh; y++) if (rng.chance(0.62)) g.set(px, y, T_VOID);
    }
    if (bh > 12 && rng.chance(0.6)) {
      const py = by + Math.floor(bh / 2);
      for (let x = bx; x < bx + bw; x++) if (rng.chance(0.62)) g.set(x, py, T_VOID);
    }
    rooms.push(makeRoom(bx, by, bw, bh));
  }

  // Rubble fields — walkable but slow, and visually chaotic.
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      if (g.get(x, y) !== T_FLOOR) continue;
      const n = noise.warp(x * 0.06, y * 0.06, 1.4, 4);
      if (n > 0.34) g.set(x, y, T_RUBBLE);
    }
  }

  // Chasms where the ground gave way. Non-walkable; connectivity repair will
  // route around or bridge them.
  const chasms = rng.int(2, 4);
  for (let i = 0; i < chasms; i++) {
    const px = rng.int(8, width - 9);
    const py = rng.int(8, height - 9);
    const pr = rng.range(3.5, 7);
    for (let y = Math.floor(py - pr - 1); y <= py + pr + 1; y++) {
      for (let x = Math.floor(px - pr - 1); x <= px + pr + 1; x++) {
        const dx = x - px;
        const dy = y - py;
        const wob = noise.fbm(x * 0.13 + 9, y * 0.13, 3) * 1.6;
        if (Math.sqrt(dx * dx + dy * dy) + wob > pr) continue;
        const v = g.get(x, y);
        if (v === T_FLOOR || v === T_RUBBLE) g.set(x, y, T_CHASM);
      }
    }
  }

  // Open-air courtyards inside the ruin field give the spawner arena space.
  const courts = rng.int(2, 3);
  for (let i = 0; i < courts; i++) {
    const px = rng.int(10, width - 11);
    const py = rng.int(10, height - 11);
    const pr = rng.range(5, 8);
    g.disc(px, py, pr, pr * rng.range(0.8, 1.2), T_FLOOR);
    rooms.push(makeRoom(Math.round(px - pr), Math.round(py - pr), Math.round(pr * 2), Math.round(pr * 2)));
  }

  ensureConnected(g, rooms);
  return { grid: g, rooms, kind: 'ruins' };
}

// ---------------------------------------------------------------------------
// 6. arena — one dominant chamber with satellite approaches
// ---------------------------------------------------------------------------

function layoutArena(o: LayoutOpts): LayoutOut {
  resetRoomIds();
  const { width, height, rng } = o;
  const g = new Grid(width, height);
  const noise = new Noise(o.seed ^ 0xa2e4);

  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) * 0.31;

  // Octagonal-ish main chamber with a noise-perturbed rim.
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      const lobe = Math.cos(ang * 8) * 0.035 + noise.fbm(Math.cos(ang) * 2, Math.sin(ang) * 2, 3) * 0.06;
      if (d < R * (1 + lobe)) g.set(x, y, T_FLOOR);
    }
  }

  // Tiered arena floor: outer ring, mid step, raised central platform. Height is
  // what makes a boss room read as a stage instead of a parking lot.
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      if (!g.walkable(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < R * 0.34) g.setHeight(x, y, 2);
      else if (d < R * 0.62) g.setHeight(x, y, 1);
      else g.setHeight(x, y, 0);
    }
  }

  const rooms: DungeonRoom[] = [];
  const arena = makeRoom(
    Math.round(cx - R),
    Math.round(cy - R),
    Math.round(R * 2),
    Math.round(R * 2),
    'boss',
  );
  arena.center = { x: Math.round(cx), y: Math.round(cy) };
  rooms.push(arena);

  // Satellites on a ring, joined to the arena by wide approaches and to each
  // other by a perimeter loop.
  const satCount = rng.int(4, 6);
  const startAng = rng.range(0, Math.PI * 2);
  const sats: DungeonRoom[] = [];
  for (let i = 0; i < satCount; i++) {
    const ang = startAng + (i / satCount) * Math.PI * 2;
    const dist = R + rng.range(9, 14);
    const sx = Math.round(cx + Math.cos(ang) * dist);
    const sy = Math.round(cy + Math.sin(ang) * dist);
    const sw = rng.int(7, 11);
    const sh = rng.int(7, 11);
    const rx = clamp(sx - (sw >> 1), 3, width - sw - 3);
    const ry = clamp(sy - (sh >> 1), 3, height - sh - 3);
    carveOrganicRoom(g, rx, ry, sw, sh, rng, noise, 0.35);
    const room = makeRoom(rx, ry, sw, sh);
    rooms.push(room);
    sats.push(room);
    carveCorridor(g, room.center.x, room.center.y, Math.round(cx), Math.round(cy), 3, rng);
  }
  for (let i = 0; i < sats.length; i++) {
    const a = sats[i];
    const b = sats[(i + 1) % sats.length];
    if (rng.chance(0.65)) carveCorridor(g, a.center.x, a.center.y, b.center.x, b.center.y, 2, rng);
  }

  return { grid: g, rooms, kind: 'arena' };
}

// ---------------------------------------------------------------------------
// 7. spiral — descending concentric rings joined by ramps
// ---------------------------------------------------------------------------

function layoutSpiral(o: LayoutOpts): LayoutOut {
  resetRoomIds();
  const { width, height, rng } = o;
  const g = new Grid(width, height);
  const noise = new Noise(o.seed ^ 0x5717);

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) * 0.44;
  const ringWidth = 3.4;
  const gap = 6.5;
  const ringCount = Math.max(3, Math.floor((maxR - 7) / gap));

  const rooms: DungeonRoom[] = [];
  const radii: number[] = [];
  for (let i = 0; i < ringCount; i++) radii.push(maxR - i * gap);

  const aspect = width / height;
  const distTo = (x: number, y: number): number => {
    const dx = (x - cx) / aspect;
    const dy = y - cy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Rings.
  for (let i = 0; i < ringCount; i++) {
    const r = radii[i];
    const level = -i;
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const d = distTo(x, y);
        const wob = noise.fbm(x * 0.06, y * 0.06, 3) * 0.9;
        if (Math.abs(d - r + wob) < ringWidth * 0.5) {
          g.set(x, y, T_FLOOR);
          g.setHeight(x, y, level);
        }
      }
    }
  }

  // Central chamber, the lowest point of the descent.
  const coreR = radii[ringCount - 1] - gap * 0.35;
  const coreLevel = -(ringCount - 1) - 1;
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      if (distTo(x, y) < Math.max(4, coreR)) {
        g.set(x, y, T_FLOOR);
        g.setHeight(x, y, coreLevel);
      }
    }
  }
  const core = makeRoom(
    Math.round(cx - coreR * aspect),
    Math.round(cy - coreR),
    Math.round(coreR * 2 * aspect),
    Math.round(coreR * 2),
    'vault',
  );
  core.center = { x: Math.round(cx), y: Math.round(cy) };
  rooms.push(core);

  // Ramps: radial connectors between consecutive rings, rotating so the descent
  // spirals instead of dropping straight down one side.
  let ang = rng.range(0, Math.PI * 2);
  for (let i = 0; i < ringCount; i++) {
    const rOuter = radii[i];
    const rInner = i + 1 < ringCount ? radii[i + 1] : Math.max(4, coreR);
    const levelOuter = -i;
    const levelInner = i + 1 < ringCount ? -(i + 1) : coreLevel;
    const steps = Math.ceil((rOuter - rInner) * 2.5);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const rr = rOuter + (rInner - rOuter) * t;
      const px = cx + Math.cos(ang) * rr * aspect;
      const py = cy + Math.sin(ang) * rr;
      const lv = levelOuter + (levelInner - levelOuter) * t;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = Math.round(px) + dx;
          const y = Math.round(py) + dy;
          if (dx * dx + dy * dy > 5) continue;
          if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) continue;
          g.set(x, y, T_FLOOR);
          g.setHeight(x, y, lv);
        }
      }
    }
    // Landing chamber where the ramp meets the inner ring.
    const lx = Math.round(cx + Math.cos(ang) * rInner * aspect);
    const ly = Math.round(cy + Math.sin(ang) * rInner);
    const lw = rng.int(6, 9);
    const lh = rng.int(6, 9);
    const rx = clamp(lx - (lw >> 1), 3, width - lw - 3);
    const ry = clamp(ly - (lh >> 1), 3, height - lh - 3);
    g.rect(rx, ry, lw, lh, T_FLOOR);
    g.rectHeight(rx, ry, lw, lh, levelInner);
    rooms.push(makeRoom(rx, ry, lw, lh));
    ang += rng.range(1.7, 2.6);
  }

  // A couple of alcoves hanging off the outer ring for treasure.
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = radii[0];
    const px = clamp(Math.round(cx + Math.cos(a) * r * aspect), 5, width - 6);
    const py = clamp(Math.round(cy + Math.sin(a) * r), 5, height - 6);
    g.rect(px - 2, py - 2, 5, 5, T_FLOOR);
    g.rectHeight(px - 2, py - 2, 5, 5, 0);
    rooms.push(makeRoom(px - 2, py - 2, 5, 5, i === 0 ? 'treasure' : 'normal'));
  }

  return { grid: g, rooms, kind: 'spiral' };
}

// ---------------------------------------------------------------------------
// Diagnostics — used by tests and the debug overlay
// ---------------------------------------------------------------------------

export interface LayoutReport {
  walkable: number;
  components: number;
  diagonalPinches: number;
  unreachableRooms: number;
}

/** Verifies the invariants every layout must satisfy. */
export function auditLayout(g: Grid, rooms: DungeonRoom[], entry: Vec2): LayoutReport {
  const { labels, sizes } = labelComponents(g);
  let walkable = 0;
  for (let i = 0; i < g.t.length; i++) if (isWalkableValue(g.t[i])) walkable++;

  let pinches = 0;
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (!g.walkable(x, y)) continue;
      if (g.walkable(x + 1, y + 1) && !g.walkable(x + 1, y) && !g.walkable(x, y + 1)) pinches++;
      if (g.walkable(x + 1, y - 1) && !g.walkable(x + 1, y) && !g.walkable(x, y - 1)) pinches++;
    }
  }

  const entryLabel = labels[entry.y * g.w + entry.x];
  let unreachable = 0;
  for (const r of rooms) {
    let reached = false;
    for (let y = r.y; y < r.y + r.h && !reached; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (g.walkable(x, y) && labels[y * g.w + x] === entryLabel) {
          reached = true;
          break;
        }
      }
    }
    if (!reached) unreachable++;
  }

  return { walkable, components: sizes.length, diagonalPinches: pinches, unreachableRooms: unreachable };
}

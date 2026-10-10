/**
 * SLAY — tile values, the working grid, and the shared post-process passes.
 *
 * The shapes themselves are drawn by the zone generators in `zones/` (map
 * remake, docs/remake/maps.md); `zones/Area.ts` pastes zones into one area and
 * runs the passes here (diagonal pinches, stray floor, room links, doors,
 * height smoothing) as part of its own finalise.
 *
 * Nothing in here touches THREE. Layouts are pure data.
 */

import type { DungeonRoom, Rng, Vec2 } from '../types';
import { clamp } from '../art/Noise';

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
  exit: 7,
  arrival: 8,
  rubble: 9,
  ruin: 10,
  deepWater: 11,
  bridge: 12,
  ice: 13,
} as const;

export const T_VOID = 0;
export const T_FLOOR = 1;
export const T_WALL = 2;
export const T_DOOR = 3;
export const T_WATER = 4;
export const T_LAVA = 5;
export const T_CHASM = 6;
/** The way on: into the next area, or home from the arena. Walkable. */
export const T_EXIT = 7;
/** Where the hero lands in an area. Walkable. */
export const T_ARRIVAL = 8;
/** @deprecated Old names, kept only until Props.ts (ground) moves to T_EXIT and T_ARRIVAL. */
export const T_STAIRS_DOWN = T_EXIT;
/** @deprecated See T_STAIRS_DOWN. */
export const T_STAIRS_UP = T_ARRIVAL;
export const T_RUBBLE = 9;
/** Masonry standing in the open. Blocks. */
export const T_RUIN = 10;
/** Water too deep to wade. Blocks. */
export const T_DEEP_WATER = 11;
/** Boardwalk or bridge. Walkable. */
export const T_BRIDGE = 12;
/** Frozen pond. Walkable. */
export const T_ICE = 13;

/**
 * The old kind a tile is drawn as by a builder that does not know it yet
 * (maps -> ground contract in CONTRACTS.md). Blocking kinds map to a blocking
 * look, walkable kinds to floor, so nothing is ever invisible or walk-through.
 * Unknown values come back as wall.
 */
export function drawAsKind(v: number): number {
  if (v <= T_RUBBLE) return v;
  switch (v) {
    case T_RUIN:
      return T_WALL;
    case T_DEEP_WATER:
      return T_WATER;
    case T_BRIDGE:
    case T_ICE:
      return T_FLOOR;
    default:
      return T_WALL;
  }
}

/** Tiles an entity may stand on. Water and rubble are passable but slow. */
export function isWalkableValue(v: number): boolean {
  return (
    v === T_FLOOR ||
    v === T_DOOR ||
    v === T_WATER ||
    v === T_RUBBLE ||
    v === T_EXIT ||
    v === T_ARRIVAL ||
    v === T_BRIDGE ||
    v === T_ICE
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
// Post-process passes
// ---------------------------------------------------------------------------

/** Nothing walkable may touch the grid border — the shell needs room for walls. */
export function sealBorder(g: Grid): void {
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
export function pruneStrayFloor(g: Grid): void {
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

/** Height field must not jump more than one step between adjacent walkables. */
export function smoothHeights(g: Grid): void {
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
// Audit
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

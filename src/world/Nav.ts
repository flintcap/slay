/**
 * SLAY — navigation.
 *
 * A* over the tile grid, sized to run for 60+ enemies every frame:
 *
 *  - Flat typed arrays for g/f/parent, plus a *generation stamp* so a new search
 *    never has to clear them. Clearing a 16k-entry array 60 times a frame is the
 *    thing that kills naive pathfinders.
 *  - A binary heap keyed on f, backed by an Int32Array of node indices.
 *  - Octile heuristic with 8-way movement and corner-cut prevention, so agents
 *    never clip a wall diagonally.
 *  - String-pulling smoothing over a supercover Bresenham line-of-sight test,
 *    which turns the staircase A* output into the two or three waypoints an
 *    agent actually needs.
 *  - A small LRU cache keyed on (from tile, to tile). Packs converge on the same
 *    target constantly, so the hit rate is high in exactly the case that matters.
 *
 * Public coordinates: `path`, `lineOfSight` and `clampToWalkable` speak **world
 * space** (Vec2.x = world x, Vec2.y = world z). `walkable` speaks **tile space**,
 * matching `isWalkable(level, x, y)`. `walkableWorld` is the world-space variant.
 */

import type { DungeonLevel, Vec2 } from '../types';
import { TILE_SIZE } from './DungeonGen';
import { isWalkableValue, tileCost } from './Layouts';

const SQRT2 = Math.SQRT2;
/** Hard ceiling on expanded nodes, so one pathological request cannot stall a frame. */
const NODE_BUDGET = 6000;
const CACHE_LIMIT = 256;

/** Binary min-heap over node indices, ordered by an external f array. */
class Heap {
  private data: Int32Array;
  private size = 0;
  private readonly f: Float64Array;

  constructor(capacity: number, f: Float64Array) {
    this.data = new Int32Array(Math.max(64, capacity));
    this.f = f;
  }

  clear(): void {
    this.size = 0;
  }

  get length(): number {
    return this.size;
  }

  push(node: number): void {
    if (this.size >= this.data.length) {
      const grown = new Int32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    let i = this.size++;
    this.data[i] = node;
    const f = this.f;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (f[this.data[parent]] <= f[this.data[i]]) break;
      const t = this.data[parent];
      this.data[parent] = this.data[i];
      this.data[i] = t;
      i = parent;
    }
  }

  pop(): number {
    const top = this.data[0];
    this.size--;
    if (this.size > 0) {
      this.data[0] = this.data[this.size];
      const f = this.f;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < this.size && f[this.data[l]] < f[this.data[best]]) best = l;
        if (r < this.size && f[this.data[r]] < f[this.data[best]]) best = r;
        if (best === i) break;
        const t = this.data[best];
        this.data[best] = this.data[i];
        this.data[i] = t;
        i = best;
      }
    }
    return top;
  }
}

export class NavGrid {
  readonly width: number;
  readonly height: number;
  readonly level: DungeonLevel;

  /** 0 = blocked. Otherwise the per-tile movement cost multiplier. */
  private readonly cost: Float32Array;
  /** Dynamic blockers (props, doors that are shut) layered on top of the tiles. */
  private readonly blockers: Uint8Array;

  private readonly g: Float64Array;
  private readonly f: Float64Array;
  private readonly parent: Int32Array;
  private readonly stamp: Int32Array;
  private readonly closed: Uint8Array;
  private generation = 0;
  private readonly heap: Heap;

  private readonly cache = new Map<number, Vec2[]>();

  private readonly halfW: number;
  private readonly halfH: number;

  constructor(level: DungeonLevel) {
    this.level = level;
    this.width = level.width;
    this.height = level.height;
    const n = this.width * this.height;
    this.halfW = this.width / 2;
    this.halfH = this.height / 2;

    this.cost = new Float32Array(n);
    this.blockers = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const v = level.tiles[i];
      this.cost[i] = isWalkableValue(v) ? tileCost(v) : 0;
    }

    this.g = new Float64Array(n);
    this.f = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.heap = new Heap(Math.min(n, 4096), this.f);
  }

  // --- coordinate helpers -------------------------------------------------

  /** World position of a tile centre (x,z as Vec2.x,Vec2.y). */
  tileToWorld(x: number, y: number): Vec2 {
    return { x: (x - this.halfW + 0.5) * TILE_SIZE, y: (y - this.halfH + 0.5) * TILE_SIZE };
  }

  /** Tile containing a world position. */
  worldToTile(wx: number, wz: number): Vec2 {
    return { x: Math.floor(wx / TILE_SIZE + this.halfW), y: Math.floor(wz / TILE_SIZE + this.halfH) };
  }

  // --- queries ------------------------------------------------------------

  /** Tile-space walkability, including dynamic blockers. */
  walkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const i = y * this.width + x;
    return this.cost[i] > 0 && this.blockers[i] === 0;
  }

  /** World-space walkability. */
  walkableWorld(wx: number, wz: number): boolean {
    const t = this.worldToTile(wx, wz);
    return this.walkable(t.x, t.y);
  }

  /** Movement cost multiplier at a tile; Infinity when blocked. */
  costAt(x: number, y: number): number {
    if (!this.walkable(x, y)) return Infinity;
    return this.cost[y * this.width + x];
  }

  /**
   * Marks a tile blocked/unblocked at runtime — used for prop colliders, closed
   * gates and boss-arena shutters. Invalidates the path cache.
   */
  setBlocked(x: number, y: number, blocked: boolean): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    const v = blocked ? 1 : 0;
    if (this.blockers[i] === v) return;
    this.blockers[i] = v;
    this.cache.clear();
  }

  /** Bulk blocker application from prop placements. */
  blockTiles(tiles: Array<{ x: number; y: number }>): void {
    for (const t of tiles) {
      if (t.x < 0 || t.y < 0 || t.x >= this.width || t.y >= this.height) continue;
      this.blockers[t.y * this.width + t.x] = 1;
    }
    this.cache.clear();
  }

  /**
   * Supercover Bresenham between two **world** points. Returns false the moment
   * the line touches a blocked tile, including the two tiles a diagonal step
   * squeezes between — otherwise agents shoot through wall corners.
   */
  lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const a = this.worldToTile(ax, ay);
    const b = this.worldToTile(bx, by);
    return this.tileLineOfSight(a.x, a.y, b.x, b.y);
  }

  /** Tile-space line of sight. */
  tileLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    if (!this.walkable(x0, y0) || !this.walkable(x1, y1)) return false;
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let guard = dx + dy + 2;

    while (guard-- > 0) {
      if (x === x1 && y === y1) return true;
      const e2 = 2 * err;
      let stepX = false;
      let stepY = false;
      if (e2 > -dy) {
        err -= dy;
        stepX = true;
      }
      if (e2 < dx) {
        err += dx;
        stepY = true;
      }
      if (stepX && stepY) {
        // Diagonal: both shoulders must be open.
        if (!this.walkable(x + sx, y) || !this.walkable(x, y + sy)) return false;
        x += sx;
        y += sy;
      } else if (stepX) {
        x += sx;
      } else if (stepY) {
        y += sy;
      } else {
        return false;
      }
      if (!this.walkable(x, y)) return false;
    }
    return false;
  }

  /** Nearest walkable tile centre to a **world** point, as a world position. */
  clampToWalkable(x: number, y: number): Vec2 {
    const t = this.worldToTile(x, y);
    const found = this.nearestWalkableTile(t.x, t.y);
    return this.tileToWorld(found.x, found.y);
  }

  /** Nearest walkable tile, in tile space. Spiral search with a bounded radius. */
  nearestWalkableTile(tx: number, ty: number): Vec2 {
    const cx = Math.max(0, Math.min(this.width - 1, tx));
    const cy = Math.max(0, Math.min(this.height - 1, ty));
    if (this.walkable(cx, cy)) return { x: cx, y: cy };
    const maxR = Math.max(this.width, this.height);
    for (let r = 1; r < maxR; r++) {
      for (let d = -r; d <= r; d++) {
        const candidates: Array<[number, number]> = [
          [cx + d, cy - r],
          [cx + d, cy + r],
          [cx - r, cy + d],
          [cx + r, cy + d],
        ];
        for (const [x, y] of candidates) {
          if (this.walkable(x, y)) return { x, y };
        }
      }
    }
    return { x: cx, y: cy };
  }

  // --- pathfinding --------------------------------------------------------

  /**
   * A* between two **world** points. Returns smoothed world-space waypoints,
   * excluding the start and ending exactly on the requested destination when it
   * is reachable. An empty array means no path.
   */
  path(from: Vec2, to: Vec2): Vec2[] {
    const a = this.nearestWalkableTile(...tilePair(this.worldToTile(from.x, from.y)));
    const b = this.nearestWalkableTile(...tilePair(this.worldToTile(to.x, to.y)));
    const startIdx = a.y * this.width + a.x;
    const goalIdx = b.y * this.width + b.x;
    if (startIdx === goalIdx) return [];

    const key = startIdx * 1048576 + goalIdx;
    const cached = this.cache.get(key);
    if (cached) {
      // Refresh LRU ordering.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.map((p) => ({ x: p.x, y: p.y }));
    }

    const tiles = this.searchTiles(startIdx, goalIdx);
    if (tiles.length === 0) return [];

    const smoothed = this.smooth(tiles);
    const world = smoothed.map((i) => this.tileToWorld(i % this.width, (i / this.width) | 0));

    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(key, world);
    return world.map((p) => ({ x: p.x, y: p.y }));
  }

  /** Tile-space A*, returns the raw node chain from start (exclusive) to goal. */
  private searchTiles(startIdx: number, goalIdx: number): number[] {
    const gen = ++this.generation;
    const { width, height, cost, blockers, g, f, parent, stamp, closed, heap } = this;
    heap.clear();

    const gx = goalIdx % width;
    const gy = (goalIdx / width) | 0;

    stamp[startIdx] = gen;
    closed[startIdx] = 0;
    g[startIdx] = 0;
    f[startIdx] = heuristic(startIdx % width, (startIdx / width) | 0, gx, gy);
    parent[startIdx] = -1;
    heap.push(startIdx);

    let expanded = 0;
    let bestNode = startIdx;
    let bestH = f[startIdx];

    while (heap.length > 0) {
      const current = heap.pop();
      if (closed[current] === 1 && stamp[current] === gen) continue;
      closed[current] = 1;
      stamp[current] = gen;

      if (current === goalIdx) return this.reconstruct(current);
      if (++expanded > NODE_BUDGET) break;

      const cx = current % width;
      const cy = (current / width) | 0;
      const h = heuristic(cx, cy, gx, gy);
      if (h < bestH) {
        bestH = h;
        bestNode = current;
      }

      for (let d = 0; d < 8; d++) {
        const dx = DX[d];
        const dy = DY[d];
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        const c = cost[ni];
        if (c <= 0 || blockers[ni] !== 0) continue;

        const diagonal = dx !== 0 && dy !== 0;
        if (diagonal) {
          // Both shoulders must be open or the agent clips the corner.
          const s1 = cy * width + nx;
          const s2 = ny * width + cx;
          if (cost[s1] <= 0 || blockers[s1] !== 0) continue;
          if (cost[s2] <= 0 || blockers[s2] !== 0) continue;
        }

        const step = (diagonal ? SQRT2 : 1) * c;
        const tentative = g[current] + step;
        const fresh = stamp[ni] !== gen;
        if (!fresh && closed[ni] === 1) continue;
        if (fresh || tentative < g[ni]) {
          stamp[ni] = gen;
          closed[ni] = 0;
          g[ni] = tentative;
          f[ni] = tentative + heuristic(nx, ny, gx, gy);
          parent[ni] = current;
          heap.push(ni);
        }
      }
    }

    // Unreachable or out of budget: walk toward the closest node we found, which
    // keeps enemies moving sensibly instead of freezing at a wall.
    if (bestNode !== startIdx) return this.reconstruct(bestNode);
    return [];
  }

  private reconstruct(endIdx: number): number[] {
    const out: number[] = [];
    let cur = endIdx;
    let guard = 0;
    const limit = this.width * this.height;
    while (cur !== -1 && guard++ < limit) {
      out.push(cur);
      cur = this.parent[cur];
    }
    out.pop(); // drop the start tile
    out.reverse();
    return out;
  }

  /**
   * String-pulling: keep only the corners. Walk the chain and advance the
   * lookahead as long as the anchor can still see it.
   */
  private smooth(chain: number[]): number[] {
    if (chain.length <= 2) return chain;
    const out: number[] = [];
    let anchorX = -1;
    let anchorY = -1;
    // The anchor starts at the tile before the chain (the agent's own tile).
    const first = chain[0];
    const startParent = this.parent[first];
    if (startParent >= 0) {
      anchorX = startParent % this.width;
      anchorY = (startParent / this.width) | 0;
    } else {
      anchorX = first % this.width;
      anchorY = (first / this.width) | 0;
    }

    let i = 0;
    while (i < chain.length) {
      // Find the furthest node still visible from the anchor.
      let far = i;
      for (let j = chain.length - 1; j > i; j--) {
        const nx = chain[j] % this.width;
        const ny = (chain[j] / this.width) | 0;
        if (this.tileLineOfSight(anchorX, anchorY, nx, ny)) {
          far = j;
          break;
        }
      }
      out.push(chain[far]);
      anchorX = chain[far] % this.width;
      anchorY = (chain[far] / this.width) | 0;
      if (far === i) i++;
      else i = far + 1;
    }
    // Always terminate exactly on the goal.
    const goal = chain[chain.length - 1];
    if (out[out.length - 1] !== goal) out.push(goal);
    return out;
  }

  /** Drops every cached path — call after the level changes shape. */
  invalidate(): void {
    this.cache.clear();
  }
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Octile distance — admissible for 8-way movement with sqrt(2) diagonals. */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx > dy ? dx + (SQRT2 - 1) * dy : dy + (SQRT2 - 1) * dx;
}

function tilePair(v: Vec2): [number, number] {
  return [v.x, v.y];
}

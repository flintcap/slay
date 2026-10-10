/**
 * SLAY — the zone carving kit (map remake, docs/remake/maps.md).
 *
 * Every zone generator works on its own local `Grid`, always in the same
 * orientation: you arrive on the west side (`ctx.entry`) and leave on the
 * east side (`ctx.exit`). The area assembler (`zones/Area.ts`) pastes zones
 * side by side, joins the seams and turns the whole area afterwards, so no
 * generator has to think about direction.
 *
 * The grid starts as solid void. Generators carve walkable ground into it and
 * may plant blocking tiles (`ruin`, `deepWater`, lava, chasm). Anything left as
 * void becomes the zone's edge when the area is finalised: masonry indoors, a
 * tree line, dune ridge or cliff outdoors.
 *
 * Pure data. Nothing here touches THREE, and all randomness comes from the
 * `Rng` the zone was handed.
 */

import type { BiomeId, DungeonRoom, LayoutKind, Rng, Vec2 } from '../../types';
import { Grid, T_FLOOR, T_VOID, isWalkableValue } from '../Layouts';

/** What a generator is handed. */
export interface ZoneCtx {
  /** The zone's own grid, all void to begin with. */
  g: Grid;
  rng: Rng;
  /** Map tier. */
  depth: number;
  biome: BiomeId;
  layout: LayoutKind;
  outdoor: boolean;
  /** Where you arrive, near the west edge. Generators must reach it. */
  entry: Vec2;
  /** Where you leave, near the east edge (or the arena gate). Generators must reach it. */
  exit: Vec2;
  /** Holds the boss: the arena is already carved east of `limitX`. */
  boss: boolean;
  /** Generators carve only at x < limitX (the arena owns the rest). */
  limitX: number;
  /** Chambers, clearings and halls, in local tiles. */
  rooms: DungeonRoom[];
  /** Tiles the generator may not dig through, even to connect (the arena shell). */
  forbid: Uint8Array;
}

/** What a generator may report back. */
export interface ZoneResult {
  arena?: { x: number; y: number; w: number; h: number; gate: Vec2 };
}

export type ZoneGenerator = (ctx: ZoneCtx) => void;

// ---------------------------------------------------------------------------
// Small maths
// ---------------------------------------------------------------------------

export function clampN(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Seeded value noise with fractal octaves, returning roughly -1..1. Each call
 * to `makeNoise` draws its own lattice offsets from the rng, so two zones with
 * different streams never share a pattern.
 */
export interface Noise2 {
  (x: number, y: number): number;
  fbm(x: number, y: number, octaves?: number): number;
}

export function makeNoise(rng: Rng): Noise2 {
  const seed = (rng.next() * 0x7fffffff) | 0;
  const ox = rng.range(0, 1000);
  const oy = rng.range(0, 1000);
  const hash = (ix: number, iy: number): number => {
    let h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967295) * 2 - 1;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const base = (x: number, y: number): number => {
    x += ox;
    y += oy;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const fn = base as Noise2;
  fn.fbm = (x: number, y: number, octaves = 3): number => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += base(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
  return fn;
}

// ---------------------------------------------------------------------------
// Carving
// ---------------------------------------------------------------------------

/** Inside the carve-able part of the zone: off the border and west of the arena. */
export function inZone(ctx: ZoneCtx, x: number, y: number): boolean {
  return x >= 3 && y >= 3 && x < Math.min(ctx.limitX, ctx.g.w - 3) && y < ctx.g.h - 3 && !ctx.forbid[y * ctx.g.w + x];
}

/** Set a tile if it lies inside the zone. */
export function put(ctx: ZoneCtx, x: number, y: number, v: number): void {
  if (inZone(ctx, x, y)) ctx.g.t[y * ctx.g.w + x] = v;
}

export function get(ctx: ZoneCtx, x: number, y: number): number {
  return ctx.g.get(x, y);
}

/** A filled disc (ellipse with `ry`). `only` restricts which tiles it may overwrite. */
export function disc(ctx: ZoneCtx, cx: number, cy: number, r: number, v: number, ry = r, only?: (old: number) => boolean): void {
  const x0 = Math.floor(cx - r);
  const x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / r;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      if (only && !only(get(ctx, x, y))) continue;
      put(ctx, x, y, v);
    }
  }
}

/** A disc whose edge wanders with noise: clearings, chambers, pools. */
export function blob(ctx: ZoneCtx, cx: number, cy: number, r: number, v: number, noise: Noise2, rough = 0.35, only?: (old: number) => boolean): void {
  const R = Math.ceil(r * (1 + rough)) + 1;
  for (let y = Math.floor(cy) - R; y <= Math.ceil(cy) + R; y++) {
    for (let x = Math.floor(cx) - R; x <= Math.ceil(cx) + R; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dy, dx);
      const edge = r * (1 + rough * noise.fbm(Math.cos(a) * 1.7 + cx * 0.31, Math.sin(a) * 1.7 + cy * 0.31, 2));
      if (d > edge) continue;
      if (only && !only(get(ctx, x, y))) continue;
      put(ctx, x, y, v);
    }
  }
}

/** Axis-aligned rectangle. */
export function rect(ctx: ZoneCtx, x: number, y: number, w: number, h: number, v: number, only?: (old: number) => boolean): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (only && !only(get(ctx, xx, yy))) continue;
      put(ctx, xx, yy, v);
    }
  }
}

/** A thick straight segment. `r` is the half width in tiles. */
export function segment(ctx: ZoneCtx, a: Vec2, b: Vec2, r: number, v: number, only?: (old: number) => boolean, mark?: Uint8Array): void {
  const len = Math.max(1, Math.ceil(dist(a, b) * 2));
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t;
    const R = Math.ceil(r);
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r + 0.25) continue;
        if (only && !only(get(ctx, x, y))) continue;
        put(ctx, x, y, v);
        if (mark && inZone(ctx, x, y)) mark[y * ctx.g.w + x] = 1;
      }
    }
  }
}

/** A polyline of thick segments. */
export function polyline(ctx: ZoneCtx, pts: Vec2[], r: number, v: number, only?: (old: number) => boolean, mark?: Uint8Array): void {
  for (let i = 0; i + 1 < pts.length; i++) segment(ctx, pts[i]!, pts[i + 1]!, r, v, only, mark);
}

/** Axis-aligned corridor: horizontal first or vertical first, `w` tiles wide. */
export function elbow(ctx: ZoneCtx, a: Vec2, b: Vec2, w: number, v: number, horizontalFirst: boolean, mark?: Uint8Array): void {
  const half = (w - 1) / 2;
  const lo = -Math.floor(half);
  const hi = Math.ceil(half);
  const hline = (x0: number, x1: number, y: number): void => {
    for (let x = Math.min(x0, x1) + lo; x <= Math.max(x0, x1) + hi; x++) {
      for (let d = lo; d <= hi; d++) {
        put(ctx, x, y + d, v);
        if (mark && inZone(ctx, x, y + d)) mark[(y + d) * ctx.g.w + x] = 1;
      }
    }
  };
  const vline = (y0: number, y1: number, x: number): void => {
    for (let y = Math.min(y0, y1) + lo; y <= Math.max(y0, y1) + hi; y++) {
      for (let d = lo; d <= hi; d++) {
        put(ctx, x + d, y, v);
        if (mark && inZone(ctx, x + d, y)) mark[y * ctx.g.w + x + d] = 1;
      }
    }
  };
  const ax = Math.round(a.x);
  const ay = Math.round(a.y);
  const bx = Math.round(b.x);
  const by = Math.round(b.y);
  if (horizontalFirst) {
    hline(ax, bx, ay);
    vline(ay, by, bx);
  } else {
    vline(ay, by, ax);
    hline(ax, bx, by);
  }
}

/**
 * Points along a wandering line from `a` to `b`. The sideways drift is a sum
 * of two sines with random phase, so the path bends like a trail rather than
 * jittering like noise. `wiggle` is the largest drift in tiles.
 */
export function wander(rng: Rng, a: Vec2, b: Vec2, wiggle: number, step = 3): Vec2[] {
  const len = dist(a, b);
  const n = Math.max(2, Math.ceil(len / step));
  const nx = -(b.y - a.y) / Math.max(1e-6, len);
  const ny = (b.x - a.x) / Math.max(1e-6, len);
  const p1 = rng.range(0, Math.PI * 2);
  const p2 = rng.range(0, Math.PI * 2);
  const f1 = rng.range(0.8, 1.6);
  const f2 = rng.range(2.2, 3.4);
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Pinned at both ends so the path meets what it joins.
    const env = Math.sin(t * Math.PI);
    const off = env * wiggle * (0.7 * Math.sin(t * Math.PI * f1 + p1) + 0.3 * Math.sin(t * Math.PI * f2 + p2));
    out.push({ x: a.x + (b.x - a.x) * t + nx * off, y: a.y + (b.y - a.y) * t + ny * off });
  }
  return out;
}

/** Dart-throwing: up to `n` points inside a box, no two closer than `minDist`. */
export function spread(rng: Rng, x0: number, y0: number, x1: number, y1: number, n: number, minDist: number, keepOff: Vec2[] = []): Vec2[] {
  const out: Vec2[] = [];
  for (let tries = 0; tries < n * 40 && out.length < n; tries++) {
    const p = { x: rng.range(x0, x1), y: rng.range(y0, y1) };
    if (out.some((q) => dist(p, q) < minDist)) continue;
    if (keepOff.some((q) => dist(p, q) < minDist)) continue;
    out.push(p);
  }
  return out.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

/**
 * Edges of a minimum spanning tree over the points, plus `loops` of the
 * shortest edges left over (each at most `loopMax` times the mean MST edge),
 * so a zone has a circuit or two instead of being a pure tree.
 */
export function connectPoints(rng: Rng, pts: Vec2[], loops: number, loopMax = 1.7): Array<[number, number]> {
  const n = pts.length;
  if (n < 2) return [];
  const inTree = new Array<boolean>(n).fill(false);
  const best = new Array<number>(n).fill(Infinity);
  const from = new Array<number>(n).fill(-1);
  best[0] = 0;
  const edges: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u === -1 || best[i] < best[u])) u = i;
    inTree[u] = true;
    if (from[u] >= 0) edges.push([from[u], u]);
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const d = dist(pts[u]!, pts[v]!);
      if (d < best[v]) {
        best[v] = d;
        from[v] = u;
      }
    }
  }
  const mean = edges.reduce((s, [a, b]) => s + dist(pts[a]!, pts[b]!), 0) / Math.max(1, edges.length);
  const has = new Set(edges.map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)));
  const rest: Array<[number, number, number]> = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (has.has(`${a},${b}`)) continue;
      const d = dist(pts[a]!, pts[b]!);
      if (d <= mean * loopMax) rest.push([a, b, d]);
    }
  }
  rest.sort((p, q) => p[2] - q[2]);
  // Skip the very shortest few so a loop is a loop and not a doubled corridor.
  rng.shuffle(rest);
  for (let i = 0; i < rest.length && i < loops; i++) edges.push([rest[i]![0], rest[i]![1]]);
  return edges;
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/** Records a chamber or clearing. Ids are re-issued by the area assembler. */
export function addRoom(ctx: ZoneCtx, x: number, y: number, w: number, h: number, kind: DungeonRoom['kind'] = 'normal'): DungeonRoom {
  const x0 = clampN(Math.round(x), 2, ctx.g.w - 3);
  const y0 = clampN(Math.round(y), 2, ctx.g.h - 3);
  const ww = Math.max(1, Math.min(Math.round(w), ctx.g.w - 2 - x0));
  const hh = Math.max(1, Math.min(Math.round(h), ctx.g.h - 2 - y0));
  const r: DungeonRoom = {
    id: ctx.rooms.length,
    x: x0,
    y: y0,
    w: ww,
    h: hh,
    kind,
    links: [],
    center: { x: Math.floor(x0 + ww / 2), y: Math.floor(y0 + hh / 2) },
  };
  ctx.rooms.push(r);
  return r;
}

/** A room around a circular clearing, with its centre kept exact. */
export function addRoundRoom(ctx: ZoneCtx, cx: number, cy: number, r: number, kind: DungeonRoom['kind'] = 'normal'): DungeonRoom {
  const room = addRoom(ctx, cx - r, cy - r, r * 2 + 1, r * 2 + 1, kind);
  room.center = { x: Math.round(cx), y: Math.round(cy) };
  return room;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/** 4-way BFS distance over walkable tiles. -1 where unreached. */
export function bfs(g: Grid, from: Vec2): Int32Array {
  const n = g.w * g.h;
  const d = new Int32Array(n).fill(-1);
  const q = new Int32Array(n);
  const s = from.y * g.w + from.x;
  if (s < 0 || s >= n || !isWalkableValue(g.t[s])) return d;
  let head = 0;
  let tail = 0;
  d[s] = 0;
  q[tail++] = s;
  while (head < tail) {
    const c = q[head++];
    const cx = c % g.w;
    const cy = (c / g.w) | 0;
    const nd = d[c] + 1;
    if (cx > 0 && d[c - 1] < 0 && isWalkableValue(g.t[c - 1])) { d[c - 1] = nd; q[tail++] = c - 1; }
    if (cx < g.w - 1 && d[c + 1] < 0 && isWalkableValue(g.t[c + 1])) { d[c + 1] = nd; q[tail++] = c + 1; }
    if (cy > 0 && d[c - g.w] < 0 && isWalkableValue(g.t[c - g.w])) { d[c - g.w] = nd; q[tail++] = c - g.w; }
    if (cy < g.h - 1 && d[c + g.w] < 0 && isWalkableValue(g.t[c + g.w])) { d[c + g.w] = nd; q[tail++] = c + g.w; }
  }
  return d;
}

/** Nearest walkable tile to `p` by spiral search, or `p` if none is close. */
export function nearestWalkable(g: Grid, p: Vec2, maxR = 12): Vec2 {
  if (isWalkableValue(g.get(p.x, p.y))) return p;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (isWalkableValue(g.get(p.x + dx, p.y + dy))) return { x: p.x + dx, y: p.y + dy };
      }
    }
  }
  return p;
}

/** Every walkable tile reached from `from`, as a mask. */
export function reachMask(g: Grid, from: Vec2): Uint8Array {
  const d = bfs(g, from);
  const m = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) if (d[i] >= 0) m[i] = 1;
  return m;
}

/** The landing pad every port gets, so arrival never puts you in a thicket. */
export function landing(ctx: ZoneCtx, p: Vec2, r = 2.6): void {
  disc(ctx, p.x, p.y, r, T_FLOOR);
}

/** True for void (uncarved rock, forest, dune). */
export const isVoid = (v: number): boolean => v === T_VOID;

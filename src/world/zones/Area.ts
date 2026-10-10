/**
 * SLAY — the area assembler (map remake, docs/remake/maps.md).
 *
 * One area is one load: one or two zones generated side by side in one grid.
 * Each zone is generated on its own grid, arriving west and leaving east; the
 * assembler pastes them in a row, opens the seams between them, runs its own
 * finalise (connectivity that respects the arena fence, no doors outdoors,
 * walls round deep water as well as pits), and then turns or mirrors the
 * whole area at random so maps do not all run left to right.
 */

import type { BiomeId, DungeonRoom, LayoutKind, MapZone, Rng, Vec2 } from '../../types';
import {
  Grid,
  T_BRIDGE,
  T_DEEP_WATER,
  T_FLOOR,
  T_VOID,
  T_WALL,
  isPitValue,
  isWalkableValue,
  placeDoors,
  pruneStrayFloor,
  rebuildRoomLinks,
  removeDiagonalPinch,
  sealBorder,
  smoothHeights,
} from '../Layouts';
import { carveArena } from './Arena';
import { cave, crypt, keep, rift, tomb } from './Indoor';
import { type ZoneCtx, type ZoneGenerator, landing, polyline, wander } from './Kit';
import { dunes, forest, swamp, tundra, wastes } from './Outdoor';

/** The zone generators, one per new layout kind. */
export const ZONE_GENERATORS: Record<LayoutKind, ZoneGenerator> = {
  forest,
  swamp,
  dunes,
  tundra,
  wastes,
  crypt,
  cave,
  tomb,
  keep,
  rift,
};

/** What one zone of an area should be. */
export interface ZonePlan {
  name: string;
  biome: BiomeId;
  layout: LayoutKind;
  outdoor: boolean;
  role: MapZone['role'];
  /** Position in the whole map. */
  order: number;
}

export interface AreaPlan {
  zones: ZonePlan[];
  /** Map tier. */
  depth: number;
}

export interface AreaOut {
  grid: Grid;
  rooms: DungeonRoom[];
  zones: MapZone[];
  zoneOf: Uint8Array;
  /** Where you arrive. */
  entry: Vec2;
  /** Where you leave: the far edge, or the approach to the arena gate. */
  exit: Vec2;
  arena?: { x: number; y: number; w: number; h: number; gate: Vec2 };
  /** 0..7: quarter turns in the low two bits, mirrored when bit 2 is set. */
  turn: number;
  /** Direction of travel through the area, radians (0 = +x, PI/2 = +y). */
  facing: number;
}

/** Ports sit this far in from a zone's west and east edges. */
const PORT_IN = 6;

/** Grid size for one zone. Grows slowly with tier, like the old floors did. */
export function zoneSize(layout: LayoutKind, depth: number, outdoor: boolean, boss: boolean, rng: Rng): { w: number; h: number } {
  const grow = Math.min(24, Math.floor(Math.log2(depth + 1) * 6));
  let w = (outdoor ? 84 : 82) + grow + rng.int(-4, 8);
  let h = (outdoor ? 58 : 64) + Math.floor(grow * 0.6) + rng.int(-3, 6);
  if (layout === 'tomb') w += 10;
  if (layout === 'swamp' || layout === 'rift') w += 6;
  if (layout === 'keep') h += 4;
  if (layout === 'cave') {
    w += 10;
    h += 10;
  }
  if (boss) w += 26;
  return { w, h };
}

export function buildArea(plan: AreaPlan, rng: Rng): AreaOut {
  const n = plan.zones.length;
  const sizes = plan.zones.map((z) => zoneSize(z.layout, plan.depth, z.outdoor, z.role === 'boss', rng));
  const H = Math.max(...sizes.map((s) => s.h));
  const portY = (): number => rng.int(Math.round(H * 0.3), Math.round(H * 0.7));

  // --- Generate each zone on its own grid ------------------------------------
  interface Local {
    ctx: ZoneCtx;
    arena?: AreaOut['arena'];
  }
  const locals: Local[] = [];
  let y = portY();
  for (let i = 0; i < n; i++) {
    const z = plan.zones[i]!;
    const w = sizes[i]!.w;
    const next = portY();
    const ctx: ZoneCtx = {
      g: new Grid(w, H),
      rng: rng.fork(`zone${i}`),
      depth: plan.depth,
      biome: z.biome,
      layout: z.layout,
      outdoor: z.outdoor,
      entry: { x: PORT_IN, y },
      exit: { x: w - 1 - PORT_IN, y: next },
      boss: z.role === 'boss',
      limitX: w - 3,
      rooms: [],
      forbid: new Uint8Array(w * H),
    };
    const arena = ctx.boss ? carveArena(ctx) : undefined;
    ZONE_GENERATORS[z.layout](ctx);
    landing(ctx, ctx.entry);
    landing(ctx, ctx.exit);
    locals.push({ ctx, arena });
    y = next;
  }

  // --- Paste them side by side -------------------------------------------------
  const W = sizes.reduce((s, z) => s + z.w, 0);
  const g = new Grid(W, H);
  const forbid = new Uint8Array(W * H);
  const zoneOf = new Uint8Array(W * H);
  const rooms: DungeonRoom[] = [];
  const zones: MapZone[] = [];
  const seams: number[] = [];
  let arena: AreaOut['arena'];
  let ox = 0;
  for (let i = 0; i < n; i++) {
    const { ctx } = locals[i]!;
    const lg = ctx.g;
    for (let yy = 0; yy < H; yy++) {
      for (let xx = 0; xx < lg.w; xx++) {
        const s = yy * lg.w + xx;
        const d = yy * W + xx + ox;
        g.t[d] = lg.t[s];
        g.heights[d] = lg.heights[s];
        forbid[d] = ctx.forbid[s];
        zoneOf[d] = i;
      }
    }
    for (const r of ctx.rooms) rooms.push({ ...r, x: r.x + ox, center: { x: r.center.x + ox, y: r.center.y }, links: [] });
    const z = plan.zones[i]!;
    zones.push({ id: i, name: z.name, biome: z.biome, outdoor: z.outdoor, layout: z.layout, bounds: { x: ox, y: 0, w: lg.w, h: H }, order: z.order, role: z.role });
    const a = locals[i]!.arena;
    if (a) arena = { x: a.x + ox, y: a.y, w: a.w, h: a.h, gate: { x: a.gate.x + ox, y: a.gate.y } };
    if (i > 0) seams.push(ox);
    ox += lg.w;
  }
  const first = locals[0]!.ctx;
  const last = locals[n - 1]!.ctx;
  const entry = { ...first.entry };
  const exit = { x: last.exit.x + W - last.g.w, y: last.exit.y };

  // --- Seams ---------------------------------------------------------------------
  for (let s = 0; s < seams.length; s++) {
    const X = seams[s]!;
    const A = locals[s]!.ctx;
    const py = A.exit.y;
    const outdoor = A.outdoor && locals[s + 1]!.ctx.outdoor;
    const half = outdoor ? 2 : 1;
    // The main gap, straight through on the port row.
    for (let xx = X - PORT_IN - 1; xx <= X + PORT_IN; xx++) {
      for (let d = -half; d <= half; d++) g.set(xx, py + d, T_FLOOR);
    }
    // Outdoors, a second way through elsewhere along the seam.
    if (outdoor) {
      const y2 = py < H / 2 ? rng.int(Math.min(H - 8, py + 14), H - 8) : rng.int(7, Math.max(7, py - 14));
      const a = nearWalk(g, X - 14, X - 5, y2);
      const b = nearWalk(g, X + 4, X + 13, y2);
      if (a && b) {
        const fake = fakeCtx(g, forbid, rng);
        polyline(fake, wander(rng, a, b, 3, 2), 1.3, T_FLOOR, (o) => !isWalkableValue(o));
      }
    }
    // Ground levels out toward the seam so the two zones meet flush.
    for (let yy = 0; yy < H; yy++) {
      for (let xx = Math.max(0, X - 10); xx < Math.min(W, X + 10); xx++) {
        const i = yy * W + xx;
        g.heights[i] = Math.round(g.heights[i] * (Math.abs(xx - X) / 10));
      }
    }
  }

  // --- Finalise ----------------------------------------------------------------
  const allOutdoor = plan.zones.every((z) => z.outdoor);
  const fenced = new Map<number, number>();
  for (let i = 0; i < forbid.length; i++) if (forbid[i]) fenced.set(i, g.t[i]);
  const restoreFence = (): void => {
    for (const [i, v] of fenced) g.t[i] = v;
  };

  sealBorder(g);
  dropSpecks(g, entry, 10);
  connectAll(g, forbid, entry, allOutdoor ? 1 : 0);
  restoreFence();
  removeDiagonalPinch(g);
  restoreFence();
  pruneStrayFloor(g);
  const kept = tidyRooms(g, rooms);
  rebuildRoomLinks(g, kept);
  if (!plan.zones.some((z) => z.outdoor)) placeDoors(g, kept, rng);
  smoothHeights(g);
  wallifyArea(g);

  // --- Turn the whole area ---------------------------------------------------
  const turn = rng.int(0, 7);
  return turnArea({ grid: g, rooms: kept, zones, zoneOf, entry, exit, arena, turn, facing: 0 });
}

// ---------------------------------------------------------------------------
// Finalise passes
// ---------------------------------------------------------------------------

/** A carving context over the whole area, for seam work. */
function fakeCtx(g: Grid, forbid: Uint8Array, rng: Rng): ZoneCtx {
  return {
    g,
    rng,
    depth: 0,
    biome: 'crypt',
    layout: 'cave',
    outdoor: true,
    entry: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    boss: false,
    limitX: g.w,
    rooms: [],
    forbid,
  };
}

function nearWalk(g: Grid, x0: number, x1: number, y: number): Vec2 | null {
  for (let r = 0; r < 8; r++) {
    for (const yy of [y - r, y + r]) {
      for (let x = x0; x <= x1; x++) if (g.walkable(x, yy)) return { x, y: yy };
    }
  }
  return null;
}

/** Walkable scraps smaller than `min` tiles, away from the arrival, go back to void. */
function dropSpecks(g: Grid, keep: Vec2, min: number): void {
  const n = g.w * g.h;
  const label = new Int32Array(n).fill(-1);
  const q = new Int32Array(n);
  const k = keep.y * g.w + keep.x;
  for (let s = 0; s < n; s++) {
    if (label[s] !== -1 || !isWalkableValue(g.t[s])) continue;
    let head = 0;
    let tail = 0;
    q[tail++] = s;
    label[s] = s;
    let holdsKeep = false;
    while (head < tail) {
      const c = q[head++];
      if (c === k) holdsKeep = true;
      const cx = c % g.w;
      for (const nb of [cx > 0 ? c - 1 : -1, cx < g.w - 1 ? c + 1 : -1, c - g.w, c + g.w]) {
        if (nb < 0 || nb >= n || label[nb] !== -1 || !isWalkableValue(g.t[nb])) continue;
        label[nb] = s;
        q[tail++] = nb;
      }
    }
    if (tail < min && !holdsKeep) for (let i = 0; i < tail; i++) g.t[q[i]!] = T_VOID;
  }
}

/**
 * Join every walkable island to the part you arrive in. One breadth-first
 * search out of the main body finds each island's shortest way home; that path
 * is carved, planked where it crosses water, fire or a drop. Fenced tiles (the
 * arena shell) are never entered. `widen` adds a tile each side of the path.
 */
function connectAll(g: Grid, forbid: Uint8Array, from: Vec2, widen: number): void {
  const n = g.w * g.h;
  const label = new Int32Array(n).fill(-1);
  const q = new Int32Array(n);
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (label[s] !== -1 || !isWalkableValue(g.t[s])) continue;
    const id = next++;
    let head = 0;
    let tail = 0;
    q[tail++] = s;
    label[s] = id;
    while (head < tail) {
      const c = q[head++];
      const cx = c % g.w;
      for (const nb of [cx > 0 ? c - 1 : -1, cx < g.w - 1 ? c + 1 : -1, c - g.w, c + g.w]) {
        if (nb < 0 || nb >= n || label[nb] !== -1 || !isWalkableValue(g.t[nb])) continue;
        label[nb] = id;
        q[tail++] = nb;
      }
    }
  }
  if (next <= 1) return;
  const main = label[from.y * g.w + from.x];
  if (main < 0) return;

  const parent = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (label[i] === main) {
      seen[i] = 1;
      q[tail++] = i;
    }
  }
  const reach = new Int32Array(next).fill(-1);
  while (head < tail) {
    const c = q[head++];
    const lc = label[c];
    if (lc >= 0 && lc !== main) {
      if (reach[lc] === -1) reach[lc] = c;
      // Islands are reached, not crossed: the next island's path starts fresh.
      continue;
    }
    const cx = c % g.w;
    const cy = (c / g.w) | 0;
    const step = (nb: number): void => {
      if (seen[nb]) return;
      if (forbid[nb] && !isWalkableValue(g.t[nb])) return;
      seen[nb] = 1;
      parent[nb] = c;
      q[tail++] = nb;
    };
    if (cx > 2) step(c - 1);
    if (cx < g.w - 3) step(c + 1);
    if (cy > 2) step(c - g.w);
    if (cy < g.h - 3) step(c + g.w);
  }

  const open = (i: number): void => {
    if (forbid[i]) return;
    const x = i % g.w;
    const y = (i / g.w) | 0;
    if (x < 2 || y < 2 || x >= g.w - 2 || y >= g.h - 2) return;
    const v = g.t[i];
    if (isWalkableValue(v)) return;
    g.t[i] = isPitValue(v) || v === T_DEEP_WATER ? T_BRIDGE : T_FLOOR;
  };
  for (let comp = 0; comp < next; comp++) {
    if (comp === main || reach[comp] === -1) continue;
    let cur = parent[reach[comp]!]!;
    let guard = 0;
    while (cur !== -1 && guard++ < n) {
      if (label[cur] === main) break;
      open(cur);
      if (widen > 0) {
        open(cur - 1);
        open(cur + 1);
        open(cur - g.w);
        open(cur + g.w);
      }
      cur = parent[cur]!;
    }
  }
}

/** Drop rooms with no ground left in them, re-centre the rest on ground, re-number. */
function tidyRooms(g: Grid, rooms: DungeonRoom[]): DungeonRoom[] {
  const out: DungeonRoom[] = [];
  for (const r of rooms) {
    let c = r.center;
    if (!g.walkable(c.x, c.y)) {
      let best: Vec2 | null = null;
      let bd = Infinity;
      for (let yy = r.y; yy < r.y + r.h; yy++) {
        for (let xx = r.x; xx < r.x + r.w; xx++) {
          if (!g.walkable(xx, yy)) continue;
          const d = Math.hypot(xx - c.x, yy - c.y);
          if (d < bd) {
            bd = d;
            best = { x: xx, y: yy };
          }
        }
      }
      if (!best) continue;
      c = best;
    }
    out.push({ ...r, id: out.length, center: c, links: [] });
  }
  return out;
}

/** Void touching ground, a pit or deep water (8-way) becomes the zone's edge. */
function wallifyArea(g: Grid): void {
  const src = g.t.slice();
  const solid = (v: number): boolean => isWalkableValue(v) || isPitValue(v) || v === T_DEEP_WATER;
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
          if (solid(src[ny * g.w + nx])) {
            touch = true;
            break;
          }
        }
      }
      if (touch) g.t[i] = T_WALL;
    }
  }
}

// ---------------------------------------------------------------------------
// Turning
// ---------------------------------------------------------------------------

/** Where tile (x, y) of a W x H grid lands under `turn`, and the new size. */
export function turnPoint(x: number, y: number, W: number, H: number, turn: number): Vec2 {
  if (turn & 4) x = W - 1 - x;
  switch (turn & 3) {
    case 1:
      return { x: H - 1 - y, y: x };
    case 2:
      return { x: W - 1 - x, y: H - 1 - y };
    case 3:
      return { x: y, y: W - 1 - x };
    default:
      return { x, y };
  }
}

function turnRect(r: { x: number; y: number; w: number; h: number }, W: number, H: number, turn: number): { x: number; y: number; w: number; h: number } {
  const a = turnPoint(r.x, r.y, W, H, turn);
  const b = turnPoint(r.x + r.w - 1, r.y + r.h - 1, W, H, turn);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

/** Where the direction (dx, dy) points under `turn`. */
export function turnVec(dx: number, dy: number, turn: number): Vec2 {
  if (turn & 4) dx = -dx;
  switch (turn & 3) {
    case 1:
      return { x: -dy, y: dx };
    case 2:
      return { x: -dx, y: -dy };
    case 3:
      return { x: dy, y: -dx };
    default:
      return { x: dx, y: dy };
  }
}

function turnArea(a: AreaOut): AreaOut {
  const { grid: g, turn } = a;
  if (turn === 0) return a;
  const W = g.w;
  const H = g.h;
  const swap = (turn & 1) === 1;
  const out = new Grid(swap ? H : W, swap ? W : H);
  const zoneOf = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = turnPoint(x, y, W, H, turn);
      const s = y * W + x;
      const d = p.y * out.w + p.x;
      out.t[d] = g.t[s];
      out.heights[d] = g.heights[s];
      zoneOf[d] = a.zoneOf[s];
    }
  }
  const tp = (p: Vec2): Vec2 => turnPoint(p.x, p.y, W, H, turn);
  return {
    grid: out,
    rooms: a.rooms.map((r) => ({ ...r, ...turnRect(r, W, H, turn), center: tp(r.center) })),
    zones: a.zones.map((z) => ({ ...z, bounds: turnRect(z.bounds, W, H, turn) })),
    zoneOf,
    entry: tp(a.entry),
    exit: tp(a.exit),
    arena: a.arena ? { ...turnRect(a.arena, W, H, turn), gate: tp(a.arena.gate) } : undefined,
    turn,
    facing: Math.atan2(turnVec(1, 0, turn).y, turnVec(1, 0, turn).x),
  };
}

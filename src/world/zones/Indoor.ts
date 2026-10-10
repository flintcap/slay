/**
 * SLAY — indoor zone generators (map remake, docs/remake/maps.md).
 *
 * crypt, cave, tomb, keep, rift. Same contract as the outdoor ones: carve into
 * a void grid, arrive on the west, leave on the east. Void becomes masonry or
 * rock when the area is finalised. Corridors are three wide.
 */

import type { DungeonRoom, Vec2 } from '../../types';
import { T_BRIDGE, T_CHASM, T_DEEP_WATER, T_FLOOR, T_ICE, T_LAVA, T_VOID, T_WATER } from '../Layouts';
import {
  type ZoneCtx,
  addRoom,
  addRoundRoom,
  blob,
  clampN,
  connectPoints,
  disc,
  dist,
  elbow,
  get,
  landing,
  makeNoise,
  polyline,
  put,
  rect,
  segment,
  spread,
  wander,
} from './Kit';

const right = (ctx: ZoneCtx): number => Math.min(ctx.limitX, ctx.g.w - 3) - 1;

/** Pillars on a grid inside a room, leaving a clear ring round the walls. */
function pillars(ctx: ZoneCtx, r: { x: number; y: number; w: number; h: number }, step: number): void {
  if (r.w < 8 || r.h < 8) return;
  for (let y = r.y + 2; y < r.y + r.h - 2; y += step) {
    for (let x = r.x + 2; x < r.x + r.w - 2; x += step) put(ctx, x, y, T_VOID);
  }
}

/** Straight run from a port to the nearest room centre. */
function portTo(ctx: ZoneCtx, p: Vec2, rooms: DungeonRoom[]): void {
  let best: DungeonRoom | null = null;
  for (const r of rooms) if (!best || dist(p, r.center) < dist(p, best.center)) best = r;
  if (best) elbow(ctx, p, best.center, 3, T_FLOOR, ctx.rng.chance(0.5));
}

// ---------------------------------------------------------------------------
// Crypt: a grid of cells, chambers in most, a maze of three-wide passages
// ---------------------------------------------------------------------------

export function crypt(ctx: ZoneCtx): void {
  const { g, rng, entry, exit } = ctx;
  const C = rng.int(11, 13);
  const x0 = 4;
  const y0 = 4;
  const cols = Math.max(2, Math.floor((right(ctx) - x0) / C));
  const rows = Math.max(2, Math.floor((g.h - 4 - y0) / C));
  const cx = (i: number): number => x0 + i * C + (C >> 1);
  const cy = (j: number): number => y0 + j * C + (C >> 1);
  const room: Array<DungeonRoom | null> = [];

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (rng.chance(0.78)) {
        const w = rng.int(6, C - 1);
        const h = rng.int(6, C - 1);
        const x = cx(i) - (w >> 1);
        const y = cy(j) - (h >> 1);
        rect(ctx, x, y, w, h, T_FLOOR);
        const r = addRoom(ctx, x, y, w, h);
        if (w >= 8 && h >= 8 && rng.chance(0.5)) pillars(ctx, r, 3);
        if (rng.chance(0.18)) ctx.g.rectHeight(x, y, w, h, -1);
        room.push(r);
      } else {
        rect(ctx, cx(i) - 1, cy(j) - 1, 3, 3, T_FLOOR);
        room.push(null);
      }
    }
  }

  // A depth-first maze over the cells, then a few extra links for loops.
  const seen = new Uint8Array(cols * rows);
  const stack = [rng.int(0, rows - 1) * cols];
  seen[stack[0]!] = 1;
  const link = (a: number, b: number): void => {
    const A = { x: cx(a % cols), y: cy((a / cols) | 0) };
    const B = { x: cx(b % cols), y: cy((b / cols) | 0) };
    elbow(ctx, A, B, 3, T_FLOOR, true);
  };
  while (stack.length) {
    const c = stack[stack.length - 1]!;
    const i = c % cols;
    const j = (c / cols) | 0;
    const nb: number[] = [];
    if (i > 0 && !seen[c - 1]) nb.push(c - 1);
    if (i < cols - 1 && !seen[c + 1]) nb.push(c + 1);
    if (j > 0 && !seen[c - cols]) nb.push(c - cols);
    if (j < rows - 1 && !seen[c + cols]) nb.push(c + cols);
    if (nb.length === 0) {
      stack.pop();
      continue;
    }
    const n = rng.pick(nb);
    seen[n] = 1;
    link(c, n);
    stack.push(n);
  }
  const extra = Math.round(cols * rows * 0.18);
  for (let k = 0; k < extra; k++) {
    const c = rng.int(0, cols * rows - 1);
    const i = c % cols;
    if (i < cols - 1) link(c, c + 1);
    else if (c + cols < cols * rows) link(c, c + cols);
  }

  // Ports into the nearest cell.
  const ent = Math.round(clampN((entry.y - y0) / C - 0.5, 0, rows - 1)) * cols;
  const ext = Math.round(clampN((exit.y - y0) / C - 0.5, 0, rows - 1)) * cols + cols - 1;
  elbow(ctx, entry, { x: cx(ent % cols), y: cy((ent / cols) | 0) }, 3, T_FLOOR, false);
  elbow(ctx, exit, { x: cx(ext % cols), y: cy((ext / cols) | 0) }, 3, T_FLOOR, false);
  landing(ctx, entry);
  landing(ctx, exit);
}

// ---------------------------------------------------------------------------
// Cave: a wandering main tunnel, chambers on it, dead-end branches off it
// ---------------------------------------------------------------------------

export function cave(ctx: ZoneCtx): void {
  const { g, rng, entry, exit, biome } = ctx;
  const noise = makeNoise(rng);
  const hive = biome === 'hive';
  const x1 = right(ctx);
  const main = wander(rng, entry, exit, g.h * 0.3, 2);
  const chambers: Vec2[] = [];
  let since = 0;
  for (let i = 0; i + 1 < main.length; i++) {
    const p = main[i]!;
    const r = 2.1 + 1.4 * (noise.fbm(p.x * 0.08, p.y * 0.08, 2) + 1);
    segment(ctx, p, main[i + 1]!, r, T_FLOOR);
    since += 2;
    if (since > (hive ? 8 : 11) && i > 2 && i < main.length - 3) {
      since = 0;
      chambers.push(p);
    }
  }

  // A second way through for part of the length, so the cave has a loop.
  const qa = main[Math.floor(main.length * rng.range(0.15, 0.35))]!;
  const qb = main[Math.floor(main.length * rng.range(0.65, 0.85))]!;
  const loop = wander(rng, qa, qb, g.h * 0.28, 2);
  for (let i = 0; i + 1 < loop.length; i++) segment(ctx, loop[i]!, loop[i + 1]!, 1.8 + 1.1 * (noise.fbm(loop[i]!.x * 0.09, 5, 2) + 1), T_FLOOR);
  chambers.push(loop[loop.length >> 1]!);

  // Side branches out into the rock, each ending in a chamber.
  const nb = Math.round(((x1 * g.h) / 900) * (hive ? 1.5 : 1)) + rng.int(0, 2);
  const ends: Vec2[] = [];
  for (let b = 0; b < nb; b++) {
    const from = rng.pick(main.slice(2, -2));
    const to = {
      x: clampN(from.x + rng.range(-24, 24), 8, x1 - 6),
      y: clampN(from.y + (rng.chance(0.5) ? -1 : 1) * rng.range(12, 26), 7, g.h - 8),
    };
    polyline(ctx, wander(rng, from, to, 5, 2), rng.range(1.5, 2.3), T_FLOOR);
    chambers.push(to);
    ends.push(to);
  }
  // Now and then a branch runs through to another, so not every one is a dead end.
  for (let k = 0; k + 1 < ends.length; k++) {
    if (rng.chance(0.3) && dist(ends[k]!, ends[k + 1]!) < 30) polyline(ctx, wander(rng, ends[k]!, ends[k + 1]!, 4, 2), 1.3, T_FLOOR);
  }

  for (const c of chambers) {
    const r = hive ? rng.range(3.5, 5.5) : rng.range(5, 8.5);
    blob(ctx, c.x, c.y, r, T_FLOOR, noise, 0.45);
    addRoundRoom(ctx, c.x, c.y, Math.floor(r * 0.75));
    // Columns of rock left standing in the bigger chambers.
    for (let k = r > 5 ? rng.int(2, 4) : 0; k > 0; k--) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(1.5, r - 2);
      disc(ctx, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, rng.range(0.5, 1.2), T_VOID);
    }
    if (rng.chance(0.35)) g.rectHeight(Math.round(c.x - r), Math.round(c.y - r), Math.round(r * 2), Math.round(r * 2), rng.chance(0.5) ? -1 : 1);
  }

  // Pools: water in the caverns, ice in the frozen caves, shallows in the hive.
  const pool = biome === 'frostvault' ? T_ICE : T_WATER;
  for (const c of chambers) {
    if (!rng.chance(biome === 'caverns' || biome === 'frostvault' ? 0.4 : 0.15)) continue;
    blob(ctx, c.x + rng.range(-2, 2), c.y + rng.range(-2, 2), rng.range(1.8, 3.2), pool, noise, 0.3, (o) => o === T_FLOOR);
  }
  // Stalagmites.
  for (let y = 4; y < g.h - 4; y++) {
    for (let x = 4; x < x1; x++) {
      if (get(ctx, x, y) !== T_FLOOR || !rng.chance(0.01)) continue;
      if (dist({ x, y }, entry) < 5 || dist({ x, y }, exit) < 5) continue;
      put(ctx, x, y, T_VOID);
    }
  }
  landing(ctx, entry);
  landing(ctx, exit);
}

// ---------------------------------------------------------------------------
// Tomb: one long zig-zag gallery, paired burial chambers off it, pillared halls
// ---------------------------------------------------------------------------

export function tomb(ctx: ZoneCtx): void {
  const { g, rng, entry, exit } = ctx;
  const x1 = right(ctx);
  const top = Math.round(g.h * rng.range(0.2, 0.28));
  const bot = Math.round(g.h * rng.range(0.72, 0.8));
  const legs = clampN(Math.round((x1 - entry.x) / 15), 3, 8);
  const pts: Vec2[] = [entry];
  for (let k = 1; k < legs; k++) {
    const x = Math.round(entry.x + ((x1 - 4 - entry.x) * k) / legs);
    pts.push({ x, y: k % 2 ? top : bot });
  }
  pts.push(exit);

  // The gallery.
  // Always across then up or down, so the gallery is a square wave.
  for (let k = 0; k + 1 < pts.length; k++) elbow(ctx, pts[k]!, pts[k + 1]!, 3, T_FLOOR, true);

  // A pillared hall at every turn.
  for (let k = 1; k + 1 < pts.length; k++) {
    const p = pts[k]!;
    const s = rng.int(11, 15);
    const r = addRoom(ctx, p.x - (s >> 1), p.y - (s >> 1), s, s);
    rect(ctx, r.x, r.y, r.w, r.h, T_FLOOR);
    pillars(ctx, r, rng.chance(0.5) ? 3 : 4);
    if (rng.chance(0.3)) g.rectHeight(r.x, r.y, r.w, r.h, -1);
  }

  // Burial chambers in pairs along the gallery's vertical legs and the long rows.
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k]!;
    const b = pts[k + 1]!;
    // The vertical part of each elbow runs at x = b.x.
    const vx = b.x;
    const y0 = Math.min(a.y, b.y) + 8;
    const y1 = Math.max(a.y, b.y) - 8;
    for (let y = y0; y <= y1; y += rng.int(6, 8)) {
      for (const side of [-1, 1]) {
        if (!rng.chance(0.8)) continue;
        const w = rng.int(6, 8);
        const h = rng.int(5, 6);
        const x = side < 0 ? vx - 2 - 2 - w : vx + 2 + 2;
        rect(ctx, x, y - (h >> 1), w, h, T_FLOOR);
        // A short neck to the gallery.
        rect(ctx, side < 0 ? x + w : vx + 2, y - 1, 2, 2, T_FLOOR);
        addRoom(ctx, x, y - (h >> 1), w, h);
      }
    }
    // One pair off the middle of a long cross passage too.
    if (Math.abs(b.x - a.x) >= 16) {
      const mx = Math.round((a.x + b.x) / 2);
      for (const side of [-1, 1]) {
        if (!rng.chance(0.7)) continue;
        const w = rng.int(4, 6);
        const h = rng.int(5, 7);
        const y = side < 0 ? a.y - 2 - 2 - h : a.y + 2 + 2;
        rect(ctx, mx - (w >> 1), y, w, h, T_FLOOR);
        rect(ctx, mx - 1, side < 0 ? y + h : a.y + 2, 2, 2, T_FLOOR);
        addRoom(ctx, mx - (w >> 1), y, w, h);
      }
    }
  }
  landing(ctx, entry);
  landing(ctx, exit);
}

// ---------------------------------------------------------------------------
// Keep: rooms split by thin walls, doors between, one great hall
// ---------------------------------------------------------------------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function keep(ctx: ZoneCtx): void {
  const { g, rng, entry, exit, biome } = ctx;
  const X0 = 4;
  const Y0 = 4;
  const X1 = right(ctx) - 1;
  const Y1 = g.h - 5;
  const leaves: Box[] = [];
  const pairs: Array<[Box, Box, 'v' | 'h']> = [];
  const split = (b: Box, depth: number): Box[] => {
    const canV = b.w >= 18;
    const canH = b.h >= 16;
    if ((!canV && !canH) || (depth > 2 && b.w * b.h < 220 && rng.chance(0.5))) {
      leaves.push(b);
      return [b];
    }
    const vert = canV && (!canH || b.w > b.h * 1.1 || (b.w * 1.1 >= b.h && rng.chance(0.5)));
    if (vert) {
      const s = rng.int(8, b.w - 8);
      const A = { x: b.x, y: b.y, w: s, h: b.h };
      const B = { x: b.x + s + 1, y: b.y, w: b.w - s - 1, h: b.h };
      const la = split(A, depth + 1);
      const lb = split(B, depth + 1);
      pairs.push([pickNear(la, b.x + s, 'v'), pickNear(lb, b.x + s, 'v'), 'v']);
      return la.concat(lb);
    }
    const s = rng.int(7, b.h - 7);
    const A = { x: b.x, y: b.y, w: b.w, h: s };
    const B = { x: b.x, y: b.y + s + 1, w: b.w, h: b.h - s - 1 };
    const la = split(A, depth + 1);
    const lb = split(B, depth + 1);
    pairs.push([pickNear(la, b.y + s, 'h'), pickNear(lb, b.y + s, 'h'), 'h']);
    return la.concat(lb);
  };
  // The leaf of a subtree that touches the split line, picked at random.
  const pickNear = (ls: Box[], line: number, axis: 'v' | 'h'): Box => {
    const touch = ls.filter((l) => (axis === 'v' ? l.x + l.w === line || l.x === line + 1 : l.y + l.h === line || l.y === line + 1));
    return rng.pick(touch.length > 0 ? touch : ls);
  };
  split({ x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 }, 0);

  // The great hall: the biggest leaf, with a colonnade.
  let hall = leaves[0]!;
  for (const l of leaves) if (l.w * l.h > hall.w * hall.h) hall = l;

  const roomOfBox = new Map<Box, DungeonRoom>();
  for (const l of leaves) {
    rect(ctx, l.x, l.y, l.w, l.h, T_FLOOR);
    const r = addRoom(ctx, l.x, l.y, l.w, l.h);
    roomOfBox.set(l, r);
    if (l === hall) pillars(ctx, r, 4);
    else if (l.w >= 10 && l.h >= 10 && rng.chance(0.75)) pillars(ctx, r, rng.chance(0.5) ? 3 : 4);
    else if (rng.chance(0.15)) g.rectHeight(l.x, l.y, l.w, l.h, rng.chance(0.5) ? 1 : -1);
  }

  // Doors through the thin walls: a two-wide gap where the two rooms face.
  for (const [a, b, axis] of pairs) {
    if (axis === 'v') {
      const lo = Math.max(a.y, b.y) + 1;
      const hi = Math.min(a.y + a.h, b.y + b.h) - 3;
      const wx = a.x + a.w;
      if (hi >= lo) rect(ctx, wx, rng.int(lo, hi), 1, 2, T_FLOOR);
      else elbow(ctx, { x: a.x + (a.w >> 1), y: a.y + (a.h >> 1) }, { x: b.x + (b.w >> 1), y: b.y + (b.h >> 1) }, 2, T_FLOOR, true);
    } else {
      const lo = Math.max(a.x, b.x) + 1;
      const hi = Math.min(a.x + a.w, b.x + b.w) - 3;
      const wy = a.y + a.h;
      if (hi >= lo) rect(ctx, rng.int(lo, hi), wy, 2, 1, T_FLOOR);
      else elbow(ctx, { x: a.x + (a.w >> 1), y: a.y + (a.h >> 1) }, { x: b.x + (b.w >> 1), y: b.y + (b.h >> 1) }, 2, T_FLOOR, false);
    }
  }

  // A few extra doors between leaves that share a wall, for loops.
  for (let k = 0; k < Math.round(leaves.length * 0.3); k++) {
    const a = rng.pick(leaves);
    const b = rng.pick(leaves);
    if (a === b) continue;
    if (a.x + a.w + 1 === b.x) {
      const lo = Math.max(a.y, b.y) + 1;
      const hi = Math.min(a.y + a.h, b.y + b.h) - 3;
      if (hi >= lo) rect(ctx, a.x + a.w, rng.int(lo, hi), 1, 2, T_FLOOR);
    } else if (a.y + a.h + 1 === b.y) {
      const lo = Math.max(a.x, b.x) + 1;
      const hi = Math.min(a.x + a.w, b.x + b.w) - 3;
      if (hi >= lo) rect(ctx, rng.int(lo, hi), a.y + a.h, 2, 1, T_FLOOR);
    }
  }

  // Flooded halls in the drowned temple, fire channels in the foundry.
  if (biome === 'sunkenTemple') {
    for (const l of leaves) {
      if (!rng.chance(0.45)) continue;
      rect(ctx, l.x, l.y, l.w, l.h, T_WATER, (o) => o === T_FLOOR);
      if (l.w >= 10 && l.h >= 10) rect(ctx, l.x + 3, l.y + 3, l.w - 6, l.h - 6, T_DEEP_WATER, (o) => o === T_WATER);
    }
  } else if (biome === 'foundry') {
    for (const l of leaves) {
      if (l.w < 10 || l.h < 9 || !rng.chance(0.4)) continue;
      const my = l.y + (l.h >> 1);
      rect(ctx, l.x + 2, my - 1, l.w - 4, 2, T_LAVA, (o) => o === T_FLOOR);
      rect(ctx, l.x + (l.w >> 1) - 1, my - 1, 3, 2, T_BRIDGE, (o) => o === T_LAVA);
    }
  }

  const rooms = Array.from(roomOfBox.values());
  portTo(ctx, entry, rooms);
  portTo(ctx, exit, rooms);
  landing(ctx, entry);
  landing(ctx, exit);
}

// ---------------------------------------------------------------------------
// Rift: platforms hanging over nothing, joined by narrow bridges
// ---------------------------------------------------------------------------

export function rift(ctx: ZoneCtx): void {
  const { g, rng, entry, exit } = ctx;
  const noise = makeNoise(rng);
  const x1 = right(ctx);
  // The drop fills the zone; the edge of the void past it is the rift wall.
  for (let y = 3; y < g.h - 3; y++) {
    for (let x = 3; x <= x1; x++) {
      if (noise.fbm(x * 0.07, y * 0.07, 2) > 0.45) continue;
      put(ctx, x, y, T_CHASM);
    }
  }
  const pts: Vec2[] = [entry, exit, ...spread(rng, 9, 8, x1 - 8, g.h - 9, 34, 14, [entry, exit])];
  const lv = pts.map(() => rng.int(-1, 2));
  lv[0] = 0;
  lv[1] = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const r = i < 2 ? 4.5 : rng.range(5, 8);
    blob(ctx, p.x, p.y, r, T_FLOOR, noise, 0.35);
    g.rectHeight(Math.round(p.x - r - 1), Math.round(p.y - r - 1), Math.round(r * 2 + 3), Math.round(r * 2 + 3), lv[i]!);
    if (i >= 2) addRoundRoom(ctx, p.x, p.y, Math.floor(r * 0.75));
    // Shards of the spire standing up out of the bigger platforms.
    for (let k = i >= 2 && r > 5.5 ? rng.int(1, 3) : 0; k > 0; k--) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(2, r - 2);
      disc(ctx, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, rng.range(0.5, 1.1), T_VOID);
    }
  }
  for (const [a, b] of connectPoints(rng, pts, rng.int(1, 3))) {
    segment(ctx, pts[a]!, pts[b]!, 1, T_BRIDGE, (o) => o === T_CHASM || o === T_VOID);
  }
  // Platform heights are kept; the smoothing pass gives each bridge its steps.
  landing(ctx, entry);
  landing(ctx, exit);
  for (let i = 0; i < g.t.length; i++) if (g.t[i] === T_CHASM) g.heights[i] = -2;
}

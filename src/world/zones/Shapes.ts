/**
 * SLAY — the map shapes of the variety pass (docs/remake/mapvariety.md).
 *
 * Three zone generators a biome can roll instead of its signature shape, so
 * two maps of one biome do not walk the same way:
 *
 *  - `maw`: a ring of ground round a great pit (a chasm, a black tarn, a lake
 *    of fire), chambers off the ring, and sometimes a dais in the middle
 *    reached by one narrow causeway.
 *  - `cleft`: a river or a chasm runs the length of the zone and splits it.
 *    You arrive on one bank and leave from the other, over a few crossings:
 *    bridges, a ford, a floe of ice.
 *  - `terraces`: the zone climbs (or falls) in tiers, each a step above the
 *    last, with cliffs between them and ramps cut through the cliffs.
 *
 * Same contract as every zone generator (`Kit.ts`): carve into a void grid,
 * arrive on the west, leave on the east, any shape works indoors (void
 * becomes masonry or rock) and outdoors (void becomes the zone's edge).
 * Pure data; all randomness from the zone's own `Rng`.
 */

import type { Vec2 } from '../../types';
import { T_BRIDGE, T_CHASM, T_DEEP_WATER, T_FLOOR, T_ICE, T_LAVA, T_VOID, T_WATER } from '../Layouts';
import {
  type ZoneCtx,
  addRoundRoom,
  blob,
  clampN,
  connectPoints,
  disc,
  dist,
  elbow,
  get,
  inZone,
  landing,
  makeNoise,
  polyline,
  put,
  rect,
  segment,
  spread,
  wander,
} from './Kit';
import { bandMask, erodeEdge, fillMask, rollHeights } from './Outdoor';

/** Right edge of carve-able ground. */
const right = (ctx: ZoneCtx): number => Math.min(ctx.limitX, ctx.g.w - 3) - 1;

/**
 * What fills a pit or a river in this biome: fire where the land burns, black
 * water where it is wet, and a drop into the dark everywhere else.
 */
export function gulfTile(ctx: ZoneCtx): number {
  switch (ctx.biome) {
    case 'hell':
    case 'foundry':
      return T_LAVA;
    case 'swamp':
    case 'sunkenTemple':
    case 'caverns':
    case 'darkForest':
    case 'tundra':
    case 'hive':
      return T_DEEP_WATER;
    default:
      return T_CHASM;
  }
}

/** How you cross the gulf: a bridge, or in the frozen march a floe of ice. */
function crossingTile(ctx: ZoneCtx, gulf: number): number {
  return gulf === T_DEEP_WATER && ctx.biome === 'tundra' ? T_ICE : T_BRIDGE;
}

/** Pits and rivers sit below the ground round them. */
function sinkGulf(ctx: ZoneCtx, gulf: number): void {
  const { g } = ctx;
  for (let i = 0; i < g.t.length; i++) {
    const v = g.t[i];
    if (v === T_CHASM && gulf === T_CHASM) g.heights[i] = -2;
    else if (v === gulf || v === T_WATER) g.heights[i] = Math.min(g.heights[i], 0) - 1;
    else if (v === T_BRIDGE || v === T_ICE) g.heights[i] = Math.max(0, g.heights[i]);
  }
}

/** Single trunks, stones or columns left standing on open ground. */
function standing(ctx: ZoneCtx, chance: number): void {
  const { g, rng, entry, exit } = ctx;
  for (let y = 4; y < g.h - 4; y++) {
    for (let x = 4; x < right(ctx); x++) {
      if (get(ctx, x, y) !== T_FLOOR || !rng.chance(chance)) continue;
      if (dist({ x, y }, entry) < 6 || dist({ x, y }, exit) < 6) continue;
      // Never on the edge of a drop: a column there would pinch the path.
      let open = true;
      for (let d = 0; d < 9 && open; d++) if (get(ctx, x + (d % 3) - 1, y + ((d / 3) | 0) - 1) !== T_FLOOR) open = false;
      if (open) put(ctx, x, y, T_VOID);
    }
  }
}

// ---------------------------------------------------------------------------
// Maw: a ring round a great pit, chambers off the ring
// ---------------------------------------------------------------------------

export function maw(ctx: ZoneCtx): void {
  const { g, rng, entry, exit, outdoor } = ctx;
  const noise = makeNoise(rng);
  const x1 = right(ctx);
  const gulf = gulfTile(ctx);
  const cross = crossingTile(ctx, gulf);

  // The pit takes the middle of the zone; the ring and its chambers the rest.
  const cx = (entry.x + x1) / 2 + rng.range(-4, 4);
  const cy = g.h / 2 + rng.range(-2, 2);
  const ring = outdoor ? rng.range(4, 5.5) : rng.range(3.4, 4.4);
  const rx = clampN((x1 - entry.x) / 2 - ring - 18, 8, 20);
  const ry = clampN(g.h / 2 - ring - 15, 5, 12);
  const ox = rx + ring;
  const oy = ry + ring;
  // Outdoors the pit lies in open country.
  if (outdoor) fillMask(ctx, bandMask(ctx, noise, rng.range(0.72, 0.82)), T_FLOOR);
  const wob = (x: number, y: number): number => 1 + 0.1 * noise.fbm(x * 0.09, y * 0.09, 2);
  for (let y = 3; y < g.h - 3; y++) {
    for (let x = 3; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const w = wob(x, y);
      const inner = Math.hypot(dx / rx, dy / ry) * w;
      const outer = Math.hypot(dx / ox, dy / oy) * w;
      if (inner < 1) put(ctx, x, y, gulf);
      else if (outer < 1) put(ctx, x, y, T_FLOOR);
    }
  }
  // A point on the middle of the ring, at angle a.
  const onRing = (a: number): Vec2 => ({
    x: Math.round(cx + Math.cos(a) * (rx + ring / 2)),
    y: Math.round(cy + Math.sin(a) * (ry + ring / 2)),
  });

  // Ring rooms, so spawns spread round it rather than bunching at the ports.
  const anchors: Vec2[] = [];
  const ringRooms = 6;
  for (let k = 0; k < ringRooms; k++) {
    const p = onRing((k / ringRooms) * Math.PI * 2 + rng.range(-0.2, 0.2));
    addRoundRoom(ctx, p.x, p.y, Math.max(2, Math.floor(ring / 2)));
    anchors.push(p);
  }

  // Chambers over everything round the ring, joined to each other and to it,
  // so the pit is the hub of a warren and not a lone circle.
  const clear = (p: Vec2, pad: number): boolean => Math.hypot((p.x - cx) / (ox + pad), (p.y - cy) / (oy + pad)) >= 1;
  const chambers = spread(rng, 9, 7, x1 - 7, g.h - 8, outdoor ? 16 : 32, outdoor ? 15 : 10, [entry, exit]).filter((p) => clear(p, 5));
  for (const c of chambers) {
    const r = outdoor ? rng.range(4.5, 7.5) : rng.range(3.8, 6.4);
    blob(ctx, c.x, c.y, r, T_FLOOR, noise, outdoor ? 0.42 : 0.3, (o) => o !== gulf);
    addRoundRoom(ctx, c.x, c.y, Math.floor(r * 0.75));
    // Some chambers keep a pillar or a stone of their own.
    if (r > 5 && rng.chance(0.5)) {
      const b = rng.range(0, Math.PI * 2);
      disc(ctx, c.x + Math.cos(b) * (r * 0.5), c.y + Math.sin(b) * (r * 0.5), rng.range(0.6, 1.1), T_VOID);
    }
  }
  const pts: Vec2[] = [entry, exit, ...anchors, ...chambers];
  for (const [a, b] of connectPoints(rng, pts, rng.int(3, 5))) {
    const A = pts[a]!;
    const B = pts[b]!;
    polyline(ctx, wander(rng, A, B, Math.min(4, dist(A, B) * 0.15), 2), outdoor ? rng.range(1.4, 2) : 1.2, T_FLOOR, (o) => o !== gulf);
  }

  // The dais: an island in the middle, reached by one narrow causeway.
  if (rng.chance(0.65)) {
    const dr = clampN(Math.min(rx, ry) * 0.42, 3.2, 6);
    blob(ctx, cx, cy, dr, T_FLOOR, noise, 0.2);
    addRoundRoom(ctx, cx, cy, Math.floor(dr * 0.7));
    const a = rng.range(0, Math.PI * 2);
    const to = onRing(a);
    segment(ctx, { x: cx, y: cy }, to, 1, cross, (o) => o === gulf);
  }

  if (outdoor) {
    erodeEdge(ctx, noise, 2, 0.24);
    standing(ctx, 0.012);
    rollHeights(ctx, noise, 1.2);
  } else {
    standing(ctx, 0.006);
  }
  sinkGulf(ctx, gulf);
  landing(ctx, entry);
  landing(ctx, exit);
}

// ---------------------------------------------------------------------------
// Cleft: a river or chasm splits the zone, crossings over it
// ---------------------------------------------------------------------------

export function cleft(ctx: ZoneCtx): void {
  const { g, rng, entry, exit, outdoor } = ctx;
  const noise = makeNoise(rng);
  const x1 = right(ctx);
  const gulf = gulfTile(ctx);
  const cross = crossingTile(ctx, gulf);

  // You arrive on one bank and leave from the other: the course passes
  // between the entry and one edge at the west end, and between the exit and
  // the other edge at the east end.
  const south = rng.chance(0.5);
  const off = rng.range(8, 11);
  const y0 = clampN(south ? entry.y + off : entry.y - off, 7, g.h - 8);
  const y1 = clampN(south ? exit.y - off : exit.y + off, 7, g.h - 8);
  const course = wander(rng, { x: 1, y: y0 }, { x: x1 + 2, y: y1 }, g.h * rng.range(0.08, 0.14), 2);
  // The course's centre line, per column.
  const midY = new Float32Array(g.w);
  for (let i = 0; i + 1 < course.length; i++) {
    const a = course[i]!;
    const b = course[i + 1]!;
    for (let x = Math.max(0, Math.ceil(a.x)); x <= Math.min(g.w - 1, Math.floor(b.x)); x++) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      midY[x] = a.y + (b.y - a.y) * t;
    }
  }
  const half = outdoor ? rng.range(2.2, 3.2) : rng.range(1.6, 2.4);
  const halfAt = (x: number): number => half * (1 + 0.3 * noise.fbm(x * 0.07, 3.7, 2));

  // --- The banks ---------------------------------------------------------------
  const banks: Vec2[][] = [[], []];
  if (outdoor) {
    fillMask(ctx, bandMask(ctx, noise, rng.range(0.82, 0.9)), T_FLOOR);
    erodeEdge(ctx, noise, 1, 0.28);
    for (const p of spread(rng, 9, 7, x1 - 7, g.h - 8, 30, 15, [entry, exit])) {
      const side = p.y < midY[p.x]! ? 0 : 1;
      if (Math.abs(p.y - midY[p.x]!) < halfAt(p.x) + 6 || get(ctx, p.x, p.y) !== T_FLOOR) continue;
      banks[side]!.push(p);
      addRoundRoom(ctx, p.x, p.y, 4);
      // Groves and boulders: the banks are not one bare field.
      if (rng.chance(0.55)) {
        const a = rng.range(0, Math.PI * 2);
        blob(ctx, p.x + Math.cos(a) * 4.5, p.y + Math.sin(a) * 4.5, rng.range(1, 2.2), T_VOID, noise, 0.4);
      }
    }
  } else {
    // Indoors each bank is a string of chambers joined by passages.
    for (const p of spread(rng, 9, 7, x1 - 7, g.h - 8, 34, 11, [entry, exit])) {
      const r = rng.range(3.8, 6.6);
      const side = p.y < midY[p.x]! ? 0 : 1;
      if (Math.abs(p.y - midY[p.x]!) < halfAt(p.x) + r + 2) continue;
      banks[side]!.push(p);
      blob(ctx, p.x, p.y, r, T_FLOOR, noise, 0.32);
      addRoundRoom(ctx, p.x, p.y, Math.floor(r * 0.75));
    }
    for (let s = 0; s < 2; s++) {
      const pts = banks[s]!;
      for (const [a, b] of connectPoints(rng, pts, rng.int(1, 2))) elbow(ctx, pts[a]!, pts[b]!, 3, T_FLOOR, rng.chance(0.5));
    }
    // The ports join their bank's nearest chamber.
    const nearest = (p: Vec2): Vec2 | null => {
      const side = p.y < midY[p.x]! ? 0 : 1;
      let best: Vec2 | null = null;
      for (const q of banks[side]!) if (!best || dist(p, q) < dist(p, best)) best = q;
      return best;
    };
    for (const p of [entry, exit]) {
      const q = nearest(p);
      if (q) elbow(ctx, p, q, 3, T_FLOOR, true);
    }
  }

  // --- The gulf --------------------------------------------------------------
  // Shallows along a water course, so the bank slopes into it.
  if (gulf === T_DEEP_WATER) {
    for (let x = 3; x <= x1; x++) {
      const h = halfAt(x) + 1.2;
      for (let y = Math.floor(midY[x]! - h); y <= Math.ceil(midY[x]! + h); y++) {
        if (get(ctx, x, y) === T_FLOOR) put(ctx, x, y, T_WATER);
      }
    }
  }
  for (let x = 3; x <= x1; x++) {
    const h = halfAt(x);
    for (let y = Math.floor(midY[x]! - h); y <= Math.ceil(midY[x]! + h); y++) {
      if (Math.abs(y - midY[x]!) <= h) put(ctx, x, y, gulf);
    }
  }

  // --- Crossings ---------------------------------------------------------------
  // Spread along the course, never at its very ends. Indoors a crossing runs
  // from chamber to chamber; outdoors it is a deck across with a landing each side.
  const nc = rng.int(2, 3);
  for (let c = 0; c < nc; c++) {
    const x = Math.round(12 + ((c + rng.range(0.25, 0.75)) / nc) * (x1 - 24));
    const m = midY[x]!;
    const reach = halfAt(x) + 3;
    const ford = outdoor && gulf === T_DEEP_WATER && cross === T_BRIDGE && c === 1 && rng.chance(0.5);
    const w = cross === T_ICE ? rng.int(4, 6) : 3;
    const top = { x, y: Math.round(m - reach) };
    const bot = { x, y: Math.round(m + reach) };
    // Ground up to the water's edge, then the crossing itself over the gulf.
    rect(ctx, x - (w >> 1), top.y, w, bot.y - top.y + 1, T_FLOOR, (o) => o === T_VOID);
    rect(ctx, x - (w >> 1), top.y, w, bot.y - top.y + 1, ford ? T_WATER : cross, (o) => o === gulf || (o === T_WATER && !ford));
    for (const end of [top, bot]) {
      landing(ctx, end, 2);
      const side = end === top ? 0 : 1;
      let best: Vec2 | null = null;
      for (const q of banks[side]!) if (!best || dist(end, q) < dist(end, best)) best = q;
      if (best && dist(end, best) < 40) {
        if (outdoor) polyline(ctx, wander(rng, end, best, 3, 2), 1.5, T_FLOOR, (o) => o !== gulf);
        else elbow(ctx, end, best, 3, T_FLOOR, false);
      }
    }
  }

  if (outdoor) {
    standing(ctx, 0.008);
    rollHeights(ctx, noise, 1.2);
  }
  sinkGulf(ctx, gulf);
  landing(ctx, entry);
  landing(ctx, exit);
}

// ---------------------------------------------------------------------------
// Terraces: tiers at rising or falling heights, cliffs between, ramps through
// ---------------------------------------------------------------------------

export function terraces(ctx: ZoneCtx): void {
  const { g, rng, entry, exit, outdoor } = ctx;
  const noise = makeNoise(rng);
  const x1 = right(ctx);

  // The tiers run across the line of travel. The boundaries wave a little.
  const tiers = clampN(Math.round((x1 - entry.x) / rng.range(20, 26)), 3, 5);
  const bx: number[] = [];
  for (let k = 1; k < tiers; k++) bx.push(entry.x + ((x1 - entry.x) * (k + rng.range(-0.15, 0.15))) / tiers);
  const amp = rng.range(2, 5);
  const freq = rng.range(0.06, 0.12);
  const ph = rng.range(0, Math.PI * 2);
  const edgeX = (k: number, y: number): number => bx[k]! + amp * Math.sin(y * freq + ph + k * 1.7) + 1.5 * noise.fbm(y * 0.15, k * 5.3, 2);
  const tierOf = (x: number, y: number): number => {
    let t = 0;
    for (let k = 0; k < bx.length; k++) if (x >= edgeX(k, y)) t = k + 1;
    return t;
  };

  // Heights: a climb, a descent, or up over a ridge and down again.
  const shape = rng.pick(['climb', 'fall', 'ridge'] as const);
  const level: number[] = [0];
  for (let k = 1; k < tiers; k++) {
    const step = rng.int(1, 2);
    const up = shape === 'climb' || (shape === 'ridge' && k <= tiers / 2);
    level.push(clampN(level[k - 1]! + (up ? step : -step), -5, 5));
  }
  // The boss arena stands at ground level: the last tier meets it there.
  if (ctx.boss) {
    const last = level[tiers - 1]!;
    for (let k = 0; k < tiers; k++) level[k] = level[k]! - last;
  }

  // --- Ground on each tier ----------------------------------------------------
  const ramp = new Uint8Array(g.w * g.h);
  if (outdoor) fillMask(ctx, bandMask(ctx, noise, rng.range(0.7, 0.82)), T_FLOOR);
  const pts: Vec2[] = [entry, exit, ...spread(rng, 9, 7, x1 - 7, g.h - 8, outdoor ? 22 : 26, outdoor ? 14 : 11, [entry, exit])];
  for (let i = 2; i < pts.length; i++) {
    const p = pts[i]!;
    const r = outdoor ? rng.range(4.5, 7.5) : rng.range(3.8, 6.6);
    blob(ctx, p.x, p.y, r, T_FLOOR, noise, outdoor ? 0.4 : 0.28);
    addRoundRoom(ctx, p.x, p.y, Math.floor(r * 0.75));
  }
  if (outdoor) erodeEdge(ctx, noise, 1, 0.3);
  // Paths: within a tier anything goes; between tiers they become ramps.
  for (const [a, b] of connectPoints(rng, pts, rng.int(2, 3))) {
    const A = pts[a]!;
    const B = pts[b]!;
    const line = wander(rng, A, B, Math.min(5, dist(A, B) * 0.15), 2);
    if (tierOf(A.x, A.y) === tierOf(B.x, B.y)) polyline(ctx, line, outdoor ? 1.5 : 1.2, T_FLOOR);
    else polyline(ctx, line, 1.3, T_FLOOR, undefined, ramp);
  }
  // The way through always climbs the tiers in order.
  polyline(ctx, wander(rng, entry, exit, g.h * 0.18, 3), 1.3, T_FLOOR, undefined, ramp);

  // --- Cliffs ----------------------------------------------------------------
  // Void along each boundary, except where a ramp runs through it.
  const cliff = outdoor ? 1.6 : 1.1;
  for (let y = 3; y < g.h - 3; y++) {
    for (let k = 0; k < bx.length; k++) {
      const e = edgeX(k, y);
      for (let x = Math.floor(e - cliff); x <= Math.ceil(e + cliff); x++) {
        if (!inZone(ctx, x, y) || Math.abs(x - e) > cliff) continue;
        if (ramp[y * g.w + x]) continue;
        put(ctx, x, y, T_VOID);
      }
    }
  }

  // --- Heights -----------------------------------------------------------------
  // Each tier at its level; a ramp eases from one level to the next over
  // RAMP tiles each side of the boundary.
  const RAMP = 5;
  for (let y = 3; y < g.h - 3; y++) {
    for (let x = 3; x <= x1; x++) {
      if (get(ctx, x, y) === T_VOID) continue;
      const t = tierOf(x, y);
      let h = level[t]!;
      if (ramp[y * g.w + x]) {
        for (let k = 0; k < bx.length; k++) {
          const s = x - edgeX(k, y);
          if (Math.abs(s) > RAMP) continue;
          const f = (s + RAMP) / (2 * RAMP);
          h = Math.round(level[k]! + (level[k + 1]! - level[k]!) * f);
        }
      }
      g.setHeight(x, y, h);
    }
  }

  standing(ctx, outdoor ? 0.01 : 0.005);
  landing(ctx, entry);
  landing(ctx, exit);
  // The landings sit on their tier's level.
  for (const p of [entry, exit]) {
    const h = level[tierOf(p.x, p.y)]!;
    for (let y = p.y - 3; y <= p.y + 3; y++) for (let x = p.x - 3; x <= p.x + 3; x++) if (inZone(ctx, x, y) && get(ctx, x, y) !== T_VOID) g.setHeight(x, y, h);
  }
}

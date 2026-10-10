/**
 * SLAY — outdoor zone generators (map remake, docs/remake/maps.md).
 *
 * forest, swamp, dunes, tundra, wastes. Each one carves open ground into a
 * void grid, west to east, and leaves the void as the zone's natural edge
 * (tree line, reeds, dune ridge, cliff, rock). Outdoor ground is wide: paths
 * are three or more tiles across and most of the zone is open.
 */

import type { Vec2 } from '../../types';
import { T_BRIDGE, T_CHASM, T_DEEP_WATER, T_FLOOR, T_ICE, T_LAVA, T_RUIN, T_VOID, T_WATER } from '../Layouts';
import {
  type Noise2,
  type ZoneCtx,
  addRoom,
  addRoundRoom,
  blob,
  clampN,
  connectPoints,
  disc,
  dist,
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

/** Right edge of carve-able ground. */
const right = (ctx: ZoneCtx): number => Math.min(ctx.limitX, ctx.g.w - 3) - 1;

/**
 * The silhouette of an open zone: a band running from the entry to the exit
 * that swells and narrows, with a ragged edge. `cover` is the share of the
 * zone's height the band fills on average.
 */
function bandMask(ctx: ZoneCtx, noise: Noise2, cover: number): Uint8Array {
  const { g, rng, entry, exit } = ctx;
  const m = new Uint8Array(g.w * g.h);
  const x0 = 3;
  const x1 = right(ctx);
  const amp = g.h * rng.range(0.08, 0.16);
  const k = rng.range(1, 2.2);
  const ph = rng.range(0, Math.PI * 2);
  for (let x = x0; x <= x1; x++) {
    const t = clampN((x - entry.x) / Math.max(1, exit.x - entry.x), 0, 1);
    const pin = Math.sin(t * Math.PI);
    const cy = entry.y + (exit.y - entry.y) * t + amp * pin * Math.sin(t * Math.PI * k + ph);
    const half = (g.h * cover) / 2 * (1 + 0.28 * noise.fbm(x * 0.045, 7.3, 2));
    for (let y = 3; y < g.h - 3; y++) {
      const edge = half + 4 * noise.fbm(x * 0.13, y * 0.13, 2);
      if (Math.abs(y - cy) < edge) m[y * g.w + x] = 1;
    }
  }
  return m;
}

function fillMask(ctx: ZoneCtx, m: Uint8Array, v: number): void {
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    const x = i % ctx.g.w;
    const y = (i / ctx.g.w) | 0;
    put(ctx, x, y, v);
  }
}

/** Gentle rolling ground. `amp` is the largest step away from zero. */
function rollHeights(ctx: ZoneCtx, noise: Noise2, amp: number, scale = 0.035): void {
  const { g } = ctx;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const v = g.t[y * g.w + x];
      if (v === T_VOID) continue;
      if (!inZone(ctx, x, y)) continue;
      g.setHeight(x, y, Math.round(noise.fbm(x * scale + 3.1, y * scale - 1.7, 3) * amp));
    }
  }
}

/** Points spread over the band to hang rooms on (spawn roles, chests, shrines). */
function bandRooms(ctx: ZoneCtx, m: Uint8Array, minDist: number, r: number): Vec2[] {
  const { g, rng } = ctx;
  const pts = spread(rng, 8, 6, right(ctx) - 6, g.h - 7, Math.ceil((right(ctx) * g.h) / (minDist * minDist * 0.9)), minDist, [ctx.entry]);
  const out: Vec2[] = [];
  for (const p of pts) {
    if (!m[p.y * g.w + p.x]) continue;
    addRoundRoom(ctx, p.x, p.y, r);
    out.push(p);
  }
  return out;
}

/** Wear the void edge back a little where noise says so, for a ragged rim. */
function erodeEdge(ctx: ZoneCtx, noise: Noise2, passes: number, threshold: number): void {
  const { g } = ctx;
  for (let p = 0; p < passes; p++) {
    const src = g.t.slice();
    for (let y = 3; y < g.h - 3; y++) {
      for (let x = 3; x < right(ctx); x++) {
        const i = y * g.w + x;
        if (src[i] !== T_VOID) continue;
        const n = (src[i - 1] === T_FLOOR ? 1 : 0) + (src[i + 1] === T_FLOOR ? 1 : 0) + (src[i - g.w] === T_FLOOR ? 1 : 0) + (src[i + g.w] === T_FLOOR ? 1 : 0);
        if (n === 0) continue;
        if (noise.fbm(x * 0.21 + p * 9, y * 0.21, 2) + n * 0.12 > threshold) put(ctx, x, y, T_FLOOR);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Forest: clearings joined by winding paths, groves and ponds
// ---------------------------------------------------------------------------

export function forest(ctx: ZoneCtx): void {
  const { g, rng, entry, exit } = ctx;
  const noise = makeNoise(rng);
  const x1 = right(ctx);
  const n = clampN(Math.round(((x1 - 6) * (g.h - 6)) / 300), 6, 16);
  const pts: Vec2[] = [entry, exit, ...spread(rng, 11, 9, x1 - 9, g.h - 10, n, 14, [entry, exit])];

  // Clearings.
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const r = i < 2 ? rng.range(4, 5.5) : rng.range(4.5, 8.5);
    blob(ctx, p.x, p.y, r, T_FLOOR, noise, 0.4);
    if (i >= 2) addRoundRoom(ctx, p.x, p.y, Math.floor(r * 0.8));
  }

  // Paths: a tree, plus a couple of loops so the wood is not a corridor maze.
  for (const [a, b] of connectPoints(rng, pts, rng.int(2, 4))) {
    const A = pts[a]!;
    const B = pts[b]!;
    polyline(ctx, wander(rng, A, B, Math.min(9, dist(A, B) * 0.2)), rng.range(1.25, 1.9), T_FLOOR);
  }

  // Undergrowth: the path edges are not ruled lines.
  erodeEdge(ctx, noise, 2, 0.22);

  // Groves standing in the bigger clearings: knots of trunks you walk round.
  for (let i = 2; i < pts.length; i++) {
    const p = pts[i]!;
    if (!rng.chance(0.55)) continue;
    const k = rng.int(1, 3);
    for (let j = 0; j < k; j++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(2.5, 4.5);
      disc(ctx, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, rng.range(0.6, 1.3), T_VOID);
    }
  }

  // Ponds, black and still.
  for (let i = 2; i < pts.length; i++) {
    if (!rng.chance(0.22)) continue;
    const p = pts[i]!;
    const r = rng.range(2, 3.4);
    blob(ctx, p.x + rng.range(-2, 2), p.y + rng.range(-2, 2), r, T_WATER, noise, 0.3, (o) => o === T_FLOOR);
    if (r > 2.8) disc(ctx, p.x, p.y, r - 1.6, T_DEEP_WATER, r - 1.6, (o) => o === T_WATER);
  }

  rollHeights(ctx, noise, 1.6);
  landing(ctx, entry);
  landing(ctx, exit);
}

// ---------------------------------------------------------------------------
// Swamp: land, shallows and deep water, a boardwalk spine, dead trees
// ---------------------------------------------------------------------------

export function swamp(ctx: ZoneCtx): void {
  const { g, rng, entry, exit } = ctx;
  const noise = makeNoise(rng);
  const mask = bandMask(ctx, noise, 0.82);
  const f = rng.range(0.06, 0.085);
  const landBias = rng.range(-0.04, 0.06);
  for (let y = 3; y < g.h - 3; y++) {
    for (let x = 3; x <= right(ctx); x++) {
      const i = y * g.w + x;
      if (!mask[i]) continue;
      const v = noise.fbm(x * f, y * f, 3) + landBias;
      if (v > 0.1) put(ctx, x, y, T_FLOOR);
      else if (v > -0.08) put(ctx, x, y, T_WATER);
      else if (v > -0.42) put(ctx, x, y, T_DEEP_WATER);
      // Below that it stays void: a reed bed or a stand of drowned trees.
    }
  }

  // The boardwalk: one winding spine from the entry to the exit, three wide,
  // planked over anything you could not wade.
  const spine = wander(rng, entry, exit, g.h * 0.22, 3);
  polyline(ctx, spine, 1.2, T_BRIDGE, (o) => o === T_DEEP_WATER || o === T_VOID);
  polyline(ctx, spine, 1.2, T_FLOOR, (o) => o === T_WATER && rng.chance(0.5));

  // Islands: the bigger patches of land are where things happen.
  const seen = new Uint8Array(g.w * g.h);
  const stack: number[] = [];
  for (let s = 0; s < g.t.length; s++) {
    if (seen[s] || g.t[s] !== T_FLOOR) continue;
    let n = 0;
    let minX = 1e9;
    let minY = 1e9;
    let maxX = -1;
    let maxY = -1;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      n++;
      const cx = c % g.w;
      const cy = (c / g.w) | 0;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      for (const nb of [c - 1, c + 1, c - g.w, c + g.w]) {
        if (nb < 0 || nb >= g.t.length || seen[nb] || g.t[nb] !== T_FLOOR) continue;
        seen[nb] = 1;
        stack.push(nb);
      }
    }
    if (n >= 45) addRoom(ctx, minX, minY, maxX - minX + 1, maxY - minY + 1);
  }

  // Branch walks out to a few islands off the spine.
  const isles = ctx.rooms.slice();
  rng.shuffle(isles);
  for (const r of isles.slice(0, rng.int(2, 4))) {
    let best = spine[0]!;
    for (const p of spine) if (dist(p, r.center) < dist(best, r.center)) best = p;
    if (dist(best, r.center) < 5) continue;
    polyline(ctx, wander(rng, best, r.center, 4, 3), 1, T_BRIDGE, (o) => o === T_DEEP_WATER || o === T_VOID);
  }

  // Drowned trees on the land: single trunks.
  for (let y = 4; y < g.h - 4; y++) {
    for (let x = 4; x < right(ctx); x++) {
      if (get(ctx, x, y) !== T_FLOOR || !rng.chance(0.012)) continue;
      if (dist({ x, y }, entry) < 5 || dist({ x, y }, exit) < 5) continue;
      put(ctx, x, y, T_VOID);
    }
  }

  // Rooms for the open water stretches too, so the fen is not all one room.
  if (ctx.rooms.length < 5) bandRooms(ctx, mask, 18, 4);

  rollHeights(ctx, noise, 1, 0.05);
  // Water sits a step down so it reads as water and not wet floor.
  for (let i = 0; i < g.t.length; i++) {
    const v = g.t[i];
    if (v === T_WATER || v === T_DEEP_WATER) g.heights[i] = Math.min(g.heights[i], 0) - 1;
    if (v === T_BRIDGE) g.heights[i] = Math.max(0, g.heights[i]);
  }
  landing(ctx, entry);
  landing(ctx, exit);
}

// ---------------------------------------------------------------------------
// Dunes: a broad sand sea, sinuous ridges with passes, ruined buildings
// ---------------------------------------------------------------------------

export function dunes(ctx: ZoneCtx): void {
  const { g, rng, entry, exit } = ctx;
  const noise = makeNoise(rng);
  const mask = bandMask(ctx, noise, rng.range(0.66, 0.78));
  fillMask(ctx, mask, T_FLOOR);

  // Ridges: long curved crests running across the band, each with a pass or
  // two through it, so the sand is a sequence of bowls and not one plain.
  const x1 = right(ctx);
  const ridges = Math.max(2, Math.round((x1 - 10) / rng.range(22, 30)));
  for (let r = 0; r < ridges; r++) {
    const x = 10 + ((r + 0.5) / ridges) * (x1 - 20) + rng.range(-4, 4);
    const top = { x: x + rng.range(-8, 8), y: 3 };
    const bot = { x: x + rng.range(-8, 8), y: g.h - 4 };
    const line = wander(rng, top, bot, rng.range(5, 10), 2);
    // Passes.
    // Passes, always where the crest crosses open sand.
    const open: number[] = [];
    line.forEach((p, i) => {
      if (mask[Math.round(p.y) * g.w + Math.round(p.x)]) open.push(i);
    });
    if (open.length === 0) continue;
    const gaps: number[] = [];
    const passes = open.length > 14 ? 2 : 1;
    for (let p = 0; p < passes; p++) gaps.push(open[Math.floor(open.length * ((p + rng.range(0.25, 0.75)) / passes))]!);
    const kept = (i: number): boolean => gaps.every((t) => Math.abs(i - t) > 2);
    // Draw the crest only where it is kept, as broken runs.
    for (let i = 0; i + 1 < line.length; i++) {
      if (!kept(i) || !kept(i + 1)) continue;
      segment(ctx, line[i]!, line[i + 1]!, rng.range(0.7, 1.4), T_VOID);
    }
  }

  // Ruins: the bones of a town under the sand. Broken wall outlines, a door gap.
  const nRuins = rng.int(2, 5);
  const spots = spread(rng, 12, 8, x1 - 14, g.h - 14, nRuins, 16, [entry, exit]);
  for (const s of spots) {
    if (!mask[s.y * g.w + s.x]) continue;
    const w = rng.int(6, 10);
    const h = rng.int(5, 9);
    const x = s.x - (w >> 1);
    const y = s.y - (h >> 1);
    rect(ctx, x, y, w, h, T_FLOOR);
    const door = rng.int(0, 3);
    for (let xx = x; xx < x + w; xx++) {
      for (const yy of [y, y + h - 1]) {
        const isDoor = (door === 0 && yy === y || door === 1 && yy === y + h - 1) && Math.abs(xx - (x + (w >> 1))) <= 1;
        if (!isDoor && rng.chance(0.78)) put(ctx, xx, yy, T_RUIN);
      }
    }
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      for (const xx of [x, x + w - 1]) {
        const isDoor = (door === 2 && xx === x || door === 3 && xx === x + w - 1) && Math.abs(yy - (y + (h >> 1))) <= 1;
        if (!isDoor && rng.chance(0.78)) put(ctx, xx, yy, T_RUIN);
      }
    }
    addRoom(ctx, x + 1, y + 1, w - 2, h - 2);
  }

  bandRooms(ctx, mask, 17, 4);

  // Dune swell: bigger and slower than forest ground.
  rollHeights(ctx, noise, 2.4, 0.028);
  landing(ctx, entry);
  landing(ctx, exit);
}

// ---------------------------------------------------------------------------
// Tundra: frozen shelves at different heights, cliffs between, ramps up
// ---------------------------------------------------------------------------

export function tundra(ctx: ZoneCtx): void {
  const { g, rng, entry, exit } = ctx;
  const noise = makeNoise(rng);
  const mask = bandMask(ctx, noise, rng.range(0.7, 0.82));
  const x1 = right(ctx);

  // Shelves: a Voronoi of anchors, each with its own height.
  const anchors: Vec2[] = [entry, exit, ...spread(rng, 9, 7, x1 - 8, g.h - 8, 40, 15, [entry, exit])].filter(
    (p, i) => i < 2 || mask[p.y * g.w + p.x],
  );
  const level = anchors.map((_, i) => (i < 2 ? 0 : rng.int(0, 3)));
  const owner = new Int16Array(g.w * g.h).fill(-1);
  for (let y = 3; y < g.h - 3; y++) {
    for (let x = 3; x <= x1; x++) {
      const i = y * g.w + x;
      if (!mask[i]) continue;
      let a = -1;
      let da = 1e9;
      let b = -1;
      let db = 1e9;
      for (let k = 0; k < anchors.length; k++) {
        const d = Math.hypot(x - anchors[k]!.x, y - anchors[k]!.y);
        if (d < da) {
          b = a;
          db = da;
          a = k;
          da = d;
        } else if (d < db) {
          b = k;
          db = d;
        }
      }
      owner[i] = a;
      // A cliff where two shelves of different height meet.
      const cliff = b >= 0 && level[a] !== level[b] && db - da < 1.6 + noise.fbm(x * 0.2, y * 0.2, 2) * 0.6;
      put(ctx, x, y, cliff ? T_VOID : T_FLOOR);
      g.setHeight(x, y, level[a]!);
    }
  }

  // Ramps along the spanning tree of shelves, three wide, rising evenly.
  for (const [a, b] of connectPoints(rng, anchors, rng.int(2, 4))) {
    const A = anchors[a]!;
    const B = anchors[b]!;
    const len = Math.max(1, dist(A, B));
    segment(ctx, A, B, 1.3, T_FLOOR, (o) => o === T_VOID || o === T_FLOOR);
    // Heights along the ramp.
    for (let s = 0; s <= len * 2; s++) {
      const t = s / (len * 2);
      const cx = A.x + (B.x - A.x) * t;
      const cy = A.y + (B.y - A.y) * t;
      const tt = clampN((t - 0.3) / 0.4, 0, 1);
      const hv = Math.round(level[a]! + (level[b]! - level[a]!) * tt);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          if (dx * dx + dy * dy > 2.5) continue;
          if (inZone(ctx, x, y) && get(ctx, x, y) === T_FLOOR) g.setHeight(x, y, hv);
        }
      }
    }
  }

  // Shelves are rooms.
  for (let k = 2; k < anchors.length; k++) addRoundRoom(ctx, anchors[k]!.x, anchors[k]!.y, 4);

  // Frozen ponds and boulders.
  for (let k = 2; k < anchors.length; k++) {
    const p = anchors[k]!;
    if (rng.chance(0.3)) {
      blob(ctx, p.x + rng.range(-3, 3), p.y + rng.range(-3, 3), rng.range(2.2, 4.2), T_ICE, noise, 0.35, (o) => o === T_FLOOR);
    } else if (rng.chance(0.5)) {
      const a = rng.range(0, Math.PI * 2);
      disc(ctx, p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4, rng.range(0.8, 1.6), T_VOID);
    }
  }

  landing(ctx, entry);
  landing(ctx, exit);
}

// ---------------------------------------------------------------------------
// Wastes: open scorched plain cut by rivers of fire or rifts, bridged
// ---------------------------------------------------------------------------

export function wastes(ctx: ZoneCtx): void {
  const { g, rng, entry, exit } = ctx;
  const noise = makeNoise(rng);
  const hellish = ctx.biome === 'hell';
  const pit = hellish ? T_LAVA : T_CHASM;
  const mask = bandMask(ctx, noise, rng.range(0.72, 0.84));
  fillMask(ctx, mask, T_FLOOR);
  erodeEdge(ctx, noise, 1, 0.3);
  const x1 = right(ctx);

  // Rivers run across the line of travel, so each one is a crossing to make.
  const rivers = clampN(Math.round((x1 - 16) / rng.range(26, 36)), 1, 3);
  for (let r = 0; r < rivers; r++) {
    const x = 14 + ((r + 0.5) / rivers) * (x1 - 28) + rng.range(-5, 5);
    const top = { x: x + rng.range(-10, 10), y: 2 };
    const bot = { x: x + rng.range(-10, 10), y: g.h - 3 };
    const course = wander(rng, top, bot, rng.range(4, 9), 2);
    const width = rng.range(1.4, 2.6);
    polyline(ctx, course, width, pit, (o) => o === T_FLOOR);
    // One or two bridges, three wide, square across the river.
    const nb = rng.int(1, 2);
    for (let b = 0; b < nb; b++) {
      const at = course[Math.floor(course.length * (0.25 + 0.5 * ((b + rng.next()) / nb)))]!;
      const ax = Math.round(at.x);
      const ay = Math.round(at.y);
      if (get(ctx, ax, ay) !== pit) continue;
      rect(ctx, ax - 7, ay - 1, 15, 3, T_BRIDGE, (o) => o === pit);
    }
  }

  // Pools of the same stuff, off the line of travel.
  for (const p of spread(rng, 8, 6, x1 - 6, g.h - 7, rng.int(2, 5), 14, [entry, exit])) {
    blob(ctx, p.x, p.y, rng.range(1.6, 3.4), pit, noise, 0.4, (o) => o === T_FLOOR);
  }

  // Rock spires.
  for (let y = 5; y < g.h - 5; y += 2) {
    for (let x = 5; x < x1 - 2; x += 2) {
      if (get(ctx, x, y) !== T_FLOOR || !rng.chance(0.022)) continue;
      if (dist({ x, y }, entry) < 6 || dist({ x, y }, exit) < 6) continue;
      disc(ctx, x, y, rng.range(0.7, 2.2), T_VOID, undefined, (o) => o === T_FLOOR);
    }
  }

  bandRooms(ctx, mask, 17, 4);
  rollHeights(ctx, noise, 1.6, 0.04);
  for (let i = 0; i < g.t.length; i++) if (g.t[i] === pit) g.heights[i] = Math.min(g.heights[i], 0) - 1;
  landing(ctx, entry);
  landing(ctx, exit);
}

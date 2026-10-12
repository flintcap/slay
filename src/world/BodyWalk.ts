/**
 * SLAY — walking a round body through the level, for anything that is not
 * the hero.
 *
 * The hero's own movement (`entities/Player.ts`) keeps velocity and slips
 * round things it meets head on. Summons need less: a step that never ends
 * inside a wall or a prop, sliding along whatever it touches, and a way
 * round when the straight line is blocked. Same colliders as the hero, so
 * what stops one stops the other.
 */

import type { PlayerContext } from '../entities/Player';

/** The level as a body sees it: the hero's context, plus the floor height. */
export interface WalkWorld extends PlayerContext {
  floorY?(x: number, z: number): number;
}

type Collider = PlayerContext['colliders'][number];

/**
 * Colliders bucketed by 2 m cells, so a body asks about the dozen things
 * near it rather than every wall and prop on the floor (several hundred).
 * Rebuilt when the list changes length (a prop broken, a floor loaded).
 */
interface Grid {
  len: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  cells: Collider[][];
  /** Colliders that walk about; never bucketed, always asked about. */
  movers: Collider[];
  stamp: Map<Collider, number>;
  serial: number;
}
const CELL = 2;
const grids = new WeakMap<readonly Collider[], Grid>();

function gridFor(cs: readonly Collider[]): Grid {
  let g = grids.get(cs);
  if (g && g.len === cs.length) return g;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const ext = (c: Collider) => (c.r !== undefined ? [c.r, c.r] : [c.w * 0.5, c.d * 0.5]);
  const movers: Collider[] = [];
  for (const c of cs) {
    if (c.moves) {
      movers.push(c);
      continue;
    }
    const [hx, hz] = ext(c);
    minX = Math.min(minX, c.x - hx!);
    minZ = Math.min(minZ, c.z - hz!);
    maxX = Math.max(maxX, c.x + hx!);
    maxZ = Math.max(maxZ, c.z + hz!);
  }
  if (!Number.isFinite(minX)) minX = minZ = maxX = maxZ = 0;
  const cols = Math.max(1, Math.ceil((maxX - minX) / CELL) + 1);
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / CELL) + 1);
  const cells: Collider[][] = Array.from({ length: cols * rows }, () => []);
  for (const c of cs) {
    if (c.moves) continue;
    const [hx, hz] = ext(c);
    const x0 = Math.floor((c.x - hx! - minX) / CELL);
    const x1 = Math.floor((c.x + hx! - minX) / CELL);
    const z0 = Math.floor((c.z - hz! - minZ) / CELL);
    const z1 = Math.floor((c.z + hz! - minZ) / CELL);
    for (let zi = z0; zi <= z1; zi++) for (let xi = x0; xi <= x1; xi++) cells[zi * cols + xi]!.push(c);
  }
  g = { len: cs.length, minX, minZ, cols, rows, cells, movers, stamp: new Map(), serial: 0 };
  grids.set(cs, g);
  return g;
}

const nearOut: Collider[] = [];

/**
 * The colliders that could touch a circle of `reach` round (x, z). The array
 * is reused by the next call; read it before asking again.
 */
export function collidersNear(cs: readonly Collider[], x: number, z: number, reach: number): readonly Collider[] {
  nearOut.length = 0;
  if (cs.length < 24) {
    for (const c of cs) nearOut.push(c);
    return nearOut;
  }
  const g = gridFor(cs);
  const serial = ++g.serial;
  // Round props can be wider than a cell; a margin of one cell covers them.
  const x0 = Math.max(0, Math.floor((x - reach - g.minX) / CELL) - 1);
  const x1 = Math.min(g.cols - 1, Math.floor((x + reach - g.minX) / CELL) + 1);
  const z0 = Math.max(0, Math.floor((z - reach - g.minZ) / CELL) - 1);
  const z1 = Math.min(g.rows - 1, Math.floor((z + reach - g.minZ) / CELL) + 1);
  for (let zi = z0; zi <= z1; zi++) {
    for (let xi = x0; xi <= x1; xi++) {
      for (const c of g.cells[zi * g.cols + xi]!) {
        if (g.stamp.get(c) === serial) continue;
        g.stamp.set(c, serial);
        nearOut.push(c);
      }
    }
  }
  for (const c of g.movers) nearOut.push(c);
  return nearOut;
}

/** True when a body of radius `r` fits at (x, z). */
export function canStandAt(w: WalkWorld, x: number, z: number, r: number): boolean {
  if (!w.walkableAt(x, z)) return false;
  for (const c of collidersNear(w.colliders, x, z, r)) {
    if (c.r !== undefined) {
      const rr = c.r + r;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < rr * rr) return false;
      continue;
    }
    const qx = Math.max(0, Math.abs(x - c.x) - c.w * 0.5);
    const qz = Math.max(0, Math.abs(z - c.z) - c.d * 0.5);
    if (qx * qx + qz * qz < r * r) return false;
  }
  return true;
}

/** Pushes (x, z) out of everything it overlaps, along each surface's normal. */
function pushOut(w: WalkWorld, x: number, z: number, ox: number, oz: number, r: number): { x: number; z: number } {
  let nx = x;
  let nz = z;
  const near = [...collidersNear(w.colliders, x, z, r + 0.5)];
  for (let pass = 0; pass < 3; pass++) {
    let pushed = false;
    for (const c of near) {
      let px: number;
      let pz: number;
      let reach: number;
      if (c.r !== undefined) {
        px = c.x;
        pz = c.z;
        reach = c.r + r;
      } else {
        const hw = c.w * 0.5;
        const hd = c.d * 0.5;
        if (Math.abs(nx - c.x) > hw + r || Math.abs(nz - c.z) > hd + r) continue;
        px = Math.max(c.x - hw, Math.min(c.x + hw, nx));
        pz = Math.max(c.z - hd, Math.min(c.z + hd, nz));
        reach = r;
      }
      let ex = nx - px;
      let ez = nz - pz;
      const e = Math.hypot(ex, ez);
      if (e >= reach) continue;
      if (e < 1e-5) {
        ex = ox - nx;
        ez = oz - nz;
        const m = Math.hypot(ex, ez) || 1;
        ex /= m;
        ez /= m;
      } else {
        ex /= e;
        ez /= e;
      }
      const depth = reach - e + 1e-4;
      nx += ex * depth;
      nz += ez * depth;
      pushed = true;
    }
    if (!pushed) break;
  }
  return { x: nx, z: nz };
}

/**
 * One step of (dx, dz) from (x, z), sliding along what it meets. Never ends
 * somewhere the body cannot stand: failing everything, it stays put.
 */
export function stepBody(w: WalkWorld, x: number, z: number, dx: number, dz: number, r: number): { x: number; z: number } {
  const hit = pushOut(w, x + dx, z + dz, x, z, r);
  if (canStandAt(w, hit.x, hit.z, r)) return hit;
  if (canStandAt(w, x + dx, z, r)) return { x: x + dx, z };
  if (canStandAt(w, x, z + dz, r)) return { x, z: z + dz };
  return { x, z };
}

/** True when the body could walk the straight line from a to b. */
export function lineClear(w: WalkWorld, ax: number, az: number, bx: number, bz: number, r: number): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(d / 0.3));
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    if (!canStandAt(w, ax + (bx - ax) * k, az + (bz - az) * k, r)) return false;
  }
  return true;
}

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

/** True when a body of radius `r` fits at (x, z). */
export function canStandAt(w: WalkWorld, x: number, z: number, r: number): boolean {
  if (!w.walkableAt(x, z)) return false;
  for (const c of w.colliders) {
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
  for (let pass = 0; pass < 3; pass++) {
    let pushed = false;
    for (const c of w.colliders) {
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

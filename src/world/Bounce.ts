/**
 * SLAY — light that bounces.
 *
 * A torch lights the floor round it, and the floor throws some of that light
 * back up: onto the walls, under a table, onto the side of a monster turned
 * away from the flame, and a little way round a corner. Worked out once when
 * the level is built, on the tile grid: each light's direct light on every
 * floor tile it can see, times how much the floor gives back, spread a few
 * tiles through open ground (never through rock). Every lit surface then
 * reads it as soft fill (`BounceLight.ts`), from a point pushed off the
 * surface along its normal, so a wall reads the room in front of it rather
 * than the rock behind.
 */
import type * as THREE from 'three/webgpu';

/** A light that bounces: world position, colour times intensity, reach. */
export interface BounceLight {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  reach: number;
}

export interface BounceGrid {
  /** Tiles across and down. */
  width: number;
  height: number;
  /** World x and z of tile (0, 0)'s centre, and metres per tile. */
  x0: number;
  z0: number;
  tile: number;
  /** True where light passes and the floor catches it. */
  open(x: number, y: number): boolean;
  /** Floor height of a tile, metres. */
  floorY(x: number, y: number): number;
  /** Share of light the floor gives back, per channel (its colour, darkened). */
  albedo: THREE.Color;
}

/** How far light spreads after it bounces, tiles (one pass per tile). */
const SPREAD = 3;
/** The size of a flame (as `Lighting.ts`): light falls off from a ball, not a point. */
const FLAME_RADIUS = 0.4;

/** True when tile (bx, by) can see tile (ax, ay) along the grid. */
function sees(g: BounceGrid, ax: number, ay: number, bx: number, by: number): boolean {
  let x = ax;
  let y = ay;
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x === bx && y === by) return true;
    if (!(x === ax && y === ay) && !g.open(x, y)) return false;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * The light the floor throws back, per tile (RGB, linear, three floats per
 * tile). Rock tiles take the average of the open ground beside them, so a
 * wall face that reads just past its own edge still finds the room's light.
 */
export function bakeBounce(g: BounceGrid, lights: readonly BounceLight[]): Float32Array {
  const W = g.width;
  const H = g.height;
  let field = new Float32Array(W * H * 3);
  for (const l of lights) {
    const cx = Math.round((l.x - g.x0) / g.tile);
    const cy = Math.round((l.z - g.z0) / g.tile);
    const R = Math.ceil(l.reach / g.tile);
    const reach2 = l.reach * l.reach;
    for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++) {
      for (let x = Math.max(0, cx - R); x <= Math.min(W - 1, cx + R); x++) {
        if (!g.open(x, y)) continue;
        const dx = g.x0 + x * g.tile - l.x;
        const dz = g.z0 + y * g.tile - l.z;
        const dy = l.y - g.floorY(x, y);
        const d2 = dx * dx + dz * dz + dy * dy;
        if (d2 >= reach2) continue;
        // The light's own falloff (`Lighting.ts`), and the floor turned up
        // toward it (the cosine at the floor).
        const core = 1 / (d2 + FLAME_RADIUS * FLAME_RADIUS);
        const k = d2 / reach2;
        const edge = (1 - k * k) * (1 - k * k);
        const cos = Math.max(0, dy) / Math.sqrt(d2 + 1e-4);
        const e = core * edge * cos;
        if (e < 1e-4) continue;
        if (!sees(g, cx, cy, x, y) && !sees(g, x, y, cx, cy)) continue;
        const o = (y * W + x) * 3;
        field[o] += l.r * e;
        field[o + 1] += l.g * e;
        field[o + 2] += l.b * e;
      }
    }
  }
  // What the floor gives back.
  for (let i = 0; i < W * H; i++) {
    field[i * 3] *= g.albedo.r;
    field[i * 3 + 1] *= g.albedo.g;
    field[i * 3 + 2] *= g.albedo.b;
  }
  // Spread through open ground: each pass, a tile takes a share of its open
  // neighbours' light. Rock neither takes nor passes any.
  let next = new Float32Array(W * H * 3);
  for (let pass = 0; pass < SPREAD; pass++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3;
        if (!g.open(x, y)) {
          next[o] = next[o + 1] = next[o + 2] = 0;
          continue;
        }
        let r = field[o] * 2;
        let gg = field[o + 1] * 2;
        let b = field[o + 2] * 2;
        let w = 2;
        for (const [ox, oy] of NEIGHBOURS) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !g.open(nx, ny)) continue;
          const p = (ny * W + nx) * 3;
          r += field[p];
          gg += field[p + 1];
          b += field[p + 2];
          w++;
        }
        next[o] = r / w;
        next[o + 1] = gg / w;
        next[o + 2] = b / w;
      }
    }
    [field, next] = [next, field];
  }
  // Rock takes the light of the open ground beside it.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g.open(x, y)) continue;
      const o = (y * W + x) * 3;
      let r = 0;
      let gg = 0;
      let b = 0;
      let w = 0;
      for (const [ox, oy] of NEIGHBOURS) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !g.open(nx, ny)) continue;
        const p = (ny * W + nx) * 3;
        r += field[p];
        gg += field[p + 1];
        b += field[p + 2];
        w++;
      }
      if (w > 0) {
        field[o] = r / w;
        field[o + 1] = gg / w;
        field[o + 2] = b / w;
      }
    }
  }
  return field;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

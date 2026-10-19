/**
 * SLAY vfx kit: the sprite sheet every particle draws from.
 *
 * Generated in code into a `DataTexture` (no canvas, so it also builds in the
 * headless checkers), once per page, shared by every scene. 1024 x 1536, an
 * 8 x 12 grid of 128 px cells: sharp at the sizes a big burst draws them.
 * Four rows are eight-frame flipbooks (flame, smoke, gas, fireball) that
 * particles play over their life; the rest are single sprites and sets of
 * variants a layer picks from (lightning, blood, ice, sparks, embers).
 *
 * Painting a sheet this size takes most of a second, so the page starts on
 * it at boot (`warmSpriteAtlas`) a cell at a time in idle moments; whatever
 * is left when a scene first asks for it is painted then.
 *
 * Texels are data, not colour:
 *   R = heat (0..1): how hot this part of the sprite is. The particle shader
 *       maps heat through the particle's own ramp (tail -> body -> core), which
 *       is how one flame flipbook draws fire, frost fire and fel fire alike.
 *   G = detail (0..1): a second noise the shader uses for breakup.
 *   A = coverage (0..1): how much of the cell is solid.
 *
 * Every cell falls to zero coverage at its border, so mip levels never bleed
 * one sprite into the next.
 */

import * as THREE from 'three';
import { float, floor, mod, vec2 } from 'three/tsl';
import type { F, V2 } from '../../core/Tsl';

export const CELL = 128;
/** Cells across (a flipbook's eight frames run along a row) and down. */
export const COLS = 8;
export const ROWS = 12;
export const ATLAS_W = CELL * COLS;
export const ATLAS_H = CELL * ROWS;
/** Cells in the sheet. */
export const ATLAS_CELLS = COLS * ROWS;

/** Sprite ids. Flipbooks name their first frame; frames run along the row. */
export const SPRITE = {
  flame: 0, // row 0: 8 frames
  smoke: 8, // row 1: 8 frames
  arc: 16, // row 2: 8 lightning variants
  glow: 24,
  core: 25,
  spark: 26,
  ring: 27,
  flare: 28,
  ember: 29,
  slash: 30,
  shock: 31,
  shard: 32,
  crystal: 33,
  bone: 34,
  rock: 35,
  drop: 36,
  splat: 37,
  bubble: 38,
  flake: 39,
  rune: 40, // 40..43: four glyphs
  skull: 44,
  hex: 45,
  drip: 46,
  mote: 47,
  gas: 48, // row 6: 8 frames
  fireball: 56, // row 7: 8 frames
  blood: 64, // 64..67: four splatters
  gore: 68, // 68..71: four flying drops, head first
  ice: 72, // 72..75: four ice shards
  frost: 76, // 76..79: four frost crystals
  fork: 80, // row 10: 8 long forked bolts
  glint: 88, // 88..91: four spark streaks, head first
  cinder: 92, // 92..95: four ragged embers
} as const;

export type SpriteName = keyof typeof SPRITE;

/** Sprites that are eight-frame flipbooks. */
export const FLIPBOOKS = new Set<number>([SPRITE.flame, SPRITE.smoke, SPRITE.gas, SPRITE.fireball]);

// ---------------------------------------------------------------------------
// Deterministic noise (no Math.random anywhere in the kit)
// ---------------------------------------------------------------------------

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, s: number, oct = 4): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 31);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

function sat(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function sstep(a: number, b: number, v: number): number {
  const t = sat((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Distance from p to segment ab. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? sat(((px - ax) * dx + (py - ay) * dy) / l2) : 0;
  const qx = ax + dx * t - px;
  const qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/** Border fade so no cell bleeds into its neighbours at low mips. */
function border(x: number, y: number): number {
  const m = Math.max(Math.abs(x), Math.abs(y));
  return 1 - sstep(0.86, 0.98, m);
}

// ---------------------------------------------------------------------------
// Cell painters. (x, y) in -1..1 with +y up; f = frame 0..7. Return heat,
// detail, coverage through the shared out array.
// ---------------------------------------------------------------------------

type Painter = (x: number, y: number, f: number, out: Float32Array) => void;

const flame: Painter = (x, y, f, o) => {
  const t = f / 8;
  const h = (y + 1) * 0.5; // 0 at the base, 1 at the top
  const n = fbm(x * 2.4 + 3.1, y * 2.1 - t * 6.0, 11);
  const n2 = fbm(x * 4.8 - 1.7, y * 4.2 - t * 9.0, 23, 3);
  const sway = (n - 0.5) * 0.9 * h + Math.sin(t * 6.283 + h * 3.0) * 0.08 * h;
  const width = 0.62 * Math.pow(1 - h, 0.75) + 0.05;
  const d = Math.abs(x - sway) / width;
  const body = 1 - sstep(0.45, 1.0, d + (n2 - 0.5) * 0.5);
  const top = 1 - sstep(0.35, 0.95, h + (n - 0.5) * 0.55);
  const base = sstep(0.0, 0.18, h);
  const cov = sat(body * top * base * (0.75 + 0.5 * n2));
  o[0] = sat(cov * (1.15 - h * 0.95) * (0.65 + 0.6 * n));
  o[1] = n2;
  o[2] = cov;
};

const smoke: Painter = (x, y, f, o) => {
  const t = f / 8;
  const r = Math.sqrt(x * x + y * y);
  const n = fbm(x * 2.0 + t * 0.8, y * 2.0 - t * 1.4, 37);
  const n2 = fbm(x * 4.5 - t, y * 4.5 + t * 0.7, 41, 3);
  const edge = 0.5 + t * 0.32 + (n - 0.5) * 0.55;
  const blob = 1 - sstep(edge - 0.38, edge, r);
  const thin = 1 - t * 0.45;
  const cov = sat(blob * thin * (0.45 + 0.75 * n2));
  o[0] = sat(cov * (1 - t) * 0.35 * (1 - r));
  o[1] = n2;
  o[2] = cov;
};

const gas: Painter = (x, y, f, o) => {
  const t = f / 8;
  const a = t * 6.283;
  const wx = x + (fbm(x * 1.6 + Math.cos(a) * 0.4, y * 1.6, 53) - 0.5) * 0.9;
  const wy = y + (fbm(x * 1.6, y * 1.6 + Math.sin(a) * 0.4, 59) - 0.5) * 0.9;
  const r = Math.sqrt(wx * wx + wy * wy);
  const n = fbm(wx * 3.0, wy * 3.0, 61);
  const blob = 1 - sstep(0.35, 0.85, r);
  const curl = sstep(0.35, 0.7, n);
  const cov = sat(blob * (0.35 + 0.8 * curl) * (1 - t * 0.3));
  o[0] = sat(cov * curl * 0.6);
  o[1] = n;
  o[2] = cov;
};

const fireball: Painter = (x, y, f, o) => {
  const t = f / 8;
  const r = Math.sqrt(x * x + y * y);
  const n = fbm(x * 2.2 - t * 0.6, y * 2.2 - t * 1.8, 71);
  const n2 = fbm(x * 5.0 + t, y * 5.0 - t * 2.0, 73, 3);
  const edge = 0.42 + t * 0.42 + (n - 0.5) * 0.45;
  const blob = 1 - sstep(edge - 0.25, edge, r);
  const cov = sat(blob * (0.75 + 0.4 * n2) * (1 - t * 0.35));
  const hot = Math.pow(sat(1 - r / Math.max(0.2, edge)), 1.2) * Math.pow(1 - t, 1.4);
  o[0] = sat(cov * (hot * 1.3 + n2 * 0.25 * (1 - t)));
  o[1] = n2;
  o[2] = cov;
};

/** A jagged bolt with branches, one shape per variant. */
function arcPainter(variant: number): Painter {
  // Main path left to right through jittered points; two branches.
  const pts: number[] = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const px = -0.88 + (1.76 * i) / N;
    const py = i === 0 || i === N ? (hash(i, variant, 5) - 0.5) * 0.2 : (hash(i, variant, 7) - 0.5) * 0.9;
    pts.push(px, py);
  }
  const branches: number[] = [];
  for (let b = 0; b < 2; b++) {
    const at = 2 + Math.floor(hash(b, variant, 9) * (N - 4));
    let bx = pts[at * 2]!;
    let by = pts[at * 2 + 1]!;
    const dir = hash(b, variant, 13) > 0.5 ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const nx = bx + 0.14 + hash(k, b + variant * 7, 17) * 0.1;
      const ny = by + dir * (0.12 + hash(k, b + variant * 7, 19) * 0.16);
      branches.push(bx, by, Math.min(0.86, nx), Math.max(-0.86, Math.min(0.86, ny)));
      bx = nx;
      by = ny;
    }
  }
  return (x, y, _f, o) => {
    let d = 9;
    for (let i = 0; i < N; i++) {
      d = Math.min(d, segDist(x, y, pts[i * 2]!, pts[i * 2 + 1]!, pts[i * 2 + 2]!, pts[i * 2 + 3]!));
    }
    let db = 9;
    for (let i = 0; i < branches.length; i += 4) {
      db = Math.min(db, segDist(x, y, branches[i]!, branches[i + 1]!, branches[i + 2]!, branches[i + 3]!));
    }
    const core = Math.exp(-(d * d) / 0.0009);
    const glow = Math.exp(-(d * d) / 0.012) * 0.55;
    const bcore = Math.exp(-(db * db) / 0.0005) * 0.7;
    const bglow = Math.exp(-(db * db) / 0.006) * 0.3;
    const v = sat(core + glow + bcore + bglow) * border(x, y);
    o[0] = sat(core + bcore * 0.8 + glow * 0.4);
    o[1] = 0.5;
    o[2] = v;
  };
}

const glow: Painter = (x, y, _f, o) => {
  const r = Math.sqrt(x * x + y * y);
  const v = Math.pow(sat(1 - r), 2.2);
  o[0] = v;
  o[1] = 0.5;
  o[2] = v;
};

const core: Painter = (x, y, _f, o) => {
  const r = Math.sqrt(x * x + y * y);
  const hard = 1 - sstep(0.12, 0.3, r);
  const soft = Math.pow(sat(1 - r), 3) * 0.6;
  o[0] = sat(hard + soft * 0.6);
  o[1] = 0.5;
  o[2] = sat(hard + soft);
};

const spark: Painter = (x, y, _f, o) => {
  // A streak along +y, hot head at the top.
  const w = Math.exp(-(x * x) / 0.012);
  const len = sstep(-0.95, -0.2, y) * (1 - sstep(0.7, 0.95, y));
  const head = Math.exp(-((x * x) / 0.02 + ((y - 0.55) * (y - 0.55)) / 0.05));
  const v = sat(w * len * (0.5 + 0.5 * (y + 1) * 0.5) + head * 0.6);
  o[0] = v;
  o[1] = 0.5;
  o[2] = v;
};

const ring: Painter = (x, y, _f, o) => {
  const r = Math.sqrt(x * x + y * y);
  const v = Math.exp(-((r - 0.78) * (r - 0.78)) / 0.004) * border(x, y);
  o[0] = v;
  o[1] = 0.5;
  o[2] = v;
};

const flare: Painter = (x, y, _f, o) => {
  const r = Math.sqrt(x * x + y * y);
  const rays = Math.exp(-(x * x) / 0.002) * (1 - sat(Math.abs(y))) + Math.exp(-(y * y) / 0.002) * (1 - sat(Math.abs(x)));
  const diag = (Math.exp(-((x - y) * (x - y)) / 0.003) + Math.exp(-((x + y) * (x + y)) / 0.003)) * (1 - sat(r * 1.4)) * 0.4;
  const c = Math.pow(sat(1 - r * 1.6), 2);
  const v = sat(rays * 0.9 + diag + c) * border(x, y);
  o[0] = v;
  o[1] = 0.5;
  o[2] = v;
};

const ember: Painter = (x, y, _f, o) => {
  const r = Math.sqrt(x * x + y * y);
  const v = Math.pow(sat(1 - r * 1.25), 1.6);
  o[0] = sat(v * 1.2);
  o[1] = 0.5;
  o[2] = v;
};

const slash: Painter = (x, y, _f, o) => {
  // A crescent: the band between two offset circles, thick in the middle.
  const r1 = Math.sqrt(x * x + (y + 0.55) * (y + 0.55));
  const r2 = Math.sqrt(x * x + (y + 0.95) * (y + 0.95));
  const inA = 1 - sstep(1.05, 1.12, r1);
  const outB = sstep(1.12, 1.25, r2);
  const taper = 1 - sstep(0.4, 0.9, Math.abs(x));
  const n = fbm(x * 6, y * 2, 83, 3);
  const v = sat(inA * outB * taper * (0.6 + 0.6 * n)) * border(x, y);
  o[0] = sat(v * (0.6 + 0.6 * (1 - Math.abs(x))));
  o[1] = n;
  o[2] = v;
};

const shock: Painter = (x, y, _f, o) => {
  const r = Math.sqrt(x * x + y * y);
  const n = fbm(Math.atan2(y, x) * 2.0 + 10, r * 3.0, 89, 3);
  const band = Math.exp(-((r - 0.72) * (r - 0.72)) / 0.012);
  const inner = sstep(0.2, 0.72, r) * (1 - sstep(0.72, 0.8, r)) * 0.25;
  const v = sat((band + inner) * (0.55 + 0.6 * n)) * border(x, y);
  o[0] = sat(band * (0.5 + 0.5 * n));
  o[1] = n;
  o[2] = v;
};

const shard: Painter = (x, y, _f, o) => {
  // A long faceted splinter along +y.
  const w = 0.32 * (1 - Math.abs(y) * 0.95);
  const d = Math.abs(x) / Math.max(0.01, w);
  const body = 1 - sstep(0.75, 1.0, d);
  const facet = x > 0 ? 0.9 : 0.55;
  const v = body * (1 - sstep(0.85, 0.95, Math.abs(y)));
  o[0] = sat(v * facet * (0.6 + 0.4 * (y + 1) * 0.5));
  o[1] = facet;
  o[2] = v;
};

const crystal: Painter = (x, y, _f, o) => {
  // Six-armed frost crystal.
  const r = Math.sqrt(x * x + y * y);
  const a = Math.atan2(y, x);
  const arm = Math.abs(Math.sin(a * 3));
  const spine = Math.exp(-(arm * arm * r * r) / 0.004) * (1 - sstep(0.6, 0.85, r));
  const twig = Math.exp(-((Math.abs(Math.sin(a * 3 + 0.5)) * r) ** 2) / 0.002) * sstep(0.25, 0.4, r) * (1 - sstep(0.5, 0.65, r)) * 0.7;
  const c = Math.pow(sat(1 - r * 3), 2);
  const v = sat(spine + twig + c);
  o[0] = v;
  o[1] = 0.5;
  o[2] = v;
};

const boneChip: Painter = (x, y, _f, o) => {
  // A short knuckled splinter.
  const w = 0.22 + 0.1 * Math.exp(-((y - 0.6) * (y - 0.6)) / 0.02) + 0.1 * Math.exp(-((y + 0.6) * (y + 0.6)) / 0.02);
  const n = fbm(x * 5, y * 5, 97, 3);
  const body = 1 - sstep(w - 0.05, w + 0.02, Math.abs(x) + (n - 0.5) * 0.12);
  const v = body * (1 - sstep(0.72, 0.84, Math.abs(y)));
  o[0] = sat(v * (0.55 + 0.45 * n) * (x < 0 ? 1 : 0.7));
  o[1] = n;
  o[2] = v;
};

const rock: Painter = (x, y, _f, o) => {
  const a = Math.atan2(y, x);
  const r = Math.sqrt(x * x + y * y);
  const edge = 0.55 + 0.18 * Math.cos(a * 3 + 1) + 0.1 * Math.cos(a * 5 + 2);
  const n = fbm(x * 4, y * 4, 101, 3);
  const v = 1 - sstep(edge - 0.06, edge, r);
  o[0] = sat(v * (0.4 + 0.6 * n) * (y > 0 ? 1 : 0.6));
  o[1] = n;
  o[2] = v;
};

const drop: Painter = (x, y, _f, o) => {
  const r = Math.sqrt(x * x + y * y);
  const v = 1 - sstep(0.45, 0.55, r);
  const hi = Math.exp(-(((x + 0.18) ** 2 + (y - 0.18) ** 2) / 0.01));
  o[0] = sat(v * 0.5 + hi);
  o[1] = 0.5;
  o[2] = v;
};

const splat: Painter = (x, y, _f, o) => {
  const a = Math.atan2(y, x);
  const r = Math.sqrt(x * x + y * y);
  const n = fbm(Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5 + 5, 103, 3);
  const edge = 0.35 + 0.45 * Math.pow(n, 2);
  const v = (1 - sstep(edge - 0.05, edge, r)) * border(x, y);
  o[0] = sat(v * 0.5);
  o[1] = n;
  o[2] = v;
};

const bubble: Painter = (x, y, _f, o) => {
  const r = Math.sqrt(x * x + y * y);
  const rim = Math.exp(-((r - 0.6) * (r - 0.6)) / 0.006);
  const fill = (1 - sstep(0.55, 0.65, r)) * 0.25;
  const hi = Math.exp(-(((x + 0.22) ** 2 + (y - 0.25) ** 2) / 0.006));
  const v = sat(rim + fill + hi);
  o[0] = sat(rim * 0.7 + hi);
  o[1] = 0.5;
  o[2] = v;
};

const flake: Painter = (x, y, _f, o) => {
  // Curling ash flake.
  const rx = x * 0.8 + y * 0.6;
  const ry = -x * 0.6 + y * 0.8;
  const n = fbm(x * 4 + 7, y * 4, 107, 3);
  const v = (1 - sstep(0.4, 0.5, Math.sqrt((rx / 0.7) ** 2 + (ry / 0.35) ** 2) + (n - 0.5) * 0.3)) * border(x, y);
  o[0] = sat(v * n);
  o[1] = n;
  o[2] = v;
};

/** Four rune glyphs: a circle with strokes, seeded per glyph. */
function runePainter(g: number): Painter {
  const segs: number[] = [];
  const strokes = 4 + (g % 3);
  for (let i = 0; i < strokes; i++) {
    const a0 = hash(i, g, 211) * 6.283;
    const a1 = a0 + (0.8 + hash(i, g, 223) * 2.2);
    const r0 = 0.15 + hash(i, g, 227) * 0.5;
    const r1 = 0.15 + hash(i, g, 229) * 0.5;
    segs.push(Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(a1) * r1, Math.sin(a1) * r1);
  }
  segs.push(0, -0.62, 0, 0.62);
  return (x, y, _f, o) => {
    const r = Math.sqrt(x * x + y * y);
    let d = Math.abs(r - 0.74);
    for (let i = 0; i < segs.length; i += 4) d = Math.min(d, segDist(x, y, segs[i]!, segs[i + 1]!, segs[i + 2]!, segs[i + 3]!));
    const line = Math.exp(-(d * d) / 0.0012);
    const halo = Math.exp(-(d * d) / 0.01) * 0.35;
    const v = sat(line + halo) * border(x, y);
    o[0] = sat(line);
    o[1] = 0.5;
    o[2] = v;
  };
}

const skull: Painter = (x, y, _f, o) => {
  // A wailing skull wisp: cranium, two eye holes, a trailing tail downward.
  const head = 1 - sstep(0.38, 0.46, Math.sqrt((x / 0.85) ** 2 + ((y - 0.25) / 0.75) ** 2));
  const jaw = 1 - sstep(0.18, 0.24, Math.sqrt((x / 0.6) ** 2 + ((y + 0.15) / 0.5) ** 2));
  const eyes = Math.exp(-(((Math.abs(x) - 0.16) ** 2 + (y - 0.25) ** 2) / 0.006));
  const tailN = fbm(x * 3, y * 3 + 4, 113, 3);
  const tail = (1 - sstep(0.1, 0.3, Math.abs(x + (tailN - 0.5) * 0.4) * (1 + (0 - y) * 0.5))) * sstep(-0.95, -0.1, y) * (1 - sstep(-0.1, 0.1, y));
  const v = sat(Math.max(head, jaw, tail * 0.7) - eyes * 1.2) * border(x, y);
  o[0] = sat(v * 0.8 + eyes * 0.0);
  o[1] = tailN;
  o[2] = v;
};

const hexP: Painter = (x, y, _f, o) => {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const h = Math.max(ax * 0.866 + ay * 0.5, ay);
  const rim = Math.exp(-((h - 0.6) * (h - 0.6)) / 0.003);
  const fill = (1 - sstep(0.55, 0.6, h)) * 0.35;
  const v = sat(rim + fill);
  o[0] = sat(rim + fill * 0.5);
  o[1] = 0.5;
  o[2] = v;
};

const drip: Painter = (x, y, _f, o) => {
  // Teardrop, point up.
  const yy = y + 0.25;
  const w = yy < 0 ? Math.sqrt(Math.max(0, 0.16 - yy * yy)) : 0.4 * Math.max(0, 1 - yy / 0.85);
  const v = 1 - sstep(w - 0.05, w + 0.01, Math.abs(x));
  const hi = Math.exp(-(((x + 0.1) ** 2 + (y + 0.15) ** 2) / 0.004));
  o[0] = sat(v * 0.45 + hi);
  o[1] = 0.5;
  o[2] = sat(v) * border(x, y);
};

const mote: Painter = (x, y, _f, o) => {
  const n = fbm(x * 3 + 2, y * 3 + 9, 127, 3);
  const r = Math.sqrt(x * x + y * y) + (n - 0.5) * 0.35;
  const v = Math.pow(sat(1 - r * 1.4), 1.5);
  o[0] = v * 0.6;
  o[1] = n;
  o[2] = v;
};

/** A splatter: a ragged pool and the drops thrown off it, one throw per variant. */
function bloodPainter(v: number): Painter {
  const drops: number[] = [];
  const k = 6 + (v % 3) * 2;
  for (let i = 0; i < k; i++) {
    const a = hash(i, v, 301) * 6.283;
    const d = 0.42 + hash(i, v, 307) * 0.36;
    const r = 0.035 + hash(i, v, 311) * 0.08;
    drops.push(Math.cos(a) * d, Math.sin(a) * d, r, a);
  }
  const cx = (hash(1, v, 313) - 0.5) * 0.2;
  const cy = (hash(2, v, 313) - 0.5) * 0.2;
  return (x, y, _f, o) => {
    const dx = x - cx;
    const dy = y - cy;
    const a = Math.atan2(dy, dx);
    const r = Math.sqrt(dx * dx + dy * dy);
    const n = fbm(Math.cos(a) * 1.8 + v * 3.1, Math.sin(a) * 1.8 + v * 1.7, 317, 3);
    const edge = 0.24 + 0.22 * n;
    let cov = 1 - sstep(edge - 0.04, edge + 0.01, r);
    for (let i = 0; i < drops.length; i += 4) {
      const px = drops[i]!;
      const py = drops[i + 1]!;
      const pr = drops[i + 2]!;
      const ca = Math.cos(drops[i + 3]!);
      const sa = Math.sin(drops[i + 3]!);
      const ex = x - px;
      const ey = y - py;
      // Each drop stretched along its throw, a thin run back toward the pool.
      const q = Math.sqrt(((ex * ca + ey * sa) / (pr * 1.7)) ** 2 + ((-ex * sa + ey * ca) / pr) ** 2);
      cov = Math.max(cov, 1 - sstep(0.8, 1.05, q));
      const run = segDist(x, y, cx + px * 0.35, cy + py * 0.35, px, py);
      cov = Math.max(cov, (1 - sstep(pr * 0.22, pr * 0.32, run)) * 0.9);
    }
    const n2 = fbm(x * 6 + v, y * 6, 331, 2);
    o[0] = sat(cov * (0.32 + 0.38 * n2));
    o[1] = n2;
    o[2] = cov * border(x, y);
  };
}

/** A drop in flight: a round head at the top (+y, the way it flies) and a tapering tail. */
function gorePainter(v: number): Painter {
  const tail = 0.45 + hash(v, 1, 401) * 0.35;
  const second = v % 2 === 1;
  const bend = (hash(v, 2, 409) - 0.5) * 0.08;
  return (x, y, _f, o) => {
    const hy = 0.35;
    const hr = 0.26 + 0.05 * (v & 1);
    const head = Math.sqrt(x * x + (y - hy) * (y - hy)) / hr;
    const ty = (hy - y) / (tail + hr);
    const w = ty > 0 && ty < 1 ? hr * (1 - ty) ** 1.5 : 0;
    const inTail = w > 0 ? 1 - sstep(w * 0.8, w + 0.01, Math.abs(x + Math.sin(ty * 3 + v) * bend * ty)) : 0;
    let cov = Math.max(1 - sstep(0.85, 1.02, head), inTail);
    if (second) cov = Math.max(cov, 1 - sstep(0.8, 1.05, Math.sqrt((x - 0.13) ** 2 + (y + 0.6) ** 2) / 0.1));
    const hi = Math.exp(-(((x + 0.09) ** 2 + (y - hy - 0.1) ** 2) / 0.005));
    o[0] = sat(cov * 0.42 + hi * 0.8);
    o[1] = 0.5;
    o[2] = cov * border(x, y);
  };
}

/** An ice splinter: a kite of two faces, one lit, one in shade, a bright ridge; some with a spur. */
function icePainter(v: number): Painter {
  const y0 = -0.25 + hash(v, 2, 501) * 0.4;
  const wMax = 0.2 + hash(v, 3, 503) * 0.14;
  const tilt = (hash(v, 4, 509) - 0.5) * 0.3;
  const spur = v % 2 === 0;
  return (x, y, _f, o) => {
    const xx = x - tilt * y;
    const top = 0.84;
    const bot = -0.8;
    const w = y > y0 ? (wMax * (top - y)) / (top - y0) : (wMax * (y - bot)) / (y0 - bot);
    let cov = w > 0 ? 1 - sstep(w * 0.9, w + 0.01, Math.abs(xx)) : 0;
    let lit = xx > 0 ? 0.92 : 0.5;
    if (spur) {
      // A smaller splinter leaning out of the side.
      const sx = xx - 0.17;
      const sy = y + 0.22;
      const along = sx * 0.6 + sy * 0.8;
      const across = -sx * 0.8 + sy * 0.6;
      const sw = 0.085 * (1 - Math.abs(along) / 0.38);
      if (sw > 0 && Math.abs(across) < sw) {
        cov = Math.max(cov, 1 - sstep(sw * 0.8, sw, Math.abs(across)));
        lit = across > 0 ? 0.85 : 0.45;
      }
    }
    const ridge = w > 0 ? Math.exp(-(xx * xx) / 0.0006) * 0.5 : 0;
    const n = fbm(x * 7 + v * 5, y * 3, 521, 2);
    o[0] = sat(cov * lit * (0.75 + 0.25 * n) + ridge * cov);
    o[1] = lit;
    o[2] = cov * border(x, y);
  };
}

/** A six-armed frost crystal, its side twigs set per variant; the last one has a plate at its heart. */
function frostPainter(v: number): Painter {
  const segs: number[] = [0, 0, 0.8, 0];
  const nb = 2 + (v % 3);
  for (let i = 0; i < nb; i++) {
    const at = 0.18 + (0.5 * (i + hash(i, v, 601) * 0.5)) / nb;
    const len = (0.14 + hash(i, v, 607) * 0.2) * (1 - at * 0.6);
    segs.push(at, 0, at + len * 0.5, len * 0.866);
  }
  const plate = v === 3 ? 0.22 : 0;
  const sector = Math.PI / 3;
  return (x, y, _f, o) => {
    const r = Math.sqrt(x * x + y * y);
    // Folded into one half-arm: every arm and both its sides read the same twigs.
    let a = ((Math.atan2(y, x) % sector) + sector) % sector;
    if (a > sector / 2) a = sector - a;
    const fx = Math.cos(a) * r;
    const fy = Math.sin(a) * r;
    let d = 9;
    for (let i = 0; i < segs.length; i += 4) d = Math.min(d, segDist(fx, fy, segs[i]!, segs[i + 1]!, segs[i + 2]!, segs[i + 3]!));
    const line = Math.exp(-(d * d) / 0.0005);
    const halo = Math.exp(-(d * d) / 0.005) * 0.35;
    const disc = plate > 0 ? (1 - sstep(plate - 0.02, plate, r * Math.cos(sector / 2 - a))) * 0.55 : 0;
    const c = Math.pow(sat(1 - r * 4), 2);
    o[0] = sat(line + c + disc * 0.5);
    o[1] = 0.5;
    o[2] = sat(line + halo + disc + c) * border(x, y);
  };
}

/** A long bolt across the cell: more joints, more branches and twigs off them than `arcPainter`. */
function forkPainter(variant: number): Painter {
  const pts: number[] = [];
  const N = 14;
  const s = variant + 40;
  for (let i = 0; i <= N; i++) {
    const px = -0.9 + (1.8 * i) / N;
    const py = i === 0 || i === N ? (hash(i, s, 5) - 0.5) * 0.25 : (hash(i, s, 7) - 0.5) * 0.7 + Math.sin(i * 0.7 + variant) * 0.12;
    pts.push(px, py);
  }
  const branches: number[] = [];
  const twigs: number[] = [];
  const nb = 3 + (variant % 3);
  for (let b = 0; b < nb; b++) {
    const at = 2 + Math.floor(hash(b, s, 9) * (N - 5));
    let bx = pts[at * 2]!;
    let by = pts[at * 2 + 1]!;
    const dir = hash(b, s, 13) > 0.5 ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const nx = Math.min(0.86, bx + 0.1 + hash(k, b + s * 7, 17) * 0.1);
      const ny = Math.max(-0.86, Math.min(0.86, by + dir * (0.08 + hash(k, b + s * 7, 19) * 0.14)));
      branches.push(bx, by, nx, ny);
      if (k === 1) twigs.push(nx, ny, Math.min(0.86, nx + 0.08), Math.max(-0.86, Math.min(0.86, ny - dir * 0.12)));
      bx = nx;
      by = ny;
    }
  }
  return (x, y, _f, o) => {
    let d = 9;
    for (let i = 0; i < N; i++) d = Math.min(d, segDist(x, y, pts[i * 2]!, pts[i * 2 + 1]!, pts[i * 2 + 2]!, pts[i * 2 + 3]!));
    let db = 9;
    for (let i = 0; i < branches.length; i += 4) db = Math.min(db, segDist(x, y, branches[i]!, branches[i + 1]!, branches[i + 2]!, branches[i + 3]!));
    let dt = 9;
    for (let i = 0; i < twigs.length; i += 4) dt = Math.min(dt, segDist(x, y, twigs[i]!, twigs[i + 1]!, twigs[i + 2]!, twigs[i + 3]!));
    const core = Math.exp(-(d * d) / 0.0005);
    const glow = Math.exp(-(d * d) / 0.01) * 0.55;
    const bcore = Math.exp(-(db * db) / 0.00025) * 0.75;
    const bglow = Math.exp(-(db * db) / 0.004) * 0.3;
    const tcore = Math.exp(-(dt * dt) / 0.00012) * 0.6;
    o[0] = sat(core + bcore * 0.8 + tcore * 0.7 + glow * 0.4);
    o[1] = 0.5;
    o[2] = sat(core + glow + bcore + bglow + tcore) * border(x, y);
  };
}

/** A spark streak, head first (+y): a needle, a split tail, a teardrop, a head and two beads. */
function glintPainter(v: number): Painter {
  return (x, y, _f, o) => {
    let val = 0;
    if (v === 0) {
      const w = Math.exp(-(x * x) / 0.003);
      const len = sstep(-0.92, -0.1, y) * (1 - sstep(0.72, 0.9, y));
      val = w * len * (0.35 + 0.65 * (y + 1) * 0.5) + Math.exp(-((x * x) / 0.012 + ((y - 0.6) * (y - 0.6)) / 0.025)) * 0.7;
    } else if (v === 1) {
      const t = sat((0.6 - y) / 1.4);
      const spread = t * 0.22;
      const w = Math.exp(-((Math.abs(x) - spread) ** 2) / 0.002) * (1 - t) * sstep(-0.85, -0.4, y) + Math.exp(-(x * x) / 0.004) * sstep(0.2, 0.6, y);
      val = w * (1 - sstep(0.72, 0.9, y)) + Math.exp(-((x * x) / 0.01 + ((y - 0.62) * (y - 0.62)) / 0.02)) * 0.8;
    } else if (v === 2) {
      const ty = sat((0.55 - y) / 1.35);
      const w = 0.2 * (1 - ty) ** 2 + 0.01;
      const head = Math.sqrt(x * x + (y - 0.55) ** 2);
      val = Math.max(1 - sstep(0.14, 0.2, head), y < 0.55 ? (1 - sstep(w * 0.6, w, Math.abs(x))) * (1 - ty * 0.6) : 0);
    } else {
      const bead = (cy: number, r: number): number => Math.exp(-((x * x + (y - cy) * (y - cy)) / (r * r)));
      val = bead(0.55, 0.16) + bead(0.05, 0.1) * 0.7 + bead(-0.4, 0.07) * 0.5 + Math.exp(-(x * x) / 0.0015) * sstep(-0.5, 0.5, y) * 0.35;
    }
    const v2 = sat(val) * border(x, y);
    o[0] = v2;
    o[1] = 0.5;
    o[2] = v2;
  };
}

/** A ragged ember: a torn fleck that glows hottest in spots, its shape set per variant. */
function cinderPainter(v: number): Painter {
  const ang = hash(v, 1, 701) * 3.14;
  const ax = 0.32 + hash(v, 2, 703) * 0.22;
  const ay = 0.16 + hash(v, 3, 709) * 0.18;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  return (x, y, _f, o) => {
    const rx = x * ca + y * sa;
    const ry = -x * sa + y * ca;
    const n = fbm(x * 4 + v * 7, y * 4 - v * 3, 719, 3);
    const q = Math.sqrt((rx / ax) ** 2 + (ry / ay) ** 2) + (n - 0.5) * 0.6;
    const cov = 1 - sstep(0.7, 1.0, q);
    const hot = Math.pow(sat(1 - q), 1.3) * (0.6 + 0.6 * fbm(x * 9, y * 9, 727, 2));
    o[0] = sat(hot * 1.3);
    o[1] = n;
    o[2] = sat(cov) * border(x, y);
  };
}

function painterFor(cell: number): Painter {
  const row = cell >> 3;
  const col = cell & 7;
  switch (row) {
    case 0:
      return flame;
    case 1:
      return smoke;
    case 2:
      return arcPainter(col);
    case 6:
      return gas;
    case 7:
      return fireball;
    case 8:
      return col < 4 ? bloodPainter(col) : gorePainter(col - 4);
    case 9:
      return col < 4 ? icePainter(col) : frostPainter(col - 4);
    case 10:
      return forkPainter(col);
    case 11:
      return col < 4 ? glintPainter(col) : cinderPainter(col - 4);
    default:
      break;
  }
  switch (cell) {
    case SPRITE.glow: return glow;
    case SPRITE.core: return core;
    case SPRITE.spark: return spark;
    case SPRITE.ring: return ring;
    case SPRITE.flare: return flare;
    case SPRITE.ember: return ember;
    case SPRITE.slash: return slash;
    case SPRITE.shock: return shock;
    case SPRITE.shard: return shard;
    case SPRITE.crystal: return crystal;
    case SPRITE.bone: return boneChip;
    case SPRITE.rock: return rock;
    case SPRITE.drop: return drop;
    case SPRITE.splat: return splat;
    case SPRITE.bubble: return bubble;
    case SPRITE.flake: return flake;
    case SPRITE.skull: return skull;
    case SPRITE.hex: return hexP;
    case SPRITE.drip: return drip;
    case SPRITE.mote: return mote;
    default:
      if (cell >= SPRITE.rune && cell < SPRITE.rune + 4) return runePainter(cell - SPRITE.rune);
      return glow;
  }
}

let atlas: THREE.DataTexture | null = null;
let sheet: Uint8Array | null = null;
/** The next cell to paint. */
let painted = 0;
const out = new Float32Array(3);

function paintCell(cell: number): void {
  const data = (sheet ??= new Uint8Array(ATLAS_W * ATLAS_H * 4));
  const paint = painterFor(cell);
  const frame = cell % COLS;
  const cx = frame * CELL;
  // Row 0 of the grid sits at the top of the sheet; texture rows run bottom up.
  const cy = (ROWS - 1 - Math.floor(cell / COLS)) * CELL;
  for (let j = 0; j < CELL; j++) {
    const y = ((j + 0.5) / CELL) * 2 - 1;
    for (let i = 0; i < CELL; i++) {
      const x = ((i + 0.5) / CELL) * 2 - 1;
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      paint(x, y, frame, out);
      const fade = border(x, y);
      const o = ((cy + j) * ATLAS_W + cx + i) * 4;
      data[o] = Math.round(sat(out[0]!) * 255);
      data[o + 1] = Math.round(sat(out[1]!) * 255);
      data[o + 2] = 0;
      data[o + 3] = Math.round(sat(out[2]! * fade) * 255);
    }
  }
}

type IdleFn = (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number;

/**
 * Starts painting the sheet in the page's idle moments, a few cells at a
 * time, so the first scene finds it ready. Safe to call more than once.
 */
export function warmSpriteAtlas(): void {
  if (atlas || painted > 0) return;
  const idle = (globalThis as { requestIdleCallback?: IdleFn }).requestIdleCallback;
  const step = (d?: { timeRemaining(): number }): void => {
    const until = performance.now() + Math.max(4, Math.min(10, d ? d.timeRemaining() : 8));
    while (painted < ATLAS_CELLS && performance.now() < until) paintCell(painted++);
    if (painted < ATLAS_CELLS && !atlas) {
      if (idle) idle(step, { timeout: 200 });
      else setTimeout(step, 16);
    }
  };
  paintCell(painted++);
  if (idle) idle(step, { timeout: 200 });
  else setTimeout(step, 16);
}

/** The shared sprite sheet. Built on first use (finishing what `warmSpriteAtlas` began), kept for the page's life. */
export function spriteAtlas(): THREE.DataTexture {
  if (atlas) return atlas;
  while (painted < ATLAS_CELLS) paintCell(painted++);
  const tex = new THREE.DataTexture(sheet!, ATLAS_W, ATLAS_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.needsUpdate = true;
  tex.name = 'fx-atlas';
  atlas = tex;
  return tex;
}

/** In a shader: the UV of a cell given a 0..1 local uv. */
export function cellUv(cell: F, uv: V2): V2 {
  const col = mod(cell, COLS);
  const row = float(ROWS - 1).sub(floor(cell.div(COLS)));
  return vec2(col, row).add(uv).div(vec2(COLS, ROWS));
}

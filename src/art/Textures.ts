/**
 * SLAY — procedural PBR texture baker.
 *
 * Every surface in the game is generated here, at runtime, from noise. There
 * are no image files anywhere in the project.
 *
 * The pipeline mirrors how a material artist works and — critically — derives
 * *all four* maps from one shared height field so they agree with each other.
 * A normal map that disagrees with its albedo is the loudest possible tell of
 * fake material work.
 *
 *   Phase A  structure   a domain-warped relief lattice, then the structural
 *                        passes that physically cut the surface: mortar
 *                        courses, cracks, chipped edges, corrosion pits,
 *                        embossed ornament, rivets.            -> height field
 *   Phase B  derivation  multi-radius blurs of the height give cavity, peak and
 *                        ledge masks plus the ambient occlusion term.
 *   Phase C  history     the story layered on top: water staining pooling in
 *                        the low areas, moss and rust growing in concavities,
 *                        soot, veins, scratches, mineral speckle, dust settling
 *                        on upward-facing ledges.  -> albedo/rough/metal/glow
 *   Phase D  encode      Sobel normals from the height (plus micro relief that
 *                        exists only in the normal map), ORM packing, upload.
 *
 * Everything tiles by construction. Low-frequency simplex fields use a C1
 * cross-fade wrap; every lattice and value-noise term is modular. Warped
 * lookups go through fract(), so domain warping never opens a seam.
 *
 * Performance strategy: expensive simplex work is baked into small fields
 * (1/8 and 1/2 resolution) and sampled bilinearly at full resolution. Low
 * frequency detail loses nothing to that, and it turns a multi-second bake into
 * a ~200ms one.
 */

import * as THREE from 'three';
import { Noise, clamp01, lerp, smoothstep, unipolar, hash2 } from './Noise';
import {
  resolvePalette,
  rgbOf,
  plausibleAlbedo,
  type Palette,
  type Pass,
  type MaskKind,
  type RGB,
} from './Palettes';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

let DEFAULT_SIZE = 512;
let ANISOTROPY = 8;

/** 512 is the sweet spot for 60fps at 1080p; 1024 for hero surfaces. */
export function setDefaultTextureSize(n: number): void {
  DEFAULT_SIZE = Math.max(128, Math.min(1024, 1 << Math.round(Math.log2(Math.max(1, n)))));
}

export function defaultTextureSize(): number {
  return DEFAULT_SIZE;
}

export function setTextureAnisotropy(n: number): void {
  ANISOTROPY = Math.max(1, Math.floor(n));
  for (const set of setCache.values()) {
    set.albedo.anisotropy = ANISOTROPY;
    set.normal.anisotropy = ANISOTROPY;
    set.orm.anisotropy = ANISOTROPY;
    set.albedo.needsUpdate = true;
    set.normal.needsUpdate = true;
    set.orm.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Deterministic helpers. Nothing in this file calls Math.random.
// ---------------------------------------------------------------------------

/** Salted 0..1 hash on an integer lattice. */
function vhash(x: number, y: number, salt: number): number {
  return hash2((x | 0) + salt * 7919, (y | 0) + salt * 104729);
}

/** Wrapped, exactly tileable value noise. `px`/`py` are periods in cells. */
function vnoise(x: number, y: number, px: number, py: number, salt: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const wx0 = ((x0 % px) + px) % px;
  const wy0 = ((y0 % py) + py) % py;
  const wx1 = (wx0 + 1) % px;
  const wy1 = (wy0 + 1) % py;
  const a = vhash(wx0, wy0, salt);
  const b = vhash(wx1, wy0, salt);
  const c = vhash(wx0, wy1, salt);
  const d = vhash(wx1, wy1, salt);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

/** Tileable value-noise fBm. Periods double per octave so wrapping survives. */
function vfbm(x: number, y: number, px: number, py: number, oct: number, salt: number): number {
  let amp = 1;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * f, y * f, px * f, py * f, salt + o * 37);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Ridged tileable noise — thin creases: cracks, veins, scratches. */
function vridge(x: number, y: number, px: number, py: number, oct: number, salt: number): number {
  let amp = 1;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f, px * f, py * f, salt + o * 53) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Wrapped Worley. Cell indices are taken modulo `cells`, so it tiles exactly. */
function worleyW(
  x: number,
  y: number,
  cells: number,
  jitter: number,
  salt: number,
  out: { f1: number; f2: number; id: number },
): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 1e9;
  let f2 = 1e9;
  let id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const wx = ((cx % cells) + cells) % cells;
      const wy = ((cy % cells) + cells) % cells;
      const px = cx + 0.5 + (vhash(wx, wy, salt) - 0.5) * jitter;
      const py = cy + 0.5 + (vhash(wx, wy, salt + 911) - 0.5) * jitter;
      const ddx = px - x;
      const ddy = py - y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = wy * cells + wx;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  out.f1 = f1;
  out.f2 = f2;
  out.id = id;
}

function fract(v: number): number {
  return v - Math.floor(v);
}

// ---------------------------------------------------------------------------
// Field — a baked, bilinearly sampled, wrapping scalar buffer
// ---------------------------------------------------------------------------

class Field {
  readonly size: number;
  readonly data: Float32Array;

  constructor(size: number) {
    this.size = size;
    this.data = new Float32Array(size * size);
  }

  at(x: number, y: number): number {
    const s = this.size;
    const xi = ((x % s) + s) % s;
    const yi = ((y % s) + s) % s;
    return this.data[yi * s + xi];
  }

  /** u,v are normalised tile coordinates; anything outside [0,1) wraps. */
  sample(u: number, v: number): number {
    const s = this.size;
    const fx = u * s - 0.5;
    const fy = v * s - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = this.at(x0, y0);
    const b = this.at(x0 + 1, y0);
    const c = this.at(x0, y0 + 1);
    const d = this.at(x0 + 1, y0 + 1);
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  }
}

/**
 * Bake a simplex-based function into a tileable field.
 *
 * Seamlessness comes from a smoothstep cross-fade against the field's own
 * period-shifted copy inside a narrow border band. Because the cross-fade uses
 * a smoothstep (zero derivative at both ends) the result is C1 across the seam,
 * not merely C0 — no visible ridge, and safe to sample through a domain warp.
 */
function bakeSimplexField(
  size: number,
  freqX: number,
  freqY: number,
  f: (x: number, y: number) => number,
  border = 0.14,
): Field {
  const fld = new Field(size);
  const d = fld.data;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const tv = v < border ? v / border : 1;
    const sv = tv >= 1 ? 1 : tv * tv * (3 - 2 * tv);
    const yA = v * freqY;
    const yB = (v + 1) * freqY;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const tu = u < border ? u / border : 1;
      const su = tu >= 1 ? 1 : tu * tu * (3 - 2 * tu);
      const xA = u * freqX;
      const xB = (u + 1) * freqX;
      let val: number;
      if (su >= 1 && sv >= 1) {
        val = f(xA, yA);
      } else if (sv >= 1) {
        val = lerp(f(xB, yA), f(xA, yA), su);
      } else if (su >= 1) {
        val = lerp(f(xA, yB), f(xA, yA), sv);
      } else {
        const a = f(xA, yA);
        const b = f(xB, yA);
        const c = f(xA, yB);
        const e = f(xB, yB);
        val = lerp(lerp(e, c, su), lerp(b, a, su), sv);
      }
      d[y * size + x] = val;
    }
  }
  return fld;
}

/** Bake an already-periodic (value-noise / lattice) function. No cross-fade needed. */
function bakeField(size: number, f: (u: number, v: number) => number): Field {
  const fld = new Field(size);
  const d = fld.data;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      d[y * size + x] = f(x / size, v);
    }
  }
  return fld;
}

/** Separable box blur with wrap-around, used for cavity/peak/AO derivation. */
function boxBlurWrap(
  src: Float32Array,
  size: number,
  radius: number,
  tmp: Float32Array,
  dst: Float32Array,
): void {
  const r = Math.max(1, radius | 0);
  const inv = 1 / (r * 2 + 1);
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[row + (((k % size) + size) % size)];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = sum * inv;
      const outIdx = (((x - r) % size) + size) % size;
      const inIdx = (((x + r + 1) % size) + size) % size;
      sum += src[row + inIdx] - src[row + outIdx];
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[(((k % size) + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      dst[y * size + x] = sum * inv;
      const outIdx = (((y - r) % size) + size) % size;
      const inIdx = (((y + r + 1) % size) + size) % size;
      sum += tmp[inIdx * size + x] - tmp[outIdx * size + x];
    }
  }
}

// ---------------------------------------------------------------------------
// Phase A — relief structure
// ---------------------------------------------------------------------------

export interface RawMaps {
  size: number;
  /** RGBA, sRGB. */
  albedo: Uint8Array;
  /** RGBA tangent-space normal, linear. */
  normal: Uint8Array;
  /** R = ambient occlusion, G = roughness, B = metalness (glTF ORM packing). */
  orm: Uint8Array;
  /** Greyscale glow mask; only present when the palette self-illuminates. */
  emissive: Uint8Array | null;
}

interface Structure {
  /** Height, 0..1. */
  h: Float32Array;
  /** Lattice border proximity: 1 on a mortar line, 0 in the cell interior. */
  edge: Float32Array;
  /** Per-cell random 0..1 — drives block-to-block tonal variation. */
  cell: Float32Array;
  /** Second per-cell random, for hue drift. */
  cell2: Float32Array;
  /** Micro relief that lives only in the normal map. */
  micro: Field;
}

const WORK = { f1: 0, f2: 0, id: 0 };

function buildStructure(pal: Palette, noise: Noise, N: number, seed: number): Structure {
  const R = pal.relief;
  const LOW = Math.max(48, N >> 3);
  const MID = Math.max(96, N >> 1);
  const salt = (seed & 0xffff) + 1;

  const stretch = R.stretch ?? 1;
  const fx = R.scale;
  const fy = R.scale / stretch;

  // Two very low frequency domain-warp fields. These carry the expensive
  // simplex `warp()` evaluations, so they bake tiny — a warp is low frequency
  // by definition and loses nothing to it.
  const wA = bakeSimplexField(LOW, fx * 0.5, fy * 0.5, (x, y) => noise.warp(x, y, 1.15, 4));
  const wB = bakeSimplexField(LOW, fx * 0.38, fy * 0.38, (x, y) => noise.warp(x + 31.7, y - 12.3, 1.1, 4));

  // Mid-frequency structure. Ridged is what makes rock read as rock instead of
  // as blurry cloud; billow gives the rounded lobes of organic matter.
  let fRidge: Field | null = null;
  let fBillow: Field | null = null;
  const needRidge =
    R.kind === 'rock' ||
    R.kind === 'cobble' ||
    R.kind === 'slab' ||
    R.kind === 'blocks' ||
    R.kind === 'plate' ||
    R.kind === 'crystal' ||
    R.kind === 'granular';
  if (needRidge) {
    fRidge = bakeSimplexField(MID, fx * 1.7, fy * 1.7, (x, y) => noise.ridged(x, y, R.octaves));
  }
  if (R.kind === 'organic' || R.kind === 'plate') {
    fBillow = bakeSimplexField(MID, fx * 1.3, fy * 1.3, (x, y) => noise.billow(x, y, 4));
  }
  const fFbm = bakeSimplexField(MID, fx, fy, (x, y) => unipolar(noise.fbm(x, y, R.octaves)));

  // Shared value-noise details, baked once instead of per pixel.
  const micro = bakeField(MID, (u, v) => vfbm(u * 26, v * 26, 26, 26, 3, salt + 5));
  const nib = bakeField(MID, (u, v) => vfbm(u * 40, v * 40, 40, 40, 2, salt + 9));

  const cells = Math.max(1, Math.round(R.cells ?? 4));
  const rows = Math.max(1, Math.round(R.rows ?? cells));
  const jitter = R.jitter ?? 0.5;
  // Mortar width is authored in tile fractions so it stays a constant physical
  // width regardless of how many cells the lattice has.
  const gap = 0.012;

  // Kind-specific auxiliary fields.
  let fAux: Field | null = null;
  switch (R.kind) {
    case 'plank':
      fAux = bakeField(MID, (u, v) => vfbm(u * 3, v * cells * 6, 3, cells * 6, 4, salt + 41));
      break;
    case 'weave':
      fAux = bakeField(MID, (u, v) => vfbm(u * cells * 3, v * cells * 3, cells * 3, cells * 3, 3, salt + 61));
      break;
    case 'organic':
      fAux = bakeField(MID, (u, v) => vfbm(u * 6, v * 6, 6, 6, 3, salt + 19));
      break;
    case 'granular':
      fAux = bakeField(N, (u, v) => vfbm(u * 110, v * 110, 110, 110, 2, salt + 7));
      break;
    case 'fiber':
      fAux = bakeField(N, (u, v) => vfbm(u * 3, v * 180, 3, 180, 4, salt + 101));
      break;
    default:
      break;
  }

  const h = new Float32Array(N * N);
  const edge = new Float32Array(N * N);
  const cell = new Float32Array(N * N);
  const cell2 = new Float32Array(N * N);

  const warpAmt = R.warp * 0.085;
  const depth = R.depth;

  for (let y = 0; y < N; y++) {
    const v0 = (y + 0.5) / N;
    for (let x = 0; x < N; x++) {
      const u0 = (x + 0.5) / N;
      const i = y * N + x;

      // Domain warp: every lattice and every field lookup below happens in
      // warped space. This is what stops the eye locking onto the grid.
      const u = fract(u0 + wA.sample(u0, v0) * warpAmt);
      const v = fract(v0 + wB.sample(u0, v0) * warpAmt);

      const detail = fFbm.sample(u, v);
      const ridge = fRidge ? fRidge.sample(u, v) : 0;
      const billow = fBillow ? fBillow.sample(u, v) : 0;
      const mic = micro.sample(u, v);

      let height = 0.5;
      let ed = 0;
      let cid = 0;
      let cid2 = 0;

      switch (R.kind) {
        case 'blocks': {
          const ry = v * rows;
          const row = Math.floor(ry);
          const fyv = ry - row;
          const wrow = ((row % rows) + rows) % rows;
          const rowOff = (wrow & 1) * 0.5 + (vhash(0, wrow, salt + 3) - 0.5) * 0.1 * jitter;
          const rx = u * cells + rowOff;
          const col = Math.floor(rx);
          const fxv = rx - col;
          const wcol = ((col % cells) + cells) % cells;
          cid = vhash(wcol, wrow, salt + 21);
          cid2 = vhash(wcol, wrow, salt + 47);
          // Ragged joints: nibble the mortar line with fine noise so no two
          // courses share an edge profile.
          const n = (nib.sample(u, v) - 0.5) * 0.06 * jitter;
          const dU = (Math.min(fxv, 1 - fxv) + n) / cells;
          const dV = (Math.min(fyv, 1 - fyv) + n) / rows;
          ed = 1 - smoothstep(gap * 0.5, gap * 2.2, Math.min(dU, dV));
          const face = detail * 0.5 + ridge * 0.3 + mic * 0.2;
          height = 0.44 + (cid - 0.5) * 0.16 * jitter + face * 0.3;
          height = lerp(height, 0.1, ed * 0.95);
          break;
        }
        case 'slab':
        case 'cobble': {
          worleyW(u * cells, v * cells, cells, 0.9 * jitter + 0.1, salt + 31, WORK);
          cid = vhash(WORK.id, 0, salt + 33);
          cid2 = vhash(WORK.id, 1, salt + 39);
          const n = (nib.sample(u, v) - 0.5) * 0.18;
          ed = 1 - smoothstep(0.03, 0.17, WORK.f2 - WORK.f1 + n);
          const dome =
            R.kind === 'cobble'
              ? smoothstep(0.64, 0.05, WORK.f1)
              : smoothstep(0.95, 0.14, WORK.f1) * 0.55 + 0.45;
          const face = detail * 0.45 + ridge * 0.3 + mic * 0.25;
          height = 0.28 + dome * 0.4 + (cid - 0.5) * 0.14 + face * 0.2;
          height = lerp(height, 0.09, ed * 0.92);
          break;
        }
        case 'plank': {
          const ry = v * cells;
          const row = Math.floor(ry);
          const fyv = ry - row;
          const wrow = ((row % cells) + cells) % cells;
          const seamU = fract(u + vhash(0, wrow, salt + 5));
          const nJoints = 2;
          const jy = seamU * nJoints;
          const jcol = Math.floor(jy);
          const fju = jy - jcol;
          cid = vhash(jcol, wrow, salt + 23);
          cid2 = vhash(jcol, wrow, salt + 29);
          const dV = Math.min(fyv, 1 - fyv) / cells;
          const dU = Math.min(fju, 1 - fju) / nJoints;
          ed = Math.max(
            1 - smoothstep(gap * 0.4, gap * 1.8, dV),
            (1 - smoothstep(gap * 0.25, gap * 1.1, dU)) * 0.85,
          );
          const grain = fAux ? fAux.sample(u, v) : detail;
          // Boards cup as they dry — the centre stands proud of the edges.
          const cup = Math.sin(fyv * Math.PI);
          height = 0.4 + (cid - 0.5) * 0.1 + grain * 0.22 + cup * 0.18 + mic * 0.08;
          height = lerp(height, 0.06, ed * 0.95);
          break;
        }
        case 'weave': {
          const c = cells;
          const gx = u * c;
          const gy = v * c;
          const ix = Math.floor(gx);
          const iy = Math.floor(gy);
          const over = ((ix + iy) & 1) === 0;
          const tx = Math.abs(Math.sin((gx - ix) * Math.PI));
          const ty = Math.abs(Math.sin((gy - iy) * Math.PI));
          const thread = over ? tx * 0.85 + ty * 0.15 : ty * 0.85 + tx * 0.15;
          const fuzz = fAux ? fAux.sample(u, v) : mic;
          height = 0.26 + thread * 0.5 + fuzz * 0.16 + detail * 0.1;
          ed = clamp01(1 - thread * 1.4);
          cid = vhash(((ix % c) + c) % c, ((iy % c) + c) % c, salt + 12);
          cid2 = fuzz;
          break;
        }
        case 'plate': {
          const c = cells;
          const rx = u * c;
          const ry = v * c;
          const col = Math.floor(rx);
          const row = Math.floor(ry);
          const fxv = rx - col;
          const fyv = ry - row;
          cid = vhash(((col % c) + c) % c, ((row % c) + c) % c, salt + 71);
          cid2 = vhash(((col % c) + c) % c, ((row % c) + c) % c, salt + 73);
          const dU = Math.min(fxv, 1 - fxv) / c;
          const dV = Math.min(fyv, 1 - fyv) / c;
          ed = 1 - smoothstep(gap * 0.7, gap * 2.8, Math.min(dU, dV));
          // Hammered sheet: broad dents plus a faint mill finish.
          height = 0.5 + (cid - 0.5) * 0.08 + (billow - 0.5) * 0.3 + (ridge - 0.5) * 0.12 + mic * 0.1;
          height = lerp(height, 0.2, ed * 0.85);
          break;
        }
        case 'organic': {
          const lump = fAux ? fAux.sample(u, v) : detail;
          height = billow * 0.42 + detail * 0.3 + lump * 0.18 + mic * 0.1;
          ed = clamp01(1 - Math.abs(height - 0.45) * 2.6);
          cid = lump;
          cid2 = mic;
          break;
        }
        case 'crystal': {
          worleyW(u * cells, v * cells, cells, 0.95 * jitter, salt + 43, WORK);
          cid = vhash(WORK.id, 0, salt + 44);
          cid2 = vhash(WORK.id, 1, salt + 45);
          ed = 1 - smoothstep(0.0, 0.1, WORK.f2 - WORK.f1);
          // A tilted plane per cell: sharp facets, not blobs.
          const facet = clamp01(1 - WORK.f1 * (1.05 + cid * 0.85));
          height = 0.22 + facet * 0.62 + ridge * 0.12 + mic * 0.05;
          height = lerp(height, height * 0.7, ed);
          break;
        }
        case 'granular': {
          const grain = fAux ? fAux.sample(u, v) : mic;
          const dune = ridge * 0.5 + detail * 0.5;
          height = 0.3 + dune * 0.5 + grain * 0.2;
          ed = 0;
          cid = detail;
          cid2 = grain;
          break;
        }
        case 'scale': {
          const ry = v * rows;
          const row = Math.floor(ry);
          const fyv = ry - row;
          const wrow = ((row % rows) + rows) % rows;
          const rx = u * cells + (wrow & 1) * 0.5;
          const col = Math.floor(rx);
          const fxv = rx - col;
          const wcol = ((col % cells) + cells) % cells;
          cid = vhash(wcol, wrow, salt + 81);
          cid2 = vhash(wcol, wrow, salt + 83);
          const dx = (fxv - 0.5) * 2.05;
          const dy = (fyv - 0.6) * 1.85;
          const rr = Math.sqrt(dx * dx + dy * dy * 1.3);
          const shell = smoothstep(1.05, 0.12, rr);
          ed = clamp01(1 - shell) * 0.9;
          height = 0.22 + shell * 0.56 + (cid - 0.5) * 0.08 + detail * 0.14 + mic * 0.06;
          break;
        }
        case 'hide': {
          worleyW(u * cells, v * cells, cells, jitter, salt + 91, WORK);
          cid = vhash(WORK.id, 0, salt + 92);
          cid2 = vhash(WORK.id, 1, salt + 93);
          ed = 1 - smoothstep(0.0, 0.15, WORK.f2 - WORK.f1);
          const pebble = smoothstep(0.72, 0.05, WORK.f1);
          height = 0.36 + pebble * 0.32 + detail * 0.18 + mic * 0.12;
          height = lerp(height, height - 0.13, ed);
          break;
        }
        case 'fiber': {
          const fib = fAux ? fAux.sample(u, v) : detail;
          height = 0.4 + fib * 0.34 + detail * 0.2 + mic * 0.06;
          ed = 0;
          cid = detail;
          cid2 = fib;
          break;
        }
        case 'rock': {
          height = ridge * 0.6 + detail * 0.3 + mic * 0.1;
          // Erosion: an S-curve pulls the low areas lower so silt collects.
          height = height * height * (3 - 2 * height);
          ed = clamp01(1 - Math.abs(height - 0.5) * 3);
          cid = detail;
          cid2 = mic;
          break;
        }
        case 'smooth':
        default: {
          height = detail * 0.72 + mic * 0.18 + 0.1;
          ed = 0;
          cid = detail;
          cid2 = mic;
          break;
        }
      }

      h[i] = clamp01(0.5 + (height - 0.5) * (0.55 + depth * 1.1));
      edge[i] = clamp01(ed);
      cell[i] = cid;
      cell2[i] = cid2;
    }
  }

  return { h, edge, cell, cell2, micro };
}

// ---------------------------------------------------------------------------
// Pass coverage masks
// ---------------------------------------------------------------------------

/**
 * Bake a pass's own coverage noise. Passes are low-to-mid frequency patches, so
 * most bake at half resolution and are sampled bilinearly; the couple that need
 * pixel crispness (speckle, scratch) bake full size but are individually cheap.
 */
function bakePassMask(pass: Pass, pal: Palette, N: number, seed: number, index: number): Field {
  const s = (pass.scale ?? 1) * pal.relief.scale;
  const salt = ((seed >>> 3) & 0x7fff) + index * 131 + 7;
  const sharp = pass.sharp ?? 1.6;
  const half = Math.max(64, N >> 1);

  switch (pass.kind) {
    case 'mortar':
      // Driven entirely by the lattice edge mask; a constant field is enough.
      return bakeField(8, () => 1);

    case 'crack': {
      const c = Math.max(2, Math.round(s * 2));
      return bakeField(N, (u, v) => clamp01((vridge(u * c, v * c, c, c, 4, salt) - 0.6) * 5));
    }
    case 'veins': {
      const c = Math.max(2, Math.round(s * 2));
      return bakeField(N, (u, v) => clamp01((vridge(u * c, v * c, c, c, 3, salt + 5) - 0.68) * 6));
    }
    case 'chip': {
      const c = Math.max(4, Math.round(s * 4));
      return bakeField(half, (u, v) => clamp01((vfbm(u * c, v * c, c, c, 3, salt + 11) - 0.56) * 4.5));
    }
    case 'pit': {
      const c = Math.max(3, Math.round(s * 3));
      const c2 = Math.max(1, Math.round(c * 0.5));
      return bakeField(half, (u, v) => {
        worleyW(u * c, v * c, c, 1.0, salt + 17, WORK);
        const blob = clamp01(1 - WORK.f1 * 2.2);
        const gate = clamp01((vfbm(u * c2, v * c2, c2, c2, 2, salt + 19) - 0.4) * 3);
        return blob * gate;
      });
    }
    case 'rivet': {
      const c = Math.max(2, Math.round(s * 2));
      return bakeField(N, (u, v) => {
        const gx = fract(u * c) - 0.5;
        const gy = fract(v * c) - 0.5;
        const r = Math.sqrt(gx * gx + gy * gy);
        const keep = vhash(Math.floor(u * c), Math.floor(v * c), salt + 23) > 0.45 ? 1 : 0;
        return keep * smoothstep(0.2, 0.07, r);
      });
    }
    case 'emboss': {
      const c = Math.max(1, Math.round(s * 0.7));
      return bakeField(N, (u, v) => {
        // A wound interlace: two out-of-phase lattices, warped so it is not a
        // machine grid. Integer frequencies keep it seamless.
        const wob = (vfbm(u * 4, v * 4, 4, 4, 3, salt + 29) - 0.5) * 0.16;
        const a = Math.sin((u + wob) * Math.PI * 2 * c) * Math.cos((v - wob) * Math.PI * 2 * c);
        const b = Math.sin((u + v) * Math.PI * 2 * c);
        return clamp01((Math.abs(a) * 0.7 + Math.abs(b) * 0.3 - 0.42) * 3.2);
      });
    }
    case 'moss':
    case 'rust':
    case 'frost':
    case 'blood': {
      const c = Math.max(2, Math.round(s * 1.4));
      const c3 = c * 3;
      return bakeField(half, (u, v) => {
        const n = vfbm(u * c, v * c, c, c, 4, salt + 31);
        const n2 = vfbm(u * c3, v * c3, c3, c3, 3, salt + 37);
        return clamp01((n * 0.75 + n2 * 0.25 - 0.46) * (2.2 * sharp));
      });
    }
    case 'stain': {
      // Runs downward: stretched along V so it reads as drips, not blobs.
      const c = Math.max(2, Math.round(s * 1.2));
      const cv = Math.max(1, Math.round(c * 0.34));
      return bakeField(half, (u, v) => clamp01((vfbm(u * c, v * cv, c, cv, 4, salt + 41) - 0.44) * (2.0 * sharp)));
    }
    case 'soot':
    case 'dust': {
      const c = Math.max(2, Math.round(s * 1.1));
      return bakeField(half, (u, v) => clamp01((vfbm(u * c, v * c, c, c, 4, salt + 47) - 0.4) * 1.9));
    }
    case 'scratch': {
      const c = Math.max(6, Math.round(s * 6));
      // Shear by a whole lattice period so the streaks stay seamless.
      const shear = 1 + (Math.floor(vhash(0, 0, salt + 53) * 3) | 0);
      const cy = Math.max(1, Math.round(c * 0.09));
      return bakeField(N, (u, v) =>
        clamp01((vridge(u * c + v * c * shear, v * cy, c, cy, 3, salt + 59) - 0.74) * 8),
      );
    }
    case 'grain': {
      // Wood rings: a distorted, stretched ring function following the boards.
      const rings = Math.max(4, Math.round(s * 4));
      return bakeField(N, (u, v) => {
        const wob = (vfbm(u * 3, v * 24, 3, 24, 3, salt + 61) - 0.5) * 0.6;
        const r = fract(v * rings + wob * 3);
        return clamp01(Math.pow(1 - Math.abs(r * 2 - 1), 2.6));
      });
    }
    case 'fray': {
      const c = Math.max(8, Math.round(s * 8));
      const cv = Math.max(1, Math.round(c * 0.25));
      return bakeField(N, (u, v) => clamp01((vfbm(u * c, v * cv, c, cv, 3, salt + 67) - 0.5) * 3.2));
    }
    case 'speckle': {
      const c = Math.max(8, Math.round(s * 8));
      return bakeField(N, (u, v) => clamp01((vnoise(u * c, v * c, c, c, salt + 71) - 0.62) * 4.5));
    }
    case 'glaze':
    default: {
      const c = Math.max(2, Math.round(s));
      return bakeField(half, (u, v) => vfbm(u * c, v * c, c, c, 3, salt + 73));
    }
  }
}

const STRUCTURAL: ReadonlySet<string> = new Set(['mortar', 'crack', 'chip', 'pit', 'emboss', 'rivet']);

function maskValue(
  kind: MaskKind | undefined,
  h: number,
  cavity: number,
  peak: number,
  ledge: number,
  edge: number,
): number {
  switch (kind) {
    case 'height':
      return smoothstep(0.35, 0.85, h);
    case 'low':
      return smoothstep(0.62, 0.12, h);
    case 'cavity':
      return cavity;
    case 'peak':
      return peak;
    case 'ledge':
      return ledge;
    case 'edge':
      return edge;
    case 'none':
    default:
      return 1;
  }
}

/** Writes mix(a,b,t) into `out` without allocating. Safe when out === a. */
function mixInto(out: RGB, a: RGB, b: RGB, t: number): RGB {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
}

// ---------------------------------------------------------------------------
// The bake
// ---------------------------------------------------------------------------

export function generateRawMaps(paletteKey: string, seed: number, size: number): RawMaps {
  const pal = resolvePalette(paletteKey);
  const noise = new Noise((seed ^ 0x5bf03635) >>> 0);
  const N = size;
  const count = N * N;

  const struct = buildStructure(pal, noise, N, seed);
  const H = struct.h;

  const masks = pal.passes.map((pass, idx) => ({
    pass,
    field: bakePassMask(pass, pal, N, seed, idx),
  }));

  // ---- Phase A2: structural passes physically cut the height field ----
  for (const { pass, field } of masks) {
    if (!STRUCTURAL.has(pass.kind)) continue;
    const dh = pass.height ?? 0;
    if (dh === 0) continue;
    for (let y = 0; y < N; y++) {
      const v = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        let m: number;
        if (pass.kind === 'mortar') {
          m = struct.edge[i] * pass.amount;
        } else {
          m = field.sample((x + 0.5) / N, v) * pass.amount;
          const g = pass.mask;
          if (g === 'edge') m *= struct.edge[i];
          else if (g === 'peak') m *= smoothstep(0.55, 0.95, H[i]);
          else if (g === 'low') m *= smoothstep(0.6, 0.15, H[i]);
          else if (g === 'height') m *= smoothstep(0.35, 0.85, H[i]);
        }
        if (m <= 0.003) continue;
        H[i] = clamp01(H[i] + dh * (m > 1 ? 1 : m));
      }
    }
  }

  // ---- Phase B: cavity / peak / ledge / AO derived from the finished height ---
  const tmp = new Float32Array(count);
  const blurA = new Float32Array(count);
  const blurB = new Float32Array(count);
  const blurC = new Float32Array(count);
  boxBlurWrap(H, N, Math.max(1, Math.round(N / 220)), tmp, blurA);
  boxBlurWrap(H, N, Math.max(2, Math.round(N / 70)), tmp, blurB);
  boxBlurWrap(H, N, Math.max(4, Math.round(N / 22)), tmp, blurC);

  const aoStrength = pal.ao ?? 0.85;
  const AO = new Float32Array(count);
  const CAV = new Float32Array(count);
  const PEAK = new Float32Array(count);
  const LEDGE = new Float32Array(count);

  for (let y = 0; y < N; y++) {
    const rowUp = ((y + 1) % N) * N;
    const rowDn = ((y - 1 + N) % N) * N;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const h = H[i];
      const dA = blurA[i] - h;
      const dB = blurB[i] - h;
      const dC = blurC[i] - h;
      // Occlusion is how far a point sits below its own neighbourhood, summed
      // across scales — tight crevices and broad recesses both darken.
      const occ = clamp01(dA * 2.4) * 0.3 + clamp01(dB * 2.0) * 0.42 + clamp01(dC * 1.6) * 0.28;
      AO[i] = clamp01(1 - occ * aoStrength);
      CAV[i] = clamp01(dB * 3.4 + dC * 1.6);
      PEAK[i] = clamp01(-dB * 3.6 - dA * 1.2);
      // Tangent-space +V is "up" on a wall. Dust settles where the surface
      // tilts toward it and the local slope is shallow.
      const gv = H[rowUp + x] - H[rowDn + x];
      LEDGE[i] = smoothstep(0.004, 0.05, -gv) * smoothstep(0.22, 0.6, h);
    }
  }

  // ---- Phase C: albedo / roughness / metalness surface history ----
  const cBase = plausibleAlbedo(rgbOf(pal.base));
  const cShade = plausibleAlbedo(rgbOf(pal.shade));
  const cLight = plausibleAlbedo(rgbOf(pal.light));
  const cDetail = plausibleAlbedo(rgbOf(pal.detail));
  const cAccent = plausibleAlbedo(rgbOf(pal.accent));
  const passColors = masks.map(({ pass }) => (pass.color !== undefined ? rgbOf(pass.color) : null));

  const albedo = new Uint8Array(count * 4);
  const orm = new Uint8Array(count * 4);
  const wantEmissive = pal.emissive !== undefined;
  const emissive = wantEmissive ? new Uint8Array(count * 4) : null;

  const rMin = pal.roughness[0];
  const rMax = pal.roughness[1];
  const variance = pal.variance ?? 0.25;
  const col: RGB = { r: 0, g: 0, b: 0 };

  for (let y = 0; y < N; y++) {
    const v = (y + 0.5) / N;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const u = (x + 0.5) / N;
      const h = H[i];
      const cav = CAV[i];
      const peak = PEAK[i];
      const ledge = LEDGE[i];
      const edge = struct.edge[i];
      const cid = struct.cell[i];
      const cid2 = struct.cell2[i];

      // Base ramp: crevice -> mid -> worn highlight.
      mixInto(col, cShade, cBase, smoothstep(0.06, 0.58, h));
      mixInto(col, col, cLight, smoothstep(0.55, 0.95, h) * 0.78);

      // Per-cell tonal drift keeps adjacent blocks from reading as clones.
      const drift = (cid - 0.5) * variance;
      col.r = clamp01(col.r * (1 + drift * 0.9));
      col.g = clamp01(col.g * (1 + drift * 0.82));
      col.b = clamp01(col.b * (1 + drift * 0.74));
      const hueT = (cid2 - 0.5) * variance * 0.55;
      if (hueT > 0) mixInto(col, col, cDetail, hueT);

      let rough = lerp(rMax, rMin, smoothstep(0.3, 0.92, h)) + (cid2 - 0.5) * 0.06;
      let metal = pal.metalness;
      let glow = 0;

      for (let pi = 0; pi < masks.length; pi++) {
        const pass = masks[pi].pass;
        let m: number;
        if (pass.kind === 'mortar') {
          m = edge * pass.amount;
        } else {
          m = masks[pi].field.sample(u, v) * pass.amount;
          m *= maskValue(pass.mask, h, cav, peak, ledge, edge);
        }
        if (m <= 0.004) continue;
        if (m > 1) m = 1;
        const pc = passColors[pi];

        switch (pass.kind) {
          case 'mortar':
            mixInto(col, col, pc ?? cDetail, m * 0.9);
            break;
          case 'crack':
            mixInto(col, col, pc ?? cShade, m * 0.85);
            if (pc && wantEmissive) glow = Math.max(glow, m);
            break;
          case 'chip':
            // Fresh breaks expose brighter, unweathered material.
            mixInto(col, col, pc ?? cLight, m * 0.7);
            rough += 0.12 * m;
            break;
          case 'pit':
            mixInto(col, col, pc ?? cShade, m * 0.75);
            rough += 0.14 * m;
            break;
          case 'rivet':
            mixInto(col, col, pc ?? cLight, m * 0.65);
            break;
          case 'emboss':
            mixInto(col, col, pc ?? cDetail, m * 0.55);
            break;
          case 'stain':
            mixInto(col, col, pc ?? cShade, m * 0.7);
            break;
          case 'moss':
            mixInto(col, col, pc ?? cAccent, m * 0.88);
            break;
          case 'rust':
            mixInto(col, col, pc ?? cAccent, m * 0.92);
            break;
          case 'soot':
            mixInto(col, col, pc ?? cShade, m * 0.8);
            break;
          case 'dust':
            mixInto(col, col, pc ?? cLight, m * 0.5);
            break;
          case 'frost':
            mixInto(col, col, pc ?? cAccent, m * 0.85);
            break;
          case 'blood':
            mixInto(col, col, pc ?? cAccent, m * 0.9);
            break;
          case 'veins':
            mixInto(col, col, pc ?? cDetail, m * 0.8);
            if (wantEmissive) glow = Math.max(glow, m);
            break;
          case 'scratch':
            mixInto(col, col, pc ?? cLight, m * 0.45);
            break;
          case 'speckle':
            mixInto(col, col, pc ?? cLight, m * 0.6);
            break;
          case 'grain':
            mixInto(col, col, pc ?? cShade, m * 0.6);
            break;
          case 'fray':
            mixInto(col, col, pc ?? cLight, m * 0.4);
            break;
          case 'glaze':
            break;
        }

        if (pass.rough) rough += pass.rough * m;
        if (pass.metal) metal += pass.metal * m;
      }

      // A fraction of the occlusion baked into albedo. Full AO in albedo is
      // wrong, but a touch of it is what scan data looks like and it survives
      // any lighting setup.
      const ao = AO[i];
      const aoTint = lerp(1, ao, 0.34);
      col.r *= aoTint;
      col.g *= aoTint;
      col.b *= aoTint;

      const fin = plausibleAlbedo(col);
      const o = i * 4;
      albedo[o] = (clamp01(fin.r) * 255) | 0;
      albedo[o + 1] = (clamp01(fin.g) * 255) | 0;
      albedo[o + 2] = (clamp01(fin.b) * 255) | 0;
      albedo[o + 3] = 255;

      orm[o] = (ao * 255) | 0;
      orm[o + 1] = (clamp01(rough) * 255) | 0;
      orm[o + 2] = (clamp01(metal) * 255) | 0;
      orm[o + 3] = 255;

      if (emissive) {
        const g = (clamp01(glow) * 255) | 0;
        emissive[o] = g;
        emissive[o + 1] = g;
        emissive[o + 2] = g;
        emissive[o + 3] = 255;
      }
    }
  }

  // ---- Phase D: normals ----
  // Micro relief is folded in here only. It is far below the albedo's
  // resolvable scale, but it is exactly what makes a surface catch grazing
  // light instead of looking like shrink-wrapped plastic.
  const bump = pal.bump;
  const HN = new Float32Array(count);
  for (let y = 0; y < N; y++) {
    const v = (y + 0.5) / N;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      HN[i] = H[i] + (struct.micro.sample((x + 0.5) / N, v) - 0.5) * 0.012 * bump;
    }
  }

  const normal = new Uint8Array(count * 4);
  const gscale = N * 0.022 * bump;
  for (let y = 0; y < N; y++) {
    const ym = ((y - 1 + N) % N) * N;
    const yp = ((y + 1) % N) * N;
    const yc = y * N;
    for (let x = 0; x < N; x++) {
      const xm = (x - 1 + N) % N;
      const xp = (x + 1) % N;
      // Sobel is far more stable than a central difference on a noisy field —
      // no shimmering under anisotropic filtering at grazing angles.
      const tl = HN[ym + xm];
      const tc = HN[ym + x];
      const tr = HN[ym + xp];
      const ml = HN[yc + xm];
      const mr = HN[yc + xp];
      const bl = HN[yp + xm];
      const bc = HN[yp + x];
      const br = HN[yp + xp];
      const gx = tl + 2 * ml + bl - (tr + 2 * mr + br);
      const gy = tl + 2 * tc + tr - (bl + 2 * bc + br);
      let nx = gx * gscale;
      let ny = gy * gscale;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv;
      ny *= inv;
      const o = (yc + x) * 4;
      normal[o] = ((nx * 0.5 + 0.5) * 255) | 0;
      normal[o + 1] = ((ny * 0.5 + 0.5) * 255) | 0;
      normal[o + 2] = ((inv * 0.5 + 0.5) * 255) | 0;
      normal[o + 3] = 255;
    }
  }

  return { size: N, albedo, normal, orm, emissive };
}

// ---------------------------------------------------------------------------
// THREE texture wrapping + cache
// ---------------------------------------------------------------------------

export interface TextureSet {
  key: string;
  size: number;
  albedo: THREE.DataTexture;
  normal: THREE.DataTexture;
  /** R = AO, G = roughness, B = metalness. Bound to all three map slots. */
  orm: THREE.DataTexture;
  emissive: THREE.DataTexture | null;
  palette: Palette;
}

const rawCache = new Map<string, RawMaps>();
const setCache = new Map<string, TextureSet>();

function makeTexture(data: Uint8Array, size: number, srgb: boolean, repeat: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = ANISOTROPY;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.repeat.set(repeat, repeat);
  tex.needsUpdate = true;
  return tex;
}

/** Quantise repeat so callers naturally share GPU uploads. */
function quantRepeat(r: number): number {
  const q = Math.max(0.125, Math.min(64, r));
  return Math.round(q * 4) / 4;
}

export interface TextureSetOpts {
  seed?: number;
  size?: number;
  repeat?: number;
}

/**
 * Fetch (or bake) the coordinated PBR set for a palette. Raw pixel data is
 * cached separately from the GPU textures, so when a scene teardown disposes a
 * shared texture the set rebuilds in microseconds rather than re-baking.
 */
export function getTextureSet(paletteKey: string, opts: TextureSetOpts = {}): TextureSet {
  const pal = resolvePalette(paletteKey);
  const size = opts.size ?? DEFAULT_SIZE;
  const seed = opts.seed ?? 0;
  const repeat = quantRepeat(opts.repeat ?? pal.repeat ?? 1);
  const setKey = `${pal.key}|${seed}|${size}|${repeat}`;
  const cached = setCache.get(setKey);
  if (cached) return cached;

  const rawKey = `${pal.key}|${seed}|${size}`;
  let raw = rawCache.get(rawKey);
  if (!raw) {
    raw = generateRawMaps(pal.key, seed, size);
    rawCache.set(rawKey, raw);
  }

  const set: TextureSet = {
    key: setKey,
    size,
    palette: pal,
    albedo: makeTexture(raw.albedo, size, true, repeat),
    normal: makeTexture(raw.normal, size, false, repeat),
    orm: makeTexture(raw.orm, size, false, repeat),
    emissive: raw.emissive ? makeTexture(raw.emissive, size, false, repeat) : null,
  };

  // Scene teardown walks materials and frees every texture it finds. If that
  // happens to a shared set, drop it so the next request rebuilds cheaply.
  const evict = (): void => {
    if (setCache.get(setKey) === set) setCache.delete(setKey);
  };
  set.albedo.addEventListener('dispose', evict);
  set.normal.addEventListener('dispose', evict);
  set.orm.addEventListener('dispose', evict);

  setCache.set(setKey, set);
  return set;
}

/** True once the expensive pixel work for this palette is already done. */
export function isBaked(paletteKey: string, seed = 0, size = DEFAULT_SIZE): boolean {
  return rawCache.has(`${resolvePalette(paletteKey).key}|${seed}|${size}`);
}

export function clearTextureCache(): void {
  for (const set of setCache.values()) {
    set.albedo.dispose();
    set.normal.dispose();
    set.orm.dispose();
    set.emissive?.dispose();
  }
  setCache.clear();
  rawCache.clear();
}

/** Rough VRAM estimate in bytes, for the debug overlay. */
export function textureMemoryEstimate(): number {
  let bytes = 0;
  for (const set of setCache.values()) {
    const one = set.size * set.size * 4 * 1.34;
    bytes += one * (set.emissive ? 4 : 3);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Small utility textures (sprites, beams, runes) — also fully procedural
// ---------------------------------------------------------------------------

const utilCache = new Map<string, THREE.DataTexture>();

function finishUtil(key: string, data: Uint8Array, size: number, mips: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.generateMipmaps = mips;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  utilCache.set(key, tex);
  return tex;
}

/** Soft radial glow sprite: drop beams, motes, light flares. */
export function radialGlowTexture(size = 128, power = 2.2): THREE.DataTexture {
  const key = `glow|${size}|${power}`;
  const hit = utilCache.get(key);
  if (hit) return hit;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const a = Math.pow(clamp01(1 - Math.sqrt(dx * dx + dy * dy)), power);
      const o = (y * size + x) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = (clamp01(a) * 255) | 0;
    }
  }
  return finishUtil(key, data, size, true);
}

/**
 * A vertical light-shaft gradient: dense at the base, fading upward, with faint
 * striations so it does not read as a flat cone.
 */
export function beamTexture(size = 64, seed = 7): THREE.DataTexture {
  const key = `beam|${size}|${seed}`;
  const hit = utilCache.get(key);
  if (hit) return hit;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const edgeFade = Math.sin(u * Math.PI);
      const stri = 0.75 + 0.25 * vnoise(u * 8, v * 3, 8, 3, seed);
      const a = clamp01(Math.pow(1 - v, 1.5) * edgeFade * stri);
      const o = (y * size + x) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = (a * 255) | 0;
    }
  }
  const tex = finishUtil(key, data, size, false);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/**
 * A procedural rune ring — concentric arcs, glyph ticks and an inner sigil.
 * Used as an emissive decal on high-rarity gear and on caster telegraphs.
 */
export function runeRingTexture(size = 256, seed = 11, glyphs = 12): THREE.DataTexture {
  const key = `rune|${size}|${seed}|${glyphs}`;
  const hit = utilCache.get(key);
  if (hit) return hit;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  const spokes = 5 + (Math.floor(vhash(1, 1, seed) * 3) | 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5;
      let a = 1 - smoothstep(0.0, 0.02, Math.abs(r - 0.94));
      a = Math.max(a, (1 - smoothstep(0.0, 0.015, Math.abs(r - 0.7))) * 0.8);
      if (r > 0.72 && r < 0.92) {
        const seg = ang * glyphs;
        const gi = Math.floor(seg);
        const fg = seg - gi;
        const bits = (Math.floor(vhash(gi, 0, seed) * 15) | 0) + 1;
        const band = Math.floor((r - 0.72) / 0.05) & 3;
        if (((bits >> band) & 1) === 1 && fg > 0.22 && fg < 0.78) a = Math.max(a, 0.95);
      }
      if (r < 0.66) {
        const s = Math.abs(Math.cos(ang * Math.PI * 2 * spokes));
        const edge = 0.2 + s * 0.42;
        a = Math.max(a, (1 - smoothstep(0.0, 0.03, Math.abs(r - edge))) * 0.85);
      }
      const o = (y * size + x) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = (clamp01(a) * 255) | 0;
    }
  }
  return finishUtil(key, data, size, true);
}

export function disposeUtilityTextures(): void {
  for (const t of utilCache.values()) t.dispose();
  utilCache.clear();
}

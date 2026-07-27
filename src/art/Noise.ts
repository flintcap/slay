/**
 * Noise primitives for procedural texture and geometry generation.
 *
 * Everything here is seeded and deterministic. The permutation table is built
 * once per instance so a given seed always yields the same stone, the same
 * rust, the same cave walls.
 */

export class Noise {
  private perm = new Uint8Array(512);
  private permMod12 = new Uint8Array(512);

  constructor(seed = 1337) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Deterministic Fisher-Yates using a local LCG.
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]!;
      p[i] = p[j]!;
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]!;
      this.permMod12[i] = this.perm[i]! % 12;
    }
  }

  // --- 2D simplex ---------------------------------------------------------

  private static readonly GRAD3 = new Float32Array([
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1,
    1, 0, 1, -1, 0, -1, -1,
  ]);

  /** 2D simplex noise in [-1,1]. */
  simplex2(xin: number, yin: number): number {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    let i1: number;
    let j1: number;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const g = Noise.GRAD3;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = this.permMod12[ii + this.perm[jj]!]! * 3;
      t0 *= t0;
      n0 = t0 * t0 * (g[gi0]! * x0 + g[gi0 + 1]! * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]!]! * 3;
      t1 *= t1;
      n1 = t1 * t1 * (g[gi1]! * x1 + g[gi1 + 1]! * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]!]! * 3;
      t2 *= t2;
      n2 = t2 * t2 * (g[gi2]! * x2 + g[gi2 + 1]! * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  /** 3D simplex noise in [-1,1]. Used for solid textures that must tile in depth. */
  simplex3(xin: number, yin: number, zin: number): number {
    const F3 = 1 / 3;
    const G3 = 1 / 6;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const g = Noise.GRAD3;
    let n = 0;
    const corner = (xx: number, yy: number, zz: number, gi: number) => {
      let tt = 0.6 - xx * xx - yy * yy - zz * zz;
      if (tt < 0) return 0;
      tt *= tt;
      const o = gi * 3;
      return tt * tt * (g[o]! * xx + g[o + 1]! * yy + g[o + 2]! * zz);
    };
    n += corner(x0, y0, z0, this.permMod12[ii + this.perm[jj + this.perm[kk]!]!]!);
    n += corner(x1, y1, z1, this.permMod12[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]!]!]!);
    n += corner(x2, y2, z2, this.permMod12[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]!]!]!);
    n += corner(x3, y3, z3, this.permMod12[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]!]!]!);
    return 32 * n;
  }

  // --- Fractal variants ---------------------------------------------------

  /** Fractal Brownian motion — the workhorse for surface detail. Returns ~[-1,1]. */
  fbm(x: number, y: number, octaves = 5, lacunarity = 2.0, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.simplex2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  fbm3(x: number, y: number, z: number, octaves = 4, lacunarity = 2.0, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.simplex3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /**
   * Ridged multifractal — sharp creases. This is what makes rock read as rock
   * instead of as blurry clouds; use it for cave walls, bark, cracked earth.
   */
  ridged(x: number, y: number, octaves = 5, lacunarity = 2.0, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.simplex2(x * freq, y * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Billowy noise — rounded blobs, good for moss, rust blooms, clouds. */
  billow(x: number, y: number, octaves = 4, lacunarity = 2.0, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * Math.abs(this.simplex2(x * freq, y * freq));
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /**
   * Domain-warped fbm. The single highest-value trick for making procedural
   * texture stop looking procedural — it breaks the grid alignment the eye
   * picks up on instantly.
   */
  warp(x: number, y: number, strength = 1.0, octaves = 5): number {
    const qx = this.fbm(x, y, 3);
    const qy = this.fbm(x + 5.2, y + 1.3, 3);
    const rx = this.fbm(x + strength * qx + 1.7, y + strength * qy + 9.2, 3);
    const ry = this.fbm(x + strength * qx + 8.3, y + strength * qy + 2.8, 3);
    return this.fbm(x + strength * rx, y + strength * ry, octaves);
  }

  // --- Cellular -----------------------------------------------------------

  /**
   * Worley/cellular noise. Returns { f1, f2, id } where f1 is the distance to
   * the nearest feature point. `f2 - f1` gives clean cell borders — mortar
   * lines, cracked mud, scales, crystal facets.
   */
  worley(x: number, y: number, jitter = 1.0): { f1: number; f2: number; id: number } {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let f1 = Infinity;
    let f2 = Infinity;
    let id = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const h = this.perm[(cx & 255) + this.perm[cy & 255]!]!;
        const h2 = this.perm[(cx & 255) + this.perm[(cy + 37) & 255]!]!;
        const px = cx + 0.5 + (h / 255 - 0.5) * jitter;
        const py = cy + 0.5 + (h2 / 255 - 0.5) * jitter;
        const ddx = px - x;
        const ddy = py - y;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = h;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return { f1, f2, id };
  }

  /** Voronoi cell-border mask, 0 at borders and 1 at cell centers. */
  cellBorder(x: number, y: number, width = 0.06, jitter = 1.0): number {
    const { f1, f2 } = this.worley(x, y, jitter);
    return smoothstep(0, width, f2 - f1);
  }
}

// --- Free functions ---------------------------------------------------------

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Remap from one range to another without clamping. */
export function remap(v: number, a0: number, a1: number, b0: number, b1: number): number {
  return b0 + ((v - a0) / (a1 - a0 || 1e-6)) * (b1 - b0);
}

/** Map [-1,1] noise output to [0,1]. */
export function unipolar(v: number): number {
  return v * 0.5 + 0.5;
}

/** Cheap deterministic hash for per-pixel grain, no table lookup. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

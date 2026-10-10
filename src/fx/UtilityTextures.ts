/**
 * SLAY — small procedural utility textures for effects.
 *
 * Glow sprites, light shafts, rune rings, spider webs, glowing cracks and the
 * world breakup field. These are masks and sprites, not surfaces, so they stay
 * generated in code. World surfaces come from photo sets (`art/TextureSets`).
 *
 * Owned by vfx. Moved here from the old `art/Textures.ts` painter when ground
 * replaced it with photo textures.
 */

import * as THREE from 'three';
import { clamp01, lerp, smoothstep, hash2 } from '../art/Noise';

// Deterministic helpers. Nothing in this file calls Math.random.

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

function fract(v: number): number {
  return v - Math.floor(v);
}

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

/**
 * World-scale breakup field for environment surfaces.
 *
 * A material texture tiles every two metres, and from the game camera thirty
 * metres of floor is fifteen copies of the same flagstones. No amount of detail
 * inside one tile hides that; what hides it is variation *across* tiles that
 * the tile itself knows nothing about. This is that variation, sampled in world
 * space by world materials at a scale of tens of metres.
 *
 *   R  broad discolouration — big soft patches of lighter and darker stone
 *   G  mid-frequency blotching — stains, wear paths, mineral bloom
 *   B  damp mask — where water sits, so roughness and albedo drop together
 *   A  fine grain — breaks the edge of the other three so none reads as a blob
 *
 * Linear data, tileable by construction, generated once and shared.
 */
export function macroNoiseTexture(size = 256): THREE.DataTexture {
  const key = `macro|${size}`;
  const hit = utilCache.get(key);
  if (hit) return hit;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Domain warp the broad field so patches have organic edges, not
      // value-noise diamonds.
      const wx = vfbm(u * 4, v * 4, 4, 4, 3, 901) - 0.5;
      const wy = vfbm(u * 4 + 7.1, v * 4, 4, 4, 3, 902) - 0.5;
      const broad = vfbm(fract(u + wx * 0.18) * 3, fract(v + wy * 0.18) * 3, 3, 3, 4, 911);
      const blotch = vfbm(fract(u + wy * 0.1) * 8, fract(v + wx * 0.1) * 8, 8, 8, 4, 923);
      const damp = vfbm(fract(u - wx * 0.25) * 5, fract(v - wy * 0.25) * 5, 5, 5, 4, 937);
      const grain = vfbm(u * 32, v * 32, 32, 32, 3, 941);
      // Stretch each to use the full byte range; fBm bunches around 0.5.
      const st = (t: number): number => clamp01((t - 0.5) * 2.1 + 0.5);
      const o = (y * size + x) * 4;
      data[o] = (st(broad) * 255) | 0;
      data[o + 1] = (st(blotch) * 255) | 0;
      data[o + 2] = (st(damp) * 255) | 0;
      data[o + 3] = (st(grain) * 255) | 0;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  utilCache.set(key, tex);
  return tex;
}

/**
 * A spider web on a clear ground: jittered spokes and a spiral, fading out
 * at a ragged circular edge so the card it sits on never shows its corners.
 * White strands in alpha; tint with the material colour. Plain translucent
 * planes read as pale paper squares on the hive floor (w10).
 */
export function webTexture(size = 256, seed = 5): THREE.DataTexture {
  const key = `web|${size}|${seed}`;
  const hit = utilCache.get(key);
  if (hit) return hit;
  const hash = (n: number): number => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const SPOKES = 11;
  const spokes: number[] = [];
  for (let i = 0; i < SPOKES; i++) spokes.push(((i + (hash(i) - 0.5) * 0.5) / SPOKES) * Math.PI * 2);
  const c = (size - 1) / 2;
  const spacing = size * 0.062;
  const half = size * 0.003 + 0.35; // strand half-width in pixels
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const r = Math.sqrt(dx * dx + dy * dy);
      const th = Math.atan2(dy, dx);
      // Ragged rim: the outer radius wanders with angle.
      const rim = c * (0.82 + 0.14 * Math.sin(th * 3 + seed) * Math.sin(th * 5 + seed * 2));
      const fade = clamp01((rim - r) / (c * 0.18));
      let a = 0;
      if (fade > 0) {
        for (const s of spokes) {
          let d = Math.abs(th - s) % (Math.PI * 2);
          if (d > Math.PI) d = Math.PI * 2 - d;
          if (d < Math.PI / 2) a = Math.max(a, clamp01(half + 0.5 - r * Math.sin(d)));
        }
        if (r > size * 0.05) {
          // Archimedean spiral, slightly sagging between spokes.
          const turn = (th + Math.PI) / (Math.PI * 2);
          const k = (r - size * 0.05) / spacing - turn;
          const dr = Math.abs(k - Math.round(k)) * spacing;
          a = Math.max(a, clamp01(half + 0.5 - dr) * 0.85);
        }
        a = (a * 0.9 + 0.04) * fade;
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

/**
 * Glowing cracks: thin meandering seams (contours of tileable noise) on a
 * clear ground, in alpha. Repeats seamlessly. The floor veins were whole
 * additive tiles, so every vein read as a lit square (w10 hive and foundry).
 */
export function crackTexture(size = 256, seed = 23): THREE.DataTexture {
  const key = `crack|${size}|${seed}`;
  const hit = utilCache.get(key);
  if (hit) return hit;
  const data = new Uint8Array(size * size * 4);
  const P = 6; // noise cells across one repeat
  const px = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * P;
      const v = (y / size) * P;
      // Main seams: where the field crosses its midline. Divide by the
      // local slope so the line keeps one width however steep the field.
      const f = (a: number, b: number): number => vfbm(a, b, P, P, 3, seed);
      const n = f(u, v);
      const gx = (f(u + px * P, v) - n) / px;
      const gy = (f(u, v + px * P) - n) / px;
      const slope = Math.max(Math.sqrt(gx * gx + gy * gy), 1e-3);
      const d = (Math.abs(n - 0.5) / slope) * size; // distance in pixels
      const main = clamp01(1.6 - d);
      // Hairline branches off a second field, only near the main seams.
      const m = vfbm(u * 2 + 3.1, v * 2 + 7.7, P * 2, P * 2, 2, seed + 5);
      const branch = clamp01(1 - Math.abs(m - 0.5) * 60) * 0.55 * clamp01(1 - d / 28);
      const a = Math.max(main, branch);
      const o = (y * size + x) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = (a * 255) | 0;
    }
  }
  const tex = finishUtil(key, data, size, true);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function disposeUtilityTextures(): void {
  for (const t of utilCache.values()) t.dispose();
  utilCache.clear();
}

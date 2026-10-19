/**
 * SLAY — the colour lookup grade.
 *
 * AgX tone mapping (`Renderer`) rolls bright light off gently and keeps hues
 * true as they brighten, but leaves the picture soft and a little grey. The
 * look puts the punch back on the finished frame, in screen colour: a gentle
 * S-curve, colour that thins in the deepest shadow and the brightest light as
 * film does, and per biome a few hues nudged toward the place's palette
 * (grass toward teal in a haunted wood, yellows toward ember in hell). All of
 * it is baked into one small 3D table per look and read with a single tap.
 */
import * as THREE from 'three/webgpu';

/** One hue band nudged: where it sits and how wide (degrees), where it moves to, and its colour strength. */
export interface HueNudge {
  at: number;
  width: number;
  shift: number;
  sat: number;
}

export interface Look {
  /** S-curve strength around mid grey: 1 is none. */
  contrast: number;
  /** Overall colour strength. */
  sat: number;
  /** Colour strength left in the deepest shadow and the brightest light (0..1). */
  edgeSat: number;
  /** Lift of the darkest black, 0..0.05: film never quite reaches zero. */
  toe: number;
  hues: HueNudge[];
}

/** The house look: AgX with its punch back. */
export const BASE_LOOK: Look = { contrast: 1.14, sat: 1.12, edgeSat: 0.72, toe: 0.012, hues: [] };

/** Edge length of the table. 32 steps with linear filtering hold smooth gradients. */
export const LUT_SIZE = 32;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smooth S-curve around 0.5 that keeps 0 and 1 fixed. */
function sCurve(v: number, k: number): number {
  if (k === 1) return v;
  const x = clamp01(v);
  const a = Math.pow(x, k);
  return a / (a + Math.pow(1 - x, k));
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

/** Degrees between two hues, signed, -180..180. */
function hueDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** One screen colour through a look. */
export function applyLook(look: Look, r: number, g: number, b: number): [number, number, number] {
  let [h, s, l] = rgbToHsl(r, g, b);
  // Hue nudges, each fading out across its band.
  let dh = 0;
  let ks = 1;
  for (const n of look.hues) {
    const t = Math.abs(hueDelta(h, n.at)) / n.width;
    if (t >= 1) continue;
    const w = (1 - t * t) * (1 - t * t);
    dh += n.shift * w;
    ks *= 1 + (n.sat - 1) * w;
  }
  h += dh;
  // Colour thins toward black and white.
  const edge = 1 - Math.pow(Math.abs(l * 2 - 1), 3);
  s = clamp01(s * look.sat * ks * (look.edgeSat + (1 - look.edgeSat) * edge));
  let [rr, gg, bb] = hslToRgb(h, s, l);
  // Contrast on each channel, then the toe.
  rr = sCurve(rr, look.contrast);
  gg = sCurve(gg, look.contrast);
  bb = sCurve(bb, look.contrast);
  const t = look.toe;
  return [t + rr * (1 - t), t + gg * (1 - t), t + bb * (1 - t)];
}

const tables = new Map<string, THREE.Data3DTexture>();

/** The table for a look, built once and kept. */
export function lookTable(look: Look): THREE.Data3DTexture {
  const key = JSON.stringify(look);
  const have = tables.get(key);
  if (have) return have;
  const N = LUT_SIZE;
  const data = new Uint16Array(N * N * N * 4);
  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const [r, g, b] = applyLook(look, x / (N - 1), y / (N - 1), z / (N - 1));
        const o = (z * N * N + y * N + x) * 4;
        data[o] = THREE.DataUtils.toHalfFloat(r);
        data[o + 1] = THREE.DataUtils.toHalfFloat(g);
        data[o + 2] = THREE.DataUtils.toHalfFloat(b);
        data[o + 3] = THREE.DataUtils.toHalfFloat(1);
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.HalfFloatType;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  tables.set(key, tex);
  return tex;
}

/** A biome's look: the house look with its own changes. */
export function lookOf(over?: Partial<Look>): Look {
  return { ...BASE_LOOK, ...over, hues: over?.hues ?? BASE_LOOK.hues };
}

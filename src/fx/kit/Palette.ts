/**
 * SLAY vfx kit: what each school of damage looks like.
 *
 * The look is dark and gritty, so the rule for colour is simple: magic and
 * fire are the saturated, bright things on screen, and they must never wash
 * out to white. Two habits keep that true:
 *
 *  - Each school has a ramp, not a colour. `core` is the hottest point and is
 *    only ever a few pixels wide; `body` is the colour the eye names; `tail`
 *    is what it cools to; `smoke` is what it leaves hanging in the air.
 *  - Brightness comes from `glow` (an HDR multiplier on the body), applied by
 *    the shaders, and every effect occludes a little of what is behind it
 *    (see `Particles.ts`), so stacked effects converge on their own colour
 *    instead of summing to white.
 *
 * Colours are sRGB hex here; the kit converts them to linear once.
 */

import * as THREE from 'three';
import type { DamageType } from '../../types';

/**
 * What a spell looks like is its school, which is nearly always its damage
 * type. Bone magic deals physical damage but is drawn as bone.
 */
export type School = DamageType | 'bone';

export const SCHOOLS: readonly School[] = ['physical', 'fire', 'cold', 'lightning', 'poison', 'arcane', 'bone'];

export interface SchoolRamp {
  /** Hottest point. Small. */
  core: number;
  /** The colour the eye names. */
  body: number;
  /** What it cools to at the end of its life. */
  tail: number;
  /** What it leaves in the air (alpha-occluding, barely emissive). */
  smoke: number;
  /** Colour of the light it casts on walls. */
  light: number;
  /** HDR multiplier on the body: how far into bloom it reaches. */
  glow: number;
}

export const RAMPS: Record<School, SchoolRamp> = {
  // Steel on bone: hot sparks that cool to orange, dust that hangs.
  physical: { core: 0xfff1d6, body: 0xffa850, tail: 0x803010, smoke: 0x4a4038, light: 0xffb070, glow: 1.6 },
  // Deep orange flame, a yellow heart, red edges, black soot.
  fire: { core: 0xffe08a, body: 0xff6a12, tail: 0xa01800, smoke: 0x1c1410, light: 0xff7a28, glow: 2.4 },
  // Glacial blue, white-cyan heart, deep navy fall-off, pale mist.
  cold: { core: 0xd8f6ff, body: 0x3aa8ff, tail: 0x0c3a8a, smoke: 0x6c8aa0, light: 0x5ab4ff, glow: 2.0 },
  // Violet-blue electric, near-white core, indigo after-glow.
  lightning: { core: 0xeaf0ff, body: 0x6c8cff, tail: 0x2a1aa8, smoke: 0x2a2840, light: 0x8ca8ff, glow: 2.8 },
  // Sickly acid green, yellow-green heart, swamp-dark tail, green fog.
  poison: { core: 0xdcff6a, body: 0x6ad81e, tail: 0x1e5a0a, smoke: 0x2e4a1c, light: 0x7ae030, glow: 1.9 },
  // Royal violet, pink-white heart, deep purple, purple-black haze.
  arcane: { core: 0xffd8ff, body: 0xb040ff, tail: 0x3a0a8a, smoke: 0x24123a, light: 0xb860ff, glow: 2.3 },
  // Old ivory with a sickly green soul-light.
  bone: { core: 0xf4ffe8, body: 0xd8cca8, tail: 0x5a6a3a, smoke: 0x3a3a30, light: 0xc8f0b0, glow: 1.3 },
};

export function ramp(school: School | undefined): SchoolRamp {
  return RAMPS[school ?? 'physical'] ?? RAMPS.physical;
}

/** Rarity colours for drop beams. Mirrors the item label colours. */
export const RARITY_BEAM: Record<string, number> = {
  normal: 0xbfb8a8,
  magic: 0x5a7cff,
  rare: 0xffd23a,
  set: 0x34e05a,
  unique: 0xd8782a,
  gold: 0xffc63a,
};

// ---------------------------------------------------------------------------
// Colour packing
// ---------------------------------------------------------------------------

const _c = new THREE.Color();

/**
 * Packs an sRGB hex colour as linear 8-bit channels into one float, exactly
 * (24 bits fit a float mantissa). Shaders unpack with `unpackRGB`. One float
 * per colour is what keeps a particle at 26 floats instead of 35.
 */
export function packLinear(hex: number): number {
  _c.setHex(hex);
  const r = Math.max(0, Math.min(255, Math.round(_c.r * 255)));
  const g = Math.max(0, Math.min(255, Math.round(_c.g * 255)));
  const b = Math.max(0, Math.min(255, Math.round(_c.b * 255)));
  return r * 65536 + g * 256 + b;
}

/** GLSL to unpack `packLinear`. */
export const GLSL_UNPACK = /* glsl */ `
  vec3 unpackRGB(float v) {
    float r = floor(v / 65536.0);
    float g = floor((v - r * 65536.0) / 256.0);
    float b = v - r * 65536.0 - g * 256.0;
    return vec3(r, g, b) / 255.0;
  }
`;

/** Linear THREE.Color of an sRGB hex, written into `out`. */
export function linear(hex: number, out: THREE.Color): THREE.Color {
  return out.setHex(hex);
}

/**
 * Pushes a tint toward a school's body: a skill's own colour shifts the hue a
 * little but keeps the school's saturation, so no skill ever arrives white.
 */
export function tintToward(hex: number | undefined, school: School): number {
  const r = ramp(school);
  if (hex === undefined) return r.body;
  const hr = (hex >> 16) & 255;
  const hg = (hex >> 8) & 255;
  const hb = hex & 255;
  const max = Math.max(hr, hg, hb);
  const min = Math.min(hr, hg, hb);
  // A near-grey tint (white cores, beige) says nothing about hue: use the body.
  if (max - min < 40) return r.body;
  return hex;
}

/** Mixes two sRGB hex colours. */
export function mixHex(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (s: number): number => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * k) & 255;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Scales an sRGB hex toward black. */
export function darken(hex: number, k: number): number {
  return mixHex(hex, 0x000000, k);
}

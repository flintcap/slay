/**
 * SLAY — the downloaded photo texture sets.
 *
 * Every world surface, and every `surface()` key, is drawn from one of these.
 * They are CC0 scans from Poly Haven and ambientCG, fetched and packed by
 * `tools/fetch-textures.mjs` into `public/assets/textures/world/<name>/`:
 *
 *   albedo.webp    sRGB colour, AO multiplied in at half strength; A = height
 *   normal.webp    OpenGL tangent normal; A = roughness
 *   emissive.webp  sRGB emission (only where `emissive` is set)
 *
 * The files are optional at runtime: until (or unless) one arrives, its
 * texture holds a flat fallback colour close to the set's average, so the
 * world still reads as the right material in the right tone.
 */

import * as THREE from 'three';
import { loadTexture, preloadAssets } from '../core/Assets';

export interface TextureSetInfo {
  /** Real-world width of one texture tile, metres (from the scan's metadata). */
  metres: number;
  /** Linear-light average colour of the albedo, as sRGB hex. Used for tints and fallbacks. */
  avg: number;
  /** The set ships an emission map. */
  emissive?: boolean;
  /** Colourless scan meant to be tinted (cloth, leather, metals, fur, bone). */
  gray?: boolean;
  /** 1024 for world surfaces, 512 for small things. */
  px: 512 | 1024;
}

export const TEXTURE_SETS = {
  // Floors
  slab: { metres: 1.96, avg: 0x8d887e, px: 1024 },
  tiles_worn: { metres: 2.0, avg: 0x4a453a, px: 1024 },
  flagstone: { metres: 1.8, avg: 0x5c554b, px: 1024 },
  flagstone_dark: { metres: 1.8, avg: 0x635345, px: 1024 },
  cobble: { metres: 1.5, avg: 0x7f7460, px: 1024 },
  // Walls
  ashlar: { metres: 2.5, avg: 0x493e2e, px: 1024 },
  rubble_wall: { metres: 2.0, avg: 0x746d5c, px: 1024 },
  brick_red: { metres: 2.5, avg: 0x5e412e, px: 1024 },
  mossy_wall: { metres: 2.0, avg: 0x514735, px: 1024 },
  sandstone: { metres: 3.0, avg: 0xa39172, px: 1024 },
  plaster: { metres: 1.85, avg: 0x938474, px: 1024 },
  // Natural rock
  cliff: { metres: 1.83, avg: 0x7c5433, px: 1024 },
  cave: { metres: 2.38, avg: 0x604531, px: 1024 },
  basalt: { metres: 2.42, avg: 0x1f1b17, px: 1024 },
  obsidian: { metres: 2.0, avg: 0x141d20, px: 1024 },
  lava_crust: { metres: 2.0, avg: 0x593b3d, emissive: true, px: 1024 },
  lava: { metres: 2.0, avg: 0xb04830, emissive: true, px: 512 },
  ice: { metres: 2.0, avg: 0x698075, px: 1024 },
  // Terrain
  snow: { metres: 2.0, avg: 0x818082, px: 1024 },
  dirt: { metres: 3.15, avg: 0x665743, px: 1024 },
  tracks: { metres: 2.25, avg: 0x472a19, px: 1024 },
  stony_dirt: { metres: 2.17, avg: 0x4c3c2d, px: 1024 },
  path: { metres: 2.0, avg: 0x7b6d5b, px: 1024 },
  mud: { metres: 1.3, avg: 0x484034, px: 1024 },
  grass: { metres: 2.0, avg: 0x6f674a, px: 1024 },
  leaves: { metres: 3.0, avg: 0x796239, px: 1024 },
  roots: { metres: 1.67, avg: 0x69573f, px: 1024 },
  sand: { metres: 1.5, avg: 0x9b8c68, px: 1024 },
  cracked: { metres: 1.5, avg: 0xb99875, px: 1024 },
  ash: { metres: 1.0, avg: 0x584e43, px: 1024 },
  // Built things
  planks: { metres: 2.0, avg: 0x5b4f42, px: 1024 },
  rust: { metres: 2.2, avg: 0x623a20, px: 1024 },
  bark: { metres: 1.0, avg: 0x514a39, px: 1024 },
  // Small things
  iron: { metres: 2.0, avg: 0x9c9c9c, gray: true, px: 512 },
  steel: { metres: 1.0, avg: 0x9e9e9e, gray: true, px: 512 },
  chainmail: { metres: 0.5, avg: 0xb9b9b9, gray: true, px: 512 },
  cloth: { metres: 0.5, avg: 0x9b9b9b, gray: true, px: 512 },
  leather: { metres: 0.3, avg: 0x949494, gray: true, px: 512 },
  wood: { metres: 0.5, avg: 0x615a50, px: 512 },
  fur: { metres: 0.5, avg: 0x8d8d8d, gray: true, px: 512 },
  bone: { metres: 1.0, avg: 0xa0a0a0, gray: true, px: 512 },
  flesh: { metres: 1.0, avg: 0x87433d, px: 512 },
  moss: { metres: 1.0, avg: 0x384d15, px: 512 },
} satisfies Record<string, TextureSetInfo>;

export type TextureSetName = keyof typeof TEXTURE_SETS;

export function isTextureSet(name: string): name is TextureSetName {
  return Object.prototype.hasOwnProperty.call(TEXTURE_SETS, name);
}

export function setInfo(name: TextureSetName): TextureSetInfo {
  return TEXTURE_SETS[name];
}

export interface SetTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  emissive: THREE.Texture | null;
}

const resident = new Map<TextureSetName, SetTextures>();
let anisotropy = 4;

function file(name: TextureSetName, map: 'albedo' | 'normal' | 'emissive'): string {
  return `textures/world/${name}/${map}.webp`;
}

/** The set's textures, shared. They hold a flat fallback until the files decode. */
export function setTextures(name: TextureSetName): SetTextures {
  const hit = resident.get(name);
  if (hit) return hit;
  const info: TextureSetInfo = TEXTURE_SETS[name];
  const albedo = loadTexture(file(name, 'albedo'), { srgb: true, fallback: info.avg, fallbackAlpha: 128, anisotropy });
  // Flat normal, mid roughness.
  const normal = loadTexture(file(name, 'normal'), { srgb: false, fallback: 0x8080ff, fallbackAlpha: 200, anisotropy });
  const emissive = info.emissive ? loadTexture(file(name, 'emissive'), { srgb: true, fallback: 0x000000, anisotropy }) : null;
  const out = { albedo, normal, emissive };
  resident.set(name, out);
  return out;
}

export function setTextureAnisotropy(n: number): void {
  anisotropy = n;
}

/** Every file a set needs, for the preloader. */
export function setFiles(names: readonly TextureSetName[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    out.push(file(n, 'albedo'), file(n, 'normal'));
    if ((TEXTURE_SETS[n] as TextureSetInfo).emissive) out.push(file(n, 'emissive'));
  }
  return out;
}

/** Fetch and decode sets ahead of use (boot bar, loading card). Never rejects. */
export function preloadSets(
  names: readonly TextureSetName[],
  label = 'Loading textures',
  onProgress?: (p: number, label: string) => void,
): Promise<{ ok: number; missing: string[] }> {
  return preloadAssets(setFiles(names), label, onProgress);
}

export function allSetNames(): TextureSetName[] {
  return Object.keys(TEXTURE_SETS) as TextureSetName[];
}

/**
 * SLAY — the material library.
 *
 * One shared, cached `MeshStandardMaterial` per (palette, tweak) combination.
 * Materials are the single most duplicated resource in a scene, so everything
 * here is aggressively shared: a dungeon with ten thousand wall segments should
 * hold three materials, not ten thousand.
 *
 * Maps are packed glTF-style: one RGBA texture carries ambient occlusion in R,
 * roughness in G and metalness in B, and is bound to all three map slots. That
 * is one GPU upload instead of three and one sampler fetch instead of three.
 *
 * Callers must treat the result of `surface()` as immutable — it is shared.
 * `surfaceVariant()` hands back a private clone that is safe to mutate.
 */

import * as THREE from 'three';
import {
  getTextureSet,
  radialGlowTexture,
  runeRingTexture,
  beamTexture,
  setTextureAnisotropy,
  setDefaultTextureSize,
  clearTextureCache,
  isBaked,
  type TextureSet,
} from './Textures';
import { resolvePalette, paletteKeyList, WARM_SET, type Palette } from './Palettes';

export interface SurfaceOpts {
  /** World-space texture repeat. */
  repeat?: number;
  /** Multiplicative colour tint. */
  tint?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** 0..2, scales normal map strength. */
  bump?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** Texture resolution override; defaults to the global setting. */
  size?: number;
  /** Per-instance texture seed — two walls of the same stone, different rock. */
  seed?: number;
  /** Disables shadow casting hints and vertex colours for cheap props. */
  flatShading?: boolean;
  /** Enables per-vertex colour modulation (used by instanced dungeon meshes). */
  vertexColors?: boolean;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const surfaceCache = new Map<string, THREE.MeshStandardMaterial>();
const emissiveCache = new Map<string, THREE.MeshStandardMaterial>();
const miscCache = new Map<string, THREE.Material>();

function optsKey(pal: Palette, o: SurfaceOpts): string {
  return [
    pal.key,
    o.seed ?? 0,
    o.size ?? 0,
    o.repeat ?? pal.repeat ?? 1,
    o.tint ?? 0xffffff,
    o.roughness ?? -1,
    o.metalness ?? -1,
    o.emissive ?? -1,
    o.emissiveIntensity ?? -1,
    o.bump ?? 1,
    o.transparent ? 1 : 0,
    o.opacity ?? 1,
    o.side ?? THREE.FrontSide,
    o.flatShading ? 1 : 0,
    o.vertexColors ? 1 : 0,
  ].join('|');
}

function applySet(mat: THREE.MeshStandardMaterial, set: TextureSet, pal: Palette, o: SurfaceOpts): void {
  mat.map = set.albedo;
  mat.normalMap = set.normal;
  // One texture, three roles. aoMap defaults to UV channel 0 in three r15x+,
  // so no second UV set is required.
  mat.aoMap = set.orm;
  mat.roughnessMap = set.orm;
  mat.metalnessMap = set.orm;
  mat.aoMapIntensity = 1.0;

  // The scalar multiplies the map, so 1.0 lets the baked values through
  // untouched. An explicit opts value scales the whole surface.
  mat.roughness = o.roughness ?? 1.0;
  mat.metalness = o.metalness ?? 1.0;

  // Normal maps were bound at full strength. On a floor tiled ten times across
  // the view that reads as a rippling liquid rather than surface relief, so the
  // default is pulled well back; callers can still push it up per surface.
  const bump = (o.bump ?? 1) * 0.55;
  mat.normalScale = new THREE.Vector2(bump, bump);

  if (set.emissive || pal.emissive !== undefined) {
    const col = o.emissive ?? pal.emissive;
    if (col !== undefined) {
      mat.emissive = new THREE.Color(col);
      mat.emissiveIntensity = o.emissiveIntensity ?? pal.emissiveIntensity ?? 0.6;
      if (set.emissive) mat.emissiveMap = set.emissive;
    }
  } else if (o.emissive !== undefined) {
    mat.emissive = new THREE.Color(o.emissive);
    mat.emissiveIntensity = o.emissiveIntensity ?? 1;
  }

  mat.color = new THREE.Color(o.tint ?? 0xffffff);
  mat.envMapIntensity = pal.family === 'metal' ? 1.35 : 1.0;
  if (pal.sheen !== undefined) {
    // Standard material has no sheen term; approximate the effect by lifting
    // the environment response, which is what a satin surface actually does.
    mat.envMapIntensity += pal.sheen * 0.6;
  }
  mat.side = o.side ?? THREE.FrontSide;
  mat.flatShading = o.flatShading ?? false;
  mat.vertexColors = o.vertexColors ?? false;
  if (o.transparent) {
    mat.transparent = true;
    mat.opacity = o.opacity ?? 1;
    mat.depthWrite = (o.opacity ?? 1) > 0.95;
  }
  mat.userData.paletteKey = pal.key;
  mat.userData.shared = true;
  mat.needsUpdate = true;
}

function buildSurface(key: string, o: SurfaceOpts): THREE.MeshStandardMaterial {
  const pal = resolvePalette(key);
  const set = getTextureSet(pal.key, {
    seed: o.seed ?? 0,
    size: o.size,
    repeat: o.repeat ?? pal.repeat ?? 1,
  });
  const mat = new THREE.MeshStandardMaterial({ name: `surface:${pal.key}` });
  applySet(mat, set, pal, o);
  return mat;
}

/**
 * The shared material for a palette. `key` is a palette name such as
 * 'stone.crypt', 'metal.iron', 'wood.oak', 'cloth.linen', 'flesh.rotted',
 * 'crystal.void'. Unknown keys resolve to the closest authored surface rather
 * than failing — see `Palettes.resolvePalette`.
 *
 * Never mutate the result; call `surfaceVariant` for a tweaked copy.
 */
export function surface(key: string, opts: SurfaceOpts = {}): THREE.MeshStandardMaterial {
  const pal = resolvePalette(key);
  const ck = optsKey(pal, opts);
  const hit = surfaceCache.get(ck);
  if (hit) return hit;
  const mat = buildSurface(pal.key, opts);
  const evict = (): void => {
    if (surfaceCache.get(ck) === mat) surfaceCache.delete(ck);
  };
  mat.addEventListener('dispose', evict);
  surfaceCache.set(ck, mat);
  return mat;
}

/**
 * A private, mutable copy. Textures are still shared — only the material
 * object is new — so this stays cheap enough to call per boss or per unique
 * item. The caller owns disposal.
 */
export function surfaceVariant(key: string, opts: SurfaceOpts): THREE.MeshStandardMaterial {
  const pal = resolvePalette(key);
  const set = getTextureSet(pal.key, {
    seed: opts.seed ?? 0,
    size: opts.size,
    repeat: opts.repeat ?? pal.repeat ?? 1,
  });
  const mat = new THREE.MeshStandardMaterial({ name: `variant:${pal.key}` });
  applySet(mat, set, pal, opts);
  mat.userData.shared = false;
  return mat;
}

export function paletteKeys(): string[] {
  return paletteKeyList();
}

/** Emissive/animated materials for magic, lava, runes and enchanted trim. */
export function emissiveMaterial(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  const ck = `${color}|${intensity}`;
  const hit = emissiveCache.get(ck);
  if (hit) return hit;
  const c = new THREE.Color(color);
  // Keep a dark, saturated base albedo: the light should come from the
  // emissive term, not from an unlit white surface that bloom cannot separate.
  const base = c.clone().multiplyScalar(0.14);
  const mat = new THREE.MeshStandardMaterial({
    name: `emissive:${color.toString(16)}`,
    color: base,
    emissive: c,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0.0,
    toneMapped: true,
  });
  mat.userData.shared = true;
  const evict = (): void => {
    if (emissiveCache.get(ck) === mat) emissiveCache.delete(ck);
  };
  mat.addEventListener('dispose', evict);
  emissiveCache.set(ck, mat);
  return mat;
}

// ---------------------------------------------------------------------------
// Specialist materials used by the model builders
// ---------------------------------------------------------------------------

/**
 * A faceted gemstone. Physical material so it gets real transmission and a
 * clearcoat — gems are the one place where the extra shader cost pays for
 * itself, and there are only ever a handful on screen.
 */
export function gemMaterial(color: number, opts: { glow?: number; rough?: number } = {}): THREE.MeshPhysicalMaterial {
  const ck = `gem|${color}|${opts.glow ?? 0}|${opts.rough ?? 0.06}`;
  const hit = miscCache.get(ck);
  if (hit) return hit as THREE.MeshPhysicalMaterial;
  const c = new THREE.Color(color);
  const mat = new THREE.MeshPhysicalMaterial({
    name: `gem:${color.toString(16)}`,
    color: c.clone().multiplyScalar(0.55),
    emissive: c,
    emissiveIntensity: opts.glow ?? 0.35,
    roughness: opts.rough ?? 0.06,
    metalness: 0.0,
    transmission: 0.55,
    thickness: 0.35,
    ior: 1.9,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.92,
  });
  mat.userData.shared = true;
  miscCache.set(ck, mat);
  return mat;
}

/** Additive, unlit, depth-read-only — light shafts, rune glows, aura shells. */
export function additiveMaterial(
  color: number,
  opts: { map?: THREE.Texture; opacity?: number; side?: THREE.Side } = {},
): THREE.MeshBasicMaterial {
  const ck = `add|${color}|${opts.map?.uuid ?? 'none'}|${opts.opacity ?? 1}|${opts.side ?? THREE.DoubleSide}`;
  const hit = miscCache.get(ck);
  if (hit) return hit as THREE.MeshBasicMaterial;
  const mat = new THREE.MeshBasicMaterial({
    name: `additive:${color.toString(16)}`,
    color: new THREE.Color(color),
    map: opts.map ?? null,
    transparent: true,
    opacity: opts.opacity ?? 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: opts.side ?? THREE.DoubleSide,
    toneMapped: true,
  });
  mat.userData.shared = true;
  miscCache.set(ck, mat);
  return mat;
}

/** The vertical rarity shaft over a ground drop. */
export function beamMaterial(color: number): THREE.MeshBasicMaterial {
  return additiveMaterial(color, { map: beamTexture(), opacity: 0.55, side: THREE.DoubleSide });
}

/** A glowing rune decal, for high-rarity gear and caster telegraphs. */
export function runeMaterial(color: number, seed = 11): THREE.MeshBasicMaterial {
  return additiveMaterial(color, { map: runeRingTexture(256, seed), opacity: 0.9, side: THREE.DoubleSide });
}

/** A soft round glow billboard. */
export function glowSpriteMaterial(color: number, opacity = 0.8): THREE.SpriteMaterial {
  const ck = `sprite|${color}|${opacity}`;
  const hit = miscCache.get(ck);
  if (hit) return hit as THREE.SpriteMaterial;
  const mat = new THREE.SpriteMaterial({
    map: radialGlowTexture(),
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  mat.userData.shared = true;
  miscCache.set(ck, mat);
  return mat;
}

// ---------------------------------------------------------------------------
// Quality + warm-up
// ---------------------------------------------------------------------------

/** Wire the renderer's quality profile into the texture baker. */
export function applyMaterialQuality(quality: { anisotropy: number; textureSize?: number }): void {
  setTextureAnisotropy(quality.anisotropy);
  if (quality.textureSize) setDefaultTextureSize(quality.textureSize);
}

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

const WARM_LABELS: Record<string, string> = {
  'stone.crypt': 'Cutting crypt stone…',
  'stone.cavern': 'Hollowing the caverns…',
  'stone.town': 'Laying the town walls…',
  'ground.cobble': 'Setting cobbles…',
  'ground.dirt': 'Packing the earth…',
  'metal.iron': 'Beating iron…',
  'metal.steel': 'Folding steel…',
  'metal.gold': 'Gilding…',
  'metal.dark': 'Blackening the plate…',
  'wood.oak': 'Sawing oak…',
  'cloth.linen': 'Weaving linen…',
  'cloth.tattered': 'Tearing the shrouds…',
  'leather.worn': 'Curing leather…',
  'bone.pale': 'Bleaching bone…',
  'crystal.arcane': 'Growing arcane crystal…',
  'flesh.rotted': 'Something is rotting…',
};

/**
 * Front-loads texture generation onto the boot bar. Bakes the surfaces a first
 * dungeon and the town are guaranteed to touch, yielding to the browser between
 * each so the progress bar actually animates instead of freezing at 34%.
 */
export async function warmMaterials(onProgress: (p: number, label: string) => void): Promise<void> {
  const keys = WARM_SET.slice();
  const total = keys.length + 2;
  let done = 0;

  for (const key of keys) {
    const label = WARM_LABELS[key] ?? `Weaving ${key.replace('.', ' ')}…`;
    onProgress(done / total, label);
    await nextFrame();
    // Touching `surface` bakes the whole coordinated PBR set for the palette.
    surface(key);
    done++;
  }

  onProgress(done / total, 'Kindling the runes…');
  await nextFrame();
  radialGlowTexture();
  beamTexture();
  runeRingTexture();
  emissiveMaterial(0xffa040, 1.8);
  emissiveMaterial(0x6f8cff, 1.6);
  done++;

  onProgress(done / total, 'Polishing…');
  await nextFrame();
  // Pre-create the rarity beam materials so the first drop does not hitch.
  for (const c of [0xc8c8c8, 0x6f8cff, 0xf5d76e, 0x33d64a, 0xb8874a, 0xc060ff, 0xff5a33]) {
    beamMaterial(c);
  }
  done++;

  onProgress(1, 'Materials ready');
}

/** True when a palette's textures are already resident. */
export function isWarm(key: string): boolean {
  return isBaked(key);
}

/** Drop every cached material and texture. Used when quality changes. */
export function disposeMaterials(): void {
  for (const m of surfaceCache.values()) m.dispose();
  for (const m of emissiveCache.values()) m.dispose();
  for (const m of miscCache.values()) m.dispose();
  surfaceCache.clear();
  emissiveCache.clear();
  miscCache.clear();
  clearTextureCache();
}

/** Counts for the debug overlay. */
export function materialStats(): { surfaces: number; emissives: number; misc: number } {
  return { surfaces: surfaceCache.size, emissives: emissiveCache.size, misc: miscCache.size };
}

/**
 * SLAY — the material library.
 *
 * Every surface is a photographed CC0 texture set (`TextureSets.ts`) worn the
 * way its key says (`SurfaceLibrary.ts`): tinted toward a target colour, its
 * scanned roughness stretched over a range, a metalness, a relief strength and
 * sometimes a glow.
 *
 * `surface(key)` hands back one shared, cached `MeshStandardMaterial` per
 * (key, tweak) combination; treat it as immutable. `surfaceVariant()` gives a
 * private copy that is safe to change. Both share the same textures.
 *
 * The packed layout (albedo + height in alpha, normal + roughness in alpha)
 * needs a small shader patch, attached here to materials this module creates
 * and owns. Code elsewhere must still never attach `onBeforeCompile` to a
 * `surface()` result: clone it first.
 *
 * World geometry (floors, walls, terrain) does not use these: it uses
 * `WorldMaterial.ts`, which maps the same sets in world space.
 */

import * as THREE from 'three';
import {
  radialGlowTexture,
  runeRingTexture,
  beamTexture,
} from '../fx/UtilityTextures';
import { resolveSurface, surfaceKeys, surfaceBaseColor, type SurfaceDef } from './SurfaceLibrary';
import { setTextures, setTextureAnisotropy, preloadSets, TEXTURE_SETS, type TextureSetName } from './TextureSets';
import { setAssetAnisotropy } from '../core/Assets';

export { surfaceBaseColor };

export interface SurfaceOpts {
  /** Texture repeat across the model's UVs. */
  repeat?: number;
  /** Multiplicative colour tint. */
  tint?: number;
  /** Scales the surface's roughness. */
  roughness?: number;
  /** Overrides the surface's metalness. */
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** 0..2, scales normal map strength. */
  bump?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** Accepted for old callers; the photo sets have one resolution each. */
  size?: number;
  /** Accepted for old callers: shifts the texture so two copies do not line up. */
  seed?: number;
  flatShading?: boolean;
  /** Per-vertex colour modulation (instanced and baked meshes). */
  vertexColors?: boolean;
}

// ---------------------------------------------------------------------------
// The shader patch for packed sets
// ---------------------------------------------------------------------------

/**
 * Albedo alpha is height and normal alpha is roughness, so three's stock
 * chunks would read height as opacity and ignore the roughness. The patch
 * also applies the repeat in the shader, so every material can share one
 * texture object per file instead of cloning textures to change `repeat`.
 */
function patchPacked(mat: THREE.MeshStandardMaterial, uniforms: Record<string, THREE.IUniform>): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 slRough;\nuniform vec3 slUv;\nuniform float slCav;')
      .replace(
        '#include <map_fragment>',
        [
          '#ifdef USE_MAP',
          '  vec4 slAlb = texture2D( map, vMapUv * slUv.x + slUv.yz );',
          '  diffuseColor.rgb *= slAlb.rgb;',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <roughnessmap_fragment>',
        [
          'float roughnessFactor = roughness;',
          '#ifdef USE_NORMALMAP_TANGENTSPACE',
          '  vec4 slNrm = texture2D( normalMap, vNormalMapUv * slUv.x + slUv.yz );',
          '  roughnessFactor *= mix( slRough.x, slRough.y, slNrm.a );',
          '#else',
          '  roughnessFactor *= slRough.y;',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <normal_fragment_maps>',
        [
          '#ifdef USE_NORMALMAP_TANGENTSPACE',
          '  vec3 mapN = slNrm.xyz * 2.0 - 1.0;',
          '  mapN.xy *= normalScale;',
          '  normal = normalize( tbn * mapN );',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <emissivemap_fragment>',
        [
          '#ifdef USE_EMISSIVEMAP',
          '  totalEmissiveRadiance *= texture2D( emissiveMap, vEmissiveMapUv * slUv.x + slUv.yz ).rgb;',
          '#elif defined( USE_MAP )',
          // No emission map: the glow sits in the cracks and hollows of the relief.
          '  float slC = 1.0 - slAlb.a;',
          '  totalEmissiveRadiance *= mix( 1.0, slC * slC * slC * 2.0, slCav );',
          '#endif',
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => 'slayPacked';
}

/** Linear-light tint that moves the scan's average colour onto the surface's target. */
function surfaceTint(def: SurfaceDef, extra?: number): THREE.Color {
  const out = new THREE.Color(1, 1, 1);
  const info = TEXTURE_SETS[def.set];
  if (def.base !== undefined) {
    const avg = new THREE.Color(info.avg);
    const base = new THREE.Color(def.base);
    const k = def.tintAmount ?? ('gray' in info && info.gray ? 1 : 0.6);
    out.setRGB(
      1 + (base.r / Math.max(avg.r, 0.004) - 1) * k,
      1 + (base.g / Math.max(avg.g, 0.004) - 1) * k,
      1 + (base.b / Math.max(avg.b, 0.004) - 1) * k,
    );
  }
  if (extra !== undefined) out.multiply(new THREE.Color(extra));
  return out;
}

function buildSurface(def: SurfaceDef, o: SurfaceOpts, name: string): THREE.MeshStandardMaterial {
  const tex = setTextures(def.set);
  const mat = new THREE.MeshStandardMaterial({ name });
  mat.map = tex.albedo;
  mat.normalMap = tex.normal;
  const bump = (o.bump ?? 1) * def.bump * 0.85;
  mat.normalScale = new THREE.Vector2(bump, bump);
  mat.color = surfaceTint(def, o.tint);
  mat.roughness = o.roughness ?? 1;
  mat.metalness = o.metalness ?? def.metal;
  const emissive = o.emissive ?? def.emissive;
  if (emissive !== undefined) {
    mat.emissive = new THREE.Color(emissive);
    mat.emissiveIntensity = o.emissiveIntensity ?? def.emissiveIntensity ?? 0.6;
    if (tex.emissive) mat.emissiveMap = tex.emissive;
  }
  mat.envMapIntensity = def.metal > 0.5 ? 1.35 : 1.0;
  mat.side = o.side ?? THREE.FrontSide;
  mat.flatShading = o.flatShading ?? false;
  mat.vertexColors = o.vertexColors ?? false;
  if (o.transparent) {
    mat.transparent = true;
    mat.opacity = o.opacity ?? 1;
    mat.depthWrite = (o.opacity ?? 1) > 0.95;
  }
  const seed = o.seed ?? 0;
  const uniforms = {
    slRough: { value: new THREE.Vector2(def.rough[0], def.rough[1]) },
    slCav: { value: o.emissive === undefined && !tex.emissive ? 1 : 0 },
    slUv: { value: new THREE.Vector3(o.repeat ?? 1, ((seed * 0.6180339) % 1 + 1) % 1, ((seed * 0.7548776) % 1 + 1) % 1) },
  };
  mat.userData.slay = uniforms;
  mat.userData.paletteKey = def.key;
  patchPacked(mat, uniforms);
  return mat;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const surfaceCache = new Map<string, THREE.MeshStandardMaterial>();
const emissiveCache = new Map<string, THREE.MeshStandardMaterial>();
const miscCache = new Map<string, THREE.Material>();

function optsKey(def: SurfaceDef, o: SurfaceOpts): string {
  return [
    def.key,
    o.seed ?? 0,
    o.repeat ?? 1,
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

/**
 * The shared material for a surface key such as 'stone.crypt', 'metal.iron',
 * 'wood.oak', 'cloth.linen', 'flesh.rotted', 'crystal.void'. Unknown keys
 * resolve to the closest authored surface rather than failing.
 *
 * Never mutate the result; call `surfaceVariant` for a tweaked copy.
 */
export function surface(key: string, opts: SurfaceOpts = {}): THREE.MeshStandardMaterial {
  const def = resolveSurface(key);
  const ck = optsKey(def, opts);
  const hit = surfaceCache.get(ck);
  if (hit) return hit;
  const mat = buildSurface(def, opts, `surface:${def.key}`);
  // Marks it as belonging to the cache, not to whoever asked for it. Object
  // teardown checks this before freeing anything.
  mat.userData.shared = true;
  const evict = (): void => {
    if (surfaceCache.get(ck) === mat) surfaceCache.delete(ck);
  };
  mat.addEventListener('dispose', evict);
  surfaceCache.set(ck, mat);
  return mat;
}

/**
 * A private, mutable copy. Textures are still shared, only the material
 * object is new, so this stays cheap enough to call per boss or per unique
 * item. The caller owns disposal.
 */
export function surfaceVariant(key: string, opts: SurfaceOpts): THREE.MeshStandardMaterial {
  const def = resolveSurface(key);
  const mat = buildSurface(def, opts, `variant:${def.key}`);
  mat.userData.shared = false;
  return mat;
}

export function paletteKeys(): string[] {
  return surfaceKeys();
}

/** The texture set a key is drawn from. */
export function surfaceSet(key: string): TextureSetName {
  return resolveSurface(key).set;
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
 * clearcoat: gems are the one place where the extra shader cost pays for
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

/** Additive, unlit, depth-read-only: light shafts, rune glows, aura shells. */
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

/** Wire the renderer's quality profile into the texture loader. */
export function applyMaterialQuality(quality: { anisotropy: number }): void {
  setTextureAnisotropy(quality.anisotropy);
  setAssetAnisotropy(quality.anisotropy);
}

/**
 * The sets a first dungeon, the town and the hero are guaranteed to touch.
 * Everything else streams in on demand behind its fallback colour.
 */
const BOOT_SETS: TextureSetName[] = [
  'slab', 'ashlar', 'flagstone', 'cobble', 'dirt', 'path', 'grass', 'mud', 'plaster', 'planks', 'rubble_wall',
  'iron', 'steel', 'chainmail', 'cloth', 'leather', 'wood', 'fur', 'bone', 'flesh', 'ice', 'cave',
];

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * Front-loads the boot set onto the boot bar: fetches and decodes every file,
 * then builds the materials the first scenes use so the first frame does not
 * hitch. A missing file is not an error; its fallback colour stands in.
 */
export async function warmMaterials(onProgress: (p: number, label: string) => void): Promise<void> {
  const labels = ['Quarrying stone…', 'Packing the earth…', 'Beating iron…', 'Weaving cloth…', 'Curing leather…'];
  await preloadSets(BOOT_SETS, 'Textures', (p) => {
    onProgress(p * 0.9, labels[Math.min(labels.length - 1, Math.floor(p * labels.length))]!);
  });
  for (const set of BOOT_SETS) setTextures(set);
  onProgress(0.92, 'Kindling the runes…');
  await nextFrame();
  radialGlowTexture();
  beamTexture();
  runeRingTexture();
  emissiveMaterial(0xffa040, 1.8);
  emissiveMaterial(0x6f8cff, 1.6);
  // Pre-create the rarity beam materials so the first drop does not hitch.
  for (const c of [0xc8c8c8, 0x6f8cff, 0xf5d76e, 0x33d64a, 0xb8874a, 0xc060ff, 0xff5a33]) beamMaterial(c);
  onProgress(1, 'Materials ready');
}

/** Drop every cached material. Textures stay resident in the asset cache. */
export function disposeMaterials(): void {
  for (const m of surfaceCache.values()) m.dispose();
  for (const m of emissiveCache.values()) m.dispose();
  for (const m of miscCache.values()) m.dispose();
  surfaceCache.clear();
  emissiveCache.clear();
  miscCache.clear();
}

/** Counts for the debug overlay. */
export function materialStats(): { surfaces: number; emissives: number; misc: number } {
  return { surfaces: surfaceCache.size, emissives: emissiveCache.size, misc: miscCache.size };
}

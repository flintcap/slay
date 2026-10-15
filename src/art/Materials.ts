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
 * needs its own shader nodes, attached here to materials this module creates
 * and owns. Code elsewhere must never change the nodes of a `surface()`
 * result: take a `surfaceVariant()` instead.
 *
 * World geometry (floors, walls, terrain) does not use these: it uses
 * `WorldMaterial.ts`, which maps the same sets in world space.
 */

import * as THREE from 'three/webgpu';
import { mix, normalMap, texture, uv } from 'three/tsl';
import { asStandard, matColor, matFloat, matTexture, matVec2, type F, type V3 } from '../core/Tsl';
import {
  radialGlowTexture,
  runeRingTexture,
} from '../fx/UtilityTextures';
import { resolveSurface, surfaceBaseColor, type SurfaceDef } from './SurfaceLibrary';
import { setTextures, preloadSets, TEXTURE_SETS, type TextureSetName } from './TextureSets';

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
 * material would read height as opacity and ignore the roughness. These
 * nodes read the packed layout, and apply the repeat in the shader, so every
 * material can share one texture object per file instead of cloning
 * textures to change `repeat`.
 */
interface SurfaceGraph {
  color: V3;
  roughness: F;
  normal: V3;
  emissive: V3 | null;
}

/**
 * One graph per way a surface glows (from its own map, from its hollows, or
 * not at all), shared by every surface. Maps come from the material's own
 * `map`, `normalMap` and `emissiveMap`, and the rest from `sl*` properties,
 * so all surfaces of a kind are one shader build.
 */
const surfaceGraphs = new Map<string, SurfaceGraph>();

function surfaceGraph(tex: { albedo: THREE.Texture; normal: THREE.Texture; emissive: THREE.Texture | null }, cav: number): SurfaceGraph {
  const key = tex.emissive ? 'map' : cav > 0 ? 'cav' : 'none';
  const hit = surfaceGraphs.get(key);
  if (hit) return hit;
  const rough = matVec2('slSurfRough');
  const xf = matColor('slSurfUv');
  const st = uv().mul(xf.x).add(xf.yz);
  const alb = texture(matTexture('map', tex.albedo), st);
  const nrm = texture(matTexture('normalMap', tex.normal), st);
  const glow = matColor('emissive').mul(matFloat('emissiveIntensity'));
  let emissive: V3 | null = null;
  if (tex.emissive) {
    emissive = glow.mul(texture(matTexture('emissiveMap', tex.emissive), st).rgb);
  } else if (cav > 0) {
    // No emission map: the glow sits in the cracks and hollows of the relief.
    const c = alb.a.oneMinus();
    emissive = glow.mul(c.mul(c).mul(c).mul(2.0));
  }
  const graph: SurfaceGraph = {
    color: matColor('color').mul(alb.rgb),
    roughness: matFloat('roughness').mul(mix(rough.x, rough.y, nrm.a)),
    normal: normalMap(nrm, matVec2('normalScale')) as unknown as V3,
    emissive,
  };
  surfaceGraphs.set(key, graph);
  return graph;
}

/**
 * Albedo alpha is height and normal alpha is roughness, so three's stock
 * material would read height as opacity and ignore the roughness. These
 * nodes read the packed layout, and apply the repeat in the shader, so every
 * material can share one texture object per file instead of cloning
 * textures to change `repeat`.
 */
function patchPacked(
  mat: THREE.MeshStandardNodeMaterial,
  tex: { albedo: THREE.Texture; normal: THREE.Texture; emissive: THREE.Texture | null },
  rough: THREE.Vector2,
  uvXf: THREE.Vector3,
  cav: number,
): void {
  // The repeat and offset ride as a colour (three numbers) for the shared graph.
  Object.assign(mat, { slSurfRough: rough, slSurfUv: new THREE.Color(uvXf.x, uvXf.y, uvXf.z) });
  const g = surfaceGraph(tex, cav);
  mat.colorNode = g.color;
  mat.roughnessNode = g.roughness;
  mat.normalNode = g.normal;
  if (g.emissive) mat.emissiveNode = g.emissive;
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
  const mat = new THREE.MeshStandardNodeMaterial({ name });
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
  mat.userData.paletteKey = def.key;
  patchPacked(
    mat,
    tex,
    new THREE.Vector2(def.rough[0], def.rough[1]),
    new THREE.Vector3(o.repeat ?? 1, ((seed * 0.6180339) % 1 + 1) % 1, ((seed * 0.7548776) % 1 + 1) % 1),
    o.emissive === undefined && !tex.emissive ? 1 : 0,
  );
  return asStandard(mat);
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
    // Added light sums the same in any order: one pass, not back then front.
    forceSinglePass: true,
    toneMapped: true,
  });
  mat.userData.shared = true;
  miscCache.set(ck, mat);
  return mat;
}

/** A glowing rune decal, for high-rarity gear and caster telegraphs. */
export function runeMaterial(color: number, seed = 11): THREE.MeshBasicMaterial {
  return additiveMaterial(color, { map: runeRingTexture(256, seed), opacity: 0.9, side: THREE.DoubleSide });
}

// ---------------------------------------------------------------------------
// Quality + warm-up
// ---------------------------------------------------------------------------

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
  runeRingTexture();
  emissiveMaterial(0xffa040, 1.8);
  emissiveMaterial(0x6f8cff, 1.6);
  onProgress(1, 'Materials ready');
}

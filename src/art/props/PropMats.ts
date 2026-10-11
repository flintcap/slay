/**
 * SLAY — materials for props, interactables and town buildings.
 *
 * Built on ground's material library: a key such as 'stone.crypt',
 * 'metal.iron', 'wood.bark' or 'bone.old' takes its photo set, colour,
 * roughness range, metalness and relief from `SurfaceLibrary.ts`, exactly as
 * `surface()` does. Keys starting `prop.` name the props stream's own CC0
 * sets under `public/assets/textures/props/` (weathered planks, rough timber,
 * thatch, roof slates, rubble masonry, riveted iron plate).
 *
 * Prop geometry has no UVs. Every map is projected three ways in the model's
 * own space (triplanar) and blended by the normal, so any shape can be
 * dressed and the grain stays on the object however it is turned. Instanced
 * copies read their own instance transform: the projection is shifted per
 * copy (two barrels side by side never show the same planks) and each copy
 * gets a small brightness shift, so a row of the same prop does not read as
 * stamped.
 *
 * Two touches make a prop sit in the world instead of on it:
 *  - grime: the lowest half metre darkens toward the floor (dirt, damp and
 *    the contact shadow the ambient light never draws);
 *  - cavities: the scan's height darkens its own hollows a little more.
 *
 * Vertex colours multiply the albedo, so one material can carry light and
 * dark parts of a model (a tarred plank beside a bleached one) in one draw.
 *
 * Materials are shared and cached; never mutate or dispose one. Missing
 * texture files fall back to flat colour, so a prop always renders.
 */
import * as THREE from 'three';
import { loadTexture } from '../../core/Assets';
import { resolveSurface } from '../SurfaceLibrary';
import { setTextures, TEXTURE_SETS, type TextureSetName } from '../TextureSets';

// ---------------------------------------------------------------------------
// The props stream's own photo sets
// ---------------------------------------------------------------------------

interface PropSet {
  /** Real-world width of one tile of the scan, metres. */
  metres: number;
  /** sRGB average of the albedo (fallback colour and tint reference). */
  avg: number;
  /** Colourless scan, meant to be tinted. */
  gray?: boolean;
}

/** Folders under `public/assets/textures/props/` (see `tools/fetch-prop-textures.mjs`). */
export const PROP_SETS = {
  planks: { metres: 2.0, avg: 0x4d4139 },
  timber: { metres: 0.5, avg: 0x919191, gray: true },
  thatch: { metres: 0.54, avg: 0x4c4943 },
  slate: { metres: 3.0, avg: 0x81796b },
  masonry: { metres: 2.5, avg: 0x696150 },
  ironplate: { metres: 2.0, avg: 0x9c9c9c, gray: true },
} satisfies Record<string, PropSet>;

export type PropSetName = keyof typeof PROP_SETS;

/** Every file the prop sets ship, for the preloader. */
export function propTextureFiles(): string[] {
  const out: string[] = [];
  for (const n of Object.keys(PROP_SETS)) out.push(`textures/props/${n}/albedo.webp`, `textures/props/${n}/normal.webp`);
  return out;
}

interface Scan {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  metres: number;
  avg: number;
  gray: boolean;
}

function propScan(name: PropSetName): Scan {
  const s: PropSet = PROP_SETS[name];
  return {
    albedo: loadTexture(`textures/props/${name}/albedo.webp`, { srgb: true, fallback: s.avg, fallbackAlpha: 128 }),
    normal: loadTexture(`textures/props/${name}/normal.webp`, { srgb: false, fallback: 0x8080ff, fallbackAlpha: 200 }),
    metres: s.metres,
    avg: s.avg,
    gray: !!s.gray,
  };
}

function worldScan(name: TextureSetName): Scan {
  const t = setTextures(name);
  const info = TEXTURE_SETS[name] as { metres: number; avg: number; gray?: boolean };
  return { albedo: t.albedo, normal: t.normal, metres: info.metres, avg: info.avg, gray: !!info.gray };
}

// ---------------------------------------------------------------------------
// What each prop key is made of
// ---------------------------------------------------------------------------

interface PropSurfaceDef {
  set: PropSetName;
  /** Target mid-tone; leave out to keep the photographed colour. */
  base?: number;
  rough: [number, number];
  metal: number;
  bump: number;
  /** Override for the tile size on a prop, metres. */
  metres?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

const PS = (set: PropSetName, base: number | undefined, rough: [number, number], metal: number, bump: number, extra: Partial<PropSurfaceDef> = {}): PropSurfaceDef => ({
  set,
  base,
  rough,
  metal,
  bump,
  ...extra,
});

/**
 * The props stream's surfaces. Muted, dirty and dark on purpose: a prop is
 * dressing, and the hero, the monsters and the loot must always read over it.
 */
const PROP_LIB: Record<string, PropSurfaceDef> = {
  'prop.planks': PS('planks', undefined, [0.6, 0.98], 0, 1.0, { metres: 1.6 }),
  'prop.planks.dark': PS('planks', 0x2e2620, [0.62, 0.98], 0, 1.05, { metres: 1.6 }),
  'prop.planks.grey': PS('planks', 0x55504a, [0.66, 1.0], 0, 1.1, { metres: 1.6 }),
  'prop.timber': PS('timber', 0x4f3f2f, [0.58, 0.96], 0, 1.1, { metres: 0.9 }),
  'prop.timber.dark': PS('timber', 0x30261d, [0.6, 0.98], 0, 1.15, { metres: 0.9 }),
  'prop.timber.grey': PS('timber', 0x5e5a52, [0.66, 1.0], 0, 1.2, { metres: 0.9 }),
  'prop.timber.pale': PS('timber', 0x7a6a52, [0.6, 0.96], 0, 1.0, { metres: 0.9 }),
  'prop.timber.charred': PS('timber', 0x1d1916, [0.7, 1.0], 0, 1.3, { metres: 0.9, emissive: 0x7a2606, emissiveIntensity: 0.25 }),
  'prop.thatch': PS('thatch', undefined, [0.82, 1.0], 0, 1.2, { metres: 1.1 }),
  'prop.thatch.old': PS('thatch', 0x3c382e, [0.85, 1.0], 0, 1.25, { metres: 1.1 }),
  'prop.slate': PS('slate', 0x55504a, [0.55, 0.92], 0, 1.1, { metres: 2.4 }),
  'prop.masonry': PS('masonry', undefined, [0.62, 0.98], 0, 1.15),
  'prop.masonry.dark': PS('masonry', 0x403b33, [0.64, 0.98], 0, 1.2),
  'prop.masonry.pale': PS('masonry', 0x8a8070, [0.6, 0.96], 0, 1.1),
  'prop.iron': PS('ironplate', 0x34363a, [0.34, 0.74], 0.85, 1.0, { metres: 0.9 }),
  'prop.iron.rust': PS('ironplate', 0x3a2c25, [0.55, 0.95], 0.6, 1.15, { metres: 0.9 }),
  'prop.iron.black': PS('ironplate', 0x1f2023, [0.3, 0.66], 0.9, 1.0, { metres: 0.9 }),
  'prop.bronze': PS('ironplate', 0x6e5532, [0.26, 0.6], 1, 0.8, { metres: 0.9 }),
  'prop.gold': PS('ironplate', 0xb88f3e, [0.16, 0.42], 1, 0.6, { metres: 0.9 }),
};

/** Every authored prop key, for checkers. */
export function propSurfaceKeys(): string[] {
  return Object.keys(PROP_LIB);
}

// ---------------------------------------------------------------------------
// Options and resolution
// ---------------------------------------------------------------------------

export interface PropMatOpts {
  /** Multiplicative colour on top of the key's own. */
  tint?: number;
  /** Target mid-tone, replacing the key's own (the scan is recoloured toward it). */
  base?: number;
  /** Scales the key's roughness. */
  rough?: number;
  metal?: number;
  /** Scales the texture: >1 makes the grain finer. */
  scale?: number;
  /** Scales normal-map strength. */
  bump?: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** Emission only in the hollows of the relief (lava rock, glowing veins). */
  crackGlow?: boolean;
  /** 0..1 how strongly the foot of the prop darkens. Default 1. */
  grime?: number;
  /** Height (metres, model space) the grime fades out by. Default 0.55. */
  grimeHeight?: number;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
}

interface Resolved {
  scan: Scan;
  base?: number;
  rough: [number, number];
  metal: number;
  bump: number;
  metres: number;
  emissive?: number;
  emissiveIntensity?: number;
}

function resolve(key: string): Resolved {
  const own = PROP_LIB[key];
  if (own) {
    const scan = propScan(own.set);
    return { scan, base: own.base, rough: own.rough, metal: own.metal, bump: own.bump, metres: own.metres ?? scan.metres, emissive: own.emissive, emissiveIntensity: own.emissiveIntensity };
  }
  const d = resolveSurface(key);
  const scan = worldScan(d.set);
  // World scans are cut for walls and floors; on something you can pick up
  // they read as smeared. Props wear them at most a metre and a half across.
  const metres = Math.min(1.5, Math.max(0.35, d.metres ?? scan.metres));
  return { scan, base: d.base, rough: d.rough, metal: d.metal, bump: d.bump, metres, emissive: d.emissive, emissiveIntensity: d.emissiveIntensity };
}

/** Linear-light tint that moves the scan's average onto the key's base colour. */
function tintFor(r: Resolved, extra?: number): THREE.Color {
  const out = new THREE.Color(1, 1, 1);
  if (r.base !== undefined) {
    const avg = new THREE.Color(r.scan.avg);
    const base = new THREE.Color(r.base);
    const k = r.scan.gray ? 1 : 0.65;
    out.setRGB(
      1 + (base.r / Math.max(avg.r, 0.004) - 1) * k,
      1 + (base.g / Math.max(avg.g, 0.004) - 1) * k,
      1 + (base.b / Math.max(avg.b, 0.004) - 1) * k,
    );
  }
  if (extra !== undefined) out.multiply(new THREE.Color(extra));
  return out;
}

// ---------------------------------------------------------------------------
// The shader patch
// ---------------------------------------------------------------------------

interface TriUniforms {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  scale: number;
  normalScale: number;
  rough: [number, number];
  grime: number;
  grimeHeight: number;
  crack: number;
}

function triplanar(m: THREE.MeshStandardMaterial, o: TriUniforms): void {
  const uniforms = {
    ptAlbedo: { value: o.albedo },
    ptNormal: { value: o.normal },
    ptScale: { value: o.scale },
    ptNormalScale: { value: o.normalScale },
    ptRough: { value: new THREE.Vector2(o.rough[0], o.rough[1]) },
    ptGrime: { value: new THREE.Vector2(o.grime, Math.max(0.05, o.grimeHeight)) },
    ptCrack: { value: o.crack },
  };
  m.userData.propTri = uniforms;
  m.customProgramCacheKey = () => 'prop-tri';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float ptScale;
varying vec3 vPtPos;
varying vec3 vPtN;
varying float vPtY;
varying float vPtVar;
varying vec3 vPtM0;
varying vec3 vPtM1;
varying vec3 vPtM2;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
#ifdef USE_INSTANCING
  vec3 ptOff = instanceMatrix[ 3 ].xyz;
  mat3 ptIM = mat3( instanceMatrix );
#else
  vec3 ptOff = modelMatrix[ 3 ].xyz;
  mat3 ptIM = mat3( 1.0 );
#endif
vPtPos = position * ptScale + ptOff * 0.37;
vPtN = normal;
vPtY = position.y;
vPtVar = fract( sin( dot( ptOff.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
mat3 ptNM = normalMatrix * ptIM;
vPtM0 = ptNM[ 0 ];
vPtM1 = ptNM[ 1 ];
vPtM2 = ptNM[ 2 ];`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D ptAlbedo;
uniform sampler2D ptNormal;
uniform float ptNormalScale;
uniform vec2 ptRough;
uniform vec2 ptGrime;
uniform float ptCrack;
varying vec3 vPtPos;
varying vec3 vPtN;
varying float vPtY;
varying float vPtVar;
varying vec3 vPtM0;
varying vec3 vPtM1;
varying vec3 vPtM2;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 ptNb = normalize( vPtN );
vec3 ptW = pow( abs( ptNb ), vec3( 4.0 ) );
ptW /= ( ptW.x + ptW.y + ptW.z );
vec4 ptNx = texture2D( ptNormal, vPtPos.zy );
vec4 ptNy = texture2D( ptNormal, vPtPos.xz );
vec4 ptNz = texture2D( ptNormal, vPtPos.xy );
vec4 ptA = texture2D( ptAlbedo, vPtPos.zy ) * ptW.x + texture2D( ptAlbedo, vPtPos.xz ) * ptW.y + texture2D( ptAlbedo, vPtPos.xy ) * ptW.z;
float ptH = ptA.a;
diffuseColor.rgb *= ptA.rgb;
diffuseColor.rgb *= mix( 0.74, 1.0, ptH );
diffuseColor.rgb *= 0.9 + 0.2 * vPtVar;
float ptG = smoothstep( 0.0, ptGrime.y, vPtY );
diffuseColor.rgb *= mix( 1.0 - 0.45 * ptGrime.x, 1.0, ptG );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
float ptR = ptNx.a * ptW.x + ptNy.a * ptW.y + ptNz.a * ptW.z;
roughnessFactor = clamp( roughnessFactor * mix( ptRough.x, ptRough.y, ptR ), 0.04, 1.0 );`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 tx = ( ptNx.xyz * 2.0 - 1.0 ) * vec3( ptNormalScale, ptNormalScale, 1.0 );
  vec3 ty = ( ptNy.xyz * 2.0 - 1.0 ) * vec3( ptNormalScale, ptNormalScale, 1.0 );
  vec3 tz = ( ptNz.xyz * 2.0 - 1.0 ) * vec3( ptNormalScale, ptNormalScale, 1.0 );
  tx = vec3( tx.xy + ptNb.zy, abs( tx.z ) * ptNb.x );
  ty = vec3( ty.xy + ptNb.xz, abs( ty.z ) * ptNb.y );
  tz = vec3( tz.xy + ptNb.xy, abs( tz.z ) * ptNb.z );
  vec3 bn = normalize( tx.zyx * ptW.x + ty.xzy * ptW.y + tz.xyz * ptW.z );
  normal = normalize( mat3( vPtM0, vPtM1, vPtM2 ) * bn );
  #ifdef DOUBLE_SIDED
    normal *= faceDirection;
  #endif
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  float ptC = 1.0 - ptH;
  totalEmissiveRadiance *= mix( 1.0, ptC * ptC * ptC * 2.4, ptCrack );
}`,
      );
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const cache = new Map<string, THREE.Material>();

function cached<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = make();
  m.userData.shared = true;
  cache.set(key, m);
  return m;
}

/**
 * The shared prop material for a surface key: a ground key ('stone.crypt',
 * 'metal.iron', 'bone.old', 'wood.bark', 'cloth.tattered'...) or a prop key
 * ('prop.planks', 'prop.timber.dark', 'prop.thatch', 'prop.iron'...).
 * Unknown keys resolve the way `surface()` resolves them, so a typo never
 * ships as a broken material.
 */
export function propMat(key: string, o: PropMatOpts = {}): THREE.MeshStandardMaterial {
  const ck = `pm|${key}|${o.tint ?? -1}|${o.base ?? -1}|${o.rough ?? 1}|${o.metal ?? -1}|${o.scale ?? 1}|${o.bump ?? 1}|${o.emissive ?? -1}|${o.emissiveIntensity ?? -1}|${o.crackGlow ? 1 : 0}|${o.grime ?? 1}|${o.grimeHeight ?? 0.55}|${o.side ?? 0}|${o.transparent ? 1 : 0}|${o.opacity ?? 1}`;
  return cached(ck, () => {
    const r = resolve(key);
    const m = new THREE.MeshStandardMaterial({ name: `prop:${key}`, vertexColors: true });
    m.color = tintFor(o.base !== undefined ? { ...r, base: o.base } : r, o.tint);
    m.roughness = o.rough ?? 1;
    m.metalness = o.metal ?? r.metal;
    m.envMapIntensity = m.metalness > 0.5 ? 1.3 : 1.0;
    const emissive = o.emissive ?? r.emissive;
    if (emissive !== undefined) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = o.emissiveIntensity ?? r.emissiveIntensity ?? 0.6;
    }
    m.side = o.side ?? THREE.FrontSide;
    if (o.transparent) {
      m.transparent = true;
      m.opacity = o.opacity ?? 1;
      m.depthWrite = (o.opacity ?? 1) > 0.95;
    }
    triplanar(m, {
      albedo: r.scan.albedo,
      normal: r.scan.normal,
      scale: (o.scale ?? 1) / r.metres,
      normalScale: (o.bump ?? 1) * r.bump * 0.9,
      rough: r.rough,
      grime: o.grime ?? 1,
      grimeHeight: o.grimeHeight ?? 0.55,
      // A key's own glow (ash stone, charred wood) lives in its cracks, as
      // ground draws it; an asked-for glow covers the surface unless told.
      crack: emissive !== undefined && (o.crackGlow || o.emissive === undefined) ? 1 : 0,
    });
    return m;
  });
}

/**
 * A self-lit material for flames, embers, runes and glowing fungus: a dark
 * saturated body under a strong emissive so bloom separates it. Takes vertex
 * colours like every prop material.
 */
export function glowMat(color: number, intensity = 2.4): THREE.MeshStandardMaterial {
  return cached(`glow|${color}|${intensity}`, () => {
    const c = new THREE.Color(color);
    return new THREE.MeshStandardMaterial({
      name: `prop:glow:${color.toString(16)}`,
      color: c.clone().multiplyScalar(0.12),
      emissive: c,
      emissiveIntensity: intensity,
      roughness: 0.5,
      metalness: 0,
      vertexColors: true,
    });
  });
}

/**
 * Unlit flame body: additive, no depth write, never tone-mapped down, so it
 * reads as light rather than as a coloured shape.
 */
export function flameMat(color: number, opacity = 0.95): THREE.MeshBasicMaterial {
  return cached(`flame|${color}|${opacity}`, () =>
    new THREE.MeshBasicMaterial({
      name: `prop:flame:${color.toString(16)}`,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      vertexColors: true,
    }),
  );
}

/** See-through layers: webs, void tears, mist. */
export function ghostMat(color: number, opacity: number, o: { additive?: boolean; map?: THREE.Texture } = {}): THREE.MeshBasicMaterial {
  return cached(`ghost|${color}|${opacity}|${o.additive ? 1 : 0}|${o.map?.uuid ?? ''}`, () =>
    new THREE.MeshBasicMaterial({
      name: `prop:ghost:${color.toString(16)}`,
      color,
      map: o.map ?? null,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexColors: true,
    }),
  );
}

/** Drops every cached prop material. Textures stay in the asset cache. */
export function disposePropMats(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

/** How many prop materials are alive (perf checks). */
export function propMatCount(): number {
  return cache.size;
}

/**
 * SLAY — creature materials.
 *
 * A creature has no UVs. Its surface texture (bone, flesh, fur, chitin,
 * stone, iron...) is projected three ways in the bind pose and blended by the
 * bind normal (triplanar), so it stays glued to the body however it bends.
 * Photo scans come from the world texture sets ground already ships (CC0,
 * listed in ASSETS.md); scales and chitin, which no scan covers, are drawn in
 * code. Missing files fall back to flat maps, so a creature always renders.
 *
 * On top of the texture:
 *  - vertex colour (painted by `Bake.ts`: occlusion, grime, mottling) at
 *    half value, doubled here so paint can brighten as well as darken;
 *  - a per-vertex glow the material turns into emission in its glow colour
 *    (eyes, cores, lava cracks, runes) at no extra draw call;
 *  - a rim light (fresnel) for rank and affix looks, off by default.
 *
 * Materials are shared by every creature with the same look. A boss or an
 * affixed elite that needs its own glow or rim takes a clone
 * (`cloneCreatureMaterial`), which shares the shader program and textures.
 */
import * as THREE from 'three';
import { setTextures, type TextureSetName } from '../TextureSets';

export type Surface =
  | 'bone'
  | 'flesh'
  | 'rot'
  | 'hide'
  | 'fur'
  | 'chitin'
  | 'scale'
  | 'stone'
  | 'basalt'
  | 'iron'
  | 'rust'
  | 'steel'
  | 'brass'
  | 'gold'
  | 'cloth'
  | 'leather'
  | 'bark'
  | 'moss'
  | 'ice'
  | 'lava'
  | 'slime'
  | 'shade'
  | 'crystal';

interface SurfaceDef {
  set: TextureSetName | 'scales' | 'chitin' | 'smooth';
  /** Metres per texture tile. */
  metres: number;
  rough: number;
  metal: number;
  normal: number;
  /** Multiplier so the scan's average lands near 1 (scans are pulled to about 0.6). */
  gain: number;
  /** How much of the scan's own colour survives the tint (0 grey scan .. 1 all). */
  hue?: number;
  opacity?: number;
}

const SURFACES: Record<Surface, SurfaceDef> = {
  bone: { set: 'bone', metres: 0.55, rough: 0.72, metal: 0, normal: 1.1, gain: 1.6 },
  flesh: { set: 'flesh', metres: 0.6, rough: 0.6, metal: 0, normal: 1.0, gain: 2.0 },
  rot: { set: 'flesh', metres: 0.5, rough: 0.7, metal: 0, normal: 1.3, gain: 2.0 },
  hide: { set: 'leather', metres: 0.35, rough: 0.75, metal: 0, normal: 1.2, gain: 1.6 },
  fur: { set: 'fur', metres: 0.32, rough: 0.9, metal: 0, normal: 1.6, gain: 1.6 },
  chitin: { set: 'chitin', metres: 0.4, rough: 0.34, metal: 0.05, normal: 1.0, gain: 1 },
  scale: { set: 'scales', metres: 0.22, rough: 0.5, metal: 0, normal: 1.2, gain: 1 },
  stone: { set: 'cave', metres: 1.1, rough: 0.9, metal: 0, normal: 1.4, gain: 1.4 },
  basalt: { set: 'basalt', metres: 1.0, rough: 0.85, metal: 0, normal: 1.4, gain: 2.6 },
  iron: { set: 'iron', metres: 0.7, rough: 0.5, metal: 0.65, normal: 0.9, gain: 1.4 },
  rust: { set: 'rust', metres: 0.8, rough: 0.82, metal: 0.35, normal: 1.2, gain: 1.6 },
  steel: { set: 'steel', metres: 0.6, rough: 0.32, metal: 0.75, normal: 0.6, gain: 1.4 },
  brass: { set: 'steel', metres: 0.6, rough: 0.36, metal: 0.8, normal: 0.6, gain: 1.4 },
  gold: { set: 'steel', metres: 0.6, rough: 0.25, metal: 0.85, normal: 0.5, gain: 1.4 },
  cloth: { set: 'cloth', metres: 0.35, rough: 0.92, metal: 0, normal: 0.9, gain: 1.6 },
  leather: { set: 'leather', metres: 0.3, rough: 0.7, metal: 0, normal: 0.8, gain: 1.6 },
  bark: { set: 'bark', metres: 0.7, rough: 0.92, metal: 0, normal: 1.6, gain: 1.8, hue: 0.6 },
  moss: { set: 'moss', metres: 0.6, rough: 0.95, metal: 0, normal: 1.2, gain: 2.2, hue: 0.5 },
  ice: { set: 'ice', metres: 1.0, rough: 0.18, metal: 0, normal: 1.0, gain: 1.6 },
  lava: { set: 'lava_crust', metres: 0.9, rough: 0.8, metal: 0, normal: 1.4, gain: 1.6 },
  slime: { set: 'smooth', metres: 0.5, rough: 0.16, metal: 0, normal: 0.5, gain: 1, opacity: 0.86 },
  shade: { set: 'cloth', metres: 0.4, rough: 0.95, metal: 0, normal: 0.8, gain: 1.5, opacity: 0.88 },
  crystal: { set: 'ice', metres: 0.7, rough: 0.08, metal: 0.1, normal: 0.6, gain: 1.6 },
};

export interface CreatureMatDef {
  surface: Surface;
  /** Albedo tint. */
  tint: number;
  /** Glow colour (painted glow turns into this emission). */
  glow: number;
  glowIntensity?: number;
  /** Instance scale bucket, so texel density stays constant in the world. */
  scale?: number;
  /** Roughness and metalness overrides. */
  rough?: number;
  metal?: number;
  /** Rim light. */
  rim?: number;
  rimStrength?: number;
}

export interface CreatureUniforms {
  glowColor: { value: THREE.Color };
  glowIntensity: { value: number };
  rimColor: { value: THREE.Color };
  rimStrength: { value: number };
  triScale: { value: number };
  triAlbedo: { value: THREE.Texture | null };
  triNormal: { value: THREE.Texture };
  triNormalScale: { value: number };
  triGain: { value: number };
  triHue: { value: number };
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Integer hash, deterministic. */
function ihash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A tileable height field turned into a tangent normal map (A = roughness). */
function heightToNormal(N: number, hgt: Float32Array, strength: number, rough: (h: number, x: number, y: number) => number): THREE.DataTexture {
  const data = new Uint8Array(N * N * 4);
  const at = (x: number, y: number) => hgt[((y + N) % N) * N + ((x + N) % N)]!;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      data[i] = Math.round((-dx / l) * 127.5 + 127.5);
      data[i + 1] = Math.round((-dy / l) * 127.5 + 127.5);
      data[i + 2] = Math.round((1 / l) * 127.5 + 127.5);
      data[i + 3] = Math.round(Math.min(1, Math.max(0, rough(at(x, y), x, y))) * 255);
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  t.userData.shared = true;
  return t;
}

const procTex = new Map<string, THREE.DataTexture>();

/** Overlapping scales: rows of rounded plates, each lifted at its free edge. */
function scalesTex(): THREE.DataTexture {
  const hit = procTex.get('scales');
  if (hit) return hit;
  const N = 256;
  const ROWS = 8;
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = (y / N) * ROWS;
      let best = -1;
      for (let dr = -1; dr <= 1; dr++) {
        const row = Math.floor(v) + dr;
        const off = (row & 1) * 0.5;
        const u = (x / N) * ROWS + off;
        for (let dc = -1; dc <= 1; dc++) {
          const col = Math.floor(u) + dc;
          const cx = col + 0.5;
          const cy = row + 0.15;
          const ddx = (u - cx) / 0.62;
          const ddy = (v - cy) / 0.9;
          const d = ddx * ddx + ddy * ddy;
          if (d < 1) {
            // Higher toward the bottom (free) edge: overlapping shingles.
            const h = (1 - d) * 0.5 + (v - cy) * 0.45 + 0.08 * ihash(((col % 64) + 64) % 64, ((row % 64) + 64) % 64, 7);
            if (h > best) best = h;
          }
        }
      }
      hgt[y * N + x] = best;
    }
  }
  const t = heightToNormal(N, hgt, 3.2, (h) => 0.75 - 0.35 * h);
  procTex.set('scales', t);
  return t;
}

/** Chitin: smooth plates with fine pits and a few growth ridges. */
function chitinTex(): THREE.DataTexture {
  const hit = procTex.get('chitin');
  if (hit) return hit;
  const N = 256;
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let h = 0;
      // Pits.
      const cells = 28;
      const u = (x / N) * cells;
      const v = (y / N) * cells;
      const cx = Math.floor(u);
      const cy = Math.floor(v);
      let pit = 0;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const gx = (((cx + ox) % cells) + cells) % cells;
          const gy = (((cy + oy) % cells) + cells) % cells;
          const px = cx + ox + ihash(gx, gy, 1);
          const py = cy + oy + ihash(gx, gy, 2);
          const r = 0.12 + 0.1 * ihash(gx, gy, 3);
          const d2 = ((u - px) ** 2 + (v - py) ** 2) / (r * r);
          pit = Math.max(pit, Math.exp(-d2));
        }
      h -= pit * 0.6;
      // Growth ridges, wavy across the tile.
      const w = Math.sin((y / N) * Math.PI * 2 * 5 + Math.sin((x / N) * Math.PI * 2 * 2) * 1.2);
      h += Math.pow(Math.abs(w), 12) * 0.5;
      hgt[y * N + x] = h;
    }
  }
  const t = heightToNormal(N, hgt, 2.4, (h) => 0.42 - 0.3 * h);
  procTex.set('chitin', t);
  return t;
}

/** A nearly flat map with slow undulation (slime, glass). */
function smoothTex(): THREE.DataTexture {
  const hit = procTex.get('smooth');
  if (hit) return hit;
  const N = 64;
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) hgt[y * N + x] = Math.sin((x / N) * Math.PI * 4) * Math.cos((y / N) * Math.PI * 2) * 0.2;
  const t = heightToNormal(N, hgt, 1.0, () => 0.5);
  procTex.set('smooth', t);
  return t;
}

function patch(m: THREE.MeshStandardMaterial, u: CreatureUniforms, hasAlbedo: boolean): void {
  m.customProgramCacheKey = () => `creature|${hasAlbedo ? 'a' : ''}`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    if (hasAlbedo) sh.defines = { ...(sh.defines ?? {}), TRI_ALBEDO: '' };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float triScale;
attribute float glow;
varying float vGlow;
varying vec3 vTriPos;
varying vec3 vTriN;
varying vec3 vB2V0;
varying vec3 vB2V1;
varying vec3 vB2V2;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vGlow = glow;
vTriPos = position * triScale;
vTriN = normal;
#ifdef USE_SKINNING
  mat3 triB2V = normalMatrix * mat3( skinMatrix );
#else
  mat3 triB2V = normalMatrix;
#endif
vB2V0 = triB2V[ 0 ];
vB2V1 = triB2V[ 1 ];
vB2V2 = triB2V[ 2 ];`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D triAlbedo;
uniform sampler2D triNormal;
uniform float triNormalScale;
uniform float triGain;
uniform float triHue;
uniform vec3 glowColor;
uniform float glowIntensity;
uniform vec3 rimColor;
uniform float rimStrength;
varying float vGlow;
varying vec3 vTriPos;
varying vec3 vTriN;
varying vec3 vB2V0;
varying vec3 vB2V1;
varying vec3 vB2V2;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 triNb = normalize( vTriN );
vec3 triW = pow( abs( triNb ), vec3( 4.0 ) );
triW /= ( triW.x + triW.y + triW.z );
vec4 triNx = texture2D( triNormal, vTriPos.zy );
vec4 triNy = texture2D( triNormal, vTriPos.xz );
vec4 triNz = texture2D( triNormal, vTriPos.xy );
#ifdef TRI_ALBEDO
  vec4 triA = texture2D( triAlbedo, vTriPos.zy ) * triW.x + texture2D( triAlbedo, vTriPos.xz ) * triW.y + texture2D( triAlbedo, vTriPos.xy ) * triW.z;
  float triL = dot( triA.rgb, vec3( 0.299, 0.587, 0.114 ) );
  vec3 triC = mix( vec3( triL ), triA.rgb, triHue );
  diffuseColor.rgb *= min( vec3( 2.2 ), triC * triGain );
#endif`,
      )
      .replace('#include <color_fragment>', `#if defined( USE_COLOR )
  diffuseColor.rgb *= vColor * 2.0;
#endif`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
float triR = triNx.a * triW.x + triNy.a * triW.y + triNz.a * triW.z;
roughnessFactor = clamp( roughnessFactor * mix( 1.0, triR * 1.4, 0.75 ), 0.04, 1.0 );`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 tx = ( triNx.xyz * 2.0 - 1.0 ) * vec3( triNormalScale, triNormalScale, 1.0 );
  vec3 ty = ( triNy.xyz * 2.0 - 1.0 ) * vec3( triNormalScale, triNormalScale, 1.0 );
  vec3 tz = ( triNz.xyz * 2.0 - 1.0 ) * vec3( triNormalScale, triNormalScale, 1.0 );
  tx = vec3( tx.xy + triNb.zy, abs( tx.z ) * triNb.x );
  ty = vec3( ty.xy + triNb.xz, abs( ty.z ) * triNb.y );
  tz = vec3( tz.xy + triNb.xy, abs( tz.z ) * triNb.z );
  vec3 bn = normalize( tx.zyx * triW.x + ty.xzy * triW.y + tz.xyz * triW.z );
  normal = normalize( mat3( vB2V0, vB2V1, vB2V2 ) * bn );
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += glowColor * ( vGlow * glowIntensity );
// Painted glow also brightens what it sits in, so an eye reads as lit, not as a dot.
diffuseColor.rgb = mix( diffuseColor.rgb, glowColor * 0.35, clamp( vGlow * 1.5, 0.0, 1.0 ) );
if ( rimStrength > 0.0 ) {
  float rimF = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
  totalEmissiveRadiance += rimColor * ( pow( rimF, 2.6 ) * rimStrength );
}`,
      );
  };
}

function texturesFor(def: SurfaceDef): { albedo: THREE.Texture | null; normal: THREE.Texture } {
  if (def.set === 'scales') return { albedo: null, normal: scalesTex() };
  if (def.set === 'chitin') return { albedo: null, normal: chitinTex() };
  if (def.set === 'smooth') return { albedo: null, normal: smoothTex() };
  const t = setTextures(def.set);
  return { albedo: t.albedo, normal: t.normal };
}

function build(d: CreatureMatDef): THREE.MeshStandardMaterial {
  const sd = SURFACES[d.surface];
  const tex = texturesFor(sd);
  const m = new THREE.MeshStandardMaterial({
    color: d.tint,
    roughness: d.rough ?? sd.rough,
    metalness: d.metal ?? sd.metal,
    vertexColors: true,
    transparent: sd.opacity !== undefined,
    opacity: sd.opacity ?? 1,
    envMapIntensity: (d.metal ?? sd.metal) > 0.5 ? 1.3 : 1,
  });
  const u: CreatureUniforms = {
    glowColor: { value: new THREE.Color(d.glow) },
    glowIntensity: { value: d.glowIntensity ?? 2.4 },
    rimColor: { value: new THREE.Color(d.rim ?? 0x000000) },
    rimStrength: { value: d.rim !== undefined ? (d.rimStrength ?? 1.2) : 0 },
    triScale: { value: (d.scale ?? 1) / sd.metres },
    triAlbedo: { value: tex.albedo },
    triNormal: { value: tex.normal },
    triNormalScale: { value: sd.normal },
    triGain: { value: sd.gain },
    triHue: { value: sd.hue ?? 0.25 },
  };
  patch(m, u, !!tex.albedo);
  m.userData.creature = { def: { ...d }, u };
  m.name = `creature:${d.surface}`;
  return m;
}

/** Scale bucket: thirds of an octave. */
export function scaleBucket(scale: number): number {
  return Math.pow(2, Math.round(Math.log2(Math.max(0.1, scale)) * 3) / 3);
}

/** The shared material for a look. */
export function creatureMaterial(d: CreatureMatDef): THREE.MeshStandardMaterial {
  const key = JSON.stringify([d.surface, d.tint, d.glow, d.glowIntensity ?? 0, d.scale ?? 1, d.rough ?? -1, d.metal ?? -1, d.rim ?? -1, d.rimStrength ?? -1]);
  const hit = cache.get(key);
  if (hit) return hit;
  const m = build(d);
  m.userData.shared = true;
  cache.set(key, m);
  return m;
}

/** A private copy (same program, same textures) whose glow and rim can change per instance. */
export function cloneCreatureMaterial(src: THREE.Material, over: Partial<CreatureMatDef> = {}): THREE.MeshStandardMaterial {
  const info = src.userData.creature as { def: CreatureMatDef } | undefined;
  if (!info) return (src as THREE.MeshStandardMaterial).clone();
  const m = build({ ...info.def, ...over });
  m.userData.private = true;
  return m;
}

/** The live uniforms of a creature material (for phase glow and rank rims). */
export function creatureUniforms(m: THREE.Material): CreatureUniforms | null {
  return (m.userData.creature as { u: CreatureUniforms } | undefined)?.u ?? null;
}

/** Disposes every shared creature material (between runs). Textures belong to the texture sets. */
export function disposeCreatureMaterials(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

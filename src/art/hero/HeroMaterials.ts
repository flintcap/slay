/**
 * SLAY — materials for heroes: skin, cloth, leather.
 *
 * A hero has no UVs. Every texture is projected three ways in the bind pose
 * (triplanar) and blended by the bind normal, so the weave or the pores stay
 * glued to the body however it bends. The bind position is the skinned
 * shader's own `position` attribute, so this costs no extra vertex data.
 *
 * Cloth and leather use CC0 photo scans from `public/assets/textures/hero/`
 * (see `tools/fetch-hero-textures.mjs`); they are colourless and the tint
 * picks the dye. Skin pores are painted here in code. Missing files fall back
 * to flat maps, so a hero always renders.
 */
import * as THREE from 'three';
import { loadTexture } from '../../core/Assets';
import type { HeroLook } from './Looks';

export type HeroFabric = 'linen' | 'wool' | 'leather' | 'suede' | 'hessian';

/** Real width of one tile of each scan, metres (from Poly Haven's metadata). */
const FABRIC_METRES: Record<HeroFabric, number> = { linen: 0.27, wool: 0.27, leather: 0.4, suede: 0.29, hessian: 0.27 };

const cache = new Map<string, THREE.Material>();

function shared<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = make();
  m.userData.shared = true;
  cache.set(key, m);
  return m;
}

interface TriOpts {
  albedo?: THREE.Texture;
  normal: THREE.Texture;
  /** Tiles per metre. */
  scale: number;
  normalScale: number;
  /** How much the map's alpha moves roughness (0 none .. 1 all). */
  roughVar: number;
}

/** Patches a standard material to sample its maps triplanar in bind space. */
function triplanar(m: THREE.MeshStandardMaterial, o: TriOpts): void {
  const key = `tri|${o.albedo ? 'a' : ''}`;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.triAlbedo = { value: o.albedo ?? null };
    sh.uniforms.triNormal = { value: o.normal };
    sh.uniforms.triScale = { value: o.scale };
    sh.uniforms.triNormalScale = { value: o.normalScale };
    sh.uniforms.triRoughVar = { value: o.roughVar };
    if (o.albedo) sh.defines = { ...(sh.defines ?? {}), TRI_ALBEDO: '' };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float triScale;
varying vec3 vTriPos;
varying vec3 vTriN;
varying vec3 vB2V0;
varying vec3 vB2V1;
varying vec3 vB2V2;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
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
uniform float triRoughVar;
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
  diffuseColor.rgb *= min( vec3( 1.6 ), triA.rgb * 1.6 );
#endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
float triR = triNx.a * triW.x + triNy.a * triW.y + triNz.a * triW.z;
roughnessFactor = clamp( roughnessFactor * mix( 1.0, triR * 1.4, triRoughVar ), 0.04, 1.0 );`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // Whiteout blend of three tangent-space normals onto the bind normal.
  vec3 tx = ( triNx.xyz * 2.0 - 1.0 ) * vec3( triNormalScale, triNormalScale, 1.0 );
  vec3 ty = ( triNy.xyz * 2.0 - 1.0 ) * vec3( triNormalScale, triNormalScale, 1.0 );
  vec3 tz = ( triNz.xyz * 2.0 - 1.0 ) * vec3( triNormalScale, triNormalScale, 1.0 );
  tx = vec3( tx.xy + triNb.zy, abs( tx.z ) * triNb.x );
  ty = vec3( ty.xy + triNb.xz, abs( ty.z ) * triNb.y );
  tz = vec3( tz.xy + triNb.xy, abs( tz.z ) * triNb.z );
  vec3 bn = normalize( tx.zyx * triW.x + ty.xzy * triW.y + tz.xyz * triW.z );
  normal = normalize( mat3( vB2V0, vB2V1, vB2V2 ) * bn );
  #ifdef DOUBLE_SIDED
    normal *= faceDirection;
  #endif
}`,
      );
  };
}

/** Integer hash, deterministic. */
function ihash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Tileable value noise with period `p` cells. */
function vnoise(x: number, y: number, p: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const m = (v: number) => ((v % p) + p) % p;
  const a = ihash(m(xi), m(yi), s);
  const b = ihash(m(xi + 1), m(yi), s);
  const c = ihash(m(xi), m(yi + 1), s);
  const d = ihash(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

let poreTex: THREE.DataTexture | null = null;

/**
 * Skin detail, one tile: pores, fine creases and a little oil. RGB is a
 * tangent normal, A roughness (higher in the pores, lower on the sheen).
 */
function skinPores(): THREE.DataTexture {
  if (poreTex) return poreTex;
  const N = 256;
  const CELLS = 40;
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * CELLS;
      const v = (y / N) * CELLS;
      const cx = Math.floor(u);
      const cy = Math.floor(v);
      let pore = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const gy = cy + oy;
          const wx = ((gx % CELLS) + CELLS) % CELLS;
          const wy = ((gy % CELLS) + CELLS) % CELLS;
          const px = gx + ihash(wx, wy, 1);
          const py = gy + ihash(wx, wy, 2);
          const r = 0.16 + 0.12 * ihash(wx, wy, 3);
          const d2 = ((u - px) ** 2 + (v - py) ** 2) / (r * r);
          pore = Math.max(pore, Math.exp(-d2));
        }
      }
      // Fine creases run across the tile at a slant; broad soft unevenness under them.
      const crease = Math.abs(vnoise((x / N) * 24 + (y / N) * 8, (y / N) * 6, 24, 4) - 0.5);
      const soft = vnoise((x / N) * 8, (y / N) * 8, 8, 5);
      hgt[y * N + x] = -0.9 * pore - 0.35 * Math.max(0, 0.12 - crease) * 6 + 0.4 * soft;
    }
  }
  const data = new Uint8Array(N * N * 4);
  const at = (x: number, y: number) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.9;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.9;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      data[i] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      const h = at(x, y);
      data[i + 3] = Math.round(Math.min(1, Math.max(0, 0.66 - 0.3 * h + 0.18 * (vnoise((x / N) * 4, (y / N) * 4, 4, 6) - 0.5))) * 255);
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
  poreTex = t;
  return t;
}

/** Skin: tinted by the look, with painted flush and shadow in vertex colours. */
export function skinMaterial(look: HeroLook): THREE.MeshStandardMaterial {
  return shared(`skin|${look.skin}|${look.dead ? 1 : 0}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: look.skin, roughness: look.dead ? 0.85 : 0.62, metalness: 0, vertexColors: true });
    // One tile every 6 cm.
    triplanar(m, { normal: skinPores(), scale: 1 / 0.06, normalScale: look.dead ? 0.9 : 0.5, roughVar: 0.8 });
    m.name = 'hero-skin';
    return m;
  });
}

/** Cloth or leather from a CC0 scan, dyed. */
export function fabricMaterial(fabric: HeroFabric, tint: number, roughness = 0.9): THREE.MeshStandardMaterial {
  return shared(`fabric|${fabric}|${tint}|${roughness}`, () => {
    const dir = `textures/hero/${fabric}`;
    const albedo = loadTexture(`${dir}/albedo.webp`, { srgb: true, fallback: 0x9e9e9e, fallbackAlpha: 128 });
    const normal = loadTexture(`${dir}/normal.webp`, { srgb: false, fallback: 0x8080ff, fallbackAlpha: 200 });
    const m = new THREE.MeshStandardMaterial({ color: tint, roughness, metalness: 0 });
    triplanar(m, { albedo, normal, scale: 1 / FABRIC_METRES[fabric], normalScale: 1, roughVar: 0.7 });
    m.name = `hero-${fabric}`;
    return m;
  });
}

/** Hair, brows and beards: dark-cored strands with a soft sheen. */
export function hairMaterial(color: number): THREE.MeshStandardMaterial {
  return shared(`hair|${color}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, vertexColors: true });
    m.name = 'hero-hair';
    return m;
  });
}

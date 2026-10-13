/**
 * SLAY — materials for items.
 *
 * Item geometry has no UVs. Every texture is projected three ways in the
 * model's own space (triplanar) and blended by the normal, so the scratches
 * on a blade or the grain on a haft stay put as the item swings, and any
 * shape can be dressed without unwrapping it.
 *
 * Detail comes from CC0 photo scans: the item sets under
 * `public/assets/textures/items/` (fine metal scratches, wood grain, grip
 * leather; see `tools/fetch-item-textures.mjs`) and a few world sets (bone,
 * stone, cloth, flesh). Missing files fall back to flat maps, so an item
 * always renders. Colour, roughness and metalness come from the surface
 * library, so a 'metal.gold' trim is the same gold the world uses.
 *
 * Materials are shared and cached; never mutate or dispose one.
 */
import * as THREE from 'three';
import { loadTexture, textureReady } from '../../core/Assets';
import { resolveSurface } from '../SurfaceLibrary';
import { allSetNames, setTextures, TEXTURE_SETS, type TextureSetName } from '../TextureSets';

/** An item texture set: folder under textures/items/ and the tile size on an item, metres. */
interface ItemSet {
  dir: string;
  metres: number;
  /** The scan is colourless (mean pulled to mid grey) and is tinted. */
  gray: boolean;
}

const ITEM_SETS: Record<string, ItemSet> = {
  metal: { dir: 'textures/items/metal', metres: 0.22, gray: true },
  hammered: { dir: 'textures/items/hammered', metres: 0.3, gray: true },
  wood: { dir: 'textures/items/wood', metres: 0.35, gray: true },
  leather: { dir: 'textures/items/leather', metres: 0.18, gray: true },
};

function itemScan(name: string): { albedo: THREE.Texture; normal: THREE.Texture } {
  const s = ITEM_SETS[name]!;
  return {
    albedo: loadTexture(`${s.dir}/albedo.webp`, { srgb: true, fallback: 0x9e9e9e, fallbackAlpha: 128 }),
    normal: loadTexture(`${s.dir}/normal.webp`, { srgb: false, fallback: 0x8080ff, fallbackAlpha: 160 }),
  };
}

let scansReady: Promise<void> | null = null;

/**
 * Resolves once every item scan has decoded (or failed for good). Icons wait
 * on it, so an icon is never baked with the flat fallback maps.
 */
export function itemScansReady(): Promise<void> {
  if (!scansReady) {
    const waits: Array<Promise<boolean>> = [];
    for (const name of Object.keys(ITEM_SETS)) {
      const t = itemScan(name);
      waits.push(textureReady(t.albedo), textureReady(t.normal));
    }
    // Pants are drawn in the hero's own gear materials (see `hero/PantsModel.ts`).
    for (const name of allSetNames()) {
      const t = setTextures(name);
      waits.push(textureReady(t.albedo), textureReady(t.normal));
    }
    scansReady = Promise.all(waits).then(() => undefined);
  }
  return scansReady;
}

/** Which scan dresses a surface family, and how big a tile is on an item. */
function scanFor(family: string, key: string): { tex: { albedo: THREE.Texture; normal: THREE.Texture }; metres: number; gray: boolean } {
  const item = (name: string) => {
    const s = ITEM_SETS[name]!;
    return {
      tex: itemScan(name),
      metres: s.metres,
      gray: s.gray,
    };
  };
  const world = (name: TextureSetName, metres: number) => {
    const t = setTextures(name);
    return { tex: { albedo: t.albedo, normal: t.normal }, metres, gray: !!(TEXTURE_SETS[name] as { gray?: boolean }).gray };
  };
  switch (family) {
    case 'metal':
      return key.includes('iron') || key.includes('dark') || key.includes('rust') || key.includes('verdigris') ? item('hammered') : item('metal');
    case 'wood':
      return key.includes('bark') ? world('bark', 0.5) : item('wood');
    case 'leather':
    case 'skin':
      return item('leather');
    case 'cloth':
      return world('cloth', 0.16);
    case 'bone':
      return world('bone', 0.3);
    case 'flesh':
      return world('flesh', 0.4);
    case 'crystal':
      return world('ice', 0.5);
    default:
      return world('slab', 0.6);
  }
}

interface TriOpts {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  scale: number;
  normalScale: number;
  roughVar: number;
  gain: number;
}

/** Patches a standard material to sample its maps triplanar in object space. */
function triplanar(m: THREE.MeshStandardMaterial, o: TriOpts): void {
  m.customProgramCacheKey = () => 'item-tri';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.triAlbedo = { value: o.albedo };
    sh.uniforms.triNormal = { value: o.normal };
    sh.uniforms.triScale = { value: o.scale };
    sh.uniforms.triNormalScale = { value: o.normalScale };
    sh.uniforms.triRoughVar = { value: o.roughVar };
    sh.uniforms.triGain = { value: o.gain };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float triScale;
varying vec3 vTriPos;
varying vec3 vTriN;
varying vec3 vO2V0;
varying vec3 vO2V1;
varying vec3 vO2V2;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vTriPos = position * triScale;
vTriN = normal;
vO2V0 = normalMatrix[ 0 ];
vO2V1 = normalMatrix[ 1 ];
vO2V2 = normalMatrix[ 2 ];`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D triAlbedo;
uniform sampler2D triNormal;
uniform float triNormalScale;
uniform float triRoughVar;
uniform float triGain;
varying vec3 vTriPos;
varying vec3 vTriN;
varying vec3 vO2V0;
varying vec3 vO2V1;
varying vec3 vO2V2;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 triNb = normalize( vTriN );
vec3 triW = pow( abs( triNb ), vec3( 4.0 ) );
triW /= ( triW.x + triW.y + triW.z );
vec4 triNx = texture2D( triNormal, vTriPos.zy );
vec4 triNy = texture2D( triNormal, vTriPos.xz );
vec4 triNz = texture2D( triNormal, vTriPos.xy );
vec4 triA = texture2D( triAlbedo, vTriPos.zy ) * triW.x + texture2D( triAlbedo, vTriPos.xz ) * triW.y + texture2D( triAlbedo, vTriPos.xy ) * triW.z;
diffuseColor.rgb *= min( vec3( 2.0 ), triA.rgb * triGain );`,
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
  vec3 tx = ( triNx.xyz * 2.0 - 1.0 ) * vec3( triNormalScale, triNormalScale, 1.0 );
  vec3 ty = ( triNy.xyz * 2.0 - 1.0 ) * vec3( triNormalScale, triNormalScale, 1.0 );
  vec3 tz = ( triNz.xyz * 2.0 - 1.0 ) * vec3( triNormalScale, triNormalScale, 1.0 );
  tx = vec3( tx.xy + triNb.zy, abs( tx.z ) * triNb.x );
  ty = vec3( ty.xy + triNb.xz, abs( ty.z ) * triNb.y );
  tz = vec3( tz.xy + triNb.xy, abs( tz.z ) * triNb.z );
  vec3 bn = normalize( tx.zyx * triW.x + ty.xzy * triW.y + tz.xyz * triW.z );
  normal = normalize( mat3( vO2V0, vO2V1, vO2V2 ) * bn );
  #ifdef DOUBLE_SIDED
    normal *= faceDirection;
  #endif
}`,
      );
  };
}

const cache = new Map<string, THREE.Material>();

function shared<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = make();
  m.userData.shared = true;
  cache.set(key, m);
  return m;
}

/** Splits 'cloth.silk|0x5a2618' into a key and its inline tint. */
function splitKey(key: string): { pal: string; tint?: number } {
  const [pal, t] = key.split('|');
  const tint = t !== undefined ? Number(t) : undefined;
  return { pal: pal!, tint: tint !== undefined && Number.isFinite(tint) ? tint : undefined };
}

export interface ItemSurfaceOpts {
  /** 0 pristine .. 1 battered: rougher, duller, deeper relief. */
  wear?: number;
  /** Multiplies the colour. */
  tint?: number;
  metalness?: number;
  roughness?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

/**
 * The material for a surface key on an item: 'metal.steel', 'wood.oak',
 * 'leather.worn', 'cloth.silk|0x5a2618' (inline tint names the dye).
 */
export function itemSurface(key: string, o: ItemSurfaceOpts = {}): THREE.MeshStandardMaterial {
  const { pal, tint: inline } = splitKey(key);
  const wear = Math.round(Math.min(1, Math.max(0, o.wear ?? 0.4)) * 3) / 3;
  const ck = `s|${pal}|${inline ?? ''}|${o.tint ?? ''}|${wear}|${o.metalness ?? ''}|${o.roughness ?? ''}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}`;
  return shared(ck, () => {
    const def = resolveSurface(pal);
    const family = def.family;
    const scan = scanFor(family, def.key);
    const info = TEXTURE_SETS[def.set] as { avg: number };
    const color = new THREE.Color(def.base ?? info.avg);
    if (inline !== undefined) {
      // On colourless scans the inline tint is the colour; on coloured ones it multiplies.
      if (def.base !== undefined) color.set(inline);
      else color.multiply(new THREE.Color(inline));
    }
    if (o.tint !== undefined) color.multiply(new THREE.Color(o.tint));
    const metalLike = def.metal > 0.5;
    // Torch-lit dungeons have little to reflect: full metal reads as black.
    // Keep some diffuse, and let the scratches carry the shine.
    const metal = o.metalness ?? (metalLike ? 0.72 - wear * 0.2 : def.metal);
    // A flat blade at low roughness mirrors one patch of a dark room and
    // turns black or sky blue with the angle, which reads as painted
    // plastic. A floor keeps it grey steel with a soft sheen at any angle.
    const rough = o.roughness ?? Math.min(0.95, Math.max(metalLike ? 0.3 : 0, (def.rough[0] * 0.6 + def.rough[1] * 0.4) * (metalLike ? 0.9 : 1) + wear * 0.18));
    if (wear > 0.5) color.multiplyScalar(1 - (wear - 0.5) * 0.25);
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
      envMapIntensity: metalLike ? 1.5 : 1,
    });
    const emissive = o.emissive ?? (family === 'crystal' ? def.emissive : undefined);
    if (emissive !== undefined) {
      m.emissive.set(emissive);
      m.emissiveIntensity = o.emissiveIntensity ?? def.emissiveIntensity ?? 0.6;
    }
    const avg = new THREE.Color(info.avg);
    const lum = Math.max(0.05, 0.2126 * avg.r + 0.7152 * avg.g + 0.0722 * avg.b);
    triplanar(m, {
      albedo: scan.tex.albedo,
      normal: scan.tex.normal,
      scale: 1 / scan.metres,
      normalScale: def.bump * (0.7 + wear * 0.6),
      roughVar: metalLike ? 0.9 : 0.7,
      // Grey item scans are pulled to 0.62; coloured world scans are divided by their own mean.
      gain: scan.gray ? 1.6 : 1 / lum,
    });
    m.name = `item:${def.key}`;
    return m;
  });
}

/** Runes, inlays, eyes and auras: lit from inside. */
export function glowMat(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return shared(`g|${color}|${intensity.toFixed(2)}`, () => {
    const c = new THREE.Color(color);
    const m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.18), emissive: c, emissiveIntensity: intensity, roughness: 0.35, metalness: 0 });
    m.name = 'item:glow';
    return m;
  });
}

/** A cut stone: glassy, a little light of its own. */
export function gemMat(color: number, glow = 0.35): THREE.MeshStandardMaterial {
  return shared(`gem|${color}|${glow.toFixed(2)}`, () => {
    const c = new THREE.Color(color);
    const m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.7), emissive: c, emissiveIntensity: glow, roughness: 0.08, metalness: 0.25, envMapIntensity: 2 });
    m.name = 'item:gem';
    return m;
  });
}

/** Crystal bodies (phase blades, crystal wands): clear, cold, glowing at the core. */
export function crystalMat(color: number, glow: number, intensity = 0.55): THREE.MeshStandardMaterial {
  return shared(`cr|${color}|${glow}|${intensity.toFixed(2)}`, () => {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.8),
      emissive: new THREE.Color(glow),
      emissiveIntensity: intensity,
      roughness: 0.12,
      metalness: 0.1,
      envMapIntensity: 1.8,
      transparent: true,
      opacity: 0.88,
    });
    m.name = 'item:crystal';
    return m;
  });
}

/** Ghostly additive light: the missing half of a blade, smoke, a halo. */
export function ghostMat(color: number, opacity = 0.45): THREE.MeshBasicMaterial {
  return shared(`gh|${color}|${opacity}`, () => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    m.name = 'item:ghost';
    return m;
  });
}

/** Bow strings, thread, sinew. */
export function stringMat(color = 0xcfc4a8): THREE.MeshStandardMaterial {
  return shared(`str|${color}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });
    m.name = 'item:string';
    return m;
  });
}

/** Liquids in flasks: deep colour with a glow, seen through glass. */
export function liquidMat(color: number): THREE.MeshStandardMaterial {
  return shared(`liq|${color}`, () => {
    const c = new THREE.Color(color);
    const m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.5), emissive: c, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0 });
    m.name = 'item:liquid';
    return m;
  });
}

/** Clear glass for flasks and lenses. */
export function glassMat(): THREE.MeshStandardMaterial {
  return shared('glass', () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xd8e4ea, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, envMapIntensity: 2.2, depthWrite: false });
    m.name = 'item:glass';
    return m;
  });
}

/**
 * One small mesh in each kind of item material, for the curtain's warm-up
 * (DungeonScene.warmup). A drop's first glowing rune, gem or flask linked
 * its shader on the frame it fell, mid-fight. Materials are the shared
 * ones; only the returned geometry is the caller's to free.
 */
export function itemLookStandIns(): { meshes: THREE.Mesh[]; geometry: THREE.BufferGeometry } {
  const geometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const mats: THREE.Material[] = [
    itemSurface('metal.steel'),
    glowMat(0xffffff),
    gemMat(0xffffff),
    crystalMat(0xffffff, 0.5),
    ghostMat(0xffffff),
    stringMat(),
    liquidMat(0xffffff),
    glassMat(),
  ];
  return { meshes: mats.map((m) => new THREE.Mesh(geometry, m)), geometry };
}

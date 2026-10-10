/**
 * SLAY — world-space materials for level geometry and terrain.
 *
 * Floors, walls, cliffs and open ground do not carry UVs that mean anything:
 * they are mapped from world position, so a texture keeps its real size
 * (metres per tile, from the scan) on every face and nothing stretches.
 *
 *  - Projection: floors take the top-down plane only. Walls and terrain are
 *    triplanar: each face picks the planes its normal leans into, and planes
 *    with almost no weight are skipped, so an axis-aligned wall costs one.
 *  - Tiling breakup: every sample is taken twice at two offsets chosen by a
 *    slow world noise and blended along the texture's own detail, so thirty
 *    metres of floor never reads as fifteen copies of one stone.
 *  - Layers: up to four surfaces on one mesh (stone, mud, grass, path...),
 *    weighted per vertex by `aSplat` (layers 1..3; layer 0 takes the rest) and
 *    blended by height, so mud fills the gaps between cobbles before it
 *    covers them.
 *  - World context from the builder through `aEnv`: on floors and terrain it
 *    is contact occlusion (1 = tucked into a corner), on walls the height
 *    above the floor in metres, which darkens and dirties the foot of every
 *    wall; above 150 on a wall marks a cap (the cut top of the masonry).
 *  - Damp patches, grime and broad colour drift on top.
 *  - Optional cutaway (walls between the camera and the hero open in a small
 *    dithered tube) and roof dissolve (a lid opens around the hero).
 *
 * Each call makes a private material; the caller owns disposal. Materials of
 * the same shape (kind, layer count, flags) share one shader program.
 */

import * as THREE from 'three';
import { resolveSurface } from './SurfaceLibrary';
import { setTextures, TEXTURE_SETS, type TextureSetInfo } from './TextureSets';

/** The vertex attribute carrying world context. See the header. */
export const WORLD_ENV_ATTRIBUTE = 'aEnv';
/** The vertex attribute carrying layer weights 1..3 (vec3). */
export const WORLD_SPLAT_ATTRIBUTE = 'aSplat';
/** `aEnv` written on wall tops. Anything above 150 on a wall is a cap. */
export const WORLD_CAP_ENV = 199;

export interface WorldLayer {
  /** A surface key ('stone.crypt', 'ground.mud') or a set ('tex.cobble'). */
  key: string;
  /** Metres per texture tile; defaults to the scan's real size. */
  metres?: number;
  /** Extra multiplicative tint (sRGB hex). */
  tint?: number;
  /** Normal strength multiplier. */
  bump?: number;
  /** Roughness multiplier. */
  rough?: number;
  /** Emission colour and strength for sets that carry an emission map. */
  emissive?: number;
  emissiveIntensity?: number;
}

export interface WorldMaterialOpts {
  layers: WorldLayer[];
  /** See the header for what `aEnv` means for each. */
  kind: 'floor' | 'wall' | 'terrain';
  /** Colour that settles into corners and along wall feet. */
  grime?: number;
  grimeAmount?: number;
  /** 0..1 how much of the surface is damp: darker, glossier, flatter. */
  wet?: number;
  /** 0..1 strength of broad light/dark drift. */
  variation?: number;
  /** 0..1 strength of the contact shadow from `aEnv`. */
  contact?: number;
  /** Open a sightline hole in front of the hero (walls). */
  cutaway?: boolean;
  /** Dissolve around the hero (roof lids, ceilings). See `setWorldRoof`. */
  roof?: boolean;
  /** Two-sample tiling breakup. On by default. */
  detile?: boolean;
  side?: THREE.Side;
  /** Uniform multiplier on every layer's colour (sRGB hex). */
  tint?: number;
}

/**
 * See-through for walls standing between the camera and the hero: xyz is the
 * hero's chest, w the radius of the cut (0 switches it off). One object
 * shared by every cutaway material, written each frame by the level.
 *
 * Only a small dithered hole along the sightline and only in front of the
 * hero: side walls level with the hero, and everything behind, stay solid.
 * Shadow and AO passes use their own materials and are not cut.
 */
export const worldCutaway = { value: new THREE.Vector4(0, 0, 0, 0) };

export function setWorldCutaway(x: number, y: number, z: number, radius: number): void {
  worldCutaway.value.set(x, y, z, radius);
}

/**
 * The roof dissolve shared by every lid and ceiling: x, y = world x, z of the
 * hero, z = radius of the opening in metres (0 closes it).
 */
export const worldRoof = { value: new THREE.Vector3(0, 0, 0) };

export function setWorldRoof(x: number, z: number, radius: number): void {
  worldRoof.value.set(x, z, radius);
}

const CUTAWAY_GLSL = /* glsl */ `
  if (uCut.w > 0.0) {
    vec3 cutD = uCut.xyz - cameraPosition;
    float cutL = length(cutD);
    vec3 cutN = cutD / max(cutL, 1e-3);
    vec3 cutR = vSlPos - cameraPosition;
    float cutT = dot(cutR, cutN);
    float cutP = length(cutR - cutN * cutT);
    float cutA = max(smoothstep(uCut.w * 0.6, uCut.w, cutP), smoothstep(cutL - 1.4, cutL - 0.7, cutT));
    float cutH = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (cutA < cutH) discard;
  }
`;

const ROOF_GLSL = /* glsl */ `
  {
    float roofD = distance(vSlPos.xz, uRoof.xy);
    float roofA = smoothstep(uRoof.z * 0.62, uRoof.z, roofD);
    float roofN = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (roofA < roofN) discard;
  }
`;

/**
 * The same cutaway on any private material (trim, plinths, wall dressing
 * that would otherwise float in the hole). Never call it on a cached
 * `surface()`; it replaces `onBeforeCompile`.
 */
export function addWorldCutaway<M extends THREE.Material>(mat: M): M {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.uniforms.uCut = worldCutaway;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSlPos;')
      .replace(
        '#include <project_vertex>',
        [
          '#include <project_vertex>',
          'vec4 slCutP = vec4( transformed, 1.0 );',
          '#ifdef USE_INSTANCING',
          '  slCutP = instanceMatrix * slCutP;',
          '#endif',
          'vSlPos = ( modelMatrix * slCutP ).xyz;',
        ].join('\n'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSlPos;\nuniform vec4 uCut;')
      .replace('#include <clipping_planes_fragment>', `${CUTAWAY_GLSL}\n#include <clipping_planes_fragment>`);
  };
  mat.customProgramCacheKey = () => `${prevKey}|cutaway`;
  return mat;
}

// ---------------------------------------------------------------------------
// Shader generation
// ---------------------------------------------------------------------------

const COMMON_GLSL = /* glsl */ `
  float slHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float slNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(slHash(i), slHash(i + vec2(1.0, 0.0)), f.x), mix(slHash(i + vec2(0.0, 1.0)), slHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // Two offset taps blended along the texture's own detail. k is a slow
  // world-space noise, so the offset pair changes every few metres.
  void slTap(sampler2D A, sampler2D N, vec2 uv, vec2 dx, vec2 dy, float k, out vec4 a, out vec4 n, out float t, out vec2 oa, out vec2 ob) {
  #ifdef SL_DETILE
    float l = k * 7.0;
    float ia = floor(l);
    float f = fract(l);
    oa = sin(vec2(3.0, 7.0) * ia);
    ob = sin(vec2(3.0, 7.0) * (ia + 1.0));
    vec4 a0 = textureGrad(A, uv + oa, dx, dy);
    vec4 a1 = textureGrad(A, uv + ob, dx, dy);
    t = smoothstep(0.2, 0.8, f - 0.1 * dot(a0.rgb - a1.rgb, vec3(1.0)));
    a = mix(a0, a1, t);
    n = mix(textureGrad(N, uv + oa, dx, dy), textureGrad(N, uv + ob, dx, dy), t);
  #else
    oa = vec2(0.0);
    ob = vec2(0.0);
    t = 0.0;
    a = textureGrad(A, uv, dx, dy);
    n = textureGrad(N, uv, dx, dy);
  #endif
  }
`;

interface Proj {
  /** Weight component of slW. */
  w: string;
  uv: string;
  dx: string;
  dy: string;
  /** Tangent normal t -> world, minus the axis normal. */
  delta: string;
}

const PROJ: Record<'x' | 'y' | 'z', Proj> = {
  y: {
    w: 'slW.y',
    uv: 'vec2(slP.x, -slSg.y * slP.z)',
    dx: 'vec2(slDx.x, -slSg.y * slDx.z)',
    dy: 'vec2(slDy.x, -slSg.y * slDy.z)',
    delta: 'vec3(tt.x, slSg.y * tt.z, -slSg.y * tt.y) - vec3(0.0, slSg.y, 0.0)',
  },
  x: {
    w: 'slW.x',
    uv: 'vec2(-slSg.x * slP.z, slP.y)',
    dx: 'vec2(-slSg.x * slDx.z, slDx.y)',
    dy: 'vec2(-slSg.x * slDy.z, slDy.y)',
    delta: 'vec3(slSg.x * tt.z, tt.y, -slSg.x * tt.x) - vec3(slSg.x, 0.0, 0.0)',
  },
  z: {
    w: 'slW.z',
    uv: 'vec2(slSg.z * slP.x, slP.y)',
    dx: 'vec2(slSg.z * slDx.x, slDx.y)',
    dy: 'vec2(slSg.z * slDy.x, slDy.y)',
    delta: 'vec3(slSg.z * tt.x, tt.y, slSg.z * tt.z) - vec3(0.0, 0.0, slSg.z)',
  },
};

/** How a layer glows: not at all, from its emission map, or from the low points of its relief. */
type Glow = 0 | 1 | 2;

function layerGlsl(i: number, axes: Array<'x' | 'y' | 'z'>, emissive: Glow): string {
  const lines: string[] = [];
  lines.push(`if (slB${i} > 0.0) {`);
  lines.push(`  float s = slP${i}.x;`);
  lines.push('  vec4 la = vec4(0.0); float lr = 0.0; vec3 ld = vec3(0.0); vec3 le = vec3(0.0);');
  for (const ax of axes) {
    const p = PROJ[ax];
    lines.push(`  if (${p.w} > 0.0) {`);
    lines.push('    vec4 a; vec4 n; float tb; vec2 oa; vec2 ob;');
    lines.push(`    vec2 puv = ${p.uv} * s;`);
    lines.push(`    vec2 pdx = ${p.dx} * s;`);
    lines.push(`    vec2 pdy = ${p.dy} * s;`);
    lines.push(`    slTap(slA${i}, slN${i}, puv, pdx, pdy, slK, a, n, tb, oa, ob);`);
    lines.push(`    la += a * ${p.w};`);
    lines.push(`    lr += n.a * ${p.w};`);
    lines.push('    vec3 tt = n.xyz * 2.0 - 1.0;');
    lines.push(`    tt.xy *= slP${i}.y;`);
    lines.push(`    ld += (${p.delta}) * ${p.w};`);
    if (emissive === 1) {
      lines.push(`    le += mix(textureGrad(slE${i}, puv + oa, pdx, pdy).rgb, textureGrad(slE${i}, puv + ob, pdx, pdy).rgb, tb) * ${p.w};`);
    } else if (emissive === 2) {
      // No emission map: light pools in the cracks and hollows of the relief.
      lines.push(`    float cav = 1.0 - a.a; le += vec3(cav * cav * cav * 2.0) * ${p.w};`);
    }
    lines.push('  }');
  }
  lines.push(`  slAlb += la.rgb * slT${i} * slB${i};`);
  lines.push(`  slRoughV += mix(slR${i}.x, slR${i}.y, lr) * slB${i};`);
  lines.push(`  slMetalV += slR${i}.z * slB${i};`);
  lines.push(`  slDN += ld * slB${i};`);
  if (emissive) lines.push(`  slEmis += le * slEC${i} * slB${i};`);
  lines.push('}');
  return lines.join('\n');
}

/** Heights must be known before the blend weights, so each layer's height is tapped once up front. */
function heightGlsl(i: number, axis: 'x' | 'y' | 'z'): string {
  const p = PROJ[axis];
  return `float slH${i} = slWt${i} > 0.001 ? textureGrad(slA${i}, ${p.uv} * slP${i}.x, ${p.dx} * slP${i}.x, ${p.dy} * slP${i}.x).a : 0.0;`;
}

interface Built {
  vertex: (src: string) => string;
  fragment: (src: string) => string;
  key: string;
}

function buildShader(o: WorldMaterialOpts, emissiveMask: Glow[]): Built {
  const n = Math.max(1, Math.min(4, o.layers.length));
  const floorOnly = o.kind === 'floor';
  const axes: Array<'x' | 'y' | 'z'> = floorOnly ? ['y'] : ['y', 'x', 'z'];
  const detile = o.detile !== false;
  const wall = o.kind === 'wall';

  const vertex = (src: string): string =>
    src
      .replace(
        '#include <common>',
        [
          '#include <common>',
          `attribute float ${WORLD_ENV_ATTRIBUTE};`,
          n > 1 ? `attribute vec3 ${WORLD_SPLAT_ATTRIBUTE};` : '',
          n > 1 ? 'varying vec3 vSlSplat;' : '',
          'varying float vSlEnv;',
          'varying vec3 vSlPos;',
          'varying vec3 vSlNor;',
        ].join('\n'),
      )
      .replace(
        '#include <project_vertex>',
        [
          '#include <project_vertex>',
          'vec4 slWp = vec4( transformed, 1.0 );',
          'vec3 slWn = objectNormal;',
          '#ifdef USE_INSTANCING',
          '  slWp = instanceMatrix * slWp;',
          '  slWn = mat3( instanceMatrix ) * slWn;',
          '#endif',
          'vSlPos = ( modelMatrix * slWp ).xyz;',
          'vSlNor = normalize( mat3( modelMatrix ) * slWn );',
          `vSlEnv = ${WORLD_ENV_ATTRIBUTE};`,
          n > 1 ? `vSlSplat = ${WORLD_SPLAT_ATTRIBUTE};` : '',
        ].join('\n'),
      );

  const pars: string[] = [
    '#include <common>',
    detile ? '#define SL_DETILE' : '',
    'varying float vSlEnv;',
    'varying vec3 vSlPos;',
    'varying vec3 vSlNor;',
    n > 1 ? 'varying vec3 vSlSplat;' : '',
    'uniform vec3 uGrime;',
    'uniform vec4 uWorld;',
    o.cutaway ? 'uniform vec4 uCut;' : '',
    o.roof ? 'uniform vec3 uRoof;' : '',
  ];
  for (let i = 0; i < n; i++) {
    pars.push(`uniform sampler2D slA${i};`, `uniform sampler2D slN${i};`, `uniform vec2 slP${i};`, `uniform vec3 slT${i};`, `uniform vec3 slR${i};`);
    if (emissiveMask[i] === 1) pars.push(`uniform sampler2D slE${i};`);
    if (emissiveMask[i]) pars.push(`uniform vec3 slEC${i};`);
  }
  pars.push(COMMON_GLSL);

  const body: string[] = [];
  body.push('vec3 slP = vSlPos;');
  body.push('vec3 slDx = dFdx(vSlPos);');
  body.push('vec3 slDy = dFdy(vSlPos);');
  body.push('vec3 slNg = normalize(vSlNor);');
  body.push('vec3 slSg = vec3(slNg.x >= 0.0 ? 1.0 : -1.0, slNg.y >= 0.0 ? 1.0 : -1.0, slNg.z >= 0.0 ? 1.0 : -1.0);');
  if (floorOnly) {
    body.push('vec3 slW = vec3(0.0, 1.0, 0.0);');
  } else {
    body.push('vec3 slW = pow(abs(slNg), vec3(4.0));');
    body.push('slW /= max(slW.x + slW.y + slW.z, 1e-4);');
    body.push('slW = max(slW - 0.04, 0.0);');
    body.push('slW /= max(slW.x + slW.y + slW.z, 1e-4);');
  }
  body.push('float slK = slNoise(slP.xz * 0.11 + slP.y * 0.07);');
  // Layer weights.
  if (n > 1) {
    body.push('float slWt1 = vSlSplat.x;');
    body.push('float slWt2 = vSlSplat.y;');
    body.push('float slWt3 = vSlSplat.z;');
    body.push('float slWt0 = max(0.0, 1.0 - (slWt1 + slWt2 + slWt3));');
    // Dominant projection for the height taps.
    const dom = floorOnly ? 'y' : null;
    for (let i = 0; i < n; i++) {
      if (dom) body.push(heightGlsl(i, dom));
      else {
        body.push(`float slH${i} = 0.0;`);
        body.push(`if (slWt${i} > 0.001) {`);
        body.push(`  if (slW.y >= max(slW.x, slW.z)) { ${heightGlsl(i, 'y').replace(`float slH${i} =`, `slH${i} =`)} }`);
        body.push(`  else if (slW.x >= slW.z) { ${heightGlsl(i, 'x').replace(`float slH${i} =`, `slH${i} =`)} }`);
        body.push(`  else { ${heightGlsl(i, 'z').replace(`float slH${i} =`, `slH${i} =`)} }`);
        body.push('}');
      }
    }
    for (let i = 0; i < n; i++) body.push(`float slS${i} = slWt${i} > 0.001 ? slWt${i} + slH${i} * 0.55 : -10.0;`);
    const maxExpr = Array.from({ length: n }, (_, i) => `slS${i}`).reduce((a, b) => `max(${a}, ${b})`);
    body.push(`float slMx = ${maxExpr} - 0.2;`);
    for (let i = 0; i < n; i++) body.push(`float slB${i} = max(slS${i} - slMx, 0.0);`);
    const sum = Array.from({ length: n }, (_, i) => `slB${i}`).join(' + ');
    body.push(`float slBs = max(${sum}, 1e-4);`);
    for (let i = 0; i < n; i++) body.push(`slB${i} /= slBs;`);
  } else {
    body.push('float slB0 = 1.0;');
  }
  body.push('vec3 slAlb = vec3(0.0); float slRoughV = 0.0; float slMetalV = 0.0; vec3 slDN = vec3(0.0); vec3 slEmis = vec3(0.0);');
  for (let i = 0; i < n; i++) body.push(layerGlsl(i, axes, emissiveMask[i]!));

  // World context: drift, damp, grime, contact, caps.
  body.push('vec2 wsP = abs(slNg.y) > 0.5 ? slP.xz : vec2(slP.x + slP.z, slP.y * 1.3);');
  body.push('float wsA = slNoise(wsP * (1.0 / 23.0)) * 0.65 + slNoise(wsP * (1.0 / 9.0) + 3.1) * 0.35;');
  body.push('float wsB = slNoise(wsP * (1.0 / 6.1) + vec2(0.37, 0.71));');
  body.push('float wsC = slNoise(wsP * (1.0 / 3.3) + vec2(7.1, 2.3));');
  body.push(wall ? 'float wsContact = 1.0 - smoothstep(0.0, 1.5, vSlEnv);' : 'float wsContact = smoothstep(0.15, 1.0, vSlEnv);');
  body.push('float wsBroad = (wsA - 0.5) * 2.0;');
  body.push('slAlb *= 1.0 + wsBroad * 0.24 * uWorld.z;');
  body.push('vec3 wsHue = uGrime / max(max(uGrime.r, uGrime.g), max(uGrime.b, 0.001));');
  body.push('float wsBlot = smoothstep(0.45, 0.85, wsB * 0.7 + wsA * 0.3);');
  body.push('slAlb *= mix(vec3(1.0), wsHue * 0.74, wsBlot * 0.45 * uWorld.z);');
  body.push(
    wall
      ? 'float wsWet = uWorld.y * smoothstep(0.45, 0.8, wsA + wsContact * 0.35) * (1.0 - smoothstep(0.4, 2.2, vSlEnv));'
      : 'float wsWet = uWorld.y * smoothstep(1.0 - uWorld.y * 0.75, 1.0 - uWorld.y * 0.75 + 0.22, wsA * 0.8 + wsC * 0.2 + wsContact * 0.15);',
  );
  body.push('slAlb *= 1.0 - wsWet * 0.42;');
  body.push('float wsG = clamp(wsContact * (0.55 + wsB * 0.6), 0.0, 1.0) * uWorld.x;');
  body.push('slAlb = mix(slAlb, uGrime, wsG * 0.5);');
  body.push(wall ? 'float wsCap = step(150.0, vSlEnv);' : 'const float wsCap = 0.0;');
  body.push('slAlb *= 1.0 - wsCap * 0.55;');
  body.push('diffuseColor.rgb *= slAlb;');

  const fragment = (src: string): string => {
    let s = src
      .replace('#include <common>', pars.filter(Boolean).join('\n'))
      .replace('#include <map_fragment>', body.join('\n'))
      .replace(
        '#include <roughnessmap_fragment>',
        [
          'float roughnessFactor = roughness * slRoughV;',
          'roughnessFactor *= mix(0.88, 1.06, wsC);',
          'roughnessFactor = mix(roughnessFactor, 0.2, wsWet * 0.85);',
          'roughnessFactor = mix(roughnessFactor, 1.0, wsCap);',
        ].join('\n'),
      )
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * slMetalV;')
      .replace(
        '#include <normal_fragment_maps>',
        [
          // Standing water fills the crevices: relief flattens where it is wet.
          'vec3 slWN = normalize(slNg + slDN * (1.0 - max(wsWet * 0.7, wsCap * 0.6)));',
          'normal = normalize(mat3(viewMatrix) * slWN);',
        ].join('\n'),
      )
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += slEmis;')
      .replace(
        '#include <aomap_fragment>',
        [
          '#include <aomap_fragment>',
          'float wsOcc = 1.0 - wsContact * uWorld.w * 0.65;',
          'reflectedLight.indirectDiffuse *= wsOcc;',
          'reflectedLight.indirectSpecular *= wsOcc;',
          'reflectedLight.directDiffuse *= 1.0 - wsContact * uWorld.w * 0.22;',
        ].join('\n'),
      );
    const discards = `${o.cutaway ? CUTAWAY_GLSL : ''}${o.roof ? ROOF_GLSL : ''}`;
    if (discards) s = s.replace('#include <clipping_planes_fragment>', `${discards}\n#include <clipping_planes_fragment>`);
    return s;
  };

  const key = `world|${o.kind}|${n}|${emissiveMask.join('')}|${detile ? 1 : 0}|${o.cutaway ? 1 : 0}|${o.roof ? 1 : 0}`;
  return { vertex, fragment, key };
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

function tintOf(key: string, extra: number | undefined, global: number | undefined): THREE.Color {
  const def = resolveSurface(key);
  const info: TextureSetInfo = TEXTURE_SETS[def.set];
  const out = new THREE.Color(1, 1, 1);
  if (def.base !== undefined) {
    const avg = new THREE.Color(info.avg);
    const base = new THREE.Color(def.base);
    const k = def.tintAmount ?? (info.gray ? 1 : 0.6);
    out.setRGB(
      1 + (base.r / Math.max(avg.r, 0.004) - 1) * k,
      1 + (base.g / Math.max(avg.g, 0.004) - 1) * k,
      1 + (base.b / Math.max(avg.b, 0.004) - 1) * k,
    );
  }
  if (extra !== undefined) out.multiply(new THREE.Color(extra));
  if (global !== undefined) out.multiply(new THREE.Color(global));
  return out;
}

/**
 * A private world-space material. See the header for the vertex attributes
 * it reads. The caller owns disposal (the textures are shared and stay).
 */
export function worldMaterial(o: WorldMaterialOpts): THREE.MeshStandardMaterial {
  const layers = o.layers.slice(0, 4);
  if (!layers.length) layers.push({ key: 'stone.crypt' });
  const uniforms: Record<string, THREE.IUniform> = {
    uGrime: { value: new THREE.Color(o.grime ?? 0x2a2622) },
    uWorld: { value: new THREE.Vector4(o.grimeAmount ?? 0.6, o.wet ?? 0, o.variation ?? 0.8, o.contact ?? 0.85) },
  };
  if (o.cutaway) uniforms.uCut = worldCutaway;
  if (o.roof) uniforms.uRoof = worldRoof;
  const emissiveMask: Glow[] = [];
  layers.forEach((l, i) => {
    const def = resolveSurface(l.key);
    const tex = setTextures(def.set);
    const metres = l.metres ?? def.metres ?? TEXTURE_SETS[def.set].metres;
    uniforms[`slA${i}`] = { value: tex.albedo };
    uniforms[`slN${i}`] = { value: tex.normal };
    uniforms[`slP${i}`] = { value: new THREE.Vector2(1 / Math.max(0.05, metres), def.bump * (l.bump ?? 1)) };
    uniforms[`slT${i}`] = { value: tintOf(l.key, l.tint, o.tint) };
    uniforms[`slR${i}`] = { value: new THREE.Vector3(def.rough[0] * (l.rough ?? 1), Math.min(1, def.rough[1] * (l.rough ?? 1)), def.metal) };
    const glowColor = l.emissive ?? def.emissive;
    const glow: Glow = tex.emissive ? 1 : glowColor !== undefined ? 2 : 0;
    emissiveMask.push(glow);
    if (glow) {
      const c = new THREE.Color(glowColor ?? 0xff6020).multiplyScalar(l.emissiveIntensity ?? def.emissiveIntensity ?? (glow === 1 ? 1.5 : 0.4));
      if (tex.emissive) uniforms[`slE${i}`] = { value: tex.emissive };
      uniforms[`slEC${i}`] = { value: c };
    }
  });

  const built = buildShader({ ...o, layers }, emissiveMask);
  const mat = new THREE.MeshStandardMaterial({
    name: `world:${o.kind}:${layers.map((l) => resolveSurface(l.key).key).join('+')}`,
    roughness: 1,
    metalness: 1,
    side: o.side ?? THREE.FrontSide,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = built.vertex(shader.vertexShader);
    shader.fragmentShader = built.fragment(shader.fragmentShader);
  };
  mat.customProgramCacheKey = () => built.key;
  mat.userData.world = uniforms;
  mat.userData.shared = false;
  return mat;
}

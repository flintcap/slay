/**
 * SLAY — liquid surfaces: water, lava, sludge, ice and void.
 *
 * A liquid used to be one flat glossy colour. Everything that makes a pool read
 * as liquid from a top-down camera is motion and edges: ripples that move the
 * reflections, a lighter, frothier rim where it meets the bank, depth that
 * darkens toward the middle, and for lava a crust that drifts over a hotter
 * glow underneath. All of it comes from one shared world-scale noise texture
 * sampled at scrolling offsets, so a level's liquid is one material and one
 * program whatever its size.
 *
 * Geometry feeds an `aEnv` attribute: 1 on a vertex touching the bank, 0 in
 * open liquid. See `DungeonBuilder`.
 */

import * as THREE from 'three';
import { macroNoiseTexture } from './Textures';
import { WORLD_ENV_ATTRIBUTE } from './WorldSurface';

export type LiquidStyle = 'water' | 'lava' | 'sludge' | 'ice' | 'voidwater';

export interface LiquidSurface {
  material: THREE.MeshStandardMaterial;
  /** Advance the flow. Cheap: writes one uniform. */
  update(elapsed: number): void;
  dispose(): void;
}

interface LiquidTuning {
  /** Ripple slope strength, in normal units. */
  ripple: number;
  /** Flow speed, metres per second of noise scroll. */
  speed: number;
  /** Feature scale: metres per noise tile for the two layers. */
  scaleA: number;
  scaleB: number;
  /** 0..1 rim froth or crust at the bank. */
  rim: number;
  rimColor: number;
  /** 1 = molten: crust over a hot emissive glow. */
  molten: number;
  roughness: number;
  metalness: number;
  opacity: number;
  emissiveIntensity: number;
}

const TUNING: Record<LiquidStyle, LiquidTuning> = {
  water: {
    ripple: 0.55,
    speed: 0.16,
    scaleA: 5.5,
    scaleB: 2.3,
    // Froth is patchy and dim. At 0.55 of a pale grey-blue every one-tile
    // pool (all four corners on the bank) rendered as a white-rimmed hole.
    rim: 0.32,
    rimColor: 0x6f878c,
    molten: 0,
    roughness: 0.05,
    metalness: 0.1,
    opacity: 0.84,
    emissiveIntensity: 0.6,
  },
  sludge: {
    ripple: 0.3,
    speed: 0.05,
    scaleA: 4,
    scaleB: 1.7,
    rim: 0.7,
    rimColor: 0x6a7a2a,
    molten: 0,
    roughness: 0.28,
    metalness: 0.05,
    opacity: 0.96,
    emissiveIntensity: 0.6,
  },
  ice: {
    ripple: 0.22,
    speed: 0,
    scaleA: 6,
    scaleB: 2.5,
    rim: 0.6,
    rimColor: 0xe0f0ff,
    molten: 0,
    roughness: 0.08,
    metalness: 0.05,
    opacity: 0.88,
    emissiveIntensity: 0.3,
  },
  lava: {
    ripple: 0.35,
    speed: 0.09,
    scaleA: 6.5,
    scaleB: 2.6,
    rim: 0.8,
    rimColor: 0x1a0d08,
    molten: 1,
    roughness: 0.75,
    metalness: 0,
    opacity: 1,
    emissiveIntensity: 2.8,
  },
  voidwater: {
    ripple: 0.4,
    speed: 0.07,
    scaleA: 7,
    scaleB: 3,
    rim: 0.7,
    rimColor: 0x0a0414,
    molten: 1,
    roughness: 0.3,
    metalness: 0.2,
    opacity: 1,
    emissiveIntensity: 2.2,
  },
};

/**
 * Builds the liquid material for a level. `color` is the body colour and
 * `glow` the emissive colour (black for plain water). The caller owns it.
 */
export function liquidSurface(style: LiquidStyle, color: number, glow: number): LiquidSurface {
  const t = TUNING[style];
  const transparent = t.opacity < 0.999;
  const mat = new THREE.MeshStandardMaterial({
    name: `liquid:${style}`,
    color,
    emissive: new THREE.Color(glow),
    emissiveIntensity: t.emissiveIntensity,
    roughness: t.roughness,
    metalness: t.metalness,
    transparent,
    opacity: t.opacity,
    depthWrite: !transparent,
  });
  const uniforms = {
    uLqTime: { value: 0 },
    uLqMacro: { value: macroNoiseTexture() },
    uLqRim: { value: new THREE.Color(t.rimColor) },
    uLqTune: { value: new THREE.Vector4(t.ripple, t.speed, t.rim, t.molten) },
    uLqScale: { value: new THREE.Vector2(1 / t.scaleA, 1 / t.scaleB) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute float ${WORLD_ENV_ATTRIBUTE};\nvarying float vLqShore;\nvarying vec3 vLqPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvLqShore = ${WORLD_ENV_ATTRIBUTE};\nvLqPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying float vLqShore;',
          'varying vec3 vLqPos;',
          'uniform float uLqTime;',
          'uniform sampler2D uLqMacro;',
          'uniform vec3 uLqRim;',
          'uniform vec4 uLqTune;',
          'uniform vec2 uLqScale;',
        ].join('\n'),
      )
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          // Two noise layers drifting against each other: the interference is
          // what reads as moving liquid rather than a sliding picture.
          'float lqT = uLqTime * uLqTune.y;',
          'vec2 lqP = vLqPos.xz;',
          'vec4 lqA = texture2D(uLqMacro, lqP * uLqScale.x + vec2(lqT, lqT * 0.6));',
          'vec4 lqB = texture2D(uLqMacro, lqP * uLqScale.y + vec2(-lqT * 0.7, lqT * 1.3) + 0.5);',
          'vec2 lqSlope = (lqA.rg - 0.5) + (lqB.ga - 0.5) * 0.8;',
          'float lqShore = smoothstep(0.05, 1.0, vLqShore);',
          // Rim: froth on water, cooled crust on lava, broken up by the noise
          // so the bank line is ragged rather than ruled.
          'float lqRim = smoothstep(0.45, 0.95, lqShore + (lqB.b - 0.5) * 0.6) * uLqTune.z;',
          // Molten: a crust field drifting over the glow. Crust where the
          // combined noise is high; hot seams where it is low.
          'float lqHeat = 1.0;',
          'if (uLqTune.w > 0.5) {',
          '  float n = lqA.b * 0.6 + lqB.r * 0.4;',
          '  float crust = smoothstep(0.42, 0.6, n + lqShore * 0.25);',
          '  lqHeat = (1.0 - crust) * (0.75 + 0.25 * sin(uLqTime * 1.7 + lqA.a * 9.0));',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, uLqRim, crust * 0.92);',
          '} else {',
          // Depth: liquid darkens away from the bank.
          '  diffuseColor.rgb *= mix(0.55, 1.0, lqShore);',
          // Foam gathers in clots along the bank, not as a ruled line.
          '  lqRim *= smoothstep(0.42, 0.68, lqA.g * 0.6 + lqB.r * 0.4);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, uLqRim, lqRim * 0.55);',
          '  diffuseColor.a = mix(diffuseColor.a, 1.0, lqRim * 0.6);',
          '}',
        ].join('\n'),
      )
      .replace(
        '#include <roughnessmap_fragment>',
        [
          '#include <roughnessmap_fragment>',
          'roughnessFactor = mix(roughnessFactor, 0.85, uLqTune.w > 0.5 ? (1.0 - lqHeat) * 0.4 : lqRim * 0.6);',
        ].join('\n'),
      )
      .replace(
        '#include <normal_fragment_maps>',
        [
          '#include <normal_fragment_maps>',
          'vec3 lqN = vec3(-lqSlope.x, 0.0, -lqSlope.y) * uLqTune.x;',
          'normal = normalize(normal + (viewMatrix * vec4(lqN, 0.0)).xyz);',
        ].join('\n'),
      )
      .replace(
        '#include <emissivemap_fragment>',
        [
          '#include <emissivemap_fragment>',
          // Water: a faint caustic shimmer where the two layers peak together.
          // Molten: the glow lives in the seams only.
          'float lqCaustic = smoothstep(0.62, 0.8, lqA.r * 0.5 + lqB.g * 0.5);',
          'totalEmissiveRadiance *= uLqTune.w > 0.5 ? lqHeat * (1.0 + lqHeat) : (0.6 + lqCaustic * 1.4);',
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => 'liquidSurface';
  return {
    material: mat,
    update(elapsed: number): void {
      uniforms.uLqTime.value = elapsed;
    },
    dispose(): void {
      mat.dispose();
    },
  };
}

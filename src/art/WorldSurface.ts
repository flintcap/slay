/**
 * SLAY — world-space surface layer for level geometry.
 *
 * A material texture tiles every couple of metres; from the game camera thirty
 * metres of floor is fifteen copies of the same flagstones. Detail inside one
 * tile cannot hide that. What hides it is variation *across* tiles that the
 * tile knows nothing about, plus the grounding a real room has where its floor
 * meets its walls. This module adds both, in one shader patch shared by every
 * floor and wall in a level.
 */

import * as THREE from 'three';
import { surfaceVariant, type SurfaceOpts } from './Materials';
import { macroNoiseTexture } from './Textures';
import { resolvePalette } from './Palettes';

/** How an environment surface sits in the world, beyond what its texture knows. */
export interface WorldSurfaceOpts {
  /**
   * 'floor' reads the `aEnv` vertex attribute as contact occlusion, 0..1 (1 is
   * tucked into a corner against a wall). 'wall' reads it as height above the
   * floor in metres, and darkens and dirties the first metre or so.
   */
  kind: 'floor' | 'wall';
  /** Colour that settles into corners and along wall feet. */
  grime: number;
  /** 0..1 how much of it there is. */
  grimeAmount: number;
  /** 0..1 how much of the surface is damp: darker, glossier, flatter. */
  wet: number;
  /** 0..1 strength of broad light/dark patches. */
  variation: number;
  /** 0..1 strength of the contact shadow. */
  contact: number;
}

/** The vertex attribute the builder fills. See `WorldSurfaceOpts.kind`. */
export const WORLD_ENV_ATTRIBUTE = 'aEnv';

/**
 * `aEnv` written on wall tops. Anything above 150 on a wall-kind surface is a
 * cap: the cut edge of the rock seen from above, not a face anyone looks at.
 *
 * Caps wear the wall's own stone (a flat painted cap glowed in mid-air), but
 * at full brightness they were the biggest lit surface in the frame: the first
 * render of the textured walls showed bright blue cobbles over half the crypt
 * shot and a noisy teal mottle over the caverns, out-shining the floor. So the
 * shader keeps their texture and sinks them: darker, flatter, matte. They
 * still read as rock with walls under it; the floor reads as where you play.
 */
export const WORLD_CAP_ENV = 199;

/**
 * See-through for walls standing between the camera and the hero: xyz is the
 * hero's chest, w the radius of the cut (0 switches it off). One object
 * shared by every wall material, written each frame by the dungeon mesh.
 *
 * Caps never dissolve with the rock lid (that showed the void through the
 * walls), but a wall just south of the hero hid the hero completely: the w10
 * ashwaste lava shot found nothing but a wall top on the ray to the hero, and
 * narrow corridors had a black cap wedge across the bottom of the frame. So a
 * small dithered hole opens only along the sightline and only in front of the
 * hero; side walls level with the hero, and everything behind, stay solid.
 * Shadow and AO passes use their own materials and are not cut.
 */
export const worldCutaway = { value: new THREE.Vector4(0, 0, 0, 0) };

export function setWorldCutaway(x: number, y: number, z: number, radius: number): void {
  worldCutaway.value.set(x, y, z, radius);
}

/**
 * A private material for level geometry: the palette's own PBR set, plus a
 * world-space layer that breaks the tiling and grounds the surface.
 *
 *  - broad discolouration and blotching sampled at 23m and 6m, so a room stops
 *    reading as one tile stamped out over and over;
 *  - damp patches that darken albedo, drop roughness and flatten the normal
 *    together, so torchlight catches them the way it catches real wet stone;
 *  - contact occlusion and grime where floor meets wall, from a vertex
 *    attribute the builder bakes. It works at every quality preset, including
 *    the ones with screen-space AO switched off.
 *
 * Never the shared cached surface: the patch is attached with
 * `onBeforeCompile`, which on a cached material would leak into every prop of
 * the same palette. All world surfaces of one kind share a single program.
 * The caller owns disposal.
 */
export function worldSurface(key: string, opts: SurfaceOpts, w: WorldSurfaceOpts): THREE.MeshStandardMaterial {
  const mat = surfaceVariant(key, opts);
  mat.name = `world:${w.kind}:${resolvePalette(key).key}`;
  const uniforms = {
    uMacro: { value: macroNoiseTexture() },
    uGrime: { value: new THREE.Color(w.grime) },
    uGrimeAmt: { value: w.grimeAmount },
    uWet: { value: w.wet },
    uVar: { value: w.variation },
    uContact: { value: w.contact },
    uCut: worldCutaway,
  };
  mat.userData.world = uniforms;
  const wall = w.kind === 'wall';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          `attribute float ${WORLD_ENV_ATTRIBUTE};`,
          'varying float vEnv;',
          'varying vec3 vWsPos;',
          'varying vec3 vWsNor;',
        ].join('\n'),
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          `vEnv = ${WORLD_ENV_ATTRIBUTE};`,
          'vWsPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
          'vWsNor = normalize(mat3(modelMatrix) * objectNormal);',
        ].join('\n'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying float vEnv;',
          'varying vec3 vWsPos;',
          'varying vec3 vWsNor;',
          'uniform sampler2D uMacro;',
          'uniform vec3 uGrime;',
          'uniform float uGrimeAmt, uWet, uVar, uContact;',
          'uniform vec4 uCut;',
        ].join('\n'),
      )
      .replace(
        '#include <clipping_planes_fragment>',
        wall
          ? [
              'if (uCut.w > 0.0) {',
              '  vec3 cutD = uCut.xyz - cameraPosition;',
              '  float cutL = length(cutD);',
              '  vec3 cutN = cutD / max(cutL, 1e-3);',
              '  vec3 cutR = vWsPos - cameraPosition;',
              '  float cutT = dot(cutR, cutN);',
              '  float cutP = length(cutR - cutN * cutT);',
              // Solid outside the tube, and from just in front of the hero on.
              '  float cutA = max(smoothstep(uCut.w * 0.6, uCut.w, cutP), smoothstep(cutL - 1.4, cutL - 0.7, cutT));',
              '  float cutH = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);',
              '  if (cutA < cutH) discard;',
              '}',
              '#include <clipping_planes_fragment>',
            ].join('\n')
          : '#include <clipping_planes_fragment>',
      )
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          // Planar world coordinates: floors read XZ, walls run along their
          // face and up. One projection per fragment, no triplanar blend.
          'vec2 wsP = abs(vWsNor.y) > 0.5 ? vWsPos.xz : vec2(vWsPos.x + vWsPos.z, vWsPos.y * 1.3);',
          'vec4 wsA = texture2D(uMacro, wsP * (1.0 / 23.0));',
          'vec4 wsB = texture2D(uMacro, wsP * (1.0 / 6.1) + vec2(0.37, 0.71));',
          wall
            ? 'float wsContact = 1.0 - smoothstep(0.0, 1.5, vEnv);'
            : 'float wsContact = smoothstep(0.15, 1.0, vEnv);',
          // Broad patches brighten and darken around the authored albedo, and
          // blotches lean toward the grime colour so a dark patch reads as dirt
          // rather than as a shadow.
          'float wsBroad = (wsA.r - 0.5) * 2.0;',
          'float wsBlot = smoothstep(0.35, 0.85, wsB.g * 0.75 + wsA.a * 0.25);',
          'diffuseColor.rgb *= 1.0 + wsBroad * 0.22 * uVar;',
          'vec3 wsHue = uGrime / max(max(uGrime.r, uGrime.g), max(uGrime.b, 0.001));',
          'diffuseColor.rgb *= mix(vec3(1.0), wsHue * 0.74, wsBlot * 0.5 * uVar);',
          // Damp: big soft pools on floors, a rising tide mark on walls.
          wall
            ? 'float wsWet = uWet * smoothstep(0.45, 0.8, wsA.b + wsContact * 0.35) * (1.0 - smoothstep(0.4, 2.2, vEnv));'
            : 'float wsWet = uWet * smoothstep(1.0 - uWet * 0.75, 1.0 - uWet * 0.75 + 0.22, wsA.b * 0.8 + wsB.a * 0.2 + wsContact * 0.15);',
          'diffuseColor.rgb *= 1.0 - wsWet * 0.42;',
          // Grime in the corners and along the foot of every wall.
          'float wsG = clamp(wsContact * (0.55 + wsB.b * 0.6), 0.0, 1.0) * uGrimeAmt;',
          'diffuseColor.rgb = mix(diffuseColor.rgb, uGrime, wsG * 0.5);',
          wall ? 'float wsCap = step(150.0, vEnv);' : 'const float wsCap = 0.0;',
          'diffuseColor.rgb *= 1.0 - wsCap * 0.6;',
        ].join('\n'),
      )
      .replace(
        '#include <roughnessmap_fragment>',
        [
          '#include <roughnessmap_fragment>',
          'roughnessFactor *= mix(0.86, 1.08, wsB.a);',
          'roughnessFactor = mix(roughnessFactor, 0.22, wsWet * 0.85);',
          'roughnessFactor = mix(roughnessFactor, 1.0, wsCap);',
        ].join('\n'),
      )
      .replace(
        '#include <normal_fragment_maps>',
        [
          '#include <normal_fragment_maps>',
          // Standing water fills the crevices: relief flattens where it is wet.
          'normal = normalize(mix(normal, nonPerturbedNormal, max(wsWet * 0.7, wsCap * 0.6)));',
        ].join('\n'),
      )
      .replace(
        '#include <aomap_fragment>',
        [
          '#include <aomap_fragment>',
          'float wsOcc = 1.0 - wsContact * uContact * 0.65;',
          'reflectedLight.indirectDiffuse *= wsOcc;',
          'reflectedLight.indirectSpecular *= wsOcc;',
          'reflectedLight.directDiffuse *= 1.0 - wsContact * uContact * 0.22;',
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => `worldSurface:${w.kind}`;
  return mat;
}

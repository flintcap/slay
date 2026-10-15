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

import * as THREE from 'three/webgpu';
import {
  attribute, cameraViewMatrix, mix, normalize, normalViewGeometry, positionWorld, sin, smoothstep, texture, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import { asStandard, matColor, matFloat, setNodeTextures } from '../core/Tsl';
import { macroNoiseTexture } from '../fx/UtilityTextures';
import { WORLD_ENV_ATTRIBUTE } from './WorldMaterial';

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
    // A near-mirror rippled surface broke every torch, the hero light and
    // the forest moon into white glitter specks. Low slopes, a satin sheen.
    ripple: 0.2,
    speed: 0.16,
    scaleA: 5.5,
    scaleB: 2.3,
    // Froth is patchy and dim. At 0.55 of a pale grey-blue every one-tile
    // pool (all four corners on the bank) rendered as a white-rimmed hole,
    // and at 0.32 the caverns pools still wore a pale ring.
    rim: 0.2,
    rimColor: 0x4c6266,
    molten: 0,
    roughness: 0.42,
    metalness: 0.1,
    opacity: 0.84,
    emissiveIntensity: 0.6,
  },
  sludge: {
    // Under an open sky the moon caught every ripple of a glossy, frothy
    // sludge: the fens read as white-green static. Flat, dull, dark scum.
    ripple: 0.16,
    speed: 0.05,
    scaleA: 4,
    scaleB: 1.7,
    rim: 0.4,
    rimColor: 0x3a4420,
    molten: 0,
    roughness: 0.55,
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
    // 2.8 (peak 5.6 in the seams) blew every pool out to a white sheet that
    // bloomed over the hero in the w10 foundry render.
    emissiveIntensity: 1.25,
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
    // At 1.2 (2.4 in the seams) every void pool bloomed into a flat magenta
    // sheet that swamped the walkway, and at 0.6 it was still a loud blue
    // field. The void is mostly dark with faint seams.
    emissiveIntensity: 0.3,
  },
};

/** The standard lighting with the environment's reflection scaled. */
class DimReflection extends THREE.PhysicalLightingModel {
  constructor(private readonly k: number) {
    super();
  }

  override indirectSpecular(builder: THREE.NodeBuilder): void {
    const ctx = builder.context as unknown as { radiance: THREE.Node<'vec3'> };
    ctx.radiance.mulAssign(this.k);
    super.indirectSpecular(builder);
  }
}

/**
 * Builds the liquid material for a level. `color` is the body colour and
 * `glow` the emissive colour (black for plain water). The caller owns it.
 */
export function liquidSurface(style: LiquidStyle, color: number, glow: number): LiquidSurface {
  const t = TUNING[style];
  const transparent = t.opacity < 0.999;
  const mat = new THREE.MeshStandardNodeMaterial({
    name: `liquid:${style}`,
    // A molten body is lit by its own heat lights as well as glowing, so a
    // full-bright orange albedo doubled the glare. Keep the body dark and let
    // the emissive seams carry it.
    color: t.molten > 0.5 ? new THREE.Color(color).multiplyScalar(0.4) : color,
    emissive: new THREE.Color(glow),
    emissiveIntensity: t.emissiveIntensity,
    roughness: t.roughness,
    metalness: t.metalness,
    transparent,
    opacity: t.opacity,
    depthWrite: !transparent,
  });
  const uTime = uniform(0);
  const tex = macroNoiseTexture();
  setNodeTextures(mat, [tex]);
  const rimColor = uniform(new THREE.Color(t.rimColor));
  const ripple = uniform(t.ripple);
  const rimAmt = uniform(t.rim);
  const uScale = uniform(new THREE.Vector2(1 / t.scaleA, 1 / t.scaleB));
  // Two noise layers drifting against each other: the interference is
  // what reads as moving liquid rather than a sliding picture.
  const lqT = uTime.mul(t.speed);
  const P = positionWorld.xz;
  const A = texture(tex, P.mul(uScale.x).add(vec2(lqT, lqT.mul(0.6)))).toVar();
  const B = texture(tex, P.mul(uScale.y).add(vec2(lqT.mul(-0.7), lqT.mul(1.3))).add(0.5)).toVar();
  const slope = A.rg.sub(0.5).add(B.ga.sub(0.5).mul(0.8));
  const shore = smoothstep(0.05, 1.0, attribute<'float'>(WORLD_ENV_ATTRIBUTE, 'float')).toVar();
  // Rim: froth on water, cooled crust on lava, broken up by the noise so the
  // bank line is ragged rather than ruled.
  const rim0 = smoothstep(0.45, 0.95, shore.add(B.b.sub(0.5).mul(0.6))).mul(rimAmt);
  const body = matColor('color');
  const heatGlow = matColor('emissive').mul(matFloat('emissiveIntensity'));
  if (t.molten > 0.5) {
    // Molten: a crust field drifting over the glow. Crust where the combined
    // noise is high; hot seams where it is low.
    const n = A.b.mul(0.6).add(B.r.mul(0.4));
    const crust = smoothstep(0.42, 0.6, n.add(shore.mul(0.25))).toVar();
    const heat = crust.oneMinus().mul(sin(uTime.mul(1.7).add(A.a.mul(9.0))).mul(0.25).add(0.75)).toVar();
    mat.colorNode = mix(body, rimColor, crust.mul(0.92));
    mat.roughnessNode = mix(matFloat('roughness'), 0.85, heat.oneMinus().mul(0.4));
    mat.emissiveNode = heatGlow.mul(heat.mul(heat.add(1.0)));
  } else {
    // Foam gathers in clots along the bank, not as a ruled line.
    const rim = rim0.mul(smoothstep(0.42, 0.68, A.g.mul(0.6).add(B.r.mul(0.4)))).toVar();
    // Depth: liquid darkens away from the bank.
    mat.colorNode = mix(body.mul(mix(0.55, 1.0, shore)), rimColor, rim.mul(0.55));
    mat.opacityNode = mix(matFloat('opacity'), 1.0, rim.mul(0.6));
    mat.roughnessNode = mix(matFloat('roughness'), 0.85, rim.mul(0.6));
    // A faint caustic shimmer where the two layers peak together.
    const caustic = smoothstep(0.62, 0.8, A.r.mul(0.5).add(B.g.mul(0.5)));
    mat.emissiveNode = heatGlow.mul(caustic.mul(0.5).add(0.6));
  }
  const lqN = vec3(slope.x.negate(), 0.0, slope.y.negate()).mul(ripple);
  mat.normalNode = normalize(normalViewGeometry.add(cameraViewMatrix.mul(vec4(lqN, 0.0)).xyz));
  if (style === 'water') {
    // Water at night took the shared pale sky's reflection and read as ice
    // or a tiled floor; it should hold the dark. Only the reflection dims.
    mat.setupLightingModel = () => new DimReflection(0.3);
  }
  return {
    material: asStandard(mat),
    update(elapsed: number): void {
      uTime.value = elapsed;
    },
    dispose(): void {
      mat.dispose();
    },
  };
}

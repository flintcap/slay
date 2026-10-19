/**
 * SLAY — the sky over an outdoor level.
 *
 * Clouds drift over the level on the wind, and their shadows drift over the
 * ground with them: the sun's (or moon's) light dims wherever a cloud stands
 * between it and the point it lights (`cloudShade`, on the key light). The
 * dome is a large shell kept centred on the hero, painted from the biome's
 * sky and fog with the same clouds, and the level's reflections come from a
 * matching sky (`skyPaint`, `Renderer.applyEnvironment`), so pools and
 * polished metal show this sky rather than a shared grey one.
 */
import * as THREE from 'three/webgpu';
import { Fn, max, mix, positionLocal, positionWorld, smoothstep, texture, time, uniform, vec3 } from 'three/tsl';
import type { BiomeId } from '../types';
import type { F, V2 } from '../core/Tsl';
import { macroNoiseTexture } from '../fx/UtilityTextures';
import type { LightMood } from './Lighting';

/** How a biome's sky clouds over. */
interface SkyLook {
  /** Share of the sky under cloud, 0..1. */
  cover: number;
  /** How much of the key light a cloud takes away, 0..1. */
  shade: number;
  /** Wind, metres per second at the cloud layer. */
  speed: number;
  /** Cloud colour as seen on the dome. */
  cloud: number;
}

const SKIES: Partial<Record<BiomeId, SkyLook>> = {
  // Rags of cloud across the moon.
  darkForest: { cover: 0.45, shade: 0.55, speed: 6, cloud: 0x1e2636 },
  // Low and heavy.
  swamp: { cover: 0.62, shade: 0.45, speed: 4, cloud: 0x2e3628 },
  // A few high puffs; their shadows sail fast over the sand.
  desert: { cover: 0.22, shade: 0.55, speed: 9, cloud: 0xc8b8a0 },
  // Broken overcast.
  tundra: { cover: 0.58, shade: 0.42, speed: 8, cloud: 0x8a98ac },
  // Smoke banks.
  ashwaste: { cover: 0.55, shade: 0.6, speed: 5, cloud: 0x2a201c },
  hell: { cover: 0.5, shade: 0.5, speed: 3, cloud: 0x241210 },
};

/** Height of the cloud layer, metres. */
const CLOUD_Y = 140;
/** Metres one repeat of the cloud noise spans at the layer. */
const CLOUD_SPAN = 260;
/** Radius of the dome around the hero (inside the camera's far plane). */
const DOME_R = 200;

// One sky at a time: the level's lighting sets these, the dome and the key
// light read them.
const uSun = uniform(new THREE.Vector3(0, 1, 0));
const uWind = uniform(new THREE.Vector2(1, 0));
const uCover = uniform(0);
const uShade = uniform(0);

/** Cloud density (0..1) at a point of the cloud layer, metres. */
function clouds(p: V2): F {
  const tex = macroNoiseTexture();
  const drift = uWind.mul(time);
  const a = texture(tex, p.add(drift).div(CLOUD_SPAN)).r;
  const b = texture(tex, p.add(drift.mul(1.6)).div(CLOUD_SPAN * 0.37).add(0.31)).g;
  const n = a.mul(0.7).add(b.mul(0.3));
  const edge = uCover.oneMinus();
  return smoothstep(edge.sub(0.08), edge.add(0.12), n);
}

/**
 * The key light's share left by the clouds at the lit point: 1 in the open,
 * down to 1 - shade under a thick cloud. Traced up the sun's ray to the layer.
 */
export function cloudShade(): F {
  const P = positionWorld;
  const up = max(uSun.y, 0.15);
  const at = P.xz.add(uSun.xz.div(up).mul(P.y.negate().add(CLOUD_Y)));
  return clouds(at).mul(uShade).oneMinus();
}

/** Colours for the reflection sky (`Renderer.applyEnvironment`). */
export interface SkyPaint {
  key: string;
  zenith: number;
  horizon: number;
  ground: number;
  /** Toward the sun or moon, and its colour: the bright patch metal and water catch. */
  sun: [number, number, number];
  sunColor: number;
}

/** The reflection sky for a biome's mood. `sun` points toward the key light. */
export function skyPaint(biome: BiomeId, mood: LightMood, sun: THREE.Vector3): SkyPaint {
  const d = sun.clone().normalize();
  return { key: biome, zenith: mood.sky, horizon: mood.fog, ground: mood.ground, sun: [d.x, d.y, d.z], sunColor: mood.key };
}

export interface SkyDome {
  mesh: THREE.Mesh;
  /** Keeps the dome centred on the hero. */
  follow(x: number, z: number): void;
  dispose(): void;
}

/**
 * Sets the level's clouds and builds its dome. `sun` points toward the key
 * light. Biomes with no cloud table get a clear sky (no cloud shadow).
 */
export function buildSky(biome: BiomeId, mood: LightMood, sun: THREE.Vector3): SkyDome {
  const look = SKIES[biome] ?? { cover: 0, shade: 0, speed: 0, cloud: mood.sky };
  uSun.value.copy(sun).normalize();
  // The wind blows the same way everywhere (as the grass leans, `Wind.ts`).
  uWind.value.set(0.8, 0.6).multiplyScalar(look.speed);
  uCover.value = look.cover;
  uShade.value = look.shade;

  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  mat.fog = false;
  const zenith = uniform(new THREE.Color(mood.sky).multiplyScalar(0.55));
  const horizon = uniform(new THREE.Color(mood.fog));
  const cloudCol = uniform(new THREE.Color(look.cloud));
  mat.colorNode = Fn(() => {
    const dir = positionLocal.normalize();
    const up = max(dir.y, 0.0);
    const base = mix(horizon, zenith, smoothstep(0.0, 0.6, up));
    // The clouds overhead, on the same layer and wind as their shadows.
    const at = dir.xz.div(max(dir.y, 0.06)).mul(CLOUD_Y).add(positionWorld.xz.sub(positionLocal.xz));
    const c = clouds(at).mul(smoothstep(0.02, 0.25, up));
    return vec3(mix(base, cloudCol, c.mul(0.85)));
  })();
  const geo = new THREE.SphereGeometry(DOME_R, 32, 16);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return {
    mesh,
    follow(x: number, z: number): void {
      mesh.position.set(x, 0, z);
    },
    dispose(): void {
      geo.dispose();
      mat.dispose();
      uShade.value = 0;
    },
  };
}

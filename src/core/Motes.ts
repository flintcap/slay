/**
 * SLAY — dust in the torchlight.
 *
 * A few motes hang in the air round each of the torches that glow in the fog
 * (`Lighting.ts` picks them, the nearest to the camera, for `airLight`).
 * They drift slowly, lit by their torch: warm dust rises off a fire, and
 * round a cold light (more blue than red: ice, a ghost lamp) they sink like
 * frost. One draw for all of them. The positions are worked out on the GPU
 * from the same light list the fog glow reads, so nothing is sent per frame
 * but the clock.
 *
 * High and Ultra only (`QualityProfile.motes`). The renderer keeps the one
 * mesh in whichever scene it draws.
 */
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, cameraProjectionMatrix, cameraViewMatrix, float, fract, max, sin, smoothstep, uniform, uv, vec3, vec4,
} from 'three/tsl';
import { scatterLights } from './Lighting';
import { streamFor } from './RNG';
import { vary } from './Tsl';

type F = THREE.Node<'float'>;
type V3 = THREE.Node<'vec3'>;

/** Motes round each scattering light. */
const PER_LIGHT = 22;
/** How far round a light they hang, metres. */
const RADIUS = 2.4;
/** Half a mote's width, metres. */
const SIZE = 0.035;
/** Light a mote throws back, per unit of its torch's light at that spot. */
const GAIN = 0.11;

const uTime = uniform(0);

function moteGeometry(): THREE.BufferGeometry {
  const n = scatterLights.max * PER_LIGHT;
  const rng = streamFor(0x6d07e5, 'motes');
  const pos = new Float32Array(n * 4 * 3);
  const seed = new Float32Array(n * 4 * 4);
  const corner = new Float32Array(n * 4 * 2);
  const index = new Uint16Array(n * 6);
  const C = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let i = 0; i < n; i++) {
    // Which light, and where in its ball (a cube of -1..1, rounded off in the shader).
    const s = [Math.floor(i / PER_LIGHT), rng.range(-1, 1), rng.range(0, 1), rng.range(-1, 1)];
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      seed.set(s, v * 4);
      corner[v * 2] = C[k * 2]!;
      corner[v * 2 + 1] = C[k * 2 + 1]!;
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  // Never read (the shader places every corner), but three wants a position.
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.userData.cached = true;
  return g;
}

function moteMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.name = 'air:motes';
  m.fog = false;
  m.userData.shared = true;
  const seed = attribute('aSeed', 'vec4') as THREE.Node<'vec4'>;
  const corner = attribute('aCorner', 'vec2') as THREE.Node<'vec2'>;

  // Worked out per corner (all four of a mote agree), plain nodes so the
  // shade can be handed to the pixels.
  const slot = seed.x.toInt();
  const live = slot.lessThan(scatterLights.count);
  const base = slot.mul(scatterLights.stride);
  const L = scatterLights.array.element(base).xyz;
  const col = scatterLights.array.element(base.add(1)).xyz;
  // World up as seen by the camera: warm dust rises, cold frost sinks.
  const up = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz;
  const fall = col.z.greaterThan(col.x).select(float(-1), float(1));
  const t = uTime;
  const ph = seed.y.mul(17.0).add(seed.w.mul(31.0));
  // A slow climb (or fall) through the ball, wrapped, and a lazy sway.
  const rise = fract(seed.z.add(t.mul(0.045).mul(seed.y.abs().add(0.6))));
  const along = rise.mul(2.0).sub(1.0).mul(fall);
  const sway = vec3(sin(t.mul(0.37).add(ph)), sin(t.mul(0.29).add(ph.mul(1.7))), sin(t.mul(0.41).add(ph.mul(0.6)))).mul(0.18);
  const off = vec3(seed.y, 0, seed.w).add(sway).mul(RADIUS).add(up.mul(along.mul(RADIUS * 0.8))) as unknown as V3;
  // Bright near the flame, gone at the edge of the ball and as it wraps.
  const r2 = off.dot(off);
  const edge = smoothstep(float(RADIUS * RADIUS), float(RADIUS * RADIUS * 0.3), r2);
  const wrap = smoothstep(0.0, 0.15, rise).mul(smoothstep(1.0, 0.85, rise));
  const lit = col.div(r2.add(0.6)).mul(GAIN).mul(edge).mul(wrap);
  const shade = vary(live.select(lit, vec3(0)) as unknown as V3);

  m.vertexNode = Fn(() => {
    // Collapsed to nothing when its light is not in use this frame.
    const half = live.select(float(SIZE), float(0)) as F;
    const V = L.add(off).add(vec3(corner.mul(half), 0));
    return cameraProjectionMatrix.mul(vec4(V, 1.0));
  })();

  const soft = Fn(() => {
    const d = uv().sub(0.5).length().mul(2.0);
    return max(float(1).sub(d), 0).pow(2.0);
  })();
  m.colorNode = vec4(shade.mul(soft), 1);
  return m;
}

/** The motes: one mesh, moved between scenes by the renderer. */
export class Motes {
  readonly mesh: THREE.Mesh;

  constructor() {
    const geo = moteGeometry();
    // The corner's uv, for the round soft dot.
    const n = geo.getAttribute('aCorner') as THREE.BufferAttribute;
    const uvs = new Float32Array(n.count * 2);
    for (let i = 0; i < n.count; i++) {
      uvs[i * 2] = n.getX(i) * 0.5 + 0.5;
      uvs[i * 2 + 1] = n.getY(i) * 0.5 + 0.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.mesh = new THREE.Mesh(geo, moteMaterial());
    this.mesh.name = 'air:motes';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 5;
  }

  /** Puts the motes in `scene` (or takes them out with null) and moves their clock. */
  update(scene: THREE.Scene | null, elapsed: number): void {
    uTime.value = elapsed;
    if (this.mesh.parent === scene) return;
    this.mesh.removeFromParent();
    if (scene) scene.add(this.mesh);
  }
}

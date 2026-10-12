/**
 * SLAY — the living effect round a set or unique: embers rising off a
 * dragon-scaled outfit, frost mist sinking off ice plate, gold glints on a
 * gilded set, souls drifting up from a necromancer's crown.
 *
 * Two layers. The glow itself is a shell (`glowShell`, `glowTwins`): the
 * item's own surface pushed out a few millimetres and lit at its edges, so
 * the light hugs the silhouette and the bloom pass spreads it into a halo.
 * Over it, for the kinds that are made of sparks (embers, sparks, glints,
 * drips, ash), a few small points; the soft kinds (a halo, frost, souls,
 * smoke, wisps, motes) are the shell alone, as round blobs read as floating
 * circles rather than light.
 *
 * One `THREE.Points` per aura, one draw call. Every particle's path is a
 * closed loop worked out in the vertex shader from the clock, so nothing is
 * updated on the CPU and an aura costs the same standing or running. One
 * shader program serves every kind; the kind only changes uniforms.
 *
 * Seeded (`core/RNG.ts`): the same item always throws the same particles.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random } from '../../core/RNG';
import type { Aura } from './Designs';

/** How each kind of aura moves and looks. */
interface AuraKind {
  /** Metres a second up (negative falls). */
  rise: number;
  /** Turns a second round the axis. */
  swirl: number;
  /** Random hop each tick (sparks), metres. */
  jump: number;
  /** Sprite size in the world, units of 6 mm. */
  size: number;
  /** 0 steady .. 1 winks on and off. */
  twinkle: number;
  /** How far out it drifts as it rises (1 = stays at its radius). */
  spread: number;
  /** Brightness. */
  gain: number;
  /** 0 a soft blob .. 1 a hard bright point. */
  core: number;
  /** Particles per unit of strength. */
  count: number;
}

const KINDS: Record<Exclude<Aura, 'none'>, AuraKind> = {
  soft: { rise: 0.02, swirl: 0.05, jump: 0, size: 70, twinkle: 0, spread: 1, gain: 0.16, core: 0, count: 6 },
  embers: { rise: 0.55, swirl: 0.15, jump: 0, size: 9, twinkle: 0.4, spread: 1.3, gain: 1.1, core: 0.8, count: 22 },
  ash: { rise: 0.2, swirl: 0.25, jump: 0, size: 10, twinkle: 0.2, spread: 1.6, gain: 0.7, core: 0.5, count: 20 },
  frost: { rise: -0.12, swirl: 0.1, jump: 0, size: 22, twinkle: 0.3, spread: 1.4, gain: 0.45, core: 0.1, count: 18 },
  sparkles: { rise: 0.04, swirl: 0.08, jump: 0, size: 12, twinkle: 1, spread: 1.1, gain: 1.2, core: 1, count: 20 },
  shine: { rise: 0.08, swirl: 0.35, jump: 0, size: 12, twinkle: 0.9, spread: 1, gain: 1.1, core: 1, count: 18 },
  wisp: { rise: 0.22, swirl: 0.9, jump: 0, size: 10, twinkle: 0, spread: 1.1, gain: 0.8, core: 0.6, count: 24 },
  smoke: { rise: 0.22, swirl: 0.2, jump: 0, size: 34, twinkle: 0, spread: 1.7, gain: 0.3, core: 0, count: 14 },
  drips: { rise: -0.55, swirl: 0, jump: 0, size: 7, twinkle: 0, spread: 1, gain: 1, core: 0.7, count: 14 },
  sparks: { rise: 0, swirl: 0, jump: 0.06, size: 8, twinkle: 0.8, spread: 1, gain: 1.4, core: 1, count: 18 },
  motes: { rise: 0.08, swirl: 0.12, jump: 0, size: 10, twinkle: 0.3, spread: 1.2, gain: 0.8, core: 0.6, count: 20 },
  souls: { rise: 0.35, swirl: 0.3, jump: 0, size: 26, twinkle: 0, spread: 1.3, gain: 0.45, core: 0.2, count: 12 },
};

const VERT = /* glsl */ `
uniform float uTime;
uniform float uRise;
uniform float uSwirl;
uniform float uJump;
uniform float uSize;
uniform float uSpread;
uniform float uHeight;
attribute vec4 aSeed; // phase, speed, angle, radius
varying float vFade;
varying float vSeed;
float h(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float t = uTime * aSeed.y + aSeed.x;
  float life = fract(t * 0.25);
  float a = aSeed.z + uSwirl * 6.2832 * uTime * (0.6 + aSeed.y * 0.4);
  float r = aSeed.w * mix(1.0, uSpread, life);
  // Rising things start low and climb; falling things start high.
  float y = position.y;
  if (abs(uRise) > 0.001) y = (uRise > 0.0 ? life : 1.0 - life) * uHeight + position.y * 0.25;
  vec3 p = vec3(cos(a) * r, y, sin(a) * r);
  if (uJump > 0.0) {
    float tick = floor(uTime * 14.0 + aSeed.x * 7.0);
    p += (vec3(h(tick + aSeed.z), h(tick * 1.3 + aSeed.w), h(tick * 1.7 + aSeed.x)) - 0.5) * uJump * 4.0;
  }
  vFade = abs(uRise) > 0.001 ? smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.65, 1.0, life)) : 1.0;
  vSeed = aSeed.x + uTime * (0.5 + aSeed.y);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // uSize is the sprite's world size in units of 6 mm, drawn for a 600 px tall view.
  gl_PointSize = uSize * projectionMatrix[1][1] * 1.8 / max(0.2, -mv.z);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uGain;
uniform float uTwinkle;
uniform float uCore;
varying float vFade;
varying float vSeed;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float soft = pow(1.0 - r, 2.0);
  float hard = smoothstep(0.45, 0.0, r);
  float a = mix(soft, max(soft * 0.4, hard), uCore);
  float tw = mix(1.0, 0.5 + 0.5 * sin(vSeed * 6.2832), uTwinkle);
  // A white-hot centre on bright points.
  vec3 c = mix(uColor, vec3(1.0), hard * uCore * 0.5);
  gl_FragColor = vec4(c * a * vFade * tw * uGain, 1.0);
}
`;

const mats = new Map<string, THREE.ShaderMaterial>();

function material(kind: Exclude<Aura, 'none'>, color: number, height: number, strength: number): THREE.ShaderMaterial {
  const key = `${kind}|${color}|${height.toFixed(2)}|${strength.toFixed(2)}`;
  let m = mats.get(key);
  if (m) return m;
  const k = KINDS[kind];
  m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRise: { value: k.rise },
      uSwirl: { value: k.swirl },
      uJump: { value: k.jump },
      // Small: a spark, not a disc.
      uSize: { value: k.size * 0.6 },
      uSpread: { value: k.spread },
      uHeight: { value: height },
      uColor: { value: new THREE.Color(color) },
      uGain: { value: k.gain * Math.min(1.4, 0.5 + strength * 0.5) },
      uTwinkle: { value: k.twinkle },
      uCore: { value: k.core },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  m.name = `aura:${kind}`;
  m.userData.shared = true;
  mats.set(key, m);
  return m;
}

export interface AuraOpts {
  /** Radius of the column the particles move in, metres. */
  radius: number;
  /** Height of the column, metres; its foot is at the object's origin. */
  height: number;
  /** 0..1.5: how many particles and how bright. A full set is 1. */
  strength: number;
  /** Seed for the particles' places. */
  seed: number;
}

/** Kinds that throw particles over their glow, and how many of the full count. */
const SPARKY: Partial<Record<Aura, number>> = { embers: 0.45, sparks: 0.45, sparkles: 0.4, shine: 0.4, drips: 0.5, ash: 0.4 };

/** True when the kind throws particles over its glow (see `SPARKY`). */
export function auraHasSparks(kind: Aura): boolean {
  return SPARKY[kind] !== undefined;
}

/**
 * The aura's particles as one Points object, or null for 'none' and for the
 * soft kinds, which are the glow shell alone. Add it under whatever it should follow.
 */
export function buildAura(kind: Aura, color: number, o: AuraOpts): THREE.Points | null {
  const share = SPARKY[kind];
  if (kind === 'none' || !KINDS[kind] || share === undefined) return null;
  const k = KINDS[kind];
  const n = Math.max(3, Math.round(share * k.count * Math.max(0.2, o.strength) * Math.max(0.6, Math.min(1.6, o.radius * 2.5 + o.height * 0.4))));
  const rng = new Random(o.seed >>> 0 || 1);
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos[i * 3 + 1] = rng.range(0, o.height);
    seed[i * 4] = rng.range(0, 4);
    seed[i * 4 + 1] = rng.range(0.6, 1.4);
    seed[i * 4 + 2] = rng.range(0, Math.PI * 2);
    seed[i * 4 + 3] = o.radius * Math.sqrt(rng.range(0.15, 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, o.height / 2, 0), o.radius * 2 + o.height);
  const m = material(kind, color, o.height, o.strength);
  const pts = new THREE.Points(g, m);
  pts.name = `aura:${kind}`;
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  pts.castShadow = false;
  pts.receiveShadow = false;
  pts.userData.aura = kind;
  pts.userData.auraColor = color;
  // The clock is read once a frame by whichever aura draws first.
  pts.onBeforeRender = () => {
    m.uniforms.uTime!.value = (performance.now() / 1000) % 3600;
  };
  return pts;
}

/** The look of an aura kind for flat drawers (icons): size, twinkle and drift. */
export function auraStyle(kind: Aura): { size: number; rise: number; twinkle: number; core: number; count: number } | null {
  if (kind === 'none' || !KINDS[kind]) return null;
  const k = KINDS[kind];
  return { size: k.size, rise: k.rise, twinkle: k.twinkle, core: k.core, count: k.count };
}

// ---------------------------------------------------------------------------
// The glow shell.

const SHELL_VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uThick;
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  vec3 n = normalize(normalMatrix * objectNormal);
  // Pushed out in view space, so the shell is the same few millimetres
  // whatever scale the item is drawn at.
  mv.xyz += n * uThick;
  vN = n;
  vV = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const SHELL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uGain;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  // Bright at the silhouette, a faint wash over the face.
  float rim = pow(1.0 - facing, 2.4);
  float a = 0.05 + rim;
  // A slow breath, so it reads as light and not paint.
  float breath = 0.82 + 0.18 * sin(uTime * 1.9);
  gl_FragColor = vec4(uColor * a * uGain * breath, 1.0);
}
`;

/** One clock for every shell, set by whichever draws first in a frame. */
const shellTime = { value: 0 };
const shellMats = new Map<string, THREE.ShaderMaterial>();

function shellMaterial(color: number, strength: number, thick: number): THREE.ShaderMaterial {
  const key = `${color}|${strength.toFixed(2)}|${thick.toFixed(3)}`;
  let m = shellMats.get(key);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      // Past the bloom threshold at the edges, so the halo spreads.
      uGain: { value: 0.9 + 1.5 * strength },
      uThick: { value: thick },
      uTime: shellTime,
    },
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  m.name = 'aura:shell';
  m.userData.shared = true;
  shellMats.set(key, m);
  return m;
}

function markShell(o: THREE.Mesh, color: number): void {
  o.name = 'aura:shell';
  o.renderOrder = 3;
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.aura = 'shell';
  o.userData.auraColor = color;
  o.onBeforeRender = () => {
    shellTime.value = (performance.now() / 1000) % 3600;
  };
}

/** Meshes worth outlining: solid ones, not glows, decals or particles of their own. */
function solid(m: THREE.Mesh): boolean {
  if (!m.isMesh || m.userData.aura) return false;
  const mat = m.material as THREE.Material | THREE.Material[];
  const one = Array.isArray(mat) ? mat[0] : mat;
  return !!one && !one.transparent && one.blending === THREE.NormalBlending;
}

/**
 * A glow round a still model (a weapon, a shield, a ring): its solid meshes
 * merged into one shell under `root`, one draw call. `thick` is metres.
 */
export function glowShell(root: THREE.Object3D, color: number, strength: number, thick: number): THREE.Mesh | null {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!solid(m) || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    const src = m.geometry;
    const pos = src.getAttribute('position');
    if (!pos) return;
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', pos.clone());
    const nrm = src.getAttribute('normal');
    if (nrm) g.setAttribute('normal', nrm.clone());
    if (src.index) g.setIndex(src.index.clone());
    if (g.index) g = g.toNonIndexed();
    if (!nrm) g.computeVertexNormals();
    rel.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(rel);
    parts.push(g);
  });
  if (!parts.length) return null;
  const geo = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
  if (parts.length > 1) for (const g of parts) g.dispose();
  if (!geo) return null;
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, shellMaterial(color, strength, thick));
  markShell(mesh, color);
  root.add(mesh);
  return mesh;
}

/**
 * A glow round worn armour: a twin of each skinned mesh in `group`, on the
 * same geometry and bones, so it bends with the body. The twins share the
 * piece's geometry; take them off with `removeFromParent`, never dispose.
 */
export function glowTwins(group: THREE.Object3D, color: number, strength: number, thick: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const mat = shellMaterial(color, strength, thick);
  for (const o of [...group.children]) {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || !solid(m)) continue;
    const twin = new THREE.SkinnedMesh(m.geometry, mat);
    twin.frustumCulled = false;
    twin.position.copy(m.position);
    twin.quaternion.copy(m.quaternion);
    twin.scale.copy(m.scale);
    markShell(twin, color);
    twin.userData.sharedGeometry = true;
    group.add(twin);
    twin.bind(m.skeleton, m.bindMatrix);
    out.push(twin);
  }
  return out;
}

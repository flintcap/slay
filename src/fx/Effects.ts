/**
 * SLAY — the spell and ability VFX library.
 *
 * Everything a skill can look like lives here: projectiles, beams, cones,
 * novas, slams, meteors, chain lightning, whirlwinds, summoning circles,
 * auras, shields, teleport dissolves and channels.
 *
 * The organising principle is that **an impact is never one thing**. A fireball
 * landing is: a particle burst, a point light that briefly lights the actual
 * walls, a bloom-catching emissive core, a scorch decal, screen trauma, a
 * hit-stop, and a sound. Ship any one of those alone and it reads as a tech
 * demo. `impact()` fires all of them from one call, so gameplay code never has
 * to remember the recipe.
 *
 * Sound and shake are dispatched through the event bus (`sfx`, `shake`) so this
 * module never needs a reference to the audio engine or the camera — though it
 * will use a `CameraRig` directly for hit-stop if one is handed to it.
 */

import * as THREE from 'three';
import type { QualityProfile } from '../core/Renderer';
import type { DamageType, Rng } from '../types';
import { events } from '../core/Events';
import { Random } from '../core/RNG';
import { FXSystem } from './Particles';
import { DecalSystem } from './Decals';
import { TrailSystem, Trail } from './Trails';
import type { CameraRig } from './CameraRig';
import { emissiveMaterial } from '../art/Materials';
import { radialGlowTexture } from '../art/Textures';

// ---------------------------------------------------------------------------
// Element palette
// ---------------------------------------------------------------------------

export interface ElementLook {
  /** Core / hottest colour. */
  core: number;
  /** Body colour — the one the eye names. */
  body: number;
  /** Trailing / cooling colour. */
  tail: number;
  light: number;
  decal: string;
  trail: string;
  emitter: string;
  sfxHit: string;
  sfxCast: string;
}

export const ELEMENTS: Record<DamageType, ElementLook> = {
  physical: { core: 0xfff4dc, body: 0xffc98a, tail: 0x8a7a68, light: 0xffd0a0, decal: 'dust', trail: 'sword', emitter: 'hit.physical', sfxHit: 'hit.physical', sfxCast: 'cast.physical' },
  fire: { core: 0xfff0b0, body: 0xff7a18, tail: 0x8c1a00, light: 0xff8a30, decal: 'scorch', trail: 'fire', emitter: 'hit.fire', sfxHit: 'hit.fire', sfxCast: 'cast.fire' },
  cold: { core: 0xffffff, body: 0x66c0ff, tail: 0x14406e, light: 0x80c8ff, decal: 'ice', trail: 'frost', emitter: 'hit.cold', sfxHit: 'hit.cold', sfxCast: 'cast.cold' },
  lightning: { core: 0xffffff, body: 0x76b0ff, tail: 0x1a3ea8, light: 0x90c0ff, decal: 'lightning', trail: 'lightning', emitter: 'hit.lightning', sfxHit: 'hit.lightning', sfxCast: 'cast.lightning' },
  poison: { core: 0xe6ff9a, body: 0x86dd2c, tail: 0x1f5a12, light: 0x9ae83c, decal: 'poison', trail: 'poison', emitter: 'hit.poison', sfxHit: 'hit.poison', sfxCast: 'cast.poison' },
  arcane: { core: 0xf6e2ff, body: 0xa855ff, tail: 0x2c0a5e, light: 0xb070ff, decal: 'arcane', trail: 'arcane', emitter: 'hit.arcane', sfxHit: 'hit.arcane', sfxCast: 'cast.arcane' },
};

function look(el: DamageType | undefined): ElementLook {
  return ELEMENTS[el ?? 'physical'];
}

// ---------------------------------------------------------------------------
// Shared GLSL
// ---------------------------------------------------------------------------

/** Cheap 3D value noise + fbm, used by every scrolling/dissolve shader here. */
const GLSL_NOISE = /* glsl */ `
  vec3 hash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n = mix(mix(mix(dot(hash33(i + vec3(0,0,0)), f - vec3(0,0,0)),
                          dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                      mix(dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0)),
                          dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
                  mix(mix(dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1)),
                          dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                      mix(dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1)),
                          dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
    return n * 0.5 + 0.5;
  }
  float fbm3(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }
    return s / 0.9375;
  }
`;

// ---------------------------------------------------------------------------
// Point-light flash pool
// ---------------------------------------------------------------------------

interface FlashSlot {
  light: THREE.PointLight;
  left: number;
  total: number;
  peak: number;
}

/**
 * A small pool of PointLights recycled for impact flashes.
 *
 * This is the single highest-value effect in the whole module: a fireball that
 * lights the wall behind it for 120ms reads as a physical event in the world.
 * The same fireball without a light reads as a decal pasted over the screen.
 */
class FlashPool {
  private slots: FlashSlot[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, count: number) {
    this.scene = scene;
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      // Never toggled off. `visible = false` drops a light out of the scene's
      // light list, three.js keys its shader program cache on how many lights
      // there are, and so every flash was silently recompiling every material
      // in the dungeon. That is the stall on every cast, every hit and every
      // kill. Idle slots sit at zero intensity, which costs nothing to look at
      // and keeps the light count fixed for the renderer's whole life.
      l.visible = true;
      l.intensity = 0;
      scene.add(l);
      this.slots.push({ light: l, left: 0, total: 1, peak: 0 });
    }
  }

  flash(x: number, y: number, z: number, color: number, intensity: number, distance: number, duration: number): void {
    if (this.slots.length === 0) return;
    // Prefer a free slot; otherwise steal the dimmest one so a new, brighter
    // event always wins over a fading old one.
    let best: FlashSlot | null = null;
    let bestScore = Infinity;
    for (const s of this.slots) {
      const score = s.left <= 0 ? -1 : s.peak * (s.left / s.total);
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
      if (score < 0) break;
    }
    if (!best) return;
    if (bestScore > intensity * 0.9 && bestScore > 0) return; // do not downgrade
    best.light.color.setHex(color);
    best.light.distance = distance;
    best.light.decay = 2;
    best.peak = intensity;
    best.left = duration;
    best.total = duration;
    best.light.position.set(x, y, z);
    best.light.intensity = intensity;
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (s.left <= 0) continue;
      s.left -= dt;
      if (s.left <= 0) {
        s.left = 0;
        s.light.intensity = 0;
        continue;
      }
      const t = s.left / s.total;
      // Quadratic falloff: a bright snap that dies fast, like a real flash.
      s.light.intensity = s.peak * t * t;
    }
  }

  dispose(): void {
    for (const s of this.slots) this.scene.remove(s.light);
    this.slots.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Effect handle
// ---------------------------------------------------------------------------

export interface EffectHandle {
  /** Stops the effect early (with its natural fade where one exists). */
  stop(): void;
  /** True once the effect has fully finished and been recycled. */
  readonly done: boolean;
  /** Re-aims an effect that follows a moving point (beams, channels). */
  setEndpoint?(p: THREE.Vector3): void;
}

interface LiveEffect {
  update(dt: number, elapsed: number, camera?: THREE.Camera): boolean;
  dispose(): void;
  stop(): void;
  handle: EffectHandle;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Projectile halo pool
// ---------------------------------------------------------------------------

/** Wave steps a nova lays down. Each is one emitter call covering a full ring. */
const NOVA_RING_STEPS = 5;
/** Seconds between a cone's particle puffs — cadence, not per-frame. */
const CONE_EMIT_INTERVAL = 0.06;

const haloPool: THREE.SpriteMaterial[] = [];

// ---------------------------------------------------------------------------
// Arrow geometry
// ---------------------------------------------------------------------------

/**
 * A real arrow, not a glowing ball.
 *
 * Physical shots used the same emissive icosahedron every spell uses, scaled to
 * a quarter of a metre and wrapped in a halo six times that wide. A bow fired a
 * one-and-a-half-metre ball of white light. What an arrow needs instead is a
 * shaft, a head and fletching, pointed the way it is flying — the silhouette is
 * the whole read, and it is unmistakable even at two pixels wide.
 *
 * Built once, shared by every arrow in flight, and laid out along +Z so the
 * group can simply `lookAt` its destination.
 */
let arrowParts: { shaft: THREE.BufferGeometry; head: THREE.BufferGeometry; vane: THREE.BufferGeometry } | null = null;

function arrowGeometry(): NonNullable<typeof arrowParts> {
  if (arrowParts) return arrowParts;
  // Shaft: a hex rod down the Z axis, spanning -0.43 .. 0.43.
  const shaft = new THREE.CylinderGeometry(0.016, 0.016, 0.86, 6, 1, true);
  shaft.rotateX(Math.PI * 0.5);
  // Head: a bodkin point sitting on the front of the shaft.
  const head = new THREE.ConeGeometry(0.044, 0.17, 6);
  head.rotateX(Math.PI * 0.5);
  head.translate(0, 0, 0.45);
  // Fletching: a solid sliver rather than a plane, so it does not vanish when
  // seen from its back face.
  const vane = new THREE.BoxGeometry(0.005, 0.072, 0.16);
  vane.translate(0, 0.05, -0.34);
  arrowParts = { shaft, head, vane };
  return arrowParts;
}

/** Wood, steel and feather. Materials are cached, so a volley shares three. */
function arrowMesh(tint: number): THREE.Group {
  const g = arrowGeometry();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(g.shaft, emissiveMaterial(0x6b5334, 0.05)));
  root.add(new THREE.Mesh(g.head, emissiveMaterial(0xb9c2cc, 0.4)));
  for (let i = 0; i < 3; i++) {
    const v = new THREE.Mesh(g.vane, emissiveMaterial(tint, 0.45));
    // Z is the flight axis, so spinning about it revolves the fin around the
    // shaft.
    v.rotation.z = (i / 3) * Math.PI * 2;
    root.add(v);
  }
  return root;
}

function takeHalo(): THREE.SpriteMaterial {
  const hit = haloPool.pop();
  if (hit) {
    hit.opacity = 0.9;
    return hit;
  }
  return new THREE.SpriteMaterial({
    map: radialGlowTexture(128, 2.4),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.9,
  });
}

function giveHalo(m: THREE.SpriteMaterial): void {
  if (haloPool.length >= 24) m.dispose();
  else haloPool.push(m);
}

// ---------------------------------------------------------------------------
// Material pooling
// ---------------------------------------------------------------------------

/**
 * Effect materials are pooled, never destroyed.
 *
 * Every one of these is a ShaderMaterial, and each effect used to build a fresh
 * one on cast and dispose it on finish. Three.js reference-counts compiled GL
 * programs against the materials using them: dropping the last user *deletes
 * the program*, so the next cast of the same spell recompiles the shader from
 * source. That is a multi-millisecond stall on the main thread, and it landed
 * every single time you pressed the button — which is exactly what a lag spike
 * on every cast looks like.
 *
 * Recycling the instance keeps the program alive and skips the allocation. The
 * pool is per shader kind, and each material remembers its own kind so callers
 * can hand it back without tracking which factory produced it.
 */
const materialPool = new Map<string, THREE.ShaderMaterial[]>();
const POOL_LIMIT = 16;

function pooled(kind: string, make: () => THREE.ShaderMaterial): THREE.ShaderMaterial {
  const free = materialPool.get(kind);
  const m = free && free.length > 0 ? free.pop()! : make();
  m.userData.poolKind = kind;
  m.visible = true;
  return m;
}

/** Returns a material to its pool. Use instead of `dispose()` on effect exit. */
export function releaseMaterial(m: THREE.Material | THREE.Material[] | undefined | null): void {
  if (!m) return;
  if (Array.isArray(m)) {
    for (const one of m) releaseMaterial(one);
    return;
  }
  const kind = m.userData?.poolKind as string | undefined;
  if (!kind) {
    m.dispose();
    return;
  }
  let free = materialPool.get(kind);
  if (!free) {
    free = [];
    materialPool.set(kind, free);
  }
  if (free.length >= POOL_LIMIT) m.dispose();
  else free.push(m as THREE.ShaderMaterial);
}

/** Drops every pooled program. Call between runs, not between casts. */
export function disposeEffectMaterials(): void {
  for (const list of materialPool.values()) for (const m of list) m.dispose();
  materialPool.clear();
}

function beamMaterial(color: THREE.Color, core: THREE.Color): THREE.ShaderMaterial {
  const m = pooled('beam', make_beamMaterial);
  m.uniforms.uColor!.value.copy(color);
  m.uniforms.uCore!.value.copy(core);
  if (m.uniforms.uPower) m.uniforms.uPower.value = 1;
  if (m.uniforms.uTime) m.uniforms.uTime.value = 0;
  m.opacity = 1;
  return m;
}

function make_beamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uCore: { value: new THREE.Color(1, 1, 1) },
      uPower: { value: 1 },
      uScroll: { value: 3.2 },
      uNoise: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower, uScroll, uNoise;
      uniform vec3 uColor, uCore;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      ${GLSL_NOISE}
      void main() {
        // Scrolling turbulence along the beam gives it internal motion; a
        // static gradient cylinder always looks like a plastic tube.
        float n = fbm3(vec3(vUv.x * 6.0, vUv.y * 3.0 - uTime * uScroll, uTime * 0.6));
        float fres = pow(1.0 - abs(dot(normalize(vNormalW), vViewDir)), 1.6);

        // Taper: hot and tight at the caster, flaring at the far end.
        float taper = mix(1.0, 0.55, vUv.y);
        float body = taper * (0.35 + 0.65 * mix(1.0, n, uNoise));
        float edge = fres * 1.3;

        vec3 col = mix(uColor, uCore, clamp(edge * 0.6 + body * 0.5, 0.0, 1.0));
        float a = clamp((body * 0.55 + edge * 0.7) * uPower, 0.0, 1.0);
        gl_FragColor = vec4(col * (1.0 + edge * 1.6) * uPower, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function shieldMaterial(color: THREE.Color): THREE.ShaderMaterial {
  const m = pooled('shield', make_shieldMaterial);
  m.uniforms.uColor!.value.copy(color);
  if (m.uniforms.uPower) m.uniforms.uPower.value = 1;
  if (m.uniforms.uTime) m.uniforms.uTime.value = 0;
  m.opacity = 1;
  return m;
}

function make_shieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uPower: { value: 1 },
      /** xyz = last impact point in local space, w = time since impact. */
      uImpact: { value: new THREE.Vector4(0, 0, 0, 99) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower;
      uniform vec3 uColor;
      uniform vec4 uImpact;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      ${GLSL_NOISE}

      // Hex lattice: the classic energy-shield read, and it hides the fact
      // that the dome is a plain sphere.
      float hexGrid(vec2 p) {
        vec2 s = vec2(1.0, 1.7320508);
        vec2 a = mod(p, s) - s * 0.5;
        vec2 b = mod(p - s * 0.5, s) - s * 0.5;
        vec2 g = dot(a, a) < dot(b, b) ? a : b;
        float d = max(abs(g.x) * 0.8660254 + abs(g.y) * 0.5, abs(g.y));
        return smoothstep(0.42, 0.5, d);
      }

      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vNormalW), vViewDir)), 2.2);
        vec3 n = normalize(vLocal);
        float hex = hexGrid(vec2(atan(n.z, n.x) * 3.6, n.y * 6.4));

        // Impact ripple: a ring expanding from where the shield was struck.
        float d = distance(normalize(vLocal), normalize(uImpact.xyz));
        float rt = uImpact.w;
        float ripple = exp(-pow((d - rt * 2.4) * 5.0, 2.0)) * exp(-rt * 3.0);

        float flicker = 0.9 + 0.1 * fbm3(vec3(n * 3.0 + uTime * 0.7));
        float a = (fres * 0.55 + hex * 0.22 + ripple * 0.9) * uPower * flicker;
        vec3 col = uColor * (0.7 + fres * 2.4 + ripple * 4.0 + hex * 0.5);
        if (a < 0.004) discard;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function runeCircleMaterial(color: THREE.Color): THREE.ShaderMaterial {
  const m = pooled('rune', make_runeCircleMaterial);
  m.uniforms.uColor!.value.copy(color);
  if (m.uniforms.uPower) m.uniforms.uPower.value = 1;
  if (m.uniforms.uTime) m.uniforms.uTime.value = 0;
  m.opacity = 1;
  return m;
}

function make_runeCircleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uProgress: { value: 0 },
      uPower: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uProgress, uPower;
      uniform vec3 uColor;
      varying vec2 vUv;
      ${GLSL_NOISE}

      float band(float r, float at, float w) {
        return exp(-pow((r - at) / w, 2.0));
      }

      void main() {
        float r = length(vUv);
        if (r > 1.02) discard;
        float ang = atan(vUv.y, vUv.x);

        // Two counter-rotating glyph rings plus fixed structure rings.
        float outer = band(r, 0.96, 0.012) + band(r, 0.88, 0.008);
        float inner = band(r, 0.34, 0.010);
        float glyphA = step(0.72, abs(sin(ang * 9.0 + uTime * 0.9))) * band(r, 0.78, 0.055);
        float glyphB = step(0.80, abs(sin(ang * 15.0 - uTime * 1.4))) * band(r, 0.62, 0.035);
        float spokes = step(0.985, abs(sin(ang * 6.0 + uTime * 0.35))) * smoothstep(0.98, 0.3, r);

        // The circle draws itself in over uProgress, like it is being inscribed.
        float sweep = smoothstep(uProgress * 6.2832 - 6.2832, uProgress * 6.2832, ang + 3.1416);
        float reveal = mix(sweep, 1.0, smoothstep(0.98, 1.0, uProgress));

        float pulse = 0.75 + 0.25 * sin(uTime * 3.1);
        float a = (outer * 1.1 + inner * 0.8 + glyphA * 0.9 + glyphB * 0.7 + spokes * 0.4) * reveal * uPower;
        float haze = smoothstep(1.0, 0.0, r) * 0.16 * reveal * uPower;
        a = clamp(a + haze, 0.0, 1.0);
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * (1.4 + a * 2.2) * pulse, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function novaRingMaterial(color: THREE.Color): THREE.ShaderMaterial {
  const m = pooled('nova', make_novaRingMaterial);
  m.uniforms.uColor!.value.copy(color);
  if (m.uniforms.uPower) m.uniforms.uPower.value = 1;
  if (m.uniforms.uTime) m.uniforms.uTime.value = 0;
  m.opacity = 1;
  return m;
}

function make_novaRingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uProgress: { value: 0 },
      uThickness: { value: 0.16 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uProgress, uThickness;
      uniform vec3 uColor;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        float r = length(vUv);
        if (r > 1.01) discard;
        float ang = atan(vUv.y, vUv.x);
        // Ragged leading edge — a perfectly circular ring looks synthetic.
        float wob = (fbm3(vec3(cos(ang), sin(ang), uTime * 0.4) * 2.4) - 0.5) * 0.06;
        float front = uProgress + wob;
        float ring = exp(-pow((r - front) / max(uThickness * (1.0 - uProgress * 0.5), 0.02), 2.0));
        float wake = smoothstep(front, front - 0.35, r) * 0.18 * (1.0 - uProgress);
        float a = clamp((ring + wake) * (1.0 - smoothstep(0.75, 1.0, uProgress)), 0.0, 1.0);
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * (1.6 + ring * 3.0), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function auraMaterial(color: THREE.Color): THREE.ShaderMaterial {
  const m = pooled('aura', make_auraMaterial);
  m.uniforms.uColor!.value.copy(color);
  if (m.uniforms.uPower) m.uniforms.uPower.value = 1;
  if (m.uniforms.uTime) m.uniforms.uTime.value = 0;
  m.opacity = 1;
  return m;
}

function make_auraMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uPower: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      ${GLSL_NOISE}
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vNormalW), vViewDir)), 2.4);
        // Vertical licks rising up the cylinder.
        float licks = fbm3(vec3(vUv.x * 7.0, vUv.y * 2.5 - uTime * 1.35, uTime * 0.4));
        float rise = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
        float a = fres * rise * (0.35 + licks * 0.65) * uPower;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * (1.2 + fres * 2.0 + licks), clamp(a, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function vortexMaterial(color: THREE.Color): THREE.ShaderMaterial {
  const m = pooled('vortex', make_vortexMaterial);
  m.uniforms.uColor!.value.copy(color);
  if (m.uniforms.uPower) m.uniforms.uPower.value = 1;
  if (m.uniforms.uTime) m.uniforms.uTime.value = 0;
  m.opacity = 1;
  return m;
}

function make_vortexMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uPower: { value: 1 },
      uSpin: { value: 4.5 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower, uSpin;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      ${GLSL_NOISE}
      void main() {
        // Shear the UV so the noise spirals: the height offsets the angle.
        vec2 p = vec2(vUv.x + vUv.y * 0.8 - uTime * uSpin * 0.16, vUv.y);
        float n = fbm3(vec3(p.x * 9.0, p.y * 3.2 - uTime * 1.1, uTime * 0.5));
        float streak = smoothstep(0.42, 0.9, n);
        float fres = pow(1.0 - abs(dot(normalize(vNormalW), vViewDir)), 1.5);
        float shape = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float a = (streak * 0.75 + fres * 0.35) * shape * uPower;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * (1.0 + streak * 2.4 + fres * 1.4), clamp(a, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Camera-facing jagged arc — chain lightning, tesla tethers, spirit chains. */
class LightningArc {
  readonly mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private pos: THREE.BufferAttribute;
  private segments: number;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private rng: Rng;
  private jitter: number;
  private width: number;
  private tick = 0;
  /** Re-randomise at ~45Hz rather than every frame: a 144Hz arc is a blur. */
  private reseedEvery = 1 / 45;
  private offsets: Float32Array;

  constructor(segments: number, color: THREE.Color, core: THREE.Color, rng: Rng, jitter = 0.32, width = 0.09) {
    this.segments = Math.max(4, segments);
    this.rng = rng;
    this.jitter = jitter;
    this.width = width;
    this.offsets = new Float32Array(this.segments * 3);

    const verts = (this.segments + 1) * 2;
    this.geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    const uvs = new Float32Array(verts * 2);
    for (let i = 0; i <= this.segments; i++) {
      const u = i / this.segments;
      uvs[i * 4] = u; uvs[i * 4 + 1] = 0;
      uvs[i * 4 + 2] = u; uvs[i * 4 + 3] = 1;
    }
    const idx = new Uint16Array(this.segments * 6);
    for (let i = 0; i < this.segments; i++) {
      const v = i * 2;
      const o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v + 1; idx[o + 4] = v + 3; idx[o + 5] = v + 2;
    }
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.mat = pooled('arc', () => new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(1, 1, 1) },
        uCore: { value: new THREE.Color(1, 1, 1) },
        uPower: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor, uCore;
        uniform float uPower, uTime;
        varying vec2 vUv;
        void main() {
          float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
          float core = pow(across, 6.0);
          float glow = pow(across, 1.4);
          // Ends taper so the arc attaches instead of stopping dead.
          float ends = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
          float a = (glow * 0.5 + core) * ends * uPower;
          if (a < 0.005) discard;
          gl_FragColor = vec4(mix(uColor, uCore, core) * (1.5 + core * 4.0), clamp(a, 0.0, 1.0));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));

    this.mat.uniforms.uColor!.value.copy(color);
    this.mat.uniforms.uCore!.value.copy(core);
    this.mat.uniforms.uPower!.value = 1;
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 13;
    this.reseed();
  }

  setEnds(a: THREE.Vector3, b: THREE.Vector3): void {
    this.a.copy(a);
    this.b.copy(b);
  }

  setPower(p: number): void {
    this.mat.uniforms.uPower!.value = p;
  }

  private reseed(): void {
    for (let i = 0; i < this.segments; i++) {
      this.offsets[i * 3] = this.rng.range(-1, 1);
      this.offsets[i * 3 + 1] = this.rng.range(-1, 1);
      this.offsets[i * 3 + 2] = this.rng.range(-1, 1);
    }
  }

  update(dt: number, camera?: THREE.Camera): void {
    this.tick += dt;
    if (this.tick >= this.reseedEvery) {
      this.tick = 0;
      this.reseed();
    }
    const arr = this.pos.array as Float32Array;
    _v1.copy(this.b).sub(this.a);
    const len = _v1.length() || 1;
    _v1.divideScalar(len);
    if (camera) camera.getWorldPosition(_v2);
    else _v2.set(0, 100, 0);
    _v3.copy(this.a).sub(_v2).normalize();
    _v4.crossVectors(_v1, _v3);
    if (_v4.lengthSq() < 1e-8) _v4.set(1, 0, 0);
    _v4.normalize();
    _v5.crossVectors(_v1, _v4).normalize();

    const halfW = this.width * 0.5;
    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments;
      // Displacement peaks in the middle and vanishes at both ends so the arc
      // stays welded to its endpoints.
      const env = Math.sin(t * Math.PI) * this.jitter * len * 0.16;
      const oi = Math.min(this.segments - 1, i) * 3;
      _v6.copy(this.a).addScaledVector(_v1, len * t);
      _v6.addScaledVector(_v4, this.offsets[oi]! * env);
      _v6.addScaledVector(_v5, this.offsets[oi + 1]! * env);
      const w = halfW * (0.55 + 0.45 * Math.sin(t * Math.PI));
      const o = i * 6;
      arr[o] = _v6.x - _v4.x * w; arr[o + 1] = _v6.y - _v4.y * w; arr[o + 2] = _v6.z - _v4.z * w;
      arr[o + 3] = _v6.x + _v4.x * w; arr[o + 4] = _v6.y + _v4.y * w; arr[o + 5] = _v6.z + _v4.z * w;
    }
    this.pos.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    releaseMaterial(this.mat);
  }
}

// ---------------------------------------------------------------------------
// Dissolve
// ---------------------------------------------------------------------------

export interface DissolveControl {
  /** 0 = intact, 1 = gone. */
  set(progress: number): void;
  restore(): void;
}

/**
 * Injects a noise dissolve with a glowing edge into every material under a
 * root, preserving skinning and the original shading. Used for teleports,
 * summons materialising in, and enemy death fades.
 */
export function applyDissolve(root: THREE.Object3D, edgeColor: number, up = true): DissolveControl {
  const uniforms = {
    uDissolve: { value: 0 },
    uEdgeColor: { value: new THREE.Color(edgeColor).multiplyScalar(4) },
    uDir: { value: up ? 1 : -1 },
  };
  const restores: Array<() => void> = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    const original = mesh.material;
    const list = Array.isArray(original) ? original : [original];
    const clones = list.map((m) => {
      const c = m.clone();
      c.transparent = true;
      c.onBeforeCompile = (shader) => {
        shader.uniforms.uDissolve = uniforms.uDissolve;
        shader.uniforms.uEdgeColor = uniforms.uEdgeColor;
        shader.uniforms.uDir = uniforms.uDir;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n varying vec3 vDissolvePos;`)
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n vDissolvePos = transformed;',
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
             uniform float uDissolve; uniform vec3 uEdgeColor; uniform float uDir;
             varying vec3 vDissolvePos;
             ${GLSL_NOISE}`,
          )
          .replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>
             {
               float n = fbm3(vDissolvePos * 5.5);
               // Bias by height so the dissolve sweeps rather than speckles.
               float h = clamp(vDissolvePos.y * uDir * 0.35 + 0.5, 0.0, 1.0);
               float mask = n * 0.65 + h * 0.35;
               float cut = uDissolve * 1.15;
               if (mask < cut - 0.06) discard;
               float edge = 1.0 - smoothstep(cut - 0.06, cut + 0.08, mask);
               gl_FragColor.rgb += uEdgeColor * edge * 2.2;
               gl_FragColor.a *= 1.0 - smoothstep(0.94, 1.0, uDissolve);
             }`,
          );
      };
      c.needsUpdate = true;
      return c;
    });
    mesh.material = Array.isArray(original) ? clones : clones[0]!;
    restores.push(() => {
      for (const c of clones) c.dispose();
      mesh.material = original;
    });
  });

  return {
    set(p: number): void {
      uniforms.uDissolve.value = THREE.MathUtils.clamp(p, 0, 1);
    },
    restore(): void {
      for (const r of restores) r();
      restores.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Scratch vectors
// ---------------------------------------------------------------------------

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0);
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

// ---------------------------------------------------------------------------
// Option shapes
// ---------------------------------------------------------------------------

export interface ImpactOpts {
  color?: number;
  scale?: number;
  dir?: THREE.Vector3;
  /** Screen trauma, 0..1. Defaults by element and scale. */
  shake?: number;
  /** Hit-stop seconds. 0 disables. */
  hitStop?: number;
  /** Point-light intensity multiplier. 0 disables the flash. */
  light?: number;
  /** false to skip the ground decal. */
  decal?: boolean;
  /** Sound id override; null to stay silent. */
  sfx?: string | null;
  crit?: boolean;
  /**
   * Overrides the particle burst this impact spawns. Without it the emitter is
   * chosen by damage type alone, so every fire skill in the game threw exactly
   * the same sparks.
   */
  emitter?: string;
  /** Extra multiplier on the burst's particle count. */
  density?: number;
}

export interface ProjectileOpts {
  element?: DamageType;
  color?: number;
  speed?: number;
  /** Radius of the glowing core. */
  size?: number;
  /** Arc height for lobbed shots. 0 = flat. */
  arc?: number;
  /** Seconds before the projectile self-destructs. */
  maxLife?: number;
  /** Homing strength, 0..1, when a live target getter is supplied. */
  homing?: number;
  target?: () => THREE.Vector3 | null;
  trail?: string | null;
  spin?: number;
  /** Fired when the projectile reaches its destination or its target. */
  onHit?: (p: THREE.Vector3) => void;
  /** Impact effect id; defaults to the element impact. */
  impact?: boolean;
  scale?: number;
  /**
   * What the projectile is made of. Defaults to an arrow for physical damage
   * and a glowing mote for everything else, which is right almost always —
   * override it for a thrown axe that should still look like a spell, or a
   * magic arrow that should still look like an arrow.
   */
  shape?: 'arrow' | 'bolt';
}

export interface BeamOpts {
  /** Per-skill particle override, so two spells of one element differ. */
  emitter?: string;
  /** Multiplier on particle counts. */
  density?: number;
  element?: DamageType;
  color?: number;
  width?: number;
  duration?: number;
  /** Extra impact burst at the far end. */
  endBurst?: boolean;
  power?: number;
}

export interface NovaOpts {
  /** Per-skill particle override, so two spells of one element differ. */
  emitter?: string;
  /** Multiplier on particle counts. */
  density?: number;
  element?: DamageType;
  color?: number;
  duration?: number;
  /** Ring thickness as a fraction of the radius. */
  thickness?: number;
  particles?: boolean;
  shake?: number;
}

export interface CastContext {
  origin: THREE.Vector3;
  target?: THREE.Vector3;
  dir?: THREE.Vector3;
  element?: DamageType;
  color?: number;
  radius?: number;
  duration?: number;
  scale?: number;
  rank?: number;
  source?: THREE.Object3D;
  targetGetter?: () => THREE.Vector3 | null;
  onHit?: (p: THREE.Vector3) => void;
}

// ---------------------------------------------------------------------------
// EffectSystem
// ---------------------------------------------------------------------------

const DEAD_HANDLE: EffectHandle = { stop() {}, done: true };

/**
 * The composable spell VFX library. One instance per scene; scenes tick it.
 */
export class EffectSystem {
  readonly scene: THREE.Scene;
  readonly fx: FXSystem;
  readonly decals: DecalSystem;
  readonly trails: TrailSystem;
  private quality: QualityProfile;
  private rng: Rng;
  private lights: FlashPool;
  private rig: CameraRig | null = null;
  private camera: THREE.Camera | null = null;
  private live: LiveEffect[] = [];
  private elapsed = 0;

  // Shared geometry — created once, reused by every effect, disposed at the end.
  private geoSphere: THREE.SphereGeometry;
  private geoCyl: THREE.CylinderGeometry;
  private geoPlane: THREE.PlaneGeometry;
  private geoCone: THREE.ConeGeometry;
  private geoIcosa: THREE.IcosahedronGeometry;

  constructor(
    scene: THREE.Scene,
    fx: FXSystem,
    decals: DecalSystem,
    quality: QualityProfile,
    rng?: Rng,
    trails?: TrailSystem,
  ) {
    this.scene = scene;
    this.fx = fx;
    this.decals = decals;
    this.quality = quality;
    this.rng = rng ?? new Random(0xfeed01);
    this.trails = trails ?? new TrailSystem(scene, Math.round(48 * Math.max(0.4, quality.fxScale)));

    const lightCount = quality.fxScale >= 1.3 ? 14 : quality.fxScale >= 0.9 ? 10 : quality.fxScale >= 0.5 ? 6 : 3;
    this.lights = new FlashPool(scene, lightCount);

    this.geoSphere = new THREE.SphereGeometry(1, 20, 14);
    this.geoCyl = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
    this.geoPlane = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.geoCone = new THREE.ConeGeometry(1, 1, 22, 1, true);
    this.geoIcosa = new THREE.IcosahedronGeometry(1, 1);
  }

  /** Hand the rig over so heavy effects can drive hit-stop and punch-in. */
  setRig(rig: CameraRig | null): void {
    this.rig = rig;
  }

  setCamera(camera: THREE.Camera | null): void {
    this.camera = camera;
  }

  // -- primitives -----------------------------------------------------------

  /** Fires a one-shot point light. Colour is in sRGB hex. */
  flash(x: number, y: number, z: number, color: number, intensity = 8, distance = 9, duration = 0.16): void {
    this.lights.flash(x, y, z, color, intensity, distance, duration);
  }

  private sfx(id: string, x: number, z: number, pitch?: number): void {
    events.emit('sfx', { id, x, z, pitch });
  }

  private trauma(amount: number): void {
    if (amount <= 0) return;
    if (this.rig) this.rig.addTrauma(amount);
    else events.emit('shake', { amount, duration: 0.3 });
  }

  // -- the one clean call site ----------------------------------------------

  /**
   * The full impact recipe: particles, light flash, emissive pop, decal,
   * screen trauma, hit-stop and sound. Call this and nothing else.
   */
  impact(element: DamageType, x: number, y: number, z: number, opts: ImpactOpts = {}): void {
    const el = look(element);
    const scale = opts.scale ?? 1;
    const color = opts.color ?? el.body;

    const base = opts.crit ? 18 : 10;
    this.fx.burst(opts.emitter ?? el.emitter, x, y, z, {
      color: opts.color,
      scale,
      dir: opts.dir,
      count: Math.max(3, Math.round(base * (opts.density ?? 1))),
    });
    // A second, quieter burst of the element's own emitter whenever the skill
    // overrode it, so a skill still reads as its damage type underneath its own
    // signature.
    if (opts.emitter && opts.emitter !== el.emitter) {
      this.fx.burst(el.emitter, x, y, z, { color: opts.color, scale: scale * 0.7, count: 5 });
    }
    if (opts.crit) this.fx.burst('crit', x, y, z, { color, scale: scale * 0.9 });

    if (opts.light !== 0) {
      const boost = (opts.light ?? 1) * (opts.crit ? 1.7 : 1);
      this.flash(x, y, z, el.light, 9 * scale * boost, 7 * scale + 3, 0.15 + 0.05 * scale);
    }

    if (opts.decal !== false && scale > 0.55) {
      this.decals.add(el.decal, x, z, 0.5 * scale * this.rng.range(0.85, 1.2));
    }

    const shake = opts.shake ?? (opts.crit ? 0.24 : 0.12) * scale;
    this.trauma(shake);

    if (opts.hitStop && this.rig) this.rig.hitStop(opts.hitStop, 0.05);
    else if (opts.crit && this.rig) this.rig.hitStop(0.045, 0.08);

    if (opts.sfx !== null) this.sfx(opts.sfx ?? el.sfxHit, x, z);
  }

  /** A melee blood/flesh hit — physical impact plus gore. */
  meleeHit(x: number, y: number, z: number, opts: ImpactOpts = {}): void {
    const scale = opts.scale ?? 1;
    this.fx.burst('blood', x, y, z, { scale, dir: opts.dir });
    this.impact('physical', x, y, z, { ...opts, decal: false });
    if (scale > 0.8) this.decals.add('bloodSplatter', x, z, 0.5 * scale);
  }

  /** A kill: gore, a decal pool, a light pop, a slow-motion beat for elites. */
  kill(x: number, y: number, z: number, opts: { scale?: number; element?: DamageType; heavy?: boolean; color?: number } = {}): void {
    const scale = opts.scale ?? 1;
    const el = look(opts.element);
    this.fx.burst('gib', x, y + 0.3, z, { scale });
    this.fx.burst('dissolve', x, y + 0.3, z, { scale, color: opts.color ?? el.body });
    this.decals.splatter('gore', x, z, 0.7 * scale, 3);
    this.flash(x, y + 0.5, z, el.light, 6 * scale, 6, 0.2);
    this.trauma(opts.heavy ? 0.4 : 0.12 * scale);
    if (opts.heavy && this.rig) {
      this.rig.hitStop(0.09, 0.03);
      this.rig.slowMo(0.5, 0.5);
    }
    this.sfx(opts.heavy ? 'death.heavy' : 'death.normal', x, z);
  }

  // -- projectiles ----------------------------------------------------------

  /**
   * A travelling projectile with a glowing core, a ribbon trail, a moving
   * light, and a full impact on arrival.
   */
  projectile(from: THREE.Vector3, to: THREE.Vector3, opts: ProjectileOpts = {}): EffectHandle {
    const element = opts.element ?? 'fire';
    const el = look(element);
    const color = opts.color ?? el.body;
    const size = (opts.size ?? 0.22) * (opts.scale ?? 1);
    const speed = opts.speed ?? 18;

    // A physical shot is an arrow; anything else is a mote of its element.
    // Firing a bow used to launch the same glowing ball a fireball does, only
    // beige, which is why arrows read as white blobs rather than as arrows.
    const isArrow = opts.shape === 'arrow' || (opts.shape !== 'bolt' && element === 'physical');

    const group = new THREE.Group();
    let core: THREE.Object3D;
    if (isArrow) {
      core = arrowMesh(color);
      core.scale.setScalar(Math.max(0.7, size / 0.24));
    } else {
      core = new THREE.Mesh(this.geoIcosa, emissiveMaterial(opts.color ?? el.core, 5));
      core.scale.setScalar(size);
    }
    group.add(core);

    // A soft additive halo sells the light without needing a second light.
    //
    // It needs a texture. A SpriteMaterial with no map draws a solid quad, so
    // additively blended at six times the projectile's size this was rendering
    // every arrow, bolt and firebolt in the game as an enormous white square.
    //
    // It is also pooled. Building and disposing a material per shot deletes the
    // compiled GL program each time the last user goes away, and recompiles it
    // on the next shot — a stall on every single projectile fired.
    //
    // An arrow gets a much smaller one. The halo is standing in for the light a
    // fireball throws; an arrow throws none, and at six times its own size the
    // glow was all anyone could see of it.
    const haloMat = takeHalo();
    haloMat.color.set(color).multiplyScalar(isArrow ? 0.5 : 2.4);
    haloMat.opacity = isArrow ? 0.32 : 0.9;
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(size * (isArrow ? 1.6 : 4.2));
    group.add(halo);

    group.position.copy(from);
    this.scene.add(group);

    const trailName = opts.trail === null ? null : (opts.trail ?? el.trail);
    const trail: Trail | null = trailName ? this.trails.spawn(trailName, { width: size * 0.85 }) : null;
    if (trail) trail.setColors(el.core, el.tail);

    this.sfx(el.sfxCast, from.x, from.z);

    const self = this;
    const start = from.clone();
    const dest = to.clone();
    const flat = new THREE.Vector3(dest.x - start.x, 0, dest.z - start.z);
    const totalDist = Math.max(0.001, flat.length());
    const arc = opts.arc ?? 0;
    const aim = new THREE.Vector3();
    let travelled = 0;
    let life = 0;
    const maxLife = opts.maxLife ?? 6;
    const pos = group.position;
    let stopped = false;
    let finished = false;

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };

    const effect: LiveEffect = {
      handle,
      stop(): void { stopped = true; },
      update(dt: number, _elapsed: number, camera?: THREE.Camera): boolean {
        life += dt;
        if (stopped || life > maxLife) {
          finished = true;
          return false;
        }

        // Homing: bend the destination toward a live target each frame.
        if (opts.target && opts.homing) {
          const t = opts.target();
          if (t) dest.lerp(t, Math.min(1, opts.homing * dt * 6));
        }

        travelled += speed * dt;
        const t = Math.min(1, travelled / totalDist);
        pos.set(
          start.x + (dest.x - start.x) * t,
          start.y + (dest.y - start.y) * t + (arc > 0 ? Math.sin(t * Math.PI) * arc : 0),
          start.z + (dest.z - start.z) * t,
        );
        if (isArrow) {
          // Nose into the flight path, including the drop at the end of a lob.
          aim.set(dest.x - start.x, dest.y - start.y, dest.z - start.z).normalize();
          if (arc > 0) aim.y += Math.cos(t * Math.PI) * arc * Math.PI / Math.max(1, totalDist);
          core.lookAt(pos.x + aim.x, pos.y + aim.y, pos.z + aim.z);
        } else {
          if (opts.spin) core.rotation.y += opts.spin * dt;
          core.rotation.x += dt * 3.1;
        }

        if (trail) trail.pushPoint(pos.x, pos.y, pos.z);

        // A dim travelling light: cheap, and it makes the projectile feel like
        // it is actually made of fire rather than painted on. An arrow is a
        // stick, not a flare, so it does not get one.
        if (!isArrow && self.quality.fxScale >= 0.9 && self.rng.chance(0.5)) {
          self.flash(pos.x, pos.y, pos.z, el.light, 2.2, 5, 0.07);
        }
        if (!isArrow) {
          self.fx.burst(el.emitter, pos.x, pos.y, pos.z, {
            count: 1,
            scale: 0.35 * (opts.scale ?? 1),
            color: opts.color,
          });
        }

        if (t >= 1) {
          if (opts.impact !== false) {
            self.impact(element, pos.x, pos.y, pos.z, { scale: opts.scale ?? 1, color: opts.color });
          }
          opts.onHit?.(pos.clone());
          finished = true;
          return false;
        }
        void camera;
        return true;
      },
      dispose(): void {
        self.scene.remove(group);
        // The core's material is *not* released. `emissiveMaterial` hands back a
        // shared, cached instance, so disposing it here destroyed the compiled
        // program out from under every other projectile using the same colour —
        // and left the cache holding a dead material for the next shot to pick
        // up and re-upload. Every arrow fired paid for that.
        giveHalo(haloMat);
        trail?.retire(0.18);
      },
    };
    this.live.push(effect);
    return handle;
  }

  /** A meteor: a lobbed projectile from high above with a heavy impact. */
  meteor(x: number, z: number, opts: { height?: number; delay?: number; radius?: number; color?: number; element?: DamageType; onHit?: (p: THREE.Vector3) => void ; emitter?: string; density?: number } = {}): EffectHandle {
    const element = opts.element ?? 'fire';
    const el = look(element);
    const height = opts.height ?? 22;
    const radius = opts.radius ?? 3;
    const from = new THREE.Vector3(x + this.rng.range(-4, 4), height, z + this.rng.range(-4, 4));
    const to = new THREE.Vector3(x, 0.3, z);

    // Telegraph first — a meteor the player cannot dodge is just damage.
    const tg = this.decals.telegraph('circle', x, z, radius, 0, opts.delay ?? 1.1, opts.color ?? el.body);
    const self = this;

    return this.delay(opts.delay ?? 1.1, () => {
      tg.cancel();
      self.projectile(from, to, {
        element,
        color: opts.color,
        speed: 42,
        size: 0.55,
        trail: 'fire',
        impact: false,
        onHit: (p) => {
          self.explosion(p.x, p.y, p.z, { radius, element, color: opts.color });
          opts.onHit?.(p);
        },
      });
      self.sfx('spell.meteor', x, z);
    });
  }

  // -- area effects ---------------------------------------------------------

  /** A ground explosion: fireball, shockwave ring, scorch, light, big shake. */
  explosion(x: number, y: number, z: number, opts: { radius?: number; element?: DamageType; color?: number; shake?: number } = {}): void {
    const el = look(opts.element ?? 'fire');
    const r = opts.radius ?? 3;
    const scale = r / 3;

    this.fx.burst('explosion', x, y + 0.2, z, { scale, color: opts.color });
    this.flash(x, y + 0.6, z, el.light, 34 * scale, 14 * scale + 4, 0.34);
    this.decals.add(el.decal, x, z, r * 0.75);
    this.decals.add('burn', x, z, r * 0.55, undefined, 3.5);
    this.nova(x, z, r, { element: opts.element ?? 'fire', color: opts.color, duration: 0.45, particles: false });
    this.trauma(opts.shake ?? Math.min(0.75, 0.32 * scale));
    if (this.rig) this.rig.hitStop(0.055, 0.06);
    this.sfx('spell.explosion', x, z);
  }

  /** Expanding shockwave ring on the ground. */
  nova(x: number, z: number, radius: number, opts: NovaOpts = {}): EffectHandle {
    const el = look(opts.element);
    _c1.setHex(opts.color ?? el.body).multiplyScalar(1.6);
    const mat = novaRingMaterial(_c1);
    mat.uniforms.uThickness!.value = opts.thickness ?? 0.16;
    const mesh = new THREE.Mesh(this.geoPlane, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.05, z);
    mesh.scale.setScalar(radius * 2);
    mesh.renderOrder = 9;
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    const duration = opts.duration ?? 0.55;
    let t = 0;
    let stopped = false;
    let finished = false;
    const self = this;
    let emitted = 0;

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number, elapsed: number): boolean {
        t += dt;
        const p = t / duration;
        mat.uniforms.uProgress!.value = p;
        mat.uniforms.uTime!.value = elapsed;
        if (opts.particles !== false) {
          // Particles riding the ring front, so the wave has volume.
          //
          // This used to be ten wave steps of six separate `burst` calls each —
          // sixty calls per nova, every one of them emitting about a single
          // particle after the quality scale, which is the worst ratio of
          // overhead to picture the system can produce. Five calls now, each
          // laying a whole circle at once. Same wave, twelve times fewer calls.
          const want = Math.floor(p * NOVA_RING_STEPS);
          while (emitted < want) {
            emitted++;
            const front = radius * (emitted / NOVA_RING_STEPS);
            self.fx.burst(opts.emitter ?? el.emitter, x, 0.25, z, {
              count: Math.round(14 * Math.max(0.4, self.quality.fxScale)),
              scale: 0.4,
              ring: front,
              color: opts.color,
            });
          }
        }
        if (stopped || p >= 1) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        self.scene.remove(mesh);
        releaseMaterial(mat);
      },
    });

    if (opts.shake) this.trauma(opts.shake);
    return handle;
  }

  /**
   * Ground slam: telegraph, then a heavy landing with concentric shockwaves,
   * dust, radial cracks, a hard camera hit and a bass thump.
   */
  slam(x: number, z: number, radius: number, opts: { windup?: number; element?: DamageType; color?: number; emitter?: string; density?: number; onFire?: () => void } = {}): EffectHandle {
    const el = look(opts.element ?? 'physical');
    const windup = opts.windup ?? 0.9;
    const tg = this.decals.telegraph('circle', x, z, radius, 0, windup, opts.color ?? 0xff5020);
    const self = this;
    this.sfx('boss.windup', x, z);

    return this.delay(windup, () => {
      tg.cancel();
      self.fx.burst('bossSlam', x, 0.2, z, { scale: radius / 3.5, color: opts.color });
      self.flash(x, 1.0, z, el.light, 26 * (radius / 3.5), 16, 0.3);
      self.decals.add('crack', x, z, radius * 0.9);
      self.decals.add('dust', x, z, radius * 1.1);
      for (let i = 0; i < 3; i++) {
        self.nova(x, z, radius * (0.75 + i * 0.28), {
          element: opts.element ?? 'physical',
          color: opts.color,
          duration: 0.45 + i * 0.16,
          thickness: 0.12,
          particles: i === 0,
        });
      }
      // Radial cracks read as the floor actually breaking.
      const spokes = Math.round(7 * Math.max(0.4, self.quality.fxScale));
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2 + self.rng.range(-0.2, 0.2);
        const d = radius * self.rng.range(0.45, 0.95);
        self.decals.add('crack', x + Math.cos(a) * d, z + Math.sin(a) * d, radius * 0.32, a);
      }
      self.trauma(0.85);
      if (self.rig) {
        self.rig.hitStop(0.1, 0.02);
        self.rig.setRumble(0);
      }
      self.sfx('boss.slam', x, z);
      opts.onFire?.();
    });
  }

  /** A cone blast — dragon breath, frost cone, shout. */
  cone(origin: THREE.Vector3, direction: THREE.Vector3, halfAngle: number, range: number, opts: { element?: DamageType; color?: number; duration?: number; emitter?: string; density?: number } = {}): EffectHandle {
    const el = look(opts.element);
    _c1.setHex(opts.color ?? el.body);
    _c2.setHex(el.core);
    const mat = beamMaterial(_c1, _c2);
    mat.uniforms.uScroll!.value = 1.4;

    const mesh = new THREE.Mesh(this.geoCone, mat);
    const radius = Math.tan(halfAngle) * range;
    mesh.scale.set(radius, range, radius);
    // Cone geometry points +Y from its centre; move the apex to the origin and
    // aim it down `direction`.
    const pivot = new THREE.Group();
    mesh.position.y = -range * 0.5;
    mesh.rotation.x = Math.PI;
    pivot.add(mesh);
    pivot.position.copy(origin);
    _v1.copy(direction).normalize();
    _q.setFromUnitVectors(_UP, _v1);
    pivot.quaternion.copy(_q);
    this.scene.add(pivot);

    const yaw = Math.atan2(direction.x, direction.z);
    const tg = this.decals.telegraphEx('cone', origin.x, origin.z, range, yaw, opts.duration ?? 0.7, opts.color ?? el.body, halfAngle);

    const duration = opts.duration ?? 0.7;
    let t = 0;
    let emitAccum = CONE_EMIT_INTERVAL;
    let stopped = false;
    let finished = false;
    const self = this;

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };

    this.sfx(el.sfxCast, origin.x, origin.z);

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number, elapsed: number): boolean {
        t += dt;
        const p = t / duration;
        mat.uniforms.uTime!.value = elapsed;
        // Snap open, hold, then fade.
        mat.uniforms.uPower!.value = Math.min(1, p * 6) * (1 - Math.max(0, (p - 0.6) / 0.4));
        // One scattered burst per tick, not five every frame.
        //
        // This fired five separate `burst` calls on every single frame for the
        // whole duration — eighty calls for one breath of a cone, each emitting
        // about a particle. It now emits on a fixed cadence regardless of frame
        // rate, in one call that scatters across the cone's own width, so the
        // effect costs the same on a fast machine as a slow one.
        emitAccum += dt;
        if (emitAccum >= CONE_EMIT_INTERVAL) {
          emitAccum = 0;
          const mid = range * 0.55;
          _v1.set(direction.x, 0.1, direction.z).normalize();
          self.fx.burst(
            opts.emitter ?? el.emitter,
            origin.x + direction.x * mid,
            origin.y + 0.15,
            origin.z + direction.z * mid,
            {
              count: Math.round(16 * Math.max(0.4, self.quality.fxScale)),
              scale: 0.7,
              dir: _v1,
              color: opts.color,
              speed: 1.6,
              // Wide enough to fill the cone's mouth at its midpoint.
              scatter: Math.max(0.6, Math.sin(halfAngle) * mid),
            },
          );
        }
        if (stopped || p >= 1) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        tg.cancel();
        self.scene.remove(pivot);
        releaseMaterial(mat);
      },
    });
    return handle;
  }

  // -- beams ----------------------------------------------------------------

  /** A straight energy beam between two points. */
  beam(from: THREE.Vector3, to: THREE.Vector3, opts: BeamOpts = {}): EffectHandle {
    const el = look(opts.element);
    _c1.setHex(opts.color ?? el.body);
    _c2.setHex(el.core);
    const mat = beamMaterial(_c1, _c2);
    const width = opts.width ?? 0.28;
    const mesh = new THREE.Mesh(this.geoCyl, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    this.scene.add(mesh);

    const a = from.clone();
    const b = to.clone();
    const duration = opts.duration ?? 0.35;
    let t = 0;
    let stopped = false;
    let finished = false;
    const self = this;

    const place = (): void => {
      _v1.copy(b).sub(a);
      const len = _v1.length() || 0.001;
      mesh.position.copy(a).addScaledVector(_v1, 0.5);
      _q.setFromUnitVectors(_UP, _v2.copy(_v1).divideScalar(len));
      mesh.quaternion.copy(_q);
      mesh.scale.set(width, len, width);
    };
    place();

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
      setEndpoint(p: THREE.Vector3): void { b.copy(p); },
    };

    this.sfx(el.sfxCast, from.x, from.z);
    this.flash(from.x, from.y, from.z, el.light, 8, 7, 0.14);

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number, elapsed: number): boolean {
        t += dt;
        const p = t / duration;
        place();
        mat.uniforms.uTime!.value = elapsed;
        // Fast strike-in, sustained, quick collapse.
        const env = Math.min(1, p * 9) * (1 - Math.max(0, (p - 0.55) / 0.45));
        mat.uniforms.uPower!.value = env * (opts.power ?? 1);
        if (opts.endBurst !== false && self.rng.chance(0.55)) {
          self.fx.burst(el.emitter, b.x, b.y, b.z, { count: 3, scale: 0.6, color: opts.color });
        }
        if (stopped || p >= 1) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        self.scene.remove(mesh);
        releaseMaterial(mat);
      },
    });
    return handle;
  }

  /**
   * A channelled beam that persists until `stop()`. `endpoint` is re-read every
   * frame so the beam tracks a moving caster and target.
   */
  channel(
    getFrom: () => THREE.Vector3,
    getTo: () => THREE.Vector3,
    opts: BeamOpts & { maxDuration?: number; tickSfx?: string } = {},
  ): EffectHandle {
    const el = look(opts.element);
    _c1.setHex(opts.color ?? el.body);
    _c2.setHex(el.core);
    const mat = beamMaterial(_c1, _c2);
    mat.uniforms.uScroll!.value = 4.5;
    const width = opts.width ?? 0.24;
    const mesh = new THREE.Mesh(this.geoCyl, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    this.scene.add(mesh);

    let stopped = false;
    let finished = false;
    let fade = 0;
    let t = 0;
    const maxDuration = opts.maxDuration ?? 30;
    const self = this;

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number, elapsed: number): boolean {
        t += dt;
        const a = getFrom();
        const b = getTo();
        _v1.copy(b).sub(a);
        const len = _v1.length() || 0.001;
        mesh.position.copy(a).addScaledVector(_v1, 0.5);
        _q.setFromUnitVectors(_UP, _v2.copy(_v1).divideScalar(len));
        mesh.quaternion.copy(_q);

        if (stopped) fade = Math.min(1, fade + dt * 7);
        const power = (1 - fade) * Math.min(1, t * 6) * (opts.power ?? 1);
        // Breathing width sells "sustained energy" rather than "static tube".
        const breathe = 1 + Math.sin(elapsed * 11) * 0.09;
        mesh.scale.set(width * breathe * (1 - fade), len, width * breathe * (1 - fade));
        mat.uniforms.uTime!.value = elapsed;
        mat.uniforms.uPower!.value = power;

        if (!stopped) {
          self.fx.burst(el.emitter, b.x, b.y, b.z, { count: 2, scale: 0.5, color: opts.color });
          if (self.rng.chance(0.25)) self.flash(b.x, b.y, b.z, el.light, 4, 6, 0.09);
        }
        if ((stopped && fade >= 1) || t > maxDuration) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        self.scene.remove(mesh);
        releaseMaterial(mat);
      },
    });
    return handle;
  }

  /**
   * Chain lightning. `points` is the jump order, starting at the caster. Each
   * link is a procedurally jagged arc that re-randomises 45 times a second.
   */
  chainLightning(points: THREE.Vector3[], opts: { color?: number; duration?: number; jumpDelay?: number; width?: number } = {}): EffectHandle {
    if (points.length < 2) return DEAD_HANDLE;
    const el = look('lightning');
    _c1.setHex(opts.color ?? el.body).multiplyScalar(1.2);
    _c2.setHex(el.core);

    const arcs: LightningArc[] = [];
    const segs = Math.max(6, Math.round(10 * Math.max(0.5, this.quality.fxScale)));
    for (let i = 0; i < points.length - 1; i++) {
      const arc = new LightningArc(segs, _c1, _c2, this.rng, 0.4, opts.width ?? 0.14);
      arc.setEnds(points[i]!, points[i + 1]!);
      arc.setPower(0);
      this.scene.add(arc.mesh);
      arcs.push(arc);
    }

    const duration = opts.duration ?? 0.34;
    const jumpDelay = opts.jumpDelay ?? 0.045;
    let t = 0;
    let stopped = false;
    let finished = false;
    const self = this;
    const fired = new Array<boolean>(points.length).fill(false);

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };

    this.sfx('spell.chainLightning', points[0]!.x, points[0]!.z);

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number, _elapsed: number, camera?: THREE.Camera): boolean {
        t += dt;
        for (let i = 0; i < arcs.length; i++) {
          const startAt = i * jumpDelay;
          const local = (t - startAt) / duration;
          const power = local <= 0 ? 0 : local >= 1 ? 0 : Math.min(1, local * 14) * (1 - Math.max(0, (local - 0.35) / 0.65));
          arcs[i]!.setPower(power);
          if (power > 0) arcs[i]!.update(dt, camera ?? self.camera ?? undefined);
          if (local > 0 && !fired[i + 1]) {
            fired[i + 1] = true;
            const p = points[i + 1]!;
            self.impact('lightning', p.x, p.y, p.z, { scale: 0.85, shake: 0.1, light: 1.2, decal: false, sfx: null });
          }
        }
        if (stopped || t > duration + jumpDelay * arcs.length) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        for (const a of arcs) {
          self.scene.remove(a.mesh);
          a.dispose();
        }
      },
    });
    return handle;
  }

  /** A persistent tether (leash, drain, summon link) between two live points. */
  tether(getFrom: () => THREE.Vector3, getTo: () => THREE.Vector3, opts: { color?: number; element?: DamageType; width?: number; jitter?: number } = {}): EffectHandle {
    const el = look(opts.element ?? 'arcane');
    _c1.setHex(opts.color ?? el.body);
    _c2.setHex(el.core);
    const arc = new LightningArc(12, _c1, _c2, this.rng, opts.jitter ?? 0.22, opts.width ?? 0.1);
    this.scene.add(arc.mesh);

    let stopped = false;
    let finished = false;
    let fade = 0;
    const self = this;

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number, _elapsed: number, camera?: THREE.Camera): boolean {
        if (stopped) fade = Math.min(1, fade + dt * 6);
        arc.setEnds(getFrom(), getTo());
        arc.setPower(1 - fade);
        arc.update(dt, camera ?? self.camera ?? undefined);
        if (stopped && fade >= 1) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        self.scene.remove(arc.mesh);
        arc.dispose();
      },
    });
    return handle;
  }

  // -- persistent world effects ---------------------------------------------

  /** A whirlwind vortex that follows an object. */
  whirlwind(follow: THREE.Object3D, opts: { radius?: number; height?: number; color?: number; element?: DamageType; duration?: number } = {}): EffectHandle {
    const el = look(opts.element ?? 'physical');
    _c1.setHex(opts.color ?? el.body);
    const mat = vortexMaterial(_c1);
    const radius = opts.radius ?? 1.6;
    const height = opts.height ?? 2.4;
    const mesh = new THREE.Mesh(this.geoCyl, mat);
    mesh.scale.set(radius, height, radius);
    mesh.frustumCulled = false;
    mesh.renderOrder = 11;
    this.scene.add(mesh);

    const duration = opts.duration ?? 2.5;
    let t = 0;
    let stopped = false;
    let finished = false;
    const self = this;

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };

    this.sfx('spell.whirlwind', follow.position.x, follow.position.z);

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number, elapsed: number): boolean {
        t += dt;
        follow.getWorldPosition(_v1);
        mesh.position.set(_v1.x, _v1.y + height * 0.5, _v1.z);
        mesh.rotation.y += dt * 7.5;
        mat.uniforms.uTime!.value = elapsed;
        const fadeIn = Math.min(1, t * 5);
        const fadeOut = stopped ? Math.max(0, 1 - (t - 0) * 0) : 1 - Math.max(0, (t - (duration - 0.3)) / 0.3);
        mat.uniforms.uPower!.value = fadeIn * Math.max(0, fadeOut);

        // Debris ripped up and flung outward.
        const n = Math.round(4 * Math.max(0.4, self.quality.fxScale));
        for (let i = 0; i < n; i++) {
          const a = self.rng.range(0, Math.PI * 2);
          _v2.set(Math.cos(a), 0.5, Math.sin(a));
          self.fx.burst('dust', _v1.x + Math.cos(a) * radius * 0.9, _v1.y + self.rng.range(0.1, height), _v1.z + Math.sin(a) * radius * 0.9, {
            count: 1, scale: 0.8, dir: _v2,
          });
        }
        if (stopped || t >= duration) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        self.scene.remove(mesh);
        releaseMaterial(mat);
      },
    });
    return handle;
  }

  /** A rotating summoning circle that inscribes itself over its wind-up. */
  summonCircle(x: number, z: number, radius: number, duration: number, color = 0xa855ff): EffectHandle {
    _c1.setHex(color);
    const mat = runeCircleMaterial(_c1);
    const mesh = new THREE.Mesh(this.geoPlane, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.04, z);
    mesh.scale.setScalar(radius * 2);
    mesh.renderOrder = 9;
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    let t = 0;
    let stopped = false;
    let finished = false;
    const self = this;
    const inscribe = Math.min(duration * 0.5, 0.9);

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };

    this.sfx('spell.summon', x, z);

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number, elapsed: number): boolean {
        t += dt;
        mat.uniforms.uTime!.value = elapsed;
        mat.uniforms.uProgress!.value = Math.min(1, t / inscribe);
        mat.uniforms.uPower!.value = 1 - Math.max(0, (t - (duration - 0.4)) / 0.4);
        mesh.rotation.z += dt * 0.35;
        if (self.rng.chance(0.5)) {
          const a = self.rng.range(0, Math.PI * 2);
          const d = self.rng.range(0.3, 1) * radius;
          self.fx.burst('summon', x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, { count: 2, scale: 0.6, color });
        }
        if (stopped || t >= duration) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        self.scene.remove(mesh);
        releaseMaterial(mat);
      },
    });
    return handle;
  }

  /** A persistent aura around an entity — buffs, elite auras, boss phases. */
  aura(follow: THREE.Object3D, opts: { radius?: number; height?: number; color?: number; element?: DamageType; groundRing?: boolean } = {}): EffectHandle {
    const el = look(opts.element);
    const color = opts.color ?? el.body;
    _c1.setHex(color);
    const mat = auraMaterial(_c1);
    const radius = opts.radius ?? 1.1;
    const height = opts.height ?? 2.2;
    const mesh = new THREE.Mesh(this.geoCyl, mat);
    mesh.scale.set(radius, height, radius);
    mesh.frustumCulled = false;
    mesh.renderOrder = 11;
    this.scene.add(mesh);

    let ring: THREE.Mesh | null = null;
    let ringMat: THREE.ShaderMaterial | null = null;
    if (opts.groundRing !== false) {
      ringMat = runeCircleMaterial(_c1);
      ringMat.uniforms.uProgress!.value = 1;
      ringMat.uniforms.uPower!.value = 0.55;
      ring = new THREE.Mesh(this.geoPlane, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(radius * 2.6);
      ring.renderOrder = 9;
      ring.frustumCulled = false;
      this.scene.add(ring);
    }

    let stopped = false;
    let finished = false;
    let fade = 0;
    let t = 0;
    const self = this;

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number, elapsed: number): boolean {
        t += dt;
        follow.getWorldPosition(_v1);
        mesh.position.set(_v1.x, _v1.y + height * 0.5, _v1.z);
        if (ring) ring.position.set(_v1.x, _v1.y + 0.05, _v1.z);
        mat.uniforms.uTime!.value = elapsed;
        if (stopped) fade = Math.min(1, fade + dt * 3);
        const power = (1 - fade) * Math.min(1, t * 3);
        mat.uniforms.uPower!.value = power;
        if (ringMat) {
          ringMat.uniforms.uTime!.value = elapsed;
          ringMat.uniforms.uPower!.value = power * 0.55;
        }
        if (self.rng.chance(0.35 * self.quality.fxScale)) {
          const a = self.rng.range(0, Math.PI * 2);
          self.fx.burst('embers', _v1.x + Math.cos(a) * radius, _v1.y + 0.2, _v1.z + Math.sin(a) * radius, {
            count: 1, scale: 0.7, color,
          });
        }
        if (stopped && fade >= 1) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        self.scene.remove(mesh);
        releaseMaterial(mat);
        if (ring) {
          self.scene.remove(ring);
          // Pooled like every other effect shader — disposing it deletes the
          // program the next aura would have reused.
          releaseMaterial(ringMat);
        }
      },
    });
    return handle;
  }

  /**
   * A fresnel-shaded energy dome. `handle.setEndpoint(worldPoint)` registers an
   * impact so the shield ripples where it was struck.
   */
  shield(follow: THREE.Object3D, radius: number, color = 0x60a0ff, duration = 6): EffectHandle {
    _c1.setHex(color);
    const mat = shieldMaterial(_c1);
    const mesh = new THREE.Mesh(this.geoSphere, mat);
    mesh.scale.setScalar(radius);
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    this.scene.add(mesh);

    let t = 0;
    let stopped = false;
    let finished = false;
    let fade = 0;
    let impactAge = 99;
    const self = this;

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
      setEndpoint(p: THREE.Vector3): void {
        _v1.copy(p).sub(mesh.position).normalize();
        (mat.uniforms.uImpact!.value as THREE.Vector4).set(_v1.x, _v1.y, _v1.z, 0);
        impactAge = 0;
        self.fx.burst('shieldHit', p.x, p.y, p.z, { color });
        self.sfx('block.magic', p.x, p.z);
      },
    };

    this.sfx('spell.shield', follow.position.x, follow.position.z);

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number, elapsed: number): boolean {
        t += dt;
        impactAge += dt;
        follow.getWorldPosition(_v1);
        mesh.position.set(_v1.x, _v1.y + radius * 0.55, _v1.z);
        mat.uniforms.uTime!.value = elapsed;
        (mat.uniforms.uImpact!.value as THREE.Vector4).w = impactAge;
        if (stopped || t > duration - 0.4) fade = Math.min(1, fade + dt * 2.6);
        mat.uniforms.uPower!.value = (1 - fade) * Math.min(1, t * 4);
        if (fade >= 1) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        self.scene.remove(mesh);
        releaseMaterial(mat);
      },
    });
    return handle;
  }

  // -- teleports ------------------------------------------------------------

  /** Vanish: an upward column of motes plus a collapsing ring. */
  teleportOut(x: number, y: number, z: number, color = 0x8a5cff): void {
    this.fx.burst('teleport', x, y + 0.5, z, { color });
    this.fx.burst('dissolve', x, y + 0.5, z, { color, scale: 1.1 });
    this.flash(x, y + 1, z, color, 12, 8, 0.22);
    this.decals.add('rune', x, z, 1.0, undefined, 0.8);
    this.nova(x, z, 1.4, { color, duration: 0.35, particles: false, element: 'arcane' });
    this.sfx('spell.teleportOut', x, z);
  }

  /** Arrive: an inward implosion then a bright pop. */
  teleportIn(x: number, y: number, z: number, color = 0x8a5cff): void {
    this.fx.burst('teleport', x, y + 0.5, z, { color, scale: 1.2 });
    this.fx.burst('arcane', x, y + 0.7, z, { color });
    this.flash(x, y + 1, z, color, 16, 9, 0.26);
    this.decals.add('rune', x, z, 1.2, undefined, 1.2);
    this.nova(x, z, 1.8, { color, duration: 0.4, particles: false, element: 'arcane' });
    this.sfx('spell.teleportIn', x, z);
  }

  /** Dissolves an object over `duration`, then invokes `onDone`. */
  dissolveObject(root: THREE.Object3D, duration: number, color = 0xff6a20, onDone?: () => void): EffectHandle {
    const ctl = applyDissolve(root, color, true);
    let t = 0;
    let stopped = false;
    let finished = false;
    const self = this;

    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };

    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number): boolean {
        t += dt;
        const p = Math.min(1, t / duration);
        ctl.set(p);
        root.getWorldPosition(_v1);
        if (self.rng.chance(0.7)) {
          self.fx.burst('dissolve', _v1.x, _v1.y + p * 1.2, _v1.z, { count: 3, scale: 0.7, color });
        }
        if (stopped || p >= 1) {
          finished = true;
          return false;
        }
        return true;
      },
      dispose(): void {
        ctl.restore();
        onDone?.();
      },
    });
    return handle;
  }

  // -- utility --------------------------------------------------------------

  /** Runs `fn` after `seconds`, on the effect clock (so it respects hit-stop). */
  delay(seconds: number, fn: () => void): EffectHandle {
    let t = 0;
    let stopped = false;
    let finished = false;
    const handle: EffectHandle = {
      stop(): void { stopped = true; },
      get done(): boolean { return finished; },
    };
    this.live.push({
      handle,
      stop(): void { stopped = true; },
      update(dt: number): boolean {
        t += dt;
        if (stopped) {
          finished = true;
          return false;
        }
        if (t >= seconds) {
          finished = true;
          fn();
          return false;
        }
        return true;
      },
      dispose(): void {},
    });
    return handle;
  }

  /** A drifting item-drop beacon: rarity-coloured shaft plus sparkle. */
  dropBeacon(x: number, y: number, z: number, color: number): void {
    this.fx.burst('itemDrop', x, y + 0.3, z, { color });
    this.flash(x, y + 0.6, z, color, 5, 5, 0.35);
    this.decals.add('glow', x, z, 0.7, undefined, 1.4);
  }

  /** Level-up: a golden column, expanding rings, and a real light bloom. */
  levelUp(x: number, y: number, z: number): void {
    this.fx.burst('levelup', x, y, z, { scale: 1.2 });
    this.flash(x, y + 1.2, z, 0xffc040, 40, 18, 0.7);
    this.nova(x, z, 3.4, { color: 0xffc040, duration: 0.8, element: 'fire', particles: false });
    this.nova(x, z, 5.0, { color: 0xffe090, duration: 1.1, element: 'fire', particles: false });
    this.decals.add('rune', x, z, 2.6, undefined, 1.6);
    this.trauma(0.2);
    if (this.rig) this.rig.punchIn(0.07, 0.9);
    this.sfx('levelup', x, z);
  }

  // -- named cast dispatch --------------------------------------------------

  /**
   * Resolves a skill/ability `effect` id to a concrete visual.
   *
   * Unknown ids fall back to a sensible element-driven effect chosen from the
   * context (a target point becomes a projectile, a direction becomes a cone,
   * neither becomes a nova). That means a designer can invent a new skill id
   * and still get a shippable effect, and no missing id can crash a run.
   */
  cast(id: string, ctx: CastContext): EffectHandle {
    const el = ctx.element ?? 'arcane';
    const color = ctx.color;
    const radius = ctx.radius ?? 3;
    const dur = ctx.duration ?? 0.6;
    const o = ctx.origin;
    const t = ctx.target;

    switch (id) {
      case 'projectile':
      case 'fireball':
      case 'frostbolt':
      case 'boltSpell':
      case 'arrow':
      case 'spit':
        if (!t) break;
        return this.projectile(o, t, {
          element: el, color, scale: ctx.scale,
          speed: id === 'arrow' ? 34 : 20,
          trail: id === 'arrow' ? 'arrow' : undefined,
          target: ctx.targetGetter, homing: ctx.targetGetter ? 0.25 : 0,
          onHit: ctx.onHit,
        });

      case 'lob':
      case 'grenade':
      case 'mortar':
        if (!t) break;
        return this.projectile(o, t, { element: el, color, speed: 14, arc: 3.5, onHit: ctx.onHit });

      case 'meteor':
      case 'meteorStrike':
        return this.meteor(t?.x ?? o.x, t?.z ?? o.z, { radius, color, element: el, onHit: ctx.onHit });

      case 'beam':
      case 'ray':
      case 'lance':
      case 'disintegrate':
        if (!t) break;
        return this.beam(o, t, { element: el, color, duration: dur });

      case 'channel':
      case 'drain':
      case 'flamethrower':
        if (!ctx.targetGetter) break;
        return this.channel(() => o, () => ctx.targetGetter!() ?? o, { element: el, color });

      case 'chain':
      case 'chainLightning':
      case 'arc': {
        const pts = [o.clone()];
        if (t) pts.push(t.clone());
        return this.chainLightning(pts, { color });
      }

      case 'nova':
      case 'frostNova':
      case 'shockNova':
      case 'bloodNova':
        return this.nova(o.x, o.z, radius, { element: el, color, duration: dur, shake: 0.2 });

      case 'explosion':
      case 'blast':
        this.explosion(o.x, o.y, o.z, { radius, element: el, color });
        return DEAD_HANDLE;

      case 'slam':
      case 'groundSlam':
      case 'quake':
        return this.slam(o.x, o.z, radius, { element: el, color, windup: ctx.duration ?? 0.9, onFire: () => ctx.onHit?.(o) });

      case 'cone':
      case 'breath':
      case 'shout':
      case 'cleave':
        return this.cone(o, ctx.dir ?? _v1.set(0, 0, 1), id === 'cleave' ? Math.PI * 0.35 : Math.PI * 0.22, radius, { element: el, color, duration: dur });

      case 'whirlwind':
      case 'spin':
        if (!ctx.source) break;
        return this.whirlwind(ctx.source, { radius: radius * 0.5, color, element: el, duration: ctx.duration ?? 2.5 });

      case 'summon':
      case 'raise':
        return this.summonCircle(o.x, o.z, radius * 0.6, ctx.duration ?? 1.6, color ?? 0xa855ff);

      case 'aura':
      case 'buff':
        if (!ctx.source) break;
        return this.aura(ctx.source, { color, element: el, radius: radius * 0.4 });

      case 'shield':
      case 'barrier':
      case 'ward':
        if (!ctx.source) break;
        return this.shield(ctx.source, radius * 0.5, color ?? 0x60a0ff, ctx.duration ?? 6);

      case 'teleport':
      case 'blink':
      case 'shadowStep':
        this.teleportOut(o.x, o.y, o.z, color ?? 0x8a5cff);
        if (t) this.teleportIn(t.x, t.y, t.z, color ?? 0x8a5cff);
        return DEAD_HANDLE;

      case 'heal':
        this.fx.burst('heal', o.x, o.y + 0.4, o.z, { scale: ctx.scale ?? 1 });
        this.flash(o.x, o.y + 1, o.z, 0x50ff90, 8, 7, 0.3);
        this.sfx('spell.heal', o.x, o.z);
        return DEAD_HANDLE;

      case 'levelup':
        this.levelUp(o.x, o.y, o.z);
        return DEAD_HANDLE;

      case 'impact':
      case 'hit':
        this.impact(el, o.x, o.y, o.z, { color, scale: ctx.scale });
        return DEAD_HANDLE;

      default:
        break;
    }

    // --- graceful fallback -------------------------------------------------
    if (t) return this.projectile(o, t, { element: el, color, onHit: ctx.onHit });
    if (ctx.dir) return this.cone(o, ctx.dir, Math.PI * 0.25, radius, { element: el, color, duration: dur });
    return this.nova(o.x, o.z, radius, { element: el, color, duration: dur });
  }

  // -- frame ----------------------------------------------------------------

  update(dt: number, elapsed: number, camera?: THREE.Camera): void {
    this.elapsed = elapsed;
    if (camera) this.camera = camera;
    this.lights.update(dt);
    this.trails.update(dt, camera ?? this.camera ?? undefined);

    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i]!;
      let alive: boolean;
      try {
        alive = e.update(dt, elapsed, camera ?? this.camera ?? undefined);
      } catch (err) {
        console.error('[fx] effect update threw', err);
        alive = false;
      }
      if (!alive) {
        e.dispose();
        this.live.splice(i, 1);
      }
    }
  }

  /** Number of live composite effects — handy for a debug overlay. */
  get liveCount(): number {
    return this.live.length;
  }

  /** Stops and frees every live effect without tearing the system down. */
  clear(): void {
    for (const e of this.live) e.dispose();
    this.live.length = 0;
    this.trails.clear();
  }

  dispose(): void {
    this.clear();
    this.lights.dispose();
    this.trails.dispose();
    this.geoSphere.dispose();
    this.geoCyl.dispose();
    this.geoPlane.dispose();
    this.geoCone.dispose();
    this.geoIcosa.dispose();
    // Pooled programs outlive individual effects but not the run.
    disposeEffectMaterials();
    void this.elapsed;
  }
}

/**
 * SLAY vfx kit: the particle field.
 *
 * One instanced quad mesh, one draw call, for every particle in a scene.
 *
 * - **Stateless on the GPU.** A spawn writes one record (26 floats) into a
 *   ring buffer; the vertex shader integrates position, size, colour and frame
 *   as a pure function of age. A frame with no new spawns uploads nothing, and
 *   nothing is ever allocated after construction.
 * - **One blend for everything.** Output is premultiplied: `rgb` is light
 *   added, `a` is how much of what is behind gets hidden (`ONE,
 *   ONE_MINUS_SRC_ALPHA`). Sparks hide nothing (pure light), smoke hides a lot
 *   and adds almost nothing, fire does a little of both. Because every layer
 *   occludes some, piled-up fire converges on fire colour rather than
 *   summing to white, and smoke and flame share one draw call.
 * - **Heat, not colour.** Sprites store heat; each particle carries a three
 *   stop ramp (tail, body, core) and a heat that falls over its life. The same
 *   flame flipbook is fire, frost-fire or fel-fire depending on the ramp.
 * - **Debris lands.** A particle can carry the floor height under it and
 *   never sinks through it, so bone chips, blood and stones come to rest.
 */

import * as THREE from 'three';
import { spriteAtlas, GLSL_CELL, FLIPBOOKS } from './Atlas';
import { GLSL_UNPACK } from './Palette';

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;

  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iTime;   // spawn, life, fadePow, spin
  attribute vec4 iSize;   // size0, size1, stretch (<0 lies flat), sprite (+100 flipbook)
  attribute vec4 iCol;    // core, body, tail (packed linear rgb), emission
  attribute vec4 iPhys;   // gravity, drag, turbulence, seed
  attribute vec4 iLook;   // heat0, heat1, occlusion, floor (-999 none)

  varying vec2 vUvA;
  varying vec2 vUvB;
  varying float vFrameMix;
  varying vec3 vCore;
  varying vec3 vBody;
  varying vec3 vTail;
  varying float vHeat;
  varying float vEmit;
  varying float vOccl;
  varying float vAlpha;
  varying float vViewZ;

  ${GLSL_UNPACK}
  ${GLSL_CELL}

  void main() {
    float life = max(iTime.y, 1e-4);
    float age = uTime - iTime.x;
    float alive = step(0.0, age) * step(age, life);
    float ta = clamp(age, 0.0, life);
    float t = ta / life;

    // Closed-form exponential drag: the whole path is a function of age.
    float k = iPhys.y;
    vec3 disp = k > 1e-3 ? iVel * (1.0 - exp(-k * ta)) / k : iVel * ta;
    disp.y += 0.5 * iPhys.x * ta * ta;
    float sd = iPhys.w;
    disp += vec3(
      sin(ta * 2.3 + sd * 17.0) + 0.5 * sin(ta * 5.3 + sd * 7.1),
      0.6 * sin(ta * 1.9 + sd * 11.0),
      cos(ta * 2.1 + sd * 13.0) + 0.5 * cos(ta * 4.9 + sd * 5.3)
    ) * iPhys.z * ta;

    vec3 wpos = iPos + disp;

    // Ease-out size: puffs bloom fast then settle.
    float g = 1.0 - (1.0 - t) * (1.0 - t);
    float size = mix(iSize.x, iSize.y, g) * uScale * alive;
    float floorY = iLook.w;
    if (floorY > -900.0) wpos.y = max(wpos.y, floorY + size * 0.3);

    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 camFwd   = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    vec2 corner = position.xy;
    vec3 offset;
    float ang = iTime.w * ta + sd * 6.2831853;
    float ca = cos(ang);
    float sa = sin(ang);
    vec2 rc = vec2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);

    if (iSize.z < -0.001) {
      // Lies flat on the ground: shock rings, sigils, splashes.
      offset = vec3(rc.x, 0.0, rc.y) * size;
    } else if (iSize.z > 0.001) {
      // Stretched along velocity: sparks read as speed, not as dots.
      vec3 vel = (k > 1e-3 ? iVel * exp(-k * ta) : iVel) + vec3(0.0, iPhys.x * ta, 0.0);
      float sp = length(vel);
      vec3 vdir = sp > 1e-4 ? vel / sp : camUp;
      vec3 side = normalize(cross(vdir, camFwd) + vec3(1e-5));
      float len = size * (1.0 + iSize.z * sp * 0.08);
      offset = side * corner.x * size + vdir * corner.y * len;
    } else {
      offset = camRight * rc.x * size + camUp * rc.y * size;
    }

    vec4 mv = modelViewMatrix * vec4(wpos + offset, 1.0);
    vViewZ = -mv.z;
    gl_Position = projectionMatrix * mv;

    // Frame selection: flipbooks play across the life, cross-faded.
    float sprite = iSize.w;
    vec2 luv = uv;
    if (sprite >= 99.5) {
      float base = sprite - 100.0;
      float fr = clamp(t, 0.0, 0.999) * 8.0;
      float f0 = floor(fr);
      float f1 = min(f0 + 1.0, 7.0);
      vFrameMix = fr - f0;
      vUvA = cellUv(base + f0, luv);
      vUvB = cellUv(base + f1, luv);
    } else {
      vFrameMix = 0.0;
      vUvA = cellUv(sprite, luv);
      vUvB = vUvA;
    }

    vCore = unpackRGB(iCol.x);
    vBody = unpackRGB(iCol.y);
    vTail = unpackRGB(iCol.z);
    vEmit = iCol.w;
    vHeat = mix(iLook.x, iLook.y, t);
    vOccl = iLook.z;
    float fadeIn = smoothstep(0.0, 0.06, t);
    float fadeOut = pow(max(1.0 - t, 0.0), iTime.z);
    vAlpha = fadeIn * fadeOut * alive;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFogMode;

  varying vec2 vUvA;
  varying vec2 vUvB;
  varying float vFrameMix;
  varying vec3 vCore;
  varying vec3 vBody;
  varying vec3 vTail;
  varying float vHeat;
  varying float vEmit;
  varying float vOccl;
  varying float vAlpha;
  varying float vViewZ;

  void main() {
    vec4 a = texture2D(uAtlas, vUvA);
    vec4 b = texture2D(uAtlas, vUvB);
    vec4 tex = mix(a, b, vFrameMix);
    float cov = tex.a * vAlpha;
    if (cov < 0.003) discard;

    // Heat through the ramp: tail -> body -> core.
    float h = clamp(tex.r * vHeat, 0.0, 1.0);
    vec3 col = mix(vTail, vBody, smoothstep(0.05, 0.5, h));
    col = mix(col, vCore, smoothstep(0.6, 0.98, h));
    // Hotter parts shine more; the cool edge stays dim so the shape reads.
    vec3 light = col * vEmit * (0.18 + 1.1 * h);

    float occl = cov * vOccl;
    vec3 rgb = light * cov;

    if (uFogMode > 0.5) {
      float f = uFogMode < 1.5
        ? smoothstep(uFogNear, uFogFar, vViewZ)
        : 1.0 - exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);
      f = clamp(f, 0.0, 1.0);
      rgb = rgb * (1.0 - f) + uFogColor * occl * f;
    }
    gl_FragColor = vec4(rgb, occl);
  }
`;

/** Floats per attribute. 26 per particle. */
const LAYOUT = { iPos: 3, iVel: 3, iTime: 4, iSize: 4, iCol: 4, iPhys: 4, iLook: 4 } as const;
type AttrName = keyof typeof LAYOUT;
const ATTRS = Object.keys(LAYOUT) as AttrName[];

/**
 * One particle to write. The caller fills the shared `P` record and calls
 * `field.spawn()`; nothing is allocated per particle.
 */
export interface ParticleRecord {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  delay: number; life: number; fade: number; spin: number;
  size0: number; size1: number; stretch: number; sprite: number;
  core: number; body: number; tail: number; emit: number;
  gravity: number; drag: number; turb: number; seed: number;
  heat0: number; heat1: number; occl: number; floor: number;
}

/** The shared scratch record. Fill, then `spawn()`. */
export const P: ParticleRecord = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  delay: 0, life: 1, fade: 1.5, spin: 0,
  size0: 0.2, size1: 0.2, stretch: 0, sprite: 24,
  core: 0, body: 0, tail: 0, emit: 1,
  gravity: 0, drag: 0, turb: 0, seed: 0,
  heat0: 1, heat1: 0, occl: 0, floor: -999,
};

/** Premultiplied "light over" blending shared by every kit material. */
export function premultiplied(mat: THREE.Material): void {
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.OneFactor;
  mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  mat.premultipliedAlpha = true;
  mat.transparent = true;
  mat.depthWrite = false;
}

export class ParticleField {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private arrays: Record<AttrName, Float32Array>;
  private attrs: Record<AttrName, THREE.InstancedBufferAttribute>;
  private head = 0;
  private high = 0;
  private lo = Infinity;
  private hi = -Infinity;
  private time = 0;
  /** Particles written since the last `flush`. */
  spawnedThisFrame = 0;

  constructor(capacity: number) {
    this.capacity = Math.max(256, capacity | 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const arrays = {} as Record<AttrName, Float32Array>;
    const attrs = {} as Record<AttrName, THREE.InstancedBufferAttribute>;
    for (const k of ATTRS) {
      const arr = new Float32Array(this.capacity * LAYOUT[k]);
      const a = new THREE.InstancedBufferAttribute(arr, LAYOUT[k]);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(k, a);
      arrays[k] = arr;
      attrs[k] = a;
    }
    geo.instanceCount = 0;
    this.geo = geo;
    this.arrays = arrays;
    this.attrs = attrs;

    this.mat = new THREE.ShaderMaterial({
      name: 'fx-particles',
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 },
        uAtlas: { value: spriteAtlas() },
        uFogColor: { value: new THREE.Color(0) },
        uFogDensity: { value: 0 },
        uFogNear: { value: 1 },
        uFogFar: { value: 100 },
        uFogMode: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    premultiplied(this.mat);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'fx:particles';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }

  /** Current clock (seconds), the time base new spawns are stamped with. */
  get now(): number {
    return this.time;
  }

  /** Writes the shared record `P` into the next slot. */
  spawn(r: ParticleRecord = P): void {
    const i = this.head;
    this.head = i + 1 === this.capacity ? 0 : i + 1;
    if (i + 1 > this.high) this.high = i + 1;
    const A = this.arrays;
    let o = i * 3;
    A.iPos[o] = r.x; A.iPos[o + 1] = r.y; A.iPos[o + 2] = r.z;
    A.iVel[o] = r.vx; A.iVel[o + 1] = r.vy; A.iVel[o + 2] = r.vz;
    o = i * 4;
    A.iTime[o] = this.time + r.delay; A.iTime[o + 1] = r.life; A.iTime[o + 2] = r.fade; A.iTime[o + 3] = r.spin;
    A.iSize[o] = r.size0; A.iSize[o + 1] = r.size1; A.iSize[o + 2] = r.stretch;
    A.iSize[o + 3] = FLIPBOOKS.has(r.sprite) ? r.sprite + 100 : r.sprite;
    A.iCol[o] = r.core; A.iCol[o + 1] = r.body; A.iCol[o + 2] = r.tail; A.iCol[o + 3] = r.emit;
    A.iPhys[o] = r.gravity; A.iPhys[o + 1] = r.drag; A.iPhys[o + 2] = r.turb; A.iPhys[o + 3] = r.seed;
    A.iLook[o] = r.heat0; A.iLook[o + 1] = r.heat1; A.iLook[o + 2] = r.occl; A.iLook[o + 3] = r.floor;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    this.spawnedThisFrame++;
  }

  /** Advances the clock and uploads only the slots written this frame. */
  update(dt: number, scale = 1): void {
    this.time += dt;
    const u = this.mat.uniforms;
    u.uTime!.value = this.time;
    u.uScale!.value = scale;
    this.geo.instanceCount = this.high;
    this.spawnedThisFrame = 0;
    if (this.hi < this.lo) return;
    // A wrap in the ring makes lo..hi the whole buffer; that is still one
    // upload per attribute, and it happens at most once per wrap.
    const lo = this.lo;
    const n = this.hi - lo + 1;
    for (const k of ATTRS) {
      const a = this.attrs[k];
      a.clearUpdateRanges();
      a.addUpdateRange(lo * LAYOUT[k], n * LAYOUT[k]);
      a.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -Infinity;
  }

  setFog(fog: THREE.Fog | THREE.FogExp2 | null): void {
    const u = this.mat.uniforms;
    if (fog instanceof THREE.FogExp2) {
      u.uFogMode!.value = 2;
      u.uFogDensity!.value = fog.density;
      (u.uFogColor!.value as THREE.Color).copy(fog.color);
    } else if (fog instanceof THREE.Fog) {
      u.uFogMode!.value = 1;
      u.uFogNear!.value = fog.near;
      u.uFogFar!.value = fog.far;
      (u.uFogColor!.value as THREE.Color).copy(fog.color);
    } else u.uFogMode!.value = 0;
  }

  /** Live slots ever written (the draw range). */
  get highWater(): number {
    return this.high;
  }

  clear(): void {
    this.arrays.iTime.fill(0);
    const a = this.attrs.iTime;
    a.clearUpdateRanges();
    a.needsUpdate = true;
    this.head = 0;
    this.high = 0;
    this.geo.instanceCount = 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

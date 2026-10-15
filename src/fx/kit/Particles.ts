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

import * as THREE from 'three/webgpu';
import {
  attribute, cameraWorldMatrix, clamp, cos, cross, exp, float, floor, length, max, min, mix, normalize, positionGeometry, positionView,
  pow, sin, smoothstep, step, texture, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { markRange, markAll } from './Upload';
import { spriteAtlas, cellUv, FLIPBOOKS } from './Atlas';
import { unpackRGB } from './Palette';
import { FX_EXPOSURE } from './Exposure';
import { setNodeTextures, vary, type V3 } from '../../core/Tsl';

/** Floats per attribute. 26 per particle. */
const LAYOUT = { iPos: 3, iVel: 3, iTime: 4, iSize: 4, iCol: 4, iPhys: 4, iLook: 4 } as const;
type AttrName = keyof typeof LAYOUT;
const ATTRS = Object.keys(LAYOUT) as AttrName[];
/**
 * All seven ride in one interleaved buffer: WebGPU allows eight vertex
 * buffers per draw, and seven of their own plus the quad's two is nine.
 */
const STRIDE = 26;
const OFFSET = {} as Record<AttrName, number>;
{
  let o = 0;
  for (const k of ATTRS) {
    OFFSET[k] = o;
    o += LAYOUT[k];
  }
}

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
  // The shaders write premultiplied colour themselves; a node material
  // with this flag would multiply by alpha a second time.
  mat.premultipliedAlpha = false;
  mat.transparent = true;
  mat.depthWrite = false;
}

export class ParticleField {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.MeshBasicNodeMaterial;
  private uTime = uniform(0);
  private uScale = uniform(1);
  private uFogColor = uniform(new THREE.Color(0));
  private uFogDensity = uniform(0);
  private uFogNear = uniform(1);
  private uFogFar = uniform(100);
  private uFogMode = uniform(0);
  private data: Float32Array;
  private buffer: THREE.InstancedInterleavedBuffer;
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
    this.data = new Float32Array(this.capacity * STRIDE);
    this.buffer = new THREE.InstancedInterleavedBuffer(this.data, STRIDE);
    this.buffer.setUsage(THREE.DynamicDrawUsage);
    for (const k of ATTRS) geo.setAttribute(k, new THREE.InterleavedBufferAttribute(this.buffer, LAYOUT[k], OFFSET[k]));
    geo.instanceCount = 0;
    this.geo = geo;

    this.mat = this.build();
    premultiplied(this.mat);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'fx:particles';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }

  /**
   * The vertex stage works each particle's place, size, colour and frame
   * out from its age; the pixel stage runs heat through the ramp.
   */
  private build(): THREE.MeshBasicNodeMaterial {
    const iPos = attribute<'vec3'>('iPos', 'vec3');
    const iVel = attribute<'vec3'>('iVel', 'vec3');
    // spawn, life, fadePow, spin
    const iTime = attribute<'vec4'>('iTime', 'vec4');
    // size0, size1, stretch (<0 lies flat), sprite (+100 flipbook)
    const iSize = attribute<'vec4'>('iSize', 'vec4');
    // core, body, tail (packed linear rgb), emission
    const iCol = attribute<'vec4'>('iCol', 'vec4');
    // gravity, drag, turbulence, seed
    const iPhys = attribute<'vec4'>('iPhys', 'vec4');
    // heat0, heat1, occlusion, floor (-999 none)
    const iLook = attribute<'vec4'>('iLook', 'vec4');

    const life = max(iTime.y, 1e-4).toVar();
    const age = this.uTime.sub(iTime.x).toVar();
    const alive = step(0.0, age).mul(step(age, life)).toVar();
    const ta = clamp(age, 0.0, life).toVar();
    const t = ta.div(life).toVar();

    // Closed-form exponential drag: the whole path is a function of age.
    const k = iPhys.y.toVar();
    const dragged = k.greaterThan(1e-3);
    const disp0 = dragged.select(iVel.mul(exp(k.negate().mul(ta)).oneMinus()).div(max(k, 1e-3)), iVel.mul(ta));
    const sd = iPhys.w.toVar();
    const wobble = vec3(
      sin(ta.mul(2.3).add(sd.mul(17.0))).add(sin(ta.mul(5.3).add(sd.mul(7.1))).mul(0.5)),
      sin(ta.mul(1.9).add(sd.mul(11.0))).mul(0.6),
      cos(ta.mul(2.1).add(sd.mul(13.0))).add(cos(ta.mul(4.9).add(sd.mul(5.3))).mul(0.5)),
    ).mul(iPhys.z).mul(ta);
    const wpos0 = iPos.add(disp0).add(vec3(0.0, iPhys.x.mul(0.5).mul(ta).mul(ta), 0.0)).add(wobble).toVar();

    // Ease-out size: puffs bloom fast then settle.
    const g = t.oneMinus().mul(t.oneMinus()).oneMinus();
    const size = mix(iSize.x, iSize.y, g).mul(this.uScale).mul(alive).toVar();
    const floorY = iLook.w;
    const wpos = vec3(wpos0.x, floorY.greaterThan(-900.0).select(max(wpos0.y, floorY.add(size.mul(0.3))), wpos0.y), wpos0.z);

    const camRight = cameraWorldMatrix.mul(vec4(1.0, 0.0, 0.0, 0.0)).xyz;
    const camUp = cameraWorldMatrix.mul(vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    const camFwd = cameraWorldMatrix.mul(vec4(0.0, 0.0, 1.0, 0.0)).xyz;
    const corner = positionGeometry.xy;
    const ang = iTime.w.mul(ta).add(sd.mul(6.2831853));
    const ca = cos(ang);
    const sa = sin(ang);
    const rc = vec2(corner.x.mul(ca).sub(corner.y.mul(sa)), corner.x.mul(sa).add(corner.y.mul(ca)));

    // Lies flat on the ground: shock rings, sigils, splashes.
    const flat = vec3(rc.x, 0.0, rc.y).mul(size);
    // Stretched along velocity: sparks read as speed, not as dots.
    const vel = dragged.select(iVel.mul(exp(k.negate().mul(ta))), iVel).add(vec3(0.0, iPhys.x.mul(ta), 0.0)).toVar();
    const sp = length(vel).toVar();
    const vdir = sp.greaterThan(1e-4).select(vel.div(max(sp, 1e-4)), camUp);
    const side = normalize(cross(vdir, camFwd).add(vec3(1e-5)));
    const len = size.mul(iSize.z.mul(sp).mul(0.08).add(1.0));
    const streak = side.mul(corner.x).mul(size).add(vdir.mul(corner.y).mul(len));
    const facing = camRight.mul(rc.x).mul(size).add(camUp.mul(rc.y).mul(size));
    const offset = iSize.z.lessThan(-0.001).select(flat, iSize.z.greaterThan(0.001).select(streak, facing));

    // Frame selection: flipbooks play across the life, cross-faded.
    const sprite = iSize.w;
    const book = sprite.greaterThanEqual(99.5);
    const fr = clamp(t, 0.0, 0.999).mul(8.0);
    const f0 = floor(fr);
    const f1 = min(f0.add(1.0), 7.0);
    const base = sprite.sub(100.0);
    const luv = uv();
    const vUvA = vary(book.select(cellUv(base.add(f0), luv), cellUv(sprite, luv)));
    const vUvB = vary(book.select(cellUv(base.add(f1), luv), cellUv(sprite, luv)));
    const vFrameMix = vary(book.select(fr.sub(f0), float(0.0)));
    const vCore = vary(unpackRGB(iCol.x));
    const vBody = vary(unpackRGB(iCol.y));
    const vTail = vary(unpackRGB(iCol.z));
    const vEmit = vary(iCol.w);
    const vHeat = vary(mix(iLook.x, iLook.y, t));
    const vOccl = vary(iLook.z);
    const fadeIn = smoothstep(0.0, 0.06, t);
    const fadeOut = pow(max(t.oneMinus(), 0.0), iTime.z);
    const vAlpha = vary(fadeIn.mul(fadeOut).mul(alive));

    const atlas = spriteAtlas();
    const tex = mix(texture(atlas, vUvA), texture(atlas, vUvB), vFrameMix).toVar();
    const cov = tex.a.mul(vAlpha).toVar();
    // Heat through the ramp: tail -> body -> core.
    const h = clamp(tex.r.mul(vHeat), 0.0, 1.0).toVar();
    const col = mix(mix(vTail, vBody, smoothstep(0.05, 0.5, h)), vCore, smoothstep(0.6, 0.98, h));
    // Hotter parts shine more; the cool edge stays dim so the shape reads.
    const light = col.mul(vEmit).mul(h.mul(1.1).add(0.18));
    const occl = cov.mul(vOccl).toVar();
    const rgb = light.mul(cov).toVar();
    const viewZ = positionView.z.negate();
    const fLin = smoothstep(this.uFogNear, this.uFogFar, viewZ);
    const fExp = exp(this.uFogDensity.mul(this.uFogDensity).mul(viewZ).mul(viewZ).negate()).oneMinus();
    const f = clamp(this.uFogMode.lessThan(1.5).select(fLin, fExp), 0.0, 1.0).mul(step(0.5, this.uFogMode)).toVar();
    const fogged = rgb.mul(f.oneMinus()).add((this.uFogColor as unknown as V3).mul(occl).mul(f));

    const m = new THREE.MeshBasicNodeMaterial({ name: 'fx-particles', side: THREE.DoubleSide, depthTest: true });
    m.fog = false;
    m.positionNode = wpos.add(offset);
    m.colorNode = fogged.mul(FX_EXPOSURE);
    m.opacityNode = occl;
    m.maskNode = cov.greaterThanEqual(0.003);
    setNodeTextures(m, [atlas]);
    return m;
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
    const D = this.data;
    const o = i * STRIDE;
    // iPos, iVel, iTime, iSize, iCol, iPhys, iLook, in that order.
    D[o] = r.x; D[o + 1] = r.y; D[o + 2] = r.z;
    D[o + 3] = r.vx; D[o + 4] = r.vy; D[o + 5] = r.vz;
    D[o + 6] = this.time + r.delay; D[o + 7] = r.life; D[o + 8] = r.fade; D[o + 9] = r.spin;
    D[o + 10] = r.size0; D[o + 11] = r.size1; D[o + 12] = r.stretch;
    D[o + 13] = FLIPBOOKS.has(r.sprite) ? r.sprite + 100 : r.sprite;
    D[o + 14] = r.core; D[o + 15] = r.body; D[o + 16] = r.tail; D[o + 17] = r.emit;
    D[o + 18] = r.gravity; D[o + 19] = r.drag; D[o + 20] = r.turb; D[o + 21] = r.seed;
    D[o + 22] = r.heat0; D[o + 23] = r.heat1; D[o + 24] = r.occl; D[o + 25] = r.floor;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    this.spawnedThisFrame++;
  }

  /** Advances the clock and uploads only the slots written this frame. */
  update(dt: number, scale = 1): void {
    this.time += dt;
    this.uTime.value = this.time;
    this.uScale.value = scale;
    this.geo.instanceCount = this.high;
    this.spawnedThisFrame = 0;
    if (this.hi < this.lo) return;
    // A wrap in the ring makes lo..hi the whole buffer; that is still one
    // upload, and it happens at most once per wrap.
    const lo = this.lo;
    const n = this.hi - lo + 1;
    markRange(this.buffer, lo * STRIDE, n * STRIDE);
    this.lo = Infinity;
    this.hi = -Infinity;
  }

  setFog(fog: THREE.Fog | THREE.FogExp2 | null): void {
    if (fog instanceof THREE.FogExp2) {
      this.uFogMode.value = 2;
      this.uFogDensity.value = fog.density;
      this.uFogColor.value.copy(fog.color);
    } else if (fog instanceof THREE.Fog) {
      this.uFogMode.value = 1;
      this.uFogNear.value = fog.near;
      this.uFogFar.value = fog.far;
      this.uFogColor.value.copy(fog.color);
    } else this.uFogMode.value = 0;
  }

  /** Live slots ever written (the draw range). */
  get highWater(): number {
    return this.high;
  }

  clear(): void {
    // A birth time of zero and a life of zero: every slot reads as dead.
    for (let o = OFFSET.iTime; o < this.data.length; o += STRIDE) this.data.fill(0, o, o + 4);
    markAll(this.buffer);
    this.head = 0;
    this.high = 0;
    this.geo.instanceCount = 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/**
 * SLAY vfx kit: the particle field.
 *
 * One instanced quad mesh, one draw call, for every particle in a scene.
 *
 * - **Moved on the GPU.** A spawn writes one record (28 floats) into a ring
 *   buffer. A compute pass (a small program the graphics card runs once per
 *   particle) then owns its place and speed: gravity, drag, a swirling flow
 *   field and the floor, a step every frame. The draw reads that place and
 *   works size, colour and frame out from age. A frame with no new spawns
 *   uploads nothing, and nothing is ever allocated after construction.
 * - **One blend for everything.** Output is premultiplied: `rgb` is light
 *   added, `a` is how much of what is behind gets hidden (`ONE,
 *   ONE_MINUS_SRC_ALPHA`). Sparks hide nothing (pure light), smoke hides a lot
 *   and adds almost nothing, fire does a little of both. Because every layer
 *   occludes some, piled-up fire converges on fire colour rather than
 *   summing to white, and smoke and flame share one draw call.
 * - **Heat, not colour.** Sprites store heat; each particle carries a three
 *   stop ramp (tail, body, core) and a heat that falls over its life. The same
 *   flame flipbook is fire, frost-fire or fel-fire depending on the ramp.
 * - **Debris lands.** A particle can carry the floor height under it. It
 *   bounces off it, slides to a stop, and never sinks through, so bone chips,
 *   blood and stones come to rest.
 * - **Smoke swirls together.** Turbulence is one flow field shared by every
 *   particle, so neighbours drift as a sheet and curl like real smoke.
 * - **The GPU picks what to draw.** After the motion pass, three small
 *   compute passes keep only the particles that are alive and on screen and
 *   write their slots, in ring order, into a draw list. The draw is indirect:
 *   the GPU writes its own instance count, so the main thread never learns
 *   (or waits for) how many are drawn. Ring order is kept on purpose: the
 *   blend is order dependent, and a shuffled list would make smoke and flame
 *   swap places from frame to frame.
 */

import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, abs, atomicAdd, cameraWorldMatrix, clamp, cos, cross, exp, float, floor, instanceIndex, length, max, min, mix, normalize,
  positionGeometry, positionView, pow, sin, smoothstep, step, storage, texture, uint, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { markRange, markAll } from './Upload';
import { spriteAtlas, cellUv, FLIPBOOKS } from './Atlas';
import { unpackRGB } from './Palette';
import { FX_EXPOSURE } from './Exposure';
import { setNodeTextures, vary, type F, type V3, type V4 } from '../../core/Tsl';

/**
 * Each spawn is seven vec4s (28 floats) in one storage buffer, read by both
 * the motion pass and the draw:
 *
 * 0: x, y, z, birth time      1: vx, vy, vz, life
 * 2: fade, spin, stretch, sprite (+100 flipbook)
 * 3: size0, size1, seed, floor (-999 none)
 * 4: core, body, tail (packed linear rgb), emission
 * 5: gravity, drag, turbulence, occlusion
 * 6: heat0, heat1, bounce, -
 */
const VEC4S = 7;
const STRIDE = VEC4S * 4;
/** Longest step the motion pass takes at once (a hitch or a hidden tab). */
const MAX_STEP = 1 / 15;
/** Most steps one catch-up takes; past that the steps grow longer. */
const MAX_STEPS = 24;
/** How hard the flow field pushes a particle, per unit of turbulence. */
const TURB_GAIN = 1.8;
/** A bounce slower than this (m/s) comes to rest instead. */
const REST_SPEED = 0.45;
/** How quickly debris on the floor stops sliding (1/s). */
const FRICTION = 6;
/**
 * Threads per group in the draw-list passes. Each group's survivors are
 * counted together, and a thread finds its place among them by summing the
 * flags before it, so the list keeps ring order without any sorting.
 */
const GROUP = 64;

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
  /** Share of its falling speed it keeps when it lands. */
  bounce: number;
}

/** The shared scratch record. Fill, then `spawn()`. */
export const P: ParticleRecord = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  delay: 0, life: 1, fade: 1.5, spin: 0,
  size0: 0.2, size1: 0.2, stretch: 0, sprite: 24,
  core: 0, body: 0, tail: 0, emit: 1,
  gravity: 0, drag: 0, turb: 0, seed: 0,
  heat0: 1, heat1: 0, occl: 0, floor: -999, bounce: 0,
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

/**
 * A swirling wind, the same for every particle at a place and time. Each
 * component ignores its own axis, so the field neither gathers nor spreads
 * particles: smoke curls and folds instead of clumping. Peaks near 1.5.
 */
function flowField(p: V3, time: F, seed: F): V3 {
  const q = p.mul(0.55).add(vec3(time.mul(0.35), time.mul(0.27), time.mul(0.31))).add(vec3(0.9, 0.6, 0.7).mul(seed)).toVar();
  return vec3(
    sin(q.y.mul(1.9).add(0.7)).mul(cos(q.z.mul(1.3))).add(sin(q.z.mul(3.7).add(q.y.mul(2.3))).mul(0.5)),
    sin(q.z.mul(1.7).add(2.1)).mul(cos(q.x.mul(1.1))).add(sin(q.x.mul(3.3).add(q.z.mul(2.9))).mul(0.5)).mul(0.6),
    sin(q.x.mul(1.5).add(4.2)).mul(cos(q.y.mul(1.7))).add(sin(q.y.mul(3.9).add(q.x.mul(2.7))).mul(0.5)),
  );
}

/** Ease-out growth from size0 to size1 over a life fraction `t`: puffs bloom fast then settle. */
function sizeAt(rec: V4, t: F, scale: F): F {
  const g = t.oneMinus().mul(t.oneMinus()).oneMinus();
  return mix(rec.x, rec.y, g).mul(scale);
}

export class ParticleField {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.MeshBasicNodeMaterial;
  private uTime = uniform(0);
  private uDt = uniform(0);
  private uScale = uniform(1);
  private uFogColor = uniform(new THREE.Color(0));
  private uFogDensity = uniform(0);
  private uFogNear = uniform(1);
  private uFogFar = uniform(100);
  private uFogMode = uniform(0);
  /** The oldest slot that may still be alive: the draw and the motion pass start there. */
  private uBase = uniform(0, 'uint');
  /** The camera the list is picked for, and its x/y focal scales (to pad by a particle's size). */
  private uViewProj = uniform(new THREE.Matrix4());
  private uFocal = uniform(new THREE.Vector2(1, 1));
  /** Groups the draw-list passes run this frame. */
  private uGroups = uniform(0, 'uint');
  private data: Float32Array;
  private records: THREE.StorageBufferAttribute;
  /** Per particle: place (xyz) and the birth time it was started from (w). */
  private place: THREE.StorageBufferAttribute;
  /** Per particle: speed under drag (xyz) and falling speed from gravity (w). */
  private speed: THREE.StorageBufferAttribute;
  private sim: THREE.ComputeNode;
  /** Draw-list passes: flag and count, place each group, write the list. */
  private pick: THREE.ComputeNode;
  private placeGroups: THREE.ComputeNode;
  private write: THREE.ComputeNode;
  /** Per thread of the pick pass: 1 if its particle is drawn. */
  private flags: THREE.StorageBufferAttribute;
  /** Per group: how many it draws (counted up, then cleared by the place pass). */
  private groupSum: THREE.StorageBufferAttribute;
  /** Per group: where its first survivor goes in the list. */
  private groupBase: THREE.StorageBufferAttribute;
  /** Ring slots to draw, in ring order. */
  private list: THREE.StorageBufferAttribute;
  /** The indirect draw: index count, instance count (written on the GPU), first index, base vertex, first instance. */
  private args: THREE.IndirectStorageBufferAttribute;
  /** Seconds of motion not yet run on the GPU. */
  private pending = 0;
  private head = 0;
  private high = 0;
  /** When each slot's particle is gone (its birth plus its life). */
  private ends: Float64Array;
  /** The live window: `count` slots from `tail`, wrapping, ending at `head`. */
  private tail = 0;
  private count = 0;
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
    geo.instanceCount = 0;
    this.geo = geo;
    this.data = new Float32Array(this.capacity * STRIDE);
    this.ends = new Float64Array(this.capacity);
    this.records = new THREE.StorageBufferAttribute(this.data, 4);
    // A birth time no record carries, so every slot starts unclaimed.
    const place = new Float32Array(this.capacity * 4);
    for (let i = 3; i < place.length; i += 4) place[i] = -1;
    this.place = new THREE.StorageBufferAttribute(place, 4);
    this.speed = new THREE.StorageBufferAttribute(this.capacity, 4);
    // Kept on the geometry, unread by the shader, so disposing the geometry
    // frees their GPU copies too (three frees a geometry's attributes).
    geo.setAttribute('slRecords', this.records);
    geo.setAttribute('slPlace', this.place);
    geo.setAttribute('slSpeed', this.speed);
    const groups = Math.ceil(this.capacity / GROUP);
    this.flags = new THREE.StorageBufferAttribute(new Uint32Array(this.capacity), 1);
    this.groupSum = new THREE.StorageBufferAttribute(new Uint32Array(groups), 1);
    this.groupBase = new THREE.StorageBufferAttribute(new Uint32Array(groups), 1);
    this.list = new THREE.StorageBufferAttribute(new Uint32Array(this.capacity), 1);
    this.args = new THREE.IndirectStorageBufferAttribute(new Uint32Array([6, 0, 0, 0, 0]), 1);
    geo.setAttribute('slFlags', this.flags);
    geo.setAttribute('slGroupSum', this.groupSum);
    geo.setAttribute('slGroupBase', this.groupBase);
    geo.setAttribute('slList', this.list);
    geo.setIndirect(this.args);

    this.sim = this.buildSim();
    [this.pick, this.placeGroups, this.write] = this.buildPick();
    this.mat = this.build();
    premultiplied(this.mat);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'fx:particles';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    // The motion pass runs just before the particles are drawn, once for all
    // the time that passed since the last one. A field nobody draws costs
    // nothing; several updates before one draw still move every particle.
    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      const r = renderer as unknown as THREE.WebGPURenderer;
      this.step(r);
      this.pickDraws(r, camera);
    };
  }

  /**
   * The motion pass. Newborn particles start from their record; the rest
   * take one step from where they were. Drag and gravity are solved exactly
   * over the step (any step length gives the same path), so a slow frame
   * does not change where a spark lands.
   */
  private buildSim(): THREE.ComputeNode {
    const rec = storage(this.records, 'vec4', this.capacity * VEC4S);
    const place = storage(this.place, 'vec4', this.capacity);
    const speed = storage(this.speed, 'vec4', this.capacity);
    const fn = Fn(() => {
      const i = this.slot();
      const b = i.mul(VEC4S);
      const r0 = rec.element(b).toVar();
      const r1 = rec.element(b.add(1)).toVar();
      const r3 = rec.element(b.add(3)).toVar();
      const r5 = rec.element(b.add(5)).toVar();
      const r6 = rec.element(b.add(6)).toVar();
      const st = place.element(i).toVar();
      const sv = speed.element(i).toVar();

      const life = max(r1.w, 1e-4).toVar();
      const age = this.uTime.sub(r0.w).toVar();
      const live = age.greaterThanEqual(0.0).and(age.lessThanEqual(life)).toVar();
      const fresh = st.w.notEqual(r0.w).toVar();
      const p0 = fresh.select(r0.xyz, st.xyz).uniformFlow().toVar();
      const vd0 = fresh.select(r1.xyz, sv.xyz).uniformFlow().toVar();
      const vg0 = fresh.select(float(0.0), sv.w).uniformFlow().toVar();
      // A newborn steps only as far as it has lived (it may have been born mid-step).
      const h = fresh.select(min(age, this.uDt), this.uDt).uniformFlow().toVar();

      const k = r5.y.toVar();
      const g = r5.x.toVar();
      const e = exp(k.negate().mul(h)).toVar();
      const reach = k.greaterThan(1e-3).select(e.oneMinus().div(max(k, 1e-3)), h).uniformFlow().toVar();
      const wind = flowField(p0, this.uTime, r3.z).mul(r5.z.mul(TURB_GAIN)).toVar();
      const fall = vg0.mul(h).add(g.mul(0.5).mul(h).mul(h));
      const p1 = p0.add(vd0.mul(reach)).add(wind.mul(h)).add(vec3(0.0, fall, 0.0)).toVar();
      const vd1 = vd0.mul(e).toVar();
      const vg1 = vg0.add(g.mul(h)).toVar();

      // The floor: debris bounces, then slides to a stop.
      const t = clamp(age.div(life), 0.0, 1.0);
      const minY = r3.w.add(sizeAt(r3, t, this.uScale).mul(0.3)).toVar();
      const hit = r3.w.greaterThan(-900.0).and(p1.y.lessThan(minY)).toVar();
      const vy = vd1.y.add(vg1).toVar();
      const up = vy.lessThan(0.0).select(max(vy.negate().mul(r6.z).sub(REST_SPEED), 0.0), vy).uniformFlow().toVar();
      const slide = exp(h.mul(-FRICTION)).toVar();
      const pOut = vec3(p1.x, hit.select(minY, p1.y).uniformFlow().toVar(), p1.z).toVar();
      const vOut = hit.select(vec3(vd1.x.mul(slide), up, vd1.z.mul(slide)), vd1).uniformFlow().toVar();
      const gOut = hit.select(float(0.0), vg1).uniformFlow().toVar();

      If(live, () => {
        place.element(i).assign(vec4(pOut, r0.w));
        speed.element(i).assign(vec4(vOut, gOut));
      });
    });
    return fn().compute(this.capacity);
  }

  /**
   * The draw-list passes.
   *
   * 1. Pick: each thread looks at one particle of the live window, flags it
   *    if it is alive and inside the view (padded by its size and streak),
   *    and adds it to its group's count.
   * 2. Place: one thread walks the groups in order, giving each its start in
   *    the list, clearing the counts for next frame and writing the total as
   *    the draw's instance count.
   * 3. Write: each flagged thread sums the flags before it in its group and
   *    puts its slot at that place.
   */
  private buildPick(): [THREE.ComputeNode, THREE.ComputeNode, THREE.ComputeNode] {
    const cap = this.capacity;
    const groups = Math.ceil(cap / GROUP);
    const rec = storage(this.records, 'vec4', cap * VEC4S).toReadOnly();
    const place = storage(this.place, 'vec4', cap).toReadOnly();
    const speed = storage(this.speed, 'vec4', cap).toReadOnly();
    const flags = storage(this.flags, 'uint', cap);
    const sumAtomic = storage(this.groupSum, 'uint', groups).toAtomic();
    const sum = storage(this.groupSum, 'uint', groups);
    const base = storage(this.groupBase, 'uint', groups);
    const list = storage(this.list, 'uint', cap);
    const args = storage(this.args, 'uint', 5);

    const pick = Fn(() => {
      const i = instanceIndex;
      const s = this.slot();
      const b = s.mul(VEC4S);
      const r0 = rec.element(b).toVar();
      const r1 = rec.element(b.add(1)).toVar();
      const r2 = rec.element(b.add(2)).toVar();
      const r3 = rec.element(b.add(3)).toVar();
      const st = place.element(s).toVar();
      const sv = speed.element(s).toVar();
      const age = this.uTime.sub(r0.w).toVar();
      const live = age.greaterThanEqual(0.0).and(age.lessThanEqual(max(r1.w, 1e-4))).toVar();
      const moved = st.w.equal(r0.w).toVar();
      const p = moved.select(st.xyz, r0.xyz).uniformFlow().toVar();
      const vel = moved.select(sv.xyz.add(vec3(0.0, sv.w, 0.0)), r1.xyz).uniformFlow().toVar();
      // Half the widest the quad gets, streak included, with room to spare.
      const size = max(r3.x, r3.y).mul(this.uScale);
      const reach = size.mul(abs(r2.z).mul(length(vel)).mul(0.08).add(1.0)).mul(0.9).add(0.05).toVar();
      const clip = this.uViewProj.mul(vec4(p, 1.0)).toVar();
      const inX = abs(clip.x).lessThanEqual(clip.w.add(reach.mul(this.uFocal.x)));
      const inY = abs(clip.y).lessThanEqual(clip.w.add(reach.mul(this.uFocal.y)));
      const front = clip.w.greaterThan(reach.negate());
      const seen = live.and(inX).and(inY).and(front).toVar();
      flags.element(i).assign(seen.select(uint(1), uint(0)));
      If(seen, () => {
        atomicAdd(sumAtomic.element(i.div(GROUP)), uint(1));
      });
    })().compute(cap, [GROUP]);

    const placeGroups = Fn(() => {
      const run = uint(0).toVar();
      Loop({ start: uint(0), end: this.uGroups, type: 'uint', condition: '<' }, ({ i }) => {
        const n = sum.element(i).toVar();
        base.element(i).assign(run);
        run.addAssign(n);
        sum.element(i).assign(uint(0));
      });
      args.element(1).assign(run);
    })().compute(1);

    const write = Fn(() => {
      const i = instanceIndex;
      If(flags.element(i).equal(uint(1)), () => {
        const g = i.div(GROUP).toVar();
        const before = uint(0).toVar();
        Loop({ start: g.mul(GROUP), end: i, type: 'uint', condition: '<' }, ({ i: j }) => {
          before.addAssign(flags.element(j));
        });
        list.element(base.element(g).add(before)).assign(this.slot());
      });
    })().compute(cap, [GROUP]);

    return [pick, placeGroups, write];
  }

  /** Runs the draw-list passes for this camera (see `buildPick`). */
  private pickDraws(renderer: THREE.WebGPURenderer, camera: THREE.Camera): void {
    if (this.count === 0) return;
    this.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = camera.projectionMatrix.elements;
    this.uFocal.value.set(Math.abs(e[0]!), Math.abs(e[5]!));
    this.uGroups.value = Math.ceil(this.count / GROUP);
    this.pick.count = this.count;
    this.write.count = this.count;
    renderer.compute(this.pick);
    renderer.compute(this.placeGroups);
    renderer.compute(this.write);
  }

  /** The ring slot of this motion or pick thread: `uBase` onwards, wrapping. */
  private slot(): THREE.Node<'uint'> {
    return instanceIndex.add(this.uBase).mod(this.capacity).toVar() as unknown as THREE.Node<'uint'>;
  }

  /**
   * Runs the motion pass for the time since the last one, in even steps no
   * longer than `MAX_STEP` (at most `MAX_STEPS` of them). Each step sees the
   * clock as it was at its own end, so a particle born part way through
   * starts in the right step.
   */
  private step(renderer: THREE.WebGPURenderer): void {
    if (this.pending <= 0 || this.count === 0) {
      this.pending = 0;
      return;
    }
    const n = Math.min(MAX_STEPS, Math.ceil(this.pending / MAX_STEP - 1e-6));
    const h = this.pending / n;
    this.pending = 0;
    this.sim.count = this.count;
    this.uDt.value = h;
    for (let k = n - 1; k >= 0; k--) {
      this.uTime.value = this.time - k * h;
      renderer.compute(this.sim);
    }
  }

  /**
   * The vertex stage reads each particle's place and speed from the motion
   * pass and works its size, colour and frame out from its age; the pixel
   * stage runs heat through the ramp.
   */
  private build(): THREE.MeshBasicNodeMaterial {
    // The draw only reads: a vertex shader may not write storage.
    const rec = storage(this.records, 'vec4', this.capacity * VEC4S).toReadOnly();
    const place = storage(this.place, 'vec4', this.capacity).toReadOnly();
    const speed = storage(this.speed, 'vec4', this.capacity).toReadOnly();
    // The pick passes chose which particles are drawn and in what order.
    const slot = storage(this.list, 'uint', this.capacity).toReadOnly().element(instanceIndex).toVar() as unknown as THREE.Node<'uint'>;
    const b = slot.mul(VEC4S);
    const r0 = rec.element(b).toVar();
    const r1 = rec.element(b.add(1)).toVar();
    // fade, spin, stretch, sprite (+100 flipbook)
    const r2 = rec.element(b.add(2)).toVar();
    // size0, size1, seed, floor
    const r3 = rec.element(b.add(3)).toVar();
    // core, body, tail (packed linear rgb), emission
    const r4 = rec.element(b.add(4)).toVar();
    // gravity, drag, turbulence, occlusion
    const r5 = rec.element(b.add(5)).toVar();
    // heat0, heat1, bounce
    const r6 = rec.element(b.add(6)).toVar();
    const st = place.element(slot).toVar();
    const sv = speed.element(slot).toVar();

    const life = max(r1.w, 1e-4).toVar();
    const age = this.uTime.sub(r0.w).toVar();
    const alive = step(0.0, age).mul(step(age, life)).toVar();
    const ta = clamp(age, 0.0, life).toVar();
    const t = ta.div(life).toVar();

    // Until the motion pass has seen it, a particle sits where it was spawned.
    const moved = st.w.equal(r0.w).toVar();
    const wpos = moved.select(st.xyz, r0.xyz).uniformFlow().toVar();
    const vel = moved.select(sv.xyz.add(vec3(0.0, sv.w, 0.0)), r1.xyz).uniformFlow().toVar();
    const size = sizeAt(r3, t, this.uScale).mul(alive).toVar();

    const camRight = cameraWorldMatrix.mul(vec4(1.0, 0.0, 0.0, 0.0)).xyz;
    const camUp = cameraWorldMatrix.mul(vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    const camFwd = cameraWorldMatrix.mul(vec4(0.0, 0.0, 1.0, 0.0)).xyz;
    const corner = positionGeometry.xy;
    const ang = r2.y.mul(ta).add(r3.z.mul(6.2831853));
    const ca = cos(ang);
    const sa = sin(ang);
    const rc = vec2(corner.x.mul(ca).sub(corner.y.mul(sa)), corner.x.mul(sa).add(corner.y.mul(ca)));

    // Lies flat on the ground: shock rings, sigils, splashes.
    const flat = vec3(rc.x, 0.0, rc.y).mul(size);
    // Stretched along velocity: sparks read as speed, not as dots.
    const sp = length(vel).toVar();
    const vdir = sp.greaterThan(1e-4).select(vel.div(max(sp, 1e-4)), camUp).uniformFlow().toVar();
    const side = normalize(cross(vdir, camFwd).add(vec3(1e-5)));
    const stretch = r2.z.toVar();
    const len = size.mul(stretch.mul(sp).mul(0.08).add(1.0));
    const streak = side.mul(corner.x).mul(size).add(vdir.mul(corner.y).mul(len));
    const facing = camRight.mul(rc.x).mul(size).add(camUp.mul(rc.y).mul(size));
    const offset = stretch.lessThan(-0.001).select(flat, stretch.greaterThan(0.001).select(streak, facing)).uniformFlow().toVar();

    // Frame selection: flipbooks play across the life, cross-faded.
    const sprite = r2.w.toVar();
    const book = sprite.greaterThanEqual(99.5);
    const fr = clamp(t, 0.0, 0.999).mul(8.0);
    const f0 = floor(fr);
    const f1 = min(f0.add(1.0), 7.0);
    const base = sprite.sub(100.0);
    const luv = uv();
    const vUvA = vary(book.select(cellUv(base.add(f0), luv), cellUv(sprite, luv)).uniformFlow().toVar());
    const vUvB = vary(book.select(cellUv(base.add(f1), luv), cellUv(sprite, luv)).uniformFlow().toVar());
    const vFrameMix = vary(book.select(fr.sub(f0), float(0.0)).uniformFlow().toVar());
    const vCore = vary(unpackRGB(r4.x));
    const vBody = vary(unpackRGB(r4.y));
    const vTail = vary(unpackRGB(r4.z));
    const vEmit = vary(r4.w);
    const vHeat = vary(mix(r6.x, r6.y, t));
    const vOccl = vary(r5.w);
    const fadeIn = smoothstep(0.0, 0.06, t);
    const fadeOut = pow(max(t.oneMinus(), 0.0), r2.x);
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
    const f = clamp(this.uFogMode.lessThan(1.5).select(fLin, fExp).uniformFlow().toVar(), 0.0, 1.0).mul(step(0.5, this.uFogMode)).toVar();
    const fogged = rgb.mul(f.oneMinus()).add((this.uFogColor as unknown as V3).mul(occl).mul(f));

    const m = new THREE.MeshBasicNodeMaterial({ name: 'fx-particles', side: THREE.DoubleSide, depthTest: true });
    m.fog = false;
    // Flat sprites: one pass draws both faces (see `kitMaterial`).
    m.forceSinglePass = true;
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
    // A full ring writes over its oldest slot, so the window moves on with it.
    if (this.count < this.capacity) this.count++;
    else this.tail = this.head;
    this.ends[i] = this.time + r.delay + r.life;
    const D = this.data;
    const o = i * STRIDE;
    // The seven vec4s, in the order the header lists them.
    D[o] = r.x; D[o + 1] = r.y; D[o + 2] = r.z; D[o + 3] = this.time + r.delay;
    D[o + 4] = r.vx; D[o + 5] = r.vy; D[o + 6] = r.vz; D[o + 7] = r.life;
    D[o + 8] = r.fade; D[o + 9] = r.spin; D[o + 10] = r.stretch;
    D[o + 11] = FLIPBOOKS.has(r.sprite) ? r.sprite + 100 : r.sprite;
    D[o + 12] = r.size0; D[o + 13] = r.size1; D[o + 14] = r.seed; D[o + 15] = r.floor;
    D[o + 16] = r.core; D[o + 17] = r.body; D[o + 18] = r.tail; D[o + 19] = r.emit;
    D[o + 20] = r.gravity; D[o + 21] = r.drag; D[o + 22] = r.turb; D[o + 23] = r.occl;
    D[o + 24] = r.heat0; D[o + 25] = r.heat1; D[o + 26] = r.bounce;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    this.spawnedThisFrame++;
  }

  /** Advances the clock and uploads only the slots written this frame. */
  update(dt: number, scale = 1): void {
    this.time += dt;
    this.pending += dt;
    this.uTime.value = this.time;
    this.uScale.value = scale;
    // The window starts at the oldest particle still alive. One long-lived
    // particle holds it back; it is still far less than the whole ring.
    const cap = this.capacity;
    while (this.count > 0 && this.ends[this.tail]! < this.time) {
      this.tail = this.tail + 1 === cap ? 0 : this.tail + 1;
      this.count--;
    }
    this.uBase.value = this.tail;
    this.geo.instanceCount = this.count;
    this.spawnedThisFrame = 0;
    if (this.hi < this.lo) return;
    // A wrap in the ring makes lo..hi the whole buffer; that is still one
    // upload, and it happens at most once per wrap.
    const lo = this.lo;
    const n = this.hi - lo + 1;
    markRange(this.records, lo * STRIDE, n * STRIDE);
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
    for (let o = 0; o < this.data.length; o += STRIDE) {
      this.data[o + 3] = 0;
      this.data[o + 7] = 0;
    }
    markAll(this.records);
    this.head = 0;
    this.high = 0;
    this.tail = 0;
    this.count = 0;
    this.ends.fill(0);
    this.pending = 0;
    this.geo.instanceCount = 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.sim.dispose();
    this.pick.dispose();
    this.placeGroups.dispose();
    this.write.dispose();
  }
}

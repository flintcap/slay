/**
 * SLAY — procedural monster animation.
 *
 * One animator drives every monster rig `MonsterModels` builds, by archetype.
 * It used to be a handful of sine waves; what it does now:
 *
 *  - **Motion that suits the body**, paced by how fast the body really moves
 *    over the ground (read from the model's world position), so strides match
 *    speed instead of a fixed treadmill: bipeds walk and run, big ones lumber
 *    with a heavier, rolling gait, quadrupeds walk on diagonal pairs and break
 *    into a bounding gallop, many-legged things scuttle low on a fast tripod,
 *    floaters bob and tilt into their drift, serpents wave faster as they go,
 *    oozes hop with a squash and stretch.
 *  - **Attacks with a wind-up and a strike.** `Enemy` sets `attack` when the
 *    telegraph goes down and again when the blow executes; the first coils the
 *    body and holds it, trembling, for the length of the telegraph, the second
 *    snaps through and follows through. Casts rise, gather and push out.
 *  - **Crossfades** whenever the action changes, so nothing snaps between
 *    states; hits are a flinch laid over whatever is playing.
 *  - **Idle variety**: every monster fidgets on its own clock (looks round,
 *    sniffs, twitches, shudders, stretches its wings), from a seeded stream.
 *  - **Spawns and deaths by body**: things climb out of the floor, drop in on
 *    their legs or well up; they fall back, roll onto a side, curl their legs,
 *    drop out of the air or splat, and settle before `Enemy` sinks them.
 *
 * The interface is the one `Enemy`, `Boss` and summons already use:
 * `update(dt, { locomotion, action, actionT, time, deathT })`.
 */

import * as THREE from 'three';
import type { Rng } from '../types';
import type { Archetype } from '../entities/MonsterModels';
import { Random } from '../core/RNG';

export type RigAction = 'idle' | 'walk' | 'attack' | 'cast' | 'hit' | 'death' | 'spawn';

export interface RigDriveOpts {
  /** 0 = standing, 1 = running flat out. */
  locomotion: number;
  /** Overriding one-shot pose. */
  action: RigAction;
  /** 0..1 progress through the action. */
  actionT: number;
  /** World time, for idle breathing and hover bob. */
  time: number;
  /** 0..1 death collapse progress. */
  deathT: number;
}

interface Rest {
  bone: THREE.Bone;
  rx: number;
  ry: number;
  rz: number;
  px: number;
  py: number;
  pz: number;
}

const TAU = Math.PI * 2;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Piecewise smoothstep through `[time, value]` keys. */
function kf(t: number, keys: ReadonlyArray<readonly [number, number]>): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b[0]) return a[1] + (b[1] - a[1]) * smooth((t - a[0]) / Math.max(1e-6, b[0] - a[0]));
  }
  return keys[keys.length - 1][1];
}

/** Rises fast and settles: a hit landing, a body meeting the floor. */
function impact(t: number, at: number): number {
  if (t <= at) {
    const x = clamp01(t / at);
    return x * x;
  }
  const x = (t - at) / Math.max(1e-6, 1 - at);
  return 1 - Math.sin(Math.min(1, x) * Math.PI) * 0.12 * (1 - x);
}

/** Fidgets each archetype picks from while standing about. */
const FIDGETS: Record<Archetype, ReadonlyArray<string>> = {
  humanoid: ['look', 'shrug', 'shift'],
  colossal: ['heave', 'look', 'shift'],
  winged: ['stretch', 'look'],
  quadruped: ['sniff', 'look', 'wag'],
  arachnid: ['tap', 'bob'],
  insectoid: ['tap', 'clack', 'bob'],
  floating: ['spin', 'dip'],
  serpent: ['rear', 'look'],
  ooze: ['shudder', 'bob'],
  swarm: ['swirl'],
};

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

/**
 * Drives a monster rig. Poses are procedural rather than keyframed: one class
 * covers every monster in the game, costs a few dozen float ops per bone, and
 * never needs an animation asset.
 */
export class RigAnimator {
  readonly archetype: Archetype;
  private readonly rest: Record<string, Rest> = {};
  private readonly list: Rest[] = [];
  private readonly index: Record<string, number> = {};
  /** This frame's pose, as deltas from rest: euler per bone, position, hips scale. */
  private readonly rot: Float32Array;
  private readonly pos: Float32Array;
  private readonly scl = new THREE.Vector3(1, 1, 1);

  /** Gait clock (radians) and the body's measured ground speed, local units/s. */
  private phase = 0;
  private speed = 0;
  private yawRate = 0;
  private lastX = 0;
  private lastZ = 0;
  private lastYaw = 0;
  private hasLast = false;
  /** Walk-to-gallop blend, eased; the last frame's step; integrated spin phases. */
  private gal = 0;
  private rate = 0;
  private lastDt = 0;
  private spin = 0;
  /** Height of the hips at rest: the yardstick for strides and drops. */
  private readonly hipY: number;
  private readonly offset: number;

  /** Action bookkeeping, to tell a wind-up from its strike and to crossfade. */
  private lastAction: RigAction = 'idle';
  private lastT = 0;
  private striking = false;
  private fromQ: Float32Array;
  private fromP: Float32Array;
  private fromS = new THREE.Vector3(1, 1, 1);
  private fade = 1;
  private fadeDur = 0.12;
  private hasPose = false;

  /** Flinch layer and idle fidgets. */
  private flinchK = 0;
  private flinchSide = 1;
  private readonly fidgetRng: Random;
  private fidget = '';
  private fidgetT = 0;
  private fidgetDur = 1;
  private fidgetWait: number;

  constructor(
    private readonly root: THREE.Object3D,
    private readonly bones: Record<string, THREE.Bone>,
    archetype: Archetype,
    rng: Rng,
  ) {
    this.archetype = archetype;
    const seed = rng.next();
    this.offset = seed * TAU;
    // Its own stream, seeded from the one draw, so fidgeting never draws from
    // the caller's. A second draw here shifted every roll the caller made
    // after building a monster (packs, affixes, AI), which moved the seeded
    // tactics and curve fights off what they were tuned on.
    this.fidgetRng = new Random(Math.floor(seed * 0x7fffffff) ^ 0x5eed);
    this.fidgetWait = 1 + this.fidgetRng.range(0, 4);
    for (const [name, bone] of Object.entries(bones)) {
      const r: Rest = {
        bone,
        rx: bone.rotation.x,
        ry: bone.rotation.y,
        rz: bone.rotation.z,
        px: bone.position.x,
        py: bone.position.y,
        pz: bone.position.z,
      };
      this.index[name] = this.list.length;
      this.rest[name] = r;
      this.list.push(r);
    }
    const n = this.list.length;
    this.rot = new Float32Array(n * 3);
    this.pos = new Float32Array(n * 3);
    this.fromQ = new Float32Array(n * 4);
    this.fromP = new Float32Array(n * 3);
    this.hipY = Math.max(0.2, this.rest.hips?.py ?? 0.9);
  }

  // -- pose writing ----------------------------------------------------------

  private set(name: string, rx: number, ry = 0, rz = 0): void {
    const i = this.index[name];
    if (i === undefined) return;
    this.rot[i * 3] = rx;
    this.rot[i * 3 + 1] = ry;
    this.rot[i * 3 + 2] = rz;
  }

  private add(name: string, rx: number, ry = 0, rz = 0): void {
    const i = this.index[name];
    if (i === undefined) return;
    this.rot[i * 3] += rx;
    this.rot[i * 3 + 1] += ry;
    this.rot[i * 3 + 2] += rz;
  }

  private lift(name: string, dy: number, dz = 0, dx = 0): void {
    const i = this.index[name];
    if (i === undefined) return;
    this.pos[i * 3] += dx;
    this.pos[i * 3 + 1] += dy;
    this.pos[i * 3 + 2] += dz;
  }

  private has(name: string): boolean {
    return this.index[name] !== undefined;
  }

  reset(): void {
    for (const r of this.list) {
      r.bone.rotation.set(r.rx, r.ry, r.rz);
      r.bone.position.set(r.px, r.py, r.pz);
    }
    this.rest.hips?.bone.scale.set(1, 1, 1);
  }

  // -- update ------------------------------------------------------------------

  update(dt: number, o: RigDriveOpts): void {
    const step = Math.max(0, Math.min(0.1, dt));
    this.lastDt = step;
    this.measure(step);
    this.track(o);

    this.rot.fill(0);
    this.pos.fill(0);
    this.scl.set(1, 1, 1);

    const g = this.gaitAmount();
    // Strides come from distance covered; standing still the legs stop. The
    // rate itself eases, so a sudden stop does not whip the long chains.
    this.rate += (this.cadence() - this.rate) * Math.min(1, step * 5);
    this.phase += step * this.rate;
    // Things that spin faster as the body moves faster integrate their rate.
    this.spin += step * (1 + g * 2);

    if (o.deathT > 0) {
      this.poseDeath(Math.min(1, o.deathT), o.time);
    } else {
      this.poseBody(g, o.time);
      this.poseFidget(step, g, o);
      this.poseAction(o);
      this.poseFlinch(step);
    }
    this.apply(step);
  }

  /** Ground speed and turn rate, from where the model really is in the world. */
  private measure(dt: number): void {
    this.root.getWorldPosition(_v);
    const s = Math.max(1e-3, this.root.matrixWorld.elements[0] ** 2 + this.root.matrixWorld.elements[1] ** 2 + this.root.matrixWorld.elements[2] ** 2) ** 0.5;
    this.root.getWorldQuaternion(_q);
    const yaw = Math.atan2(2 * (_q.w * _q.y + _q.x * _q.z), 1 - 2 * (_q.y * _q.y + _q.x * _q.x));
    if (this.hasLast && dt > 1e-5) {
      const world = Math.hypot(_v.x - this.lastX, _v.z - this.lastZ);
      // A shove or a teleport (over 14 m/s) is not a sprint.
      const v = world / dt > 14 ? this.speed : world / s / dt;
      this.speed += (v - this.speed) * Math.min(1, dt * 8);
      let dy = yaw - this.lastYaw;
      while (dy > Math.PI) dy -= TAU;
      while (dy < -Math.PI) dy += TAU;
      this.yawRate += (dy / dt - this.yawRate) * Math.min(1, dt * 6);
    }
    this.lastX = _v.x;
    this.lastZ = _v.z;
    this.lastYaw = yaw;
    this.hasLast = true;
  }

  /** 0 standing, 1 running, from real speed, eased so it never kinks. */
  private gaitAmount(): number {
    const want = clamp01(this.speed / (this.hipY * 3.2));
    this.gSm += (want - this.gSm) * Math.min(1, this.lastDt * 4);
    return this.gSm;
  }
  private gSm = 0;

  /** Gait cycles per second, in radians, so each foot covers what the body does. */
  private cadence(): number {
    const h = this.hipY;
    const v = this.speed;
    if (v < 0.02) return 0;
    let cycle: number;
    switch (this.archetype) {
      case 'colossal':
        cycle = h * (2.2 + 0.6 * clamp01(v / (h * 2.5)));
        break;
      case 'quadruped':
        cycle = h * (2.0 + 1.4 * clamp01(v / (h * 3)));
        break;
      case 'arachnid':
      case 'insectoid':
        cycle = h * 3;
        break;
      case 'serpent':
        cycle = h * 4;
        break;
      case 'ooze':
        cycle = h * 2.6;
        break;
      default:
        cycle = h * (1.6 + 0.9 * clamp01(v / (h * 3)));
    }
    return (TAU * v) / cycle;
  }

  /**
   * Works out what the caller's action means this frame and starts a
   * crossfade when it changes. An `attack` that restarts while one is running
   * is the strike after its wind-up.
   */
  private track(o: RigDriveOpts): void {
    const a = o.deathT > 0 ? 'death' : o.action;
    let changed = a !== this.lastAction;
    if (a === 'attack') {
      if (this.lastAction === 'attack' && o.actionT < this.lastT - 0.05) {
        this.striking = true;
        changed = true;
      } else if (this.lastAction !== 'attack') {
        this.striking = false;
      }
    }
    // A long telegraph rises as a cast; the blow that follows is its strike.
    if (a === 'attack' && this.lastAction === 'cast' && this.lastT > 0.5) this.striking = true;
    // A hit is laid over the pose as a flinch.
    if (a === 'hit' && this.lastAction !== 'hit') {
      this.flinchK = 1;
      this.flinchSide = -this.flinchSide;
    }
    // Only changes that carry a pose of their own are blended; walking,
    // standing and flinching are all the same body.
    const poseful = (x: RigAction): boolean => x === 'attack' || x === 'cast' || x === 'spawn' || x === 'death';
    if (changed && this.hasPose && (poseful(a) || poseful(this.lastAction))) {
      this.snapshot(a === 'death' ? 0.16 : a === 'attack' && this.striking ? 0.05 : 0.12);
    }
    this.lastAction = a;
    this.lastT = o.actionT;
  }

  private snapshot(dur: number): void {
    this.list.forEach((r, i) => {
      const q = r.bone.quaternion;
      this.fromQ[i * 4] = q.x;
      this.fromQ[i * 4 + 1] = q.y;
      this.fromQ[i * 4 + 2] = q.z;
      this.fromQ[i * 4 + 3] = q.w;
      this.fromP[i * 3] = r.bone.position.x;
      this.fromP[i * 3 + 1] = r.bone.position.y;
      this.fromP[i * 3 + 2] = r.bone.position.z;
    });
    if (this.rest.hips) this.fromS.copy(this.rest.hips.bone.scale);
    this.fade = 0;
    this.fadeDur = dur;
  }

  /** Writes the pose to the bones, blended out of the last snapshot. */
  private apply(dt: number): void {
    this.fade = Math.min(1, this.fade + dt / Math.max(1e-3, this.fadeDur));
    const w = smooth(this.fade);
    this.list.forEach((r, i) => {
      const b = r.bone;
      _e.set(r.rx + this.rot[i * 3], r.ry + this.rot[i * 3 + 1], r.rz + this.rot[i * 3 + 2], 'XYZ');
      b.quaternion.setFromEuler(_e);
      const px = r.px + this.pos[i * 3];
      const py = r.py + this.pos[i * 3 + 1];
      const pz = r.pz + this.pos[i * 3 + 2];
      if (w < 1) {
        _q.set(this.fromQ[i * 4], this.fromQ[i * 4 + 1], this.fromQ[i * 4 + 2], this.fromQ[i * 4 + 3]);
        b.quaternion.copy(_q.slerp(b.quaternion, w));
        b.position.set(
          this.fromP[i * 3] + (px - this.fromP[i * 3]) * w,
          this.fromP[i * 3 + 1] + (py - this.fromP[i * 3 + 1]) * w,
          this.fromP[i * 3 + 2] + (pz - this.fromP[i * 3 + 2]) * w,
        );
      } else {
        b.position.set(px, py, pz);
      }
    });
    const hips = this.rest.hips?.bone;
    if (hips) {
      if (w < 1) hips.scale.copy(this.fromS).lerp(this.scl, w);
      else hips.scale.copy(this.scl);
    }
    this.hasPose = true;
  }

  // -- bodies --------------------------------------------------------------------

  private poseBody(g: number, time: number): void {
    const t = this.phase + this.offset;
    switch (this.archetype) {
      case 'quadruped':
        this.poseQuadruped(t, g, time);
        break;
      case 'serpent':
        this.poseSerpent(t, g, time);
        break;
      case 'arachnid':
      case 'insectoid':
        this.poseManyLegged(t, g, time);
        break;
      case 'floating':
        this.poseFloating(t, g, time);
        break;
      case 'ooze':
        this.poseOoze(t, g, time);
        break;
      case 'swarm':
        this.poseSwarm(t, g, time);
        break;
      case 'winged':
        this.poseBiped(t, g, time, true, false);
        break;
      case 'colossal':
        this.poseBiped(t, g, time, false, true);
        break;
      default:
        this.poseBiped(t, g, time, false, false);
        break;
    }
  }

  /**
   * Two legs. The big ones lumber: a slower cadence, a deep bob, the whole
   * trunk rolling from side to side over each heavy foot. Fliers hover.
   */
  private poseBiped(t: number, g: number, time: number, hover: boolean, big: boolean): void {
    const h = this.hipY;
    const breathe = Math.sin(time * (big ? 1.1 : 1.6) + this.offset);
    const roll = big ? 1.8 : 1;
    const amp = big ? 0.15 + g * 0.55 : 0.12 + g * 0.72;
    const sw = Math.sin(t) * amp * (g > 0.01 ? 1 : 0.15);
    const sw2 = -sw;
    if (hover) {
      this.lift('hips', h * (0.16 + Math.sin(time * 1.9 + this.offset) * 0.12));
      this.set('hipL', 0.35 + Math.sin(t * 0.6) * 0.1 + g * 0.3);
      this.set('hipR', 0.25 - Math.sin(t * 0.6) * 0.1 + g * 0.3);
      this.set('kneeL', -0.5 - g * 0.3);
      this.set('kneeR', -0.4 - g * 0.3);
      // Drifting fliers lean into where they are going.
      this.add('hips', g * 0.35);
    } else {
      // Bob twice a cycle, lowest as each foot takes the weight.
      const bob = (Math.abs(Math.cos(t)) - 0.6) * h * (big ? 0.07 : 0.05) * g;
      this.lift('hips', bob - h * (big ? 0.05 : 0.025) * g);
      this.set('hips', g * 0.06, Math.sin(t) * 0.12 * g, Math.sin(t) * 0.05 * roll * g);
      this.set('hipL', sw);
      this.set('hipR', sw2);
      // The knee folds as the leg swings through, not while it bears weight.
      this.set('kneeL', -Math.max(0, Math.sin(t + 1.2)) * (0.3 + 1.1 * g) - 0.06);
      this.set('kneeR', -Math.max(0, Math.sin(t + 1.2 + Math.PI)) * (0.3 + 1.1 * g) - 0.06);
      this.set('footL', Math.max(0, sw) * 0.35 - Math.max(0, -sw) * 0.2);
      this.set('footR', Math.max(0, sw2) * 0.35 - Math.max(0, -sw2) * 0.2);
    }
    this.set('spine', breathe * 0.025 + g * (big ? 0.2 : 0.14), -Math.sin(t) * g * 0.08, -Math.sin(t) * 0.04 * roll * g);
    this.set('chest', breathe * 0.02, Math.sin(t + Math.PI) * g * 0.12, -Math.sin(t) * 0.03 * roll * g);
    this.set('head', -g * 0.12 + Math.sin(time * 0.9 + this.offset) * 0.04, Math.sin(time * 0.6 + this.offset) * 0.08);
    const arm = 0.85 * (big ? 0.7 : 1);
    this.set('shoulderL', sw2 * arm + g * 0.1, 0, 0.14 + (big ? 0.1 : 0));
    this.set('shoulderR', sw * arm + g * 0.1, 0, -0.14 - (big ? 0.1 : 0));
    this.set('elbowL', -0.3 - Math.max(0, sw2) * 0.6 - g * 0.3);
    this.set('elbowR', -0.3 - Math.max(0, sw) * 0.6 - g * 0.3);
    if (this.has('tail')) {
      this.set('tail', Math.sin(t * 0.8) * 0.12 - 0.1, Math.sin(t * 0.5 + time) * 0.25);
      this.set('tailTip', Math.sin(t * 0.8 + 1) * 0.2, Math.sin(t * 0.5 + time + 1) * 0.3);
    }
    if (this.has('wingL')) {
      const flap = Math.sin(time * (hover ? 5.5 + g * 3 : 2.2) + this.offset);
      this.set('wingL', flap * 0.2, 0, -0.45 - flap * 0.6);
      this.set('wingR', flap * 0.2, 0, 0.45 + flap * 0.6);
    }
    // Leaning into a turn.
    this.add('hips', 0, 0, Math.max(-0.25, Math.min(0.25, -this.yawRate * g * 0.08)));
  }

  /**
   * Four legs. A walk moves diagonal pairs together; at speed it becomes a
   * bounding gallop, front pair and back pair each landing together while the
   * spine flexes and extends between them.
   */
  private poseQuadruped(t: number, g: number, time: number): void {
    const h = this.hipY;
    // The gait changes over a few strides, not in a frame: the legs' phase
    // offsets move with it, and a sudden change would swing them all at once.
    const galT = smooth((g - 0.55) / 0.35);
    this.gal += (galT - this.gal) * Math.min(1, this.lastDt * 2.5);
    const gal = this.gal;
    const amp = 0.1 + g * 0.8;
    // Walk: diagonal pairs. Gallop: fronts together, backs together, offset.
    const fl = Math.sin(t) * amp;
    const fr = Math.sin(t + Math.PI * (1 - gal)) * amp;
    const bl = Math.sin(t + Math.PI * (1 - gal * 0.6)) * amp;
    const br = Math.sin(t + Math.PI * (gal * 0.4)) * amp;
    const flex = Math.sin(t + Math.PI * 0.5) * gal;
    const bob = Math.abs(Math.sin(t)) * h * 0.06 * g * (1 - gal) + (Math.sin(t * 1) * 0.5 + 0.5) * h * 0.12 * gal;
    this.lift('hips', bob);
    this.set('hips', flex * 0.14);
    this.set('spine', Math.sin(t * 2) * g * 0.05 * (1 - gal) - flex * 0.22 - g * 0.06);
    this.set('chest', flex * 0.12);
    this.set('shoulderL', fl);
    this.set('shoulderR', fr);
    this.set('hipL', bl);
    this.set('hipR', br);
    this.set('elbowL', -Math.max(0, -fl) * 1.1 - 0.12);
    this.set('elbowR', -Math.max(0, -fr) * 1.1 - 0.12);
    this.set('kneeL', Math.max(0, bl) * 0.9 + 0.12);
    this.set('kneeR', Math.max(0, br) * 0.9 + 0.12);
    const breathe = Math.sin(time * 1.4 + this.offset);
    this.set('neck', -g * 0.2 + breathe * 0.03 + flex * 0.1);
    this.set('head', g * 0.14 - flex * 0.08, Math.sin(time * 0.8 + this.offset) * 0.1 * (1 - g));
    this.set('tail', Math.sin(t * 0.9) * 0.18 + 0.2 + gal * 0.3, Math.sin(t * 0.6 + time) * 0.35);
    this.set('tailTip', Math.sin(t * 0.9 + 1.2) * 0.25, Math.sin(t * 0.6 + time + 1) * 0.4);
    this.add('spine', 0, 0, Math.max(-0.25, Math.min(0.25, -this.yawRate * g * 0.1)));
  }

  private poseSerpent(t: number, g: number, time: number): void {
    // Per segment: small, because a long chain adds them all up at the tail.
    const amp = 0.1 + g * 0.16;
    let i = 0;
    for (;;) {
      const name = `seg${i}`;
      if (!this.has(name)) break;
      this.set(name, Math.sin(t * 0.8 + i * 0.35 + time * 0.6) * amp * 0.22, Math.sin(t + time * 0.9 + i * 0.55) * amp);
      i++;
    }
    this.lift('hips', Math.sin(time * 1.8 + this.offset) * this.hipY * 0.08);
    // The head holds steady while the body waves under it: it is aiming.
    const wave = Math.sin(t + time * 0.9 + 0.4) * amp;
    this.set('chest', -0.14 + Math.sin(time * 1.4) * 0.06, wave * 0.5);
    this.set('head', Math.sin(time * 2.1 + this.offset) * 0.08, -wave * 0.4);
    this.set('tail', Math.sin(t + time * 0.9 + i * 0.55) * amp * 1.5);
  }

  /**
   * Many legs on an alternating tripod, low and fast when moving, with a
   * little jitter: a scuttle, not a walk.
   */
  private poseManyLegged(t: number, g: number, time: number): void {
    const h = this.hipY;
    const amp = 0.1 + g * 0.42;
    for (let i = 0; i < 5; i++) {
      for (const s of ['L', 'R']) {
        const hip = `legHip${i}${s}`;
        if (!this.has(hip)) continue;
        const side = s === 'L' ? 1 : -1;
        // Alternating tripod: neighbours half a cycle apart, sides opposite.
        const ph = t * 2 + (i % 2) * Math.PI + (s === 'L' ? 0 : Math.PI);
        const swing = Math.sin(ph) * amp;
        const up = Math.max(0, Math.cos(ph)) * amp;
        this.set(hip, 0, swing * side, up * 0.8 * side);
        this.set(`legKnee${i}${s}`, 0, 0, -up * 0.6 * side);
        this.set(`legFoot${i}${s}`, 0, 0, up * 0.4 * side);
      }
    }
    // Low to the ground at speed, and a skittering jitter.
    this.lift('hips', -h * 0.12 * g + Math.abs(Math.sin(t * 2)) * h * 0.03 * g);
    this.set('chest', Math.sin(t * 4) * g * 0.04, Math.sin(time * 1.3 + this.offset) * 0.04);
    this.set('head', Math.sin(time * 2.4 + this.offset) * 0.06, Math.sin(time * 1.1) * 0.12);
    this.set('jaw', Math.max(0, Math.sin(time * 6 + this.offset)) * 0.18);
    if (this.has('wingL')) {
      const flap = Math.sin(time * 26 + this.offset);
      this.set('wingL', 0, 0, flap * 0.35 * (0.3 + g));
      this.set('wingR', 0, 0, -flap * 0.35 * (0.3 + g));
    }
    if (this.has('tail')) this.set('tail', -0.5 + Math.sin(time * 1.6) * 0.15, Math.sin(time) * 0.2);
    this.add('chest', 0, Math.max(-0.3, Math.min(0.3, this.yawRate * 0.06)), 0);
  }

  /** Bobs on the air and tilts into its drift, banking through turns. */
  private poseFloating(t: number, g: number, time: number): void {
    const h = this.hipY;
    this.lift('hips', Math.sin(time * 1.35 + this.offset) * h * 0.14);
    const halo = this.index.halo;
    if (halo !== undefined) this.rot[halo * 3 + 1] = this.spin * 0.8;
    this.set('hips', g * 0.32, 0, Math.max(-0.4, Math.min(0.4, -this.yawRate * 0.12)));
    this.set('chest', Math.sin(time * 0.9) * 0.08, Math.sin(time * 0.6) * 0.12);
    this.set('head', Math.sin(time * 1.7) * 0.05 - g * 0.2, Math.sin(time * 1.1) * 0.14);
    this.set('tail', Math.sin(t * 0.9 + time) * 0.16 - g * 0.5, 0, Math.sin(t * 0.7 + time) * 0.16);
  }

  /** Hops when it goes anywhere: squashes, stretches up and forward, lands. */
  private poseOoze(t: number, g: number, time: number): void {
    const h = this.hipY;
    const wob = Math.sin(time * 2.2 + this.offset) * 0.05;
    const hop = Math.sin(t);
    const sq = 1 + wob + g * (hop > 0 ? hop * 0.22 : hop * 0.16);
    this.scl.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    this.lift('hips', (sq - 1) * h * 0.3 + Math.max(0, hop) * h * 0.18 * g);
    this.set('hips', g * 0.18 * Math.max(0, hop));
    this.set('chest', Math.sin(time * 1.2 + this.offset) * 0.1, Math.sin(time * 0.8) * 0.14);
    this.set('head', Math.sin(time * 1.4) * 0.12);
    this.set('shoulderL', 0, 0, Math.sin(time * 1.3) * 0.4);
    this.set('shoulderR', 0, 0, -Math.sin(time * 1.3 + 0.6) * 0.4);
  }

  private poseSwarm(t: number, g: number, time: number): void {
    let i = 0;
    for (;;) {
      const name = `mote${i}`;
      const k = this.index[name];
      if (k === undefined) break;
      const ph = this.spin * 1.3 + i * 2.4 + this.offset;
      const r = 0.12 * (1 + g * 0.6);
      this.pos[k * 3] = Math.sin(ph) * r;
      this.pos[k * 3 + 1] = Math.sin(ph * 1.7 + i) * 0.18;
      this.pos[k * 3 + 2] = Math.cos(ph * 0.8) * r - g * 0.12;
      this.rot[k * 3 + 1] = Math.sin(ph) * 0.5;
      i++;
    }
    const chest = this.index.chest;
    if (chest !== undefined) this.rot[chest * 3 + 1] = time * 0.7;
    this.lift('hips', Math.sin(time * 2.1 + this.offset) * 0.1);
    void t;
  }

  // -- idle variety --------------------------------------------------------------

  private poseFidget(dt: number, g: number, o: RigDriveOpts): void {
    const busy = g > 0.15 || (o.action !== 'idle' && o.action !== 'walk');
    if (!this.fidget) {
      if (busy) return;
      this.fidgetWait -= dt;
      if (this.fidgetWait > 0) return;
      const list = FIDGETS[this.archetype] ?? FIDGETS.humanoid;
      this.fidget = list[this.fidgetRng.int(0, list.length - 1)];
      this.fidgetT = 0;
      this.fidgetDur = this.fidgetRng.range(1.0, 1.8);
      return;
    }
    this.fidgetT += dt;
    const k = this.fidgetT / this.fidgetDur;
    if (k >= 1 || busy) {
      // Let a cut-short fidget fade rather than snap.
      if (busy && k < 1) this.snapshot(0.15);
      this.fidget = '';
      this.fidgetWait = this.fidgetRng.range(2.5, 6.5);
      return;
    }
    const w = Math.sin(Math.PI * k);
    const s = this.flinchSide;
    switch (this.fidget) {
      case 'look':
        this.add('head', 0.05 * w, Math.sin(k * TAU) * 0.7 * w * s);
        this.add('chest', 0, Math.sin(k * TAU) * 0.15 * w * s);
        if (this.has('neck')) this.add('neck', 0, Math.sin(k * TAU) * 0.4 * w * s);
        break;
      case 'shrug':
        this.add('shoulderL', -0.2 * w, 0, 0.2 * w);
        this.add('shoulderR', -0.2 * w, 0, -0.2 * w);
        this.add('head', -0.15 * w, 0, 0.12 * w * Math.sin(k * TAU * 2));
        break;
      case 'shift':
        this.lift('hips', -this.hipY * 0.02 * w, 0, this.hipY * 0.04 * w * s);
        this.add('hips', 0, 0, 0.06 * w * s);
        this.add('spine', 0, 0, -0.08 * w * s);
        break;
      case 'heave':
        this.add('spine', -0.12 * w);
        this.add('chest', -0.16 * w);
        this.add('head', -0.2 * w);
        this.add('shoulderL', -0.25 * w, 0, 0.25 * w);
        this.add('shoulderR', -0.25 * w, 0, -0.25 * w);
        break;
      case 'stretch':
        this.add('wingL', 0, 0, -0.8 * w);
        this.add('wingR', 0, 0, 0.8 * w);
        this.add('chest', -0.15 * w);
        break;
      case 'sniff':
        this.add('neck', 0.5 * w);
        this.add('head', 0.3 * w + Math.sin(k * 40) * 0.05 * w);
        break;
      case 'wag':
        this.add('tail', 0.3 * w, Math.sin(k * 30) * 0.5 * w);
        this.add('tailTip', 0, Math.sin(k * 30 + 1) * 0.6 * w);
        break;
      case 'tap': {
        const leg = `legHip0${s > 0 ? 'L' : 'R'}`;
        this.add(leg, 0, 0, Math.max(0, Math.sin(k * TAU * 3)) * 0.6 * w * s);
        this.add('head', 0, 0.2 * w * s);
        break;
      }
      case 'clack':
        this.add('jaw', Math.max(0, Math.sin(k * 50)) * 0.4 * w);
        this.add('head', -0.15 * w);
        break;
      case 'bob':
        this.lift('hips', Math.sin(k * TAU * 2) * this.hipY * 0.05 * w);
        this.add('chest', Math.sin(k * TAU * 2) * 0.08 * w);
        break;
      case 'spin': {
        const halo = this.index.halo;
        if (halo !== undefined) this.rot[halo * 3 + 1] += w * 2.4;
        this.add('chest', 0, w * Math.sin(k * Math.PI) * 1.2);
        break;
      }
      case 'dip':
        this.lift('hips', -this.hipY * 0.12 * w);
        this.add('hips', 0.2 * w);
        break;
      case 'rear':
        this.add('chest', -0.35 * w);
        this.add('head', 0.25 * w);
        this.lift('hips', this.hipY * 0.08 * w);
        break;
      case 'shudder': {
        const q = 1 + Math.sin(k * 60) * 0.06 * w;
        this.scl.multiply(_v.set(1 / Math.sqrt(q), q, 1 / Math.sqrt(q)));
        break;
      }
      case 'swirl':
        for (let i = 0; this.has(`mote${i}`); i++) {
          const m = this.index[`mote${i}`];
          this.pos[m * 3] *= 1 + w * 0.8;
          this.pos[m * 3 + 2] *= 1 + w * 0.8;
        }
        break;
      default:
        break;
    }
  }

  // -- actions ---------------------------------------------------------------------

  private poseAction(o: RigDriveOpts): void {
    const k = o.actionT;
    switch (o.action) {
      case 'attack':
        if (this.striking) this.poseStrike(k, o.time);
        else this.poseWindup(k, o.time);
        break;
      case 'cast':
        this.poseCast(k, o.time);
        break;
      case 'spawn':
        this.poseSpawn(k, o.time);
        break;
      default:
        break;
    }
  }

  /**
   * The telegraph: the body coils against the blow it is about to throw and
   * holds there, trembling, until the strike. If no strike comes (a ranged
   * attack) the coil lets go at the end of its own accord.
   */
  private poseWindup(k: number, time: number): void {
    const coil = kf(k, [
      [0, 0],
      [0.55, 1],
      [0.86, 1],
      [1, 0.35],
    ]);
    const shake = Math.sin(time * 38 + this.offset) * 0.04 * coil * (k > 0.5 ? 1 : 0);
    this.coilPose(coil, shake);
  }

  /** The blow: from the coil it snaps through, overshoots and recovers. */
  private poseStrike(k: number, time: number): void {
    void time;
    const coil = kf(k, [
      [0, 1],
      [0.24, 0],
    ]);
    const hit = k < 0.24 ? impact(k / 0.24, 0.9) : kf(k, [
      [0.24, 1],
      [0.5, 0.8],
      [1, 0],
    ]);
    this.coilPose(coil, 0);
    this.strikePose(hit);
  }

  /** How each body loads up for a blow. */
  private coilPose(c: number, shake: number): void {
    if (c <= 0.001) return;
    const h = this.hipY;
    switch (this.archetype) {
      case 'quadruped':
        this.add('hips', -0.12 * c);
        this.lift('hips', -h * 0.12 * c, -h * 0.08 * c);
        this.add('spine', 0.1 * c);
        this.add('neck', 0.35 * c + shake);
        this.add('head', -0.45 * c);
        this.add('shoulderL', -0.3 * c);
        this.add('shoulderR', -0.3 * c);
        this.add('elbowL', -0.5 * c);
        this.add('elbowR', -0.5 * c);
        break;
      case 'arachnid':
      case 'insectoid':
        // Rear up, front legs raised.
        this.add('chest', -0.4 * c + shake);
        this.lift('hips', h * 0.1 * c);
        for (const s of ['L', 'R']) {
          const side = s === 'L' ? 1 : -1;
          this.add(`legHip0${s}`, -0.7 * c, 0, 0.5 * c * side);
          this.add(`legKnee0${s}`, 0, 0, -0.5 * c * side);
        }
        this.add('jaw', 0.5 * c);
        break;
      case 'serpent':
        // Draw the head back into an S.
        this.add('chest', -0.55 * c + shake);
        this.add('head', 0.5 * c);
        this.lift('hips', h * 0.15 * c, -h * 0.2 * c);
        break;
      case 'floating':
        this.add('hips', -0.35 * c + shake);
        this.lift('hips', h * 0.1 * c, -h * 0.12 * c);
        this.add('head', -0.2 * c);
        break;
      case 'ooze': {
        const q = 1 - 0.28 * c;
        this.scl.multiply(_v.set(1 / Math.sqrt(q), q, 1 / Math.sqrt(q)));
        this.add('chest', -0.2 * c + shake);
        break;
      }
      case 'swarm':
        for (let i = 0; this.has(`mote${i}`); i++) {
          const m = this.index[`mote${i}`];
          this.pos[m * 3] *= 1 - 0.6 * c;
          this.pos[m * 3 + 1] *= 1 - 0.6 * c;
          this.pos[m * 3 + 2] = this.pos[m * 3 + 2] * (1 - 0.6 * c) - 0.1 * c;
        }
        break;
      default: {
        // A biped cocks the weapon arm back high, the trunk turned away.
        const big = this.archetype === 'colossal' ? 1.2 : 1;
        this.add('shoulderR', -2.4 * c * big + shake, 0.2 * c, -0.45 * c);
        this.add('elbowR', -1.1 * c);
        this.add('shoulderL', -0.6 * c, 0, 0.3 * c);
        this.add('elbowL', -0.5 * c);
        this.add('spine', -0.12 * c, -0.25 * c);
        this.add('chest', -0.1 * c, -0.35 * c);
        this.add('hips', 0, -0.15 * c);
        this.add('head', 0.1 * c, 0.5 * c);
        this.lift('hips', -h * 0.04 * c);
        this.add('hipL', -0.25 * c);
        this.add('kneeL', -0.3 * c);
        if (this.has('wingL')) {
          this.add('wingL', 0, 0, -0.6 * c);
          this.add('wingR', 0, 0, 0.6 * c);
        }
        if (this.has('jaw')) this.add('jaw', 0.5 * c);
        break;
      }
    }
  }

  /** How each body delivers it. */
  private strikePose(s: number): void {
    if (s <= 0.001) return;
    const h = this.hipY;
    switch (this.archetype) {
      case 'quadruped':
        // A lunging bite: the hind legs drive, the neck and head shoot out.
        this.lift('hips', -h * 0.04 * s, h * 0.22 * s);
        this.add('hips', 0.08 * s);
        this.add('neck', -0.45 * s);
        this.add('head', 0.35 * s);
        this.add('shoulderL', -0.5 * s);
        this.add('shoulderR', -0.35 * s);
        this.add('hipL', 0.35 * s);
        this.add('hipR', 0.35 * s);
        this.add('tail', 0.4 * s);
        break;
      case 'arachnid':
      case 'insectoid':
        this.add('chest', 0.25 * s);
        this.lift('hips', -h * 0.06 * s, h * 0.15 * s);
        for (const sd of ['L', 'R']) {
          const side = sd === 'L' ? 1 : -1;
          this.add(`legHip0${sd}`, 0.5 * s, 0, -0.3 * s * side);
        }
        this.add('jaw', -0.2 * s);
        break;
      case 'serpent':
        this.add('chest', 0.45 * s);
        this.add('head', -0.25 * s);
        this.lift('hips', -h * 0.05 * s, h * 0.45 * s);
        break;
      case 'floating':
        this.add('hips', 0.45 * s);
        this.lift('hips', -h * 0.06 * s, h * 0.3 * s);
        break;
      case 'ooze': {
        const q = 1 + 0.22 * s;
        this.scl.multiply(_v.set(1 / q, 1 / Math.sqrt(q), q));
        this.lift('hips', 0, h * 0.3 * s);
        this.add('chest', 0.3 * s);
        break;
      }
      case 'swarm':
        for (let i = 0; this.has(`mote${i}`); i++) {
          const m = this.index[`mote${i}`];
          this.pos[m * 3 + 2] += 0.45 * s;
        }
        break;
      default: {
        const big = this.archetype === 'colossal' ? 1.15 : 1;
        this.add('shoulderR', (-1.2 + 0.4) * s * big, 0.5 * s, 0.1 * s);
        this.add('elbowR', -0.15 * s);
        this.add('shoulderL', 0.35 * s, 0, 0.25 * s);
        this.add('spine', 0.25 * s, 0.25 * s);
        this.add('chest', 0.2 * s, 0.35 * s);
        this.add('hips', 0.05 * s, 0.12 * s);
        this.add('head', -0.2 * s, -0.4 * s);
        this.lift('hips', -h * 0.07 * s, h * 0.06 * s);
        this.add('hipL', -0.35 * s);
        this.add('kneeL', -0.25 * s);
        this.add('hipR', 0.25 * s);
        if (this.has('wingL')) {
          this.add('wingL', 0, 0, 0.5 * s);
          this.add('wingR', 0, 0, -0.5 * s);
        }
        break;
      }
    }
  }

  /** Rise, gather with a tremor, and let it go. */
  private poseCast(k: number, time: number): void {
    const rise = kf(k, [
      [0, 0],
      [0.35, 1],
      [0.88, 1],
      [1, 0.5],
    ]);
    const push = kf(k, [
      [0.82, 0],
      [0.95, 1],
      [1, 1],
    ]);
    const shake = Math.sin(time * 40 + this.offset) * 0.05 * rise;
    const h = this.hipY;
    switch (this.archetype) {
      case 'quadruped':
        this.add('neck', -0.4 * rise + shake);
        this.add('head', -0.3 * rise);
        this.add('hips', -0.1 * rise);
        break;
      case 'arachnid':
      case 'insectoid':
        this.add('chest', -0.3 * rise + shake);
        this.lift('hips', h * 0.08 * rise);
        break;
      case 'serpent':
        this.add('chest', -0.6 * rise + shake);
        this.lift('hips', h * 0.2 * rise);
        break;
      case 'floating':
        this.lift('hips', h * 0.15 * rise);
        this.add('chest', 0, time * 2 * rise);
        break;
      case 'ooze': {
        const q = 1 + 0.2 * rise + shake;
        this.scl.multiply(_v.set(1 / Math.sqrt(q), q, 1 / Math.sqrt(q)));
        break;
      }
      case 'swarm':
        break;
      default:
        this.add('shoulderL', -1.9 * rise + shake + 0.9 * push, 0, 0.7 * rise - 0.5 * push);
        this.add('shoulderR', -1.9 * rise - shake + 0.9 * push, 0, -0.7 * rise + 0.5 * push);
        this.add('elbowL', -0.6 * rise + 0.4 * push);
        this.add('elbowR', -0.6 * rise + 0.4 * push);
        this.add('head', -0.35 * rise + 0.3 * push);
        this.add('chest', -0.2 * rise + 0.3 * push);
        this.lift('hips', h * 0.04 * rise);
        if (this.has('wingL')) {
          this.add('wingL', 0, 0, -0.7 * rise);
          this.add('wingR', 0, 0, 0.7 * rise);
        }
        break;
    }
  }

  /** Coming into the world, each body its own way. */
  private poseSpawn(k: number, time: number): void {
    const h = this.hipY;
    const f = 1 - smooth(k);
    switch (this.archetype) {
      case 'arachnid':
      case 'insectoid': {
        // Drops in on its legs: falls from above, legs flailing, lands with a squat.
        const fall = 1 - clamp01(k / 0.55);
        const land = k > 0.55 ? Math.sin(clamp01((k - 0.55) / 0.45) * Math.PI) : 0;
        this.lift('hips', h * 1.2 * fall * fall - h * 0.12 * land);
        for (let i = 0; i < 5; i++) {
          for (const s of ['L', 'R']) {
            const side = s === 'L' ? 1 : -1;
            this.add(`legHip${i}${s}`, 0, 0, (0.5 + Math.sin(time * 30 + i) * 0.3) * fall * side);
          }
        }
        break;
      }
      case 'quadruped': {
        // Out of a crouch with a shake that runs down the body.
        this.lift('hips', -h * 0.35 * f);
        this.add('neck', 0.5 * f);
        const shake = k > 0.45 ? Math.sin((k - 0.45) * 30) * (1 - k) * 0.35 : 0;
        this.add('spine', 0, shake);
        this.add('chest', 0, -shake * 0.8, shake * 0.4);
        this.add('head', 0, shake * 1.2);
        break;
      }
      case 'serpent':
        this.lift('hips', -h * 0.6 * f);
        this.add('chest', -0.6 * f + Math.sin(k * Math.PI) * 0.4);
        break;
      case 'floating':
        this.lift('hips', -h * 0.7 * f);
        this.add('chest', 0, f * 4);
        this.scl.multiplyScalar(0.3 + 0.7 * smooth(k));
        break;
      case 'ooze': {
        // Wells up out of a puddle and overshoots.
        const q = kf(k, [
          [0, 0.1],
          [0.6, 1.18],
          [0.8, 0.94],
          [1, 1],
        ]);
        this.scl.multiply(_v.set(1 / Math.sqrt(q), q, 1 / Math.sqrt(q)));
        break;
      }
      case 'swarm':
        for (let i = 0; this.has(`mote${i}`); i++) {
          const m = this.index[`mote${i}`];
          this.pos[m * 3] *= smooth(k);
          this.pos[m * 3 + 1] = this.pos[m * 3 + 1] * smooth(k) - (1 - smooth(k)) * 0.4;
          this.pos[m * 3 + 2] *= smooth(k);
        }
        break;
      default: {
        // Climbs out of the floor: hands on the ground, then up, a stretch at the top.
        const up = smooth(k / 0.8);
        const arch = Math.sin(clamp01((k - 0.6) / 0.4) * Math.PI);
        this.lift('hips', -h * 0.55 * (1 - up));
        this.add('spine', 0.9 * (1 - up) - 0.12 * arch);
        this.add('chest', 0.5 * (1 - up) - 0.1 * arch);
        this.add('head', 0.6 * (1 - up) - 0.2 * arch);
        this.add('shoulderL', -1.0 * (1 - up), 0, 0.2 * (1 - up));
        this.add('shoulderR', -1.0 * (1 - up), 0, -0.2 * (1 - up));
        this.add('hipL', -1.2 * (1 - up));
        this.add('hipR', -1.0 * (1 - up));
        this.add('kneeL', 1.6 * (1 - up));
        this.add('kneeR', 1.4 * (1 - up));
        break;
      }
    }
  }

  /** A hit, laid over whatever is playing. */
  private poseFlinch(dt: number): void {
    if (this.flinchK <= 0) return;
    this.flinchK = Math.max(0, this.flinchK - dt / 0.3);
    const k = Math.sin(this.flinchK * Math.PI * 0.5) * (this.flinchK > 0.8 ? (1 - this.flinchK) / 0.2 : 1);
    const s = this.flinchSide;
    switch (this.archetype) {
      case 'ooze': {
        const q = 1 - 0.18 * k;
        this.scl.multiply(_v.set(1 / Math.sqrt(q), q, 1 / Math.sqrt(q)));
        break;
      }
      case 'quadruped':
        this.add('neck', -0.3 * k);
        this.add('head', -0.25 * k, 0.2 * k * s);
        this.add('spine', -0.1 * k, 0, 0.08 * k * s);
        break;
      case 'floating':
        this.add('hips', -0.35 * k, 0, 0.15 * k * s);
        break;
      default:
        this.add('chest', -0.3 * k, 0.12 * k * s);
        this.add('head', -0.4 * k, 0.15 * k * s);
        this.add('spine', -0.18 * k);
        this.add('shoulderL', -0.4 * k, 0, 0.35 * k);
        this.add('shoulderR', -0.4 * k, 0, -0.35 * k);
        break;
    }
  }

  // -- death ---------------------------------------------------------------------

  /**
   * Falls the way the body would and settles, ready for `Enemy` to sink it.
   * Everything is keyed so the body hits the floor around two thirds in, with
   * a small rebound after.
   */
  private poseDeath(k: number, time: number): void {
    const h = this.hipY;
    const fall = impact(k, 0.62);
    const buckle = smooth(k / 0.3);
    switch (this.archetype) {
      case 'quadruped':
        // The legs go and it rolls onto its side, legs stiff, head down.
        this.lift('hips', -h * 0.62 * fall);
        this.add('hips', 0, 0, 1.45 * fall * this.side());
        this.add('spine', 0.1 * fall);
        this.add('neck', 0.5 * fall);
        this.add('head', 0.4 * fall);
        for (const n of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) this.add(n, -0.25 * fall);
        this.add('elbowL', -0.2 * buckle);
        this.add('kneeR', 0.25 * buckle);
        this.add('tail', -0.3 * fall);
        break;
      case 'arachnid':
      case 'insectoid':
        // Drops and curls its legs in under itself.
        this.lift('hips', -h * 0.75 * fall);
        for (let i = 0; i < 5; i++) {
          for (const s of ['L', 'R']) {
            const side = s === 'L' ? 1 : -1;
            this.add(`legHip${i}${s}`, 0, 0, 0.7 * buckle * side);
            this.add(`legKnee${i}${s}`, 0, 0, -1.5 * buckle * side);
            this.add(`legFoot${i}${s}`, 0, 0, -0.6 * buckle * side);
          }
        }
        this.add('chest', 0.2 * fall);
        this.add('jaw', 0.5 * buckle);
        break;
      case 'serpent': {
        // Goes limp: the wave dies out of it and it drops flat, one last twitch.
        let i = 0;
        for (;;) {
          const name = `seg${i}`;
          const idx = this.index[name];
          if (idx === undefined) break;
          this.rot[idx * 3] *= 1 - fall;
          this.rot[idx * 3 + 1] = this.rot[idx * 3 + 1] * (1 - fall) + Math.sin(i * 1.3 + this.offset) * 0.25 * fall;
          i++;
        }
        this.lift('hips', -h * 0.85 * fall);
        this.add('chest', 0.35 * fall + Math.sin(time * 18) * 0.06 * Math.max(0, 1 - k * 1.4));
        this.add('head', 0.3 * fall);
        break;
      }
      case 'floating':
        // Drops out of the air and rolls over on the floor.
        this.lift('hips', -h * 0.8 * fall);
        this.add('hips', 0.5 * fall, 0, 0.9 * fall * this.side());
        this.add('head', 0.3 * fall);
        break;
      case 'ooze': {
        // Splats.
        const q = 1 - 0.75 * fall;
        this.scl.set(1 / Math.sqrt(q), q, 1 / Math.sqrt(q));
        this.lift('hips', -h * 0.6 * fall);
        break;
      }
      case 'swarm':
        for (let i = 0; this.has(`mote${i}`); i++) {
          const m = this.index[`mote${i}`];
          const r = this.rest[`mote${i}`];
          this.pos[m * 3] = Math.sin(i * 2.4) * 0.3 * fall;
          this.pos[m * 3 + 1] = -(r.py + h) * fall * 0.95;
          this.pos[m * 3 + 2] = Math.cos(i * 2.4) * 0.3 * fall;
        }
        break;
      case 'colossal':
        // Heavy: onto its knees, then over onto its face.
        this.lift('hips', -h * (0.35 * buckle + 0.45 * fall), h * 0.35 * fall);
        this.add('hips', 1.2 * fall);
        this.add('spine', 0.25 * buckle - 0.1 * fall);
        this.add('chest', 0.2 * buckle);
        this.add('head', -0.4 * fall, 0.6 * fall);
        this.add('hipL', -1.2 * buckle + 1.0 * fall);
        this.add('hipR', -1.1 * buckle + 0.95 * fall);
        this.add('kneeL', 1.6 * buckle * (1 - fall));
        this.add('kneeR', 1.5 * buckle * (1 - fall));
        this.add('shoulderL', -2.4 * fall, 0, 0.4 * fall);
        this.add('shoulderR', -1.2 * fall, 0, -0.6 * fall);
        break;
      default: {
        // Knees go, then it falls back onto the floor, arms flung out.
        this.lift('hips', -h * 0.85 * fall - h * 0.2 * buckle * (1 - fall), -h * 0.3 * fall);
        this.add('hips', -1.35 * fall + 0.2 * buckle * (1 - fall), 0.2 * fall);
        this.add('spine', 0.3 * buckle * (1 - fall) - 0.1 * fall);
        this.add('chest', 0.2 * buckle * (1 - fall));
        this.add('head', 0.3 * buckle - 0.2 * fall, 0.5 * fall);
        this.add('hipL', -0.6 * buckle * (1 - fall) + 0.15 * fall);
        this.add('hipR', -0.5 * buckle * (1 - fall) + 0.35 * fall);
        this.add('kneeL', 1.0 * buckle * (1 - fall) + 0.2 * fall);
        this.add('kneeR', 0.9 * buckle * (1 - fall) + 0.5 * fall);
        // The arms fling out on the way down, not at the moment of impact.
        const fling = smooth(k / 0.55);
        this.add('shoulderL', -1.4 * fling, 0, 0.9 * fling);
        this.add('shoulderR', -1.0 * fling, 0, -1.1 * fling);
        this.add('elbowL', -0.4 * fling);
        this.add('elbowR', -0.8 * fling);
        if (this.has('wingL')) {
          this.add('wingL', 0, 0, 0.3 * fall);
          this.add('wingR', 0, 0, -0.3 * fall);
        }
        if (this.has('tail')) this.add('tail', 0.6 * fall);
        break;
      }
    }
  }

  /** Which way this one falls, fixed per monster. */
  private side(): number {
    return Math.sin(this.offset * 7.3) >= 0 ? 1 : -1;
  }
}

/**
 * SLAY — the creature animator.
 *
 * Built from nothing for the creature rigs (`Rig.ts`). One class drives every
 * rig kind; what differs per kind lives in its poser (`Posers.ts`). A frame:
 *
 * 1. Read how the body really moved over the floor this frame: speed, the
 *    direction of travel in the body's own frame, how fast it is turning.
 * 2. Advance the gait clock by distance covered, so strides match speed.
 * 3. Plan the feet: a foot in stance slides backward at exactly the body's
 *    ground speed (so it stays put on the floor), a foot in swing arcs
 *    forward to its next plant. Feet do not slide.
 * 4. Build the pose (`PoseBuf`): the poser lays idle or locomotion down, then
 *    the action over it (wind-up, strike, cast, shot, flinch, stagger, spawn,
 *    death), then the flinch layer.
 * 5. Solve it: forward kinematics in model space, two-bone IK for every leg
 *    onto its planned foot, feet kept level.
 * 6. Crossfade from the last pose when the action changes, so nothing snaps.
 *
 * The drive interface is the one `Enemy`, `Boss` and summons already use:
 * `update(dt, { locomotion, action, actionT, time, deathT })`. Events follow
 * the hero contract: `on('hit' | 'release' | 'step' | 'end', fn)`. `hit` fires
 * on the frame a strike lands, `release` on the frame a shot or spell leaves.
 */
import * as THREE from 'three';
import type { Rng } from '../../types';
import { Random } from '../../core/RNG';
import { aimQuat, twoBoneIk } from '../hero/Ik';
import type { LegChain, RigKind } from './Rig';
import { PoseBuf, STYLE_DEFAULT, clamp01, type AttackKind, type MotionStyle } from './Motion';
import { POSERS } from './Posers';

export type RigAction = 'idle' | 'walk' | 'attack' | 'cast' | 'hit' | 'death' | 'spawn';

export interface RigDriveOpts {
  /** 0 = standing, 1 = running flat out. */
  locomotion: number;
  action: RigAction;
  /** 0..1 progress through the action. */
  actionT: number;
  /** World time, for breathing and hover. */
  time: number;
  /** 0..1 death progress. */
  deathT: number;
}

export type CreatureEvent = 'hit' | 'release' | 'step' | 'end';
export interface CreatureEventInfo {
  clip: string;
  side?: 'L' | 'R';
}

/** What the animator needs to know about a built creature (kept on `root.userData.creature`). */
export interface CreatureInfo {
  kind: RigKind;
  joints: Record<string, THREE.Vector3>;
  ends: Record<string, { bone: string; at: THREE.Vector3 }>;
  legs: LegChain[];
  height: number;
  length: number;
  hipY: number;
  style: MotionStyle;
}

/** The phase of the current one-shot, as the poser sees it. */
export type Phase = 'none' | 'windup' | 'strike' | 'cast' | 'shoot' | 'hit' | 'spawn' | 'death';

interface Leg {
  def: LegChain;
  upper: number;
  lower: number;
  end: number;
  foot: number;
  l1: number;
  l2: number;
  bindUpper: THREE.Vector3;
  bindLower: THREE.Vector3;
  /** End joint relative to the contact point, bind. */
  endOff: THREE.Vector3;
  /** Planned target of the end joint, model space, and whether it is planted. */
  target: THREE.Vector3;
  planted: boolean;
  lift: number;
}

/** How long a faded-from pose keeps its momentum, seconds (time constant). */
const FADE_COAST = 0.07;
const _v = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _fkU = new THREE.Quaternion();
const _fkL = new THREE.Quaternion();
const _fkE = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _d = new THREE.Vector3();
const TAU = Math.PI * 2;

export class CreatureAnimator {
  readonly kind: RigKind;
  readonly style: MotionStyle;
  readonly info: CreatureInfo;
  readonly pose: PoseBuf;
  readonly names: string[];
  private readonly index: Record<string, number> = {};
  private readonly bonesArr: THREE.Bone[];
  private readonly parent: Int16Array;
  private readonly restPos: THREE.Vector3[];
  private readonly bindModel: THREE.Vector3[];
  /** Model-space transform of each bone this frame. */
  private readonly mPos: THREE.Vector3[];
  private readonly mQuat: THREE.Quaternion[];
  /** Local rotation and position written this frame. */
  private readonly lQuat: THREE.Quaternion[];
  private readonly lPos: THREE.Vector3[];
  private readonly legs: Leg[];
  private readonly listeners: Record<CreatureEvent, Array<(e: CreatureEventInfo) => void>> = { hit: [], release: [], step: [], end: [] };

  // --- motion state the posers read -------------------------------------------
  /** Gait clock in turns, and its rate. */
  cycle = 0;
  private rate = 0;
  /** Measured ground speed (model units/s), its direction in the body frame, turn rate (rad/s). */
  speed = 0;
  readonly vel = new THREE.Vector3(0, 0, 1);
  yawRate = 0;
  /** 0 standing .. 1 moving, eased; and walk-to-run blend. */
  gait = 0;
  run = 0;
  time = 0;
  dt = 0;
  /** Seconds since this action began, and its progress. */
  phase: Phase = 'none';
  t = 0;
  actionLen = 0.5;
  /** The attack move for this wind-up and strike. */
  attack: AttackKind = 'swing';
  /** Whether a windup was followed by its strike (else ranged release at the end). */
  struck = false;
  /** Flinch spring: displacement (signed side) and velocity; stagger amount. */
  flinch = 0;
  private flinchV = 0;
  flinchSide = 1;
  stagger = 0;
  /** Death and spawn progress. */
  deathT = 0;
  spawnT = 0;
  /** A seeded stream for idle fidgets and move choice. */
  readonly rng: Random;
  /** Per-instance offset so a pack does not move in step. */
  readonly offset: number;
  /** Boss phase (0 first). */
  bossPhase = 0;
  fidget = '';
  fidgetT = 0;
  fidgetDur = 1;
  private fidgetWait: number;
  /** 0..1 how much the legs follow their planned feet. */
  ikW = 1;
  /** Which way the body fell (radians in its own frame), chosen at death. */
  fallYaw = 0;
  fallDir = 1;

  private lastAction: RigAction = 'idle';
  private lastT = 0;
  private hasLast = false;
  private lastX = 0;
  private lastZ = 0;
  private lastYaw = 0;
  private attackIdx = 0;
  private fired = false;
  private fade = 1;
  private fadeDur = 0.15;
  private snapQ: THREE.Quaternion[];
  private snapP: THREE.Vector3[];
  /** The pose written the frame before last, and how each bone was moving when a fade began. */
  private prevQ: THREE.Quaternion[];
  private prevP: THREE.Vector3[];
  private snapW: THREE.Vector3[];
  private snapV: THREE.Vector3[];
  private fadeT = 0;
  private lastDt = 1 / 60;
  private hasPose = false;
  private prevLegPhase: number[];
  /** Hips height at bind: the yardstick for strides. */
  readonly hipY: number;
  readonly legLen: number;
  private readonly rootBody: THREE.Bone | null;

  constructor(
    private readonly root: THREE.Object3D,
    bones: Record<string, THREE.Bone>,
    info: CreatureInfo,
    rng: Rng,
  ) {
    this.info = info;
    this.kind = info.kind;
    this.style = { ...STYLE_DEFAULT, ...info.style };
    const seed = rng.next();
    this.offset = seed * TAU;
    // Its own stream, seeded from the one draw, so the caller's rolls after
    // building a monster (packs, affixes, AI) do not shift.
    this.rng = new Random(Math.floor(seed * 0x7fffffff) ^ 0x5eed);
    this.fidgetWait = 1 + this.rng.range(0, 4);

    // Bones in parents-first order, as the rig lists its joints.
    this.names = Object.keys(info.joints).filter((n) => bones[n]);
    this.names.forEach((n, i) => (this.index[n] = i));
    const n = this.names.length;
    this.bonesArr = this.names.map((nm) => bones[nm]!);
    this.parent = new Int16Array(n);
    this.restPos = [];
    this.bindModel = [];
    for (let i = 0; i < n; i++) {
      const b = this.bonesArr[i]!;
      const p = b.parent as THREE.Bone | null;
      this.parent[i] = p && (p as THREE.Bone).isBone && this.index[p.name] !== undefined ? this.index[p.name]! : -1;
      this.restPos.push(b.position.clone());
      this.bindModel.push(info.joints[this.names[i]!]!.clone());
    }
    this.mPos = this.names.map(() => new THREE.Vector3());
    this.mQuat = this.names.map(() => new THREE.Quaternion());
    this.lQuat = this.names.map(() => new THREE.Quaternion());
    this.lPos = this.names.map(() => new THREE.Vector3());
    this.snapQ = this.names.map(() => new THREE.Quaternion());
    this.snapP = this.names.map(() => new THREE.Vector3());
    this.prevQ = this.names.map(() => new THREE.Quaternion());
    this.prevP = this.names.map(() => new THREE.Vector3());
    this.snapW = this.names.map(() => new THREE.Vector3());
    this.snapV = this.names.map(() => new THREE.Vector3());
    this.pose = new PoseBuf(n);
    this.hipY = Math.max(0.1, info.hipY);
    this.rootBody = bones.root ?? null;

    this.legs = [];
    for (const def of info.legs) {
      const upper = this.index[def.upper];
      const lower = this.index[def.lower];
      const end = this.index[def.end];
      if (upper === undefined || lower === undefined || end === undefined) continue;
      const a = info.joints[def.upper]!;
      const k = info.joints[def.lower]!;
      const e = info.joints[def.end]!;
      this.legs.push({
        def,
        upper,
        lower,
        end,
        foot: def.foot ? (this.index[def.foot] ?? -1) : -1,
        l1: a.distanceTo(k),
        l2: k.distanceTo(e),
        bindUpper: k.clone().sub(a).normalize(),
        bindLower: e.clone().sub(k).normalize(),
        endOff: e.clone().sub(def.contact),
        target: e.clone(),
        planted: true,
        lift: 0,
      });
    }
    this.prevLegPhase = this.legs.map(() => 0);
    let ll = 0;
    for (const l of this.legs) ll = Math.max(ll, l.l1 + l.l2);
    this.legLen = ll > 0 ? ll : this.hipY;
  }

  // -- events ------------------------------------------------------------------

  on(ev: CreatureEvent, fn: (e: CreatureEventInfo) => void): () => void {
    this.listeners[ev].push(fn);
    return () => {
      const l = this.listeners[ev];
      const i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    };
  }

  private emit(ev: CreatureEvent, e: CreatureEventInfo): void {
    const l = this.listeners[ev];
    for (let i = 0; i < l.length; i++) {
      try {
        l[i]!(e);
      } catch {
        // A listener's failure must never stop the body moving.
      }
    }
  }

  /** The one-shot playing now, for vfx and checkers. */
  get actionState(): { clip: string; t: number } | null {
    return this.phase === 'none' ? null : { clip: this.phase === 'windup' || this.phase === 'strike' ? this.attack : this.phase, t: this.t };
  }

  /** A blow landed: flinch away from `fromYaw` (world radians, optional); `stagger` for heavy hits. */
  react(kind: 'hit' | 'stagger', fromYaw?: number): void {
    if (this.deathT > 0) return;
    if (fromYaw !== undefined) {
      const yaw = this.lastYaw;
      const rel = Math.atan2(Math.sin(fromYaw - yaw), Math.cos(fromYaw - yaw));
      this.flinchSide = rel >= 0 ? 1 : -1;
    } else this.flinchSide = this.rng.next() < 0.5 ? 1 : -1;
    const k = kind === 'stagger' ? 1 : 0.55;
    this.flinchV += k * 14 * (1 - 0.5 * this.style.heavy);
    if (kind === 'stagger') this.stagger = 1;
  }

  /** Boss phase changes: posers read `bossPhase` (stance, aggression). */
  setPhase(i: number): void {
    this.bossPhase = i;
    this.stagger = 1;
    this.flinchV += 10;
  }

  // -- pose helpers for posers -----------------------------------------------------

  has(name: string): boolean {
    return this.index[name] !== undefined;
  }

  /** Adds an Euler delta to a bone (no-op for bones this rig lacks). */
  rot(name: string, x: number, y = 0, z = 0): void {
    const i = this.index[name];
    if (i === undefined) return;
    const r = this.pose.rot;
    r[i * 3] += x;
    r[i * 3 + 1] += y;
    r[i * 3 + 2] += z;
  }

  /** As `rot`, mirrored for a side: z and y flip on the right. */
  rotS(name: string, side: 'L' | 'R', x: number, y = 0, z = 0): void {
    const s = side === 'L' ? 1 : -1;
    this.rot(name, x, y * s, z * s);
  }

  private readonly spins = new Float64Array(80);
  private snapSquash = 1;
  private snapSpread = 1;
  private outSquash = 1;
  private outSpread = 1;

  /**
   * A phase that advances at `rate` radians a second. It is integrated, so a
   * rate that changes with speed never makes the phase jump (time * rate
   * would). Call once a frame per slot. Slots: 0 flyer wingbeat, 1 tail wag,
   * 2 serpent drift, 3 floater orbit, 4 ooze heave, 8 and up one per swarm mote.
   */
  spin(slot: number, rate: number): number {
    this.spins[slot] = this.spins[slot]! + rate * this.dt;
    return this.spins[slot]! + this.offset;
  }

  /** Adds `k` times one bone's current turn to another (a second arm pair shadowing the first). */
  echo(from: string, to: string, k: number): void {
    const i = this.index[from];
    const j = this.index[to];
    if (i === undefined || j === undefined) return;
    const r = this.pose.rot;
    r[j * 3] += r[i * 3]! * k;
    r[j * 3 + 1] += r[i * 3 + 1]! * k;
    r[j * 3 + 2] += r[i * 3 + 2]! * k;
  }

  /** Moves a bone from its rest place (its parent's space), model units. */
  move(name: string, x: number, y: number, z: number): void {
    const i = this.index[name];
    if (i === undefined) return;
    const p = this.pose.pos;
    p[i * 3] += x;
    p[i * 3 + 1] += y;
    p[i * 3 + 2] += z;
  }

  /** Whole-body offset and tilt (spawns, deaths, lunges). */
  body(x: number, y: number, z: number, pitch = 0, yaw = 0, roll = 0): void {
    const b = this.pose.body;
    b[0] += x;
    b[1] += y;
    b[2] += z;
    b[3] += pitch;
    b[4] += yaw;
    b[5] += roll;
  }

  /** Seeded noise in -1..1 on this creature's own clock. */
  wobble(f: number, k = 0): number {
    const t = this.time * f + this.offset + k * 1.7;
    return Math.sin(t) * 0.6 + Math.sin(t * 2.31 + 1.3) * 0.3 + Math.sin(t * 4.7 + 0.4) * 0.1;
  }

  // -- update ------------------------------------------------------------------

  update(dt: number, o: RigDriveOpts): void {
    const step = Math.max(0, Math.min(0.1, dt));
    this.dt = step;
    this.time = o.time;
    this.measure(step);
    this.track(o, step);

    // Gait: strides from distance covered.
    const moving = clamp01(Math.max(this.speed / (this.legLen * 1.2), o.locomotion * 0.8));
    this.gait += (moving - this.gait) * Math.min(1, step * 6);
    const runWant = clamp01((this.speed / this.legLen - 1.6) / 1.6);
    this.run += (runWant - this.run) * Math.min(1, step * 3);
    const strideK = this.style.stride ?? STRIDE[this.style.gait] ?? 1.3;
    const stride = this.legLen * strideK * (1 + this.run * 0.55);
    const wantRate = this.speed > 0.02 ? this.speed / stride : 0;
    this.rate += (wantRate - this.rate) * Math.min(1, step * 8);
    this.cycle = (this.cycle + this.rate * step) % 1;

    // Flinch spring.
    const k = 160;
    const damp = 15;
    this.flinchV += (-k * this.flinch - damp * this.flinchV) * step;
    this.flinch += this.flinchV * step;
    this.stagger = Math.max(0, this.stagger - step * 1.6);

    this.tickFidget(step);

    this.pose.clear();
    this.ikW = this.legs.length ? 1 : 0;
    this.planFeet(stride);
    const poser = POSERS[this.kind];
    poser(this);
    this.solve();
  }

  /** Where the body went this frame. */
  private measure(step: number): void {
    const r = this.root;
    r.updateWorldMatrix(true, false);
    const e = r.matrixWorld.elements;
    const x = e[12]!;
    const z = e[14]!;
    // Yaw from the model's forward axis.
    const yaw = Math.atan2(e[8]!, e[10]!);
    _s.setFromMatrixScale(r.matrixWorld);
    const sc = Math.max(0.05, _s.x);
    if (this.hasLast && step > 0) {
      const dx = (x - this.lastX) / sc;
      const dz = (z - this.lastZ) / sc;
      const d = Math.hypot(dx, dz);
      // Teleports and knockbacks are not walking.
      const sp = d / step > 40 ? 0 : d / step;
      this.speed += (sp - this.speed) * Math.min(1, step * 10);
      if (d > 1e-5) {
        // Into the body's frame.
        const c = Math.cos(-yaw);
        const s = Math.sin(-yaw);
        const lx = dx * c + dz * s;
        const lz = -dx * s + dz * c;
        _v.set(lx, 0, lz).normalize();
        this.vel.lerp(_v, Math.min(1, step * 8)).normalize();
      }
      let dy = yaw - this.lastYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yawRate += (dy / step - this.yawRate) * Math.min(1, step * 6);
    }
    this.lastX = x;
    this.lastZ = z;
    this.lastYaw = yaw;
    this.hasLast = true;
  }

  /** Turns the drive's action stream into phases, and fires events. */
  private track(o: RigDriveOpts, step: number): void {
    const a = o.action === 'walk' ? 'idle' : o.action;
    const prevPhase = this.phase;
    if (o.deathT > 0) {
      if (this.phase !== 'death') {
        this.beginFade(0.16);
        this.phase = 'death';
        this.t = 0;
        // Fall away from the last blow, or a side chosen for it.
        this.fallDir = this.flinchSide >= 0 ? 1 : -1;
        this.fallYaw = (this.rng.next() - 0.5) * 0.8;
      }
      this.deathT = clamp01(o.deathT);
      this.t += step;
      this.lastAction = 'death';
      return;
    }
    this.deathT = 0;
    const restarted = a === this.lastAction && o.actionT + 1e-4 < this.lastT;
    if (a !== this.lastAction || restarted) {
      // A new one-shot.
      if (a === 'attack') {
        if (this.lastAction === 'attack' && this.lastT > 0.45 && this.phase === 'windup') {
          this.phase = 'strike';
          this.struck = true;
          this.beginFade(0.05);
        } else {
          this.phase = 'windup';
          this.struck = false;
          this.attack = this.pickAttack();
          this.beginFade(0.16);
        }
      } else if (a === 'cast') {
        this.phase = this.style.ranged && (this.style.armed === 'bow' || this.style.armed === 'crossbow') ? 'shoot' : 'cast';
        this.beginFade(0.16);
      } else if (a === 'hit') {
        this.phase = 'hit';
        // The flinch is a layer; a stagger may already have been set by react().
        if (this.flinchV < 3 && this.flinch < 0.05) this.react('hit');
      } else if (a === 'spawn') {
        this.phase = 'spawn';
        this.fade = 1;
      } else {
        // Back to idle.
        if (this.phase === 'windup' && !this.struck && this.style.ranged && !this.fired) {
          // A shot that ran to its end without the strike: it left at the end.
          this.emit('release', { clip: this.attack });
        }
        if (this.phase !== 'none' && this.phase !== 'hit') this.emit('end', { clip: this.phase });
        if (this.phase !== 'hit' && this.phase !== 'none') this.beginFade(0.22 + this.style.heavy * 0.15);
        this.phase = 'none';
      }
      this.t = 0;
      this.fired = false;
      if (o.actionT > 0 && step > 0) this.actionLen = Math.max(0.08, step / Math.max(1e-3, o.actionT));
    } else if (a !== 'idle' && o.actionT > this.lastT && step > 0) {
      // Estimate how long the action runs from how fast it advances.
      const est = step / (o.actionT - this.lastT);
      this.actionLen += (est - this.actionLen) * 0.3;
    }
    if (this.phase === 'spawn') this.spawnT = clamp01(o.actionT);
    else this.spawnT = 0;
    this.t = this.phase === 'none' ? 0 : clamp01(o.actionT);
    this.lastAction = a;
    this.lastT = o.actionT;

    // Events at their frames.
    if (!this.fired) {
      if (this.phase === 'strike' && this.t >= 0.15) {
        this.fired = true;
        this.emit('hit', { clip: this.attack });
      } else if ((this.phase === 'cast' || this.phase === 'shoot') && this.t >= this.releaseAt()) {
        this.fired = true;
        this.emit('release', { clip: this.phase });
      } else if (this.phase === 'windup' && this.style.ranged && this.t >= this.releaseAt()) {
        this.fired = true;
        this.emit('release', { clip: this.attack });
      }
    }
    if (prevPhase !== this.phase && this.phase === 'none') this.struck = false;
  }

  /** The share of a cast or shot at which it leaves: the game fires it 0.1 s before the action ends. */
  releaseAt(): number {
    return clamp01(1 - 0.1 / Math.max(0.2, this.actionLen));
  }

  private pickAttack(): AttackKind {
    const list = this.style.attacks.length ? this.style.attacks : ['swing' as AttackKind];
    if (list.length === 1) return list[0]!;
    // Mostly in turn, now and then out of turn, never the same twice running.
    let i = this.attackIdx % list.length;
    if (this.rng.next() < 0.3) i = (i + 1 + Math.floor(this.rng.next() * (list.length - 1))) % list.length;
    this.attackIdx = i + 1;
    return list[i]!;
  }

  private tickFidget(step: number): void {
    if (this.fidget) {
      this.fidgetT += step / this.fidgetDur;
      if (this.fidgetT >= 1) {
        this.fidget = '';
        this.fidgetWait = 2 + this.rng.range(0, 5);
      }
      return;
    }
    if (this.gait > 0.2 || this.phase !== 'none') return;
    this.fidgetWait -= step;
    if (this.fidgetWait <= 0) {
      const list = ['look', 'shift', 'shake', 'roar'];
      this.fidget = list[Math.floor(this.rng.next() * list.length)]!;
      this.fidgetT = 0;
      this.fidgetDur = 1.1 + this.rng.range(0, 1.2) + this.style.heavy;
    }
  }

  private beginFade(dur: number): void {
    if (!this.hasPose) return;
    const k = 1 / Math.max(1e-3, this.lastDt);
    for (let i = 0; i < this.names.length; i++) {
      const bq = this.bonesArr[i]!.quaternion;
      const bp = this.bonesArr[i]!.position;
      this.snapQ[i]!.copy(bq);
      this.snapP[i]!.copy(bp);
      // The turn and travel of the last frame, per second: the snapshot keeps
      // moving that way and eases to a stop, so a fade never freezes a limb
      // mid-swing (the jolt a plain snapshot gives).
      _q.copy(this.prevQ[i]!).invert().premultiply(bq);
      if (_q.w < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      const ang = 2 * Math.acos(Math.min(1, _q.w));
      const sn = Math.sqrt(Math.max(0, 1 - _q.w * _q.w));
      const w = this.snapW[i]!;
      if (sn < 1e-6) w.set(0, 0, 0);
      else w.set(_q.x / sn, _q.y / sn, _q.z / sn).multiplyScalar(Math.min(ang * k, 25));
      this.snapV[i]!.copy(bp).sub(this.prevP[i]!).multiplyScalar(k);
      if (this.snapV[i]!.lengthSq() > 100 * this.hipY * this.hipY) this.snapV[i]!.setLength(10 * this.hipY);
    }
    this.snapSquash = this.outSquash;
    this.snapSpread = this.outSpread;
    this.fade = 0;
    this.fadeT = 0;
    this.fadeDur = dur;
  }

  // -- feet --------------------------------------------------------------------

  /** Per-leg phase in turns at this moment of the cycle. */
  legPhase(i: number): number {
    const def = this.legs[i]?.def;
    if (!def) return this.cycle;
    let off = def.phase;
    if (this.kind === 'quadruped' && this.run > 0.01) {
      // Walk and trot on diagonal pairs; gallop: hinds together, then fronts.
      const front = def.upper.startsWith('f');
      const gal = front ? (def.side === 'L' ? 0.5 : 0.6) : def.side === 'L' ? 0.0 : 0.08;
      off += (gal - off) * this.run;
    }
    return (((this.cycle + off) % 1) + 1) % 1;
  }

  /** The share of a cycle a foot spends on the floor. */
  get duty(): number {
    const base = this.style.gait === 'scuttle' ? 0.55 : 0.62;
    return base - this.run * 0.2;
  }

  /** Gait cycles a second (strides from distance covered). */
  get strideRate(): number {
    return this.rate;
  }

  get legCount(): number {
    return this.legs.length;
  }

  /** Leg target (model space) for posers that move feet (stomps, lunges). */
  footTarget(i: number): THREE.Vector3 | null {
    return this.legs[i]?.target ?? null;
  }

  legDef(i: number): LegChain | null {
    return this.legs[i]?.def ?? null;
  }

  private planFeet(stride: number): void {
    const duty = this.duty;
    const g = this.gait;
    // Distance a foot travels relative to the body over its stance.
    const S = stride * duty;
    const liftH = this.legLen * (0.1 + 0.1 * this.run) * (1 - 0.3 * this.style.heavy);
    const vx = this.vel.x;
    const vz = this.vel.z;
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]!;
      const p = this.legPhase(i);
      let along: number;
      let lift = 0;
      if (p < duty) {
        // Stance: from +S/2 to -S/2, at ground speed.
        along = S * (0.5 - p / duty);
      } else {
        // Swing: a Hermite curve whose end slopes match the stance's, so the
        // foot leaves and meets the floor at rest in the world (no jolt at
        // lift-off or touch-down), and a lift bump with flat ends.
        const u = (p - duty) / (1 - duty);
        const m = (-(1 - duty) / duty) * S;
        const u2 = u * u;
        const u3 = u2 * u;
        along = (2 * u3 - 3 * u2 + 1) * (-0.5 * S) + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * (0.5 * S) + (u3 - u2) * m;
        lift = 16 * u2 * (1 - u) * (1 - u) * liftH;
      }
      along *= g;
      lift *= g;
      const c = leg.def.contact;
      leg.target.set(c.x + vx * along, c.y + lift, c.z + vz * along).add(leg.endOff);
      leg.lift = lift;
      const planted = p < duty || g < 0.05;
      // A foot coming down is a step.
      if (planted && !leg.planted && g > 0.3) this.emit('step', { clip: 'walk', side: leg.def.side });
      leg.planted = planted;
      this.prevLegPhase[i] = p;
    }
  }

  // -- solve -------------------------------------------------------------------

  private solve(): void {
    const n = this.names.length;
    const P = this.pose;
    // Local rotations and positions from the pose.
    for (let i = 0; i < n; i++) {
      _e.set(P.rot[i * 3]!, P.rot[i * 3 + 1]!, P.rot[i * 3 + 2]!, 'XYZ');
      this.lQuat[i]!.setFromEuler(_e);
      this.lPos[i]!.copy(this.restPos[i]!).add(_v.set(P.pos[i * 3]!, P.pos[i * 3 + 1]!, P.pos[i * 3 + 2]!));
    }
    // The root bone carries the whole-body transform.
    const ri = this.index.root;
    if (ri !== undefined) {
      const b = P.body;
      _e.set(b[3]!, b[4]!, b[5]!, 'YXZ');
      _q.setFromEuler(_e);
      this.lQuat[ri]!.premultiply(_q);
      this.lPos[ri]!.add(_v.set(b[0]!, b[1]!, b[2]!));
    }
    this.fk();

    // Legs onto their feet.
    if (this.ikW > 0.001) {
      const bodyQ = ri !== undefined ? this.mQuat[ri]! : _q2.identity();
      for (const leg of this.legs) this.solveLeg(leg, bodyQ);
      // Partly solved legs moved their joints; bring model space back in step.
      if (this.ikW < 0.999) this.fk();
    }

    // Write, crossfading from the snapshot.
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + this.dt / Math.max(0.01, this.fadeDur));
      this.fadeT += this.dt;
    }
    const f = this.fade < 1 ? this.fade * this.fade * (3 - 2 * this.fade) : 1;
    // Seconds of motion the snapshot has carried on for, easing out.
    const coast = FADE_COAST * (1 - Math.exp(-this.fadeT / FADE_COAST));
    for (let i = 0; i < n; i++) {
      const bone = this.bonesArr[i]!;
      this.prevQ[i]!.copy(bone.quaternion);
      this.prevP[i]!.copy(bone.position);
      if (f < 1) {
        const w = this.snapW[i]!;
        const wl = w.length();
        if (wl > 1e-6) _q.setFromAxisAngle(_v.copy(w).divideScalar(wl), wl * coast).multiply(this.snapQ[i]!);
        else _q.copy(this.snapQ[i]!);
        bone.quaternion.copy(_q).slerp(this.lQuat[i]!, f);
        bone.position.copy(this.snapP[i]!).addScaledVector(this.snapV[i]!, coast).lerp(this.lPos[i]!, f);
      } else {
        bone.quaternion.copy(this.lQuat[i]!);
        bone.position.copy(this.lPos[i]!);
      }
    }
    // Squash and stretch crossfade too, so a change of move never pops the body's size.
    const sq = f < 1 ? this.snapSquash + (P.squash - this.snapSquash) * f : P.squash;
    const sp = f < 1 ? this.snapSpread + (P.spread - this.snapSpread) * f : P.spread;
    this.outSquash = sq;
    this.outSpread = sp;
    const root = this.rootBody;
    if (root) root.scale.set(sp, sq, sp);
    this.hasPose = true;
    this.lastDt = this.dt || this.lastDt;
  }

  /** Model-space transforms from local ones, parents first. */
  private fk(from = 0): void {
    const n = this.names.length;
    for (let i = from; i < n; i++) {
      const p = this.parent[i]!;
      if (p < 0) {
        this.mQuat[i]!.copy(this.lQuat[i]!);
        this.mPos[i]!.copy(this.lPos[i]!);
      } else {
        this.mQuat[i]!.multiplyQuaternions(this.mQuat[p]!, this.lQuat[i]!);
        this.mPos[i]!.copy(this.lPos[i]!).applyQuaternion(this.mQuat[p]!).add(this.mPos[p]!);
      }
    }
  }

  /** Model-space position of a bone this frame (after FK). */
  boneModel(name: string, out: THREE.Vector3): THREE.Vector3 {
    const i = this.index[name];
    return i === undefined ? out.set(0, 0, 0) : out.copy(this.mPos[i]!);
  }

  private solveLeg(leg: Leg, bodyQ: THREE.Quaternion): void {
    // Below full weight the solved turns blend with the posed ones, so a leg
    // handing over from IK to the pose (deaths, lunges) never flips its knee.
    const w = this.ikW;
    if (w < 0.999) {
      _fkU.copy(this.lQuat[leg.upper]!);
      _fkL.copy(this.lQuat[leg.lower]!);
      _fkE.copy(this.lQuat[leg.end]!);
    }
    this.solveLegFull(leg, bodyQ);
    if (w < 0.999) {
      this.lQuat[leg.upper]!.copy(_fkU.slerp(this.lQuat[leg.upper]!, w));
      this.lQuat[leg.lower]!.copy(_fkL.slerp(this.lQuat[leg.lower]!, w));
      this.lQuat[leg.end]!.copy(_fkE.slerp(this.lQuat[leg.end]!, w));
    }
  }

  private solveLegFull(leg: Leg, bodyQ: THREE.Quaternion): void {
    const a = this.mPos[leg.upper]!;
    const t = _t.copy(leg.target);
    // Blend toward where the pose itself put the end joint.
    if (this.ikW < 1) t.lerp(this.mPos[leg.end]!, 1 - this.ikW);
    // Soft reach: near full stretch the knee would race to straight in a
    // frame; ease the last tenth of the reach so it straightens smoothly.
    const reach = leg.l1 + leg.l2;
    const d = t.distanceTo(a);
    const soft = reach * 0.88;
    if (d > soft && d > 1e-6) {
      const span = reach - soft;
      const dd = soft + span * (1 - Math.exp(-(d - soft) / span));
      t.sub(a).multiplyScalar(dd / d).add(a);
    }
    const pi = this.parent[leg.upper]!;
    const pq = pi >= 0 ? this.mQuat[pi]! : bodyQ;
    const pole = _v3.copy(leg.def.pole).applyQuaternion(pq);
    twoBoneIk(a, t, leg.l1, leg.l2, pole, _knee);
    const knee = _knee;
    // Upper bone: bind direction onto hip to knee, twist steered by the pole.
    const up = this.mQuat[leg.upper]!;
    aimQuat(leg.bindUpper, leg.def.pole, _d.subVectors(knee, a), pole, up);
    this.lQuat[leg.upper]!.copy(_q.copy(pq).invert().multiply(up));
    // Lower bone.
    const lq = this.mQuat[leg.lower]!;
    aimQuat(leg.bindLower, leg.def.pole, _d.subVectors(t, knee), pole, lq);
    this.lQuat[leg.lower]!.copy(_q.copy(up).invert().multiply(lq));
    this.mPos[leg.lower]!.copy(knee);
    // The end bone keeps its posed turn relative to the body, so feet stay level.
    const em = this.mQuat[leg.end]!;
    em.copy(bodyQ).multiply(this.lQuat[leg.end]!);
    this.lQuat[leg.end]!.copy(_q.copy(lq).invert().multiply(em));
    this.mPos[leg.end]!.copy(t);
  }
}

/** Stride length per gait, as a multiple of leg length. */
const STRIDE: Record<string, number> = {
  walk: 1.25,
  march: 1.35,
  shamble: 0.9,
  lope: 1.6,
  scuttle: 0.75,
  lumber: 1.0,
  stalk: 1.15,
  hop: 1.4,
  glide: 1.5,
  slither: 1.4,
  roll: 3.2,
};

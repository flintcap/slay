/**
 * SLAY — the hero animator.
 *
 * Built from nothing for the hero rig (`Rig.ts`). A frame goes:
 *
 * 1. Read how the body really moved over the floor (`follow`).
 * 2. Plan the feet (`Gait.ts`): planted feet stay put in the world.
 * 3. Build a pose in channels (`Pose.ts`): the stance for what is held
 *    (`Stances.ts`), the stride or the idle laid over it (pelvis bob and sway,
 *    counter-turning shoulders, arm swing, lean into speed, bank into turns,
 *    breathing, weight shifts), then an action (`Actions.ts`) over that, then
 *    hit flinches.
 * 4. Solve it: forward kinematics, the pelvis lowered so every planted foot
 *    is in reach, two-bone IK for each leg onto its foot (`Ik.ts`), the off
 *    hand onto a two-handed grip.
 * 5. Swing what hangs off the body (`Secondary.ts`).
 *
 * The game's API is kept: `play`, `update`, `setGrip`, `setWeapon`,
 * `follow`, `setCondition`, plus `on('hit' | 'release' | 'step' | 'end')`.
 */
import * as THREE from 'three';
import { HERO_BONES, HERO_PARENT, type HeroBone } from './Rig';
import { BONE_INDEX, CH, CHANNELS, Pose, PoseSolver, mask, ARM_L, ARM_R, TRUNK } from './Pose';
import { Gait, wrapAngle, type GaitInput } from './Gait';
import { STANCES, stanceFor, type Stance, type StanceDef, type StanceBody } from './Stances';
import { actionFor, moveKind, type ActionCtx, type ActionDef, type MoveKind } from './Actions';
export { ACTION_NAMES } from './Actions';
import { aimQuat, twoBoneIk } from './Ik';
import { CapeSpring } from './Secondary';

export type HeroEvent = 'hit' | 'release' | 'step' | 'end';
export interface HeroEventInfo {
  clip: string;
  side?: 'L' | 'R';
}

export type CarryGrip = 'none' | 'twoHand' | 'staff' | 'bow';
export type BodyCondition = 'none' | 'stunned' | 'frozen' | 'down' | 'rooted';
export type OffHand = 'none' | 'shield' | 'weapon' | 'focus';

export interface PlayOpts {
  /** Crossfade in seconds. */
  fade?: number;
  /** Playback rate; for walk and run without `follow`, the share of full speed. */
  speed?: number;
  /** Force a one-shot even if the action loops. */
  once?: boolean;
  /** Freeze on the last key instead of returning to the stance. */
  hold?: boolean;
  /** Restart even if this action is already playing. */
  restart?: boolean;
  /** Seconds from now to the hit or release key; the run-up is time-warped to land it. */
  contact?: number;
  /** Fired when a one-shot finishes. */
  onEnd?: () => void;
  /** Plays even while a condition (stunned, knocked down) holds the body. */
  force?: boolean;
}

const LOCO = new Set(['idle', 'walk', 'run']);
const TAU = Math.PI * 2;
const UPPER = mask([...TRUNK, ...ARM_L, ...ARM_R], [CH.offGrip, CH.gripGap]);
const FULL = mask([...TRUNK, ...ARM_L, ...ARM_R, 'pelvis'], [CH.offGrip, CH.gripGap, CH.pelvisX, CH.pelvisY, CH.pelvisZ, CH.legIk]);
const LEG_MASK = mask(['thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR']);
for (let i = 0; i < CHANNELS; i++) FULL[i] = Math.max(FULL[i]!, LEG_MASK[i]!);

interface Track {
  name: string;
  def: ActionDef;
  /** Natural time. */
  t: number;
  speed: number;
  /** Rate before the contact key, so it lands when the game says. */
  warp: number;
  once: boolean;
  hold: boolean;
  done: boolean;
  fired: boolean;
  onEnd?: () => void;
  /** Blend weight in, and the fade length. */
  w: number;
  fade: number;
  /** Key poses, baked when the action starts. */
  keys: Float32Array[];
  times: number[];
  holds: boolean[];
  /** Weight going out after the action ends. */
  out: number;
  /** Natural time last frame, for steps crossing their key. */
  prevT: number;
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Where one leg's IK reads its geometry, bind pose. */
interface LegGeo {
  thigh: number;
  shin: number;
  foot: number;
  toe: number;
  l1: number;
  l2: number;
  thighDir: THREE.Vector3;
  shinDir: THREE.Vector3;
  /** Ankle bind height, and ball and heel contacts relative to the ankle's ground point. */
  ankleY: number;
  ballZ: number;
  heelZ: number;
}

interface ArmGeo {
  upper: number;
  fore: number;
  hand: number;
  l1: number;
  l2: number;
  upperDir: THREE.Vector3;
  foreDir: THREE.Vector3;
  /** Which way the elbow points off the shoulder-wrist line in the bind pose. */
  elbowOut: THREE.Vector3;
  socketPos: THREE.Vector3;
  socketQuat: THREE.Quaternion;
}

export class HeroAnimator {
  /** The rig bones, in `HERO_BONES` order. */
  readonly bones: THREE.Bone[];
  private solver: PoseSolver;
  private gait: Gait;
  private legs: [LegGeo, LegGeo];
  private arms: { L: ArmGeo; R: ArmGeo };
  private body: StanceBody;
  /** Pelvis bind height. */
  private pelvisY: number;
  private legLen: number;

  /** Global playback multiplier: hit-stop, slow motion, haste. */
  timeScale = 1;

  // Poses, reused every frame.
  private pose = new Pose().rest();
  private base = new Pose().rest();
  private stanceIdle = new Pose().rest();
  private stanceMove = new Pose().rest();
  private prevIdle = new Pose().rest();
  private prevMove = new Pose().rest();
  private scratch = new Pose().rest();
  private actPose = new Pose().rest();
  private fkLocal: THREE.Quaternion[] = HERO_BONES.map(() => new THREE.Quaternion());

  private stance: Stance = 'unarmed';
  private prevStance: Stance = 'unarmed';
  private stanceW = 1;
  private grip = 'none';
  private offHand: OffHand = 'none';

  // Ground motion.
  private followed: THREE.Object3D | null = null;
  private hasLast = false;
  private lastX = 0;
  private lastZ = 0;
  private lastYaw = 0;
  private bx = 0;
  private bz = 0;
  private yaw = 0;
  private vx = 0;
  private vz = 0;
  private yawRate = 0;
  private fwdSpeed = 0;
  private accel = 0;
  /** Requested locomotion when nobody is followed: m/s along +Z. */
  private treadmill = 0;

  // Layers.
  private loco = 'idle';
  private track: Track | null = null;
  private fading: Track | null = null;
  private lean = 0;
  private leanVel = 0;
  private elapsed = 0;
  private seed = 0;
  private flinchT = 1;
  private flinchK = 0;
  private flinchSide = 1;
  private combo = 0;
  private lastAttackAt = -9;
  private category: string | undefined;
  private kind: MoveKind = 'unarmed';
  private lastLegIk = 1;
  private condition: BodyCondition = 'none';
  private staggerAt = -9;

  private listeners = new Map<HeroEvent, Set<(e: HeroEventInfo) => void>>();
  private capes: CapeSpring[] = [];
  private capeScan = -1;
  private chest: THREE.Bone;
  private lastPelvisY = 0;
  private pelvisVy = 0;

  constructor(bones: Record<string, THREE.Bone>) {
    this.bones = HERO_BONES.map((n) => {
      const b = bones[n];
      if (!b) throw new Error(`HeroAnimator: rig has no bone ${n}`);
      return b;
    });
    // Bind joints from the bones as they are now (identity rotations at bind).
    const joints = {} as Record<HeroBone, THREE.Vector3>;
    for (const n of HERO_BONES) {
      const p = HERO_PARENT[n];
      joints[n] = bones[n]!.position.clone();
      if (p) joints[n].add(joints[p]);
    }
    this.solver = new PoseSolver(joints);
    this.chest = bones.chest!;
    const h = joints.head.y / 6.62;
    this.pelvisY = joints.pelvis.y;
    const leg = (s: 'L' | 'R'): LegGeo => {
      const hip = joints[`thigh${s}`];
      const knee = joints[`shin${s}`];
      const ankle = joints[`foot${s}`];
      const toe = joints[`toe${s}`];
      return {
        thigh: BONE_INDEX[`thigh${s}`],
        shin: BONE_INDEX[`shin${s}`],
        foot: BONE_INDEX[`foot${s}`],
        toe: BONE_INDEX[`toe${s}`],
        l1: knee.distanceTo(hip),
        l2: ankle.distanceTo(knee),
        thighDir: knee.clone().sub(hip).normalize(),
        shinDir: ankle.clone().sub(knee).normalize(),
        ankleY: ankle.y,
        ballZ: toe.z - ankle.z,
        heelZ: -0.22 * h,
      };
    };
    this.legs = [leg('L'), leg('R')];
    this.legLen = this.legs[0].l1 + this.legs[0].l2;
    const arm = (s: 'L' | 'R'): ArmGeo => {
      const sh = joints[`upperArm${s}`];
      const el = joints[`foreArm${s}`];
      const wr = joints[`hand${s}`];
      const line = wr.clone().sub(sh).normalize();
      const out = el.clone().sub(sh);
      out.addScaledVector(line, -out.dot(line)).normalize();
      const hand = bones[`hand${s}`]!;
      const sock = hand.children.find((o) => o.userData.heroSocket === (s === 'R' ? 'mainHand' : 'offHand'));
      return {
        upper: BONE_INDEX[`upperArm${s}`],
        fore: BONE_INDEX[`foreArm${s}`],
        hand: BONE_INDEX[`hand${s}`],
        l1: el.distanceTo(sh),
        l2: wr.distanceTo(el),
        upperDir: el.clone().sub(sh).normalize(),
        foreDir: wr.clone().sub(el).normalize(),
        elbowOut: out,
        socketPos: sock ? sock.position.clone() : new THREE.Vector3(),
        socketQuat: sock ? sock.quaternion.clone() : new THREE.Quaternion(),
      };
    };
    this.arms = { L: arm('L'), R: arm('R') };
    // Build: how far out the hanging arms sit. Read off the shoulders.
    const shoulderW = Math.abs(joints.upperArmL.x) / h;
    this.body = { h, build: clamp((shoulderW - 0.66) / 0.16, 0, 1) };
    this.gait = new Gait({ legLen: this.legLen, ankleY: this.legs[0].ankleY, ballZ: this.legs[0].ballZ, heelZ: this.legs[0].heelZ });
    let s = 0;
    for (const b of this.bones) s = (s * 31 + Math.round(b.position.length() * 1e4)) >>> 0;
    this.seed = (s % 1000) / 100;
    this.buildStance(this.stance, this.stanceIdle, this.stanceMove, 0);
  }

  // -- the game's API ---------------------------------------------------------

  /** Subscribes to an event; returns the unsubscribe. */
  on(ev: HeroEvent, fn: (e: HeroEventInfo) => void): () => void {
    let set = this.listeners.get(ev);
    if (!set) this.listeners.set(ev, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  private emit(ev: HeroEvent, info: HeroEventInfo): void {
    const set = this.listeners.get(ev);
    if (set) for (const fn of set) fn(info);
  }

  /**
   * Reads the body's real motion from `obj` (position and `rotation.y`), which
   * is what keeps planted feet planted while the body travels and turns.
   * Without it, walk and run play on a treadmill.
   */
  follow(obj: THREE.Object3D | null): void {
    this.followed = obj;
    this.hasLast = false;
  }

  /** The carry grip for two-handed things (kept for the old API). */
  setGrip(grip: CarryGrip): void {
    if (grip !== 'none') this.setWeapon(grip);
  }

  /** What the main hand holds: sword, axe, mace, dagger, wand, twoHand, staff, bow or none. */
  setWeapon(grip: string, category?: string): void {
    this.grip = grip;
    this.category = category;
    this.setStance(stanceFor(this.grip, this.offHand));
    this.kind = moveKind(this.stance, this.grip, this.category);
  }

  /** What the off hand holds. */
  setOffHand(kind: OffHand): void {
    this.offHand = kind;
    this.setStance(stanceFor(this.grip, this.offHand));
    this.kind = moveKind(this.stance, this.grip, this.category);
  }

  /** Picks a stance directly. */
  setStance(s: Stance): void {
    if (s === this.stance) return;
    this.prevStance = this.stance;
    this.prevIdle.copy(this.stanceIdle);
    this.prevMove.copy(this.stanceMove);
    this.stance = s;
    this.stanceW = 0;
    this.kind = moveKind(s, this.grip, this.category);
  }

  get currentStance(): Stance {
    return this.stance;
  }

  /** Which chain of blows attacks swing now. */
  get moveKind(): MoveKind {
    return this.kind;
  }

  get clip(): string {
    return this.track && !this.track.done ? this.track.name : this.loco;
  }

  isPlaying(name: string): boolean {
    return this.clip === name;
  }

  /** True while a one-shot action owns the body. */
  get inAction(): boolean {
    return !!this.track && !this.track.done && !this.track.def.loop;
  }

  /** The running action: its name, natural time and contact key. Null while only moving. */
  get actionState(): { clip: string; t: number; contact: number | null } | null {
    const tr = this.track;
    if (!tr || tr.done) return null;
    return { clip: tr.name, t: tr.t, contact: tr.def.contact ?? null };
  }

  /** Spell light in the hands right now, 0..1. */
  get castGlow(): number {
    const tr = this.track;
    if (!tr || tr.done || !tr.def.glow) return 0;
    return clamp(tr.def.glow.at(tr.t), 0, 1) * tr.w;
  }

  get castHands(): 'left' | 'right' | 'both' | null {
    const tr = this.track;
    return tr && !tr.done && tr.def.glow ? tr.def.glow.hands : null;
  }

  /** Feet, for tools: planted or not, and the world ground point. */
  get feet(): ReadonlyArray<{ planted: boolean; x: number; z: number; yaw: number; pitch: number }> {
    return this.gait.feet;
  }

  /** Foot geometry the gait plants by, for tools: ankle height, ball and heel contacts. */
  get footGeo(): { ankleY: number; ballZ: number; heelZ: number } {
    const l = this.legs[0];
    return { ankleY: l.ankleY, ballZ: l.ballZ, heelZ: l.heelZ };
  }

  /** Gait numbers, for tools. */
  get gaitInfo(): { phase: number; moving: boolean; runW: number; freq: number; speed: number } {
    const g = this.gait;
    return { phase: g.phase, moving: g.moving, runW: g.runW, freq: g.freq, speed: g.speed };
  }

  /**
   * Asks for an action or a gait. Safe every frame: asking for what is already
   * playing only updates its rate, and walk/run/idle never cut a one-shot
   * short before its recovery.
   */
  play(name: string, opts: PlayOpts = {}): void {
    if (name === 'hurt') {
      this.flinch(1);
      return;
    }
    if (LOCO.has(name)) {
      this.loco = name;
      this.treadmill = name === 'run' ? 4.6 * (opts.speed ?? 1) : name === 'walk' ? 1.6 * (opts.speed ?? 1) : 0;
      const tr = this.track;
      if (tr && !tr.done && !opts.force) {
        // A move order takes the body back once the blow is past.
        const moving = this.followed ? this.gait.speed > 0.3 : name !== 'idle';
        const rec = tr.def.recover ?? Infinity;
        if (!tr.def.loop && (!moving || tr.t < rec)) return;
        if (tr.def.loop && (this.condition === 'stunned' || this.condition === 'down')) return;
        this.endTrack(opts.fade ?? 0.15);
      }
      return;
    }
    if (name === 'stagger') {
      this.staggerAt = this.elapsed;
      const tr = this.track;
      // Never knock a blow out of the hands before it lands.
      if (tr && !tr.done && tr.def.contact !== undefined && tr.t < tr.def.contact) {
        this.flinch(1.4);
        return;
      }
    }
    let resolved = name;
    if (name === 'death') resolved = this.elapsed - this.staggerAt < 0.8 || this.flinchSide > 0 ? 'death' : 'deathFwd';
    const dying = resolved === 'death' || resolved === 'deathFwd';
    if ((this.condition === 'stunned' || this.condition === 'down') && !opts.force && !dying) return;
    const cur = this.track;
    if (cur && !cur.done && cur.name === resolved && !opts.restart) {
      if (opts.speed !== undefined) cur.speed = opts.speed;
      if (opts.onEnd) cur.onEnd = opts.onEnd;
      return;
    }
    const attack = resolved === 'attack1' || resolved === 'attack2';
    if (attack) {
      // Blows close together run down the weapon's chain.
      this.combo = this.elapsed - this.lastAttackAt < 1.0 ? this.combo + 1 : 0;
      this.lastAttackAt = this.elapsed;
    }
    const def = actionFor(resolved, this.kind, this.combo);
    const ctx: ActionCtx = { ...this.body, stance: this.stance, kind: this.kind, flip: attack ? (this.combo % 2 ? -1 : 1) : this.flinchSide };
    const keys: Float32Array[] = [];
    const times: number[] = [];
    const holds: boolean[] = [];
    const pel = BONE_INDEX.pelvis * 3;
    for (const key of def.keys) {
      const p = this.scratch.copy(this.stanceIdle);
      key.pose(p, ctx);
      const c = p.c.slice();
      // The pelvis turns the short way from key to key, so a roll that ends
      // a full turn round does not spin back.
      const prev = keys[keys.length - 1];
      if (prev) for (let j = pel; j < pel + 3; j++) c[j] = prev[j]! + wrapAngle(c[j]! - prev[j]!);
      keys.push(c);
      times.push(key.t);
      holds.push(!!key.hold);
    }
    const speed = opts.speed ?? 1;
    let warp = speed;
    if (def.contact !== undefined && opts.contact !== undefined) warp = def.contact / Math.max(0.03, opts.contact);
    if (cur && !cur.done) {
      this.fading = cur;
      cur.fade = Math.max(0.001, opts.fade ?? 0.1);
    } else this.fading = null;
    this.track = {
      name: resolved,
      def,
      t: 0,
      speed,
      warp,
      once: opts.once ?? !def.loop,
      hold: opts.hold ?? false,
      done: false,
      fired: false,
      onEnd: opts.onEnd,
      w: 0,
      fade: Math.max(0.001, opts.fade ?? 0.1),
      keys,
      times,
      holds,
      out: 1,
      prevT: 0,
    };
  }

  /** A hit laid over whatever the body is doing. Alternates sides. */
  flinch(strength = 1): void {
    this.flinchT = 0;
    this.flinchK = clamp(strength, 0, 1.6);
    this.flinchSide = -this.flinchSide;
  }

  /** Kept for the old API: movement code's extra lean. */
  setLean(_bias: number): void {}

  /** Kept for the old API: townspeople's trades are the npcs stream's. */
  setPersona(_id: string): void {}

  /** What a status is doing to the body; cheap when unchanged. */
  setCondition(c: BodyCondition): void {
    if (c === this.condition) return;
    const was = this.condition;
    this.condition = c;
    const dead = this.track?.name === 'death' || this.track?.name === 'deathFwd';
    if (dead) return;
    if (c === 'stunned') this.play('stun', { fade: 0.2, force: true });
    else if (c === 'down') this.play('down', { fade: 0.08, hold: true, force: true });
    else if (was === 'down') this.play('getUp', { fade: 0.12, force: true, restart: true });
    else if (was === 'stunned') this.endTrack(0.35);
  }

  /** Back to standing, feet placed under the body. */
  reset(): void {
    this.track = null;
    this.fading = null;
    this.hasLast = false;
    this.condition = 'none';
    this.flinchT = 1;
    this.combo = 0;
    this.lastAttackAt = -9;
    this.lastLegIk = 1;
    this.gait = new Gait({ legLen: this.legLen, ankleY: this.legs[0].ankleY, ballZ: this.legs[0].ballZ, heelZ: this.legs[0].heelZ });
  }

  private endTrack(fade: number): void {
    const tr = this.track;
    if (!tr) return;
    if (!tr.done) {
      tr.done = true;
      tr.onEnd?.();
      this.emit('end', { clip: tr.name });
    }
    tr.hold = false;
    tr.fade = Math.max(0.001, fade);
    tr.out = Math.min(tr.out, 1);
  }

  // -- the frame --------------------------------------------------------------

  update(dt: number): void {
    const real = clamp(dt, 0, 0.1) * this.timeScale;
    // Frozen solid: hold the pose exactly; re-read ground motion on thaw.
    if (this.condition === 'frozen') {
      this.hasLast = false;
      return;
    }
    this.elapsed += real;
    this.readGround(real);
    this.advanceTracks(real);

    const tr = this.track && this.track.out > 0 ? this.track : null;
    const plant = !!tr && !tr.done && !!tr.def.plantFeet;
    const stance = STANCES[this.stance];
    const feet = stance.feet(this.body);
    const inp: GaitInput = {
      x: this.bx,
      z: this.bz,
      yaw: this.yaw,
      vx: this.vx,
      vz: this.vz,
      yawRate: this.yawRate,
      stance: [feet[0], feet[1]],
      rooted: this.condition === 'rooted' || this.condition === 'down' || this.condition === 'stunned',
      hold: plant,
    };
    // Legs off the IK (a roll, a fall): the feet go where the body is.
    if (this.lastLegIk < 0.99) this.gait.follow(inp);
    if (tr && !tr.done && tr.def.steps) this.actionSteps(tr, inp);
    this.gait.update(real, inp);
    for (const side of this.gait.landed) this.emit('step', { clip: this.loco, side });
    this.gait.landed.length = 0;

    this.buildPose(real, stance);
    this.solve();
    this.solver.apply(this.bones, this.pose);
    this.swingCapes(real);
  }

  private readGround(dt: number): void {
    let x: number;
    let z: number;
    let yaw: number;
    if (this.followed) {
      x = this.followed.position.x;
      z = this.followed.position.z;
      yaw = this.followed.rotation.y;
    } else {
      // Treadmill: the body walks forward on its own floor.
      yaw = 0;
      x = this.bx;
      z = this.bz + this.treadmill * dt;
    }
    if (!this.hasLast) {
      this.lastX = x;
      this.lastZ = z;
      this.lastYaw = yaw;
      this.hasLast = true;
    }
    const dx = x - this.lastX;
    const dz = z - this.lastZ;
    const dyaw = wrapAngle(yaw - this.lastYaw);
    this.lastX = x;
    this.lastZ = z;
    this.lastYaw = yaw;
    this.bx = x;
    this.bz = z;
    this.yaw = yaw;
    if (dx * dx + dz * dz > 4) {
      // Teleported: stand where we landed.
      this.vx = this.vz = 0;
      this.gait = new Gait({ legLen: this.legLen, ankleY: this.legs[0].ankleY, ballZ: this.legs[0].ballZ, heelZ: this.legs[0].heelZ });
      return;
    }
    if (dt <= 0) return;
    const k = Math.min(1, dt * 14);
    this.vx += (dx / dt - this.vx) * k;
    this.vz += (dz / dt - this.vz) * k;
    this.yawRate += (dyaw / dt - this.yawRate) * Math.min(1, dt * 10);
    const fwd = this.vx * Math.sin(yaw) + this.vz * Math.cos(yaw);
    this.accel += ((fwd - this.fwdSpeed) / dt - this.accel) * Math.min(1, dt * 6);
    this.fwdSpeed = fwd;
  }

  private advanceTracks(dt: number): void {
    const tr = this.track;
    if (this.fading) {
      this.fading.out -= dt / this.fading.fade;
      if (this.fading.out <= 0) this.fading = null;
    }
    if (!tr) return;
    if (tr.done) {
      tr.out -= dt / tr.fade;
      if (tr.out <= 0) this.track = null;
      return;
    }
    tr.w = Math.min(1, tr.w + dt / tr.fade);
    const c = tr.def.contact;
    const before = tr.t;
    tr.prevT = before;
    // Before the contact key the clock runs at the warp that lands it on time.
    if (c !== undefined && tr.t < c) {
      const tc = tr.t + dt * tr.warp;
      if (tc >= c) {
        const left = dt - (c - tr.t) / tr.warp;
        tr.t = c + left * tr.speed;
      } else tr.t = tc;
    } else tr.t += dt * tr.speed;
    if (c !== undefined && !tr.fired && before < c && tr.t >= c) {
      tr.fired = true;
      if (tr.def.event) this.emit(tr.def.event, { clip: tr.name });
    }
    const end = tr.times[tr.times.length - 1]!;
    if (tr.t >= end) {
      if (tr.def.loop && !tr.once) {
        tr.t %= Math.max(1e-3, end);
        tr.fired = false;
      } else if (tr.hold) {
        tr.t = end;
      } else {
        tr.t = end;
        this.endTrack(0.18);
      }
    }
  }

  /** Starts the steps whose key the track's clock crossed this frame. */
  private actionSteps(tr: Track, inp: GaitInput): void {
    const h = this.body.h;
    for (const st of tr.def.steps!) {
      if (!(tr.prevT <= st.t && tr.t > st.t) && !(st.t === 0 && tr.prevT === 0 && tr.t > 0)) continue;
      const land = st.land ?? st.t + 0.15;
      const dur = this.realSpan(tr, st.t, land);
      this.gait.actionStep(st.side === 'L' ? 0 : 1, inp, st.dx * h, st.dz * h, dur, (st.lift ?? 0.3) * h);
    }
  }

  /** Real seconds the track's clock takes from natural time `a` to `b`. */
  private realSpan(tr: Track, a: number, b: number): number {
    const c = tr.def.contact;
    const sp = Math.max(1e-3, tr.speed);
    if (c === undefined) return (b - a) / sp;
    const w = Math.max(1e-3, tr.warp);
    const pre = Math.max(0, Math.min(b, c) - a);
    const post = Math.max(0, b - Math.max(a, c));
    return pre / w + post / sp;
  }

  /** Samples a track's curve at its time into `out`. */
  private sample(tr: Track, out: Pose): void {
    const ts = tr.times;
    const n = ts.length;
    const t = clamp(tr.t, 0, ts[n - 1]!);
    let i = 0;
    while (i < n - 2 && t > ts[i + 1]!) i++;
    const a = tr.keys[i]!;
    const b = tr.keys[Math.min(n - 1, i + 1)]!;
    const t0 = ts[i]!;
    const t1 = ts[Math.min(n - 1, i + 1)]!;
    const span = Math.max(1e-4, t1 - t0);
    const u = clamp((t - t0) / span, 0, 1);
    // Cubic Hermite through the keys; held keys arrive and leave at rest.
    const pa = i > 0 ? tr.keys[i - 1]! : a;
    const pb = i + 2 < n ? tr.keys[i + 2]! : b;
    const ta = i > 0 ? ts[i - 1]! : t0 - span;
    const tb = i + 2 < n ? ts[i + 2]! : t1 + span;
    const ma = tr.holds[i] ? 0 : span / Math.max(1e-4, t1 - ta);
    const mb = tr.holds[i + 1] ? 0 : span / Math.max(1e-4, tb - t0);
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    const o = out.c;
    for (let c = 0; c < CHANNELS; c++) {
      const A = a[c]!;
      const B = b[c]!;
      o[c] = h00 * A + h10 * (B - pa[c]!) * ma + h01 * B + h11 * (pb[c]! - A) * mb;
    }
    const pel = BONE_INDEX.pelvis * 3;
    for (let c = pel; c < pel + 3; c++) o[c] = wrapAngle(o[c]!);
  }

  private buildStance(s: Stance, idle: Pose, move: Pose, run: number): void {
    const def = STANCES[s];
    idle.rest();
    def.idle(idle, this.body);
    idle.c[CH.pelvisY] = -def.crouch;
    move.rest();
    def.move(move, this.body, run);
  }

  private buildPose(dt: number, stance: StanceDef): void {
    const g = this.gait;
    const b = this.body;
    const L = this.legLen;
    const p = this.pose;
    const mw = g.moveW;
    const rw = g.runW;

    // Stance, eased across a weapon change.
    this.buildStance(this.stance, this.stanceIdle, this.stanceMove, rw);
    if (this.stanceW < 1) {
      this.stanceW = Math.min(1, this.stanceW + dt / 0.3);
      const w = smooth(this.stanceW);
      this.buildStance(this.prevStance, this.prevIdle, this.prevMove, rw);
      this.stanceIdle.c.forEach((v, i) => (this.stanceIdle.c[i] = this.prevIdle.c[i]! + (v - this.prevIdle.c[i]!) * w));
      this.stanceMove.c.forEach((v, i) => (this.stanceMove.c[i] = this.prevMove.c[i]! + (v - this.prevMove.c[i]!) * w));
    }
    p.copy(this.stanceIdle).mix(this.stanceMove, mw);

    // The stride.
    const ph = g.phase * TAU;
    const mid = ph - g.duty * Math.PI; // left mid-stance at 0
    const bob = (0.022 * (1 - rw) * Math.cos(2 * mid) - 0.03 * rw * Math.cos(2 * mid) - 0.045 * rw) * L * mw;
    const sway = 0.026 * L * mw * (1 - 0.6 * rw) * Math.cos(mid);
    p.shift(sway, bob - 0.012 * L * mw, 0);
    const pelYaw = -0.13 * mw * Math.cos(ph);
    const pelRoll = 0.06 * mw * (1 - 0.3 * rw) * Math.cos(mid);
    const counter = (0.2 + 0.08 * rw) * mw * Math.cos(ph);
    // Lean into speed and acceleration, on a spring so it settles.
    const leanTarget = (0.05 + 0.24 * rw) * mw + clamp(this.accel * 0.025, -0.12, 0.18);
    this.leanVel += ((leanTarget - this.lean) * 90 - this.leanVel * 14) * dt;
    this.lean += this.leanVel * dt;
    const speed = Math.hypot(this.vx, this.vz);
    const bank = clamp(-this.yawRate * speed * 0.02, -0.22, 0.22);
    // Turning in place: the hips follow the feet, the shoulders lead.
    const twist = clamp(g.footTwist(this.yaw) * 0.55, -0.5, 0.5) * (1 - mw);
    p.add('pelvis', this.lean * 0.4, pelYaw + twist, pelRoll + bank);
    p.add('spine', this.lean * 0.3, counter * 0.45 - twist * 0.5, -pelRoll * 0.5);
    p.add('chest', this.lean * 0.3, counter * 0.55 - twist * 0.5, -pelRoll * 0.3);
    // The head stays level and looks where the body goes.
    const trunkPitch = p.get('pelvis', 0) + p.get('spine', 0) + p.get('chest', 0);
    const trunkYaw = p.get('pelvis', 1) + p.get('spine', 1) + p.get('chest', 1);
    p.add('neck', -trunkPitch * 0.3, -trunkYaw * 0.35, -(pelRoll + bank) * 0.3);
    p.add('head', -trunkPitch * 0.35, -trunkYaw * 0.45, -(pelRoll + bank) * 0.4);
    // Arms swing against the legs, a beat behind.
    const arm = Math.cos(ph - 0.35);
    const amp = (0.34 + 0.24 * rw) * mw;
    const [sl, sr] = stance.swing;
    p.add('upperArmR', amp * arm * sr, 0, 0);
    p.add('upperArmL', -amp * arm * sl, 0, 0);
    p.add('foreArmR', (0.12 + 0.3 * rw) * mw * Math.max(0, arm) * sr, 0, 0);
    p.add('foreArmL', (0.12 + 0.3 * rw) * mw * Math.max(0, -arm) * sl, 0, 0);

    // Standing: breathing, weight drifting from foot to foot, a look around.
    const still = 1 - mw;
    if (still > 0.01) {
      const t = this.elapsed + this.seed;
      const br = Math.sin((t * TAU) / 3.8);
      p.add('spine', -0.012 * br * still, 0, 0);
      p.add('chest', -0.022 * br * still, 0, 0);
      p.add('neck', 0.02 * br * still, 0, 0);
      p.add('clavL', 0.035 * br * still, 0, 0);
      p.add('clavR', 0.035 * br * still, 0, 0);
      p.add('upperArmL', 0, 0, 0.015 * br * still);
      p.add('upperArmR', 0, 0, 0.015 * br * still);
      const ws = Math.sin((t * TAU) / 7.3) * 0.8 + Math.sin((t * TAU) / 17) * 0.2;
      p.shift(0.024 * L * ws * still, -0.006 * L * Math.abs(ws) * still, 0);
      p.add('pelvis', 0, 0.03 * ws * still, 0.045 * ws * still);
      p.add('spine', 0, 0, -0.03 * ws * still);
      p.add('chest', 0, 0, -0.02 * ws * still);
      const look = Math.sin(t * 0.41) * Math.sin(t * 0.17 + 1.3);
      p.add('head', 0.03 * Math.sin(t * 0.29) * still, 0.16 * look * still, 0);
    }

    // The action, over all of it.
    this.base.copy(p);
    const layer = (tr: Track, w: number) => {
      if (w <= 0) return;
      this.sample(tr, this.actPose);
      p.mix(this.actPose, w, tr.def.full ? FULL : UPPER);
    };
    if (this.fading) layer(this.fading, smooth(this.fading.out));
    if (this.track) layer(this.track, smooth(this.track.w) * smooth(this.track.out));

    // Hit flinch: the trunk and head snap back, the shoulders come up.
    if (this.flinchT < 1) {
      this.flinchT = Math.min(1, this.flinchT + dt / 0.4);
      const f = this.flinchT;
      const kk = (f < 0.14 ? f / 0.14 : f < 0.45 ? 1 - ((f - 0.14) / 0.31) * 0.6 : 0.4 * (1 - (f - 0.45) / 0.55)) * this.flinchK * (this.inAction ? 0.5 : 1);
      const s = this.flinchSide;
      p.add('spine', -0.18 * kk, 0.07 * kk * s, 0.05 * kk * s);
      p.add('chest', -0.16 * kk, 0.1 * kk * s, 0.06 * kk * s);
      p.add('head', -0.26 * kk, 0.16 * kk * s, 0.05 * kk * s);
      p.add('clavL', 0.25 * kk, 0, 0);
      p.add('clavR', 0.25 * kk, 0, 0);
      p.add('foreArmL', 0.3 * kk, 0, 0);
      p.add('foreArmR', 0.3 * kk, 0, 0);
      p.shift(0, -0.02 * b.h * kk, -0.035 * b.h * kk);
    }
  }

  /** Channels to bones: FK, pelvis into reach, leg IK, off-hand grip. */
  private solve(): void {
    const S = this.solver;
    const p = this.pose;
    const legIk = clamp(p.c[CH.legIk]!, 0, 1);
    this.lastLegIk = legIk;
    S.rotations(p);
    S.fk(p);
    // Ankle targets in rig space.
    const targets = [_v3, _v4];
    const footQ = [_q2, _q3];
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    for (let i = 0; i < 2; i++) {
      const f = this.gait.feet[i]!;
      const lg = this.legs[i]!;
      const dx = f.x - this.bx;
      const dz = f.z - this.bz;
      const gx = dx * c - dz * s;
      const gz = dx * s + dz * c;
      const psi = wrapAngle(f.yaw - this.yaw);
      const th = f.pitch;
      const pz = th >= 0 ? lg.ballZ : lg.heelZ;
      // The ankle turns about the contact point, so that point stays put.
      const ay = lg.ankleY * Math.cos(th) - (0 - pz) * Math.sin(th);
      const az = pz + lg.ankleY * Math.sin(th) + (0 - pz) * Math.cos(th);
      const cp = Math.cos(psi);
      const sp = Math.sin(psi);
      targets[i]!.set(gx + az * sp, ay + f.lift, gz + az * cp);
      footQ[i]!.setFromEuler(_e.set(th, psi, 0, 'YXZ'));
    }
    // Lower the pelvis until every foot is in reach, knees never locked.
    if (legIk > 0) {
      let drop = 0;
      for (let i = 0; i < 2; i++) {
        const hip = S.pos[this.legs[i]!.thigh]!;
        const t = targets[i]!;
        const reach = (this.legs[i]!.l1 + this.legs[i]!.l2) * 0.985;
        const d2 = (t.x - hip.x) ** 2 + (t.z - hip.z) ** 2;
        const maxY = t.y + Math.sqrt(Math.max(0, reach * reach - d2));
        drop = Math.max(drop, hip.y - maxY);
      }
      if (drop > 0) {
        p.c[CH.pelvisY]! -= drop * legIk;
        S.fk(p);
      }
    }
    const pel = S.pos[BONE_INDEX.pelvis]!.y;
    this.pelvisVy = this.pelvisVy * 0.8 + (pel - this.lastPelvisY) * 0.2 * 60;
    this.lastPelvisY = pel;

    if (legIk > 0) {
      for (let i = 0; i < 2; i++) {
        const lg = this.legs[i]!;
        for (const bi of [lg.thigh, lg.shin, lg.foot, lg.toe]) this.fkLocal[bi]!.copy(S.local[bi]!);
        const hip = S.pos[lg.thigh]!;
        const t = targets[i]!;
        // Knee toward where the foot and the hips both face, a touch outward.
        const pelQ = S.world[BONE_INDEX.pelvis]!;
        const pole = _pole.set(0, 0, 1).applyQuaternion(pelQ);
        pole.add(_v2.set(0, 0, 1).applyQuaternion(footQ[i]!)).normalize();
        pole.x += (i === 0 ? 0.12 : -0.12);
        pole.y = 0;
        twoBoneIk(hip, t, lg.l1, lg.l2, pole, _knee);
        S.setWorld(lg.thigh, aimQuat(lg.thighDir, Z_AXIS, _v1.subVectors(_knee, hip), pole, _q1));
        S.refresh(lg.shin);
        S.setWorld(lg.shin, aimQuat(lg.shinDir, Z_AXIS, _v1.subVectors(t, _knee), pole, _q1));
        S.refresh(lg.foot);
        S.setWorld(lg.foot, footQ[i]!);
        // The toes stay on the floor as the heel rises.
        const f = this.gait.feet[i]!;
        const toe = f.planted ? -Math.max(0, f.pitch) : -Math.max(0, f.pitch) * 0.6;
        S.local[lg.toe]!.setFromAxisAngle(_v1.set(1, 0, 0), toe);
        if (legIk < 1) {
          for (const bi of [lg.thigh, lg.shin, lg.foot, lg.toe]) S.local[bi]!.slerp(this.fkLocal[bi]!, 1 - legIk);
        }
        S.refresh(lg.thigh);
        S.refreshBelow(lg.thigh);
      }
    }

    // The off hand onto a two-handed grip, below the main hand.
    const grip = clamp(p.c[CH.offGrip]!, 0, 1);
    if (grip > 0) {
      const R = this.arms.R;
      const A = this.arms.L;
      const handR = S.world[R.hand]!;
      const mainQ = _q1.copy(handR).multiply(R.socketQuat);
      const mainP = _v1.copy(R.socketPos).applyQuaternion(handR).add(S.pos[R.hand]!);
      const gap = p.c[CH.gripGap]! || this.body.h * 0.5;
      const axis = _v2.set(0, 1, 0).applyQuaternion(mainQ);
      mainP.addScaledVector(axis, -gap);
      // The left fist takes the same frame on the haft.
      const handLQ = _q2.copy(mainQ).multiply(_q3.copy(A.socketQuat).invert());
      const wrist = _v3.copy(A.socketPos).applyQuaternion(handLQ).negate().add(mainP);
      for (const bi of [A.upper, A.fore, A.hand]) this.fkLocal[bi]!.copy(S.local[bi]!);
      const sh = S.pos[A.upper]!;
      // Elbow down and out.
      const pole = _v4.set(0.7, -1, -0.2).normalize();
      twoBoneIk(sh, wrist, A.l1, A.l2, pole, _knee);
      const out = _v2.copy(_knee).sub(sh);
      const line = _v1.copy(wrist).sub(sh).normalize();
      out.addScaledVector(line, -out.dot(line));
      S.setWorld(A.upper, aimQuat(A.upperDir, A.elbowOut, _v1.subVectors(_knee, sh), out, _q3));
      S.refresh(A.fore);
      S.setWorld(A.fore, aimQuat(A.foreDir, A.elbowOut, _v1.subVectors(wrist, _knee), out, _q3));
      S.refresh(A.hand);
      S.setWorld(A.hand, handLQ);
      if (grip < 1) for (const bi of [A.upper, A.fore, A.hand]) S.local[bi]!.slerp(this.fkLocal[bi]!, 1 - grip);
      S.refreshBelow(BONE_INDEX.clavL);
    }
  }

  private swingCapes(dt: number): void {
    // Capes hang their bone chain under the chest; look for new ones cheaply.
    const n = this.chest.children.length;
    if (n !== this.capeScan) {
      this.capeScan = n;
      this.capes = [];
      for (const ch of this.chest.children) {
        if (ch.name !== 'cape0') continue;
        const chain: THREE.Bone[] = [];
        let b: THREE.Object3D | undefined = ch;
        while (b && b.name.startsWith('cape')) {
          chain.push(b as THREE.Bone);
          b = b.children.find((o) => o.name.startsWith('cape'));
        }
        this.capes.push(new CapeSpring(chain));
      }
    }
    if (!this.capes.length) return;
    const S = this.solver;
    const chestQ = S.world[BONE_INDEX.chest]!;
    const up = _v1.set(0, 1, 0).applyQuaternion(chestQ);
    const pitch = Math.atan2(up.z, up.y);
    const roll = Math.atan2(-up.x, up.y);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const fwd = this.vx * sy + this.vz * cy;
    const side = this.vx * cy - this.vz * sy;
    let legBack = 0;
    for (const lg of this.legs) {
      const d = _v2.set(0, -1, 0).applyQuaternion(S.world[lg.shin]!);
      legBack = Math.max(legBack, Math.atan2(-d.z, -d.y));
    }
    for (const cs of this.capes) {
      cs.update(dt, { fwd, side, accel: this.accel, yawRate: this.yawRate, pitch, roll, legBack, vy: this.pelvisVy });
    }
  }
}


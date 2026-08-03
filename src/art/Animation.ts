/**
 * SLAY — procedural character animation.
 *
 * There are no animation files. Every clip is authored in code as a function of
 * normalised time, which for a game with five classes, one shared rig and a
 * hard "no external assets" rule is not a compromise — it is the cheaper and
 * more flexible option. Playback rate is continuous (a walk at 0.7x speed is a
 * genuinely slower walk, not a resampled one), clips cost nothing to ship, and
 * the procedural layers below can reach into any of them.
 *
 * Three things lift this above "sine waves on bones":
 *
 *  1. **Legs are IK, not FK.** Clips author a *foot target* in hip space and a
 *     two-bone solver works backwards to hip and knee angles. Feet plant on the
 *     ground and stay there through the contact phase instead of skating, which
 *     is the single most obvious tell of amateur locomotion.
 *  2. **Secondary motion.** A damped spring lags the chest's rotation and
 *     drives wrist follow-through, so a weapon keeps travelling after the
 *     shoulder has stopped. Breathing runs underneath everything.
 *  3. **An action layer that wins.** Locomotion requests cannot stomp a
 *     one-shot mid-swing, so callers can safely ask for `walk` every frame.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Bone slots
// ---------------------------------------------------------------------------

const SLOT_NAMES = [
  'root',
  'hips',
  'spine',
  'chest',
  'head',
  'shoulderL',
  'shoulderR',
  'elbowL',
  'elbowR',
  'handL',
  'handR',
  'hipL',
  'hipR',
  'kneeL',
  'kneeR',
  'footL',
  'footR',
] as const;

const SLOT: Record<string, number> = {};
SLOT_NAMES.forEach((n, i) => {
  SLOT[n] = i;
});
const NSLOTS = SLOT_NAMES.length;

const LEG_SLOTS = new Set([SLOT.hipL, SLOT.hipR, SLOT.kneeL, SLOT.kneeR, SLOT.footL, SLOT.footR]);

// ---------------------------------------------------------------------------
// Pose buffer
// ---------------------------------------------------------------------------

/**
 * A pose is stored as flat deltas from the rest pose: three euler angles and
 * three position offsets per bone, plus two foot IK targets. Flat buffers keep
 * `update` allocation-free, which matters when a dungeon holds a dozen rigs.
 */
class Pose {
  readonly rot = new Float32Array(NSLOTS * 3);
  readonly pos = new Float32Array(NSLOTS * 3);
  /** [Lx,Ly,Lz,Lpitch, Rx,Ry,Rz,Rpitch] in hips space, relative to foot rest. */
  readonly ik = new Float32Array(8);
  /** 0 = legs run on FK angles, 1 = legs run on the IK targets. */
  ikW = 0;

  reset(): void {
    this.rot.fill(0);
    this.pos.fill(0);
    this.ik.fill(0);
    this.ikW = 0;
  }

  set(name: string, rx: number, ry = 0, rz = 0): void {
    const i = SLOT[name];
    if (i === undefined) return;
    this.rot[i * 3] = rx;
    this.rot[i * 3 + 1] = ry;
    this.rot[i * 3 + 2] = rz;
  }

  add(name: string, rx: number, ry = 0, rz = 0): void {
    const i = SLOT[name];
    if (i === undefined) return;
    this.rot[i * 3] += rx;
    this.rot[i * 3 + 1] += ry;
    this.rot[i * 3 + 2] += rz;
  }

  move(name: string, x: number, y: number, z: number): void {
    const i = SLOT[name];
    if (i === undefined) return;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
  }

  nudge(name: string, x: number, y: number, z: number): void {
    const i = SLOT[name];
    if (i === undefined) return;
    this.pos[i * 3] += x;
    this.pos[i * 3 + 1] += y;
    this.pos[i * 3 + 2] += z;
  }

  /** Foot target as an offset from the rest foot position, in hips space. */
  foot(side: 0 | 1, x: number, y: number, z: number, pitch = 0): void {
    const o = side * 4;
    this.ik[o] = x;
    this.ik[o + 1] = y;
    this.ik[o + 2] = z;
    this.ik[o + 3] = pitch;
    this.ikW = 1;
  }

  static blend(a: Pose, b: Pose, t: number, out: Pose): void {
    for (let i = 0; i < a.rot.length; i++) out.rot[i] = a.rot[i] + (b.rot[i] - a.rot[i]) * t;
    for (let i = 0; i < a.pos.length; i++) out.pos[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * t;
    for (let i = 0; i < a.ik.length; i++) out.ik[i] = a.ik[i] + (b.ik[i] - a.ik[i]) * t;
    out.ikW = a.ikW + (b.ikW - a.ikW) * t;
  }

  copyFrom(src: Pose): void {
    this.rot.set(src.rot);
    this.pos.set(src.pos);
    this.ik.set(src.ik);
    this.ikW = src.ikW;
  }
}

// ---------------------------------------------------------------------------
// Authoring helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * Piecewise smoothstep through keyframes `[time, value]`. This is what makes
 * the one-shot clips readable: an attack is a list of poses and the times it
 * hits them, exactly as an animator would think about it.
 */
function kf(t: number, keys: Array<[number, number]>): number {
  if (keys.length === 0) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b[0]) {
      const s = smooth((t - a[0]) / Math.max(1e-6, b[0] - a[0]));
      return a[1] + (b[1] - a[1]) * s;
    }
  }
  return last[1];
}

/** Sharper than smoothstep on the way out — used for strike accelerations. */
function snap(t: number, power = 3): number {
  return 1 - Math.pow(1 - clamp01(t), power);
}

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Rig metrics
// ---------------------------------------------------------------------------

interface Rig {
  /** Hip height above the root — the scale reference for every amplitude. */
  hipY: number;
  /** Upper and lower leg lengths. */
  l1: number;
  l2: number;
  /** Hip joint offset from the hips bone, per side. */
  hipOff: [THREE.Vector3, THREE.Vector3];
  /** Rest foot position in hips space, per side. */
  footRest: [THREE.Vector3, THREE.Vector3];
  /** Arm segment lengths, for reach-based clips. */
  arm: number;
}

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------

export type ClipName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'attack1'
  | 'attack2'
  | 'cast'
  | 'shoot'
  | 'slam'
  | 'thrust'
  | 'channel'
  | 'point'
  | 'stomp'
  | 'roar'
  | 'hurt'
  | 'death'
  | 'dodge'
  // Gestures that used to borrow a clip that meant something else. An archer
  // laying a snare was playing the two-footed ground stomp; calling arrows down
  // from the sky was the overhead hammer blow.
  | 'plant'
  | 'skyshot'
  | 'snapshot'
  | 'blink'
  | 'hurl'
  | 'lunge';

/**
 * Which carry pose the free hand takes while the body is just moving around.
 *
 * `twoHand` and `staff` bring the left hand onto the haft; `bow` brings the
 * right hand across to the bow the left hand is holding. `none` leaves the
 * arms as the clip authored them, which is what every weapon used to get.
 */
export type CarryGrip = 'none' | 'twoHand' | 'staff' | 'bow';

/**
 * The carry poses, as absolute arm angles.
 *
 * Bones are unrotated in bind pose, so these are plain character-space angles:
 * on a hanging arm, a negative shoulder X swings it forward, and Z swings it
 * across the body — outward for the left arm when positive, for the right arm
 * when negative.
 */
const CARRY: Record<Exclude<CarryGrip, 'none'>, Array<[string, number, number, number]>> = {
  // Both hands on the haft of something held up and across the body.
  twoHand: [
    ['shoulderR', 0.052, 0.335, 0.07],
    ['elbowR', -0.95, 0, 0],
    ['handR', 0, 0, 0],
    ['shoulderL', -0.055, -1.006, 0.033],
    ['elbowL', -1.52, 0, 0],
    ['handL', 0, 0, 0],
  ],
  // A staff stands vertical: top hand near the chest, lower hand down the shaft.
  staff: [
    ['shoulderR', 0.18, -0.002, 0.2],
    ['elbowR', -0.949, 0, 0],
    ['handR', 0, 0, 0],
    ['shoulderL', -0.593, -0.6, -0.844],
    ['elbowL', -1.248, 0, 0],
    ['handL', 0, 0, 0],
  ],
  // The bow rides in the bow hand; the string hand comes across to the riser.
  bow: [
    ['shoulderL', -0.066, -0.335, -0.07],
    ['elbowL', -0.949, 0, 0],
    ['handL', 0, 0, 0],
    ['shoulderR', -0.989, 0.699, 0.694],
    ['elbowR', -0.176, 0, 0],
    ['handR', 0, 0, 0],
  ],
};

interface ClipDef {
  /** Seconds for one full playthrough at speed 1. */
  duration: number;
  loop: boolean;
  /** Locomotion clips yield to any running one-shot. */
  locomotion?: boolean;
  /** How strongly the breathing layer still shows through. */
  breath?: number;
  eval(t: number, p: Pose, rig: Rig, elapsed: number): void;
}

/** Both feet planted at rest, with a little stance width. Used as a base. */
function stance(p: Pose, rig: Rig, spread = 0, crouch = 0): void {
  p.foot(0, spread, -crouch, 0, 0);
  p.foot(1, -spread, -crouch, 0, 0);
}

const CLIPS: Record<ClipName, ClipDef> = {
  // ------------------------------------------------------------------ IDLE --
  idle: {
    duration: 4.2,
    loop: true,
    locomotion: true,
    breath: 1,
    eval(t, p, rig) {
      const a = TAU * t;
      const breath = Math.sin(a);
      const sway = Math.sin(a * 0.5);
      const h = rig.hipY;

      p.set('spine', 0.03 + breath * 0.014, sway * 0.02, sway * 0.012);
      p.set('chest', -0.015 - breath * 0.022, sway * 0.028, -sway * 0.01);
      p.set('head', 0.02 + Math.sin(a + 0.8) * 0.02, Math.sin(a * 0.37) * 0.1, -sway * 0.02);

      // Arms hang with a slight outward flare so they clear the torso, and
      // trail the body's sway by a beat.
      const lag = Math.sin(a - 0.7);
      p.set('shoulderL', 0.04 + lag * 0.035, 0, 0.13);
      p.set('shoulderR', 0.04 + lag * 0.035, 0, -0.13);
      p.set('elbowL', -0.22 - lag * 0.03, 0, 0.06);
      p.set('elbowR', -0.22 - lag * 0.03, 0, -0.06);
      p.set('handL', 0, 0, 0.1);
      p.set('handR', 0, 0, -0.1);

      // Weight shifts from foot to foot; the hips drop a hair on the exhale.
      p.move('hips', sway * h * 0.016, breath * h * 0.008 - h * 0.004, 0);
      p.set('hips', 0, sway * 0.03, sway * 0.02);
      stance(p, rig, h * 0.012, 0);
      // The unweighted foot rolls very slightly.
      p.ik[3] = Math.max(0, sway) * 0.05;
      p.ik[7] = Math.max(0, -sway) * 0.05;
    },
  },

  // ------------------------------------------------------------------ WALK --
  walk: {
    duration: 1.05,
    loop: true,
    locomotion: true,
    breath: 0.4,
    eval(t, p, rig) {
      const h = rig.hipY;
      const stride = h * 0.42;
      const lift = h * 0.17;

      // Contact phase drags the planted foot backwards at a constant rate;
      // swing phase throws it forward on an arc. No sliding, ever.
      const leg = (phase: number, side: 0 | 1): void => {
        const f = phase - Math.floor(phase);
        let z: number;
        let y: number;
        let pitch: number;
        if (f < 0.58) {
          const k = f / 0.58;
          z = stride * (0.5 - k);
          y = 0;
          // Heel strike rolls into toe-off across the contact phase.
          pitch = kf(k, [
            [0, 0.22],
            [0.15, 0],
            [0.8, 0],
            [1, -0.42],
          ]);
        } else {
          const k = (f - 0.58) / 0.42;
          z = stride * (-0.5 + k);
          y = Math.sin(k * Math.PI) * lift;
          pitch = kf(k, [
            [0, -0.42],
            [0.4, 0.1],
            [1, 0.22],
          ]);
        }
        p.foot(side, side === 0 ? h * 0.01 : -h * 0.01, y, z, pitch);
      };
      leg(t, 0);
      leg(t + 0.5, 1);

      const a = TAU * t;
      // The pelvis rises twice per cycle, at each mid-stance.
      p.move('hips', Math.sin(a) * h * 0.02, -h * 0.018 + Math.abs(Math.sin(a)) * h * 0.028, 0);
      p.set('hips', 0.01, Math.sin(a) * 0.13, Math.sin(a) * 0.06);
      p.set('spine', 0.06, -Math.sin(a) * 0.07, 0);
      p.set('chest', 0.01, -Math.sin(a) * 0.12, 0);
      p.set('head', 0.01, Math.sin(a) * 0.05, 0);

      // Arms counter-swing the legs.
      const sw = Math.cos(a);
      p.set('shoulderL', sw * 0.42, 0, 0.11);
      p.set('shoulderR', -sw * 0.42, 0, -0.11);
      p.set('elbowL', -0.3 - Math.max(0, -sw) * 0.35, 0, 0.05);
      p.set('elbowR', -0.3 - Math.max(0, sw) * 0.35, 0, -0.05);
    },
  },

  // ------------------------------------------------------------------- RUN --
  run: {
    duration: 0.66,
    loop: true,
    locomotion: true,
    breath: 0.25,
    eval(t, p, rig) {
      const h = rig.hipY;
      const stride = h * 0.62;
      const lift = h * 0.3;

      const leg = (phase: number, side: 0 | 1): void => {
        const f = phase - Math.floor(phase);
        let z: number;
        let y: number;
        let pitch: number;
        if (f < 0.4) {
          // Short, hard contact.
          const k = f / 0.4;
          z = stride * (0.42 - k * 0.84);
          y = Math.sin(k * Math.PI) * h * 0.02;
          pitch = kf(k, [
            [0, 0.1],
            [0.2, -0.05],
            [1, -0.6],
          ]);
        } else {
          const k = (f - 0.4) / 0.6;
          z = stride * (-0.42 + k * 0.84);
          // Tuck the heel up hard on the recovery — the shape that separates
          // a run from a fast walk.
          y = Math.sin(k * Math.PI) * lift * (1 + 0.35 * Math.sin(k * Math.PI));
          pitch = kf(k, [
            [0, -0.6],
            [0.45, 0.35],
            [1, 0.12],
          ]);
        }
        p.foot(side, side === 0 ? h * 0.015 : -h * 0.015, y, z, pitch);
      };
      leg(t, 0);
      leg(t + 0.5, 1);

      const a = TAU * t;
      // Both feet leave the ground: the whole body launches once per step.
      const air = Math.abs(Math.sin(a));
      p.move('hips', Math.sin(a) * h * 0.024, -h * 0.05 + air * h * 0.075, 0);
      p.set('hips', 0.02, Math.sin(a) * 0.2, Math.sin(a) * 0.08);
      p.set('spine', 0.2, -Math.sin(a) * 0.12, 0);
      p.set('chest', 0.1, -Math.sin(a) * 0.2, 0);
      p.set('head', -0.16, Math.sin(a) * 0.06, 0);

      const sw = Math.cos(a);
      p.set('shoulderL', sw * 0.95 - 0.15, 0, 0.16);
      p.set('shoulderR', -sw * 0.95 - 0.15, 0, -0.16);
      p.set('elbowL', -1.15 - Math.max(0, -sw) * 0.4, 0, 0.08);
      p.set('elbowR', -1.15 - Math.max(0, sw) * 0.4, 0, -0.08);
    },
  },

  // --------------------------------------------------------------- ATTACK1 --
  // Overhead vertical chop, right hand leading.
  attack1: {
    duration: 0.62,
    loop: false,
    breath: 0.1,
    eval(t, p, rig) {
      const h = rig.hipY;
      // Wind up slow, strike fast, recover medium: the classic 3-beat.
      const arm = kf(t, [
        [0, 0.05],
        [0.34, -3.35],
        [0.5, -0.35],
        [0.66, 0.15],
        [1, 0.05],
      ]);
      const twist = kf(t, [
        [0, 0],
        [0.34, 0.62],
        [0.5, -0.5],
        [1, -0.12],
      ]);
      const lean = kf(t, [
        [0, 0.03],
        [0.34, -0.18],
        [0.52, 0.34],
        [1, 0.08],
      ]);

      p.set('hips', 0, twist * 0.4, 0);
      p.move('hips', 0, -h * 0.03 * Math.max(0, lean), 0);
      p.set('spine', lean * 0.55, twist * 0.42, 0);
      p.set('chest', lean * 0.45, twist * 0.6, 0);
      p.set('head', -lean * 0.25, twist * 0.2, 0);

      p.set('shoulderR', arm, twist * 0.25, -0.3 - twist * 0.2);
      p.set('elbowR', kf(t, [
        [0, -0.4],
        [0.34, -1.5],
        [0.52, -0.16],
        [1, -0.35],
      ]));
      p.set('handR', kf(t, [
        [0, 0],
        [0.34, -0.5],
        [0.52, 0.3],
        [1, 0],
      ]));
      p.set('shoulderL', kf(t, [
        [0, 0.05],
        [0.34, -0.55],
        [0.55, 0.5],
        [1, 0.05],
      ]), 0, 0.25);
      p.set('elbowL', -0.7, 0, 0.1);

      // Step into the swing: the front foot slides forward on the strike.
      const step = kf(t, [
        [0, 0],
        [0.34, -0.1],
        [0.55, 0.35],
        [1, 0.2],
      ]);
      p.foot(0, h * 0.03, 0, h * step * 0.5, 0.1);
      p.foot(1, -h * 0.05, 0, -h * 0.18 - h * step * 0.1, -0.15);
    },
  },

  // --------------------------------------------------------------- ATTACK2 --
  // Horizontal sweep across the body — reads completely differently from the
  // chop at a glance, which is the entire point of having two.
  attack2: {
    duration: 0.58,
    loop: false,
    breath: 0.1,
    eval(t, p, rig) {
      const h = rig.hipY;
      const sweep = kf(t, [
        [0, 0],
        [0.3, 1.05],
        [0.48, -1.15],
        [1, -0.25],
      ]);
      const rise = kf(t, [
        [0, 0.05],
        [0.3, -1.15],
        [0.5, -1.0],
        [1, 0.05],
      ]);

      p.set('hips', 0, sweep * 0.42, 0);
      p.set('spine', 0.05, sweep * 0.5, sweep * 0.08);
      p.set('chest', 0.02, sweep * 0.62, sweep * 0.12);
      p.set('head', 0, -sweep * 0.15, 0);

      p.set('shoulderR', rise, sweep * 0.35, -0.55 + sweep * 0.15);
      p.set('elbowR', kf(t, [
        [0, -0.5],
        [0.3, -1.25],
        [0.5, -0.3],
        [1, -0.5],
      ]));
      p.set('handR', 0, sweep * 0.3, 0);
      p.set('shoulderL', -0.25, 0, 0.4);
      p.set('elbowL', -1.1, 0, 0.2);

      const pivot = kf(t, [
        [0, 0],
        [0.3, 0.12],
        [0.5, -0.28],
        [1, -0.1],
      ]);
      p.foot(0, h * 0.05, 0, h * pivot, 0.05);
      p.foot(1, -h * 0.05, 0, -h * pivot * 0.6, -0.05);
      p.move('hips', 0, -h * 0.02, 0);
    },
  },

  // ------------------------------------------------------------------ CAST --
  /**
   * Drawing and loosing a bow.
   *
   * Casting was standing in for this, and a two-handed overhead spell gesture
   * while holding a bow is the single most wrong thing an archer can do. The
   * shape that reads is: front arm locked out holding the bow, rear hand pulled
   * back to the cheek, a beat of stillness at full draw, then a snap forward on
   * release with the string hand flicking past the ear.
   */
  shoot: {
    duration: 0.5,
    loop: false,
    breath: 0.15,
    eval(t, p, rig) {
      const h = rig.hipY;
      // Draw builds, holds briefly at full, then goes in one frame on release.
      const draw = kf(t, [
        [0, 0],
        [0.46, 1],
        [0.6, 1],
        [0.68, 0],
        [1, 0],
      ]);
      const loose = kf(t, [
        [0, 0],
        [0.62, 0],
        [0.72, 1],
        [1, 0.25],
      ]);

      // Side-on stance: the bow shoulder leads, the body turns out of square.
      p.set('hips', 0, -0.34, 0);
      p.set('spine', -0.04, -0.2, 0);
      p.set('chest', -0.06 - 0.05 * draw, -0.26 - 0.1 * draw, 0);
      p.set('head', 0, 0.34, 0);
      p.move('hips', 0, -h * 0.012 * draw, 0);

      // Bow arm: out straight and level, and it stays there through the loose.
      // A bow arm that moves is a missed shot.
      p.set('shoulderL', -1.5, 0.42, 0.12);
      p.set('elbowL', -0.1, 0, 0);

      // String hand: back to the cheek, then released past the ear.
      p.set('shoulderR', -1.15 - 0.35 * draw + 0.15 * loose, -0.5 - 0.45 * draw + 0.7 * loose, -0.1);
      p.set('elbowR', -0.6 - 1.5 * draw + 0.4 * loose, 0, 0);

      // Weight settles onto the back foot as the draw builds.
      p.foot(0, 0.12, -0.06 * draw, 0.1, 0);
      p.foot(1, -0.14, -0.1 * draw, -0.12, 0);
    },
  },


  /**
   * Overhead two-handed smash. Wind up tall, then drive down through the
   * target with the whole body behind it.
   */
  slam: {
    duration: 0.72,
    loop: false,
    breath: 0.08,
    eval(t, p, rig) {
      const h = rig.hipY;
      const wind = kf(t, [[0, 0], [0.34, 1], [0.44, 1], [0.56, 0], [1, 0]]);
      const drop = kf(t, [[0, 0], [0.46, 0], [0.58, 1], [0.72, 0.9], [1, 0.2]]);

      p.set('spine', -0.34 * wind + 0.5 * drop, 0, 0);
      p.set('chest', -0.4 * wind + 0.62 * drop, 0, 0);
      p.set('head', -0.36 * wind + 0.34 * drop, 0, 0);
      p.move('hips', 0, h * 0.05 * wind - h * 0.09 * drop, 0);

      // Both arms travel together — this is a two-handed blow.
      const arm = -2.5 * wind + 1.1 * drop;
      p.set('shoulderL', arm, 0.18, 0.34 - 0.2 * drop);
      p.set('shoulderR', arm, -0.18, -0.34 + 0.2 * drop);
      p.set('elbowL', -0.5 - 0.7 * wind + 0.6 * drop, 0, 0);
      p.set('elbowR', -0.5 - 0.7 * wind + 0.6 * drop, 0, 0);

      p.foot(0, 0.16, -0.18 * drop, 0.22 * drop, 0);
      p.foot(1, -0.16, -0.1 * drop, -0.1, 0);
    },
  },

  /** A lunging stab: back foot drives, the weapon arm extends straight out. */
  thrust: {
    duration: 0.46,
    loop: false,
    breath: 0.1,
    eval(t, p, rig) {
      const h = rig.hipY;
      const coil = kf(t, [[0, 0], [0.3, 1], [0.42, 0.7], [1, 0]]);
      const stab = kf(t, [[0, 0], [0.36, 0], [0.5, 1], [0.72, 0.85], [1, 0.1]]);

      p.set('hips', 0, -0.3 * coil + 0.34 * stab, 0);
      p.set('spine', 0.06 * stab, -0.22 * coil + 0.28 * stab, 0);
      p.set('chest', 0.04, -0.3 * coil + 0.4 * stab, 0);
      p.set('head', 0, 0.16 * coil - 0.1 * stab, 0);
      p.move('hips', 0, -h * 0.05 * stab, 0);

      p.set('shoulderR', -0.5 - 0.55 * coil - 0.75 * stab, -0.4 + 0.5 * stab, -0.3);
      p.set('elbowR', -1.5 * coil + 1.45 * stab, 0, 0);
      p.set('shoulderL', -0.2, 0.4, 0.5);
      p.set('elbowL', -1.0, 0, 0.2);

      p.foot(0, 0.14, -0.22 * stab, 0.5 * stab, 0);
      p.foot(1, -0.18, 0, -0.3 * stab, 0);
    },
  },

  /** Sustained two-handed output: arms forward, braced, holding the line. */
  channel: {
    duration: 0.9,
    loop: true,
    breath: 0.3,
    eval(t, p, rig) {
      const h = rig.hipY;
      const push = kf(t, [[0, 0.85], [0.5, 1], [1, 0.85]]);
      const tremor = Math.sin(t * Math.PI * 8) * 0.02;

      p.set('spine', 0.12 * push, 0, 0);
      p.set('chest', 0.16 * push, 0, 0);
      p.set('head', -0.06, 0, 0);
      p.move('hips', 0, -h * 0.02 * push, 0);

      p.set('shoulderL', -1.5 * push + tremor, 0.22, 0.3);
      p.set('shoulderR', -1.5 * push + tremor, -0.22, -0.3);
      p.set('elbowL', -0.28 + tremor, 0, 0.1);
      p.set('elbowR', -0.28 - tremor, 0, -0.1);

      p.foot(0, 0.18, -0.1, 0.12, 0);
      p.foot(1, -0.18, -0.14, -0.16, 0);
    },
  },

  /** One arm snapped out, finger first: commands, curses, marks, summons. */
  point: {
    duration: 0.54,
    loop: false,
    breath: 0.15,
    eval(t, p, rig) {
      const h = rig.hipY;
      const draw = kf(t, [[0, 0], [0.32, 1], [0.44, 1], [1, 0]]);
      const snap = kf(t, [[0, 0], [0.4, 0], [0.52, 1], [0.78, 0.9], [1, 0.3]]);

      p.set('spine', -0.14 * draw + 0.18 * snap, -0.1 * draw + 0.14 * snap, 0);
      p.set('chest', -0.18 * draw + 0.24 * snap, -0.16 * draw + 0.22 * snap, 0);
      p.set('head', -0.1 * draw + 0.12 * snap, 0.1 * snap, 0);
      p.move('hips', 0, -h * 0.014 * snap, 0);

      // Pointing arm out level; the other stays tucked, which is what makes
      // the gesture read as deliberate rather than as a flail.
      p.set('shoulderR', -0.4 - 0.5 * draw - 0.8 * snap, -0.2 + 0.35 * snap, -0.3);
      p.set('elbowR', -1.3 * draw + 1.3 * snap, 0, 0);
      p.set('shoulderL', -0.3 - 0.35 * draw, 0.3, 0.55);
      p.set('elbowL', -1.35, 0, 0.25);

      p.foot(0, 0.14, -0.05 * snap, 0.1 * snap, 0);
      p.foot(1, -0.16, -0.04, -0.06, 0);
    },
  },

  /**
   * Drop to a knee and set something on the floor — traps, banners, wards.
   *
   * Traps used to play `stomp`, so laying a tripwire looked like an earthquake.
   * This is the opposite shape: down, careful, one hand to the ground.
   */
  plant: {
    duration: 0.62,
    loop: false,
    breath: 0.08,
    eval(t, p, rig) {
      const h = rig.hipY;
      const kneel = kf(t, [[0, 0], [0.34, 1], [0.62, 1], [1, 0]]);
      const set = kf(t, [[0, 0], [0.38, 0], [0.5, 1], [0.66, 1], [1, 0]]);

      p.move('hips', 0, -h * 0.3 * kneel, 0);
      p.set('hips', 0.24 * kneel, -0.18 * kneel, 0);
      p.set('spine', 0.3 * kneel, -0.12 * kneel, 0);
      p.set('chest', 0.26 * kneel, -0.16 * kneel, 0);
      p.set('head', 0.16 * kneel - 0.1 * set, -0.1 * kneel, 0);

      // Working hand reaches the ground; the other braces on the knee.
      p.set('shoulderR', -0.3 - 1.15 * kneel - 0.25 * set, -0.28 * kneel, -0.2);
      p.set('elbowR', -0.55 - 0.4 * kneel + 0.5 * set, 0, 0);
      p.set('shoulderL', -0.5 - 0.5 * kneel, 0.34, 0.4);
      p.set('elbowL', -1.15, 0, 0.2);

      // Front knee down, back leg trailing.
      p.foot(0, 0.2, -0.72 * kneel, 0.34 * kneel, 0);
      p.foot(1, -0.18, -0.2 * kneel, -0.46 * kneel, 0);
    },
  },

  /**
   * Draw and loose high, at something above you — arrow rain, volleys called
   * down on a distant point. Previously the two-handed overhead `slam`, which
   * is an archer hitting the ground to make arrows fall out of the sky.
   */
  skyshot: {
    duration: 0.66,
    loop: false,
    breath: 0.12,
    eval(t, p, rig) {
      const h = rig.hipY;
      const draw = kf(t, [[0, 0], [0.46, 1], [0.62, 1], [0.72, 0], [1, 0]]);
      const loose = kf(t, [[0, 0], [0.66, 0], [0.76, 1], [1, 0.3]]);

      // Lean back and open the chest to the sky.
      p.set('hips', -0.16 * draw, -0.3, 0);
      p.set('spine', -0.26 * draw, -0.18, 0);
      p.set('chest', -0.34 * draw + 0.12 * loose, -0.24, 0);
      p.set('head', -0.42 * draw + 0.2 * loose, 0.3, 0);
      p.move('hips', 0, -h * 0.02 * draw, 0);

      // Bow arm angled up rather than level.
      p.set('shoulderL', -2.1 - 0.2 * draw, 0.4, 0.16);
      p.set('elbowL', -0.12, 0, 0);
      p.set('shoulderR', -1.5 - 0.4 * draw + 0.2 * loose, -0.45 - 0.4 * draw + 0.6 * loose, -0.1);
      p.set('elbowR', -0.7 - 1.4 * draw + 0.5 * loose, 0, 0);

      p.foot(0, 0.14, -0.08 * draw, 0.14, 0);
      p.foot(1, -0.16, -0.14 * draw, -0.16, 0);
    },
  },

  /**
   * A snap shot from a half draw. Same weapon as `shoot`, half the wind-up, so
   * a class with eleven bow skills does not play one identical gesture for all
   * of them.
   */
  snapshot: {
    duration: 0.3,
    loop: false,
    breath: 0.12,
    eval(t, p, rig) {
      const h = rig.hipY;
      const draw = kf(t, [[0, 0], [0.34, 1], [0.44, 1], [0.54, 0], [1, 0]]);
      const loose = kf(t, [[0, 0], [0.48, 0], [0.6, 1], [1, 0.2]]);

      p.set('hips', 0, -0.28, 0);
      p.set('spine', -0.02, -0.16, 0);
      p.set('chest', -0.04 - 0.06 * draw, -0.22 - 0.06 * draw, 0);
      p.set('head', 0, 0.3, 0);
      p.move('hips', 0, -h * 0.008 * draw, 0);

      // Bow held lower and closer in — a shot taken without setting up.
      p.set('shoulderL', -1.24, 0.36, 0.14);
      p.set('elbowL', -0.3, 0, 0);
      p.set('shoulderR', -1.0 - 0.28 * draw + 0.16 * loose, -0.42 - 0.34 * draw + 0.6 * loose, -0.1);
      p.set('elbowR', -0.75 - 1.15 * draw + 0.45 * loose, 0, 0);

      p.foot(0, 0.12, 0, 0.08, 0);
      p.foot(1, -0.12, -0.05 * draw, -0.1, 0);
    },
  },

  /**
   * Collapse inward and snap back out — teleports, shadow steps, vanishes.
   * These all played `cast`, which is a two-handed conjuring gesture and reads
   * as nothing at all like disappearing.
   */
  blink: {
    duration: 0.34,
    loop: false,
    breath: 0,
    eval(t, p, rig) {
      const h = rig.hipY;
      const fold = kf(t, [[0, 0], [0.4, 1], [0.52, 1], [1, 0]]);
      const snap = kf(t, [[0, 0], [0.54, 0], [0.66, 1], [1, 0.15]]);

      p.move('hips', 0, -h * 0.16 * fold + h * 0.04 * snap, 0);
      p.set('hips', 0.34 * fold - 0.1 * snap, 0.5 * fold - 0.7 * snap, 0);
      p.set('spine', 0.4 * fold - 0.24 * snap, 0.4 * fold - 0.6 * snap, 0);
      p.set('chest', 0.36 * fold - 0.3 * snap, 0.36 * fold - 0.55 * snap, 0);
      p.set('head', 0.2 * fold - 0.24 * snap, 0.3 * fold - 0.4 * snap, 0);

      // Arms cross the body on the fold, then fling wide as it releases.
      p.set('shoulderL', -1.5 * fold - 0.2 * snap, 0.9 * fold, 0.7 - 0.5 * snap);
      p.set('shoulderR', -1.5 * fold - 0.2 * snap, -0.9 * fold, -0.7 + 0.5 * snap);
      p.set('elbowL', -1.7 * fold + 0.9 * snap, 0, 0.3);
      p.set('elbowR', -1.7 * fold + 0.9 * snap, 0, -0.3);

      p.foot(0, 0.1, -0.4 * fold, 0.12 * snap, 0);
      p.foot(1, -0.1, -0.4 * fold, -0.12 * snap, 0);
    },
  },

  /**
   * An overhand throw: vials, bombs, anything lobbed at the floor. Distinct
   * from `point`, which commands, and from `cast`, which conjures.
   */
  hurl: {
    duration: 0.5,
    loop: false,
    breath: 0.1,
    eval(t, p, rig) {
      const h = rig.hipY;
      const cock = kf(t, [[0, 0], [0.32, 1], [0.42, 1], [0.54, 0], [1, 0]]);
      const sling = kf(t, [[0, 0], [0.44, 0], [0.58, 1], [0.78, 0.8], [1, 0.15]]);

      p.set('hips', 0, 0.34 * cock - 0.42 * sling, 0);
      p.set('spine', -0.2 * cock + 0.3 * sling, 0.3 * cock - 0.44 * sling, 0);
      p.set('chest', -0.26 * cock + 0.4 * sling, 0.34 * cock - 0.5 * sling, 0);
      p.set('head', -0.1 * cock + 0.16 * sling, 0.2 * cock - 0.3 * sling, 0);
      p.move('hips', 0, h * 0.02 * cock - h * 0.03 * sling, 0);

      // Throwing arm goes back past the ear, then whips through and across.
      p.set('shoulderR', -2.2 * cock + 1.4 * sling, -0.4 * cock + 0.5 * sling, -0.3);
      p.set('elbowR', -1.9 * cock + 1.7 * sling, 0, 0);
      p.set('shoulderL', -0.6 - 0.5 * sling, 0.5, 0.5);
      p.set('elbowL', -0.9, 0, 0.2);

      p.foot(0, 0.16, -0.1 * sling, 0.3 * sling, 0);
      p.foot(1, -0.16, -0.16 * cock, -0.24 * cock, 0);
    },
  },

  /**
   * A long step-through stab. Shares intent with `thrust` but travels: the
   * front foot lands well ahead and the whole body follows the point, so a
   * class with five strike skills is not playing the same jab five times.
   */
  lunge: {
    duration: 0.52,
    loop: false,
    breath: 0.08,
    eval(t, p, rig) {
      const h = rig.hipY;
      const load = kf(t, [[0, 0], [0.26, 1], [0.38, 0.8], [1, 0]]);
      const drive = kf(t, [[0, 0], [0.32, 0], [0.52, 1], [0.74, 0.9], [1, 0.15]]);

      // Drop and drive forward rather than staying tall.
      p.move('hips', 0, -h * 0.08 * load - h * 0.18 * drive, 0);
      p.set('hips', 0.1 * drive, -0.36 - 0.2 * drive, 0);
      p.set('spine', 0.16 * drive, -0.26 + 0.2 * drive, 0);
      p.set('chest', 0.2 * drive, -0.34 + 0.3 * drive, 0);
      p.set('head', -0.08 * load + 0.12 * drive, 0.24, 0);

      p.set('shoulderR', -0.45 - 0.4 * load - 0.95 * drive, -0.45 + 0.55 * drive, -0.28);
      p.set('elbowR', -1.35 * load + 1.5 * drive, 0, 0);
      p.set('shoulderL', -0.25 - 0.2 * load, 0.45 + 0.2 * drive, 0.55);
      p.set('elbowL', -1.05, 0, 0.22);

      // Deep front lunge, back leg extended straight behind.
      p.foot(0, 0.14, -0.34 * drive, 0.95 * drive, 0);
      p.foot(1, -0.18, 0.06 * drive, -0.7 * drive, 0);
    },
  },

  /** Rise and drive both feet down — ground novas, quakes, shockwaves. */
  stomp: {
    duration: 0.66,
    loop: false,
    breath: 0.05,
    eval(t, p, rig) {
      const h = rig.hipY;
      const lift = kf(t, [[0, 0], [0.34, 1], [0.46, 0.9], [0.58, 0], [1, 0]]);
      const land = kf(t, [[0, 0], [0.5, 0], [0.6, 1], [0.76, 0.55], [1, 0.1]]);

      p.move('hips', 0, h * 0.14 * lift - h * 0.16 * land, 0);
      p.set('spine', -0.2 * lift + 0.4 * land, 0, 0);
      p.set('chest', -0.26 * lift + 0.5 * land, 0, 0);
      p.set('head', -0.2 * lift + 0.3 * land, 0, 0);

      p.set('shoulderL', -1.9 * lift + 0.9 * land, 0.4, 0.7 - 0.4 * land);
      p.set('shoulderR', -1.9 * lift + 0.9 * land, -0.4, -0.7 + 0.4 * land);
      p.set('elbowL', -0.9 * lift + 0.7 * land, 0, 0.2);
      p.set('elbowR', -0.9 * lift + 0.7 * land, 0, -0.2);

      // Knees tuck on the rise and splay wide on the landing.
      p.foot(0, 0.1 + 0.22 * land, -0.42 * lift - 0.3 * land, 0, 0);
      p.foot(1, -0.1 - 0.22 * land, -0.42 * lift - 0.3 * land, 0, 0);
    },
  },

  /** Head back, chest open, arms flung wide — shouts, banners, war cries. */
  roar: {
    duration: 0.8,
    loop: false,
    breath: 0.2,
    eval(t, p, rig) {
      const h = rig.hipY;
      const gather = kf(t, [[0, 0], [0.26, 1], [0.36, 1], [0.5, 0], [1, 0]]);
      const bellow = kf(t, [[0, 0], [0.4, 0], [0.52, 1], [0.8, 0.8], [1, 0.2]]);

      p.set('spine', 0.24 * gather - 0.3 * bellow, 0, 0);
      p.set('chest', 0.3 * gather - 0.42 * bellow, 0, 0);
      p.set('head', 0.3 * gather - 0.55 * bellow, 0, 0);
      p.move('hips', 0, -h * 0.03 * gather + h * 0.02 * bellow, 0);

      p.set('shoulderL', -0.3 - 0.5 * gather - 0.7 * bellow, 0.3 + 0.5 * bellow, 0.5 + 0.7 * bellow);
      p.set('shoulderR', -0.3 - 0.5 * gather - 0.7 * bellow, -0.3 - 0.5 * bellow, -0.5 - 0.7 * bellow);
      p.set('elbowL', -1.4 * gather + 1.0 * bellow, 0, 0.3);
      p.set('elbowR', -1.4 * gather + 1.0 * bellow, 0, -0.3);

      p.foot(0, 0.2 + 0.1 * bellow, -0.12 * bellow, 0, 0);
      p.foot(1, -0.2 - 0.1 * bellow, -0.12 * bellow, 0, 0);
    },
  },

  cast: {
    duration: 0.85,
    loop: false,
    breath: 0.2,
    eval(t, p, rig) {
      const h = rig.hipY;
      const gather = kf(t, [
        [0, 0],
        [0.42, 1],
        [0.58, 1],
        [1, 0],
      ]);
      const release = kf(t, [
        [0, 0],
        [0.5, 0],
        [0.66, 1],
        [1, 0.35],
      ]);

      // Draw power inward, then push it out. The arch of the back is what
      // sells effort.
      p.set('spine', -0.18 * gather + 0.22 * release, 0, 0);
      p.set('chest', -0.22 * gather + 0.3 * release, 0, 0);
      p.set('head', -0.3 * gather + 0.25 * release, 0, 0);
      p.move('hips', 0, -h * 0.02 * gather, 0);

      const armUp = -1.5 * gather - 0.55 * release;
      p.set('shoulderL', armUp, 0.25 * gather, 0.55 - 0.3 * release);
      p.set('shoulderR', armUp, -0.25 * gather, -0.55 + 0.3 * release);
      p.set('elbowL', -1.5 * gather + 1.15 * release, 0, 0.2);
      p.set('elbowR', -1.5 * gather + 1.15 * release, 0, -0.2);
      p.set('handL', 0.4 * gather - 0.5 * release, 0, 0.3);
      p.set('handR', 0.4 * gather - 0.5 * release, 0, -0.3);

      stance(p, rig, h * 0.05, h * 0.03 * gather);
      p.ik[2] = h * 0.12;
      p.ik[6] = -h * 0.1;
    },
  },

  // ------------------------------------------------------------------ HURT --
  hurt: {
    duration: 0.4,
    loop: false,
    breath: 0,
    eval(t, p, rig) {
      const h = rig.hipY;
      const hit = kf(t, [
        [0, 0],
        [0.12, 1],
        [0.45, 0.45],
        [1, 0],
      ]);
      p.set('spine', -0.42 * hit, 0.12 * hit, 0.1 * hit);
      p.set('chest', -0.32 * hit, 0.2 * hit, 0.14 * hit);
      p.set('head', -0.45 * hit, 0.2 * hit, 0);
      p.move('hips', -h * 0.02 * hit, -h * 0.05 * hit, -h * 0.06 * hit);
      p.set('shoulderL', -0.7 * hit, 0, 0.55 * hit + 0.1);
      p.set('shoulderR', -0.7 * hit, 0, -0.55 * hit - 0.1);
      p.set('elbowL', -1.0 * hit - 0.2, 0, 0.2);
      p.set('elbowR', -1.0 * hit - 0.2, 0, -0.2);
      // Stagger a step back.
      p.foot(0, h * 0.02, 0, -h * 0.1 * hit, 0.1 * hit);
      p.foot(1, -h * 0.04, Math.sin(clamp01(t * 3) * Math.PI) * h * 0.06, -h * 0.3 * hit, -0.2 * hit);
    },
  },

  // ----------------------------------------------------------------- DEATH --
  death: {
    duration: 1.35,
    loop: false,
    breath: 0,
    eval(t, p, rig) {
      const h = rig.hipY;
      // Knees go first, then the torso follows and the body settles.
      const buckle = kf(t, [
        [0, 0],
        [0.28, 1],
        [1, 1],
      ]);
      const fall = kf(t, [
        [0, 0],
        [0.3, 0.1],
        [0.72, 1],
        [1, 1],
      ]);
      const settle = kf(t, [
        [0.7, 0],
        [0.85, 1],
        [1, 0.7],
      ]);

      p.move('hips', h * 0.05 * fall, -h * (0.42 * buckle + 0.52 * fall), -h * 0.35 * fall);
      p.set('hips', -1.15 * fall + 0.2 * buckle, 0.25 * fall, 0.3 * fall);
      p.set('spine', 0.3 * buckle - 0.5 * fall + 0.1 * settle, -0.2 * fall, -0.25 * fall);
      p.set('chest', 0.2 * buckle - 0.35 * fall, -0.3 * fall, -0.2 * fall);
      p.set('head', 0.4 * buckle - 0.9 * fall + 0.2 * settle, 0.35 * fall, 0);

      p.set('shoulderL', -0.4 * buckle + 1.1 * fall, 0.3 * fall, 0.9 * fall + 0.15);
      p.set('shoulderR', -0.4 * buckle + 0.8 * fall, -0.2 * fall, -1.1 * fall - 0.15);
      p.set('elbowL', -0.9 - 0.5 * fall, 0, 0.3);
      p.set('elbowR', -0.6 - 0.3 * fall, 0, -0.3);

      // Legs fold under, one further than the other — symmetry reads as a
      // ragdoll bug, asymmetry reads as a body.
      p.foot(0, h * 0.06 * fall, h * 0.06 * fall, -h * (0.22 * buckle + 0.1 * fall), -0.5 * fall);
      p.foot(1, -h * 0.14 * fall, h * 0.02 * fall, -h * (0.3 * buckle + 0.34 * fall), -0.9 * fall);
    },
  },

  // ----------------------------------------------------------------- DODGE --
  dodge: {
    duration: 0.36,
    loop: false,
    breath: 0,
    eval(t, p, rig) {
      const h = rig.hipY;
      const tuck = kf(t, [
        [0, 0],
        [0.22, 1],
        [0.68, 0.85],
        [1, 0],
      ]);
      const push = kf(t, [
        [0, 0],
        [0.15, 1],
        [0.6, 0.2],
        [1, 0],
      ]);
      p.move('hips', 0, -h * 0.3 * tuck, h * 0.06 * push);
      p.set('hips', 0.45 * tuck, 0, 0);
      p.set('spine', 0.5 * tuck, 0.1 * tuck, 0);
      p.set('chest', 0.42 * tuck, 0.16 * tuck, 0);
      p.set('head', -0.25 * tuck, 0, 0);
      p.set('shoulderL', -0.5 * tuck, 0, 0.5 * tuck + 0.12);
      p.set('shoulderR', -0.5 * tuck, 0, -0.5 * tuck - 0.12);
      p.set('elbowL', -1.5 * tuck - 0.2, 0, 0.2);
      p.set('elbowR', -1.5 * tuck - 0.2, 0, -0.2);
      // Explode off the back foot, land on the front.
      p.foot(0, h * 0.04, h * 0.12 * push, h * 0.22 * push, 0.3 * push);
      p.foot(1, -h * 0.04, h * 0.05 * push, -h * 0.3 * push, -0.5 * push);
    },
  },
};

/** Maps arbitrary caller strings onto a real clip. */
function resolveClip(name: string): ClipName {
  if (name in CLIPS) return name as ClipName;
  const n = name.toLowerCase();
  if (n.includes('cast') || n.includes('spell') || n.includes('summon')) return 'cast';
  if (n.includes('dodge') || n.includes('roll') || n.includes('dash')) return 'dodge';
  if (n.includes('hurt') || n.includes('hit') || n.includes('stagger')) return 'hurt';
  if (n.includes('death') || n.includes('die')) return 'death';
  if (n.includes('run') || n.includes('sprint')) return 'run';
  if (n.includes('walk')) return 'walk';
  if (n.includes('idle')) return 'idle';
  if (n.includes('shoot') || n.includes('bow') || n.includes('fire')) return 'shoot';
  if (n.includes('slam') || n.includes('smash') || n.includes('crush')) return 'slam';
  if (n.includes('thrust') || n.includes('stab') || n.includes('pierce')) return 'thrust';
  if (n.includes('channel') || n.includes('beam') || n.includes('stream')) return 'channel';
  if (n.includes('point') || n.includes('summon') || n.includes('curse') || n.includes('mark')) return 'point';
  if (n.includes('stomp') || n.includes('nova') || n.includes('quake')) return 'stomp';
  if (n.includes('roar') || n.includes('shout') || n.includes('cry')) return 'roar';
  if (n.includes('2') || n.includes('sweep') || n.includes('slash')) return 'attack2';
  return 'attack1';
}

export interface PlayOpts {
  /** Crossfade in seconds. */
  fade?: number;
  /** Playback rate multiplier. */
  speed?: number;
  /** Force a one-shot even if the clip normally loops. */
  once?: boolean;
  /** Freeze on the final frame instead of falling back to idle. */
  hold?: boolean;
  /** Restart even if this clip is already playing. */
  restart?: boolean;
  /** Fired when a one-shot finishes. */
  onEnd?: () => void;
}

interface Track {
  name: ClipName;
  def: ClipDef;
  time: number;
  speed: number;
  once: boolean;
  hold: boolean;
  done: boolean;
  onEnd?: () => void;
}

// ---------------------------------------------------------------------------
// Animator
// ---------------------------------------------------------------------------

const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _qAim = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _vec = new THREE.Vector3();
const _target = new THREE.Vector3();
const _AXIS_X = new THREE.Vector3(1, 0, 0);
const _DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Drives a rig built by `CharacterModels.buildPlayerModel`. Missing bones are
 * tolerated, so the same animator can drive a partial rig (a boss with no legs,
 * a floating caster) without special-casing.
 */
export class Animator {
  private bones: Array<THREE.Bone | null> = [];
  private restPos: THREE.Vector3[] = [];
  private restQuat: THREE.Quaternion[] = [];
  private rig: Rig;

  private poseA = new Pose();
  private poseB = new Pose();
  private poseOut = new Pose();

  private cur: Track;
  private prev: Track | null = null;
  private fadeTime = 0;
  private fadeDur = 0;

  /** Damped spring that lags the chest, for weapon follow-through. */
  private lagY = 0;
  private lagVel = 0;
  private elapsed = 0;

  /** Global playback multiplier — hit-stop, slow motion, haste. */
  timeScale = 1;
  /** Extra forward lean applied by the caller when accelerating. */
  leanBias = 0;

  /**
   * How the carried weapon is held while walking, running or standing.
   *
   * Applied only over locomotion clips: the attack and cast clips already pose
   * both arms on purpose, and a carry pose laid over a bow shot or an overhead
   * smash would fight the animation that makes the move readable.
   */
  private grip: CarryGrip = 'none';
  /** Eases in and out so equipping a greatsword is not a one-frame snap. */
  private gripW = 0;

  setGrip(grip: CarryGrip): void {
    this.grip = grip;
  }

  constructor(bones: Record<string, THREE.Bone>) {
    for (const name of SLOT_NAMES) {
      const b = bones[name] ?? null;
      this.bones.push(b);
      this.restPos.push(b ? b.position.clone() : new THREE.Vector3());
      this.restQuat.push(b ? b.quaternion.clone() : new THREE.Quaternion());
    }

    const hips = bones.hips;
    const hipL = bones.hipL;
    const hipR = bones.hipR;
    const kneeL = bones.kneeL;
    const footL = bones.footL;
    const hipY = hips ? hips.position.y : 0.95;
    const l1 = kneeL ? kneeL.position.length() : hipY * 0.45;
    const l2 = footL ? footL.position.length() : hipY * 0.45;
    const offL = hipL ? hipL.position.clone() : new THREE.Vector3(hipY * 0.11, -0.03, 0);
    const offR = hipR ? hipR.position.clone() : new THREE.Vector3(-hipY * 0.11, -0.03, 0);
    this.rig = {
      hipY,
      l1,
      l2,
      hipOff: [offL, offR],
      footRest: [
        offL.clone().add(new THREE.Vector3(0, -(l1 + l2), 0)),
        offR.clone().add(new THREE.Vector3(0, -(l1 + l2), 0)),
      ],
      arm: bones.elbowL ? bones.elbowL.position.length() * 2 : hipY * 0.6,
    };

    this.cur = {
      name: 'idle',
      def: CLIPS.idle,
      time: 0,
      speed: 1,
      once: false,
      hold: false,
      done: false,
    };
  }

  get clip(): string {
    return this.cur.name;
  }

  isPlaying(name: string): boolean {
    return this.cur.name === resolveClip(name) && !this.cur.done;
  }

  /** True while a non-looping clip owns the body. */
  get inAction(): boolean {
    return !this.cur.def.loop && !this.cur.done;
  }

  /**
   * Request a clip. Safe to call every frame: asking for the clip that is
   * already playing only updates its rate, and locomotion clips politely lose
   * to a one-shot that is still running.
   */
  play(name: string, opts: PlayOpts = {}): void {
    const resolved = resolveClip(name);
    const def = CLIPS[resolved];

    // An action in flight beats any locomotion request.
    if (def.locomotion && this.inAction) return;

    if (this.cur.name === resolved && !opts.restart) {
      if (opts.speed !== undefined) this.cur.speed = opts.speed;
      if (opts.onEnd) this.cur.onEnd = opts.onEnd;
      // Re-triggering a finished one-shot restarts it.
      if (!this.cur.done) return;
      if (def.loop) return;
    }

    const fade = Math.max(0, opts.fade ?? 0.12);
    if (fade > 0) {
      this.prev = this.cur;
      this.fadeDur = fade;
      this.fadeTime = 0;
    } else {
      this.prev = null;
      this.fadeDur = 0;
      this.fadeTime = 0;
    }

    this.cur = {
      name: resolved,
      def,
      time: 0,
      speed: opts.speed ?? 1,
      once: opts.once ?? !def.loop,
      hold: opts.hold ?? false,
      done: false,
      onEnd: opts.onEnd,
    };
  }

  /** Called by movement code so the torso leans into acceleration. */
  setLean(bias: number): void {
    this.leanBias = bias;
  }

  update(dt: number): void {
    const step = Math.max(0, Math.min(0.1, dt)) * this.timeScale;
    this.elapsed += step;

    this.advance(this.cur, step);
    if (this.prev) {
      this.advance(this.prev, step);
      this.fadeTime += step;
      if (this.fadeTime >= this.fadeDur) this.prev = null;
    }

    // Evaluate the active clip.
    this.poseA.reset();
    this.evaluate(this.cur, this.poseA);

    let pose = this.poseA;
    if (this.prev) {
      this.poseB.reset();
      this.evaluate(this.prev, this.poseB);
      const w = smooth(clamp01(this.fadeTime / Math.max(1e-5, this.fadeDur)));
      Pose.blend(this.poseB, this.poseA, w, this.poseOut);
      pose = this.poseOut;
    }

    this.applyProcedural(pose, step);
    this.applyPose(pose);
  }

  // -- internals ------------------------------------------------------------

  private advance(track: Track, step: number): void {
    if (track.done) return;
    const rate = Math.max(0.05, track.speed) / track.def.duration;
    track.time += step * rate;
    if (track.def.loop && !track.once) {
      track.time -= Math.floor(track.time);
    } else if (track.time >= 1) {
      track.time = 1;
      track.done = true;
      const cb = track.onEnd;
      track.onEnd = undefined;
      if (cb) cb();
      // A finished one-shot that is not held returns the body to idle.
      if (track === this.cur && !track.hold) {
        this.prev = this.cur;
        this.fadeDur = 0.18;
        this.fadeTime = 0;
        this.cur = {
          name: 'idle',
          def: CLIPS.idle,
          time: 0,
          speed: 1,
          once: false,
          hold: false,
          done: false,
        };
      }
    }
  }

  private evaluate(track: Track, pose: Pose): void {
    track.def.eval(track.time, pose, this.rig, this.elapsed);
  }

  /**
   * Layers that run on top of whatever clip is playing: breathing, lean into
   * movement, head stabilisation and weapon follow-through.
   */
  private applyProcedural(pose: Pose, dt: number): void {
    this.applyCarry(pose, dt);
    const breath = this.cur.def.breath ?? 1;
    if (breath > 0.01) {
      const b = Math.sin(this.elapsed * 1.7);
      pose.add('spine', b * 0.012 * breath, 0, 0);
      pose.add('chest', -b * 0.018 * breath, 0, 0);
      pose.nudge('chest', 0, b * this.rig.hipY * 0.004 * breath, 0);
    }

    if (Math.abs(this.leanBias) > 0.001) {
      pose.add('spine', this.leanBias * 0.12, 0, 0);
      pose.add('hips', this.leanBias * 0.05, 0, 0);
      pose.add('head', -this.leanBias * 0.08, 0, 0);
    }

    // Secondary motion: a critically-damped spring chases the chest's yaw. The
    // difference between the two is exactly the lag a heavy weapon has, so it
    // drives the wrists and the trailing shoulder.
    const chestY = pose.rot[SLOT.chest * 3 + 1];
    const k = 220;
    const c = 2 * Math.sqrt(k) * 0.75;
    this.lagVel += (-(this.lagY - chestY) * k - this.lagVel * c) * dt;
    this.lagY += this.lagVel * dt;
    const lag = chestY - this.lagY;
    if (Math.abs(lag) > 1e-4) {
      pose.add('handR', 0, lag * 1.5, lag * 0.6);
      pose.add('handL', 0, lag * 1.2, -lag * 0.5);
      pose.add('elbowR', lag * 0.4, 0, 0);
      pose.add('head', 0, -chestY * 0.35, 0);
    }
  }

  /**
   * Puts the free hand on the weapon while the body is only moving around.
   *
   * Blended rather than switched, on two counts: it has to fade out the instant
   * an attack starts, so the swing owns the arms, and it has to fade in when a
   * greatsword is equipped rather than snapping the arms across in one frame.
   * The arm swing of the walk still shows through at partial weight, which is
   * what stops a walking two-hander looking like a mannequin.
   */
  private applyCarry(pose: Pose, dt: number): void {
    // Locomotion only. Attack, cast and shoot clips pose both arms on purpose.
    const want = this.grip !== 'none' && this.cur.def.locomotion && !this.inAction ? 1 : 0;
    const rate = want > this.gripW ? 6 : 12;
    this.gripW += (want - this.gripW) * Math.min(1, dt * rate);
    if (this.gripW < 0.002 || this.grip === 'none') return;

    const w = smooth(clamp01(this.gripW));
    for (const [bone, rx, ry, rz] of CARRY[this.grip]) {
      const i = SLOT[bone];
      if (i === undefined) continue;
      pose.rot[i * 3] += (rx - pose.rot[i * 3]) * w;
      pose.rot[i * 3 + 1] += (ry - pose.rot[i * 3 + 1]) * w;
      pose.rot[i * 3 + 2] += (rz - pose.rot[i * 3 + 2]) * w;
    }
  }

  private applyPose(pose: Pose): void {
    for (let i = 0; i < NSLOTS; i++) {
      const bone = this.bones[i];
      if (!bone) continue;
      if (LEG_SLOTS.has(i) && pose.ikW > 0.001) continue;
      _eul.set(pose.rot[i * 3], pose.rot[i * 3 + 1], pose.rot[i * 3 + 2], 'XYZ');
      _qA.setFromEuler(_eul);
      bone.quaternion.copy(this.restQuat[i]).multiply(_qA);
      bone.position.set(
        this.restPos[i].x + pose.pos[i * 3],
        this.restPos[i].y + pose.pos[i * 3 + 1],
        this.restPos[i].z + pose.pos[i * 3 + 2],
      );
    }

    if (pose.ikW > 0.001) {
      this.solveLeg(0, pose);
      this.solveLeg(1, pose);
    }
  }

  /**
   * Analytic two-bone IK. Given a foot target in hips space it produces hip and
   * knee rotations by the law of cosines, then counter-rotates the foot so it
   * stays flat on the ground regardless of what the leg above it is doing.
   */
  private solveLeg(side: 0 | 1, pose: Pose): void {
    const hipSlot = side === 0 ? SLOT.hipL : SLOT.hipR;
    const kneeSlot = side === 0 ? SLOT.kneeL : SLOT.kneeR;
    const footSlot = side === 0 ? SLOT.footL : SLOT.footR;
    const hip = this.bones[hipSlot];
    const knee = this.bones[kneeSlot];
    const foot = this.bones[footSlot];
    if (!hip || !knee) return;

    const o = side * 4;
    const rest = this.rig.footRest[side];
    // Hip motion applied to the hips bone shifts the leg's root too.
    _target.set(
      rest.x + pose.ik[o] - pose.pos[SLOT.hips * 3],
      rest.y + pose.ik[o + 1] - pose.pos[SLOT.hips * 3 + 1],
      rest.z + pose.ik[o + 2] - pose.pos[SLOT.hips * 3 + 2],
    );
    _vec.subVectors(_target, this.rig.hipOff[side]);

    const l1 = this.rig.l1;
    const l2 = this.rig.l2;
    let dist = _vec.length();
    const maxReach = (l1 + l2) * 0.999;
    const minReach = Math.abs(l1 - l2) + 1e-4;
    if (dist > maxReach) dist = maxReach;
    if (dist < minReach) dist = minReach;
    if (_vec.lengthSq() < 1e-9) _vec.copy(_DOWN);
    _vec.normalize();

    // Aim the whole leg at the target, then bend it out of the straight line.
    _qAim.setFromUnitVectors(_DOWN, _vec);
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const cosK = (l1 * l1 + l2 * l2 - dist * dist) / (2 * l1 * l2);
    const theta = Math.acos(Math.max(-1, Math.min(1, cosK)));

    _qB.setFromAxisAngle(_AXIS_X, -alpha);
    _qAim.multiply(_qB);

    const w = clamp01(pose.ikW);
    if (w >= 0.999) {
      hip.quaternion.copy(this.restQuat[hipSlot]).multiply(_qAim);
    } else {
      _eul.set(pose.rot[hipSlot * 3], pose.rot[hipSlot * 3 + 1], pose.rot[hipSlot * 3 + 2], 'XYZ');
      _qA.setFromEuler(_eul);
      hip.quaternion.copy(this.restQuat[hipSlot]).multiply(_qA.slerp(_qAim, w));
    }
    hip.position.copy(this.restPos[hipSlot]);

    const kneeAngle = Math.PI - theta;
    _qB.setFromAxisAngle(_AXIS_X, kneeAngle);
    if (w >= 0.999) {
      knee.quaternion.copy(this.restQuat[kneeSlot]).multiply(_qB);
    } else {
      _eul.set(pose.rot[kneeSlot * 3], pose.rot[kneeSlot * 3 + 1], pose.rot[kneeSlot * 3 + 2], 'XYZ');
      _qA.setFromEuler(_eul);
      knee.quaternion.copy(this.restQuat[kneeSlot]).multiply(_qA.slerp(_qB, w));
    }
    knee.position.copy(this.restPos[kneeSlot]);

    if (foot) {
      // Undo the accumulated leg rotation so the sole stays level, then add the
      // clip's own pitch — this is what plants a foot instead of skating it.
      _qA.copy(_qAim).multiply(_qB).invert();
      _qB.setFromAxisAngle(_AXIS_X, pose.ik[o + 3]);
      _qA.multiply(_qB);
      foot.quaternion.copy(this.restQuat[footSlot]).slerp(
        this.restQuat[footSlot].clone().multiply(_qA),
        w,
      );
      foot.position.copy(this.restPos[footSlot]);
    }
  }

  /** Snap every bone back to its bind pose. */
  reset(): void {
    for (let i = 0; i < NSLOTS; i++) {
      const bone = this.bones[i];
      if (!bone) continue;
      bone.position.copy(this.restPos[i]);
      bone.quaternion.copy(this.restQuat[i]);
    }
  }
}

/** The clip names the animator understands, for editors and debug UI. */
export const CLIP_NAMES: ClipName[] = [
  'idle',
  'walk',
  'run',
  'attack1',
  'attack2',
  'cast',
  'hurt',
  'death',
  'dodge',
];

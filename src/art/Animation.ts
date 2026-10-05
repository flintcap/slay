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
import { SecondaryMotion } from './Secondary';

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
  /**
   * Yaw of each foot in character space. Zero points the toes straight ahead;
   * a planted foot keeps its yaw on the floor while the body turns over it.
   */
  readonly fyaw = new Float32Array(2);
  /** 0 = legs run on FK angles, 1 = legs run on the IK targets. */
  ikW = 0;
  /**
   * Shoulders as quaternions [x,y,z,w] per side (L, R), used instead of the
   * euler angles by `sw` (0..1). Swings are keyed as directions and slerped
   * between keys: an arm going from behind the head to out in front passes
   * through euler angles that flip, and interpolating those spins the arm.
   */
  readonly sq = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
  readonly sw = new Float32Array(2);

  reset(): void {
    this.rot.fill(0);
    this.pos.fill(0);
    this.ik.fill(0);
    this.fyaw.fill(0);
    this.ikW = 0;
    this.sq.set(QUAT_ID2);
    this.sw.fill(0);
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

  /**
   * Foot target as an offset from the rest foot position, in character space.
   * Character space rather than hips space, so a clip that twists or tilts the
   * pelvis does not drag the feet across the floor with it.
   */
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
    out.fyaw[0] = a.fyaw[0] + (b.fyaw[0] - a.fyaw[0]) * t;
    out.fyaw[1] = a.fyaw[1] + (b.fyaw[1] - a.fyaw[1]) * t;
    out.ikW = a.ikW + (b.ikW - a.ikW) * t;
    for (let side = 0; side < 2; side++) {
      const wa = a.sw[side];
      const wb = b.sw[side];
      out.sw[side] = wa + (wb - wa) * t;
      const o = side * 4;
      if (wa <= 1e-4 && wb <= 1e-4) {
        out.sq.set(QUAT_ID, o);
        continue;
      }
      // A side that is not using its quaternion lends the other one, so the
      // blend is a weight change rather than a swing through the identity.
      const qa = wa > 1e-4 ? a.sq : b.sq;
      const qb = wb > 1e-4 ? b.sq : a.sq;
      nlerpInto(qa, qb, o, t, out.sq);
    }
  }

  copyFrom(src: Pose): void {
    this.rot.set(src.rot);
    this.pos.set(src.pos);
    this.ik.set(src.ik);
    this.fyaw.set(src.fyaw);
    this.ikW = src.ikW;
    this.sq.set(src.sq);
    this.sw.set(src.sw);
  }
}

const QUAT_ID = [0, 0, 0, 1];
const QUAT_ID2 = [0, 0, 0, 1, 0, 0, 0, 1];

/** Normalised lerp of two quaternions stored at offset `o`, shortest way round. */
function nlerpInto(a: Float32Array, b: Float32Array, o: number, t: number, out: Float32Array): void {
  const dot = a[o] * b[o] + a[o + 1] * b[o + 1] + a[o + 2] * b[o + 2] + a[o + 3] * b[o + 3];
  const sgn = dot < 0 ? -1 : 1;
  let x = a[o] + (b[o] * sgn - a[o]) * t;
  let y = a[o + 1] + (b[o + 1] * sgn - a[o + 1]) * t;
  let z = a[o + 2] + (b[o + 2] * sgn - a[o + 2]) * t;
  let w = a[o + 3] + (b[o + 3] * sgn - a[o + 3]) * t;
  const len = Math.hypot(x, y, z, w) || 1;
  x /= len;
  y /= len;
  z /= len;
  w /= len;
  out[o] = x;
  out[o + 1] = y;
  out[o + 2] = z;
  out[o + 3] = w;
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
// Key poses
// ---------------------------------------------------------------------------

/**
 * How a segment of a keyed clip moves into the key that ends it.
 *
 * `kf` eases to a stop at every key, which is right for a pose an arm settles
 * into and wrong for the moment a blade meets something: a strike has to
 * arrive at full speed (`in`) and leave the contact decelerating (`out`).
 */
type Ease = 's' | 'in' | 'out' | 'lin' | 'hold';

function ease(e: Ease | undefined, x: number): number {
  switch (e) {
    case 'in':
      return x * x;
    case 'out':
      return 1 - (1 - x) * (1 - x);
    case 'lin':
      return x;
    case 'hold':
      return 0;
    default:
      return x * x * (3 - 2 * x);
  }
}

/**
 * One key pose of an action, as an animator would block it: the time it is
 * hit, how the body moves into it, and the joints that matter. Joints a key
 * leaves out are at rest. Lengths are in units of the rig's hip height, so the
 * same keys fit a gnome and an ogre.
 */
interface KeyPose {
  t: number;
  e?: Ease;
  /** Joint rotations, [x, y, z] in radians. */
  b?: Partial<Record<(typeof SLOT_NAMES)[number], [number, number?, number?]>>;
  /** Hips offset, hip-heights. */
  hp?: [number, number, number];
  /** Foot targets from rest, hip-heights, and pitch (+ is heel up). */
  fl?: [number, number, number, number?];
  fr?: [number, number, number, number?];
  /** Foot yaw, radians. */
  yl?: number;
  yr?: number;
  /**
   * Upper arm as a direction rather than angles: [elevation, azimuth, twist].
   * Elevation 0 hangs, pi/2 is level, pi straight up and past it behind the
   * head. Azimuth 0 is straight ahead and +pi/2 the character's left, for
   * both arms. The arm turns about its own axis so a bent elbow folds the
   * forearm forward; `twist` adds to that. Keys without one use `b`.
   */
  sL?: [number, number, number?];
  sR?: [number, number, number?];
}

const _swA = new THREE.Quaternion();
const _swB = new THREE.Quaternion();
const _swE = new THREE.Euler();

/** The shoulder rotation that points the upper arm along a swing direction. */
const _SW_Y = new THREE.Vector3(0, 1, 0);
const _SW_X = new THREE.Vector3(1, 0, 0);

function swingQuat(elev: number, azim: number, twist: number, out: THREE.Quaternion): THREE.Quaternion {
  out.setFromAxisAngle(_SW_Y, azim);
  _swA.setFromAxisAngle(_SW_X, -elev);
  _swB.setFromAxisAngle(_SW_Y, twist - azim);
  return out.multiply(_swA).multiply(_swB);
}

/** Key poses flattened into dense arrays once, so sampling allocates nothing. */
interface Keyed {
  n: number;
  t: Float32Array;
  e: Array<Ease | undefined>;
  rot: Float32Array;
  hip: Float32Array;
  ik: Float32Array;
  yaw: Float32Array;
  /** Shoulder quaternions per key, [L xyzw, R xyzw], and which sides use them. */
  sq: Float32Array;
  useS: [boolean, boolean];
}

function keyed(keys: KeyPose[]): Keyed {
  const n = keys.length;
  const k: Keyed = {
    n,
    t: new Float32Array(n),
    e: keys.map((x) => x.e),
    rot: new Float32Array(n * NSLOTS * 3),
    hip: new Float32Array(n * 3),
    ik: new Float32Array(n * 8),
    yaw: new Float32Array(n * 2),
    sq: new Float32Array(n * 8),
    useS: [keys.some((x) => x.sL), keys.some((x) => x.sR)],
  };
  const q = new THREE.Quaternion();
  keys.forEach((key, i) => {
    for (let side = 0; side < 2; side++) {
      const sw = side === 0 ? key.sL : key.sR;
      if (sw) swingQuat(sw[0], sw[1], sw[2] ?? 0, q);
      else {
        const e = key.b?.[side === 0 ? 'shoulderL' : 'shoulderR'];
        q.setFromEuler(_swE.set(e?.[0] ?? 0, e?.[1] ?? 0, e?.[2] ?? 0, 'XYZ'));
      }
      // Keep consecutive keys in one hemisphere so a slerp never goes the long way.
      if (i > 0) {
        const o = (i - 1) * 8 + side * 4;
        const d = q.x * k.sq[o] + q.y * k.sq[o + 1] + q.z * k.sq[o + 2] + q.w * k.sq[o + 3];
        if (d < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      }
      k.sq.set([q.x, q.y, q.z, q.w], i * 8 + side * 4);
    }
    k.t[i] = key.t;
    for (const [name, v] of Object.entries(key.b ?? {})) {
      const s = SLOT[name];
      if (s === undefined || !v) continue;
      k.rot[i * NSLOTS * 3 + s * 3] = v[0];
      k.rot[i * NSLOTS * 3 + s * 3 + 1] = v[1] ?? 0;
      k.rot[i * NSLOTS * 3 + s * 3 + 2] = v[2] ?? 0;
    }
    if (key.hp) k.hip.set(key.hp, i * 3);
    if (key.fl) k.ik.set([key.fl[0], key.fl[1], key.fl[2], key.fl[3] ?? 0], i * 8);
    if (key.fr) k.ik.set([key.fr[0], key.fr[1], key.fr[2], key.fr[3] ?? 0], i * 8 + 4);
    k.yaw[i * 2] = key.yl ?? 0;
    k.yaw[i * 2 + 1] = key.yr ?? 0;
  });
  return k;
}

/** Writes a keyed clip at time `t` into `p` (joints, hips and both feet). */
function sampleKeys(k: Keyed, t: number, p: Pose, h: number): void {
  let i = 0;
  while (i < k.n - 2 && t > k.t[i + 1]) i++;
  const a = i;
  const b = Math.min(k.n - 1, i + 1);
  const span = k.t[b] - k.t[a];
  const x = span > 1e-6 ? clamp01((t - k.t[a]) / span) : 1;
  const s = ease(k.e[b], x);
  const R = NSLOTS * 3;
  for (let j = 0; j < R; j++) p.rot[j] = k.rot[a * R + j] + (k.rot[b * R + j] - k.rot[a * R + j]) * s;
  const hp = SLOT.hips * 3;
  for (let j = 0; j < 3; j++) p.pos[hp + j] = (k.hip[a * 3 + j] + (k.hip[b * 3 + j] - k.hip[a * 3 + j]) * s) * h;
  for (let j = 0; j < 8; j++) {
    const v = k.ik[a * 8 + j] + (k.ik[b * 8 + j] - k.ik[a * 8 + j]) * s;
    p.ik[j] = (j & 3) === 3 ? v : v * h;
  }
  p.fyaw[0] = k.yaw[a * 2] + (k.yaw[b * 2] - k.yaw[a * 2]) * s;
  p.fyaw[1] = k.yaw[a * 2 + 1] + (k.yaw[b * 2 + 1] - k.yaw[a * 2 + 1]) * s;
  p.ikW = 1;
  for (let side = 0; side < 2; side++) {
    if (!k.useS[side]) continue;
    _swA.fromArray(k.sq, a * 8 + side * 4);
    _swB.fromArray(k.sq, b * 8 + side * 4);
    _swA.slerp(_swB, s);
    p.sq[side * 4] = _swA.x;
    p.sq[side * 4 + 1] = _swA.y;
    p.sq[side * 4 + 2] = _swA.z;
    p.sq[side * 4 + 3] = _swA.w;
    p.sw[side] = 1;
  }
}

const _pA = new Pose();
const _pB = new Pose();
const _pC = new Pose();

/**
 * Samples an action, cutting its wind-up short when there is no time for it:
 * before the contact the keyed path is blended toward the straight path from
 * the first pose to the contact pose by how much wind-up there is time for.
 */
function sampleAction(k: Keyed, t: number, p: Pose, rig: Rig, contact: number): void {
  sampleKeys(k, t, p, rig.hipY);
  if (rig.antic >= 0.999 || t >= contact) return;
  sampleKeys(k, 0, _pA, rig.hipY);
  sampleKeys(k, contact, _pB, rig.hipY);
  Pose.blend(_pA, _pB, ease('in', t / contact), _pC);
  Pose.blend(_pC, p, rig.antic, p);
}

/** Scales the torso's part of a pose, which is where a heavy weapon shows. */
function torso(p: Pose, k: number): void {
  for (const n of [SLOT.hips, SLOT.spine, SLOT.chest]) {
    p.rot[n * 3] *= k;
    p.rot[n * 3 + 1] *= k;
  }
  p.pos[SLOT.hips * 3 + 1] *= k;
}

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
  /** The hips bone's rest position under the root. */
  hipsRest: THREE.Vector3;
  /** Ankle to ball of the foot, and ankle to heel: the two rocker pivots. */
  toe: number;
  heel: number;
  /** What is in the hands, which is what gives a swing its weight. */
  wpn: WeaponStyle;
  /** Share of the authored wind-up the current action has time for. */
  antic: number;
}

/**
 * How a held weapon changes a swing. `heavy` is how much body goes into it
 * (0 a dagger or a bare fist, 1 a greataxe), `two` puts the off hand on the
 * haft, `pole` marks a long shaft held at the middle (staves and spears).
 */
interface WeaponStyle {
  grip: string;
  heavy: number;
  two: boolean;
  pole: boolean;
}

function weaponStyle(grip: string): WeaponStyle {
  switch (grip) {
    case 'dagger':
    case 'wand':
      return { grip, heavy: 0, two: false, pole: false };
    case 'sword':
      return { grip, heavy: 0.4, two: false, pole: false };
    case 'axe':
    case 'mace':
      return { grip, heavy: 0.75, two: false, pole: false };
    case 'twoHand':
      return { grip, heavy: 1, two: true, pole: false };
    case 'staff':
      return { grip, heavy: 0.55, two: true, pole: true };
    case 'bow':
      return { grip, heavy: 0.2, two: false, pole: false };
    default:
      return { grip: 'none', heavy: 0.15, two: false, pole: false };
  }
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
  | 'lunge'
  // Reactions: knocked back, stunned, knocked down, and a second death.
  | 'stagger'
  | 'stun'
  | 'down'
  | 'deathFwd';

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

/** An aim direction in character space, or one chosen by what is held (null: none). */
type AimDir = [number, number, number] | ((w: WeaponStyle) => [number, number, number] | null);

interface ClipDef {
  /** Seconds for one full playthrough at speed 1. */
  duration: number;
  loop: boolean;
  /** Locomotion clips yield to any running one-shot. */
  locomotion?: boolean;
  /** How strongly the breathing layer still shows through. */
  breath?: number;
  eval(t: number, p: Pose, rig: Rig, elapsed: number): void;
  /**
   * When the blow lands (or the spell leaves the hand), as a share of the
   * clip. `play({ contact })` bends time so this key arrives exactly when the
   * game applies the hit, however fast or slow the swing is.
   */
  contact?: number;
  /**
   * Share of the clip after which a real move order may cut the rest short.
   * Defaults to the contact: what follows is follow-through.
   */
  recover?: number;
  /** Keeps the off hand on the haft of a two-handed weapon throughout. */
  offHand?: boolean;
  /**
   * Where the weapon's business end must point around the contact, in
   * character space, and how strongly (0..1) at clip time `t`. Grips differ
   * by weapon, so no hand angle aims every weapon; this turns the wrist.
   */
  aim?: { dir: AimDir; w(t: number): number };
  /** The body travels during it (a dash): its feet are not held to the floor. */
  travel?: boolean;
  /** Spell light in the hands, 0..1 at clip time `t`, and which hands. */
  glow?: { w(t: number): number; hands: 'left' | 'right' | 'both' };
  /** How much the head keeps looking where the hips point (default 0.8). */
  gaze?: number;
}

/** Both feet planted at rest, with a little stance width. Used as a base. */
function stance(p: Pose, rig: Rig, spread = 0, crouch = 0): void {
  p.foot(0, spread, -crouch, 0, 0);
  p.foot(1, -spread, -crouch, 0, 0);
}

// ---------------------------------------------------------------------------
// Action key poses
// ---------------------------------------------------------------------------
//
// Every strike has the same three beats: a short anticipation that loads the
// body against the blow, a contact the arm arrives at at full speed (`in`), and
// a follow-through that leaves the contact still travelling and decelerates
// (`out`) before settling. The game applies a hit no later than 0.16 s after
// the click, so the anticipation is brief; the weight lives in the body drive
// at contact (hips drop, chest and spine turn through, a planted heel lifts)
// and in a follow-through that overshoots and takes its time to come back.

type B = NonNullable<KeyPose['b']>;

/** Arms as the idle holds them, so a strike starts and ends where idle is. */
const READY: B = {
  shoulderL: [0.04, 0, 0.13],
  shoulderR: [0.04, 0, -0.13],
  elbowL: [-0.22, 0, 0.06],
  elbowR: [-0.22, 0, -0.06],
  handL: [0, 0, 0.1],
  handR: [0, 0, -0.1],
};

/** Both hands on a two-handed haft, the carry pose (`CARRY.twoHand`). */
const READY2: B = {
  shoulderR: [0.052, 0.335, 0.07],
  elbowR: [-0.95],
  shoulderL: [-0.055, -1.006, 0.033],
  elbowL: [-1.52],
};

/** The bow carry (`CARRY.bow`). */
const READYBOW: B = {
  shoulderL: [-0.066, -0.335, -0.07],
  elbowL: [-0.949],
  shoulderR: [-0.989, 0.699, 0.694],
  elbowR: [-0.176],
};

/** Aim weight that ramps in through the strike, holds and lets go after. */
function aimAround(from: number, contact: number, hold: number, off: number): (t: number) => number {
  return (t) => kf(t, [
    [from, 0],
    [contact, 1],
    [hold, 1],
    [off, 0],
  ]);
}

// Overhead diagonal chop, one hand. Wind the blade up behind the head with the
// chest turned away, then drive it down and across as the lead foot lands.
const K_CHOP = keyed([
  { t: 0, b: READY },
  {
    t: 0.14,
    sR: [3.3, -0.3],
    sL: [1.1, 0.35],
    b: { elbowR: [-1.8], handR: [-0.4], elbowL: [-0.8], chest: [-0.1, -0.4], spine: [-0.08, -0.2], hips: [0, -0.15] },
    hp: [0, 0.01, -0.01],
    fl: [0.02, 0.07, 0.11],
  },
  {
    t: 0.3,
    e: 'in',
    sR: [1.75, 0.3],
    sL: [0.45, 2.4],
    b: { elbowR: [-0.12], handR: [0.3], elbowL: [-0.9], chest: [0.2, 0.38], spine: [0.15, 0.18], hips: [0.08, 0.18] },
    hp: [0, -0.045, 0.02],
    fl: [0.03, 0, 0.24],
    fr: [-0.01, 0, -0.02, 0.25],
  },
  {
    t: 0.42,
    e: 'out',
    sR: [1.05, 0.65],
    sL: [0.5, 2.5],
    b: { elbowR: [-0.25], handR: [0.4], elbowL: [-0.8], chest: [0.28, 0.55], spine: [0.22, 0.25], hips: [0.1, 0.25] },
    hp: [0, -0.06, 0.03],
    fl: [0.03, 0, 0.24],
    fr: [-0.01, 0, -0.02, 0.2],
  },
  {
    t: 0.62,
    sR: [0.45, 0.4],
    sL: [0.25, 1.8],
    b: { elbowR: [-0.5], handR: [0.2], elbowL: [-0.45], chest: [0.15, 0.25], spine: [0.1, 0.1], hips: [0.04, 0.12] },
    hp: [0, -0.03, 0.01],
    fl: [0.03, 0, 0.22],
    fr: [-0.01, 0, -0.02, 0.05],
  },
  { t: 1, b: READY, fl: [0.03, 0, 0.2] },
]);

// The same chop with both hands on a heavy haft: the hands stay near the
// middle of the body so the off hand can keep hold, and the whole trunk folds
// into the blow.
const K_CHOP2 = keyed([
  { t: 0, b: READY2 },
  {
    t: 0.15,
    sR: [3.0, 0.25],
    sL: [2.9, -0.35],
    b: { elbowR: [-1.5], handR: [-0.3], elbowL: [-1.5], chest: [-0.18, -0.2], spine: [-0.14, -0.1], hips: [-0.05, -0.1] },
    hp: [0, 0.015, -0.02],
    fl: [0.02, 0.08, 0.12],
    fr: [0, 0, -0.02, 0.1],
  },
  {
    t: 0.32,
    e: 'in',
    sR: [1.9, 0.45],
    sL: [1.9, -0.4],
    b: { elbowR: [-0.35], handR: [0.3], elbowL: [-0.6], chest: [0.3, 0.15], spine: [0.22, 0.08], hips: [0.14, 0.1] },
    hp: [0, -0.09, 0.04],
    fl: [0.03, 0, 0.26],
    fr: [-0.01, 0, -0.04, 0.3],
  },
  {
    t: 0.46,
    e: 'out',
    sR: [1.1, 0.5],
    sL: [1.15, -0.5],
    b: { elbowR: [-0.4], handR: [0.4], elbowL: [-0.6], chest: [0.4, 0.2], spine: [0.3, 0.1], hips: [0.18, 0.12] },
    hp: [0, -0.11, 0.05],
    fl: [0.03, 0, 0.26],
    fr: [-0.01, 0, -0.04, 0.25],
  },
  {
    t: 0.68,
    sR: [0.55, 0.45],
    sL: [0.6, -0.7],
    b: { elbowR: [-0.75], elbowL: [-1.1], chest: [0.2, 0.1], spine: [0.15, 0.05], hips: [0.06, 0.05] },
    hp: [0, -0.05, 0.02],
    fl: [0.03, 0, 0.24],
    fr: [0, 0, -0.03, 0.05],
  },
  { t: 1, b: READY2, fl: [0.03, 0, 0.22] },
]);

// Flat sweep from right to left. The arm opens out behind the right hip with
// the chest turned away, then the hips lead the turn and the arm whips through.
const K_SWEEP = keyed([
  { t: 0, b: READY },
  {
    t: 0.14,
    sR: [1.45, -1.9],
    sL: [1.0, -0.2],
    b: { elbowR: [-1.1], elbowL: [-1.0], chest: [0, -0.6, 0.05], spine: [0.02, -0.3], hips: [0, -0.25] },
    hp: [0, -0.02, 0],
    fl: [0.05, 0.06, 0.07],
  },
  {
    t: 0.3,
    e: 'in',
    sR: [1.5, 0.15],
    sL: [0.6, 1.9],
    b: { elbowR: [-0.2], elbowL: [-0.9], chest: [0.08, 0.35], spine: [0.06, 0.2], hips: [0.04, 0.2] },
    hp: [0, -0.04, 0.01],
    fl: [0.07, 0, 0.14],
    fr: [-0.02, 0, -0.03, 0.3],
    yr: 0.3,
  },
  {
    t: 0.44,
    e: 'out',
    sR: [1.4, 1.0],
    sL: [0.65, 2.2],
    b: { elbowR: [-0.4], elbowL: [-0.8], chest: [0.12, 0.7], spine: [0.1, 0.35], hips: [0.05, 0.32] },
    hp: [0, -0.05, 0.01],
    fl: [0.07, 0, 0.14],
    fr: [-0.02, 0, -0.03, 0.25],
    yr: 0.35,
  },
  {
    t: 0.64,
    sR: [0.8, 0.6],
    sL: [0.3, 1.6],
    b: { elbowR: [-0.6], elbowL: [-0.5], chest: [0.05, 0.3], spine: [0.04, 0.15], hips: [0.02, 0.15] },
    hp: [0, -0.02, 0],
    fl: [0.07, 0, 0.14],
    fr: [-0.02, 0, -0.03, 0.05],
    yr: 0.15,
  },
  { t: 1, b: READY, fl: [0.07, 0, 0.12] },
]);

// The sweep with both hands: shorter arc, both arms travelling together, and
// the back heel spinning out as the hips turn through.
const K_SWEEP2 = keyed([
  { t: 0, b: READY2 },
  {
    t: 0.15,
    sR: [1.3, -1.2],
    sL: [1.25, -0.6],
    b: { elbowR: [-1.3], elbowL: [-1.5], chest: [0, -0.75], spine: [0, -0.35], hips: [0, -0.3] },
    hp: [0, -0.03, 0],
    fl: [0.06, 0.06, 0.05],
  },
  {
    t: 0.32,
    e: 'in',
    sR: [1.4, 0.4],
    sL: [1.35, -0.15],
    b: { elbowR: [-0.45], elbowL: [-0.8], chest: [0.1, 0.4], spine: [0.08, 0.2], hips: [0.05, 0.22] },
    hp: [0, -0.07, 0.02],
    fl: [0.1, 0, 0.12],
    fr: [-0.02, 0, -0.03, 0.3],
    yr: 0.3,
  },
  {
    t: 0.48,
    e: 'out',
    sR: [1.3, 1.1],
    sL: [1.1, 0.5],
    b: { elbowR: [-0.5], elbowL: [-0.8], chest: [0.14, 0.85], spine: [0.1, 0.4], hips: [0.06, 0.38] },
    hp: [0, -0.08, 0.02],
    fl: [0.1, 0, 0.12],
    fr: [-0.02, 0, -0.03, 0.3],
    yr: 0.45,
  },
  {
    t: 0.7,
    sR: [0.7, 0.6],
    sL: [0.6, -0.2],
    b: { elbowR: [-0.8], elbowL: [-1.2], chest: [0.05, 0.35], spine: [0.04, 0.15], hips: [0.02, 0.15] },
    hp: [0, -0.02, 0],
    fl: [0.1, 0, 0.12],
    fr: [-0.02, 0, -0.03, 0.05],
    yr: 0.2,
  },
  { t: 1, b: READY2, fl: [0.1, 0, 0.1] },
]);

// Overhead two-handed smash: rise onto the back toe with both arms high, then
// fold the trunk down through the target and drop the hips into it.
const K_SLAM = keyed([
  { t: 0, b: READY },
  {
    t: 0.18,
    sL: [2.95, 0.2],
    sR: [2.95, -0.2],
    b: { elbowL: [-1.3], elbowR: [-1.3], handL: [-0.3], handR: [-0.3], spine: [-0.12], chest: [-0.15], head: [-0.1] },
    hp: [0, 0.04, -0.02],
    fl: [0.02, 0.08, 0.07],
    fr: [0, 0, -0.03, 0.25],
  },
  {
    t: 0.36,
    e: 'in',
    sL: [1.1, -0.15],
    sR: [1.1, 0.15],
    b: { elbowL: [-0.55], elbowR: [-0.55], handL: [0.3], handR: [0.3], spine: [0.3], chest: [0.36], hips: [0.15], head: [-0.3] },
    hp: [0, -0.1, 0.05],
    fl: [0.04, 0, 0.22],
    fr: [-0.02, 0, -0.06, 0.2],
  },
  {
    t: 0.5,
    e: 'out',
    sL: [0.85, -0.15],
    sR: [0.85, 0.15],
    b: { elbowL: [-0.55], elbowR: [-0.55], handL: [0.3], handR: [0.3], spine: [0.34], chest: [0.4], hips: [0.18], head: [-0.35] },
    hp: [0, -0.12, 0.06],
    fl: [0.04, 0, 0.22],
    fr: [-0.02, 0, -0.06, 0.2],
  },
  {
    t: 0.72,
    sL: [0.5, 0.3],
    sR: [0.5, -0.3],
    b: { elbowL: [-0.6], elbowR: [-0.6], spine: [0.2], chest: [0.2], hips: [0.06], head: [-0.1] },
    hp: [0, -0.06, 0.02],
    fl: [0.04, 0, 0.22],
    fr: [-0.02, 0, -0.06, 0.05],
  },
  { t: 1, b: READY, fl: [0.04, 0, 0.2], fr: [0, 0, -0.04] },
]);

// A stab: the weapon hand chambers at the hip with the chest turned away, then
// drives straight out as the lead foot steps in and the back heel lifts.
const K_THRUST = keyed([
  { t: 0, b: READY },
  {
    t: 0.14,
    sR: [0.5, -2.9],
    sL: [1.2, 0.2],
    b: { elbowR: [-1.9], handR: [0.1], elbowL: [-0.5], chest: [-0.02, -0.5], spine: [0, -0.25], hips: [0, -0.25] },
    hp: [0, -0.03, -0.02],
    fl: [0.03, 0.07, 0.12],
  },
  {
    t: 0.3,
    e: 'in',
    sR: [1.55, 0.2],
    sL: [0.5, 2.6],
    b: { elbowR: [-0.06], handR: [-0.1], elbowL: [-0.8], chest: [0.12, 0.4], spine: [0.1, 0.2], hips: [0.06, 0.25] },
    hp: [0, -0.07, 0.06],
    fl: [0.04, 0, 0.36],
    fr: [-0.01, 0, -0.06, 0.35],
  },
  {
    t: 0.42,
    e: 'out',
    sR: [1.58, 0.25],
    sL: [0.55, 2.7],
    b: { elbowR: [-0.02], elbowL: [-0.8], chest: [0.16, 0.48], spine: [0.13, 0.25], hips: [0.08, 0.3] },
    hp: [0, -0.08, 0.08],
    fl: [0.04, 0, 0.36],
    fr: [-0.01, 0, -0.06, 0.35],
  },
  {
    t: 0.62,
    sR: [1.0, 0.1],
    sL: [0.25, 1.5],
    b: { elbowR: [-0.7], elbowL: [-0.5], chest: [0.06, 0.2], spine: [0.05, 0.1], hips: [0.03, 0.12] },
    hp: [0, -0.04, 0.03],
    fl: [0.04, 0, 0.34],
    fr: [-0.01, 0, -0.05, 0.05],
  },
  { t: 1, b: READY, fl: [0.04, 0, 0.3], fr: [0, 0, -0.04] },
]);

// A long step-through stab: the lead foot flies forward and lands well ahead
// as the hips drop and drive after the point; then it steps back in.
const K_LUNGE = keyed([
  { t: 0, b: READY },
  {
    t: 0.12,
    sR: [0.5, -2.9],
    sL: [1.1, 0.25],
    b: { elbowR: [-1.7], elbowL: [-0.7], chest: [0, -0.45], spine: [0, -0.2], hips: [0, -0.25] },
    hp: [0, -0.06, 0.02],
    fl: [0.04, 0.12, 0.3],
  },
  {
    t: 0.32,
    e: 'in',
    sR: [1.5, 0.25],
    sL: [0.55, 2.5],
    b: { elbowR: [-0.04], elbowL: [-0.5], chest: [0.2, 0.42], spine: [0.18, 0.2], hips: [0.12, 0.25] },
    hp: [0, -0.2, 0.32],
    fl: [0.05, 0, 0.85],
    fr: [-0.02, 0, -0.08, 0.45],
  },
  {
    t: 0.46,
    e: 'out',
    sR: [1.55, 0.28],
    sL: [0.6, 2.6],
    b: { elbowR: [-0.02], elbowL: [-0.5], chest: [0.24, 0.48], spine: [0.2, 0.22], hips: [0.14, 0.28] },
    hp: [0, -0.22, 0.36],
    fl: [0.05, 0, 0.85],
    fr: [-0.02, 0, -0.08, 0.45],
  },
  {
    t: 0.7,
    sR: [0.9, 0.1],
    sL: [0.25, 1.6],
    b: { elbowR: [-0.7], elbowL: [-0.5], chest: [0.08, 0.15], spine: [0.06, 0.08], hips: [0.04, 0.1] },
    hp: [0, -0.1, 0.18],
    fl: [0.05, 0, 0.85],
    fr: [-0.02, 0, -0.08, 0.1],
  },
  { t: 0.85, b: READY, hp: [0, -0.04, 0.08], fl: [0.05, 0.09, 0.6], fr: [-0.02, 0, -0.07] },
  { t: 1, b: READY, fl: [0.05, 0, 0.4], fr: [-0.02, 0, -0.06] },
]);

// Rise and drive both feet down: ground novas, quakes, shockwaves.
const K_STOMP = keyed([
  { t: 0, b: READY },
  {
    t: 0.22,
    sL: [2.2, 0.6],
    sR: [2.2, -0.6],
    b: { elbowL: [-1.0], elbowR: [-1.0], spine: [-0.12], chest: [-0.15], head: [-0.15] },
    hp: [0, 0.06, 0],
    fl: [0.06, 0.13, 0],
    fr: [-0.06, 0.13, 0],
  },
  {
    t: 0.4,
    e: 'in',
    sL: [0.75, 0.6],
    sR: [0.75, -0.6],
    b: { elbowL: [-0.3], elbowR: [-0.3], spine: [0.3], chest: [0.36], hips: [0.12], head: [-0.25] },
    hp: [0, -0.14, 0],
    fl: [0.18, 0, 0],
    fr: [-0.18, 0, 0],
  },
  {
    t: 0.55,
    e: 'out',
    sL: [0.65, 0.65],
    sR: [0.65, -0.65],
    b: { elbowL: [-0.35], elbowR: [-0.35], spine: [0.32], chest: [0.4], hips: [0.14], head: [-0.28] },
    hp: [0, -0.15, 0],
    fl: [0.18, 0, 0],
    fr: [-0.18, 0, 0],
  },
  {
    t: 0.78,
    sL: [0.25, 1.2],
    sR: [0.25, -1.2],
    b: { elbowL: [-0.4], elbowR: [-0.4], spine: [0.12], chest: [0.12] },
    hp: [0, -0.06, 0],
    fl: [0.18, 0, 0],
    fr: [-0.18, 0, 0],
  },
  { t: 1, b: READY, fl: [0.12, 0, 0], fr: [-0.12, 0, 0] },
]);

// Overhand throw: the arm cocks back past the ear while the other points the
// way, then whips through and across as the weight goes onto the lead foot.
const K_HURL = keyed([
  { t: 0, b: READY },
  {
    t: 0.14,
    sR: [3.4, -0.5],
    sL: [1.45, 0.3],
    b: { elbowR: [-1.9], handR: [-0.4], elbowL: [-0.3], chest: [-0.15, -0.55], spine: [-0.1, -0.3], hips: [0, -0.3] },
    hp: [0, 0.01, -0.02],
    fl: [0.04, 0.07, 0.11],
  },
  {
    t: 0.3,
    e: 'in',
    sR: [1.7, 0.2],
    sL: [0.5, 2.0],
    b: { elbowR: [-0.3], handR: [0.4], elbowL: [-0.9], chest: [0.25, 0.4], spine: [0.18, 0.2], hips: [0.08, 0.25] },
    hp: [0, -0.04, 0.03],
    fl: [0.04, 0, 0.24],
    fr: [-0.01, 0, -0.04, 0.3],
  },
  {
    t: 0.45,
    e: 'out',
    sR: [0.8, 0.7],
    sL: [0.5, 2.4],
    b: { elbowR: [-0.35], handR: [0.3], elbowL: [-0.8], chest: [0.32, 0.55], spine: [0.22, 0.25], hips: [0.1, 0.3] },
    hp: [0, -0.05, 0.04],
    fl: [0.04, 0, 0.24],
    fr: [-0.01, 0, -0.04, 0.3],
  },
  {
    t: 0.68,
    sR: [0.4, 0.4],
    sL: [0.25, 1.6],
    b: { elbowR: [-0.5], elbowL: [-0.4], chest: [0.1, 0.2], spine: [0.06, 0.1], hips: [0.03, 0.12] },
    hp: [0, -0.02, 0.01],
    fl: [0.04, 0, 0.22],
    fr: [-0.01, 0, -0.03, 0.05],
  },
  { t: 1, b: READY, fl: [0.04, 0, 0.2] },
]);

// One arm snapped out, finger first: commands, curses, marks, summons. The
// other stays tucked, which is what makes it read as deliberate.
const K_POINT = keyed([
  { t: 0, b: READY },
  {
    t: 0.13,
    sR: [0.9, 0.5],
    sL: [0.7, -0.6],
    b: { elbowR: [-1.7], handR: [0.3], elbowL: [-1.3], chest: [-0.12, -0.25], spine: [-0.08, -0.12] },
    hp: [0, 0, -0.01],
  },
  {
    t: 0.28,
    e: 'in',
    sR: [1.62, 0.15],
    sL: [0.55, -0.5],
    b: { elbowR: [-0.05], handR: [-0.15], elbowL: [-1.35], chest: [0.12, 0.25], spine: [0.1, 0.12], hips: [0.04, 0.1] },
    hp: [0, -0.02, 0.02],
    fl: [0.03, 0, 0.09],
    fr: [0, 0, -0.02, 0.1],
  },
  {
    t: 0.55,
    e: 'out',
    sR: [1.58, 0.15],
    sL: [0.55, -0.5],
    b: { elbowR: [-0.08], handR: [-0.1], elbowL: [-1.35], chest: [0.1, 0.22], spine: [0.08, 0.1], hips: [0.03, 0.08] },
    hp: [0, -0.02, 0.02],
    fl: [0.03, 0, 0.09],
    fr: [0, 0, -0.02, 0.08],
  },
  { t: 1, b: READY, fl: [0.03, 0, 0.09] },
]);

// Draw power in to the chest, then push it out with both hands and hold.
const K_CAST = keyed([
  { t: 0, b: READY },
  {
    t: 0.16,
    sL: [0.85, -0.75],
    sR: [0.85, 0.75],
    b: { elbowL: [-1.9], elbowR: [-1.9], handL: [0.5, 0, 0.3], handR: [0.5, 0, -0.3], spine: [-0.15], chest: [-0.2], head: [-0.1] },
    hp: [0, -0.025, -0.01],
    fl: [0.05, 0, 0.03],
    fr: [-0.05, 0, -0.02],
  },
  {
    t: 0.3,
    e: 'in',
    sL: [1.6, 0.2],
    sR: [1.6, -0.2],
    b: { elbowL: [-0.12], elbowR: [-0.12], handL: [-0.5, 0, 0.3], handR: [-0.5, 0, -0.3], spine: [0.18], chest: [0.25], head: [0.12] },
    hp: [0, -0.03, 0.03],
    fl: [0.05, 0, 0.09],
    fr: [-0.05, 0, -0.04, 0.15],
  },
  {
    t: 0.55,
    e: 'out',
    sL: [1.55, 0.22],
    sR: [1.55, -0.22],
    b: { elbowL: [-0.18], elbowR: [-0.18], handL: [-0.4, 0, 0.3], handR: [-0.4, 0, -0.3], spine: [0.15], chest: [0.2], head: [0.08] },
    hp: [0, -0.03, 0.03],
    fl: [0.05, 0, 0.09],
    fr: [-0.05, 0, -0.04, 0.12],
  },
  { t: 1, b: READY, fl: [0.05, 0, 0.08], fr: [-0.05, 0, -0.03] },
]);

// A bow shot: side-on, bow arm locked out, string hand drawn to the cheek, a
// beat at full draw, the release, and the string hand flying back past the ear.
function bowKeys(up: number, drawAt: number, quick: number): Keyed {
  const bowArm = -1.5 - up;
  return keyed([
    { t: 0, b: READYBOW },
    {
      t: drawAt,
      b: {
        hips: [-0.16 * up, -0.34 + 0.06 * quick],
        spine: [-0.04 - 0.22 * up, -0.2],
        chest: [-0.1 - 0.3 * up, -0.34 + 0.08 * quick],
        head: [-0.4 * up, 0.34],
        shoulderL: [bowArm + 0.26 * quick, 0.42, 0.12],
        elbowL: [-0.1 - 0.2 * quick],
        shoulderR: [bowArm + 0.05 + 0.2 * quick, -0.95 + 0.25 * quick, -0.1],
        elbowR: [-2.1 + 0.4 * quick],
      },
      hp: [0, -0.012, 0],
      fl: [0.13, 0, 0.1],
      fr: [-0.15, 0, -0.12],
    },
    {
      t: 0.3,
      e: 'in',
      b: {
        hips: [-0.16 * up, -0.34],
        spine: [-0.04 - 0.22 * up, -0.2],
        chest: [-0.1 - 0.26 * up, -0.36],
        head: [-0.36 * up, 0.34],
        shoulderL: [bowArm, 0.42, 0.12],
        elbowL: [-0.1],
        shoulderR: [bowArm + 0.2, -0.55, -0.25],
        elbowR: [-1.5],
      },
      hp: [0, -0.012, 0],
      fl: [0.13, 0, 0.1],
      fr: [-0.15, 0, -0.12],
    },
    {
      t: 0.45,
      e: 'out',
      b: {
        hips: [-0.1 * up, -0.32],
        spine: [-0.03 - 0.15 * up, -0.18],
        chest: [-0.06 - 0.2 * up, -0.3],
        head: [-0.25 * up, 0.3],
        shoulderL: [bowArm + 0.1, 0.4, 0.1],
        elbowL: [-0.15],
        shoulderR: [bowArm + 0.45, -0.15, -0.35],
        elbowR: [-0.9],
      },
      hp: [0, -0.01, 0],
      fl: [0.13, 0, 0.1],
      fr: [-0.15, 0, -0.12],
    },
    {
      t: 0.72,
      b: {
        hips: [0, -0.2],
        spine: [-0.02, -0.1],
        chest: [-0.04, -0.2],
        head: [0, 0.2],
        shoulderL: [-1.0, 0.2, 0],
        elbowL: [-0.5],
        shoulderR: [-0.8, 0.3, 0.3],
        elbowR: [-0.5],
      },
      fl: [0.12, 0, 0.08],
      fr: [-0.13, 0, -0.1],
    },
    { t: 1, b: READYBOW, fl: [0.1, 0, 0.06], fr: [-0.1, 0, -0.06] },
  ]);
}
const K_SHOOT = bowKeys(0, 0.17, 0);
const K_SKYSHOT = bowKeys(0.6, 0.17, 0);
const K_SNAPSHOT = bowKeys(0, 0.16, 1);

// Head back, chest open, arms flung wide: shouts, banners, war cries.
const K_ROAR = keyed([
  { t: 0, b: READY },
  {
    t: 0.18,
    sL: [0.9, -0.4],
    sR: [0.9, 0.4],
    b: { elbowL: [-1.6], elbowR: [-1.6], spine: [0.24], chest: [0.3], head: [0.3] },
    hp: [0, -0.03, 0],
    fl: [0.08, 0, 0.02],
    fr: [-0.08, 0, -0.02],
  },
  {
    t: 0.32,
    e: 'in',
    sL: [1.6, 1.3],
    sR: [1.6, -1.3],
    b: { elbowL: [-0.4], elbowR: [-0.4], spine: [-0.3], chest: [-0.42], head: [-0.55] },
    hp: [0, 0.02, 0],
    fl: [0.09, 0, 0.02],
    fr: [-0.09, 0, -0.02],
  },
  {
    t: 0.7,
    e: 'out',
    sL: [1.45, 1.35],
    sR: [1.45, -1.35],
    b: { elbowL: [-0.5], elbowR: [-0.5], spine: [-0.26], chest: [-0.36], head: [-0.45] },
    hp: [0, 0.015, 0],
    fl: [0.09, 0, 0.02],
    fr: [-0.09, 0, -0.02],
  },
  { t: 1, b: READY, fl: [0.09, 0, 0.02], fr: [-0.09, 0, -0.02] },
]);

// Collapse inward and snap back out: teleports, shadow steps, vanishes.
const K_BLINK = keyed([
  { t: 0, b: READY },
  {
    t: 0.26,
    sL: [1.3, -1.0],
    sR: [1.3, 1.0],
    b: { elbowL: [-1.7], elbowR: [-1.7], hips: [0.34, 0.5], spine: [0.4, 0.4], chest: [0.36, 0.36], head: [0.2, 0.3] },
    hp: [0, -0.16, 0],
    fl: [0.08, 0, 0],
    fr: [-0.08, 0, 0],
  },
  {
    t: 0.4,
    e: 'in',
    sL: [1.4, 1.4],
    sR: [1.4, -1.4],
    b: { elbowL: [-0.2], elbowR: [-0.2], hips: [-0.1, -0.2], spine: [-0.24, -0.2], chest: [-0.3, -0.19], head: [-0.24, -0.1] },
    hp: [0, 0.04, 0],
    fl: [0.08, 0, 0.04],
    fr: [-0.08, 0, -0.04],
  },
  {
    t: 0.6,
    e: 'out',
    sL: [0.8, 1.0],
    sR: [0.8, -1.0],
    b: { elbowL: [-0.4], elbowR: [-0.4], spine: [-0.1], chest: [-0.12] },
    hp: [0, 0.01, 0],
    fl: [0.08, 0, 0.04],
    fr: [-0.08, 0, -0.04],
  },
  { t: 1, b: READY, fl: [0.08, 0, 0.04], fr: [-0.08, 0, -0.04] },
]);

// Drop to a knee and set something on the floor: traps, banners, wards.
const K_PLANT = keyed([
  { t: 0, b: READY },
  { t: 0.16, b: READY, hp: [0, -0.1, 0], fl: [0.1, 0.09, 0.17], fr: [-0.06, 0, -0.1] },
  {
    t: 0.34,
    sR: [1.2, 0.2],
    sL: [0.9, 0.3],
    b: { elbowR: [-0.9], elbowL: [-1.15], hips: [0.24, -0.18], spine: [0.3, -0.12], chest: [0.26, -0.16], head: [0.16, -0.1] },
    hp: [0, -0.3, 0],
    fl: [0.2, 0, 0.34],
    fr: [-0.17, 0.08, -0.35],
  },
  {
    t: 0.45,
    e: 'in',
    sR: [1.0, 0.15],
    sL: [0.9, 0.3],
    b: { elbowR: [-0.4], elbowL: [-1.15], hips: [0.24, -0.18], spine: [0.32, -0.12], chest: [0.28, -0.16], head: [0.26, -0.1] },
    hp: [0, -0.32, 0],
    fl: [0.2, 0, 0.34],
    fr: [-0.18, 0, -0.46],
  },
  {
    t: 0.66,
    e: 'out',
    sR: [1.05, 0.15],
    sL: [0.9, 0.3],
    b: { elbowR: [-0.45], elbowL: [-1.15], hips: [0.24, -0.18], spine: [0.3, -0.12], chest: [0.26, -0.16], head: [0.2, -0.1] },
    hp: [0, -0.31, 0],
    fl: [0.2, 0, 0.34],
    fr: [-0.18, 0, -0.46],
  },
  { t: 1, b: READY, fl: [0.12, 0, 0.16], fr: [-0.1, 0, -0.2] },
]);

/** A strike: keyed, with a heavier weapon putting more trunk into it. */
function strike(k1: Keyed, k2: Keyed | null, duration: number, contact: number, aim: [number, number, number]): ClipDef {
  return {
    duration,
    loop: false,
    breath: 0.05,
    contact,
    offHand: true,
    aim: { dir: aim, w: aimAround(contact - 0.14, contact, contact + 0.2, Math.min(1, contact + 0.6)) },
    eval(t, p, rig) {
      const w = rig.wpn;
      sampleAction(w.two && k2 ? k2 : k1, t, p, rig, contact);
      torso(p, 0.8 + 0.4 * w.heavy);
    },
  };
}

function gesture(
  k: Keyed,
  duration: number,
  contact: number,
  extra: Partial<ClipDef> = {},
): ClipDef {
  return {
    duration,
    loop: false,
    breath: 0.1,
    contact,
    eval(t, p, rig) {
      sampleAction(k, t, p, rig, contact);
    },
    ...extra,
  };
}

let _glowTex: THREE.DataTexture | null = null;

/** A round, soft falloff, made once: the spell light's shape. */
function glowTexture(): THREE.DataTexture {
  if (_glowTex) return _glowTex;
  const N = 32;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5;
      const dy = (y + 0.5) / N - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - r, 2.2);
      const i = (y * N + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  _glowTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  _glowTex.needsUpdate = true;
  return _glowTex;
}

/** Stands a bow up in the bow hand from the draw through the loose. */
function bowAim(dir: [number, number, number]): ClipDef['aim'] {
  return { dir: (w) => (w.grip === 'bow' ? dir : null), w: aimAround(0.02, 0.15, 0.5, 0.8) };
}

/** A glow that gathers into the release and fades after it. */
function glowAround(contact: number, hold: number, hands: 'left' | 'right' | 'both'): ClipDef['glow'] {
  return {
    hands,
    w: (t) => kf(t, [
      [0, 0],
      [contact * 0.7, 0.75],
      [contact, 1],
      [hold, 0.6],
      [Math.min(1, hold + 0.3), 0],
    ]),
  };
}

// ---------------------------------------------------------------------------
// Reaction key poses
// ---------------------------------------------------------------------------

// Knocked back: the trunk is thrown back with the arms flung out for balance,
// the back foot steps out behind to catch the weight, then the front follows.
const K_STAGGER = keyed([
  { t: 0, b: READY },
  {
    t: 0.12,
    e: 'out',
    sL: [0.9, 1.4],
    sR: [0.9, -1.4],
    b: { elbowL: [-0.6], elbowR: [-0.6], hips: [-0.1], spine: [-0.32, 0.12], chest: [-0.28, 0.18], head: [-0.3] },
    hp: [0, -0.04, -0.06],
  },
  {
    t: 0.26,
    sL: [0.75, 1.25],
    sR: [0.75, -1.25],
    b: { elbowL: [-0.55], elbowR: [-0.55], hips: [-0.08], spine: [-0.24, 0.1], chest: [-0.2, 0.14], head: [-0.2] },
    hp: [0, -0.05, -0.1],
    fr: [-0.05, 0.1, -0.17],
  },
  {
    t: 0.4,
    sL: [0.55, 1.0],
    sR: [0.55, -1.0],
    b: { elbowL: [-0.5], elbowR: [-0.5], hips: [-0.04], spine: [-0.12, 0.05], chest: [-0.08, 0.08], head: [-0.08] },
    hp: [0, -0.07, -0.16],
    fr: [-0.06, 0, -0.3],
  },
  {
    t: 0.6,
    sL: [0.3, 0.7],
    sR: [0.3, -0.7],
    b: { elbowL: [-0.4], elbowR: [-0.4], spine: [0.04], chest: [0.03] },
    hp: [0, -0.05, -0.12],
    fl: [0.04, 0.06, -0.05],
    fr: [-0.06, 0, -0.3],
  },
  { t: 0.78, b: READY, hp: [0, -0.02, -0.1], fl: [0.04, 0, -0.1], fr: [-0.06, 0, -0.3] },
  { t: 1, b: READY, fl: [0.04, 0, -0.1], fr: [-0.06, 0, -0.3], hp: [0, 0, -0.1] },
]);

// Knocked down: the legs go, the body sits down hard and back, one hand
// behind to break the fall, and stays there dazed while the status lasts.
const K_DOWN = keyed([
  { t: 0, b: READY },
  {
    t: 0.25,
    sL: [0.6, 1.2],
    sR: [0.6, -1.2],
    b: { elbowL: [-0.5], elbowR: [-0.5], hips: [-0.3], spine: [-0.15], chest: [-0.1], head: [-0.2] },
    hp: [0, -0.35, -0.08],
    fl: [0.04, 0.1, 0.22],
    fr: [-0.05, 0.08, 0.16],
  },
  {
    t: 0.55,
    e: 'in',
    sL: [0.5, 2.6],
    sR: [0.75, -2.3],
    b: { elbowL: [-0.2], elbowR: [-0.35], hips: [-0.55], spine: [0.2], chest: [0.12], head: [0.15] },
    hp: [0, -0.8, -0.24],
    fl: [0.06, 0, 0.5],
    fr: [-0.08, 0, 0.4],
  },
  {
    t: 0.7,
    e: 'out',
    sL: [0.5, 2.6],
    sR: [0.75, -2.3],
    b: { elbowL: [-0.25], elbowR: [-0.4], hips: [-0.5], spine: [0.24], chest: [0.15], head: [0.3, 0.15] },
    hp: [0, -0.77, -0.22],
    fl: [0.06, 0, 0.5],
    fr: [-0.08, 0, 0.4],
  },
  {
    t: 1,
    sL: [0.5, 2.6],
    sR: [0.7, -2.3],
    b: { elbowL: [-0.25], elbowR: [-0.45], hips: [-0.52], spine: [0.26], chest: [0.16], head: [0.4, 0.3, 0.1] },
    hp: [0, -0.78, -0.22],
    fl: [0.06, 0, 0.5],
    fr: [-0.08, 0, 0.4],
  },
]);

// Death, falling back: the hit snaps the head back, the knees go, and the body
// topples backwards onto the floor and settles, limbs splayed. Asymmetric on
// purpose: symmetry reads as a ragdoll bug, asymmetry reads as a body. Lying
// on the back, a chest-space azimuth short of +-pi/2 lifts an arm off the
// floor rather than driving it through.
const K_DEATH_BACK = keyed([
  { t: 0, b: READY },
  {
    t: 0.1,
    e: 'out',
    sL: [0.5, 1.1],
    sR: [0.7, -1.2],
    b: { elbowL: [-0.6], elbowR: [-0.5], spine: [-0.25, 0.1], chest: [-0.2, 0.12], head: [-0.4] },
    hp: [0, -0.04, -0.04],
  },
  {
    t: 0.34,
    sL: [0.4, 0.9],
    sR: [0.5, -0.8],
    b: { elbowL: [-0.9], elbowR: [-0.7], hips: [-0.2, 0.1], spine: [0.15, 0.1], chest: [0.1], head: [0.25, 0.2] },
    hp: [0.02, -0.36, -0.06],
    fl: [0.05, 0.04, 0.1],
    fr: [-0.08, 0, 0.04],
  },
  {
    t: 0.62,
    sL: [1.0, 1.3],
    sR: [1.1, -1.2],
    b: { elbowL: [-0.5], elbowR: [-0.4], hips: [-0.85, 0.2, 0.1], spine: [-0.3, 0.1], chest: [-0.15], head: [0.3, 0.3] },
    hp: [0.04, -0.68, -0.26],
    fl: [0.06, 0.05, 0.3],
    fr: [-0.1, 0.04, 0.22],
  },
  {
    t: 0.8,
    e: 'in',
    sL: [1.5, 1.15],
    sR: [1.4, -1.5],
    b: { elbowL: [-0.5], elbowR: [-0.3], hips: [-1.45, 0.25, 0.12], spine: [-0.05, 0.12], chest: [0, 0.08], head: [0.25, 0.55] },
    hp: [0.05, -0.86, -0.36],
    fl: [0.1, 0, 0.5],
    fr: [-0.14, 0.06, 0.38],
  },
  {
    t: 0.88,
    e: 'out',
    sL: [1.45, 1.2],
    sR: [1.4, -1.52],
    b: { elbowL: [-0.55], elbowR: [-0.32], hips: [-1.4, 0.25, 0.12], spine: [-0.08, 0.12], chest: [0.02, 0.08], head: [0.3, 0.6] },
    hp: [0.05, -0.83, -0.36],
    fl: [0.1, 0, 0.5],
    fr: [-0.14, 0.05, 0.38],
  },
  {
    t: 1,
    sL: [1.48, 1.2],
    sR: [1.4, -1.52],
    b: { elbowL: [-0.55], elbowR: [-0.35], hips: [-1.45, 0.25, 0.12], spine: [-0.06, 0.12], chest: [0, 0.08], head: [0.28, 0.62] },
    hp: [0.05, -0.86, -0.36],
    fl: [0.1, 0, 0.52],
    fr: [-0.15, 0.05, 0.38],
  },
]);

// Death, crumpling forward: the knees go first and hit the floor, the trunk
// folds over them, and the body pitches onto its front, face turned aside,
// one arm flung out past the head and the other along the side.
const K_DEATH_FWD = keyed([
  { t: 0, b: READY },
  {
    t: 0.1,
    e: 'out',
    sL: [0.4, 0.8],
    sR: [0.5, -0.9],
    b: { elbowL: [-0.5], elbowR: [-0.6], spine: [-0.18, -0.08], chest: [-0.14], head: [-0.25] },
    hp: [0, -0.04, 0],
  },
  {
    t: 0.4,
    sL: [0.5, 0.3],
    sR: [0.3, -0.4],
    b: { elbowL: [-0.6], elbowR: [-0.4], hips: [0.25, -0.1], spine: [0.3, -0.05], chest: [0.2], head: [0.35] },
    hp: [0, -0.42, 0.06],
    fl: [0.05, 0.05, -0.3],
    fr: [-0.07, 0.04, -0.24],
  },
  {
    t: 0.56,
    sL: [1.4, 0.4],
    sR: [0.6, -0.8],
    b: { elbowL: [-0.5], elbowR: [-0.5], hips: [0.6, -0.12], spine: [0.4], chest: [0.25], head: [0.1, 0.3] },
    hp: [0, -0.5, 0.12],
    fl: [0.05, 0.03, -0.4],
    fr: [-0.08, 0.03, -0.34],
  },
  {
    t: 0.78,
    e: 'in',
    sL: [2.75, 0.5],
    sR: [0.4, -1.85],
    b: { elbowL: [-0.5], elbowR: [-0.1], hips: [1.35, 0.2, 0.15], spine: [0.08, 0.05], chest: [0.04], head: [-0.55, 0.75] },
    hp: [0.05, -0.83, 0.36],
    fl: [0.04, 0.04, -0.75],
    fr: [-0.1, 0.02, -0.82],
  },
  {
    t: 0.87,
    e: 'out',
    sL: [2.75, 0.52],
    sR: [0.4, -1.85],
    b: { elbowL: [-0.55], elbowR: [-0.12], hips: [1.3, 0.2, 0.15], spine: [0.1, 0.05], chest: [0.06], head: [-0.5, 0.8] },
    hp: [0.05, -0.8, 0.35],
    fl: [0.04, 0.05, -0.74],
    fr: [-0.1, 0.03, -0.8],
  },
  {
    t: 1,
    sL: [2.75, 0.52],
    sR: [0.4, -1.85],
    b: { elbowL: [-0.55], elbowR: [-0.12], hips: [1.35, 0.2, 0.15], spine: [0.08, 0.05], chest: [0.05], head: [-0.55, 0.8] },
    hp: [0.05, -0.83, 0.36],
    fl: [0.04, 0.04, -0.76],
    fr: [-0.1, 0.02, -0.82],
  },
]);

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

  // ------------------------------------------------------------- WALK/RUN --
  // Walking and running are not clips any more. Both are one continuous gait
  // driven by how fast the body is really moving over the ground (see
  // `Animator.evalGait` and `Animator.stepFeet`), so these entries only name
  // the state. Their `eval` is never called for the body.
  walk: {
    duration: 1,
    loop: true,
    locomotion: true,
    breath: 0.4,
    eval() {},
  },
  run: {
    duration: 1,
    loop: true,
    locomotion: true,
    breath: 0.25,
    eval() {},
  },

  // --------------------------------------------------------------- STRIKES --
  // Overhead chop, right hand leading; both hands with a two-handed weapon.
  attack1: strike(K_CHOP, K_CHOP2, 0.62, 0.3, [0, -0.3, 1]),
  // Horizontal sweep across the body; reads completely differently from the
  // chop at a glance, which is the point of having two.
  attack2: strike(K_SWEEP, K_SWEEP2, 0.6, 0.3, [0.25, -0.1, 1]),
  /** Overhead two-handed smash: wind up tall, then drive down through the target. */
  slam: { ...strike(K_SLAM, null, 0.72, 0.36, [0, -0.75, 0.66]), breath: 0.03 },
  /** A stab: the hand chambers at the hip and drives straight out. */
  thrust: strike(K_THRUST, null, 0.5, 0.3, [0, -0.12, 1]),
  /** A long step-through stab that travels after the point. */
  lunge: strike(K_LUNGE, null, 0.56, 0.32, [0, -0.1, 1]),

  // -------------------------------------------------------------- GESTURES --
  /** Drawing and loosing a bow, side-on, with a beat at full draw. */
  shoot: gesture(K_SHOOT, 0.5, 0.3, { breath: 0.1, gaze: 0, aim: bowAim([0, 1, 0.1]) }),
  /** Draw and loose high: arrow rain, volleys called down on a point. */
  skyshot: gesture(K_SKYSHOT, 0.62, 0.3, { breath: 0.1, gaze: 0, aim: bowAim([0, 0.8, -0.6]) }),
  /** A snap shot from a half draw, so eleven bow skills are not one gesture. */
  snapshot: gesture(K_SNAPSHOT, 0.36, 0.3, { breath: 0.1, gaze: 0, aim: bowAim([0.25, 1, 0.1]) }),

  /** Sustained two-handed output: arms forward, braced, holding the line. */
  channel: {
    duration: 0.9,
    loop: true,
    breath: 0.3,
    glow: { hands: 'both', w: (t) => 0.8 + 0.2 * Math.sin(t * TAU) },
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

      p.foot(0, h * 0.09, 0, h * 0.1, 0);
      p.foot(1, -h * 0.09, 0, -h * 0.12, 0);
    },
  },

  /** One arm snapped out, finger first: commands, curses, marks, summons. */
  point: gesture(K_POINT, 0.54, 0.28, { glow: glowAround(0.28, 0.55, 'right') }),
  /** Drop to a knee and set something on the floor: traps, banners, wards. */
  plant: gesture(K_PLANT, 0.66, 0.45, { breath: 0.05, glow: glowAround(0.45, 0.66, 'right') }),
  /** Collapse inward and snap back out: teleports, shadow steps, vanishes. */
  blink: gesture(K_BLINK, 0.4, 0.4, { breath: 0, glow: glowAround(0.4, 0.5, 'both') }),
  /** An overhand throw: vials, bombs, anything lobbed. */
  hurl: { ...gesture(K_HURL, 0.52, 0.3), aim: { dir: [0, 0.2, 1], w: aimAround(0.16, 0.3, 0.36, 0.5) } },
  /** Rise and drive both feet down: ground novas, quakes, shockwaves. */
  stomp: gesture(K_STOMP, 0.66, 0.4, { breath: 0.05 }),
  /** Head back, chest open, arms flung wide: shouts, banners, war cries. */
  roar: gesture(K_ROAR, 0.8, 0.32, { breath: 0.15 }),
  /** Draw power in, then push it out with both hands. */
  cast: gesture(K_CAST, 0.8, 0.3, {
    breath: 0.15,
    glow: glowAround(0.3, 0.55, 'both'),
    // A staff is raised and thrust out head first; a wand points the way.
    aim: {
      dir: (w) => (w.grip === 'staff' ? [0, 1, 0.45] : w.grip === 'wand' ? [0, 0.15, 1] : null),
      w: aimAround(0.05, 0.25, 0.6, 0.95),
    },
  }),

  // ------------------------------------------------------------- REACTIONS --
  // A plain hit no longer plays a clip at all: `play('hurt')` is an additive
  // flinch on top of whatever the body is doing (see `Animator.flinch`), so a
  // hit never cuts a swing short or stops the legs. This clip is what the
  // flinch looked like as a whole-body one-shot, kept for callers that want it.
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
      p.foot(0, h * 0.02, 0, -h * 0.05 * hit, 0);
      p.foot(1, -h * 0.04, 0, -h * 0.08 * hit, 0);
    },
  },

  /** Knocked back: thrown back, a catching step behind, and recover. */
  stagger: { ...gesture(K_STAGGER, 0.6, 0.12, { breath: 0, gaze: 0.4 }), recover: 0.45 },

  /** Stunned: knees soft, swaying in small circles, the head lolling. */
  stun: {
    duration: 1.7,
    loop: true,
    breath: 0.5,
    gaze: 0,
    // Whatever is in the hands hangs from them, point down.
    aim: { dir: [0, -1, 0.25], w: () => 0.7 },
    eval(t, p, rig) {
      const h = rig.hipY;
      const a = TAU * t;
      const s = Math.sin(a);
      const c = Math.cos(a);
      p.move('hips', s * h * 0.03, -h * 0.07 + Math.sin(2 * a) * h * 0.008, c * h * 0.02);
      p.set('hips', 0.1, s * 0.05, s * 0.07);
      p.set('spine', 0.16 + c * 0.04, -s * 0.04, -s * 0.05);
      p.set('chest', 0.1, -s * 0.06, -s * 0.04);
      p.set('head', 0.32 + Math.sin(2 * a + 0.6) * 0.1, Math.sin(a + 0.9) * 0.3, Math.cos(a + 0.9) * 0.18);
      // The arms hang dead and swing a beat behind the sway.
      p.set('shoulderL', 0.06 + Math.sin(a - 0.8) * 0.06, 0, 0.08 + Math.cos(a - 0.8) * 0.05);
      p.set('shoulderR', 0.06 + Math.sin(a - 0.8) * 0.06, 0, -0.08 + Math.cos(a - 0.8) * 0.05);
      p.set('elbowL', -0.12, 0, 0.04);
      p.set('elbowR', -0.12, 0, -0.04);
      p.foot(0, h * 0.06, 0, h * 0.03, 0);
      p.foot(1, -h * 0.06, 0, -h * 0.03, 0);
    },
  },

  /** Knocked down: sits down hard, a hand behind, and stays there dazed. */
  down: { ...gesture(K_DOWN, 0.6, 0.55, { breath: 0.3, gaze: 0 }), travel: true },

  // ----------------------------------------------------------------- DEATH --
  /** Dies falling back onto the floor. */
  death: { ...gesture(K_DEATH_BACK, 1.3, 0.8, { breath: 0, gaze: 0 }), travel: true },
  /** Dies crumpling forward onto the knees and then the face. */
  deathFwd: { ...gesture(K_DEATH_FWD, 1.3, 0.78, { breath: 0, gaze: 0 }), travel: true },

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

// ---------------------------------------------------------------------------
// Personas: how the people in camp stand about
// ---------------------------------------------------------------------------

const _swq = new THREE.Quaternion();

/** Points an arm along a swing direction (see `KeyPose.sL`), at weight `w`. */
function swingArm(p: Pose, side: 0 | 1, elev: number, azim: number, w: number): void {
  swingQuat(elev, azim, 0, _swq);
  p.sq[side * 4] = _swq.x;
  p.sq[side * 4 + 1] = _swq.y;
  p.sq[side * 4 + 2] = _swq.z;
  p.sq[side * 4 + 3] = _swq.w;
  p.sw[side] = clamp01(w);
}

/** 0..1 within a repeating cycle of `period` seconds. */
function cyc(t: number, period: number): number {
  return (((t / period) % 1) + 1) % 1;
}

/**
 * Idle layers for camp residents, written over the plain idle. Each shows a
 * trade at a glance from across the camp: the smith hammers, the trader reads
 * his ledger, the healer prays, the keeper holds up his lantern and watches,
 * the guard scans, the listener sways, the drinker drinks. Residents whose
 * tool is two-handed have their arms on it (the carry pose wins), so theirs
 * live in the trunk and head.
 */
const PERSONAS: Record<string, (p: Pose, t: number, rig: Rig) => void> = {
  // The smith: bent over the anvil, hammering in a steady rhythm, a pause to
  // straighten and roll the shoulders every so often.
  kale(p, t, rig) {
    const h = rig.hipY;
    const round = cyc(t, 9);
    const work = round < 0.78 ? 1 : 1 - smooth((round - 0.78) / 0.08) + smooth((round - 0.94) / 0.06);
    const k = cyc(t, 1.1);
    const raise = kf(k, [
      [0, 0],
      [0.5, 1],
      [0.66, 1],
      [0.78, 0],
      [1, 0],
    ]);
    const jolt = k > 0.78 && k < 0.9 ? Math.sin(((k - 0.78) / 0.12) * Math.PI) : 0;
    p.add('spine', 0.22 * work + 0.03 * jolt, 0, 0);
    p.add('chest', 0.12 * work, -0.1 * work, 0);
    p.add('head', 0.25 * work, 0.1 * work, 0);
    p.nudge('hips', 0, -h * 0.03 * work, -h * 0.03 * work);
    // Hammer arm: up over the shoulder, then down onto the anvil at the waist.
    swingArm(p, 1, lerp(0.15, 0.9 + 2.0 * raise, work), lerp(-1.4, -0.15, work), work);
    p.set('elbowR', lerp(-0.22, -0.35 - 1.5 * raise, work), 0, 0);
    p.set('handR', lerp(0, -1.3 * (1 - raise), work), 0, 0);
    // The other hand holds the work on the anvil.
    swingArm(p, 0, lerp(0.15, 0.75, work), lerp(1.4, -0.25, work), work);
    p.set('elbowL', lerp(-0.22, -0.9, work), 0, 0);
    // The stretch between rounds.
    const stretch = 1 - work;
    p.add('chest', -0.12 * stretch, 0, 0);
    p.add('head', -0.15 * stretch, 0, 0.1 * stretch * Math.sin(t * 3));
  },
  // The trader: nose in the ledger, the other hand fidgeting with his keys,
  // looking up now and then as if someone had called.
  hesk(p, t) {
    const look = smooth(kf(cyc(t, 8), [
      [0, 0],
      [0.72, 0],
      [0.78, 1],
      [0.93, 1],
      [1, 0],
    ]));
    p.add('head', 0.34 - 0.4 * look, 0.25 * look, 0);
    p.add('chest', 0.06, 0.08, 0);
    swingArm(p, 0, 0.5, -0.35, 1);
    p.set('elbowL', -1.45, 0, 0);
    swingArm(p, 1, 0.35 + 0.15 * look, 0.25, 1);
    p.set('elbowR', -1.1 + Math.sin(t * 3.1) * 0.12 - 0.3 * look, 0, 0);
    p.set('handR', Math.sin(t * 5.3) * 0.15, 0, 0);
  },
  // The healer: hands folded in front, head bowed in a slow prayer, now and
  // then reaching into the satchel at her hip.
  vell(p, t) {
    const reach = smooth(kf(cyc(t, 11), [
      [0, 0],
      [0.8, 0],
      [0.86, 1],
      [0.94, 1],
      [1, 0],
    ]));
    const nod = Math.sin(t * 0.7) * 0.06;
    p.add('head', 0.22 + nod - 0.05 * reach, 0.2 * reach, 0);
    p.add('spine', 0.05, 0, 0);
    swingArm(p, 0, 0.5, -0.65, 1);
    p.set('elbowL', -1.75, 0, 0);
    swingArm(p, 1, 0.5 - 0.25 * reach, 0.65 + 0.9 * reach, 1);
    p.set('elbowR', -1.75 + 1.1 * reach, 0, 0);
  },
  // The keeper: lantern held up and out, eyes moving slowly round the camp,
  // keys at his hip.
  corvane(p, t) {
    const scan = Math.sin(t * 0.33) * 0.55;
    p.add('head', -0.05, scan, 0);
    p.add('chest', 0, scan * 0.25, 0);
    swingArm(p, 0, 1.15 + Math.sin(t * 0.9) * 0.03, 0.4, 1);
    p.set('elbowL', -1.0, 0, 0);
    swingArm(p, 1, 0.25, -0.2, 1);
    p.set('elbowR', -0.9 + Math.max(0, Math.sin(t * 6)) * 0.08, 0, 0);
  },
  // The stonecutter at the cairn, leaning on his spear, looking at the work.
  marrow(p, t, rig) {
    const h = rig.hipY;
    p.nudge('hips', -h * 0.03, -h * 0.01, 0);
    p.add('hips', 0, 0, -0.05);
    p.add('spine', 0.1, 0, 0.06);
    p.add('head', 0.28 + Math.sin(t * 0.5) * 0.05, -0.2, 0.05);
    p.add('chest', -Math.sin(t * 0.8) * 0.02, 0, 0);
  },
  // The guard: upright, shifting weight, turning his head in slow sweeps that
  // stop and hold on something.
  renn(p, t, rig) {
    const h = rig.hipY;
    const k = cyc(t, 10);
    const yaw = kf(k, [
      [0, -0.55],
      [0.12, -0.55],
      [0.3, 0.1],
      [0.45, 0.1],
      [0.62, 0.6],
      [0.8, 0.6],
      [1, -0.55],
    ]);
    p.add('head', -0.06, yaw, 0);
    p.add('chest', -0.04, yaw * 0.2, 0);
    p.nudge('hips', Math.sin(t * 0.4) * h * 0.02, 0, 0);
    p.add('hips', 0, 0, Math.sin(t * 0.4) * 0.03);
  },
  // The listener: eyes up, head tilted, swaying as if to something only he hears.
  listener(p, t) {
    const s = Math.sin(t * 0.55);
    p.add('hips', 0, 0, s * 0.04);
    p.add('spine', 0, 0, -s * 0.05);
    p.add('chest', -0.04, s * 0.04, -s * 0.03);
    p.add('head', -0.18 + Math.sin(t * 0.31) * 0.06, 0.12, 0.22 + Math.sin(t * 0.37) * 0.1);
  },
  // The drinker: tankard at the chest, up to the mouth every few seconds with
  // the head back, and a laugh that shakes the shoulders.
  gilder(p, t) {
    const k = cyc(t, 6.5);
    const drink = smooth(kf(k, [
      [0, 0],
      [0.5, 0],
      [0.6, 1],
      [0.75, 1],
      [0.86, 0],
      [1, 0],
    ]));
    const laugh = k > 0.88 && k < 0.98 ? Math.sin(t * 22) * 0.04 : 0;
    p.set('shoulderR', -0.55 - 1.0 * drink, 0.15 + 0.45 * drink, -0.1);
    p.set('elbowR', -1.5 - 0.6 * drink, 0, 0);
    p.add('head', -0.35 * drink + laugh * 2, 0, 0);
    p.add('chest', -0.08 * drink + laugh, 0, 0);
    p.add('shoulderL', laugh * 2, 0, 0);
  },
  // The cartographer: reading the map, glancing up at the horizon now and then.
  wenna(p, t) {
    const up = smooth(kf(cyc(t, 7), [
      [0, 0],
      [0.68, 0],
      [0.75, 1],
      [0.9, 1],
      [1, 0],
    ]));
    p.add('head', 0.3 - 0.4 * up, 0.28 - 0.3 * up, 0);
    p.add('chest', 0.04, 0.1, 0);
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
  /**
   * Seconds from now to the moment the blow lands (or the spell leaves the
   * hand). The clip is time-warped so its contact key arrives exactly then,
   * and plays its follow-through at `speed` after it.
   */
  contact?: number;
  /** Fired when a one-shot finishes. */
  onEnd?: () => void;
  /** Plays even while a condition (stunned, knocked down) holds the body. */
  force?: boolean;
}

/**
 * What a status is doing to the body. `stunned` sways dazed on the spot,
 * `frozen` holds the exact pose it was caught in (ice, stone), `down` sits
 * knocked over until it wears off, `rooted` keeps the feet where they are.
 */
export type BodyCondition = 'none' | 'stunned' | 'frozen' | 'down' | 'rooted';

interface Track {
  name: ClipName;
  def: ClipDef;
  time: number;
  speed: number;
  once: boolean;
  hold: boolean;
  done: boolean;
  onEnd?: () => void;
  /** Seconds since the track started, unaffected by its playback rate. */
  age: number;
  /**
   * Where the feet were when this one-shot began, and where the clip itself
   * wants them at its first frame. The difference is stepped out over the
   * first fraction of a second instead of being skated across the floor.
   * Only for clips that travel; every other action holds its feet with
   * `holdFeet`.
   */
  entry?: Float32Array;
  /** Normalised clip time per second until the contact key, when warped. */
  warp?: number;
  /** How much of the authored wind-up there is time for, 0..1. */
  antic?: number;
}

/**
 * One foot during an action, in character space. Planted, it stays on its
 * spot of floor whatever the body does over it; when the clip wants it more
 * than a short distance away, or lifts it, it steps there.
 */
interface ActionFoot {
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  k: number;
  dur: number;
  /** Where the step started, a spot on the floor. */
  sx: number;
  sz: number;
  syaw: number;
  lift: number;
  /** Height the step started from, when it began in the air. */
  drop: number;
  /** Ground velocity the step started with (a foot caught mid-stride), m/s. */
  vx: number;
  vz: number;
}

function newActionFoot(): ActionFoot {
  return { x: 0, z: 0, yaw: 0, moving: false, k: 0, dur: 0.14, sx: 0, sz: 0, syaw: 0, lift: 0, drop: 0, vx: 0, vz: 0 };
}

// ---------------------------------------------------------------------------
// Gait
// ---------------------------------------------------------------------------

/**
 * One foot of the stepping gait, in character space (metres, +Z forward, +X
 * the character's left), as the absolute ankle position over the ground.
 */
interface Foot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  contact: boolean;
  /** Where the current swing started, including its lift and rocker. */
  fx: number;
  fy: number;
  fz: number;
  fyaw: number;
  /** Pitch at the start of the current swing or contact. */
  fpitch: number;
  /** Progress through the current swing, or through the current contact. */
  k: number;
  /** Fraction of a cycle this swing was given when it began. */
  span: number;
  /** This foot's clock last frame, to see it wrap into a new cycle. */
  last: number;
  /** Whether this foot has already lifted in the current cycle. */
  lifted: boolean;
  /** Landing spot, fixed to the floor once the foot starts coming down. */
  tx: number;
  tz: number;
  locked: boolean;
}

function newFoot(): Foot {
  return {
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, contact: true,
    fx: 0, fy: 0, fz: 0, fyaw: 0, fpitch: 0, k: 0, span: 0.4, last: 0, lifted: false,
    tx: 0, tz: 0, locked: false,
  };
}

/**
 * Gait cycles per second. Cadence rises with speed, and stride makes up the
 * rest until a foot would have to stay on the ground further than `span`:
 * past that the legs turn over faster instead of reaching further, because a
 * leg reaching past its length either hyperextends or drags the pelvis down.
 */
function cadence(v: number, duty: number, span: number): number {
  return Math.max(0.86 + 0.22 * Math.min(v, 8), (v * duty) / span);
}

/** Speeds the walk turns into a run across, m/s. */
const WALK_TOP = 2.0;
const RUN_FROM = 3.6;
/** Ground speeds a caller's 'walk'/'run' stand for when nothing is followed. */
const TREADMILL_WALK = 1.4;
const TREADMILL_RUN = 4.6;
/** Fraction of full leg length past which the knee eases rather than locks. */
const SOFT_FROM = 0.975;
/** A body that moves further than this in one frame was placed, not walked. */
const TELEPORT = 0.45;

// ---------------------------------------------------------------------------
// Animator
// ---------------------------------------------------------------------------

const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _qC = new THREE.Quaternion();
const _qH = new THREE.Quaternion();
const _qAim = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _vec = new THREE.Vector3();
const _target = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _m4b = new THREE.Matrix4();
const _pole = new THREE.Vector3();
const _elb = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _dirA = new THREE.Vector3();
const _dirB = new THREE.Vector3();
/**
 * Where the off hand holds a two-handed weapon, in the weapon's own frame
 * (grip at the origin, business end up +Y), measured from the carry poses.
 */
const HAFT_TWOHAND = new THREE.Vector3(0, 0.19, -0.03);
const HAFT_STAFF = new THREE.Vector3(0, 0.32, -0.03);
/** A two-handed sword's hilt, under the guard: where the off hand goes in a swing. */
const HILT_TWOHAND = new THREE.Vector3(0, -0.11, -0.02);
const _haft = new THREE.Vector3();
const _goal = new THREE.Vector3();
const _qD = new THREE.Quaternion();
const _m4c = new THREE.Matrix4();
const _armE = new THREE.Vector3();
const _armA = new THREE.Vector3();
const _armB = new THREE.Vector3();
const _armQ = new THREE.Quaternion();
const _armH = new THREE.Vector3();

/**
 * Two-bone arm solve in the parent's frame. `S` is the shoulder, `u0` and `f0`
 * the rest upper arm and forearm (bones have no bind rotation, so these are
 * plain vectors), `T` where the wrist must go and `pole` which way the elbow
 * points (consumed). Writes the shoulder and elbow rotations.
 */
function solveArm(
  S: THREE.Vector3,
  u0: THREE.Vector3,
  f0: THREE.Vector3,
  T: THREE.Vector3,
  pole: THREE.Vector3,
  qs: THREE.Quaternion,
  qe: THREE.Quaternion,
): void {
  const a = u0.length();
  const b = f0.length();
  _armA.subVectors(T, S);
  let d = _armA.length();
  if (d < 1e-5) _armA.set(0, -1, 0);
  else _armA.divideScalar(d);
  d = Math.max(Math.abs(a - b) + 1e-3, Math.min((a + b) * 0.999, d));
  pole.addScaledVector(_armA, -pole.dot(_armA));
  if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0).addScaledVector(_armA, -_armA.y);
  pole.normalize();
  const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  _armE.copy(S).addScaledVector(_armA, a * cosA).addScaledVector(pole, a * sinA);
  // Shoulder: the rest upper arm onto the shoulder-elbow line.
  qs.setFromUnitVectors(_armB.copy(u0).normalize(), _armA.subVectors(_armE, S).normalize());
  // Elbow: the rest forearm onto the elbow-wrist line, in the shoulder's frame.
  _armH.subVectors(T, S).normalize().multiplyScalar(d).add(S);
  _armA.subVectors(_armH, _armE).normalize().applyQuaternion(_armQ.copy(qs).invert());
  qe.setFromUnitVectors(_armB.copy(f0).normalize(), _armA);
}
const _AXIS_X = new THREE.Vector3(1, 0, 0);
const _AXIS_Y = new THREE.Vector3(0, 1, 0);
const _DOWN = new THREE.Vector3(0, -1, 0);
const SIDES: ReadonlyArray<0 | 1> = [0, 1];
/** Root down to the right hand, the chain whose rotations place the weapon. */
const ARM_CHAIN_R = [SLOT.root, SLOT.hips, SLOT.spine, SLOT.chest, SLOT.shoulderR, SLOT.elbowR];
const ARM_CHAIN_L = [SLOT.root, SLOT.hips, SLOT.spine, SLOT.chest, SLOT.shoulderL, SLOT.elbowL];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

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
  private poseIdle = new Pose();
  private poseGait = new Pose();

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

  // -- ground motion -------------------------------------------------------

  /** The object whose position and yaw are the body's motion over the floor. */
  private followed: THREE.Object3D | null = null;
  private lastX = 0;
  private lastZ = 0;
  private lastYaw = 0;
  private hasLast = false;
  /** This frame's body displacement in character space, and its turn. */
  private moveX = 0;
  private moveZ = 0;
  private moveYaw = 0;
  /** Smoothed ground velocity in character space, m/s. */
  private velX = 0;
  private velZ = 0;
  private speed = 0;
  private accel = 0;
  private yawRate = 0;

  // -- gait ----------------------------------------------------------------

  private phase = 0;
  /** 0 walking, 1 running. */
  private gait = 0;
  /** Fraction of a cycle each foot spends on the ground. */
  private duty = 0.62;
  /** 0 standing, 1 moving: how much of the gait body shows over the idle. */
  private moveW = 0;
  private idleT = 0;
  private feet: [Foot, Foot] = [newFoot(), newFoot()];
  /** True once the feet have been taken over from an action and need a start. */
  private resync = true;
  private pelvisDrop = 0;
  /** How much each gait foot still holds the pelvis down, 0..1. */
  private guardW = [1, 1];
  private pelvisVel = 0;
  private lean = 0;
  private leanVel = 0;
  private bank = 0;
  private bankVel = 0;
  /** Weight of the locomotion states in the pose that was last applied. */
  private locoW = 1;
  /** The feet exactly as last applied, so the next state can start there. */
  private outIk = new Float32Array(8);
  /** The feet the frame before, and that frame's length: how fast they were moving. */
  private prevIk = new Float32Array(8);
  private lastReal = 0;
  private outYaw = new Float32Array(2);

  setGrip(grip: CarryGrip): void {
    this.grip = grip;
  }

  /**
   * What the main hand holds (a `WeaponGrip` from CharacterModels: sword,
   * axe, mace, dagger, wand, twoHand, staff, bow or none). A dagger flicks,
   * a greataxe puts the whole body into it.
   */
  setWeapon(grip: string, category?: string): void {
    this.rig.wpn = weaponStyle(grip);
    this.hilt = category === 'sword';
  }

  /** The two-handed weapon is a sword, held by its hilt rather than a haft. */
  private hilt = false;

  /**
   * Spell light in the hands right now, 0..1: gathers into a cast's release
   * and fades after it. The feel stream lights the hands from this; the
   * animator draws nothing itself.
   */
  get castGlow(): number {
    const g = this.cur.def.glow;
    if (!g || this.cur.done) return 0;
    const fade = this.prev ? smooth(clamp01(this.fadeTime / Math.max(1e-5, this.fadeDur))) : 1;
    return clamp01(g.w(this.cur.time)) * fade;
  }

  /** Which hands `castGlow` lights. */
  get castHands(): 'left' | 'right' | 'both' | null {
    return this.cur.def.glow && !this.cur.done ? this.cur.def.glow.hands : null;
  }

  /**
   * The running action, for tools and debug: its clip, how far through it
   * is (0..1) and where its contact key sits. Null while only moving.
   */
  get actionState(): { clip: ClipName; t: number; contact: number | null } | null {
    if (this.cur.def.locomotion || this.cur.done) return null;
    return { clip: this.cur.name, t: this.cur.time, contact: this.cur.def.contact ?? null };
  }

  /**
   * Reads the body's real motion from `obj` (its position and `rotation.y`),
   * which is what lets planted feet stay put on the floor while the body
   * travels and turns over them. Without it, walk and run play on a treadmill
   * at a nominal speed.
   */
  follow(obj: THREE.Object3D | null): void {
    this.followed = obj;
    this.hasLast = false;
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
      hipsRest: hips ? hips.position.clone() : new THREE.Vector3(0, hipY, 0),
      // Proportions of the foot that CharacterModels builds: the toe wedge
      // runs well forward of the ankle, the heel only a little behind it.
      toe: hipY * 0.13,
      heel: hipY * 0.045,
      wpn: weaponStyle('none'),
      antic: 1,
    };

    this.cur = {
      name: 'idle',
      def: CLIPS.idle,
      time: 0,
      speed: 1,
      once: false,
      hold: false,
      done: false,
      age: 0,
    };
    for (const side of SIDES) {
      this.restFoot(side, _target);
      this.feet[side].x = _target.x;
      this.feet[side].z = _target.z;
    }
    // Long hair and the like: rigged now, while the skeleton is still at bind.
    try {
      this.secondary = SecondaryMotion.attach(bones);
    } catch {
      this.secondary = null;
    }
  }

  /** Hair that swings after the head, when the body has any. */
  private secondary: SecondaryMotion | null = null;

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
    let resolved = resolveClip(name);
    // A hit is a flinch laid over whatever the body is doing, not a clip that
    // replaces it: a swing keeps swinging and the legs keep stepping.
    if (resolved === 'hurt') {
      this.flinch(1);
      return;
    }
    if (resolved === 'stagger') {
      this.staggerAt = this.elapsed;
      // Never knock a blow out of the hands before it lands: the game will
      // still apply it at its contact frame.
      const c = this.cur.def.contact;
      if (this.inAction && c !== undefined && this.cur.time < c) {
        this.flinch(1.4);
        return;
      }
    }
    if (resolved === 'death') {
      // Thrown back by a heavy blow; otherwise either way, alternating.
      resolved = this.elapsed - this.staggerAt < 0.8 || this.flinchSide > 0 ? 'death' : 'deathFwd';
    }
    const dying = resolved === 'death' || resolved === 'deathFwd';
    if ((this.condition === 'stunned' || this.condition === 'down') && !opts.force && !dying) return;
    const def = CLIPS[resolved];

    // An action in flight beats any locomotion request, until it is past its
    // blow: then a real move order takes over and the follow-through blends
    // into the stride instead of skating along under it.
    if (def.locomotion && this.inAction && !opts.force) {
      const recover = this.cur.def.recover ?? this.cur.def.contact;
      const moving = !this.followed || this.speed > 0.25;
      if (resolved === 'idle' || recover === undefined || this.cur.time < recover || !moving) return;
    }

    if (this.cur.name === resolved && !opts.restart) {
      if (opts.speed !== undefined) this.cur.speed = opts.speed;
      if (opts.onEnd) this.cur.onEnd = opts.onEnd;
      // Re-triggering a finished one-shot restarts it.
      if (!this.cur.done) return;
      if (def.loop) return;
    }

    // Walk, run and idle are one continuous gait, so moving between them is
    // not a crossfade at all: the track is renamed and the gait carries on.
    if (def.locomotion && this.cur.def.locomotion && !this.cur.done) {
      this.cur.name = resolved;
      this.cur.def = def;
      this.cur.speed = opts.speed ?? 1;
      return;
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

    const track: Track = {
      name: resolved,
      def,
      time: 0,
      speed: opts.speed ?? 1,
      once: opts.once ?? !def.loop,
      hold: opts.hold ?? false,
      done: false,
      onEnd: opts.onEnd,
      age: 0,
    };
    if (def.contact !== undefined && opts.contact !== undefined) {
      track.warp = def.contact / Math.max(0.03, opts.contact);
      // A wind-up needs time to read. With less than that the body goes more
      // directly to the blow instead of cramming a full wind-up into a blink.
      track.antic = Math.max(0.3, Math.min(1, (opts.contact - 0.04) / 0.1));
    }
    if (!def.locomotion) {
      if (def.travel) track.entry = this.entryFeet(def);
      // Feet already held by an action stay exactly as they are (one may be
      // mid-step); feet coming out of the gait or a dash start planted where
      // they were last put.
      else if (this.cur.def.locomotion || this.cur.def.travel || this.cur.done) this.plantActionFeet();
    }
    this.cur = track;
  }

  private persona = '';
  private personaOffset = 0;

  /**
   * Who this body is, for the way it stands about: a camp resident's id
   * (`kale`, `hesk`, `vell`, `corvane`, `marrow`, `renn`, `listener`,
   * `gilder`, `wenna`) gives them an idle that shows their trade. Unknown
   * ids keep the plain idle.
   */
  setPersona(id: string): void {
    this.persona = id in PERSONAS ? id : '';
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    this.personaOffset = (h % 1000) / 100;
  }

  /** Called by movement code so the torso leans into acceleration. */
  setLean(bias: number): void {
    this.leanBias = bias;
  }

  // -- reactions ----------------------------------------------------------------

  private condition: BodyCondition = 'none';
  private flinchT = 1;
  private flinchK = 0;
  private flinchSide = 1;
  private staggerAt = -9;

  /**
   * A hit, laid over whatever the body is doing: the trunk and head snap back
   * and the shoulders come up, then it all settles. Each hit twists the other
   * way, so a flurry of them does not look like one flinch on a loop.
   */
  flinch(strength = 1): void {
    this.flinchT = 0;
    this.flinchK = Math.max(0, Math.min(1.6, strength));
    this.flinchSide = -this.flinchSide;
  }

  /** What a status is doing to the body; call every frame, cheap when unchanged. */
  setCondition(c: BodyCondition): void {
    if (c === this.condition) return;
    const was = this.condition;
    this.condition = c;
    this.pinned = c === 'rooted';
    const dead = this.cur.name === 'death' || this.cur.name === 'deathFwd';
    if (dead) return;
    if (c === 'stunned') this.play('stun', { fade: 0.2, force: true });
    else if (c === 'down') this.play('down', { fade: 0.08, hold: true, force: true });
    else if (was === 'stunned' || was === 'down') this.play('idle', { fade: 0.35, force: true });
  }

  /** The flinch layer, over everything else. */
  private applyFlinch(pose: Pose, real: number): void {
    if (this.flinchT >= 1) return;
    this.flinchT = Math.min(1, this.flinchT + real / 0.4);
    const k =
      kf(this.flinchT, [
        [0, 0],
        [0.14, 1],
        [0.45, 0.4],
        [1, 0],
      ]) *
      this.flinchK *
      (this.inAction ? 0.5 : 1);
    if (k < 1e-4) return;
    const s = this.flinchSide;
    const h = this.rig.hipY;
    pose.add('spine', -0.2 * k, 0.07 * k * s, 0.05 * k * s);
    pose.add('chest', -0.18 * k, 0.1 * k * s, 0.06 * k * s);
    pose.add('head', -0.28 * k, 0.16 * k * s, 0.05 * k * s);
    pose.add('shoulderL', -0.3 * k, 0, 0.25 * k);
    pose.add('shoulderR', -0.3 * k, 0, -0.25 * k);
    pose.add('elbowL', -0.35 * k, 0, 0);
    pose.add('elbowR', -0.35 * k, 0, 0);
    pose.nudge('hips', 0, -h * 0.02 * k, -h * 0.035 * k);
  }

  update(dt: number): void {
    const real = Math.max(0, Math.min(0.1, dt));
    // Frozen solid: the body holds exactly the pose it was caught in. Ground
    // motion is still read so nothing jumps when it thaws.
    if (this.condition === 'frozen') {
      // Re-read on thaw rather than decaying the remembered speed to zero,
      // which would yank a swinging foot's landing spot.
      this.hasLast = false;
      return;
    }
    const step = real * this.timeScale;
    this.elapsed += step;
    this.idleT = (this.idleT + step / CLIPS.idle.duration) % 1;

    this.sampleMotion(real);
    if (this.cur.entry) this.carryEntry(this.cur.entry);
    this.advance(this.cur, step);
    if (this.prev) {
      this.advance(this.prev, step);
      this.fadeTime += step;
      if (this.fadeTime >= this.fadeDur) this.prev = null;
    }

    // How much of the body belongs to the gait this frame.
    const fadeW = this.prev ? smooth(clamp01(this.fadeTime / Math.max(1e-5, this.fadeDur))) : 1;
    this.locoW =
      (this.cur.def.locomotion ? fadeW : 0) + (this.prev && this.prev.def.locomotion ? 1 - fadeW : 0);

    this.stepFeet(step);

    // Evaluate the active clip.
    this.poseA.reset();
    this.evaluate(this.cur, this.poseA);

    let pose = this.poseA;
    if (this.prev) {
      this.poseB.reset();
      this.evaluate(this.prev, this.poseB);
      Pose.blend(this.poseB, this.poseA, fadeW, this.poseOut);
      pose = this.poseOut;
    }

    // Once locomotion is current the gait owns the feet outright, even while
    // the rest of the body is still fading out of an action: it started from
    // exactly where the action left them, and it keeps them on the floor.
    // The same goes the other way: an action owns the feet from its first
    // frame and holds them on the floor itself.
    if (this.cur.def.locomotion && pose !== this.poseA) this.writeFeet(pose);
    else if (!this.cur.def.locomotion && !this.cur.def.travel) this.holdFeet(pose, this.poseA, step);

    this.applyProcedural(pose, step, real);
    this.guardReach(pose, real);
    this.applyPose(pose);
    this.applyHands(pose, step);
    this.updateGlow();
    this.secondary?.update(real);

    this.prevIk.set(this.outIk);
    this.lastReal = real;
    this.outIk.set(pose.ik);
    this.outYaw.set(pose.fyaw);
    // While something else owns the legs, the gait's feet stand wherever that
    // left them, so handing the legs back is seamless rather than a snap.
    if (!this.cur.def.locomotion) this.syncFeet();
  }

  // -- internals ------------------------------------------------------------

  private advance(track: Track, step: number): void {
    track.age += step;
    if (track.done) return;
    const rate = Math.max(0.05, track.speed) / track.def.duration;
    const c = track.def.contact;
    if (track.warp !== undefined && c !== undefined && track.time < c) {
      // Up to the contact on the game's clock, after it at the clip's own pace.
      const next = track.time + step * track.warp;
      track.time = next <= c ? next : c + ((next - c) / track.warp) * rate;
    } else {
      track.time += step * rate;
    }
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
        this.fadeDur = 0.22;
        this.fadeTime = 0;
        this.cur = {
          name: 'idle',
          def: CLIPS.idle,
          time: 0,
          speed: 1,
          once: false,
          hold: false,
          done: false,
          age: 0,
        };
      }
    }
  }

  private evaluate(track: Track, pose: Pose): void {
    if (track.def.locomotion) {
      this.evalLocomotion(pose);
      return;
    }
    this.rig.antic = track.antic ?? 1;
    track.def.eval(track.time, pose, this.rig, this.elapsed);
    // The head keeps looking where the body is going while the trunk winds
    // and unwinds under it; a strike that turns the gaze away reads as a flail.
    const g = track.def.gaze ?? 0.8;
    if (g > 0) {
      const hy = SLOT.hips * 3;
      const sy = SLOT.spine * 3;
      const cy = SLOT.chest * 3;
      const hd = SLOT.head * 3;
      pose.rot[hd + 1] -= g * (pose.rot[hy + 1] + pose.rot[sy + 1] + pose.rot[cy + 1]);
      pose.rot[hd] -= 0.35 * g * (pose.rot[hy] + pose.rot[sy] + pose.rot[cy]);
    }
    if (track.entry) this.applyEntry(track, pose);
  }

  // -- action feet ------------------------------------------------------------

  private readonly actionFeet: [ActionFoot, ActionFoot] = [newActionFoot(), newActionFoot()];
  /** Feet stay exactly where they are, steps and all (rooted, held fast). */
  private pinned = false;

  /** Plants both action feet where the feet were last put. */
  private plantActionFeet(): void {
    for (const side of SIDES) {
      const f = this.actionFeet[side];
      this.restFoot(side, _target);
      f.x = _target.x + this.outIk[side * 4];
      f.z = _target.z + this.outIk[side * 4 + 2];
      f.yaw = this.outYaw[side];
      f.moving = false;
      f.k = 0;
      f.drop = 0;
      f.vx = 0;
      f.vz = 0;
      // A foot caught in the air (mid-stride) finishes coming down as a step
      // to wherever the action wants it, rather than dropping in one frame.
      const y = this.outIk[side * 4 + 1];
      if (y > this.rig.hipY * 0.01) {
        f.moving = true;
        f.k = 0;
        f.dur = 0.14;
        f.sx = f.x;
        f.sz = f.z;
        f.syaw = f.yaw;
        f.lift = this.rig.hipY * 0.025;
        f.drop = y;
        // It keeps the speed it had for a moment rather than stopping dead.
        if (this.lastReal > 1e-4) {
          const o = side * 4;
          const vx = (this.outIk[o] - this.prevIk[o]) / this.lastReal;
          const vz = (this.outIk[o + 2] - this.prevIk[o + 2]) / this.lastReal;
          const v = Math.hypot(vx, vz);
          const k = v > 6 ? 6 / v : 1;
          f.vx = vx * k;
          f.vz = vz * k;
        }
      }
    }
  }

  /**
   * Puts an action's feet on the floor.
   *
   * A clip says where it wants the feet; this decides how they get there. A
   * planted foot stays on its spot of ground while the body turns to face its
   * target or drifts to a stop under the swing, and only steps when the clip
   * wants it a real distance away, or lifts it. One foot steps at a time
   * unless the clip lifts both. This is why nothing skates in an attack.
   */
  private holdFeet(pose: Pose, own: Pose, step: number): void {
    const h = this.rig.hipY;
    const c = Math.cos(-this.moveYaw);
    const s = Math.sin(-this.moveYaw);
    for (const f of this.actionFeet) {
      const x = f.x * c + f.z * s - this.moveX;
      const z = -f.x * s + f.z * c - this.moveZ;
      f.x = x;
      f.z = z;
      f.yaw -= this.moveYaw;
      const sx = f.sx * c + f.sz * s - this.moveX;
      const sz = -f.sx * s + f.sz * c - this.moveZ;
      f.sx = sx;
      f.sz = sz;
      f.syaw -= this.moveYaw;
    }
    for (const side of SIDES) {
      const f = this.actionFeet[side];
      const other = this.actionFeet[side === 0 ? 1 : 0];
      const o = side * 4;
      this.restFoot(side, _target);
      const dx = _target.x + own.ik[o];
      const dz = _target.z + own.ik[o + 2];
      const dy = own.ik[o + 1];
      const dyaw = own.fyaw[side];
      const pitch = own.ik[o + 3];
      const lifted = dy > h * 0.02;
      if (!f.moving && !this.pinned) {
        const err = Math.hypot(dx - f.x, dz - f.z);
        const turn = Math.abs(dyaw - f.yaw);
        // A foot left far behind does not wait its turn: it catches the body.
        const far = (err > h * 0.1 || turn > 0.5) && (!other.moving || err > h * 0.35);
        if (far || (lifted && err > h * 0.01)) {
          f.moving = true;
          f.k = 0;
          f.dur = lifted ? 0.08 : 0.13;
          f.sx = f.x;
          f.sz = f.z;
          f.syaw = f.yaw;
          f.lift = Math.min(h * 0.07, h * 0.025 + err * 0.3);
        }
      }
      let fx = f.x;
      let fz = f.z;
      let fyaw = f.yaw;
      let fy = this.pinned ? 0 : dy;
      if (f.moving) {
        f.k = Math.min(1, f.k + step / f.dur);
        const e = smooth(f.k);
        // Hermite: leaves with the speed it had, arrives at rest.
        const h10 = f.k * (1 - f.k) * (1 - f.k) * f.dur;
        fx = f.sx + (dx - f.sx) * e + f.vx * h10;
        fz = f.sz + (dz - f.sz) * e + f.vz * h10;
        fyaw = f.syaw + (dyaw - f.syaw) * e;
        // Every step clears the floor, whatever the clip's own foot does.
        fy = Math.max(dy, f.lift * Math.sin(Math.PI * f.k), f.drop * (1 - e));
        f.x = fx;
        f.z = fz;
        f.yaw = fyaw;
        if (f.k >= 1) {
          f.moving = false;
          f.drop = 0;
          f.vx = 0;
          f.vz = 0;
        }
      }
      // A raised heel rolls over the ball of the foot, which stays put.
      const r = this.rocker(Math.max(0, pitch));
      pose.ik[o] = fx - _target.x;
      pose.ik[o + 1] = fy + r.y;
      pose.ik[o + 2] = fz - _target.z + r.z;
      pose.ik[o + 3] = pitch;
      pose.fyaw[side] = fyaw;
    }
    pose.ikW = Math.max(pose.ikW, own.ikW);
  }

  // -- ground motion ----------------------------------------------------------

  /**
   * Measures how the body moved since last frame, in its own frame. Planted
   * feet are moved by exactly the opposite, which is the whole trick: a foot
   * on the ground stays on the same spot of ground, whatever the body does.
   */
  private sampleMotion(dt: number): void {
    this.moveX = 0;
    this.moveZ = 0;
    this.moveYaw = 0;
    const obj = this.followed;
    let vx = 0;
    let vz = 0;
    if (obj) {
      const x = obj.position.x;
      const z = obj.position.z;
      const yaw = obj.rotation.y;
      const s = Math.max(1e-3, obj.scale.x);
      if (this.hasLast) {
        let dyaw = yaw - this.lastYaw;
        while (dyaw > Math.PI) dyaw -= TAU;
        while (dyaw < -Math.PI) dyaw += TAU;
        const wx = (x - this.lastX) / s;
        const wz = (z - this.lastZ) / s;
        // World to character space at the new heading.
        const c = Math.cos(yaw);
        const sn = Math.sin(yaw);
        const lx = wx * c - wz * sn;
        const lz = wx * sn + wz * c;
        if (Math.hypot(lx, lz) < TELEPORT) {
          this.moveX = lx;
          this.moveZ = lz;
          this.moveYaw = dyaw;
          if (dt > 1e-5) {
            vx = lx / dt;
            vz = lz / dt;
          }
        }
        if (dt > 1e-5) {
          const rate = dyaw / dt;
          this.yawRate += (rate - this.yawRate) * Math.min(1, dt * 12);
        }
      }
      this.lastX = x;
      this.lastZ = z;
      this.lastYaw = yaw;
      this.hasLast = true;
    } else {
      // Nothing to follow: walk and run play on a treadmill at their nominal
      // pace, which is what a preview or a cutscene that asks for 'walk' means.
      const n = this.cur.name;
      const v = n === 'walk' ? TREADMILL_WALK * this.cur.speed : n === 'run' ? TREADMILL_RUN * this.cur.speed : 0;
      vz = this.cur.def.locomotion ? v : 0;
      this.moveZ = vz * dt * this.timeScale;
      this.yawRate *= Math.max(0, 1 - dt * 10);
    }
    if (dt <= 1e-5) return;
    const k = Math.min(1, dt * 14);
    const prevZ = this.velZ;
    this.velX += (vx - this.velX) * k;
    this.velZ += (vz - this.velZ) * k;
    this.speed = Math.hypot(this.velX, this.velZ);
    const a = (this.velZ - prevZ) / dt;
    this.accel += (a - this.accel) * Math.min(1, dt * 10);
  }

  /** Rest ankle position of one foot, in character space. */
  private restFoot(side: 0 | 1, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.rig.hipsRest).add(this.rig.footRest[side]);
  }

  /**
   * Advances the stepping gait.
   *
   * The gait clock runs at a cadence set by real ground speed, each foot is on
   * the ground for `duty` of a cycle, and a foot on the ground is held exactly
   * where it landed. A foot in the air flies to where it must land so that,
   * carried back by the body's own motion, it passes under the hips at the
   * middle of its contact. Stride length is never authored: it falls out of
   * speed and cadence, which is why nothing skates at any speed.
   */
  private stepFeet(step: number): void {
    const v = this.speed;
    this.gait += (smooth((v - WALK_TOP) / (RUN_FROM - WALK_TOP)) - this.gait) * Math.min(1, step * 8);
    const g = this.gait;
    // Past a run, a sprint spends even less time on the ground and reaches
    // further, rather than spinning its legs faster and faster.
    const sprint = clamp01((v - 4.6) / 2.4);
    this.duty = lerp(0.6, 0.34, g) - 0.05 * sprint;
    const wantMove = smooth(v / 0.9);
    this.moveW += (wantMove - this.moveW) * Math.min(1, step * 10);

    // Carry planted feet backwards by the body's motion, and turn them under it.
    const c = Math.cos(-this.moveYaw);
    const s = Math.sin(-this.moveYaw);
    for (const f of this.feet) {
      // Every foot, swinging or not: a swing that lands this frame keeps the
      // spot it reached last frame, which is a spot on the floor.
      const x = f.x * c + f.z * s - this.moveX;
      const z = -f.x * s + f.z * c - this.moveZ;
      f.x = x;
      f.z = z;
      f.yaw -= this.moveYaw;
      if (!f.contact) {
        // A swing starts from a spot on the floor, not a spot on the body.
        const x = f.fx * c + f.fz * s - this.moveX;
        const z = -f.fx * s + f.fz * c - this.moveZ;
        f.fx = x;
        f.fz = z;
        f.fyaw -= this.moveYaw;
        if (f.locked) {
          const lx = f.tx * c + f.tz * s - this.moveX;
          const lz = -f.tx * s + f.tz * c - this.moveZ;
          f.tx = lx;
          f.tz = lz;
        }
      }
    }
    if (this.locoW < 0.001) return;

    const rest = _vec;
    if (this.resync) {
      // Start the cycle in double support, with the foot that has furthest to
      // go about to lift first.
      this.resync = false;
      const dl = this.footError(0);
      const dr = this.footError(1);
      this.phase = dl > dr ? 0.5 + 0.02 : 0.02;
      for (const side of SIDES) {
        const f = this.feet[side];
        f.contact = true;
        f.k = 0.5;
        f.fpitch = f.pitch;
        f.last = (this.phase + side * 0.5) % 1;
        f.lifted = f.last >= this.duty;
      }
    }

    // Moving: step at the cadence the speed asks for. Standing: keep stepping
    // only until both feet are home, then stop dead in double support.
    const span = this.rig.hipY * (lerp(0.6, 0.68, g) + 0.12 * sprint);
    let rate = 0;
    // Rooted feet do not step at all, whatever the body does over them.
    if (this.pinned) rate = 0;
    else if (v > 0.12) rate = cadence(v, this.duty, span);
    else if (this.needsSettle()) rate = 1.7;
    this.phase = (this.phase + rate * step) % 1;

    const amp = clamp01(v / 1.4);
    const toeOff = (0.42 + 0.38 * g) * Math.max(0.25, amp);
    const heelStrike = -(0.24 - 0.1 * g) * Math.max(0.2, amp);
    const lift = this.rig.hipY * (0.085 + 0.25 * g) * clamp01(Math.max(0.5, v / 1.1));
    // Feet land ahead of the hips by part of the distance they will cover
    // on the ground; runners land closer under themselves than walkers.
    const contactTime = this.duty / cadence(v, this.duty, span);
    const ahead = contactTime * lerp(0.5, 0.42, g);

    for (const side of SIDES) {
      const f = this.feet[side];
      const local = (this.phase + side * 0.5) % 1;
      // Lift-off is an event: once per cycle, when this foot's clock passes
      // `duty`. Landing is the end of the foot's own swing. Deriving both from
      // the phase every frame instead made a walk-to-run change of `duty` jerk
      // a foot to a different point of its swing, or skip a step entirely.
      if (local < f.last) f.lifted = false;
      f.last = local;
      this.restFoot(side, rest);
      // A foot left trailing (the first step from a standstill, a sudden
      // burst of speed) does not wait for its turn: it steps now, the way a
      // body catches itself rather than doing the splits.
      let trailing = false;
      if (f.contact && v > 0.5) {
        const back = -((f.x - rest.x) * this.velX + (f.z - rest.z) * this.velZ) / v;
        trailing = back > this.rig.hipY * 0.5;
      }
      if (f.contact && rate > 0 && (trailing || (!f.lifted && local >= this.duty))) {
        f.lifted = true;
        f.contact = false;
        f.locked = false;
        f.k = 0;
        f.span = 1 - this.duty;
        const r = this.rocker(f.pitch);
        f.fx = f.x;
        f.fy = f.y + r.y;
        f.fz = f.z + r.z;
        f.fyaw = f.yaw;
        f.fpitch = f.pitch;
      } else if (!f.contact) {
        f.k += (rate * step) / Math.max(0.05, f.span);
        if (f.k >= 1) {
          f.contact = true;
          f.k = 0;
          f.y = 0;
          f.fpitch = f.pitch;
        }
      } else {
        f.k = Math.min(1, f.k + (rate * step) / Math.max(0.05, this.duty));
      }

      if (f.contact) {
        if (rate > 0) {
          // Heel strike rolls flat, then onto the toe for the push.
          f.pitch = kf(f.k, [
            [0, f.fpitch],
            [0.2, 0],
            [0.6, 0],
            [1, toeOff],
          ]);
        } else {
          // Standing: the sole settles flat.
          f.pitch *= Math.max(0, 1 - step * 10);
        }
        f.y *= Math.max(0, 1 - step * 30);
      } else {
        const k = f.k;
        // The last stretch of a swing is straight down onto a spot that no
        // longer moves with the body, even if it stops or spins underneath.
        if (!f.locked && k >= 0.86) {
          f.locked = true;
          this.swingTarget(f, rest, k, rate, ahead, contactTime);
          f.tx = this.tgt.x;
          f.tz = this.tgt.z;
        }
        if (f.locked) {
          this.tgt.x = f.tx;
          this.tgt.z = f.tz;
        } else {
          this.swingTarget(f, rest, k, rate, ahead, contactTime);
        }
        const tx = this.tgt.x;
        const tz = this.tgt.z;
        // Lift first, then travel, and the travel ends just as the lock does,
        // so the foot clears the floor going out and drops onto it coming in.
        const e = smooth((k - 0.06) / 0.8);
        f.x = f.fx + (tx - f.fx) * e;
        f.z = f.fz + (tz - f.fz) * e;
        f.yaw = f.fyaw * (1 - e);
        // Every curve here leaves and meets the floor at zero speed; a foot
        // that leaves the ground at a finite rate in one frame is a pop. The
        // lift peaks early on a run, which is the heel kicking up behind.
        const peak = lerp(0.46, 0.34, g);
        const arc = kf(k, [
          [0, 0],
          [peak, 1],
          [1, 0],
        ]);
        f.y = f.fy * (1 - smooth(k * 2.5)) + lift * arc;
        f.pitch = kf(k, [
          [0, f.fpitch],
          [0.45, -0.08 - 0.22 * g],
          [1, heelStrike],
        ]);
        // Arrive already rolled onto the heel, exactly as contact will hold it.
        const r = this.rocker(f.pitch);
        const land = smooth((k - 0.6) / 0.4);
        f.y += r.y * land;
        f.z += r.z * land;
        this.keepInReach(side, f, smooth(k / 0.3) * (1 - smooth((k - 0.8) / 0.2)));
      }
      this.guardW[side] = f.contact ? 1 : 1 - smooth(f.k / 0.35);

      // Never let a planted foot be left absurdly far behind (a shove, a
      // stall against a wall): drag it rather than tearing the leg off.
      const dx = f.x - rest.x;
      const dz = f.z - rest.z;
      const far = Math.hypot(dx, dz);
      const lim = this.rig.hipY * 0.8;
      if (far > lim) {
        f.x = rest.x + (dx / far) * lim;
        f.z = rest.z + (dz / far) * lim;
      }
    }
  }

  private readonly tgt = { x: 0, z: 0 };

  /**
   * Where a swinging foot should come down, in character space now: the spot
   * it must land on, plus however far the body will travel before it gets
   * there. As the swing ends that spot slides back at exactly the body's
   * speed, so the foot meets the ground already still instead of skidding in.
   */
  private swingTarget(f: Foot, rest: THREE.Vector3, k: number, rate: number, ahead: number, contactTime: number): void {
    const toLand = rate > 1e-3 ? ((1 - k) * f.span) / rate : 0;
    let tx = rest.x + this.velX * (ahead + toLand);
    let tz = rest.z + this.velZ * (ahead + toLand);
    // Lead the turn: land the foot where the body will be facing.
    const turn = this.yawRate * (contactTime * 0.5 + toLand);
    if (Math.abs(turn) > 1e-4) {
      const cc = Math.cos(turn);
      const ss = Math.sin(turn);
      const ox = tx - rest.x;
      const oz = tz - rest.z;
      tx = rest.x + ox * cc + oz * ss;
      tz = rest.z - ox * ss + oz * cc;
    }
    const reach = Math.hypot(tx - rest.x, tz - rest.z);
    const maxReach = this.rig.hipY * 0.6 + this.speed * toLand;
    if (reach > maxReach) {
      tx = rest.x + ((tx - rest.x) / reach) * maxReach;
      tz = rest.z + ((tz - rest.z) / reach) * maxReach;
    }
    this.tgt.x = tx;
    this.tgt.z = tz;
  }

  /**
   * Where the ankle sits when the foot rolls over its heel or its toe while
   * the contact point stays put. Positive pitch is toe down (heel raised).
   */
  private rocker(pitch: number): { y: number; z: number } {
    const r = this.rig;
    const out = this.rk;
    if (pitch > 0) {
      out.y = r.toe * Math.sin(pitch);
      out.z = r.toe * (1 - Math.cos(pitch));
    } else {
      out.y = r.heel * Math.sin(-pitch);
      out.z = -r.heel * (1 - Math.cos(pitch));
    }
    return out;
  }
  private readonly rk = { y: 0, z: 0 };

  /**
   * Pulls a swinging foot back inside what the leg can reach. A foot that
   * trails out of reach straightens the knee, and the first frame it comes
   * back in range the knee snaps bent again; folding it in smoothly is what a
   * real leg does in the heel kick anyway.
   */
  private keepInReach(side: 0 | 1, f: Foot, w: number): void {
    if (w <= 0.001) return;
    const rig = this.rig;
    const hx = rig.hipsRest.x + rig.hipOff[side].x;
    const hy = rig.hipsRest.y + rig.hipOff[side].y - this.pelvisDrop;
    const hz = rig.hipsRest.z + rig.hipOff[side].z;
    const ay = rig.hipsRest.y + rig.footRest[side].y + f.y;
    const dx = f.x - hx;
    const dy = ay - hy;
    const dz = f.z - hz;
    const d = Math.hypot(dx, dy, dz);
    const R = (rig.l1 + rig.l2) * 0.93;
    if (d <= R) return;
    const s = 1 - (1 - R / d) * w;
    f.x = hx + dx * s;
    f.y += (hy + dy * s) - ay;
    f.z = hz + dz * s;
  }

  /** How far a foot is from home, counting a twisted foot as off home. */
  private footError(side: 0 | 1): number {
    const f = this.feet[side];
    this.restFoot(side, _target);
    return Math.hypot(f.x - _target.x, f.z - _target.z) + Math.abs(f.yaw) * 0.12 + f.y;
  }

  private needsSettle(): boolean {
    for (const i of SIDES) {
      if (!this.feet[i].contact) return true;
      if (this.footError(i) > 0.06) return true;
    }
    return false;
  }

  /** Takes the gait's feet over from whatever was last applied. */
  private syncFeet(): void {
    for (const side of SIDES) {
      const f = this.feet[side];
      this.restFoot(side, _target);
      const o = side * 4;
      f.x = _target.x + this.outIk[o];
      f.y = Math.max(0, this.outIk[o + 1]);
      f.z = _target.z + this.outIk[o + 2];
      f.pitch = 0;
      f.yaw = this.outYaw[side];
      f.contact = true;
    }
    this.resync = true;
  }

  /** The feet the gait wants, written into a pose as IK targets. */
  private writeFeet(p: Pose): void {
    for (const side of SIDES) {
      const f = this.feet[side];
      this.restFoot(side, _target);
      const r = this.rocker(f.contact ? f.pitch : 0);
      p.foot(side, f.x - _target.x, f.y + r.y, f.z - _target.z + r.z, f.pitch);
      p.fyaw[side] = f.yaw;
    }
  }

  /**
   * Captures where the feet are as a one-shot starts, against where the clip
   * puts them on its first frame.
   */
  private entryFeet(def: ClipDef): Float32Array {
    const e = new Float32Array(20);
    e.set(this.outIk, 0);
    e[8] = this.outYaw[0];
    e[9] = this.outYaw[1];
    const p = this.poseIdle;
    p.reset();
    def.eval(0, p, this.rig, this.elapsed);
    e.set(p.ik, 10);
    return e;
  }

  /**
   * Keeps an action's starting feet on the floor while the body drifts on
   * from a run: the start of the entry step is a spot on the ground.
   */
  private carryEntry(e: Float32Array): void {
    if (this.moveX === 0 && this.moveZ === 0 && this.moveYaw === 0) return;
    const c = Math.cos(-this.moveYaw);
    const s = Math.sin(-this.moveYaw);
    for (const side of SIDES) {
      this.restFoot(side, _target);
      const o = side * 4;
      const ax = _target.x + e[o];
      const az = _target.z + e[o + 2];
      e[o] = ax * c + az * s - this.moveX - _target.x;
      e[o + 2] = -ax * s + az * c - this.moveZ - _target.z;
      e[8 + side] -= this.moveYaw;
    }
  }

  /**
   * Fades the difference between where the feet were and where the clip wants
   * them, foot by foot, with a small lift when the distance is a real step.
   * One foot goes first; both at once reads as a hop.
   */
  private applyEntry(track: Track, p: Pose): void {
    const e = track.entry!;
    if (p.ikW < 0.5) return;
    const err = (side: number): number => Math.hypot(e[side * 4] - e[10 + side * 4], e[side * 4 + 2] - e[10 + side * 4 + 2]);
    const lead = err(0) >= err(1) ? 0 : 1;
    let any = false;
    for (let side = 0; side < 2; side++) {
      const start = side === lead ? 0 : 0.07;
      const k = clamp01((track.age - start) / 0.16);
      if (k >= 1) continue;
      any = true;
      const w = 1 - smooth(k);
      const o = side * 4;
      for (let i = 0; i < 4; i++) p.ik[o + i] += (e[o + i] - e[10 + o + i]) * w;
      p.fyaw[side] += e[8 + side] * w;
      const d = err(side);
      if (d > 0.06) p.ik[o + 1] += Math.min(0.09, d * 0.4) * Math.sin(Math.PI * k);
    }
    if (!any) track.entry = undefined;
  }

  // -- locomotion body --------------------------------------------------------

  /** Idle and gait share one body: blended by how fast the body is moving. */
  private evalLocomotion(p: Pose): void {
    const pi = this.poseIdle;
    pi.reset();
    CLIPS.idle.eval(this.idleT, pi, this.rig, this.elapsed);
    if (this.persona) {
      const fn = PERSONAS[this.persona];
      if (fn) fn(pi, this.elapsed + this.personaOffset, this.rig);
    }
    if (this.moveW > 0.002) {
      const pg = this.poseGait;
      pg.reset();
      this.evalGait(pg);
      Pose.blend(pi, pg, this.moveW, p);
    } else {
      p.copyFrom(pi);
    }
    this.writeFeet(p);
  }

  /**
   * The upper body of walking and running, from the gait clock.
   *
   * Everything here is phase-locked to the feet: the pelvis turns with the
   * leg that is reaching, drops over the leg that is swinging, shifts onto the
   * leg that is planted, and the shoulders and arms answer all of it in the
   * opposite direction. Walk and run are the same equations with different
   * amplitudes, blended by `gait`, so there is no seam between them.
   */
  private evalGait(p: Pose): void {
    const h = this.rig.hipY;
    const g = this.gait;
    const amp = clamp01(this.speed / 1.4);
    const ph = this.phase * TAU;
    // Midstance of the left foot; the pelvis is over it here.
    const mid = ph - this.duty * Math.PI;

    // Walkers are highest over the planted leg; runners are lowest there,
    // loading it, and highest in flight.
    const bob = lerp(h * 0.012 * Math.cos(2 * mid), -h * 0.02 * Math.cos(2 * mid), g) * amp;
    const crouch = -h * (0.004 + 0.022 * g) * amp;
    const shift = h * lerp(0.02, 0.006, g) * Math.cos(mid) * amp;
    p.move('hips', shift, bob + crouch, 0);

    const yaw = -lerp(0.11, 0.16, g) * Math.cos(ph) * amp;
    const roll = lerp(0.05, 0.03, g) * Math.cos(mid) * amp;
    const pitch = (0.02 + 0.07 * g) * amp;
    p.set('hips', pitch, yaw, roll);
    const spineX = (0.03 + 0.12 * g) * amp + 0.03 * g * Math.cos(2 * mid) * amp;
    p.set('spine', spineX, -yaw * 0.6, -roll * 0.7);
    const chestX = (0.01 + 0.07 * g) * amp;
    const chestY = -yaw * 1.3;
    p.set('chest', chestX, chestY, -roll * 0.3);
    // Gaze stays level and ahead whatever the torso is doing.
    const netYaw = yaw * (1 - 0.6 - 1.3);
    p.set('head', -(pitch + spineX + chestX) * 0.75, -netYaw * 0.85, 0);

    // Arms answer the legs, a beat late.
    const sw = Math.cos(ph - 0.35);
    const armA = lerp(0.36, 0.78, g) * amp;
    const armBase = -0.2 * g * amp;
    p.set('shoulderL', sw * armA + armBase, 0, lerp(0.11, 0.17, g));
    p.set('shoulderR', -sw * armA + armBase, 0, -lerp(0.11, 0.17, g));
    const elbow = -lerp(0.26, 1.2, g);
    p.set('elbowL', elbow - Math.max(0, -sw) * lerp(0.3, 0.4, g) * amp, 0, 0.05);
    p.set('elbowR', elbow - Math.max(0, sw) * lerp(0.3, 0.4, g) * amp, 0, -0.05);
    p.set('handL', 0, 0, 0.08);
    p.set('handR', 0, 0, -0.08);
  }

  /**
   * Layers that run on top of whatever clip is playing: breathing, lean into
   * movement, head stabilisation and weapon follow-through.
   */
  private applyProcedural(pose: Pose, dt: number, real: number): void {
    this.applyCarry(pose, dt);
    this.applyFlinch(pose, real);
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

    // Weight. Acceleration tips the body forward and braking throws it back,
    // through an underdamped spring so a hard stop rocks once and settles.
    // Turning at speed banks the whole body into the curve.
    if (real > 1e-5) {
      const leanT = Math.max(-0.28, Math.min(0.24, this.accel * 0.022)) * this.locoW;
      const kL = 110;
      this.leanVel += ((leanT - this.lean) * kL - this.leanVel * 2 * Math.sqrt(kL) * 0.42) * real;
      this.lean += this.leanVel * real;
      const bankT = Math.max(-0.32, Math.min(0.32, -this.yawRate * this.speed * 0.03)) * this.locoW;
      const kB = 90;
      this.bankVel += ((bankT - this.bank) * kB - this.bankVel * 2 * Math.sqrt(kB) * 0.7) * real;
      this.bank += this.bankVel * real;
    }
    if (Math.abs(this.lean) > 1e-4) {
      pose.add('hips', this.lean * 0.3, 0, 0);
      pose.add('spine', this.lean * 0.6, 0, 0);
      pose.add('head', -this.lean * 0.55, 0, 0);
    }
    if (Math.abs(this.bank) > 1e-4) {
      pose.add('hips', 0, 0, this.bank);
      pose.add('spine', 0, 0, -this.bank * 0.2);
      pose.add('head', 0, 0, -this.bank * 0.45);
      pose.nudge('hips', -this.bank * this.rig.hipY * 0.09, 0, 0);
    }
    // The head leads a turn, the way eyes go before shoulders.
    const look = Math.max(-0.35, Math.min(0.35, this.yawRate * 0.05)) * this.locoW;
    if (Math.abs(look) > 1e-4) pose.add('head', 0, look, 0);

    // Secondary motion: a critically-damped spring chases the chest's yaw. The
    // difference between the two is exactly the lag a heavy weapon has, so it
    // drives the wrists and the trailing shoulder.
    const chestY = pose.rot[SLOT.chest * 3 + 1];
    const k = 220;
    const c = 2 * Math.sqrt(k) * 0.75;
    // Sub-stepped: at the 0.1 s frame cap one explicit step of this spring
    // grows instead of settling (the same failure that sank the pelvis).
    const lagN = Math.max(1, Math.ceil(dt * 60));
    const lagH = dt / lagN;
    for (let i = 0; i < lagN; i++) {
      this.lagVel += (-(this.lagY - chestY) * k - this.lagVel * c) * lagH;
      this.lagY += this.lagVel * lagH;
    }
    const lag = chestY - this.lagY;
    if (Math.abs(lag) > 1e-4) {
      pose.add('handR', 0, lag * 1.5, lag * 0.6);
      pose.add('handL', 0, lag * 1.2, -lag * 0.5);
      pose.add('elbowR', lag * 0.4, 0, 0);
      // Actions keep their own gaze (see `evaluate`).
      if (this.cur.def.locomotion) pose.add('head', 0, -chestY * 0.35, 0);
    }
  }

  // -- hands ------------------------------------------------------------------

  /** How much the off hand is on a two-handed haft right now, eased. */
  private offW = 0;

  // -- spell light ------------------------------------------------------------

  private glow: { sprites: THREE.Sprite[]; mat: THREE.SpriteMaterial } | null = null;

  /**
   * A soft light in the casting hands that gathers into the release and fades
   * after it, in the body's accent colour. Built the first time anything is
   * cast and hidden the rest of the time, so a body that never casts pays
   * nothing.
   */
  private updateGlow(): void {
    const g = this.castGlow;
    if (g <= 0.01 && !this.glow) return;
    if (!this.glow) {
      const hl = this.bones[SLOT.handL];
      const hr = this.bones[SLOT.handR];
      if (!hl || !hr) return;
      let accent = 0xffd9a0;
      let o: THREE.Object3D | null = this.bones[SLOT.root];
      while (o) {
        if (typeof o.userData?.accent === 'number') {
          accent = o.userData.accent;
          break;
        }
        o = o.parent;
      }
      const mat = new THREE.SpriteMaterial({
        map: glowTexture(),
        color: accent,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprites = [hl, hr].map((hand) => {
        const s = new THREE.Sprite(mat);
        s.position.set(0, -0.07, 0.02);
        s.visible = false;
        s.renderOrder = 2;
        hand.add(s);
        return s;
      });
      this.glow = { sprites, mat };
    }
    const hands = this.castHands;
    this.glow.mat.opacity = Math.min(1, g * 1.2);
    const size = this.rig.hipY * (0.16 + 0.16 * g);
    this.glow.sprites.forEach((s, side) => {
      const on = g > 0.01 && (hands === 'both' || hands === (side === 0 ? 'left' : 'right'));
      s.visible = on;
      if (on) s.scale.setScalar(size);
    });
  }

  /** Which hand `mainWeapon` found the weapon in (a bow rides in the left). */
  private weaponSlot = SLOT.handR;

  /** The main-hand weapon, in whichever hand its grip put it, if any. */
  private mainWeapon(): THREE.Object3D | null {
    for (const slot of [SLOT.handR, SLOT.handL]) {
      const hand = this.bones[slot];
      if (!hand) continue;
      for (const c of hand.children) {
        if (c.userData && c.userData.socketSlot === 'mainHand') {
          this.weaponSlot = slot;
          return c;
        }
      }
    }
    return null;
  }

  /**
   * The hands after the arms are posed: the wrist turns the weapon onto its
   * line around the contact, and on a two-handed weapon the off hand is put
   * on the haft by a two-bone arm solve, so it stays there through a swing
   * instead of the blade leaving one hand behind.
   */
  private applyHands(pose: Pose, dt: number): void {
    void pose;
    const weapon = this.mainWeapon();
    const def = this.cur.def;
    const fade = this.prev ? smooth(clamp01(this.fadeTime / Math.max(1e-5, this.fadeDur))) : 1;
    if (weapon && def.aim && !this.cur.done) {
      const dir = typeof def.aim.dir === 'function' ? def.aim.dir(this.rig.wpn) : def.aim.dir;
      if (dir) this.aimWeapon(weapon, dir, def.aim.w(this.cur.time) * fade);
    }

    const carry = this.grip === 'twoHand' ? HAFT_TWOHAND : this.grip === 'staff' ? HAFT_STAFF : null;
    const want = carry && weapon && this.weaponSlot === SLOT.handR && (def.locomotion ? 1 : def.offHand ? 1 : 0);
    const rate = want ? 10 : 14;
    this.offW += ((want ? 1 : 0) - this.offW) * Math.min(1, dt * rate);
    if (!carry || !weapon || this.offW <= 0.01) return;
    // A sword's grip runs below the guard, so in a swing the off hand closes
    // on the hilt under the main hand; a haft is held above it.
    _haft.copy(carry);
    if (this.hilt && this.grip === 'twoHand') _haft.lerp(HILT_TWOHAND, 1 - this.locoW);
    this.offHandOnHaft(weapon, _haft, smooth(this.offW));
  }

  /** Composes bone local transforms from the chest down the right arm. */
  private chainR(out: THREE.Matrix4): THREE.Matrix4 {
    out.identity();
    for (const s of [SLOT.shoulderR, SLOT.elbowR, SLOT.handR]) {
      const b = this.bones[s];
      if (!b) continue;
      _m4.compose(b.position, b.quaternion, b.scale);
      out.multiply(_m4);
    }
    return out;
  }

  /** Rotation of a hand's parent frame in character space. */
  private handParentQuat(out: THREE.Quaternion, left = false): THREE.Quaternion {
    out.identity();
    for (const s of left ? ARM_CHAIN_L : ARM_CHAIN_R) {
      const b = this.bones[s];
      if (b) out.multiply(b.quaternion);
    }
    return out;
  }

  private aimWeapon(weapon: THREE.Object3D, dir: [number, number, number], w: number): void {
    if (w < 0.01) return;
    const hand = this.bones[this.weaponSlot];
    if (!hand) return;
    const parent = this.handParentQuat(_qH, this.weaponSlot === SLOT.handL);
    // Where the business end points now, in character space.
    _qA.copy(parent).multiply(hand.quaternion).multiply(weapon.quaternion);
    _vec.set(0, 1, 0).applyQuaternion(_qA);
    _target.set(dir[0], dir[1], dir[2]).normalize();
    _qB.setFromUnitVectors(_vec, _target);
    // A wrist, a turned forearm and a shifted grip between them, and no more.
    const ang = 2 * Math.acos(Math.min(1, Math.abs(_qB.w)));
    const k = ang > 2.0 ? (2.0 / ang) * w : w;
    _qC.identity().slerp(_qB, k);
    // Turn in character space, expressed in the hand's own frame.
    _qA.copy(parent).invert().multiply(_qC).multiply(parent);
    hand.quaternion.premultiply(_qA);
  }

  /** The haft point in chest space, from the right arm and the weapon socket. */
  private haftInChest(weapon: THREE.Object3D, haft: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    this.chainR(_m4b);
    _m4.compose(weapon.position, weapon.quaternion, weapon.scale);
    _m4b.multiply(_m4);
    return out.copy(haft).applyMatrix4(_m4b);
  }

  private offHandOnHaft(weapon: THREE.Object3D, haft: THREE.Vector3, w: number): void {
    const shL = this.bones[SLOT.shoulderL];
    const elL = this.bones[SLOT.elbowL];
    const shR = this.bones[SLOT.shoulderR];
    const elR = this.bones[SLOT.elbowR];
    const haR = this.bones[SLOT.handR];
    if (!shL || !elL || !shR || !elR || !haR) return;
    const u0 = this.restPos[SLOT.elbowL];
    const f0 = this.restPos[SLOT.handL];
    const reach = (u0.length() + f0.length()) * 0.97;

    this.haftInChest(weapon, haft, _goal);
    const d = _goal.distanceTo(shL.position);
    if (d > reach) {
      // Out of the off arm's reach: draw the main hand in toward it by the
      // difference, keeping the weapon's angle, so both stay on the haft.
      _vec.subVectors(_goal, shL.position).divideScalar(d);
      _qD.copy(shR.quaternion).multiply(elR.quaternion).multiply(haR.quaternion);
      _m4.compose(shR.position, shR.quaternion, shR.scale);
      _m4c.compose(elR.position, elR.quaternion, elR.scale);
      _hand.copy(haR.position).applyMatrix4(_m4c).applyMatrix4(_m4);
      _hand.addScaledVector(_vec, -(d - reach) * w);
      _pole.set(-0.6, -0.6, -0.5);
      solveArm(shR.position, this.restPos[SLOT.elbowR], this.restPos[SLOT.handR], _hand, _pole, _qA, _qB);
      shR.quaternion.copy(_qA);
      elR.quaternion.copy(_qB);
      haR.quaternion.copy(_qA.multiply(_qB).invert().multiply(_qD));
      this.haftInChest(weapon, haft, _goal);
    }
    _pole.set(0.6, -0.6, -0.5);
    solveArm(shL.position, u0, f0, _goal, _pole, _qA, _qB);
    shL.quaternion.slerp(_qA.premultiply(this.restQuat[SLOT.shoulderL]), w);
    elL.quaternion.slerp(_qB.premultiply(this.restQuat[SLOT.elbowL]), w);
  }

  /**
   * Lowers the pelvis just enough that every foot on the ground can be
   * reached with a slightly bent knee. Without it a long stride straightens
   * the leg, the IK clamps, and the foot hangs in the air short of the floor.
   */
  private guardReach(pose: Pose, dt: number): void {
    if (pose.ikW < 0.5) return;
    const rig = this.rig;
    const maxR = (rig.l1 + rig.l2) * SOFT_FROM;
    const hp = SLOT.hips * 3;
    let need = 0;
    for (const side of SIDES) {
      const o = side * 4;
      // Feet on the floor count fully. A foot that has just lifted still
      // holds the pelvis for the first part of its swing, so the hip does not
      // spring up and snap the trailing leg straight; after that a swinging
      // foot folds its knee instead, and counting it kept the walk crouched.
      const onFloor = pose.ik[o + 1] <= rig.hipY * 0.02 ? 1 : 0;
      const w = Math.max(onFloor, this.locoW * this.guardW[side]);
      if (w <= 0.001) continue;
      const fr = rig.footRest[side];
      const hx = rig.hipOff[side].x + pose.pos[hp];
      const hz = rig.hipOff[side].z + pose.pos[hp + 2];
      const dx = fr.x + pose.ik[o] - hx;
      const dz = fr.z + pose.ik[o + 2] - hz;
      const dxz = Math.min(maxR * 0.98, Math.hypot(dx, dz));
      const dy = rig.hipOff[side].y + pose.pos[hp + 1] - (fr.y + pose.ik[o + 1]);
      const fit = Math.sqrt(maxR * maxR - dxz * dxz);
      need = Math.max(need, (dy - fit) * w);
    }
    need = Math.max(0, Math.min(need, rig.hipY * 0.3));
    // A stiff, critically damped spring rather than a chase: a stride that
    // suddenly lengthens must not yank the whole body down in one frame.
    // Stepped in closed form: an explicit step with k = 900 diverges for any
    // frame longer than ~65 ms, and one long frame (a level load, a hitch)
    // threw the hips 1e14 m below the floor, so the hero vanished for good.
    const k = need > this.pelvisDrop ? 900 : 260;
    const w = Math.sqrt(k);
    const x = this.pelvisDrop - need;
    const c = this.pelvisVel + w * x;
    const e = Math.exp(-w * dt);
    this.pelvisVel = (this.pelvisVel - w * c * dt) * e;
    this.pelvisDrop = Math.min(rig.hipY * 0.3, Math.max(0, need + (x + c * dt) * e));
    if (this.pelvisDrop <= 0 && this.pelvisVel < 0) this.pelvisVel = 0;
    if (this.pelvisDrop > 1e-4) pose.pos[hp + 1] -= this.pelvisDrop;
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
      const side = i === SLOT.shoulderL ? 0 : i === SLOT.shoulderR ? 1 : -1;
      if (side >= 0 && pose.sw[side] > 0.001) {
        _qB.fromArray(pose.sq, side * 4);
        _qA.slerp(_qB, Math.min(1, pose.sw[side]));
      }
      bone.quaternion.copy(this.restQuat[i]).multiply(_qA);
      bone.position.set(
        this.restPos[i].x + pose.pos[i * 3],
        this.restPos[i].y + pose.pos[i * 3 + 1],
        this.restPos[i].z + pose.pos[i * 3 + 2],
      );
    }

    if (pose.ikW > 0.001) {
      // The floor is the floor: no clip may put an ankle through it. Several
      // gestures ask for a negative foot height to mean "bend the knees";
      // the pelvis guard and the knee do that properly.
      if (pose.ik[1] < 0) pose.ik[1] = 0;
      if (pose.ik[5] < 0) pose.ik[5] = 0;
      this.solveLeg(0, pose);
      this.solveLeg(1, pose);
    }
  }

  /**
   * Analytic two-bone IK. Foot targets are in character space, so they are
   * first brought into the pelvis's frame: a pelvis that twists or tilts must
   * not drag a planted foot with it. Hip and knee come from the law of
   * cosines, the knee swivels to follow the foot's own yaw, and the foot is
   * counter-rotated so the sole lies on the floor at the clip's pitch.
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
    const hp = SLOT.hips * 3;
    _target.set(
      rest.x + pose.ik[o] - pose.pos[hp],
      rest.y + pose.ik[o + 1] - pose.pos[hp + 1],
      rest.z + pose.ik[o + 2] - pose.pos[hp + 2],
    );
    _eul.set(pose.rot[hp], pose.rot[hp + 1], pose.rot[hp + 2], 'XYZ');
    _qH.setFromEuler(_eul);
    _qC.copy(_qH).invert();
    _target.applyQuaternion(_qC);
    _vec.subVectors(_target, this.rig.hipOff[side]);

    const l1 = this.rig.l1;
    const l2 = this.rig.l2;
    let dist = _vec.length();
    const maxReach = (l1 + l2) * 0.999;
    const minReach = Math.abs(l1 - l2) + 1e-4;
    // Soft IK. Near full extension the knee angle changes violently for a
    // tiny change in reach, which is the snap of a leg locking straight. Past
    // `SOFT_FROM` the reach is eased toward full length instead, so the knee
    // straightens gently and the foot falls a hair short rather than popping.
    const soft = (l1 + l2) * (1 - SOFT_FROM);
    const softFrom = (l1 + l2) - soft;
    if (dist > softFrom) dist = softFrom + soft * (1 - Math.exp(-(dist - softFrom) / soft));
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
    // Knee points where the foot points.
    const twist = (pose.fyaw[side] - pose.rot[hp + 1]) * 0.7;
    if (Math.abs(twist) > 1e-4) {
      _qB.setFromAxisAngle(_vec, twist);
      _qAim.premultiply(_qB);
    }

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
      // Undo pelvis and leg so the sole lies on the floor, then turn it to the
      // foot's yaw and the clip's pitch — this is what plants it.
      _qA.copy(_qH).multiply(_qAim).multiply(_qB).invert();
      _qC.setFromAxisAngle(_AXIS_Y, pose.fyaw[side]);
      _qA.multiply(_qC);
      _qC.setFromAxisAngle(_AXIS_X, pose.ik[o + 3]);
      _qA.multiply(_qC);
      foot.quaternion.copy(this.restQuat[footSlot]).slerp(
        _qC.copy(this.restQuat[footSlot]).multiply(_qA),
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

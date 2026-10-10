/**
 * SLAY — hero actions as key poses.
 *
 * An action is a few key poses on a timeline: anticipation, a fast contact,
 * a heavy follow-through, recovery. The animator runs a smooth curve through
 * them and time-warps the run-up so the contact key lands exactly when the
 * game says the blow lands (`PlayOpts.contact`, from `contactDelay` in
 * `Player.ts`). Each key starts from the stance's standing pose, so a key
 * only says what it changes.
 *
 * `attack1` and `attack2` resolve to the weapon's own chain of blows, and
 * the chain advances on its own while attacks follow each other closely: a
 * sword goes forehand, backhand, thrust; an axe chops, sweeps and splits.
 *
 * Arm numbers are `Pose.arm` order: raise forward, raise out, internal turn,
 * elbow, forearm turn, wrist flex, wrist tilt (see `Pose.ts`).
 */
import { CH, type Pose, type Side } from './Pose';
import type { Stance, StanceBody } from './Stances';

export type MoveKind =
  | 'blade'
  | 'axe'
  | 'mace'
  | 'dagger'
  | 'dual'
  | 'spear'
  | 'great'
  | 'staff'
  | 'wand'
  | 'bow'
  | 'shield'
  | 'unarmed';

export interface ActionCtx extends StanceBody {
  stance: Stance;
  kind: MoveKind;
  /** 1 or -1: the way a fall goes, or which side leads. */
  flip: number;
}

export interface ActionKey {
  /** Seconds into the action at natural speed. */
  t: number;
  pose(p: Pose, c: ActionCtx): void;
  /** Arrive and leave at rest instead of flowing through (a held beat). */
  hold?: boolean;
}

export interface ActionStep {
  /** Natural time the foot lifts. */
  t: number;
  side: Side;
  /** Offset from the stance spot, heads (+ left, + forward). */
  dx: number;
  dz: number;
  /** Lift at the top, heads. */
  lift?: number;
  /** Natural time it lands (defaults to 0.15 s after it lifts). */
  land?: number;
}

export interface ActionDef {
  keys: ActionKey[];
  /** Natural time of the hit or release key. */
  contact?: number;
  event?: 'hit' | 'release';
  /** Loops until replaced (channel, stun). */
  loop?: boolean;
  /** After this natural time a move order may take the body back. */
  recover?: number;
  /** The whole body (pelvis and its offset) rather than trunk and arms. */
  full?: boolean;
  /** The feet stay where they are: no standing steps while it plays. */
  plantFeet?: boolean;
  /** Steps the action takes. */
  steps?: ActionStep[];
  /** Spell light in the hands, natural time to 0..1, and which hands. */
  glow?: { at: (t: number) => number; hands: 'left' | 'right' | 'both' };
}

type Arm = [number, number, number, number, number?, number?, number?];
type PoseFn = ActionKey['pose'];

const k = (t: number, pose: PoseFn, hold = false): ActionKey => ({ t, pose, hold });
const rest: PoseFn = () => {};
const arm = (p: Pose, side: Side, a: Arm) => p.arm(side, a[0], a[1], a[2], a[3], a[4] ?? 0, a[5] ?? 0, a[6] ?? 0);
const other = (s: Side): Side => (s === 'R' ? 'L' : 'R');
const bell = (t: number, a: number, peak: number, b: number) =>
  t <= a || t >= b ? 0 : t < peak ? (t - a) / (peak - a) : (b - t) / (b - peak);

/** Turns and bends the trunk: `yaw` + to the character's left, `lean` + forward. */
function trunk(p: Pose, yaw: number, lean: number, roll = 0): void {
  p.add('pelvis', lean * 0.25, yaw * 0.3, roll * 0.3);
  p.add('spine', lean * 0.45, yaw * 0.35, roll * 0.4);
  p.add('chest', lean * 0.3, yaw * 0.45, roll * 0.3);
  // The eyes stay on the target.
  p.add('neck', -lean * 0.3, -yaw * 0.4, -roll * 0.3);
  p.add('head', -lean * 0.3, -yaw * 0.45, -roll * 0.3);
}

/** Moves the weight: heads forward and down. */
function weight(p: Pose, c: ActionCtx, fwd: number, down: number, side = 0): void {
  p.shift(side * c.h, -down * c.h, fwd * c.h);
}

// ---------------------------------------------------------------------------
// Weapon blows
// ---------------------------------------------------------------------------

interface Blow {
  side?: Side;
  /** Weapon arm at wind-up, contact, follow-through. */
  wind: Arm;
  hit: Arm;
  follow: Arm;
  /** Trunk turn (+ left, for a right-handed blow) and lean at each. */
  turn: [number, number, number];
  lean: [number, number, number];
  /** Weight forward and drop at contact, heads. */
  drive?: [number, number];
  /** Both hands on the haft. */
  grip?: boolean;
  /** The free arm keeps its stance pose (shield, second blade). */
  keepOther?: boolean;
  /** Natural times. */
  t?: [number, number, number, number];
  steps?: ActionStep[];
  /** Fist open at contact (a palm strike or a flick). */
  open?: boolean;
}

/** The free arm: reaching out ahead at the wind-up, thrown back at the blow. */
const BAL_WIND: Arm = [0.9, 0.4, 0.3, 1.0, 0.2];
const BAL_HIT: Arm = [0.15, 0.5, 0, 0.7, 0.2];
const BAL_FOLLOW: Arm = [0.3, 0.45, 0, 0.8, 0.2];

function blow(b: Blow): ActionDef {
  const side = b.side ?? 'R';
  const m = side === 'R' ? 1 : -1;
  const [tw, th, tf, te] = b.t ?? [0.16, 0.26, 0.42, 0.72];
  const key = (a: Arm, i: 0 | 1 | 2, bal: Arm): PoseFn => (p, c) => {
    arm(p, side, a);
    if (!b.keepOther && !b.grip) arm(p, other(side), bal);
    if (b.grip) p.c[CH.offGrip] = 1;
    trunk(p, b.turn[i] * m, b.lean[i]);
    if (i === 0) weight(p, c, -0.06, 0.03, 0.03 * m);
    if (i === 1) weight(p, c, b.drive?.[0] ?? 0.12, b.drive?.[1] ?? 0.1, -0.02 * m);
    if (i === 2) weight(p, c, (b.drive?.[0] ?? 0.12) * 0.8, (b.drive?.[1] ?? 0.1) * 1.1, -0.03 * m);
    if (b.open && i === 1) p.fist(side, 0.2);
  };
  return {
    contact: th,
    event: 'hit',
    recover: tf,
    full: true,
    plantFeet: true,
    steps: b.steps,
    keys: [k(0, rest), k(tw, key(b.wind, 0, BAL_WIND), true), k(th, key(b.hit, 1, BAL_HIT)), k(tf, key(b.follow, 2, BAL_FOLLOW)), k(te, rest)],
  };
}

/** Forehand: from high over the weapon shoulder, down across to the far hip. */
const forehand = (o: Partial<Blow> = {}): ActionDef =>
  blow({
    wind: [2.4, 0.9, -0.9, 2.0, -0.6, 0.3, 0.5],
    hit: [1.45, 0.25, 0.55, 0.2, -0.5, 0, -0.2],
    follow: [0.75, -0.2, 1.0, 0.5, -0.3, 0.2, -0.3],
    turn: [-0.5, 0.3, 0.6],
    lean: [-0.08, 0.18, 0.28],
    ...o,
  });

/** Backhand: from the far shoulder, out across the front to the weapon side. */
const backhand = (o: Partial<Blow> = {}): ActionDef =>
  blow({
    wind: [1.3, -0.3, 1.3, 1.8, -0.3, 0.3, 0.2],
    hit: [1.5, 0.55, -0.1, 0.2, -1.2, 0, 0.2],
    follow: [1.25, 1.15, -0.5, 0.45, -1.4, 0, 0.3],
    turn: [0.55, -0.2, -0.5],
    lean: [0.05, 0.15, 0.18],
    ...o,
  });

/** Overhead: up and back, straight down through the target. */
const overhead = (o: Partial<Blow> = {}): ActionDef =>
  blow({
    wind: [2.9, 0.3, -0.3, 2.1, -0.4, 0.4, 0.7],
    hit: [1.25, 0.12, 0.2, 0.2, -0.4, 0.1, -0.4],
    follow: [0.65, 0.15, 0.3, 0.4, -0.4, 0.1, -0.6],
    turn: [-0.2, 0.1, 0.15],
    lean: [-0.2, 0.3, 0.42],
    drive: [0.14, 0.16],
    t: [0.2, 0.3, 0.48, 0.8],
    ...o,
  });

/** Thrust: drawn back to the hip, driven straight out. */
const thrust = (o: Partial<Blow> = {}): ActionDef =>
  blow({
    wind: [0.55, 0.35, -0.1, 2.0, -1.3, -0.2, 0.1],
    hit: [1.5, 0.05, 0.35, 0.05, -1.3, -0.1, 0.1],
    follow: [1.4, 0.05, 0.35, 0.15, -1.3, -0.1, 0.1],
    turn: [-0.4, 0.35, 0.3],
    lean: [-0.02, 0.22, 0.2],
    drive: [0.25, 0.1],
    t: [0.14, 0.24, 0.4, 0.68],
    ...o,
  });

/** A reverse-grip blade punched across: the edge rides the forearm. */
const ripCross = (side: Side, o: Partial<Blow> = {}): ActionDef =>
  blow({
    side,
    wind: [1.1, 0.7, -0.6, 2.2, 0, 0, 0],
    hit: [1.4, -0.1, 0.9, 0.9, 0, 0, 0],
    follow: [1.0, -0.35, 1.3, 1.2, 0, 0, 0],
    turn: [-0.45, 0.35, 0.55],
    lean: [0, 0.2, 0.25],
    drive: [0.14, 0.12],
    t: [0.12, 0.22, 0.36, 0.62],
    ...o,
  });

/** A reverse-grip blade driven down like an ice pick. */
const pick = (side: Side, o: Partial<Blow> = {}): ActionDef =>
  blow({
    side,
    wind: [2.6, 0.5, -0.4, 1.9, 0, 0.2, 0],
    hit: [1.3, 0.1, 0.3, 1.0, 0, -0.2, 0],
    follow: [0.8, 0.1, 0.4, 1.1, 0, -0.2, 0],
    turn: [-0.25, 0.15, 0.2],
    lean: [-0.1, 0.32, 0.4],
    drive: [0.12, 0.16],
    t: [0.14, 0.24, 0.4, 0.66],
    ...o,
  });

/** Fists: jab, cross, hook. */
const punch = (side: Side, hook = false): ActionDef =>
  blow({
    side,
    wind: [0.5, 0.4, 0.4, 2.3, 0, 0, 0],
    hit: hook ? [1.45, 0.85, 0.6, 1.5, 0, 0, 0] : [1.5, 0.1, 0.4, 0.05, 0, 0, 0],
    follow: hook ? [1.35, 0.2, 1.0, 1.5, 0, 0, 0] : [1.35, 0.15, 0.4, 0.3, 0, 0, 0],
    turn: hook ? [-0.5, 0.2, 0.5] : [-0.3, 0.35, 0.35],
    lean: [0, 0.12, 0.12],
    drive: [0.2, 0.06],
    t: [0.1, 0.18, 0.32, 0.55],
  });

/** The shield driven forward off the lead foot. */
const shieldBash: ActionDef = {
  contact: 0.26,
  event: 'hit',
  recover: 0.42,
  full: true,
  plantFeet: true,
  steps: [{ t: 0.12, side: 'L', dx: 0, dz: 0.9, lift: 0.25, land: 0.26 }],
  keys: [
    k(0, rest),
    k(
      0.14,
      (p, c) => {
        arm(p, 'L', [0.3, 0.3, 1.1, 1.7, 0.4]);
        trunk(p, 0.35, 0.05);
        weight(p, c, -0.08, 0.06);
      },
      true,
    ),
    k(0.26, (p, c) => {
      arm(p, 'L', [1.3, 0.15, 1.15, 1.25, 0.4]);
      trunk(p, -0.45, 0.25);
      weight(p, c, 0.45, 0.14);
    }),
    k(0.42, (p, c) => {
      arm(p, 'L', [1.2, 0.15, 1.1, 1.3, 0.4]);
      trunk(p, -0.4, 0.2);
      weight(p, c, 0.4, 0.12);
    }),
    k(0.75, rest),
  ],
};

/** A wand flicked at the target. */
const flick: ActionDef = blow({
  wind: [1.2, 0.5, -0.3, 1.9, 0.2, 0.4, 0.3],
  hit: [1.55, 0.1, 0.25, 0.1, 0.2, -0.3, -0.3],
  follow: [1.4, 0.05, 0.3, 0.2, 0.2, -0.2, -0.3],
  turn: [-0.3, 0.25, 0.2],
  lean: [0, 0.1, 0.1],
  drive: [0.1, 0.04],
  t: [0.12, 0.2, 0.34, 0.6],
});

const CHAINS: Record<MoveKind, ActionDef[]> = {
  blade: [forehand(), backhand(), thrust()],
  axe: [overhead({ wind: [2.8, 0.6, -0.6, 2.1, -0.6, 0.4, 0.7] }), backhand({ hit: [1.4, 0.6, -0.1, 0.25, -1.4, 0, 0.4] }), forehand({ t: [0.2, 0.3, 0.48, 0.8], lean: [-0.12, 0.25, 0.35] })],
  mace: [overhead(), forehand({ t: [0.2, 0.3, 0.48, 0.8] }), backhand({ t: [0.18, 0.28, 0.46, 0.78] })],
  dagger: [ripCross('R'), pick('R'), thrust({ hit: [1.5, 0.05, 0.35, 0.1, -1.3, -0.1, 0.1] })],
  dual: [ripCross('R', { keepOther: true }), ripCross('L', { keepOther: true }), pick('R', { keepOther: true }), pick('L', { keepOther: true })],
  shield: [forehand({ keepOther: true }), backhand({ keepOther: true }), shieldBash],
  great: [
    forehand({ grip: true, turn: [-0.75, 0.35, 0.85], lean: [-0.1, 0.25, 0.38], drive: [0.16, 0.16], t: [0.22, 0.32, 0.52, 0.88] }),
    backhand({ grip: true, turn: [0.75, -0.3, -0.7], lean: [0.05, 0.2, 0.25], drive: [0.12, 0.14], t: [0.2, 0.3, 0.5, 0.85] }),
    overhead({ grip: true, drive: [0.18, 0.2], t: [0.24, 0.34, 0.55, 0.92] }),
  ],
  staff: [
    backhand({ grip: true, turn: [0.6, -0.25, -0.55], lean: [0, 0.15, 0.2] }),
    forehand({ grip: true, turn: [-0.6, 0.3, 0.6] }),
    thrust({ grip: true }),
  ],
  spear: [thrust({ grip: true }), thrust({ grip: true, drive: [0.32, 0.14] }), backhand({ grip: true, turn: [0.6, -0.25, -0.55] })],
  wand: [flick],
  bow: [], // a bow's attack is a shot
  unarmed: [punch('R'), punch('L'), punch('R', true)],
};

/** Which chain of blows a stance and weapon category swing. */
export function moveKind(stance: Stance, grip: string, category?: string): MoveKind {
  switch (stance) {
    case 'oneHand':
      return grip === 'axe' ? 'axe' : grip === 'mace' ? 'mace' : 'blade';
    case 'dagger':
      return 'dagger';
    case 'dual':
      return 'dual';
    case 'shield':
      return 'shield';
    case 'twoHand':
      return 'great';
    case 'staff':
      return category === 'spear' ? 'spear' : 'staff';
    case 'wand':
      return 'wand';
    case 'bow':
      return 'bow';
    default:
      return 'unarmed';
  }
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/**
 * The bow held out on the left arm, the string drawn to the cheek. Bow side
 * toward the target: the hips and chest turn right and the arms swing back
 * to aim straight ahead.
 */
function shot(o: { up?: number; quick?: boolean } = {}): ActionDef {
  const up = o.up ?? 0;
  const [tn, td, tr, tf, te] = o.quick ? [0.06, 0.14, 0.18, 0.3, 0.5] : [0.1, 0.24, 0.3, 0.46, 0.72];
  const aim = (p: Pose, draw: number, c: ActionCtx) => {
    trunk(p, -0.85, -0.04 - up * 0.25, 0);
    p.add('neck', 0, 0.3, 0);
    p.add('head', -up * 0.4, 0.4, 0);
    // Bow arm straight out at the target.
    arm(p, 'L', [1.55 + up, 0.75, 0.15, 0.1, 0.3, 0, 0]);
    // String hand from the bow back to the cheek.
    arm(p, 'R', [1.5 + up * 0.8, 0.45 + 0.35 * draw, -0.2 - 0.5 * draw, 0.3 + 2.1 * draw, 0.6, 0.1, 0]);
    p.fist('R', 0.75);
    weight(p, c, -0.02, 0.05, 0.05);
  };
  return {
    contact: tr,
    event: 'release',
    recover: tf,
    full: true,
    plantFeet: true,
    keys: [
      k(0, rest),
      k(tn, (p, c) => aim(p, 0.1, c)),
      k(td, (p, c) => aim(p, 1, c), true),
      k(tr, (p, c) => {
        aim(p, 1.05, c);
        // The release: fingers open and the hand flies back past the ear.
        p.add('upperArmR', 0, 0.15, 0.1);
        p.add('foreArmR', 0.15, 0, 0);
        p.fist('R', 0.1);
      }),
      k(tf, (p, c) => {
        aim(p, 1.0, c);
        p.add('upperArmR', -0.05, 0.25, 0.2);
        p.fist('R', 0.2);
      }),
      k(te, rest),
    ],
  };
}

// ---------------------------------------------------------------------------
// Casts and gestures
// ---------------------------------------------------------------------------

const glowAt = (a: number, peak: number, b: number) => (t: number) => bell(t, a, peak, b);

/** Power gathered at the chest and pushed out with both palms: casting. */
const cast: ActionDef = {
  contact: 0.26,
  event: 'release',
  recover: 0.42,
  full: true,
  plantFeet: true,
  glow: { at: glowAt(0.04, 0.26, 0.5), hands: 'both' },
  keys: [
    k(0, rest),
    k(
      0.16,
      (p, c) => {
        for (const s of ['L', 'R'] as Side[]) arm(p, s, [0.85, 0.3, 0.9, 2.0, 0.8, -0.3, 0]);
        p.fist('L', 0.35);
        p.fist('R', 0.35);
        trunk(p, 0, -0.1);
        weight(p, c, -0.05, 0.03);
      },
      true,
    ),
    k(0.26, (p, c) => {
      for (const s of ['L', 'R'] as Side[]) arm(p, s, [1.45, 0.2, 0.75, 0.3, 1.1, -0.9, 0]);
      p.fist('L', 0);
      p.fist('R', 0);
      trunk(p, 0, 0.14);
      weight(p, c, 0.12, 0.06);
    }),
    k(0.44, (p, c) => {
      for (const s of ['L', 'R'] as Side[]) arm(p, s, [1.3, 0.3, 0.6, 0.5, 1.0, -0.6, 0]);
      p.fist('L', 0.1);
      p.fist('R', 0.1);
      trunk(p, 0, 0.1);
      weight(p, c, 0.1, 0.05);
    }),
    k(0.78, rest),
  ],
};

/** One hand thrust at the target, palm out: an aimed spell. */
const point: ActionDef = {
  contact: 0.22,
  event: 'release',
  recover: 0.38,
  full: true,
  plantFeet: true,
  glow: { at: glowAt(0.04, 0.22, 0.45), hands: 'right' },
  keys: [
    k(0, rest),
    k(
      0.12,
      (p, c) => {
        arm(p, 'R', [0.9, 0.5, -0.1, 2.2, 0.6, -0.2, 0]);
        arm(p, 'L', [0.7, 0.35, 0.4, 1.3, 0.2]);
        p.fist('R', 0.4);
        trunk(p, -0.3, 0);
        weight(p, c, -0.04, 0.03);
      },
      true,
    ),
    k(0.22, (p, c) => {
      arm(p, 'R', [1.55, 0.08, 0.2, 0.05, 1.2, -0.8, 0]);
      arm(p, 'L', [0.2, 0.45, 0, 0.7, 0.2]);
      p.fist('R', 0);
      trunk(p, 0.25, 0.12);
      weight(p, c, 0.12, 0.05);
    }),
    k(0.4, (p, c) => {
      arm(p, 'R', [1.45, 0.1, 0.2, 0.15, 1.1, -0.6, 0]);
      arm(p, 'L', [0.25, 0.4, 0, 0.8, 0.2]);
      p.fist('R', 0.1);
      trunk(p, 0.2, 0.1);
      weight(p, c, 0.1, 0.04);
    }),
    k(0.7, rest),
  ],
};

/** An overhand throw off the lead foot. */
const hurl: ActionDef = {
  contact: 0.28,
  event: 'release',
  recover: 0.44,
  full: true,
  plantFeet: true,
  steps: [{ t: 0.1, side: 'L', dx: 0, dz: 0.6, lift: 0.2, land: 0.26 }],
  glow: { at: glowAt(0.04, 0.28, 0.4), hands: 'right' },
  keys: [
    k(0, rest),
    k(
      0.18,
      (p, c) => {
        arm(p, 'R', [2.5, 0.8, -1.1, 2.1, 0, 0.4, 0]);
        arm(p, 'L', [1.4, 0.4, 0.1, 0.4]);
        p.fist('R', 0.6);
        trunk(p, -0.6, -0.12);
        weight(p, c, -0.1, 0.05);
      },
      true,
    ),
    k(0.28, (p, c) => {
      arm(p, 'R', [1.7, 0.15, 0.4, 0.2, 0.4, -0.4, 0]);
      arm(p, 'L', [0.4, 0.5, 0, 0.9]);
      p.fist('R', 0);
      trunk(p, 0.35, 0.22);
      weight(p, c, 0.3, 0.1);
    }),
    k(0.46, (p, c) => {
      arm(p, 'R', [0.9, -0.2, 1.0, 0.5, 0.3]);
      arm(p, 'L', [0.2, 0.5, 0, 0.9]);
      trunk(p, 0.55, 0.32);
      weight(p, c, 0.32, 0.14);
    }),
    k(0.8, rest),
  ],
};

/** Down on one knee, a hand pressed to the floor: a trap, a ward, a banner. */
const plant: ActionDef = {
  contact: 0.3,
  event: 'release',
  recover: 0.5,
  full: true,
  plantFeet: true,
  steps: [{ t: 0.04, side: 'L', dx: 0.1, dz: 0.8, lift: 0.2, land: 0.2 }],
  glow: { at: glowAt(0.1, 0.3, 0.55), hands: 'right' },
  keys: [
    k(0, rest),
    k(0.18, (p, c) => {
      trunk(p, 0.1, 0.5);
      arm(p, 'R', [1.0, 0.3, 0.3, 0.6, 0.6, -0.5]);
      arm(p, 'L', [0.6, 0.5, 0.3, 1.0]);
      p.fist('R', 0.2);
      weight(p, c, 0.15, 0.9);
    }),
    k(0.3, (p, c) => {
      trunk(p, 0.15, 0.75);
      arm(p, 'R', [0.85, 0.2, 0.3, 0.15, 0.9, -1.0]);
      arm(p, 'L', [0.5, 0.6, 0.3, 1.2]);
      p.fist('R', 0);
      weight(p, c, 0.2, 1.3);
    }),
    k(0.55, (p, c) => {
      trunk(p, 0.15, 0.7);
      arm(p, 'R', [0.85, 0.2, 0.3, 0.2, 0.9, -1.0]);
      arm(p, 'L', [0.5, 0.6, 0.3, 1.2]);
      weight(p, c, 0.2, 1.25);
    }),
    k(0.95, rest),
  ],
};

/** A knee raised and stamped down: a ring of force from the floor. */
const stomp: ActionDef = {
  contact: 0.3,
  event: 'hit',
  recover: 0.48,
  full: true,
  plantFeet: true,
  steps: [{ t: 0.02, side: 'R', dx: -0.1, dz: 0.3, lift: 1.1, land: 0.3 }],
  keys: [
    k(0, rest),
    k(
      0.18,
      (p, c) => {
        trunk(p, 0, -0.12, 0.08);
        arm(p, 'R', [0.6, 0.7, -0.2, 1.4]);
        arm(p, 'L', [0.6, 0.7, -0.2, 1.4]);
        p.fist('R', 1);
        p.fist('L', 1);
        weight(p, c, -0.05, -0.04, 0.12);
      },
      true,
    ),
    k(0.3, (p, c) => {
      trunk(p, 0, 0.35, 0);
      arm(p, 'R', [0.3, 0.45, 0.4, 1.6]);
      arm(p, 'L', [0.3, 0.45, 0.4, 1.6]);
      weight(p, c, 0.08, 0.3);
    }),
    k(0.5, (p, c) => {
      trunk(p, 0, 0.3, 0);
      arm(p, 'R', [0.3, 0.45, 0.4, 1.5]);
      arm(p, 'L', [0.3, 0.45, 0.4, 1.5]);
      weight(p, c, 0.06, 0.26);
    }),
    k(0.85, rest),
  ],
};

/** Up and over with everything, down into the floor. */
function slamFor(kind: MoveKind): ActionDef {
  const grip = kind === 'great' || kind === 'staff' || kind === 'spear';
  const both = (p: Pose, a: Arm, b: Arm) => {
    arm(p, 'R', a);
    if (grip) p.c[CH.offGrip] = 1;
    else if (kind !== 'shield') arm(p, 'L', b);
  };
  return {
    contact: 0.32,
    event: 'hit',
    recover: 0.55,
    full: true,
    plantFeet: true,
    steps: [{ t: 0.12, side: 'L', dx: 0, dz: 0.5, lift: 0.3, land: 0.3 }],
    keys: [
      k(0, rest),
      k(
        0.2,
        (p, c) => {
          both(p, [3.0, 0.25, -0.2, 2.0, -0.4, 0.4, 0.7], [2.9, 0.25, -0.2, 1.8]);
          trunk(p, 0, -0.28);
          weight(p, c, -0.1, -0.02);
        },
        true,
      ),
      k(0.32, (p, c) => {
        both(p, [0.95, 0.1, 0.3, 0.15, -0.4, 0.1, -0.6], [0.9, 0.2, 0.3, 0.3]);
        trunk(p, 0.05, 0.6);
        weight(p, c, 0.25, 0.55);
      }),
      k(0.58, (p, c) => {
        both(p, [0.85, 0.1, 0.3, 0.2, -0.4, 0.1, -0.6], [0.8, 0.2, 0.3, 0.4]);
        trunk(p, 0.05, 0.55);
        weight(p, c, 0.22, 0.5);
      }),
      k(1.0, rest),
    ],
  };
}

/** A lunge: the back foot thrown far forward, the weapon arm driven out. */
function lungeFor(kind: MoveKind): ActionDef {
  const base = kind === 'unarmed' ? punch('R') : thrust({ grip: kind === 'great' || kind === 'staff' || kind === 'spear', keepOther: kind === 'shield' || kind === 'dual' });
  return {
    ...base,
    steps: [{ t: 0.06, side: 'R', dx: 0.15, dz: 1.9, lift: 0.3, land: 0.24 }],
    keys: base.keys.map((key, i) =>
      i === 2 || i === 3
        ? k(key.t, (p, c) => {
            key.pose(p, c);
            weight(p, c, 0.9, 0.35);
            p.add('spine', 0.1, 0, 0);
          })
        : key,
    ),
  };
}

/** Chest out, arms flung back, head up: a war cry. */
const roar: ActionDef = {
  contact: 0.26,
  event: 'release',
  recover: 0.55,
  full: true,
  plantFeet: true,
  keys: [
    k(0, rest),
    k(
      0.14,
      (p, c) => {
        trunk(p, 0, 0.3);
        for (const s of ['L', 'R'] as Side[]) arm(p, s, [0.6, 0.3, 0.6, 1.8]);
        p.fist('L', 1);
        p.fist('R', 1);
        weight(p, c, 0, 0.1);
      },
      true,
    ),
    k(0.26, (p, c) => {
      trunk(p, 0, -0.32);
      p.add('head', -0.25, 0, 0);
      for (const s of ['L', 'R'] as Side[]) arm(p, s, [-0.35, 0.75, -0.5, 0.9]);
      weight(p, c, 0.04, 0.08);
    }),
    k(0.62, (p, c) => {
      trunk(p, 0, -0.26);
      p.add('head', -0.2, 0, 0);
      for (const s of ['L', 'R'] as Side[]) arm(p, s, [-0.3, 0.7, -0.5, 1.0]);
      weight(p, c, 0.03, 0.07);
    }),
    k(0.95, rest),
  ],
};

/** Gathered in, then gone: a vanish or a blink. */
const blink: ActionDef = {
  contact: 0.16,
  event: 'release',
  recover: 0.3,
  full: true,
  plantFeet: true,
  glow: { at: glowAt(0, 0.16, 0.3), hands: 'both' },
  keys: [
    k(0, rest),
    k(0.16, (p, c) => {
      trunk(p, 0, 0.35);
      for (const s of ['L', 'R'] as Side[]) arm(p, s, [0.9, -0.2, 1.0, 1.9]);
      weight(p, c, 0, 0.5);
    }),
    k(0.3, (p, c) => {
      trunk(p, 0, 0.12);
      for (const s of ['L', 'R'] as Side[]) arm(p, s, [0.4, 0.6, 0, 0.6]);
      weight(p, c, 0, 0.1);
    }),
    k(0.55, rest),
  ],
};

/** Both hands held out, power pouring from them: a beam or a stream. */
const channel: ActionDef = {
  loop: true,
  full: true,
  plantFeet: true,
  glow: { at: () => 1, hands: 'both' },
  keys: [0, 0.6, 1.2].map((t, i) =>
    k(t, (p, c) => {
      const s = i === 1 ? 1 : -1;
      for (const side of ['L', 'R'] as Side[]) arm(p, side, [1.4, 0.28, 0.65, 0.45, 1.1, -0.7, 0]);
      p.fist('L', 0.05);
      p.fist('R', 0.05);
      trunk(p, 0.04 * s, 0.12 + 0.02 * s);
      weight(p, c, 0.08, 0.12 + 0.02 * s);
    }),
  ),
};

/** A forward roll: dive, tuck, over the shoulders, back on the feet. */
const dodge: ActionDef = {
  full: true,
  recover: 0.3,
  keys: [
    k(0, rest),
    k(0.07, (p, c) => {
      p.set('pelvis', 1.2, 0, 0);
      trunk(p, 0, 0.9);
      for (const s of ['L', 'R'] as Side[]) arm(p, s, [1.6, 0.4, 0.4, 0.6]);
      tuck(p, c, 0.6);
      p.c[CH.pelvisY] = -1.6 * c.h;
      p.c[CH.pelvisZ] = 0.3 * c.h;
    }),
    k(0.15, (p, c) => {
      p.set('pelvis', Math.PI, 0, 0);
      trunk(p, 0, 1.0);
      for (const s of ['L', 'R'] as Side[]) arm(p, s, [1.0, 0.3, 0.6, 1.6]);
      tuck(p, c, 1);
      p.c[CH.pelvisY] = -2.4 * c.h;
    }),
    k(0.24, (p, c) => {
      p.set('pelvis', Math.PI * 1.65, 0, 0);
      trunk(p, 0, 0.8);
      for (const s of ['L', 'R'] as Side[]) arm(p, s, [1.2, 0.4, 0.4, 1.2]);
      tuck(p, c, 0.8);
      p.c[CH.pelvisY] = -2.0 * c.h;
    }),
    k(0.32, (p, c) => {
      p.set('pelvis', Math.PI * 2, 0, 0);
      trunk(p, 0, 0.35);
      for (const s of ['L', 'R'] as Side[]) arm(p, s, [0.9, 0.5, 0.2, 1.0]);
      weight(p, c, 0, 0.5);
    }),
    k(0.5, rest),
  ],
};

/** Knees to the chest, for the roll. */
function tuck(p: Pose, _c: ActionCtx, k: number): void {
  p.c[CH.legIk] = 1 - k;
  p.set('thighL', -2.0 * k, 0, 0.1);
  p.set('thighR', -2.0 * k, 0, 0.1);
  p.set('shinL', 2.3 * k);
  p.set('shinR', 2.3 * k);
  p.set('footL', 0.5 * k);
  p.set('footR', 0.5 * k);
}

/** Thrown back by a heavy blow: a step back to catch the weight. */
const stagger: ActionDef = {
  full: true,
  recover: 0.35,
  steps: [{ t: 0.04, side: 'R', dx: -0.1, dz: -1.2, lift: 0.25, land: 0.2 }],
  keys: [
    k(0, rest),
    k(0.1, (p, c) => {
      trunk(p, 0.15 * c.flip, -0.35, 0.1 * c.flip);
      p.add('head', -0.2, 0, 0);
      arm(p, 'R', [0.6, 0.7, 0, 0.7]);
      arm(p, 'L', [0.6, 0.7, 0, 0.7]);
      weight(p, c, -0.3, 0.15);
    }),
    k(0.28, (p, c) => {
      trunk(p, 0.05 * c.flip, 0.2);
      weight(p, c, -0.4, 0.3);
    }),
    k(0.6, rest),
  ],
};

/** Dazed on the spot, swaying. */
const stun: ActionDef = {
  loop: true,
  full: true,
  plantFeet: true,
  keys: [0, 0.8, 1.6].map((t, i) =>
    k(t, (p, c) => {
      const s = i === 1 ? -1 : 1;
      trunk(p, 0.1 * s, 0.25, 0.1 * s);
      p.add('head', 0.35, 0.25 * s, 0.2 * s);
      p.add('neck', 0.15, 0, 0);
      arm(p, 'R', [0.1, 0.18, 0, 0.35]);
      arm(p, 'L', [0.1, 0.18, 0, 0.35]);
      p.fist('R', 0.3);
      p.fist('L', 0.3);
      weight(p, c, 0, 0.25, 0.08 * s);
    }),
  ),
};

/** On the floor: on the back, or face down. */
function lying(face: boolean): PoseFn {
  return (p, c) => {
    const f = c.flip;
    p.set('pelvis', face ? 1.5 : -1.47, 0.1 * f, 0);
    p.c[CH.pelvisY] = -(4.02 - (face ? 0.5 : 0.42)) * c.h;
    p.c[CH.pelvisZ] = (face ? 0.6 : -0.6) * c.h;
    p.c[CH.legIk] = 0;
    p.c[CH.offGrip] = 0;
    p.set('spine', face ? -0.05 : 0.05, 0, 0);
    p.set('chest', face ? -0.05 : 0.05, 0, 0);
    p.set('neck', face ? -0.3 : 0.15, 0.4 * f, 0);
    p.set('head', face ? -0.2 : 0.1, 0.45 * f, 0);
    p.set('thighL', face ? 0.05 : -0.08, 0, 0.12);
    p.set('thighR', face ? 0.1 : 0.05, 0, 0.2);
    p.set('shinL', face ? 0.3 : 0.25);
    p.set('shinR', face ? 0.1 : 0.6);
    p.set('footL', face ? 1.2 : 0.7);
    p.set('footR', face ? 1.1 : 0.6);
    p.set('toeL', 0);
    p.set('toeR', 0);
    if (face) {
      arm(p, 'R', [1.8, 0.6, 0.6, 0.6]);
      arm(p, 'L', [0.2, 0.3, 0.8, 0.3]);
    } else {
      arm(p, 'R', [0.3, 1.2, 0.4, 0.4]);
      arm(p, 'L', [0.2, 0.85, 0.4, 0.7]);
    }
    p.fist('R', 0.3);
    p.fist('L', 0.3);
  };
}

/** Knees go, then the trunk: falling over. */
function fall(face: boolean, land: number, hold: boolean): ActionDef {
  const lie = lying(face);
  return {
    full: true,
    plantFeet: true,
    keys: [
      k(0, rest),
      k(land * 0.3, (p, c) => {
        trunk(p, 0.1 * c.flip, face ? 0.35 : -0.35);
        p.add('head', face ? 0.3 : -0.35, 0, 0);
        arm(p, 'R', [0.5, 0.75, 0, 0.5]);
        arm(p, 'L', [0.5, 0.75, 0, 0.5]);
        p.fist('R', 0.2);
        p.fist('L', 0.2);
        weight(p, c, face ? 0.2 : -0.25, 0.6);
      }),
      k(land * 0.62, (p, c) => {
        p.set('pelvis', face ? 0.7 : -0.6, 0, 0);
        trunk(p, 0.15 * c.flip, face ? 0.5 : -0.4);
        arm(p, 'R', [face ? 1.3 : 0.8, 0.9, 0, 0.4]);
        arm(p, 'L', [face ? 1.3 : 0.8, 0.9, 0, 0.4]);
        p.c[CH.legIk] = 0.6;
        p.set('thighL', face ? -0.6 : -1.2, 0, 0.1);
        p.set('thighR', face ? -0.4 : -1.0, 0, 0.15);
        p.set('shinL', face ? 1.6 : 1.2);
        p.set('shinR', face ? 1.4 : 1.0);
        weight(p, c, face ? 0.7 : -0.6, 2.2);
      }),
      k(land, lie, true),
      ...(hold ? [] : []),
    ],
  };
}

/** From the floor back to the feet. */
const getUp: ActionDef = {
  full: true,
  recover: 0.6,
  keys: [
    k(0, lying(false)),
    k(0.3, (p, c) => {
      // Sat up, one knee drawn in, a hand behind on the floor.
      p.set('pelvis', -0.4, 0, 0);
      p.c[CH.pelvisY] = -3.3 * c.h;
      p.c[CH.legIk] = 0;
      trunk(p, 0, 0.5);
      p.set('thighL', -1.5, 0, 0.2);
      p.set('shinL', 2.2);
      p.set('thighR', -1.2, 0, 0.1);
      p.set('shinR', 0.8);
      arm(p, 'R', [-0.5, 0.4, 0, 0.2]);
      arm(p, 'L', [1.0, 0.3, 0.3, 0.8]);
    }),
    k(0.6, (p, c) => {
      trunk(p, 0, 0.5);
      p.c[CH.legIk] = 1;
      weight(p, c, 0, 1.3);
      arm(p, 'R', [0.6, 0.4, 0.3, 0.8]);
      arm(p, 'L', [0.6, 0.4, 0.3, 0.8]);
    }),
    k(0.9, rest),
  ],
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const SLAMS = new Map<MoveKind, ActionDef>();
const LUNGES = new Map<MoveKind, ActionDef>();
const SHOT = shot();
const SNAP = shot({ quick: true });
const SKY = shot({ up: 0.85 });

const FIXED: Record<string, ActionDef> = {
  cast,
  point,
  hurl,
  plant,
  stomp,
  roar,
  blink,
  channel,
  dodge,
  stagger,
  stun,
  getUp,
  down: fall(false, 0.5, true),
  death: fall(false, 0.8, true),
  deathFwd: fall(true, 0.8, true),
};

/** Every action name the game plays. */
export const ACTION_NAMES = [
  'attack1',
  'attack2',
  'slam',
  'thrust',
  'lunge',
  'stomp',
  'cast',
  'shoot',
  'snapshot',
  'skyshot',
  'channel',
  'point',
  'plant',
  'roar',
  'hurl',
  'blink',
  'dodge',
  'stagger',
  'stun',
  'down',
  'getUp',
  'death',
  'deathFwd',
];

/**
 * The action to play for a name, with what is held. `combo` counts blows in
 * a row and picks the next in the weapon's chain.
 */
export function actionFor(name: string, kind: MoveKind, combo: number): ActionDef {
  switch (name) {
    case 'attack1':
    case 'attack2': {
      if (kind === 'bow') return SHOT;
      const chain = CHAINS[kind];
      return chain[combo % chain.length]!;
    }
    case 'thrust':
      if (kind === 'bow') return SNAP;
      return kind === 'unarmed' ? punch('R') : thrust({ grip: kind === 'great' || kind === 'staff' || kind === 'spear', keepOther: kind === 'shield' || kind === 'dual' });
    case 'lunge': {
      let a = LUNGES.get(kind);
      if (!a) LUNGES.set(kind, (a = lungeFor(kind)));
      return a;
    }
    case 'slam': {
      let a = SLAMS.get(kind);
      if (!a) SLAMS.set(kind, (a = slamFor(kind)));
      return a;
    }
    case 'shoot':
      return kind === 'bow' ? SHOT : point;
    case 'snapshot':
      return kind === 'bow' ? SNAP : point;
    case 'skyshot':
      return kind === 'bow' ? SKY : roar;
    default:
      return FIXED[name] ?? CHAINS.unarmed[0]!;
  }
}

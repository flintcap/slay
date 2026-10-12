/**
 * SLAY — how a hero stands and carries what is in their hands.
 *
 * One stance per way of holding things. Each gives the arms (and a little of
 * the trunk) for standing ready and for moving, how much each arm swings with
 * the stride, and where the feet stand. A right-handed fighter stands with the
 * left foot ahead; a two-hander squares up behind the weapon.
 */
import type { Pose } from './Pose';
import { CH } from './Pose';

export type Stance =
  | 'unarmed'
  | 'oneHand'
  | 'dagger'
  | 'wand'
  | 'dual'
  | 'dualBlade'
  | 'bladeDagger'
  | 'daggerBlade'
  | 'shield'
  | 'twoHand'
  | 'staff'
  | 'bow';

export interface StanceBody {
  /** 0 lean .. 1 heavy: heavy arms hang further out to clear the body. */
  build: number;
  /** Head unit, metres. */
  h: number;
}

export interface StanceFeet {
  /** Sideways from the body centre, metres (+ left). */
  x: number;
  /** Forward, metres. */
  z: number;
  /** Toe-out, radians (+ turns the toes outward). */
  yaw: number;
}

export interface StanceDef {
  /** Standing ready. */
  idle(p: Pose, b: StanceBody): void;
  /** Carrying while walking or running, before the arm swing is added. */
  move(p: Pose, b: StanceBody, run: number): void;
  /** Arm swing with the stride, [left, right], 0 held still .. 1 free. */
  swing: [number, number];
  /** Feet while standing, [left, right]. */
  feet(b: StanceBody): [StanceFeet, StanceFeet];
  /** Knee bend while standing, metres the pelvis drops. */
  crouch: number;
}

/** A free arm hanging relaxed, out far enough to clear the hips. */
function relaxed(p: Pose, side: 'L' | 'R', b: StanceBody, fwd = 0.05, elbow = 0.25): void {
  p.arm(side, fwd, 0.12 + 0.13 * b.build, 0.15, elbow, 0.2, 0.1, 0);
  p.fist(side, 0.45);
}

/** The arm pumping while it runs: elbow bent near square. */
function runArm(p: Pose, side: 'L' | 'R', b: StanceBody, run: number, w = 1): void {
  if (run <= 0 || w <= 0) return;
  const k = run * w;
  const ua = side === 'L' ? 'upperArmL' : 'upperArmR';
  const fa = side === 'L' ? 'foreArmL' : 'foreArmR';
  p.add(ua, 0.1 * k, 0.15 * k, (0.08 + 0.05 * b.build) * k);
  p.add(fa, 1.2 * k, 0, 0);
  p.fist(side, 0.45 + 0.5 * k);
}

/** Standing feet: shoulder width, the lead foot a little ahead. */
function feet(b: StanceBody, width: number, lead: number, toe = 0.12): [StanceFeet, StanceFeet] {
  const w = b.h * width;
  return [
    { x: w, z: lead * b.h, yaw: toe },
    { x: -w, z: -lead * b.h, yaw: -toe },
  ];
}

// One hand's carry in the two-weapon stances, so a long blade and a dagger
// can share a body: the long one upright, the dagger low and reversed.
const sgn = (side: 'L' | 'R') => (side === 'L' ? 1 : -1);

/** A sword, axe or mace held up and ready, point up, tipped forward and out. */
function longIdle(p: Pose, b: StanceBody, side: 'L' | 'R'): void {
  p.arm(side, side === 'R' ? 0.36 : 0.32, 0.36 + 0.1 * b.build, 0.02, side === 'R' ? 0.95 : 0.9, -0.95, -0.1, 0.3);
  p.reach(side, [sgn(side) * 0.8 * b.h, (side === 'R' ? 4.05 : 4.0) * b.h, (side === 'R' ? 0.85 : 0.8) * b.h], [sgn(side) * 0.12, 1, 0.22]);
  p.fist(side, 1);
}
function longMove(p: Pose, b: StanceBody, side: 'L' | 'R', run: number): void {
  p.arm(side, 0.2, 0.32 + 0.1 * b.build, 0.02, 0.75 + 0.4 * run, -0.65, 0, 0.1);
  p.reach(side, [sgn(side) * 0.8 * b.h, 4.0 * b.h, 0.7 * b.h], [sgn(side) * 0.12, 1, 0.35 + 0.2 * run]);
  p.fist(side, 1);
}
/** A dagger low and forward, point back along the forearm. */
function daggerIdle(p: Pose, b: StanceBody, side: 'L' | 'R'): void {
  p.arm(side, side === 'R' ? 0.35 : 0.3, 0.3 + 0.1 * b.build, 0.3, side === 'R' ? 1.2 : 1.1, 0, 0, 0.2);
  p.fist(side, 1);
}
function daggerMove(p: Pose, b: StanceBody, side: 'L' | 'R', run: number): void {
  p.arm(side, 0.15, 0.28 + 0.1 * b.build, 0.2, 0.9 + 0.4 * run, 0, 0, 0.3);
  p.fist(side, 1);
}

export const STANCES: Record<Stance, StanceDef> = {
  unarmed: {
    idle(p, b) {
      relaxed(p, 'L', b, 0.12, 0.45);
      relaxed(p, 'R', b, 0.12, 0.45);
      p.fist('L', 0.8);
      p.fist('R', 0.8);
    },
    move(p, b, run) {
      relaxed(p, 'L', b);
      relaxed(p, 'R', b);
      runArm(p, 'L', b, run);
      runArm(p, 'R', b, run);
    },
    swing: [1, 1],
    feet: (b) => feet(b, 0.4, 0.12),
    crouch: 0.0021,
  },
  // Sword, axe or mace in the right hand, held up and ready; left hand loose.
  oneHand: {
    idle(p, b) {
      p.arm('R', 0.38, 0.34 + 0.1 * b.build, 0.05, 0.95, -0.9, -0.1, 0.3);
      p.fist('R', 1);
      relaxed(p, 'L', b, 0.25, 0.7);
      p.add('chest', 0.04, -0.08, 0);
    },
    move(p, b, run) {
      p.arm('R', 0.2, 0.28 + 0.1 * b.build, 0.05, 0.75 + 0.4 * run, -0.6, 0, 0.05);
      p.fist('R', 1);
      relaxed(p, 'L', b);
      runArm(p, 'L', b, run);
    },
    swing: [1, 0.45],
    feet: (b) => feet(b, 0.42, 0.22),
    crouch: 0.0042,
  },
  // Daggers ride low and reversed, point back along the forearm.
  dagger: {
    idle(p, b) {
      p.arm('R', 0.3, 0.28 + 0.1 * b.build, 0.3, 1.25, -0.2, 0.2, 0);
      p.fist('R', 1);
      relaxed(p, 'L', b, 0.3, 0.9);
      p.add('spine', 0.06, 0, 0);
      p.add('chest', 0.06, -0.06, 0);
    },
    move(p, b, run) {
      p.arm('R', 0.15, 0.26 + 0.1 * b.build, 0.2, 0.9 + 0.4 * run, -0.2, 0.2, 0);
      p.fist('R', 1);
      relaxed(p, 'L', b);
      runArm(p, 'L', b, run);
    },
    swing: [1, 0.6],
    feet: (b) => feet(b, 0.46, 0.25),
    crouch: 0.007,
  },
  // A wand held low and out ahead; the free hand half open.
  wand: {
    idle(p, b) {
      p.arm('R', 0.3, 0.2 + 0.1 * b.build, 0.2, 0.8, 0.3, 0, -0.2);
      p.fist('R', 0.9);
      relaxed(p, 'L', b, 0.2, 0.7);
      p.fist('L', 0.3);
    },
    move(p, b, run) {
      p.arm('R', 0.12, 0.18 + 0.1 * b.build, 0.15, 0.5 + 0.5 * run, 0.3, 0, -0.2);
      p.fist('R', 0.9);
      relaxed(p, 'L', b);
      p.fist('L', 0.3);
      runArm(p, 'L', b, run);
    },
    swing: [1, 0.6],
    feet: (b) => feet(b, 0.4, 0.14),
    crouch: 0.0021,
  },
  // A blade in each hand, both low and forward, weight on the balls of the feet.
  dual: {
    idle(p, b) {
      p.arm('R', 0.35, 0.3 + 0.1 * b.build, 0.3, 1.2, 0, 0, 0.2);
      p.arm('L', 0.3, 0.3 + 0.1 * b.build, 0.3, 1.1, 0, 0, 0.2);
      p.fist('R', 1);
      p.fist('L', 1);
      p.add('spine', 0.06, 0, 0);
      p.add('chest', 0.05, 0, 0);
    },
    move(p, b, run) {
      p.arm('R', 0.15, 0.28 + 0.1 * b.build, 0.2, 0.9 + 0.4 * run, 0, 0, 0.3);
      p.arm('L', 0.15, 0.28 + 0.1 * b.build, 0.2, 0.9 + 0.4 * run, 0, 0, 0.3);
      p.fist('R', 1);
      p.fist('L', 1);
    },
    swing: [0.6, 0.6],
    feet: (b) => feet(b, 0.48, 0.22),
    crouch: 0.007,
  },
  // A sword, axe or mace in each hand: both held up and ready like the
  // one-hander's, the blades upright and a little apart. (The dagger pair's
  // low, turned-in carry pointed long blades across the body, crossing.)
  dualBlade: {
    idle(p, b) {
      longIdle(p, b, 'R');
      longIdle(p, b, 'L');
      p.add('chest', 0.04, 0, 0);
    },
    move(p, b, run) {
      longMove(p, b, 'R', run);
      longMove(p, b, 'L', run);
    },
    swing: [0.45, 0.45],
    feet: (b) => feet(b, 0.46, 0.22),
    crouch: 0.0049,
  },
  // A long blade in the main hand held upright, a dagger in the off hand low.
  bladeDagger: {
    idle(p, b) {
      longIdle(p, b, 'R');
      daggerIdle(p, b, 'L');
      p.add('spine', 0.03, 0, 0);
      p.add('chest', 0.05, -0.03, 0);
    },
    move(p, b, run) {
      longMove(p, b, 'R', run);
      daggerMove(p, b, 'L', run);
    },
    swing: [0.6, 0.45],
    feet: (b) => feet(b, 0.46, 0.24),
    crouch: 0.0056,
  },
  // A dagger in the main hand low, a long blade in the off hand upright.
  daggerBlade: {
    idle(p, b) {
      daggerIdle(p, b, 'R');
      longIdle(p, b, 'L');
      p.add('spine', 0.03, 0, 0);
      p.add('chest', 0.05, 0.03, 0);
    },
    move(p, b, run) {
      daggerMove(p, b, 'R', run);
      longMove(p, b, 'L', run);
    },
    swing: [0.45, 0.6],
    feet: (b) => feet(b, 0.46, 0.24),
    crouch: 0.0056,
  },
  // Shield on the left forearm across the body, weapon ready behind it.
  shield: {
    idle(p, b) {
      p.arm('L', 0.55, 0.15 + 0.08 * b.build, 1.0, 1.55, 0.4, 0, 0);
      p.fist('L', 1);
      p.arm('R', 0.38, 0.34 + 0.1 * b.build, 0.05, 0.95, -0.9, -0.1, 0.3);
      p.fist('R', 1);
      p.add('chest', 0.03, -0.04, 0);
    },
    move(p, b, run) {
      p.arm('L', 0.4, 0.15 + 0.08 * b.build, 0.95, 1.45, 0.4, 0, 0);
      p.fist('L', 1);
      p.arm('R', 0.2, 0.2 + 0.1 * b.build, 0.05, 0.75 + 0.4 * run, -0.6, 0, 0.05);
      p.fist('R', 1);
    },
    swing: [0.25, 0.45],
    feet: (b) => feet(b, 0.46, 0.24),
    crouch: 0.0049,
  },
  // Both hands on the haft, weapon up across the body.
  twoHand: {
    idle(p, b) {
      p.arm('R', 0.55, 0.1 + 0.08 * b.build, 0.55, 1.25, 0.2, -0.2, 0.3);
      p.arm('L', 0.65, 0.05, 0.8, 1.45, 0.3, 0, 0);
      p.fist('R', 1);
      p.fist('L', 1);
      p.add('pelvis', 0, 0.12, 0);
      p.add('chest', 0.04, -0.12, 0);
      p.c[CH.offGrip] = 1;
    },
    move(p, b, run) {
      p.arm('R', 0.45 + 0.1 * run, 0.1 + 0.08 * b.build, 0.5, 1.3, 0.2, -0.2, 0.3);
      p.arm('L', 0.6, 0.05, 0.8, 1.45, 0.3, 0, 0);
      p.fist('R', 1);
      p.fist('L', 1);
      p.add('chest', 0.03, -0.1, 0);
      p.c[CH.offGrip] = 1;
    },
    swing: [0.1, 0.12],
    feet: (b) => feet(b, 0.5, 0.2, 0.2),
    crouch: 0.0063,
  },
  // A tall staff in the right hand, planted like a walking staff.
  staff: {
    idle(p, b) {
      p.arm('R', 0.3, 0.24 + 0.1 * b.build, 0, 1.0, -0.35, 0, -0.4);
      p.fist('R', 1);
      relaxed(p, 'L', b, 0.15, 0.5);
      p.fist('L', 0.5);
    },
    move(p, b, run) {
      p.arm('R', 0.25 + 0.1 * run, 0.22 + 0.1 * b.build, 0, 0.9 + 0.3 * run, -0.3, 0, -0.35);
      p.fist('R', 1);
      relaxed(p, 'L', b);
      runArm(p, 'L', b, run);
    },
    swing: [1, 0.3],
    feet: (b) => feet(b, 0.4, 0.12),
    crouch: 0.0021,
  },
  // Bow in the left hand, low and canted; the string hand free.
  bow: {
    idle(p, b) {
      p.arm('L', 0.25, 0.2 + 0.1 * b.build, -0.1, 0.55, 0.2, 0, -0.3);
      p.fist('L', 1);
      relaxed(p, 'R', b, 0.15, 0.55);
      p.fist('R', 0.6);
    },
    move(p, b, run) {
      p.arm('L', 0.15, 0.2 + 0.1 * b.build, -0.1, 0.45 + 0.6 * run, 0.2, 0, -0.3);
      p.fist('L', 1);
      relaxed(p, 'R', b);
      runArm(p, 'R', b, run);
    },
    swing: [0.5, 1],
    feet: (b) => feet(b, 0.42, 0.14),
    crouch: 0.0028,
  },
};

/** The stance for what is held: the main hand's grip and the off hand. */
export function stanceFor(grip: string, offHand: 'none' | 'shield' | 'weapon' | 'dagger' | 'focus'): Stance {
  switch (grip) {
    case 'twoHand':
      return 'twoHand';
    case 'staff':
      return 'staff';
    case 'bow':
      return 'bow';
    case 'wand':
      return offHand === 'shield' ? 'shield' : 'wand';
    case 'dagger':
      return offHand === 'dagger' ? 'dual' : offHand === 'weapon' ? 'daggerBlade' : offHand === 'shield' ? 'shield' : 'dagger';
    case 'sword':
    case 'axe':
    case 'mace':
    case 'oneHand':
      return offHand === 'weapon' ? 'dualBlade' : offHand === 'dagger' ? 'bladeDagger' : offHand === 'shield' ? 'shield' : 'oneHand';
    default:
      return offHand === 'shield' ? 'shield' : 'unarmed';
  }
}

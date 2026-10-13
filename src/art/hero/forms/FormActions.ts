/**
 * SLAY — the forms' own basic blows: what a cat, a wolf and a bear do when
 * the attack button is held. Spread into `CHAINS` (`../Actions.ts`) under the
 * move kinds 'cat', 'wolf' and 'bear'.
 *
 *  - cat:  fast, flat rakes, right then left, then both paws dragged down.
 *  - wolf: hooking claws to hold, then the head driven in for the bite.
 *  - bear: wide haymakers from the shoulder, then both paws hammered down.
 *
 * Kept free of `../Actions.ts` at run time (it imports this file), so the few
 * helpers here are this file's own.
 */
import { CH, type Pose, type Side } from '../Pose';
import type { ActionCtx, ActionDef, ActionKey, Arm } from '../Actions';

export type FormKind = 'cat' | 'wolf' | 'bear';

type PoseFn = ActionKey['pose'];
const k = (t: number, pose: PoseFn, hold = false): ActionKey => ({ t, pose, hold });
const rest: PoseFn = () => {};
const arm = (p: Pose, side: Side, a: Arm) => p.arm(side, a[0], a[1], a[2], a[3], a[4] ?? 0, a[5] ?? 0, a[6] ?? 0);
const other = (s: Side): Side => (s === 'R' ? 'L' : 'R');

function trunk(p: Pose, yaw: number, lean: number, roll = 0): void {
  p.add('pelvis', lean * 0.25, yaw * 0.3, roll * 0.3);
  p.add('spine', lean * 0.45, yaw * 0.35, roll * 0.4);
  p.add('chest', lean * 0.3, yaw * 0.45, roll * 0.3);
  p.add('neck', -lean * 0.3, -yaw * 0.4, -roll * 0.3);
  p.add('head', -lean * 0.3, -yaw * 0.45, -roll * 0.3);
}

function weight(p: Pose, c: ActionCtx, fwd: number, down: number, side = 0): void {
  p.shift(side * c.h, -down * c.h, fwd * c.h);
}

/** Fingers spread for a rake (0) or curled to hook (1). */
function claws(p: Pose, side: Side, hook: number): void {
  p.set(side === 'L' ? 'fingersL' : 'fingersR', 0.3 + 0.9 * hook);
  p.set(side === 'L' ? 'fingerTipsL' : 'fingerTipsR', 0.6 + 0.6 * hook);
  p.set(side === 'L' ? 'thumbL' : 'thumbR', 0.2 + 0.3 * hook);
}

interface Swipe {
  side: Side;
  wind: Arm;
  hit: Arm;
  follow: Arm;
  /** The other arm at each beat (null keeps the stance's). */
  off?: [Arm, Arm, Arm] | null;
  turn: [number, number, number];
  lean: [number, number, number];
  drive: [number, number];
  t: [number, number, number, number];
  hook?: number;
  /** Head driven forward at contact (a bite). */
  bite?: number;
  /** Both arms swing the same blow, mirrored. */
  both?: boolean;
}

function swipe(s: Swipe): ActionDef {
  const m = s.side === 'R' ? 1 : -1;
  const [tw, th, tf, te] = s.t;
  const beat = (i: 0 | 1 | 2): PoseFn => (p, c) => {
    const a = i === 0 ? s.wind : i === 1 ? s.hit : s.follow;
    arm(p, s.side, a);
    claws(p, s.side, i === 0 ? 0.2 : (s.hook ?? 0.1));
    if (s.both) {
      arm(p, other(s.side), a);
      claws(p, other(s.side), i === 0 ? 0.2 : (s.hook ?? 0.1));
    } else if (s.off) {
      arm(p, other(s.side), s.off[i]);
    }
    trunk(p, s.turn[i] * m, s.lean[i]);
    if (i === 0) weight(p, c, -0.08, 0.04, 0.03 * m);
    if (i === 1) weight(p, c, s.drive[0], s.drive[1], -0.02 * m);
    if (i === 2) weight(p, c, s.drive[0] * 0.85, s.drive[1] * 1.1, -0.03 * m);
    if (s.bite && i === 1) {
      p.add('neck', 0.35 * s.bite, 0, 0);
      p.add('head', 0.25 * s.bite, 0, 0);
    }
    if (s.both) p.c[CH.offGrip] = 0;
  };
  return {
    contact: th,
    event: 'hit',
    side: s.side,
    recover: tf,
    full: true,
    plantFeet: true,
    keys: [k(0, rest), k(tw, beat(0), true), k(th, beat(1)), k(tf, beat(2)), k(te, rest)],
  };
}

// --------------------------------------------------------------------- cat

const CAT_OFF: [Arm, Arm, Arm] = [
  [0.9, 0.3, 0.2, 1.3, 0.4, -0.3],
  [0.4, 0.4, 0.1, 1.0, 0.4, -0.3],
  [0.6, 0.35, 0.2, 1.1, 0.4, -0.3],
];

const catRake = (side: Side): ActionDef =>
  swipe({
    side,
    wind: [1.55, 0.95, -0.5, 1.35, 0.3, -0.6],
    hit: [1.35, -0.15, 0.65, 0.45, 0.3, 0.35],
    follow: [0.85, -0.45, 0.95, 0.75, 0.3, 0.4],
    off: CAT_OFF,
    turn: [-0.5, 0.35, 0.62],
    lean: [0.12, 0.32, 0.36],
    drive: [0.22, 0.08],
    t: [0.09, 0.16, 0.28, 0.5],
  });

/** Both paws up and dragged down the front of the target. */
const catDrag: ActionDef = swipe({
  side: 'R',
  both: true,
  wind: [2.5, 0.45, 0.1, 1.3, 0.5, -0.5],
  hit: [1.25, 0.35, 0.25, 0.4, 0.5, 0.4],
  follow: [0.55, 0.35, 0.25, 0.7, 0.5, 0.5],
  turn: [0, 0, 0],
  lean: [-0.1, 0.4, 0.5],
  drive: [0.26, 0.14],
  t: [0.12, 0.2, 0.34, 0.6],
  hook: 0.4,
});

// --------------------------------------------------------------------- wolf

const wolfHook = (side: Side): ActionDef =>
  swipe({
    side,
    wind: [1.1, 1.1, -0.2, 1.6, 0.6, -0.4],
    hit: [1.45, 0.35, 0.7, 1.05, 0.6, 0.2],
    follow: [1.2, -0.1, 0.9, 1.25, 0.6, 0.2],
    off: [
      [0.5, 0.35, 0.3, 0.9, 0.6],
      [0.2, 0.45, 0.2, 0.7, 0.6],
      [0.3, 0.4, 0.3, 0.8, 0.6],
    ],
    turn: [-0.45, 0.3, 0.5],
    lean: [0.15, 0.35, 0.38],
    drive: [0.2, 0.1],
    t: [0.11, 0.2, 0.34, 0.58],
    hook: 1,
  });

/** Paws pulled back to hold the thing still, and the head goes in. */
const wolfBite: ActionDef = swipe({
  side: 'R',
  both: true,
  wind: [1.3, 0.55, 0.3, 1.5, 0.6, -0.3],
  hit: [0.7, 0.55, 0.3, 1.2, 0.6, 0.2],
  follow: [0.8, 0.5, 0.3, 1.2, 0.6, 0.2],
  turn: [0, 0, 0],
  lean: [0.05, 0.55, 0.5],
  drive: [0.32, 0.12],
  t: [0.12, 0.22, 0.36, 0.62],
  hook: 1,
  bite: 1,
});

// --------------------------------------------------------------------- bear

const bearHaymaker = (side: Side): ActionDef =>
  swipe({
    side,
    wind: [0.9, 1.45, -0.6, 0.9, 0.4, -0.3],
    hit: [1.35, 0.55, 0.65, 0.35, 0.4, 0.2],
    follow: [1.0, -0.2, 1.0, 0.6, 0.4, 0.2],
    off: [
      [0.3, 0.6, 0.3, 0.6, 0.6],
      [0.2, 0.7, 0.2, 0.5, 0.6],
      [0.25, 0.65, 0.3, 0.55, 0.6],
    ],
    turn: [-0.7, 0.35, 0.8],
    lean: [-0.05, 0.25, 0.32],
    drive: [0.16, 0.12],
    t: [0.16, 0.27, 0.44, 0.76],
    hook: 0.5,
  });

/** Both paws raised high and hammered down. */
const bearHammer: ActionDef = swipe({
  side: 'R',
  both: true,
  wind: [2.75, 0.5, 0.2, 1.0, 0.6, -0.2],
  hit: [1.0, 0.45, 0.2, 0.25, 0.6, 0.3],
  follow: [0.55, 0.45, 0.2, 0.4, 0.6, 0.3],
  turn: [0, 0, 0],
  lean: [-0.3, 0.5, 0.62],
  drive: [0.18, 0.22],
  t: [0.2, 0.31, 0.5, 0.86],
  hook: 0.8,
});

/** Each form's chain of basic blows, played in turn. */
export const FORM_CHAINS: Record<FormKind, ActionDef[]> = {
  cat: [catRake('R'), catRake('L'), catDrag],
  wolf: [wolfHook('R'), wolfHook('L'), wolfBite],
  bear: [bearHaymaker('R'), bearHaymaker('L'), bearHammer],
};

/**
 * SLAY — how the Shapeshifter's three forms stand and carry themselves.
 *
 * Spread into `STANCES` (`../Stances.ts`). A form has nothing in its hands:
 * the stance is the animal.
 *
 *  - cat:  low and coiled. Weight forward over bent knees, paws held out and
 *          open with the claws showing, head level, ready to go.
 *  - wolf: hunched and driving. Shoulders rolled forward, head thrust out
 *          on the line of the back, arms low and loose.
 *  - bear: tall and wide. Barely bent, arms hanging out from a huge chest,
 *          the weight rolling side to side.
 *
 * Arm numbers are `Pose.arm` order: raise forward, raise out, internal turn,
 * elbow, forearm turn, wrist flex, wrist tilt.
 */
import type { Pose, Side } from '../Pose';
import type { StanceBody, StanceDef, StanceFeet } from '../Stances';

export type FormStance = 'cat' | 'wolf' | 'bear';

function feet(b: StanceBody, width: number, lead: number, toe = 0.14): [StanceFeet, StanceFeet] {
  const w = b.h * width;
  return [
    { x: w, z: lead * b.h, yaw: toe },
    { x: -w, z: -lead * b.h, yaw: -toe },
  ];
}

/** Bends the trunk forward and keeps the eyes on the horizon. */
function hunch(p: Pose, lean: number, head = 0.85): void {
  p.add('pelvis', lean * 0.2, 0, 0);
  p.add('spine', lean * 0.4, 0, 0);
  p.add('chest', lean * 0.4, 0, 0);
  p.add('neck', -lean * 0.45 * head, 0, 0);
  p.add('head', -lean * 0.4 * head, 0, 0);
}

/** A paw held open, the claws spread. */
function paw(p: Pose, side: Side, k: number): void {
  p.set(side === 'L' ? 'fingersL' : 'fingersR', 0.5 * k);
  p.set(side === 'L' ? 'fingerTipsL' : 'fingerTipsR', 0.75 * k);
  p.set(side === 'L' ? 'thumbL' : 'thumbR', 0.25 * k);
}

/** An arm running: driven fore and aft by the stride, the paw loose. */
function runArm(p: Pose, side: Side, run: number, w: number): void {
  if (run <= 0) return;
  const ua = side === 'L' ? 'upperArmL' : 'upperArmR';
  const fa = side === 'L' ? 'foreArmL' : 'foreArmR';
  p.add(ua, 0.3 * run * w, 0, 0.05 * run);
  p.add(fa, 0.6 * run * w, 0, 0);
}

export const FORM_STANCES: Record<FormStance, StanceDef> = {
  cat: {
    idle(p) {
      hunch(p, 0.42);
      p.arm('R', 0.75, 0.32, 0.25, 1.15, 0.5, -0.35, 0.1);
      p.arm('L', 0.62, 0.36, 0.25, 1.25, 0.5, -0.35, 0.1);
      paw(p, 'R', 0.7);
      paw(p, 'L', 0.75);
      // A coil in the hips: the near side drawn back, ready to spring.
      p.add('pelvis', 0, 0.12, 0);
      p.add('chest', 0, -0.14, 0);
      p.shift(0, -0.07, -0.03);
    },
    move(p, b, run) {
      hunch(p, 0.5 + 0.25 * run);
      p.arm('R', 0.4, 0.22, 0.2, 0.95 + 0.3 * run, 0.4, -0.25, 0);
      p.arm('L', 0.4, 0.22, 0.2, 0.95 + 0.3 * run, 0.4, -0.25, 0);
      runArm(p, 'R', run, 1);
      runArm(p, 'L', run, 1);
      paw(p, 'R', 0.6);
      paw(p, 'L', 0.6);
      p.shift(0, -0.06 - 0.04 * run, 0);
      void b;
    },
    swing: [0.9, 0.9],
    feet: (b) => feet(b, 0.5, 0.3, 0.2),
    crouch: 0.07,
  },
  wolf: {
    idle(p) {
      hunch(p, 0.36, 1.1);
      // Shoulders rolled forward and up round the neck.
      p.add('clavL', 0.12, 0, 0.1);
      p.add('clavR', 0.12, 0, -0.1);
      p.arm('R', 0.4, 0.3, 0.35, 0.85, 0.7, -0.2, 0);
      p.arm('L', 0.44, 0.3, 0.35, 0.8, 0.7, -0.2, 0);
      paw(p, 'R', 0.85);
      paw(p, 'L', 0.85);
      p.add('head', 0.1, 0, 0);
      p.shift(0, -0.05, 0.02);
    },
    move(p, b, run) {
      hunch(p, 0.45 + 0.3 * run, 1.1);
      p.add('clavL', 0.1, 0, 0.08);
      p.add('clavR', 0.1, 0, -0.08);
      p.arm('R', 0.25, 0.25, 0.3, 0.8 + 0.4 * run, 0.6, -0.15, 0);
      p.arm('L', 0.25, 0.25, 0.3, 0.8 + 0.4 * run, 0.6, -0.15, 0);
      runArm(p, 'R', run, 1.2);
      runArm(p, 'L', run, 1.2);
      paw(p, 'R', 0.8);
      paw(p, 'L', 0.8);
      p.shift(0, -0.05 - 0.03 * run, 0.02);
      void b;
    },
    swing: [1, 1],
    feet: (b) => feet(b, 0.46, 0.22, 0.16),
    crouch: 0.055,
  },
  bear: {
    idle(p) {
      hunch(p, 0.2, 0.6);
      // Arms hang out round the gut, elbows soft, paws heavy.
      p.arm('R', 0.22, 0.48, 0.3, 0.55, 0.6, 0.1, 0);
      p.arm('L', 0.2, 0.5, 0.3, 0.6, 0.6, 0.1, 0);
      paw(p, 'R', 1);
      paw(p, 'L', 1);
      p.add('clavL', 0.06, 0, 0.12);
      p.add('clavR', 0.06, 0, -0.12);
      p.shift(0, -0.04, 0);
    },
    move(p, b, run) {
      hunch(p, 0.26 + 0.28 * run, 0.8);
      p.arm('R', 0.2, 0.46, 0.3, 0.6 + 0.3 * run, 0.6, 0.1, 0);
      p.arm('L', 0.2, 0.46, 0.3, 0.6 + 0.3 * run, 0.6, 0.1, 0);
      runArm(p, 'R', run, 0.8);
      runArm(p, 'L', run, 0.8);
      paw(p, 'R', 1);
      paw(p, 'L', 1);
      // The lumber: shoulders roll with the stride.
      p.add('chest', 0, 0, 0.05 * (1 - run));
      p.shift(0, -0.04, 0);
      void b;
    },
    swing: [0.7, 0.7],
    feet: (b) => feet(b, 0.58, 0.16, 0.22),
    crouch: 0.05,
  },
};

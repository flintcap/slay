/**
 * SLAY — hero actions as key poses.
 *
 * An action is a few key poses on a timeline: anticipation, a fast contact,
 * a heavy follow-through, recovery. The animator runs a smooth curve through
 * them and time-warps the run-up so the contact key lands exactly when the
 * game says the blow lands (`PlayOpts.contact`). Each key starts from the
 * stance's standing pose, so a key only says what it changes.
 */
import { CH, type Pose } from './Pose';
import type { Stance, StanceBody } from './Stances';

export interface ActionCtx extends StanceBody {
  stance: Stance;
  /** 1 or -1: alternate sides of a combo, or the way a fall goes. */
  flip: number;
}

export interface ActionKey {
  /** Seconds into the action at natural speed. */
  t: number;
  pose(p: Pose, c: ActionCtx): void;
  /** Arrive and leave at rest instead of flowing through (a held beat). */
  hold?: boolean;
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
  /** Spell light in the hands, natural time to 0..1, and which hands. */
  glow?: { at: (t: number) => number; hands: 'left' | 'right' | 'both' };
}

const k = (t: number, pose: ActionKey['pose'], hold = false): ActionKey => ({ t, pose, hold });
const bell = (t: number, a: number, peak: number, b: number) =>
  t <= a || t >= b ? 0 : t < peak ? (t - a) / (peak - a) : (b - t) / (b - peak);

/**
 * A plain overhand blow with the main hand. Stands in for every weapon until
 * the weapon moves are authored.
 */
const strike: ActionDef = {
  contact: 0.3,
  event: 'hit',
  recover: 0.45,
  full: true,
  plantFeet: true,
  keys: [
    k(0, () => {}),
    k(0.2, (p, c) => {
      p.arm('R', 1.6, 0.5, -0.3, 1.6, 0.2, -0.4, 0.4);
      p.add('chest', -0.08, -0.35 * c.flip, 0);
      p.add('spine', -0.04, -0.2 * c.flip, 0);
      p.add('pelvis', 0, -0.1 * c.flip, 0);
    }, true),
    k(0.3, (p, c) => {
      p.arm('R', 0.9, 0.15, 0.5, 0.3, 0.1, 0.3, 0);
      p.add('chest', 0.18, 0.25 * c.flip, 0);
      p.add('spine', 0.1, 0.15 * c.flip, 0);
      p.add('pelvis', 0.05, 0.1 * c.flip, 0);
      p.shift(0, -0.03, 0.03);
    }),
    k(0.45, (p, c) => {
      p.arm('R', 0.4, 0.05, 0.7, 0.5, 0.1, 0.2, 0);
      p.add('chest', 0.22, 0.35 * c.flip, 0);
      p.add('spine', 0.12, 0.2 * c.flip, 0);
      p.shift(0, -0.04, 0.02);
    }),
    k(0.75, () => {}),
  ],
};

/** Hands brought up and thrust out: a spell leaves at the release key. */
const cast: ActionDef = {
  contact: 0.28,
  event: 'release',
  recover: 0.4,
  full: true,
  plantFeet: true,
  glow: { at: (t) => bell(t, 0.05, 0.28, 0.5), hands: 'both' },
  keys: [
    k(0, () => {}),
    k(0.18, (p) => {
      p.arm('R', 0.9, 0.3, 0.6, 1.9, 0.6, -0.5, 0);
      p.arm('L', 0.9, 0.3, 0.6, 1.9, 0.6, -0.5, 0);
      p.fist('R', 0.2);
      p.fist('L', 0.2);
      p.add('chest', -0.1, 0, 0);
      p.add('head', 0.1, 0, 0);
    }, true),
    k(0.28, (p) => {
      p.arm('R', 1.45, 0.1, 0.8, 0.25, 0.9, -0.9, 0);
      p.arm('L', 1.45, 0.1, 0.8, 0.25, 0.9, -0.9, 0);
      p.fist('R', 0);
      p.fist('L', 0);
      p.add('chest', 0.12, 0, 0);
      p.add('spine', 0.06, 0, 0);
      p.shift(0, -0.02, 0.02);
    }),
    k(0.5, (p) => {
      p.arm('R', 1.2, 0.15, 0.7, 0.5, 0.7, -0.5, 0);
      p.arm('L', 1.2, 0.15, 0.7, 0.5, 0.7, -0.5, 0);
      p.add('chest', 0.06, 0, 0);
    }),
    k(0.8, () => {}),
  ],
};

/** A low, forward dash: tucked and driving, the feet off the floor. */
const dodge: ActionDef = {
  full: true,
  recover: 0.24,
  keys: [
    k(0, () => {}),
    k(0.08, (p) => {
      p.add('spine', 0.35, 0, 0);
      p.add('chest', 0.25, 0, 0);
      p.add('pelvis', 0.2, 0, 0);
      p.shift(0, -0.12, 0);
      p.arm('R', -0.5, 0.3, 0, 1.2);
      p.arm('L', -0.5, 0.3, 0, 1.2);
    }),
    k(0.2, (p) => {
      p.add('spine', 0.3, 0, 0);
      p.add('chest', 0.2, 0, 0);
      p.add('pelvis', 0.15, 0, 0);
      p.shift(0, -0.1, 0);
      p.arm('R', -0.6, 0.35, 0, 1.0);
      p.arm('L', -0.6, 0.35, 0, 1.0);
    }),
    k(0.32, () => {}),
  ],
};

/** Thrown back by a heavy blow, catching the weight. */
const stagger: ActionDef = {
  full: true,
  recover: 0.3,
  keys: [
    k(0, () => {}),
    k(0.1, (p) => {
      p.add('spine', -0.25, 0, 0);
      p.add('chest', -0.2, 0, 0);
      p.add('head', -0.25, 0, 0);
      p.arm('R', 0.5, 0.6, 0, 0.8);
      p.arm('L', 0.5, 0.6, 0, 0.8);
      p.shift(0, -0.05, -0.08);
    }),
    k(0.3, (p) => {
      p.add('spine', 0.15, 0, 0);
      p.add('chest', 0.1, 0, 0);
      p.shift(0, -0.06, -0.02);
    }),
    k(0.55, () => {}),
  ],
};

/** Dazed on the spot. */
const stun: ActionDef = {
  loop: true,
  full: true,
  plantFeet: true,
  keys: [
    k(0, (p) => {
      p.add('spine', 0.2, 0, 0.08);
      p.add('head', 0.3, 0.2, 0.15);
      p.arm('R', 0.1, 0.15, 0, 0.3);
      p.arm('L', 0.1, 0.15, 0, 0.3);
      p.shift(0.02, -0.05, 0);
    }),
    k(0.8, (p) => {
      p.add('spine', 0.22, 0, -0.08);
      p.add('head', 0.35, -0.2, -0.15);
      p.arm('R', 0.1, 0.15, 0, 0.3);
      p.arm('L', 0.1, 0.15, 0, 0.3);
      p.shift(-0.02, -0.06, 0);
    }),
    k(1.6, (p) => {
      p.add('spine', 0.2, 0, 0.08);
      p.add('head', 0.3, 0.2, 0.15);
      p.arm('R', 0.1, 0.15, 0, 0.3);
      p.arm('L', 0.1, 0.15, 0, 0.3);
      p.shift(0.02, -0.05, 0);
    }),
  ],
};

/** On the back on the floor, legs out: knocked down or dead. */
function lying(p: Pose, c: ActionCtx): void {
  p.set('pelvis', -1.45, 0.1 * c.flip, 0);
  p.c[CH.pelvisY] = -(c.h * 4.02 - c.h * 0.42);
  p.c[CH.pelvisZ] = -c.h * 0.2;
  p.c[CH.legIk] = 0;
  p.set('spine', 0.05, 0, 0);
  p.set('chest', 0.05, 0, 0);
  p.set('neck', 0.15, 0.3 * c.flip, 0);
  p.set('head', 0.1, 0.35 * c.flip, 0);
  p.set('thighL', -1.4, 0, 0.12);
  p.set('thighR', -1.3, 0, 0.18);
  p.set('shinL', 0.3, 0, 0);
  p.set('shinR', 0.6, 0, 0);
  p.set('footL', 0.5, 0, 0);
  p.set('footR', 0.4, 0, 0);
  p.arm('R', 0.3, 1.1, 0.4, 0.4);
  p.arm('L', 0.2, 0.9, 0.4, 0.6);
  p.fist('R', 0.3);
  p.fist('L', 0.3);
}

const fall = (keyT: number): ActionDef => ({
  full: true,
  plantFeet: true,
  keys: [
    k(0, () => {}),
    k(keyT * 0.35, (p) => {
      p.add('spine', -0.3, 0, 0);
      p.add('chest', -0.2, 0, 0);
      p.add('head', -0.3, 0, 0);
      p.shift(0, -0.25, -0.1);
      p.arm('R', 0.6, 0.7, 0, 0.5);
      p.arm('L', 0.6, 0.7, 0, 0.5);
    }),
    k(keyT, lying, true),
  ],
});

/** Every action the game plays; unlisted names fall back to the nearest. */
export const ACTIONS: Record<string, ActionDef> = {
  attack1: strike,
  attack2: strike,
  slam: strike,
  thrust: strike,
  lunge: strike,
  stomp: strike,
  cast,
  shoot: cast,
  channel: { ...cast, loop: true, contact: undefined, event: undefined },
  point: cast,
  plant: cast,
  roar: cast,
  hurl: cast,
  blink: cast,
  skyshot: cast,
  snapshot: cast,
  dodge,
  stagger,
  stun,
  down: fall(0.5),
  death: fall(0.8),
  deathFwd: fall(0.8),
};

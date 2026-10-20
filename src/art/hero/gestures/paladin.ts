/**
 * The Paladin's gestures: one per active skill. See `../SkillActions.ts` for
 * how a gesture is written.
 *
 * He fights with a mace or a sword and a shield, or a two-hander. The main
 * keys are written for a one-hander and a shield (weapon in `R`, shield in
 * `L`); a gesture that leaves `L` out keeps the shield where the stance has
 * it, or keeps both hands on a two-hander's haft. Shield skills give the
 * two-hander its own keys (`alt.great`): the haft does the shield's work.
 *
 * Mace blows are slow and heavy and land from above (a bell-ringer's swing,
 * a smith's drop, a knee in the floor). Blade cuts are short, exact and
 * close to the body (a thrust from the guard, a cross, a flurry like lines of
 * a prayer). Aura skills are rites said with the off hand: a candle lit at
 * the floor, a brow anointed, a rope hauled, a palm on the stone.
 */
import type { ActionStep } from '../Actions';
import type { Side } from '../Pose';
import { defineGestures, reach, type G, type Spec, step } from '../SkillActions';

/** A step with its own lift, heads. */
const lift = (side: Side, t: number, dz: number, dx: number, up: number, land: number): ActionStep => ({ t, side, dx, dz, lift: up, land });

// Shield arm places (left arm, `Pose.arm` order).
/** Shield held up before the chest, rim at the chin. */
const GUARD: G['L'] = [1.2, -0.1, 1.3, 1.6, 0.45];
/** Shield pulled in tight to the shoulder, elbow down. */
const HUG: G['L'] = [0.75, 0.0, 1.35, 2.15, 0.4];
/** Shield driven straight out at arm's length. */
const RAM: G['L'] = [1.45, 0.0, 1.15, 0.7, 0.45];
/** Shield low by the knee, rim down. */
const LOW: G['L'] = [0.45, 0.05, 1.1, 0.9, 0.3];

// Free-hand places for the Aura rites (left arm, `Pose.arm` order).
/** Open palm raised before him, toward them. */
const PALM: G['L'] = [1.6, 0.25, 0.55, 0.4, 1.1, -0.95];
/** Arm flung out to the side, open. */
const WIDE: G['L'] = [0.35, 1.5, -0.15, 0.15, 0.6, -0.5];
/** Fist on the breastbone. */
const HEART: G['L'] = [0.95, -0.45, 1.2, 2.25, 0.4];
/** Hand up at the brow. */
const BROW: G['L'] = [1.35, 0.25, 0.85, 2.35, 0.6, -0.4];
/** Reaching straight up. */
const HIGH: G['L'] = [2.95, 0.15, 0.3, 0.15, 0.5, -0.3];
/** Shield driven up off the lead foot, rim first, into a jaw. */
const RIM_UP: G['L'] = [1.85, -0.05, 1.05, 0.55, 0.45];

/**
 * The same blow with a two-hander: both hands on the haft, the trunk wound
 * further and the weight dropped lower, so it reads slower and bigger. A
 * key's shield arm is let go.
 */
const big = (g: G): G => {
  const { L: _shield, ...rest } = g;
  return { ...rest, grip: true, turn: (g.turn ?? 0) * 1.25, lean: (g.lean ?? 0) * 1.15, down: (g.down ?? 0) + 0.06 };
};
const greatOf = (keys: Spec['keys']): Array<G | null> => keys.map(([, g]) => big(g));

/**
 * A blow of the weapon: wound up (held), struck at `contact`, followed
 * through. It swings the real mace or sword, so it draws no spell round it;
 * with a two-hander it is the same blow, bigger.
 */
function blow(s: Omit<Spec, 'hit' | 'blade'>): Spec {
  return { ...s, hit: true, blade: true, alt: { great: greatOf(s.keys), ...s.alt } };
}

/** A blow of the shield (`L`), the weapon held back. These skills need a shield, so there is no two-hander's version. */
function shieldBlow(s: Omit<Spec, 'hit' | 'blade' | 'side'>): Spec {
  return { ...s, hit: true, blade: true, side: 'L' };
}

/** Mace held back and up behind the shield, out of the way of a shield blow. */
const MACE_BACK = reach([-0.42, 1.35, -0.22], [0.1, 0.7, -0.7]);

// ---------------------------------------------------------------------------
// Mace: heavy, from above
// ---------------------------------------------------------------------------

const MACE: Record<string, Spec> = {
  /** The bell-ringer's blow: up on the toes with the weapon high behind the head, then down through the crown. */
  tollingBlow: blow({
    keys: [
      [0.22, { R: reach([-0.2, 2.15, -0.2], [0.0, 0.3, -0.95]), L: GUARD, lean: -0.25, down: -0.06, head: -0.1 }, true],
      [0.34, { R: reach([-0.12, 1.3, 0.62], [0.0, -0.4, 0.92]), L: HUG, lean: 0.42, down: 0.25, fwd: 0.22 }],
      [0.55, { R: reach([-0.12, 0.9, 0.5], [0.0, -0.85, 0.5]), L: HUG, lean: 0.48, down: 0.3, fwd: 0.22 }],
    ],
    steps: [lift('L', 0.12, 0.45, 0.02, 0.25, 0.34)],
    contact: 0.34,
    end: 0.95,
  }),
  /** The shield turned edge-on and driven up into the jaw off the lead foot. */
  shieldCrack: shieldBlow({
    keys: [
      [0.14, { L: LOW, R: MACE_BACK, turn: 0.35, down: 0.2, lean: 0.12 }, true],
      [0.25, { L: RIM_UP, R: MACE_BACK, turn: -0.35, lean: 0.15, fwd: 0.35, down: -0.04, head: -0.05 }],
      [0.42, { L: [1.65, -0.05, 1.05, 0.7, 0.45], R: MACE_BACK, turn: -0.3, lean: 0.12, fwd: 0.3 }],
    ],
    steps: [step('L', 0.1, 0.55, 0.05)],
    contact: 0.25,
    end: 0.75,
  }),
  /** A smith's drop: the weapon brought straight up over the head and let fall on cold iron. */
  anvilfall: blow({
    keys: [
      [0.26, { R: reach([-0.15, 2.2, 0.05], [0.0, 0.9, -0.4]), L: HUG, lean: -0.15, head: -0.15 }, true],
      [0.38, { R: reach([-0.1, 1.05, 0.55], [0.0, -0.75, 0.66]), L: HUG, lean: 0.5, down: 0.42, fwd: 0.15 }],
      [0.62, { R: reach([-0.1, 0.75, 0.48], [0.0, -0.95, 0.3]), L: HUG, lean: 0.55, down: 0.45, fwd: 0.15 }],
    ],
    steps: [step('L', 0.2, 0.3, 0, 0.38)],
    contact: 0.38,
    end: 1.05,
  }),
  /**
   * Shield up and forward, shoulder behind it, running: held while he is
   * carried down the lane, then the shield driven into the one he reaches.
   */
  doorbreaker: shieldBlow({
    keys: [
      [0.08, { L: HUG, R: reach([-0.42, 1.2, -0.3], [0.0, 0.5, -0.86]), turn: 0.45, lean: 0.35, down: 0.2, fwd: 0.2 }, true],
      [0.16, { L: GUARD, R: reach([-0.45, 1.2, -0.3], [0.0, 0.5, -0.86]), turn: 0.55, lean: 0.48, down: 0.22, fwd: 0.35, head: 0.12 }, true],
      [0.24, { L: RAM, R: reach([-0.45, 1.25, -0.28], [0.0, 0.55, -0.83]), turn: -0.2, lean: 0.4, fwd: 0.5, down: 0.18 }],
      [0.45, { L: [1.3, 0.05, 1.15, 1.0, 0.45], R: reach([-0.42, 1.3, -0.22], [0.05, 0.6, -0.8]), turn: -0.15, lean: 0.3, fwd: 0.4, down: 0.14 }],
    ],
    contact: 0.24,
    free: true,
    end: 0.8,
  }),
  /** A flat swing from the side, like a clapper striking the bell's waist. */
  knell: blow({
    keys: [
      [0.2, { R: reach([-0.65, 1.45, -0.15], [-0.7, 0.3, -0.6]), L: GUARD, turn: -0.75, lean: 0.05, down: 0.12 }, true],
      [0.32, { R: reach([-0.05, 1.5, 0.65], [0.6, 0.05, 0.8]), L: HUG, turn: 0.15, lean: 0.22, fwd: 0.15, down: 0.15 }],
      [0.52, { R: reach([0.45, 1.4, 0.25], [0.85, 0.0, -0.4]), L: HUG, turn: 0.7, lean: 0.25, down: 0.15 }],
    ],
    steps: [step('L', 0.14, 0.35, 0.1)],
    contact: 0.32,
    end: 0.95,
  }),
  /** A long coil over the shoulder and a slow arc down through the target into the floor. */
  pilgrimsMaul: blow({
    keys: [
      [0.3, { R: reach([-0.45, 1.95, -0.35], [-0.1, 0.4, -0.9]), L: GUARD, turn: -0.7, lean: -0.15, down: 0.1, head: -0.05 }, true],
      [0.42, { R: reach([-0.1, 1.5, 0.45], [0.05, -0.1, 0.99]), L: HUG, turn: -0.15, lean: 0.25, down: 0.2, fwd: 0.18 }],
      [0.5, { R: reach([-0.05, 0.85, 0.65], [0.0, -0.85, 0.5]), L: HUG, turn: 0.05, lean: 0.6, down: 0.55, fwd: 0.3 }],
      [0.8, { R: reach([-0.05, 0.6, 0.6], [0.0, -0.95, 0.3]), L: HUG, turn: 0.05, lean: 0.62, down: 0.58, fwd: 0.3 }],
    ],
    steps: [step('L', 0.36, 0.6, 0.05, 0.5)],
    contact: 0.5,
    end: 1.3,
  }),
  /** The reliquary in the shield's boss punched straight out, a short step behind it. */
  relicBash: shieldBlow({
    keys: [
      [0.14, { L: HUG, R: MACE_BACK, turn: 0.4, lean: 0.05, fwd: -0.05, down: 0.1 }, true],
      [0.25, { L: RAM, R: MACE_BACK, turn: -0.4, lean: 0.25, fwd: 0.42, down: 0.12 }],
      [0.42, { L: [1.35, 0.02, 1.15, 0.9, 0.45], R: MACE_BACK, turn: -0.32, lean: 0.2, fwd: 0.36, down: 0.1 }],
    ],
    steps: [step('L', 0.1, 0.5)],
    contact: 0.25,
    end: 0.75,
  }),
  /** Judgement: the weapon raised high and held a beat, then down with the whole body onto one knee. */
  ironVerdict: blow({
    keys: [
      [0.25, { R: reach([-0.12, 2.25, 0.0], [0.0, 0.98, -0.15]), L: GUARD, lean: -0.3, down: -0.06, head: -0.25 }, true],
      [0.4, { R: reach([-0.12, 2.28, -0.05], [0.0, 0.95, -0.3]), L: GUARD, lean: -0.32, down: -0.08, head: -0.28 }, true],
      [0.52, { R: reach([-0.08, 0.9, 0.7], [0.0, -0.8, 0.6]), L: HUG, lean: 0.62, down: 0.85, fwd: 0.3, head: 0.1 }],
      [0.85, { R: reach([-0.08, 0.62, 0.62], [0.0, -0.95, 0.3]), L: HUG, lean: 0.6, down: 0.82, fwd: 0.28 }],
    ],
    steps: [step('L', 0.42, 0.55, 0.05, 0.52), step('R', 0.46, -0.3, -0.05, 0.52)],
    contact: 0.52,
    end: 1.4,
  }),
  /** The shield set low and square, his shoulder behind it, the weapon laid across its back like a bar. */
  barTheDoor: {
    keys: [
      [0.14, { R: reach([-0.35, 1.1, 0.0], [0.3, 0.5, 0.8]), L: HUG, down: 0.15, lean: 0.05 }, true],
      [0.28, { R: reach([-0.3, 1.18, 0.38], [0.97, 0.05, 0.2]), L: [1.0, -0.2, 1.4, 1.45, 0.45], down: 0.48, lean: 0.32, fwd: 0.1 }],
      [0.6, { R: reach([-0.3, 1.16, 0.36], [0.97, 0.05, 0.2]), L: [1.0, -0.2, 1.4, 1.5, 0.45], down: 0.46, lean: 0.3, fwd: 0.1 }],
    ],
    steps: [step('L', 0.08, 0.3, 0.1), step('R', 0.16, -0.35, -0.1)],
    alt: {
      // The haft planted point-down before him and leant on.
      great: [
        { R: reach([-0.2, 1.3, 0.2], [0.0, -0.9, 0.4]), down: 0.15, lean: 0.05 },
        { R: reach([-0.05, 1.25, 0.5], [0.0, -0.98, 0.15]), down: 0.48, lean: 0.32, fwd: 0.1 },
        { R: reach([-0.05, 1.23, 0.48], [0.0, -0.98, 0.15]), down: 0.46, lean: 0.3, fwd: 0.1 },
      ],
    },
    glow: 'left',
    end: 0.95,
  },
  /** The censer swung round on its chain from the off hand, once, and let fly underarm. */
  hurlCenser: {
    keys: [
      [0.14, { R: reach([-0.4, 1.2, -0.05], [0.0, 0.7, 0.7]), L: [0.2, 1.3, 0.3, 0.3, 0.3], turn: 0.4, down: 0.1 }, true],
      [0.26, { R: reach([-0.42, 1.18, -0.05], [0.0, 0.7, 0.7]), L: [-0.4, 0.55, 0.1, 0.25, 0.3], turn: 0.7, down: 0.2, lean: 0.1 }],
      [0.36, { R: reach([-0.4, 1.2, -0.08], [0.0, 0.7, 0.7]), L: [1.75, 0.2, 0.3, 0.1, 0.8, -0.7], turn: -0.35, lean: 0.25, fwd: 0.3, fistL: 0 }],
      [0.55, { R: reach([-0.4, 1.2, -0.08], [0.0, 0.7, 0.7]), L: [1.55, 0.25, 0.3, 0.2, 0.8, -0.6], turn: -0.3, lean: 0.2, fwd: 0.25 }],
    ],
    steps: [step('L', 0.26, 0.5)],
    contact: 0.36,
    glow: 'left',
    end: 0.85,
  },
};

// ---------------------------------------------------------------------------
// Blade: short, exact, close
// ---------------------------------------------------------------------------

const BLADE: Record<string, Spec> = {
  /** A short, exact thrust from a low guard on a stepping foot, and straight back to guard. */
  oathCut: blow({
    keys: [
      [0.14, { R: reach([-0.3, 1.05, 0.15], [0.05, 0.25, 0.97]), L: GUARD, turn: 0.25, down: 0.18, fwd: -0.05 }, true],
      [0.24, { R: reach([-0.12, 1.3, 0.85], [0.02, 0.05, 1.0]), L: GUARD, turn: -0.2, lean: 0.25, fwd: 0.35, down: 0.15 }],
      [0.42, { R: reach([-0.2, 1.25, 0.6], [0.03, 0.1, 0.99]), L: GUARD, turn: -0.1, lean: 0.18, fwd: 0.22, down: 0.12 }],
    ],
    steps: [step('L', 0.12, 0.45)],
    contact: 0.24,
    end: 0.7,
  }),
  /** Turn the Blade's answer: out of the turned guard, a quick cut down across whoever was turned. */
  'turnTheBlade.answer': blow({
    keys: [
      [0.08, { R: reach([0.05, 1.6, 0.38], [0.6, 0.78, 0.1]), L: GUARD, turn: 0.3, fwd: -0.1, down: 0.1 }, true],
      [0.18, { R: reach([-0.15, 1.2, 0.75], [-0.4, -0.3, 0.86]), L: GUARD, turn: -0.3, lean: 0.25, fwd: 0.3, down: 0.15 }],
      [0.36, { R: reach([-0.45, 1.0, 0.35], [-0.7, -0.4, 0.5]), L: GUARD, turn: -0.45, lean: 0.25, fwd: 0.25, down: 0.15 }],
    ],
    steps: [step('L', 0.08, 0.4)],
    contact: 0.18,
    end: 0.6,
  }),
  /** A forehand and a backhand in one breath, each landing on its own swing. */
  twinVerse: blow({
    keys: [
      [0.14, { R: reach([-0.55, 1.55, -0.05], [-0.5, 0.5, -0.7]), L: GUARD, turn: -0.55, down: 0.1 }, true],
      [0.24, { R: reach([-0.05, 1.3, 0.65], [0.6, -0.15, 0.78]), L: GUARD, turn: 0.15, lean: 0.2, fwd: 0.15, down: 0.12 }],
      [0.32, { R: reach([0.4, 1.45, 0.25], [0.7, 0.4, -0.55]), L: GUARD, turn: 0.55, lean: 0.12, down: 0.1 }],
      [0.42, { R: reach([-0.1, 1.25, 0.65], [-0.6, -0.15, 0.78]), L: GUARD, turn: -0.15, lean: 0.22, fwd: 0.18, down: 0.14 }],
      [0.58, { R: reach([-0.55, 1.1, 0.2], [-0.8, -0.2, -0.5]), L: GUARD, turn: -0.55, lean: 0.2, down: 0.14 }],
    ],
    steps: [step('L', 0.1, 0.35), step('R', 0.34, 0.25)],
    contact: 0.24,
    cuts: [0.42],
    end: 0.85,
  }),
  /** The blade shown high, held through the side step, then the real cut from the side. */
  feint: blow({
    keys: [
      [0.1, { R: reach([-0.2, 1.95, 0.1], [0.1, 0.9, 0.4]), L: GUARD, turn: 0.2, lean: -0.1, head: -0.1 }, true],
      [0.2, { R: reach([-0.5, 1.5, -0.1], [-0.6, 0.5, -0.6]), L: GUARD, turn: -0.5, lean: 0.05, down: 0.15 }, true],
      [0.3, { R: reach([0.0, 1.25, 0.65], [0.6, -0.2, 0.77]), L: GUARD, turn: 0.2, lean: 0.25, fwd: 0.2, down: 0.15 }],
      [0.5, { R: reach([0.45, 1.1, 0.2], [0.8, -0.3, -0.5]), L: GUARD, turn: 0.6, lean: 0.25, down: 0.15 }],
    ],
    contact: 0.3,
    free: true,
    end: 0.85,
  }),
  /** Five diagonal cuts like five lines of a prayer, forehand and backhand by turns, a small step in with each. */
  litany: blow({
    keys: [
      [0.12, { R: reach([-0.5, 1.75, 0.0], [-0.3, 0.7, -0.6]), L: GUARD, turn: -0.5, down: 0.08 }, true],
      [0.2, { R: reach([0.05, 1.15, 0.62], [0.5, -0.45, 0.74]), L: GUARD, turn: 0.2, lean: 0.2, down: 0.14, fwd: 0.1 }],
      [0.26, { R: reach([0.35, 1.7, 0.15], [0.4, 0.7, -0.55]), L: GUARD, turn: 0.45, down: 0.1, fwd: 0.1 }],
      [0.33, { R: reach([-0.15, 1.15, 0.62], [-0.5, -0.45, 0.74]), L: GUARD, turn: -0.2, lean: 0.22, down: 0.14, fwd: 0.14 }],
      [0.39, { R: reach([-0.5, 1.75, 0.0], [-0.3, 0.7, -0.6]), L: GUARD, turn: -0.5, down: 0.08, fwd: 0.14 }],
      [0.46, { R: reach([0.05, 1.15, 0.62], [0.5, -0.45, 0.74]), L: GUARD, turn: 0.2, lean: 0.22, down: 0.14, fwd: 0.18 }],
      [0.52, { R: reach([0.35, 1.7, 0.15], [0.4, 0.7, -0.55]), L: GUARD, turn: 0.45, down: 0.1, fwd: 0.18 }],
      [0.59, { R: reach([-0.15, 1.15, 0.62], [-0.5, -0.45, 0.74]), L: GUARD, turn: -0.2, lean: 0.22, down: 0.14, fwd: 0.22 }],
      [0.65, { R: reach([-0.5, 1.75, 0.0], [-0.3, 0.7, -0.6]), L: GUARD, turn: -0.5, down: 0.1, fwd: 0.22 }],
      [0.73, { R: reach([0.05, 1.1, 0.65], [0.5, -0.5, 0.7]), L: GUARD, turn: 0.25, lean: 0.3, down: 0.2, fwd: 0.28 }],
      [0.9, { R: reach([0.45, 0.95, 0.2], [0.6, -0.6, -0.5]), L: GUARD, turn: 0.55, lean: 0.3, down: 0.2, fwd: 0.26 }],
    ],
    steps: [step('L', 0.14, 0.25), step('R', 0.36, 0.25), step('L', 0.6, 0.25)],
    contact: 0.2,
    cuts: [0.33, 0.46, 0.59, 0.73],
    end: 1.1,
  }),
  /** A long, low fencer's lunge: held drawn back while he is carried in, then the point driven home. */
  confessionThrust: blow({
    keys: [
      [0.1, { R: reach([-0.35, 1.1, -0.05], [0.05, 0.1, 0.99]), L: LOW, turn: 0.35, down: 0.3, lean: 0.2 }, true],
      [0.2, { R: reach([-0.12, 1.0, 0.95], [0.02, -0.05, 1.0]), L: LOW, turn: -0.25, lean: 0.5, fwd: 0.55, down: 0.55 }],
      [0.45, { R: reach([-0.15, 1.02, 0.85], [0.02, -0.05, 1.0]), L: LOW, turn: -0.22, lean: 0.45, fwd: 0.5, down: 0.5 }],
    ],
    contact: 0.2,
    free: true,
    end: 0.85,
  }),
  /** Two cuts that cross: one wide and flat at the waist, then one straight down through the middle. */
  crosswise: blow({
    keys: [
      [0.16, { R: reach([-0.65, 1.25, -0.1], [-0.7, 0.05, -0.7]), L: GUARD, turn: -0.8, down: 0.15 }, true],
      [0.28, { R: reach([-0.05, 1.2, 0.65], [0.5, -0.05, 0.86]), L: GUARD, turn: 0.1, lean: 0.2, down: 0.18, fwd: 0.12 }],
      [0.38, { R: reach([0.5, 1.2, 0.2], [0.85, 0.0, -0.45]), L: GUARD, turn: 0.75, lean: 0.2, down: 0.15 }],
      [0.48, { R: reach([-0.15, 2.1, 0.0], [0.0, 0.6, -0.8]), L: GUARD, lean: -0.2, head: -0.1 }],
      [0.58, { R: reach([-0.1, 1.05, 0.62], [0.0, -0.6, 0.8]), L: GUARD, lean: 0.45, down: 0.3, fwd: 0.2 }],
      [0.76, { R: reach([-0.1, 0.8, 0.5], [0.0, -0.9, 0.42]), L: GUARD, lean: 0.48, down: 0.32, fwd: 0.2 }],
    ],
    steps: [step('L', 0.12, 0.35, 0.1), step('R', 0.5, 0.25)],
    contact: 0.28,
    cuts: [0.58],
    end: 1.05,
  }),
  /** The point turned down and driven in: a short stab from above, the weight dropped behind it. */
  mercyStroke: blow({
    keys: [
      [0.18, { R: reach([-0.2, 1.75, 0.3], [0.0, -0.6, 0.8]), L: GUARD, lean: -0.05, head: 0.05, down: 0.05 }, true],
      [0.3, { R: reach([-0.12, 0.95, 0.65], [0.0, -0.9, 0.4]), L: HUG, lean: 0.5, down: 0.45, fwd: 0.22, head: 0.15 }],
      [0.55, { R: reach([-0.15, 1.0, 0.55], [0.0, -0.92, 0.35]), L: HUG, lean: 0.45, down: 0.42, fwd: 0.2, head: 0.15 }],
    ],
    steps: [step('L', 0.14, 0.4, 0, 0.3)],
    contact: 0.3,
    end: 0.95,
  }),
  /** Seven thrusts from the guard, high and low by turns, each on its own; the seventh at full stretch. */
  sevenfold: blow({
    keys: [
      [0.1, { R: reach([-0.3, 1.25, 0.2], [0.03, 0.05, 1.0]), L: GUARD, turn: 0.2, down: 0.15 }, true],
      [0.16, { R: reach([-0.12, 1.5, 0.8], [0.02, 0.1, 1.0]), L: GUARD, turn: -0.15, lean: 0.2, fwd: 0.2, down: 0.12 }],
      [0.21, { R: reach([-0.3, 1.25, 0.2], [0.03, 0.05, 1.0]), L: GUARD, turn: 0.2, down: 0.15, fwd: 0.05 }],
      [0.26, { R: reach([-0.12, 1.0, 0.8], [0.02, -0.15, 0.99]), L: GUARD, turn: -0.15, lean: 0.28, fwd: 0.22, down: 0.22 }],
      [0.31, { R: reach([-0.3, 1.25, 0.2], [0.03, 0.05, 1.0]), L: GUARD, turn: 0.2, down: 0.15, fwd: 0.08 }],
      [0.36, { R: reach([-0.12, 1.5, 0.8], [0.02, 0.1, 1.0]), L: GUARD, turn: -0.15, lean: 0.2, fwd: 0.24, down: 0.12 }],
      [0.41, { R: reach([-0.3, 1.25, 0.2], [0.03, 0.05, 1.0]), L: GUARD, turn: 0.2, down: 0.15, fwd: 0.1 }],
      [0.46, { R: reach([-0.12, 1.0, 0.8], [0.02, -0.15, 0.99]), L: GUARD, turn: -0.15, lean: 0.28, fwd: 0.26, down: 0.22 }],
      [0.51, { R: reach([-0.3, 1.25, 0.2], [0.03, 0.05, 1.0]), L: GUARD, turn: 0.2, down: 0.15, fwd: 0.12 }],
      [0.56, { R: reach([-0.12, 1.5, 0.8], [0.02, 0.1, 1.0]), L: GUARD, turn: -0.15, lean: 0.2, fwd: 0.28, down: 0.12 }],
      [0.61, { R: reach([-0.3, 1.25, 0.2], [0.03, 0.05, 1.0]), L: GUARD, turn: 0.2, down: 0.15, fwd: 0.14 }],
      [0.66, { R: reach([-0.12, 1.0, 0.8], [0.02, -0.15, 0.99]), L: GUARD, turn: -0.15, lean: 0.28, fwd: 0.3, down: 0.22 }],
      [0.73, { R: reach([-0.35, 1.25, 0.05], [0.03, 0.05, 1.0]), L: GUARD, turn: 0.35, down: 0.22, fwd: 0.1 }, true],
      [0.82, { R: reach([-0.08, 1.25, 1.0], [0.0, 0.0, 1.0]), L: GUARD, turn: -0.35, lean: 0.42, fwd: 0.5, down: 0.3 }],
      [0.95, { R: reach([-0.1, 1.22, 0.92], [0.0, 0.0, 1.0]), L: GUARD, turn: -0.32, lean: 0.4, fwd: 0.46, down: 0.28 }],
    ],
    steps: [step('L', 0.1, 0.25), step('R', 0.44, 0.15), step('L', 0.74, 0.4)],
    contact: 0.16,
    cuts: [0.26, 0.36, 0.46, 0.56, 0.66, 0.82],
    end: 1.15,
  }),
  /** Round behind it with the blade held low and back, then driven straight through. */
  lastRites: blow({
    keys: [
      [0.1, { R: reach([-0.3, 1.2, -0.1], [0.05, 0.2, 0.98]), L: HUG, turn: 0.4, down: 0.25, lean: 0.15 }, true],
      [0.22, { R: reach([-0.1, 1.2, 0.9], [0.0, -0.1, 1.0]), L: HUG, turn: -0.3, lean: 0.4, fwd: 0.45, down: 0.3 }],
      [0.5, { R: reach([-0.12, 1.15, 0.8], [0.0, -0.12, 0.99]), L: HUG, turn: -0.25, lean: 0.36, fwd: 0.4, down: 0.28 }],
    ],
    contact: 0.22,
    free: true,
    end: 0.9,
  }),
  /** The blade brought up upright and turned across the face, the shield behind it; then a flick of the point. */
  turnTheBlade: {
    keys: [
      [0.12, { R: reach([-0.12, 1.55, 0.35], [0.15, 0.98, 0.1]), L: GUARD, turn: 0.15, fwd: -0.08 }, true],
      [0.24, { R: reach([0.05, 1.6, 0.38], [0.6, 0.78, 0.1]), L: GUARD, turn: 0.3, fwd: -0.12, down: 0.12 }],
      [0.5, { R: reach([0.05, 1.58, 0.36], [0.62, 0.76, 0.1]), L: GUARD, turn: 0.3, fwd: -0.12, down: 0.12 }],
      [0.62, { R: reach([-0.1, 1.4, 0.75], [0.05, 0.05, 1.0]), L: GUARD, turn: -0.1, lean: 0.2, fwd: 0.18 }],
    ],
    steps: [step('R', 0.08, -0.25)],
    contact: 0.24,
    glow: 'right',
    end: 0.9,
  },
};

// ---------------------------------------------------------------------------
// Aura: rites said with the off hand
// ---------------------------------------------------------------------------

const AURA: Record<string, Spec> = {
  /** Down on his heels, the off hand cupped low to light the first wick, then rising slowly. */
  tallowLight: {
    keys: [
      [0.18, { R: reach([-0.45, 1.0, -0.05], [0.0, 0.7, 0.7]), L: [0.95, 0.1, 0.4, 0.5, 0.9, -0.6], down: 0.62, lean: 0.55, head: 0.3, fistL: 0.4 }, true],
      [0.32, { R: reach([-0.45, 1.0, -0.05], [0.0, 0.7, 0.7]), L: [0.9, 0.15, 0.4, 0.45, 0.9, -0.7], down: 0.6, lean: 0.55, head: 0.35, fistL: 0.5 }],
      [0.6, { R: reach([-0.42, 1.1, 0.0], [0.0, 0.75, 0.66]), L: [1.25, 0.3, 0.5, 0.8, 1.0, -0.6], down: 0.12, lean: 0.1, head: 0.1, fistL: 0.3 }],
    ],
    contact: 0.32,
    glow: 'left',
    end: 1.0,
  },
  /** On one knee, the weapon planted point-down before him, both hands on it, the head bowed. */
  ironVigil: {
    keys: [
      [0.2, { R: reach([-0.1, 1.15, 0.45], [0.0, -0.98, 0.15]), L: [1.1, -0.4, 1.1, 1.3, 0.4], down: 0.55, lean: 0.25, head: 0.2 }, true],
      [0.34, { R: reach([-0.05, 0.95, 0.5], [0.0, -0.99, 0.1]), L: [0.95, -0.5, 1.15, 1.25, 0.4], down: 0.78, lean: 0.3, head: 0.45 }],
      [0.7, { R: reach([-0.05, 0.94, 0.5], [0.0, -0.99, 0.1]), L: [0.95, -0.5, 1.15, 1.28, 0.4], down: 0.76, lean: 0.28, head: 0.42 }],
    ],
    steps: [step('L', 0.14, 0.4, 0.0, 0.34), step('R', 0.2, -0.3, -0.05, 0.34)],
    contact: 0.34,
    glow: 'both',
    end: 1.15,
  },
  /** The weapon held up upright before him like a rood, the off hand pushed out flat at the floor. */
  smoulderingRood: {
    keys: [
      [0.16, { R: reach([-0.15, 1.5, 0.3], [0.0, 0.95, 0.3]), L: [0.7, 0.4, 0.5, 0.8, 1.0, 0.6], lean: 0.05, down: 0.1 }, true],
      [0.3, { R: reach([-0.05, 1.85, 0.4], [0.0, 0.99, 0.08]), L: [0.9, 0.5, 0.5, 0.2, 1.1, 1.0], lean: 0.2, down: 0.25, head: 0.15 }],
      [0.6, { R: reach([-0.05, 1.83, 0.38], [0.0, 0.99, 0.08]), L: [0.88, 0.5, 0.5, 0.22, 1.1, 1.0], lean: 0.18, down: 0.23, head: 0.15 }],
    ],
    contact: 0.3,
    glow: 'left',
    end: 1.0,
  },
  /** Two fingers to the brow, then drawn down the length of the weapon held flat before him. */
  anoint: {
    keys: [
      [0.16, { R: reach([-0.25, 1.3, 0.35], [0.95, 0.15, 0.2]), L: BROW, head: 0.15, fistL: 0.2 }, true],
      [0.3, { R: reach([-0.25, 1.3, 0.38], [0.95, 0.15, 0.2]), L: [1.25, -0.35, 1.0, 1.2, 0.8, -0.3], head: 0.25, lean: 0.1, fistL: 0.2 }],
      [0.46, { R: reach([-0.25, 1.3, 0.38], [0.95, 0.15, 0.2]), L: [1.15, 0.2, 0.9, 0.8, 0.8, -0.3], head: 0.2, lean: 0.1, fistL: 0.2 }],
    ],
    contact: 0.3,
    glow: 'left',
    end: 0.85,
  },
  /** The weapon levelled straight at one of them, the off hand up and open: you. */
  censure: {
    keys: [
      [0.12, { R: reach([-0.4, 1.35, -0.05], [0.0, 0.5, 0.86]), L: [0.6, 0.4, 0.4, 1.4, 0.4], turn: -0.25 }, true],
      [0.24, { R: reach([-0.12, 1.55, 0.88], [0.0, 0.05, 1.0]), L: PALM, turn: 0.15, lean: 0.2, fwd: 0.2, head: 0.1 }],
      [0.5, { R: reach([-0.12, 1.53, 0.86], [0.0, 0.04, 1.0]), L: PALM, turn: 0.15, lean: 0.18, fwd: 0.18, head: 0.1 }],
    ],
    steps: [step('L', 0.08, 0.35)],
    glow: 'left',
    end: 0.85,
  },
  /** The censer swung right round his body at the waist on its chain, the trunk turning after it. */
  censerSmoke: {
    keys: [
      [0.14, { R: reach([-0.4, 1.25, 0.0], [0.0, 0.8, 0.6]), L: [0.4, 1.35, 0.2, 0.3, 0.3], turn: 0.45, down: 0.12 }, true],
      [0.26, { R: reach([-0.4, 1.25, 0.0], [0.0, 0.8, 0.6]), L: [1.35, 0.45, 0.2, 0.25, 0.3], turn: 0.0, down: 0.15 }],
      [0.38, { R: reach([-0.4, 1.25, 0.0], [0.0, 0.8, 0.6]), L: [1.0, -0.5, 1.0, 0.4, 0.3], turn: -0.5, down: 0.15 }],
      [0.5, { R: reach([-0.4, 1.25, 0.0], [0.0, 0.8, 0.6]), L: [-0.3, 0.5, 0.3, 0.4, 0.3], turn: -0.2, down: 0.12 }],
      [0.64, { R: reach([-0.4, 1.25, 0.0], [0.0, 0.8, 0.6]), L: [0.4, 1.35, 0.2, 0.3, 0.3], turn: 0.4, down: 0.1 }],
    ],
    contact: 0.26,
    glow: 'left',
    end: 0.95,
  },
  /** The off hand beating twice on his chest, the weight bouncing on the balls of the feet. */
  fervour: {
    keys: [
      [0.1, { R: reach([-0.42, 1.25, 0.05], [0.0, 0.8, 0.6]), L: [0.7, 0.5, 0.6, 1.6, 0.4], down: 0.2, fistL: 1 }, true],
      [0.18, { R: reach([-0.42, 1.25, 0.05], [0.0, 0.8, 0.6]), L: HEART, down: -0.06, lean: -0.1, fistL: 1 }],
      [0.28, { R: reach([-0.42, 1.25, 0.05], [0.0, 0.8, 0.6]), L: [0.7, 0.5, 0.6, 1.6, 0.4], down: 0.2, fistL: 1 }],
      [0.36, { R: reach([-0.42, 1.3, 0.05], [0.0, 0.8, 0.6]), L: HEART, down: -0.08, lean: -0.12, head: -0.15, fistL: 1 }],
      [0.6, { R: reach([-0.4, 1.35, 0.1], [0.0, 0.85, 0.5]), L: HEART, lean: -0.08, head: -0.1, fistL: 1 }],
    ],
    contact: 0.18,
    glow: 'left',
    end: 0.9,
  },
  /** The off hand reaches high for a bell rope and hauls it down hand over fist to the hip. */
  tollingBell: {
    keys: [
      [0.14, { R: reach([-0.45, 1.15, -0.05], [0.0, 0.7, 0.7]), L: HIGH, lean: -0.1, head: -0.25, down: -0.05, fistL: 1 }, true],
      [0.3, { R: reach([-0.45, 1.1, -0.05], [0.0, 0.7, 0.7]), L: [0.7, 0.2, 0.3, 1.2, 0.3], lean: 0.25, down: 0.4, head: 0.1, fistL: 1 }],
      [0.42, { R: reach([-0.45, 1.15, -0.05], [0.0, 0.7, 0.7]), L: [2.1, 0.2, 0.3, 0.5, 0.3], lean: 0.0, down: 0.1, head: -0.1, fistL: 1 }],
      [0.6, { R: reach([-0.45, 1.1, -0.05], [0.0, 0.7, 0.7]), L: [0.6, 0.2, 0.3, 1.3, 0.3], lean: 0.2, down: 0.32, fistL: 1 }],
    ],
    contact: 0.3,
    glow: 'left',
    end: 1.0,
  },
  /** Both arms flung wide, chest open to the blows, head back: take me. */
  martyrsVow: {
    keys: [
      [0.14, { R: reach([-0.25, 1.2, 0.2], [0.3, 0.6, 0.7]), L: HEART, down: 0.15, lean: 0.2, head: 0.2, fistL: 1 }, true],
      [0.3, { R: reach([-0.85, 1.48, 0.05], [-0.9, 0.3, 0.3]), L: WIDE, lean: -0.22, head: -0.35, fistL: 0 }],
      [0.62, { R: reach([-0.85, 1.46, 0.05], [-0.9, 0.3, 0.3]), L: WIDE, lean: -0.2, head: -0.32, fistL: 0 }],
    ],
    contact: 0.3,
    glow: 'both',
    end: 1.05,
  },
  /** A writ held up before the eyes in the off hand and read, then flicked out at them to burn. */
  writOfAsh: {
    keys: [
      [0.16, { R: reach([-0.42, 1.2, 0.0], [0.0, 0.75, 0.66]), L: [1.55, -0.2, 0.9, 1.5, 1.0, -0.4], head: 0.12, fistL: 0.6 }, true],
      [0.3, { R: reach([-0.42, 1.2, 0.0], [0.0, 0.75, 0.66]), L: [1.6, -0.15, 0.9, 1.45, 1.0, -0.4], head: 0.15, lean: 0.05, fistL: 0.6 }],
      [0.4, { R: reach([-0.42, 1.2, 0.0], [0.0, 0.75, 0.66]), L: [1.7, 0.55, 0.4, 0.15, 1.0, -0.9], turn: -0.25, lean: 0.2, fwd: 0.18, fistL: 0 }],
    ],
    steps: [step('L', 0.3, 0.3)],
    contact: 0.4,
    glow: 'left',
    end: 0.85,
  },
  /** Down on a knee, the off palm pressed flat to the flagstones, the weapon held high and upright. */
  consecratedGround: {
    keys: [
      [0.18, { R: reach([-0.25, 1.6, 0.1], [0.0, 0.95, 0.3]), L: [1.0, 0.2, 0.3, 0.6, 0.9, -0.5], down: 0.4, lean: 0.35 }, true],
      [0.34, { R: reach([-0.2, 1.75, 0.15], [0.0, 0.99, 0.1]), L: [0.75, 0.15, 0.2, 0.15, 0.9, -1.1], down: 0.82, lean: 0.62, head: 0.25 }],
      [0.7, { R: reach([-0.2, 1.73, 0.15], [0.0, 0.99, 0.1]), L: [0.75, 0.15, 0.2, 0.15, 0.9, -1.1], down: 0.8, lean: 0.6, head: 0.22 }],
    ],
    steps: [step('L', 0.14, 0.45, 0.05, 0.34), step('R', 0.2, -0.3, -0.05, 0.34)],
    contact: 0.34,
    glow: 'left',
    end: 1.15,
  },
  /** The weapon raised to the sky to call the bell, then dragged down to point at the one it falls on. */
  lastHour: {
    keys: [
      [0.2, { R: reach([-0.12, 2.22, 0.15], [0.0, 0.99, 0.1]), L: HIGH, lean: -0.25, head: -0.45, down: -0.04 }, true],
      [0.4, { R: reach([-0.12, 2.24, 0.12], [0.0, 0.98, 0.15]), L: HIGH, lean: -0.28, head: -0.5, down: -0.06 }, true],
      [0.52, { R: reach([-0.1, 1.45, 0.9], [0.0, -0.15, 0.99]), L: [0.9, 0.6, 0.3, 0.9, 0.4], lean: 0.3, fwd: 0.25, down: 0.15, head: 0.1 }],
      [0.8, { R: reach([-0.1, 1.43, 0.88], [0.0, -0.15, 0.99]), L: [0.9, 0.6, 0.3, 0.95, 0.4], lean: 0.28, fwd: 0.22, down: 0.14, head: 0.1 }],
    ],
    steps: [step('L', 0.42, 0.45)],
    contact: 0.52,
    glow: 'both',
    end: 1.2,
  },
};

defineGestures({ ...MACE, ...BLADE, ...AURA });

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

// ---------------------------------------------------------------------------
// Mace: heavy, from above
// ---------------------------------------------------------------------------

const MACE: Record<string, Spec> = {
  /** A bell-ringer's swing: the mace hauled up from behind the hip, over the top and down on the crown. */
  tollingBlow: {
    hit: true,
    keys: [
      [0.14, { R: reach([-0.42, 0.9, -0.42], [-0.15, -0.55, -0.82]), L: GUARD, turn: -0.55, down: 0.2, lean: 0.15 }, true],
      [0.24, { R: reach([-0.2, 2.0, -0.08], [0.0, 0.75, -0.66]), L: GUARD, turn: -0.15, lean: -0.22, head: -0.1 }],
      [0.34, { R: reach([-0.1, 1.15, 0.66], [0.0, -0.6, 0.8]), L: HUG, turn: 0.1, lean: 0.38, down: 0.25, fwd: 0.22 }],
      [0.5, { R: reach([-0.12, 1.05, 0.6], [0.0, -0.55, 0.83]), L: HUG, turn: 0.1, lean: 0.4, down: 0.28, fwd: 0.2 }],
    ],
    steps: [step('L', 0.22, 0.45)],
    contact: 0.34,
    end: 0.85,
  },
  /** Shield dropped to the knee, then the rim driven up under the jaw. */
  shieldCrack: {
    hit: true,
    side: 'L',
    keys: [
      [0.12, { R: reach([-0.4, 1.05, -0.2], [0.0, 0.55, -0.83]), L: LOW, turn: 0.35, down: 0.3, lean: 0.25 }, true],
      [0.22, { R: reach([-0.42, 1.0, -0.25], [0.0, 0.5, -0.86]), L: [2.15, 0.0, 1.0, 0.85, 0.2], turn: -0.35, down: -0.05, lean: -0.1, fwd: 0.3, head: -0.1 }],
      [0.38, { R: reach([-0.4, 1.05, -0.2], [0.0, 0.55, -0.83]), L: [2.0, 0.0, 1.0, 0.95, 0.2], turn: -0.3, lean: -0.08, fwd: 0.25 }],
    ],
    steps: [step('L', 0.12, 0.5)],
    alt: {
      // No shield: the pommel end of the haft driven up under the chin.
      great: [
        { R: reach([-0.25, 0.95, 0.1], [0.1, -0.95, 0.2]), turn: 0.35, down: 0.3, lean: 0.25 },
        { R: reach([-0.1, 1.6, 0.42], [0.05, -0.9, -0.4]), turn: -0.3, lean: -0.1, fwd: 0.3, head: -0.1 },
        { R: reach([-0.12, 1.55, 0.38], [0.05, -0.9, -0.38]), turn: -0.25, lean: -0.08, fwd: 0.25 },
      ],
    },
    end: 0.75,
  },
  /** Up on the toes with the mace held high like a smith's hammer, then dropped into a deep squat with it. */
  anvilfall: {
    hit: true,
    keys: [
      [0.2, { R: reach([-0.08, 2.15, 0.12], [0.0, 0.98, -0.2]), L: GUARD, down: -0.12, lean: -0.12, head: -0.2 }, true],
      [0.32, { R: reach([-0.05, 0.85, 0.7], [0.0, -0.95, 0.3]), L: HUG, down: 0.62, lean: 0.5, fwd: 0.15 }],
      [0.55, { R: reach([-0.05, 0.82, 0.68], [0.0, -0.95, 0.28]), L: HUG, down: 0.6, lean: 0.48, fwd: 0.14 }],
    ],
    contact: 0.32,
    end: 0.95,
  },
  /** Turned side-on, shield hugged to the shoulder, a crabbing run and the whole body into the door. */
  doorbreaker: {
    hit: true,
    side: 'L',
    keys: [
      [0.12, { R: reach([-0.45, 1.1, -0.35], [0.0, 0.3, -0.95]), L: HUG, turn: -0.95, down: 0.25, lean: 0.15 }, true],
      [0.26, { R: reach([-0.48, 1.05, -0.38], [0.0, 0.25, -0.97]), L: [1.05, 0.15, 1.3, 1.4, 0.45], turn: -1.1, down: 0.2, lean: 0.3, fwd: 0.6, roll: -0.12 }],
      [0.42, { R: reach([-0.45, 1.1, -0.32], [0.0, 0.3, -0.95]), L: [1.0, 0.15, 1.3, 1.5, 0.45], turn: -0.9, down: 0.18, lean: 0.22, fwd: 0.45 }],
    ],
    steps: [step('L', 0.06, 0.55, 0.15), step('R', 0.14, 0.55, 0.15), step('L', 0.22, 0.6, 0.1)],
    alt: {
      // The haft held crosswise against the shoulder like a beam.
      great: [
        { R: reach([-0.3, 1.45, 0.05], [0.95, 0.2, 0.2]), turn: -0.95, down: 0.25, lean: 0.15 },
        { R: reach([-0.2, 1.4, 0.35], [0.98, 0.1, 0.1]), turn: -1.1, down: 0.2, lean: 0.3, fwd: 0.6, roll: -0.12 },
        { R: reach([-0.2, 1.42, 0.3], [0.98, 0.12, 0.12]), turn: -0.9, down: 0.18, lean: 0.22, fwd: 0.45 },
      ],
    },
    end: 0.8,
  },
  /** A backhand blow at head height, then the mace laid on the shoulder and the head tipped, listening. */
  knell: {
    hit: true,
    keys: [
      [0.14, { R: reach([0.3, 1.7, 0.05], [0.7, 0.55, -0.45]), L: GUARD, turn: 0.75, lean: 0.05 }, true],
      [0.24, { R: reach([-0.55, 1.55, 0.45], [-0.85, 0.05, 0.52]), L: GUARD, turn: -0.55, lean: 0.2, fwd: 0.15 }],
      [0.42, { R: reach([-0.5, 1.5, 0.3], [-0.8, 0.1, 0.58]), L: GUARD, turn: -0.5, lean: 0.15, fwd: 0.12 }],
      [0.66, { R: reach([-0.3, 1.62, -0.05], [0.1, 0.55, -0.83]), L: HUG, turn: -0.1, roll: 0.15, head: 0.15 }],
    ],
    contact: 0.24,
    end: 1.0,
  },
  /** Down onto one knee as the mace comes down short and hard from the shoulder, like a nail driven in. */
  pilgrimsMaul: {
    hit: true,
    keys: [
      [0.2, { R: reach([-0.35, 1.75, -0.1], [0.0, 0.8, -0.6]), L: GUARD, turn: -0.3, lean: -0.05, down: 0.05 }, true],
      [0.34, { R: reach([-0.1, 0.62, 0.62], [0.0, -0.98, 0.15]), L: LOW, turn: 0.1, lean: 0.55, down: 0.82, fwd: 0.2, head: 0.15 }],
      [0.62, { R: reach([-0.1, 0.6, 0.6], [0.0, -0.98, 0.14]), L: LOW, turn: 0.1, lean: 0.52, down: 0.8, fwd: 0.18, head: 0.15 }],
    ],
    steps: [step('L', 0.2, 0.55, 0.0, 0.34), step('R', 0.26, -0.35, -0.05, 0.34)],
    contact: 0.34,
    end: 1.1,
  },
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
  /** The shield heaved up overhead by its rim and slammed flat down onto them. */
  relicBash: {
    hit: true,
    side: 'L',
    keys: [
      [0.16, { R: reach([-0.42, 1.05, -0.25], [0.0, 0.4, -0.92]), L: [2.75, 0.35, 0.9, 0.8, 0.3], lean: -0.2, head: -0.12, down: -0.05 }, true],
      [0.28, { R: reach([-0.42, 1.0, -0.28], [0.0, 0.35, -0.94]), L: [1.25, 0.05, 1.0, 0.55, 0.3], lean: 0.45, down: 0.35, fwd: 0.25 }],
      [0.46, { R: reach([-0.4, 1.05, -0.25], [0.0, 0.4, -0.92]), L: [1.2, 0.05, 1.0, 0.6, 0.3], lean: 0.42, down: 0.33, fwd: 0.22 }],
    ],
    steps: [step('L', 0.16, 0.4)],
    alt: {
      // A two-hander: the flat of the head brought down like a lid.
      great: [
        { R: reach([-0.1, 2.05, 0.15], [0.95, 0.2, 0.2]), lean: -0.2, head: -0.12, down: -0.05 },
        { R: reach([-0.1, 1.05, 0.6], [0.98, -0.1, 0.15]), lean: 0.45, down: 0.35, fwd: 0.25 },
        { R: reach([-0.1, 1.08, 0.58], [0.98, -0.1, 0.15]), lean: 0.42, down: 0.33, fwd: 0.22 },
      ],
    },
    end: 0.85,
  },
  /** The mace raised straight at the sky and held there, the shield thrown out; then the verdict comes down. */
  ironVerdict: {
    hit: true,
    keys: [
      [0.2, { R: reach([-0.15, 2.25, 0.1], [0.0, 0.99, 0.05]), L: WIDE, lean: -0.2, head: -0.35, down: -0.04 }, true],
      [0.42, { R: reach([-0.15, 2.28, 0.05], [0.0, 0.98, -0.15]), L: WIDE, lean: -0.25, head: -0.4, down: -0.06 }, true],
      [0.54, { R: reach([-0.05, 0.85, 0.75], [0.0, -0.8, 0.6]), L: HUG, lean: 0.6, down: 0.55, fwd: 0.35, head: 0.1 }],
      [0.78, { R: reach([-0.05, 0.82, 0.72], [0.0, -0.8, 0.6]), L: HUG, lean: 0.58, down: 0.52, fwd: 0.32 }],
    ],
    steps: [lift('L', 0.42, 0.7, 0.05, 0.6, 0.54)],
    contact: 0.54,
    glow: 'right',
    end: 1.2,
  },
};

// ---------------------------------------------------------------------------
// Blade: short, exact, close
// ---------------------------------------------------------------------------

const BLADE: Record<string, Spec> = {
  /** From the guard at the breastbone, one short exact thrust and straight back. */
  oathCut: {
    hit: true,
    keys: [
      [0.1, { R: reach([-0.18, 1.38, 0.12], [0.05, 0.1, 0.99]), L: GUARD, turn: -0.15 }, true],
      [0.18, { R: reach([-0.06, 1.36, 0.82], [0.02, 0.0, 1.0]), L: GUARD, turn: 0.2, lean: 0.22, fwd: 0.25 }],
      [0.34, { R: reach([-0.16, 1.38, 0.2], [0.05, 0.1, 0.99]), L: GUARD, turn: -0.05, lean: 0.05, fwd: 0.05 }],
    ],
    steps: [step('L', 0.08, 0.3)],
    end: 0.6,
  },
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
  /** Two quick cuts: down from the right shoulder, then straight back up the same line. */
  twinVerse: {
    hit: true,
    keys: [
      [0.08, { R: reach([-0.42, 1.72, 0.0], [-0.3, 0.7, 0.65]), L: GUARD, turn: -0.35 }, true],
      [0.15, { R: reach([0.05, 1.05, 0.55], [0.6, -0.6, 0.53]), L: GUARD, turn: 0.3, lean: 0.18, fwd: 0.12 }],
      [0.24, { R: reach([-0.4, 1.6, 0.45], [-0.6, 0.55, 0.58]), L: GUARD, turn: -0.3, lean: 0.12, fwd: 0.15 }],
      [0.4, { R: reach([-0.3, 1.45, 0.3], [-0.3, 0.4, 0.86]), L: GUARD, turn: -0.15, lean: 0.06, fwd: 0.08 }],
    ],
    steps: [step('L', 0.06, 0.3)],
    contact: 0.15,
    end: 0.65,
  },
  /** The blade shown high, a skip off to the side, and the real cut comes in low from there. */
  feint: {
    hit: true,
    keys: [
      [0.1, { R: reach([-0.25, 1.95, 0.3], [0.0, 0.6, 0.8]), L: GUARD, turn: -0.2, lean: -0.1, head: -0.1 }, true],
      [0.2, { R: reach([-0.55, 1.1, 0.1], [-0.6, -0.2, 0.77]), L: HUG, turn: -0.6, down: 0.25, lean: 0.15, side: 0.25 }],
      [0.3, { R: reach([0.1, 1.0, 0.6], [0.8, -0.2, 0.56]), L: HUG, turn: 0.45, down: 0.3, lean: 0.3, fwd: 0.2, side: 0.2 }],
      [0.48, { R: reach([0.3, 1.05, 0.3], [0.9, -0.15, -0.4]), L: GUARD, turn: 0.6, down: 0.22, lean: 0.2, side: 0.15 }],
    ],
    steps: [step('R', 0.1, 0.1, -0.45), step('L', 0.18, 0.1, -0.4)],
    contact: 0.3,
    end: 0.8,
  },
  /** Five short chops at the chest, right, left, right, left, right, a half step in on each pair. */
  litany: {
    hit: true,
    keys: [
      [0.06, { R: reach([-0.4, 1.55, 0.2], [-0.4, 0.6, 0.7]), L: GUARD, turn: -0.3 }, true],
      [0.12, { R: reach([0.05, 1.25, 0.6], [0.6, -0.3, 0.74]), L: GUARD, turn: 0.2, lean: 0.12 }],
      [0.18, { R: reach([-0.35, 1.3, 0.55], [-0.65, -0.25, 0.72]), L: GUARD, turn: -0.2, lean: 0.12, fwd: 0.08 }],
      [0.24, { R: reach([0.05, 1.35, 0.6], [0.6, -0.25, 0.76]), L: GUARD, turn: 0.2, lean: 0.15, fwd: 0.14 }],
      [0.3, { R: reach([-0.35, 1.25, 0.55], [-0.65, -0.3, 0.7]), L: GUARD, turn: -0.2, lean: 0.15, fwd: 0.18 }],
      [0.36, { R: reach([0.05, 1.2, 0.65], [0.55, -0.4, 0.73]), L: GUARD, turn: 0.25, lean: 0.2, fwd: 0.24, down: 0.08 }],
      [0.54, { R: reach([-0.2, 1.35, 0.35], [0.0, 0.3, 0.95]), L: GUARD, turn: 0.0, lean: 0.08, fwd: 0.12 }],
    ],
    steps: [step('L', 0.1, 0.25), step('R', 0.22, 0.25), step('L', 0.32, 0.2)],
    contact: 0.12,
    end: 0.85,
  },
  /** Blade at eye level, the shield thrown back for balance, and a long low dive along the point. */
  confessionThrust: {
    hit: true,
    keys: [
      [0.16, { R: reach([-0.25, 1.62, -0.15], [0.05, 0.05, 1.0]), L: [0.6, 0.9, 0.2, 0.6, 0.3], turn: -0.45, down: 0.3, lean: -0.05, fwd: -0.15 }, true],
      [0.3, { R: reach([-0.05, 1.3, 0.95], [0.0, -0.08, 1.0]), L: [-0.35, 0.6, 0.1, 0.3, 0.3], turn: 0.3, down: 0.45, lean: 0.55, fwd: 0.55 }],
      [0.5, { R: reach([-0.05, 1.28, 0.92], [0.0, -0.1, 0.99]), L: [-0.3, 0.6, 0.1, 0.35, 0.3], turn: 0.3, down: 0.42, lean: 0.5, fwd: 0.5 }],
    ],
    steps: [step('L', 0.18, 0.9)],
    alt: {
      // Both hands on the grip, the point level: a pike's lunge.
      great: [
        { R: reach([-0.15, 1.45, -0.1], [0.05, 0.05, 1.0]), turn: -0.45, down: 0.3, lean: -0.05, fwd: -0.15 },
        { R: reach([-0.05, 1.25, 0.75], [0.0, -0.08, 1.0]), turn: 0.2, down: 0.45, lean: 0.55, fwd: 0.55 },
        { R: reach([-0.05, 1.23, 0.72], [0.0, -0.1, 0.99]), turn: 0.2, down: 0.42, lean: 0.5, fwd: 0.5 },
      ],
    },
    contact: 0.3,
    end: 0.9,
  },
  /** An X: high right to low left, then high left to low right, the second one heavier. */
  crosswise: {
    hit: true,
    keys: [
      [0.1, { R: reach([-0.5, 1.8, 0.1], [-0.45, 0.75, 0.48]), L: GUARD, turn: -0.4, lean: -0.05 }, true],
      [0.18, { R: reach([0.3, 1.0, 0.5], [0.7, -0.55, 0.45]), L: GUARD, turn: 0.4, lean: 0.2, fwd: 0.1 }],
      [0.28, { R: reach([0.25, 1.8, 0.2], [0.45, 0.75, 0.48]), L: HUG, turn: 0.5, lean: -0.05, fwd: 0.1 }],
      [0.38, { R: reach([-0.5, 0.95, 0.5], [-0.7, -0.55, 0.45]), L: HUG, turn: -0.45, lean: 0.3, fwd: 0.2, down: 0.15 }],
      [0.56, { R: reach([-0.55, 0.95, 0.35], [-0.75, -0.45, 0.48]), L: GUARD, turn: -0.4, lean: 0.25, fwd: 0.18, down: 0.12 }],
    ],
    steps: [step('L', 0.08, 0.3), step('R', 0.28, 0.2, -0.1)],
    contact: 0.18,
    end: 0.85,
  },
  /** The blade turned point-down in a reverse grip and driven down short, the off hand on the pommel. */
  mercyStroke: {
    hit: true,
    keys: [
      [0.16, { R: reach([-0.12, 1.75, 0.35], [0.0, -0.99, 0.1], 0.2), L: [1.6, -0.3, 1.0, 1.7, 0.4], lean: -0.1, head: 0.15 }, true],
      [0.28, { R: reach([-0.08, 0.95, 0.6], [0.0, -0.99, 0.1], 0.2), L: [1.0, -0.35, 1.0, 1.5, 0.4], lean: 0.55, down: 0.45, fwd: 0.2, head: 0.3 }],
      [0.52, { R: reach([-0.08, 0.92, 0.58], [0.0, -0.99, 0.1], 0.2), L: [1.0, -0.35, 1.0, 1.55, 0.4], lean: 0.52, down: 0.43, fwd: 0.18, head: 0.3 }],
    ],
    steps: [step('L', 0.14, 0.4)],
    contact: 0.28,
    end: 0.95,
  },
  /** Seven thrusts from a set stance, a hand's breadth apart in height, too fast to follow. */
  sevenfold: {
    hit: true,
    keys: [
      [0.06, { R: reach([-0.22, 1.4, 0.1], [0.05, 0.1, 0.99]), L: GUARD, turn: -0.2, down: 0.15 }, true],
      [0.1, { R: reach([-0.06, 1.5, 0.8], [0.0, 0.0, 1.0]), L: GUARD, turn: 0.15, lean: 0.2, fwd: 0.18, down: 0.15 }],
      [0.14, { R: reach([-0.2, 1.38, 0.25], [0.05, 0.05, 1.0]), L: GUARD, turn: -0.1, down: 0.15 }],
      [0.18, { R: reach([-0.08, 1.25, 0.8], [0.0, -0.05, 1.0]), L: GUARD, turn: 0.15, lean: 0.22, fwd: 0.2, down: 0.18 }],
      [0.22, { R: reach([-0.2, 1.4, 0.25], [0.05, 0.05, 1.0]), L: GUARD, turn: -0.1, down: 0.15 }],
      [0.26, { R: reach([-0.04, 1.6, 0.78], [0.0, 0.05, 1.0]), L: GUARD, turn: 0.18, lean: 0.18, fwd: 0.2, down: 0.15 }],
      [0.3, { R: reach([-0.2, 1.38, 0.25], [0.05, 0.05, 1.0]), L: GUARD, turn: -0.1, down: 0.15 }],
      [0.34, { R: reach([-0.1, 1.15, 0.82], [0.0, -0.1, 0.99]), L: GUARD, turn: 0.15, lean: 0.25, fwd: 0.22, down: 0.2 }],
      [0.4, { R: reach([-0.2, 1.4, 0.25], [0.05, 0.05, 1.0]), L: GUARD, turn: -0.1, down: 0.15 }],
      [0.46, { R: reach([-0.05, 1.42, 0.88], [0.0, 0.0, 1.0]), L: HUG, turn: 0.25, lean: 0.32, fwd: 0.32, down: 0.22 }],
    ],
    steps: [step('L', 0.04, 0.2), step('L', 0.42, 0.3)],
    contact: 0.1,
    end: 0.8,
  },
  /** A turn round behind them on the ball of the foot, and the blade put up through the back. */
  lastRites: {
    hit: true,
    keys: [
      [0.14, { R: reach([-0.3, 1.1, -0.2], [0.0, 0.2, -0.98]), L: HUG, turn: 1.0, down: 0.25, lean: 0.1 }, true],
      [0.26, { R: reach([-0.25, 1.0, 0.1], [0.05, 0.6, 0.8]), L: HUG, turn: -0.4, down: 0.4, lean: 0.25, roll: 0.1 }],
      [0.36, { R: reach([-0.08, 1.5, 0.7], [0.0, 0.72, 0.7]), L: [1.3, 0.1, 0.8, 1.0, 0.4], turn: 0.2, down: 0.15, lean: 0.35, fwd: 0.35, head: -0.1 }],
      [0.6, { R: reach([-0.08, 1.52, 0.68], [0.0, 0.75, 0.66]), L: [1.25, 0.1, 0.8, 1.05, 0.4], turn: 0.2, down: 0.12, lean: 0.32, fwd: 0.32, head: -0.1 }],
    ],
    steps: [step('R', 0.08, 0.2, -0.5), step('L', 0.2, 0.35, -0.4), step('R', 0.3, 0.3)],
    contact: 0.36,
    end: 1.0,
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

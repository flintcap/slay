/**
 * The Knight's gestures (class id `warden`): one per active skill. See
 * `../SkillActions.ts` for how a gesture is written.
 *
 * The Knight fights with a blade and a shield or with a two-hander. Weapon
 * hands are placed with `reach` (where the grip is, which way the blade
 * points), so the same keys read with either: a gesture that leaves `L` alone
 * keeps the shield up, or keeps the off hand on a two-hander's haft. Shield
 * skills give the two-hander its own keys (`alt.great`).
 */
import type { ActionStep } from '../Actions';
import type { Side } from '../Pose';
import { defineGestures, reach, type G, type Spec, step } from '../SkillActions';

/** A step with its own lift, heads: a stamp lifts the knee high. */
const lift = (side: Side, t: number, dz: number, dx: number, up: number, land: number): ActionStep => ({ t, side, dx, dz, lift: up, land });

// Shield arm places (left arm, `Pose.arm` order).
/** Shield held square in front of the chest. */
const SHIELD_FRONT: G['L'] = [1.15, -0.15, 1.35, 1.55, 0.4];
/** Shield driven out at arm's length. */
const SHIELD_PUNCH: G['L'] = [1.4, -0.05, 1.2, 0.8, 0.4];
/** Shield tucked against the chest, elbow in. */
const SHIELD_TUCK: G['L'] = [0.85, -0.05, 1.3, 2.0, 0.4];
/** Shield drawn back across the body, ready to be driven out. */
const SHIELD_DRAWN: G['L'] = [0.3, 0.3, 1.1, 1.7, 0.4];
/** Shield set low with its foot on the floor, the Knight down behind it. */
const SHIELD_SET: G['L'] = [0.95, 0.2, 1.15, 0.7, 0.4];

/**
 * The same blow with a two-hander: both hands on the haft, the trunk wound
 * further and the weight dropped lower, so it reads slow and huge where a
 * sword and board reads quick and clean. A key's shield arm is let go.
 */
const big = (g: G): G => {
  const { L: _shield, ...rest } = g;
  return { ...rest, grip: true, turn: (g.turn ?? 0) * 1.3, lean: (g.lean ?? 0) * 1.15, down: (g.down ?? 0) + 0.06 };
};
const greatOf = (keys: Spec['keys']): Array<G | null> => keys.map(([, g]) => big(g));

/**
 * A blow of the blade: wound up (held), struck at `contact`, followed
 * through. Played with a two-hander it is the same blow, bigger.
 */
function blade(s: Omit<Spec, 'hit' | 'blade'>): Spec {
  return { ...s, hit: true, blade: true, alt: { great: greatOf(s.keys), ...s.alt } };
}

// ---------------------------------------------------------------------------
// Bulwark: the shield
// ---------------------------------------------------------------------------

const BULWARK: Record<string, Spec> = {
  /** Feet set wide, crouched behind the shield, the blade laid over its rim. */
  shieldWall: {
    keys: [
      [0.14, { R: reach([-0.3, 1.5, -0.05], [0.1, 0.45, 0.88]), L: SHIELD_TUCK, down: 0.1, lean: -0.05 }, true],
      [0.26, { R: reach([-0.18, 1.48, 0.32], [0.18, 0.08, 0.98]), L: SHIELD_FRONT, down: 0.42, lean: 0.2, head: 0.1 }],
      [0.52, { R: reach([-0.18, 1.45, 0.3], [0.16, 0.06, 0.98]), L: SHIELD_FRONT, down: 0.4, lean: 0.18, head: 0.1 }],
    ],
    steps: [step('L', 0.08, 0.35, 0.25), step('R', 0.14, -0.15, -0.2)],
    alt: {
      // A two-hander is held upright before the body like a wall.
      great: [
        { R: reach([-0.15, 1.2, 0.15], [0.05, 0.95, 0.3]), down: 0.1 },
        { R: reach([-0.05, 1.15, 0.42], [0.02, 0.99, 0.12]), down: 0.42, lean: 0.2, head: 0.1 },
        { R: reach([-0.05, 1.12, 0.4], [0.02, 0.99, 0.12]), down: 0.4, lean: 0.18, head: 0.1 },
      ],
    },
    glow: 'left',
    end: 0.9,
  },
  /** Weight back on the rear foot, the blade raised high and pointed at their eyes. */
  guardStance: {
    keys: [
      [0.16, { R: reach([-0.35, 1.55, -0.1], [0.0, 0.85, -0.5]), L: SHIELD_TUCK, turn: -0.15, fwd: -0.08 }, true],
      [0.3, { R: reach([-0.25, 1.62, 0.3], [0.12, -0.22, 0.97]), L: SHIELD_FRONT, turn: 0.25, fwd: -0.18, down: 0.22, head: 0.05 }],
      [0.6, { R: reach([-0.25, 1.6, 0.28], [0.12, -0.24, 0.96]), L: SHIELD_FRONT, turn: 0.25, fwd: -0.17, down: 0.22 }],
    ],
    steps: [step('R', 0.06, -0.45, -0.1)],
    alt: {
      great: [
        { R: reach([-0.25, 1.5, -0.05], [0.0, 0.85, -0.5]), turn: -0.15, fwd: -0.08 },
        { R: reach([-0.12, 1.72, 0.22], [0.1, -0.2, 0.97]), turn: 0.25, fwd: -0.18, down: 0.22, head: 0.05 },
        { R: reach([-0.12, 1.7, 0.2], [0.1, -0.22, 0.97]), turn: 0.25, fwd: -0.17, down: 0.22 },
      ],
    },
    glow: 'right',
    end: 0.95,
  },
  /** The shield lifted to the sky to catch the light, the blade pointed at the floor. */
  aegis: {
    keys: [
      [0.16, { R: reach([-0.32, 1.0, 0.1], [0.05, -0.97, 0.2]), L: [1.4, 0.4, 0.6, 1.4, 0.4], down: 0.15, lean: 0.1, head: 0.15 }, true],
      [0.3, { R: reach([-0.3, 0.98, 0.12], [0.05, -0.98, 0.18]), L: [2.75, 0.35, 0.7, 0.5, 0.4], lean: -0.22, head: -0.35, down: -0.05 }],
      [0.6, { R: reach([-0.3, 1.0, 0.1], [0.05, -0.98, 0.18]), L: [2.6, 0.35, 0.7, 0.6, 0.4], lean: -0.18, head: -0.3 }],
    ],
    alt: {
      // A two-hander is raised before the face in a salute.
      great: [
        { R: reach([-0.1, 1.15, 0.3], [0.0, 0.6, 0.8]), down: 0.15, lean: 0.1, head: 0.15 },
        { R: reach([-0.05, 1.5, 0.28], [0.0, 0.99, 0.08]), lean: -0.18, head: -0.15, down: -0.05 },
        { R: reach([-0.05, 1.48, 0.26], [0.0, 0.99, 0.08]), lean: -0.15, head: -0.12 },
      ],
    },
    glow: 'left',
    end: 1.0,
  },
  /** Down on one knee, the shield's foot set on the floor, the blade braced on its rim. */
  fortressStance: {
    keys: [
      [0.16, { R: reach([-0.3, 1.25, 0.2], [0.1, 0.4, 0.9]), L: SHIELD_FRONT, down: 0.3, lean: 0.2 }, true],
      [0.32, { R: reach([-0.2, 1.05, 0.38], [0.15, 0.12, 0.98]), L: [0.95, 0.2, 1.15, 0.7, 0.4], down: 1.05, lean: 0.35, head: -0.05 }],
      [0.62, { R: reach([-0.2, 1.03, 0.36], [0.15, 0.1, 0.98]), L: [0.95, 0.2, 1.15, 0.72, 0.4], down: 1.02, lean: 0.33 }],
    ],
    steps: [step('L', 0.06, 0.5, 0.05), step('R', 0.14, -0.35, -0.05)],
    alt: {
      // The blade driven point-first into the floor, both hands on the pommel.
      great: [
        { R: reach([-0.05, 1.45, 0.35], [0.0, -0.9, 0.4]), down: 0.3, lean: 0.2 },
        { R: reach([0.0, 1.35, 0.4], [0.0, -0.75, 0.66]), down: 0.9, lean: 0.3, head: -0.1 },
        { R: reach([0.0, 1.33, 0.4], [0.0, -0.75, 0.66]), down: 0.88, lean: 0.3 },
      ],
    },
    glow: 'both',
    end: 1.05,
  },
  /** The shield wound across the body and slung out flat, like a discus. */
  shieldThrow: {
    keys: [
      [0.18, { L: [1.0, -0.65, 1.35, 1.5, 0.5], R: reach([-0.42, 1.05, -0.1], [0.0, 0.5, -0.86]), turn: -0.85, down: 0.2, lean: 0.05 }, true],
      [0.27, { L: [1.35, 0.85, 0.1, 0.1, 0.2], R: reach([-0.45, 1.05, -0.2], [0.0, 0.4, -0.92]), turn: 0.45, fwd: 0.25, down: 0.08 }],
      [0.44, { L: [1.1, 1.15, -0.1, 0.25, 0.2], R: reach([-0.45, 1.05, -0.2], [0.0, 0.4, -0.92]), turn: 0.6, fwd: 0.22 }],
    ],
    steps: [step('L', 0.14, 0.55, 0.15)],
    glow: 'left',
    end: 0.8,
  },
  /** The shield drawn across the body, then driven out off the lead foot with the hips behind it. */
  shieldBash: {
    keys: [
      [0.14, { L: SHIELD_DRAWN, R: reach([-0.42, 1.5, -0.2], [0.1, 0.7, -0.7]), turn: 0.4, lean: 0.05, fwd: -0.08, down: 0.08 }, true],
      [0.26, { L: SHIELD_PUNCH, R: reach([-0.45, 1.42, -0.28], [0.1, 0.6, -0.8]), turn: -0.45, lean: 0.28, fwd: 0.45, down: 0.15 }],
      [0.42, { L: [1.25, 0.1, 1.15, 1.15, 0.4], R: reach([-0.42, 1.42, -0.22], [0.1, 0.6, -0.8]), turn: -0.38, lean: 0.22, fwd: 0.4, down: 0.12 }],
    ],
    steps: [{ t: 0.12, side: 'L', dx: 0, dz: 0.9, lift: 0.25, land: 0.26 }],
    alt: {
      // A two-hander drives its haft out flat, both fists on it.
      great: [
        { R: reach([-0.1, 1.35, 0.1], [0.95, 0.1, 0.2]), grip: true, turn: 0.35, fwd: -0.08, down: 0.08 },
        { R: reach([-0.05, 1.38, 0.62], [0.95, 0.12, 0.25]), grip: true, turn: -0.2, lean: 0.3, fwd: 0.5, down: 0.16 },
        { R: reach([-0.05, 1.36, 0.56], [0.95, 0.12, 0.25]), grip: true, turn: -0.18, lean: 0.24, fwd: 0.42, down: 0.12 },
      ],
    },
    hit: true,
    blade: true,
    side: 'L',
    contact: 0.26,
    end: 0.75,
  },
  /** Shoulder down behind the shield, the blade held back, running. */
  shieldCharge: {
    keys: [
      [0.08, { L: SHIELD_TUCK, R: reach([-0.42, 1.25, -0.25], [0.0, 0.55, -0.83]), turn: 0.45, lean: 0.3, down: 0.18, fwd: 0.15 }, true],
      [0.18, { L: SHIELD_FRONT, R: reach([-0.45, 1.2, -0.3], [0.0, 0.5, -0.86]), turn: 0.55, lean: 0.48, down: 0.22, fwd: 0.35, head: 0.12 }],
      [0.6, { L: SHIELD_FRONT, R: reach([-0.45, 1.2, -0.3], [0.0, 0.5, -0.86]), turn: 0.5, lean: 0.45, down: 0.2, fwd: 0.32, head: 0.1 }],
    ],
    alt: {
      // A two-hander is carried flat across the chest like a bar.
      great: [
        { R: reach([-0.25, 1.3, 0.15], [0.95, 0.15, 0.1]), grip: true, turn: 0.35, lean: 0.3, down: 0.18, fwd: 0.15 },
        { R: reach([-0.2, 1.3, 0.35], [0.95, 0.2, 0.1]), grip: true, turn: 0.45, lean: 0.48, down: 0.22, fwd: 0.35, head: 0.12 },
        { R: reach([-0.2, 1.3, 0.33], [0.95, 0.2, 0.1]), grip: true, turn: 0.42, lean: 0.45, down: 0.2, fwd: 0.32, head: 0.1 },
      ],
    },
    hit: true,
    blade: true,
    side: 'L',
    contact: 0.18,
    free: true,
    end: 0.8,
  },
  /** Crouch, up off both feet with the shield before him, and down on one knee with it slammed into the floor. */
  gatefall: {
    keys: [
      [0.12, { L: SHIELD_TUCK, R: reach([-0.4, 1.3, -0.1], [0.1, 0.6, -0.8]), down: 0.45, lean: 0.3 }, true],
      [0.22, { L: SHIELD_FRONT, R: reach([-0.35, 1.9, -0.15], [0.1, 0.5, -0.85]), down: -0.15, lean: -0.1, head: -0.1 }],
      [0.36, { L: [1.2, -0.1, 1.2, 1.2, 0.4], R: reach([-0.3, 1.95, 0.0], [0.05, 0.2, -0.98]), lean: 0.2 }],
      [0.46, { L: SHIELD_SET, R: reach([-0.25, 1.15, 0.3], [0.1, 0.3, 0.95]), down: 1.0, lean: 0.5, fwd: 0.2 }],
      [0.75, { L: SHIELD_SET, R: reach([-0.25, 1.12, 0.3], [0.1, 0.3, 0.95]), down: 0.96, lean: 0.46, fwd: 0.18 }],
    ],
    steps: [step('L', 0.4, 0.6, 0.05, 0.46), step('R', 0.42, -0.2, -0.05, 0.46)],
    alt: {
      // A two-hander goes up over the head and comes down point first.
      great: [
        { R: reach([-0.2, 1.35, 0.1], [0.0, 0.7, 0.7]), grip: true, down: 0.45, lean: 0.3 },
        { R: reach([-0.1, 2.1, 0.1], [0.0, 0.95, 0.3]), grip: true, down: -0.15, lean: -0.15 },
        { R: reach([-0.05, 2.05, 0.3], [0.0, -0.3, 0.95]), grip: true, lean: 0.1 },
        { R: reach([0.0, 1.2, 0.5], [0.0, -0.85, 0.5]), grip: true, down: 1.0, lean: 0.45, fwd: 0.2 },
        { R: reach([0.0, 1.18, 0.5], [0.0, -0.85, 0.5]), grip: true, down: 0.96, lean: 0.42, fwd: 0.18 },
      ],
    },
    hit: true,
    blade: true,
    side: 'L',
    contact: 0.46,
    free: true,
    end: 1.15,
  },
};

// ---------------------------------------------------------------------------
// Carnage: the blade
// ---------------------------------------------------------------------------

const CARNAGE: Record<string, Spec> = {
  /** A flat sweep at the waist from the weapon side right round to the other, the hips thrown into it. */
  cleave: blade({
    keys: [
      [0.18, { R: reach([-0.6, 1.3, -0.12], [-0.6, 0.1, -0.8]), turn: -0.8, lean: 0.02, down: 0.12 }, true],
      [0.3, { R: reach([-0.1, 1.2, 0.62], [0.45, -0.05, 0.89]), turn: 0.1, lean: 0.22, down: 0.16, fwd: 0.12 }],
      [0.5, { R: reach([0.5, 1.15, 0.2], [0.8, -0.1, -0.35]), turn: 0.8, lean: 0.25, down: 0.16, fwd: 0.1 }],
    ],
    steps: [step('L', 0.12, 0.35, 0.15)],
    end: 0.85,
  }),
  /** From the far hip up across the body: the edge tears on the way out. */
  rend: blade({
    keys: [
      [0.16, { R: reach([0.25, 0.95, 0.05], [0.5, -0.5, -0.7]), turn: 0.55, lean: 0.12, down: 0.15 }, true],
      [0.26, { R: reach([-0.15, 1.35, 0.6], [-0.45, 0.45, 0.77]), turn: -0.15, lean: 0.2, fwd: 0.15 }],
      [0.42, { R: reach([-0.5, 1.75, 0.25], [-0.6, 0.75, -0.2]), turn: -0.45, lean: 0.08, head: -0.05 }],
    ],
    steps: [step('L', 0.1, 0.3, 0.05)],
    end: 0.74,
  }),
  /** One long cut laid in from high and drawn right through, a step behind it. */
  gash: blade({
    keys: [
      [0.18, { R: reach([-0.4, 1.85, -0.05], [0.2, 0.75, -0.6]), turn: -0.6, lean: -0.08, down: 0.05 }, true],
      [0.29, { R: reach([0.0, 1.15, 0.62], [0.6, -0.35, 0.72]), turn: 0.2, lean: 0.32, fwd: 0.3, down: 0.18 }],
      [0.48, { R: reach([0.35, 0.85, 0.15], [0.55, -0.6, -0.55]), turn: 0.65, lean: 0.38, fwd: 0.28, down: 0.22 }],
    ],
    steps: [step('L', 0.12, 0.6, 0.05)],
    end: 0.85,
  }),
  /** Up onto the toes with the blade behind the head, and everything brought straight down. */
  overhead: blade({
    keys: [
      [0.24, { R: reach([-0.15, 2.1, -0.25], [0.05, 0.1, -0.99]), lean: -0.3, down: -0.05, head: -0.1 }, true],
      [0.36, { R: reach([-0.08, 1.15, 0.6], [0.02, -0.45, 0.89]), lean: 0.45, down: 0.3, fwd: 0.25 }],
      [0.56, { R: reach([-0.08, 0.8, 0.5], [0.03, -0.9, 0.42]), lean: 0.55, down: 0.38, fwd: 0.25 }],
    ],
    steps: [step('L', 0.16, 0.5, 0, 0.36)],
    end: 0.95,
  }),
  /** A chop from the far shoulder angled down through the plate. */
  sunder: blade({
    keys: [
      [0.2, { R: reach([0.32, 1.85, -0.05], [0.4, 0.7, -0.6]), turn: 0.6, lean: -0.05, down: 0.04 }, true],
      [0.31, { R: reach([-0.12, 1.2, 0.6], [-0.4, -0.4, 0.82]), turn: -0.25, lean: 0.3, down: 0.18, fwd: 0.18 }],
      [0.5, { R: reach([-0.5, 0.9, 0.3], [-0.7, -0.55, -0.2]), turn: -0.55, lean: 0.35, down: 0.22, fwd: 0.15 }],
    ],
    steps: [step('L', 0.12, 0.4)],
    end: 0.88,
  }),
  /** Dropped low on a long step, the edge swept through at the knee. */
  maim: blade({
    keys: [
      [0.16, { R: reach([-0.5, 1.1, -0.2], [-0.3, -0.2, -0.93]), turn: -0.6, lean: 0.1, down: 0.2 }, true],
      [0.28, { R: reach([-0.05, 0.65, 0.65], [0.5, -0.3, 0.8]), turn: 0.25, lean: 0.45, down: 0.55, fwd: 0.3 }],
      [0.46, { R: reach([0.4, 0.6, 0.3], [0.85, -0.3, -0.4]), turn: 0.6, lean: 0.45, down: 0.55, fwd: 0.28 }],
    ],
    steps: [step('L', 0.08, 0.75, 0.1, 0.28)],
    end: 0.85,
  }),
  /** The blade held out flat at the waist and the whole body turned once round behind it. */
  whirlwind: blade({
    keys: [
      [0.1, { R: reach([-0.6, 1.2, 0.05], [-0.9, -0.05, 0.4]), turn: -0.45, lean: 0.1, down: 0.22, spin: -0.3 }, true],
      [0.2, { R: reach([-0.55, 1.15, 0.35], [-0.7, -0.05, 0.7]), turn: -0.1, lean: 0.15, down: 0.25, spin: Math.PI * 0.25 }],
      [0.3, { R: reach([-0.55, 1.15, 0.35], [-0.7, -0.05, 0.7]), turn: -0.1, lean: 0.15, down: 0.25, spin: Math.PI * 0.75 }],
      [0.4, { R: reach([-0.55, 1.15, 0.35], [-0.7, -0.05, 0.7]), turn: -0.1, lean: 0.15, down: 0.25, spin: Math.PI * 1.25 }],
      [0.5, { R: reach([-0.55, 1.15, 0.35], [-0.7, -0.05, 0.7]), turn: -0.1, lean: 0.15, down: 0.25, spin: Math.PI * 1.75 }],
    ],
    contact: 0.2,
    free: true,
    end: 0.62,
  }),
  /**
   * Five cuts in one motion: down, back across, up, down again, and one wide
   * sweep. Each cut lands on its key (`cuts`).
   */
  massacre: blade({
    keys: [
      [0.12, { R: reach([-0.45, 1.7, -0.1], [0.1, 0.7, -0.7]), turn: -0.6, down: 0.08 }, true],
      [0.22, { R: reach([-0.05, 1.25, 0.6], [0.6, -0.2, 0.77]), turn: 0.2, lean: 0.2, down: 0.12, fwd: 0.1 }],
      [0.28, { R: reach([0.35, 1.5, 0.15], [0.6, 0.5, -0.6]), turn: 0.55, lean: 0.12, down: 0.1 }],
      [0.34, { R: reach([-0.1, 1.3, 0.62], [-0.6, -0.05, 0.8]), turn: -0.2, lean: 0.2, down: 0.12, fwd: 0.12 }],
      [0.4, { R: reach([-0.5, 1.0, 0.1], [-0.5, -0.3, -0.8]), turn: -0.6, lean: 0.15, down: 0.2 }],
      [0.46, { R: reach([-0.05, 1.35, 0.6], [0.4, 0.45, 0.8]), turn: 0.15, lean: 0.15, down: 0.12, fwd: 0.12 }],
      [0.52, { R: reach([-0.2, 1.95, -0.05], [0.1, 0.6, -0.8]), turn: -0.3, lean: -0.1 }],
      [0.58, { R: reach([0.0, 1.15, 0.6], [0.5, -0.45, 0.74]), turn: 0.3, lean: 0.3, down: 0.15, fwd: 0.15 }],
      [0.65, { R: reach([-0.6, 1.25, 0.0], [-0.85, 0.05, -0.5]), turn: -0.75, lean: 0.12, down: 0.2 }],
      [0.72, { R: reach([0.1, 1.2, 0.62], [0.6, -0.1, 0.8]), turn: 0.35, lean: 0.3, down: 0.25, fwd: 0.2 }],
      [0.85, { R: reach([0.55, 1.1, 0.2], [0.85, -0.2, -0.45]), turn: 0.8, lean: 0.32, down: 0.25, fwd: 0.18 }],
    ],
    steps: [step('L', 0.1, 0.4), step('R', 0.4, 0.3), step('L', 0.62, 0.4)],
    contact: 0.22,
    cuts: [0.34, 0.46, 0.58, 0.72],
    end: 1.05,
  }),
  /** Gathered low, the blade swung up behind in one huge circle, and brought down into the floor. */
  ruin: blade({
    keys: [
      [0.3, { R: reach([-0.5, 1.0, -0.4], [-0.2, -0.4, -0.9]), turn: -0.8, lean: 0.25, down: 0.25 }, true],
      [0.45, { R: reach([-0.15, 2.15, -0.2], [0.0, 0.3, -0.95]), turn: -0.2, lean: -0.35, down: -0.1, head: -0.15 }, true],
      [0.55, { R: reach([-0.05, 0.95, 0.65], [0.0, -0.7, 0.7]), turn: 0.05, lean: 0.6, down: 0.5, fwd: 0.35 }],
      [0.8, { R: reach([-0.05, 0.55, 0.62], [0.0, -0.92, 0.38]), turn: 0.05, lean: 0.62, down: 0.55, fwd: 0.35 }],
    ],
    steps: [step('L', 0.4, 0.7, 0.05, 0.55)],
    contact: 0.55,
    end: 1.3,
  }),
  /** The blade dragged round at the ankles, then raised upright before the face. */
  gorefeast: {
    keys: [
      [0.16, { R: reach([-0.6, 0.75, 0.1], [-0.65, -0.3, 0.7]), turn: -0.8, down: 0.55, lean: 0.5 }, true],
      [0.3, { R: reach([0.5, 0.75, 0.35], [0.75, -0.3, 0.6]), turn: 0.7, down: 0.55, lean: 0.5 }],
      [0.48, { R: reach([-0.05, 1.45, 0.3], [0.0, 0.99, 0.1]), turn: 0.0, down: 0.0, lean: -0.15, head: -0.3 }],
      [0.7, { R: reach([-0.05, 1.45, 0.28], [0.0, 0.99, 0.1]), lean: -0.12, head: -0.25 }],
    ],
    hit: true,
    blade: true,
    contact: 0.3,
    end: 1.05,
  },
};

// ---------------------------------------------------------------------------
// Oath: cries, banners and the ground itself
// ---------------------------------------------------------------------------

const OATH: Record<string, Spec> = {
  /** The blade thrust straight up at the sky, chest out, roaring. */
  battleCry: {
    keys: [
      [0.14, { R: reach([-0.3, 1.1, 0.15], [0.0, 0.9, 0.4]), L: [0.4, 0.55, 0.3, 1.2, 0.3], down: 0.2, lean: 0.25, head: 0.15 }, true],
      [0.26, { R: reach([-0.2, 2.15, 0.12], [0.0, 0.98, 0.15]), L: [0.6, 0.9, 0.1, 0.6, 0.3], lean: -0.25, head: -0.4, down: -0.06 }],
      [0.6, { R: reach([-0.2, 2.12, 0.1], [0.0, 0.98, 0.15]), L: [0.6, 0.9, 0.1, 0.65, 0.3], lean: -0.22, head: -0.35 }],
    ],
    end: 1.0,
  },
  /** The flat of the blade beaten on the shield face, twice: the rally. */
  rallyingHorn: {
    keys: [
      [0.12, { R: reach([-0.55, 1.55, 0.05], [-0.5, 0.5, 0.7]), L: [1.25, 0.2, 1.3, 1.45, 0.4], turn: -0.25 }, true],
      [0.2, { R: reach([-0.1, 1.3, 0.45], [0.85, 0.25, 0.45]), L: [1.25, 0.2, 1.3, 1.45, 0.4], turn: 0.15, lean: 0.1 }],
      [0.3, { R: reach([-0.55, 1.6, 0.05], [-0.5, 0.55, 0.65]), L: [1.25, 0.2, 1.3, 1.45, 0.4], turn: -0.25, head: -0.1 }],
      [0.38, { R: reach([-0.1, 1.3, 0.45], [0.85, 0.25, 0.45]), L: [1.25, 0.2, 1.3, 1.45, 0.4], turn: 0.15, lean: 0.1 }],
      [0.62, { R: reach([-0.3, 2.0, 0.1], [0.0, 0.98, 0.2]), L: [1.0, 0.6, 0.6, 1.0, 0.4], lean: -0.2, head: -0.3 }],
    ],
    alt: {
      // A two-hander is raised flat overhead and pumped twice.
      great: [
        { R: reach([-0.25, 1.3, 0.25], [0.95, 0.1, 0.2]), down: 0.15 },
        { R: reach([-0.25, 1.95, 0.2], [0.95, 0.15, 0.2]), lean: -0.1, head: -0.15 },
        { R: reach([-0.25, 1.5, 0.25], [0.95, 0.1, 0.2]), down: 0.1 },
        { R: reach([-0.25, 2.0, 0.2], [0.95, 0.15, 0.2]), lean: -0.15, head: -0.25 },
        { R: reach([-0.25, 2.02, 0.2], [0.95, 0.15, 0.2]), lean: -0.18, head: -0.3 },
      ],
    },
    contact: 0.2,
    glow: 'both',
    end: 1.0,
  },
  /** A stamp forward, head down, the point held out at their eyes: a promise. */
  intimidate: {
    keys: [
      [0.12, { R: reach([-0.4, 1.4, -0.1], [-0.1, 0.4, 0.9]), L: [0.4, 0.8, 0.1, 0.8, 0.3], turn: -0.3, fwd: -0.08 }, true],
      [0.22, { R: reach([-0.1, 1.5, 0.82], [0.0, 0.05, 1.0]), L: [0.2, 0.95, 0.0, 0.5, 0.3], turn: 0.2, lean: 0.32, fwd: 0.32, down: 0.15, head: 0.2 }],
      [0.5, { R: reach([-0.1, 1.48, 0.8], [0.0, 0.04, 1.0]), L: [0.2, 0.95, 0.0, 0.55, 0.3], turn: 0.2, lean: 0.3, fwd: 0.3, down: 0.15, head: 0.2 }],
    ],
    steps: [step('L', 0.08, 0.6)],
    end: 0.85,
  },
  /** Raised high in both fists and driven down into the floor ahead, like a standard. */
  bannerOfTheGate: {
    keys: [
      [0.2, { R: reach([-0.05, 2.0, 0.45], [0.0, -0.99, 0.12]), L: [2.4, -0.1, 0.9, 1.0, 0.3], lean: -0.15, head: -0.15, down: -0.05 }, true],
      [0.32, { R: reach([-0.02, 1.25, 0.62], [0.0, -0.95, 0.3]), L: [1.4, -0.15, 0.9, 0.9, 0.3], lean: 0.35, down: 0.45, fwd: 0.15 }],
      [0.6, { R: reach([-0.02, 1.25, 0.6], [0.0, -0.95, 0.3]), L: [1.35, -0.15, 0.9, 0.95, 0.3], lean: 0.3, down: 0.4, fwd: 0.14 }],
    ],
    steps: [step('L', 0.1, 0.5)],
    end: 1.0,
  },
  /** Arms flung wide, chest open to them, head thrust forward in a roar. */
  tauntingRoar: {
    keys: [
      [0.14, { R: reach([-0.35, 1.15, 0.0], [-0.4, -0.3, 0.86]), L: [0.6, 0.6, 0.3, 1.2, 0.3], lean: -0.15, down: 0.1 }, true],
      [0.24, { R: reach([-0.82, 1.4, 0.15], [-0.75, 0.35, 0.56]), L: [0.5, 1.45, -0.2, 0.25, 0.3], lean: 0.25, fwd: 0.12, head: 0.25 }],
      [0.55, { R: reach([-0.82, 1.38, 0.15], [-0.75, 0.32, 0.57]), L: [0.5, 1.45, -0.2, 0.3, 0.3], lean: 0.22, fwd: 0.1, head: 0.22 }],
    ],
    end: 0.95,
  },
  /** The knee hauled up high and the foot driven down: the floor jumps. */
  warStomp: {
    keys: [
      [0.16, { R: reach([-0.35, 1.35, 0.15], [0.0, 0.85, 0.5]), L: SHIELD_TUCK, down: -0.12, lean: -0.12, side: 0.12 }, true],
      [0.3, { R: reach([-0.35, 1.15, 0.25], [0.0, 0.6, 0.8]), L: SHIELD_FRONT, down: 0.4, lean: 0.25, side: 0.0 }],
      [0.55, { R: reach([-0.35, 1.15, 0.25], [0.0, 0.6, 0.8]), L: SHIELD_FRONT, down: 0.36, lean: 0.22 }],
    ],
    steps: [lift('R', 0.06, 0.25, -0.05, 0.75, 0.3)],
    alt: {
      great: [
        { R: reach([-0.2, 1.45, 0.2], [0.0, 0.9, 0.4]), down: -0.12, lean: -0.12, side: 0.12 },
        { R: reach([-0.1, 1.2, 0.35], [0.0, 0.7, 0.7]), down: 0.4, lean: 0.25 },
        null,
      ],
    },
    hit: true,
    end: 0.9,
  },
  /** Up off both feet, the blade turned point-down, and landed on a knee with it in the floor. */
  earthshatter: {
    keys: [
      [0.18, { R: reach([-0.15, 1.95, 0.2], [0.0, -0.3, 0.95]), down: 0.3, lean: -0.2, head: -0.1 }, true],
      [0.26, { R: reach([-0.1, 1.9, 0.3], [0.0, -0.75, 0.66]), down: -0.25, lean: -0.05 }],
      [0.36, { R: reach([-0.05, 1.1, 0.72], [0.0, -0.8, 0.6]), down: 1.0, lean: 0.55, fwd: 0.3 }],
      [0.62, { R: reach([-0.05, 1.08, 0.7], [0.0, -0.8, 0.6]), down: 0.98, lean: 0.52, fwd: 0.28 }],
    ],
    steps: [step('L', 0.2, 0.7, 0.05, 0.36), step('R', 0.24, 0.2, -0.05, 0.36)],
    hit: true,
    blade: true,
    contact: 0.36,
    end: 1.05,
  },
  /** Crouched and gathered, then exploding upright with everything thrown out and up. */
  heraldOfRuin: {
    keys: [
      [0.22, { R: reach([0.15, 0.85, 0.3], [0.6, -0.7, 0.4]), L: [0.9, -0.4, 1.2, 2.0, 0.4], down: 0.6, lean: 0.45, head: 0.25 }, true],
      [0.34, { R: reach([-0.85, 1.95, 0.1], [-0.5, 0.82, 0.25]), L: [2.2, 1.4, -0.4, 0.2, 0.3], down: -0.1, lean: -0.32, head: -0.45 }],
      [0.7, { R: reach([-0.82, 1.92, 0.1], [-0.5, 0.82, 0.25]), L: [2.1, 1.4, -0.4, 0.25, 0.3], down: -0.08, lean: -0.28, head: -0.4 }],
    ],
    glow: 'both',
    end: 1.15,
  },
};

defineGestures({ ...BULWARK, ...CARNAGE, ...OATH });

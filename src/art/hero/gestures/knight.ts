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
  /** Shoulder in behind the shield, a hop off the back foot, the boss rammed home. */
  shieldBash: {
    hit: true,
    side: 'L',
    keys: [
      [0.12, { R: reach([-0.38, 1.05, -0.22], [0.05, 0.4, -0.9]), L: SHIELD_TUCK, turn: 0.55, lean: 0.1, down: 0.15, fwd: -0.1 }, true],
      [0.22, { R: reach([-0.4, 1.0, -0.28], [0.0, 0.3, -0.95]), L: SHIELD_PUNCH, turn: -0.5, lean: 0.32, fwd: 0.5, down: 0.12 }],
      [0.38, { R: reach([-0.38, 1.05, -0.2], [0.0, 0.35, -0.94]), L: SHIELD_PUNCH, turn: -0.42, lean: 0.28, fwd: 0.45, down: 0.12 }],
    ],
    steps: [step('L', 0.1, 0.95)],
    alt: {
      // No shield: the haft held crosswise and driven into them.
      great: [
        { R: reach([-0.3, 1.2, 0.05], [0.9, 0.3, 0.3]), turn: 0.45, lean: 0.1, down: 0.15, fwd: -0.1 },
        { R: reach([-0.22, 1.32, 0.52], [0.98, 0.15, 0.1]), turn: -0.2, lean: 0.32, fwd: 0.5, down: 0.12 },
        { R: reach([-0.22, 1.3, 0.48], [0.98, 0.12, 0.12]), turn: -0.15, lean: 0.28, fwd: 0.45, down: 0.12 },
      ],
    },
    end: 0.7,
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
  /** Head down behind the shield, the blade trailed low: a ram at a run. */
  shieldCharge: {
    hit: true,
    side: 'L',
    keys: [
      [0.06, { R: reach([-0.4, 0.95, -0.3], [-0.1, -0.15, -0.98]), L: SHIELD_TUCK, lean: 0.5, down: 0.25, turn: 0.35, head: 0.15 }, true],
      [0.24, { R: reach([-0.42, 0.95, -0.32], [-0.1, -0.2, -0.97]), L: SHIELD_PUNCH, lean: 0.55, down: 0.22, turn: -0.3, fwd: 0.35, head: 0.1 }],
      [0.36, { R: reach([-0.4, 1.0, -0.25], [-0.05, -0.1, -0.99]), L: SHIELD_FRONT, lean: 0.35, down: 0.15, turn: -0.2, fwd: 0.2 }],
    ],
    alt: {
      great: [
        { R: reach([-0.35, 0.95, 0.15], [0.3, -0.15, 0.94]), lean: 0.5, down: 0.25, turn: 0.2, head: 0.15 },
        { R: reach([-0.15, 1.05, 0.55], [0.15, -0.05, 0.99]), lean: 0.55, down: 0.22, turn: -0.1, fwd: 0.35, head: 0.1 },
        { R: reach([-0.15, 1.05, 0.5], [0.15, -0.1, 0.98]), lean: 0.35, down: 0.15, fwd: 0.2 },
      ],
    },
    end: 0.55,
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
};

// ---------------------------------------------------------------------------
// Carnage: the blade
// ---------------------------------------------------------------------------

const CARNAGE: Record<string, Spec> = {
  /** Wound far round, then a flat sweep at the waist through everything in front. */
  cleave: {
    hit: true,
    keys: [
      [0.16, { R: reach([-0.62, 1.25, -0.28], [-0.55, 0.15, -0.82]), turn: -0.95, down: 0.18, lean: 0.05 }, true],
      [0.26, { R: reach([-0.05, 1.12, 0.62], [0.78, -0.05, 0.62]), turn: 0.3, down: 0.22, lean: 0.2, fwd: 0.12 }],
      [0.42, { R: reach([0.5, 1.12, 0.12], [0.88, -0.05, -0.46]), turn: 0.95, down: 0.22, lean: 0.18, fwd: 0.1 }],
    ],
    steps: [step('R', 0.18, 0.1, 0.3)],
    end: 0.8,
  },
  /** Hooked in high, then ripped down and dragged back out toward the hip. */
  rend: {
    hit: true,
    keys: [
      [0.12, { R: reach([-0.15, 1.65, 0.5], [0.15, 0.55, 0.82]), turn: -0.2, lean: 0.12, fwd: 0.12 }, true],
      [0.22, { R: reach([-0.05, 1.2, 0.62], [0.05, -0.55, 0.83]), turn: 0.15, lean: 0.3, fwd: 0.2, down: 0.15 }],
      [0.4, { R: reach([-0.32, 0.98, 0.1], [0.0, -0.25, 0.97]), turn: -0.45, lean: 0.12, fwd: -0.12, down: 0.12 }],
    ],
    end: 0.75,
  },
  /** From low behind the hip, a rising cut that opens them up and finishes high. */
  gash: {
    hit: true,
    keys: [
      [0.14, { R: reach([-0.42, 0.78, -0.12], [-0.3, -0.62, -0.72]), turn: -0.55, down: 0.3, lean: 0.25 }, true],
      [0.24, { R: reach([0.0, 1.35, 0.55], [0.48, 0.62, 0.62]), turn: 0.25, down: 0.05, lean: 0.05, fwd: 0.12 }],
      [0.4, { R: reach([0.32, 1.85, 0.18], [0.45, 0.82, -0.35]), turn: 0.55, down: -0.06, lean: -0.12, head: -0.1 }],
    ],
    end: 0.75,
  },
  /** A back-bend with the blade far behind, a long step, and everything brought down. */
  overhead: {
    hit: true,
    keys: [
      [0.22, { R: reach([-0.1, 2.08, -0.28], [0.0, 0.35, -0.94]), lean: -0.32, down: -0.05, head: -0.1 }, true],
      [0.34, { R: reach([-0.05, 1.02, 0.62], [0.0, -0.55, 0.83]), lean: 0.52, down: 0.38, fwd: 0.3 }],
      [0.52, { R: reach([-0.05, 0.88, 0.62], [0.0, -0.45, 0.89]), lean: 0.6, down: 0.42, fwd: 0.28 }],
    ],
    steps: [step('L', 0.2, 0.75)],
    end: 0.95,
  },
  /** The point raised high and driven down through the armour like a spike. */
  sunder: {
    hit: true,
    keys: [
      [0.16, { R: reach([-0.18, 1.82, 0.22], [0.0, -0.45, 0.89]), turn: -0.25, lean: -0.12, down: -0.04 }, true],
      [0.26, { R: reach([-0.06, 1.1, 0.72], [0.0, -0.7, 0.71]), turn: 0.1, lean: 0.5, down: 0.32, fwd: 0.25 }],
      [0.42, { R: reach([-0.06, 1.0, 0.7], [0.0, -0.7, 0.71]), turn: 0.1, lean: 0.55, down: 0.36, fwd: 0.25 }],
    ],
    steps: [step('L', 0.14, 0.45)],
    end: 0.8,
  },
  /** Dropped into a crouch, the blade swept flat across at the shins. */
  maim: {
    hit: true,
    keys: [
      [0.14, { R: reach([-0.55, 0.95, -0.12], [-0.5, -0.38, -0.78]), turn: -0.7, down: 0.25, lean: 0.2 }, true],
      [0.24, { R: reach([0.0, 0.68, 0.62], [0.74, -0.22, 0.63]), turn: 0.25, down: 0.55, lean: 0.5, fwd: 0.15 }],
      [0.4, { R: reach([0.5, 0.68, 0.2], [0.93, -0.18, -0.3]), turn: 0.75, down: 0.55, lean: 0.45, fwd: 0.12 }],
    ],
    steps: [step('L', 0.12, 0.4, 0.2)],
    end: 0.8,
  },
  /** Arms out at full stretch, the body whipped round one way and back the other. */
  whirlwind: {
    hit: true,
    keys: [
      [0.12, { R: reach([-0.85, 1.3, -0.2], [-0.95, 0.0, -0.3]), turn: -1.2, down: 0.15, lean: 0.05 }, true],
      [0.22, { R: reach([-0.1, 1.28, 0.85], [0.3, 0.0, 0.95]), turn: 0.35, down: 0.2 }],
      [0.32, { R: reach([0.7, 1.3, 0.25], [0.95, 0.0, -0.3]), turn: 1.2, down: 0.2, roll: 0.1 }],
      [0.46, { R: reach([-0.75, 1.3, 0.3], [-0.9, 0.05, 0.4]), turn: -0.9, down: 0.18, roll: -0.1 }],
    ],
    steps: [step('R', 0.12, 0.2, 0.35), step('L', 0.3, 0.1, -0.3)],
    contact: 0.22,
    end: 0.75,
  },
  /** The blade dragged round at the ankles, then raised upright before the face. */
  gorefeast: {
    keys: [
      [0.16, { R: reach([-0.6, 0.75, 0.1], [-0.65, -0.3, 0.7]), turn: -0.8, down: 0.55, lean: 0.5 }, true],
      [0.3, { R: reach([0.5, 0.75, 0.35], [0.75, -0.3, 0.6]), turn: 0.7, down: 0.55, lean: 0.5 }],
      [0.48, { R: reach([-0.05, 1.45, 0.3], [0.0, 0.99, 0.1]), turn: 0.0, down: 0.0, lean: -0.15, head: -0.3 }],
      [0.7, { R: reach([-0.05, 1.45, 0.28], [0.0, 0.99, 0.1]), lean: -0.12, head: -0.25 }],
    ],
    contact: 0.3,
    glow: 'right',
    end: 1.05,
  },
  /** A flurry: down, up, down, up, and a last driving thrust, walking forward. */
  massacre: {
    hit: true,
    keys: [
      [0.08, { R: reach([-0.4, 1.75, -0.05], [0.2, 0.6, -0.78]), turn: -0.5 }, true],
      [0.14, { R: reach([0.15, 1.05, 0.5], [0.75, -0.35, 0.56]), turn: 0.45, lean: 0.2, fwd: 0.1 }],
      [0.22, { R: reach([-0.45, 1.6, 0.3], [-0.6, 0.45, 0.66]), turn: -0.45, lean: 0.15, fwd: 0.18 }],
      [0.3, { R: reach([0.2, 1.0, 0.5], [0.75, -0.4, 0.52]), turn: 0.5, lean: 0.25, fwd: 0.26, down: 0.1 }],
      [0.38, { R: reach([-0.4, 1.55, 0.35], [-0.6, 0.4, 0.7]), turn: -0.4, lean: 0.2, fwd: 0.32 }],
      [0.48, { R: reach([-0.08, 1.3, 0.75], [0.05, 0.0, 1.0]), turn: 0.3, lean: 0.3, fwd: 0.45, down: 0.15 }],
    ],
    steps: [step('L', 0.1, 0.35), step('R', 0.24, 0.35), step('L', 0.38, 0.35)],
    contact: 0.14,
    end: 0.85,
  },
  /** The blade trailed on the floor behind, swung up over the head and brought down on the world. */
  ruin: {
    hit: true,
    keys: [
      [0.22, { R: reach([-0.5, 0.75, -0.55], [-0.2, -0.35, -0.92]), turn: -0.95, down: 0.4, lean: 0.35 }, true],
      [0.38, { R: reach([-0.15, 2.05, -0.05], [0.0, 0.6, -0.8]), turn: -0.2, down: -0.06, lean: -0.3, head: -0.15 }],
      [0.48, { R: reach([-0.05, 0.9, 0.78], [0.0, -0.5, 0.87]), turn: 0.15, down: 0.55, lean: 0.62, fwd: 0.35 }],
      [0.7, { R: reach([-0.05, 0.86, 0.72], [0.0, -0.45, 0.89]), turn: 0.15, down: 0.55, lean: 0.62, fwd: 0.33 }],
    ],
    steps: [step('L', 0.36, 0.8, 0.1)],
    contact: 0.48,
    end: 1.15,
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
    glow: 'both',
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

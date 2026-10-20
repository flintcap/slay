/**
 * The Rogue's gestures (class id `shadowblade`): one per active skill. See
 * `../SkillActions.ts` for how a gesture is written.
 *
 * The Rogue holds a blade in each hand, so both arms work in nearly every
 * gesture. Hands are placed by arm angles (`Pose.arm` order), which keeps a
 * reverse-gripped dagger's point leading with the fist, and reads the same
 * with a pair of short swords.
 */
import type { Arm } from '../Actions';
import { defineGestures, type Spec, step } from '../SkillActions';

/** A blade coiled back at the chest, ready to strike. */
const COIL: Arm = [0.85, 0.15, 0.6, 2.2, -1.3];
/** A blade lifted high for an ice-pick stab. */
const PICK_HIGH: Arm = [2.5, 0.45, -0.35, 1.9, 0, 0.2];
/** The ice-pick stab come down. */
const PICK_LOW: Arm = [1.25, 0.1, 0.3, 1.0, 0, -0.2];

// Blade blows. A skill that swings the blades is written like a plain
// weapon blow (`blow` in `../Actions.ts`): a held wind-up, the hit, a carried
// follow-through. The main keys are for one blade, the free arm swung for
// balance; `alt.dual` gives two blades their own keys, the off blade
// answering on the gesture's `cuts`.

/** The free arm with one blade: out ahead at the wind-up, thrown back at the blow, settling. */
const BAL_WIND: Arm = [0.9, 0.4, 0.3, 1.0, 0.2];
const BAL_HIT: Arm = [0.15, 0.5, 0, 0.7, 0.2];
const BAL_FOLLOW: Arm = [0.3, 0.45, 0, 0.8, 0.2];
/** The reverse-grip draw cut: wound out wide, swept flat across, carried through. */
const RIP_WIND: Arm = [1.1, 0.75, -0.7, 2.2, 0, 0.2];
const RIP_HIT: Arm = [1.45, -0.05, 0.85, 0.7, 0, -0.2];
const RIP_FOLLOW: Arm = [1.15, -0.5, 1.35, 1.0, 0, -0.2];
/** A blade raised high over its own shoulder, and that cut come down across the body. */
const HIGH: Arm = [2.3, 0.85, -0.5, 1.65, 0, 0.3];
const DOWN_ACROSS: Arm = [1.3, -0.2, 0.8, 0.6, 0, -0.3];
const DOWN_THROUGH: Arm = [1.1, -0.45, 1.2, 0.9, 0, -0.3];
/** Low, for a cut at the legs: wound out at the hip, then swept across at the knee. */
const LOW_WIND: Arm = [0.85, 0.95, -0.5, 1.9, 0, 0.3];
const LOW_HIT: Arm = [0.55, -0.05, 0.8, 0.5, 0, -0.3];
const LOW_FOLLOW: Arm = [0.45, -0.45, 1.2, 0.8, 0, -0.3];
/** Blades held out wide and low, for a spin; and drawn in across the chest. */
const WIDE: Arm = [0.95, 1.35, 0.1, 0.25, 0.3, -0.2];
const WIDE_HIGH: Arm = [1.35, 1.3, 0.1, 0.25, 0.3, -0.2];
const IN: Arm = [0.85, -0.35, 1.1, 1.8, 0.3];
/** A blade punched straight out low (a jab under the guard), and drawn back after. */
const JAB: Arm = [1.25, 0.05, 0.35, 0.05, -1.3, -0.1];
const JAB_BACK: Arm = [0.6, 0.3, 0.4, 2.3, -1.3, -0.2];
/** A knife cocked by the ear, and snapped out. */
const EAR: Arm = [2.1, 0.3, 0.3, 2.3, 0, 0.5];
const LOOSE: Arm = [1.6, 0.05, 0.3, 0.15, 0, -0.6];
const Q = Math.PI / 2;

// ---------------------------------------------------------------------------
// Venom
// ---------------------------------------------------------------------------

/** Death Lotus: two full turns, blades out low, one cut every quarter turn. */
function lotus(): Spec {
  const keys: Spec['keys'] = [[0.1, { R: IN, L: IN, turn: -0.6, down: 0.42, lean: 0.35 }, true]];
  const cuts: number[] = [];
  for (let i = 1; i <= 8; i++) {
    const t = 0.05 + 0.1 * i;
    if (i > 1) cuts.push(t);
    const odd = i % 2 === 1;
    keys.push([t, { R: odd ? WIDE : WIDE_HIGH, L: odd ? WIDE_HIGH : WIDE, spin: Q * i, down: odd ? 0.34 : 0.26, lean: 0.25, roll: odd ? 0.1 : -0.1 }]);
  }
  keys.push([0.93, { R: IN, L: IN, spin: Q * 8, down: 0.22, lean: 0.15 }]);
  return { keys, contact: 0.15, cuts, hit: true, blade: true, free: true, end: 1.0 };
}

const VENOM: Record<string, Spec> = {
  /**
   * Adder's Kiss: coiled low, a jab under the guard, and the off hand flicks
   * the venom after it (with two blades, the off blade's jab).
   */
  viperStrike: {
    keys: [
      [0.12, { R: JAB_BACK, L: [0.7, 0.45, 0.3, 1.2, 0.2], turn: -0.45, lean: 0.35, down: 0.35, fwd: -0.05 }, true],
      [0.2, { R: JAB, L: BAL_HIT, turn: 0.35, lean: 0.4, down: 0.3, fwd: 0.3 }],
      [0.3, { R: [1.2, 0.05, 0.35, 0.15, -1.3, -0.1], L: [1.35, 0.45, 0.2, 0.25, 0.4, -0.7], fistL: 0, turn: 0.1, lean: 0.35, down: 0.26, fwd: 0.26 }],
      [0.46, { R: [0.9, 0.15, 0.5, 1.6, -1.3], L: [0.6, 0.4, 0.2, 1.0, 0.3], fistL: 0.6, turn: 0.05, lean: 0.18, down: 0.12, fwd: 0.1 }],
    ],
    alt: {
      dual: [
        { R: JAB_BACK, L: COIL, turn: -0.45, lean: 0.35, down: 0.35, fwd: -0.05 },
        { R: JAB, L: COIL, turn: 0.35, lean: 0.4, down: 0.3, fwd: 0.3 },
        { R: [0.8, 0.2, 0.5, 1.9, -1.3], L: JAB, turn: -0.2, lean: 0.38, down: 0.28, fwd: 0.3 },
        { R: COIL, L: [0.9, 0.15, 0.5, 1.6, -1.3], turn: -0.05, lean: 0.18, down: 0.12, fwd: 0.1 },
      ],
    },
    steps: [step('L', 0.08, 0.6)],
    contact: 0.2,
    cuts: [0.3],
    hit: true,
    blade: true,
    end: 0.72,
  },
  deathLotus: lotus(),
  /** The blades crossed before the eyes and drawn along each other, then flicked down clean. */
  coatBlades: {
    keys: [
      [0.16, { R: [1.45, -0.45, 1.1, 1.5, 0.3], L: [1.45, -0.45, 1.1, 1.5, 0.3], head: 0.2, lean: 0.1 }, true],
      [0.3, { R: [0.4, 0.6, 0.2, 0.25, 0.3, -0.5], L: [0.4, 0.6, 0.2, 0.25, 0.3, -0.5], head: 0.15, lean: 0.12, down: 0.15 }],
      [0.6, { R: [0.35, 0.55, 0.2, 0.3, 0.3, -0.4], L: [0.35, 0.55, 0.2, 0.3, 0.3, -0.4], head: 0.1, lean: 0.1, down: 0.12 }],
    ],
    glow: 'both',
    end: 0.9,
  },
  /** Elbow up, the dart cocked by the ear, then snapped out with the wrist. */
  venomDart: {
    keys: [
      [0.1, { R: [2.0, 0.25, 0.4, 2.45, 0, 0.6], L: [1.2, 0.2, 0.4, 0.8], turn: -0.2, fwd: -0.05 }, true],
      [0.16, { R: [1.65, 0.05, 0.3, 0.15, 0, -0.7], L: [0.6, 0.4, 0.2, 1.2], turn: 0.15, fwd: 0.08 }],
      [0.3, { R: [1.5, 0.05, 0.3, 0.25, 0, -0.5], L: [0.6, 0.4, 0.2, 1.2], turn: 0.12, fwd: 0.06 }],
    ],
    end: 0.5,
  },
  /** A flask lobbed high and slow from the free hand, underarm. */
  noxiousCloud: {
    keys: [
      [0.16, { L: [-0.55, 0.3, 0, 0.3, 0.4], R: COIL, turn: 0.35, fwd: -0.12, down: 0.15 }, true],
      [0.28, { L: [2.3, 0.25, 0.2, 0.2, 0.4, 0.4], R: COIL, turn: -0.1, fwd: 0.12, lean: -0.1, head: -0.2 }],
      [0.48, { L: [2.1, 0.3, 0.2, 0.3, 0.4, 0.4], R: COIL, turn: -0.1, fwd: 0.1, head: -0.15 }],
    ],
    glow: 'left',
    end: 0.85,
  },
  /** The cork pulled with the teeth, then the vial hurled overarm. */
  plagueVial: {
    keys: [
      [0.14, { L: [1.25, -0.25, 1.25, 2.5, 0.5], head: 0.15, turn: 0.2 }, true],
      [0.24, { L: [2.6, 0.7, -1.0, 2.0, 0, 0.4], R: [0.6, 0.4, 0.2, 1.4], turn: 0.6, lean: -0.15, fwd: -0.1 }, true],
      [0.32, { L: [1.6, 0.15, 0.4, 0.2, 0.4, -0.4], R: [0.4, 0.5, 0, 1.0], turn: -0.35, lean: 0.25, fwd: 0.25 }],
      [0.5, { L: [0.9, -0.2, 1.0, 0.5, 0.3], R: [0.4, 0.5, 0, 1.0], turn: -0.5, lean: 0.3, fwd: 0.25 }],
    ],
    steps: [step('R', 0.2, 0.55)],
    contact: 0.32,
    glow: 'left',
    end: 0.9,
  },
  /** Both arms flung at the marked one, then the free fist yanked shut and back. */
  envenomBurst: {
    keys: [
      [0.14, { R: [1.5, 0.1, 0.25, 0.2, -1.3], L: [1.55, -0.05, 0.3, 0.1, 0.3, -0.6], fistL: 0, turn: 0.1, lean: 0.15, fwd: 0.1 }, true],
      [0.24, { R: [1.4, 0.15, 0.3, 0.4, -1.3], L: [0.25, 0.35, 0.1, 2.0, 0.3], fistL: 1, turn: -0.35, lean: -0.05, fwd: -0.08 }],
      [0.44, { R: [1.35, 0.15, 0.3, 0.45, -1.3], L: [0.25, 0.35, 0.1, 2.0, 0.3], fistL: 1, turn: -0.3, fwd: -0.06 }],
    ],
    glow: 'left',
    end: 0.75,
  },
  /** A palm laid on the floor, then drawn up swaying, a serpent rising with it. */
  viperGod: {
    keys: [
      [0.18, { L: [0.6, 0.35, 0.3, 0.15, 0.9, -1.2], R: COIL, lean: 0.55, down: 0.95, head: 0.2 }, true],
      [0.32, { L: [1.3, 0.5, 0.2, 0.9, 0.4, 0.7], R: COIL, lean: 0.25, down: 0.5, roll: 0.15 }],
      [0.46, { L: [1.9, 0.15, 0.5, 0.6, 0.4, -0.5], R: COIL, lean: 0.0, down: 0.15, roll: -0.12, head: -0.15 }],
      [0.7, { L: [2.0, 0.2, 0.5, 0.5, 0.4, 0.4], R: COIL, down: 0.1, head: -0.2 }],
    ],
    steps: [step('L', 0.06, 0.5)],
    contact: 0.32,
    glow: 'left',
    end: 1.05,
  },
};

// ---------------------------------------------------------------------------
// Shadowcraft
// ---------------------------------------------------------------------------

const SHADOWCRAFT: Record<string, Spec> = {
  /** Out of the dark in a crouch with the blades crossed; up, and both driven down into a back. */
  shadowStep: {
    keys: [
      [0.06, { R: [1.0, -0.4, 1.1, 1.9, 0.3], L: [1.0, -0.4, 1.1, 1.9, 0.3], lean: 0.45, down: 0.5 }, true],
      [0.13, { R: PICK_HIGH, L: PICK_HIGH, lean: -0.1, down: 0.05 }, true],
      [0.2, { R: PICK_LOW, L: PICK_LOW, lean: 0.45, down: 0.3, fwd: 0.15 }],
      [0.34, { R: PICK_LOW, L: PICK_LOW, lean: 0.42, down: 0.28, fwd: 0.12 }],
    ],
    contact: 0.2,
    hit: true,
    blade: true,
    end: 0.6,
  },
  /** The pellet dashed at the floor, the other arm thrown up before the eyes. */
  smokeBomb: {
    keys: [
      [0.12, { L: [1.9, 0.3, 0.3, 1.5, 0.3], R: [0.7, 0.3, 0.4, 1.4, -1.3], lean: -0.1 }, true],
      [0.2, { L: [0.5, 0.25, 0.3, 0.2, 0.4, -1.0], R: [1.6, -0.35, 1.2, 1.9, 0.3], lean: 0.4, down: 0.45, head: 0.3, turn: 0.25 }],
      [0.42, { L: [0.45, 0.3, 0.3, 0.3, 0.4, -0.9], R: [1.55, -0.35, 1.2, 1.95, 0.3], lean: 0.38, down: 0.42, head: 0.28, turn: 0.25 }],
    ],
    steps: [step('R', 0.18, -0.35, -0.1)],
    glow: 'left',
    end: 0.75,
  },
  /** One side-step and a split: the body leans one way, both arms swept the other. */
  shadowClone: {
    keys: [
      [0.12, { R: [1.0, -0.4, 1.1, 1.9, 0.3], L: [1.0, -0.4, 1.1, 1.9, 0.3], down: 0.2, fistR: 1, fistL: 1 }, true],
      [0.26, { R: [1.35, -0.6, 1.2, 0.4, 0.3], L: [1.2, 1.4, -0.2, 0.2, 0.3], side: -0.3, roll: -0.18, turn: 0.35, down: 0.1 }],
      [0.5, { R: [1.3, -0.6, 1.2, 0.45, 0.3], L: [1.15, 1.4, -0.2, 0.25, 0.3], side: -0.28, roll: -0.16, turn: 0.35, down: 0.1 }],
    ],
    steps: [step('R', 0.14, 0.0, -0.5)],
    glow: 'both',
    end: 0.85,
  },
  /**
   * Vanish: a spring backwards out of reach. Down into a crouch, flung back
   * with the arms thrown up (the smoke goes off here), landing low with the
   * blades ready.
   */
  vanish: {
    keys: [
      [0.08, { R: [0.6, 0.3, 0.3, 1.8, -1.3], L: [0.6, 0.3, 0.3, 1.8, -1.3], down: 0.45, lean: 0.4, fwd: 0.05 }, true],
      [0.16, { R: [2.4, 0.55, 0, 0.6, 0.3], L: [2.4, 0.55, 0, 0.6, 0.3], lean: -0.4, down: -0.12, fwd: -0.3, head: -0.25 }],
      [0.3, { R: [1.3, 0.95, 0, 0.8, 0.3], L: [1.3, 0.95, 0, 0.8, 0.3], lean: 0.3, down: 0.6, fwd: -0.12, head: 0.05 }],
      [0.46, { R: [0.8, 0.4, 0.3, 1.6, -1.3], L: [0.8, 0.4, 0.3, 1.6, -1.3], lean: 0.35, down: 0.42 }],
    ],
    free: true,
    glow: 'both',
    end: 0.75,
  },
  /** Veil: the cloak swept open, then drawn round tight as the body sinks into it. */
  veil: {
    keys: [
      [0.1, { R: [1.3, 1.05, 0, 0.6, 0.3], L: [1.3, 1.05, 0, 0.6, 0.3], turn: 0.3, lean: -0.05, head: -0.1 }, true],
      [0.22, { R: [1.25, -0.55, 1.3, 1.7, 0.3], L: [1.25, -0.55, 1.3, 1.7, 0.3], turn: -0.25, down: 0.35, lean: 0.35, head: 0.25 }],
      [0.46, { R: [0.8, -0.3, 1.2, 1.9, 0.3], L: [0.8, -0.3, 1.2, 1.9, 0.3], turn: -0.1, down: 0.55, lean: 0.45, head: 0.2 }],
    ],
    glow: 'both',
    end: 0.75,
  },
  /** Both hands raised together, then drawn down and apart like a curtain falling. */
  nightfall: {
    keys: [
      [0.18, { R: [2.75, -0.15, 0.8, 0.5, 0.3], L: [2.75, -0.15, 0.8, 0.5, 0.3], head: -0.3, lean: -0.12 }, true],
      [0.4, { R: [1.2, 1.25, -0.3, 0.3, 0.8, -0.8], L: [1.2, 1.25, -0.3, 0.3, 0.8, -0.8], head: 0.05, lean: 0.12, down: 0.15 }],
      [0.62, { R: [0.7, 1.3, -0.3, 0.3, 0.8, -0.9], L: [0.7, 1.3, -0.3, 0.3, 0.8, -0.9], head: 0.1, lean: 0.15, down: 0.22 }],
    ],
    contact: 0.4,
    glow: 'both',
    end: 1.0,
  },
  /** Out of the void with the blades crossed at the chest, flung apart in one wide cut. */
  voidWalk: {
    keys: [
      [0.08, { R: [1.25, -0.5, 1.2, 1.8, 0.3], L: [1.25, -0.5, 1.2, 1.8, 0.3], lean: 0.35, down: 0.4, head: 0.1 }, true],
      [0.18, { R: [1.4, 1.2, -0.2, 0.25, 0.3, -0.3], L: [1.4, 1.2, -0.2, 0.25, 0.3, -0.3], lean: 0.15, down: 0.25, fwd: 0.2, head: -0.05 }],
      [0.32, { R: [1.15, 1.35, -0.3, 0.35, 0.3, -0.3], L: [1.15, 1.35, -0.3, 0.35, 0.3, -0.3], lean: 0.1, down: 0.2, fwd: 0.15 }],
    ],
    steps: [step('L', 0.1, 0.45)],
    hit: true,
    blade: true,
    end: 0.62,
  },
  /** Umbral Ambush: up out of a crouch with both blades raised, then plunged down together. */
  umbralAmbush: {
    keys: [
      [0.1, { R: [0.6, -0.3, 1.0, 1.9, 0.3], L: [0.6, -0.3, 1.0, 1.9, 0.3], down: 0.55, lean: 0.45, head: 0.1 }, true],
      [0.22, { R: [2.75, 0.35, -0.4, 1.7, 0, 0.3], L: [2.75, 0.35, -0.4, 1.7, 0, 0.3], down: -0.05, lean: -0.2, head: -0.15, fwd: 0.05 }, true],
      [0.32, { R: PICK_LOW, L: PICK_LOW, down: 0.4, lean: 0.55, fwd: 0.25 }],
      [0.5, { R: [0.9, 0.1, 0.4, 1.1, 0, -0.2], L: [0.9, 0.1, 0.4, 1.1, 0, -0.2], down: 0.45, lean: 0.55, fwd: 0.22 }],
      [0.66, { R: [0.8, 0.2, 0.4, 1.5], L: [0.8, 0.2, 0.4, 1.5], down: 0.25, lean: 0.3, fwd: 0.1 }],
    ],
    steps: [step('L', 0.2, 0.5)],
    contact: 0.32,
    cuts: [0.33],
    hit: true,
    blade: true,
    end: 0.9,
  },
  /**
   * Assassinate: a long, still draw with both blades back by the ribs, both
   * driven in together, held and turned, then ripped out and apart.
   */
  assassinate: {
    keys: [
      [0.12, { R: [0.5, 0.3, -0.1, 2.1, -1.3, -0.2], L: [0.5, 0.3, -0.1, 2.1, -1.3, -0.2], down: 0.2, fwd: -0.1, lean: -0.05 }],
      [0.28, { R: [0.3, 0.45, -0.2, 2.3, -1.3, -0.2], L: [0.3, 0.45, -0.2, 2.3, -1.3, -0.2], down: 0.3, fwd: -0.15, lean: -0.15, head: 0.05 }, true],
      [0.38, { R: [1.5, 0.0, 0.35, 0.1, -1.3, -0.1], L: [1.5, 0.0, 0.35, 0.1, -1.3, -0.1], down: 0.2, fwd: 0.35, lean: 0.35 }],
      [0.6, { R: [1.45, 0.0, 0.6, 0.2, -1.0, -0.1], L: [1.45, 0.0, 0.6, 0.2, -1.0, -0.1], down: 0.22, fwd: 0.32, lean: 0.35 }, true],
      [0.75, { R: [1.0, 0.9, -0.3, 0.6, -1.3, 0.3], L: [1.0, 0.9, -0.3, 0.6, -1.3, 0.3], down: 0.15, fwd: 0.1, lean: 0.1 }],
    ],
    steps: [step('L', 0.3, 0.6)],
    contact: 0.38,
    cuts: [0.39],
    hit: true,
    blade: true,
    end: 1.05,
  },
};

// ---------------------------------------------------------------------------
// Bladework
// ---------------------------------------------------------------------------

const BLADEWORK: Record<string, Spec> = {
  /** Both hands drawn to the hip, then swept flat and open, the knives fanning out. */
  fanOfKnives: {
    keys: [
      [0.14, { R: [0.7, -0.5, 1.2, 1.6, 0.3], L: [0.4, 0.2, 0.6, 1.8, 0.3], turn: 0.65, down: 0.3, lean: 0.2 }, true],
      [0.24, { R: [1.45, 0.75, -0.2, 0.15, 0.6, -0.6], L: [1.45, 0.75, -0.2, 0.15, 0.6, -0.6], turn: -0.15, down: 0.2, lean: 0.15, fwd: 0.12 }],
      [0.42, { R: [1.35, 0.9, -0.2, 0.2, 0.6, -0.5], L: [1.35, 0.9, -0.2, 0.2, 0.6, -0.5], turn: -0.2, down: 0.18, lean: 0.12 }],
    ],
    glow: 'both',
    end: 0.75,
  },
  /**
   * Throwing Spree: knife after knife from the ear, right hand then left,
   * each thrown on its own key (`cuts`), so every knife leaves a hand.
   */
  throwingSpree: {
    keys: [
      [0.07, { R: EAR, L: [1.2, 0.2, 0.4, 1.0], turn: -0.25 }, true],
      [0.12, { R: LOOSE, L: EAR, turn: 0.15, fwd: 0.06 }],
      [0.22, { R: EAR, L: LOOSE, turn: -0.15, fwd: 0.06 }],
      [0.32, { R: LOOSE, L: EAR, turn: 0.15, fwd: 0.08 }],
      [0.42, { R: EAR, L: LOOSE, turn: -0.15, fwd: 0.08 }],
      [0.52, { R: LOOSE, L: EAR, turn: 0.15, fwd: 0.08 }],
      [0.62, { R: [1.4, 0.1, 0.3, 0.5, 0, -0.4], L: LOOSE, turn: -0.12, fwd: 0.08 }],
      [0.76, { R: [1.2, 0.1, 0.3, 0.8, 0, -0.3], L: [1.25, 0.1, 0.3, 0.7, 0, -0.3], fwd: 0.04 }],
    ],
    contact: 0.12,
    cuts: [0.22, 0.32, 0.42, 0.52, 0.62],
    glow: 'both',
    end: 0.95,
  },
  /**
   * Precise Cut: wound out wide, a held beat, then one flat draw cut across
   * and carried through. With two blades the off blade answers across the
   * other way.
   */
  preciseCut: {
    keys: [
      [0.13, { R: RIP_WIND, L: BAL_WIND, turn: -0.6, lean: -0.02, fwd: -0.06, down: 0.05 }, true],
      [0.22, { R: RIP_HIT, L: BAL_HIT, turn: 0.25, lean: 0.2, fwd: 0.14, down: 0.1 }],
      [0.31, { R: RIP_FOLLOW, L: BAL_FOLLOW, turn: 0.6, lean: 0.25, fwd: 0.12, down: 0.12 }],
      [0.4, { R: [1.05, -0.45, 1.3, 1.15], L: BAL_FOLLOW, turn: 0.55, lean: 0.22, fwd: 0.1, down: 0.12 }],
      [0.54, { R: [0.95, -0.2, 1.0, 1.5], L: [0.5, 0.4, 0.1, 1.0, 0.2], turn: 0.3, lean: 0.12, fwd: 0.05, down: 0.08 }],
    ],
    alt: {
      dual: [
        { R: RIP_WIND, L: COIL, turn: -0.6, lean: -0.02, fwd: -0.06, down: 0.05 },
        { R: RIP_HIT, L: COIL, turn: 0.25, lean: 0.2, fwd: 0.14, down: 0.1 },
        { R: RIP_FOLLOW, L: RIP_WIND, turn: 0.45, lean: 0.22, fwd: 0.12, down: 0.12 },
        { R: [1.0, -0.2, 1.0, 1.4], L: RIP_HIT, turn: -0.2, lean: 0.2, fwd: 0.14, down: 0.12 },
        { R: COIL, L: RIP_FOLLOW, turn: -0.45, lean: 0.18, fwd: 0.1, down: 0.1 },
      ],
    },
    steps: [step('L', 0.1, 0.35)],
    contact: 0.22,
    cuts: [0.4],
    hit: true,
    blade: true,
    end: 0.8,
  },
  /** Cripple Tendon: dropped into a deep crouch, one low sweep across the back of the legs. */
  crippleTendon: {
    keys: [
      [0.14, { R: LOW_WIND, L: BAL_WIND, turn: -0.7, lean: 0.3, down: 0.3, fwd: -0.05 }, true],
      [0.24, { R: LOW_HIT, L: [0.6, 0.9, 0, 0.4, 0.2], turn: 0.35, lean: 0.65, down: 0.7, fwd: 0.2 }],
      [0.38, { R: LOW_FOLLOW, L: [0.5, 0.9, 0, 0.5, 0.2], turn: 0.65, lean: 0.6, down: 0.65, fwd: 0.15 }],
      [0.52, { R: [0.7, -0.2, 0.9, 1.4], L: BAL_FOLLOW, turn: 0.35, lean: 0.35, down: 0.35, fwd: 0.08 }],
    ],
    alt: {
      dual: [
        { R: LOW_WIND, L: COIL, turn: -0.7, lean: 0.3, down: 0.3, fwd: -0.05 },
        { R: LOW_HIT, L: LOW_WIND, turn: 0.35, lean: 0.65, down: 0.7, fwd: 0.2 },
        { R: [0.7, -0.2, 0.9, 1.4], L: LOW_HIT, turn: -0.2, lean: 0.62, down: 0.68, fwd: 0.18 },
        { R: COIL, L: LOW_FOLLOW, turn: -0.45, lean: 0.35, down: 0.35, fwd: 0.08 },
      ],
    },
    steps: [step('L', 0.1, 0.45, 0.1)],
    contact: 0.24,
    cuts: [0.38],
    hit: true,
    blade: true,
    end: 0.8,
  },
  /**
   * Scissor Cut: two crossing cuts you can see. One blade: down across
   * (forehand), carried over the far shoulder, and back out (backhand). Two
   * blades: both raised, the right cut down, then the left across it.
   */
  doubleStrike: {
    keys: [
      [0.13, { R: HIGH, L: BAL_WIND, turn: -0.55, lean: -0.08, fwd: -0.05 }, true],
      [0.24, { R: DOWN_ACROSS, L: BAL_HIT, turn: 0.35, lean: 0.22, fwd: 0.12, down: 0.1 }],
      [0.32, { R: [1.5, -0.6, 1.3, 1.8, 0, 0.2], L: BAL_FOLLOW, turn: 0.6, lean: 0.18, fwd: 0.1, down: 0.1 }],
      [0.4, { R: [1.45, 0.85, -0.3, 0.5, 0, -0.2], L: BAL_HIT, turn: -0.4, lean: 0.2, fwd: 0.14, down: 0.12 }],
      [0.55, { R: [1.1, 1.0, -0.4, 0.9, 0, -0.2], L: BAL_FOLLOW, turn: -0.55, lean: 0.18, fwd: 0.1, down: 0.1 }],
    ],
    alt: {
      dual: [
        { R: HIGH, L: HIGH, turn: -0.3, lean: -0.1, fwd: -0.05 },
        { R: DOWN_ACROSS, L: HIGH, turn: 0.3, lean: 0.2, fwd: 0.12, down: 0.1 },
        { R: DOWN_THROUGH, L: [2.1, 0.6, -0.4, 1.6, 0, 0.3], turn: 0.15, lean: 0.18, fwd: 0.1, down: 0.1 },
        { R: [1.0, -0.3, 1.0, 1.3], L: DOWN_ACROSS, turn: -0.3, lean: 0.22, fwd: 0.14, down: 0.12 },
        { R: COIL, L: DOWN_THROUGH, turn: -0.4, lean: 0.18, fwd: 0.1, down: 0.1 },
      ],
    },
    steps: [step('L', 0.1, 0.35)],
    contact: 0.24,
    cuts: [0.4],
    hit: true,
    blade: true,
    end: 0.85,
  },
  /** Razor Dash: down the lane in one spin, blades held out. */
  whirlingBlades: {
    keys: [
      [0.05, { R: IN, L: IN, lean: 0.4, down: 0.3, turn: -0.4 }, true],
      [0.12, { R: WIDE, L: WIDE, lean: 0.35, down: 0.25, spin: Q }],
      [0.22, { R: WIDE_HIGH, L: WIDE, lean: 0.3, down: 0.25, spin: Q * 2, roll: 0.1 }],
      [0.32, { R: WIDE, L: WIDE_HIGH, lean: 0.3, down: 0.25, spin: Q * 3, roll: -0.1 }],
      [0.42, { R: WIDE, L: WIDE, lean: 0.3, down: 0.22, spin: Q * 4 }],
      [0.5, { R: IN, L: IN, lean: 0.2, down: 0.15, spin: Q * 4 }],
    ],
    contact: 0.12,
    hit: true,
    blade: true,
    free: true,
    end: 0.6,
  },
  /**
   * Steel Waltz: five cuts round one enemy, right and left in turn (high,
   * high, low, rising), then both blades raised and driven in. The hero is
   * carried a quarter turn round it between cuts (`rogue/RogueMoves.ts`).
   */
  steelWaltz: {
    keys: [
      [0.1, { R: HIGH, L: COIL, turn: -0.5, down: 0.15 }, true],
      [0.2, { R: DOWN_ACROSS, L: COIL, turn: 0.35, lean: 0.2, fwd: 0.12, down: 0.2 }],
      [0.28, { R: COIL, L: HIGH, turn: 0.45, down: 0.15 }],
      [0.36, { R: COIL, L: DOWN_ACROSS, turn: -0.35, lean: 0.2, fwd: 0.12, down: 0.2 }],
      [0.44, { R: LOW_WIND, L: COIL, turn: -0.55, lean: 0.3, down: 0.3 }],
      [0.52, { R: LOW_HIT, L: COIL, turn: 0.35, lean: 0.5, down: 0.45, fwd: 0.12 }],
      [0.6, { R: COIL, L: LOW_WIND, turn: 0.55, lean: 0.35, down: 0.35 }],
      [0.68, { R: COIL, L: [1.6, -0.1, 0.8, 0.5, 0, -0.3], turn: -0.3, lean: 0.1, down: 0.15, fwd: 0.1 }],
      [0.78, { R: PICK_HIGH, L: PICK_HIGH, lean: -0.15, down: -0.05 }, true],
      [0.86, { R: PICK_LOW, L: PICK_LOW, lean: 0.5, down: 0.4, fwd: 0.2 }],
      [1.05, { R: [0.9, 0.15, 0.4, 1.2, 0, -0.2], L: [0.9, 0.15, 0.4, 1.2, 0, -0.2], lean: 0.45, down: 0.4, fwd: 0.18 }],
    ],
    contact: 0.2,
    cuts: [0.36, 0.52, 0.68, 0.86],
    hit: true,
    blade: true,
    free: true,
    end: 1.3,
  },
};

defineGestures({ ...VENOM, ...SHADOWCRAFT, ...BLADEWORK });

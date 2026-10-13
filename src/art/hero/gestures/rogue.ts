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
import { defineGestures, type G, type Spec, step } from '../SkillActions';

/** A blade punched straight out at the shoulder, the point leading. */
const STAB: Arm = [1.55, 0.05, 0.35, 0.05, -1.3];
/** A blade coiled back at the chest, ready to strike. */
const COIL: Arm = [0.85, 0.15, 0.6, 2.2, -1.3];
/** A blade lifted high for an ice-pick stab. */
const PICK_HIGH: Arm = [2.5, 0.45, -0.35, 1.9, 0, 0.2];
/** The ice-pick stab come down. */
const PICK_LOW: Arm = [1.25, 0.1, 0.3, 1.0, 0, -0.2];

/** One key of a flurry: the leading hand out wide, the other tucked, trunk turned. */
function whirl(t: number, dir: 1 | -1, high: boolean, down = 0.2): [number, G] {
  const out: Arm = [high ? 1.6 : 1.1, 1.3, 0.1, 0.25, 0.3];
  const tuck: Arm = [0.9, -0.2, 1.1, 1.8, 0.3];
  return [t, { R: dir > 0 ? out : tuck, L: dir > 0 ? tuck : out, turn: -1.05 * dir, down, lean: 0.25, roll: 0.12 * dir }];
}

// ---------------------------------------------------------------------------
// Venom
// ---------------------------------------------------------------------------

const VENOM: Record<string, Spec> = {
  /** Coiled low like a snake, then one blade darts out and up at the throat. */
  viperStrike: {
    hit: true,
    keys: [
      [0.12, { R: COIL, L: [0.8, 0.1, 0.6, 2.0, -1.3], turn: -0.35, lean: 0.38, down: 0.38 }, true],
      [0.2, { R: [1.7, 0.05, 0.3, 0.05, -1.3, -0.3], L: [0.6, 0.3, 0.4, 1.8, -1.3], turn: 0.3, lean: 0.3, fwd: 0.45, down: 0.2 }],
      [0.36, { R: [1.6, 0.05, 0.3, 0.15, -1.3, -0.2], L: [0.6, 0.3, 0.4, 1.8, -1.3], turn: 0.25, lean: 0.28, fwd: 0.4, down: 0.2 }],
    ],
    steps: [step('L', 0.08, 0.85)],
    end: 0.66,
  },
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
  /** Down low and turning, blades out wide one after the other: eight cuts all round. */
  deathLotus: {
    hit: true,
    keys: [whirl(0.06, 1, true, 0.3), whirl(0.13, -1, false, 0.35), whirl(0.2, 1, false, 0.4), whirl(0.27, -1, true, 0.35), whirl(0.34, 1, true, 0.3), whirl(0.42, -1, false, 0.35), [0.55, { R: [0.6, 1.2, 0, 0.4, 0.3], L: [0.6, 1.2, 0, 0.4, 0.3], down: 0.45, lean: 0.4 }]],
    steps: [step('R', 0.08, 0.1, -0.35), step('L', 0.24, 0.1, 0.35), step('R', 0.4, 0.0, -0.2)],
    contact: 0.13,
    end: 0.85,
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
  /** Gone from a crouch with the blades crossed; arrives stabbing down into a back. */
  shadowStep: {
    keys: [
      [0.06, { R: [1.0, -0.4, 1.1, 1.9, 0.3], L: [1.0, -0.4, 1.1, 1.9, 0.3], lean: 0.45, down: 0.5 }, true],
      [0.12, { R: PICK_HIGH, L: PICK_HIGH, lean: -0.1, down: 0.05 }],
      [0.2, { R: PICK_LOW, L: PICK_LOW, lean: 0.45, down: 0.3, fwd: 0.15 }],
      [0.34, { R: PICK_LOW, L: PICK_LOW, lean: 0.42, down: 0.28, fwd: 0.12 }],
    ],
    contact: 0.2,
    glow: 'both',
    end: 0.6,
  },
  /** A hand drawn down over the face like a cowl, sinking into a sneak. */
  veil: {
    keys: [
      [0.14, { L: [2.45, -0.15, 1.0, 2.3, 0.4], head: -0.1, down: -0.03 }, true],
      [0.3, { L: [1.15, -0.3, 1.25, 2.45, 0.4], R: [0.5, 0.3, 0.3, 1.6, -1.3], head: 0.25, lean: 0.35, down: 0.45 }],
      [0.6, { L: [1.1, -0.3, 1.25, 2.4, 0.4], R: [0.5, 0.3, 0.3, 1.6, -1.3], head: 0.22, lean: 0.33, down: 0.43 }],
    ],
    glow: 'left',
    end: 0.95,
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
  /** Sprung up out of a deep crouch, both blades driven down from above. */
  umbralAmbush: {
    hit: true,
    keys: [
      [0.14, { R: [0.5, 0.4, 0.2, 1.8, -1.3], L: [0.5, 0.4, 0.2, 1.8, -1.3], lean: 0.55, down: 0.85 }, true],
      [0.22, { R: PICK_HIGH, L: PICK_HIGH, lean: -0.15, down: -0.18, head: -0.1 }],
      [0.3, { R: PICK_LOW, L: PICK_LOW, lean: 0.55, down: 0.4, fwd: 0.4 }],
      [0.46, { R: [1.0, 0.1, 0.35, 1.1, 0, -0.2], L: [1.0, 0.1, 0.35, 1.1, 0, -0.2], lean: 0.55, down: 0.42, fwd: 0.38 }],
    ],
    steps: [step('L', 0.18, 0.75, 0, 0.3), step('R', 0.2, 0.55, 0, 0.32)],
    contact: 0.3,
    end: 0.8,
  },
  /** A swirl of the cloak: arms wrapped across, a half turn, then low and still. */
  vanish: {
    keys: [
      [0.1, { R: [1.2, 1.1, 0, 0.5, 0.3], L: [1.2, 1.1, 0, 0.5, 0.3], turn: -0.6, lean: -0.05 }, true],
      [0.2, { R: [1.2, -0.6, 1.3, 1.6, 0.3], L: [1.2, -0.6, 1.3, 1.6, 0.3], turn: 0.7, down: 0.25, head: 0.2 }],
      [0.34, { R: [0.5, 0.3, 0.3, 1.7, -1.3], L: [0.5, 0.3, 0.3, 1.7, -1.3], turn: 0.3, down: 0.65, lean: 0.45, head: 0.15 }],
    ],
    steps: [step('L', 0.12, -0.4, 0.15)],
    glow: 'both',
    end: 0.7,
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
  /** A sprinter's start: low and coiled, then flung forward with the arms trailing. */
  voidWalk: {
    keys: [
      [0.06, { R: [1.3, 0.2, 0.4, 1.4, -1.3], L: [-0.4, 0.4, 0, 0.6, -1.3], lean: 0.55, down: 0.55, turn: -0.2 }, true],
      [0.14, { R: [-0.65, 0.45, 0, 0.3, -1.3], L: [-0.65, 0.45, 0, 0.3, -1.3], lean: 0.7, down: 0.3, fwd: 0.35 }],
      [0.28, { R: [-0.5, 0.45, 0, 0.4, -1.3], L: [-0.5, 0.45, 0, 0.4, -1.3], lean: 0.6, down: 0.28, fwd: 0.3 }],
    ],
    glow: 'both',
    end: 0.5,
  },
  /** The free hand seizes them by the collar and hauls them onto the blade. */
  assassinate: {
    hit: true,
    keys: [
      [0.14, { L: [1.6, 0.0, 0.3, 0.15, 0.3], R: [0.55, 0.3, 0.4, 2.1, -1.3], fistL: 0.3, turn: 0.3, lean: 0.15, fwd: 0.2 }, true],
      [0.24, { L: [1.0, -0.2, 0.9, 1.8, 0.3], R: STAB, fistL: 1, turn: -0.4, lean: 0.3, fwd: 0.35, down: 0.15 }],
      [0.42, { L: [0.95, -0.2, 0.9, 1.85, 0.3], R: [1.5, 0.05, 0.35, 0.15, -1.3, 0.3], fistL: 1, turn: -0.45, lean: 0.32, fwd: 0.32, down: 0.15 }],
    ],
    steps: [step('L', 0.08, 0.65)],
    end: 0.8,
  },
};

// ---------------------------------------------------------------------------
// Bladework
// ---------------------------------------------------------------------------

const BLADEWORK: Record<string, Spec> = {
  /** Economy itself: a flat flick of the wrist across the throat, nothing wasted. */
  preciseCut: {
    hit: true,
    keys: [
      [0.08, { R: [1.35, -0.35, 1.1, 1.05, -1.3], turn: 0.15 }, true],
      [0.14, { R: [1.45, 0.65, -0.2, 0.2, -1.3, 0.3], turn: -0.12, fwd: 0.06 }],
      [0.26, { R: [1.35, 0.75, -0.2, 0.3, -1.3, 0.3], turn: -0.15, fwd: 0.05 }],
    ],
    end: 0.45,
  },
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
  /** Dropped to a knee and a blade hooked low and back across the hamstring. */
  crippleTendon: {
    hit: true,
    keys: [
      [0.12, { R: [1.0, -0.4, 1.1, 1.6, -1.3], L: [0.9, 0.5, 0.2, 1.4, -1.3], turn: 0.45, lean: 0.3, down: 0.5 }, true],
      [0.22, { R: [0.55, 0.9, 0.1, 0.2, -1.3, 0.4], L: [0.9, 0.5, 0.2, 1.4, -1.3], turn: -0.55, lean: 0.55, down: 1.0 }],
      [0.4, { R: [0.2, 1.0, 0.1, 0.3, -1.3, 0.4], L: [0.9, 0.5, 0.2, 1.4, -1.3], turn: -0.7, lean: 0.52, down: 0.98 }],
    ],
    steps: [step('L', 0.08, 0.6, 0.15)],
    end: 0.8,
  },
  /** Right, then left: two stabs punched straight out off the hips. */
  doubleStrike: {
    hit: true,
    keys: [
      [0.08, { R: COIL, L: COIL, turn: 0.3, down: 0.12 }, true],
      [0.14, { R: STAB, L: COIL, turn: -0.4, lean: 0.15, fwd: 0.2, down: 0.12 }],
      [0.24, { R: COIL, L: STAB, turn: 0.4, lean: 0.18, fwd: 0.28, down: 0.14 }],
      [0.38, { R: COIL, L: [1.45, 0.05, 0.35, 0.15, -1.3], turn: 0.35, lean: 0.15, fwd: 0.25, down: 0.12 }],
    ],
    steps: [step('L', 0.06, 0.5)],
    contact: 0.14,
    end: 0.62,
  },
  /** A spinning dash: arms out at full stretch, the body whipping round and round. */
  whirlingBlades: {
    hit: true,
    keys: [whirl(0.05, 1, true, 0.15), whirl(0.13, -1, true, 0.15), whirl(0.21, 1, true, 0.15), whirl(0.29, -1, true, 0.15)],
    contact: 0.13,
    end: 0.45,
  },
  /** Knife after knife, right hand then left, thrown from the ear as fast as they come. */
  throwingSpree: {
    keys: [
      [0.06, { R: [2.1, 0.3, 0.3, 2.3, 0, 0.5], L: [1.2, 0.2, 0.4, 1.0], turn: -0.25 }, true],
      [0.11, { R: [1.6, 0.05, 0.3, 0.15, 0, -0.6], L: [2.1, 0.3, 0.3, 2.3, 0, 0.5], turn: 0.15, fwd: 0.06 }],
      [0.17, { R: [2.1, 0.3, 0.3, 2.3, 0, 0.5], L: [1.6, 0.05, 0.3, 0.15, 0, -0.6], turn: -0.15, fwd: 0.06 }],
      [0.23, { R: [1.6, 0.05, 0.3, 0.15, 0, -0.6], L: [2.1, 0.3, 0.3, 2.3, 0, 0.5], turn: 0.15, fwd: 0.08 }],
      [0.29, { R: [2.1, 0.3, 0.3, 2.3, 0, 0.5], L: [1.6, 0.05, 0.3, 0.15, 0, -0.6], turn: -0.15, fwd: 0.08 }],
      [0.36, { R: [1.55, 0.05, 0.3, 0.25, 0, -0.5], L: [1.5, 0.05, 0.3, 0.25, 0, -0.5], fwd: 0.06 }],
    ],
    contact: 0.11,
    glow: 'both',
    end: 0.6,
  },
};

defineGestures({ ...VENOM, ...SHADOWCRAFT, ...BLADEWORK });

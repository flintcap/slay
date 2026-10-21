/**
 * The Shapeshifter's gestures: one per active skill. See `../SkillActions.ts`
 * for how a gesture is written.
 *
 * Every tree skill is used in its form, so these are a beast's moves on a
 * man's skeleton: the cat low, quick and two-pawed; the wolf with the head
 * driven in to bite and the arms hooking to hold; the bear wide, heavy and
 * from the shoulder. Fingers are claws: open (fist 0) to rake, curled (fist
 * 0.6) to hook, never a closed fist.
 */
import type { Arm } from '../Actions';
import { defineGestures, type G, type Spec, step } from '../SkillActions';

// ---------------------------------------------------------------------------
// Shared places
// ---------------------------------------------------------------------------

/** A paw cocked high by the ear, claws open. */
const PAW_HIGH: Arm = [2.3, 0.7, -0.4, 1.7, 0.2, 0.5];
/** A paw dragged down across the body, past the far hip. */
const PAW_THROUGH: Arm = [0.7, -0.35, 0.8, 0.5, 0.3, -0.5];
/** A paw held out low in front, claws down (the cat's guard). */
const PAW_LOW: Arm = [1.05, 0.35, 0.3, 0.9, 0.6, 0.4];
/** A forearm hooked in to hold something against the chest. */
const HOOK: Arm = [1.2, 0.2, 0.9, 1.9, 0.4, 0.6];
/** An arm flung wide to the side, claws out. */
const WIDE: Arm = [0.6, 1.5, 0.1, 0.4, 0.5, -0.3];
/** Both arms flung up and back (a roar, a howl). */
const FLUNG: Arm = [2.6, 0.9, -0.6, 0.5, 0.2, -0.4];
/** An arm reaching straight down to the floor. */
const FLOOR: Arm = [1.0, 0.25, 0.2, 0.2, 0.4, 0.9];

const both = (a: Arm, extra: Omit<G, 'R' | 'L'> = {}): G => ({ R: a, L: a, ...extra });

// ---------------------------------------------------------------------------
// The forms
// ---------------------------------------------------------------------------

const FORMS: Record<string, Spec> = {
  /** Shrinks into a crouch, hands to the floor, then rises the cat with the back arched. */
  catForm: {
    keys: [
      [0.14, { ...both(FLOOR), lean: 0.7, down: 0.55, head: 0.3, fistR: 0, fistL: 0 }, true],
      [0.32, { ...both(PAW_LOW), lean: 0.35, down: 0.25, roll: 0.06, head: -0.2, fistR: 0, fistL: 0 }],
      [0.55, { ...both(PAW_LOW), lean: 0.28, down: 0.2, head: -0.1 }],
    ],
    glow: 'both',
    end: 0.85,
  },
  /** Hands to the knees, the back heaves twice, then the head comes up snarling. */
  wolfForm: {
    keys: [
      [0.12, { R: [0.7, 0.35, 0.3, 0.7, 0.4, 0.3], L: [0.7, 0.35, 0.3, 0.7, 0.4, 0.3], lean: 0.55, down: 0.3, head: 0.35 }, true],
      [0.24, { R: [0.8, 0.4, 0.3, 0.6, 0.4, 0.3], L: [0.8, 0.4, 0.3, 0.6, 0.4, 0.3], lean: 0.75, down: 0.38, head: 0.45, roll: 0.05 }],
      [0.36, { R: [0.7, 0.35, 0.3, 0.7, 0.4, 0.3], L: [0.7, 0.35, 0.3, 0.7, 0.4, 0.3], lean: 0.5, down: 0.3, head: 0.3 }],
      [0.52, { R: [1.2, 0.6, 0.2, 1.3, 0.4, 0.5], L: [1.2, 0.6, 0.2, 1.3, 0.4, 0.5], lean: 0.25, down: 0.15, head: -0.35, fistR: 0.5, fistL: 0.5 }],
    ],
    glow: 'both',
    contact: 0.36,
    end: 0.9,
  },
  /** Arms wrapped round the chest, then thrown wide as the body swells and the feet stamp. */
  bearForm: {
    keys: [
      [0.16, { ...both([1.0, -0.4, 1.1, 2.0, 0.4]), lean: 0.3, down: 0.25, head: 0.25 }, true],
      [0.36, { ...both(WIDE), lean: -0.15, down: 0.05, head: -0.35, fistR: 0.3, fistL: 0.3 }],
      [0.6, { ...both([0.8, 1.1, 0.2, 0.9, 0.4]), lean: 0.1, down: 0.15 }],
    ],
    steps: [step('R', 0.32, 0.0, 0.12), step('L', 0.42, 0.0, -0.12)],
    contact: 0.36,
    glow: 'both',
    end: 0.95,
  },
};

// ---------------------------------------------------------------------------
// Feral (the black cat)
// ---------------------------------------------------------------------------

const FERAL: Record<string, Spec> = {
  /**
   * Right paw, left paw, then both up and dragged down crossed: three short
   * rakes, low and fast, one blow on each (`cuts`).
   */
  rake: {
    hit: true,
    keys: [
      [0.06, { R: PAW_HIGH, L: PAW_LOW, turn: -0.35, lean: 0.35, down: 0.25, fistR: 0 }, true],
      [0.12, { R: PAW_THROUGH, L: PAW_HIGH, turn: 0.3, lean: 0.42, down: 0.28, fistR: 0, fistL: 0 }],
      [0.22, { R: PAW_HIGH, L: PAW_THROUGH, turn: -0.3, lean: 0.42, down: 0.28, fistL: 0 }],
      [0.27, { ...both(PAW_HIGH), turn: 0, lean: 0.3, down: 0.22, head: -0.15, fistR: 0, fistL: 0 }],
      [0.34, { ...both(PAW_THROUGH), turn: 0, lean: 0.55, down: 0.36, head: 0.1, fistR: 0, fistL: 0 }],
    ],
    steps: [step('R', 0.04, 0.25), step('L', 0.3, 0.12)],
    contact: 0.12,
    cuts: [0.22, 0.34],
    end: 0.58,
  },
  /** Coiled right down on the haunches, then both paws thrown forward and up into the leap. */
  pounce: {
    hit: true,
    keys: [
      [0.12, { ...both(FLOOR), lean: 0.65, down: 0.65, head: -0.2 }, true],
      [0.24, { ...both([2.2, 0.4, -0.2, 0.6, 0.3, 0.5]), lean: 0.2, down: -0.05, fwd: 0.3, fistR: 0, fistL: 0 }],
      [0.4, { ...both([1.2, 0.35, 0.3, 0.5, 0.3, 0.8]), lean: 0.55, down: 0.45, fwd: 0.2, fistR: 0, fistL: 0 }],
    ],
    contact: 0.4,
    end: 0.75,
  },
  /** Sinks down low, shoulders rolling, one paw set down soft in front of the other. */
  slink: {
    keys: [
      [0.18, { R: [0.95, 0.3, 0.3, 0.8, 0.6, 0.5], L: [0.7, 0.35, 0.3, 1.1, 0.6, 0.5], lean: 0.55, down: 0.5, roll: 0.1, head: -0.25 }, true],
      [0.4, { R: [0.7, 0.35, 0.3, 1.1, 0.6, 0.5], L: [0.95, 0.3, 0.3, 0.8, 0.6, 0.5], lean: 0.55, down: 0.52, roll: -0.1, head: -0.25 }],
      [0.6, { ...both(PAW_LOW), lean: 0.45, down: 0.4, head: -0.2 }],
    ],
    steps: [step('L', 0.2, 0.18), step('R', 0.42, 0.18)],
    glow: 'both',
    contact: 0.2,
    end: 0.85,
  },
  /** Drops to one side and sweeps the far paw low along the floor, at knee height. */
  hamstring: {
    hit: true,
    keys: [
      [0.1, { R: [0.9, 1.3, 0.0, 0.5, 0.4, 0.2], L: FLOOR, turn: -0.5, lean: 0.55, down: 0.6, side: 0.12, fistR: 0 }, true],
      [0.2, { R: [0.55, -0.3, 0.6, 0.25, 0.5, -0.3], L: FLOOR, turn: 0.45, lean: 0.6, down: 0.62, side: -0.05, fistR: 0 }],
      [0.36, { R: [0.5, -0.35, 0.7, 0.35, 0.5, -0.2], L: PAW_LOW, turn: 0.4, lean: 0.5, down: 0.5 }],
    ],
    steps: [step('L', 0.06, 0.15, 0.2)],
    contact: 0.2,
    end: 0.65,
  },
  /** Both paws hooked over the shoulders of the prey, the head driven in and wrenched aside. */
  throatTear: {
    hit: true,
    keys: [
      [0.1, { ...both([1.9, 0.5, -0.2, 1.4, 0.3, 0.6]), lean: 0.2, fwd: 0.1, head: -0.3, fistR: 0.6, fistL: 0.6 }, true],
      [0.2, { ...both(HOOK), lean: 0.45, fwd: 0.25, head: 0.45, fistR: 0.7, fistL: 0.7 }],
      [0.34, { R: HOOK, L: [1.0, 0.6, 0.4, 1.4, 0.4], turn: 0.45, roll: 0.2, lean: 0.4, head: 0.35, fistR: 0.7 }],
    ],
    steps: [step('R', 0.08, 0.3)],
    contact: 0.2,
    end: 0.7,
  },
  /** On the toes, turning: one paw, then the other, cutting from behind its own shoulder. */
  killingDance: {
    hit: true,
    keys: [
      [0.06, { R: PAW_HIGH, L: WIDE, turn: -0.7, lean: 0.3, down: 0.2, roll: -0.1, fistR: 0 }, true],
      [0.12, { R: PAW_THROUGH, L: PAW_HIGH, turn: 0.6, lean: 0.38, down: 0.22, roll: 0.12, fistR: 0, fistL: 0 }],
      [0.2, { R: WIDE, L: PAW_THROUGH, turn: -0.6, lean: 0.38, down: 0.22, roll: -0.12, fistL: 0 }],
      [0.3, { ...both(PAW_LOW), lean: 0.4, down: 0.3 }],
    ],
    steps: [step('R', 0.05, 0.0, -0.3), step('L', 0.15, 0.0, 0.3)],
    contact: 0.12,
    end: 0.5,
  },
  /** Rises tall for once, chin up to the dark, arms spread low and open, then down to the hunt. */
  nightHunt: {
    keys: [
      [0.2, { R: [0.5, 0.9, 0.1, 0.3, 0.6, -0.3], L: [0.5, 0.9, 0.1, 0.3, 0.6, -0.3], lean: -0.2, down: -0.05, head: -0.55 }, true],
      [0.44, { R: [0.6, 1.0, 0.1, 0.3, 0.6, -0.3], L: [0.6, 1.0, 0.1, 0.3, 0.6, -0.3], lean: -0.22, head: -0.6 }],
      [0.68, { ...both(PAW_LOW), lean: 0.5, down: 0.45, head: -0.15 }],
    ],
    glow: 'both',
    contact: 0.3,
    end: 1.0,
  },
};

// ---------------------------------------------------------------------------
// Teeth (the grey wolf)
// ---------------------------------------------------------------------------

const TEETH: Record<string, Spec> = {
  /** Arms held back out of the way, the head darts in and snaps, then pulls back. */
  snap: {
    hit: true,
    keys: [
      [0.06, { ...both([0.4, 0.5, 0.1, 0.9, 0.4]), lean: 0.2, head: -0.25 }, true],
      [0.12, { ...both([0.5, 0.55, 0.1, 0.8, 0.4]), lean: 0.6, fwd: 0.18, head: 0.5 }],
      [0.24, { ...both([0.45, 0.5, 0.1, 0.9, 0.4]), lean: 0.3, fwd: 0.05, head: 0.1 }],
    ],
    contact: 0.12,
    end: 0.42,
  },
  /** The head thrown back, the chest out, the arms dropped behind: a long howl. */
  huntingHowl: {
    keys: [
      [0.16, { ...both([0.3, 0.4, -0.2, 0.6, 0.4]), lean: 0.35, down: 0.15, head: 0.4 }, true],
      [0.36, { ...both([-0.45, 0.45, -0.2, 0.4, 0.4]), lean: -0.45, down: 0.05, head: -0.85 }],
      [0.85, { ...both([-0.4, 0.45, -0.2, 0.45, 0.4]), lean: -0.4, down: 0.05, head: -0.8 }],
    ],
    glow: 'both',
    contact: 0.36,
    end: 1.15,
  },
  /** Leaning into the run, arms trailing, then everything thrown forward behind the jaws. */
  lunge: {
    hit: true,
    keys: [
      [0.08, { ...both([-0.3, 0.4, 0.0, 0.5, 0.4]), lean: 0.65, down: 0.3, head: -0.2 }, true],
      [0.2, { ...both([1.3, 0.3, 0.4, 1.0, 0.4, 0.5]), lean: 0.55, fwd: 0.3, head: 0.45, fistR: 0.5, fistL: 0.5 }],
      [0.34, { ...both([1.1, 0.35, 0.4, 1.2, 0.4, 0.5]), lean: 0.4, fwd: 0.15, head: 0.2 }],
    ],
    steps: [step('L', 0.04, 0.35), step('R', 0.14, 0.35)],
    contact: 0.2,
    end: 0.6,
  },
  /** Both arms clamp the prey in, then the whole upper body wrenches it left and right. */
  worry: {
    hit: true,
    keys: [
      [0.08, { ...both([1.5, 0.6, 0.2, 1.2, 0.4, 0.5]), lean: 0.4, fwd: 0.15, head: 0.3, fistR: 0.6, fistL: 0.6 }, true],
      [0.16, { ...both(HOOK), lean: 0.45, fwd: 0.2, head: 0.45, fistR: 0.7, fistL: 0.7 }],
      [0.3, { ...both(HOOK), turn: 0.55, roll: 0.25, lean: 0.4, head: 0.4 }],
      [0.46, { ...both(HOOK), turn: -0.55, roll: -0.25, lean: 0.4, head: 0.4 }],
      [0.62, { ...both(HOOK), turn: 0.5, roll: 0.2, lean: 0.4, head: 0.4 }],
      [0.78, { R: WIDE, L: HOOK, turn: -0.7, roll: -0.15, lean: 0.25, head: 0.2 }],
    ],
    contact: 0.16,
    // Three more shakes, then the throw.
    cuts: [0.3, 0.46, 0.62, 0.78],
    end: 1.05,
  },
  /** Crouched, one arm sweeping the dark round in a beckon, then a short bark at the floor. */
  callThePack: {
    keys: [
      [0.18, { R: [1.0, 1.4, 0.0, 0.4, 0.6, 0.2], L: PAW_LOW, turn: -0.5, lean: 0.5, down: 0.4 }, true],
      [0.38, { R: [1.0, -0.2, 0.7, 1.6, 0.6, 0.6], L: PAW_LOW, turn: 0.35, lean: 0.5, down: 0.4, fistR: 0.6 }],
      [0.52, { ...both([0.6, 0.45, 0.2, 0.7, 0.4]), lean: 0.65, down: 0.42, head: 0.5 }],
    ],
    steps: [step('R', 0.14, 0.0, -0.15)],
    glow: 'right',
    contact: 0.38,
    end: 0.9,
  },
  /** Hunched over, hands to the belly, a low wet howl that rises with the shoulders. */
  bloodHowl: {
    keys: [
      [0.16, { ...both([0.9, -0.3, 1.0, 1.9, 0.4]), lean: 0.6, down: 0.35, head: 0.4 }, true],
      [0.42, { ...both([0.9, -0.2, 0.9, 1.7, 0.4]), lean: 0.05, down: 0.15, head: -0.6 }],
      [0.8, { ...both([0.8, -0.1, 0.8, 1.6, 0.4]), lean: 0.0, down: 0.12, head: -0.55 }],
    ],
    glow: 'both',
    contact: 0.42,
    end: 1.1,
  },
  /**
   * Down low and turning: the head snaps in to the right, the left, the right,
   * the left, then straight in, the shoulders turning with each bite and the
   * paws hooked to hold. One bite on each (`cuts`).
   */
  ravening: {
    hit: true,
    keys: [
      [0.08, { ...both([0.5, 0.5, 0.15, 1.0, 0.4]), lean: 0.6, down: 0.42, head: -0.25 }, true],
      [0.14, { R: HOOK, L: [0.6, 0.6, 0.2, 0.9, 0.4], turn: 0.5, roll: 0.14, lean: 0.75, down: 0.45, fwd: 0.18, head: 0.5, fistR: 0.6 }],
      [0.26, { R: [0.6, 0.6, 0.2, 0.9, 0.4], L: HOOK, turn: -0.5, roll: -0.14, lean: 0.75, down: 0.45, fwd: 0.18, head: 0.5, fistL: 0.6 }],
      [0.38, { R: HOOK, L: [0.6, 0.6, 0.2, 0.9, 0.4], turn: 0.55, roll: 0.16, lean: 0.78, down: 0.47, fwd: 0.2, head: 0.55, fistR: 0.6 }],
      [0.5, { R: [0.6, 0.6, 0.2, 0.9, 0.4], L: HOOK, turn: -0.55, roll: -0.16, lean: 0.78, down: 0.47, fwd: 0.2, head: 0.55, fistL: 0.6 }],
      [0.62, { ...both(HOOK), turn: 0, roll: 0, lean: 0.85, down: 0.5, fwd: 0.28, head: 0.6, fistR: 0.7, fistL: 0.7 }],
    ],
    steps: [step('L', 0.1, 0.2, 0.1), step('R', 0.34, 0.15, -0.1), step('L', 0.58, 0.2)],
    contact: 0.14,
    cuts: [0.26, 0.38, 0.5, 0.62],
    end: 0.9,
  },
  /** Arms raised to the sky as if to pull the moon down, then dragged down red to the chest. */
  bloodmoon: {
    keys: [
      [0.22, { ...both(FLUNG), lean: -0.35, head: -0.7, fistR: 0, fistL: 0 }, true],
      [0.5, { ...both([1.6, 0.2, 0.6, 1.4, 0.4, 0.6]), lean: 0.2, down: 0.2, head: -0.2, fistR: 0.7, fistL: 0.7 }],
      [0.72, { ...both(HOOK), lean: 0.35, down: 0.3, head: 0.1 }],
    ],
    glow: 'both',
    contact: 0.5,
    end: 1.1,
  },
};

// ---------------------------------------------------------------------------
// Claw (the bear)
// ---------------------------------------------------------------------------

const CLAW: Record<string, Spec> = {
  /** One huge flat swipe, wound right back past the shoulder, through the whole front. */
  maul: {
    hit: true,
    keys: [
      [0.12, { R: [1.4, 1.5, -0.4, 0.6, 0.5, 0.2], L: PAW_LOW, turn: -0.75, lean: 0.15, roll: -0.12 }, true],
      [0.24, { R: [1.3, -0.3, 0.5, 0.35, 0.5, -0.4], L: WIDE, turn: 0.65, lean: 0.35, roll: 0.15, down: 0.15, fistR: 0.2 }],
      [0.4, { R: [1.0, -0.4, 0.6, 0.45, 0.5, -0.3], L: PAW_LOW, turn: 0.55, lean: 0.3, down: 0.15 }],
    ],
    steps: [step('L', 0.18, 0.25, 0.08)],
    contact: 0.24,
    end: 0.7,
  },
  /** Up on the hind legs, arms out wide, the head thrust forward into the roar. */
  rattlingRoar: {
    keys: [
      [0.14, { ...both([0.5, 0.6, 0.0, 1.4, 0.4]), lean: 0.3, down: 0.25, head: 0.3 }, true],
      [0.3, { ...both([1.4, 1.35, -0.2, 0.5, 0.5, -0.3]), lean: 0.35, down: -0.05, fwd: 0.12, head: 0.25, fistR: 0.2, fistL: 0.2 }],
      [0.7, { ...both([1.3, 1.3, -0.2, 0.5, 0.5, -0.3]), lean: 0.3, fwd: 0.1, head: 0.22 }],
    ],
    glow: 'both',
    contact: 0.3,
    end: 1.0,
  },
  /** Both paws brought up together high over the head, then hammered down to the floor. */
  hammerfall: {
    hit: true,
    keys: [
      [0.16, { ...both([2.8, 0.3, -0.3, 1.2, 0.3, -0.2]), lean: -0.3, down: -0.08, head: -0.25, fistR: 0.5, fistL: 0.5 }, true],
      [0.3, { ...both([1.1, 0.25, 0.2, 0.15, 0.4, 0.9]), lean: 0.75, down: 0.55, fwd: 0.15, head: 0.2, fistR: 0.5, fistL: 0.5 }],
      [0.5, { ...both([1.0, 0.3, 0.2, 0.2, 0.4, 0.9]), lean: 0.7, down: 0.5, fwd: 0.12 }],
    ],
    steps: [step('R', 0.26, 0.2)],
    contact: 0.3,
    end: 0.85,
  },
  /** Hunches the back and shoulders up, arms pulled in, and shudders. */
  bristle: {
    keys: [
      [0.14, { ...both([0.6, 0.6, 0.3, 1.6, 0.4]), lean: 0.4, down: 0.25, head: 0.35 }, true],
      [0.24, { ...both([0.65, 0.7, 0.3, 1.6, 0.4]), lean: 0.42, down: 0.27, roll: 0.08, head: 0.35 }],
      [0.32, { ...both([0.6, 0.65, 0.3, 1.6, 0.4]), lean: 0.42, down: 0.27, roll: -0.08, head: 0.35 }],
      [0.5, { ...both([0.6, 0.6, 0.3, 1.5, 0.4]), lean: 0.38, down: 0.24, head: 0.3 }],
    ],
    glow: 'both',
    contact: 0.24,
    end: 0.8,
  },
  /** Head down, shoulders forward, both arms low and pumping: a charge on all fours. */
  overrun: {
    hit: true,
    keys: [
      [0.08, { R: [1.0, 0.3, 0.2, 0.4, 0.4, 0.8], L: [0.2, 0.35, 0.2, 0.5, 0.4], lean: 0.85, down: 0.45, head: -0.4 }, true],
      [0.18, { R: [0.2, 0.35, 0.2, 0.5, 0.4], L: [1.0, 0.3, 0.2, 0.4, 0.4, 0.8], lean: 0.85, down: 0.45, fwd: 0.15, head: -0.4 }],
      [0.3, { R: [1.0, 0.3, 0.2, 0.4, 0.4, 0.8], L: [0.2, 0.35, 0.2, 0.5, 0.4], lean: 0.85, down: 0.45, fwd: 0.15, head: -0.4 }],
      [0.44, { ...both(WIDE), lean: 0.4, down: 0.25, head: -0.1 }],
    ],
    steps: [step('L', 0.06, 0.4), step('R', 0.16, 0.4), step('L', 0.28, 0.4)],
    contact: 0.18,
    end: 0.7,
  },
  /** Arms straight out, the whole body turns a full circle on the planted feet. */
  reapingSwipe: {
    hit: true,
    keys: [
      [0.1, { ...both([1.2, 1.4, 0.0, 0.3, 0.5, -0.2]), turn: -0.9, lean: 0.2, down: 0.25, roll: -0.1, fistR: 0, fistL: 0 }, true],
      [0.22, { ...both([1.2, 1.45, 0.0, 0.25, 0.5, -0.2]), turn: 0.9, lean: 0.25, down: 0.28, roll: 0.12 }],
      [0.34, { ...both([1.1, 1.4, 0.0, 0.3, 0.5, -0.2]), turn: -0.6, lean: 0.25, down: 0.28, roll: -0.1 }],
      [0.48, { ...both(WIDE), turn: 0.1, lean: 0.2, down: 0.2 }],
    ],
    steps: [step('R', 0.1, 0.0, 0.25), step('L', 0.28, 0.0, -0.25)],
    contact: 0.22,
    end: 0.8,
  },
  /**
   * Arms open wide, then wrapped round: three squeezes, the back bowing back
   * with each one and easing between. One crush on each (`cuts`).
   */
  bearHug: {
    hit: true,
    keys: [
      [0.1, { ...both(WIDE), lean: 0.15, head: -0.15 }, true],
      [0.2, { ...both([1.25, -0.45, 1.1, 1.9, 0.4, 0.4]), lean: -0.2, fwd: 0.12, head: -0.2, fistR: 0.6, fistL: 0.6 }],
      [0.35, { ...both([1.3, -0.3, 1.0, 1.7, 0.4, 0.4]), lean: 0.3, fwd: 0.1 }],
      [0.5, { ...both([1.25, -0.45, 1.1, 1.9, 0.4, 0.4]), lean: -0.25, fwd: 0.05, head: -0.25 }],
      [0.65, { ...both([1.3, -0.3, 1.0, 1.7, 0.4, 0.4]), lean: 0.3, fwd: 0.1 }],
      [0.8, { ...both([1.2, -0.5, 1.15, 2.0, 0.4, 0.4]), lean: -0.32, fwd: 0.05, head: -0.3 }],
    ],
    contact: 0.2,
    cuts: [0.5, 0.8],
    end: 1.1,
  },
  /** Fists to the floor, then up and up, arms raised to the stars as the bear grows. */
  ursaMajor: {
    keys: [
      [0.18, { ...both(FLOOR), lean: 0.65, down: 0.55, head: 0.3 }, true],
      [0.44, { ...both([2.4, 1.0, -0.4, 0.8, 0.3, -0.3]), lean: -0.25, down: -0.1, head: -0.6, fistR: 0.2, fistL: 0.2 }],
      [0.8, { ...both([2.3, 1.0, -0.4, 0.9, 0.3, -0.3]), lean: -0.22, down: -0.08, head: -0.55 }],
    ],
    steps: [step('R', 0.4, 0.0, 0.15), step('L', 0.5, 0.0, -0.15)],
    glow: 'both',
    contact: 0.44,
    end: 1.2,
  },
};

defineGestures({ ...FORMS, ...FERAL, ...TEETH, ...CLAW });

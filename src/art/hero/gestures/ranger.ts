/**
 * The Ranger's gestures: one per active skill. See `../SkillActions.ts` for
 * how a gesture is written.
 *
 * Most Ranger skills are shots, and no two may be the same shot. A shot is
 * the bow held out on the left arm with the string drawn to the cheek
 * (`aim`), and each skill changes what a plain shot never does: where it
 * aims, how far it draws, how the bow is canted, how low the body goes, how
 * many times the string comes back, and what the hands do before and after.
 */
import { kit } from '../Actions';
import { SIDE_ON, drawPlaces, loosePlaces, restPlace, type BowAim } from '../Archery';
import { defineGestures, type G, type Spec, step } from '../SkillActions';

const { bowReach } = kit;

interface Aim extends BowAim {
  /** Weight down, to the left and forward, heads. */
  down?: number;
  side?: number;
  fwd?: number;
  /** Extra head tip, + down. */
  head?: number;
}

/** The bow held low by the hip while the string hand does something else. */
const BOW_LOW = bowReach('L', restPlace());
/** The bow stood upright before the face, to hide behind. */
const BOW_UP = bowReach('L', { at: [0.15, 5.5, 1.5], dir: [0, 1, 0.08] });

/** The body round a bow: side-on, leaning back to shoot high, eyes on the mark. */
function body(o: Aim): { g: G; bow: BowAim } {
  const up = o.up ?? 0;
  const cant = o.cant ?? 0;
  const lean = -0.04 - up * 0.25 + (o.lean ?? 0);
  const roll = (o.roll ?? 0) - 0.25 * cant;
  return {
    g: {
      turn: SIDE_ON + (o.turn ?? 0),
      lean,
      roll,
      down: 0.05 + (o.down ?? 0),
      side: 0.05 + (o.side ?? 0),
      fwd: -0.02 + (o.fwd ?? 0),
      head: (o.head ?? 0) - up * 0.4,
      gaze: -SIDE_ON * 0.25,
      fistL: 1,
    },
    bow: { up, cant, turn: o.turn, lean: lean + 0.04, roll },
  };
}

/** The bow up and the string drawn `d` of the way to the chin (0 just nocked at the bow, 1 full). */
function aim(d: number, o: Aim = {}): G {
  const { g, bow } = body(o);
  const h = drawPlaces(d, bow);
  return { ...g, L: bowReach('L', h.L), R: bowReach('R', h.R), fistR: 0.75, nock: true };
}

/** The string let go: fingers open and the hand flies back along the jaw. */
function loose(o: Aim = {}, far = 1): G {
  const { g, bow } = body(o);
  const h = loosePlaces(bow, far);
  return { ...g, L: bowReach('L', h.L), R: bowReach('R', h.R), fistR: 0.1 };
}

/** The bow lowered and the string hand dropped: a shot finished. */
function after(o: Aim = {}): G {
  const { g } = body(o);
  g.L = bowReach('L', restPlace(0, (o.turn ?? 0) + 0.3));
  g.R = [0.5, 0.45, 0.1, 0.9, 0.3];
  g.fistR = 0.3;
  g.turn = -0.45 + (o.turn ?? 0);
  g.roll = 0;
  return g;
}

// ---------------------------------------------------------------------------
// Marksman
// ---------------------------------------------------------------------------

const MARKSMAN: Record<string, Spec> = {
  /** A step back to a wide base, a full steady draw, and the hand flung straight back. */
  pierceShot: {
    keys: [
      [0.1, aim(0.2, { side: 0.1 })],
      [0.26, aim(1, { side: 0.1, down: 0.1 }), true],
      [0.32, loose({ side: 0.1, down: 0.1 }, 1.3)],
      [0.5, loose({ side: 0.1, down: 0.08 }, 1.4)],
    ],
    steps: [step('R', 0.04, -0.35, -0.25)],
    contact: 0.32,
    end: 0.8,
  },
  /** Two fingers touched below the eye, then pointed at the quarry: marked. */
  huntersMark: {
    keys: [
      [0.14, { R: [1.4, -0.35, 1.2, 2.55, 0.3], L: BOW_LOW, fistR: 0.5, head: 0.05, turn: -0.15 }, true],
      [0.24, { R: [1.6, 0.1, 0.2, 0.05, 1.2, -0.2], L: BOW_LOW, fistR: 0.5, turn: 0.2, lean: 0.12, fwd: 0.1, head: 0.1 }],
      [0.5, { R: [1.55, 0.1, 0.2, 0.1, 1.2, -0.2], L: BOW_LOW, fistR: 0.5, turn: 0.2, lean: 0.1, fwd: 0.08, head: 0.1 }],
    ],
    glow: 'right',
    end: 0.85,
  },
  /** Down on one knee, the bow upright, a slow full draw and a still release. */
  aimedShot: {
    keys: [
      [0.14, aim(0.3, { down: 0.9, lean: 0.15 })],
      [0.32, aim(1, { down: 1.0, lean: 0.12 }), true],
      [0.38, loose({ down: 1.0, lean: 0.12 }, 0.6)],
      [0.56, loose({ down: 0.98, lean: 0.12 }, 0.7)],
    ],
    steps: [step('L', 0.04, 0.55, 0.05)],
    contact: 0.38,
    end: 0.95,
  },
  /** The bow canted well over, drawn and snapped off fast from the hip. */
  bleedingArrow: {
    keys: [
      [0.08, aim(0.3, { cant: 0.55, down: 0.12 })],
      [0.16, aim(0.9, { cant: 0.6, down: 0.15, turn: 0.1 }), true],
      [0.21, loose({ cant: 0.6, down: 0.15, turn: 0.1 }, 0.9)],
      [0.34, loose({ cant: 0.55, down: 0.12, turn: 0.1 }, 1.0)],
    ],
    contact: 0.21,
    end: 0.55,
  },
  /** Leaning over the bow, aimed down at the legs. */
  crippling: {
    keys: [
      [0.1, aim(0.3, { up: -0.3, lean: 0.3, down: 0.15 })],
      [0.22, aim(1, { up: -0.35, lean: 0.38, down: 0.2, fwd: 0.1 }), true],
      [0.28, loose({ up: -0.35, lean: 0.38, down: 0.2, fwd: 0.1 }, 0.8)],
      [0.44, loose({ up: -0.32, lean: 0.35, down: 0.18, fwd: 0.08 }, 0.9)],
    ],
    steps: [step('L', 0.06, 0.4)],
    contact: 0.28,
    end: 0.72,
  },
  /** The longest draw there is, a breath held, then the bow arm drops away after. */
  oneShot: {
    keys: [
      [0.12, aim(0.3, { up: 0.12, side: 0.08 })],
      [0.3, aim(1.15, { up: 0.12, side: 0.1, lean: -0.08, head: 0.08 }), true],
      [0.36, loose({ up: 0.12, side: 0.1, lean: -0.08 }, 1.2)],
      [0.5, { ...loose({ up: 0.0, side: 0.1 }, 1.3), L: BOW_LOW }],
    ],
    steps: [step('R', 0.04, -0.3, -0.2)],
    contact: 0.36,
    end: 0.95,
  },
  /** A short hard draw, then the bow given a sharp twist on the loose so the shaft goes brittle. */
  splinterShot: {
    keys: [
      [0.1, aim(0.4, { cant: 0.15, side: 0.06 })],
      [0.22, aim(0.95, { cant: 0.2, side: 0.08, down: 0.06 }), true],
      [0.27, loose({ cant: 0.7, side: 0.08, down: 0.06, turn: -0.1 }, 0.8)],
      [0.42, loose({ cant: 0.6, side: 0.06, down: 0.05, turn: -0.08 }, 0.9)],
    ],
    contact: 0.27,
    end: 0.72,
  },
  /** The whole body leaned over sideways to find the angle off the wall. */
  bankShot: {
    keys: [
      [0.1, aim(0.4, { up: 0.1, turn: -0.2, roll: 0.35, side: -0.25 })],
      [0.24, aim(1, { up: 0.1, turn: -0.25, roll: 0.4, side: -0.3 }), true],
      [0.29, loose({ up: 0.1, turn: -0.25, roll: 0.4, side: -0.3 }, 0.9)],
      [0.46, loose({ up: 0.05, turn: -0.2, roll: 0.3, side: -0.25 }, 1.0)],
    ],
    contact: 0.29,
    end: 0.75,
  },
  /** The drawn bow swept slowly across the marked, head following, then one clean loose. */
  quarrysEnd: {
    keys: [
      [0.1, aim(0.6, { turn: 0.35, head: 0.05 })],
      [0.24, aim(1, { turn: 0.15, head: 0.08 })],
      [0.34, aim(1.05, { turn: -0.15, head: 0.08, down: 0.05 }), true],
      [0.39, loose({ turn: -0.15, down: 0.05 }, 1.2)],
      [0.56, loose({ turn: -0.12, down: 0.04 }, 1.3)],
    ],
    steps: [step('R', 0.06, -0.25, -0.15)],
    contact: 0.39,
    end: 0.9,
  },
};

// ---------------------------------------------------------------------------
// Wildcraft
// ---------------------------------------------------------------------------

const WILDCRAFT: Record<string, Spec> = {
  /** Tucked into a forward roll: head down, knees in, arms wrapped. */
  rollAway: {
    keys: [
      [0.05, { R: [1.2, -0.3, 1.2, 2.2, 0.3], L: [1.2, -0.3, 1.2, 2.2, 0.3], lean: 0.6, down: 0.6, head: 0.4 }],
      [0.16, { R: [1.4, -0.4, 1.3, 2.4, 0.3], L: [1.4, -0.4, 1.3, 2.4, 0.3], lean: 0.95, down: 1.3, head: 0.5, fwd: 0.3 }, true],
      [0.28, { R: [0.8, 0.4, 0.2, 1.2, 0.3], L: [0.8, 0.4, 0.2, 1.2, 0.3], lean: 0.35, down: 0.5, fwd: 0.1 }],
    ],
    contact: 0.16,
    end: 0.45,
  },
  /** Knelt over the noose, both hands low, then the cord jerked tight. */
  snareTrap: {
    keys: [
      [0.16, { R: [0.75, 0.15, 0.6, 1.1, 0.6, -0.6], L: [0.75, 0.15, 0.6, 1.1, 0.6, -0.6], lean: 0.6, down: 1.15, head: 0.25 }, true],
      [0.26, { R: [0.7, 0.75, -0.1, 1.6, 0.3], L: [0.7, 0.75, -0.1, 1.6, 0.3], lean: 0.5, down: 1.1, head: 0.2, fistR: 1, fistL: 1 }],
      [0.48, { R: [0.65, 0.8, -0.1, 1.65, 0.3], L: [0.65, 0.8, -0.1, 1.65, 0.3], lean: 0.48, down: 1.08, fistR: 1, fistL: 1 }],
    ],
    steps: [step('L', 0.05, 0.5)],
    end: 0.85,
  },
  /** On a knee, a fist raised and hammered down twice on the stake. */
  spikeTrap: {
    keys: [
      [0.12, { R: [2.0, 0.4, 0.2, 1.4, 0.3], L: [0.7, 0.25, 0.5, 0.7, 0.6, -0.8], fistR: 1, lean: 0.45, down: 1.0, head: 0.3 }, true],
      [0.2, { R: [0.8, 0.25, 0.3, 0.6, 0.3], L: [0.7, 0.25, 0.5, 0.7, 0.6, -0.8], fistR: 1, lean: 0.65, down: 1.1, head: 0.35 }],
      [0.3, { R: [2.0, 0.4, 0.2, 1.4, 0.3], L: [0.7, 0.25, 0.5, 0.7, 0.6, -0.8], fistR: 1, lean: 0.5, down: 1.05, head: 0.3 }],
      [0.38, { R: [0.8, 0.25, 0.3, 0.6, 0.3], L: [0.7, 0.25, 0.5, 0.7, 0.6, -0.8], fistR: 1, lean: 0.65, down: 1.1, head: 0.35 }],
    ],
    steps: [step('L', 0.04, 0.5)],
    contact: 0.2,
    end: 0.75,
  },
  /** Both hands thrust into the soil, then wrenched up: the thorns come with them. */
  thornBarrier: {
    keys: [
      [0.16, { R: [0.6, 0.3, 0.3, 0.15, 0.9, -1.2], L: [0.6, 0.3, 0.3, 0.15, 0.9, -1.2], lean: 0.6, down: 1.0, fistR: 0, fistL: 0 }, true],
      [0.32, { R: [1.35, 0.45, 0.2, 0.9, 0.3], L: [1.35, 0.45, 0.2, 0.9, 0.3], lean: -0.1, down: 0.15, fistR: 1, fistL: 1, head: -0.1 }],
      [0.56, { R: [1.3, 0.5, 0.2, 0.95, 0.3], L: [1.3, 0.5, 0.2, 0.95, 0.3], lean: -0.08, down: 0.12, fistR: 1, fistL: 1 }],
    ],
    contact: 0.32,
    glow: 'both',
    end: 0.9,
  },
  /** Leaping back off both feet, the bow thrown up and loosed on the way. */
  disengage: {
    keys: [
      [0.05, aim(0.5, { lean: -0.3, down: -0.1, fwd: -0.15 })],
      [0.13, loose({ lean: -0.35, down: -0.15, fwd: -0.25, up: 0.15 }, 1.0)],
      [0.26, after({ lean: -0.2, down: 0.2, fwd: -0.15 })],
    ],
    contact: 0.13,
    end: 0.45,
  },
  /** An arrow drawn from the quiver, dipped at the hip, and studied at the eye. */
  venomCoat: {
    keys: [
      [0.14, { R: [2.5, 0.3, -0.7, 2.3, 0.3], L: BOW_LOW, head: -0.1, turn: 0.2 }, true],
      [0.28, { R: [0.25, 0.45, 0.2, 1.5, 0.3, -0.4], L: BOW_LOW, head: 0.3, lean: 0.15, turn: -0.25, down: 0.1 }, true],
      [0.44, { R: [1.35, -0.2, 1.1, 2.0, 0.3], L: BOW_LOW, head: 0.1, turn: 0.05 }],
      [0.66, { R: [1.3, -0.2, 1.1, 2.05, 0.3], L: BOW_LOW, head: 0.12 }],
    ],
    contact: 0.44,
    glow: 'right',
    end: 1.0,
  },
  /** Sunk into a squat behind the upright bow, head ducked, perfectly still. */
  camouflage: {
    keys: [
      [0.16, { L: BOW_UP, R: [0.9, -0.1, 0.9, 1.9, 0.3], lean: 0.3, down: 0.6, head: 0.2 }, true],
      [0.32, { L: BOW_UP, R: [0.8, -0.2, 1.0, 2.1, 0.3], lean: 0.45, down: 1.2, head: 0.45 }],
      [0.62, { L: BOW_UP, R: [0.8, -0.2, 1.0, 2.1, 0.3], lean: 0.44, down: 1.18, head: 0.42 }],
    ],
    glow: 'both',
    end: 1.0,
  },
  /** A turn on the spot, both fists flung open low: caltrops strewn all round. */
  theWholeFloor: {
    keys: [
      [0.14, { R: [0.8, -0.5, 1.2, 1.7, 0.3], L: [0.8, -0.5, 1.2, 1.7, 0.3], turn: 0.85, down: 0.35, lean: 0.3, fistR: 1, fistL: 1 }, true],
      [0.26, { R: [0.7, 1.35, -0.2, 0.25, 0.6, -0.4], L: [0.45, 1.0, -0.1, 0.4, 0.6, -0.4], turn: -0.3, down: 0.3, lean: 0.25, fistR: 0, fistL: 0 }],
      [0.4, { R: [0.5, 1.2, -0.2, 0.3, 0.6, -0.4], L: [0.7, 1.35, -0.2, 0.25, 0.6, -0.4], turn: -0.95, down: 0.3, lean: 0.25 }],
    ],
    steps: [step('R', 0.16, -0.1, -0.35), step('L', 0.32, 0.2, 0.3)],
    glow: 'both',
    end: 0.8,
  },
  /** Knelt, the cord run out between both hands as wide as they go, then pulled taut. */
  tripwire: {
    keys: [
      [0.12, { R: [0.9, 0.2, 0.4, 0.5, 0.6, -0.6], L: [0.9, 0.2, 0.4, 0.5, 0.6, -0.6], lean: 0.5, down: 1.0, head: 0.25, fistR: 1, fistL: 1 }],
      [0.26, { R: [1.0, 1.4, -0.2, 0.15, 0.6, -0.6], L: [1.0, 1.4, -0.2, 0.15, 0.6, -0.6], lean: 0.45, down: 1.05, head: 0.2, fistR: 1, fistL: 1 }, true],
      [0.34, { R: [0.95, 1.5, -0.25, 0.1, 0.6, -0.6], L: [0.95, 1.5, -0.25, 0.1, 0.6, -0.6], lean: 0.42, down: 1.02, head: 0.18, fistR: 1, fistL: 1 }],
      [0.52, { R: [0.9, 1.45, -0.2, 0.15, 0.6, -0.6], L: [0.9, 1.45, -0.2, 0.15, 0.6, -0.6], lean: 0.4, down: 1.0, fistR: 1, fistL: 1 }],
    ],
    steps: [step('R', 0.05, -0.45)],
    contact: 0.26,
    end: 0.85,
  },
  /** The nest weighed in the hand and lobbed underarm, gently, out ahead. */
  waspNest: {
    keys: [
      [0.14, { R: [-0.4, 0.35, 0.1, 0.4, 0.3, 0.4], L: BOW_LOW, fistR: 0.6, lean: 0.25, down: 0.3, turn: -0.3 }, true],
      [0.26, { R: [1.2, 0.3, 0.1, 0.2, 0.3, 0.6], L: BOW_LOW, fistR: 0.1, lean: 0.05, down: 0.1, turn: 0.15, head: -0.05 }],
      [0.46, { R: [1.1, 0.35, 0.1, 0.3, 0.3, 0.5], L: BOW_LOW, fistR: 0.1, lean: 0.04, down: 0.08, turn: 0.12 }],
    ],
    steps: [step('L', 0.12, 0.35)],
    contact: 0.26,
    end: 0.8,
  },
  /** A two-finger whistle, then the left forearm raised level for the bird. */
  kestrel: {
    keys: [
      [0.12, { R: [1.5, -0.2, 1.1, 2.4, 0.3], L: BOW_LOW, fistR: 0.5, head: 0.12 }],
      [0.26, { R: [1.45, -0.2, 1.1, 2.4, 0.3], L: [1.6, 0.9, -0.3, 1.6, 0.3], fistR: 0.5, fistL: 1, head: -0.25, lean: -0.1 }, true],
      [0.5, { R: [0.6, 0.45, 0.1, 0.9, 0.3], L: [1.65, 0.95, -0.3, 1.55, 0.3], fistL: 1, head: -0.3, lean: -0.12 }],
    ],
    contact: 0.26,
    end: 0.85,
  },
};

// ---------------------------------------------------------------------------
// Volley
// ---------------------------------------------------------------------------

const VOLLEY: Record<string, Spec> = {
  /** Two full draws in a breath: loose, nock, loose. */
  twinShot: {
    keys: [
      [0.08, aim(0.9)],
      [0.13, loose({}, 0.8)],
      [0.2, aim(0.2, { turn: 0.05 })],
      [0.28, aim(0.95, { turn: 0.05 })],
      [0.33, loose({ turn: 0.05 }, 1.0)],
    ],
    contact: 0.13,
    cuts: [0.33],
    end: 0.6,
  },
  /** A crouched short draw off the hip, the bow canted low, the arrows spraying. */
  scattershot: {
    keys: [
      [0.08, aim(0.3, { up: -0.15, cant: 0.35, down: 0.45, lean: 0.2 })],
      [0.16, aim(0.6, { up: -0.15, cant: 0.4, down: 0.5, lean: 0.22 }), true],
      [0.2, loose({ up: -0.12, cant: 0.4, down: 0.5, lean: 0.22 }, 0.6)],
      [0.34, loose({ up: -0.1, cant: 0.35, down: 0.45, lean: 0.2, turn: 0.15 }, 0.7)],
    ],
    contact: 0.2,
    end: 0.6,
  },
  /** Bow high and back on a wide base, drawn at the sky for the long fall. */
  arrowRain: {
    keys: [
      [0.12, aim(0.3, { up: 0.95, side: 0.12 })],
      [0.26, aim(1, { up: 1.0, side: 0.14, lean: -0.08 }), true],
      [0.31, loose({ up: 1.0, side: 0.14, lean: -0.08 }, 1.0)],
      [0.48, loose({ up: 0.9, side: 0.12, lean: -0.05 }, 1.1)],
    ],
    steps: [step('R', 0.04, -0.4, -0.2)],
    contact: 0.31,
    end: 0.8,
  },
  /** A quick snap from a high draw, the wrist rolled on the loose and the bow following round after it. */
  ricochet: {
    keys: [
      [0.08, aim(0.5, { up: 0.2, turn: 0.15 })],
      [0.16, aim(0.9, { up: 0.2, turn: 0.15 }), true],
      [0.2, loose({ up: 0.15, turn: 0.15, cant: 0.4 }, 0.8)],
      [0.3, loose({ up: 0.05, turn: -0.35, cant: 0.5 }, 0.9)],
      [0.42, after({ turn: -0.45 })],
    ],
    contact: 0.2,
    end: 0.65,
  },
  /** The bow laid flat and drawn, then swept across the front as it empties. */
  fanFire: {
    keys: [
      [0.08, aim(0.5, { cant: 0.95, turn: 0.4, down: 0.12 })],
      [0.16, aim(0.95, { cant: 1, turn: 0.4, down: 0.15 }), true],
      [0.2, loose({ cant: 1, turn: 0.38, down: 0.15 }, 0.6)],
      [0.3, loose({ cant: 1, turn: -0.4, down: 0.15 }, 0.7)],
      [0.42, loose({ cant: 0.9, turn: -0.45, down: 0.12 }, 0.8)],
    ],
    steps: [step('L', 0.06, 0.3)],
    contact: 0.2,
    end: 0.65,
  },
  /** Knelt low and steady, three quick half-draws in a row. */
  suppressing: {
    keys: [
      [0.06, aim(0.5, { down: 0.55, lean: 0.12 })],
      [0.09, loose({ down: 0.55, lean: 0.12 }, 0.4)],
      [0.14, aim(0.5, { down: 0.55, lean: 0.12 })],
      [0.17, loose({ down: 0.55, lean: 0.12 }, 0.4)],
      [0.22, aim(0.5, { down: 0.55, lean: 0.12 })],
      [0.25, loose({ down: 0.55, lean: 0.12 }, 0.5)],
    ],
    steps: [step('L', 0.03, 0.45)],
    contact: 0.09,
    cuts: [0.17, 0.25],
    end: 0.55,
  },
  /** The arrowhead struck along the thigh to light it, then drawn and loosed. */
  explosiveTip: {
    keys: [
      [0.1, { R: [0.1, 0.5, 0.0, 0.5, 0.3, -0.3], L: BOW_LOW, fistR: 0.75, lean: 0.15, turn: -0.2, head: 0.25 }, true],
      [0.16, { R: [0.7, 0.35, 0.3, 0.3, 0.3, 0.2], L: BOW_LOW, fistR: 0.75, lean: 0.1, turn: -0.3, head: 0.2 }],
      [0.28, aim(1, { up: 0.08 }), true],
      [0.33, loose({ up: 0.08 }, 1.0)],
      [0.48, loose({ up: 0.05 }, 1.1)],
    ],
    contact: 0.33,
    glow: 'right',
    end: 0.8,
  },
  /** Legs wide, bent back under the sky, the bow emptied straight up twice. */
  darkenTheSky: {
    keys: [
      [0.1, aim(0.3, { up: 1.25, side: 0.15, lean: -0.15 })],
      [0.22, aim(1, { up: 1.3, side: 0.18, lean: -0.2, down: 0.1 }), true],
      [0.27, loose({ up: 1.3, side: 0.18, lean: -0.2, down: 0.1 }, 0.8)],
      [0.36, aim(1, { up: 1.25, side: 0.18, lean: -0.2, down: 0.1 })],
      [0.41, loose({ up: 1.25, side: 0.18, lean: -0.2, down: 0.1 }, 1.0)],
    ],
    steps: [step('R', 0.04, -0.3, -0.35), step('L', 0.08, 0.15, 0.3)],
    contact: 0.27,
    end: 0.9,
  },
  /** Bow at the sky, drawn and loosed, then drawn again a little lower and a little lower: the fall walks out. */
  creepingBarrage: {
    keys: [
      [0.1, aim(0.5, { up: 1.05, side: 0.1 })],
      [0.22, aim(1, { up: 1.05, side: 0.1 }), true],
      [0.26, loose({ up: 1.05, side: 0.1 }, 0.7)],
      [0.34, aim(0.8, { up: 0.85, side: 0.1, lean: 0.04 })],
      [0.38, loose({ up: 0.85, side: 0.1, lean: 0.04 }, 0.7)],
      [0.46, aim(0.8, { up: 0.65, side: 0.1, lean: 0.08 })],
      [0.5, loose({ up: 0.65, side: 0.1, lean: 0.08 }, 0.9)],
    ],
    steps: [step('R', 0.04, -0.3, -0.2)],
    contact: 0.26,
    end: 0.85,
  },
  /** The string hand run over the quiver's fletching, then the bow lifted with a flourish. */
  openQuiver: {
    keys: [
      [0.12, { R: [2.6, 0.35, -0.8, 2.2, 0.3], L: BOW_LOW, fistR: 0.2, head: -0.15, turn: 0.25 }],
      [0.24, { R: [2.3, 0.75, -0.5, 1.6, 0.3], L: BOW_LOW, fistR: 0.1, head: -0.1, turn: 0.35 }, true],
      [0.38, { R: [1.2, 0.6, 0.1, 0.8, 0.3], L: [2.2, 0.7, 0.1, 0.4, 0.4], fistR: 0.2, head: 0.05, turn: -0.1, lean: -0.08 }],
      [0.6, { R: [1.1, 0.6, 0.1, 0.85, 0.3], L: [2.1, 0.7, 0.1, 0.45, 0.4], fistR: 0.2, head: 0.05, turn: -0.08, lean: -0.06 }],
    ],
    glow: 'right',
    contact: 0.24,
    end: 0.9,
  },
  /** Turned right round on the spot with the bow out, the string snapping back again and again. */
  arrowWheel: {
    keys: [
      [0.08, aim(0.9, { turn: 0.6, down: 0.2 })],
      [0.14, loose({ turn: 0.6, down: 0.2 }, 0.5), true],
      [0.24, loose({ turn: -0.2, down: 0.22 }, 0.6)],
      [0.34, loose({ turn: -1.0, down: 0.22 }, 0.6)],
      [0.44, loose({ turn: -1.6, down: 0.2 }, 0.7)],
      [0.56, after({ turn: -0.4, down: 0.1 })],
    ],
    steps: [step('R', 0.1, 0.25, -0.3), step('L', 0.3, -0.25, 0.3)],
    contact: 0.14,
    free: true,
    end: 0.8,
  },
};

defineGestures({ ...MARKSMAN, ...WILDCRAFT, ...VOLLEY });

/**
 * The Revenant's gestures: one per active skill. See `../SkillActions.ts` for
 * how a gesture is written.
 *
 * A necromancer who came back wrong: he casts with clawed hands, hunched,
 * pulling and tearing and bargaining with his own blood. He carries a wand
 * and a focus (or a staff), so both hands are free to work, and none of his
 * gestures is a Mage's: where a Mage pushes power out, he drags it up, rips
 * it open or wrings it out.
 */
import type { Arm } from '../Actions';
import { defineGestures, type G, type Spec, step } from '../SkillActions';

/** Fingers half curled: a claw. */
const CLAW = 0.55;
/** A hand pressed flat over the heart. */
const HEART: Arm = [1.0, -0.55, 1.25, 2.3, 0.4];

// ---------------------------------------------------------------------------
// Ossuary: bone
// ---------------------------------------------------------------------------

const OSSUARY: Record<string, Spec> = {
  /** The free hand draws a spear out along the reaching forearm and lets it fly. */
  boneSpear: {
    keys: [
      [0.14, { R: [1.45, 0.1, 0.3, 0.1, 1.2, -0.3], L: [1.25, -0.45, 1.25, 1.3, 0.4], fistL: 0.8, turn: 0.25, lean: 0.05 }, true],
      [0.24, { R: [0.35, 0.35, 0.3, 1.5, 0.3], L: [1.6, -0.1, 0.4, 0.05, 1.0, -0.6], fistL: 0, turn: -0.3, lean: 0.2, fwd: 0.15 }],
      [0.42, { R: [0.35, 0.35, 0.3, 1.5, 0.3], L: [1.5, -0.05, 0.4, 0.15, 1.0, -0.5], turn: -0.32, lean: 0.18, fwd: 0.12 }],
    ],
    glow: 'left',
    end: 0.75,
  },
  /** A claw held over the floor, and the dead pulled up out of it by the hair. */
  raiseSkeleton: {
    keys: [
      [0.16, { R: [0.75, 0.2, 0.4, 0.4, 0.9, -1.0], fistR: CLAW, lean: 0.45, down: 0.35, head: 0.15 }, true],
      [0.3, { R: [1.45, 0.2, 0.4, 1.7, 0.3], fistR: 1, lean: -0.08, down: 0.0, head: -0.05 }],
      [0.55, { R: [1.4, 0.2, 0.4, 1.75, 0.3], fistR: 1, lean: -0.06 }],
    ],
    end: 0.9,
  },
  /** Both claws raked down the ribs, dragging bone out over the body. */
  boneArmor: {
    keys: [
      [0.14, { R: [1.15, -0.45, 1.2, 2.4, 0.4], L: [1.15, -0.45, 1.2, 2.4, 0.4], fistR: CLAW, fistL: CLAW, head: 0.15, lean: 0.15 }, true],
      [0.3, { R: [0.25, 0.45, 0.2, 1.3, 0.4], L: [0.25, 0.45, 0.2, 1.3, 0.4], fistR: CLAW, fistL: CLAW, head: -0.25, lean: -0.15, down: 0.1 }],
      [0.55, { R: [0.2, 0.5, 0.2, 1.2, 0.4], L: [0.2, 0.5, 0.2, 1.2, 0.4], fistR: CLAW, fistL: CLAW, head: -0.2, lean: -0.12 }],
    ],
    glow: 'both',
    end: 0.9,
  },
  /** A puppeteer: both hands palm-down at the shoulder, wrists jerking the strings up. */
  skeletalMage: {
    keys: [
      [0.12, { R: [1.3, 0.35, 0.3, 0.7, 0.8, 0.6], L: [1.3, 0.35, 0.3, 0.7, 0.8, 0.6], fistR: 0.3, fistL: 0.3 }, true],
      [0.2, { R: [1.55, 0.35, 0.3, 0.9, 0.8, -0.7], L: [1.4, 0.35, 0.3, 0.7, 0.8, 0.4], head: -0.05 }],
      [0.28, { R: [1.4, 0.35, 0.3, 0.7, 0.8, 0.4], L: [1.55, 0.35, 0.3, 0.9, 0.8, -0.7] }],
      [0.4, { R: [1.75, 0.35, 0.3, 1.0, 0.8, -0.8], L: [1.75, 0.35, 0.3, 1.0, 0.8, -0.8], head: -0.12, lean: -0.08 }],
    ],
    contact: 0.2,
    glow: 'both',
    end: 0.8,
  },
  /** Cupped at the belly like a caught bird, then opened upward to let it go. */
  boneSpirit: {
    keys: [
      [0.16, { R: [0.6, -0.2, 0.8, 1.9, -0.8], L: [0.6, -0.2, 0.8, 1.9, -0.8], lean: 0.2, head: 0.25, down: 0.1 }, true],
      [0.28, { R: [1.95, 0.45, 0.0, 0.6, -0.8, 0.4], L: [1.95, 0.45, 0.0, 0.6, -0.8, 0.4], lean: -0.15, head: -0.3 }],
      [0.48, { R: [1.85, 0.5, 0.0, 0.7, -0.8, 0.4], L: [1.85, 0.5, 0.0, 0.7, -0.8, 0.4], lean: -0.12, head: -0.25 }],
    ],
    glow: 'both',
    end: 0.85,
  },
  /** Kneading a body out of nothing: pressed together, then drawn up into a shape. */
  claySentinel: {
    keys: [
      [0.12, { R: [0.9, 0.75, 0.0, 0.8, 0.3], L: [0.9, 0.75, 0.0, 0.8, 0.3], lean: 0.3, down: 0.3 }],
      [0.24, { R: [1.0, -0.25, 1.05, 1.0, 0.3], L: [1.0, -0.25, 1.05, 1.0, 0.3], lean: 0.35, down: 0.35, fistR: 0.7, fistL: 0.7 }, true],
      [0.4, { R: [1.65, 0.6, 0.1, 0.8, 0.3], L: [1.65, 0.6, 0.1, 0.8, 0.3], lean: 0.0, down: 0.05, head: -0.1 }],
      [0.6, { R: [1.6, 0.62, 0.1, 0.85, 0.3], L: [1.6, 0.62, 0.1, 0.85, 0.3], head: -0.08 }],
    ],
    contact: 0.4,
    glow: 'both',
    end: 0.95,
  },
  /** Both hands wide, then scissored shut past each other: the bars close. */
  boneCage: {
    keys: [
      [0.12, { R: [1.25, 0.95, -0.1, 0.4, 0.3], L: [1.25, 0.95, -0.1, 0.4, 0.3], fistR: CLAW, fistL: CLAW, lean: 0.1 }, true],
      [0.22, { R: [1.3, -0.55, 1.2, 0.9, 0.3], L: [1.15, -0.45, 1.2, 1.0, 0.3], fistR: 1, fistL: 1, lean: 0.2, down: 0.15 }],
      [0.42, { R: [1.25, -0.55, 1.2, 0.95, 0.3], L: [1.1, -0.45, 1.2, 1.05, 0.3], fistR: 1, fistL: 1, lean: 0.18, down: 0.14 }],
    ],
    glow: 'both',
    end: 0.75,
  },
  /** The hands rolled over each other before the chest, faster and faster. */
  boneStorm: {
    keys: [
      [0.08, { R: [1.4, 0.0, 0.9, 1.6, 0.3], L: [0.9, 0.0, 0.9, 1.7, 0.3], fistR: CLAW, fistL: CLAW, lean: 0.12 }],
      [0.16, { R: [0.9, 0.0, 0.9, 1.7, 0.3], L: [1.4, 0.0, 0.9, 1.6, 0.3], lean: 0.12, roll: 0.06 }],
      [0.23, { R: [1.4, 0.0, 0.9, 1.6, 0.3], L: [0.9, 0.0, 0.9, 1.7, 0.3], lean: 0.12, roll: -0.06 }],
      [0.3, { R: [0.9, 0.0, 0.9, 1.7, 0.3], L: [1.4, 0.0, 0.9, 1.6, 0.3], lean: 0.12 }],
      [0.42, { R: [1.3, 1.0, -0.2, 0.3, 0.6, -0.6], L: [1.3, 1.0, -0.2, 0.3, 0.6, -0.6], fistR: 0, fistL: 0, lean: -0.05 }],
    ],
    contact: 0.42,
    glow: 'both',
    end: 0.8,
  },
  /** Head bowed, the pieces gathered in from wide and low to the chest. */
  reassemble: {
    keys: [
      [0.16, { R: [0.5, 1.15, -0.2, 0.3, 0.6, -0.6], L: [0.5, 1.15, -0.2, 0.3, 0.6, -0.6], lean: 0.3, down: 0.3, head: 0.2 }, true],
      [0.32, { R: [1.2, -0.3, 1.2, 2.2, 0.4], L: [1.2, -0.3, 1.2, 2.2, 0.4], fistR: 0.8, fistL: 0.8, lean: 0.2, down: 0.15, head: 0.35 }],
      [0.6, { R: [1.15, -0.3, 1.2, 2.25, 0.4], L: [1.15, -0.3, 1.2, 2.25, 0.4], fistR: 0.8, fistL: 0.8, lean: 0.18, down: 0.14, head: 0.32 }],
    ],
    glow: 'both',
    end: 0.95,
  },
  /** Curled in tight, then the chest thrown out and both arms flung back: bone bursts free. */
  boneNova: {
    keys: [
      [0.16, { R: [1.0, -0.5, 1.2, 2.3, 0.4], L: [1.0, -0.5, 1.2, 2.3, 0.4], fistR: 1, fistL: 1, lean: 0.45, down: 0.45, head: 0.35 }, true],
      [0.26, { R: [-0.7, 0.55, 0.0, 0.3, 0.4], L: [-0.7, 0.55, 0.0, 0.3, 0.4], fistR: CLAW, fistL: CLAW, lean: -0.3, down: -0.04, head: -0.35 }],
      [0.48, { R: [-0.6, 0.55, 0.0, 0.35, 0.4], L: [-0.6, 0.55, 0.0, 0.35, 0.4], lean: -0.25, head: -0.3 }],
    ],
    glow: 'both',
    end: 0.85,
  },
  /** Both arms swept wide and low over the graveyard, palms down, lifting it all. */
  grandOssuary: {
    keys: [
      [0.18, { R: [0.5, 1.2, 0.3, 0.3, 0.8, -0.9], L: [0.5, 1.2, 0.3, 0.3, 0.8, -0.9], turn: 0.45, lean: 0.25, down: 0.3 }, true],
      [0.34, { R: [1.3, 1.2, 0.3, 0.3, 0.8, -0.9], L: [1.3, 1.2, 0.3, 0.3, 0.8, -0.9], turn: -0.45, lean: 0.05, down: 0.05, head: -0.15 }],
      [0.52, { R: [1.4, 1.15, 0.3, 0.3, 0.8, -0.9], L: [1.4, 1.15, 0.3, 0.3, 0.8, -0.9], turn: 0.0, lean: -0.05, head: -0.2 }],
    ],
    steps: [step('R', 0.16, -0.15, -0.3)],
    contact: 0.34,
    glow: 'both',
    end: 1.0,
  },
};

// ---------------------------------------------------------------------------
// Blight: curses and plague
// ---------------------------------------------------------------------------

const BLIGHT: Record<string, Spec> = {
  /** A limp-wristed flick at them, the hand wilting as it lands. */
  weaken: {
    keys: [
      [0.12, { R: [1.2, 0.2, 0.3, 1.0, 0.0, -0.6], turn: -0.1 }, true],
      [0.22, { R: [1.45, 0.1, 0.3, 0.25, 0.0, 1.1], turn: 0.12, fwd: 0.06, head: 0.1 }],
      [0.44, { R: [1.35, 0.1, 0.3, 0.35, 0.0, 1.2], turn: 0.1, fwd: 0.05, head: 0.1 }],
    ],
    end: 0.75,
  },
  /** Doubled over, a hand clutching the gut, the blight retched up and flung out. */
  blightBolt: {
    keys: [
      [0.12, { R: [1.1, -0.2, 1.3, 2.5, 0.4], L: [0.45, -0.3, 0.9, 1.9, 0.4], fistL: 0.8, lean: 0.4, down: 0.2, head: 0.1 }, true],
      [0.2, { R: [1.55, 0.2, 0.3, 0.1, 1.1, -0.6], L: [0.45, -0.3, 0.9, 1.9, 0.4], fistL: 0.8, lean: 0.5, fwd: 0.15, down: 0.2, head: -0.1 }],
      [0.38, { R: [1.45, 0.25, 0.3, 0.2, 1.1, -0.5], L: [0.45, -0.3, 0.9, 1.9, 0.4], fistL: 0.8, lean: 0.42, fwd: 0.12, down: 0.18 }],
    ],
    end: 0.7,
  },
  /** Thumbs and fingers framing them, then the frame pulled wide: made bigger. */
  amplifyDamage: {
    keys: [
      [0.14, { R: [1.6, -0.25, 1.0, 1.1, 0.6, -0.3], L: [1.6, -0.25, 1.0, 1.1, 0.6, -0.3], fistR: 0.4, fistL: 0.4, head: 0.05 }, true],
      [0.26, { R: [1.6, 0.85, 0.0, 0.25, 0.6, -0.6], L: [1.6, 0.85, 0.0, 0.25, 0.6, -0.6], fistR: 0.1, fistL: 0.1, lean: 0.1 }],
      [0.48, { R: [1.55, 0.9, 0.0, 0.3, 0.6, -0.6], L: [1.55, 0.9, 0.0, 0.3, 0.6, -0.6], lean: 0.08 }],
    ],
    glow: 'both',
    end: 0.8,
  },
  /** Fists at the gut, then a heave that throws the head forward and the arms down and back. */
  poisonNova: {
    keys: [
      [0.16, { R: [0.5, -0.2, 0.9, 2.0, 0.4], L: [0.5, -0.2, 0.9, 2.0, 0.4], fistR: 1, fistL: 1, lean: 0.05, head: -0.15, down: -0.04 }, true],
      [0.26, { R: [-0.35, 0.45, 0.0, 0.2, 0.4], L: [-0.35, 0.45, 0.0, 0.2, 0.4], fistR: CLAW, fistL: CLAW, lean: 0.65, down: 0.3, head: 0.1 }],
      [0.46, { R: [-0.3, 0.45, 0.0, 0.25, 0.4], L: [-0.3, 0.45, 0.0, 0.25, 0.4], lean: 0.6, down: 0.28 }],
    ],
    glow: 'both',
    end: 0.85,
  },
  /** Claws up beside the face like a mask, then lunged at them. */
  terror: {
    keys: [
      [0.14, { R: [1.65, 0.55, 0.0, 2.3, 0.4], L: [1.65, 0.55, 0.0, 2.3, 0.4], fistR: CLAW, fistL: CLAW, head: 0.15, lean: -0.05 }, true],
      [0.24, { R: [1.6, 0.5, 0.0, 0.45, 0.4], L: [1.6, 0.5, 0.0, 0.45, 0.4], fistR: CLAW, fistL: CLAW, lean: 0.35, fwd: 0.35, head: 0.15 }],
      [0.44, { R: [1.55, 0.5, 0.0, 0.5, 0.4], L: [1.55, 0.5, 0.0, 0.5, 0.4], lean: 0.32, fwd: 0.32, head: 0.12 }],
    ],
    steps: [step('L', 0.1, 0.55)],
    glow: 'both',
    end: 0.8,
  },
  /** A finger pointed down at the body, then the fist closed and twisted: pop. */
  corpseExplosion: {
    keys: [
      [0.12, { R: [0.95, 0.1, 0.3, 0.1, 1.2, -0.3], fistR: 0.4, lean: 0.15, head: 0.2 }, true],
      [0.22, { R: [1.0, 0.1, 0.3, 0.45, -0.5, -0.3], fistR: 1, lean: 0.2, down: 0.12, head: 0.2, turn: -0.15 }],
      [0.42, { R: [0.95, 0.1, 0.3, 0.5, -0.5, -0.3], fistR: 1, lean: 0.18, down: 0.1, head: 0.18, turn: -0.12 }],
    ],
    end: 0.75,
  },
  /** A sigil traced in the air, a cross scored through it, then stabbed home. */
  doomBrand: {
    keys: [
      [0.1, { R: [1.95, 0.45, 0.0, 0.5, 1.0, -0.3], fistR: 0.4 }],
      [0.18, { R: [1.2, -0.2, 1.0, 0.6, 1.0, -0.3], fistR: 0.4 }],
      [0.26, { R: [1.95, -0.2, 1.0, 0.6, 1.0, -0.3], fistR: 0.4 }],
      [0.34, { R: [1.2, 0.45, 0.0, 0.5, 1.0, -0.3], fistR: 0.4 }],
      [0.44, { R: [1.55, 0.1, 0.3, 0.05, 1.2, -0.5], fistR: 0.4, lean: 0.2, fwd: 0.2 }],
    ],
    contact: 0.44,
    end: 0.8,
  },
  /** Hands wheeling around the temples, the head lolling with them. */
  massConfusion: {
    keys: [
      [0.1, { R: [2.1, 0.85, 0.0, 2.0, 0.4], L: [1.6, 0.85, 0.0, 2.2, 0.4], fistR: 0.3, fistL: 0.3, roll: 0.1 }],
      [0.2, { R: [1.6, 0.85, 0.0, 2.2, 0.4], L: [2.1, 0.85, 0.0, 2.0, 0.4], roll: -0.12 }],
      [0.3, { R: [2.1, 0.85, 0.0, 2.0, 0.4], L: [1.6, 0.85, 0.0, 2.2, 0.4], roll: 0.12 }],
      [0.4, { R: [1.4, 1.1, -0.2, 0.3, 0.6, -0.6], L: [1.4, 1.1, -0.2, 0.3, 0.6, -0.6], roll: 0.0, lean: 0.1 }],
    ],
    contact: 0.4,
    glow: 'both',
    end: 0.8,
  },
  /** Head down, arms hung open, swaying: the stink let roll off him. */
  pestilence: {
    keys: [
      [0.16, { R: [0.35, 0.6, -0.4, 0.3, -0.6], L: [0.35, 0.6, -0.4, 0.3, -0.6], fistR: 0.2, fistL: 0.2, head: 0.35, lean: 0.25, roll: 0.12, down: 0.15 }, true],
      [0.34, { R: [0.4, 0.75, -0.4, 0.3, -0.6], L: [0.4, 0.75, -0.4, 0.3, -0.6], head: 0.3, lean: 0.22, roll: -0.14, down: 0.18 }],
      [0.54, { R: [0.38, 0.7, -0.4, 0.3, -0.6], L: [0.38, 0.7, -0.4, 0.3, -0.6], head: 0.3, lean: 0.2, roll: 0.08, down: 0.16 }],
    ],
    contact: 0.34,
    glow: 'both',
    end: 0.9,
  },
  /** Claws hooked into the air before the chest and ripped down and apart. */
  lowerResist: {
    keys: [
      [0.14, { R: [1.7, -0.15, 0.9, 1.3, 0.4], L: [1.7, -0.15, 0.9, 1.3, 0.4], fistR: CLAW, fistL: CLAW, lean: -0.05 }, true],
      [0.24, { R: [0.45, 0.85, -0.1, 0.5, 0.4], L: [0.45, 0.85, -0.1, 0.5, 0.4], fistR: 1, fistL: 1, lean: 0.4, down: 0.25, head: 0.1 }],
      [0.44, { R: [0.4, 0.9, -0.1, 0.55, 0.4], L: [0.4, 0.9, -0.1, 0.55, 0.4], fistR: 1, fistL: 1, lean: 0.38, down: 0.22 }],
    ],
    glow: 'both',
    end: 0.8,
  },
};

// ---------------------------------------------------------------------------
// Gravepact: blood and souls
// ---------------------------------------------------------------------------

/** One beat of a drain: a claw reaching for them, the other hand at the heart. */
function drain(i: number): [number, G] {
  const pull = i === 1 ? 0.06 : 0;
  return [i * 0.5, { R: [1.5, 0.15, 0.3, 0.2 + pull, 1.0, -0.4], L: HEART, fistR: CLAW + pull, lean: -0.1 - pull, turn: 0.15, down: 0.08 }];
}

/** One beat of a wringing: both claws out at them, twisted against each other. */
function wring(i: number): [number, G] {
  const s = i === 1 ? 1 : -1;
  return [i * 0.5, { R: [1.45, 0.25, 0.4, 0.5, 0.4 + 0.7 * s, -0.3], L: [1.45, 0.25, 0.4, 0.5, 0.4 - 0.7 * s, -0.3], fistR: 0.85, fistL: 0.85, lean: 0.3, down: 0.15, head: 0.1 }];
}

const GRAVEPACT: Record<string, Spec> = {
  /** One claw out at them, the other hand on his own heart, leaning back to pull. */
  siphonLife: {
    loop: true,
    keys: [drain(0), drain(1), drain(2)],
  },
  /** The wand drawn across his own palm, then the bleeding fist raised high. */
  bloodPact: {
    keys: [
      [0.14, { L: [1.2, 0.2, -0.5, 1.4, -0.8], R: [1.25, -0.35, 1.0, 1.6, 0.3], head: 0.25, lean: 0.12 }, true],
      [0.22, { L: [1.2, 0.2, -0.5, 1.4, -0.8], R: [1.2, 0.6, 0.2, 0.9, 0.3], head: 0.25, lean: 0.12 }],
      [0.4, { L: [2.65, 0.3, 0.3, 0.6, 0.4], R: [0.4, 0.4, 0.2, 1.0, 0.3], fistL: 1, head: -0.3, lean: -0.15 }],
      [0.66, { L: [2.6, 0.3, 0.3, 0.65, 0.4], R: [0.4, 0.4, 0.2, 1.0, 0.3], fistL: 1, head: -0.25, lean: -0.12 }],
    ],
    contact: 0.4,
    glow: 'left',
    end: 1.0,
  },
  /** A crouch that sinks into the floor, then a claw thrust up out of it where he rises. */
  gravewalk: {
    keys: [
      [0.16, { R: [0.3, 0.4, -0.3, 0.4, -0.6], L: [0.3, 0.4, -0.3, 0.4, -0.6], fistR: CLAW, fistL: CLAW, head: 0.2, lean: 0.3, down: 0.25 }, true],
      [0.34, { R: [0.3, 0.55, -0.6, 0.15, -1.2], L: [0.3, 0.55, -0.6, 0.15, -1.2], fistR: 0, fistL: 0, head: 0.4, lean: 0.45, down: 0.55 }],
      [0.6, { R: [2.6, 0.3, 0.3, 0.65, 0.4], L: [0.6, 0.4, 0.2, 1.0, 0.3], fistR: CLAW, head: -0.25, lean: -0.1, down: 0.05 }],
    ],
    contact: 0.34,
    glow: 'right',
    end: 0.85,
  },
  /** A claw snapped shut on the soul, pulled to the chest and cupped in the other hand. */
  soulCage: {
    keys: [
      [0.1, { R: [1.55, 0.1, 0.3, 0.1, 1.0, -0.5], fistR: 0, lean: 0.2, fwd: 0.15 }, true],
      [0.18, { R: [1.5, 0.1, 0.3, 0.2, 1.0, -0.5], fistR: 1, lean: 0.22, fwd: 0.15 }],
      [0.34, { R: [1.0, -0.2, 1.0, 2.0, 0.4], L: [1.1, -0.5, 1.2, 2.1, 0.4], fistR: 1, fistL: 0.6, lean: -0.05, head: 0.2 }],
      [0.58, { R: [1.0, -0.2, 1.0, 2.0, 0.4], L: [1.1, -0.5, 1.2, 2.1, 0.4], fistR: 1, fistL: 0.6, head: 0.2 }],
    ],
    contact: 0.18,
    glow: 'both',
    end: 0.9,
  },
  /** Both claws out at them, wringing against each other like a wet rag. */
  exsanguinate: {
    loop: true,
    keys: [wring(0), wring(1), wring(2)],
  },
  /** Arched back with a scream, arms wrenched behind, then dropped into a beast's crouch. */
  revenantForm: {
    keys: [
      [0.2, { R: [-0.55, 0.65, 0.0, 0.5, 0.4], L: [-0.55, 0.65, 0.0, 0.5, 0.4], fistR: CLAW, fistL: CLAW, lean: -0.38, head: -0.5, down: -0.05 }, true],
      [0.36, { R: [0.95, 0.55, 0.2, 1.2, 0.4], L: [0.95, 0.55, 0.2, 1.2, 0.4], fistR: 0.7, fistL: 0.7, lean: 0.5, down: 0.5, head: -0.25 }],
      [0.64, { R: [0.9, 0.55, 0.2, 1.25, 0.4], L: [0.9, 0.55, 0.2, 1.25, 0.4], fistR: 0.7, fistL: 0.7, lean: 0.48, down: 0.48, head: -0.22 }],
    ],
    contact: 0.36,
    glow: 'both',
    end: 1.05,
  },
  /** The wand turned on his own heart and driven in, then the arms flung wide as it bursts. */
  sanguineNova: {
    keys: [
      [0.16, { R: [1.0, -0.5, 1.2, 2.3, 0.4], L: [1.05, -0.55, 1.25, 2.2, 0.4], fistR: 1, fistL: 1, lean: 0.35, head: 0.35, down: 0.15 }, true],
      [0.28, { R: [0.5, 1.35, -0.2, 0.25, 0.6, -0.6], L: [0.5, 1.35, -0.2, 0.25, 0.6, -0.6], fistR: CLAW, fistL: CLAW, lean: -0.25, head: -0.35 }],
      [0.5, { R: [0.45, 1.35, -0.2, 0.3, 0.6, -0.6], L: [0.45, 1.35, -0.2, 0.3, 0.6, -0.6], lean: -0.2, head: -0.3 }],
    ],
    glow: 'both',
    end: 0.9,
  },
  /** Invisible threads hauled in hand over hand. */
  soulTether: {
    keys: [
      [0.1, { R: [1.5, 0.15, 0.3, 0.2, 0.4], L: [0.9, 0.2, 0.5, 1.6, 0.4], fistR: 1, fistL: 1, lean: 0.15 }],
      [0.2, { R: [0.8, 0.25, 0.4, 1.7, 0.4], L: [1.5, 0.15, 0.3, 0.2, 0.4], fistR: 1, fistL: 1, lean: -0.05, turn: 0.15 }],
      [0.3, { R: [1.5, 0.15, 0.3, 0.2, 0.4], L: [0.8, 0.25, 0.4, 1.7, 0.4], fistR: 1, fistL: 1, lean: -0.1, turn: -0.15 }],
      [0.42, { R: [0.7, 0.3, 0.4, 1.8, 0.4], L: [0.7, 0.3, 0.4, 1.8, 0.4], fistR: 1, fistL: 1, lean: -0.15, fwd: -0.1 }],
    ],
    contact: 0.1,
    glow: 'both',
    end: 0.75,
  },
  /** Both hands on an unseen scythe, swept low through them at the knee. */
  reaping: {
    keys: [
      [0.16, { R: [0.6, 0.9, -0.2, 0.6, 0.3], L: [0.9, 0.5, 0.2, 1.1, 0.3], fistR: 1, fistL: 1, turn: -0.85, lean: 0.1 }, true],
      [0.28, { R: [0.95, -0.35, 1.0, 0.5, 0.3], L: [0.75, -0.2, 1.0, 1.2, 0.3], fistR: 1, fistL: 1, turn: 0.75, lean: 0.4, down: 0.35 }],
      [0.48, { R: [0.9, -0.4, 1.0, 0.55, 0.3], L: [0.7, -0.25, 1.0, 1.25, 0.3], fistR: 1, fistL: 1, turn: 0.85, lean: 0.38, down: 0.32 }],
    ],
    steps: [step('L', 0.14, 0.45, 0.2)],
    glow: 'both',
    end: 0.85,
  },
};

defineGestures({ ...OSSUARY, ...BLIGHT, ...GRAVEPACT });

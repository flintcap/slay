/**
 * SLAY — one gesture per skill.
 *
 * Skills used to share a dozen clips by effect family, so a fire nova, a
 * frost nova and a war stomp were the same stamp, and every bolt in the game
 * was the same overhand throw. Here each skill names its own action, played
 * as `skill.<id>` (see `clipFor` in `scenes/SkillRunner.ts`). Each one is a
 * few key poses read in plain words: where the hands go, how the trunk turns,
 * and where the weight goes.
 *
 * A gesture that names the off hand lets go of a two-handed staff for it; one
 * that leaves the off hand alone keeps it on the haft.
 *
 * Arm numbers are `Pose.arm` order: raise forward, raise out, internal turn,
 * elbow, forearm turn, wrist flex, wrist tilt. The left arm is mirrored, so
 * the same numbers on both arms make a symmetric pose.
 */
import { CH, type Pose, type Side } from './Pose';
import { kit, registerAction, type ActionCtx, type ActionDef, type ActionKey, type ActionStep, type Place } from './Actions';

const { k, rest, place, trunk, weight, glowAt } = kit;

/** One key pose of a gesture. Anything left out stays at the stance. */
interface G {
  R?: Place;
  L?: Place;
  /** Trunk turn (+ to the character's left), lean (+ forward), roll. */
  turn?: number;
  lean?: number;
  roll?: number;
  /** Weight forward, down and to the left, heads. */
  fwd?: number;
  down?: number;
  side?: number;
  /** Extra head tip, + down. */
  head?: number;
  /** Finger curl, 1 a fist. */
  fistR?: number;
  fistL?: number;
}

interface Spec {
  /** [time, pose, held] after the opening rest key. */
  keys: Array<[number, G, boolean?]>;
  /** Natural time of the release key. */
  contact?: number;
  /** Natural time it is back at rest. Loops have none. */
  end?: number;
  steps?: ActionStep[];
  glow?: 'left' | 'right' | 'both';
  loop?: boolean;
}

function pose(g: G): (p: Pose, c: ActionCtx) => void {
  return (p, c) => {
    if (g.R) place(p, c, 'R', g.R);
    if (g.L) {
      // The off hand leaves a two-handed haft to make the gesture.
      p.c[CH.offGrip] = 0;
      place(p, c, 'L', g.L);
    }
    if (g.fistR !== undefined) p.fist('R', g.fistR);
    if (g.fistL !== undefined) p.fist('L', g.fistL);
    trunk(p, g.turn ?? 0, g.lean ?? 0, g.roll ?? 0);
    if (g.head) p.add('head', g.head, 0, 0);
    weight(p, c, g.fwd ?? 0, g.down ?? 0, g.side ?? 0);
  };
}

function gesture(s: Spec): ActionDef {
  const keys: ActionKey[] = s.loop ? [] : [k(0, rest)];
  for (const [t, g, hold] of s.keys) keys.push(k(t, pose(g), hold ?? false));
  if (!s.loop) keys.push(k(s.end ?? 0.8, rest));
  const def: ActionDef = { keys, full: true, plantFeet: true };
  if (s.loop) {
    def.loop = true;
    def.glow = { at: () => 1, hands: s.glow ?? 'both' };
  } else {
    const c = s.contact ?? s.keys[1]?.[0] ?? 0.25;
    const end = s.end ?? 0.8;
    def.contact = c;
    def.event = 'release';
    def.recover = c + (end - c) * 0.45;
    def.glow = { at: glowAt(Math.min(0.04, c * 0.3), c, c + (end - c) * 0.5), hands: s.glow ?? 'right' };
  }
  if (s.steps) def.steps = s.steps;
  return def;
}

// ---------------------------------------------------------------------------
// Hand places used more than once
// ---------------------------------------------------------------------------

/** Straight ahead at the shoulder, palm out. */
const PUSH: Place = [1.45, 0.2, 0.75, 0.3, 1.1, -0.9];
/** Straight up. */
const UP: Place = [2.95, 0.2, 0.3, 0.15, 0.5, -0.3];
/** Hanging easy at the side. */
const DOWN: Place = [0.15, 0.35, 0, 0.5, 0.2];
/** Out to the side at the shoulder. */
const OUT: Place = [0.25, 1.45, 0.2, 0.2, 0.6, -0.6];
/** Arms crossed in front of the chest. */
const CROSS: Place = [1.0, -0.45, 1.1, 1.9, 0.4];

const step = (side: Side, t: number, dz: number, dx = 0, land = t + 0.14): ActionStep => ({ t, side, dx, dz, lift: 0.2, land });

// ---------------------------------------------------------------------------
// Mage — fire
// ---------------------------------------------------------------------------

const MAGE_FIRE: Record<string, Spec> = {
  /** A sidearm flick from the hip. */
  firebolt: {
    keys: [
      [0.1, { R: [0.3, 0.6, -0.3, 1.8, 0.2, 0.5], turn: -0.35, fistR: 0.6 }, true],
      [0.18, { R: [1.3, 0.35, 0.2, 0.2, 1.2, -0.8], turn: 0.2, fwd: 0.08, fistR: 0 }],
      [0.32, { R: [1.05, 0.2, 0.5, 0.4, 1.0, -0.5], turn: 0.28, fwd: 0.06 }],
    ],
    end: 0.6,
  },
  /** Fists drawn into the chest in a crouch, then flung out and up. */
  emberNova: {
    keys: [
      [0.16, { R: [0.7, -0.3, 1.1, 2.3], L: [0.7, -0.3, 1.1, 2.3], lean: 0.25, down: 0.35, fistR: 1, fistL: 1 }, true],
      [0.26, { R: [0.6, 1.6, -0.3, 0.2, 0.8, -0.8], L: [0.6, 1.6, -0.3, 0.2, 0.8, -0.8], lean: -0.15, down: -0.05, head: -0.15, fistR: 0, fistL: 0 }],
      [0.45, { R: [0.5, 1.5, -0.3, 0.3, 0.8, -0.6], L: [0.5, 1.5, -0.3, 0.3, 0.8, -0.6], lean: -0.1 }],
    ],
    glow: 'both',
  },
  /** Both hands drawn back to the hip, then driven straight ahead with a step. */
  flameLance: {
    keys: [
      [0.16, { R: [0.1, 0.25, 0.9, 1.9, 0.7], L: [0.35, -0.25, 1.1, 1.9, 0.7], turn: -0.5, fwd: -0.08 }, true],
      [0.26, { R: [1.35, 0.0, 0.9, 0.15, 1.1, -0.9], L: [1.35, -0.05, 0.9, 0.15, 1.1, -0.9], turn: 0.15, lean: 0.25, fwd: 0.35 }],
      [0.42, { R: [1.3, 0.05, 0.9, 0.25, 1.1, -0.7], L: [1.3, 0.0, 0.9, 0.25, 1.1, -0.7], turn: 0.12, lean: 0.22, fwd: 0.32 }],
    ],
    steps: [step('L', 0.12, 0.6)],
    glow: 'both',
    end: 0.78,
  },
  /** Both hands up behind the head, then lobbed forward. */
  fireball: {
    keys: [
      [0.18, { R: [2.8, 0.35, 0.6, 1.6, 0.6, 0.2], L: [2.8, 0.35, 0.6, 1.6, 0.6, 0.2], lean: -0.2, head: -0.1 }, true],
      [0.28, { R: [1.9, 0.25, 0.7, 0.3, 1.0, -0.8], L: [1.9, 0.25, 0.7, 0.3, 1.0, -0.8], lean: 0.2, fwd: 0.15 }],
      [0.46, { R: [1.4, 0.3, 0.6, 0.4, 1.0, -0.6], L: [1.4, 0.3, 0.6, 0.4, 1.0, -0.6], lean: 0.18, fwd: 0.12 }],
    ],
    glow: 'both',
    end: 0.85,
  },
  /** Braced: one palm out, the other hand gripping the wrist, flame pouring. */
  infernoStream: {
    loop: true,
    keys: [0, 0.5, 1.0].map((t, i): [number, G] => [
      t,
      {
        R: [1.35, 0.15, 0.3, 0.25, 0.2, 0.7],
        L: [1.25, -0.4, 1.25, 1.1, 0.6, -0.2],
        turn: 0.15 + 0.03 * (i === 1 ? 1 : -1),
        lean: 0.18,
        down: 0.15 + 0.03 * (i === 1 ? 1 : 0),
        fistL: 0.8,
      },
    ]),
  },
  /** Both hands raised, then both palms slammed to the floor ahead. */
  blastWave: {
    keys: [
      [0.18, { R: [2.7, 0.4, 0.4, 0.6, 0.6, -0.3], L: [2.7, 0.4, 0.4, 0.6, 0.6, -0.3], lean: -0.15, down: -0.05 }, true],
      [0.28, { R: [0.55, 0.25, 0.4, 0.15, 1.0, -1.1], L: [0.55, 0.25, 0.4, 0.15, 1.0, -1.1], lean: 0.6, down: 0.7 }],
      [0.5, { R: [0.55, 0.3, 0.4, 0.2, 1.0, -1.1], L: [0.55, 0.3, 0.4, 0.2, 1.0, -1.1], lean: 0.58, down: 0.68 }],
    ],
    glow: 'both',
    end: 0.9,
  },
  /** A low sweep across the floor, like sowing seed. */
  pyroclasm: {
    keys: [
      [0.14, { R: [1.0, -0.4, 1.2, 0.6, 0.8, -0.6], turn: 0.4, lean: 0.1 }, true],
      [0.26, { R: [0.7, 1.1, 0.0, 0.2, 0.2, 0.3], turn: -0.45, lean: 0.3, down: 0.2, side: -0.1 }],
      [0.48, { R: [0.5, 1.4, -0.2, 0.2, 0.2, 0.3], turn: -0.6, lean: 0.28, down: 0.2, side: -0.12 }],
    ],
    steps: [step('R', 0.1, 0.15, -0.4)],
    end: 0.85,
  },
  /** Palms turned up and lifted all the way overhead, eyes on the sky. */
  firestorm: {
    keys: [
      [0.16, { R: [0.4, 0.4, -0.6, 1.4, -0.8], L: [0.4, 0.4, -0.6, 1.4, -0.8], lean: 0.1, down: 0.1 }, true],
      [0.3, { R: [3.0, 0.5, 0.0, 0.2, -0.4, 0.4], L: [3.0, 0.5, 0.0, 0.2, -0.4, 0.4], lean: -0.25, head: -0.35, down: -0.06 }],
      [0.6, { R: [2.9, 0.55, 0.0, 0.3, -0.4, 0.4], L: [2.9, 0.55, 0.0, 0.3, -0.4, 0.4], lean: -0.22, head: -0.3 }],
    ],
    glow: 'both',
    end: 1.0,
  },
  /** Hands cupped at the mouth, a breath drawn, then thrown wide ahead. */
  dragonsBreath: {
    keys: [
      [0.2, { R: [1.0, -0.15, 1.3, 2.5, 0.7, -0.3], L: [1.0, -0.15, 1.3, 2.5, 0.7, -0.3], lean: -0.2, down: -0.04 }, true],
      [0.3, { R: [1.4, 0.45, 0.6, 0.25, 1.1, -0.9], L: [1.4, 0.45, 0.6, 0.25, 1.1, -0.9], lean: 0.3, fwd: 0.2 }],
      [0.5, { R: [1.35, 0.55, 0.5, 0.3, 1.1, -0.8], L: [1.35, 0.55, 0.5, 0.3, 1.1, -0.8], lean: 0.26, fwd: 0.18 }],
    ],
    glow: 'both',
    end: 0.85,
  },
  /** Hands clasped high in a back-bend, then brought down like a hammer. */
  annihilate: {
    keys: [
      [0.25, { R: [2.9, -0.1, 0.9, 1.3, 0.8], L: [2.9, -0.1, 0.9, 1.3, 0.8], lean: -0.25, down: -0.05, fistR: 1, fistL: 1 }, true],
      [0.35, { R: [1.0, -0.1, 0.9, 0.2, 1.0, -0.6], L: [1.0, -0.1, 0.9, 0.2, 1.0, -0.6], lean: 0.55, down: 0.45, fwd: 0.2 }],
      [0.6, { R: [0.9, -0.1, 0.9, 0.3, 1.0, -0.5], L: [0.9, -0.1, 0.9, 0.3, 1.0, -0.5], lean: 0.5, down: 0.42, fwd: 0.18 }],
    ],
    glow: 'both',
    end: 1.0,
  },
};

// ---------------------------------------------------------------------------
// Mage — lightning
// ---------------------------------------------------------------------------

const MAGE_LIGHTNING: Record<string, Spec> = {
  /** A quick two-finger jab at eye height. */
  sparkbolt: {
    keys: [
      [0.08, { R: [1.1, 0.1, 0.5, 2.2, 0.6, -0.2], turn: -0.15, fistR: 0.6 }, true],
      [0.14, { R: [1.6, 0.0, 0.1, 0.0, 1.3, -0.3], turn: 0.1, fwd: 0.05 }],
      [0.28, { R: [1.5, 0.05, 0.15, 0.15, 1.2, -0.3], turn: 0.08, fwd: 0.04 }],
    ],
    end: 0.5,
  },
  /** Arms crossed high, then snapped open. */
  shockNova: {
    keys: [
      [0.14, { R: [1.2, -0.45, 1.0, 1.6], L: [1.2, -0.45, 1.0, 1.6], down: 0.1, fistR: 1, fistL: 1 }, true],
      [0.22, { R: [1.0, 1.2, -0.4, 0.2, 0.6, -0.9], L: [1.0, 1.2, -0.4, 0.2, 0.6, -0.9], lean: -0.05, fistR: 0, fistL: 0 }],
      [0.4, { R: [0.9, 1.25, -0.4, 0.3, 0.6, -0.7], L: [0.9, 1.25, -0.4, 0.3, 0.6, -0.7] }],
    ],
    glow: 'both',
    end: 0.7,
  },
  /** A backhand whip from the far shoulder out across the room. */
  chainLightning: {
    keys: [
      [0.12, { R: [1.2, -0.5, 1.4, 1.8, 0.8, 0.4], turn: 0.5 }, true],
      [0.2, { R: [1.3, 0.9, -0.3, 0.1, 0.6, -0.6], turn: -0.35, fwd: 0.05 }],
      [0.38, { R: [1.0, 1.3, -0.4, 0.2, 0.6, -0.5], turn: -0.5 }],
    ],
    end: 0.7,
  },
  /** Arms wide, then a clap in front of the chest. */
  thunderclap: {
    keys: [
      [0.15, { R: [1.1, 1.3, 0.2, 0.4], L: [1.1, 1.3, 0.2, 0.4], lean: -0.1 }, true],
      [0.22, { R: [1.35, -0.2, 1.4, 0.4, 0.2, 0], L: [1.35, -0.2, 1.4, 0.4, 0.2, 0], lean: 0.15, down: 0.1 }],
      [0.4, { R: [1.3, -0.15, 1.4, 0.5, 0.2, 0], L: [1.3, -0.15, 1.4, 0.5, 0.2, 0], lean: 0.12, down: 0.08 }],
    ],
    glow: 'both',
    end: 0.7,
  },
  /** One arm straight up to the sky, then pulled down at the target. */
  lightningStrike: {
    keys: [
      [0.16, { R: UP, L: [0.3, 0.5, 0, 1.2], lean: -0.1, head: -0.2 }, true],
      [0.26, { R: [1.0, 0.2, 0.3, 0.1, 1.2, -0.4], L: [-0.2, 0.5, 0, 1.4], lean: 0.25, down: 0.15, fistL: 1 }],
      [0.45, { R: [0.95, 0.2, 0.3, 0.15, 1.2, -0.4], L: [-0.15, 0.5, 0, 1.3], lean: 0.22, down: 0.12 }],
    ],
    end: 0.8,
  },
  /** An orb cradled at the hip in both hands and pushed off underhand. */
  tempestOrb: {
    keys: [
      [0.16, { R: [0.2, 0.2, -0.5, 1.7, -0.8], L: [0.45, -0.1, -0.5, 1.7, -0.8], turn: -0.3, down: 0.2 }, true],
      [0.26, { R: [1.1, 0.25, -0.2, 0.3, -0.6, 0.2], L: [1.1, 0.25, -0.2, 0.3, -0.6, 0.2], turn: 0.05, fwd: 0.2, lean: 0.15 }],
      [0.44, { R: [1.0, 0.3, -0.2, 0.4, -0.6, 0.2], L: [1.0, 0.3, -0.2, 0.4, -0.6, 0.2], fwd: 0.15, lean: 0.12 }],
    ],
    glow: 'both',
    end: 0.8,
  },
  /** Arms spread wide and lifted, head back: calling the storm in. */
  thunderstorm: {
    keys: [
      [0.14, { R: [0.3, 0.6, 0, 0.6], L: [0.3, 0.6, 0, 0.6], down: 0.12 }, true],
      [0.3, { R: [2.2, 1.4, -0.4, 0.2, -0.5, 0.3], L: [2.2, 1.4, -0.4, 0.2, -0.5, 0.3], lean: -0.25, head: -0.35, down: -0.04 }],
      [0.6, { R: [2.1, 1.45, -0.4, 0.25, -0.5, 0.3], L: [2.1, 1.45, -0.4, 0.25, -0.5, 0.3], lean: -0.22, head: -0.3 }],
    ],
    glow: 'both',
    end: 1.0,
  },
  /** Bowled underhand off a long lunge. */
  ballLightning: {
    keys: [
      [0.16, { R: [-0.6, 0.3, 0.2, 0.4, -0.6], L: [0.6, 0.7, 0, 0.8], turn: -0.4, down: 0.15 }, true],
      [0.26, { R: [1.0, 0.15, 0.1, 0.15, -0.7, 0.3], L: [0.6, 1.0, 0, 0.6], lean: 0.35, fwd: 0.3, down: 0.35 }],
      [0.46, { R: [1.1, 0.15, 0.1, 0.2, -0.7, 0.3], L: [0.5, 1.0, 0, 0.7], lean: 0.32, fwd: 0.28, down: 0.32 }],
    ],
    steps: [step('L', 0.1, 0.9)],
    end: 0.85,
  },
  /** A javelin: the free hand aims, the throwing hand comes over the top. */
  skyLance: {
    keys: [
      [0.2, { R: [2.0, 0.9, -1.4, 1.6, 0, 0.3], L: [1.6, 0.1, 0.3, 0.1, 1.1, -0.5], turn: -0.7, lean: -0.15 }, true],
      [0.28, { R: [1.8, 0.0, 0.6, 0.1, 0.6, -0.4], L: [0.2, 0.4, 0, 1.0], turn: 0.45, lean: 0.3, fwd: 0.3 }],
      [0.46, { R: [1.2, -0.1, 0.8, 0.3, 0.6, -0.3], L: [0.1, 0.45, 0, 1.1], turn: 0.55, lean: 0.35, fwd: 0.32 }],
    ],
    steps: [step('L', 0.14, 0.6)],
    end: 0.85,
  },
  /** Palms pressed down over the floor, spreading the charge out. */
  ionize: {
    keys: [
      [0.15, { R: [0.9, 0.4, 0.8, 2.0, 0.6, -0.8], L: [0.9, 0.4, 0.8, 2.0, 0.6, -0.8] }, true],
      [0.3, { R: [0.7, 0.7, 0.3, 0.3, 0.6, -1.2], L: [0.7, 0.7, 0.3, 0.3, 0.6, -1.2], lean: 0.3, down: 0.45 }],
      [0.55, { R: [0.65, 0.85, 0.3, 0.3, 0.6, -1.2], L: [0.65, 0.85, 0.3, 0.3, 0.6, -1.2], lean: 0.28, down: 0.42 }],
    ],
    glow: 'both',
    end: 0.9,
  },
  /** Wound up to one side and spun out with the arms flung wide. */
  eyeOfTheStorm: {
    keys: [
      [0.15, { R: CROSS, L: CROSS, turn: -0.9, down: 0.15, fistR: 1, fistL: 1 }, true],
      [0.25, { R: OUT, L: OUT, turn: 0.6, down: 0.05, fistR: 0, fistL: 0 }],
      [0.45, { R: [0.3, 1.4, 0.2, 0.25, 0.6, -0.6], L: [0.3, 1.4, 0.2, 0.25, 0.6, -0.6], turn: 0.9 }],
    ],
    steps: [step('R', 0.12, -0.2, -0.3)],
    glow: 'both',
    end: 0.85,
  },
  /** Palms up from a crouch, lifting something heavy out of the floor. */
  heavensGate: {
    keys: [
      [0.16, { R: [0.4, 0.3, -0.7, 1.0, -0.8, 0.2], L: [0.4, 0.3, -0.7, 1.0, -0.8, 0.2], down: 0.4, lean: 0.25 }, true],
      [0.3, { R: [2.3, 0.3, -0.5, 0.2, -0.8, 0.4], L: [2.3, 0.3, -0.5, 0.2, -0.8, 0.4], down: -0.08, lean: -0.15 }],
      [0.55, { R: [2.25, 0.35, -0.5, 0.25, -0.8, 0.4], L: [2.25, 0.35, -0.5, 0.25, -0.8, 0.4], down: -0.06, lean: -0.12 }],
    ],
    glow: 'both',
    end: 0.95,
  },
};

// ---------------------------------------------------------------------------
// Mage — cold
// ---------------------------------------------------------------------------

const MAGE_COLD: Record<string, Spec> = {
  /** A backhand flick with the free hand. */
  frostShard: {
    keys: [
      [0.1, { L: [0.4, -0.5, 1.2, 1.6, 0.4, 0.5], turn: -0.3, fistL: 0.6 }, true],
      [0.16, { L: [1.4, 0.6, -0.2, 0.1, 0.9, -0.7], turn: 0.3, fistL: 0 }],
      [0.3, { L: [1.1, 0.9, -0.3, 0.2, 0.8, -0.5], turn: 0.35 }],
    ],
    glow: 'left',
    end: 0.55,
  },
  /** Down on a knee, the free palm slapped flat to the floor. */
  frostNova: {
    keys: [
      [0.16, { R: [2.2, 0.9, 0, 0.3], L: [1.2, 0.5, 0.3, 0.8, 0.6, -0.8], lean: 0.3, down: 0.5 }, true],
      [0.26, { R: [2.0, 1.0, 0, 0.3], L: [0.4, 0.35, 0.3, 0.1, 0.9, -1.2], lean: 0.55, down: 1.1 }],
      [0.5, { R: [1.9, 1.0, 0, 0.35], L: [0.4, 0.35, 0.3, 0.15, 0.9, -1.2], lean: 0.52, down: 1.05 }],
    ],
    steps: [step('R', 0.04, 0.7)],
    glow: 'left',
    end: 0.9,
  },
  /** A rising stab from low behind, the free hand drawn back. */
  iceLance: {
    keys: [
      [0.16, { R: [-0.4, 0.3, 0.5, 1.5, 0.5], L: [1.2, 0.2, 0.6, 0.6], turn: -0.5, down: 0.2 }, true],
      [0.24, { R: [1.7, 0.05, 0.4, 0.05, 1.1, -0.6], L: [-0.1, 0.5, 0, 1.0], turn: 0.4, lean: 0.1, fwd: 0.25, down: -0.05 }],
      [0.42, { R: [1.6, 0.1, 0.4, 0.15, 1.1, -0.5], L: [-0.05, 0.5, 0, 1.1], turn: 0.38, lean: 0.1, fwd: 0.22 }],
    ],
    steps: [step('L', 0.1, 0.55)],
    end: 0.8,
  },
  /** Hugging the shoulders, then a flex: fists down at the sides, chest out. */
  iceArmor: {
    keys: [
      [0.2, { R: [1.0, -0.6, 1.3, 2.3, 0.3], L: [1.0, -0.6, 1.3, 2.3, 0.3], lean: 0.3, down: 0.2, head: 0.2 }, true],
      [0.32, { R: [0.1, 0.6, -0.3, 0.6, 0.2], L: [0.1, 0.6, -0.3, 0.6, 0.2], lean: -0.18, head: -0.1, fistR: 1, fistL: 1 }],
      [0.5, { R: [0.1, 0.55, -0.3, 0.65, 0.2], L: [0.1, 0.55, -0.3, 0.65, 0.2], lean: -0.15 }],
    ],
    glow: 'both',
    end: 0.9,
  },
  /** Cocked high over the shoulder and chopped down across the body. */
  glacialSpike: {
    keys: [
      [0.18, { R: [2.8, 0.6, -0.6, 1.9, 0, 0.4], L: [1.2, 0.3, 0.4, 0.5], turn: -0.4, lean: -0.2 }, true],
      [0.26, { R: [0.9, -0.3, 0.8, 0.2, 0.8, -0.6], L: [0.3, 0.5, 0, 0.9], turn: 0.4, lean: 0.45, down: 0.25 }],
      [0.44, { R: [0.6, -0.4, 0.9, 0.3, 0.8, -0.5], L: [0.25, 0.5, 0, 0.9], turn: 0.45, lean: 0.48, down: 0.25 }],
    ],
    end: 0.8,
  },
  /** Both hands low together, then smoothed apart over the floor. */
  rimeField: {
    keys: [
      [0.16, { R: [0.6, -0.3, 0.8, 0.9, 0.9, -1.0], L: [0.6, -0.3, 0.8, 0.9, 0.9, -1.0], turn: 0.5, lean: 0.4, down: 0.5 }, true],
      [0.3, { R: [0.55, 0.9, 0.2, 0.2, 0.9, -1.1], L: [0.55, 0.9, 0.2, 0.2, 0.9, -1.1], lean: 0.42, down: 0.55 }],
      [0.55, { R: [0.5, 1.1, 0.2, 0.2, 0.9, -1.1], L: [0.5, 1.1, 0.2, 0.2, 0.9, -1.1], lean: 0.4, down: 0.52 }],
    ],
    glow: 'both',
    end: 0.9,
  },
  /** Both hands overhead, stirring the sky round. */
  blizzard: {
    keys: [
      [0.15, { R: [2.8, 0.5, 0, 0.5], L: [2.6, 0.7, 0, 0.6], head: -0.25, lean: -0.1 }, true],
      [0.25, { R: [2.9, -0.2, 0.6, 0.6], L: [2.7, 0.9, -0.2, 0.4], head: -0.3, lean: -0.15, roll: 0.1 }],
      [0.35, { R: [2.7, 0.8, 0.3, 0.4], L: [2.9, -0.1, 0.6, 0.6], head: -0.3, lean: -0.15, roll: -0.1 }],
      [0.5, { R: [2.85, 0.3, 0.3, 0.5], L: [2.8, 0.4, 0.2, 0.5], head: -0.25, lean: -0.12 }],
    ],
    contact: 0.25,
    glow: 'both',
    end: 0.9,
  },
  /** A crouch, then a spring up onto the toes as the body goes. */
  frostStep: {
    keys: [
      [0.1, { R: [-0.5, 0.4, 0, 0.6], L: [-0.5, 0.4, 0, 0.6], lean: 0.4, down: 0.6 }, true],
      [0.16, { R: [2.2, 0.3, 0.4, 0.4], L: [2.2, 0.3, 0.4, 0.4], lean: -0.1, down: -0.15 }],
      [0.3, { R: [1.6, 0.4, 0.4, 0.5], L: [1.6, 0.4, 0.4, 0.5], down: -0.05 }],
    ],
    glow: 'both',
    end: 0.55,
  },
  /** A shot put: the free hand aims, the orb is driven out from the neck. */
  frozenOrb: {
    keys: [
      [0.2, { R: [1.3, 0.9, -1.2, 2.5, -0.8, 0.6], L: [1.5, 0.3, 0.6, 0.2, 1.0, -0.6], turn: -0.6, down: 0.25, lean: -0.1 }, true],
      [0.28, { R: [1.75, 0.2, 0.2, 0.1, 0.9, -0.8], L: [0.0, 0.4, 0, 1.2], turn: 0.5, fwd: 0.3, down: -0.05 }],
      [0.45, { R: [1.6, 0.25, 0.3, 0.2, 0.9, -0.6], L: [0.0, 0.45, 0, 1.2], turn: 0.55, fwd: 0.28 }],
    ],
    end: 0.85,
  },
  /** One hand from the lips, fanned out ahead: a breath of winter. */
  wintersBreath: {
    keys: [
      [0.2, { L: [1.1, -0.2, 1.4, 2.6, 0.6, -0.3], lean: -0.2, turn: 0.2 }, true],
      [0.3, { L: [1.4, 0.7, 0.2, 0.2, 1.0, -0.9], lean: 0.25, turn: -0.15, fwd: 0.1 }],
      [0.5, { L: [1.3, 1.0, 0.0, 0.25, 1.0, -0.8], lean: 0.22, turn: -0.3, fwd: 0.1 }],
    ],
    glow: 'left',
    end: 0.85,
  },
  /** The free hand marks the spot; the other hauls the comet down out of the sky. */
  glacialComet: {
    keys: [
      [0.25, { R: UP, L: [1.6, 0.0, 0.3, 0.05, 1.1, -0.3], head: -0.25, lean: -0.15, down: -0.06 }, true],
      [0.34, { R: [-0.3, 0.6, 0, 0.6], L: [1.4, 0.0, 0.3, 0.05, 1.1, -0.3], lean: 0.2, down: 0.3, fistR: 1 }],
      [0.55, { R: [-0.25, 0.6, 0, 0.7], L: [1.3, 0.05, 0.3, 0.1, 1.1, -0.3], lean: 0.18, down: 0.28 }],
    ],
    glow: 'both',
    end: 0.95,
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ALL: Record<string, Spec> = { ...MAGE_FIRE, ...MAGE_LIGHTNING, ...MAGE_COLD };

/** Skill ids with a gesture of their own. */
export const SKILL_GESTURES: ReadonlySet<string> = new Set(Object.keys(ALL));

/** The action a skill plays when it has its own, else null. */
export function skillAction(skillId: string): string | null {
  return SKILL_GESTURES.has(skillId) ? `skill.${skillId}` : null;
}

/** True for a skill action whose hand opens on a release frame. */
export function releasesAt(action: string): boolean {
  if (!action.startsWith('skill.')) return false;
  const s = ALL[action.slice(6)];
  return !!s && !s.loop;
}

for (const [id, s] of Object.entries(ALL)) registerAction(`skill.${id}`, gesture(s));

// Unused but kept honest for the arm presets: a gesture authored later may use them.
void PUSH;
void DOWN;

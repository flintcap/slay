/**
 * SLAY — one gesture per skill.
 *
 * Skills used to share a dozen clips by effect family, so a fire nova, a
 * frost nova and a war stomp were the same stamp, and every bolt in the game
 * was the same overhand throw. Here each skill names its own action, played
 * as `skill.<id>` (see `clipFor` in `scenes/SkillRunner.ts`). Each class's
 * gestures live in `gestures/<class>.ts` and add themselves with
 * `defineGestures`; `gestures/index.ts` loads them all. Each one is a
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
import { kit, registerAction, type ActionCtx, type ActionDef, type ActionKey, type ActionStep, type MoveKind, type Place } from './Actions';

const { k, rest, place, trunk, weight, glowAt } = kit;

/** One key pose of a gesture. Anything left out stays at the stance. */
export interface G {
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
  /**
   * Both hands stay on a two-handed haft (a greatsword, a staff, a spear):
   * the off hand follows the grip even though `R` moved it.
   */
  grip?: boolean;
}

export interface Spec {
  /** [time, pose, held] after the opening rest key. */
  keys: Array<[number, G, boolean?]>;
  /** Natural time of the release key. */
  contact?: number;
  /** Natural time it is back at rest. Loops have none. */
  end?: number;
  steps?: ActionStep[];
  glow?: 'left' | 'right' | 'both';
  loop?: boolean;
  /**
   * A weapon blow: the contact key is when the blade lands (damage waits for
   * it, see `Player.contactDelay`) and the weapon leaves a swing smear there.
   * `side` is the hand that strikes.
   */
  hit?: boolean;
  side?: Side;
  /**
   * The same keys for one weapon (by `Actions.MoveKind`), one pose per key in
   * `keys` order; null keeps the main pose. A shield skill with a greatsword
   * in hand bashes with the haft instead.
   */
  alt?: Partial<Record<MoveKind, Array<G | null>>>;
}

function pose(main: G, i: number, alt: Spec['alt']): (p: Pose, c: ActionCtx) => void {
  return (p, c) => {
    const g = alt?.[c.kind]?.[i] ?? main;
    if (g.R) place(p, c, 'R', g.R);
    if (g.grip) p.c[CH.offGrip] = 1;
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
  s.keys.forEach(([t, g, hold], i) => keys.push(k(t, pose(g, i, s.alt), hold ?? false)));
  if (!s.loop) keys.push(k(s.end ?? 0.8, rest));
  const def: ActionDef = { keys, full: true, plantFeet: true };
  if (s.loop) {
    def.loop = true;
    def.glow = { at: () => 1, hands: s.glow ?? 'both' };
  } else if (s.hit) {
    const c = s.contact ?? s.keys[1]?.[0] ?? 0.25;
    const end = s.end ?? 0.8;
    def.contact = c;
    def.event = 'hit';
    def.side = s.side ?? 'R';
    def.recover = c + (end - c) * 0.45;
    if (s.glow) def.glow = { at: glowAt(Math.min(0.04, c * 0.3), c, c + (end - c) * 0.5), hands: s.glow };
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
export const PUSH: Place = [1.45, 0.2, 0.75, 0.3, 1.1, -0.9];
/** Straight up. */
export const UP: Place = [2.95, 0.2, 0.3, 0.15, 0.5, -0.3];
/** Hanging easy at the side. */
export const DOWN: Place = [0.15, 0.35, 0, 0.5, 0.2];
/**
 * A weapon hand placed rather than turned: where the grip is, in metres on a
 * 1.88 m body (+x to the character's left, y up from the floor, +z ahead), and
 * which way the blade points. Mirrored for the left hand. `cock` and `flex`
 * set the wrist.
 */
export const reach = (at: [number, number, number], dir: [number, number, number], cock = 0.5, flex = 0): Place => ({
  at: [at[0] * 4, at[1] * 4, at[2] * 4],
  dir,
  cock,
  flex,
});

/** Out to the side at the shoulder. */
export const OUT: Place = [0.25, 1.45, 0.2, 0.2, 0.6, -0.6];
/** Arms crossed in front of the chest. */
export const CROSS: Place = [1.0, -0.45, 1.1, 1.9, 0.4];

export const step = (side: Side, t: number, dz: number, dx = 0, land = t + 0.14): ActionStep => ({ t, side, dx, dz, lift: 0.2, land });

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ALL: Record<string, Spec> = Object.create(null);

/** Adds a class's gestures. A skill id may only ever have one. */
export function defineGestures(table: Record<string, Spec>): void {
  for (const [id, s] of Object.entries(table)) {
    if (id in ALL) throw new Error(`gesture for ${id} defined twice`);
    if (id in PLAIN_MOVES) throw new Error(`${id} plays a plain move and takes no gesture`);
    ALL[id] = s;
    registerAction(`skill.${id}`, gesture(s));
  }
}

/**
 * Skills that play a plain move from `Actions.ts` (a real weapon swing, or
 * Veil's old vanish) and no gesture.
 *
 * The owner's call: hand-made poses on these read as casting and swung worse
 * than the plain attacks, so a blade skill swings the blade. Each one keeps
 * its own look and sound; only the body move is shared with other skills.
 * The Paladin's are the same clips its rites list in `scenes/paladin/Rites.ts`.
 */
const PLAIN_MOVES: Readonly<Record<string, string>> = {
  // Knight
  shieldBash: 'thrust', shieldCharge: 'lunge', cleave: 'attack2', rend: 'attack1', gash: 'thrust',
  overhead: 'slam', sunder: 'attack1', maim: 'lunge', whirlwind: 'attack2', massacre: 'attack1', ruin: 'slam',
  // Rogue
  viperStrike: 'lunge', deathLotus: 'attack2', umbralAmbush: 'lunge', assassinate: 'thrust',
  preciseCut: 'attack1', crippleTendon: 'attack1', doubleStrike: 'attack1', whirlingBlades: 'attack2',
  veil: 'blink',
  // Paladin
  tollingBlow: 'slam', shieldCrack: 'lunge', anvilfall: 'slam', doorbreaker: 'lunge', knell: 'slam',
  pilgrimsMaul: 'slam', relicBash: 'lunge', ironVerdict: 'slam', oathCut: 'thrust', twinVerse: 'attack2',
  feint: 'thrust', litany: 'attack1', confessionThrust: 'lunge', crosswise: 'attack2', mercyStroke: 'thrust',
  sevenfold: 'attack1', lastRites: 'lunge',
};

/** The plain move a skill plays instead of a gesture, or null when it has none. */
export function plainMove(skillId: string): string | null {
  return PLAIN_MOVES[skillId] ?? null;
}

const WEAPON_ACTIONS = new Set(['attack1', 'attack2', 'thrust', 'lunge', 'slam']);

/** True for a skill that swings the real weapon: it draws no spell around it. */
export function weaponSwing(skillId: string): boolean {
  return WEAPON_ACTIONS.has(PLAIN_MOVES[skillId] ?? '');
}

/** Skill ids with a gesture of their own. */
export function hasGesture(skillId: string): boolean {
  return skillId in ALL;
}

/** Every skill id with a gesture of its own. */
export function gestureIds(): string[] {
  return Object.keys(ALL);
}

/** The action a skill plays when it has its own (a gesture or a plain move), else null. */
export function skillAction(skillId: string): string | null {
  return PLAIN_MOVES[skillId] ?? (skillId in ALL ? `skill.${skillId}` : null);
}

/** True for a skill action whose hand opens on a release frame. */
export function releasesAt(action: string): boolean {
  if (!action.startsWith('skill.')) return false;
  const s = ALL[action.slice(6)];
  return !!s && !s.loop && !s.hit;
}

/** True for a skill action that is a weapon blow (its contact key is the hit). */
export function strikesAt(action: string): boolean {
  if (!action.startsWith('skill.')) return false;
  return !!ALL[action.slice(6)]?.hit;
}

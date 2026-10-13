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
import { kit, registerAction, type ActionCtx, type ActionDef, type ActionKey, type ActionStep, type Place } from './Actions';

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
export const PUSH: Place = [1.45, 0.2, 0.75, 0.3, 1.1, -0.9];
/** Straight up. */
export const UP: Place = [2.95, 0.2, 0.3, 0.15, 0.5, -0.3];
/** Hanging easy at the side. */
export const DOWN: Place = [0.15, 0.35, 0, 0.5, 0.2];
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
    ALL[id] = s;
    registerAction(`skill.${id}`, gesture(s));
  }
}

/** Skill ids with a gesture of their own. */
export function hasGesture(skillId: string): boolean {
  return skillId in ALL;
}

/** Every skill id with a gesture of its own. */
export function gestureIds(): string[] {
  return Object.keys(ALL);
}

/** The action a skill plays when it has its own, else null. */
export function skillAction(skillId: string): string | null {
  return skillId in ALL ? `skill.${skillId}` : null;
}

/** True for a skill action whose hand opens on a release frame. */
export function releasesAt(action: string): boolean {
  if (!action.startsWith('skill.')) return false;
  const s = ALL[action.slice(6)];
  return !!s && !s.loop;
}

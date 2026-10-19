/**
 * SLAY — the one rule book for statuses.
 *
 * The hero's `StatusContainer` and every monster (`Enemy`) read these rules,
 * so a status works the same whoever wears it: the same name finds the same
 * entry, a second application resolves the same way, the stack ceiling and
 * the timer are the same, a damage over time ticks on the same depth curve,
 * stat changes scale the same, and holds wear off the same.
 *
 * The two used to keep their own books. Monster attacks spoke short names
 * (`poison`, `chill`, `root`) only the monster side knew, so most of what a
 * monster tried to put on the hero never landed; the hero's damage over time
 * was flat at every depth while the hero's own poison on a monster grew with
 * it; and a stun on the hero halved per kind while a stun on a monster faded
 * with every hold of any kind.
 */

import type { StatusApplication } from '../types';
import { getStatus, type StatusDef } from '../data/statuses';
import { depthCurve } from './Difficulty';

/**
 * Short ids from before the status catalogue existed. Monster attacks still
 * speak them; both sides resolve them here.
 */
export const STATUS_ALIASES: Readonly<Record<string, string>> = {
  burn: 'burning',
  poison: 'poisoned',
  bleed: 'bleeding',
  corrode: 'corroded',
  stun: 'stunned',
  freeze: 'frozen',
  root: 'rooted',
  chill: 'chilled',
  slow: 'slowed',
  web: 'entangled',
};

/** The catalogue entry an id names, through the short aliases. */
export function statusDef(id: string): StatusDef | undefined {
  return getStatus(id) ?? getStatus(STATUS_ALIASES[id] ?? '');
}

/** A hold: anything that stops the wearer acting or moving as it means to. */
export function isHold(def: StatusDef): boolean {
  return !!def.incapacitates || !!def.immobilises || def.tags.includes('control');
}

/** The most stacks an application can build, its own raise included. */
export function stackCap(def: StatusDef, app: Pick<StatusApplication, 'maxStacks'>): number {
  return Math.min(24, Math.max(1, def.maxStacks + (app.maxStacks ?? 0)));
}

/** How long an application runs: its own time, or the entry's when it gives none. */
export function durationOf(def: StatusDef, app: Pick<StatusApplication, 'duration'>): number {
  return app.duration > 0 ? app.duration : def.baseDuration;
}

/** The parts of a running status a second application changes. */
export interface Running {
  /** Seconds left. */
  remaining: number;
  /** The longest time it was granted, for radial timers. */
  duration: number;
  magnitude: number;
  stacks: number;
}

/**
 * A second application of a running status, by the entry's `stacking`:
 * `stack` and `refresh` keep the longer time and the stronger magnitude,
 * `extend` adds the time (to three of this application's), `strongest` takes
 * the new one whole when it is stronger. Stacks add up to the ceiling in every
 * case; a single-stack entry stays at one unless an application raises it.
 */
export function reapply(def: StatusDef, cur: Running, duration: number, magnitude: number, stacks: number, cap: number): void {
  cur.stacks = Math.min(cap, cur.stacks + Math.max(0, Math.floor(stacks)));
  switch (def.stacking) {
    case 'extend':
      cur.remaining = Math.min(cur.remaining + duration, duration * 3);
      cur.duration = Math.max(cur.duration, cur.remaining);
      cur.magnitude = Math.max(cur.magnitude, magnitude);
      break;
    case 'strongest':
      if (magnitude > cur.magnitude) {
        cur.magnitude = magnitude;
        cur.remaining = duration;
        cur.duration = duration;
      } else {
        cur.remaining = Math.max(cur.remaining, duration);
        cur.duration = Math.max(cur.duration, duration);
      }
      break;
    case 'stack':
    case 'refresh':
    default:
      cur.remaining = Math.max(cur.remaining, duration);
      cur.duration = Math.max(cur.duration, duration);
      cur.magnitude = Math.max(cur.magnitude, magnitude);
      break;
  }
}

/**
 * How much of a status's stat changes apply. A rank's own numbers (`own`) are
 * already the full effect and scale by stacks only; the entry's reference
 * numbers scale by magnitude too, so a chill of magnitude 0.4 is 40% of the
 * entry's slow on a hero just as on a monster.
 */
export function modScale(own: boolean, magnitude: number, stacks: number): number {
  return own ? stacks : magnitude * stacks;
}

/**
 * Damage per second per stack of a damage over time, before stacks. The
 * entry's `perSecond` is the shape; the depth curve makes it hurt as much at
 * depth 40 as at depth 1, for a monster's poison on the hero as for the
 * hero's on a monster. A blow that carries its own `power` (the hero's
 * venom) uses that when it is more.
 */
export function dotRate(def: StatusDef, depth: number, app: Pick<StatusApplication, 'magnitude' | 'power' | 'tickScale'>): number {
  if (!def.dot) return 0;
  const curve = depthCurve(depth).damage * 0.035 * def.dot.perSecond;
  return Math.max(curve, app.power ?? 0) * app.magnitude * (app.tickScale ?? 1);
}

/**
 * How holds wear off. Every hold of any kind shortens the next one: a hold's
 * time is divided by one plus a quarter of the fatigue, the time it held is
 * added to the fatigue, and the fatigue drains at half a second per second.
 * Nothing ever drops to zero, and mixing a stun with a freeze cannot get round
 * it.
 */
export class HoldFade {
  private fatigue = 0;

  /** The time a hold of `duration` really holds, counted against the next. */
  take(duration: number): number {
    const held = duration / (1 + this.fatigue * 0.25);
    this.fatigue += held;
    return held;
  }

  tick(dt: number): void {
    if (this.fatigue > 0) this.fatigue = Math.max(0, this.fatigue - dt * 0.5);
  }

  get level(): number {
    return this.fatigue;
  }
}

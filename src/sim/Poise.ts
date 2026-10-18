/**
 * Boss poise: the bar under a boss's life that the hero breaks.
 *
 * A stun, freeze or root never holds a boss. What it would have held turns
 * into poise, and so does every blow by the share of the boss's life it took
 * (crits and knockbacks count for more). When the bar fills, the boss is
 * broken: held fast for `BREAK_TIME`, its wind-up cut short, taking
 * `BREAK_TAKEN` times the damage. Then the bar empties and grows by
 * `BREAK_FADE`, so each break takes more work than the last. Left alone for
 * `POISE_REST` seconds, poise drains back.
 *
 * Damage over time does not build poise: only blows and control do.
 */

/** The first bar's length. */
export const POISE_BASE = 100;
/** Poise a second of stun, freeze or root would have held. */
export const POISE_PER_CONTROL = 30;
/** Poise a blow builds per share of the boss's full life it took. */
export const POISE_PER_LIFE = 220;
/** A critical blow builds this much more. */
export const POISE_CRIT = 1.5;
/** Poise per unit of knockback a blow carries (a boss is never pushed). */
export const POISE_PER_KNOCK = 4;
/** Seconds without fresh poise before the bar starts to drain. */
export const POISE_REST = 3;
/** Poise drained per second once it rests. */
export const POISE_REGEN = 12;
/** Seconds a broken boss is held fast. */
export const BREAK_TIME = 3;
/** Damage taken while broken. */
export const BREAK_TAKEN = 1.25;
/** Each break makes the next bar this share of `POISE_BASE` longer. */
export const BREAK_FADE = 0.35;

/** How long the bar is after `breaks` breaks. */
export function poiseMax(breaks: number): number {
  return POISE_BASE * (1 + BREAK_FADE * Math.max(0, breaks));
}

/** Poise from control that would have held `seconds`. */
export function controlPoise(seconds: number): number {
  return Math.max(0, seconds) * POISE_PER_CONTROL;
}

/** Poise from a blow that took `dealt` of a `maxLife` boss. */
export function hitPoise(dealt: number, maxLife: number, crit: boolean, knockback = 0): number {
  const share = Math.max(0, dealt) / Math.max(1, maxLife);
  return share * POISE_PER_LIFE * (crit ? POISE_CRIT : 1) + Math.max(0, knockback) * POISE_PER_KNOCK;
}

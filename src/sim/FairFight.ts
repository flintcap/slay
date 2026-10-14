/**
 * SLAY — the fair-fight rules every boss obeys (docs/remake/depth.md, Part 3).
 *
 * One death ends a hero, so a boss may hurt, but it may never delete you:
 *
 *   - **Hit cap.** No single blow from a boss, its arena or its traps takes
 *     more than a share of your life from full: 25% on tiers 1 to 5, 30% on
 *     6 to 15, 40% past that. Blows landing together inside a short window
 *     share one cap, so three falling stones cannot add up to a one-shot.
 *   - **No stun lock.** A boss holds you (root, stun, freeze) for 1.5 s at
 *     most, and then cannot hold you again for 3 s.
 *   - **Fumbles cost time.** Getting a room rule wrong heals, shields, resets
 *     or hides the boss, never hurts you, and pushes the fight clock back by
 *     the time it cost (see `Boss.fumble`).
 *
 * Pure numbers here; `Player.takeDamage` and `Boss` apply them.
 */

/** Share of max life one boss blow (or one burst window) may take. */
export function bossHitCap(depth: number): number {
  if (depth <= 5) return 0.25;
  if (depth <= 15) return 0.3;
  return 0.4;
}

/** Blows inside this many seconds share one cap. */
export const BURST_WINDOW = 0.6;

/** Longest a boss may hold the hero in place, in seconds. */
export const HOLD_MAX = 1.5;

/** After a hold ends, seconds before the hero can be held again. */
export const HOLD_IMMUNE = 3;

/** Statuses that take away the hero's control. Slows are not holds. */
export const HOLD_IDS: ReadonlySet<string> = new Set([
  'root',
  'rooted',
  'stun',
  'stunned',
  'freeze',
  'frozen',
  'web',
  'entangled',
  'grasped',
  'knockedDown',
  'petrified',
  'feared',
]);

/** Blows at or above this share of life must be warned this long ahead. */
export const WARN_SHARE = 0.15;
export const WARN_MIN = 0.8;
/** A boss move at or above this damage multiplier counts as a heavy blow. */
export const HEAVY_MUL = 1.3;

/** Most of its life a fumble may heal back, as a share of max life. */
export const FUMBLE_HEAL_MAX = 0.1;

/**
 * Tracks one hero's boss damage and holds. Owned by the player entity; the
 * clock is the player's own, so it pauses with the game.
 */
export class FairLedger {
  private t = 0;
  private windowStart = -99;
  private spent = 0;
  private holdStart = -99;
  private holdUntil = -99;
  private immuneUntil = -99;

  tick(dt: number): void {
    this.t += dt;
  }

  /**
   * Damage a capped blow may still do. `amount` is what would land, `maxLife`
   * the hero's full life, `cap` the share from `bossHitCap`.
   */
  clamp(amount: number, maxLife: number, cap: number): number {
    if (amount <= 0) return amount;
    if (this.t - this.windowStart > BURST_WINDOW) {
      this.windowStart = this.t;
      this.spent = 0;
    }
    const room = Math.max(0, maxLife * cap - this.spent);
    const out = Math.min(amount, room);
    this.spent += out;
    return out;
  }

  /**
   * The duration a hold should actually last, or 0 to refuse it. Holds that
   * overlap a running hold extend it only up to the limit.
   */
  hold(duration: number): number {
    if (this.t < this.holdUntil) {
      const end = Math.min(this.holdStart + HOLD_MAX, this.t + duration);
      if (end <= this.t + 0.05) return 0;
      this.holdUntil = Math.max(this.holdUntil, end);
      this.immuneUntil = this.holdUntil + HOLD_IMMUNE;
      return end - this.t;
    }
    if (this.t < this.immuneUntil) return 0;
    this.holdStart = this.t;
    this.holdUntil = this.t + Math.min(duration, HOLD_MAX);
    this.immuneUntil = this.holdUntil + HOLD_IMMUNE;
    return this.holdUntil - this.t;
  }
}

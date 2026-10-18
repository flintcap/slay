/**
 * SLAY — is the hero in a fight right now?
 *
 * Death is permanent, so walking out must never be the way out of a fight that
 * is going badly. The dungeon scene reports blows and boss fights here, on the
 * run clock (which stops while paused, so waiting in the pause menu does not
 * count down). The pause menu and the tab-close guard read it.
 */

/** Seconds after the last blow, either way, before the hero may leave. */
export const PERIL_SECONDS = 6;

let clock = 0;
let lastBlow = -Infinity;
let boss = false;

export const peril = {
  /** The run clock, in seconds. Called every dungeon frame. */
  tick(runTime: number): void {
    clock = runTime;
  },
  /** The hero hit something, or something hit the hero. */
  blow(): void {
    lastBlow = clock;
  },
  /** A boss is awake and close. */
  setBoss(on: boolean): void {
    boss = on;
  },
  /** Out of the dungeon: nothing is fighting anyone. */
  reset(): void {
    clock = 0;
    lastBlow = -Infinity;
    boss = false;
  },
  get active(): boolean {
    return boss || clock - lastBlow < PERIL_SECONDS;
  },
  get bossFight(): boolean {
    return boss;
  },
  /** Whole seconds until the hero may leave, or 0 if they may now. */
  get secondsLeft(): number {
    if (boss) return 0;
    return Math.max(0, Math.ceil(PERIL_SECONDS - (clock - lastBlow)));
  },
};

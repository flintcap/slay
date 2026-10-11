/**
 * SLAY — the auto quality mode.
 *
 * Watches how long frames take and moves the renderer along the quality
 * ladder (Renderer.QUALITY): a step down when frames keep running long, a
 * step back up after a long calm stretch. The quality chosen in Settings is
 * the top it will use, so the mode only ever trades looks for smoothness.
 *
 * It judges a second or so of frames at a time, never one frame: a single
 * long frame (a load, a menu opening) is not a reason to change anything.
 * A step up that turns out too much for the machine makes the next try wait
 * twice as long, so it does not keep flipping between two steps.
 *
 * Off under automation (navigator.webdriver): the headless checks render in
 * software, where every frame is slow, and must see the quality they asked
 * for.
 */
import type { GameSettings } from '../types';

type QualityId = GameSettings['quality'];
const LADDER: readonly QualityId[] = ['low', 'medium', 'high', 'ultra'];

/** Frames judged at a time. */
const WINDOW = 90;
/** Step down when the middle frame takes longer than this (ms)... */
const SLOW_MEDIAN = 22;
/** ...or one frame in ten takes longer than this. */
const SLOW_P90 = 30;
/** Calm: the middle frame and nine in ten inside these (a 60 Hz frame is 16.7). */
const CALM_MEDIAN = 17.8;
const CALM_P90 = 20;
/** Calm seconds before the first step up; doubled after a step up that failed. */
const FIRST_WAIT_S = 20;
/** After any change, frames are not judged for this long (the change itself is a hitch). */
const SETTLE_MS = 4000;

export interface QualityTarget {
  readonly qualityLevel: QualityId;
  setQuality(q: QualityId): void;
}

export class AutoQuality {
  private frames: number[] = [];
  private lastJudged = 0;
  private settleUntil = 0;
  private calmS = 0;
  private waitS = FIRST_WAIT_S;
  private lastUpAt = -Infinity;
  private readonly enabled: boolean;

  constructor(
    private readonly target: QualityTarget,
    private readonly settings: () => GameSettings,
  ) {
    this.enabled = !(typeof navigator !== 'undefined' && navigator.webdriver);
  }

  /** The ladder step running now, for the Settings note. */
  get level(): QualityId {
    return this.target.qualityLevel;
  }

  /**
   * One frame's length in ms. Called by the engine only for frames of play
   * (not paused, not behind a curtain, tab visible).
   */
  frame(ms: number): void {
    const s = this.settings();
    const top = LADDER.indexOf(s.quality);
    const cur = LADDER.indexOf(this.target.qualityLevel);
    if (!this.enabled || s.autoQuality === false) {
      // Off: run exactly what was chosen.
      if (cur !== top) this.target.setQuality(s.quality);
      return;
    }
    // Never above what was chosen (the player just lowered it).
    if (cur > top) {
      this.change(top);
      return;
    }
    // A stall of a quarter second is a load or a lost tab, not steady load.
    if (!(ms > 0) || ms > 250) return;
    const now = performance.now();
    if (now < this.settleUntil) return;
    this.frames.push(ms);
    if (this.frames.length > WINDOW) this.frames.shift();
    if (this.frames.length < WINDOW || now - this.lastJudged < 1000) return;
    const elapsedS = this.lastJudged ? (now - this.lastJudged) / 1000 : 1;
    this.lastJudged = now;

    const sorted = [...this.frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length * 0.5)]!;
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!;

    if (median > SLOW_MEDIAN || p90 > SLOW_P90) {
      this.calmS = 0;
      if (cur > 0) {
        // Too much soon after a step up: wait longer before the next try.
        if (now - this.lastUpAt < 30000) this.waitS = Math.min(this.waitS * 2, 600);
        this.change(cur - 1);
      }
      return;
    }
    if (cur < top && median < CALM_MEDIAN && p90 < CALM_P90) {
      this.calmS += Math.min(elapsedS, 2);
      if (this.calmS >= this.waitS) {
        this.lastUpAt = now;
        this.change(cur + 1);
      }
    } else {
      this.calmS = 0;
    }
  }

  private change(i: number): void {
    const q = LADDER[Math.max(0, Math.min(LADDER.length - 1, i))]!;
    this.target.setQuality(q);
    this.frames.length = 0;
    this.calmS = 0;
    this.settleUntil = performance.now() + SETTLE_MS;
  }
}

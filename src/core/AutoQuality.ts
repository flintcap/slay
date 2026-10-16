/**
 * SLAY — the auto quality mode.
 *
 * Watches how long frames take and moves the renderer along the quality
 * ladder (Renderer.QUALITY): a step down when frames keep running long, a
 * step back up after a long calm stretch. The quality chosen in Settings is
 * the top it will use, so the mode only ever trades looks for smoothness.
 *
 * Before it turns any effect off it first draws fewer pixels (`RES_STEPS`):
 * a heavy fight costs a little sharpness for a few seconds, not the glow,
 * shadows and shading of the chosen quality. Only once the lowest resolution
 * step is still too slow does the quality itself step down.
 *
 * Where the device reports GPU time (`gpuMs`), slow frames with an idle GPU
 * change nothing: the game's own work is what is slow then, and fewer pixels
 * or plainer shading would only cost the look. Without GPU time it learns the
 * same thing the slow way, by trying a step and putting it back (`MIN_GAIN`).
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

/** Resolution steps, sharpest first: a share of the quality's own pixel ratio. */
const RES_STEPS: readonly number[] = [1, 0.85, 0.72];
/** A resolution step down already when the middle frame runs past this (ms)... */
const RES_SLOW_MEDIAN = 19;
/** ...or one frame in ten past this. */
const RES_SLOW_P90 = 26;
/** Calm seconds before a resolution step back up. */
const RES_WAIT_S = 8;
/** A resolution change is a small hitch (render targets are resized). */
const RES_SETTLE_MS = 2500;
/**
 * A step down must buy at least this share of frame time back. One that
 * does not (the frames are slow for some other reason: another tab, a
 * throttled laptop, the game's own scripts) is put back, and nothing is
 * stepped down again for NO_GAIN_HOLD_S: drawing worse buys nothing then,
 * and a softer, shimmering picture was all the player got for it.
 */
const MIN_GAIN = 0.08;
const NO_GAIN_HOLD_S = 120;
/**
 * The GPU is the reason frames are slow only when it is busy for at least
 * this share of the middle frame. Below it, the frame waits on the game's
 * own scripts, and drawing less would not make it shorter.
 */
const GPU_BOUND_SHARE = 0.6;

export interface QualityTarget {
  readonly qualityLevel: QualityId;
  /** `step`: an auto step along the ladder, not the player's own choice. */
  setQuality(q: QualityId, step?: boolean): void;
  readonly dynamicScale: number;
  setDynamicScale(k: number): void;
  /** GPU time per frame (ms), 0 where the device does not report it. */
  readonly gpuMs?: number;
}

export class AutoQuality {
  private frames: number[] = [];
  private lastJudged = 0;
  private settleUntil = 0;
  private calmS = 0;
  private waitS = FIRST_WAIT_S;
  private lastUpAt = -Infinity;
  /** Index into RES_STEPS. */
  private res = 0;
  private readonly enabled: boolean;
  /** The last step down, waiting to show it helped: the median before it, and how to undo it. */
  private trial: { median: number; undo: () => void } | null = null;
  /** No step down before this (performance.now ms): the last one bought nothing. */
  private holdUntil = 0;

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
      if (cur !== top) this.target.setQuality(s.quality, true);
      if (this.res !== 0) this.setRes(0);
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

    // The first judgement after a step down: did it pay?
    const trial = this.trial;
    this.trial = null;
    if (trial && median > trial.median * (1 - MIN_GAIN)) {
      trial.undo();
      this.holdUntil = now + NO_GAIN_HOLD_S * 1000;
      return;
    }

    const slow = median > SLOW_MEDIAN || p90 > SLOW_P90;
    if (slow || median > RES_SLOW_MEDIAN || p90 > RES_SLOW_P90) {
      this.calmS = 0;
      if (now < this.holdUntil) return;
      const gpu = this.target.gpuMs ?? 0;
      if (gpu > 0 && gpu < median * GPU_BOUND_SHARE) return;
      // Fewer pixels first; the look goes only when that is not enough.
      if (this.res < RES_STEPS.length - 1) {
        const back = this.res;
        this.setRes(this.res + 1);
        this.trial = { median, undo: () => this.setRes(back) };
        return;
      }
      if (slow && cur > 0) {
        // Too much soon after a step up: wait longer before the next try.
        if (now - this.lastUpAt < 30000) this.waitS = Math.min(this.waitS * 2, 600);
        const res = this.res;
        this.change(cur - 1);
        this.trial = {
          median,
          undo: () => {
            this.change(cur);
            this.setRes(res);
          },
        };
      }
      return;
    }
    if (this.res > 0 && median < CALM_MEDIAN && p90 < CALM_P90) {
      this.calmS += Math.min(elapsedS, 2);
      if (this.calmS >= RES_WAIT_S) this.setRes(this.res - 1);
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

  private setRes(i: number): void {
    this.res = Math.max(0, Math.min(RES_STEPS.length - 1, i));
    this.target.setDynamicScale(RES_STEPS[this.res]!);
    this.frames.length = 0;
    this.calmS = 0;
    this.settleUntil = performance.now() + RES_SETTLE_MS;
  }

  private change(i: number): void {
    const q = LADDER[Math.max(0, Math.min(LADDER.length - 1, i))]!;
    // A new quality starts at full sharpness; the steps above apply again.
    this.res = 0;
    this.target.setDynamicScale(1);
    this.target.setQuality(q, true);
    this.frames.length = 0;
    this.calmS = 0;
    this.settleUntil = performance.now() + SETTLE_MS;
  }
}

/**
 * SLAY — how fast the screen shows frames, and how fast the game draws them.
 *
 * Browsers say nothing about a screen's refresh rate, so it is read from the
 * frames themselves: `requestAnimationFrame` fires once per refresh, so the
 * gap between two calls is one refresh when the frame did little work. Only
 * light frames count: one that waited on its own work says how slow the game
 * was, not how fast the screen is.
 *
 *  - A frame that drew nothing (a paused or loading frame, or one the frame
 *    cap skipped) may move the reading either way: the screen was the only
 *    clock.
 *  - A frame that drew may only move it up. A GPU that cannot keep up makes
 *    every gap two refreshes long while the scripts look idle, and without
 *    GPU timing that looks exactly like a slower screen.
 *
 * A reading is a low percentile of a window of gaps, snapped to a common
 * rate, and taken only when two windows in a row agree, so a hitch or a
 * busy second does not move it.
 *
 * The frame cap (Settings, Video) skips refreshes so the game draws at most
 * that many frames a second. Auto quality (core/AutoQuality.ts) aims for the
 * cap, or 60 with no cap, and never for more than the screen can show.
 */

/** Rates screens run at. A reading snaps to the nearest. */
const RATES = [24, 30, 40, 48, 50, 60, 72, 75, 85, 90, 100, 120, 144, 165, 170, 180, 200, 240, 280, 300, 360, 480];
/** Gaps judged at a time. */
const WINDOW = 90;
/** A frame is light when its own work took under this share of its gap. */
const LIGHT = 0.4;
/** What auto quality aims for without a frame cap. */
const DEFAULT_AIM_HZ = 60;
/** The caps offered in Settings; 0 is "as fast as the screen". */
export const FRAME_CAPS: readonly number[] = [0, 30, 40, 60, 90, 120, 144];

function snap(hz: number): number {
  let best = RATES[0]!;
  for (const r of RATES) if (Math.abs(r - hz) < Math.abs(best - hz)) best = r;
  return best;
}

export class FramePace {
  /** The screen's refresh rate as read so far. 60 until the frames say. */
  hz = 60;
  private idle: number[] = [];
  private drawn: number[] = [];
  /** The last window's reading, waiting for the next to agree. */
  private pendingIdle = 0;
  private pendingDrawn = 0;
  /** When the next frame may be drawn under the cap (performance.now ms). */
  private nextAt = 0;

  /** One refresh, in ms. */
  get periodMs(): number {
    return 1000 / this.hz;
  }

  /**
   * One rAF gap (ms), how long that frame's own work took (CPU ms, and GPU
   * ms where the device reports it, else 0), and whether it drew.
   */
  sample(gapMs: number, workMs: number, gpuMs: number, drew: boolean): void {
    if (!(gapMs > 1) || gapMs > 120) return;
    if (workMs > gapMs * LIGHT || gpuMs > gapMs * LIGHT) return;
    const list = drew ? this.drawn : this.idle;
    list.push(gapMs);
    if (list.length < WINDOW) return;
    const sorted = [...list].sort((a, b) => a - b);
    list.length = 0;
    const low = sorted[Math.floor(sorted.length * 0.2)]!;
    const mid = sorted[Math.floor(sorted.length * 0.5)]!;
    // A spread-out window is a busy one: it says nothing.
    if (mid > low * 1.15) return;
    const hz = snap(1000 / low);
    if (drew) {
      if (hz > this.hz && hz === this.pendingDrawn) this.hz = hz;
      this.pendingDrawn = hz;
    } else {
      if (hz !== this.hz && hz === this.pendingIdle) this.hz = hz;
      this.pendingIdle = hz;
    }
  }

  /**
   * True when this refresh should be drawn under `cap` frames a second (0:
   * every refresh). A refresh that comes a little early still counts, so a
   * 60 cap on a 144 Hz screen lands on 60, not on every third refresh (48).
   */
  allow(now: number, cap: number): boolean {
    if (!(cap > 0) || cap >= this.hz * 0.97) {
      this.nextAt = now;
      return true;
    }
    const interval = 1000 / cap;
    if (now < this.nextAt - Math.min(this.periodMs / 2, interval / 4)) return false;
    // Keep the beat, but never bank time: a long frame does not buy a burst after it.
    this.nextAt += interval;
    if (this.nextAt < now) this.nextAt = now + interval;
    return true;
  }

  /** The frame time auto quality aims for (ms): the cap or 60 a second, at most the screen's rate. */
  aimMs(cap: number): number {
    const aim = cap > 0 ? cap : DEFAULT_AIM_HZ;
    return 1000 / Math.min(aim, this.hz);
  }
}

/** The one pace, shared by the engine, auto quality and Settings. */
export const framePace = new FramePace();

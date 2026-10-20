/**
 * SLAY — loading progress, and giving the page back while a scene builds.
 *
 * A town or map is built behind the loading curtain in steps. Each step is
 * announced on `'load:progress'` (the loading bar draws from it), and long
 * runs of work hand the page back between pieces (`yieldIfLong`), so the
 * browser keeps drawing the bar and answering input instead of freezing
 * for the whole build.
 *
 * Steps are counted per load: `beginLoad(total)` at the start, `loadStep`
 * as each one starts, `endLoad` once the scene is ready. Every step also
 * keeps its start time, so a checker can read where a load spent its time
 * (`loadTimeline`).
 */
import { events } from './Events';

/** A load is being counted (between `beginLoad` and `endLoad`). */
let active = false;
let total = 1;
let done = 0;
let stage = '';
/** [stage, ms since the load began] for the current or last load. */
let timeline: Array<[string, number]> = [];
let began = 0;
/** When the page was last handed back (performance.now ms). */
let lastYield = 0;

/** Starts counting a load of `steps` steps. */
export function beginLoad(steps: number): void {
  active = true;
  total = Math.max(1, steps);
  done = 0;
  stage = '';
  began = performance.now();
  lastYield = began;
  timeline = [];
}

/** The next step has started. Raises the total if a scene adds steps on the way. */
export function loadStep(name: string): void {
  // A level built outside a load (a debug warp) announces nothing.
  if (!active) return;
  if (stage) done++;
  if (done >= total) total = done + 1;
  stage = name;
  timeline.push([name, Math.round(performance.now() - began)]);
  events.emit('load:progress', { stage: name, done, total });
}

/**
 * How far into the current step the load is (0..1), for a step that knows:
 * the shaders built so far, the textures landed. The bar moves on that
 * rather than creeping, so a long wait still shows it working.
 */
export function loadPart(part: number): void {
  if (!active || !stage) return;
  events.emit('load:progress', { stage, done, total, part: Math.min(1, Math.max(0, part)) });
}

/** The load is finished: the bar shows full. */
export function endLoad(): void {
  if (!active) return;
  active = false;
  done = total;
  timeline.push(['ready', Math.round(performance.now() - began)]);
  events.emit('load:progress', { stage: 'ready', done, total });
  stage = '';
}

/** Where the current or last load spent its time: each step and when it started (ms). */
export function loadTimeline(): ReadonlyArray<[string, number]> {
  return timeline;
}

/** One task's worth of time back to the page. */
export function breather(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Hands the page back if the work since the last hand-back has run past
 * `sliceMs`; otherwise resolves at once (a microtask, no task wait). Call it
 * between pieces of a long build so no single task freezes the page.
 */
export async function yieldIfLong(sliceMs = 40): Promise<void> {
  const now = performance.now();
  if (now - lastYield < sliceMs) return;
  await breather();
  lastYield = performance.now();
}

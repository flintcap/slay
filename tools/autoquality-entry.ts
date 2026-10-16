/**
 * Entry point for `tools/check-autoquality.mjs`: the auto quality mode on a
 * fake clock and a fake renderer.
 *
 * - steady heavy frames that a lower step cures: it steps down and stays
 * - frames slow for some other reason (lower steps change nothing): every
 *   step it tries is put back, and the chosen look stays on screen
 * - calm frames after a cure: it climbs back to the chosen quality
 * - slow frames with the GPU reported idle: nothing changes, not even a try
 */
import { AutoQuality, type QualityTarget } from '../src/core/AutoQuality';
import type { GameSettings } from '../src/types';

declare const process: { argv: string[] };

let clock = 0;
(globalThis as { performance: { now(): number } }).performance = { now: () => clock };

type Q = GameSettings['quality'];
const ORDER: Q[] = ['low', 'medium', 'high', 'ultra'];

function rig(costAt: (q: Q, dyn: number) => number, gpuMs = 0) {
  const t = {
    q: 'high' as Q,
    dyn: 1,
    changes: 0,
    gpuMs,
    get qualityLevel() {
      return this.q;
    },
    setQuality(q: Q) {
      if (q !== this.q) this.changes++;
      this.q = q;
    },
    get dynamicScale() {
      return this.dyn;
    },
    setDynamicScale(k: number) {
      if (k !== this.dyn) this.changes++;
      this.dyn = k;
    },
  };
  const settings = { quality: 'high', autoQuality: true } as GameSettings;
  const aq = new AutoQuality(t as QualityTarget, () => settings);
  const run = (seconds: number) => {
    const end = clock + seconds * 1000;
    while (clock < end) {
      const ms = costAt(t.q, t.dyn);
      clock += ms;
      aq.frame(ms);
    }
  };
  return { t, run };
}

const fails: string[] = [];
const out: Record<string, unknown> = {};

// 1. A GPU-bound scene: fewer pixels and a lower step really are faster.
{
  const { t, run } = rig((q, dyn) => 26 * (0.55 + 0.45 * dyn * dyn) * [0.5, 0.7, 1, 1.4][ORDER.indexOf(q)]!);
  run(60);
  out.gpuBound = { q: t.q, dyn: t.dyn };
  if (t.q === 'high' && t.dyn === 1) fails.push('a scene a lower step cures stayed at full quality');
}

// 2. Slow for some other reason: nothing the renderer does changes the frame.
{
  const { t, run } = rig(() => 21.7);
  run(300);
  out.notGpu = { q: t.q, dyn: t.dyn, changes: t.changes };
  if (t.q !== 'high' || t.dyn !== 1) fails.push(`slow frames no step cures left it at ${t.q} x${t.dyn}`);
  // A try, its undo, another try two minutes later: not a flip every few seconds.
  if (t.changes > 8) fails.push(`slow frames no step cures: ${t.changes} changes in 5 minutes`);
}

// 3. A heavy stretch that ends: it comes back up to what was chosen.
{
  let heavy = true;
  const { t, run } = rig((q, dyn) => (heavy ? 30 : 12) * (0.55 + 0.45 * dyn * dyn) * [0.5, 0.7, 1, 1.4][ORDER.indexOf(q)]!);
  run(40);
  heavy = false;
  run(400);
  out.recovers = { q: t.q, dyn: t.dyn };
  if (t.q !== 'high' || t.dyn !== 1) fails.push(`after the heavy stretch it stayed at ${t.q} x${t.dyn}`);
}

// 4. Slow frames, and the GPU reports it is busy for a fraction of each:
// the game's scripts are the limit, so it does not even try a step.
{
  const { t, run } = rig(() => 24, 6);
  run(300);
  out.gpuIdle = { q: t.q, dyn: t.dyn, changes: t.changes };
  if (t.changes > 0) fails.push(`slow frames with an idle GPU still changed the look ${t.changes} times`);
}

// 5. The same slow frames with the GPU busy for most of each: it steps.
{
  const { t, run } = rig((q, dyn) => 26 * (0.55 + 0.45 * dyn * dyn) * [0.5, 0.7, 1, 1.4][ORDER.indexOf(q)]!, 22);
  run(60);
  out.gpuBusy = { q: t.q, dyn: t.dyn };
  if (t.q === 'high' && t.dyn === 1) fails.push('a GPU-bound scene with GPU time reported stayed at full quality');
}

void process;
console.log(JSON.stringify({ out, fails }));

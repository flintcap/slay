/**
 * SLAY — pieces every poser shares: the hit flinch on an upright trunk, the
 * stagger, fidgets, and the body-level parts of spawns and deaths.
 */
import type { CreatureAnimator } from './Animator';
import { clamp01, kf, ramp, settle } from './Motion';

export const TAU = Math.PI * 2;

/** A stable 0..1 hash of a bone name and a salt (scatter directions, per-bone lag). */
export function nameHash(name: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}

/** How much of the idle layer shows: none while moving or acting. */
export function idleWeight(a: CreatureAnimator): number {
  const busy = a.phase === 'none' || a.phase === 'hit' ? 0 : 1;
  return (1 - a.gait) * (1 - busy);
}

/**
 * The flinch spring on an upright trunk: the chest snaps back and turns away
 * from the blow, the head whips, the arms fly out. `k` scales it.
 */
export function flinchTrunk(a: CreatureAnimator, k = 1): void {
  const f = a.flinch * k;
  if (Math.abs(f) < 1e-3) return;
  const s = a.flinchSide;
  a.rot('spine', -0.35 * f, 0.15 * f * s, 0.1 * f * s);
  a.rot('chest', -0.6 * f, 0.3 * f * s, 0);
  a.rot('neck', -0.3 * f, 0, 0);
  a.rot('head', -0.5 * f, -0.25 * f * s, 0.2 * f * s);
  a.rotS('armL', 'L', -0.4 * f, 0, 0.5 * f);
  a.rotS('armR', 'R', -0.4 * f, 0, 0.5 * f);
  a.rot('jaw', 0.5 * Math.abs(f));
}

/** A heavy hit: knees give, the trunk folds, a step back, then it recovers. */
export function staggerUpright(a: CreatureAnimator): void {
  const s = a.stagger;
  if (s < 1e-3) return;
  const w = Math.sin(clamp01(s) * Math.PI * 0.5);
  const H = a.hipY;
  const rock = Math.sin((1 - s) * 9) * 0.06 * w;
  a.move(a.has('hips') ? 'hips' : 'body', a.flinchSide * 0.04 * H * w, -0.12 * H * w, -0.07 * H * w);
  a.rot('hips', 0.1 * w, 0, rock);
  a.rot('spine', 0.25 * w, 0, -rock);
  a.rot('chest', 0.15 * w, 0, 0);
  a.rot('head', 0.35 * w, 0, 0.2 * w * a.flinchSide);
  a.rotS('armL', 'L', 0.2 * w, 0, 0.25 * w);
  a.rotS('armR', 'R', 0.2 * w, 0, 0.25 * w);
  a.rot('foreL', -0.3 * w);
  a.rot('foreR', -0.3 * w);
  a.rot('jaw', 0.35 * w);
}

/** A 0..1 bell over a fidget's run, and the fidget's name ('' when none). */
export function fidget(a: CreatureAnimator): { name: string; w: number; t: number } {
  if (!a.fidget) return { name: '', w: 0, t: 0 };
  const t = a.fidgetT;
  return { name: a.fidget, w: ramp(t, 0, 0.25) * (1 - ramp(t, 0.7, 1)) * (1 - a.gait), t };
}

/** A body falling from above and landing: height share left, and the landing crouch (0..1). */
export function dropFall(u: number, end = 0.5): { y: number; crouch: number } {
  const f = clamp01(u / end);
  const y = (1 - f) * (1 - f);
  const crouch = u < end ? 0 : Math.exp(-(u - end) * 9) * (1 - ramp(u, 0.85, 1)) + settle(u, end, 30, 12) * 0.2;
  return { y, crouch: Math.max(0, crouch) };
}

/** Rise from beneath the floor: the share of height still below ground. */
export function riseDepth(u: number): number {
  return kf(u, [
    [0, 1.05],
    [0.3, 0.62],
    [0.55, 0.36],
    [0.82, 0.04],
    [1, 0],
  ]);
}

/** The final pose of a death settles with a small bounce where it hits the floor. */
export function thud(t: number, at: number, k = 1): number {
  return settle(t, at, 26, 10) * 0.05 * k;
}

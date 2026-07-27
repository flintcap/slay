import type { Rng } from '../types';

/** 32-bit string hash — used to derive stream seeds from salts. */
export function hashString(s: string, seed = 0x9e3779b9): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * sfc32 — small, fast, statistically solid. Chosen over mulberry32 because the
 * 128-bit state survives the very long draw sequences a full dungeon run makes
 * (layout + props + spawns + every loot roll) without visible short cycles.
 */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return function () {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export class Random implements Rng {
  private readonly _next: () => number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    // Scramble the single seed into four distinct state words.
    const s = this.seed;
    const a = (s ^ 0x9e3779b9) >>> 0;
    const b = (Math.imul(s, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0;
    const c = (Math.imul(s ^ 0x27d4eb2f, 0x165667b1)) >>> 0;
    const d = (s + 0x6d2b79f5) >>> 0;
    this._next = sfc32(a, b, c, d);
    // Discard early output while the state mixes.
    for (let i = 0; i < 16; i++) this._next();
  }

  next(): number {
    return this._next();
  }

  range(min: number, max: number): number {
    return min + this._next() * (max - min);
  }

  int(min: number, max: number): number {
    if (max < min) return min;
    return min + Math.floor(this._next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this._next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Random.pick on empty array');
    return arr[Math.floor(this._next() * arr.length)]!;
  }

  weighted<T>(arr: readonly T[], weight: (t: T) => number): T {
    if (arr.length === 0) throw new Error('Random.weighted on empty array');
    let total = 0;
    for (const t of arr) {
      const w = weight(t);
      if (w > 0) total += w;
    }
    if (total <= 0) return this.pick(arr);
    let roll = this._next() * total;
    for (const t of arr) {
      const w = weight(t);
      if (w <= 0) continue;
      roll -= w;
      if (roll <= 0) return t;
    }
    return arr[arr.length - 1]!;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }

  /** Gaussian via Box-Muller, clamped to +/-3 sigma so outliers stay sane. */
  gaussian(mean = 0, stdev = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this._next();
    while (v === 0) v = this._next();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + stdev * Math.max(-3, Math.min(3, n));
  }

  fork(salt: string): Rng {
    return new Random(hashString(salt, this.seed) ^ Math.floor(this._next() * 0xffffffff));
  }
}

/** Convenience: a stream derived deterministically from a seed + label. */
export function streamFor(seed: number, label: string): Random {
  return new Random(hashString(label, seed));
}

/** A non-deterministic seed for starting fresh runs. */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

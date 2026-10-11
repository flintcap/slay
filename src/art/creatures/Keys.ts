/**
 * SLAY — key poses for creature posers.
 *
 * A key is a few bone angles (and an optional hips offset in hip heights)
 * that one moment of a move looks like: the top of a chop, the end of a
 * thrust. Posers blend keys by weight, so a strike is "from the wind-up key
 * to the impact key, then back", and mirroring a key gives the other hand.
 */
import type { CreatureAnimator } from './Animator';

export type Key = Record<string, readonly number[]>;

const SIDE = /(L|R)(\d?)$/;

export function swapSide(name: string): string {
  return name.replace(SIDE, (_m, s: string, d: string) => (s === 'L' ? 'R' : 'L') + d);
}

/**
 * Lays a key onto the pose at weight `w`. `$hips` is an offset of the hips
 * bone in hip heights (x left, y up, z forward); `$body` the whole body.
 * `mirror` swaps left and right.
 */
export function key(a: CreatureAnimator, k: Key, w: number, mirror = false): void {
  if (w <= 1e-4) return;
  const H = a.hipY;
  for (const name in k) {
    const v = k[name]!;
    const x = v[0] ?? 0;
    let y = v[1] ?? 0;
    let z = v[2] ?? 0;
    if (name === '$hips' || name === '$body') {
      const mx = mirror ? -x : x;
      if (name === '$hips') a.move(a.has('hips') ? 'hips' : 'body', mx * H * w, y * H * w, z * H * w);
      else a.body(mx * H * w, y * H * w, z * H * w);
      continue;
    }
    let n = name;
    if (mirror) {
      n = swapSide(name);
      y = -y;
      z = -z;
    }
    a.rot(n, x * w, y * w, z * w);
  }
}

/** Trunk bones turn slower than limbs whip: the body leads, the arm follows through. */
const TRUNK = /^(\$hips|\$body|hips|spine|chest|neck|head|body|abdomen)$/;
const splitCache = new WeakMap<Key, [Key, Key]>();

function split(k: Key): [Key, Key] {
  let hit = splitCache.get(k);
  if (!hit) {
    const trunk: Record<string, readonly number[]> = {};
    const limbs: Record<string, readonly number[]> = {};
    for (const n in k) (TRUNK.test(n) ? trunk : limbs)[n] = k[n]!;
    hit = [trunk, limbs];
    splitCache.set(k, hit);
  }
  return hit;
}

/**
 * Blends a wind-up key into an impact key and back: the shape of every
 * strike. Limbs reach the impact at `impact`; the trunk takes a little over
 * twice as long, so a blow whips without the whole body snapping.
 */
export function strike(a: CreatureAnimator, wind: Key, hit: Key, t: number, impact = 0.15, hold = 0.45, mirror = false, w = 1): void {
  const rw = t <= hold ? 0 : t >= 1 ? 1 : smoothT((t - hold) / (1 - hold));
  const [wt, wl] = split(wind);
  const [ht, hl] = split(hit);
  const sl = t <= 0 ? 0 : t >= impact ? 1 : smoothT(t / impact);
  const ti = Math.min(hold, impact * (2.3 + 1.4 * a.style.heavy));
  const st = t <= 0 ? 0 : t >= ti ? 1 : smoothT(t / ti);
  key(a, wl, (1 - sl) * (1 - rw) * w, mirror);
  key(a, hl, sl * (1 - rw) * w, mirror);
  key(a, wt, (1 - st) * (1 - rw) * w, mirror);
  key(a, ht, st * (1 - rw) * w, mirror);
}

function smoothT(t: number): number {
  return t * t * (3 - 2 * t);
}

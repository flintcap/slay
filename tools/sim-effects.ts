/**
 * Effects for headless fights that draw nothing but keep their promises.
 * Shared by tools/curve-entry.ts and tools/sweep-entry.ts.
 */
import * as THREE from 'three';
import { shrug } from './combat-arena';

/**
 * Effects that draw nothing but keep their promises: a projectile's `onHit`,
 * a meteor's impact, a slam's `onFire` and a `delay` all fire after a beat,
 * at the point the effect was aimed at. Skills that resolve their damage in
 * those callbacks (every projectile) would otherwise never hit.
 */
export function promisingEffects(): { fx: unknown; tick(dt: number): void } {
  const due: Array<{ t: number; fn: () => void }> = [];
  const later = (t: number, fn: () => void): void => {
    due.push({ t, fn });
  };
  const fx = new Proxy(
    {},
    {
      // Each member is callable (and keeps its promises) and also answers any
      // property read politely, so `fx.rig.hitStop()` works as well as `fx.meteor()`.
      get: (_o, key) =>
        new Proxy(function () {}, { get: () => shrug, apply: (_f, _t, args: unknown[]) => call(key, args) }),
    },
  );
  function call(key: string | symbol, args: unknown[]): unknown {
    const vecs = args.filter((x): x is THREE.Vector3 => x instanceof THREE.Vector3);
    let at: THREE.Vector3 | undefined = vecs[vecs.length - 1];
    if (!at && typeof args[0] === 'number' && typeof args[1] === 'number') at = new THREE.Vector3(args[0], 0, args[1]);
    const opts = args.find((x) => x && typeof x === 'object' && !(x instanceof THREE.Vector3)) as Record<string, unknown> | undefined;
    if (!at && opts?.target instanceof THREE.Vector3) at = opts.target;
    if (!at && opts?.origin instanceof THREE.Vector3) at = opts.origin;
    const point = (at ?? new THREE.Vector3()).clone();
    if (key === 'delay' && typeof args[1] === 'function') {
      later(Number(args[0]) || 0, args[1] as () => void);
      return shrug;
    }
    const wait = Number(opts?.delay ?? opts?.windup ?? 0.3) || 0.3;
    for (const x of args) if (typeof x === 'function') later(wait, () => (x as (p: THREE.Vector3) => void)(point.clone()));
    for (const name of ['onHit', 'onFire', 'onLand']) {
      const f = opts?.[name];
      if (typeof f === 'function') later(wait, () => (f as (p: THREE.Vector3) => void)(point.clone()));
    }
    return shrug;
  }
  return {
    fx,
    tick(dt) {
      for (let i = due.length - 1; i >= 0; i--) {
        const d = due[i]!;
        d.t -= dt;
        if (d.t > 0) continue;
        due.splice(i, 1);
        try {
          d.fn();
        } catch {
          /* a broken callback is the effect's problem, not the fight's */
        }
      }
    },
  };
}

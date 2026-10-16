/**
 * SLAY — still parts of a scene stop having their matrices rebuilt.
 *
 * three.js walks the whole scene every frame to rebuild matrices: each node
 * with `matrixAutoUpdate` composes its local matrix again and multiplies it
 * into its world one, moving or not. In the town that walk was a millisecond
 * or two of every frame for houses, fences and trees that never move.
 *
 * `freezeStill` takes a root and the nodes under it that do move. Every
 * subtree with nothing moving in it gets its matrices worked out once and
 * its walk swapped for one that does nothing (three has no switch that
 * skips a subtree: `matrixWorldAutoUpdate` skips one node and still walks
 * its children). Nodes above a moving one keep walking so it is reached.
 */
import type * as THREE from 'three';

const STILL = function (this: THREE.Object3D): void {};

/** Freezes every subtree under `root` that holds none of `moving` (theirs included). */
export function freezeStill(root: THREE.Object3D, moving: Iterable<THREE.Object3D | null | undefined>): number {
  const live = new Set<THREE.Object3D>();
  const path = new Set<THREE.Object3D>();
  for (const m of moving) {
    if (!m) continue;
    m.traverse((o) => live.add(o));
    for (let p = m.parent; p && p !== root; p = p.parent) path.add(p);
  }
  root.updateMatrixWorld(true);
  let frozen = 0;
  const visit = (o: THREE.Object3D): void => {
    for (const c of o.children) {
      if (live.has(c)) continue;
      if (path.has(c)) {
        visit(c);
        continue;
      }
      c.matrixAutoUpdate = false;
      c.updateMatrixWorld = STILL;
      frozen++;
    }
  };
  visit(root);
  return frozen;
}

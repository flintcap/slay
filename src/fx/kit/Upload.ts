/**
 * SLAY vfx kit: partial buffer uploads that survive skipped frames.
 *
 * The pools write a few slots a frame and upload only those. three.js clears
 * an attribute's update ranges once it has uploaded them, so ranges must be
 * added, never reset by the writer: when several updates run before one draw
 * (a lab stepping a scene, a hitch catching up), every write still reaches the
 * GPU. A mesh that is not drawn for a while would pile ranges up, so past a
 * handful they fold into one span.
 */

import type * as THREE from 'three';

const MAX_RANGES = 8;

/** Marks `count` elements from `start` for upload on the next draw. */
export function markRange(a: THREE.BufferAttribute | THREE.InterleavedBuffer, start: number, count: number): void {
  const r = a.updateRanges;
  if (r.length >= MAX_RANGES) {
    let lo = start;
    let hi = start + count;
    for (let i = 0; i < r.length; i++) {
      const q = r[i]!;
      if (q.start < lo) lo = q.start;
      if (q.start + q.count > hi) hi = q.start + q.count;
    }
    a.clearUpdateRanges();
    a.addUpdateRange(lo, hi - lo);
  } else a.addUpdateRange(start, count);
  a.needsUpdate = true;
}

/** Marks a whole attribute for upload. */
export function markAll(a: THREE.BufferAttribute | THREE.InterleavedBuffer): void {
  a.clearUpdateRanges();
  a.addUpdateRange(0, a.array.length);
  a.needsUpdate = true;
}

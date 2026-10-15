import * as THREE from 'three';

/**
 * The texture scans a triplanar material samples, read by the icon studio to
 * tell a finished picture from one drawn before its scans arrived
 * (`items/IconRender.ts`).
 *
 * Kept here rather than in `material.userData`: `Material.copy` deep-copies
 * userData through JSON, and a Texture there serializes itself, encoding its
 * whole image as a PNG. Every runtime clone of a hero or item material (a
 * glowing set trim, a tinted or veiled body) stalled the frame for that.
 */
const scans = new WeakMap<THREE.Material, THREE.Texture[]>();

export function setScans(m: THREE.Material, t: THREE.Texture[]): void {
  scans.set(m, t);
}

export function scansOf(m: THREE.Material): THREE.Texture[] | undefined {
  return scans.get(m);
}

/** Gives a copy the scans of the material it was copied from. */
export function copyScans(from: THREE.Material, to: THREE.Material): void {
  const t = scans.get(from);
  if (t) scans.set(to, t);
}

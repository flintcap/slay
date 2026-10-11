/**
 * SLAY vfx kit: where the floor is.
 *
 * Debris, ground marks and telegraphs need the floor height under a point.
 * Dungeons are built in height bands, so it is not always zero. The scene
 * that owns the level points this at its floor lookup (through
 * `DecalSystem.setGround`); every kit piece reads it from here.
 */

let fn: (x: number, z: number) => number = () => 0;

export function setFloorFn(f: ((x: number, z: number) => number) | null): void {
  fn = f ?? (() => 0);
}

export function floorAt(x: number, z: number): number {
  try {
    const y = fn(x, z);
    return Number.isFinite(y) ? y : 0;
  } catch {
    return 0;
  }
}

/**
 * SLAY — where the ground mist lies.
 *
 * A plain value with no imports, so the world materials (which the bake
 * workers also load) can set it without pulling in the renderer. The level
 * sets it every frame (`setWorldCutaway`); the renderer's fog reads it.
 */
export const air = { floor: 0 };

/** The height of the floor the hero stands on; the ground mist lies on it. */
export function setMistFloor(y: number): void {
  air.floor = y;
}
